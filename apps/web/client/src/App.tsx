import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { Copilot, OpenShifts, OvertimeWatch } from "./components/Cards";
import { AddPatientModal, ReviewModal } from "./components/Modals";
import { ScheduleCard } from "./components/ScheduleCard";
import { Sidebar } from "./components/Sidebar";
import { Toasts } from "./components/Toasts";
import { Topbar } from "./components/Topbar";
import { store } from "./store";


export function App() {
  let canvas!: HTMLDivElement;
  const [view, setView] = createSignal({ s: 1, w: 1850, h: 900 });
  const [adding, setAdding] = createSignal(false);
  // Scale the design to the screen, then give the fluid layout whatever room is left, so the app always fills the viewport.
  const fit = () => {
    const s = Math.min(1.5, Math.max(0.5, Math.min(window.innerWidth / 1850, window.innerHeight / 900)));
    setView({ s, w: window.innerWidth / s, h: window.innerHeight / s });
  };

  onMount(() => {
    fit();
    window.addEventListener("resize", fit);
    void store.refresh();
    const es = store.connect();
    const clock = setInterval(() => store.tick(), 15_000);
    const poll = setInterval(() => void store.refresh(), 60_000); // safety net if the event stream is down
    onCleanup(() => { window.removeEventListener("resize", fit); es.close(); clearInterval(clock); clearInterval(poll); });
  });

  return (
    <div id="stage">
      <div id="canvas" ref={canvas} style={{ width: `${view().w}px`, height: `${view().h}px`, transform: `scale(${view().s})` }}>
        <div class="app">
          <Sidebar onAddPatient={() => setAdding(true)} />
          <div class="main">
            <Topbar onAddPatient={() => setAdding(true)} />
            <main class="panel">
              <ScheduleCard />
              <Copilot />
              <OpenShifts />
              <OvertimeWatch />
            </main>
          </div>
        </div>
        <Show when={!store.online()}><div class="offline" role="alert">Offline. Reconnecting…</div></Show>
      </div>
      <ReviewModal />
      <Show when={adding()}><AddPatientModal onClose={() => setAdding(false)} /></Show>
      <Toasts />
    </div>
  );
}
