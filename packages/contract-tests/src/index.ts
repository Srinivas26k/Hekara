import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Caregiver, ClaimStatus, Id, Visit } from "@hekara/core";
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
    claim(agencyId: Id, p: { amountCents: number; status?: ClaimStatus; visitId?: Id | null; createdAt?: Date }): Promise<Id>;
    /** Raw stored value of a column, to prove PHI is not stored in plaintext. */
    rawPatientName(patientId: Id): Promise<string>;
    rawCarePlanTitle(id: Id): Promise<string>;
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

    describe("agency", () => {
      it("returns only its own agency record", async () => {
        const a = await h.fixtures.agency();
        expect((await h.repo.agency(a))?.id).toBe(a);
        expect(await h.repo.agency("00000000-0000-4000-8000-000000000000")).toBeNull();
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

    describe("patients", () => {
      it("pages newest first, decrypts, scopes by agency and returns encrypted details on request", async () => {
        const a = await h.fixtures.agency(), b = await h.fixtures.agency();
        const first = await h.repo.createPatient(a, { name: "Alma Baker" });
        await new Promise((r) => setTimeout(r, 15));
        const second = await h.repo.createPatient(a, { name: "Bruce Collins", dob: "1941-03-02", address: "12 Elm St", notes: "uses a walker" });
        await h.repo.createPatient(b, { name: "Other Agency Patient" });
        const page = await h.repo.patients(a, { limit: 1, offset: 0 });
        expect(page.total).toBe(2);
        expect(page.items.map((p) => p.name)).toEqual(["Bruce Collins"]);
        expect((await h.repo.patients(a, { limit: 1, offset: 1 })).items.map((p) => p.id)).toEqual([first.id]);
        expect(await h.repo.patient(a, second.id)).toMatchObject({ name: "Bruce Collins", dob: "1941-03-02", address: "12 Elm St", notes: "uses a walker" });
        expect(await h.repo.patient(a, first.id)).toMatchObject({ dob: null, address: null, notes: null });
        expect(await h.repo.patient(b, second.id)).toBeNull();
      });
    });

    describe("care plans", () => {
      it("creates encrypted plans, lists them with patient names and filters, and scopes by agency", async () => {
        const a = await h.fixtures.agency(), b = await h.fixtures.agency();
        const p1 = await h.repo.createPatient(a, { name: "Alma Baker" }), p2 = await h.repo.createPatient(a, { name: "Bruce Collins" });
        const outsider = await h.repo.createPatient(b, { name: "Other Patient" });
        const plan = await h.repo.createCarePlan(a, { patientId: p1.id, title: "Mobility and safety", instructions: "Use the walker.", tasks: ["Walk daily", "Check rugs"], reviewOn: "2026-12-01" });
        expect(plan).toMatchObject({ patientName: "Alma Baker", title: "Mobility and safety", status: "active", taskCount: 2, tasks: ["Walk daily", "Check rugs"], instructions: "Use the walker.", reviewOn: "2026-12-01" });
        expect(await h.fixtures.rawCarePlanTitle(plan.id)).toMatch(/^v1\./);
        const paused = await h.repo.createCarePlan(a, { patientId: p2.id, title: "Recovery", status: "paused" });
        expect((await h.repo.carePlans(a, { limit: 10, offset: 0 })).total).toBe(2);
        expect((await h.repo.carePlans(a, { limit: 10, offset: 0, status: "paused" })).items.map((x) => x.id)).toEqual([paused.id]);
        expect((await h.repo.carePlans(a, { limit: 10, offset: 0, patientId: p1.id })).items.map((x) => x.id)).toEqual([plan.id]);
        expect((await h.repo.carePlans(a, { limit: 10, offset: 0, reviewBefore: "2026-12-02" })).items.map((x) => x.id)).toEqual([plan.id]); // review date before the cutoff
        expect((await h.repo.carePlans(a, { limit: 10, offset: 0, reviewBefore: "2026-12-01" })).total).toBe(0);
        expect(await h.repo.carePlan(b, plan.id)).toBeNull();
        expect((await h.repo.carePlans(b, { limit: 10, offset: 0 })).total).toBe(0);
        await expect(h.repo.createCarePlan(a, { patientId: outsider.id, title: "x" })).rejects.toThrow(); // another agency's patient
      });
      it("updates fields, clears optional ones, and refuses other agencies", async () => {
        const a = await h.fixtures.agency(), b = await h.fixtures.agency();
        const p = await h.repo.createPatient(a, { name: "Carol Dunn" });
        const plan = await h.repo.createCarePlan(a, { patientId: p.id, title: "Old", tasks: ["One"], reviewOn: "2026-11-01" });
        const next = await h.repo.updateCarePlan(a, plan.id, { title: "New", status: "completed", tasks: [], reviewOn: null, instructions: "Done" });
        expect(next).toMatchObject({ title: "New", status: "completed", taskCount: 0, tasks: [], reviewOn: null, instructions: "Done" });
        await expect(h.repo.updateCarePlan(b, plan.id, { title: "Hijack" })).rejects.toThrow();
        expect((await h.repo.carePlan(a, plan.id))?.title).toBe("New");
      });
    });

    describe("credentials", () => {
      it("lists soonest expiry first with caregiver names, and scopes by agency", async () => {
        const a = await h.fixtures.agency(), b = await h.fixtures.agency();
        const c1 = await h.fixtures.caregiver(a, { name: "Maria Lopez" }), c2 = await h.fixtures.caregiver(a, { name: "James Carter" });
        const foreign = await h.fixtures.caregiver(b, { name: "Other Caregiver" });
        const later = await h.repo.addCredential(a, { caregiverId: c1.id, kind: "CPR", expiresOn: "2027-05-01", issuedOn: "2026-05-01" });
        const sooner = await h.repo.addCredential(a, { caregiverId: c2.id, kind: "TB test", expiresOn: "2026-11-15" });
        expect((await h.repo.credentials(a)).map((c) => [c.id, c.caregiverName, c.kind])).toEqual([[sooner.id, "James Carter", "TB test"], [later.id, "Maria Lopez", "CPR"]]);
        expect((await h.repo.credentials(a))[1]).toMatchObject({ issuedOn: "2026-05-01", expiresOn: "2027-05-01" });
        expect(await h.repo.credentials(b)).toEqual([]);
        await expect(h.repo.addCredential(a, { caregiverId: foreign.id, kind: "CPR", expiresOn: "2027-01-01" })).rejects.toThrow();
      });
      it("removes only within the agency", async () => {
        const a = await h.fixtures.agency(), b = await h.fixtures.agency();
        const c = await h.fixtures.caregiver(a);
        const cred = await h.repo.addCredential(a, { caregiverId: c.id, kind: "CPR", expiresOn: "2027-01-01" });
        expect(await h.repo.removeCredential(b, cred.id)).toBe(false);
        expect((await h.repo.credentials(a)).length).toBe(1);
        expect(await h.repo.removeCredential(a, cred.id)).toBe(true);
        expect(await h.repo.removeCredential(a, cred.id)).toBe(false);
      });
    });

    describe("agency settings", () => {
      it("renames only the given agency", async () => {
        const a = await h.fixtures.agency(), b = await h.fixtures.agency();
        const before = (await h.repo.agency(b))!.name;
        await h.repo.renameAgency(a, "Renamed Home Health");
        expect((await h.repo.agency(a))?.name).toBe("Renamed Home Health");
        expect((await h.repo.agency(b))?.name).toBe(before);
      });
    });

    describe("claims", () => {
      it("pages with visit details, filters by status, counts, and scopes by agency", async () => {
        const a = await h.fixtures.agency(), b = await h.fixtures.agency();
        const v = await h.fixtures.visit(a, { startsAt: at(9), endsAt: at(10), label: "Helen Park" });
        const d1 = await h.fixtures.claim(a, { amountCents: 1000, status: "draft", visitId: v.id, createdAt: new Date(Date.now() - 2000) });
        const d2 = await h.fixtures.claim(a, { amountCents: 2000, status: "draft", createdAt: new Date(Date.now() - 1000) });
        await h.fixtures.claim(a, { amountCents: 3000, status: "paid" });
        await h.fixtures.claim(b, { amountCents: 9999, status: "draft" });
        const drafts = await h.repo.claimsPage(a, { status: "draft", limit: 10, offset: 0 });
        expect(drafts.total).toBe(2);
        expect(drafts.items.map((c) => c.id)).toEqual([d2, d1]);
        expect(drafts.items[1]).toMatchObject({ visitLabel: "Helen Park", amountCents: 1000 });
        expect(drafts.items[0]).toMatchObject({ visitLabel: null, visitStart: null });
        expect((await h.repo.claimsPage(a, { limit: 10, offset: 0 })).total).toBe(3);
        expect(await h.repo.claimCounts(a)).toEqual({ draft: 2, submitted: 0, paid: 1, denied: 0 });
        expect(await h.repo.claimCounts(b)).toEqual({ draft: 1, submitted: 0, paid: 0, denied: 0 });
        expect(await h.repo.claimTotals(a)).toEqual({
          counts: { draft: 2, submitted: 0, paid: 1, denied: 0 }, amountCents: { draft: 3000, submitted: 0, paid: 3000, denied: 0 },
        });
      });
      it("updates status only within the agency", async () => {
        const a = await h.fixtures.agency(), b = await h.fixtures.agency();
        const id = await h.fixtures.claim(a, { amountCents: 500, status: "draft" });
        expect((await h.repo.setClaimStatus(a, id, "submitted")).status).toBe("submitted");
        expect((await h.repo.claim(a, id))?.status).toBe("submitted");
        expect(await h.repo.claim(b, id)).toBeNull();
        await expect(h.repo.setClaimStatus(b, id, "paid")).rejects.toThrow();
        expect((await h.repo.claim(a, id))?.status).toBe("submitted");
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
      it("lists newest first, pages backwards, scopes by agency and decrypts meta", async () => {
        const a = await h.fixtures.agency(), b = await h.fixtures.agency();
        for (const n of [1, 2, 3, 4]) await h.audit.append({ agencyId: a, userId: "u", action: `act${n}`, entity: "e", meta: { n } });
        await h.audit.append({ agencyId: b, userId: "u", action: "other", entity: "e" });
        const page1 = await h.audit.list(a, { limit: 2 });
        expect(page1.map((r) => r.action)).toEqual(["act4", "act3"]);
        expect(page1[0]!.meta).toEqual({ n: 4 });
        const page2 = await h.audit.list(a, { limit: 2, beforeSeq: page1[1]!.seq });
        expect(page2.map((r) => r.action)).toEqual(["act2", "act1"]);
        expect((await h.audit.list(b, { limit: 10 })).map((r) => r.action)).toEqual(["other"]);
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
