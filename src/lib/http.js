// ─────────────────────────────────────────────────────────────────────────────
// The one place a browser request to this app's own API is made.
//
// ── Why this file exists ─────────────────────────────────────────────────────
// Every API client in this app used to call `fetch()` directly and hand whatever
// came back to the UI. That works right up until the network does something
// ordinary, and then it produces the single worst error message this app can
// show a student:
//
//     "Failed to fetch"        (Chrome / Chromebook)
//     "Load failed"            (Safari / iOS)
//     "NetworkError when attempting to fetch resource"  (Firefox)
//
// A bare `fetch()` rejects with a TypeError carrying one of those strings for
// EVERY transport-level failure, with no distinction between them: a dropped
// Wi-Fi frame, a school-managed Chromebook's content filter holding the
// connection open, a serverless cold start that ran past the edge's patience, a
// captive portal that answered with its own login page, a laptop that was
// asleep when the request was issued. The message names none of those, is not
// in this app's voice, and — critically — is not actionable. It also reached
// the sign-in screen verbatim, because LoginView renders `err.message`.
//
// The failure was never evenly distributed, which is exactly what made it look
// like a mystery: a Mac on home Wi-Fi retries TCP quietly and succeeds inside
// the browser's own margins, while a Chromebook on a school or district network
// sits behind a filtering proxy that adds latency to the first request of a
// session and sometimes drops it outright. Same code, same server, one device
// works and the other says "fetch failed".
//
// ── What this fixes, and what it deliberately does not ───────────────────────
// This module cannot make a broken network work. What it can do — and does — is
// make sure a *recoverable* failure actually recovers, and an *unrecoverable*
// one is described in a sentence a 16-year-old can act on:
//
//   1. A request that fails at the transport layer is retried, with exponential
//      backoff and jitter, before anyone is told anything went wrong. Most of
//      the "fetch failed" reports in this app were a single dropped request.
//   2. A request that hangs forever is cut off by an explicit timeout, so the
//      spinner cannot spin indefinitely. A bare fetch() has no timeout at all;
//      the browser's own is minutes long.
//   3. Being offline is detected and named as being offline, and — because a
//      Chromebook waking from sleep reports `onLine: false` for a beat before
//      the interface is actually up — a request issued in that window WAITS for
//      the connection rather than failing on it.
//   4. A response that isn't JSON (a proxy's block page, a captive portal, an
//      edge 502 HTML page) is recognized instead of being fed to JSON.parse and
//      surfacing as an unrelated syntax error.
//   5. Every error carries a machine-readable `reason`, so a caller branches on
//      a code and never on the wording of a sentence.
//
// Everything here is transport concerns only. Status codes, response shapes and
// business errors stay the caller's job — see authApi.js and dataApi.js.
// ─────────────────────────────────────────────────────────────────────────────

/** How long any one attempt may take before it is aborted, in ms. */
const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * Auth endpoints get longer.
 *
 * Signup and password reset send mail inline (api/_lib/mailer.js), and the very
 * first request to a cold serverless region pays for the runtime boot on top of
 * that. 20s is generous for a data read and genuinely too tight here — this is
 * the request that was timing out and being reported as "fetch failed".
 */
export const AUTH_TIMEOUT_MS = 45_000;

/** Attempts after the first, for failures we judge safe to repeat. */
const DEFAULT_RETRIES = 2;

/** Backoff before retry N (0-indexed), before jitter. */
const BACKOFF_MS = [400, 1200, 2600];

/**
 * Gateway/edge statuses where the request demonstrably did not reach — or was
 * not completed by — the application handler. Retrying these is safe even for a
 * POST, because no handler ran to completion, so nothing was written twice.
 *
 * 500 is NOT in this list, and that is deliberate: a 500 comes FROM the handler,
 * which means it ran, which means a retried signup could create a second row.
 * A genuine 500 is a bug to fix, not a request to repeat.
 */
const RETRYABLE_STATUSES = new Set([408, 425, 429, 502, 503, 504]);

