import { describe, expect, it } from "vitest";
import { CryptoError, createCrypto, generateMasterKey, masterKeyProvider } from "./index";

const mk = () => {
  const k1 = generateMasterKey();
  return { k1, c: createCrypto(masterKeyProvider({ k1 }, "k1")) };
};

describe("field encryption", () => {
  it("round-trips and uses the versioned envelope", async () => {
    const { c } = mk();
    const env = await c.encrypt("agency-a", "Dorothy Nguyen");
    expect(env).toMatch(/^v1\.k1\.[\w-]+\.[\w-]+$/);
    expect(env).not.toContain("Dorothy");
    expect(await c.decrypt("agency-a", env)).toBe("Dorothy Nguyen");
  });
  it("uses a fresh IV each time", async () => {
    const { c } = mk();
    expect(await c.encrypt("a", "x")).not.toBe(await c.encrypt("a", "x"));
  });
  it("refuses decryption under another agency", async () => {
    const { c } = mk();
    const env = await c.encrypt("agency-a", "secret");
    await expect(c.decrypt("agency-b", env)).rejects.toBeInstanceOf(CryptoError);
  });
  it("detects tampering", async () => {
    const { c } = mk();
    const env = await c.encrypt("a", "secret");
    const parts = env.split(".");
    parts[3] = parts[3]!.slice(0, -2) + (parts[3]!.endsWith("AA") ? "BB" : "AA");
    await expect(c.decrypt("a", parts.join("."))).rejects.toBeInstanceOf(CryptoError);
  });
  it("rejects malformed envelopes", async () => {
    const { c } = mk();
    await expect(c.decrypt("a", "garbage")).rejects.toBeInstanceOf(CryptoError);
  });
  it("still reads old keys after rotation", async () => {
    const k1 = generateMasterKey(), k2 = generateMasterKey();
    const old = createCrypto(masterKeyProvider({ k1 }, "k1"));
    const env = await old.encrypt("a", "legacy");
    const rotated = createCrypto(masterKeyProvider({ k1, k2 }, "k2"));
    expect(await rotated.decrypt("a", env)).toBe("legacy");
    expect((await rotated.encrypt("a", "new")).startsWith("v1.k2.")).toBe(true);
  });
  it("blind index is stable per agency and differs across agencies", async () => {
    const { c } = mk();
    expect(await c.blindIndex("a", "maria lopez")).toBe(await c.blindIndex("a", "maria lopez"));
    expect(await c.blindIndex("a", "maria lopez")).not.toBe(await c.blindIndex("b", "maria lopez"));
  });
});
