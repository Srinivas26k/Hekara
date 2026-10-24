import { createResource, For, Show } from "solid-js";
import type { DashboardDto } from "@hekara/core";
import { api } from "../api";
import { Icon } from "../icons";
import { dayTime, longDate, money, plural } from "../lib";
import { router } from "../router";
import { store } from "../store";

const STATUS_BARS: { key: keyof DashboardDto["today"]["byStatus"]; label: string; cls: string }[] = [
  { key: "done", label: "Done", cls: "done" },
  { key: "in_progress", label: "In progress", cls: "prog" },
  { key: "scheduled", label: "Scheduled", cls: "sched" },
  { key: "attention", label: "Needs attention", cls: "attn" },
  { key: "open", label: "Open", cls: "open" },
];
const WEEKDAY = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short" });
};

function Kpi(props: { label: string; value: string | number; hint?: string; tone?: "warn" | "bad"; onClick?: () => void }) {
  const inner = (
    <>
      <span class="kpi-label">{props.label}</span>
      <b class="kpi-value" classList={{ warn: props.tone === "warn", bad: props.tone === "bad" }}>
        {props.value}
      </b>
      <Show when={props.hint}>
        <span class="kpi-hint">{props.hint}</span>
      </Show>
    </>
  );
  return props.onClick ? (
    <button class="kpi" onClick={props.onClick}>
      {inner}
    </button>
  ) : (
    <div class="kpi">{inner}</div>
  );
}

export function OverviewPage() {
  const [data] = createResource(
    () => store.version(),
    () => api.dashboard(store.pinned),
  );
  const d = () => data.latest;
  return (
    <section class="card page">
      <header class="page-head">
        <span class="sched-icon">
          <Icon.grid />
        </span>
        <h1>Overview</h1>
        <span class="sched-sub">{d() ? longDate(d()!.date) : ""}</span>
      </header>
      <Show when={!data.error} fallback={<p class="empty">Couldn't load the overview.</p>}>
        <Show when={d()} fallback={<p class="empty">Loading…</p>}>
          {(x) => (
            <div class="overview">
              <div class="kpis">
                <Kpi
                  label="Visits today"
                  value={x().today.visits}
                  hint={`${x().today.hours} scheduled hours`}
                  onClick={() => router.go("visits")}
                />
                <Kpi
                  label="On shift now"
                  value={`${x().onShift.count} of ${x().onShift.total}`}
                  hint="caregivers"
                  onClick={() => router.go("schedule")}
                />
                <Kpi
                  label="Open shifts"
                  value={x().openShifts}
                  hint={x().openShifts ? "need a caregiver" : "all covered"}
                  tone={x().openShifts ? "warn" : undefined}
                  onClick={() => router.go("visits")}
                />
                <Kpi
                  label="Overtime risk"
                  value={x().overtimeRisk}
                  hint={x().overtimeRisk ? "near the weekly limit" : "nobody close"}
                  tone={x().overtimeRisk ? "warn" : undefined}
                  onClick={() => router.go("copilot")}
                />
                <Kpi
                  label="Copilot"
                  value={x().suggestions}
                  hint={x().suggestions ? `${plural(x().suggestions, "suggestion")} ready` : "all caught up"}
                  onClick={() => router.go("copilot")}
                />
              </div>

              <div class="overview-grid">
                <div class="panel-card">
                  <h3>Today's visits</h3>
                  <div
                    class="stack-bar"
                    role="img"
                    aria-label={STATUS_BARS.map((b) => `${b.label} ${x().today.byStatus[b.key]}`).join(", ")}
                  >
                    <For each={STATUS_BARS}>
                      {(b) => (
                        <Show when={x().today.byStatus[b.key] > 0}>
                          <span class={`seg-${b.cls}`} style={{ flex: String(x().today.byStatus[b.key]) }} />
                        </Show>
                      )}
                    </For>
                  </div>
                  <ul class="legend-list">
                    <For each={STATUS_BARS}>
                      {(b) => (
                        <li>
                          <i class={`lg ${b.cls}`} />
                          {b.label}
                          <b>{x().today.byStatus[b.key]}</b>
                        </li>
                      )}
                    </For>
                  </ul>
                </div>

                <div class="panel-card">
                  <h3>This week</h3>
                  <div class="week-chart">
                    <For each={x().week}>
                      {(w) => {
                        const max = Math.max(1, ...x().week.map((v) => v.visits));
                        return (
                          <div
                            class="bar-col"
                            classList={{ today: w.date === x().date }}
                            title={`${w.visits} visits, ${w.open} open`}
                          >
                            <span class="bar-num">{w.visits}</span>
                            <div class="bar-track">
                              <span class="bar-fill" style={{ height: `${(w.visits / max) * 100}%` }}>
                                <Show when={w.open > 0}>
                                  <span class="bar-open" style={{ height: `${(w.open / w.visits) * 100}%` }} />
                                </Show>
                              </span>
                            </div>
                            <span class="bar-label">{WEEKDAY(w.date)}</span>
                          </div>
                        );
                      }}
                    </For>
                  </div>
                </div>

                <div class="panel-card">
                  <h3>Needs attention</h3>
                  <ul class="alerts">
                    <For each={x().attention}>
                      {(a) => (
                        <li>
                          <span class="dot-red" />
                          {a.label}
                          <small>
                            {a.caregiverName ?? "Unassigned"} · {dayTime(a.start)}
                          </small>
                        </li>
                      )}
                    </For>
                    <Show when={x().openShifts > 0}>
                      <li>
                        <button class="link" onClick={() => router.go("visits")}>
                          <span class="dot-orange" />
                          {plural(x().openShifts, "open shift")} to fill
                        </button>
                      </li>
                    </Show>
                    <Show when={x().compliance.expired > 0}>
                      <li>
                        <button class="link" onClick={() => router.go("compliance")}>
                          <span class="dot-red" />
                          {plural(x().compliance.expired, "expired credential")}
                        </button>
                      </li>
                    </Show>
                    <Show when={x().compliance.due30 > 0}>
                      <li>
                        <button class="link" onClick={() => router.go("compliance")}>
                          <span class="dot-orange" />
                          {plural(x().compliance.due30, "credential")} expiring within 30 days
                        </button>
                      </li>
                    </Show>
                    <Show when={x().carePlans.overdue > 0}>
                      <li>
                        <button class="link" onClick={() => router.go("careplans")}>
                          <span class="dot-orange" />
                          {plural(x().carePlans.overdue, "care plan")} overdue for review
                        </button>
                      </li>
                    </Show>
                    <Show
                      when={
                        x().attention.length +
                          x().openShifts +
                          x().compliance.expired +
                          x().compliance.due30 +
                          x().carePlans.overdue ===
                        0
                      }
                    >
                      <li class="muted-note">Nothing needs attention right now.</li>
                    </Show>
                  </ul>
                </div>

                <Show when={x().claims}>
                  {(c) => (
                    <div class="panel-card">
                      <h3>Billing</h3>
                      <p class="big">{money(c().outstandingCents)}</p>
                      <p class="muted-note">
                        outstanding across {c().draft} draft and {c().submitted} submitted claims
                      </p>
                      <button class="ghost" onClick={() => router.go("billing")}>
                        Open billing
                      </button>
                    </div>
                  )}
                </Show>
              </div>
            </div>
          )}
        </Show>
      </Show>
    </section>
  );
}
