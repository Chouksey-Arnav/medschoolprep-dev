// ─────────────────────────────────────────────────────────────────────────────
// THE FOUR-YEAR MAP — the same lessons, in a container that does not run out.
//
// ── The problem this exists to solve ─────────────────────────────────────────
// A linear track has an end, and a motivated tenth grader will find it. When
// they do, the app has told them, in the clearest language a product has — an
// empty list — that there is nothing here for them for two years. Those two
// years are exactly the ones where we are most valuable: junior year is when
// the application is built and senior year is when it ships. Track exhaustion
// is not a content problem we can outrun by writing more units; a faster reader
// finishes those too. It is a container problem.
//
// So the same units are laid out as four years plus a foundations tier. A
// student in tenth grade who finishes everything timed for tenth grade has not
// finished the app — they have finished this year, which is what finishing is
// supposed to mean, and years eleven and twelve are sitting right there, fully
// browsable, with a completion ring apiece that reads 0%. That is a reason to
// come back in August rather than a reason to stop.
//
// ── Preview, never locked ────────────────────────────────────────────────────
// This module obeys the rule in lib/gradeBand.js: grade band changes emphasis
// and never access. `state` is one of 'past' | 'active' | 'preview' and there is
// deliberately no fourth value and no boolean called `locked`. A later year is
// fully visible, fully openable, and every lesson inside it starts exactly as it
// would have before this module existed — sequencing and unlocking are computed
// elsewhere (lessonState in App.jsx) and are not touched here. A ninth grader
// who wants to read the senior-year units today can, and always could. The map
// simply stops pretending that is what they should be doing this week.
//
// ── Where a unit's year comes from ───────────────────────────────────────────
// The four deep tracks already tag each unit with `gradeFocus`, the class years
// it is genuinely best timed for. That tag is the input; there is no second list
// to keep in sync, which is the same discipline bandsFromGrades() follows.
//
// A unit tagged for several grades appears on EVERY one of those years' shelves,
// not just the earliest. That is what the tag already means — "this is good from
// here on" — and the first draft of this module, which placed each unit in the
// earliest grade only, produced the exact bug the feature exists to prevent:
// every pathway's Year 4 shelf came out empty, because no unit anywhere has
// 'senior' as its EARLIEST grade. A twelfth grader would have opened the map
// built to keep them engaged and found nothing on their own year. So a unit is
// on a year when it is timed for that year, full stop, and a year's percentage
// answers "how much of the work timed for this year have I done" rather than
// carving the track into four disjoint piles.
//
// The six narrower tracks carry no gradeFocus at all. Rather than dropping them
// into an "unscheduled" bucket nobody opens, they are spread across the four
// years by position — each unit spanning the slice of the four years its
// position covers, so three units still fill four shelves. That reproduces what
// a student would do anyway (start at the top, work down over four years) and
// keeps the map honest about being a recommendation rather than a schedule.
// `basis` says which of the two happened, so the UI can be truthful about how
// confident the placement is.
//
// Pure functions and plain data — no React, no storage — so
// scripts/verifyFourYearMap.mjs can import the whole thing under plain Node.
// ─────────────────────────────────────────────────────────────────────────────

import { bandsFromGrades, BAND_BY_ID, bandOfGrade } from './gradeBand.js';
import { isFoundationUnit } from '../data/foundationUnits.js';

// ── The tiers ────────────────────────────────────────────────────────────────
// Five shelves: one that is in date every year, and four that take turns.
//
// The foundations tier is first and is never 'preview'. It is the answer to the
// obvious objection to a year map — that a student who arrives mid-year with an
// urgent question should not have to find the year it was filed under.
export const FOUNDATION_TIER = {
  id: 'foundations',
  label: 'Foundations',
  short: 'Foundations',
  grade: null,
  years: 'Every year',
  focus: 'Course strategy and credentials — the decisions you make against the same transcript whichever pathway you pick.',
  blurb: 'Open to everyone, every year. Nothing here waits on anything else.',
};

