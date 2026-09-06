// ─────────────────────────────────────────────────────────────────────────────
// Section 4 — execution without burnout.
//
// ── PREMIUM ROADMAP ─────────────────────────────────────────────────────────
// Part of the Narrative Method Engine, planned as a paid tier. See PREMIUM in
// src/lib/ivy/constants.js.
// ────────────────────────────────────────────────────────────────────────────
//
// The rest of this engine tells a student what to do. This file is the only
// part that addresses whether they can actually do it, which is the constraint
// that decides most outcomes and is the one every roadmap product leaves out.
//
// Two methods, deliberately small:
//
//   • The Ivy Productive method — six ranked tasks, chosen the night before,
//     worked strictly in order, with unfinished work rolling to the top of
//     tomorrow. Six is the point: a list that cannot be finished is a list that
//     teaches you that lists cannot be finished.
//   • The Four Burner model — academics, extracurriculars, health, and people.
//     You cannot run four burners on high. The method is choosing which two are
//     high THIS WEEK, on purpose, instead of discovering in March which two
//     went out.
//
// ── The line this file will not cross ──────────────────────────────────────
// Nothing here optimises sleep away, treats health as a burner you may switch
// off, or frames rest as a productivity input. The Four Burner model is used
// here to make the trade-off VISIBLE and time-boxed, never to license running
// health cold for a season. See `HEALTH_FLOOR`.
// ─────────────────────────────────────────────────────────────────────────────

/** The Ivy Productive method. */
export const IVY_PRODUCTIVE = {
  id: 'ivy-productive',
  title: 'Six tasks, ranked, the night before',
  listSize: 6,
  rules: [
    { id: 'plan-night-before', label: 'Write tomorrow\'s six tonight', detail: 'The decision of what matters is made when you are not under the pressure of doing it. Morning-you is a bad prioritiser and an excellent executor.' },
    { id: 'rank-strictly', label: 'Rank them 1 to 6, no ties', detail: 'A tie is a decision you have deferred to the moment you are least able to make it.' },
    { id: 'single-task', label: 'Finish #1 before opening #2', detail: 'Not "work on". Finish. The rank is worthless if the list is worked in parallel, because parallel work finishes nothing by 10pm.' },
    { id: 'roll-over', label: 'Anything unfinished rolls to tomorrow\'s #1', detail: 'Automatic, not a judgment. A task that rolls three times is not a task, it is a project that has not been broken down — and the roll count is what tells you that.' },
  ],
  rollWarningAt: 3,
  rollWarning: 'This has rolled over three days. It is not a task any more. Split it into the first 20 minutes of it, and put that at #1 tomorrow.',
};

/** The four burners. `floor` marks the one that may never be scheduled cold. */
export const BURNERS = [
  { id: 'academics', label: 'Academics', detail: 'Coursework, grades, testing, the transcript.' },
  { id: 'extracurriculars', label: 'Extracurriculars', detail: 'The project, the leadership role, the competition, the application itself.' },
  { id: 'health', label: 'Health', detail: 'Sleep, food, movement, treatment, and the appointments you keep putting off.', floor: true },
  { id: 'social', label: 'Social & family', detail: 'Friends, family obligations, the people who will still be there in June.' },
];

/**
 * The rule that keeps the model honest.
 *
 * Two burners high per week, at most. Health may drop to medium during a peak
 * week and never to low — a plan that schedules a student's sleep to zero for
 * six weeks is not a plan, it is a prediction of a collapse in week four.
 */
export const HEALTH_FLOOR = {
  minLevel: 'medium',
  maxHighBurners: 2,
  note: 'Health is a burner you may turn down for a week, not off for a season. If a plan needs health on low to work, the plan is too big — cut the plan, not the sleep.',
};

/** The friction-reduction rules. */
export const FRICTION_RULES = [
  {
    id: 'ten-minute', label: 'The 10-minute rule',
    detail: 'When you are stuck on the highest-priority task, commit to ten minutes of it and give yourself explicit permission to stop at ten. Most of the time you keep going, because starting was the whole cost. When you do stop, ten minutes of progress happened anyway — which is the point of the rule, not a consolation for it.',
  },
  {
    id: 'batching', label: 'Batch like with like',
    detail: 'All emails in one 30-minute block. All portal admin in another. Context-switching between an essay and a form costs more than either task, and it is invisible, so it never gets budgeted for.',
  },
  {
    id: 'visual-progress', label: 'Make progress visible',
    detail: 'A grid of application components you color in. Crude, and it works, because an application is 200 small things and none of them feel like progress on their own.',
  },
  {
    id: 'environment', label: 'Design the room, not the willpower',
    detail: 'Phone in another room — not face down, another room. Practice test printed the night before. One surface that is only for this. Every one of these is a decision you make once instead of forty times.',
  },
];

/** The deep-focus / active-recall study cycle the retention model is built on. */
export const STUDY_CYCLE = {
  focusMinutes: 20,
  recallMinutes: 5,
  recallSimilarityThreshold: 0.60,
  rules: [
    'Twenty minutes of uninterrupted study. Leaving the app resets the timer — not as a punishment, but because a 20-minute block with three exits in it is not a 20-minute block and counting it as one corrupts every retention estimate downstream.',
    'Then five minutes writing what you remember, with the material closed. This is the part that does the work; the reading was the setup.',
    'Your recall is compared against the source material. Above 0.60 similarity counts as a successful retrieval and flattens the forgetting curve for that item. Below it, the item comes back sooner — that is the system working, not you failing.',
  ],
};
