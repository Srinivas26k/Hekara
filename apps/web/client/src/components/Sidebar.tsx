import { createSignal, For, Show, type JSX } from "solid-js";
import { Icon } from "../icons";
import { store } from "../store";
import { Avatar } from "./Avatar";

function Section(props: { title: string; children: JSX.Element }) {
  const [open, setOpen] = createSignal(true);
  return (
    <>
      <button class="section-head" classList={{ collapsed: !open() }} aria-expanded={open()} onClick={() => setOpen(!open())}>
        <span>{props.title}</span><Icon.chevUp />
      </button>
      <Show when={open()}>{props.children}</Show>
    </>
  );
}

export function Sidebar(props: { onAddPatient: () => void }) {
  const o = () => store.overview();
  const soon = (name: string) => store.toast(`${name} is not available yet`);
  const Item = (p: { icon: () => JSX.Element; label: string; badge?: number; active?: boolean }) => (
    <button class="nav-item" classList={{ active: p.active }} aria-current={p.active ? "page" : undefined} onClick={() => !p.active && soon(p.label)}>
      {p.icon()}{p.label}
      <Show when={(p.badge ?? 0) > 0}><b class="badge">{p.badge}</b></Show>
    </button>
  );
  return (
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-mark"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="#ffe23d" stroke-width="4.2" stroke-linecap="round" /></svg></span>
        <span class="brand-name">Hekara</span>
      </div>

      <div class="side-scroll">
      <Section title="MENU">
        <nav class="nav" id="menu">
          <Item icon={Icon.grid} label="Overview" />
          <Item icon={Icon.users} label="Patients" badge={o()?.badges.patients} />
          <Item icon={Icon.steth} label="Caregivers" />
          <Item icon={Icon.cal} label="Schedule" badge={o()?.badges.schedule} active />
          <Item icon={Icon.house} label="Visits" />
          <Item icon={Icon.list} label="Care Plans" />
          <Item icon={Icon.spark} label="AI Copilot" />
        </nav>
      </Section>

      <Section title="BUSINESS">
        <nav class="nav" id="business">
          <Item icon={Icon.receipt} label="Billing & Claims" badge={o()?.badges.claims} />
          <Item icon={Icon.shield} label="Compliance" />
          <Item icon={Icon.chart} label="Reports" />
        </nav>
      </Section>

      <Section title="ON SHIFT NOW">
        <div class="onshift">
          <div class="onshift-row"><span>Caregivers</span><span class="chip">{o()?.onShift.count ?? 0} of {o()?.onShift.total ?? 0}</span></div>
          <div class="stack">
            <For each={o()?.onShift.avatars ?? []}>{(p) => <Avatar name={p.name} />}</For>
            <Show when={(o()?.onShift.count ?? 0) > 4}><span class="more">+{(o()?.onShift.count ?? 0) - 4}</span></Show>
          </div>
        </div>
      </Section>

      <nav class="nav small">
        <Item icon={Icon.gear} label="Settings" />
        <Item icon={Icon.user} label="Team & Permissions" />
      </nav>
      </div>

      <div class="add-patient">
        <button class="add-btn" aria-label="Add a patient" onClick={props.onAddPatient}><Icon.plus /></button>
        <div class="add-title">Add a patient</div>
        <div class="add-sub">Or <button class="link" onClick={() => store.toast("Referral import is not available yet")}>import a referral</button></div>
      </div>
    </aside>
  );
}
