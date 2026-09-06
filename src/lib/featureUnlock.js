// Progressive feature unlocking — which parts of the app a student can see yet.
//
// The problem this solves, in the words of the adult who tested it: "I couldn't
// grasp where to go." On first launch the app put seven top-level tabs and
// thirty-one sub-tabs in front of someone who had done nothing yet — a quiz
// library with no diagnostic behind it, a Review Log with nothing to review, a
// Recommenders form for a fourteen-year-old, an Admissions Calculator with no
// scores to calculate from. Every one of those is a good screen. Shown on day
// one they are all noise, and noise on day one is the whole drop-off problem:
// the student cannot tell which of the thirty-eight doors is the one they are
// supposed to walk through, so they walk out instead.
//
// So the nav is no longer a directory of everything that exists. It is a
// directory of everything that is *useful to this student right now*, and it
// grows as they do. A brand-new account sees four top-level destinations and
// two sub-tabs inside each pillar; by the time it shows the Admissions
// Calculator the student has a college list and a test score to put in it.
//
// ── The three rules that keep this honest ──────────────────────────────────
//
// 1. UNLOCKING IS STICKY AND ONE-WAY. Once a surface has been shown it is
//    recorded on the user (`unlockedFeatures`) and never hidden again. A tab
//    that vanishes because a student deleted an activity is a bug report, not
//    a feature — and re-locking would punish exactly the exploration we want.
//
// 2. NOTHING IS EVER UNREACHABLE. A locked surface still has a URL, and
//    navigating to it directly (a shared link, a bookmark, a ⌘K jump, an
//    old history entry) unlocks it on arrival rather than bouncing. A lock
//    here means "we haven't put this in front of you yet", never "you may not".
//    Settings additionally carries a one-switch escape hatch (`navMode`) for
//    the student who wants the whole map immediately.
//
// 3. LOCKS ARE VISIBLE, NOT SILENT. A surface the student hasn't reached shows
//    up as a dimmed row with the sentence that opens it ("Finish one lesson to
//    unlock your Portfolio"). Silently hiding features teaches nothing and
//    reads as a broken app; showing the next one with its condition attached
//    is what makes the product self-explaining, which is the actual goal —
//    the nav should teach the order to do things in without anyone narrating.
//
// This module is pure: signals in, visibility out. No React, no storage, no
// DOM — which is what lets `npm run verify:nav` prove every rule is reachable
// and that the ids here still match the nav arrays in App.jsx.

/** How a student refers to a destination internally: 'portfolio', 'prep/quizzes'. */
export const key = (tab, view) => (view ? `${tab}/${view}` : tab);

/**
 * A section *inside* a sub-view — the five parts of Activities & résumé, which
 * are destinations in every sense that matters (they have their own URLs, their
 * own forms, their own empty states) but are not sub-tabs. Written with a colon
 * so a section id still parses as a sub-view id up to the separator, which is
 * what lets every scope, label and route check treat it as living under
 * `portfolio/resume`. `sectionKey('portfolio','resume','clinical')` →
 * `'portfolio/resume:clinical'`.
 */
export const SECTION_SEP = ':';
export const sectionKey = (tab, view, section) => `${key(tab, view)}${SECTION_SEP}${section}`;

/**
 * The thing a locked destination hangs off, for scoping "what opens next":
 * 'plans' → '' (top level), 'prep/quizzes' → 'prep', 'portfolio/resume:clinical'
 * → 'portfolio/resume'. A SubNav asks for its own scope and therefore never
 * advertises a section belonging to one of its views, and the résumé's section
 * row asks for 'portfolio/resume' and gets exactly its own five.
 */
export function parentScope(id) {
  const colon = id.indexOf(SECTION_SEP);
  if (colon !== -1) return id.slice(0, colon);
  const slash = id.indexOf('/');
  return slash === -1 ? '' : id.slice(0, slash);
}

/** Escape hatch values for `user.navMode`. */
export const NAV_MODES = { GUIDED: 'guided', EVERYTHING: 'everything' };

