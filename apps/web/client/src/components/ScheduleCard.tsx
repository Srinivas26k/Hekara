import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { Icon } from "../icons";
import { longDate, plural } from "../lib";
import { store } from "../store";
import { Avatar } from "./Avatar";
import { Timeline } from "./Timeline";
import { WeekGrid } from "./WeekGrid";

export function ScheduleCard() {
  const [menu, setMenu] = createSignal(false);
  const close = () => setMenu(false);
  onMount(() => document.addEventListener("click", close));
  onCleanup(() => document.removeEventListener("click", close));
  const sub = () => {
    const o = store.overview();
    return o ? `${longDate(o.date)} · ${plural(o.visitCount, "visit")}` : "";
  };

  return (
    <section class="schedule card">
      <div class="sched-head">
        <span class="sched-icon">
          <Icon.cal />
        </span>
        <h1>Schedule</h1>
        <span class="sched-sub">{sub()}</span>
        <div class="seg" role="tablist" aria-label="View">
          <button
            role="tab"
            aria-selected={store.view() === "day"}
            classList={{ on: store.view() === "day" }}
            onClick={() => store.setView("day")}
          >
            Day
          </button>
          <button
            role="tab"
            aria-selected={store.view() === "week"}
            classList={{ on: store.view() === "week" }}
            onClick={() => store.setView("week")}
          >
            Week
          </button>
        </div>
        <div class="menu-wrap" onClick={(e) => e.stopPropagation()}>
          <button class="select" aria-haspopup="listbox" aria-expanded={menu()} onClick={() => setMenu(!menu())}>
            {store.filter()?.name ?? "All caregivers"} <Icon.chevDown />
          </button>
          <Show when={menu()}>
            <div class="dropdown scroll" role="listbox">
              <button
                class="item"
                role="option"
                onClick={() => {
                  close();
                  store.setFilter(null);
                }}
              >
                All caregivers
              </button>
              <For each={store.everyone()}>
                {(p) => (
                  <button
                    class="item"
                    role="option"
                    onClick={() => {
                      close();
                      store.setFilter(p);
                    }}
                  >
                    <Avatar name={p.name} src={p.avatarUrl} class="tiny" />
                    {p.name}
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>
        <button class="primary" disabled={store.busy().has("optimize")} onClick={() => void store.optimize()}>
          <Icon.spark />
          {store.busy().has("optimize") ? "Optimizing…" : "Optimize"}
        </button>
      </div>

      <Show when={store.view() === "day"} fallback={<WeekGrid />}>
        <Timeline />
      </Show>

      <div class="legend">
        <span>
          <i class="lg done" />
          Done
        </span>
        <span>
          <i class="lg prog" />
          In progress
        </span>
        <span>
          <i class="lg sched" />
          Scheduled
        </span>
        <span>
          <i class="lg attn" />
          Needs attention
        </span>
        <span>
          <i class="lg open" />
          Open shift
        </span>
        <span>
          <i class="lg ai" />
          AI suggestion
        </span>
      </div>
    </section>
  );
}
