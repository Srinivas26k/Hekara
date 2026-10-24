import { generateMasterKey, masterKeyProvider } from "@hekara/crypto";

export interface Config {
  databaseUrl: string;
  port: number;
  appUrl: string;
  authSecret: string;
  production: boolean;
  /** Trust CF-Connecting-IP / X-Forwarded-For. Only enable behind a proxy that sets them (Cloudflare Tunnel, a load balancer). */
  trustProxy: boolean;
  keys: ReturnType<typeof masterKeyProvider>;
}

/** DATA_KEYS="k1:<base64>,k2:<base64>" and DATA_KEY_ID="k2" (the key used for new writes). */
export function parseKeys(raw: string, currentId: string) {
  const masters: Record<string, string> = {};
  for (const part of raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)) {
    const i = part.indexOf(":");
    if (i < 1) throw new Error("DATA_KEYS entries must look like id:base64");
    masters[part.slice(0, i)] = part.slice(i + 1);
  }
  return masterKeyProvider(masters, currentId);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const need = (k: string) => {
    const v = env[k];
    if (!v) throw new Error(`${k} is not set (generate a key with: pnpm --filter @hekara/web keygen)`);
    return v;
  };
  const production = env.NODE_ENV === "production";
  const port = Number(env.PORT ?? 3000);
  const appUrl = env.APP_URL ?? `http://localhost:${port}`;
  const authSecret = need("AUTH_SECRET");
  if (authSecret.length < 32 || /change-me/i.test(authSecret)) {
    throw new Error("AUTH_SECRET must be at least 32 random characters (generate one with: openssl rand -base64 48)");
  }
  if (production && new URL(appUrl).protocol !== "https:") throw new Error("APP_URL must be https in production");
  return {
    production,
    appUrl,
    authSecret,
    trustProxy: env.TRUST_PROXY === "1",
    databaseUrl: need("DATABASE_URL"),
    port,
    keys: parseKeys(need("DATA_KEYS"), need("DATA_KEY_ID")),
  };
}

export const newKeyLine = (id = "k1") => `DATA_KEYS=${id}:${generateMasterKey()}\nDATA_KEY_ID=${id}`;
