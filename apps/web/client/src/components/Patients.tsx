import { createResource, createSignal, For, Show } from "solid-js";
import { api } from "../api";
import { Icon } from "../icons";
import { plainDate, shortDate } from "../lib";
import { store } from "../store";
import { Avatar } from "./Avatar";
import { Modal } from "./Modal";
import { Pager } from "./Pager";

const LIMIT = 25;

function Detail(props: { id: string; onClose: () => void }) {
  const [p] = createResource(
    () => props.id,
    (id) => api.patient(id),
  );
  return (
    <Modal title="Patient" onClose={props.onClose}>
      <Show when={p()} fallback={<p class="muted-note">{p.error ? "Couldn't load this patient." : "Loading…"}</p>}>
        {(d) => (
          <dl class="facts">
            <dt>Name</dt>
            <dd>{d().name}</dd>
            <dt>Date of birth</dt>
            <dd>{d().dob ? plainDate(d().dob!) : "Not recorded"}</dd>
            <dt>Address</dt>
            <dd>{d().address ?? "Not recorded"}</dd>
            <dt>Notes</dt>
            <dd class="pre">{d().notes ?? "None"}</dd>
            <dt>Added</dt>
            <dd>{shortDate(d().createdAt)}</dd>
          </dl>
        )}
      </Show>
    </Modal>
  );
}

export function PatientsPage(props: { onAdd: () => void }) {
  const [offset, setOffset] = createSignal(0);
  const [open, setOpen] = createSignal<string | null>(null);
  const [data] = createResource(
    () => [offset(), store.version()] as const,
    ([o]) => api.patients(o, LIMIT),
  );
  return (
    <section class="card page">
      <header class="page-head">
        <span class="sched-icon">
          <Icon.users />
        </span>
        <h1>Patients</h1>
        <span class="sched-sub">{data()?.total ?? 0} in your agency</span>
        <button class="primary" onClick={props.onAdd}>
          <Icon.plus />
          Add a patient
        </button>
      </header>
      <div class="table-wrap">
        <Show when={!data.error} fallback={<p class="empty">Couldn't load patients.</p>}>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Added</th>
              </tr>
            </thead>
            <tbody>
              <For
                each={data.latest?.items ?? []}
                fallback={
                  <tr>
                    <td colspan="2" class="empty">
                      {data.loading ? "Loading…" : "No patients yet."}
                    </td>
                  </tr>
                }
              >
                {(p) => (
                  <tr
                    class="clickable"
                    tabindex="0"
                    onClick={() => setOpen(p.id)}
                    onKeyDown={(e) => e.key === "Enter" && setOpen(p.id)}
                  >
                    <td>
                      <span class="cell-person">
                        <Avatar name={p.name} />
                        {p.name}
                      </span>
                    </td>
                    <td>{shortDate(p.createdAt)}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </Show>
      </div>
      <Pager total={data.latest?.total ?? 0} limit={LIMIT} offset={offset()} onPage={setOffset} />
      <Show when={open()}>{(id) => <Detail id={id()} onClose={() => setOpen(null)} />}</Show>
    </section>
  );
}
