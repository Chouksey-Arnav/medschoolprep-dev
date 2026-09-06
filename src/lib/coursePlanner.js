// ─────────────────────────────────────────────────────────────────────────────
// THE FOUR-YEAR COURSE PLANNER — the engine.
//
// ── What it is for ──────────────────────────────────────────────────────────
// A student enters the courses they have taken and plan to take, by year. This
// module turns that into two things: pathway-specific gap warnings, and the
// `rigor` object the admissions calculator already reads
// (lib/admissions/academicFit.js → scoreRigor). Those are one feature, not two.
// A warning that says "most PA programs want physics" and a calculator that
// separately asks "how many AP courses have you taken" are the same question
// asked twice, and the student answers it inconsistently, and then the two
// screens disagree about them.
//
// ── The rule the warnings obey ──────────────────────────────────────────────
// Every warning names a REQUIREMENT and a YEAR IT IS STILL FIXABLE IN, or it
// does not get written. "You are missing physics" is an accusation. "Most
// combined-degree programs expect physics, and you have two open slots in
// eleventh and twelfth grade" is a plan. Warnings for a year that has already
// passed are downgraded to notes, because there is nothing to do about them and
// telling a senior their ninth-grade schedule was wrong is just unkindness with
// a progress bar attached.
//
// ── Why rigor is computed here and not asked for ────────────────────────────
// scoreRigor() wants weighted advanced-course counts plus how many the school
// offers. A student who has typed their actual schedule has already told us the
// first number, exactly, and asking again invites a guess. The second — how many
// advanced courses the school offers — genuinely cannot be derived and is the
// one field the planner asks for outright, because it is also the single
// cheapest input for tightening the estimate (see the note in scoreRigor).
//
// Pure functions and plain data. No React, no storage, no fetch.
// ─────────────────────────────────────────────────────────────────────────────

import { GRADE_KEYS } from './timeline.js';

// ── Course levels ────────────────────────────────────────────────────────────
// The weights match scoreRigor()'s: AP, IB and dual enrollment count 1.0, honors
// counts 0.5, and a regular course counts 0. That is not this module's opinion —
// it is the calculator's, and duplicating it with different numbers would make
// the planner's rigor readout disagree with the estimate it feeds.
export const COURSE_LEVELS = [
  { id: 'regular', label: 'Regular',         weight: 0,   rigorKey: null },
  { id: 'honors',  label: 'Honors',          weight: 0.5, rigorKey: 'honors' },
  { id: 'ap',      label: 'AP',              weight: 1,   rigorKey: 'ap' },
  { id: 'ib',      label: 'IB',              weight: 1,   rigorKey: 'ib' },
  { id: 'de',      label: 'Dual enrollment', weight: 1,   rigorKey: 'dualEnrollment' },
];
export const LEVEL_BY_ID = Object.fromEntries(COURSE_LEVELS.map(l => [l.id, l]));

// ── Subjects ─────────────────────────────────────────────────────────────────
// Deliberately short. A catalog with every course in America is unfillable; this
// is the set the gap rules actually reason about, plus an "other" escape so a
// student's real schedule is never rejected by our vocabulary.
export const SUBJECTS = [
  { id: 'biology',    label: 'Biology',                group: 'Science', lab: true },
  { id: 'chemistry',  label: 'Chemistry',              group: 'Science', lab: true },
  { id: 'physics',    label: 'Physics',                group: 'Science', lab: true },
  { id: 'anatomy',    label: 'Anatomy and physiology', group: 'Science', lab: true },
  { id: 'envSci',     label: 'Environmental science',  group: 'Science', lab: true },
  { id: 'healthSci',  label: 'Health science (CTE)',   group: 'Science', lab: false },
  { id: 'algebra1',   label: 'Algebra 1',              group: 'Math' },
  { id: 'geometry',   label: 'Geometry',               group: 'Math' },
  { id: 'algebra2',   label: 'Algebra 2',              group: 'Math' },
  { id: 'precalc',    label: 'Precalculus',            group: 'Math' },
  { id: 'calculus',   label: 'Calculus',               group: 'Math' },
  { id: 'statistics', label: 'Statistics',             group: 'Math' },
  { id: 'psychology', label: 'Psychology',             group: 'Social science' },
  { id: 'english',    label: 'English',                group: 'Core' },
  { id: 'history',    label: 'History or government',  group: 'Core' },
  { id: 'language',   label: 'World language',         group: 'Core' },
  { id: 'other',      label: 'Something else',         group: 'Other' },
];
export const SUBJECT_BY_ID = Object.fromEntries(SUBJECTS.map(s => [s.id, s]));

