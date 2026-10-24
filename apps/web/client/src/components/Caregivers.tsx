import { createResource, For, Show } from "solid-js";
import { api } from "../api";
import { Icon } from "../icons";
import { dayTime, round1 } from "../lib";
import { router } from "../router";
import { store } from "../store";
import { Avatar } from "./Avatar";

export function CaregiversPage() {
  const [data] = createResource(
    () => store.version(),
    () => api.caregivers(store.pinned),
  );
  const list = () => data.latest ?? [];
  return (
    <section class="card page">
      <header class="page-head">
        <span class="sched-icon">
          <Icon.steth />
        </span>
        <h1>Caregivers</h1>
        <span class="sched-sub">{list().length} on your team</span>
      </header>
      <Show when={!data.error} fallback={<p class="empty">Couldn't load caregivers.</p>}>
        <div class="cards">
          <For each={list()} fallback={<p class="empty">{data.loading ? "Loading…" : "No caregivers yet."}</p>}>
            {(c) => {
              const ratio = () => c.weeklyHours / c.weeklyLimit;
              return (
                <button
                  class="person-card"
                  onClick={() => {
                    store.setFilter({ id: c.id, name: c.name, avatarUrl: null });
                    store.setView("day");
                    router.go("schedule");
                  }}
                  title="Open their schedule"
                >
                  <div class="person-top">
                    <Avatar name={c.name} src={c.avatarUrl} />
                    <b>{c.name}</b>
                    <Show when={c.flagged}>
                      <span class="warn" title="Needs attention" />
                    </Show>
                  </div>
                  <div class="skills">
                    <For each={c.skills}>{(s) => <span class="chip">{s}</span>}</For>
                  </div>
                  <div class="ot-top">
                    <span>This week</span>
                    <span classList={{ hot: ratio() >= 0.9 }}>
                      {round1(c.weeklyHours)} of {c.weeklyLimit} h
                    </span>
                  </div>
                  <div class="bar">
                    <span style={{ width: `${Math.min(100, ratio() * 100)}%` }} />
                  </div>
                  <p class="today">
                    Today:{" "}
                    {c.todayVisits === 0
                      ? "no visits"
                      : `${c.todayVisits} ${c.todayVisits === 1 ? "visit" : "visits"} · ${round1(c.todayHours)} h`}
                  </p>
                  <p class="next">
                    {c.nextVisit ? `Next: ${c.nextVisit.label}, ${dayTime(c.nextVisit.start)}` : "Nothing else today"}
                  </p>
                </button>
              );
            }}
          </For>
        </div>
      </Show>
    </section>
  );
}
