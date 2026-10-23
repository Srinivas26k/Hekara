import { createSignal, For, Show } from "solid-js";
import { fmtRange, round1 } from "../lib";
import { store } from "../store";
import { Modal } from "./Modal";

export function ReviewModal() {
  const items = () => store.suggestions() ?? [];
  const busy = () => store.busy().has("apply");
  return (
    <Show when={store.suggestions()}>
      <Modal title="AI Copilot suggestions" onClose={() => store.closeReview()} wide>
        <Show when={items().length > 0} fallback={<p class="muted-note">Nothing to review. The schedule looks balanced.</p>}>
          <ul class="suggestions">
            <For each={items()}>
              {(s) => (
                <li>
                  <div>
                    <b>{s.kind === "fill" ? "Fill open shift" : "Move visit"}</b>
                    <span>{s.label} · {fmtRange(s.start, s.end)}</span>
                    <small>
                      {s.kind === "move" ? `${s.fromCaregiverName} → ` : "Assign "}<strong>{s.caregiverName}</strong>
                      {s.hoursSaved > 0 ? ` · saves ${round1(s.hoursSaved)} h overtime` : ""}
                    </small>
                  </div>
                  <button class="fill" disabled={busy()} onClick={() => void store.apply([s.visitId])}>Apply</button>
                </li>
              )}
            </For>
          </ul>
          <footer>
            <button class="ghost" onClick={() => store.closeReview()}>Close</button>
            <button class="primary-action" disabled={busy()} onClick={() => void store.apply().then((ok) => ok && store.closeReview())}>
              {busy() ? "Applying…" : "Apply all"}
            </button>
          </footer>
        </Show>
      </Modal>
    </Show>
  );
}

export function AddPatientModal(props: { onClose: () => void }) {
  const [name, setName] = createSignal("");
  const [dob, setDob] = createSignal("");
  const [address, setAddress] = createSignal("");
  const [notes, setNotes] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const valid = () => name().trim().length > 0;

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!valid() || saving()) return;
    setSaving(true);
    const ok = await store.createPatient({
      name: name().trim(), dob: dob() || undefined, address: address().trim() || undefined, notes: notes().trim() || undefined,
    });
    setSaving(false);
    if (ok) props.onClose();
  }

  return (
    <Modal title="Add a patient" onClose={props.onClose}>
      <form onSubmit={submit}>
        <label>Full name<input required maxlength="120" autocomplete="off" value={name()} onInput={(e) => setName(e.currentTarget.value)} /></label>
        <label>Date of birth<input type="date" value={dob()} onInput={(e) => setDob(e.currentTarget.value)} /></label>
        <label>Address<input maxlength="300" autocomplete="off" value={address()} onInput={(e) => setAddress(e.currentTarget.value)} /></label>
        <label>Notes<textarea maxlength="2000" rows="3" value={notes()} onInput={(e) => setNotes(e.currentTarget.value)} /></label>
        <p class="hint">Stored encrypted. Only your agency can read it.</p>
        <footer>
          <button type="button" class="ghost" onClick={props.onClose}>Cancel</button>
          <button type="submit" class="primary-action" disabled={!valid() || saving()}>{saving() ? "Saving…" : "Add patient"}</button>
        </footer>
      </form>
    </Modal>
  );
}
