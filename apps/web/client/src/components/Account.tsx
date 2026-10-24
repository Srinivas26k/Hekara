import { createResource, createSignal, For, Show } from "solid-js";
import type { AuditDto, Role } from "@hekara/core";
import { api, ApiError } from "../api";
import { authClient } from "../auth";
import { store } from "../store";
import { Modal } from "./Modal";

const ROLES: { value: Role; label: string }[] = [
  { value: "scheduler", label: "Scheduler" },
  { value: "admin", label: "Admin" },
  { value: "caregiver", label: "Caregiver" },
  { value: "billing", label: "Billing" },
];

function Passkeys() {
  const [busy, setBusy] = createSignal(false);
  const add = async () => {
    setBusy(true);
    try {
      const r = await authClient.passkey.addPasskey({ name: "This device" });
      store.toast(r?.error ? "Couldn't add the passkey" : "Passkey added");
    } catch {
      store.toast("Couldn't add the passkey");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section>
      <h3>Passkey</h3>
      <p class="hint">Sign in with your fingerprint, face or a security key. Passkeys can't be phished.</p>
      <button class="ghost" disabled={busy()} onClick={add}>
        Add a passkey
      </button>
    </section>
  );
}

function Authenticator() {
  const [password, setPassword] = createSignal("");
  const [uri, setUri] = createSignal("");
  const [codes, setCodes] = createSignal<string[]>([]);
  const [code, setCode] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const secret = () => new URL(uri()).searchParams.get("secret") ?? "";
  const enabled = () => store.me()?.twoFactorEnabled;

  const start = async (e: SubmitEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await authClient.twoFactor.enable({ password: password() });
      if (r.error || !r.data) {
        setError("Password is incorrect.");
        return;
      }
      if (r.data.method !== "totp") {
        setError("Authenticator apps aren't available right now.");
        return;
      }
      setUri(r.data.totpURI);
      setCodes(r.data.backupCodes);
      setPassword("");
    } catch {
      setError("Something went wrong.");
    } finally {
      setBusy(false);
    }
  };
  const confirm = async (e: SubmitEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await authClient.twoFactor.verifyTotp({ code: code().trim() });
      if (r.error) {
        setError("That code didn't work.");
        return;
      }
      setUri("");
      setCodes([]);
      setCode("");
      store.toast("Authenticator app turned on");
      await store.loadMe();
    } catch {
      setError("Something went wrong.");
    } finally {
      setBusy(false);
    }
  };
  const disable = async (e: SubmitEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await authClient.twoFactor.disable({ password: password() });
      if (r.error) {
        setError("Password is incorrect.");
        return;
      }
      setPassword("");
      store.toast("Authenticator app turned off");
      await store.loadMe();
    } catch {
      setError("Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h3>Authenticator app</h3>
      <Show
        when={!uri()}
        fallback={
          <form onSubmit={confirm}>
            <p class="hint">Add this key to your authenticator app, then enter the 6-digit code it shows.</p>
            <code class="secret">{secret()}</code>
            <p class="hint">Save these backup codes somewhere safe. Each works once if you lose your device.</p>
            <ul class="codes">
              <For each={codes()}>{(c) => <li>{c}</li>}</For>
            </ul>
            <label>
              6-digit code
              <input
                inputmode="numeric"
                autocomplete="one-time-code"
                required
                value={code()}
                onInput={(e) => setCode(e.currentTarget.value)}
              />
            </label>
            <Show when={error()}>
              <p class="error" role="alert">
                {error()}
              </p>
            </Show>
            <button class="primary-action" type="submit" disabled={busy()}>
              Turn on
            </button>
          </form>
        }
      >
        <form onSubmit={enabled() ? disable : start}>
          <p class="hint">
            {enabled()
              ? "On. A code is required at every sign-in."
              : "Adds a second step at sign-in using a code from your phone."}
          </p>
          <label>
            Confirm your password
            <input
              type="password"
              required
              autocomplete="current-password"
              value={password()}
              onInput={(e) => setPassword(e.currentTarget.value)}
            />
          </label>
          <Show when={error()}>
            <p class="error" role="alert">
              {error()}
            </p>
          </Show>
          <button class={enabled() ? "ghost" : "primary-action"} type="submit" disabled={busy()}>
            {enabled() ? "Turn off" : "Set up"}
          </button>
        </form>
      </Show>
    </section>
  );
}

const LABELS: Record<string, string> = {
  "auth.login": "Signed in",
  "auth.logout": "Signed out",
  "auth.2fa.enable": "Turned on two-step",
  "auth.2fa.disable": "Turned off two-step",
  "auth.passkey.add": "Added a passkey",
  "auth.passkey.remove": "Removed a passkey",
  "auth.password.reset": "Set a password",
  "visit.fill": "Filled a shift",
  "visit.unfill": "Reopened a shift",
  "suggestion.apply": "Applied a suggestion",
  "patient.create": "Added a patient",
  "user.invite": "Invited a user",
  "audit.verify": "Checked the log",
  "schedule.read": "Viewed the schedule",
  search: "Searched",
  "suggestions.compute": "Computed suggestions",
};

