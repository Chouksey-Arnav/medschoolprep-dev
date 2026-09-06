// ─────────────────────────────────────────────────────────────────────────────
// One fetch of the whole Portfolio, shared by everything on the Overview and Tracked tabs.
//
// Before this existed, four different surfaces each did their own Promise.all over
// /api/data/[resource] with slightly different resource lists (PortfolioMedabrain's twelve,
// OpportunitiesDatabase's three, App.jsx's two separate effects) — so opening Portfolio fired
// the same requests several times, and the weekly-goal dashboards, the tracked list, and the AI
// could each be reasoning over a different snapshot of the same account.
//
// The snapshot is deliberately a plain object of raw rows: every consumer (weeklyGoals.js's
// metric registry, trackedItems.js's status classifier) does its own derivation from real
// columns, so there is exactly one place that talks to the network and no derived value gets
// stale independently of the rows it came from.
// ─────────────────────────────────────────────────────────────────────────────
import { listItems } from './dataApi';
import * as DB from './db';

/** Resource name → snapshot key. Order is irrelevant; every fetch runs in parallel. */
const RESOURCE_MAP = {
  activities: 'activities',
  awards: 'awards',
  colleges: 'colleges',
  deadlines: 'deadlines',
  essays: 'essays',
  essay_versions: 'essayVersions',
  scholarships: 'scholarships',
  research_experience: 'research',
  skills_certifications: 'skills',
  clinical_hours: 'clinicalHours',
  recommenders: 'recommenders',
  gpa_entries: 'gpaEntries',
  // The Admissions Calculator reads every logged sitting (composite AND section scores) and the
  // saved intake straight out of this snapshot rather than fetching them itself — see
  // src/lib/admissions/intake.js. Before this, `test_scores` was fetched separately by three
  // surfaces and `admission_intake` did not exist, which is exactly the duplication this module
  // was created to end.
  test_scores: 'testScores',
  admission_intake: 'admissionIntake',
  // The Narrative Method Engine's inputs (supabase/migrations/0025_narrative_engine.sql).
  // Fetched with the rest of the snapshot because the panel reads it on mount,
  // so it costs no extra round trip.
  //
  // `narrative_runs` is deliberately NOT here. It is the append-only history of
  // kept readings — nothing reads it until a student opens the trend, and every
  // row in this map is fetched on every Portfolio load by every student,
  // including the large majority who never open this panel. loadRuns() fetches
  // it on demand instead.
  narrative_profile: 'narrativeProfile',
  // The MedEx Score's weekly seals. In the shared snapshot because the score is
  // computed from these same rows — fetching the history separately would mean
  // the Home card and the breakdown panel could seal against two different
  // reads of the portfolio and disagree about the week's number.
  medex_scores: 'medexScores',
};

export const EMPTY_SNAPSHOT = Object.freeze({
  ...Object.fromEntries(Object.values(RESOURCE_MAP).map((k) => [k, []])),
  interviewSessions: [],
  fetchedAt: null,
  partial: false,
});

/**
 * Fetches every Portfolio resource in parallel.
 *
 * A single failing resource degrades to an empty array rather than rejecting the whole
 * snapshot — a dashboard that renders eleven of twelve trackers is strictly better than one
 * that renders a spinner forever because `awards` 500'd. `partial` says whether that happened,
 * so the UI can be honest about it instead of quietly showing zeros as if they were real.
 */
export async function buildPortfolioSnapshot() {
  const entries = Object.entries(RESOURCE_MAP);
  const results = await Promise.all([
    ...entries.map(([resource]) => listItems(resource).then((rows) => rows || []).catch(() => null)),
    DB.getInterviewSessions().then((rows) => rows || []).catch(() => null),
  ]);
  const snapshot = { ...EMPTY_SNAPSHOT, fetchedAt: Date.now(), partial: false };
  entries.forEach(([, key], i) => {
    const rows = results[i];
    if (rows === null) snapshot.partial = true;
    snapshot[key] = rows || [];
  });
  const sessions = results[entries.length];
  if (sessions === null) snapshot.partial = true;
  snapshot.interviewSessions = sessions || [];
  return snapshot;
}

// The pure snapshot derivations (isEmptySnapshot / snapshotItemCount / weeksToNearestDeadline /
// currentLoadHours) deliberately live in weeklyGoals.js, not here: this module imports Dexie and
// the data API, which makes it unimportable from a plain-Node verify script — and those four
// functions are precisely the ones worth testing. Import them from weeklyGoals.js.
