// ─────────────────────────────────────────────────────────────────────────────
// What a student sees on the dashboard, and when.
//
// ── The problem ──────────────────────────────────────────────────────────────
// The Home tab renders fourteen modules, unconditionally, from the first second
// of a brand-new account. Six of them are readings of progress that does not
// exist yet: hours rings at zero across four categories, a sixty-day deadline
// horizon with nothing in it, a progress breakdown of a pathway with no lessons
// done, five achievements all unearned, a MedEx Score with no score. A student
// who has just finished onboarding scrolls past a page of empty measurements of
// themselves before reaching anything they can do.
//
// That is the wrong first impression in a specific and damaging way. It reads as
// a list of things they are already behind on. The modules are individually good
// — every one of them earns its place for a student six weeks in — and the fix
// is not to delete any of them. It is to stop showing a measurement before there
// is anything to measure.
//
// ── The rule ─────────────────────────────────────────────────────────────────
// A module appears when the thing it measures exists. Not on a timer, not on a
// day count, not on a level: on whether this particular student has the data
// that makes this particular module say something true. A student who logs
// twenty activities in their first hour has earned the hours rings in their
// first hour, and a student who has done nothing in three weeks has not earned
// them in three weeks, and both of those are correct.
//
// ── Three commitments ────────────────────────────────────────────────────────
//  1. NOTHING IS EVER REMOVED. Every module deferred here is still reachable
//     right now: the hours rings live on Portfolio, the progress breakdown on
//     Progress, the deadline horizon on Milestones. This decides what the
//     DASHBOARD leads with, and the dashboard was never the only route to any of
//     it.
//  2. THE STUDENT CAN ALWAYS OVERRIDE. `homeDensity: 'full'` shows everything
//     immediately and forever, and the card that offers it says exactly what it
//     will add rather than being a mystery toggle. Deciding for someone what
//     they are ready to see, with no way to disagree, is its own kind of
//     condescension.
//  3. IT ONLY EVER OPENS. Once a module has been earned it does not disappear
//     again if the data behind it dips — a student who deletes an activity
//     should not watch the dashboard rearrange itself around the loss. See
//     `earned` below.
//
// Pure functions. No React — so scripts/verifyHomeDensity.mjs can assert the
// whole ladder directly.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every module the dashboard can render, in render order, with the condition
 * that earns it.
 *
 * `always: true` means it is never withheld. Three modules qualify, and the
 * reason each does is the same: it is about what to DO rather than about how the
 * student is doing.
 *
 *   hero        — who you are and which pathway you are on
 *   nextThree   — the only module that answers "what do I do in the next twenty
 *                 minutes". A student should never open this app and wonder.
 *   fourYearArc — answers the question a ninth grader is silently asking while
 *                 looking at the module above: why does any of this matter yet.
 *                 It is the module that most needs to be seen EARLY, since
 *                 everything else on the page is scoped to the next sixty days
 *                 and a freshman who only sees those correctly concludes they
 *                 should come back junior year.
 *
 * `earns` is (signals) => boolean. It is asked only about the CURRENT signals;
 * the ratchet that stops a module disappearing again lives in `visibleModules`.
 */
export const HOME_MODULES = [
  { id: 'hero', label: 'Your name and pathway', always: true },
  { id: 'nextThree', label: 'The next three things', always: true },
  { id: 'fourYearArc', label: 'The four-year arc', always: true },

  {
    id: 'hoursRings',
    label: 'Hours by category',
    // A ring at zero is not a reading, it is an accusation. One logged activity
    // is enough for the rings to say something true and for the empty ones to
    // read as a gap rather than as a verdict.
    earns: (s) => s.activities >= 1 || s.clinicalHours > 0,
    adds: 'Your hours by category, against what your pathway actually expects',
  },
  {
    id: 'deadlineHorizon',
    label: 'The next sixty days',
    // Colored by when work has to START, which is meaningless with nothing on
    // the calendar.
    earns: (s) => s.deadlines >= 1 || s.colleges >= 1,
    adds: 'Everything due in the next sixty days, colored by when to start',
  },
  {
    id: 'progressDetail',
    label: 'Progress breakdown',
    // Four charts of a pathway nobody has started is four empty charts.
    earns: (s) => s.lessonsDone >= 3 || s.quizzes >= 2,
    adds: 'Track completion, quiz trends by topic, and flashcard retention',
  },
  {
    id: 'achievements',
    label: 'Achievements and streak',
    // Five locked rows on day one is a list of things you have not done. One
    // earned achievement, or a streak worth keeping, turns it into a record.
    earns: (s) => s.achievements >= 1 || s.streak >= 2,
    adds: 'Five milestones that name something true about you outside this app',
  },
  {
    id: 'medex',
    label: 'MedEx Score',
    // Seals weekly. Before the first seal there is genuinely nothing to show.
    earns: (s) => s.hasMedexScore,
    adds: 'Your MedEx Score, sealed weekly',
  },
  {
    id: 'roadmapCard',
    label: 'The roadmap\'s most urgent item',
    earns: (s) => s.hasRoadmap,
    adds: 'The single most urgent thing on your twelve-month roadmap',
  },
  {
    id: 'financialAid',
    label: 'Tracked scholarships',
    earns: (s) => s.scholarships >= 1,
    adds: 'Every scholarship you are tracking, with its deadline',
  },
  {
    id: 'quickActions',
    label: 'Quick actions',
    // A six-tile grid of shortcuts into tabs the nav is already showing is the
    // definition of a second navigation. It earns its place once a student has
    // enough of a routine that a shortcut saves them something.
    earns: (s) => s.lessonsDone >= 1 || s.quizzes >= 1,
    adds: 'Shortcuts into the diagnostic, quizzes, flashcards and the coach',
  },
];