/** The four planning years, keyed to the same grade keys the rest of the app
 *  uses so a plan can be compared against the student's actual grade. */
export const PLAN_YEARS = [
  { id: 'y9',  grade: 'freshman',  label: '9th grade' },
  { id: 'y10', grade: 'sophomore', label: '10th grade' },
  { id: 'y11', grade: 'junior',    label: '11th grade' },
  { id: 'y12', grade: 'senior',    label: '12th grade' },
];
export const PLAN_YEAR_IDS = PLAN_YEARS.map(y => y.id);

/** An empty plan — four years of nothing, plus the one thing we cannot derive. */
export function emptyPlan() {
  return {
    years: Object.fromEntries(PLAN_YEAR_IDS.map(id => [id, []])),
    offeredAdvanced: null,
    schoolOffersAp: null,   // null = unanswered, which is different from false
  };
}

/** A course row. `id` is a local key only; nothing persists across sessions on
 *  it, so it never has to be stable across devices. */
export function makeCourse(subject = 'other', level = 'regular', title = '') {
  return { id: `c${Math.random().toString(36).slice(2, 9)}`, subject, level, title };
}

/**
 * Coerce anything into a valid plan.
 *
 * Exported because App.jsx deliberately reads the persisted plan as opaque JSON
 * — importing this module on boot for one helper would drag the course catalog
 * and the gap rules back into the entry graph that the panel's React.lazy just
 * got them out of. So the panel, which owns the shape, normalizes whatever it
 * is handed: null on a first visit, a stale shape from an older release, or a
 * hand-edited localStorage value.
 */
export const normalizePlan = (plan) => {
  const base = emptyPlan();
  if (!plan || typeof plan !== 'object') return base;
  return {
    years: Object.fromEntries(PLAN_YEAR_IDS.map(id => [id, Array.isArray(plan.years?.[id]) ? plan.years[id] : []])),
    offeredAdvanced: plan.offeredAdvanced ?? null,
    schoolOffersAp: plan.schoolOffersAp ?? null,
  };
};

/** Every course in the plan, flattened, each carrying the year it sits in. */
export function allCourses(plan) {
  const p = normalizePlan(plan);
  return PLAN_YEAR_IDS.flatMap(yid => p.years[yid].map(c => ({ ...c, year: yid })));
}

const has = (courses, subjectId) => courses.some(c => c.subject === subjectId);
const yearIdx = (yid) => PLAN_YEAR_IDS.indexOf(yid);

// ── Rigor ────────────────────────────────────────────────────────────────────

/**
 * The exact object lib/admissions/academicFit.js → scoreRigor() expects.
 *
 * Counts are of COURSES, matching how scoreRigor weights them (honors at 0.5,
 * everything else at 1.0), so the calculator's arithmetic is unchanged — this
 * only removes the guessing from its inputs.
 */
export function rigorFromPlan(plan) {
  const p = normalizePlan(plan);
  const courses = allCourses(p);
  const counts = { ap: 0, ib: 0, honors: 0, dualEnrollment: 0 };
  for (const c of courses) {
    const key = LEVEL_BY_ID[c.level]?.rigorKey;
    if (key) counts[key] += 1;
  }
  const offered = Number.isFinite(Number(p.offeredAdvanced)) && p.offeredAdvanced !== null && p.offeredAdvanced !== ''
    ? Number(p.offeredAdvanced) : null;
  return { ...counts, offeredAdvanced: offered };
}

/** The weighted total scoreRigor() will compute, surfaced so the planner can
 *  show the student the same number the calculator is about to use. */
export function weightedAdvanced(plan) {
  const r = rigorFromPlan(plan);
  return r.ap + r.ib + r.dualEnrollment + r.honors * 0.5;
}

// ── The gap rules ────────────────────────────────────────────────────────────
//
// Each rule states a requirement, which pathways it applies to, and how to tell
// whether the plan satisfies it. Severity is 'gap' (a program requirement the
// plan does not meet), 'watch' (a real risk, not a requirement) or 'note' (true
// and worth knowing, nothing to fix).
//
// `pathways` is a list of PATHS keys, or 'all'. `combined` marks a rule that
// only fires for a student who says they are considering a combined-degree
// program, because applying combined-degree expectations to everyone is how a
// future respiratory therapist ends up being told their schedule is inadequate.

