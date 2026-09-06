// Auth client. Talks to /api/auth/* (backed by Supabase + Nodemailer).
//
// Two ways in:
//   - Sign up:  sendSignupCode(email) -> verifySignupCode(email, code) -> completeSignup(email, verificationToken, password)
//   - Log in:   login(email, password)
// Password recovery (also used by legacy passwordless accounts to set their first password):
//   - sendResetCode(email) -> verifyResetCode(email, code) -> resetPassword(email, verificationToken, password)
import { apiFetch, parseJson, AUTH_TIMEOUT_MS } from './http.js';
import { getRecaptchaToken } from './recaptcha.js';

const TOKEN_KEY = 'msp_session_token';
// Where the account-type choice waits out the Google redirect. sessionStorage, not localStorage:
// the choice is scoped to this one signup attempt, and a stale 'parent' left behind by an
// abandoned flow must never silently apply to a signup someone starts a week later. Cleared the
// moment it is read (see takePendingRole).
const SIGNUP_ROLE_KEY = 'msp_signup_role';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

/** Remembers the account type across the Google OAuth redirect. */
export function stashPendingRole(role) {
  try { sessionStorage.setItem(SIGNUP_ROLE_KEY, role === 'parent' ? 'parent' : 'student'); } catch { /* private mode */ }
}

/** Reads and clears it. Returns 'student' when nothing was stashed — the safe default: a role is
 *  written once at account creation and never again, so guessing 'parent' would be unrecoverable
 *  while guessing 'student' is simply the ordinary signup. */
export function takePendingRole() {
  try {
    const role = sessionStorage.getItem(SIGNUP_ROLE_KEY);
    sessionStorage.removeItem(SIGNUP_ROLE_KEY);
    return role === 'parent' ? 'parent' : 'student';
  } catch { return 'student'; }
}

/**
 * Every auth request in the app.
 *
 * Routed through apiFetch (src/lib/http.js) rather than calling fetch directly,
 * which is what stops a single dropped request on a school Chromebook from
 * reaching the sign-in screen as the browser's own "Failed to fetch". That
 * helper retries the transport failures worth retrying, bounds every attempt
 * with a real timeout, and raises an error whose message is a sentence rather
 * than a browser string. Read the header of that file before changing any of
 * the numbers below.
 *
 * AUTH_TIMEOUT_MS, not the default: signup and password reset send mail inside
 * the request, and the first request into a cold serverless region pays for the
 * runtime boot on top of that. The default 20s was cutting off requests that
 * were about to succeed.
 */
