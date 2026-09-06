// ─────────────────────────────────────────────────────────────────────────────
// The Portfolio ↔ Common Application sync.
//
// ── The hard constraint, stated first, because everything here follows from it
// THE COMMON APPLICATION HAS NO API. There is no integration to build. Nothing
// this app does can read what a student has typed into their real application,
// and nothing it does can write into it. Any design that quietly assumes
// otherwise ends in the worst possible failure for this feature: an app
// confidently reporting that a section is "synced" when the student never
// actually pasted anything, discovering it in January.
//
// So this is a sync in the sense a version control system is a sync, not in the sense
// a calendar integration is. There are two copies of the truth. One lives in the
// Portfolio and this app owns it. The other lives in the real application and
// only the student can see it. What this module maintains is the LEDGER between
// them: a per-field record of what the student told us they copied across and
// when, which is enough to answer the four questions that actually matter.
//
//   1. What have I not put into the real form yet?
//   2. What have I changed here since I put it there — so the real form is now
//      out of date?
//   3. Where have I deliberately worded it differently in the real form, and do
//      I want that wording back here?
//   4. Where have BOTH sides moved, so somebody has to choose?
//
// A student who can answer those four in October has a working sync. A student
// who is told "62% synced" by an app that cannot see their application has a
// number.
//
// ── The four states, and why 'overridden' exists ─────────────────────────────
//   'unfilled'   — the Portfolio has a value; the ledger says it was never
//                  copied across.
//   'synced'     — copied, and the Portfolio value still hashes to what was
//                  copied.
//   'drifted'    — copied, then the Portfolio changed. The real form is stale.
//                  This is the single most valuable state in the whole feature:
//                  it is invisible without a ledger, and it is exactly how a
//                  student ends up submitting an activity description they
//                  rewrote in November.
//   'overridden' — the student edited the Common App side directly, usually to
//                  cut something to 150 characters. The two copies differ ON
//                  PURPOSE. Without this state the system would nag forever
//                  about a difference the student created deliberately, and a
//                  sync that nags about intentional differences gets ignored,
//                  and a sync that gets ignored is worse than none.
//   'conflict'   — overridden AND the Portfolio moved since. Both sides changed
//                  and neither can be picked automatically.
//
// ── The direction rule ───────────────────────────────────────────────────────
// Portfolio → Common App is a SUGGESTION the student performs by pasting.
// Common App → Portfolio is an ADOPTION the student performs by asking.
// Neither direction ever happens on its own. This module returns intents; it
// never writes to the Portfolio, and adoptCommonAppWording() hands back a patch
// for the caller to apply rather than applying one. That is not timidity: an
// automatic write-back would let a 150-character compression silently become
// the student's permanent record of what they did, and the compressed version
// is a worse record — it exists to fit a form, not to be true.
//
// Pure functions over a plain state object. No React, no network, no storage —
// the state rides the user record exactly as the roadmap does.
// ─────────────────────────────────────────────────────────────────────────────

import { fieldKey, CA_SECTION_BY_ID } from './sections.js';
import { flattenFields } from './derive.js';

export const SYNC_VERSION = 1;

/**
 * FNV-1a over the field's text. Deliberately the same tiny hash the rest of the
 * codebase uses: it is not cryptographic and does not need to be. Its only job
 * is to answer "is this the same string the student copied?", and a 32-bit hash
 * collides on that question about once in four billion — which is a rate the
 * consequence (one field wrongly reported as synced) does not justify improving.
 *
 * Whitespace is normalized first, so re-wrapping a paragraph does not read as an
 * edit. A student who reflowed their essay has not changed it.
 */
export function hashValue(text) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

/** A fresh, empty ledger. */
export function emptyState() {
  return {
    version: SYNC_VERSION,
    updatedAt: 0,
    /** fieldKey → { at, hash } — what was copied into the real form, and when. */
    filled: {},
    /** fieldKey → { text, at, fromHash } — the student's Common-App-side wording. */
    overrides: {},
    /** sectionId → { status, at } — the student's own mark on a whole section. */
    sections: {},
  };
}