const SCIENCE_HEAVY = ['physician', 'physicianAssistant', 'dentistry', 'pharmacy', 'biomedResearch'];
const NURSING_ALLIED = ['nursing', 'physicalOccupTherapy'];

export const GAP_RULES = [
  {
    id: 'three-lab-sciences',
    pathways: 'all',
    severity: 'gap',
    title: 'Three lab sciences',
    test: (courses) => ['biology', 'chemistry', 'physics', 'anatomy', 'envSci'].filter(s => has(courses, s)).length >= 3,
    message: 'Nearly every health program expects three lab sciences, and the usual three are biology, chemistry, and physics.',
    fix: 'Add a third lab science — physics or anatomy and physiology are the two that fit most schedules.',
  },
  {
    id: 'chemistry',
    pathways: 'all',
    severity: 'gap',
    title: 'Chemistry',
    test: (courses) => has(courses, 'chemistry'),
    message: 'Chemistry is a prerequisite for essentially every health pathway, and the college version assumes you have seen it once.',
    fix: 'Get chemistry onto the transcript — through your school, dual enrollment, or a summer term.',
  },
  {
    id: 'biology',
    pathways: 'all',
    severity: 'gap',
    title: 'Biology',
    test: (courses) => has(courses, 'biology'),
    message: 'Biology is the base every later science course on a health pathway builds on.',
    fix: 'Schedule biology as early as your school allows — it is usually a ninth grade course.',
  },
  {
    id: 'physics-for-combined',
    pathways: SCIENCE_HEAVY,
    severity: 'gap',
    title: 'Physics',
    test: (courses) => has(courses, 'physics'),
    message: 'Combined-degree and competitive science programs read physics as part of the standard three-science load, and its absence is visible.',
    fix: 'Fit physics into eleventh or twelfth grade, or take it through dual enrollment if your school does not offer it.',
  },
  {
    id: 'anatomy-for-nursing',
    pathways: NURSING_ALLIED,
    severity: 'watch',
    title: 'Anatomy and physiology',
    test: (courses) => has(courses, 'anatomy') || has(courses, 'healthSci'),
    message: 'College anatomy and physiology is the course that removes most students from nursing and therapy programs, and it is far easier the second time you see it.',
    fix: 'Take anatomy and physiology, or a health science CTE sequence that includes it, in eleventh or twelfth grade.',
  },
  {
    id: 'statistics-for-nursing',
    pathways: NURSING_ALLIED,
    severity: 'watch',
    title: 'Statistics',
    test: (courses) => has(courses, 'statistics'),
    message: 'Most nursing programs name statistics as a prerequisite for the major — far more often than they name calculus.',
    fix: 'Put statistics in your senior math slot rather than a calculus course these programs do not ask for.',
  },
  {
    id: 'calculus-for-combined',
    pathways: SCIENCE_HEAVY,
    combined: true,
    severity: 'gap',
    title: 'Calculus',
    test: (courses) => has(courses, 'calculus'),
    message: 'Combined-degree programs either require calculus or admit a pool that has it, which makes not reaching it a visible difference rather than a neutral one.',
    fix: 'Work backward from senior year: precalculus in eleventh grade, which usually means Algebra 2 by tenth.',
  },
  {
    id: 'math-through-precalc',
    pathways: 'all',
    severity: 'watch',
    title: 'Math through precalculus',
    test: (courses) => has(courses, 'precalc') || has(courses, 'calculus'),
    message: 'Four years of math through at least precalculus is the default expectation at four-year programs, health pathway or not.',
    fix: 'Keep a math course in every year, including senior year — dropping senior math is read as a step down in rigor.',
  },
  {
    id: 'psychology',
    pathways: ['nursing', 'physicianAssistant', 'publicHealth', 'physicalOccupTherapy', 'physician'],
    severity: 'note',
    title: 'Psychology',
    test: (courses) => has(courses, 'psychology'),
    message: 'Psychology is a common prerequisite for nursing and PA programs and one of the least painful ways to add a social science.',
    fix: 'Add psychology as an elective in eleventh or twelfth grade if there is room.',
  },
  {
    id: 'senior-year-science',
    pathways: 'all',
    severity: 'watch',
    title: 'Science in senior year',
    test: (courses) => courses.some(c => c.year === 'y12' && SUBJECT_BY_ID[c.subject]?.group === 'Science'),
    message: 'A senior year with no science reads as a step down in rigor, and it is one of the few things readers comment on directly.',
    fix: 'Keep one science in twelfth grade, even if it is the elective rather than the AP.',
  },
  {
    id: 'four-english',
    pathways: 'all',
    severity: 'note',
    title: 'Four years of English',
    test: (courses) => PLAN_YEAR_IDS.every(y => courses.some(c => c.year === y && c.subject === 'english')),
    message: 'Four years of English is a hard requirement at most four-year colleges, health pathway or not.',
    fix: 'Make sure English appears in all four years of the plan.',
  },
  {
    id: 'language-two-years',
    pathways: 'all',
    severity: 'note',
    title: 'Two years of one world language',
    test: (courses) => courses.filter(c => c.subject === 'language').length >= 2,
    message: 'Two years of the same world language is a common minimum, and three is the level that stops being a checkbox.',
    fix: 'Keep the same language for at least two years rather than switching.',
  },
];

