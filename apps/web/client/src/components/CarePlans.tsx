import { createEffect, createResource, createSignal, For, onCleanup, Show } from "solid-js";
import type { CarePlanDetailDto, CarePlanStatus, ReviewState, SearchHitDto } from "@hekara/core";
import { api } from "../api";
import { Icon } from "../icons";
import { plainDate } from "../lib";
import { store } from "../store";
import { Modal } from "./Modal";
import { Pager } from "./Pager";

const LIMIT = 25;
type Tab = CarePlanStatus | "all";
const TABS: { key: Tab; label: string }[] = [{ key: "all", label: "All" }, { key: "active", label: "Active" }, { key: "paused", label: "Paused" }, { key: "completed", label: "Completed" }];
const REVIEW: Record<ReviewState, string> = { none: "", overdue: "Review overdue", due7: "Review due soon", ok: "" };

function PatientPicker(props: { onPick: (p: { id: string; name: string }) => void; picked?: string }) {
  const [q, setQ] = createSignal("");
  const [hits, setHits] = createSignal<SearchHitDto[]>([]);
  let seq = 0;
  createEffect(() => {
    const text = q().trim();
    if (text.length < 2) { setHits([]); return; }
    const mine = ++seq;
    const t = setTimeout(async () => { try { const r = await api.search(text); if (mine === seq) setHits(r.filter((h) => h.kind === "patient")); } catch { if (mine === seq) setHits([]); } }, 200);
    onCleanup(() => clearTimeout(t));
  });
  return (
    <div class="picker">
      <label>Patient<input placeholder="Search by name" autocomplete="off" value={props.picked ?? q()} disabled={!!props.picked} onInput={(e) => setQ(e.currentTarget.value)} /></label>
      <Show when={!props.picked && hits().length > 0}>
        <ul class="results inline">
          <For each={hits()}>{(h) => <li onMouseDown={(e) => { e.preventDefault(); props.onPick({ id: h.id, name: h.title }); setQ(""); setHits([]); }}>{h.title}</li>}</For>
        </ul>
      </Show>
    </div>
  );
}

function PlanForm(props: { plan?: CarePlanDetailDto; onClose: () => void }) {
  const p = props.plan;
  const [patient, setPatient] = createSignal<{ id: string; name: string } | null>(p ? { id: p.patientId, name: p.patientName } : null);
  const [title, setTitle] = createSignal(p?.title ?? "");
  const [instructions, setInstructions] = createSignal(p?.instructions ?? "");
  const [tasks, setTasks] = createSignal((p?.tasks ?? []).join("\n"));
  const [status, setStatus] = createSignal<CarePlanStatus>(p?.status ?? "active");
  const [reviewOn, setReviewOn] = createSignal(p?.reviewOn ?? "");
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal("");
  const taskList = () => tasks().split("\n").map((t) => t.trim()).filter(Boolean);

  async function save(e: SubmitEvent) {
    e.preventDefault();
    if (!patient() || !title().trim()) return;
    setSaving(true); setError("");
    try {
      if (p) await api.updateCarePlan(p.id, { title: title().trim(), instructions: instructions().trim() || null, tasks: taskList(), status: status(), reviewOn: reviewOn() || null });
      else await api.createCarePlan({ patientId: patient()!.id, title: title().trim(), instructions: instructions().trim() || undefined, tasks: taskList(), status: status(), reviewOn: reviewOn() || undefined });
      store.toast(p ? "Care plan saved" : "Care plan created");
      props.onClose();
    } catch { setError("Couldn't save. Check the details and try again."); } finally { setSaving(false); }
  }
  return (
    <Modal title={p ? "Care plan" : "New care plan"} onClose={props.onClose} wide>
      <form onSubmit={save}>
        <Show when={p} fallback={<PatientPicker onPick={setPatient} picked={patient()?.name} />}><p class="who"><b>{p!.patientName}</b></p></Show>
        <label>Title<input required maxlength="120" value={title()} onInput={(e) => setTitle(e.currentTarget.value)} /></label>
        <label>Instructions<textarea rows="3" maxlength="2000" value={instructions()} onInput={(e) => setInstructions(e.currentTarget.value)} /></label>
        <label>Tasks (one per line)<textarea rows="4" value={tasks()} onInput={(e) => setTasks(e.currentTarget.value)} /></label>
        <div class="formrow">
          <label>Status<select value={status()} onChange={(e) => setStatus(e.currentTarget.value as CarePlanStatus)}><option value="active">Active</option><option value="paused">Paused</option><option value="completed">Completed</option></select></label>
          <label>Next review<input type="date" value={reviewOn()} onInput={(e) => setReviewOn(e.currentTarget.value)} /></label>
        </div>
        <p class="hint">Stored encrypted. Only your agency can read it.</p>
        <Show when={error()}><p class="error" role="alert">{error()}</p></Show>
        <footer>
          <button type="button" class="ghost" onClick={props.onClose}>Cancel</button>
          <button type="submit" class="primary-action" disabled={saving() || !patient() || !title().trim()}>{saving() ? "Saving…" : "Save"}</button>
        </footer>
      </form>
    </Modal>
  );
}

