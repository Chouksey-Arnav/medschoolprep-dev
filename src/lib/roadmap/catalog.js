// ─────────────────────────────────────────────────────────────────────────────
// The catalog engine: turning the hand-written catalog in src/data/roadmap into
// a dated, eligibility-filtered, scored slate for ONE student in ONE year.
//
// This module is the reason the roadmap can promise exact dates without a model
// ever inventing one. It does four things, in order, and nothing else:
//
//   1. RESOLVE   — a catalog entry's (yearSlot, MM-DD) becomes a real calendar
//                  date for this student's class years. Shares its arithmetic
//                  with src/lib/timeline.js so the Roadmap and the Portfolio
//                  Milestones view can never disagree about which August a
//                  "senior fall" date lands in.
//   2. GATE      — grade eligibility first (a freshman must never be shown a
//                  senior deadline), then the `requires` gates against intake
//                  answers.
//   3. SCORE     — a deterministic fit score, so the model is handed a
//                  pre-ranked shortlist rather than the whole catalog. This is
//                  what keeps the prompt inside its budget while still letting
//                  every entry be reachable.
//   4. ROLL      — an entry whose window has already closed this academic year
//                  rolls forward to next year's occurrence, IF the student will
//                  still be eligible then. A junior looking at this in March has
//                  not "missed" USABO forever; they have missed it by six weeks
//                  and the roadmap should say so and schedule next January.
//
// Pure functions and plain data. No React, no network, no theme — so
// scripts/verifyRoadmap.mjs can assert on the whole thing under plain Node.
// ─────────────────────────────────────────────────────────────────────────────
import {
  ROADMAP_CATALOG, CATALOG_BY_ID, TRACK_BY_ID, SELECTIVITY, EFFORT, PRIORITY,
} from '../../data/roadmap/index.js';
import { dayKey, daysBetween, shiftDays, classFallYears, effectiveGradeStage, gradeIdxOf, GRADE_KEYS } from '../timeline.js';
import { auditSlate } from './dateAudit.js';
import { proximity } from '../geo/zip.js';
import { affinity } from '../geo/majors.js';

/** Grade stage key → the '9'..'12' string the catalog gates on. 'gap' reads as senior. */
export const GRADE_NUMBER = { freshman: '9', sophomore: '10', junior: '11', senior: '12', gap: '12' };

/**
 * Which fall year a `yearSlot` names for this student.
 *
 * The catalog's four named slots ('freshman'…'senior') come straight from
 * classFallYears. The two relative ones exist because most recurring items —
 * finals, course selection, the PSAT — are not tied to a class year at all;
 * they happen every year, and what matters is which one is next.
 */
export function fallYearForSlot(slot, years, gradeStage) {
  if (years[slot] != null) return years[slot];
  const idx = gradeIdxOf(gradeStage);
  const currentKey = GRADE_KEYS[Math.min(idx == null ? 2 : idx, 3)];
  if (slot === 'current') return years[currentKey];
  if (slot === 'next') return years[GRADE_KEYS[Math.min((idx == null ? 2 : idx) + 1, 3)]];
  return years[currentKey];
}

/**
 * MM-DD + fall year → YYYY-MM-DD.
 *
 * August through December belong to the fall calendar year, January through
 * July to the next one. Identical to resolveDate() in timeline.js; duplicated
 * rather than imported-and-adapted because the two take different arguments and
 * a shared helper that took both shapes would be harder to read than six lines.
 */
function dateFor(monthDay, fallYear) {
  if (fallYear == null || !monthDay) return null;
  const month = Number(String(monthDay).slice(0, 2));
  return `${month >= 8 ? fallYear : fallYear + 1}-${monthDay}`;
}

/**
 * The dates one catalog entry resolves to for this student, in a given academic
 * year offset (0 = the slot the catalog names, 1 = the same slot a year later).
 *
 * Returns null when the entry carries no resolvable date at all — a
 * confidence:'varies' entry with only a season. Those are still real roadmap
 * items; they just get scheduled by season rather than pinned to a day, and the
 * roadmap asks the student to supply the real date (see `needsStudentDate`).
 */
