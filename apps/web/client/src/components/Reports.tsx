import { createResource, createSignal, For, Show } from "solid-js";
import { api } from "../api";
import { Icon } from "../icons";
import { money, round1 } from "../lib";
import { store } from "../store";

const RANGES = [7, 14, 30] as const;
const short = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export function ReportsPage() {
  const [days, setDays] = createSignal<number>(7);
  const [data] = createResource(
    () => [days(), store.version()] as const,
    ([n]) => api.reports(n, store.pinned),
  );
  const r = () => data.latest;
  const staff = () => store.isStaff();
  const csv = () => `/api/reports/hours.csv?days=${days()}${store.pinned ? `&at=${store.pinned}` : ""}`;
  return (
    <section class="card page">
      <header class="page-head">
        <span class="sched-icon">
          <Icon.chart />
        </span>
        <h1>Reports</h1>
        <span class="sched-sub">{r() ? `${short(r()!.from)} to ${short(r()!.to)}` : ""}</span>
        <div class="seg" role="tablist" aria-label="Range">
          <For each={RANGES}>
            {(n) => (
              <button role="tab" aria-selected={days() === n} classList={{ on: days() === n }} onClick={() => setDays(n)}>
                {n} days
              </button>
            )}
          </For>
        </div>
        <Show when={staff()}>
          <a class="primary as-link" href={csv()} download="caregiver-hours.csv">
            Export CSV
          </a>
        </Show>
      </header>
      <Show when={!data.error} fallback={<p class="empty">Couldn't load reports.</p>}>
        <div class="report-body">
          <Show when={r()?.fill}>
            {(f) => (
              <div class="tiles">
                <div class="tile">
                  <b>{f().total}</b>
                  <span>visits</span>
                </div>
                <div class="tile">
                  <b>{f().rate}%</b>
                  <span>filled ({f().open} open)</span>
                </div>
                <div class="tile">
                  <b>{round1((r()?.perDay ?? []).reduce((n, d) => n + d.hours, 0))} h</b>
                  <span>scheduled</span>
                </div>
                <div class="tile warn">
                  <b>{(r()?.hours ?? []).filter((h) => h.overtimeRisk).length}</b>
                  <span>at overtime risk</span>
                </div>
              </div>
            )}
          </Show>
          <Show when={r()?.perDay}>
            {(pd) => (
              <div class="panel-card">
                <h3>Visits per day</h3>
                <div class="week-chart tall">
                  <For each={pd()}>
                    {(d) => {
                      const max = Math.max(1, ...pd().map((x) => x.visits));
                      return (
                        <div class="bar-col" title={`${d.visits} visits, ${d.hours} h`}>
                          <span class="bar-num">{d.visits}</span>
                          <div class="bar-track">
                            <span class="bar-fill" style={{ height: `${(d.visits / max) * 100}%` }} />
                          </div>
                          <span class="bar-label">{short(d.date).replace(" ", " ")}</span>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </div>
            )}
          </Show>
          <Show when={r()?.hours}>
            {(h) => (
              <div class="panel-card">
                <h3>Caregiver hours</h3>
                <div class="table-wrap short">
                  <table>
                    <thead>
                      <tr>
                        <th>Caregiver</th>
                        <th class="num">Visits</th>
                        <th class="num">Scheduled</th>
                        <th>Week so far</th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={h()}>
                        {(c) => (
                          <tr>
                            <td>{c.name}</td>
                            <td class="num">{c.visits}</td>
                            <td class="num">{c.scheduledHours} h</td>
                            <td>
                              <div class="mini-bar">
                                <span
                                  classList={{ hot: c.overtimeRisk }}
                                  style={{ width: `${Math.min(100, (c.weeklyHours / c.weeklyLimit) * 100)}%` }}
                                />
                              </div>
                              <small class="when">
                                {round1(c.weeklyHours)} of {c.weeklyLimit} h
                              </small>
                            </td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Show>
          <Show when={r()?.claims}>
            {(c) => (
              <div class="panel-card">
                <h3>Claims</h3>
                <table>
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th class="num">Claims</th>
                      <th class="num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={["draft", "submitted", "paid", "denied"] as const}>
                      {(s) => (
                        <tr>
                          <td>
                            <span class={`status ${s}`}>{s}</span>
                          </td>
                          <td class="num">{c().counts[s]}</td>
                          <td class="num">{money(c().amountCents[s])}</td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            )}
          </Show>
        </div>
      </Show>
    </section>
  );
}
