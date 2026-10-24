import { onCleanup, onMount, type JSX } from "solid-js";
import { Icon } from "../icons";

/** Accessible dialog: Esc and backdrop close it, focus moves in, focus returns on close. */
export function Modal(props: { title: string; onClose: () => void; children: JSX.Element; wide?: boolean }) {
  let box!: HTMLDivElement;
  const previous = document.activeElement as HTMLElement | null;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") props.onClose();
    if (e.key === "Tab") {
      const f = box.querySelectorAll<HTMLElement>("button, input, textarea, select, [href]");
      if (f.length === 0) return;
      const first = f[0]!,
        last = f[f.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  onMount(() => {
    document.addEventListener("keydown", onKey);
    (box.querySelector<HTMLElement>("input, textarea, button.primary-action") ?? box).focus();
  });
  onCleanup(() => {
    document.removeEventListener("keydown", onKey);
    previous?.focus();
  });
  return (
    <div class="backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div
        class="modal"
        classList={{ wide: props.wide }}
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        tabindex="-1"
        ref={box}
      >
        <header>
          <h2>{props.title}</h2>
          <button class="icon-btn small" aria-label="Close" onClick={props.onClose}>
            <Icon.close />
          </button>
        </header>
        {props.children}
      </div>
    </div>
  );
}