export function ActivityLog() {
  const [rows, setRows] = createSignal<AuditDto[]>([]);
  const [open, setOpen] = createSignal(false);
  const [more, setMore] = createSignal(true);
  const [status, setStatus] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const load = async (before?: number) => {
    const page = await api.audit(before).catch(() => []);
    setRows(before ? [...rows(), ...page] : page);
    setMore(page.length === 30);
  };
  const toggle = async () => {
    const next = !open();
    setOpen(next);
    if (next && rows().length === 0) await load();
  };
  const verify = async () => {
    setBusy(true);
    try {
      const r = await api.verifyAudit();
      setStatus(
        r.ok
          ? "Log is intact. No entry has been changed or removed."
          : `Log was altered at entry ${r.brokenAt! + 1}. Contact support.`,
      );
    } catch {
      setStatus("Couldn't check the log.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section>
      <h3>Activity log</h3>
      <p class="hint">Every sign-in, schedule change and account change, tamper-evident.</p>
      <div class="row-actions">
        <button class="ghost" onClick={toggle}>
          {open() ? "Hide" : "Show recent activity"}
        </button>
        <button class="ghost" disabled={busy()} onClick={verify}>
          Check integrity
        </button>
      </div>
      <Show when={status()}>
        <p class="hint" role="status">
          {status()}
        </p>
      </Show>
      <Show when={open()}>
        <ul class="log">
          <For each={rows()}>
            {(r) => (
              <li>
                <span>{LABELS[r.action] ?? r.action}</span>
                <small>
                  {r.userName ?? "System"} ·{" "}
                  {new Date(r.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </small>
              </li>
            )}
          </For>
        </ul>
        <Show when={more()}>
          <button class="ghost" onClick={() => void load(rows()[rows().length - 1]?.seq)}>
            Load older
          </button>
        </Show>
      </Show>
    </section>
  );
}

export function Team() {
  const [users, { refetch }] = createResource(() => api.users().catch(() => []));
  const [email, setEmail] = createSignal("");
  const [name, setName] = createSignal("");
  const [role, setRole] = createSignal<Role>("scheduler");
  const [caregiverId, setCaregiverId] = createSignal("");
  const [link, setLink] = createSignal("");
  const [error, setError] = createSignal("");
  const [busy, setBusy] = createSignal(false);

  const invite = async (e: SubmitEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setLink("");
    try {
      const r = await api.invite({
        email: email().trim(),
        name: name().trim(),
        role: role(),
        caregiverId: role() === "caregiver" ? caregiverId() : undefined,
      });
      setLink(r.link);
      setEmail("");
      setName("");
      await refetch();
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === "exists"
          ? "That email already has an account."
          : "Couldn't create the invite. Check the details.",
      );
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link());
      store.toast("Link copied");
    } catch {
      store.toast("Select the link and copy it");
    }
  };

  return (
    <section>
      <h3>Team</h3>
      <ul class="people">
        <For each={users() ?? []}>
          {(u) => (
            <li>
              <span>{u.name}</span>
              <small>
                {u.role}
                {u.twoFactorEnabled ? " · 2-step" : ""}
              </small>
            </li>
          )}
        </For>
      </ul>
      <form onSubmit={invite}>
        <label>
          Name
          <input required maxlength="120" value={name()} onInput={(e) => setName(e.currentTarget.value)} />
        </label>
        <label>
          Email
          <input type="email" required value={email()} onInput={(e) => setEmail(e.currentTarget.value)} />
        </label>
        <label>
          Role
          <select value={role()} onChange={(e) => setRole(e.currentTarget.value as Role)}>
            <For each={ROLES}>{(r) => <option value={r.value}>{r.label}</option>}</For>
          </select>
        </label>
        <Show when={role() === "caregiver"}>
          <label>
            Linked caregiver
            <select required value={caregiverId()} onChange={(e) => setCaregiverId(e.currentTarget.value)}>
              <option value="">Choose…</option>
              <For each={store.everyone()}>{(p) => <option value={p.id}>{p.name}</option>}</For>
            </select>
          </label>
        </Show>
        <Show when={error()}>
          <p class="error" role="alert">
            {error()}
          </p>
        </Show>
        <button class="ghost" type="submit" disabled={busy()}>
          Create invite
        </button>
      </form>
      <Show when={link()}>
        <div class="invite-link">
          <p class="hint">Send this one-time link to the new user. It works for 48 hours and won't be shown again.</p>
          <code>{link()}</code>
          <button class="ghost" type="button" onClick={copy}>
            Copy link
          </button>
        </div>
      </Show>
    </section>
  );
}

export function AccountModal(props: { onClose: () => void }) {
  const me = () => store.me();
  return (
    <Modal title="Your account" onClose={props.onClose} wide>
      <div class="account">
        <p class="who">
          <b>{me()?.name}</b>
          <span>
            {me()?.email} · {me()?.role}
          </span>
        </p>
        <Passkeys />
        <Authenticator />
        <footer>
          <button
            class="ghost"
            onClick={() => {
              props.onClose();
              void store.signOut();
            }}
          >
            Sign out
          </button>
        </footer>
      </div>
    </Modal>
  );
}
