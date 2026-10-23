import { describe, expect, it } from "vitest";
import { argon2idHasher } from "./password";

const h = argon2idHasher({ memory: 1024, passes: 1 }); // small parameters keep the test fast

describe("argon2id hasher", () => {
  it("verifies the right password and rejects the wrong one", async () => {
    const hash = await h.hash("correct horse battery staple");
    expect(hash).toMatch(/^argon2id\$m=1024,t=1,p=1\$/);
    expect(await h.verify({ hash, password: "correct horse battery staple" })).toBe(true);
    expect(await h.verify({ hash, password: "wrong" })).toBe(false);
  });
  it("salts every hash", async () => {
    expect(await h.hash("same")).not.toBe(await h.hash("same"));
  });
  it("rejects malformed hashes without throwing", async () => {
    expect(await h.verify({ hash: "garbage", password: "x" })).toBe(false);
    expect(await h.verify({ hash: "argon2id$m=1,t=1,p=1$$", password: "x" })).toBe(false);
  });
  it("honors parameters stored in the hash", async () => {
    const old = await argon2idHasher({ memory: 512, passes: 1 }).hash("pw");
    expect(await h.verify({ hash: old, password: "pw" })).toBe(true);
  });
});
