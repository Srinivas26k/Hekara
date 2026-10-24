import { mkdir, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { allPhotos, photoFile, remoteUrl } from "./demo-avatars";

/** Downloads the demo portraits next to the client, where Vite serves them. Safe to rerun: files already present are skipped. */
const dir = fileURLToPath(new URL("../client/public/avatars/", import.meta.url));
await mkdir(dir, { recursive: true });

const exists = (p: string) =>
  stat(p).then(
    () => true,
    () => false,
  );
let fetched = 0,
  skipped = 0,
  failed = 0;
const queue = allPhotos();

async function worker() {
  for (let p = queue.pop(); p; p = queue.pop()) {
    const file = dir + photoFile(p.g, p.n);
    if (await exists(file)) {
      skipped++;
      continue;
    }
    try {
      const r = await fetch(remoteUrl(p.g, p.n));
      if (!r.ok || !r.headers.get("content-type")?.startsWith("image/")) throw new Error(String(r.status));
      await writeFile(file, new Uint8Array(await r.arrayBuffer()));
      fetched++;
    } catch {
      failed++;
    }
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
console.log(`Demo avatars in ${dir}\n  downloaded ${fetched}, already there ${skipped}, failed ${failed}`);
if (failed) console.log("  Some portraits could not be downloaded; the app shows initials for those people.");
