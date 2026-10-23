import { For, Show } from "solid-js";
import { round1 } from "../lib";
import { store } from "../store";
import { Avatar } from "./Avatar";

const dayName = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const dt = new Date(y, m - 1, d);
  return { wd: dt.toLocaleDateString("en-US", { weekday: "short" }), n: d };
};
const todayYmd = () => {
  const n = store.now();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
};

export function WeekGrid() {
  return (
    <div class="timeline week" aria-label="Week schedule">
      <Show when={store.week()}>
        {(w) => (
          <>
            <div class="week-head">
              <span />
              <For each={w().days}>
                {(d) => (
                  <span classList={{ today: d === todayYmd() }}>{dayName(d).wd} <b>{dayName(d).n}</b></span>
                )}
              </For>
            </div>
            <div class="week-body">
              <For each={w().rows} fallback={<div class="empty">No visits this week</div>}>
                {(r) => (
                  <div class="week-row">
                    <div class="row-label static">
                      <Avatar name={r.name} />
                      <span>{r.name}</span>
                      <small classList={{ hot: r.weeklyHours / r.weeklyLimit >= 0.9 }}>{round1(r.weeklyHours)}/{r.weeklyLimit} h</small>
                    </div>
                    <For each={r.days}>
                      {(c) => (
                        <span class="cell" classList={{ empty: c.visits === 0 }}>
                          {c.visits === 0 ? "" : `${c.visits} · ${round1(c.hours)} h`}
                        </span>
                      )}
                    </For>
                  </div>
                )}
              </For>
            </div>
          </>
        )}
      </Show>
    </div>
  );
}
