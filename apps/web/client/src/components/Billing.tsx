import { createResource, createSignal, For, Show } from "solid-js";
import type { ClaimStatus } from "@hekara/core";
import { api } from "../api";
import { Icon } from "../icons";
import { dayTime, money, shortDate } from "../lib";
import { store } from "../store";
import { Pager } from "./Pager";

const LIMIT = 25;
type Tab = ClaimStatus | "all";
const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "All" }, { key: "draft", label: "Draft" }, { key: "submitted", label: "Submitted" },
  { key: "paid", label: "Paid" }, { key: "denied", label: "Denied" },
];
const ACTION: Record<ClaimStatus, string> = { draft: "Reopen", submitted: "Submit", paid: "Mark paid", denied: "Mark denied" };

export function BillingPage() {
  const [tab, setTab] = createSignal<Tab>("all");
  const [offset, setOffset] = createSignal(0);
  const [busy, setBusy] = createSignal<string | null>(null);
  const [data, { refetch }] = createResource(() => [tab(), offset(), store.version()] as const, ([t, o]) => api.claims(t === "all" ? undefined : t, o, LIMIT));
  const counts = () => data.latest?.counts;
  const total = () => (counts() ? counts()!.draft + counts()!.submitted + counts()!.paid + counts()!.denied : 0);

  async function move(id: string, to: ClaimStatus) {
    setBusy(id);
    try { await api.setClaimStatus(id, to); store.toast(`Claim ${ACTION[to] === "Reopen" ? "reopened" : to}`); await refetch(); }
    catch { store.toast("That change isn't allowed right now"); await refetch(); } finally { setBusy(null); }
  }

  return (
    <section class="card page">
      <header class="page-head">
        <span class="sched-icon"><Icon.receipt /></span>
        <h1>Billing &amp; Claims</h1>
        <span class="sched-sub">{total()} claims</span>
      </header>
      <div class="tabs" role="tablist">
        <For each={TABS}>{(t) => (
          <button role="tab" aria-selected={tab() === t.key} classList={{ on: tab() === t.key }} onClick={() => { setTab(t.key); setOffset(0); }}>
            {t.label}<span class="count">{t.key === "all" ? total() : counts()?.[t.key] ?? 0}</span>
          </button>
        )}</For>
      </div>
      <div class="table-wrap">
        <Show when={!data.error} fallback={<p class="empty">Couldn't load claims.</p>}>
          <table>
            <thead><tr><th>Claim</th><th>Visit</th><th>Created</th><th class="num">Amount</th><th>Status</th><th /></tr></thead>
            <tbody>
              <For each={data.latest?.items ?? []} fallback={<tr><td colspan="6" class="empty">{data.loading ? "Loading…" : "No claims here."}</td></tr>}>
                {(c) => (
                  <tr>
                    <td class="mono">{c.id.slice(0, 8)}</td>
                    <td>{c.visitLabel ? `${c.visitLabel}${c.visitStart ? ` · ${dayTime(c.visitStart)}` : ""}` : "—"}</td>
                    <td>{shortDate(c.createdAt)}</td>
                    <td class="num">{money(c.amountCents)}</td>
                    <td><span class={`status ${c.status}`}>{c.status}</span></td>
                    <td class="actions-cell">
                      <For each={c.next}>{(n) => (
                        <button class={n === "denied" ? "ghost" : "fill"} disabled={busy() === c.id} onClick={() => void move(c.id, n)}>{ACTION[n]}</button>
                      )}</For>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </Show>
      </div>
      <Pager total={data.latest?.total ?? 0} limit={LIMIT} offset={offset()} onPage={setOffset} />
    </section>
  );
}