export function CarePlansPage() {
  const [tab, setTab] = createSignal<Tab>("active");
  const [offset, setOffset] = createSignal(0);
  const [open, setOpen] = createSignal<CarePlanDetailDto | "new" | null>(null);
  const [data, { refetch }] = createResource(() => [tab(), offset(), store.version()] as const, ([t, o]) => api.carePlans({ status: t === "all" ? undefined : t, offset: o, limit: LIMIT }));
  const view = async (id: string) => { try { setOpen(await api.carePlan(id)); } catch { store.toast("Couldn't open that care plan"); } };
  const close = () => { setOpen(null); void refetch(); };
  return (
    <section class="card page">
      <header class="page-head">
        <span class="sched-icon"><Icon.list /></span>
        <h1>Care Plans</h1>
        <span class="sched-sub">{data.latest?.total ?? 0} {tab() === "all" ? "plans" : tab()}</span>
        <button class="primary" onClick={() => setOpen("new")}><Icon.plus />New care plan</button>
      </header>
      <div class="tabs" role="tablist">
        <For each={TABS}>{(t) => <button role="tab" aria-selected={tab() === t.key} classList={{ on: tab() === t.key }} onClick={() => { setTab(t.key); setOffset(0); }}>{t.label}</button>}</For>
      </div>
      <div class="table-wrap">
        <Show when={!data.error} fallback={<p class="empty">Couldn't load care plans.</p>}>
          <table>
            <thead><tr><th>Patient</th><th>Plan</th><th>Tasks</th><th>Status</th><th>Next review</th></tr></thead>
            <tbody>
              <For each={data.latest?.items ?? []} fallback={<tr><td colspan="5" class="empty">{data.loading ? "Loading…" : "No care plans here."}</td></tr>}>
                {(p) => (
                  <tr class="clickable" tabindex="0" onClick={() => void view(p.id)} onKeyDown={(e) => e.key === "Enter" && void view(p.id)}>
                    <td>{p.patientName}</td><td>{p.title}</td><td>{p.taskCount}</td>
                    <td><span class={`status cp-${p.status}`}>{p.status}</span></td>
                    <td>{p.reviewOn ? plainDate(p.reviewOn) : "—"}<Show when={REVIEW[p.review]}><span class={`flag ${p.review}`}>{REVIEW[p.review]}</span></Show></td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </Show>
      </div>
      <Pager total={data.latest?.total ?? 0} limit={LIMIT} offset={offset()} onPage={setOffset} />
      <Show when={open()}>{(o) => <PlanForm plan={o() === "new" ? undefined : (o() as CarePlanDetailDto)} onClose={close} />}</Show>
    </section>
  );
}
