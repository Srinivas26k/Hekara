import { describe, expect, it } from "vitest";
import { canTransitionClaim, nextClaimStatuses } from "./index";

describe("claim workflow", () => {
  it("moves draft to submitted to paid or denied", () => {
    expect(canTransitionClaim("draft", "submitted")).toBe(true);
    expect(canTransitionClaim("submitted", "paid")).toBe(true);
    expect(canTransitionClaim("submitted", "denied")).toBe(true);
  });
  it("lets a denied claim return to draft and nothing leave paid", () => {
    expect(canTransitionClaim("denied", "draft")).toBe(true);
    expect(nextClaimStatuses("paid")).toEqual([]);
  });
  it("refuses skips and reversals", () => {
    expect(canTransitionClaim("draft", "paid")).toBe(false);
    expect(canTransitionClaim("paid", "draft")).toBe(false);
    expect(canTransitionClaim("submitted", "draft")).toBe(false);
    expect(canTransitionClaim("draft", "draft")).toBe(false);
  });
});
