// ─────────────────────────────────────────────────────────────────────────────
// Roadmap readiness — what the app has to know before building a year is worth
// doing at all.
//
// ── The argument for a gate, given that the tab is already gated ─────────────
// featureUnlock.js decides whether the Roadmap TAB is visible. This decides
// whether the BUILD BUTTON should fire, and the two answer different questions
// on purpose. The unlock rule is about attention — "is this student ready to be
// shown a seventh destination". This is about information — "does the generator
// have enough to produce something better than a catalog dump".
//
// That second question has a hard, unsentimental answer, and it is the reason
// this file exists. The roadmap is the most expensive generation in the product:
// five Oracle passes, a hand-verified catalog shortlist, and about ninety
// seconds of a student's trust. Spend all of that on a record that does not say
// what grade they are in and the year that comes back is a generic list of
// national deadlines — which is precisely the artifact the whole feature was
// built to not be. Worse, it is a one-shot impression: a student who builds a
// roadmap on day one, sees something that could have been written for anybody,
// and closes the tab does not come back in March when their Portfolio would
// finally have made it good.
//
// ── The rule every gate here has to pass ────────────────────────────────────
// A gate earns its place ONLY if the roadmap is materially different with the
// answer than without it. Not "nice to have", not "more engagement" —
// materially different, in a way you could point at in the output. Each gate
// below carries a `gains` sentence stating exactly what changes, and that
// sentence is shown to the student verbatim. If a gate cannot fill in that
// sentence honestly, it does not belong here: a checklist standing between
// someone and the thing they came for has to justify every line of itself.
//
// Applying that rule is also what keeps this SHORT. Onboarding already asks
// about thirty questions and the intake asks fifteen more; a third checklist
// of ten items would be the third time this app has told a fifteen-year-old to
// come back later. Five gates, four of which a normally-active account has
// already satisfied without ever seeing this screen.
//
// ── Why nothing here is ever permanently blocking ───────────────────────────
// Every gate is satisfiable in minutes, from inside the app, from a link on the
// gate screen itself. There is no gate on time elapsed, on streak, on level, or
// on anything else a student cannot act on this afternoon — a lock that cannot
// be opened today is indistinguishable from a feature that does not exist, and
// the Roadmap's own unlock rule in featureUnlock.js spells out at length why
// making a freshman wait costs them a year of opportunities they cannot get
// back.
//
// Pure: signals in, verdict out. No React, no storage, no fetches — which is
// what lets scripts/verifyRoadmap.mjs prove the whole ladder is reachable.
// ─────────────────────────────────────────────────────────────────────────────

/** Non-empty, for the string/array/number fields these gates read. */
const filled = (v) => {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'number') return Number.isFinite(v) && v > 0;
  return true;
};

const count = (v) => (Array.isArray(v) ? v.length : 0);

/**
 * The gates, in the order a student meets them.
 *
 * `kind` splits them for the UI: 'profile' gates are answered by a field on the
 * user record and are usually already satisfied from onboarding; 'portfolio'
 * gates need something tracked; 'activity' gates need something done. The three
 * groups get different framing on the gate screen because "confirm your grade"
 * and "log one activity" are different sizes of ask and presenting them as one
 * undifferentiated list makes the whole thing look longer than it is.
 *
 * `ok(user, ctx)` returns true when satisfied. `ctx` is
 * { portfolio, quizzesTaken, lessons } — any of which may be null, meaning
 * "not loaded yet" rather than "zero". See `state` in computeRoadmapReadiness.
 */
