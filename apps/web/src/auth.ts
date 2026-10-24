import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { twoFactor } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@hekara/db/schema";
import type { Audit, PasswordHasher } from "@hekara/ports";
import { FailureThrottle } from "./throttle";
import { IDLE_SECONDS, INVITE_TTL_SECONDS, MIN_PASSWORD_LENGTH } from "./policy";

export interface AuthDeps {
  db: PostgresJsDatabase<typeof schema>;
  hasher: PasswordHasher;
  audit: Audit;
  /** Public origin, for example https://app.example.com. Drives cookies, passkeys and trusted origins. */
  appUrl: string;
  secret: string;
}

export function createAuth(deps: AuthDeps) {
  const url = new URL(deps.appUrl);
  const secure = url.protocol === "https:";
  /** Links produced by requestPasswordReset, captured so an admin can hand them over (there is no email service yet). */
  const links = new Map<string, string>();

  /** 10 wrong passwords in 15 minutes lock that account for 15 minutes, from any address. */
  const throttle = new FailureThrottle({ maxFailures: 10, windowMs: 15 * 60_000, lockMs: 15 * 60_000 });
  const emailKey = (body: unknown) =>
    String((body as { email?: unknown } | null)?.email ?? "")
      .trim()
      .toLowerCase();

  const agencyOf = async (userId: string) => {
    const [u] = await deps.db
      .select({ agencyId: schema.user.agencyId })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .limit(1);
    return u?.agencyId ?? null;
  };
  const record = async (userId: string | undefined, action: string, entity: string) => {
    if (!userId) return;
    const agencyId = await agencyOf(userId);
    if (agencyId) await deps.audit.append({ agencyId, userId, action, entity });
  };

  const auth = betterAuth({
    baseURL: deps.appUrl,
    secret: deps.secret,
    trustedOrigins: [url.origin],
    database: drizzleAdapter(deps.db, {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        twoFactor: schema.twoFactor,
        passkey: schema.passkey,
      },
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true, // invite-only: accounts are created by an admin
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: 128,
      password: { hash: (p) => deps.hasher.hash(p), verify: (d) => deps.hasher.verify(d) },
      resetPasswordTokenExpiresIn: INVITE_TTL_SECONDS,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url: link }) => {
        links.set(user.email.toLowerCase(), link);
      },
    },
    user: {
      additionalFields: {
        role: { type: "string", required: true, input: false },
        agencyId: { type: "string", required: true, input: false },
        caregiverId: { type: "string", required: false, input: false },
      },
    },
    session: { expiresIn: IDLE_SECONDS, updateAge: 60, disableSessionRefresh: false },
    plugins: [twoFactor({ issuer: "Hekara" }), passkey({ rpID: url.hostname, rpName: "Hekara", origin: url.origin })],
    advanced: {
      // The address comes from a header only our server sets (see withClientIp), so clients can't spoof it.
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
      cookiePrefix: "hekara",
      useSecureCookies: secure,
      defaultCookieAttributes: { httpOnly: true, secure, sameSite: "strict", path: "/" },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 120,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/two-factor/verify-totp": { window: 60, max: 5 },
        "/two-factor/verify-backup-code": { window: 60, max: 5 },
        "/sign-in/passkey": { window: 60, max: 10 },
        "/request-password-reset": { window: 300, max: 3 },
        "/reset-password": { window: 300, max: 5 },
      },
    },
    databaseHooks: {
      session: { create: { after: async (s) => record(s.userId, "auth.login", "session") } },
    },
    hooks: {
      // Sign-out is recorded before it runs, while the session still exists.
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/sign-in/email") {
          const wait = throttle.retryAfter(emailKey(ctx.body));
          if (wait > 0) throw new APIError("TOO_MANY_REQUESTS", { message: "Too many attempts. Try again later." });
          return;
        }
        if (ctx.path !== "/sign-out") return;
        const session = await getSessionFromCtx(ctx).catch(() => null);
        await record(session?.user.id, "auth.logout", "session");
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/sign-in/email") {
          const key = emailKey(ctx.body);
          if (ctx.context.returned instanceof APIError) throttle.fail(key);
          else throttle.succeed(key);
          return;
        }
        const audited: Record<string, string> = {
          "/two-factor/enable": "auth.2fa.enable",
          "/two-factor/disable": "auth.2fa.disable",
          "/passkey/verify-registration": "auth.passkey.add",
          "/passkey/delete-passkey": "auth.passkey.remove",
          "/reset-password": "auth.password.reset",
          "/change-password": "auth.password.change",
        };
        const action = audited[ctx.path];
        if (!action) return;
        const userId = ctx.context.session?.user.id ?? ctx.context.newSession?.user.id;
        await record(userId, action, "account");
      }),
    },
  });

  return { auth, links };
}

/** Internal header carrying the client address resolved by the server. Always overwritten, never trusted from the client. */
export const CLIENT_IP_HEADER = "x-hekara-client-ip";

/** Wraps the auth handler so Better Auth rate-limits per real client address instead of one shared bucket. */
export const withClientIp = (auth: { handler(req: Request): Promise<Response> }) => (req: Request, ip: string) => {
  const headers = new Headers(req.headers);
  headers.set(CLIENT_IP_HEADER, ip);
  return auth.handler(new Request(req, { headers }));
};

export type AuthInstance = ReturnType<typeof createAuth>["auth"];
