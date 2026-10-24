import { describe, expect, it } from "vitest";
import { FailureThrottle } from "./throttle";

const make = () => {
  let t = 0;
  const th = new FailureThrottle({ maxFailures: 3, windowMs: 60_000, lockMs: 300_000 }, () => t);
  return {
    th,
    advance: (ms: number) => {
      t += ms;
    },
  };
};

describe("FailureThrottle", () => {
  it("locks after the maximum number of failures", () => {
    const { th } = make();
    th.fail("a");
    th.fail("a");
    expect(th.retryAfter("a")).toBe(0);
    th.fail("a");
    expect(th.retryAfter("a")).toBe(300);
  });
  it("unlocks after the lock period", () => {
    const { th, advance } = make();
    for (let i = 0; i < 3; i++) th.fail("a");
    advance(299_000);
    expect(th.retryAfter("a")).toBe(1);
    advance(2_000);
    expect(th.retryAfter("a")).toBe(0);
  });
  it("forgets failures outside the window", () => {
    const { th, advance } = make();
    th.fail("a");
    th.fail("a");
    advance(61_000);
    th.fail("a");
    expect(th.retryAfter("a")).toBe(0);
  });
  it("resets on success and keeps accounts separate", () => {
    const { th } = make();
    th.fail("a");
    th.fail("a");
    th.succeed("a");
    th.fail("a");
    for (let i = 0; i < 3; i++) th.fail("b");
    expect(th.retryAfter("a")).toBe(0);
    expect(th.retryAfter("b")).toBeGreaterThan(0);
  });
  it("bounds memory", () => {
    const th = new FailureThrottle(
      { maxFailures: 3, windowMs: 1, lockMs: 1, maxEntries: 5 },
      (() => {
        let t = 0;
        return () => (t += 10);
      })(),
    );
    for (let i = 0; i < 50; i++) th.fail(`k${i}`);
    expect((th as unknown as { hits: Map<string, unknown> }).hits.size).toBeLessThanOrEqual(6);
  });
});
