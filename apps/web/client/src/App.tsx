import { createSignal, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import { Copilot, OpenShifts, OvertimeWatch } from "./components/Cards";
import { AccountModal } from "./components/Account";
import { BillingPage } from "./components/Billing";
import { CaregiversPage } from "./components/Caregivers";
import { PatientsPage } from "./components/Patients";
import { router } from "./router";
import { AddPatientModal, ReviewModal } from "./components/Modals";
import { ScheduleCard } from "./components/ScheduleCard";
import { Sidebar } from "./components/Sidebar";
import { Login } from "./components/Login";
import { Toasts } from "./components/Toasts";
import { Topbar } from "./components/Topbar";
import { store } from "./store";


export function App() {
  let canvas!: HTMLDivElement;
  const [view, setView] = createSignal({ s: 1, w: 1850, h: 900 });
  const [adding, setAdding] = createSignal(false);
  const [account, setAccount] = createSignal(false);
  // The design tokens come from a 2000px-wide mock-up, so at 1:1 they look zoomed on a real screen. Scale them to normal
  // density (about 0.8 on a 1080p display), then let the fluid layout use the remaining room.
  const fit = () => {
    const s = Math.min(1.4, Math.max(0.7, Math.min(window.innerWidth / 2400, window.innerHeight / 1100)));
    setView({ s, w: window.innerWidth / s, h: window.innerHeight / s });
  };

  onMount(() => {
    fit();
    window.addEventListener("resize", fit);
    void store.loadMe();
    const clock = setInterval(() => store.tick(), 15_000);
    const poll = setInterval(() => void store.refresh(), 60_000); // safety net if the event stream is down
    onCleanup(() => { window.removeEventListener("resize", fit); clearInterval(clock); clearInterval(poll); });
  });

  return (
    <div id="stage">
      <Show when={store.auth() === "out"}><Login /></Show>
      <Show when={store.auth() === "in"}>
        <div id="canvas" ref={canvas} style={{ width: `${view().w}px`, height: `${view().h}px`, transform: `scale(${view().s})` }}>
          <div class="app">
            <Sidebar onAddPatient={() => setAdding(true)} />
            <div class="main">
              <Topbar onAddPatient={() => setAdding(true)} onAccount={() => setAccount(true)} />
              <main class="panel" classList={{ solo: router.route() !== "schedule" || !store.isStaff() }}>
                <Switch>
                  <Match when={router.route() === "patients"}><PatientsPage onAdd={() => setAdding(true)} /></Match>
                  <Match when={router.route() === "caregivers"}><CaregiversPage /></Match>
                  <Match when={router.route() === "billing"}><BillingPage /></Match>
                  <Match when={true}>
                    <ScheduleCard />
                    <Show when={store.isStaff()}>
                      <Copilot />
                      <OpenShifts />
                      <OvertimeWatch />
                    </Show>
                  </Match>
                </Switch>
              </main>
            </div>
          </div>
          <Show when={!store.online()}><div class="offline" role="alert">Offline. Reconnecting…</div></Show>
        </div>
        <ReviewModal />
        <Show when={adding()}><AddPatientModal onClose={() => setAdding(false)} /></Show>
        <Show when={account()}><AccountModal onClose={() => setAccount(false)} /></Show>
      </Show>
      <Toasts />
    </div>
  );
}
