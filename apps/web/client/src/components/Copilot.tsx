import { For, Show } from "solid-js";
import { Icon } from "../icons";
import { copilotCopy, fmtRange, round1 } from "../lib";
import { store } from "../store";

export function CopilotPage() {
  const s = () => store.overview()?.suggestions;
  const copy = () => copilotCopy(s()?.count ?? 0, s()?.hoursSaved ?? 0, s()?.shiftsFilled ?? 0);
  const busy = () => store.busy().has("apply");
  const apply = async (ids?: string[]) => {
    await store.apply(ids);
    store.closeReview();
  };
  return (
    <section class="card page">
      <header class="page-head">
        <span class="sched-icon">
          <Icon.spark />
        </span>
        <h1>AI Copilot</h1>
        <span class="sched-sub">{copy().title}</span>
        <button
          class="primary"
          disabled={store.busy().has("optimize")}
          onClick={() => void store.optimize().then(() => store.closeReview())}
        >
          <Icon.spark />
          {store.busy().has("optimize") ? "Optimizing…" : "Recompute"}
        </button>
      </header>
      <div class="copilot-page">
        <div class="tiles">
          <div class="tile">
            <b>{s()?.count ?? 0}</b>
            <span>suggestions</span>
          </div>
          <div class="tile">
            <b>{s()?.shiftsFilled ?? 0}</b>
            <span>open shifts it can fill</span>
          </div>
          <div class="tile">
            <b>{round1(s()?.hoursSaved ?? 0)} h</b>
            <span>overtime it can avoid</span>
          </div>
        </div>

        <div class="panel-card">
          <div class="panel-title">
            <h3>Suggestions</h3>
            <Show when={(s()?.count ?? 0) > 1}>
              <button class="primary-action" disabled={busy()} onClick={() => void apply()}>
                {busy() ? "Applying…" : "Apply all"}
              </button>
            </Show>
          </div>
          <ul class="suggestions">
            <For each={s()?.items ?? []} fallback={<li class="muted-note">{copy().body}</li>}>
              {(i) => (
                <li>
                  <div>
                    <b>{i.kind === "fill" ? "Fill open shift" : "Move visit"}</b>
                    <span>
                      {i.label} · {fmtRange(i.start, i.end)}
                    </span>
                    <small>
                      {i.kind === "move" ? `${i.fromCaregiverName} → ` : "Assign "}
                      <strong>{i.caregiverName}</strong>
                      {i.hoursSaved > 0 ? ` · saves ${round1(i.hoursSaved)} h overtime` : ""}
                    </small>
                  </div>
                  <button class="fill" disabled={busy()} onClick={() => void apply([i.visitId])}>
                    Apply
                  </button>
                </li>
              )}
            </For>
          </ul>
        </div>

        <div class="panel-card">
          <h3>How it decides</h3>
          <p class="muted-note">
            Copilot uses fixed, explainable rules. It never sends patient details anywhere, and it only suggests: nothing changes
            until you apply it.
          </p>
          <ol class="rules">
            <li>
              <b>Fill open shifts.</b> It picks a caregiver with the right skill, no overlapping visit, and room left in their
              40-hour week, preferring the one with the fewest hours so far.
            </li>
            <li>
              <b>Avoid overtime.</b> If someone's remaining visits would take them past their weekly limit, it moves a visit to a
              caregiver who has room.
            </li>
            <li>
              <b>Always checked again on apply.</b> Suggestions are recomputed on the server when you apply them, so a stale
              suggestion is rejected rather than applied.
            </li>
          </ol>
        </div>
      </div>
    </section>
  );
}