/** True when the browser is confident there is no network at all. */
function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Resolves when the browser reports a connection again, or after `waitMs`.
 *
 * The reason this is a wait rather than an immediate failure: a Chromebook
 * resuming from a closed lid, and a phone leaving airplane mode, both report
 * `navigator.onLine === false` for a short window while the interface comes up.
 * A student who taps "Log in" in that window has done nothing wrong, and telling
 * them they are offline when they are two seconds from being online is a false
 * alarm they can only resolve by guessing that they should try again.
 */
function waitForOnline(waitMs = 6000) {
  if (!isOffline()) return Promise.resolve(true);
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      window.removeEventListener('online', onOnline);
      window.clearTimeout(timer);
      resolve(ok);
    };
    const onOnline = () => finish(true);
    const timer = window.setTimeout(() => finish(!isOffline()), waitMs);
    window.addEventListener('online', onOnline);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * An error from the transport layer rather than from the application.
 *
 * `reason` is the contract callers branch on. `retryable` says whether trying
 * the exact same thing again could plausibly work, which is what decides
 * whether the UI offers a "Try again" button or asks the student to change
 * something first.
 */
export class ApiNetworkError extends Error {
  constructor(message, reason, { retryable = true, cause = null, status = 0 } = {}) {
    super(message);
    this.name = 'ApiNetworkError';
    this.reason = reason;
    this.retryable = retryable;
    this.status = status;
    this.isNetworkError = true;
    if (cause) this.cause = cause;
  }
}

/**
 * The sentences a student actually sees.
 *
 * Written to the same rule as the rest of this app's copy: say what happened,
 * say whose side it is on, and say what to do next. None of them say "fetch",
 * "network request" or "endpoint", and none of them blame the student for a
 * condition they did not create.
 */
const MESSAGES = {
  offline:  "You're offline right now. Reconnect to Wi-Fi or your network and try again — nothing you typed was lost.",
  timeout:  "That took too long to come back. This is usually a slow or filtered network rather than anything wrong with your account — try again in a moment.",
  network:  "We couldn't reach MedSchoolPrep just now. If you're on a school or work network, it may be filtering the connection; otherwise try again in a moment.",
  // 502/503/504 from the edge: the request reached MedSchoolPrep's front door and
  // found nothing behind it. That is a deploy in progress, a container that has
  // not come up, or one that fell over — always our side, never the student's,
  // and the one thing they must not be told is to go and check their Wi-Fi.
  unavailable: "MedSchoolPrep is temporarily unavailable — this is on our side, not yours, and it's usually a few minutes while an update finishes. Nothing you typed was lost; try again shortly.",
  // Keyed with the hyphen because that is the `reason` string produced below.
  'rate-limited': "You've made a lot of requests in a short time, so MedSchoolPrep is asking you to slow down for a moment. Wait a minute and try again — nothing is wrong with your account.",
  blocked:  "Something on this network answered instead of MedSchoolPrep — usually a school filter, a guest Wi-Fi sign-in page, or a VPN. Try a different network, or ask whoever manages this one to allow medschoolprep.cloud.",
  server:   "MedSchoolPrep's servers had a problem with that request. It isn't something you did — try again in a moment, and contact support if it keeps happening.",
};

/**
 * Absolute, same-origin URL for an API path.
 *
 * Stated absolutely rather than left as `/api/...` because a relative URL is
 * resolved against the *document* base, and this app is a PWA: a page restored
 * from the service worker's precache, or launched from an installed shortcut,
 * has occasionally resolved against a base that is not the live origin. An
 * absolute URL built from `location.origin` cannot drift.
 */
export function apiUrl(path) {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (typeof window === 'undefined' || !window.location?.origin) return clean;
  return `${window.location.origin}${clean}`;
}

/** Did this response come back as JSON? */
function isJsonResponse(res) {
  const type = res.headers?.get?.('content-type') || '';
  return type.includes('json');
}