export function resolveWindow(entry, years, gradeStage, yearOffset = 0) {
  const w = entry.window;
  if (!w) return null;
  const base = fallYearForSlot(w.yearSlot || 'current', years, gradeStage);
  if (base == null) return null;
  const fall = base + yearOffset;
  const due = dateFor(w.dueMonthDay, fall);
  const on = dateFor(w.onMonthDay, fall);

  // ── The summer-opening correction ──────────────────────────────────────────
  // dateFor maps August–December onto the fall calendar year and January–July
  // onto the next one, which is right for everything a school year contains and
  // wrong for exactly one shape: an application that OPENS in the summer and
  // CLOSES in the following autumn. Regeneron STS opens June 1 and closes
  // November 10; the Gates Scholarship opens July 15 and closes September 15.
  // Read through the academic-year rule, June and July land in the summer AFTER
  // the autumn deadline, so the roadmap said these opened eight months after
  // they closed.
  //
  // Nothing downstream noticed, because `opens` is never the anchor and is never
  // the date a student is shown — it only fed the prompt and the "already open"
  // reasoning, which is precisely why this survived. CHECK 2 in ./dateAudit.js
  // is what found it, and it is the reason that gate compares an item's dates
  // against each other rather than each one against the calendar.
  //
  // The rule: an opening date cannot follow the thing it opens. When the
  // academic-year mapping puts it there, it belongs to the previous calendar
  // year — the summer before the autumn, which is what the catalog meant.
  let opens = dateFor(w.opensMonthDay, fall);
  const closes = due || on;
  if (opens && closes && opens > closes) {
    opens = dateFor(w.opensMonthDay, fall - 1);
  }
  // `anchor` is the ONE date everything else sorts and schedules by: the
  // deadline if there is one, otherwise the event day. An opening date is
  // never the anchor — "the application opened" is not a thing that can be
  // missed, and sorting by it would bury a closing deadline under a dozen
  // things that merely became available.
  const anchor = due || on || opens;
  if (!anchor) return null;
  return {
    opens: opens || null,
    due: due || null,
    on: on || null,
    anchor,
    // When work should START, from the entry's own lead time. This is the
    // number the roadmap actually schedules against — a scholarship due
    // October 2 that needs six weeks of essays is a mid-August item, and
    // showing it as an October item is how students miss it.
    startBy: shiftDays(anchor, -7 * (entry.prepWeeks || 0)),
  };
}

/** True when this entry is open to a student in `gradeStage` at `yearOffset`. */
export function fitsGrade(entry, gradeStage, yearOffset = 0) {
  const idx = gradeIdxOf(gradeStage);
  if (idx == null) return true;
  // A gap-year student is treated as a senior and never advances further.
  const futureIdx = Math.min(idx + yearOffset, 3);
  const num = GRADE_NUMBER[GRADE_KEYS[futureIdx]] || '12';
  return entry.grades.includes(num);
}

/**
 * True when every `requires` gate on the entry is satisfied by the student's
 * answers.
 *
 * A gate whose answer is UNKNOWN passes. This is deliberate and it is the safer
 * failure: a student who has not answered "do you want to do research" should
 * see research programs and be able to dismiss them, not have them silently
 * deleted from their year. Withholding an opportunity is a worse error than
 * showing an irrelevant one, because only one of the two is visible.
 */
export function passesGates(entry, answers = {}) {
  return Object.entries(entry.requires || {}).every(([key, want]) => {
    const got = answers[key];
    if (got == null) return true;
    return got === want;
  });
}

// ── Scoring ──────────────────────────────────────────────────────────────────
// The shortlist handed to the model is ranked, not arbitrary, because the
// prompt cannot carry the whole catalog and whatever gets truncated is
// effectively deleted from the student's year. The weights below are the
// judgment calls; they are all here, in one place, rather than smeared across
// the generator.

