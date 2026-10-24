import type { Context } from "hono";
import type { Role } from "@hekara/core";
import type { AuthInstance } from "./auth";
import { ABSOLUTE_MS } from "./policy";
import { HttpError } from "./errors";
import type { Identity } from "./app";

const ROLES = new Set<Role>(["admin", "scheduler", "caregiver", "billing"]);

/** Resolves the caller from the session cookie. Enforces the 12 hour absolute session limit on top of the rolling idle timeout. */
export function identifyFromSession(auth: AuthInstance) {
  return async (c: Context): Promise<Identity> => {
    const s = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!s) throw new HttpError(401, "unauthenticated", "Sign in required");
    if (Date.now() - new Date(s.session.createdAt).getTime() > ABSOLUTE_MS) {
      await auth.api.signOut({ headers: c.req.raw.headers }).catch(() => undefined);
      throw new HttpError(401, "session_expired", "Session expired");
    }
    const u = s.user as typeof s.user & {
      role?: string;
      agencyId?: string;
      caregiverId?: string | null;
      twoFactorEnabled?: boolean;
    };
    if (!u.agencyId || !u.role || !ROLES.has(u.role as Role)) throw new HttpError(403, "no_access", "No access");
    return {
      agencyId: u.agencyId,
      userId: u.id,
      role: u.role as Role,
      caregiverId: u.caregiverId ?? null,
      name: u.name,
      email: u.email,
      twoFactorEnabled: !!u.twoFactorEnabled,
    };
  };
}