/**
 * The year a still-fixable gap should be fixed in — the earliest planned year
 * that has not happened yet. `currentGrade` is the student's real grade, so a
 * junior is never told to fix something in tenth grade.
 */
function firstOpenYear(currentGrade) {
  const cur = GRADE_KEYS.indexOf(currentGrade);
  if (cur < 0) return PLAN_YEAR_IDS[0];
  // A student in 'gap' (already graduated) has no open year at all.
  if (cur >= 4) return null;
  return PLAN_YEAR_IDS[Math.min(3, cur)] || null;
}

/**
 * Run the rules against a plan.
 *
 * @param plan          the plan object.
 * @param opts.pathways array of active PATHS keys. A student running nursing
 *                      AND physician gets the union of both rule sets, which is
 *                      correct: they are applying to both.
 * @param opts.gradeStage the student's grade key, for fixability.
 * @param opts.combined true when the student is considering a combined-degree
 *                      program. Off by default — combined-degree expectations
 *                      applied to everyone are how the planner becomes noise.
 */
export function evaluatePlan(plan, { pathways = [], gradeStage = null, combined = false } = {}) {
  const p = normalizePlan(plan);
  const courses = allCourses(p);
  const active = Array.isArray(pathways) ? pathways : [pathways].filter(Boolean);
  const openYear = firstOpenYear(gradeStage);

  const findings = [];
  for (const rule of GAP_RULES) {
    const applies = rule.pathways === 'all' || active.some(k => rule.pathways.includes(k));
    if (!applies) continue;
    if (rule.combined && !combined) continue;
    if (rule.test(courses)) continue;

    // Nothing to fix once every planned year is behind you. The finding is still
    // true, so it is reported — as a note, without a false instruction.
    const fixable = openYear != null;
    findings.push({
      id: rule.id,
      title: rule.title,
      severity: fixable ? rule.severity : 'note',
      message: rule.message,
      fix: fixable ? rule.fix : null,
      fixBy: fixable ? PLAN_YEARS.find(y => y.id === openYear)?.label || null : null,
      slotsLeft: fixable ? PLAN_YEAR_IDS.length - yearIdx(openYear) : 0,
    });
  }

  const order = { gap: 0, watch: 1, note: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    findings,
    gaps: findings.filter(f => f.severity === 'gap'),
    watches: findings.filter(f => f.severity === 'watch'),
    notes: findings.filter(f => f.severity === 'note'),
    courseCount: courses.length,
    rigor: rigorFromPlan(p),
    weighted: weightedAdvanced(p),
    // The doubling-up read: a year carrying two or more lab sciences. Reported
    // rather than warned about, because doubling is a legitimate choice with a
    // cost, and the lesson beside this planner is where the cost is explained.
    doubledYears: PLAN_YEARS.filter(y =>
      p.years[y.id].filter(c => SUBJECT_BY_ID[c.subject]?.lab).length >= 2
    ).map(y => y.label),
    fixableIn: openYear,
  };
}

/**
 * The one-line summary the pathway view and the admissions calculator both
 * show, so the two screens say the same thing about the same plan.
 */
export function planHeadline(result) {
  if (!result || result.courseCount === 0) return 'Add the courses you have taken and the ones you plan to take.';
  if (result.gaps.length === 0 && result.watches.length === 0) {
    return 'No gaps against your pathways — this plan covers what your programs ask for.';
  }
  if (result.gaps.length === 0) {
    return `${result.watches.length} thing${result.watches.length === 1 ? '' : 's'} worth a second look, no outright gaps.`;
  }
  return `${result.gaps.length} gap${result.gaps.length === 1 ? '' : 's'} against what your pathways expect.`;
}
