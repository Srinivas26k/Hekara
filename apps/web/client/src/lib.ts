export const START = 7;          // timeline starts at 7 AM
export const END = 19;           // and ends at 7 PM
export const ROW_H = 49;         // design px per caregiver row
const SPAN = END - START;

/** Horizontal position of an hour as a percentage of the track, so the timeline stretches to any width. */
export const pct = (hour: number): number => ((hour - START) / SPAN) * 100;

/** Local fractional hour of an ISO timestamp, e.g. 10:45 -> 10.75. */
export const hourOf = (iso: string | Date): number => {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.getHours() + d.getMinutes() / 60;
};

export const fmtClock = (d: Date): string =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

const meridiem = (h: number) => (h >= 12 ? "PM" : "AM");
const h12 = (h: number) => ((Math.floor(h) + 11) % 12) + 1;
const t = (h: number) => {
  const m = Math.round((h - Math.floor(h)) * 60);
  return m ? `${h12(h)}:${String(m).padStart(2, "0")}` : String(h12(h));
};

/** "4 to 6 PM" when both share a meridiem, else "11 AM to 1 PM". */
export function fmtRange(startIso: string, endIso: string): string {
  const a = hourOf(startIso), b = hourOf(endIso);
  return meridiem(a) === meridiem(b) ? `${t(a)} to ${t(b)} ${meridiem(b)}` : `${t(a)} ${meridiem(a)} to ${t(b)} ${meridiem(b)}`;
}

/** Placement of a visit in percent of the track, clipped to the visible window; null when entirely outside it. */
export function place(startIso: string, endIso: string): { left: number; width: number } | null {
  const a = Math.max(hourOf(startIso), START), b = Math.min(hourOf(endIso) || 24, END);
  if (b <= a) return null;
  return { left: pct(a), width: pct(b) - pct(a) };
}

export type Kind = "done" | "prog" | "sched" | "attn" | "open" | "ai";

/** Maps a status to its style, re-deriving time-based states from the client clock so the view stays live between fetches. */
export function kindOf(status: string, startIso: string, endIso: string, now: Date): Kind {
  if (status === "attention") return "attn";
  if (status === "open") return "open";
  if (status === "ai_suggestion") return "ai";
  const n = now.getTime();
  if (new Date(endIso).getTime() <= n) return "done";
  if (new Date(startIso).getTime() <= n) return "prog";
  return "sched";
}

export const initials = (name: string): string =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");

/** Deterministic soft color per name, for initials avatars (no external images, no PHI sent anywhere). */
export function avatarColors(name: string): { bg: string; fg: string } {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return { bg: `hsl(${h} 55% 88%)`, fg: `hsl(${h} 45% 30%)` };
}

export function longDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

export const round1 = (n: number): string => String(Math.round(n * 10) / 10);

/** Copy for the Copilot card, matching the design: "Save 1.5 overtime hours and fill 1 open shift." */
export function copilotCopy(count: number, hoursSaved: number, filled: number): { title: string; body: string } {
  if (count === 0) return { title: "All caught up", body: "No scheduling suggestions right now." };
  const parts: string[] = [];
  if (hoursSaved > 0) parts.push(`Save ${round1(hoursSaved)} overtime ${hoursSaved === 1 ? "hour" : "hours"}`);
  if (filled > 0) parts.push(`${parts.length ? "fill" : "Fill"} ${plural(filled, "open shift")}`);
  return { title: `${plural(count, "suggestion")} ready`, body: `${parts.join(" and ")}.` };
}

export const money = (cents: number): string =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export const shortDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export const dayTime = (iso: string): string =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** "1941-03-02" to "Mar 2, 1941" without time-zone drift. */
export function plainDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
