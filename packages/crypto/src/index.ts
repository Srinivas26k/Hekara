import type { Crypto, KeyProvider } from "@hekara/ports";

const enc = new TextEncoder();
const dec = new TextDecoder();
const VERSION = "v1";

const b64u = (b: Uint8Array): string => {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const unb64u = (s: string): Uint8Array<ArrayBuffer> => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

export class CryptoError extends Error {}

/**
 * Field encryption and blind indexes on WebCrypto. Envelope: `v1.<keyId>.<iv>.<ct+tag>`.
 * The agency id is bound as AES-GCM additional data, so a ciphertext copied to another tenant fails to decrypt.
 */
export function createCrypto(keys: KeyProvider): Crypto {
  const aesKey = async (agencyId: string, keyId: string, usage: KeyUsage[]) =>
    crypto.subtle.importKey("raw", new Uint8Array(await keys.dataKey(agencyId, keyId)), "AES-GCM", false, usage);

  return {
    async encrypt(agencyId, plaintext) {
      const keyId = keys.currentKeyId();
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const key = await aesKey(agencyId, keyId, ["encrypt"]);
      const ct = new Uint8Array(
        await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(agencyId) }, key, enc.encode(plaintext)),
      );
      return [VERSION, keyId, b64u(iv), b64u(ct)].join(".");
    },

    async decrypt(agencyId, envelope) {
      const [v, keyId, iv, ct, extra] = envelope.split(".");
      if (v !== VERSION || !keyId || !iv || !ct || extra !== undefined) throw new CryptoError("Invalid envelope");
      try {
        const key = await aesKey(agencyId, keyId, ["decrypt"]);
        const pt = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: unb64u(iv), additionalData: enc.encode(agencyId) },
          key,
          unb64u(ct),
        );
        return dec.decode(pt);
      } catch {
        throw new CryptoError("Decryption failed"); // generic on purpose
      }
    },

    async blindIndex(agencyId, normalized) {
      const raw = new Uint8Array(await keys.dataKey(agencyId, keys.currentKeyId()));
      const hk = await crypto.subtle.importKey("raw", raw, "HKDF", false, ["deriveKey"]);
      const mac = await crypto.subtle.deriveKey(
        { name: "HKDF", hash: "SHA-256", salt: enc.encode(agencyId), info: enc.encode("hekara-blind-index") },
        hk,
        { name: "HMAC", hash: "SHA-256", length: 256 },
        false,
        ["sign"],
      );
      return b64u(new Uint8Array(await crypto.subtle.sign("HMAC", mac, enc.encode(normalized))));
    },
  };
}

/**
 * Derives a per-agency data key from a master key with HKDF. `masters` maps keyId to a base64 32-byte master key.
 * Rotation: add a new keyId, make it current; old ids stay readable. Swap this for a KMS-backed provider on any platform.
 */
export function masterKeyProvider(masters: Record<string, string>, currentKeyId: string): KeyProvider {
  if (!masters[currentKeyId]) throw new CryptoError(`Missing master key ${currentKeyId}`);
  const cache = new Map<string, Uint8Array>();
  return {
    currentKeyId: () => currentKeyId,
    async dataKey(agencyId, keyId) {
      const cacheKey = `${keyId}:${agencyId}`;
      const hit = cache.get(cacheKey);
      if (hit) return hit;
      const master = masters[keyId];
      if (!master) throw new CryptoError("Unknown key id");
      const base = await crypto.subtle.importKey("raw", unb64u(master), "HKDF", false, ["deriveBits"]);
      const bits = await crypto.subtle.deriveBits(
        { name: "HKDF", hash: "SHA-256", salt: enc.encode(agencyId), info: enc.encode(`hekara-data-key:${keyId}`) },
        base,
        256,
      );
      const key = new Uint8Array(bits);
      cache.set(cacheKey, key);
      return key;
    },
  };
}

export const generateMasterKey = (): string => b64u(crypto.getRandomValues(new Uint8Array(32)));