/**
 * Normalize whatever came off the user record into something safe to read.
 *
 * A stored blob can be from an older version, half-written by an interrupted
 * sync, or absent. Every one of those has to degrade to an empty ledger rather
 * than throw, because the failure mode of throwing here is a Portfolio tab that
 * will not render.
 */
export function normalizeState(raw) {
  const base = emptyState();
  if (!raw || typeof raw !== 'object') return base;
  return {
    ...base,
    updatedAt: Number(raw.updatedAt) || 0,
    filled: (raw.filled && typeof raw.filled === 'object' && !Array.isArray(raw.filled)) ? raw.filled : {},
    overrides: (raw.overrides && typeof raw.overrides === 'object' && !Array.isArray(raw.overrides)) ? raw.overrides : {},
    sections: (raw.sections && typeof raw.sections === 'object' && !Array.isArray(raw.sections)) ? raw.sections : {},
  };
}

const touch = (state) => ({ ...state, updatedAt: Date.now() });

// ── Reconciliation ───────────────────────────────────────────────────────────

/**
 * The state of one field, given what the Portfolio holds and what the ledger
 * remembers.
 *
 * `portfolioHash` is the hash of the CURRENT Portfolio value; `record` is the
 * ledger entry from when it was last copied; `override` is the student's
 * Common-App-side wording if they wrote one.
 */
export function fieldSyncState({ portfolioValue, record, override }) {
  const portfolioHash = hashValue(portfolioValue);
  const empty = !String(portfolioValue ?? '').trim();

  if (override) {
    // Both sides moved: they wrote a Common-App-side wording, and the Portfolio
    // value has changed since they wrote it. Nothing can pick between those.
    if (override.fromHash && override.fromHash !== portfolioHash) {
      return { status: 'conflict', portfolioHash };
    }
    return { status: 'overridden', portfolioHash };
  }
  if (!record) return { status: empty ? 'blank' : 'unfilled', portfolioHash };
  if (record.hash === portfolioHash) return { status: 'synced', portfolioHash };
  return { status: 'drifted', portfolioHash, filledHash: record.hash, filledAt: record.at };
}

/**
 * Reconcile a whole derived application against the ledger.
 *
 * Returns a per-field verdict, a per-section roll-up, and the flat list of
 * things that actually need the student — which is the only part of this most
 * students will ever read.
 *
 * @param {object[]} sections  from deriveApplication()
 * @param {object}   rawState  the stored ledger, in any state
 */
