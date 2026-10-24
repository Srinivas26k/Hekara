import { argon2, randomBytes, timingSafeEqual } from "node:crypto";
import type { PasswordHasher } from "@hekara/ports";

/** OWASP minimum for Argon2id: 19 MiB, 2 passes, 1 lane. Parameters are stored in the hash so they can be raised later. */
const DEFAULTS = { memory: 19_456, passes: 2, parallelism: 1, tagLength: 32 };

const derive = (password: string, nonce: Buffer, p: typeof DEFAULTS): Promise<Buffer> =>
  new Promise((resolve, reject) =>
    argon2("argon2id", { message: password.normalize("NFKC"), nonce, ...p }, (err, key) =>
      err ? reject(err) : resolve(Buffer.from(key)),
    ),
  );

/** Format: argon2id$m=<KiB>,t=<passes>,p=<lanes>$<salt b64>$<hash b64> */
export function argon2idHasher(params: Partial<typeof DEFAULTS> = {}): PasswordHasher {
  const p = { ...DEFAULTS, ...params };
  return {
    async hash(password) {
      const salt = randomBytes(16);
      const key = await derive(password, salt, p);
      return `argon2id$m=${p.memory},t=${p.passes},p=${p.parallelism}$${salt.toString("base64")}$${key.toString("base64")}`;
    },
    async verify({ hash, password }) {
      const [alg, spec, salt, key] = hash.split("$");
      const m = /^m=(\d+),t=(\d+),p=(\d+)$/.exec(spec ?? "");
      if (alg !== "argon2id" || !m || !salt || !key) return false;
      const expected = Buffer.from(key, "base64");
      const actual = await derive(password, Buffer.from(salt, "base64"), {
        memory: Number(m[1]),
        passes: Number(m[2]),
        parallelism: Number(m[3]),
        tagLength: expected.length,
      });
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    },
  };
}