const SELECTIVITY_PENALTY = { open: 0, selective: 2, 'highly-selective': 5, lottery: 9 };
const EFFORT_LOAD = { light: 1, moderate: 2, heavy: 4, immersive: 6 };

/**
 * How well one dated entry fits this student, 0-100.
 *
 * The single most important term is `urgency`: an item whose prep window opens
 * inside the roadmap horizon is worth far more than an equally good one that
 * cannot be started for eight months, because the whole product is about acting
 * in time. The second is `alignment` — an entry whose tags and track match what
 * the student said they want.
 */
export function scoreEntry(entry, ctx) {
  const { today, interests = [], appetite = 'moderate', selectivityStomach = 'balanced', place = null, major = 'undecided' } = ctx;
  let score = 40;

  // Priority: the catalog's own view of how much this matters.
  score += (PRIORITY[entry.priority] || 1) * 9;

  // Urgency. Peaks for things whose prep starts in the next two months, decays
  // both ways — something already startable but not yet urgent still beats
  // something eleven months out.
  if (ctx.window?.startBy) {
    const untilStart = daysBetween(today, ctx.window.startBy);
    if (untilStart < -30) score -= 25;              // start date well past — likely missed
    else if (untilStart <= 60) score += 18;         // the sweet spot
    else if (untilStart <= 150) score += 8;
    else score -= 4;                                // real, but not this student's problem yet
  }

  // Alignment with what they told us they want.
  const wanted = new Set(interests);
  if (wanted.has(entry.track)) score += 12;
  const tagHits = (entry.tags || []).filter((t) => wanted.has(t)).length;
  score += Math.min(9, tagHits * 3);

  // Selectivity, weighted by how much appetite they have for long shots. A
  // student who said "I want reaches" gets the penalty halved; one who said
  // "give me things I can actually get" gets it doubled.
  const stomachMultiplier = selectivityStomach === 'ambitious' ? 0.5 : selectivityStomach === 'realistic' ? 2 : 1;
  score -= (SELECTIVITY_PENALTY[entry.selectivity] || 0) * stomachMultiplier;

  // Time cost against what they said they have.
  const capacity = { low: 2, moderate: 4, high: 6 }[appetite] ?? 4;
  const load = EFFORT_LOAD[entry.effort] || 2;
  if (load > capacity) score -= (load - capacity) * 6;

  // Cost. Only ever a bonus for free/funded things, never a penalty for paid
  // ones — a paid program is still worth SHOWING to a family that can afford
  // it, and the intake's budget answer already gates the ones that cannot.
  if (entry.cost === 'free' || entry.cost === 'free-plus-stipend') score += 5;

  // A confidence:'varies' entry is usually a local thing, and local things are
  // systematically better bets than national ones — smaller fields, less
  // competition, and the student is already there.
  if (entry.confidence === 'varies' && entry.selectivity === 'open') score += 6;

  // ── Where they live ────────────────────────────────────────────────────────
  // The largest single term in this function after urgency, and it deserves to
  // be. A state health-pipeline program, an AHEC summer placement, a state
  // medical society scholarship: the applicant pool is one state rather than
  // fifty, so a student's odds at an in-state program are not marginally better
  // than at the national equivalent, they are different by an order of
  // magnitude. These are consistently the best-value things available to a high
  // schooler and consistently the ones nobody tells them about.
  //
  // The asymmetry is deliberate. 'home' is a large bonus; 'far' is a large
  // penalty but never a removal, because a residency-restricted entry that
  // slipped past its own gate should sink rather than vanish — a student who
  // spends summers with a grandparent in another state is a real person, and
  // burying a thing is recoverable where deleting it is not.
  //
  // All of it is conditional on actually knowing where they live. With no place
  // — the ZIP is optional and plenty of students will skip it — every entry
  // scores exactly as it did before, rather than a national default quietly
  // outranking the local programs this term exists to promote.
  if (place) {
    const band = proximity(place, entry.states);
    if (band === 'home') score += 16;
    else if (band === 'region') score += 7;
    else if (band === 'far') score -= 22;
  }

  // ── What they want to study ────────────────────────────────────────────────
  // A lean, never a filter — see the header of src/lib/geo/majors.js for why
  // this can only ever add. Capped well below the location and urgency terms: a
  // major is a fifteen-year-old's current guess, and it should tilt a year
  // rather than decide it.
  score += affinity(major, entry) * 4;

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * The whole eligible, dated, scored slate for one student.
 *
 * @param {object} opts.user          local user record (grade stage, onboarding)
 * @param {object} opts.answers       intake answers, keyed by GATE_KEYS + preferences
 * @param {Date}   opts.now           injectable clock (the verify script pins it)
 * @param {number} opts.horizonMonths how far ahead to look — 12 by design
 * @returns {{items: object[], years: object, gradeStage: string, today: string, horizonEnd: string}}
 */
export function buildCandidateSlate({ user = null, answers = {}, now = new Date(), horizonMonths = 12 } = {}) {
  const gradeStage = effectiveGradeStage(user, now) || user?.gradeStage || 'junior';
  const years = classFallYears(gradeStage, now);
  const today = dayKey(now);
  const horizonEnd = (() => {
    const d = new Date(now);
    d.setMonth(d.getMonth() + horizonMonths);
    return dayKey(d);
  })();

  const ctxBase = {
    today,
    interests: answers.interests || [],
    appetite: answers.timeAppetite || 'moderate',
    selectivityStomach: answers.selectivityStomach || 'balanced',
    // Both already resolved by answersToGates — this module never parses a ZIP
    // or validates a major id, it only reads the resolved answers. `place` is
    // null whenever the student skipped the question, and scoreEntry treats
    // null as "say nothing about location" rather than as a default.
    place: answers.place || null,
    major: answers.intendedMajor || 'undecided',
  };

  const items = [];
  for (const entry of ROADMAP_CATALOG) {
    if (!passesGates(entry, answers)) continue;

    // Try this year's occurrence, then next year's. Two passes is enough: the
    // horizon is twelve months, so no entry can have three occurrences inside
    // it, and a third pass would only ever produce dates past the horizon.
    for (let offset = 0; offset <= 1; offset += 1) {
      if (!fitsGrade(entry, gradeStage, offset)) continue;
      const window = resolveWindow(entry, years, gradeStage, offset);

      if (!window) {
        // Season-only entry (confidence:'varies' with no window at all). It
        // belongs on the roadmap but cannot be placed on a day, so it is
        // emitted once, unpinned, and the UI asks the student for the date.
        if (offset === 0) {
          items.push(makeItem(entry, null, ctxBase, { needsStudentDate: true }));
        }
        continue;
      }

      // Past the horizon, or already fully behind us — either way not this
      // year's problem. `-14` rather than `0` so an item that closed last week
      // still surfaces: "you missed this by six days, here is next year's" is
      // one of the most useful things this feature can say.
      const untilAnchor = daysBetween(today, window.anchor);
      if (window.anchor > horizonEnd) continue;
      if (untilAnchor < -14) continue;

      items.push(makeItem(entry, window, ctxBase, {
        yearOffset: offset,
        missed: untilAnchor < 0,
        needsStudentDate: entry.confidence === 'varies',
      }));
      // One occurrence per entry is enough. Taking the first that lands inside
      // the horizon means a student in March gets next January's USABO rather
      // than both the one they missed and the one they have not.
      break;
    }
  }

  // ── The four checks, at resolve time ───────────────────────────────────────
  // Everything above this line is arithmetic over a hand-written catalog, and
  // this is where the results of that arithmetic are checked before they can
  // reach a student — see the header of ./dateAudit.js for the four gates and
  // for why an item that fails one is withheld rather than shown with a caveat.
  //
  // This runs on every build, for every student, against the real clock. The
  // build-time pass (scripts/verifyRoadmapDates.mjs) cannot replace it: half of
  // what it catches depends on today's date, on this student's class years, or
  // on a leap year no fixture happened to cross.
  const audited = auditSlate(items, { today, horizonEnd });
  if (audited.report.withheld.length && typeof console !== 'undefined') {
    // A withheld item is a catalog bug, and the person who can fix it is reading
    // a console. The student is not told: from their side the entry simply is
    // not offered, which is the correct outcome and not an error they can act on.
    console.warn('[roadmap] withheld items failing date checks:',
      audited.report.withheld.map((w) => `${w.id} (${w.problems.map((p) => p.check).join(', ')})`).join('; '));
  }

  audited.items.sort((a, b) => (b.score - a.score) || String(a.anchor).localeCompare(String(b.anchor)));
  return { items: audited.items, years, gradeStage, today, horizonEnd, dateAudit: audited.report };
}

function makeItem(entry, window, ctxBase, extra = {}) {
  const ctx = { ...ctxBase, window };
  return {
    catalogId: entry.id,
    name: entry.name,
    org: entry.org || null,
    track: entry.track,
    trackLabel: TRACK_BY_ID[entry.track]?.label || entry.track,
    confidence: entry.confidence,
    season: entry.season || null,
    priority: entry.priority,
    selectivity: entry.selectivity,
    effort: entry.effort,
    format: entry.format,
    cost: entry.cost,
    url: entry.url || null,
    why: entry.why,
    steps: entry.steps || [],
    action: entry.action || null,
    tags: entry.tags || [],
    prepWeeks: entry.prepWeeks || 0,
    opportunityId: entry.opportunityId || null,
    scholarshipId: entry.scholarshipId || null,
    // Where you have to live to be eligible. Null for a nationally open entry.
    // Carried onto the item rather than looked back up from the catalog because
    // the item is what the UI and the generation prompt both hold, and a card
    // that wants to say "this one is in your state" should not have to reach
    // back into the catalog to find out.
    states: entry.states || null,
    // The band the card may print, resolved once here against the student we are
    // building for. Null whenever we do not know where they live — see
    // proximity() for why abstaining beats defaulting.
    proximity: proximity(ctxBase.place, entry.states),
    opens: window?.opens || null,
    due: window?.due || null,
    on: window?.on || null,
    anchor: window?.anchor || null,
    startBy: window?.startBy || null,
    score: scoreEntry(entry, ctx),
    yearOffset: 0,
    missed: false,
    needsStudentDate: false,
    ...extra,
  };
}

/**
 * The shortlist the model actually sees, capped and spread across tracks.
 *
 * A flat top-N by score would hand the model twelve scholarships and no
 * clinical experience, because scholarships score highly and there are a lot of
 * them. So the cap is applied PER TRACK first and the remainder filled by
 * global score — the same thing a human advisor does when they make sure a
 * student's year has some of everything.
 */
export function shortlistForPrompt(slate, { perTrack = 6, total = 48 } = {}) {
  const byTrack = new Map();
  slate.items.forEach((it) => {
    const list = byTrack.get(it.track) || [];
    if (list.length < perTrack) { list.push(it); byTrack.set(it.track, list); }
  });
  const picked = [...byTrack.values()].flat();
  const pickedIds = new Set(picked.map((i) => i.catalogId));
  const filler = slate.items.filter((i) => !pickedIds.has(i.catalogId)).slice(0, Math.max(0, total - picked.length));
  return [...picked, ...filler]
    .sort((a, b) => String(a.anchor || '9999').localeCompare(String(b.anchor || '9999')))
    .slice(0, total);
}

/** A catalog entry by id, or null. The generator's whitelist check. */
export const catalogEntry = (id) => CATALOG_BY_ID[id] || null;

export { SELECTIVITY, EFFORT };
