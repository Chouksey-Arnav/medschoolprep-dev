// Cross-device sync for study progress that used to live only in this browser's IndexedDB (see
// db.js's "Cross-device progress sync" section for the merge logic and api/progress-sync.js for
// the server side). Pulled once on sign-in, then pushed back on a short debounce after local
// writes — db.js calls scheduleSyncPush() (registered as its dirty listener) any time a synced
// table changes, so App.jsx doesn't need to remember to trigger a push at every call site.
import { getToken } from './authApi';
import { apiFetch, parseJson } from './http.js';
import * as DB from './db';

const PUSH_DEBOUNCE_MS = 4000;
let pushTimer = null;
let pushing = false;
let pushAgainAfter = false;

// ── Self-healing retry ───────────────────────────────────────────────────────
// A transient failure (flaky wifi, a cold serverless function, a dropped request) used to leave
// sync stuck in the 'error' state until the student happened to make another local write. That's
// the "Sync couldn't reach the server" message people were seeing and reading as "my progress is
// lost." Instead we now auto-retry a failed push a few times with exponential backoff, and re-flush
// the moment the browser reports it's back online — so the error state clears itself without the
// student having to do anything. Local IndexedDB is always the source of truth in the meantime, so
// nothing is ever lost; sync just catches up when it can.
const RETRY_DELAYS_MS = [2000, 5000, 15000, 45000];
let retryTimer = null;
let retryAttempt = 0;
function scheduleRetry() {
  clearTimeout(retryTimer);
  if (retryAttempt >= RETRY_DELAYS_MS.length) return; // give up quietly; next local write or `online` will retry
  const delay = RETRY_DELAYS_MS[retryAttempt++];
  retryTimer = setTimeout(() => { flushNow().catch(() => {}); }, delay);
}

// ── Sync status pub-sub ─────────────────────────────────────────────────────
// Lightweight status broadcast so the UI (Settings' "Synced just now" line)
// can reflect what's actually happening instead of the sync layer being a
// black box. Not persisted — resets to 'idle' on every fresh page load,
// which is fine since a pull/push cycle always runs again on init.
let syncStatus = { state: 'idle', lastSyncedAt: null, error: null };
const statusListeners = new Set();
function setStatus(patch) {
  syncStatus = { ...syncStatus, ...patch };
  statusListeners.forEach((fn) => { try { fn(syncStatus); } catch { /* listener's problem */ } });
}
export function getSyncStatus() { return syncStatus; }
export function resetSyncStatus() {
  // The concurrency state is per-account, not per-tab: a rev and a snapshot
  // fingerprint belong to whoever was signed in when they were recorded. Carrying
  // either across a sign-out would let the next account's first push be validated
  // against the previous account's revision, or — worse — be skipped as a
  // duplicate of a snapshot that was never theirs.
  baseRev = null;
  lastPushedHash = null;
  lastPullAt = 0;
  setStatus({ state: 'idle', lastSyncedAt: null, error: null });
}
export function subscribeSyncStatus(fn) {
  statusListeners.add(fn);
  fn(syncStatus);
  return () => statusListeners.delete(fn);
}

