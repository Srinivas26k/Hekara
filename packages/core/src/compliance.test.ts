import { describe, expect, it } from "vitest";
import { credentialStatus, daysUntil, reviewState, ymdOf } from "./index";

const today = "2026-10-24";

describe("credential status", () => {
  it("is valid through the expiry date and expired the day after", () => {
    expect(credentialStatus("2026-10-24", today)).toBe("due30");
    expect(credentialStatus("2026-10-23", today)).toBe("expired");
  });
  it("buckets by 30 and 90 days", () => {
    expect(credentialStatus("2026-11-23", today)).toBe("due30"); // 30 days
    expect(credentialStatus("2026-11-24", today)).toBe("due90"); // 31 days
    expect(credentialStatus("2027-01-22", today)).toBe("due90"); // 90 days
    expect(credentialStatus("2027-01-23", today)).toBe("valid"); // 91 days
  });
  it("counts days across month and year ends and leap days", () => {
    expect(daysUntil("2027-01-01", "2026-12-31")).toBe(1);
    expect(daysUntil("2028-03-01", "2028-02-28")).toBe(2);
    expect(daysUntil("2026-10-20", today)).toBe(-4);
  });
});

describe("care plan review state", () => {
  it("flags overdue and upcoming reviews for active plans only", () => {
    expect(reviewState("2026-10-20", today, "active")).toBe("overdue");
    expect(reviewState("2026-10-31", today, "active")).toBe("due7");
    expect(reviewState("2026-11-01", today, "active")).toBe("ok");
    expect(reviewState(null, today, "active")).toBe("none");
    expect(reviewState("2026-10-01", today, "paused")).toBe("none");
    expect(reviewState("2026-10-01", today, "completed")).toBe("none");
  });
});

describe("ymdOf", () => {
  it("formats local dates with zero padding", () => expect(ymdOf(new Date(2026, 0, 5))).toBe("2026-01-05"));
});