/**
 * The signal bag every rule reads. Built by `buildUnlockSignals` in App.jsx
 * from state the app already computes; defaulted here so a rule can never
 * throw on a half-loaded account (Dexie resolves after first paint, and a nav
 * that flickers its items on load is worse than one that starts small).
 */
export const EMPTY_SIGNALS = {
  quizzes: 0,            // quizzes submitted
  lessons: 0,            // pathway lessons completed
  colleges: 0,
  essays: 0,
  activities: 0,         // portfolio activity rows (incl. clinical/research)
  trackedItems: 0,
  achievements: 0,
  level: 1,
  planBuilt: false,
  onboarded: false,      // finished the onboarding interview (not just signed up)
  // computePlanReadiness().ready — the generator's OWN bar (profile facts + a
  // diagnostic, a quiz and one Portfolio item). Read here so the nav can never
  // hand a student a tab whose first screen is a refusal; see the plans rule.
  planReady: false,
  // Seniors and juniors in application season don't get to wait for the
  // application half of the product — for them it IS the product.
  applicationUrgent: false,
};

/**
 * Anything a student has done that counts as "using the app". The unlock
 * ladder is built on this rather than on any single feature so a student who
 * only takes quizzes and a student who only does pathway lessons both progress
 * — the point is to gate on engagement, not to force one route through.
 */
export function studyActions(s) {
  return (s.quizzes || 0) + (s.lessons || 0);
}

/**
 * Every gated destination, in the order a student meets it.
 *
 * Ids not listed here are open from the first second — that list is
 * deliberately tiny (Home, Prep, Settings, and the first two sub-tabs of
 * each pillar) because it is the answer to "where do I go?" for someone who
 * has never seen the app.
 *
 * `hint` is shown to the student verbatim, so it is written as an instruction
 * ("Finish one lesson…"), not as a status ("Locked"). `at` returns true once
 * the surface should appear.
 */
