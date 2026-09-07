// ─────────────────────────────────────────────────────────────────────────────
// The student, as the opportunity ranker needs to see them.
//
// src/lib/opportunityMatch.js's buildMatchProfile() already assembles interests,
// portfolio themes, pathway and grade, and that function stays the source of
// truth for all of it — this module WRAPS it rather than reimplementing it, so
// the two can never disagree about what a student is into.
//
// What it adds is everything the older profile had no place for, and everything
// the newer requirements turn on:
//
//   • the college list, as reach/target/safety counts — a student with three
//     highly selective reaches is answering a different question about their
//     year than one with three in-state targets, and pretending otherwise
//     produces the same list for both.
//   • school context and course rigor (school_context) — what their school
//     actually offers, so we never rank a program that assumes an AP they
//     cannot take.
//   • real-world constraints (constraints_profile) — time, transport, cost,
//     accessibility, family responsibilities. These are the fields that decide
//     how MANY opportunities a student should be shown, not just which.
//   • roadmap pressure — what is already on their plate and what is already
//     due, because the most common way to hurt a student here is to hand them
//     a seventh commitment in the week three of the six they have collide.
//   • their own feedback history — every decline, "too expensive", "too far",
//     "too difficult" they have ever given us.
//
// ── Location is consent-gated, at the boundary ──────────────────────────────
// `place` is resolved ONCE, here, through usableLocation() (opportunityMatch.js)
// and resolveZip() (geo/zip.js). Nothing downstream reads a ZIP: the ranker
// reads `ctx.place`, which is null unless the student explicitly opted in. That
// is deliberate — a scorer that could reach a raw ZIP is a scorer that can leak
// one into a prompt.
// ─────────────────────────────────────────────────────────────────────────────

import { buildMatchProfile, readPrefs, usableLocation } from '../opportunityMatch.js';
import { resolveZip } from '../geo/zip.js';
import { indexFeedback } from './feedback.js';