export function reconcile(sections = [], rawState = null) {
  const state = normalizeState(rawState);
  const flat = flattenFields(sections);
  const fields = {};
  const bySection = {};

  for (const [key, f] of Object.entries(flat)) {
    const verdict = fieldSyncState({
      portfolioValue: f.value,
      record: state.filled[key],
      override: state.overrides[key],
    });
    fields[key] = { ...f, key, ...verdict, override: state.overrides[key]?.text ?? null };

    const bucket = bySection[f.sectionId] || (bySection[f.sectionId] = {
      sectionId: f.sectionId, total: 0, blank: 0, unfilled: 0, synced: 0, drifted: 0, overridden: 0, conflict: 0,
    });
    bucket.total += 1;
    bucket[verdict.status] += 1;
  }

  // ── Stale ledger entries ───────────────────────────────────────────────────
  // A field the ledger remembers but the derived application no longer contains:
  // the student deleted the activity, or it dropped out of the top ten. It is
  // NOT quietly forgotten, because it is a real fact about their application —
  // they pasted something into the real form that they have since removed from
  // here, and that row is still sitting in the real Common App.
  const orphans = Object.keys(state.filled)
    .filter((k) => !flat[k])
    .map((k) => ({ key: k, sectionId: k.split('::')[0], filledAt: state.filled[k]?.at || null }));

  const sectionRows = sections.map((s) => {
    const b = bySection[s.id] || { sectionId: s.id, total: 0, blank: 0, unfilled: 0, synced: 0, drifted: 0, overridden: 0, conflict: 0 };
    const mark = state.sections[s.id]?.status || null;
    return {
      ...b,
      // Fields with something in them — the denominator a student cares about.
      tracked: b.total - b.blank,
      needsAttention: b.drifted + b.conflict,
      // The student's own mark on the section in the real form, which outranks
      // anything we computed: they can see the real application and we cannot.
      studentMark: mark,
      markedAt: state.sections[s.id]?.at || null,
    };
  });

  const attention = Object.values(fields)
    .filter((f) => f.status === 'drifted' || f.status === 'conflict')
    .map((f) => ({
      key: f.key,
      sectionId: f.sectionId,
      sectionLabel: CA_SECTION_BY_ID[f.sectionId]?.label || f.sectionId,
      entryId: f.entryId,
      fieldId: f.fieldId,
      status: f.status,
      reason: f.status === 'conflict'
        ? 'You wrote a different version for the Common App, and then changed this here too. Both sides moved, so this one is yours to settle.'
        : 'You changed this here after copying it across. The version sitting in your real Common App is the old one.',
    }));

  return {
    fields,
    sections: sectionRows,
    attention,
    orphans,
    counts: {
      tracked: Object.values(fields).filter((f) => f.status !== 'blank').length,
      synced: Object.values(fields).filter((f) => f.status === 'synced').length,
      unfilled: Object.values(fields).filter((f) => f.status === 'unfilled').length,
      drifted: Object.values(fields).filter((f) => f.status === 'drifted').length,
      overridden: Object.values(fields).filter((f) => f.status === 'overridden').length,
      conflict: Object.values(fields).filter((f) => f.status === 'conflict').length,
      orphans: orphans.length,
    },
    updatedAt: state.updatedAt,
  };
}

// ── The writes ───────────────────────────────────────────────────────────────
// Every one of these is immutable and returns a new ledger. None of them touch
// the Portfolio; see the direction rule in the header.

/**
 * "I have put this into the real Common App." Records what was copied, so a
 * later edit here can be recognized as drift.
 *
 * The value is hashed rather than stored. There is no reason to keep a second
 * copy of a student's essay in a sync ledger that rides their user record, and
 * a hash answers the only question the ledger ever asks of it.
 */
export function markFilled(rawState, key, value) {
  const state = normalizeState(rawState);
  return touch({
    ...state,
    filled: { ...state.filled, [key]: { at: Date.now(), hash: hashValue(value) } },
    // Marking a field as filled settles any conflict on it: the student has just
    // told us what is in the real form.
    overrides: state.overrides[key] ? omit(state.overrides, key) : state.overrides,
  });
}

/** Mark every field of one section as filled in one go. */
export function markSectionFilled(rawState, sectionId, fields) {
  let state = normalizeState(rawState);
  for (const [key, f] of Object.entries(fields)) {
    if (f.sectionId !== sectionId) continue;
    if (!String(f.value ?? '').trim()) continue;   // never claim a blank field was filled
    state = markFilled(state, key, f.value);
  }
  return setSectionMark(state, sectionId, 'done');
}

/** "I have not actually put this in yet after all." The undo for markFilled. */
export function clearFilled(rawState, key) {
  const state = normalizeState(rawState);
  return touch({ ...state, filled: omit(state.filled, key) });
}

/**
 * "In the real Common App I worded this differently." Stores the student's
 * Common-App-side text alongside the Portfolio value it was derived from, which
 * is what lets a later Portfolio edit be detected as a conflict rather than
 * silently overwriting their intent.
 */
export function setOverride(rawState, key, text, portfolioValue) {
  const state = normalizeState(rawState);
  const clean = String(text ?? '');
  if (!clean.trim()) return clearOverride(state, key);
  return touch({
    ...state,
    overrides: { ...state.overrides, [key]: { text: clean, at: Date.now(), fromHash: hashValue(portfolioValue) } },
  });
}

