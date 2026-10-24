import { Icon } from "../icons";
import { ActivityLog, Team } from "./Account";

const MATRIX: { what: string; admin: boolean; scheduler: boolean; caregiver: boolean; billing: boolean }[] = [
  { what: "View and change the schedule", admin: true, scheduler: true, caregiver: false, billing: false },
  { what: "See their own visits", admin: true, scheduler: true, caregiver: true, billing: false },
  { what: "Patients and care plans", admin: true, scheduler: true, caregiver: false, billing: false },
  { what: "Caregivers and credentials", admin: true, scheduler: true, caregiver: false, billing: false },
  { what: "Hours and fill-rate reports", admin: true, scheduler: true, caregiver: false, billing: false },
  { what: "Claims and billing reports", admin: true, scheduler: false, caregiver: false, billing: true },
  { what: "Delete credentials", admin: true, scheduler: false, caregiver: false, billing: false },
  { what: "Invite people, view the activity log, settings", admin: true, scheduler: false, caregiver: false, billing: false },
];
const Mark = (p: { on: boolean }) => <td class="mark" aria-label={p.on ? "Allowed" : "Not allowed"}>{p.on ? "✓" : "–"}</td>;

export function TeamPage() {
  return (
    <section class="card page">
      <header class="page-head"><span class="sched-icon"><Icon.user /></span><h1>Team &amp; Permissions</h1><span class="sched-sub">Who can do what</span></header>
      <div class="settings">
        <div class="panel-card"><Team /></div>
        <div class="panel-card">
          <h3>What each role can do</h3>
          <table class="matrix">
            <thead><tr><th /><th>Admin</th><th>Scheduler</th><th>Caregiver</th><th>Billing</th></tr></thead>
            <tbody>{MATRIX.map((m) => <tr><td>{m.what}</td><Mark on={m.admin} /><Mark on={m.scheduler} /><Mark on={m.caregiver} /><Mark on={m.billing} /></tr>)}</tbody>
          </table>
        </div>
        <div class="panel-card"><ActivityLog /></div>
      </div>
    </section>
  );
}
