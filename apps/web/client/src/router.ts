import { createMemo, createRoot, createSignal } from "solid-js";
import type { Role } from "@hekara/core";
import { store } from "./store";

export type Route = "schedule" | "patients" | "caregivers" | "billing";

const ALLOWED: Record<Role, Route[]> = {
  admin: ["schedule", "patients", "caregivers", "billing"],
  scheduler: ["schedule", "patients", "caregivers"],
  caregiver: ["schedule"],
  billing: ["billing"],
};
const HOME: Record<Role, Route> = { admin: "schedule", scheduler: "schedule", caregiver: "schedule", billing: "billing" };

const parse = (): string => location.hash.replace(/^#\/?/, "").split(/[?/]/)[0] ?? "";

function create() {
  const [raw, setRaw] = createSignal(parse());
  window.addEventListener("hashchange", () => setRaw(parse()));
  /** The requested page if the role may open it, otherwise the role's home page. */
  const route = createMemo<Route>(() => {
    const role = store.me()?.role;
    if (!role) return "schedule";
    const wanted = raw() as Route;
    return ALLOWED[role].includes(wanted) ? wanted : HOME[role];
  });
  return {
    route,
    can: (r: Route) => !!store.me() && ALLOWED[store.me()!.role].includes(r),
    go: (r: Route) => { location.hash = `#/${r}`; },
  };
}

export const router = createRoot(create);
