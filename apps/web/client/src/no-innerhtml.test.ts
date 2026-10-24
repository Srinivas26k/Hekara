import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const walk = (d: string): string[] =>
  readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));

describe("client XSS hygiene (ADR-014)", () => {
  it("never writes HTML from strings", () => {
    const bad = /innerHTML|outerHTML|insertAdjacentHTML|dangerouslySetInnerHTML|document\.write|\beval\(|new Function\(/;
    const offenders = walk(new URL(".", import.meta.url).pathname)
      .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith("no-innerhtml.test.ts"))
      .filter((f) => bad.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
  it("uses Solid's innerHTML prop nowhere", () => {
    const offenders = walk(new URL(".", import.meta.url).pathname).filter(
      (f) => f.endsWith(".tsx") && /\sinnerHTML=/.test(readFileSync(f, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
  it("has no static inline styles (the CSP blocks them; use a class)", () => {
    // A style object made only of string literals is compiled into the template as a style attribute.
    const staticStyle = /style=\{\{\s*[\w-]+:\s*"[^"$]*"\s*(,\s*[\w-]+:\s*"[^"$]*"\s*)*\}\}/;
    const offenders = walk(new URL(".", import.meta.url).pathname).filter(
      (f) => f.endsWith(".tsx") && staticStyle.test(readFileSync(f, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
