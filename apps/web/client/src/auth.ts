import { createAuthClient } from "better-auth/client";
import { twoFactorClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";

/** Talks to /api/auth on the same origin. Cookies are HttpOnly, so no token ever reaches script. */
export const authClient = createAuthClient({
  plugins: [passkeyClient(), twoFactorClient()],
});
