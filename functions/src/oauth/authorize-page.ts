import { SCOPE_READ, type ConnectorConfig } from "../config.js";

/** Pinned Firebase JS SDK build served from gstatic (allow-listed in the CSP). */
const FIREBASE_SDK_VERSION = "12.11.0";
const FIREBASE_SDK_ORIGIN = "https://www.gstatic.com";

/** A client_name arrives through unauthenticated DCR; cap it before display. */
const MAX_CLIENT_NAME_LENGTH = 120;

export interface AuthorizePageParams {
  requestId: string;
  clientName: string;
  /**
   * The redirect URI bound to *this* authorization request — the address the
   * authorization code will actually be delivered to.
   */
  redirectUri: string;
}

/**
 * Reduce a redirect URI to the thing a user can actually judge.
 *
 * `client_name` comes from unauthenticated dynamic client registration, so
 * anyone can call themselves "Claude". The destination is the only part of the
 * request an attacker cannot forge, so it is what the consent card shows.
 *
 * http(s) URIs reduce to their origin. Private-use schemes (RFC 8252 native
 * apps) have no origin, so the scheme is named instead. Returns null when the
 * URI will not parse, in which case the page says so rather than inventing a
 * reassuring label.
 */
export function describeRedirectTarget(redirectUri: string): string | null {
  let url: URL;
  try {
    url = new URL(redirectUri);
  } catch {
    return null;
  }
  if (url.protocol === "https:" || url.protocol === "http:") {
    return url.origin;
  }
  const scheme = url.protocol.replace(/:$/, "");
  return scheme.length > 0 ? scheme : null;
}

export interface AuthorizePageDeps {
  config: ConnectorConfig;
}