/**
 * A response that claims to be HTML where JSON was expected is almost never our
 * server — our handlers answer JSON for every path, success and failure alike.
 * It is a filtering proxy, a captive portal, or an edge error page, and saying
 * so is far more useful than "unexpected token < in JSON".
 */
function looksLikeInterception(res, bodyText) {
  if (isJsonResponse(res)) return false;
  const head = (bodyText || '').slice(0, 400).toLowerCase();
  return head.includes('<html') || head.includes('<!doctype');
}

/**
 * One fetch attempt with a hard timeout.
 *
 * The AbortController is the only way to bound a fetch — `Promise.race` leaves
 * the underlying request running and holding a connection, which on a flaky
 * link is how you end up with six in flight and none of them finishing.
 */
async function attempt(url, init, timeoutMs, externalSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('Timeout', 'TimeoutError')), timeoutMs);

  // A caller's own signal (a component unmounting, a search being retyped) must
  // still win, so it is chained onto ours rather than replacing it.
  const onExternalAbort = () => controller.abort(externalSignal?.reason);
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort(externalSignal.reason);
    else externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener?.('abort', onExternalAbort);
  }
}

/**
 * Fetch an API path, retrying the failures worth retrying, and failing with a
 * described error rather than a browser string.
 *
 * @param {string} path        API path, e.g. '/auth/login' (the leading /api is added).
 * @param {object} options
 * @param {number} options.timeout  ms per attempt.
 * @param {number} options.retries  attempts after the first.
 * @param {AbortSignal} options.signal  caller's own cancellation.
 * @param {(info: {attempt:number, of:number, reason:string}) => void} options.onRetry
 *        Called before each wait, so a UI can say "Reconnecting…" instead of
 *        appearing frozen through a 4-second backoff.
 * @returns {Promise<Response>} A real Response. Status handling is the caller's.
 */
export async function apiFetch(path, {
  timeout = DEFAULT_TIMEOUT_MS,
  retries = DEFAULT_RETRIES,
  signal,
  onRetry,
  ...init
} = {}) {
  const url = path.startsWith('http') ? path : apiUrl(`/api${path.startsWith('/') ? path : `/${path}`}`);
  let lastReason = 'network';
  let lastCause = null;

  for (let i = 0; i <= retries; i++) {
    // Checked per attempt, not once up front: a long backoff is exactly when a
    // laptop lid closes, and there is no point spending the next attempt on a
    // connection the browser has already told us is gone.
    if (isOffline()) {
      const cameBack = await waitForOnline();
      if (!cameBack) throw new ApiNetworkError(MESSAGES.offline, 'offline', { retryable: true });
    }

    try {
      const res = await attempt(url, init, timeout, signal);

      // A retryable gateway status: treat it like a transport failure so the
      // backoff below applies, rather than handing the caller a 503 body that
      // isn't from our handler and doesn't parse as our error shape.
      if (RETRYABLE_STATUSES.has(res.status) && i < retries) {
        lastReason = res.status === 429 ? 'rate-limited' : 'server';
        // `Retry-After` is the server telling us how long to wait. Honouring it
        // is the difference between backing off and hammering a service that
        // has explicitly asked for room.
        const after = Number(res.headers?.get?.('retry-after'));
        const wait = Number.isFinite(after) && after > 0
          ? Math.min(after * 1000, 8000)
          : BACKOFF_MS[i] ?? 2600;
        onRetry?.({ attempt: i + 1, of: retries, reason: lastReason });
        await sleep(wait + Math.random() * 250);
        continue;
      }

      // A non-JSON body where our API always answers JSON means something on
      // the path answered for us. Detected here, once, rather than in every
      // caller's `res.json().catch(() => ({}))`.
      if (!res.ok && looksLikeInterception(res, await res.clone().text().catch(() => ''))) {
        throw new ApiNetworkError(MESSAGES.blocked, 'blocked', { retryable: false, status: res.status });
      }

      // ── The last retry of a gateway status is still a gateway status ───────
      //
      // Above, a 502/503/504 is treated as a transport failure and retried. On
      // the FINAL attempt that branch is skipped (`i < retries` is false) and the
      // response fell through to here, to be returned to the caller as though it
      // were an ordinary answer from a handler.
      //
      // It is not one, and the caller has no way to tell. Coolify's Traefik
      // answers an application with no running container as
      //
      //     HTTP/2 503, content-type: text/plain, body: "no available server"
      //
      // which is not JSON and not HTML — so `looksLikeInterception` correctly
      // says no, `parseJson` then failed on `JSON.parse("no available server")`,
      // and the student was shown the `network` copy: "if you're on a school or
      // work network, it may be filtering the connection." The app was telling
      // people to go and argue with their IT department about a filter, at the
      // exact moment its own container was not running.
      //
      // The edge already told us whose fault it is. Say so.
      if (RETRYABLE_STATUSES.has(res.status)) {
        const reason = res.status === 429 ? 'rate-limited' : 'unavailable';
        throw new ApiNetworkError(MESSAGES[reason], reason, { retryable: true, status: res.status });
      }

      return res;
    } catch (err) {
      if (err instanceof ApiNetworkError) throw err;

      // The caller canceled deliberately — not a failure, and never retried.
      if (signal?.aborted) throw err;

      const isTimeout = err?.name === 'TimeoutError'
        || (err?.name === 'AbortError' && !signal?.aborted);
      lastReason = isTimeout ? 'timeout' : 'network';
      lastCause = err;

      if (i >= retries) break;
      onRetry?.({ attempt: i + 1, of: retries, reason: lastReason });
      await sleep((BACKOFF_MS[i] ?? 2600) + Math.random() * 250);
    }
  }

  if (isOffline()) throw new ApiNetworkError(MESSAGES.offline, 'offline', { retryable: true });
  throw new ApiNetworkError(MESSAGES[lastReason] || MESSAGES.network, lastReason, {
    retryable: true, cause: lastCause,
  });
}

