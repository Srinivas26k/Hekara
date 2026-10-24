import { createResource, createSignal, Show } from "solid-js";
import { api } from "../api";
import { authClient } from "../auth";
import { Icon } from "../icons";
import { store } from "../store";

export function SettingsPage(props: { onAccount: () => void }) {
  const [data, { mutate }] = createResource(() => api.settings());
  const [name, setName] = createSignal<string | null>(null);
  const [saving, setSaving] = createSignal(false);
  const value = () => name() ?? data()?.agencyName ?? "";

  const [current, setCurrent] = createSignal("");
  const [next, setNext] = createSignal("");
  const [again, setAgain] = createSignal("");
  const [pwBusy, setPwBusy] = createSignal(false);
  const [pwError, setPwError] = createSignal("");
  const min = () => data()?.passwordMinLength ?? 12;

  async function saveName(e: SubmitEvent) {
    e.preventDefault(); setSaving(true);
    try { mutate(await api.saveSettings(value().trim())); setName(null); store.toast("Agency name saved"); await store.loadMe(); }
    catch { store.toast("Couldn't save the agency name"); } finally { setSaving(false); }
  }
  async function changePassword(e: SubmitEvent) {
    e.preventDefault(); setPwError("");
    if (next().length < min()) { setPwError(`Use at least ${min()} characters.`); return; }
    if (next() !== again()) { setPwError("The new passwords don't match."); return; }
    setPwBusy(true);
    try {
      const r = await authClient.changePassword({ currentPassword: current(), newPassword: next(), revokeOtherSessions: true });
      if (r.error) { setPwError(r.error.status === 429 ? "Too many attempts. Wait a minute and try again." : "Your current password is incorrect."); return; }
      setCurrent(""); setNext(""); setAgain(""); store.toast("Password changed. Other devices were signed out.");
    } catch { setPwError("Something went wrong. Please try again."); } finally { setPwBusy(false); }
  }

  return (
    <section class="card page">
      <header class="page-head"><span class="sched-icon"><Icon.gear /></span><h1>Settings</h1><span class="sched-sub">{data()?.agencyName}</span></header>
      <div class="settings">
        <div class="panel-card">
          <h3>Agency</h3>
          <form class="inline-form" onSubmit={saveName}>
            <label>Agency name<input required maxlength="120" value={value()} onInput={(e) => setName(e.currentTarget.value)} /></label>
            <button class="primary-action" type="submit" disabled={saving() || !value().trim() || value().trim() === data()?.agencyName}>{saving() ? "Saving…" : "Save"}</button>
          </form>
        </div>

        <div class="panel-card">
          <h3>Your sign-in</h3>
          <form onSubmit={changePassword}>
            <label>Current password<input type="password" required autocomplete="current-password" value={current()} onInput={(e) => setCurrent(e.currentTarget.value)} /></label>
            <div class="formrow">
              <label>New password<input type="password" required minlength={min()} autocomplete="new-password" value={next()} onInput={(e) => setNext(e.currentTarget.value)} /></label>
              <label>Repeat it<input type="password" required minlength={min()} autocomplete="new-password" value={again()} onInput={(e) => setAgain(e.currentTarget.value)} /></label>
            </div>
            <Show when={pwError()}><p class="error" role="alert">{pwError()}</p></Show>
            <div class="row-actions">
              <button class="primary-action" type="submit" disabled={pwBusy()}>{pwBusy() ? "Changing…" : "Change password"}</button>
              <button class="ghost" type="button" onClick={props.onAccount}>Passkeys and authenticator app</button>
            </div>
          </form>
        </div>

        <div class="panel-card">
          <h3>Security rules</h3>
          <p class="muted-note">These are set by Hekara and apply to everyone in the agency.</p>
          <dl class="facts">
            <dt>Idle sign-out</dt><dd>{data()?.sessionIdleMinutes} minutes without activity</dd>
            <dt>Longest session</dt><dd>{data()?.sessionMaxHours} hours, then sign in again</dd>
            <dt>Passwords</dt><dd>At least {data()?.passwordMinLength} characters, stored with Argon2id</dd>
            <dt>Accounts</dt><dd>Invite only, created by an admin</dd>
            <dt>Patient data</dt><dd>Encrypted on every record; every access is logged</dd>
          </dl>
        </div>
      </div>
    </section>
  );
}
