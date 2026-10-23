/**
 * Locks an identifier after repeated failures, regardless of source address, so credential guessing can't be
 * spread across IPs. In memory: per instance. Use a shared store when running several instances.
 * Unknown identifiers are counted exactly like real ones, so the lock reveals nothing about which accounts exist.
 */
export class FailureThrottle {
  private readonly hits = new Map<string, { n: number; first: number; lockedUntil: number }>();

  constructor(
    private readonly opts: { maxFailures: number; windowMs: number; lockMs: number; maxEntries?: number },
    private readonly now: () => number = Date.now,
  ) {}

  /** Seconds until the identifier may try again, or 0. */
  retryAfter(key: string): number {
    const e = this.hits.get(key);
    const t = this.now();
    return e && e.lockedUntil > t ? Math.ceil((e.lockedUntil - t) / 1000) : 0;
  }

  fail(key: string): void {
    const t = this.now();
    let e = this.hits.get(key);
    if (!e || t - e.first > this.opts.windowMs) { e = { n: 0, first: t, lockedUntil: 0 }; this.hits.set(key, e); }
    if (++e.n >= this.opts.maxFailures) e.lockedUntil = t + this.opts.lockMs;
    if (this.hits.size > (this.opts.maxEntries ?? 10_000)) this.sweep(t);
  }

  succeed(key: string): void { this.hits.delete(key); }

  private sweep(t: number): void {
    for (const [k, e] of this.hits) if (e.lockedUntil <= t && t - e.first > this.opts.windowMs) this.hits.delete(k);
  }
}