// Same guard as schema.js's numOrNull, and for the same reason: Number(null)
// is 0, and a graduation year of 0 or an age of 0 are not facts about anybody.
const num = (v) => {
  if (v == null || v === '' || typeof v === 'boolean') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const lower = (v) => String(v || '').toLowerCase();

/** Coarse buckets for how much discretionary time a student actually has. */
export const TIME_BUDGETS = [
  { id: 'very_limited', label: 'Very limited', hoursPerWeek: 2 },
  { id: 'limited', label: 'Limited', hoursPerWeek: 5 },
  { id: 'moderate', label: 'Moderate', hoursPerWeek: 10 },
  { id: 'ample', label: 'Ample', hoursPerWeek: 18 },
];
export const TIME_BUDGET_BY_ID = Object.fromEntries(TIME_BUDGETS.map((t) => [t.id, t]));

/**
 * Read a free-text "time availability" sentence into a bucket.
 *
 * Deliberately keyword-driven and deliberately pessimistic on ties: a student
 * who wrote something we cannot parse gets `null`, which the capacity model
 * treats as "we do not know" rather than as "plenty" — the failure mode of
 * over-serving a busy student is a list they close, and the failure mode of
 * under-serving one is a list they can finish and then ask for more.
 */
export function readTimeBudget(text) {
  const s = lower(text);
  if (!s.trim()) return null;
  const hours = s.match(/(\d+)\s*(?:\+|-|to|–)?\s*(\d+)?\s*(?:hours?|hrs?)\s*(?:a|per|\/)\s*week/);
  if (hours) {
    const h = Number(hours[2] || hours[1]);
    if (Number.isFinite(h)) {
      if (h <= 3) return 'very_limited';
      if (h <= 6) return 'limited';
      if (h <= 12) return 'moderate';
      return 'ample';
    }
  }
  if (/no time|barely|swamped|overwhelm|nothing spare|can'?t take on|full plate|too busy/.test(s)) return 'very_limited';
  if (/limited|tight|not much|little time|only weekends|busy/.test(s)) return 'limited';
  if (/some time|a few hours|moderate|manageable/.test(s)) return 'moderate';
  if (/plenty|lots of time|flexible|wide open|free most/.test(s)) return 'ample';
  return null;
}

/** Cost tolerance, read the same way and with the same bias toward caution. */
export function readCostSensitivity(text, costStance) {
  if (costStance === 'free_only') return 'free_only';
  const s = lower(text);
  if (!s.trim()) return null;
  if (/can'?t (?:afford|pay)|cannot (?:afford|pay)|no money|free only|nothing (?:paid|costly)|fee waiver|need.{0,12}(?:aid|based)|low income|financial aid/.test(s)) return 'free_only';
  if (/tight|limited budget|small budget|under \$?\d|cheap|inexpensive|low cost/.test(s)) return 'low';
  if (/comfortable|not an issue|no constraint|can pay/.test(s)) return 'flexible';
  return 'low';
}

/** Whether a student can realistically get themselves somewhere that isn't walkable. */
export function readTransport(text) {
  const s = lower(text);
  if (!s.trim()) return null;
  if (/no car|cannot drive|can'?t drive|no ride|no transport|no license|rely on|depend on (?:my )?parent|no public transit/.test(s)) return 'constrained';
  if (/bus|transit|train|subway|bike|walk/.test(s)) return 'transit';
  if (/drive|own car|licensed|can get anywhere/.test(s)) return 'independent';
  return null;
}

/**
 * Everything the ranker is allowed to know, assembled once per render.
 *
 * Every argument is optional and every one is allowed to be empty — that is the
 * honest state for a brand-new account, and the ranker is written to produce a
 * short, accessible, sensible list from nothing at all.
 *
 * @param {object} o
 * @param {object} o.user        the user record
 * @param {object} o.snapshot    buildPortfolioSnapshot() result, or null
 * @param {string} o.pathwayKey  active PATHS key
 * @param {object} o.intel       { schoolContext, constraints, interestHistory, serviceLogs,
 *                                 competitions, recommendationFeedback, checkins }
 * @param {Array}  o.colleges    the student's college list rows
 * @param {object} o.roadmap     the roadmap object, or null
 * @param {Array}  o.deadlines   the student's dated milestone rows
 */
export function buildOpportunityContext({
  user = null, snapshot = null, pathwayKey = null, intel = null,
  colleges = [], roadmap = null, deadlines = [], today = new Date(),
} = {}) {
  const prefs = readPrefs(user);
  const profile = buildMatchProfile({ user, snapshot, pathwayKey, prefs });
  const i = intel || {};
  const constraints = i.constraints || null;
  const school = i.schoolContext || null;

  // ── Location, only with consent ──────────────────────────────────────────
  const consented = usableLocation(prefs);
  // constraints_profile carries its own consent flag; either path is a real
  // opt-in and both are honored, but neither is inferred from the other.
  const intelLocation = constraints?.location_consent
    ? { zipCode: constraints.zip_code || null, state: constraints.state_code || null }
    : null;
  const loc = consented || intelLocation;
  const place = loc
    ? (resolveZip(loc.zipCode) || (loc.state ? { zip: null, prefix: null, state: String(loc.state).toUpperCase(), stateName: String(loc.state).toUpperCase(), region: null, regionLabel: null, nearbyStates: [String(loc.state).toUpperCase()] } : null))
    : null;

  // ── The college list, as the shape of ambition it actually is ────────────
  const listCounts = { reach: 0, target: 0, safety: 0, uncategorized: 0 };
  for (const c of colleges) {
    const k = String(c?.category || '').toLowerCase();
    if (listCounts[k] != null) listCounts[k] += 1; else listCounts.uncategorized += 1;
  }
  const dreamSchools = colleges.filter((c) => c?.is_dream || c?.dream || String(c?.status || '') === 'dream').map((c) => c.name).filter(Boolean);

  // ── Roadmap pressure ─────────────────────────────────────────────────────
  const roadmapItems = Array.isArray(roadmap?.items) ? roadmap.items : [];
  const openRoadmapItems = roadmapItems.filter((it) => it?.status === 'todo' || it?.status === 'doing');
  const roadmapTitles = openRoadmapItems.map((it) => lower(`${it.title || ''} ${it.org || ''}`));
  const soonDeadlines = countSoonDeadlines(deadlines, today);

  // ── Constraints ──────────────────────────────────────────────────────────
  const timeBudget = readTimeBudget(constraints?.time_availability);
  const costSensitivity = readCostSensitivity(constraints?.cost_sensitivity, prefs.costStance);
  const transport = readTransport(constraints?.transportation_limits);
  const accessibilityNotes = constraints?.accessibility_notes || null;
  const familyConstraints = constraints?.family_constraints || null;

  // ── Feedback history ─────────────────────────────────────────────────────
  const feedback = indexFeedback(i.recommendationFeedback || []);

  // ── Commitments already made ─────────────────────────────────────────────
  const activities = snapshot?.activities || [];
  const commitments = activities.map((a) => lower(`${a.position || ''} ${a.organization || ''} ${a.activity_type || ''} ${a.description || ''}`));
  const hasLeadership = activities.some((a) => a.leadership_role || /president|captain|founder|officer|lead|chair|editor/.test(lower(a.position)));

  const gradYear = num(school?.graduation_year);
  const rigor = school?.rigor_available || {};
  const rigorOffered = Object.entries(rigor).filter(([, v]) => v).map(([k]) => k);

  return {
    // Everything the older matcher already knew, unchanged and still authoritative.
    profile,
    prefs,
    user: user || null,
    grade: profile.grade ? Number(profile.grade) : null,
    gradeStage: profile.gradeStage,
    graduationYear: gradYear,
    age: num(user?.age),
    pathwayKey: profile.pathwayKey,
    pathwayLabel: profile.pathwayLabel,
    today,

    // New signals.
    place,
    hasLocationConsent: !!place,
    colleges: listCounts,
    dreamSchools,
    collegeAmbition: ambitionOf(listCounts, colleges),
    school: school ? { type: school.school_type || null, rigorOffered, currentCourses: school.current_courses || [], workloadNotes: school.workload_notes || null } : null,
    timeBudget,
    costSensitivity,
    transport,
    accessibilityNotes,
    familyConstraints,
    testStatus: testStatusOf(snapshot),
    roadmap: {
      openCount: openRoadmapItems.length,
      totalCount: roadmapItems.length,
      titles: roadmapTitles,
      soonDeadlines,
    },
    commitments,
    activityCount: activities.length,
    hasLeadership,
    serviceHours: (i.serviceLogs || []).reduce((s, r) => s + (Number(r.hours) || 0), 0),
    competitionCount: (i.competitions || []).length,
    interestHistory: i.interestHistory || [],
    feedback,
  };
}

/** How many dated rows land inside the next eight weeks. Overload risk is a date problem. */
function countSoonDeadlines(deadlines = [], today = new Date()) {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const horizon = t + 56 * 86400000;
  return deadlines.filter((d) => {
    if (!d?.due_date || d.completed) return false;
    const when = new Date(`${String(d.due_date).slice(0, 10)}T00:00:00`).getTime();
    return Number.isFinite(when) && when >= t && when <= horizon;
  }).length;
}

/**
 * How ambitious this student's own list is. Drives how hard the ranker is
 * willing to push — NOT how prestigious the results are.
 *
 * The distinction is the whole point: a student with four reaches needs more
 * *substantial* work, which usually means deeper and more sustained, not more
 * expensive and more famous.
 */
function ambitionOf(counts, colleges) {
  const total = counts.reach + counts.target + counts.safety + counts.uncategorized;
  if (!total) return 'unknown';
  const reachShare = counts.reach / total;
  if (counts.reach >= 3 || reachShare >= 0.5) return 'high';
  if (counts.reach >= 1) return 'moderate';
  return 'steady';
}

/** Whether we know where they stand on testing — a real input into "how much spare capacity". */
function testStatusOf(snapshot) {
  const scores = snapshot?.testScores || [];
  if (!scores.length) return { taken: false, best: null };
  const best = scores.reduce((acc, s) => Math.max(acc, Number(s.total) || Number(s.score) || 0), 0);
  return { taken: true, best: best || null };
}
