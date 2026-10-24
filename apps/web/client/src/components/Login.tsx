import { createSignal, Match, Show, Switch } from "solid-js";
import { authClient } from "../auth";
import { store } from "../store";

type Step = "password" | "code" | "invite";
const inviteToken = () => new URLSearchParams(location.search).get("invite");
const MIN = 12;

/** Sign-in, second factor and invite acceptance. Error text is deliberately generic. */
export function Login() {
  const [step, setStep] = createSignal<Step>(inviteToken() ? "invite" : "password");
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [confirm, setConfirm] = createSignal("");
  const [code, setCode] = createSignal("");
  const [backup, setBackup] = createSignal(false);
  const [error, setError] = createSignal("");
  const [busy, setBusy] = createSignal(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const signIn = (e: SubmitEvent) => {
    e.preventDefault();
    void run(async () => {
      const r = await authClient.signIn.email({ email: email().trim(), password: password() });
      if (r.error) {
        setError(r.error.status === 429 ? "Too many attempts. Wait a minute and try again." : "Email or password is incorrect.");
        return;
      }
      if ((r.data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) {
        setStep("code");
        setPassword("");
        return;
      }
      await store.loadMe();
    });
  };

  const verify = (e: SubmitEvent) => {
    e.preventDefault();
    void run(async () => {
      const r = backup()
        ? await authClient.twoFactor.verifyBackupCode({ code: code().trim() })
        : await authClient.twoFactor.verifyTotp({ code: code().trim() });
      if (r.error) {
        setError(r.error.status === 429 ? "Too many attempts. Wait a minute and try again." : "That code didn't work.");
        return;
      }
      await store.loadMe();
    });
  };

  const passkey = () =>
    void run(async () => {
      const r = await authClient.signIn.passkey();
      if (r?.error) {
        setError("Passkey sign-in didn't complete.");
        return;
      }
      await store.loadMe();
    });

  const accept = (e: SubmitEvent) => {
    e.preventDefault();
    void run(async () => {
      if (password().length < MIN) {
        setError(`Use at least ${MIN} characters.`);
        return;
      }
      if (password() !== confirm()) {
        setError("The passwords don't match.");
        return;
      }
      const r = await authClient.resetPassword({ newPassword: password(), token: inviteToken()! });
      if (r.error) {
        setError("This invite link is invalid or has expired. Ask your admin for a new one.");
        return;
      }
      history.replaceState(null, "", location.pathname);
      setPassword("");
      setConfirm("");
      setStep("password");
      store.toast("Password set. You can sign in now.");
    });
  };

  return (
    <main class="login">
      <div class="login-card">
        <div class="brand">
          <span class="brand-mark">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14M5 12h14" stroke="#ffe23d" stroke-width="4.2" stroke-linecap="round" />
            </svg>
          </span>
          <span class="brand-name">Hekara</span>
        </div>
        <Switch>
          <Match when={step() === "password"}>
            <h1>Sign in</h1>
            <form onSubmit={signIn}>
              <label>
                Email
                <input
                  type="email"
                  required
                  autocomplete="username"
                  value={email()}
                  onInput={(e) => setEmail(e.currentTarget.value)}
                />
              </label>
              <label>
                Password
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
              <button class="primary-action" type="submit" disabled={busy()}>
                {busy() ? "Signing in…" : "Sign in"}
              </button>
              <button class="ghost" type="button" disabled={busy()} onClick={passkey}>
                Sign in with a passkey
              </button>
            </form>
          </Match>
          <Match when={step() === "code"}>
            <h1>Two-step verification</h1>
            <form onSubmit={verify}>
              <label>
                {backup() ? "Backup code" : "Code from your authenticator app"}
                <input
                  inputmode={backup() ? "text" : "numeric"}
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
                Verify
              </button>
              <button
                class="link"
                type="button"
                onClick={() => {
                  setBackup(!backup());
                  setCode("");
                  setError("");
                }}
              >
                {backup() ? "Use my authenticator app" : "Use a backup code"}
              </button>
            </form>
          </Match>
          <Match when={step() === "invite"}>
            <h1>Set your password</h1>
            <form onSubmit={accept}>
              <label>
                New password
                <input
                  type="password"
                  required
                  minlength={MIN}
                  autocomplete="new-password"
                  value={password()}
                  onInput={(e) => setPassword(e.currentTarget.value)}
                />
              </label>
              <label>
                Confirm password
                <input
                  type="password"
                  required
                  minlength={MIN}
                  autocomplete="new-password"
                  value={confirm()}
                  onInput={(e) => setConfirm(e.currentTarget.value)}
                />
              </label>
              <p class="hint">At least {MIN} characters. A passphrase of a few random words works well.</p>
              <Show when={error()}>
                <p class="error" role="alert">
                  {error()}
                </p>
              </Show>
              <button class="primary-action" type="submit" disabled={busy()}>
                Save password
              </button>
            </form>
          </Match>
        </Switch>
      </div>
    </main>
  );
}