export const ROADMAP_GATES = [
  {
    id: 'grade',
    kind: 'profile',
    label: 'Your grade in school',
    // Every gate's `gains` is shown to the student. It answers "why are you
    // making me do this" with the actual reason rather than with encouragement.
    gains: 'Grade decides the entire year. A freshman and a senior share almost no deadlines — get this wrong and every date on the roadmap is for somebody else.',
    goTab: 'settings',
    goView: 'profile',
    action: 'Set your grade',
    ok: (user) => filled(user?.gradeStage) || filled(user?.gradYear) || filled(user?.grade),
  },
  {
    id: 'pathway',
    kind: 'profile',
    label: 'The health pathway you are exploring',
    gains: 'Nursing, pre-med and public health lead to different programs, different competitions and different summers. Without it the roadmap has to hedge, and a hedged year is a generic one.',
    goTab: 'prep',
    goView: 'pathways',
    action: 'Pick a pathway',
    ok: (user) => filled(user?.pathway) || filled(user?.specialty) || filled(user?.activePathways),
  },
  {
    id: 'colleges',
    kind: 'portfolio',
    label: 'At least one college on your list',
    gains: 'The roadmap back-plans from real application deadlines. With no college on the list there is nothing to back-plan from, and the year loses the half of itself that matters most in your senior autumn.',
    goTab: 'portfolio',
    goView: 'colleges',
    action: 'Add a college',
    ok: (_user, ctx) => count(ctx?.portfolio?.colleges) >= 1,
    loading: (ctx) => ctx?.portfolio == null,
  },
  {
    id: 'evidence',
    kind: 'portfolio',
    label: 'One thing you have actually done',
    // Deliberately generous about what counts. The point is that the roadmap can
    // see SOMETHING real, not that a student has the "right" kind of record —
    // and a gate that only accepted clinical hours would lock out exactly the
    // students with no hospital within driving distance.
    gains: 'An activity, an hour, an award, a research placement — anything real. The roadmap builds on what you already have rather than starting you from zero, and it is the difference between "join a club" and "your debate experience makes this scholarship winnable".',
    goTab: 'portfolio',
    goView: 'resume',
    action: 'Log one thing',
    ok: (_user, ctx) => {
      const p = ctx?.portfolio;
      if (!p) return false;
      return count(p.activities) + count(p.clinicalHours) + count(p.awards)
        + count(p.research) + count(p.skills) >= 1;
    },
    loading: (ctx) => ctx?.portfolio == null,
  },
  {
    id: 'study',
    kind: 'activity',
    label: 'One lesson or quiz finished',
    gains: 'One piece of measured work tells the roadmap how hard to push and where you are strong. It is also the same bar that opened this tab, so you have almost certainly already cleared it.',
    goTab: 'prep',
    goView: 'pathways',
    action: 'Do one lesson',
    ok: (_user, ctx) => (ctx?.quizzesTaken || 0) + (ctx?.lessons || 0) >= 1,
    loading: (ctx) => ctx?.quizzesTaken == null && ctx?.lessons == null,
  },
];

export const ROADMAP_GATE_IDS = ROADMAP_GATES.map((g) => g.id);

/**
 * Can this student's roadmap be built yet, and what is still missing?
 *
 * Returns the FULL checklist rather than only the gaps, so the gate screen can
 * show satisfied items already ticked. A student who finished onboarding
 * properly arrives to four green ticks and one thing to do, which reads as
 * "you are nearly there"; the same screen showing only the one missing item
 * reads as "here is another hoop", and those are very different screens.
 *
 * The third state matters. A portfolio gate whose data has not loaded is
 * 'loading', never 'pending' — flashing a lock screen at a student whose
 * colleges are one Dexie round-trip away, and then unlocking half a second
 * later, is worse than a moment of nothing. `ready` is likewise conservative in
 * the OTHER direction: a loading gate does not block, because the common case
 * is that it is satisfied and the rare cost of letting a build through early is
 * one slightly thinner roadmap, against the certain cost of a lock screen shown
 * to somebody who has done everything.
 *
 * @param {object|null} user the local user record
 * @param {object} ctx { portfolio, quizzesTaken, lessons } — nulls mean "not loaded"
 */
export function computeRoadmapReadiness(user, ctx = {}) {
  const checklist = ROADMAP_GATES.map((g) => {
    const isLoading = typeof g.loading === 'function' ? !!g.loading(ctx) : false;
    let done = false;
    try { done = !!g.ok(user, ctx); } catch { done = false; }
    return {
      id: g.id,
      kind: g.kind,
      label: g.label,
      gains: g.gains,
      action: g.action,
      goTab: g.goTab,
      goView: g.goView,
      // A satisfied gate is 'done' even while its data is still arriving — the
      // data arriving is what satisfied it.
      state: done ? 'done' : (isLoading ? 'loading' : 'pending'),
    };
  });

  const missing = checklist.filter((c) => c.state === 'pending');
  const done = checklist.filter((c) => c.state === 'done').length;
  return {
    ready: missing.length === 0,
    checklist,
    missing,
    done,
    total: checklist.length,
    pct: checklist.length ? Math.round((done / checklist.length) * 100) : 100,
  };
}

/**
 * The build-context object, assembled from what a caller already has.
 *
 * Exists so the Roadmap tab and the unlock ladder cannot drift into reading
 * different fields for the same gate — the same reason fetchPortfolio is
 * exported from one place rather than copied.
 */
export function readinessContext({ portfolio = null, liveSignals = null } = {}) {
  return {
    portfolio,
    quizzesTaken: liveSignals?.quizzesTaken ?? null,
    // Pathway mastery is a percentage of lessons completed, so any non-zero
    // value means at least one lesson is genuinely finished.
    lessons: liveSignals?.pathwayMastery > 0 ? 1 : (liveSignals?.pathwayMastery === 0 ? 0 : null),
  };
}
