// ─────────────────────────────────────────────────────────────────────────────
// The thing that notices another device.
//
// ── What was broken ─────────────────────────────────────────────────────────
// A student with the app open on a phone and on a laptop had two tabs that
// could not see each other. progressSync.js is careful and correct about
// *writes* — it refuses a push that would clobber work this device has never
// seen, and it reconciles when a backgrounded tab comes back — but every one of
// its triggers is something the student does. Two open, idle tabs do nothing,
// so neither one ever learns that the other moved, and they stay quietly
// divergent until somebody reloads. Everything on the server-authoritative path
// (colleges, activities, service_logs, the 0026 student-intelligence tables) was
// worse still: fetched once into the Portfolio snapshot and cached with nothing
// anywhere that could invalidate it.
//
// ── Why polling ─────────────────────────────────────────────────────────────
// A push socket is the obvious answer and it is not available here. Auth is
// custom (app_users/sessions — there is no auth.uid()), every table is
// RLS-enabled with zero policies, and all per-user scoping happens in
// application code behind the service-role key. A browser Realtime subscription
// authenticates with the anon key, so making one work would mean opening these
// tables to anon — every student's rows readable by every other student. The
// signal comes back through our own authenticated API instead, and
// /api/sync-state is deliberately built to be cheap enough to ask constantly:
// two indexed lookups, three scalars, no payload.
//
// So: this is a poll, and the UI must never call it realtime. What it honestly
// guarantees is "checks for changes from your other devices every few seconds
// while this tab is open."
//
// ── What it costs, and how that is kept small ───────────────────────────────
// Every open tab asking a question every few seconds forever is exactly how a
// well-meaning sync feature becomes a load problem, so three things bound it:
// it stops dead when the tab is hidden (a backgrounded tab has no screen to be
// wrong on, and installLifecycleFlush already reconciles on the way back), it
// backs off toward half a minute while nothing is changing, and it snaps back
// to fast the moment anything actually moves — which is precisely when a
// student is likely to be watching two devices at once.
// ─────────────────────────────────────────────────────────────────────────────
import { getToken } from './authApi';
import { apiFetch, parseJson } from './http.js';
import * as ProgressSync from './progressSync';

// The fast end is the perceived latency of the whole feature: a service hour logged on a phone
// shows up on the laptop about this long later. The slow end is what an idle pair of tabs
// settles to. Between them the interval grows geometrically, so a tab nobody is using converges
// on the cheap cadence within a few polls instead of hammering the endpoint all afternoon.
const FAST_MS = 8000;
const SLOW_MS = 30000;
const GROWTH = 1.5;

// A failing poll is not a user-facing error — local state is still valid and every write path
// still works — so it is never surfaced, only slowed down. Its own ladder, separate from the
// quiet-backoff above, because "the server is unreachable" deserves more room than "nothing has
// changed lately", and because a poll storm against a struggling server is how a brief outage
// becomes a long one.
const ERROR_MS = [15000, 30000, 60000, 120000];

let timer = null;
let running = false;
let interval = FAST_MS;
let errorAttempt = 0;
let polling = false;

// The last data version this tab has acted on. null means "not established yet" — the first poll
// of a session records whatever the server has WITHOUT announcing a change, because everything
// on screen was loaded from that same server moments earlier and a refetch would be pure noise.
let lastDataVersion = null;

// A reconcile is slow (a push, a pull and a full two-sided merge) and can easily outlast a poll
// interval. Without this, a rev that stays ahead for a few seconds would start a second and third
// reconcile on top of the first.
let reconciling = false;

let unsubscribeStatus = null;

// ── Telling the UI that server-side data changed ─────────────────────────────
// Follows progressSync.js's REMOTE_MERGE_EVENT precedent: a plain DOM CustomEvent, so this module
// stays free of React and any number of unrelated surfaces can listen without knowing about each
// other. Unlike the progress merge — which asks before reloading, because it can land mid-lesson
// — this one is safe to act on silently: refetching rows a student is not currently editing
// changes nothing they can see except the numbers becoming right.
export const REMOTE_DATA_EVENT = 'msp:remote-data-changed';

