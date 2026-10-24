import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import type { SearchHitDto } from "@hekara/core";
import { api } from "../api";
import { Icon } from "../icons";
import { longDate } from "../lib";
import { router, type Route } from "../router";
import { store } from "../store";
import { Avatar } from "./Avatar";

const TITLES: Record<Route, string> = {
  overview: "Overview",
  schedule: "Schedule",
  patients: "Patients",
  caregivers: "Caregivers",
  visits: "Visits",
  careplans: "Care Plans",
  copilot: "AI Copilot",
  billing: "Billing & Claims",
  compliance: "Compliance",
  reports: "Reports",
  settings: "Settings",
  team: "Team & Permissions",
};

function Search() {
  let input!: HTMLInputElement;
  const [q, setQ] = createSignal("");
  const [hits, setHits] = createSignal<SearchHitDto[]>([]);
  const [open, setOpen] = createSignal(false);
  const [active, setActive] = createSignal(0);
  let seq = 0;

  createEffect(() => {
    const text = q().trim();
    if (text.length < 2) {
      setHits([]);
      return;
    }
    const mine = ++seq;
    const t = setTimeout(async () => {
      try {
        const r = await api.search(text);
        if (mine === seq) {
          setHits(r);
          setActive(0);
        }
      } catch {
        if (mine === seq) setHits([]);
      }
    }, 200);
    onCleanup(() => clearTimeout(t));
  });

  const onGlobalKey = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      input.focus();
      input.select();
    }
  };
  onMount(() => document.addEventListener("keydown", onGlobalKey));
  onCleanup(() => document.removeEventListener("keydown", onGlobalKey));

  function choose(h: SearchHitDto) {
    setOpen(false);
    setQ("");
    if (h.kind === "caregiver") {
      store.setView("day");
      store.setFilter({ id: h.id, name: h.title, avatarUrl: null });
    } else store.toast(`${h.title}: details are not available yet`);
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      input.blur();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(Math.min(active() + 1, hits().length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(Math.max(active() - 1, 0));
    } else if (e.key === "Enter" && hits()[active()]) choose(hits()[active()]!);
  }

  return (
    <div class="search-wrap">
      <label class="search">
        <Icon.search />
        <input
          ref={input}
          placeholder="Search patients, caregivers, claims"
          value={q()}
          autocomplete="off"
          spellcheck={false}
          role="combobox"
          aria-expanded={open() && hits().length > 0}
          aria-controls="search-list"
          aria-label="Search"
          onInput={(e) => {
            setQ(e.currentTarget.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKey}
        />
        <span class="kbd">⌘K</span>
      </label>
      <Show when={open() && q().trim().length >= 2}>
        <ul class="results" id="search-list" role="listbox">
          <For each={hits()} fallback={<li class="none">No matches</li>}>
            {(h, i) => (
              <li
                role="option"
                aria-selected={i() === active()}
                classList={{ on: i() === active() }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(h);
                }}
                onMouseEnter={() => setActive(i())}
              >
                <span class="kind">{h.kind}</span>
                <span>{h.title}</span>
                <Show when={h.subtitle}>
                  <small>{h.subtitle}</small>
                </Show>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}

export function Topbar(props: { onAddPatient: () => void; onAccount: () => void }) {
  const [bell, setBell] = createSignal(false);
  const [plus, setPlus] = createSignal(false);
  const name = () => store.overview()?.agency.name ?? store.me()?.agencyName ?? "";
  const abbr = () =>
    name()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("");
  const close = () => {
    setBell(false);
    setPlus(false);
  };
  onMount(() => document.addEventListener("click", close));
  onCleanup(() => document.removeEventListener("click", close));

  return (
    <header class="topbar">
      <div class="org">
        <span class="org-badge">{abbr()}</span>
        <div>
          <div class="org-name">{name() || "Hekara"}</div>
          <div class="org-sub">
            {TITLES[router.route()]}
            {router.route() === "schedule"
              ? ` · ${store.day() ? longDate(store.day()!.date) : store.overview() ? longDate(store.overview()!.date) : ""}`
              : ""}
          </div>
        </div>
      </div>
      <Show when={store.isStaff()} fallback={<div class="grow" />}>
        <Search />
      </Show>
      <div class="actions">
        <button class="icon-btn" aria-label="Help" onClick={() => store.toast("Help center is not available yet")}>
          <Icon.help />
        </button>
        <div class="menu-wrap" onClick={(e) => e.stopPropagation()}>
          <button
            class="icon-btn bell"
            aria-label="Notifications"
            onClick={() => {
              setPlus(false);
              setBell(!bell());
              store.clearUnread();
            }}
          >
            <Icon.bell />
            <Show when={store.unread() > 0}>
              <span class="dot" />
            </Show>
          </button>
          <Show when={bell()}>
            <div class="dropdown right" role="menu">
              <For each={store.activity()} fallback={<div class="none">No recent activity</div>}>
                {(a) => (
                  <div class="item">
                    <span>{a.text}</span>
                    <small>{a.at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>
        <div class="menu-wrap" onClick={(e) => e.stopPropagation()}>
          <Show when={store.isStaff()}>
            <button
              class="icon-btn plus"
              aria-label="Create"
              onClick={() => {
                setBell(false);
                setPlus(!plus());
              }}
            >
              <Icon.plus />
            </button>
          </Show>
          <Show when={plus()}>
            <div class="dropdown right" role="menu">
              <button
                class="item"
                role="menuitem"
                onClick={() => {
                  close();
                  props.onAddPatient();
                }}
              >
                Add a patient
              </button>
            </div>
          </Show>
        </div>
        <button class="me-btn" aria-label="Account" onClick={props.onAccount}>
          <Avatar name={store.me()?.name ?? "?"} src={store.me()?.avatarUrl} class="me" />
        </button>
      </div>
    </header>
  );
}
