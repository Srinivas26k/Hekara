import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { streamSSE } from "hono/streaming";
import * as v from "valibot";
import {
  ApplyInputSchema, FillInputSchema, PatientInputSchema, ScheduleQuerySchema, SearchQuerySchema,
} from "@hekara/core";
import type { Ports } from "@hekara/ports";
import { HttpError } from "./errors";
import { rateLimit, sameOriginOnly, securityHeaders } from "./security";
import * as svc from "./services";

export interface Identity { agencyId: string; userId: string | null }

export interface AppDeps {
  ports: Ports;
  /** Resolves who is calling and which agency they belong to. Throws HttpError(401) when unauthenticated. */
  identify(c: Context): Promise<Identity>;
  clientKey(c: Context): string;
  allowedOrigin: string;
  /** Dev only: lets `?at=HH:MM` pretend it is that time today, to compare against the design. */
  allowTimeTravel?: boolean;
}

type Env = { Variables: { identity: Identity } };

function parse<T extends v.GenericSchema>(schema: T, data: unknown): v.InferOutput<T> {
  const r = v.safeParse(schema, data);
  if (!r.success) throw new HttpError(400, "invalid_request", "Invalid request");
  return r.output;
}

/** The whole HTTP API. Runtime-agnostic: mount it on Node, Workers, Lambda or Cloud Run. */
export function createApp(deps: AppDeps): Hono<Env> {
  const app = new Hono<Env>();
  const { ports } = deps;

  app.use("*", securityHeaders());
  app.get("/healthz", (c) => c.json({ ok: true }));

  const api = new Hono<Env>();
  api.use("*", bodyLimit({ maxSize: 16 * 1024, onError: () => { throw new HttpError(400, "too_large", "Request too large"); } }));
  api.use("*", sameOriginOnly(deps.allowedOrigin));
  api.use("*", rateLimit({ limit: 300, windowMs: 60_000, key: (c) => deps.clientKey(c as Context) }));
  api.use("*", async (c, next) => { c.set("identity", await deps.identify(c)); await next(); });
  api.use("*", async (c, next) => { c.header("Cache-Control", "no-store"); await next(); });

  const ctx = (c: Context<Env>, at?: string): svc.Ctx => {
    const id = c.get("identity");
    let now = ports.clock.now();
    if (at && deps.allowTimeTravel) {
      const [h, m] = at.split(":").map(Number) as [number, number];
      now = new Date(now); now.setHours(h, m, 0, 0);
    }
    return { ports, agencyId: id.agencyId, userId: id.userId, now };
  };

  api.get("/schedule", async (c) => {
    const q = parse(ScheduleQuerySchema, c.req.query());
    const x = ctx(c, q.at);
    return c.json(q.view === "week" ? await svc.weekSchedule(x, q) : await svc.daySchedule(x, q));
  });

  api.get("/overview", async (c) => {
    const q = parse(v.strictObject({ at: v.optional(v.pipe(v.string(), v.regex(/^\d{2}:\d{2}$/))) }), c.req.query());
    return c.json(await svc.overview(ctx(c, q.at)));
  });

  const AtSchema = v.object({ at: v.optional(v.pipe(v.string(), v.regex(/^\d{2}:\d{2}$/))) });
  const atOf = (c: Context<Env>) => parse(AtSchema, { at: c.req.query("at") }).at;
  const idParam = v.pipe(v.string(), v.uuid());
  api.post("/visits/:id/fill", async (c) => {
    const id = parse(idParam, c.req.param("id"));
    const body = parse(FillInputSchema, await c.req.json().catch(() => ({})));
    return c.json(await svc.fillVisit(ctx(c, atOf(c)), id, body.caregiverId));
  });
  api.post("/visits/:id/unfill", async (c) => c.json(await svc.unfillVisit(ctx(c, atOf(c)), parse(idParam, c.req.param("id")))));

  api.post("/optimize", async (c) => c.json(await svc.optimize(ctx(c, atOf(c)))));
  api.post("/suggestions/apply", async (c) => {
    const body = parse(ApplyInputSchema, await c.req.json().catch(() => ({})));
    return c.json(await svc.applySuggestions(ctx(c, atOf(c)), body.visitIds));
  });

  api.get("/search", async (c) => c.json(await svc.search(ctx(c), parse(SearchQuerySchema, c.req.query()).q)));
  api.post("/patients", async (c) => {
    const input = parse(PatientInputSchema, await c.req.json().catch(() => null));
    return c.json(await svc.createPatient(ctx(c), input), 201);
  });

  api.get("/events", (c) => {
    const { agencyId } = c.get("identity");
    return streamSSE(c, async (stream) => {
      const off = await ports.realtime.subscribe(agencyId, (e) => {
        void stream.writeSSE({ event: e.type, data: JSON.stringify({ entityId: e.entityId ?? null }) });
      });
      stream.onAbort(off);
      while (!stream.aborted) {
        await stream.writeSSE({ event: "ping", data: "" });
        await stream.sleep(25_000);
      }
      off();
    });
  });

  app.route("/api", api);

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: { code: err.code, message: err.message } }, err.status);
    console.error("unhandled error:", err instanceof Error ? err.name : "unknown"); // never log messages: they may hold PHI
    return c.json({ error: { code: "internal", message: "Something went wrong" } }, 500);
  });
  app.notFound((c) => c.json({ error: { code: "not_found", message: "Not found" } }, 404));
  return app;
}
