export type CredentialStatus = "expired" | "due30" | "due90" | "valid";
export type CarePlanStatus = "active" | "paused" | "completed";
export type ReviewState = "none" | "overdue" | "due7" | "ok";

const DAY = 86_400_000;
const toUtc = (ymd: string): number => {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
};

/** Whole days from `today` to `date` (negative when `date` has passed). Both are plain YYYY-MM-DD dates. */
export const daysUntil = (date: string, today: string): number => Math.round((toUtc(date) - toUtc(today)) / DAY);

/** A credential counts as valid through its expiry date and expires the day after. */
export function credentialStatus(expiresOn: string, today: string): CredentialStatus {
  const d = daysUntil(expiresOn, today);
  if (d < 0) return "expired";
  if (d <= 30) return "due30";
  if (d <= 90) return "due90";
  return "valid";
}

/** Only active plans need a review; finished or paused plans never nag. */
export function reviewState(reviewOn: string | null, today: string, status: CarePlanStatus): ReviewState {
  if (!reviewOn || status !== "active") return "none";
  const d = daysUntil(reviewOn, today);
  return d < 0 ? "overdue" : d <= 7 ? "due7" : "ok";
}

export const ymdOf = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
