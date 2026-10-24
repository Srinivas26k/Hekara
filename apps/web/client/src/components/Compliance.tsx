import { createResource, createSignal, For, Show } from "solid-js";
import type { CredentialStatus } from "@hekara/core";
import { api } from "../api";
import { Icon } from "../icons";
import { plainDate } from "../lib";
import { store } from "../store";
import { Modal } from "./Modal";

type Filter = CredentialStatus | "all";
const TILES: { key: CredentialStatus; label: string; cls: string }[] = [
  { key: "expired", label: "Expired", cls: "bad" }, { key: "due30", label: "Due within 30 days", cls: "warn" },
  { key: "due90", label: "Due within 90 days", cls: "" }, { key: "valid", label: "Valid", cls: "good" },
];
const COMMON = ["CPR / First Aid", "TB test", "Background check", "HHA certification", "Driver's licence", "Flu shot"];
const left = (d: number) => (d < 0 ? `${-d} ${-d === 1 ? "day" : "days"} ago` : d === 0 ? "today" : `in ${d} ${d === 1 ? "day" : "days"}`);

function AddForm(props: { caregivers: { id: string; name: string }[]; onClose: () => void }) {
  const [caregiverId, setCaregiverId] = createSignal("");
  const [kind, setKind] = createSignal("");
  const [issuedOn, setIssuedOn] = createSignal("");
  const [expiresOn, setExpiresOn] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  async function save(e: SubmitEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      await api.addCredential({ caregiverId: caregiverId(), kind: kind().trim(), issuedOn: issuedOn() || undefined, expiresOn: expiresOn() });
      store.toast("Credential added"); props.onClose();
    } catch { setError("Couldn't save. Check that the expiry is after the issue date."); } finally { setBusy(false); }
  }
  return (
    <Modal title="Add a credential" onClose={props.onClose}>
      <form onSubmit={save}>
        <label>Caregiver<select required value={caregiverId()} onChange={(e) => setCaregiverId(e.currentTarget.value)}><option value="">Choose…</option><For each={props.caregivers}>{(c) => <option value={c.id}>{c.name}</option>}</For></select></label>
        <label>Credential<input required list="cred-kinds" maxlength="60" value={kind()} onInput={(e) => setKind(e.currentTarget.value)} /><datalist id="cred-kinds"><For each={COMMON}>{(k) => <option value={k} />}</For></datalist></label>
        <div class="formrow">
          <label>Issued<input type="date" value={issuedOn()} onInput={(e) => setIssuedOn(e.currentTarget.value)} /></label>
          <label>Expires<input type="date" required value={expiresOn()} onInput={(e) => setExpiresOn(e.currentTarget.value)} /></label>
        </div>
        <p class="hint">Record the type and dates only. Don't enter licence or ID numbers.</p>
        <Show when={error()}><p class="error" role="alert">{error()}</p></Show>
        <footer><button type="button" class="ghost" onClick={props.onClose}>Cancel</button><button class="primary-action" type="submit" disabled={busy() || !caregiverId() || !kind().trim() || !expiresOn()}>{busy() ? "Saving…" : "Add"}</button></footer>
      </form>
    </Modal>
  );
}

export function CompliancePage() {
  const [filter, setFilter] = createSignal<Filter>("all");
  const [adding, setAdding] = createSignal(false);
  const [data, { refetch }] = createResource(() => store.version(), () => api.compliance());
  const d = () => data.latest;
  const rows = () => (d()?.items ?? []).filter((i) => filter() === "all" || i.status === filter());
  const isAdmin = () => store.me()?.role === "admin";
  async function remove(id: string) {
    try { await api.removeCredential(id); store.toast("Credential removed"); await refetch(); } catch { store.toast("Couldn't remove that credential"); }
  }
  return (
    <section class="card page">
      <header class="page-head">
        <span class="sched-icon"><Icon.shield /></span>
        <h1>Compliance</h1>
        <span class="sched-sub">Caregiver credentials</span>
        <button class="primary" onClick={() => setAdding(true)}><Icon.plus />Add credential</button>
      </header>
      <div class="tiles">
        <For each={TILES}>{(t) => (
          <button class={`tile ${t.cls}`} classList={{ on: filter() === t.key }} onClick={() => setFilter(filter() === t.key ? "all" : t.key)} aria-pressed={filter() === t.key}>
            <b>{d()?.counts[t.key] ?? 0}</b><span>{t.label}</span>
          </button>
        )}</For>
      </div>
      <div class="table-wrap">
        <Show when={!data.error} fallback={<p class="empty">Couldn't load credentials.</p>}>
          <table>
            <thead><tr><th>Caregiver</th><th>Credential</th><th>Expires</th><th>Status</th><th /></tr></thead>
            <tbody>
              <For each={rows()} fallback={<tr><td colspan="5" class="empty">{data.loading ? "Loading…" : "No credentials match."}</td></tr>}>
                {(c) => (
                  <tr>
                    <td>{c.caregiverName}</td><td>{c.kind}</td>
                    <td>{plainDate(c.expiresOn)}</td>
                    <td><span class={`status cr-${c.status}`}>{c.status === "expired" ? "Expired" : c.status === "due30" ? "Due soon" : c.status === "due90" ? "Due in 90 days" : "Valid"}</span><small class="when"> {left(c.daysLeft)}</small></td>
                    <td class="actions-cell"><Show when={isAdmin()}><button class="ghost" onClick={() => void remove(c.id)}>Remove</button></Show></td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </Show>
      </div>
      <Show when={adding()}><AddForm caregivers={d()?.caregivers ?? []} onClose={() => { setAdding(false); void refetch(); }} /></Show>
    </section>
  );
}
