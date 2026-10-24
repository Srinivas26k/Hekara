import { createSignal, Show } from "solid-js";
import { avatarColors, initials, safeAvatar } from "../lib";

/**
 * Profile photo when there is one (served from this app's own origin), otherwise coloured initials.
 * If the photo fails to load, the initials appear instead, so there is never a broken image.
 */
export function Avatar(props: { name: string; src?: string | null; class?: string }) {
  const [failed, setFailed] = createSignal(false);
  const src = () => (failed() ? null : safeAvatar(props.src));
  const c = () => avatarColors(props.name);
  return (
    <span class={`av ${props.class ?? ""}`} style={{ background: c().bg, color: c().fg }} aria-hidden="true">
      <Show when={src()} fallback={initials(props.name)}>
        {(url) => <img src={url()} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />}
      </Show>
    </span>
  );
}