/** The four school years, in order. `grade` is the GRADE_KEYS key this year is
 *  for, which is what ties a tier to a student without a second mapping. */
export const YEAR_TIERS = [
  { id: 'y9',  label: 'Year 1', short: '9th',  grade: 'freshman',  years: '9th grade',
    focus: 'Get the science base in and find out what any of this actually is.' },
  { id: 'y10', label: 'Year 2', short: '10th', grade: 'sophomore', years: '10th grade',
    focus: 'Go deeper, test the field for real, and set up the schedule junior year needs.' },
  { id: 'y11', label: 'Year 3', short: '11th', grade: 'junior',    years: '11th grade',
    focus: 'Build the thing you will apply with — the list, the letters, the experiences.' },
  { id: 'y12', label: 'Year 4', short: '12th', grade: 'senior',    years: '12th grade',
    focus: 'Ship it, and use what you built.' },
];

/** Every tier including foundations, in display order. */
export const ALL_TIERS = [FOUNDATION_TIER, ...YEAR_TIERS];
export const TIER_IDS = ALL_TIERS.map(t => t.id);
export const TIER_BY_ID = Object.fromEntries(ALL_TIERS.map(t => [t.id, t]));

/** The tier id a grade key belongs to. 'gap' — a student past graduation —
 *  reads as the senior year, because that is the shelf their remaining work is
 *  on, not because we think they are still in twelfth grade. */
export function tierOfGrade(gradeStage) {
  if (gradeStage === 'gap') return 'y12';
  const t = YEAR_TIERS.find(y => y.grade === gradeStage);
  return t ? t.id : null;
}

const TIER_ORDER = Object.fromEntries(ALL_TIERS.map((t, i) => [t.id, i]));

// ── Placing a unit ───────────────────────────────────────────────────────────

/**
 * Which year tiers a unit belongs on, and on what evidence.
 *
 * Returns `{ tiers, basis }` where basis is:
 *   'foundations' — the unit declares itself part of the always-open tier.
 *   'tagged'      — placed from its own gradeFocus. The confident case.
 *   'spread'      — no gradeFocus anywhere on this track, so placed by position.
 *                   The UI says "suggested" rather than "recommended" for these.
 *
 * `index` and `total` are the unit's position among the track's YEAR units
 * (foundations excluded by the caller), which is what makes the spread even.
 */
export function tiersOfUnit(unit, index = 0, total = 1) {
  if (isFoundationUnit(unit)) return { tiers: [FOUNDATION_TIER.id], basis: 'foundations' };

  const focus = Array.isArray(unit?.gradeFocus) ? unit.gradeFocus : [];
  if (focus.length) {
    const tiers = [];
    for (const g of focus) {
      // 'gap' maps onto the senior shelf (tierOfGrade), which is right: a unit
      // tagged for a student who has already graduated is senior-year work.
      const t = tierOfGrade(g);
      if (t && !tiers.includes(t)) tiers.push(t);
    }
    if (tiers.length) {
      tiers.sort((a, b) => TIER_ORDER[a] - TIER_ORDER[b]);
      return { tiers, basis: 'tagged' };
    }
  }

  // Untagged track: spread by position across the four years, each unit
  // covering the slice of the four years its position spans — so three units
  // still fill four shelves rather than leaving Year 4 dark. Guarded against
  // total <= 1, where the division would be a divide-by-zero.
  const denom = Math.max(1, total);
  const start = Math.min(3, Math.floor((index / denom) * 4));
  const end = Math.max(start, Math.min(3, Math.ceil(((index + 1) / denom) * 4) - 1));
  const tiers = [];
  for (let i = start; i <= end; i++) tiers.push(YEAR_TIERS[i].id);
  return { tiers, basis: 'spread' };
}

/** The single year a unit is FIRST timed for — the one a caller wants when it
 *  needs one answer rather than a shelf list (a badge, a sort key, an export). */
export function tierOfUnit(unit, index = 0, total = 1) {
  const { tiers, basis } = tiersOfUnit(unit, index, total);
  return { tier: tiers[0], basis };
}

