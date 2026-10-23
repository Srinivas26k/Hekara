import { describe, expect, it } from "vitest";
import { avatarColors, copilotCopy, fmtRange, hourOf, initials, kindOf, longDate, place, x } from "./lib";

const iso = (h: number, m = 0) => new Date(2026, 8, 30, h, m).toISOString();

describe("time formatting", () => {
  it("formats ranges like the design", () => {
    expect(fmtRange(iso(16), iso(18))).toBe("4 to 6 PM");
    expect(fmtRange(iso(18), iso(19))).toBe("6 to 7 PM");
    expect(fmtRange(iso(11), iso(13))).toBe("11 AM to 1 PM");
    expect(fmtRange(iso(8, 30), iso(10))).toBe("8:30 to 10 AM");
  });
  it("reads local fractional hours", () => expect(hourOf(iso(10, 45))).toBe(10.75));
  it("formats the date header", () => expect(longDate("2026-09-30")).toBe("Wednesday, Sep 30"));
});

describe("timeline geometry", () => {
  it("places a visit on the hour grid", () => {
    expect(x(7)).toBe(225);
    expect(place(iso(8), iso(10))).toEqual({ left: 225 + 88 + 2, width: 2 * 88 - 4 });
  });
  it("clips to the 7 AM to 7 PM window and hides visits outside it", () => {
    expect(place(iso(6), iso(8))).toEqual({ left: 225 + 2, width: 88 - 4 });
    expect(place(iso(5), iso(6))).toBeNull();
    expect(place(iso(19), iso(20))).toBeNull();
  });
});

describe("status kinds", () => {
  const now = new Date(2026, 8, 30, 10, 45);
  it("re-derives time-based states from the clock", () => {
    expect(kindOf("scheduled", iso(8), iso(10), now)).toBe("done");
    expect(kindOf("in_progress", iso(10, 30), iso(12), now)).toBe("prog");
    expect(kindOf("scheduled", iso(13), iso(14), now)).toBe("sched");
  });
  it("keeps stored states", () => {
    expect(kindOf("attention", iso(8), iso(10), now)).toBe("attn");
    expect(kindOf("open", iso(8), iso(10), now)).toBe("open");
  });
});

describe("copy and avatars", () => {
  it("writes the Copilot card like the design", () => {
    expect(copilotCopy(2, 1.5, 1)).toEqual({ title: "2 suggestions ready", body: "Save 1.5 overtime hours and fill 1 open shift." });
    expect(copilotCopy(1, 0, 1)).toEqual({ title: "1 suggestion ready", body: "Fill 1 open shift." });
    expect(copilotCopy(0, 0, 0).title).toBe("All caught up");
  });
  it("builds initials and stable colors", () => {
    expect(initials("Maria Lopez")).toBe("ML");
    expect(initials("Cher")).toBe("C");
    expect(avatarColors("Maria Lopez")).toEqual(avatarColors("Maria Lopez"));
  });
});
