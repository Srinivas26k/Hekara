import { Hono, type Context, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { streamSSE } from "hono/streaming";
import * as v from "valibot";
import {
  ApplyInputSchema, FillInputSchema, InviteInputSchema, PatientInputSchema, ScheduleQuerySchema, SearchQuerySchema,
  type MeDto, type Role,
} from "@hekara/core";
import type { Ports } from "@hekara/ports";
import { HttpError } from "./errors";
import { rateLimit, sameOriginOnly, securityHeaders } from "./security";
import type { Invites } from "./invites";
import * as svc from "./services";

export interface Identity {
  agencyId: string; userId: string | null; role: Role; caregiverId: string | null;
  name: string; email: string; twoFactorEnabled: boolean;
}

export interface AppDeps {
  ports: Ports;
  /** Resolves who is calling and which agency they belong to. Throws HttpError(401) when unauthenticated. */
  identify(c: Context): Promise<Identity>;
  clientKey(c: Context): string;
  /** Handles /api/auth/* (sign-in, passkeys, two-factor, password reset). Mounted ahead of the session check. */
  authHandler?: (req: Request) => Promise<Response>;
  invites?: Invites;
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

  if (deps.authHandler) {
    const authHandler = deps.authHandler;
    const authLimit = rateLimit({ limit: 60, windowMs: 60_000, key: (c) => `auth:${deps.clientKey(c as Context)}` });
    app.all("/api/auth/*", authLimit, sameOriginOnly(deps.allowedOrigin), async (c) => {
      const res = await authHandler(c.req.raw);
      res.headers.set("Cache-Control", "no-store");
      return res;
    });
  }

  const api = new Hono<Env>();
  api.use("*", bodyLimit({ maxSize: 16 * 1024, onError: () => { throw new HttpError(400, "too_large", "Request too large"); } }));
  api.use("*", sameOriginOnly(deps.allowedOrigin));
  api.use("*", rateLimit({ limit: 300, windowMs: 60_000, key: (c) => deps.clientKey(c as Context) }));
  api.use("*", async (c, next) => { c.set("identity", await deps.identify(c)); await next(); });
  api.use("*", async (c, next) => { c.header("Cache-Control", "no-store"); await next(); });

  /** Deny by default: the caller's role must be listed. */
  const allow = (...roles: Role[]): MiddlewareHandler<Env> => async (c, next) => {
    if (!roles.includes(c.get("identity").role)) throw new HttpError(403, "forbidden", "Forbidden");
    await next();
  };
  const STAFF: Role[] = ["admin", "scheduler"];

  const ctx = (c: Context<Env>, at?: string): svc.Ctx => {
    const id = c.get("identity");
    let now = ports.clock.now();
    if (at && deps.allowTimeTravel) {
      const [h, m] = at.split(":").map(Number) as [number, number];
      now = new Date(now); now.setHours(h, m, 0, 0);
    }
    return { ports, agencyId: id.agencyId, userId: id.userId, now };
  };

  api.get("/me", async (c) => {
    const i = c.get("identity");
    const agency = await ports.repo.agency(i.agencyId);
    const me: MeDto = {
      id: i.userId ?? "", name: i.name, email: i.email, role: i.role, twoFactorEnabled: i.twoFactorEnabled,
      agencyId: i.agencyId, agencyName: agency?.name ?? "",
    };
    return c.json(me);
  });

  api.get("/schedule", allow("admin", "scheduler", "caregiver"), async (c) => {
    const q = parse(ScheduleQuerySchema, c.req.query());
    const me = c.get("identity");
    if (me.role === "caregiver") {
      if (!me.caregiverId) throw new HttpError(403, "forbidden", "Forbidden");
      q.caregiver = me.caregiverId; // caregivers only ever see their own visits
    }
    const x = ctx(c, q.at);
    return c.json(q.view === "week" ? await svc.weekSchedule(x, q) : await svc.daySchedule(x, q));
  });

  api.get("/overview", allow(...STAFF), async (c) => {
    const q = parse(v.strictObject({ at: v.optional(v.pipe(v.string(), v.regex(/^\d{2}:\d{2}$/))) }), c.req.query());
    return c.json(await svc.overview(ctx(c, q.at)));
  });

  const AtSchema = v.object({ at: v.optional(v.pipe(v.string(), v.regex(/^\d{2}:\d{2}$/))) });
  const atOf = (c: Context<Env>) => parse(AtSchema, { at: c.req.query("at") }).at;
  const idParam = v.pipe(v.string(), v.uuid());
  api.post("/visits/:id/fill", allow(...STAFF), async (c) => {
    const id = parse(idParam, c.req.param("id"));
    const body = parse(FillInputSchema, await c.req.json().catch(() => ({})));
    return c.json(await svc.fillVisit(ctx(c, atOf(c)), id, body.caregiverId));
  });
  api.post("/visits/:id/unfill", allow(...STAFF), async (c) => c.json(await svc.unfillVisit(ctx(c, atOf(c)), parse(idParam, c.req.param("id")))));

  api.post("/optimize", allow(...STAFF), async (c) => c.json(await svc.optimize(ctx(c, atOf(c)))));
  api.post("/suggestions/apply", allow(...STAFF), async (c) => {
    const body = parse(ApplyInputSchema, await c.req.json().catch(() => ({})));
    return c.json(await svc.applySuggestions(ctx(c, atOf(c)), body.visitIds));
  });

  api.get("/search", allow(...STAFF), async (c) => c.json(await svc.search(ctx(c), parse(SearchQuerySchema, c.req.query()).q)));
  api.post("/patients", allow(...STAFF), async (c) => {
    const input = parse(PatientInputSchema, await c.req.json().catch(() => null));
    return c.json(await svc.createPatient(ctx(c), input), 201);
  });

  api.get("/admin/users", allow("admin"), async (c) => {
    if (!deps.invites) throw new HttpError(404, "not_found", "Not found");
    return c.json(await deps.invites.list(c.get("identity").agencyId));
  });
  api.post("/admin/users", allow("admin"), async (c) => {
    if (!deps.invites) throw new HttpError(404, "not_found", "Not found");
    const input = parse(InviteInputSchema, await c.req.json().catch(() => null));
    const me = c.get("identity");
    if (input.caregiverId && !(await ports.repo.caregivers(me.agencyId)).some((x) => x.id === input.caregiverId)) {
      throw new HttpError(400, "invalid_request", "Invalid request");
    }
    const r = await deps.invites.invite(me.agencyId, input);
    await ports.audit.append({ agencyId: me.agencyId, userId: me.userId, action: "user.invite", entity: "user", entityId: r.userId, meta: { role: input.role } });
    return c.json(r, 201);
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
