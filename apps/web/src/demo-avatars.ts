/**
 * Placeholder profile photos for the DEMO data only.
 *
 * Portraits come from randomuser.me (hand-picked from the authorised section of UI Faces, which sets the rules for using
 * them). They are downloaded onto your machine by `pnpm demo:avatars` into a git-ignored folder and served by this app from
 * its own origin, so the browser never contacts a third party. They are not committed to the repository.
 */
export type Gender = "w" | "m";

/** The people on the reference schedule, with the portraits they were designed around. */
export const FEATURED: Record<string, [Gender, number]> = {
  "Maria Lopez": ["w", 44],
  "James Carter": ["m", 32],
  "Aisha Bello": ["w", 65],
  "Devon Price": ["m", 75],
  "Carlos Mendes": ["m", 46],
  "Priya Raman": ["w", 26],
  "Rosa Delgado": ["w", 68],
  "Tanya Brooks": ["w", 90],
  "Elena Ruiz": ["w", 12],
  "Dana Admin": ["w", 33],
  "Sam Scheduler": ["m", 81],
  "Bea Billing": ["w", 52],
};

const FEMALE_FIRST = new Set([
  "Amara",
  "Chloe",
  "Esther",
  "Grace",
  "Imani",
  "Keiko",
  "Mina",
  "Olga",
  "Rhea",
  "Sofia",
  "Uma",
  "Wanda",
  "Ximena",
  "Zara",
]);
export const genderOf = (name: string): Gender => (FEMALE_FIRST.has(name.split(" ")[0] ?? "") ? "w" : "m");

export const photoFile = (g: Gender, n: number) => `${g}-${n}.jpg`;
export const photoUrl = (file: string) => `/avatars/${file}`;
export const remoteUrl = (g: Gender, n: number) => `https://randomuser.me/api/portraits/${g === "w" ? "women" : "men"}/${n}.jpg`;

const reserved = new Set(Object.values(FEATURED).map(([g, n]) => photoFile(g, n)));
const POOL_SIZE = 70;

/** Every portrait the demo can use, so the download script and the seed always agree. */
export const allPhotos = (): { g: Gender; n: number }[] => {
  const out: { g: Gender; n: number }[] = [];
  for (const g of ["w", "m"] as Gender[]) for (let n = 0; n < POOL_SIZE; n++) out.push({ g, n });
  for (const [g, n] of Object.values(FEATURED)) if (!out.some((p) => p.g === g && p.n === n)) out.push({ g, n });
  return out;
};

/** Gives each name a portrait: the featured people keep theirs, everyone else gets the next unused one for their gender. */
export function assignAvatars(names: string[]): Map<string, string> {
  const next: Record<Gender, number> = { w: 0, m: 0 };
  const out = new Map<string, string>();
  for (const name of names) {
    const fixed = FEATURED[name];
    if (fixed) {
      out.set(name, photoUrl(photoFile(fixed[0], fixed[1])));
      continue;
    }
    const g = genderOf(name);
    while (reserved.has(photoFile(g, next[g]))) next[g]++;
    out.set(name, photoUrl(photoFile(g, next[g]++ % POOL_SIZE)));
  }
  return out;
}