async function req(path, options = {}) {
  const token = getToken();
  const res = await apiFetch(path, {
    ...options,
    timeout: AUTH_TIMEOUT_MS,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  // Deliberately NOT `.catch(() => ({}))`, which is what the old code did. That
  // swallowed the one case worth reporting loudest — a school filter or captive
  // portal answering with its own HTML page — and turned it into a bare
  // "Request failed." with no clue where the request actually went. parseJson
  // already returns {} for a legitimately empty body; the only things it throws
  // are transport problems, and those should reach the screen.
  const data = await parseJson(res);
  if (!res.ok) {
    const err = new Error(data.error || 'Request failed.');
    err.data = data;
    // Lifted to the top level to match src/lib/parentApi.js, so a caller branching on WHY a
    // request failed never has to match on the wording of the message. It used to — LoginView
    // compared the error text against a sentence the server had long since reworded, so the one
    // piece of help on that screen had quietly stopped appearing.
    err.reason = data.reason;
    err.status = res.status;
    throw err;
  }
  return data;
}

const sendOtp = async (email, purpose) => {
  const recaptchaToken = await getRecaptchaToken('send_otp');
  return req('/auth/send-otp', { method: 'POST', body: JSON.stringify({ email, purpose, recaptchaToken }) });
};
const verifyOtp = (email, code, purpose) => req('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ email, code, purpose }) });

export const sendSignupCode = (email) => sendOtp(email, 'signup');
export const verifySignupCode = (email, code) => verifyOtp(email, code, 'signup');
export const completeSignup = (email, verificationToken, password, role = 'student') =>
  req('/auth/complete-signup', { method: 'POST', body: JSON.stringify({ email, verificationToken, password, role }) });

export const sendResetCode = (email) => sendOtp(email, 'password_reset');
export const verifyResetCode = (email, code) => verifyOtp(email, code, 'password_reset');
export const resetPassword = (email, verificationToken, password) =>
  req('/auth/reset-password', { method: 'POST', body: JSON.stringify({ email, verificationToken, password }) });

export const login = async (email, password) => {
  const recaptchaToken = await getRecaptchaToken('login');
  return req('/auth/login', { method: 'POST', body: JSON.stringify({ email, password, recaptchaToken }) });
};

// ── Sign in with an emailed code, no password ────────────────────────────────
//
// The way back in for a parent account created by the claim flow, which deliberately has no
// password (see api/parent/claim.js). Same three-step chain as signup and password reset — code
// out, code back, spend the proof — except the thing it buys is a session rather than a password.
//
// sendSigninCode always reports success, even for an address with no account, so it cannot be used
// to find out which emails are registered. That means a wrong address here looks exactly like a
// right one until the code never arrives, which is the correct trade: the alternative tells
// strangers who has an account.
export const sendSigninCode = (email) => sendOtp(email, 'signin');
export const verifySigninCode = (email, code) => verifyOtp(email, code, 'signin');
export const loginWithCode = (email, verificationToken) =>
  req('/auth/login', { method: 'POST', body: JSON.stringify({ email, verificationToken }) });

// Exchanges a Supabase Auth access token (minted by supabase.auth.signInWithOAuth in
// the browser, see src/lib/supabaseClient.js) for this app's own session token.
// `role` is honored only when this sign-in CREATES the account — see api/auth/google.js. An
// existing account's role is never touched, so replaying this flow cannot escalate a student.
export const googleAuth = (accessToken, role = 'student') =>
  req('/auth/google', { method: 'POST', body: JSON.stringify({ accessToken, role }) });

export const fetchMe = () => req('/auth/me', { method: 'GET' });
export const updateMe = (patch) => req('/auth/me', { method: 'PATCH', body: JSON.stringify(patch) });
export const logout = () => req('/auth/logout', { method: 'POST' }).finally(clearToken);

/**
 * Ends one specific session on the server and leaves local storage alone.
 *
 * For the handover case only: a parent signing in at /parents/* on a browser already signed in as
 * their student (see AuthGate's handleAuthedOverSession). The arriving token has to replace the
 * outgoing one in storage, so `logout()` is exactly wrong here — its `.finally(clearToken)` would
 * resolve a moment later and delete the session the parent had just been given, leaving them
 * signed in until the next reload and signed out afterwards, with nothing on screen to explain it.
 *
 * Deliberately does not go through `req()`: that attaches whatever token storage currently holds,
 * which by the time this settles is the new one — i.e. it would end the wrong session.
 */
export const revokeSession = (token) => apiFetch('/auth/logout', {
  method: 'POST',
  timeout: AUTH_TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
});

// ── Data rights (see src/legal/privacy.js § 12) ──────────────────────────────
// The Privacy Policy tells users they can export and delete their data from the
// app. These are what make that true rather than aspirational.

/**
 * Everything the server holds for this account, as a JSON file the browser
 * saves. Deliberately not routed through `req()`: that helper parses the body
 * as JSON to surface API errors, and here the body IS the deliverable — we want
 * the bytes, not a parsed object, so a large export never gets materialised
 * twice just to be re-serialised.
 */
export async function exportMyData() {
  const token = getToken();
  const res = await apiFetch('/auth/account', {
    method: 'GET',
    timeout: AUTH_TIMEOUT_MS,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const data = await parseJson(res).catch(() => ({}));
    throw new Error(data.error || 'Could not export your data.');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `medschoolprep-data-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Irreversibly deletes the account and everything attached to it. The server
 * requires `confirmEmail` to match the session's email — see api/auth/account.js
 * for why. Clears the local token either way: if the account is gone, holding a
 * token for it only produces confusing 401s.
 */
export const deleteMyAccount = (confirmEmail) =>
  req('/auth/account', { method: 'DELETE', body: JSON.stringify({ confirmEmail }) }).finally(clearToken);