export const UNLOCK_RULES = [
  // ── Top-level pillars ────────────────────────────────────────────────────
  {
    id: 'portfolio',
    label: 'Portfolio',
    hint: 'Finish one lesson or quiz to start building your application.',
    at: (s) => studyActions(s) >= 1 || s.applicationUrgent,
    progress: (s) => [Math.min(studyActions(s), 1), 1],
  },
  {
    id: 'plans',
    label: 'Plans',
    // ── The one the rest of the ladder is climbing toward ────────────────────
    // Plans is the single most expensive thing this product does: it reads the
    // whole student — onboarding answers, pathway, colleges, essays, deadlines,
    // logged hours — and writes back a day-by-day schedule that keeps extending
    // itself. Shipped as one tab among seven it read as one tab among seven,
    // and a student who wandered into it on day one met a lock screen listing
    // eight things they hadn't done: the app's best feature, introduced as a
    // refusal.
    //
    // So it is the app's milestone: finish onboarding, finish one pathway lesson,
    // and clear the generator's own readiness bar — all of which the app is
    // already pushing you toward from day one — and when it opens it opens as an event
    // (see UnlockCelebration.jsx) rather than as a seventh row appearing in the
    // sidebar. `marquee` is what every surface reads to give it that treatment;
    // `earned`/`reward` are the two sentences shown at the moment it lands.
    marquee: true,
    hint: 'Finish onboarding, your first pathway lesson, and a quiz — then Medabrain writes your full plan.',
    earned: 'You finished onboarding, your first lesson, and enough practice for Medabrain to plan around.',
    reward: 'Medabrain turns everything it knows about you — your pathway, your colleges, your deadlines, your hours — into a day-by-day plan, and keeps extending it as you go.',
    // `planReady` is the non-negotiable half. The generator has always had its own
    // bar (a diagnostic, a quiz, one Portfolio item — enough real signal that the
    // plan is grounded in what a student DID, not only what they answered), and it
    // states that bar as a checklist on its own screen. Unlocking the tab before
    // that bar is met would mean celebrating a milestone and then opening a
    // refusal, which is worse than not celebrating at all: the gate opens exactly
    // when the thing behind it works.
    at: (s) => s.planBuilt || (s.onboarded && s.lessons >= 1 && s.planReady),
    progress: (s) => [(s.onboarded ? 1 : 0) + Math.min(s.lessons || 0, 1) + (s.planReady ? 1 : 0), 3],
  },
  {
    id: 'roadmap',
    label: 'Roadmap',
    // ── Gated much more lightly than Plans, on purpose ──────────────────────
    // Plans is gated hard (onboarding + a lesson + the generator's own readiness bar) because a
    // day-by-day plan is only meaningful once there is measured behavior to plan around. The
    // Roadmap is the opposite kind of artifact: it is built from a student's CIRCUMSTANCES —
    // their grade, their target schools, their money, their transport — every one of which is
    // true on day one and none of which improves by waiting.
    //
    // And the cost of waiting is not symmetric. A freshman who does not see this until March has
    // already missed the hospital volunteer intake, the science-fair registration and the summer
    // program deadlines for that year — a whole year of opportunities gone, silently, because a
    // gate was protecting them from a feature that was ready for them the entire time. There is
    // no equivalent harm in the other direction: the worst case for showing it early is a
    // student who looks at their year and closes the tab.
    //
    // So it opens as soon as onboarding is done and there is one piece of evidence they are
    // actually using the app. `applicationUrgent` bypasses even that: a senior in October does
    // not have time for a ladder.
    hint: 'Finish setting up and complete one lesson or quiz — then Medabrain maps your whole year.',
    at: (s) => s.applicationUrgent || (s.onboarded && studyActions(s) >= 1),
    progress: (s) => [(s.onboarded ? 1 : 0) + Math.min(studyActions(s), 1), 2],
  },
  {
    id: 'progress',
    label: 'Progress',
    // Deliberately last of the pillars. A progress dashboard opened on day one
    // shows five zeroes and a flat chart, which is the single most discouraging
    // thing this app could say to someone on their first visit.
    hint: 'Complete 5 study sessions — then there\'s a real chart to look at.',
    at: (s) => studyActions(s) >= 5 || s.level >= 2,
    progress: (s) => [Math.min(studyActions(s), 5), 5],
  },

  // ── Prep ─────────────────────────────────────────────────────────────────
  // Diagnostic and Pathway stay open — together they are "find out what to
  // study" and "study it", which is the entire day-one job of this pillar.
  {
    id: 'prep/quizzes',
    label: 'Quiz library',
    hint: 'Take the pathway diagnostic or finish a lesson to open the quiz library.',
    at: (s) => s.lessons >= 1 || s.quizzes >= 1,
  },
  {
    id: 'prep/coach',
    label: 'AI coach',
    hint: 'Finish one lesson or quiz — then the coach has something to coach on.',
    at: (s) => studyActions(s) >= 1,
  },
  {
    id: 'prep/flashcards',
    label: 'Flashcards',
    hint: 'Take one quiz — we build your first deck from what you missed.',
    at: (s) => s.quizzes >= 1,
  },
  {
    id: 'prep/library',
    label: 'E-Library',
    hint: 'Complete 3 study sessions to unlock the reading library.',
    at: (s) => studyActions(s) >= 3,
    progress: (s) => [Math.min(studyActions(s), 3), 3],
  },

  // ── Portfolio ────────────────────────────────────────────────────────────
  // Overview and Milestones stay open, and so does the College List section of
  // Applying: "where am I applying and when is it due" is the question a
  // student actually arrives with.
  //
  // Note the shape of these ids. Eleven Portfolio tabs became five, so most of
  // what used to be a sub-tab gate is now a SECTION gate — 'portfolio/applying:essays'
  // rather than 'portfolio/essays'. The ladder is unchanged in substance: the
  // same surfaces open on the same conditions, in the same order. What changed
  // is that a locked one now renders as a dimmed section header inside a page
  // the student is already on, rather than as a missing pill on a nav row.
  {
    id: 'portfolio/applying:essays',
    label: 'Essays',
    hint: 'Add a college to your list — essay prompts come from your schools.',
    at: (s) => s.colleges >= 1,
  },
  {
    id: 'portfolio/resume',
    label: 'Activities',
    hint: 'Add a college to your list, then log what you\'ve actually done.',
    at: (s) => s.colleges >= 1 || s.activities >= 1,
  },
  {
    id: 'portfolio/opportunities',
    label: 'Opportunities',
    hint: 'Log one activity — matches are ranked against what you\'ve already done.',
    at: (s) => s.activities >= 1,
  },
  {
    // ── Why the Common App mirror is gated at all ────────────────────────────
    // It is the most useful screen in the Portfolio for a student who has
    // something in their Portfolio, and one of the least useful for a student
    // who does not. Shown on day one it is sixteen empty sections and a set of
    // limits on writing that has not been written — which is a wall of
    // obligations presented to someone who has not yet done anything, and the
    // exact shape of overwhelm this ladder exists to prevent.
    //
    // One activity or one college is the right threshold rather than something
    // higher: the moment there is a single real thing in the Portfolio, seeing
    // where it lands on the real form is genuinely motivating, and that is much
    // earlier than a student would find the screen on their own.
    id: 'portfolio/commonapp',
    label: 'Common App',
    hint: 'Log one activity or add a college — then this shows exactly where it lands on the real form.',
    at: (s) => s.activities >= 1 || s.colleges >= 1,
  },
  {
    id: 'portfolio/opportunities:tracked',
    label: 'What you\u2019re tracking',
    hint: 'Track a program or scholarship and it shows up here with its deadline.',
    at: (s) => s.trackedItems >= 1 || s.activities >= 1,
  },
  {
    id: 'portfolio/applying:calc',
    label: 'Chances',
    hint: 'Add a college to your list — the calculator compares you against real schools.',
    at: (s) => s.colleges >= 1,
  },
  {
    id: 'portfolio/applying:aid',
    label: 'Financial aid',
    hint: 'Add 2 colleges — aid is a comparison between schools, not a single number.',
    at: (s) => s.colleges >= 2,
    progress: (s) => [Math.min(s.colleges, 2), 2],
  },
  {
    id: 'portfolio/applying:recommenders',
    label: 'Recommenders',
    // Named in the review as a day-one tab that made no sense: you cannot ask
    // for a letter about work you have not logged yet.
    hint: 'Log 2 activities first — a recommender writes about what you\'ve done.',
    at: (s) => s.activities >= 2 || s.applicationUrgent,
    progress: (s) => [Math.min(s.activities, 2), 2],
  },
  {
    id: 'portfolio/applying:interview',
    label: 'Interviews',
    hint: 'Log 2 activities — interview answers are built from your own experiences.',
    at: (s) => s.activities >= 2 || s.applicationUrgent,
    progress: (s) => [Math.min(s.activities, 2), 2],
  },

  // ── Inside Activities & résumé ───────────────────────────────────────────
  // The four Portfolio tabs that were merged into one tab's five sections
  // (Activities, Academics, Clinical Hours, Research, Skills & Certs) stopped
  // being four doors on the nav and became five tiles on one screen — which
  // fixed the navigation problem and left the day-one problem exactly where it
  // was. A fourteen-year-old on their first visit still opened Activities &
  // Résumé and met a grid asking them to log shadowing hours, publications and
  // dated certifications. Those are not first steps; those are what the first
  // steps eventually produce.
  //
  // So the sections ladder too, in the order a real record gets built: log what
  // you do → say where you're aiming → the clinical hours that come out of a
  // lesson about clinical work → research → the credentials that certify it.
  // 'activities' is never gated: it is the door, and it is where every other
  // section's unlock condition points.
  {
    id: 'portfolio/resume:academics',
    label: 'Grades',
    hint: 'Add one college — your GPA is read against the schools you\'re aiming at.',
    at: (s) => s.colleges >= 1 || s.applicationUrgent,
  },
  {
    id: 'portfolio/resume:clinical',
    label: 'Shadowing & hours',
    // The example the review gave, and the clearest case in the app: the
    // pathway's first lesson is what tells a student what shadowing IS and why
    // hours are counted. Handing them the log first is handing them a form for
    // a thing nobody has explained.
    hint: 'Finish one pathway lesson — it explains what these hours are before you log them.',
    at: (s) => s.lessons >= 1 || s.activities >= 1 || s.applicationUrgent,
  },
  {
    id: 'portfolio/resume:research',
    label: 'Research',
    hint: 'Log 2 activities — research goes on top of a record, not instead of one.',
    at: (s) => s.activities >= 2 || s.applicationUrgent,
    progress: (s) => [Math.min(s.activities, 2), 2],
  },
  {
    id: 'portfolio/resume:credentials',
    label: 'Skills & certs',
    hint: 'Log 3 activities — certifications are the last layer of a résumé, not the first.',
    at: (s) => s.activities >= 3 || s.applicationUrgent,
    progress: (s) => [Math.min(s.activities, 3), 3],
  },

  // ── Progress ─────────────────────────────────────────────────────────────
  {
    id: 'progress/performance',
    label: 'Performance',
    hint: 'Take 3 quizzes — a performance breakdown needs more than one data point.',
    at: (s) => s.quizzes >= 3,
    progress: (s) => [Math.min(s.quizzes, 3), 3],
  },
  {
    id: 'progress/verified',
    label: 'Verified progress',
    hint: 'Verify one lesson to start your verified mastery record.',
    at: (s) => s.lessons >= 1,
  },
  {
    id: 'progress/achievements',
    label: 'Achievements',
    hint: 'Earn 3 badges — then there\'s a case worth opening.',
    at: (s) => s.achievements >= 3,
    progress: (s) => [Math.min(s.achievements, 3), 3],
  },
];