async function req(path, options = {}) {
  const token = getToken();
  if (!token) throw new Error('Not signed in.');
  // apiFetch, not fetch: a request that dies in transit on a flaky or filtered
  // network is retried with backoff instead of failing the whole sync with the
  // browser's own "Failed to fetch". See src/lib/http.js.
  const res = await apiFetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  const data = await parseJson(res).catch(() => ({}));
  if (!res.ok) {
    // `status` and `body` ride along so flushNow can tell a 409 (a refused write —
    // recoverable, and the body carries what to recover from) apart from a genuine
    // failure. Without them the only honest reading of any error is "sync is down".
    const err = new Error(data.error || 'Request failed.');
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

// ── Optimistic concurrency ───────────────────────────────────────────────────
// The revision this device last saw the server at. Sent as the base of every push
// so the server can refuse a write that would erase progress this device has never
// seen — see supabase/migrations/0024_progress_sync_concurrency.sql for the whole
// account of what that fixes. null means "no base", which is only true before the
// first pull of a session and is accepted unconditionally.
let baseRev = null;

// Fingerprint of the last snapshot the server accepted from this device. A push
// whose snapshot is byte-identical to that one, carrying no counter delta, has
// nothing to say and is skipped entirely.
//
// This is not only a bandwidth saving, though it is a large one — installLifecycleFlush
// below pushes on every `visibilitychange` and `pagehide` whether or not anything
// changed, so a student who switches apps ten times sends ten identical snapshots.
// It is also a correctness fix: an idle tab holding a stale snapshot pushed that
// snapshot merely by being backgrounded. The rev check refuses those now, but not
// sending them at all is better than being told no.
let lastPushedHash = null;

// djb2. Not cryptographic and does not need to be — a collision costs one
// unnecessary push, which is precisely what the un-hashed code did every time.
function hashOf(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (((h << 5) + h) ^ str.charCodeAt(i)) >>> 0;
  return `${h.toString(36)}:${str.length}`;
}

// Fetches this account's latest snapshot, or null if it has never synced before (brand new
// account, or a pre-sync-feature account that hasn't pushed yet). Records the server's rev
// as this device's push base — deliberately a side effect rather than part of the return
// value, so callers (App.jsx's boot path) keep passing the snapshot straight to
// DB.applyRemoteSnapshot as they always have.
export async function pullSnapshot() {
  setStatus({ state: 'syncing', error: null });
  try {
    const { data, rev } = await req('/progress-sync', { method: 'GET' });
    baseRev = rev ?? null;
    lastPushedHash = null;   // a fresh base; the next push is meaningful whatever it contains
    lastPullAt = Date.now();
    setStatus({ state: 'synced', lastSyncedAt: Date.now(), error: null });
    return data || null;
  } catch (err) {
    setStatus({ state: 'error', error: err.message || 'Sync failed.' });
    throw err;
  }
}

// Pushes the current local state immediately. Coalesces overlapping calls (if a push is already
// in flight when another is requested, one more run happens right after instead of firing two
// requests concurrently against the same row).
//
// xp/aiChatCount/interviewCount/cardReviewCount ride along as an additive delta (DB.claimSyncDelta),
// not as part of the plain last-write-wins snapshot merge everything else here uses — see db.js's
// mergeUserRecord comment for why a Math.max(local, remote) merge on these four fields was the
// root cause of "XP earned on one device doesn't add up with another device's." Claim/commit is
// deliberately its own step around the request (not inside buildSyncSnapshot) so a failed request
// releases the claim instead of losing it.
// A conflict is resolved by merging and pushing again, and that retry can itself
// conflict if a third device is writing at the same moment. Bounded so a pathological
// case degrades into the ordinary error path (and its backoff ladder) instead of
// spinning: two rounds is already more contention than a single student's devices
// can realistically produce.
const MAX_CONFLICT_ROUNDS = 2;

export async function flushNow(opts = {}) {
  if (pushing) { pushAgainAfter = true; return; }
  pushing = true;
  setStatus({ state: 'syncing', error: null });
  try {
    for (let round = 0; ; round++) {
      // Re-claimed each round on purpose: resolving a conflict rebases the counter
      // baseline against the server's authoritative totals, so a delta claimed
      // before the merge is not the delta that should be sent after it.
      const counterDeltas = await DB.claimSyncDelta().catch(() => null);
      try {
        const snapshot = await DB.buildSyncSnapshot();
        const hash = hashOf(JSON.stringify(snapshot));

        // Nothing to say: the snapshot is identical to the one the server already
        // holds from this device, and there is no counter increment riding along.
        // Sending it would be a round trip to reassert the status quo.
        if (!counterDeltas && lastPushedHash && hash === lastPushedHash) {
          retryAttempt = 0;
          clearTimeout(retryTimer);
          setStatus({ state: 'synced', lastSyncedAt: Date.now(), error: null });
          return;
        }

        if (counterDeltas) snapshot.user = { ...(snapshot.user || {}), counterDeltas };
        const { counters, rev } = await req('/progress-sync', {
          method: 'PUT',
          body: JSON.stringify({ data: snapshot, baseRev }),
          keepalive: !!opts.keepalive,
        });
        if (counterDeltas) await DB.commitSyncDelta(true);
        baseRev = rev ?? baseRev;
        lastPushedHash = hash;
        // The response reflects every device's contributions, including any that landed since
        // this device's last pull. Absorb it immediately (bumping local counters up, never down
        // — this device may have earned more locally during the round trip) so cross-device XP
        // catches up live instead of only on the next full reload. See db.js's
        // absorbAuthoritativeCounters for why this must also advance the local baseline, not
        // just the displayed value.
        await DB.absorbAuthoritativeCounters(counters).catch(() => {});
        retryAttempt = 0;            // success clears the backoff ladder
        clearTimeout(retryTimer);
        setStatus({ state: 'synced', lastSyncedAt: Date.now(), error: null });
        return;
      } catch (err) {
        // ── A refused write, not a failed one ──────────────────────────────────
        // 409 means another device wrote since this one last looked, so this push
        // would have erased work this device has never seen. That is the whole
        // "my phone and my laptop disagree" bug, and it is recoverable: the
        // response carries the server's current snapshot, so merge it in and push
        // again from the new base. It cannot be left to the retry ladder below —
        // a plain retry would resend the same stale base and be refused forever.
        if (err?.status === 409 && round < MAX_CONFLICT_ROUNDS) {
          // Released rather than committed: the increment is still sitting in the
          // local user record, and absorbConflict re-anchors it on top of the
          // server's total so the next round reports it exactly once.
          if (counterDeltas) await DB.commitSyncDelta(false).catch(() => {});
          await absorbConflict(err.body, counterDeltas);
          continue;
        }
        if (counterDeltas) await DB.commitSyncDelta(false).catch(() => {});
        // A conflict this device could not resolve leaves its base untrustworthy.
        // Dropping it means the next attempt is accepted unconditionally, which is
        // wrong; forcing a fresh pull first is what the retry ladder and the
        // foreground reconcile below both do.
        if (err?.status === 409) baseRev = err.body?.rev ?? null;
        setStatus({ state: 'error', error: err.message || 'Sync failed.' });
        scheduleRetry();             // self-heal instead of staying stuck on 'error'
        throw err;
      }
    }
  } finally {
    pushing = false;
    if (pushAgainAfter) {
      pushAgainAfter = false;
      flushNow().catch(() => {});
    }
  }
}

/**
 * Folds a refused push's server snapshot into local Dexie so the retry pushes a
 * genuine union of both devices rather than one device's view of the world.
 *
 * DB.applyRemoteSnapshot is a real two-sided merge — it has always been written to
 * reconcile two independent devices (highest quiz score wins, earliest completion
 * wins, flashcards union by front+back with the more-studied FSRS state kept,
 * streak credits add) — it simply never ran anywhere except at boot, because
 * nothing else ever handed it a remote snapshot.
 *
 * Counters are the one thing it cannot merge on its own, and are handled after it
 * by DB.rebaseCountersAfterRemoteMerge: see that function for why the increment
 * this push had already claimed has to be re-applied on top of the server's total
 * rather than simply released.
 */
async function absorbConflict(body, claimedDeltas) {
  const remote = body?.data || null;
  const syncWasEnabled = DB.isSyncEnabled();
  // Same discipline as the boot path: the merge writes to every synced table, and
  // each of those writes would otherwise schedule a push of its own half-merged
  // intermediate state.
  DB.setSyncEnabled(false);
  try {
    if (remote) await DB.applyRemoteSnapshot(remote);
    await DB.rebaseCountersAfterRemoteMerge(claimedDeltas);
  } finally {
    DB.setSyncEnabled(syncWasEnabled);
  }
  baseRev = body?.rev ?? null;
  lastPushedHash = null;   // local state has moved; the next push is meaningful
  notifyRemoteMerge();
}

// ── Telling the UI that local data changed underneath it ─────────────────────
// App.jsx reads Dexie once at mount and holds the result in React state, so a
// merge that lands mid-session is invisible until something re-reads. Rather than
// reach into that state from here (or reload the page under someone mid-lesson),
// this announces the fact and lets the UI decide — src/App.jsx listens and offers
// a refresh. A plain DOM event keeps this module free of any React dependency.
export const REMOTE_MERGE_EVENT = 'msp:remote-progress-merged';
function notifyRemoteMerge() {
  try { window.dispatchEvent(new CustomEvent(REMOTE_MERGE_EVENT)); } catch { /* no DOM */ }
}

// Called once per app load, right after applyRemoteSnapshot() has merged a freshly-pulled
// snapshot into local Dexie — re-anchors the local delta baseline to what the server already has,
// so the first push of the session reports only genuinely new local progress instead of
// re-reporting this device's entire existing total (see db.js's resetSyncBaseline for the full
// "why this migrates safely with no special-casing" reasoning).
export async function resetSyncBaseline(user) {
  return DB.resetSyncBaseline(user);
}

// Registered with DB.setSyncDirtyListener — called (a lot, potentially) after any write to a
// synced table. Debounced so a burst of writes (e.g. finishing a 20-card review session)
// collapses into a single network call a few seconds after things go quiet. A fresh local change
// also resets the retry ladder so a pending backoff doesn't delay syncing brand-new work.
export function scheduleSyncPush() {
  retryAttempt = 0;
  clearTimeout(retryTimer);
  setStatus({ state: 'pending', error: null });
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { flushNow().catch(() => {}); }, PUSH_DEBOUNCE_MS);
}

// User-initiated "Retry sync now" (Settings) — resets the backoff ladder and pushes immediately.
export function retrySyncNow() {
  retryAttempt = 0;
  clearTimeout(retryTimer);
  return flushNow();
}

// ── Coming back to a tab ─────────────────────────────────────────────────────
// Before this, a snapshot was pulled exactly once, at mount. A tab left open all
// day therefore had no way to learn that anything had happened anywhere else, and
// the student's own laptop was as invisible to it as a stranger's machine — which
// is what "my phone shows something different" looks like from the inside.
//
// Reconciling on foreground is the natural fix, because the moment a student
// returns to a tab is exactly the moment they are about to look at their numbers.
// Push first (so this device's work is on the record), then pull and merge.
let lastPullAt = 0;
const FOREGROUND_PULL_AFTER_MS = 60 * 1000;

/**
 * Pulls the server's snapshot and merges it into local Dexie. Safe to call at any
 * time; a no-op if this device has looked recently, or if it is offline.
 *
 * The merge is DB.applyRemoteSnapshot — the same two-sided reconcile the boot path
 * uses — followed by the counter re-anchor, so an account that has been studied on
 * two devices converges to the union rather than to whichever pushed last.
 */
export async function reconcileNow({ force = false } = {}) {
  if (!getToken()) return false;
  if (!force && Date.now() - lastPullAt < FOREGROUND_PULL_AFTER_MS) return false;

  // This device's own pending work goes up BEFORE anything comes down, and the
  // pull is abandoned if it does not. That ordering is load-bearing, not tidiness:
  // merging a remote snapshot re-anchors the counter baseline to the server's
  // totals, so doing it while this device still holds unreported progress would
  // discard exactly that progress. If the push failed we are almost certainly
  // offline, in which case there is nothing to pull either — leave local Dexie
  // alone as the source of truth and let the retry ladder come back to it.
  try {
    await flushNow();
  } catch {
    return false;
  }

  const remote = await pullSnapshot();          // records the new baseRev as a side effect
  if (!remote) return false;
  const syncWasEnabled = DB.isSyncEnabled();
  DB.setSyncEnabled(false);                     // the merge writes to every synced table
  try {
    await DB.applyRemoteSnapshot(remote);
    await DB.rebaseCountersAfterRemoteMerge(null);
  } finally {
    DB.setSyncEnabled(syncWasEnabled);
  }
  lastPushedHash = null;
  notifyRemoteMerge();
  return true;
}

// Best-effort safety net: flush immediately when the tab is backgrounded or closed, so a burst
// of progress right before a student switches devices isn't stuck behind the debounce window.
let lifecycleInstalled = false;
export function installLifecycleFlush() {
  if (lifecycleInstalled || typeof document === 'undefined') return;
  lifecycleInstalled = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { flushNow({ keepalive: true }).catch(() => {}); return; }
    // Coming back to a foregrounded tab is the other natural moment to reconcile. This used to
    // flush only when sync had drifted into an error or pending state — i.e. it only ever pushed,
    // and only when something was already wrong. It now also pulls, which is the half that was
    // missing: a tab that has been backgrounded for a while is a tab whose picture of the account
    // may be hours out of date, and the student is looking at it right now.
    reconcileNow().catch(() => {});
  });
  window.addEventListener('pagehide', () => { flushNow({ keepalive: true }).catch(() => {}); });
  // Regaining connectivity is the single most reliable signal that a failed sync can now succeed —
  // re-flush immediately (resetting the backoff ladder) so "Sync couldn't reach the server" clears
  // itself the instant the network is back. Also a moment worth reconciling on: an offline stretch
  // is precisely when another device may have moved ahead.
  window.addEventListener('online', () => {
    retryAttempt = 0;
    clearTimeout(retryTimer);
    reconcileNow({ force: true }).catch(() => {});
  });
}