async function fetchState() {
  const token = getToken();
  if (!token) throw new Error('Not signed in.');
  // apiFetch's own retries are turned off here. It exists to make a one-shot request survive a
  // flaky network, but this request is repeated on a timer by design: a poll that fails has
  // already been "retried" by the next tick, and layering backoff on backoff would only mean a
  // single dropped packet holds the connection for the better part of a minute.
  const res = await apiFetch('/sync-state', {
    method: 'GET',
    retries: 0,
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await parseJson(res).catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Sync check failed.');
  return data;
}

function notifyRemoteData() {
  try { window.dispatchEvent(new CustomEvent(REMOTE_DATA_EVENT)); } catch { /* no DOM */ }
}

/** True when there is any point asking: a visible tab, signed in, with a network. */
function shouldPoll() {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  return !!getToken();
}

function schedule(ms) {
  clearTimeout(timer);
  if (!running) return;
  timer = setTimeout(runPoll, ms);
}

/** Back to the fast cadence — something moved, so more is likely about to. */
function quicken() {
  interval = FAST_MS;
  errorAttempt = 0;
  if (running) schedule(FAST_MS);
}

async function runPoll() {
  if (!running) return;
  // Not an error and not a reason to back off: the tab went hidden or the network dropped between
  // scheduling and firing. Come back at the same cadence and check again.
  if (!shouldPoll()) { schedule(interval); return; }
  if (polling) { schedule(interval); return; }
  polling = true;
  try {
    const { rev, dataVersion } = await fetchState();
    let changed = false;

    // progressSync owns the rev — asking it rather than keeping a copy here means this can never
    // disagree with the value the next push will actually be validated against. A null base means
    // this device has not pulled yet (pre-boot, or a failed initial pull), in which case there is
    // no "advanced past" to detect and the boot path is about to establish one anyway.
    const base = ProgressSync.getBaseRev();
    if (base != null && rev != null && Number(rev) > Number(base) && !reconciling) {
      changed = true;
      reconciling = true;
      // force: true because reconcileNow otherwise declines to pull if it looked recently — a
      // sensible rule for a foreground reconcile that fires on every tab switch, and the wrong
      // one here, where we have positive evidence that the server is ahead.
      ProgressSync.reconcileNow({ force: true })
        .catch(() => { /* progressSync surfaces its own sync status; a failed pull retries there */ })
        .finally(() => { reconciling = false; });
    }

    if (dataVersion != null) {
      const seen = lastDataVersion;
      lastDataVersion = dataVersion;
      if (seen != null && dataVersion !== seen) { changed = true; notifyRemoteData(); }
    }

    errorAttempt = 0;
    if (changed) interval = FAST_MS;
    else interval = Math.min(Math.round(interval * GROWTH), SLOW_MS);
    schedule(interval);
  } catch {
    // Quietly. A student whose wifi hiccuped does not need to be told that a background check
    // they never asked for did not happen.
    const delay = ERROR_MS[Math.min(errorAttempt, ERROR_MS.length - 1)];
    errorAttempt += 1;
    schedule(delay);
  } finally {
    polling = false;
  }
}

function onVisibility() {
  if (!running) return;
  if (document.visibilityState === 'visible') quicken();
  else clearTimeout(timer);   // hidden tabs cost nothing; installLifecycleFlush covers the return
}
function onOnline() { if (running) quicken(); }

/**
 * Begins polling for changes from this student's other devices. Idempotent — calling it twice
 * does not produce two pollers.
 */
export function startLiveSync() {
  if (running || typeof window === 'undefined') return;
  running = true;
  interval = FAST_MS;
  errorAttempt = 0;
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('online', onOnline);
  // A local write means this student is actively working, which is both when they are most
  // likely to have a second device open and when a stale other tab is most likely to push
  // something stale. Riding progressSync's existing status broadcast keeps every call site
  // that already schedules a push from having to also remember to tell this module.
  unsubscribeStatus = ProgressSync.subscribeSyncStatus((status) => {
    if (status?.state === 'pending') quicken();
  });
  schedule(FAST_MS);
}

/**
 * Stops polling and forgets what this account's version was.
 *
 * The reset is the same reasoning as progressSync's resetSyncStatus: a data version belongs to
 * whoever was signed in when it was recorded. Carrying one across a sign-out would mean the next
 * account's first poll compares its own version against a stranger's and refetches — or, worse,
 * happens to match and suppresses a change that was real.
 */
export function stopLiveSync() {
  running = false;
  clearTimeout(timer);
  timer = null;
  lastDataVersion = null;
  interval = FAST_MS;
  errorAttempt = 0;
  if (typeof window !== 'undefined') {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('online', onOnline);
  }
  unsubscribeStatus?.();
  unsubscribeStatus = null;
}