const RULE_BY_ID = new Map(UNLOCK_RULES.map((r) => [r.id, r]));

/** Every destination this module gates, in ladder order. */
export const GATED_IDS = UNLOCK_RULES.map((r) => r.id);

/**
 * The gates that get an unlock *moment* rather than a toast. Kept to one on
 * purpose — a milestone that fires four times is a notification, not a
 * milestone — and exported so App.jsx can decide which celebration to run
 * without re-stating which feature is the important one.
 */
export const MARQUEE_IDS = UNLOCK_RULES.filter((r) => r.marquee).map((r) => r.id);

/**
 * The student-facing copy attached to one gate, for surfaces that need it after
 * the gate has already opened — `locked()` by definition can no longer supply
 * it, and the unlock celebration fires at exactly the moment a rule stops being
 * locked. Returns null for an id the ladder doesn't gate.
 */
export function ruleCopy(id) {
  const r = RULE_BY_ID.get(id);
  if (!r) return null;
  return { id: r.id, label: r.label, hint: r.hint, earned: r.earned || null, reward: r.reward || null, marquee: !!r.marquee };
}

/**
 * The visibility snapshot for one student.
 *
 * @param {object} user   the saved user record (reads `navMode`, `unlockedFeatures`)
 * @param {object} rawSignals see EMPTY_SIGNALS
 * @returns {{
 *   isOpen: (tab:string, view?:string|null) => boolean,
 *   earned: string[],          // ids the signals currently satisfy
 *   sticky: string[],          // ids already recorded on the user
 *   pending: string[],         // earned but not yet recorded — App.jsx persists these
 *   locked: (scope?:string|null) => Array<{id,label,hint,progress:[number,number]|null}>,
 *   everything: boolean,
 * }}
 */