/**
 * The grades a LESSON is recommended for.
 *
 * Every lesson is tagged, which is the requirement — but tagging each of ~250
 * lessons by hand would have produced 250 chances to disagree with the unit it
 * sits in. So a lesson inherits its unit's tag unless it overrides it, and the
 * override exists for the genuine exceptions rather than as the default.
 */
export function lessonGrades(lesson, unit) {
  const own = Array.isArray(lesson?.gradeFocus) ? lesson.gradeFocus : null;
  if (own?.length) return own;
  return Array.isArray(unit?.gradeFocus) ? unit.gradeFocus : [];
}

/**
 * The full tag set for one lesson: the grades it is timed for, the band those
 * grades fall in, the year tier it sits on, and the pathway it belongs to.
 *
 * `pathway` is 'all' for a foundations lesson rather than the key of whichever
 * track the student happened to open it from — the record is shared across all
 * ten, and saying "physician" would be a claim about the lesson that is false
 * for the nine other students reading the identical text.
 */
export function lessonTags(lesson, unit, pathwayKey, { index = 0, total = 1 } = {}) {
  const grades = lessonGrades(lesson, unit);
  const bands = bandsFromGrades(grades);
  const { tier, basis } = tierOfUnit(unit, index, total);
  return {
    id: lesson?.id || null,
    grades,
    bands,
    bandLabels: bands.map(b => BAND_BY_ID[b]?.label).filter(Boolean),
    tier,
    tierBasis: basis,
    pathway: isFoundationUnit(unit) ? 'all' : (pathwayKey || null),
  };
}

// ── Building the map ─────────────────────────────────────────────────────────

/**
 * Group a pathway's units into the five tiers, with per-tier completion.
 *
 * @param units        the pathway's unit array, exactly as PATHS holds it.
 * @param opts.pathwayKey  which track these came from, for lesson tags.
 * @param opts.isDone      (lesson) => boolean. Injected rather than imported
 *                         because "complete" is App.jsx's definition (a lesson
 *                         with a quiz is complete only when verified) and a
 *                         second copy of that rule is a second chance to be
 *                         wrong about a student's progress.
 * @param opts.gradeStage  the student's current grade key, or null when we do
 *                         not know it — in which case NOTHING is preview and
 *                         every tier reads active, per the gradeBand rule that
 *                         an account we know nothing about gets the whole app.
 */
export function buildFourYearMap(units, { pathwayKey = null, isDone = () => false, gradeStage = null } = {}) {
  const list = Array.isArray(units) ? units : [];
  const yearUnits = list.filter(u => !isFoundationUnit(u));
  const currentTier = tierOfGrade(gradeStage);

  const buckets = Object.fromEntries(TIER_IDS.map(id => [id, []]));

  let yearIdx = 0;
  for (let i = 0; i < list.length; i++) {
    const unit = list[i];
    const foundation = isFoundationUnit(unit);
    const placed = tiersOfUnit(unit, yearIdx, yearUnits.length);
    if (!foundation) yearIdx += 1;
    const lessons = unit.lessons || [];
    const entry = {
      unit,
      basis: placed.basis,
      tiers: placed.tiers,
      // The unit's own index in the ORIGINAL array, because that is what
      // App.jsx's lessonState() gates on. The map reorders for display and must
      // never reorder what it hands back, or a unit would render available in
      // one place and locked in another.
      index: i,
      lessons: lessons.map(l => ({
        lesson: l,
        tags: lessonTags(l, unit, pathwayKey, { index: foundation ? yearIdx : yearIdx - 1, total: yearUnits.length }),
        done: !!isDone(l),
      })),
    };
    // The same unit object on several shelves, deliberately. A unit timed for
    // tenth through twelfth grade is on all three, and a year's percentage
    // answers "how much of the work timed for this year is done" rather than
    // slicing the track into four disjoint piles that leave Year 4 empty.
    for (const t of placed.tiers) buckets[t].push(entry);
  }

  const tiers = ALL_TIERS.map(tier => {
    const entries = buckets[tier.id];
    const lessons = entries.flatMap(e => e.lessons);
    const doneCount = lessons.filter(l => l.done).length;
    return {
      ...tier,
      units: entries,
      lessonCount: lessons.length,
      doneCount,
      // A tier with no units is at 0%, not at 100%. "Complete" has to mean
      // something was completed, or an empty year would congratulate a student
      // for content that does not exist.
      pct: lessons.length ? Math.round((doneCount / lessons.length) * 100) : 0,
      complete: lessons.length > 0 && doneCount === lessons.length,
      empty: lessons.length === 0,
      state: tierState(tier.id, currentTier),
      band: tier.grade ? bandOfGrade(tier.grade) : null,
    };
  });

  return {
    tiers,
    byId: Object.fromEntries(tiers.map(t => [t.id, t])),
    currentTier,
    // What the rail should open on: this student's year, or foundations when we
    // do not know their year yet. Never year one by default — a senior landing
    // on ninth grade content is the exact failure this whole module is about.
    defaultTier: currentTier || FOUNDATION_TIER.id,
  };
}

