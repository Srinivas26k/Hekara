import { For } from "solid-js";
import { store } from "../store";

export function Toasts() {
  return (
    <div class="toasts" role="status" aria-live="polite">
      <For each={store.toasts()}>
        {(t) => (
          <div class="toast">
            <span>{t.message}</span>
            {t.undo ? (
              <button
                onClick={() => {
                  t.undo!();
                  store.dismissToast(t.id);
                }}
              >
                Undo
              </button>
            ) : null}
          </div>
        )}
      </For>
    </div>
  );
}
