import { and, asc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Role, UserDto } from "@hekara/core";
import * as schema from "@hekara/db/schema";
import type { AuthInstance } from "./auth";
import { HttpError } from "./errors";

export interface Invites {
  invite(
    agencyId: string,
    input: { email: string; name: string; role: Role; caregiverId?: string },
  ): Promise<{ userId: string; link: string }>;
  list(agencyId: string): Promise<UserDto[]>;
}

/** Admin-created accounts. The invitee follows a one-time link to choose a password; there is no email service yet, so the admin hands the link over. */
export function createInvites(opts: {
  auth: AuthInstance;
  links: Map<string, string>;
  db: PostgresJsDatabase<typeof schema>;
  appUrl: string;
}): Invites {
  return {
    async invite(agencyId, input) {
      const ctx = await opts.auth.$context;
      const email = input.email.toLowerCase();
      if (await ctx.internalAdapter.findUserByEmail(email, undefined as never))
        throw new HttpError(409, "exists", "That email already has an account");
      if (input.role === "caregiver" && !input.caregiverId) throw new HttpError(400, "invalid_request", "Invalid request");
      const user = await ctx.internalAdapter.createUser(
        {
          email,
          name: input.name,
          emailVerified: false,
          role: input.role,
          agencyId,
          caregiverId: input.caregiverId ?? null,
        } as never,
        undefined as never,
      );
      await opts.auth.api.requestPasswordReset({ body: { email, redirectTo: `${opts.appUrl}/` } });
      const raw = opts.links.get(email);
      opts.links.delete(email);
      if (!raw) throw new HttpError(409, "invite_failed", "Could not create the invite");
      const token = new URL(raw).pathname.split("/").pop()!;
      return { userId: user.id, link: `${opts.appUrl}/?invite=${encodeURIComponent(token)}` };
    },
    async list(agencyId) {
      const rows = await opts.db
        .select()
        .from(schema.user)
        .where(and(eq(schema.user.agencyId, agencyId)))
        .orderBy(asc(schema.user.createdAt));
      return rows.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, twoFactorEnabled: u.twoFactorEnabled }));
    },
  };
}
