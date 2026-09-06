// ─────────────────────────────────────────────────────────────────────────────
// Persistence for the Narrative Method Engine.
//
// ── PREMIUM ROADMAP ─────────────────────────────────────────────────────────
// A student's inputs and run history are theirs on every plan, including one
// they have canceled. Nothing in this file consults an entitlement, and it
// must stay that way — the gate belongs at `runEngine()`, not at the store.
// See the note in supabase/migrations/0023_narrative_engine.sql.
// ────────────────────────────────────────────────────────────────────────────
//
// Two shapes:
//
//   • `narrative_profile` — a singleton per account. Same list-or-create dance
//     as the calculator's intake (src/lib/admissions/store.js), hidden from
//     callers here rather than re-implemented in a panel.
//   • `narrative_runs` — append-only history. Written only when a student
//     explicitly keeps a reading.
//
// ══ THE PRIVACY RULE THIS FILE ENFORCES ═════════════════════════════════════
//  Essay drafts are the most private thing in this app. A stored run must
//  contain FINDINGS about a draft and never the draft itself.
//
//  The engine's result object naturally contains full text in several places —
//  the storyboard's per-phase sentence lists, the hook's captured opening, the
//  syntax sweeps' flagged sentences. Those exist so the panel can render them
//  in the same session; none of them belongs in a row that outlives it.
//  `stripDrafts` (in ./serialize.js, so the build gate can run it without this
//  module's network client) removes them, and scripts/verifyIvyEngine.mjs
//  asserts that no serialised run contains a long span of a student's draft.
//
//  Getting this wrong would mean a student's essay drafts sitting in a history
//  table nobody remembers writing to, which is the kind of thing that is only
//  ever discovered by someone reading a data export.
// ═════════════════════════════════════════════════════════════════════════════
// Extension included so that this module resolves under plain Node as well as
// under Vite — scripts/verifyIvyEngine.mjs imports the engine's index, which
// reaches this file, and Node does not do extensionless resolution.
import { listItems, createItem, updateItem } from '../dataApi.js';
import { stripDrafts, runTrend, buildIngestion } from './serialize.js';

const SAVE_DEBOUNCE_MS = 900;

let cachedRow = null;
let pending = null;
let timer = null;
let inFlight = false;

/** Normalises a stored row into the shape the engine ingests. */
export function unpackProfile(row) {
  if (!row) {
    return {
      id: null, updatedAt: null,
      intendedMajor: null, valueTheme: null,
      project: {}, practice: {}, studyLog: {}, bragSheets: {}, completed: {}, additionalInfo: '',
    };
  }
  const j = (v) => (typeof v === 'string' ? safeJson(v) : v) || {};
  return {
    id: row.id,
    updatedAt: row.updated_at || null,
    intendedMajor: row.intended_major || null,
    valueTheme: row.value_theme || null,
    project: j(row.project),
    practice: j(row.practice),
    studyLog: j(row.study_log),
    bragSheets: j(row.brag_sheets),
    completed: j(row.completed_items),
    additionalInfo: row.additional_info || '',
  };
}

function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }

function packProfile(p = {}) {
  return {
    intended_major: p.intendedMajor || null,
    value_theme: p.valueTheme || null,
    project: p.project || {},
    practice: p.practice || {},
    study_log: p.studyLog || {},
    brag_sheets: p.bragSheets || {},
    completed_items: p.completed || {},
    additional_info: p.additionalInfo || null,
  };
}

/**
 * Loads the profile. Accepts an already-fetched Portfolio snapshot so the
 * Portfolio's one shared request covers this too rather than firing a second.
 */
export async function loadNarrativeProfile(snapshot = null) {
  if (snapshot?.narrativeProfile) {
    cachedRow = snapshot.narrativeProfile[0] || null;
    return unpackProfile(cachedRow);
  }
  const rows = await listItems('narrative_profile').catch(() => []);
  cachedRow = rows[0] || null;
  return unpackProfile(cachedRow);
}

/**
 * Queues a save. Returns immediately; the write lands on the debounce.
 * `next` is the WHOLE profile, not a patch — the form owns it, so a dropped
 * request loses nothing the following save will not carry anyway.
 */
export function saveNarrativeProfile(next) {
  pending = next;
  clearTimeout(timer);
  timer = setTimeout(() => { flushNarrativeProfile().catch(() => {}); }, SAVE_DEBOUNCE_MS);
}

/** Writes any queued profile immediately. Safe to call when nothing is queued. */
export async function flushNarrativeProfile() {
  clearTimeout(timer);
  if (!pending || inFlight) return null;
  const payload = packProfile(pending);
  const queued = pending;
  pending = null;
  inFlight = true;
  try {
    cachedRow = cachedRow?.id
      ? await updateItem('narrative_profile', cachedRow.id, payload)
      : await createItem('narrative_profile', payload);
    return unpackProfile(cachedRow);
  } catch (err) {
    // The panel keeps its own state, so a failed save costs nothing this
    // session — it just will not survive a reload. Re-queue so the next edit
    // retries rather than silently giving up.
    if (!pending) pending = queued;
    throw err;
  } finally {
    inFlight = false;
    if (pending) { clearTimeout(timer); timer = setTimeout(() => { flushNarrativeProfile().catch(() => {}); }, SAVE_DEBOUNCE_MS); }
  }
}

/**
 * Keeps a reading. Append-only, and called only when the student asks for it —
 * an engine run on every page load that silently wrote a history row would
 * turn the trend chart into a record of how often they opened the tab.
 */
export async function saveRun(result) {
  if (!result) return null;
  const payload = {
    ran_at: result.ranAt || new Date().toISOString(),
    grade_level: result.grade != null ? String(result.grade) : null,
    tier: result.tier === 'free' ? 'free' : 'premium',
    spike_index: result.modules?.holistic?.spikeIndex ?? null,
    coherence: result.thematic?.coherence?.score ?? null,
    portfolio_balance: result.modules?.portfolio?.balance ?? null,
    project_viability: result.modules?.domino?.viability ?? null,
    result: stripDrafts(result),
  };
  return createItem('narrative_runs', payload);
}

/** The kept readings, newest first. */
export async function loadRuns(snapshot = null) {
  const rows = snapshot?.narrativeRuns || await listItems('narrative_runs').catch(() => []);
  return [...rows].sort((a, b) => new Date(b.ran_at || b.created_at) - new Date(a.ran_at || a.created_at));
}

/** Drops the module-level cache. Called on sign-out, so a second account on the
 *  same browser never sees the first one's profile. */
export function resetNarrativeCache() {
  cachedRow = null; pending = null; inFlight = false; clearTimeout(timer);
}

// Re-exported so callers have one import for persistence. The implementations
// live in ./serialize.js because they are pure and the build gate needs them
// without this module's network client — see that file's header.
export { stripDrafts, runTrend, buildIngestion };
