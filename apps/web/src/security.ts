import type { MiddlewareHandler } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { HttpError } from "./errors";

/** Strict, same-origin-only headers. No inline script, no third-party origins. Trusted Types is not enforced: Solid's compiled templates assign innerHTML, which it blocks (see ADR-014). */
export const securityHeaders = (): MiddlewareHandler =>
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"], imgSrc: ["'self'", "data:"],
      fontSrc: ["'self'"], connectSrc: ["'self'"], frameAncestors: ["'none'"], baseUri: ["'none'"],
      formAction: ["'self'"], objectSrc: ["'none'"],
    },
    strictTransportSecurity: "max-age=63072000; includeSubDomains; preload",
    xContentTypeOptions: "nosniff",
    referrerPolicy: "no-referrer",
    xFrameOptions: "DENY",
    crossOriginOpenerPolicy: "same-origin",
    crossOriginEmbedderPolicy: "require-corp",
    crossOriginResourcePolicy: "same-origin",
    permissionsPolicy: { camera: [], microphone: [], geolocation: [], payment: [], usb: [] },
  });

/** Reject state-changing requests that do not come from our own origin. */
export const sameOriginOnly = (allowedOrigin: string): MiddlewareHandler => async (c, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method) && c.req.header("origin") !== allowedOrigin) {
    throw new HttpError(403, "forbidden_origin", "Forbidden");
  }
  await next();
};

/** Fixed-window limiter. In-memory: per instance; use a shared store for multi-instance deployments. */
export function rateLimit(opts: { limit: number; windowMs: number; key: (c: Parameters<MiddlewareHandler>[0]) => string }): MiddlewareHandler {
  const hits = new Map<string, { n: number; reset: number }>();
  return async (c, next) => {
    const now = Date.now();
    const k = opts.key(c);
    let e = hits.get(k);
    if (!e || e.reset <= now) { e = { n: 0, reset: now + opts.windowMs }; hits.set(k, e); }
    if (++e.n > opts.limit) {
      c.header("Retry-After", String(Math.ceil((e.reset - now) / 1000)));
      throw new HttpError(429, "rate_limited", "Too many requests");
    }
    if (hits.size > 10_000) for (const [key, v] of hits) if (v.reset <= now) hits.delete(key);
    await next();
  };
}