/**
 * 'past' | 'active' | 'preview'. Three values, no fourth, and none of them
 * means locked.
 *
 * A year the student has already passed is 'past' rather than 'preview' because
 * the two need different sentences: an eleventh grader looking at ninth grade
 * work should be told it is behind them and still open, not told that most
 * students use it in ninth grade, which they can see from the label.
 */
export function tierState(tierId, currentTierId) {
  if (tierId === FOUNDATION_TIER.id) return 'active';
  if (!currentTierId) return 'active';
  if (tierId === currentTierId) return 'active';
  return TIER_ORDER[tierId] < TIER_ORDER[currentTierId] ? 'past' : 'preview';
}

/**
 * The sentence a non-active tier wears. Same discipline as
 * previewBannerText(): it says who uses this and when, and then invites the
 * student in. It never says locked, unavailable, or not yet.
 */
export function tierBannerText(tier, state) {
  if (state === 'past') {
    return `${tier.years} work. You are past this year — everything here is still open if you want to fill a gap.`;
  }
  if (state === 'preview') {
    return `Most students work through this in ${tier.years}. It is open now if you want to read ahead.`;
  }
  return tier.focus || '';
}

/**
 * The one line that answers "so what do I do now" from a completed year.
 *
 * This is the payload of the whole restructure. A student who finishes their
 * year used to hit an empty list; now they get told, specifically, that their
 * year is done and which shelf is next — including the case where the next
 * shelf is a year away, where the honest answer is foundations plus a date
 * rather than a manufactured task.
 */
export function nextTierSuggestion(map) {
  if (!map?.tiers?.length) return null;
  const current = map.byId[map.currentTier] || null;
  if (current && !current.complete && current.lessonCount > 0) return null;

  const foundations = map.byId[FOUNDATION_TIER.id];
  if (foundations && !foundations.complete && foundations.lessonCount > 0) {
    return {
      tier: FOUNDATION_TIER.id,
      headline: current?.complete ? `${current.years} is done.` : 'Start with foundations.',
      body: 'Course strategy and credentials are the two things that pay off in every year, including this one. They are open now.',
    };
  }

  const order = TIER_IDS.indexOf(map.currentTier);
  const ahead = map.tiers.find(t => TIER_ORDER[t.id] > order && !t.empty && !t.complete);
  if (ahead) {
    return {
      tier: ahead.id,
      headline: current?.complete ? `${current.years} is done.` : 'Read ahead if you want.',
      body: `${ahead.years} opens up next. Nothing is stopping you reading it today — most students come back to it in ${ahead.years.toLowerCase()}.`,
    };
  }

  return {
    tier: FOUNDATION_TIER.id,
    headline: 'Every year on this pathway is complete.',
    body: 'Add a second pathway, or use the course planner and the certification explorer — both stay useful after the lessons run out.',
  };
}
