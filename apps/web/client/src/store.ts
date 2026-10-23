import { batch, createRoot, createSignal } from "solid-js";
import type { DayScheduleDto, OverviewDto, PersonDto, SuggestionDto, WeekScheduleDto } from "@hekara/core";
import { api, ApiError } from "./api";

export interface Toast { id: number; message: string; undo?: () => void }
export interface Activity { id: number; text: string; at: Date }

const params = new URLSearchParams(location.search);
/** `?at=HH:MM` pins the clock, to compare against the design at 10:45. The server only honors it in development. */
const pinned = /^\d{2}:\d{2}$/.test(params.get("at") ?? "") ? params.get("at")! : undefined;

const clock = (): Date => {
  const d = new Date();
  if (pinned) { const [h, m] = pinned.split(":").map(Number) as [number, number]; d.setHours(h, m, 0, 0); }
  return d;
};

const EVENT_TEXT: Record<string, string> = {
  "visit.updated": "A visit changed",
  "suggestions.changed": "Copilot suggestions updated",
  "patient.created": "A patient was added",
};

function createStore() {
  const [now, setNow] = createSignal(clock());
  const [overview, setOverview] = createSignal<OverviewDto | null>(null);
  const [day, setDay] = createSignal<DayScheduleDto | null>(null);
  const [week, setWeek] = createSignal<WeekScheduleDto | null>(null);
  const [everyone, setEveryone] = createSignal<PersonDto[]>([]);
  const [view, setViewSig] = createSignal<"day" | "week">("day");
  const [filter, setFilterSig] = createSignal<PersonDto | null>(null);
  const [suggestions, setSuggestions] = createSignal<SuggestionDto[] | null>(null);
  const [toasts, setToasts] = createSignal<Toast[]>([]);
  const [activity, setActivity] = createSignal<Activity[]>([]);
  const [unread, setUnread] = createSignal(0);
  const [busy, setBusy] = createSignal<Set<string>>(new Set());
  const [online, setOnline] = createSignal(true);
  let seq = 0;

  const toast = (message: string, undo?: () => void) => {
    const id = ++seq;
    setToasts((t) => [...t.slice(-2), { id, message, undo }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  };
  const fail = (e: unknown, fallback: string) => toast(e instanceof ApiError ? e.message : fallback);

  async function refresh() {
    try {
      const [o, s] = await Promise.all([
        api.overview(pinned),
        api.schedule({ view: view(), caregiver: filter()?.id, at: pinned }),
      ]);
      batch(() => {
        setOverview(o);
        if (s.view === "day") {
          setDay(s); setWeek(null);
          if (!filter()) setEveryone(s.rows.map((r) => ({ id: r.id, name: r.name, avatarUrl: r.avatarUrl })));
        } else { setWeek(s); setDay(null); }
        setNow(clock());
        setOnline(true);
      });
    } catch (e) {
      setOnline(false);
      if (e instanceof ApiError && e.status === 401) toast("Please sign in again");
    }
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const scheduleRefresh = () => { clearTimeout(timer); timer = setTimeout(refresh, 150); };

  function connect() {
    const es = new EventSource("/api/events");
    es.onopen = () => void refresh();
    for (const type of Object.keys(EVENT_TEXT)) {
      es.addEventListener(type, () => {
        setActivity((a) => [{ id: ++seq, text: EVENT_TEXT[type]!, at: new Date() }, ...a].slice(0, 20));
        setUnread((n) => n + 1);
        scheduleRefresh();
      });
    }
    es.onerror = () => setOnline(false); // EventSource reconnects on its own
    return es;
  }

  const markBusy = (id: string, on: boolean) =>
    setBusy((s) => { const n = new Set(s); on ? n.add(id) : n.delete(id); return n; });

  return {
    now, overview, day, week, everyone, view, filter, suggestions, toasts, activity, unread, busy, online,
    toast, refresh, connect,
    pinned,
    tick: () => setNow(clock()),
    setView(v: "day" | "week") { setViewSig(v); void refresh(); },
    setFilter(p: PersonDto | null) { setFilterSig(p); void refresh(); },
    clearUnread: () => setUnread(0),
    dismissToast: (id: number) => setToasts((t) => t.filter((x) => x.id !== id)),

    async fill(id: string) {
      markBusy(id, true);
      try {
        const r = await api.fill(id);
        toast(`Assigned to ${r.caregiver.name}`, async () => {
          try { await api.unfill(id); toast("Shift reopened"); await refresh(); } catch (e) { fail(e, "Couldn't undo"); }
        });
        await refresh();
      } catch (e) { fail(e, "Couldn't fill this shift"); await refresh(); } finally { markBusy(id, false); }
    },

    async optimize() {
      markBusy("optimize", true);
      try { const r = await api.optimize(); setSuggestions(r.items); await refresh(); return r.items; }
      catch (e) { fail(e, "Couldn't compute suggestions"); return null; } finally { markBusy("optimize", false); }
    },
    openReview() { setSuggestions(overview()?.suggestions.items ?? []); },
    closeReview() { setSuggestions(null); },

    async apply(visitIds?: string[]) {
      markBusy("apply", true);
      try {
        const r = await api.apply(visitIds);
        toast(r.applied === 1 ? "Applied 1 suggestion" : `Applied ${r.applied} suggestions`);
        await refresh();
        setSuggestions(overview()?.suggestions.items ?? []);
        return true;
      } catch (e) { fail(e, "Couldn't apply suggestions"); await refresh(); setSuggestions(overview()?.suggestions.items ?? []); return false; }
      finally { markBusy("apply", false); }
    },

    async createPatient(input: { name: string; dob?: string; address?: string; notes?: string }) {
      try { await api.createPatient(input); toast("Patient added"); await refresh(); return true; }
      catch (e) { fail(e, "Couldn't add the patient"); return false; }
    },
  };
}

export const store = createRoot(createStore);