/**
 * Parse an API response body, tolerating every way it can fail to be JSON.
 *
 * Returns `{}` for an empty body (a 204, or a handler that answered with no
 * content), and raises the "something answered for us" error when the body is
 * HTML — the case that used to surface as a JSON syntax error naming a `<`.
 */
export async function parseJson(res) {
  const text = await res.text().catch(() => '');
  if (!text) return {};
  if (looksLikeInterception(res, text)) {
    throw new ApiNetworkError(MESSAGES.blocked, 'blocked', { retryable: false, status: res.status });
  }
  try {
    return JSON.parse(text);
  } catch {
    // Unparseable body. WHOSE problem it is depends on the status, and getting
    // that wrong is how a student ends up blamed for an outage.
    //
    // 502/503/504 — the edge answered, the app did not. Ours, definitively.
    // Other 5xx — the handler answered and its body did not survive. Also ours.
    // 2xx/4xx — a truncated response, which is a transport problem however it
    //           is labeled, and the original `network` reading is right.
    if (RETRYABLE_STATUSES.has(res.status) && res.status !== 429) {
      throw new ApiNetworkError(MESSAGES.unavailable, 'unavailable', { retryable: true, status: res.status });
    }
    if (res.status >= 500) {
      throw new ApiNetworkError(MESSAGES.server, 'server', { retryable: true, status: res.status });
    }
    throw new ApiNetworkError(MESSAGES.network, 'network', { retryable: true, status: res.status });
  }
}

/** True for an error this module raised, whatever the caller has since done to it. */
export const isNetworkError = (err) => !!err?.isNetworkError;

/**
 * The message to show for any error, network or application.
 *
 * One helper so no screen has to decide for itself whether `err.message` is
 * presentable — every error that reaches a student passes through here.
 */
export function friendlyMessage(err, fallback = 'Something went wrong. Please try again.') {
  if (!err) return fallback;
  if (isNetworkError(err)) return err.message;
  if (err.status >= 500) return MESSAGES.server;
  return err.message || fallback;
}
