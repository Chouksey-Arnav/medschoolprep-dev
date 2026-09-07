// ─────────────────────────────────────────────────────────────────────────────
// Persistence for the opportunity layer.
//
// Two tables, and the split between them is the point:
//
//   discovered_opportunities  the records themselves. One row per program a
//                             student's Medabrain proposed, with a verification
//                             state that ONLY an operator can advance.
//   recommendation_feedback   what the student did about a record — every save,
//                             decline, pause, "too far away" and free-text note,
//                             each its own timestamped row.
//
// ── Why every function here fails soft ──────────────────────────────────────
// Same contract as roadmap/store.js and masterPlanStore.js, for the same
// reason: this is an UPGRADE over a working local experience, never a
// dependency of it. A student who is offline, signed out, or on a deployment
// where the migration has not been applied still gets a fully working
// opportunity feed from the curated catalogs — they just do not get discovery
// or a synced feedback history. So a failed write resolves to a benign value
// and the caller carries on; it never throws into a render.
//
// The one exception is `recordAction`, which returns its error to the caller,
// because a student who presses "Decline" and is silently ignored will press it
// again and again, and a toast that says "we could not save that" is the honest
// outcome there.
// ─────────────────────────────────────────────────────────────────────────────

import { listItems, createItem, updateItem, deleteItem } from '../dataApi.js';
import { fromDiscoveredRow } from './adapt.js';
import { feedbackRowFor, ACTION_BY_ID, indexFeedback } from './feedback.js';

export const DISCOVERED_RESOURCE = 'discovered_opportunities';
export const FEEDBACK_RESOURCE = 'recommendation_feedback';

/** Set once the API says the table is not there, so we stop asking on every render. */
let discoveryUnavailable = false;

/** True when this deployment has the discovery table. Drives whether the UI offers discovery at all. */
export const discoveryAvailable = () => !discoveryUnavailable;

/**
 * Every discovered record on this account, adapted.
 * Resolves to [] on any failure — including a 404 from a deployment without
 * migration 0028, which flips `discoveryUnavailable` so the UI can hide the
 * feature rather than showing a button that cannot work.
 */
export async function loadDiscovered() {
  if (discoveryUnavailable) return [];
  try {
    const rows = await listItems(DISCOVERED_RESOURCE);
    return (rows || []).map(fromDiscoveredRow).filter(Boolean);
  } catch (err) {
    if (/404|not found|unknown resource/i.test(String(err?.message || ''))) discoveryUnavailable = true;
    return [];
  }
}

/**
 * Write one discovered record.
 *
 * `verification_state` is hard-coded to 'needs_verification' rather than taken
 * from the record. There is no argument to this function that can produce a
 * verified row, and that is deliberate — see the header of discovery.js.
 */
export async function saveDiscovered(record) {
  if (!record?.id || !record?.name || discoveryUnavailable) return null;
  try {
    const row = await createItem(DISCOVERED_RESOURCE, {
      slug: String(record.id).slice(0, 120),
      name: String(record.name).slice(0, 200),
      org: record.org ? String(record.org).slice(0, 200) : null,
      url: record.url || null,
      category: record.category || null,
      verification_state: 'needs_verification',
      source_label: record.sourceLabel || null,
      confidence: record.discoveryConfidence || 'low',
      // The whole record travels in `payload` so a schema addition never needs a
      // migration: this table's columns are the ones the APP needs to query on,
      // and everything else is the record we already know how to normalize.
      payload: record,
      source: 'ai_summary',
    });
    return fromDiscoveredRow(row);
  } catch { return null; }
}

/** Save a batch, skipping anything that fails. Returns what actually landed. */
export async function saveDiscoveredBatch(records = []) {
  const out = [];
  for (const r of records) {
    const saved = await saveDiscovered(r);
    if (saved) out.push(saved);
  }
  return out;
}

/**
 * The internal verification path.
 *
 * Not reachable from the student UI and deliberately so: a student marking
 * their own AI-discovered record "verified" would defeat the entire point of
 * the state existing. This is the seam an operator tool (or a future admin
 * surface) writes through, and it is the only way `verified_at` is ever set.
 *
 * @param {string} rowId
 * @param {'verified'|'in_review'|'rejected'|'needs_verification'} state
 * @param {object} patch  corrections a verifier made while checking
 */
export async function setVerificationState(rowId, state, { patch = null, verifiedAt = null } = {}) {
  if (!rowId || discoveryUnavailable) return null;
  const allowed = ['verified', 'in_review', 'rejected', 'needs_verification'];
  if (!allowed.includes(state)) throw new Error(`Unknown verification state: ${state}`);
  try {
    const body = {
      verification_state: state,
      // Only a 'verified' transition stamps a date. A rejection or a re-open
      // must not leave a check date behind that would later read as freshness.
      verified_at: state === 'verified' ? (verifiedAt || new Date().toISOString().slice(0, 10)) : null,
    };
    if (patch) body.payload = patch;
    const row = await updateItem(DISCOVERED_RESOURCE, rowId, body);
    return fromDiscoveredRow(row);
  } catch { return null; }
}

/** Archive a discovered record — an operator's "this is over" without deleting the history. */
export async function archiveDiscovered(rowId) {
  if (!rowId || discoveryUnavailable) return null;
  try {
    const row = await updateItem(DISCOVERED_RESOURCE, rowId, { archived_at: new Date().toISOString() });
    return fromDiscoveredRow(row);
  } catch { return null; }
}

/** Remove a discovered record entirely. The student's own "I don't want this in my list". */
export async function removeDiscovered(rowId) {
  if (!rowId || discoveryUnavailable) return false;
  try { await deleteItem(DISCOVERED_RESOURCE, rowId); return true; }
  catch { return false; }
}

// ── Actions and feedback ─────────────────────────────────────────────────────

/**
 * Record one action on one opportunity.
 *
 * ALWAYS a new row, never an update. "I saved this in September and declined it
 * in January" is two facts about a student and the second must not erase the
 * first — the ranker reads the latest row per item (see indexFeedback) and the
 * history stays queryable behind it.
 *
 * @returns {Promise<{ ok, row, error }>}
 */
export async function recordAction(record, actionId, { note = '', category = null } = {}) {
  const action = ACTION_BY_ID[actionId];
  if (!action) return { ok: false, row: null, error: `Unknown action: ${actionId}` };
  const body = feedbackRowFor(record, actionId, { note, category: category || record?.category || null });
  if (!body) return { ok: false, row: null, error: 'Nothing to record.' };
  try {
    const row = await createItem(FEEDBACK_RESOURCE, body);
    return { ok: true, row, error: null };
  } catch (err) {
    return { ok: false, row: null, error: err?.message || 'Could not save that.' };
  }
}

/** Every feedback row on this account, already indexed for the ranker. */
export async function loadFeedbackIndex() {
  try {
    const rows = await listItems(FEEDBACK_RESOURCE);
    return indexFeedback(rows || []);
  } catch {
    return indexFeedback([]);
  }
}

/** The raw rows, for the "what have I said about things" history view. */
export async function loadFeedbackRows() {
  try { return (await listItems(FEEDBACK_RESOURCE)) || []; }
  catch { return []; }
}