/** Escape for HTML text and quoted attribute contexts. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Serialize a value for embedding inside a `<script>` block. JSON alone is not
 * enough: `</script>` inside a string would close the element.
 */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value ?? null)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function emulatorOrigin(host: string): string {
  const trimmed = host.trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

/**
 * CSP for the sign-in page. `script-src` needs 'unsafe-inline' because the page
 * ships a single inline module; there is no other script on the page and no
 * user-controlled value ever reaches a script context unescaped.
 */
export function buildContentSecurityPolicy(config: ConnectorConfig): string {
  const connectSrc = [
    "https://*.googleapis.com",
    "https://identitytoolkit.googleapis.com",
    "'self'",
  ];
  if (config.authEmulatorHost) {
    connectSrc.push(emulatorOrigin(config.authEmulatorHost));
  }
  return [
    "default-src 'none'",
    `script-src 'self' ${FIREBASE_SDK_ORIGIN} 'unsafe-inline'`,
    "style-src 'unsafe-inline'",
    `connect-src ${connectSrc.join(" ")}`,
    "img-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

const STYLES = `
:root {
  --bg: #f6f7f9;
  --surface: #ffffff;
  --border: #e3e6ea;
  --text: #16181d;
  --muted: #61656e;
  --accent: #4f46e5;
  --accent-text: #ffffff;
  --danger: #b42318;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0e1015;
    --surface: #171a21;
    --border: #272b34;
    --text: #f2f3f5;
    --muted: #9aa0ab;
    --accent: #7c7bf5;
    --accent-text: #0e1015;
    --danger: #f87171;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--bg);
  color: var(--text);
  font: 15px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
main {
  width: 100%;
  max-width: 420px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 28px;
}
.brand {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
  margin: 0 0 18px;
}
h1 { font-size: 21px; line-height: 1.3; margin: 0 0 8px; }
p { margin: 0 0 16px; color: var(--muted); }
p.lead { color: var(--text); }
label { display: block; font-size: 13px; font-weight: 600; margin: 0 0 6px; }
input {
  width: 100%;
  padding: 10px 12px;
  margin: 0 0 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text);
  font: inherit;
}
input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
button {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid transparent;
  border-radius: 8px;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
button[disabled] { opacity: 0.6; cursor: progress; }
.primary { background: var(--accent); color: var(--accent-text); }
.secondary {
  background: transparent;
  color: var(--muted);
  border-color: var(--border);
  margin-top: 8px;
}
ul { margin: 0 0 18px; padding-left: 20px; color: var(--muted); }
li { margin-bottom: 4px; }
.scope {
  display: inline-block;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  padding: 1px 6px;
  border: 1px solid var(--border);
  border-radius: 5px;
}
.account { font-weight: 600; color: var(--text); overflow-wrap: anywhere; }
.client { font-weight: 600; color: var(--text); overflow-wrap: anywhere; }
.error { color: var(--danger); font-size: 14px; }
[hidden] { display: none !important; }
.destination {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px 16px;
  margin: 0 0 18px;
  background: var(--bg);
}
.destination-label {
  margin: 0 0 4px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
}
.destination-value {
  margin: 0 0 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
  overflow-wrap: anywhere;
}
.destination-value.unverified { font-family: inherit; color: var(--danger); }
.destination-note { margin: 0; font-size: 13px; color: var(--muted); }
.hint { font-size: 13px; }
`.trim();

/**
 * The consent screen. Sign-in happens client-side against Firebase Auth, so the
 * user's password never reaches this server; only the resulting ID token is
 * posted back, and neither it nor any secret is rendered into the page.
 */
export function renderAuthorizePage(deps: AuthorizePageDeps, params: AuthorizePageParams): string {
  const displayName = params.clientName.trim().slice(0, MAX_CLIENT_NAME_LENGTH) || "An MCP client";
  const safeName = escapeHtml(displayName);
  const emulator = deps.config.authEmulatorHost
    ? emulatorOrigin(deps.config.authEmulatorHost)
    : null;

  const target = describeRedirectTarget(params.redirectUri);
  const destinationValue = target
    ? `<p class="destination-value">${escapeHtml(target)}</p>`
    : `<p class="destination-value unverified">an address we could not read</p>`;
  const destinationNote = target
    ? `Any application can register itself under any name, so &ldquo;${safeName}&rdquo; is not proof of identity. Approve only if you recognise this address as the app you are connecting.`
    : `This request did not provide an address we can display. Do not approve it unless you are certain where it came from.`;

  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex, nofollow">
<title>Authorize access · Cadence</title>
<style>${STYLES}</style>
<main>
  <p class="brand">Cadence</p>
  <h1>Connect <span class="client">${safeName}</span></h1>

  <form id="signin" novalidate>
    <p class="lead">Sign in with your Cadence account to continue.</p>
    <p class="hint">This will grant read-only access to
      ${target ? `<strong>${escapeHtml(target)}</strong>` : "an address we could not read"}.</p>
    <label for="email">Email</label>
    <input id="email" name="email" type="email" autocomplete="username" required>
    <label for="password">Password</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required>
    <button id="signin-submit" class="primary" type="submit">Continue</button>
  </form>

  <section id="consent" hidden>
    <p class="lead">Signed in as <span class="account" id="account"></span>.</p>
    <p><span class="client">${safeName}</span> is requesting <strong>read-only</strong> access:</p>
    <ul>
      <li>Read your Cadence projects, items and schedule</li>
      <li>Read your team and workload data</li>
      <li>Scope granted: <span class="scope">${escapeHtml(SCOPE_READ)}</span></li>
    </ul>
    <p>It cannot create, change or delete anything in Cadence.</p>
    <div class="destination">
      <p class="destination-label">Access will be sent to</p>
      ${destinationValue}
      <p class="destination-note">${destinationNote}</p>
    </div>
    <button id="approve" class="primary" type="button">Approve read-only access</button>
    <button id="deny" class="secondary" type="button">Cancel</button>
  </section>

  <p class="error" id="error" role="alert" hidden></p>
</main>
<script type="module">
import { initializeApp } from "${FIREBASE_SDK_ORIGIN}/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  connectAuthEmulator,
  signOut,
} from "${FIREBASE_SDK_ORIGIN}/firebasejs/${FIREBASE_SDK_VERSION}/firebase-auth.js";

const FIREBASE_CONFIG = ${jsonForScript(deps.config.firebaseWebConfig)};
const REQUEST_ID = ${jsonForScript(params.requestId)};
const EMULATOR_ORIGIN = ${jsonForScript(emulator)};

const auth = getAuth(initializeApp(FIREBASE_CONFIG));
if (EMULATOR_ORIGIN) {
  connectAuthEmulator(auth, EMULATOR_ORIGIN, { disableWarnings: true });
}

const signinForm = document.getElementById("signin");
const consent = document.getElementById("consent");
const account = document.getElementById("account");
const errorBox = document.getElementById("error");
const submitButton = document.getElementById("signin-submit");
const approveButton = document.getElementById("approve");
const denyButton = document.getElementById("deny");

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = message.length === 0;
}

function setBusy(button, busy) {
  button.disabled = busy;
}

async function complete(body) {
  const response = await fetch("/authorize/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error("request_failed");
  }
  const payload = await response.json();
  if (typeof payload.redirectTo !== "string") {
    throw new Error("bad_response");
  }
  return payload.redirectTo;
}

signinForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError("");
  setBusy(submitButton, true);
  const passwordField = document.getElementById("password");
  try {
    const credential = await signInWithEmailAndPassword(
      auth,
      document.getElementById("email").value.trim(),
      passwordField.value
    );
    passwordField.value = "";
    account.textContent = credential.user.email || "your Cadence account";
    signinForm.hidden = true;
    consent.hidden = false;
  } catch {
    showError("Sign-in failed. Check your email and password, then try again.");
  } finally {
    setBusy(submitButton, false);
  }
});

approveButton.addEventListener("click", async () => {
  showError("");
  setBusy(approveButton, true);
  try {
    if (!auth.currentUser) {
      throw new Error("not_signed_in");
    }
    const idToken = await auth.currentUser.getIdToken();
    const redirectTo = await complete({ requestId: REQUEST_ID, idToken });
    try {
      await signOut(auth);
    } catch {
      // Leaving the browser session behind is untidy, not a reason to fail.
    }
    window.location.replace(redirectTo);
  } catch {
    setBusy(approveButton, false);
    showError("Could not complete authorization. Start again from your MCP client.");
  }
});

denyButton.addEventListener("click", async () => {
  showError("");
  setBusy(denyButton, true);
  try {
    const redirectTo = await complete({ requestId: REQUEST_ID, denied: true });
    window.location.replace(redirectTo);
  } catch {
    setBusy(denyButton, false);
    showError("Could not cancel cleanly. Close this window to abandon the request.");
  }
});
</script>`;
}

/**
 * Terminal error page. Rendered instead of redirecting, because a request we
 * cannot resolve gives us no redirect_uri we are willing to trust.
 */
export function renderErrorPage(message: string): string {
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex, nofollow">
<title>Authorization error · Cadence</title>
<style>${STYLES}</style>
<main>
  <p class="brand">Cadence</p>
  <h1>Authorization could not continue</h1>
  <p>${escapeHtml(message)}</p>
</main>`;
}