export function clearOverride(rawState, key) {
  const state = normalizeState(rawState);
  return touch({ ...state, overrides: omit(state.overrides, key) });
}

/**
 * Resolve a conflict by keeping the Common-App-side wording: re-anchor the
 * override to the Portfolio's current value, so the two stop disagreeing about
 * which Portfolio version the override was written against.
 */
export function keepOverride(rawState, key, portfolioValue) {
  const state = normalizeState(rawState);
  const existing = state.overrides[key];
  if (!existing) return state;
  return touch({
    ...state,
    overrides: { ...state.overrides, [key]: { ...existing, fromHash: hashValue(portfolioValue), at: Date.now() } },
  });
}

/** The student's own mark on a whole section of the real form. */
export function setSectionMark(rawState, sectionId, status) {
  const state = normalizeState(rawState);
  if (!['not-started', 'in-progress', 'done'].includes(status)) return state;
  return touch({ ...state, sections: { ...state.sections, [sectionId]: { status, at: Date.now() } } });
}

/**
 * The reverse direction: adopt the Common-App-side wording back into the
 * Portfolio.
 *
 * Returns an INTENT — { key, sectionId, entryId, fieldId, text } — and does not
 * write anything. The caller maps it onto the right Portfolio row and performs
 * the update, then calls this state's clearOverride to retire the override now
 * that the two sides agree.
 *
 * This is the only path by which a Common-App-side edit can reach the
 * Portfolio, and it is deliberately explicit. A 150-character compression is a
 * worse record of what a student did than the full description — it exists to
 * fit a form — so it must never become their permanent record without them
 * asking for it.
 */
export function adoptCommonAppWording(rawState, key) {
  const state = normalizeState(rawState);
  const override = state.overrides[key];
  if (!override) return null;
  const [sectionId, entryId, fieldId] = String(key).split('::');
  return { key, sectionId, entryId, fieldId, text: override.text };
}

/**
 * Drop ledger entries for fields that no longer exist. Offered as an explicit
 * action rather than run automatically, because an orphan is a real fact — a row
 * still sitting in the student's real Common App that they have deleted here —
 * and silently tidying it away would delete the only record that it is there.
 */
export function forgetOrphans(rawState, keys = []) {
  const state = normalizeState(rawState);
  const filled = { ...state.filled };
  const overrides = { ...state.overrides };
  for (const k of keys) { delete filled[k]; delete overrides[k]; }
  return touch({ ...state, filled, overrides });
}

function omit(obj, key) {
  const next = { ...obj };
  delete next[key];
  return next;
}

/**
 * The one-line status a Portfolio panel shows without opening the mirror.
 *
 * Ordered by what a student should act on first: something that will be REJECTED
 * by the real form outranks something that is merely out of date, which outranks
 * something not yet started. Returns null when there is genuinely nothing to
 * say, and a null badge renders as nothing rather than as "all good" — a panel
 * with no data has not passed a check, it has not taken one.
 */
export function panelBadge(section, sectionRow) {
  if (!section) return null;
  if (section.status === 'blocked') {
    return { tone: 'error', text: 'Will not fit the real form', detail: section.blockers?.[0] || null };
  }
  if (sectionRow?.conflict) {
    return { tone: 'error', text: `${sectionRow.conflict} to settle`, detail: 'Changed here and in the real form.' };
  }
  if (sectionRow?.drifted) {
    return { tone: 'warn', text: `${sectionRow.drifted} out of date in the real form`, detail: 'Changed here after you copied it across.' };
  }
  if (section.status === 'empty') return { tone: 'idle', text: 'Nothing here yet', detail: null };
  if (sectionRow?.tracked && sectionRow.synced === sectionRow.tracked) {
    return { tone: 'good', text: 'Matches your Common App', detail: null };
  }
  if (sectionRow?.unfilled) {
    return { tone: 'info', text: `${sectionRow.unfilled} not copied across yet`, detail: null };
  }
  if (section.status === 'ready') return { tone: 'good', text: 'Ready to copy across', detail: null };
  return null;
}
