// ─────────────────────────────────────────────────────────────────────────────
// One shared, cached fetch of the student-intelligence slice the TUTORING
// surfaces need (Prep and SAT Medabrain — src/components/PrepMedabrain.jsx and
// src/components/sat/SatMedabrain.jsx).
//
// Portfolio's specialist already gets these rows for free: it reads them off the
// snapshot fetchPortfolioSnapshot() (src/lib/portfolioData.js) loaded once for
// the whole tab. The tutoring surfaces have no such snapshot — they mount inside
// a lesson or an SAT question set and never fetch the Portfolio at all — so
// without this module each of them would fire its own burst of six requests on
// every chat send, and two panels open at once would fire twelve.
//
// ── Why only six resources ───────────────────────────────────────────────────
// buildStudentIntelBlock's 'tutoring' branch reads the core "who this is + what
// they said most recently" section and nothing else: service_logs, competitions
// and recommendation_feedback are opportunity/roadmap material and are never
// rendered for a tutoring prompt. Fetching them would spend requests and tokens
// on rows that provably cannot reach the prompt.
//
// ── Why ZIP and state never leave here ───────────────────────────────────────
// constraints_profile carries zip_code/state_code, collected under one narrow
// consent — matching opportunities NEAR the student — and a tutoring prompt is
// not that. Every prompt built from this data is sent to a third-party AI
// provider, so a column that rides along by accident is a column disclosed for a
// purpose nobody agreed to. stripUnconsentedLocation() below is the same guard
// PlansTab.jsx applies to the plan generator's copy of this row, applied here at
// the loader so no caller of getStudentIntel() can reintroduce it by any path.
// ─────────────────────────────────────────────────────────────────────────────
import { listItems } from '../dataApi';
import { REMOTE_DATA_EVENT } from '../liveSync';

/** Resource name → the key buildStudentIntelBlock() destructures it as. */
const TUTORING_RESOURCES = {
  school_context: 'schoolContext',
  constraints_profile: 'constraints',
  quick_notes: 'quickNotes',
  interest_history: 'interestHistory',
  reflection_entries: 'reflectionsLog',
  checkins: 'checkins',
};

/** The two singleton rows: one per account, handed to the block as an object, not a list. */
const SINGLETON_KEYS = new Set(['schoolContext', 'constraints']);

export const EMPTY_INTEL = Object.freeze({
  schoolContext: null,
  constraints: null,
  quickNotes: [],
  interestHistory: [],
  reflectionsLog: [],
  checkins: [],
});

// See the header: the plan generator's stripUnconsentedLocation() (src/components/PlansTab.jsx)
// is the precedent this mirrors. Everything else on the row — time, transport, cost,
// accessibility — is exactly what a tutor has to weigh, so the row travels; the location does not.
const stripUnconsentedLocation = (row) => {
  if (!row) return null;
  const { zip_code, state_code, ...rest } = row;
  return rest;
};

let cached = null;
let inFlight = null;

async function fetchIntel() {
  const entries = Object.entries(TUTORING_RESOURCES);
  // A single failing resource degrades to an empty list rather than rejecting the whole load,
  // the same way buildPortfolioSnapshot() does it: a prompt that knows five of six things is
  // strictly better than a chat send that fails because `checkins` 500'd.
  const results = await Promise.all(entries.map(([resource]) => listItems(resource).then((rows) => rows || []).catch(() => [])));
  const intel = { ...EMPTY_INTEL };
  entries.forEach(([, key], i) => {
    const rows = results[i];
    intel[key] = SINGLETON_KEYS.has(key) ? (rows[0] || null) : rows;
  });
  intel.constraints = stripUnconsentedLocation(intel.constraints);
  return intel;
}

/**
 * The tutoring slice of this student's intelligence rows, fetched at most once.
 *
 * Concurrent callers share one in-flight promise, so opening Prep and SAT Medabrain in the same
 * moment still costs six requests total rather than twelve. Never rejects: a failed load resolves
 * to EMPTY_INTEL, because losing the context block is a slightly less personal answer while a
 * thrown error is a chat send that does not happen.
 */
export async function getStudentIntel() {
  if (cached) return cached;
  if (!inFlight) {
    inFlight = fetchIntel()
      .then((intel) => { cached = intel; return intel; })
      .catch(() => EMPTY_INTEL)
      .finally(() => { inFlight = null; });
  }
  return inFlight;
}

/** Drops the cache so the next ask refetches. */
export function invalidateStudentIntel() {
  cached = null;
  inFlight = null;
}

// A change made on another device (or in another tab) reaches this one as liveSync's
// REMOTE_DATA_EVENT. Without this listener a student who logs a note on their phone would keep
// getting tutoring answers built from the rows this tab happened to load hours ago, for as long
// as the tab stays open.
if (typeof window !== 'undefined') {
  window.addEventListener(REMOTE_DATA_EVENT, invalidateStudentIntel);
}
