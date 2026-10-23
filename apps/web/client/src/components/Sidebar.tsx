import { createSignal, For, Show, type JSX } from "solid-js";
import { Icon } from "../icons";
import { router, type Route } from "../router";
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

/** A built page navigates; a page that doesn't exist yet only shows for staff and says so when clicked. */
function Item(p: { icon: () => JSX.Element; label: string; route?: Route; badge?: number }) {
  const visible = () => (p.route ? router.can(p.route) : store.isStaff());
  const active = () => !!p.route && router.route() === p.route;
  return (
    <Show when={visible()}>
      <button
        class="nav-item" classList={{ active: active() }} aria-current={active() ? "page" : undefined}
        onClick={() => (p.route ? router.go(p.route) : store.toast(`${p.label} is not available yet`))}
      >
        {p.icon()}{p.label}
        <Show when={(p.badge ?? 0) > 0}><b class="badge">{p.badge}</b></Show>
      </button>
    </Show>
  );
}

export function Sidebar(props: { onAddPatient: () => void }) {
  const o = () => store.overview();
  const role = () => store.me()?.role;
  return (
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-mark"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="#ffe23d" stroke-width="4.2" stroke-linecap="round" /></svg></span>
        <span class="brand-name">Hekara</span>
      </div>

      <div class="side-scroll">
        <Show when={role() !== "billing"}>
          <Section title="MENU">
            <nav class="nav" id="menu">
              <Item icon={Icon.grid} label="Overview" />
              <Item icon={Icon.users} label="Patients" route="patients" badge={o()?.badges.patients} />
              <Item icon={Icon.steth} label="Caregivers" route="caregivers" />
              <Item icon={Icon.cal} label="Schedule" route="schedule" badge={o()?.badges.schedule} />
              <Item icon={Icon.house} label="Visits" />
              <Item icon={Icon.list} label="Care Plans" />
              <Item icon={Icon.spark} label="AI Copilot" />
            </nav>
          </Section>
        </Show>

        <Show when={store.isStaff() || role() === "billing"}>
          <Section title="BUSINESS">
            <nav class="nav" id="business">
              <Item icon={Icon.receipt} label="Billing & Claims" route="billing" badge={o()?.badges.claims} />
              <Item icon={Icon.shield} label="Compliance" />
              <Item icon={Icon.chart} label="Reports" />
            </nav>
          </Section>
        </Show>

        <Show when={store.isStaff()}>
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
        </Show>
      </div>

      <Show when={store.isStaff()}>
        <div class="add-patient">
          <button class="add-btn" aria-label="Add a patient" onClick={props.onAddPatient}><Icon.plus /></button>
          <div class="add-title">Add a patient</div>
          <div class="add-sub">Or <button class="link" onClick={() => store.toast("Referral import is not available yet")}>import a referral</button></div>
        </div>
      </Show>
    </aside>
  );
}