export const HOME_MODULE_IDS = HOME_MODULES.map((m) => m.id);
export const ALWAYS_ON = HOME_MODULES.filter((m) => m.always).map((m) => m.id);

/** The density settings a student can hold. `auto` is the default and the ladder above. */
export const DENSITIES = ['auto', 'full'];

/**
 * Which modules to render.
 *
 * @param {object} signals   the same shape the unlock ladder reads
 * @param {string} density   'auto' | 'full'
 * @param {string[]} earnedBefore  module ids already earned on a previous visit
 * @returns {{visible: Set<string>, earned: string[], deferred: object[], isFocused: boolean}}
 */
export function visibleModules(signals = {}, density = 'auto', earnedBefore = []) {
  const s = normalizeSignals(signals);

  if (density === 'full') {
    return { visible: new Set(HOME_MODULE_IDS), earned: HOME_MODULE_IDS, deferred: [], isFocused: false };
  }

  // ── The ratchet ────────────────────────────────────────────────────────────
  // A module is visible if it is earned NOW or was earned before. Without this,
  // deleting an activity would make the hours rings vanish and the page would
  // reflow around the deletion — which reads as punishment for tidying up, and
  // is the single most annoying way a progressive interface can behave.
  const before = new Set(Array.isArray(earnedBefore) ? earnedBefore : []);
  const earned = HOME_MODULES
    .filter((m) => m.always || before.has(m.id) || (typeof m.earns === 'function' && m.earns(s)))
    .map((m) => m.id);

  const visible = new Set(earned);
  const deferred = HOME_MODULES
    .filter((m) => !visible.has(m.id))
    .map((m) => ({ id: m.id, label: m.label, adds: m.adds }));

  return {
    visible,
    earned,
    deferred,
    // Whether the dashboard is currently holding anything back — what the
    // "show me everything" card keys off. A student with everything earned is
    // not offered a toggle for nothing.
    isFocused: deferred.length > 0,
  };
}

/**
 * Signals, defensively. Every one of these arrives from a different subsystem
 * and several are null while their fetch is in flight, so a missing value must
 * read as zero rather than as NaN — and a NaN comparison is false, which would
 * silently withhold a module a student had earned.
 */
function normalizeSignals(raw) {
  // `raw ?? {}` rather than a default parameter, because a default only covers
  // `undefined`. Several of these signals are explicitly null while their fetch
  // is in flight, and App.jsx passes the object straight through — so null is the
  // shape this actually receives on a first render, and a default parameter
  // would let it reach the property reads below and throw.
  const s = raw ?? {};
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    activities: n(s.activities),
    clinicalHours: n(s.clinicalHours),
    deadlines: n(s.deadlines),
    colleges: n(s.colleges),
    lessonsDone: n(s.lessonsDone),
    quizzes: n(s.quizzes),
    achievements: n(s.achievements),
    streak: n(s.streak),
    scholarships: n(s.scholarships),
    hasMedexScore: !!s.hasMedexScore,
    hasRoadmap: !!s.hasRoadmap,
  };
}

/**
 * The sentence the dashboard shows a new student in place of what it is holding
 * back — so the page is honest about being a reduced view rather than pretending
 * to be the whole product.
 *
 * Returns null once nothing is deferred, because a card saying "you can see
 * everything" when you already can is noise.
 */
export function focusNote(deferred = []) {
  if (!deferred?.length) return null;
  return {
    title: 'This page grows as you do',
    body: `${deferred.length} more module${deferred.length === 1 ? '' : 's'} will appear here as you have something for ${deferred.length === 1 ? 'it' : 'them'} to measure — hours once you log an activity, deadlines once there is one, progress once you have done a few lessons. Nothing is hidden: all of it is on its own tab right now.`,
    // Named individually, so "show me everything" is an informed choice rather
    // than a mystery switch.
    items: deferred.map((d) => d.adds).filter(Boolean),
  };
}