export function unlockState(user, rawSignals) {
  const s = { ...EMPTY_SIGNALS, ...(rawSignals || {}) };
  const everything = user?.navMode === NAV_MODES.EVERYTHING;
  const sticky = Array.isArray(user?.unlockedFeatures) ? user.unlockedFeatures : [];
  const stickySet = new Set(sticky);

  const earned = [];
  const open = new Set(stickySet);
  for (const rule of UNLOCK_RULES) {
    let on = false;
    try { on = !!rule.at(s); } catch { on = false; }
    if (on) { earned.push(rule.id); open.add(rule.id); }
  }

  return {
    everything,
    earned,
    sticky,
    pending: earned.filter((id) => !stickySet.has(id)),
    /**
     * `section` addresses a part of a sub-view: isOpen('portfolio','resume',
     * 'clinical'). Two args behave exactly as they always have.
     */
    isOpen(tab, view = null, section = null) {
      const id = section ? sectionKey(tab, view, section) : key(tab, view);
      // Not a gated id at all → open since the first second.
      if (!RULE_BY_ID.has(id)) return true;
      if (everything) return true;
      // A locked sub-view of a locked tab is locked; a sub-view whose parent
      // tab is open is judged on its own rule.
      return open.has(id);
    },
    /**
     * What is still to come, nearest first. `scope` narrows to one pillar's
     * sub-views ('prep'), to one sub-view's sections ('portfolio/resume'), or to
     * the top level (''), which is how the sidebar shows "Portfolio unlocks
     * next" while the Prep sub-nav and the résumé's section row each show their
     * own. Unscoped, the marquee milestone sorts to the front: on Home it is
     * the thing worth telling a new student about, not the fourth row down.
     */
    locked(scope = null) {
      if (everything) return [];
      const items = UNLOCK_RULES
        .filter((r) => !open.has(r.id))
        .filter((r) => scope === null || parentScope(r.id) === scope)
        .map((r) => ({
          id: r.id,
          label: r.label,
          hint: r.hint,
          marquee: !!r.marquee,
          earned: r.earned || null,
          reward: r.reward || null,
          progress: r.progress ? r.progress(s) : null,
        }));
      return scope === null
        ? [...items].sort((a, b) => Number(b.marquee) - Number(a.marquee))
        : items;
    },
  };
}

