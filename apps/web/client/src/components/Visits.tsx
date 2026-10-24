import { createResource, createSignal, For, Show } from "solid-js";
import type { VisitStatus } from "@hekara/core";
import { api } from "../api";
import { Icon } from "../icons";
import { fmtRange, longDate } from "../lib";
import { store } from "../store";
import { Pager } from "./Pager";

const LIMIT = 25;
type Filter = Exclude<VisitStatus, "ai_suggestion"> | "all";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "in_progress", label: "In progress" },
  { key: "scheduled", label: "Scheduled" },
  { key: "done", label: "Done" },
  { key: "attention", label: "Needs attention" },
  { key: "open", label: "Open" },
];
const LABEL: Record<string, string> = {
  done: "Done",
  in_progress: "In progress",
  scheduled: "Scheduled",
  attention: "Needs attention",
  open: "Open",
};
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const shift = (s: string, n: number) => {
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  return ymd(new Date(y, m - 1, d + n));
};

export function VisitsPage() {
  const [date, setDate] = createSignal(ymd(new Date()));
  const [filter, setFilter] = createSignal<Filter>("all");
  const [offset, setOffset] = createSignal(0);
  const [data] = createResource(
    () => [date(), filter(), offset(), store.version()] as const,
    ([dt, f, o]) => api.visits({ date: dt, status: f === "all" ? undefined : f, offset: o, limit: LIMIT, at: store.pinned }),
  );
  const counts = () => data.latest?.counts;
  const go = (n: number) => {
    setDate(shift(date(), n));
    setOffset(0);
  };

  return (
    <section class="card page">
      <header class="page-head">
        <span class="sched-icon">
          <Icon.house />
        </span>
        <h1>Visits</h1>
        <span class="sched-sub">
          {longDate(date())} · {counts()?.all ?? 0} visits
        </span>
        <div class="date-nav">
          <button class="ghost" aria-label="Previous day" onClick={() => go(-1)}>
            ‹
          </button>
          <button
            class="ghost"
            onClick={() => {
              setDate(ymd(new Date()));
              setOffset(0);
            }}
          >
            Today
          </button>
          <button class="ghost" aria-label="Next day" onClick={() => go(1)}>
            ›
          </button>
        </div>
      </header>
      <div class="tabs" role="tablist">
        <For each={FILTERS}>
          {(f) => (
            <button
              role="tab"
              aria-selected={filter() === f.key}
              classList={{ on: filter() === f.key }}
              onClick={() => {
                setFilter(f.key);
                setOffset(0);
              }}
            >
              {f.label}
              <span class="count">{counts()?.[f.key] ?? 0}</span>
            </button>
          )}
        </For>
      </div>
      <div class="table-wrap">
        <Show when={!data.error} fallback={<p class="empty">Couldn't load visits.</p>}>
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Patient</th>
                <th>Caregiver</th>
                <th>Needs</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <For
                each={data.latest?.items ?? []}
                fallback={
                  <tr>
                    <td colspan="6" class="empty">
                      {data.loading ? "Loading…" : "No visits match."}
                    </td>
                  </tr>
                }
              >
                {(v) => (
                  <tr>
                    <td class="nowrap">{fmtRange(v.start, v.end)}</td>
                    <td>{v.label}</td>
                    <td>{v.caregiverName ?? <span class="muted-note">Unassigned</span>}</td>
                    <td>{v.requirement ?? "—"}</td>
                    <td>
                      <span class={`status v-${v.status}`}>{LABEL[v.status]}</span>
                    </td>
                    <td class="actions-cell">
                      <Show when={v.status === "open"}>
                        <button class="fill" disabled={store.busy().has(v.id)} onClick={() => void store.fill(v.id)}>
                          {store.busy().has(v.id) ? "Filling…" : "Fill"}
                        </button>
                      </Show>
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
