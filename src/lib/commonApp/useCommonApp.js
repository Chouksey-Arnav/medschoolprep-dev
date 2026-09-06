// ─────────────────────────────────────────────────────────────────────────────
// The one hook that owns the Common App mirror's live state.
//
// Everything under src/lib/commonApp/ is pure by design so it can be verified
// under plain Node. This file is where that purity meets React and persistence,
// and it is deliberately the only such place: one derivation, one ledger, one
// writer. Before it existed the temptation was for each Portfolio panel to
// derive its own badge from its own rows, which would have produced exactly the
// failure the shared portfolio snapshot was created to end — several surfaces
// reasoning over different reads of the same account and disagreeing.
//
// ── Where the ledger lives, and why there ────────────────────────────────────
// On the user record, riding the existing progress-sync snapshot, exactly as
// `user.roadmap` and `user.masterPlan` already do. It is small (hashes and
// timestamps, never the student's text), it is per-student, it has to survive a
// device change, and it has no reason to be a table of its own. Following the
// established pattern also means it inherits cross-device sync for free rather
// than needing a migration nobody would remember to apply.
//
// ── The debounce ─────────────────────────────────────────────────────────────
// Marking a section's worth of fields as copied is a dozen writes in a second.
// The local copy is authoritative between them, so they coalesce into one save,
// the same way the roadmap store handles step-ticking.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { deriveApplication } from './derive.js';
import {
  reconcile, normalizeState, markFilled, markSectionFilled, clearFilled,
  setOverride, clearOverride, keepOverride, setSectionMark, forgetOrphans,
  adoptCommonAppWording,
} from './sync.js';

const SAVE_DEBOUNCE_MS = 1500;

/**
 * @param {object} user      the local user record (carries `commonApp`)
 * @param {function} persist  (ledger) => void — writes the ledger onto the user
 *        record. A CALLBACK rather than the app's `saveUser` directly, because
 *        saveUser takes the WHOLE user object and this hook does not hold one:
 *        handing it `{ commonApp }` would replace the record with a single key
 *        and delete the student's account in the process. The caller owns the
 *        merge, because the caller is the one with the current user in scope.
 * @param {object} snapshot  a portfolio snapshot, or null while loading
 * @returns everything the mirror and every panel badge needs
 */
export function useCommonApp(user, persist, snapshot) {
  // The ledger is held locally and mirrored to the user record on a debounce, so
  // a rapid sequence of marks feels instant and costs one write.
  const [ledger, setLedger] = useState(() => normalizeState(user?.commonApp));
  const saveTimer = useRef(null);
  const pending = useRef(null);

  // Adopt a newer ledger arriving from another device. Guarded on updatedAt so a
  // round-trip of our own save cannot clobber an edit made since — the same
  // last-writer-wins-by-stamp rule the roadmap store uses.
  useEffect(() => {
    const remote = normalizeState(user?.commonApp);
    setLedger((local) => (remote.updatedAt > local.updatedAt ? remote : local));
  }, [user?.commonApp]);

  const flush = useCallback(() => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    const next = pending.current;
    pending.current = null;
    if (next && persist) persist(next);
  }, [persist]);

  const commit = useCallback((next) => {
    setLedger(next);
    pending.current = next;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      const blob = pending.current;
      pending.current = null;
      if (blob && persist) persist(blob);
    }, SAVE_DEBOUNCE_MS);
  }, [persist]);

  // A pending save must not be lost to a tab close or an unmount. Without this,
  // the last thing a student did before navigating away is the thing most likely
  // to be dropped, which is the worst possible field to drop.
  useEffect(() => () => flush(), [flush]);
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
    };
  }, [flush]);

  const application = useMemo(
    () => deriveApplication({ snapshot: snapshot || {}, user: user || {} }),
    [snapshot, user],
  );

  const sync = useMemo(() => reconcile(application.sections, ledger), [application.sections, ledger]);

  const actions = useMemo(() => ({
    markFilled: (key, value) => commit(markFilled(ledger, key, value)),
    markSectionFilled: (sectionId) => commit(markSectionFilled(ledger, sectionId, sync.fields)),
    clearFilled: (key) => commit(clearFilled(ledger, key)),
    setOverride: (key, text) => commit(setOverride(ledger, key, text, sync.fields[key]?.value ?? '')),
    clearOverride: (key) => commit(clearOverride(ledger, key)),
    keepOverride: (key) => commit(keepOverride(ledger, key, sync.fields[key]?.value ?? '')),
    setSectionMark: (sectionId, status) => commit(setSectionMark(ledger, sectionId, status)),
    forgetOrphans: (keys) => commit(forgetOrphans(ledger, keys)),
    // Returns the intent WITHOUT writing to the Portfolio — see the direction
    // rule in sync.js. The caller performs the Portfolio update and then calls
    // clearOverride, because only the caller knows how to write to the row.
    adopt: (key) => adoptCommonAppWording(ledger, key),
  }), [ledger, sync.fields, commit]);

  return { application, sync, ledger, actions, flush };
}
