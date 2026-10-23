import { For, Show } from "solid-js";
import type { VisitDto } from "@hekara/core";
import { END, ROW_H, START, fmtClock, fmtRange, hourOf, kindOf, pct, place } from "../lib";
import { store } from "../store";
import { Avatar } from "./Avatar";

const LABELS = Array.from({ length: END - START }, (_, i) => {
  const h = START + i;
  return `${((h + 11) % 12) + 1} ${h >= 12 ? "PM" : "AM"}`;
});
const GRID = Array.from({ length: END - START + 1 }, (_, i) => START + i);

function Shift(props: { v: VisitDto; top: number; open?: boolean }) {
  const pos = () => place(props.v.start, props.v.end);
  const kind = () => kindOf(props.v.status, props.v.start, props.v.end, store.now());
  const clickable = () => props.open && !store.busy().has(props.v.id);
  return (
    <Show when={pos()}>
      {(p) => (
        <div
          class={`shift ${kind()}`}
          classList={{ clickable: clickable() }}
          title={`${props.v.label} · ${fmtRange(props.v.start, props.v.end)}${props.open ? " · click to fill" : ""}`}
          style={{ left: `${p().left}%`, width: `calc(${p().width}% - 4px)`, top: `${props.top}px` }}
          onClick={() => clickable() && void store.fill(props.v.id)}
        >
          {props.v.label}
        </div>
      )}
    </Show>
  );
}

export function Timeline() {
  const nowHour = () => hourOf(store.now());
  const showNow = () => nowHour() >= START && nowHour() <= END;
  return (
    <div class="timeline" aria-label="Day schedule">
      <div class="open-row" />
      <div class="track">
        <div class="hours">
          <For each={LABELS}>{(l, i) => <span style={{ left: `${pct(START + i())}%` }}>{l}</span>}</For>
        </div>
        <For each={GRID}>{(h) => <div class="gridline" style={{ left: `${pct(h)}%` }} />}</For>
      </div>

      <Show when={store.day()}>
        {(d) => (
          <>
            <div class="row-label open-label"><span class="hatch" />Open shifts</div>
            <div class="track"><For each={d().open}>{(v) => <Shift v={v} top={55} open />}</For></div>

            <div class="rows">
              <div class="rows-inner" style={{ height: `${d().rows.length * ROW_H}px` }}>
                <For each={d().rows} fallback={<div class="empty">No visits for this selection</div>}>
                  {(r, i) => (
                    <>
                      <div class="row-label" style={{ top: `${i() * ROW_H}px` }}>
                        <Avatar name={r.name} />
                        {r.name}
                        <Show when={r.flagged}><span class="warn" title="Needs attention" /></Show>
                      </div>
                      <div class="row-track"><For each={r.visits}>{(v) => <Shift v={v} top={i() * ROW_H} />}</For></div>
                    </>
                  )}
                </For>
              </div>
            </div>
          </>
        )}
      </Show>

      <Show when={showNow()}>
        <div class="track now">
          <div class="now-line" style={{ left: `${pct(nowHour())}%` }} />
          <div class="now-pill" style={{ left: `${pct(nowHour())}%` }}>{fmtClock(store.now())}</div>
        </div>
      </Show>
    </div>
  );
}
