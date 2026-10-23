import { avatarColors, initials } from "../lib";

/** Initials avatar. Same-origin only: no external images are ever requested. */
export function Avatar(props: { name: string; class?: string }) {
  const c = () => avatarColors(props.name);
  return (
    <span class={`av ${props.class ?? ""}`} style={{ background: c().bg, color: c().fg }} aria-hidden="true">
      {initials(props.name)}
    </span>
  );
}
