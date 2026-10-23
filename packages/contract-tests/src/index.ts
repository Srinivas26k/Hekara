import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Caregiver, Id, Visit } from "@hekara/core";
import type { Audit, Realtime, Repository } from "@hekara/ports";

/** Everything an adapter must supply so the shared suite can run against it. */
export interface ContractHarness {
  repo: Repository;
  audit: Audit;
  realtime: Realtime;
  /** Seeding and raw-storage hooks; these bypass the ports on purpose. */
  fixtures: {
    agency(): Promise<Id>;
    caregiver(agencyId: Id, p?: Partial<Caregiver>): Promise<Caregiver>;
    visit(agencyId: Id, p: Pick<Visit, "startsAt" | "endsAt"> & Partial<Visit>): Promise<Visit>;
    /** Raw stored value of a column, to prove PHI is not stored in plaintext. */
    rawPatientName(patientId: Id): Promise<string>;
    rawVisitLabel(visitId: Id): Promise<string>;
    /** Corrupt one stored audit entry (by sequence number). */
    tamperAudit(agencyId: Id, seq: number): Promise<void>;
  };
  close(): Promise<void>;
}

const at = (h: number) => new Date(Date.UTC(2026, 8, 30, Math.floor(h), (h % 1) * 60));
const day = { from: at(0), to: at(24) };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The suite every platform adapter must pass. Call inside a test file. */
export function runContract(name: string, make: () => Promise<ContractHarness>): void {
  describe(`contract: ${name}`, () => {
    let h: ContractHarness;
    beforeAll(async () => { h = await make(); });
    afterAll(async () => { await h.close(); });

    describe("agency scoping", () => {
      it("never returns another agency's rows", async () => {
        const a = await h.fixtures.agency(), b = await h.fixtures.agency();
        const ca = await h.fixtures.caregiver(a, { name: "Alice A" });
        const va = await h.fixtures.visit(a, { startsAt: at(9), endsAt: at(10), caregiverId: ca.id, label: "Visit A" });
        expect((await h.repo.caregivers(b)).map((c) => c.id)).not.toContain(ca.id);
        expect(await h.repo.visits(b, day)).toEqual([]);
        expect(await h.repo.visit(b, va.id)).toBeNull();
        await expect(h.repo.assignVisit(b, va.id, null)).rejects.toThrow();
        expect(await h.repo.search(b, "Alice", 10)).toEqual([]);
      });
    });

    describe("visits", () => {
      it("filters by time window and caregiver, ordered by start", async () => {
        const a = await h.fixtures.agency();
        const c1 = await h.fixtures.caregiver(a), c2 = await h.fixtures.caregiver(a);
        const late = await h.fixtures.visit(a, { startsAt: at(15), endsAt: at(16), caregiverId: c1.id });
        const early = await h.fixtures.visit(a, { startsAt: at(8), endsAt: at(9), caregiverId: c1.id });
        const other = await h.fixtures.visit(a, { startsAt: at(10), endsAt: at(11), caregiverId: c2.id });
        const nextDay = await h.fixtures.visit(a, { startsAt: at(32), endsAt: at(33), caregiverId: c1.id });
        const all = await h.repo.visits(a, day);
        expect(all.map((v) => v.id)).toEqual([early.id, other.id, late.id]);
        expect(all.map((v) => v.id)).not.toContain(nextDay.id);
        expect((await h.repo.visits(a, { ...day, caregiverId: c2.id })).map((v) => v.id)).toEqual([other.id]);
      });

      it("assigns and unassigns, updating status", async () => {
        const a = await h.fixtures.agency();
        const c = await h.fixtures.caregiver(a);
        const open = await h.fixtures.visit(a, { startsAt: at(16), endsAt: at(18), status: "open", caregiverId: null });
        const assigned = await h.repo.assignVisit(a, open.id, c.id);
        expect(assigned.caregiverId).toBe(c.id);
        expect(assigned.status).toBe("scheduled");
        const freed = await h.repo.assignVisit(a, open.id, null);
        expect(freed.caregiverId).toBeNull();
        expect(freed.status).toBe("open");
      });

      it("rolls back a failed transaction", async () => {
        const a = await h.fixtures.agency();
        const c = await h.fixtures.caregiver(a);
        const v = await h.fixtures.visit(a, { startsAt: at(9), endsAt: at(10), status: "open", caregiverId: null });
        await expect(h.repo.transaction(a, async (tx) => {
          await tx.assignVisit(a, v.id, c.id);
          throw new Error("boom");
        })).rejects.toThrow("boom");
        expect((await h.repo.visit(a, v.id))?.caregiverId).toBeNull();
      });
    });

    describe("encryption at rest", () => {
      it("stores patient names and visit labels as envelopes", async () => {
        const a = await h.fixtures.agency();
        const p = await h.repo.createPatient(a, { name: "Dorothy Nguyen", notes: "uses a walker" });
        expect(p.name).toBe("Dorothy Nguyen");
        const raw = await h.fixtures.rawPatientName(p.id);
        expect(raw).toMatch(/^v1\./);
        expect(raw).not.toContain("Dorothy");
        const v = await h.fixtures.visit(a, { startsAt: at(9), endsAt: at(10), label: "Helen Park" });
        expect(await h.fixtures.rawVisitLabel(v.id)).toMatch(/^v1\./);
        expect((await h.repo.visit(a, v.id))?.label).toBe("Helen Park");
      });
    });

    describe("search", () => {
      it("finds patients and caregivers by partial, case-insensitive name", async () => {
        const a = await h.fixtures.agency();
        const p = await h.repo.createPatient(a, { name: "Joseph Ramirez" });
        const c = await h.fixtures.caregiver(a, { name: "Maria Lopez" });
        expect((await h.repo.search(a, "RAMI", 10)).map((x) => x.id)).toEqual([p.id]);
        expect((await h.repo.search(a, "lopez", 10)).map((x) => x.id)).toEqual([c.id]);
        expect(await h.repo.search(a, "", 10)).toEqual([]);
      });
      it("counts patients created since a date", async () => {
        const a = await h.fixtures.agency();
        await h.repo.createPatient(a, { name: "New One" });
        expect(await h.repo.countPatientsSince(a, new Date(Date.now() - 60_000))).toBe(1);
        expect(await h.repo.countPatientsSince(a, new Date(Date.now() + 60_000))).toBe(0);
      });
    });

    describe("realtime", () => {
      it("delivers events only to subscribers of the same agency, until unsubscribed", async () => {
        const a = await h.fixtures.agency(), b = await h.fixtures.agency();
        const gotA: string[] = [], gotB: string[] = [];
        const offA = await h.realtime.subscribe(a, (e) => gotA.push(e.type));
        const offB = await h.realtime.subscribe(b, (e) => gotB.push(e.type));
        await h.realtime.publish({ type: "visit.updated", agencyId: a });
        await wait(300);
        expect(gotA).toEqual(["visit.updated"]);
        expect(gotB).toEqual([]);
        offA(); offB();
        await h.realtime.publish({ type: "visit.updated", agencyId: a });
        await wait(300);
        expect(gotA).toEqual(["visit.updated"]);
      });
    });

    describe("audit", () => {
      it("keeps an intact hash chain and detects tampering", async () => {
        const a = await h.fixtures.agency();
        for (const action of ["login", "visit.fill", "patient.create"]) {
          await h.audit.append({ agencyId: a, userId: "u1", action, entity: "visit", entityId: "x", meta: { n: 1 } });
        }
        expect(await h.audit.verify(a)).toBeNull();
        await h.fixtures.tamperAudit(a, 2);
        expect(await h.audit.verify(a)).toBe(1);
      });
      it("serializes concurrent appends without breaking the chain", async () => {
        const a = await h.fixtures.agency();
        await Promise.all(Array.from({ length: 8 }, (_, i) =>
          h.audit.append({ agencyId: a, userId: null, action: `a${i}`, entity: "e" })));
        expect(await h.audit.verify(a)).toBeNull();
      });
    });
  });
}
