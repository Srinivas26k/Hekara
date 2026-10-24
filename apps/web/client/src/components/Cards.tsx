import { For, Show } from "solid-js";
import { Icon } from "../icons";
import { copilotCopy, fmtRange, round1 } from "../lib";
import { store } from "../store";
import { Avatar } from "./Avatar";

export function Copilot() {
  const copy = () => {
    const s = store.overview()?.suggestions;
    return copilotCopy(s?.count ?? 0, s?.hoursSaved ?? 0, s?.shiftsFilled ?? 0);
  };
  return (
    <section class="copilot">
      <span class="pill">
        <Icon.spark />
        AI Copilot
      </span>
      <h2>{copy().title}</h2>
      <p>{copy().body}</p>
      <button class="review" onClick={() => store.openReview()}>
        Review all
      </button>
    </section>
  );
}

export function OpenShifts() {
  const list = () => store.overview()?.openShifts ?? [];
  return (
    <section class="card mini">
      <div class="mini-head">
        <Icon.userPlus />
        <h3>Open shifts</h3>
        <span class="chip">{list().length} today</span>
      </div>
      <For each={list()} fallback={<p class="muted-note">Every shift is covered.</p>}>
        {(v) => (
          <div class="os">
            <span class="hatch" />
            <div>
              <b>{v.label}</b>
              <small>
                {fmtRange(v.start, v.end)}
                {v.requirement ? ` · ${v.requirement === "HHA" ? "Needs HHA" : v.requirement}` : ""}
              </small>
            </div>
            <button class="fill" disabled={store.busy().has(v.id)} onClick={() => void store.fill(v.id)}>
              {store.busy().has(v.id) ? "Filling…" : "Fill"}
            </button>
          </div>
        )}
      </For>
    </section>
  );
}

export function OvertimeWatch() {
  const list = () => store.overview()?.overtime ?? [];
  return (
    <section class="card mini">
      <div class="mini-head">
        <Icon.clock />
        <h3>Overtime watch</h3>
      </div>
      <For each={list()} fallback={<p class="muted-note">Nobody is near their weekly limit.</p>}>
        {(p) => (
          <div class="ot">
            <Avatar name={p.name} src={p.avatarUrl} />
            <div class="ot-body">
              <div class="ot-top">
                <b>{p.name}</b>
                <span>
                  {round1(p.hours)} of {p.limit} h
                </span>
              </div>
              <div class="bar" role="progressbar" aria-valuenow={Math.round(p.ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
                <span style={{ width: `${Math.min(100, p.ratio * 100)}%` }} />
              </div>
            </div>
          </div>
        )}
      </For>
      <Show when={list().length > 4}>
        <div class="muted-note">Showing the most loaded caregivers first.</div>
      </Show>
    </section>
  );
}
