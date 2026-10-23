import { describe, expect, it } from "vitest";
import { buildSuggestions, deriveStatus, isEligible, overtimeWatch, rankCandidates, summarize } from "./index";
import type { Caregiver, Visit } from "./index";

const at = (h: number) => new Date(Date.UTC(2026, 8, 30, Math.floor(h), (h % 1) * 60));
const cg = (id: string, over: Partial<Caregiver> = {}): Caregiver => ({
  id, agencyId: "a", name: id, avatarUrl: null, weeklyHours: 20, weeklyLimit: 40,
  skills: ["HHA", "Companion"], onShift: false, flagged: false, ...over,
});
const visit = (id: string, s: number, e: number, over: Partial<Visit> = {}): Visit => ({
  id, agencyId: "a", caregiverId: null, patientId: null, label: id,
  startsAt: at(s), endsAt: at(e), status: "scheduled", requirement: null, ...over,
});

describe("deriveStatus", () => {
  const v = visit("v", 10, 12);
  it("follows the clock", () => {
    expect(deriveStatus(v, at(9))).toBe("scheduled");
    expect(deriveStatus(v, at(11))).toBe("in_progress");
    expect(deriveStatus(v, at(12))).toBe("done");
  });
  it("keeps stored statuses", () => {
    expect(deriveStatus({ ...v, status: "attention" }, at(11))).toBe("attention");
    expect(deriveStatus({ ...v, status: "open" }, at(13))).toBe("open");
  });
});

describe("eligibility", () => {
  const open = visit("o", 16, 18, { requirement: "HHA", status: "open" });
  it("requires the skill", () => expect(isEligible(cg("x", { skills: ["Companion"] }), open, [])).toBe(false));
  it("rejects overlaps", () => {
    const busy = visit("b", 15, 17, { caregiverId: "x" });
    expect(isEligible(cg("x"), open, [busy])).toBe(false);
  });
  it("rejects exceeding the weekly limit", () => {
    expect(isEligible(cg("x", { weeklyHours: 39 }), open, [])).toBe(false);
    expect(isEligible(cg("x", { weeklyHours: 38 }), open, [])).toBe(true);
  });
  it("ranks lowest hours first, name as tiebreak", () => {
    const ranked = rankCandidates(open, [cg("b", { weeklyHours: 30 }), cg("c", { weeklyHours: 10 }), cg("a", { weeklyHours: 10 })], []);
    expect(ranked.map((c) => c.id)).toEqual(["a", "c", "b"]);
  });
});

describe("overtimeWatch", () => {
  it("lists caregivers at 90% or more, most loaded first", () => {
    const list = overtimeWatch([cg("a", { weeklyHours: 36 }), cg("b", { weeklyHours: 38 }), cg("c", { weeklyHours: 20 })]);
    expect(list.map((e) => e.caregiver.id)).toEqual(["b", "a"]);
  });
});

describe("buildSuggestions", () => {
  it("fills open shifts and moves visits off an overloaded caregiver", () => {
    const caregivers = [cg("rosa", { weeklyHours: 38 }), cg("aisha", { weeklyHours: 10 })];
    const remaining = [
      visit("joan", 11, 14, { caregiverId: "rosa" }),
      visit("george", 16, 18, { status: "open" }),
    ];
    const s = buildSuggestions(caregivers, remaining);
    expect(s).toEqual([
      { kind: "fill", visitId: "george", caregiverId: "aisha", hoursSaved: 0 },
      { kind: "move", visitId: "joan", fromCaregiverId: "rosa", caregiverId: "aisha", hoursSaved: 1 },
    ]);
    expect(summarize(s)).toEqual({ count: 2, hoursSaved: 1, shiftsFilled: 1 });
  });
  it("returns nothing when no one is eligible", () => {
    expect(buildSuggestions([cg("a", { weeklyHours: 40 })], [visit("o", 9, 10, { status: "open" })])).toEqual([]);
  });
});