/** Filters a NAV / *_SUBNAV array down to what this student can see. */
export function visibleItems(items, state, tab = null) {
  return items.filter((it) => state.isOpen(tab || it.id, tab ? it.id : null));
}

/**
 * The user patch that records newly-earned unlocks, or null when there is
 * nothing new. Kept here (rather than inline in App.jsx) so the sticky list is
 * only ever written in one shape, and so it can be unit-tested.
 */
export function recordUnlocks(user, ids) {
  if (!user || !ids?.length) return null;
  const have = new Set(Array.isArray(user.unlockedFeatures) ? user.unlockedFeatures : []);
  const added = ids.filter((id) => !have.has(id));
  if (!added.length) return null;
  return { ...user, unlockedFeatures: [...have, ...added] };
}

/**
 * Existing accounts must never wake up to a smaller app than they went to
 * sleep with. Anyone who was already using the product before progressive
 * unlocking shipped — they have XP, or a plan, or any saved work — gets every
 * gate opened once, permanently, on their next load. New accounts (no XP, no
 * activity, no prior unlock record) start at the bottom of the ladder as
 * intended. `navMode` doubles as the "this account has been through here"
 * marker so the seeding runs exactly once.
 */
export function seedExistingAccount(user, signals) {
  if (!user || user.navMode) return null;
  const established = (user.xp || 0) > 0
    || !!user.masterPlan
    || !!user.tourCompletedAt
    || studyActions({ ...EMPTY_SIGNALS, ...(signals || {}) }) > 0;
  return {
    ...user,
    navMode: NAV_MODES.GUIDED,
    unlockedFeatures: established
      ? [...new Set([...(user.unlockedFeatures || []), ...GATED_IDS])]
      : (user.unlockedFeatures || []),
  };
}
