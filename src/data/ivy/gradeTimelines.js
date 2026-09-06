// ─────────────────────────────────────────────────────────────────────────────
// The grade-by-grade strategic timelines (specification Sections 3.1 – 3.4)
// and the 90-day senior sprint (Section 1.8).
//
// ── PREMIUM ROADMAP ─────────────────────────────────────────────────────────
// Part of the Narrative Method Engine, planned as a paid tier. See PREMIUM in
// src/lib/ivy/constants.js.
// ────────────────────────────────────────────────────────────────────────────
//
// Every item here is a THING TO DO with a window on it, not advice. The
// distinction is enforced by the shape of the data: an item that cannot be
// completed, checked off, or dated does not belong in this file, it belongs in
// the guidance strings on the modules that compute something.
//
// ── Two rules this file follows that most timeline content does not ────────
//
//   • NOTHING HERE COSTS MONEY BY DEFAULT. Where a paid option exists, the free
//     path is the primary one and the paid one is the footnote — see
//     `costNote`. A roadmap that assumes a $9,000 summer program is a roadmap
//     for a student who did not need it.
//   • A LATE STUDENT IS NEVER TOLD THEY ARE TOO LATE. Items carry `stillWorth`,
//     which is what the item is worth to somebody arriving at it a year after
//     the window opened. Senior year in particular is written so that a student
//     who finds this in October gets an October plan, not an apology.
//
// The senior monthly pipeline (Section 3.4) is dated against the real
// application calendar: Early deadlines cluster on 1 and 15 November, Regular
// on 1–15 January, FAFSA opens 1 October.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} TimelineItem
 * @property {string}  id
 * @property {string}  label      the action, in the imperative
 * @property {string}  detail     what it means concretely, and why it is here
 * @property {string}  [metric]   how the student knows it is done
 * @property {string}  [costNote] the free path, where the obvious path costs money
 * @property {string}  [stillWorth] what it is worth if they are arriving late
 * @property {string}  [module]   which math module this feeds, if any
 * @property {'high'|'medium'|'low'} weight
 */

// ─────────────────────────────────────────────────────────────────────────────
// 3.1 Freshman year — strategic option maximisation.
//
// The organizing idea: ninth grade is not about achievement, it is about not
// closing doors. A student who does not reach Algebra II by tenth grade cannot
// reach calculus by twelfth without an intervention, and nobody tells them
// until it is a problem. That is what reverse-mapping is for.
// ─────────────────────────────────────────────────────────────────────────────
export const FRESHMAN = {
  grade: 9, title: 'Keep every door open',
  premise: 'Ninth grade decides which twelfth grades are still possible. Almost nothing you do this year is impressive; several things you skip this year are irreversible.',
  items: [
    {
      id: 'math-reverse-map', weight: 'high', module: 'roadmap',
      label: 'Reverse-map your math track to calculus',
      detail: 'Work backwards from the senior-year course you want (AP Calculus AB/BC, or beyond) through every prerequisite, and check your current placement against it. Reaching BC normally means Algebra I by 8th or 9th, Geometry, Algebra II, then Precalculus.',
      metric: 'You can name the exact course you will sit in each of the next four years, and none of them is missing a prerequisite.',
      stillWorth: 'If you are already behind, this is the year the fix is cheap: a summer course, a placement exam, or doubling up once. In eleventh grade the same gap costs a year.',
    },
    {
      id: 'rigor-in-strength', weight: 'high',
      label: 'Take the hardest courses available in your strongest subjects — and only there',
      detail: 'Rigor is read subject by subject, not as a total. Four APs with three Bs reads worse than two APs with As plus a genuinely hard elective in the field you claim.',
      metric: 'Your schedule shows the most demanding option offered in the one or two subjects your application will be about.',
    },
    {
      id: 'three-commitments', weight: 'high', module: 'portfolio',
      label: 'Commit to exactly three activities — one academic, one creative or physical, one service',
      detail: 'The three-commitment rule exists to stop the freshman résumé sprawl that produces eleven Tier 3 lines and no depth. One academic or skill-based (debate, robotics, Model UN, DECA, research club); one creative or physical (a sport, an instrument, theater); one service you will still be doing in three years.',
      metric: 'Three named commitments, each with a weekly hour count you actually keep.',
      stillWorth: 'Arriving late, the rule becomes subtractive: pick the three you would keep and let the rest lapse honestly rather than carrying nine half-attendances.',
    },
    {
      id: 'daily-reading', weight: 'medium', module: 'retention',
      label: 'Read 20 minutes a day, self-selected',
      detail: 'Not assigned reading. The single cheapest intervention on standardized-test reading speed and on essay voice, and the only one on this list that compounds for four years.',
      metric: '20 minutes, most days, of something you chose.',
    },
    {
      id: 'six-week-challenge', weight: 'medium', module: 'domino',
      label: 'Run one 6-week micro-project',
      detail: 'A rehearsal for the passion project, at a scale where failing costs six weeks. Three requirements: a single-sentence problem statement in the form "The problem is [X], and the people affected are [Y]"; one angle only you have; and one adult who agrees to supervise — a teacher or a librarian, not a parent.',
      metric: 'A written problem statement, a named mentor, and something that exists at the end of six weeks.',
      costNote: 'Free by construction. If it needs a budget, it is the wrong first project.',
    },
    {
      id: 'journal', weight: 'medium', module: 'authenticity',
      label: 'Keep a reflective journal',
      detail: 'Three years from now the personal statement will need a specific Tuesday, and nobody remembers specific Tuesdays. This is the only item on this page whose entire purpose is to still exist in 2029.',
      metric: 'Something written most weeks. Length does not matter; specificity does.',
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// 3.2 Sophomore year — structural foundation and the passion project.
// ─────────────────────────────────────────────────────────────────────────────
export const SOPHOMORE = {
  grade: 10, title: 'Pick the spine',
  premise: 'Tenth grade is when a profile stops being a list and starts being about something. The work is subtractive as much as additive.',
  items: [
    {
      id: 'profile-audit', weight: 'high', module: 'holistic',
      label: 'Audit the profile for its actual gaps',
      detail: 'Run the four-category rubric and find which of academics, extracurriculars, personal qualities and recommendations is thinnest. The answer is usually "no visible impact outside the building" or "no specialized focus", and both have a two-year fix from here.',
      metric: 'You can name your weakest category and the one thing that would move it.',
    },
    {
      id: 'project-launch', weight: 'high', module: 'domino',
      label: 'Launch the specialized project, using the Domino framework',
      detail: 'Not a club — a thing with an artifact. A publication, a workshop series, a prototype, an archive. Domino sequence: frustration → question → obsession, then a minimum viable action shipped to a real audience, then credibility bridges, then the academic connection, then the durable asset.',
      metric: 'Milestone M₁ (a thesis that is not a cliché) and M₂ (fifty real people) inside the school year.',
      costNote: 'Hosting is under $20 a year and libraries are free. Every Domino milestone is reachable without money; none of them is reachable without a mentor email.',
    },
    {
      id: 'summer-gap-analysis', weight: 'high',
      label: 'Decide what your summer must prove: validation, or initiative',
      detail: 'Step one of the three-step summer strategy. If your record lacks external academic validation, a selective program answers that. If it lacks evidence you can start something, a program does not — a self-directed project does. Almost nobody needs both, and almost everybody applies as if they need the expensive one.',
      metric: 'A one-line answer: "my summer has to prove ___".',
    },
    {
      id: 'summer-sourcing', weight: 'medium',
      label: 'Build a shortlist of five high-signal summer options',
      detail: 'Step two. Source from selective-program directories, university department pages, and your state\'s own programs. Five, with deadlines, in a table.',
      metric: 'Five programs with application deadlines and fee-waiver status recorded.',
      costNote: 'Filter for funded or free first. A no-cost state program in your own city outranks a paid pre-college camp on every axis a reader cares about, including how the essay about it will read.',
    },
    {
      id: 'summer-essay-reuse', weight: 'low',
      label: 'Map the overlapping essay prompts across those five',
      detail: 'Step three. Summer program prompts repeat: why this, what have you built, tell us about a challenge. Draft the shared core once and fit it, rather than writing five.',
      metric: 'One prompt map; no essay written twice from scratch.',
    },
    {
      id: 'psat-diagnostic', weight: 'medium', module: 'sat',
      label: 'Sit a diagnostic PSAT and turn it into a content list',
      detail: 'The score is not the point at this stage; the item-level breakdown is. It produces the list of math topics and grammar rules that junior-year study is actually made of.',
      metric: 'A ranked list of missed content areas, not a score.',
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// 3.3 Junior year — rigor and milestone execution.
// ─────────────────────────────────────────────────────────────────────────────
export const JUNIOR = {
  grade: 11, title: 'The year that is read most closely',
  premise: 'This is the last full year of grades most readers see, the year testing has to end, and the year leadership either arrives or does not. It is also the year the cold-email campaign works, because you are finally old enough to be useful in a lab.',
  items: [
    {
      id: 'peak-rigor', weight: 'high',
      label: 'Take your most demanding schedule of the four years',
      detail: 'Honors, AP, IB or dual enrollment, concentrated in the field your application is about. Junior-year rigor is the number a counselor letter is graded against.',
      metric: 'Your counselor would tick "most demanding" on the school report.',
    },
    {
      id: 'test-twice', weight: 'high', module: 'sat',
      label: 'Sit the SAT or ACT at least twice, and stop',
      detail: 'Two sittings, spaced far enough apart that the study between them is real. Target the school\'s median-to-75th percentile band; past the 75th, additional points are the least valuable hours available to you.',
      metric: 'A score at or above the median of your most selective realistic target — then stop testing.',
      costNote: 'Fee waivers cover both sittings and the score sends. Free official practice tests are the highest-yield prep material that exists; paid courses mostly sell scheduling.',
    },
    {
      id: 'spaced-repetition', weight: 'medium', module: 'retention',
      label: 'Run test prep on spaced repetition, not on volume',
      detail: 'Deep focus in 20-minute blocks, five minutes of written recall with nothing in front of you, then spacing. The retention model is explicit that unreviewed content decays exponentially and that each successful retrieval flattens the curve.',
      metric: 'Missed-topic list shrinking week over week, measured by re-test rather than by hours logged.',
    },
    {
      id: 'formal-leadership', weight: 'high', module: 'portfolio',
      label: 'Hold a formal leadership position with an outcome attached',
      detail: 'President, captain, founder, editor — the title matters far less than the sentence that follows it. "Grew membership from 9 to 41 and ran the district\'s first ___" is the line; the title is only what makes it credible.',
      metric: 'A role, plus one number that changed while you held it.',
    },
    {
      id: 'external-award', weight: 'medium', module: 'competition',
      label: 'Enter something with an external judge',
      detail: 'A competition, a juried show, a submission, the U.S. Congressional Award. External validation is the only thing that moves an activity out of Tier 3 without a headcount, and the selectivity index is computed from the real participant and winner counts, so pick where the field is genuinely large.',
      metric: 'At least one submission to something you do not control the outcome of.',
    },
    {
      id: 'cold-email', weight: 'high',
      label: 'Run a cold-email campaign for research or mentorship',
      detail: 'Twenty specific emails beat two hundred generic ones. Each names one paper of theirs you have read, one sentence on what you can do (a skill, a dataset, hours), and asks for one thing. The response rate is single digits and that is fine — this is a numbers exercise with a personalized numerator.',
      metric: '20 sent, logged, with follow-ups dated two weeks out.',
      costNote: 'Free, and the most reliable route to Tier 2 research access for a student with no family connections in the field.',
    },
    {
      id: 'junior-summer', weight: 'high',
      label: 'Spend the junior summer creating, not attending',
      detail: 'One or two goals that reinforce your theme, executed as self-directed milestones with numbers on them. Passive high-cost pre-college programs are the clearest signal available that a summer was purchased rather than built.',
      metric: 'Two milestones with dates and quantities, finished before September.',
      costNote: 'This item is deliberately the cheapest ambitious thing on the page.',
      stillWorth: 'Even eight weeks starting in July produces a real artifact — which is eight weeks more than most files show.',
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// 3.4 Senior year — the monthly execution pipeline.
//
// `dueDay` is the day of the month the item should be finished by, used to
// place it on the real calendar (src/lib/ivy/roadmap.js) rather than leaving
// "October" as the whole instruction.
// ─────────────────────────────────────────────────────────────────────────────
export const SENIOR_PIPELINE = [
  {
    month: 6, key: 'june', title: 'List, fit, and the first blank page',
    items: [
      { id: 'jun-list', weight: 'high', dueDay: 30, label: 'Cut the list to 8–12 schools', detail: 'Reaches, targets and likelies chosen against your actual GPA, your major\'s competitiveness at each school, and their published score percentiles — not against reputation. Twelve is a ceiling, not a target: every added school costs supplements you will be writing in November.', metric: '8–12 schools, each labeled, each with its round and deadline recorded.' },
      { id: 'jun-fit', weight: 'high', dueDay: 30, label: 'Run the 3-layer fit check on each', detail: 'Academic fit (does the department teach what you claim to want, and can you get into those courses), environmental fit (size, setting, distance, what a Tuesday looks like), and institutional priorities (what this school is publicly trying to build right now).', metric: 'Three lines per school. A school that fails two layers comes off the list in June, not in January.' },
      { id: 'jun-email', weight: 'low', dueDay: 15, label: 'Create a dedicated application email address', detail: 'Everything routes here: portals, aid, testing, recommenders. It is also the address that will still work when your school account is disabled after graduation.', metric: 'One address, used for every account you create from here.' },
      { id: 'jun-brainstorm', weight: 'high', dueDay: 30, label: 'Start personal-statement brainstorming — from the journal, not from prompts', detail: 'Prompts are the last thing to look at. Start from specific remembered scenes, then find which prompt they answer.', metric: 'Ten candidate moments written down. Not one draft — ten moments.' },
    ],
  },
  {
    month: 7, key: 'july', title: 'Draft one, and the school research nobody does',
    items: [
      { id: 'jul-draft', weight: 'high', dueDay: 20, label: 'Write the first full draft of the personal statement', detail: 'Complete and bad is the goal. A finished 650-word draft in July is worth more than a perfect opening paragraph in October.', metric: 'A draft with an end on it.' },
      { id: 'jul-refdoc', weight: 'high', dueDay: 31, label: 'Build the institutional reference document', detail: 'One document per school: named courses beyond the intro sequence, two or three faculty and what they actually work on, the specific programs or traditions you would use, and where you found each. This is the file the "why us" essays and every interview are written out of.', metric: 'Per school: 3 courses, 2 faculty, 2 programs, each with a source link.', costNote: 'Sourced from department pages, course catalogs, and current-student forums. Free, and better than any paid guide, because it is dated this year.' },
      { id: 'jul-review', weight: 'medium', dueDay: 31, label: 'Get three humans to read the draft', detail: 'Someone who knows you, someone who writes, and someone who knows nothing about you. The third one is the useful one.', metric: 'Three sets of notes, in writing.' },
    ],
  },
  {
    month: 8, key: 'august', title: 'Open the application; ask for the letters',
    items: [
      { id: 'aug-open', weight: 'high', dueDay: 10, label: 'Open the Common App and finish every administrative field', detail: 'Demographics, family, education, testing, courses, fee-waiver status. Dull, long, and the reason people miss deadlines in January.', metric: 'Every non-essay section green.' },
      { id: 'aug-recs', weight: 'high', dueDay: 20, label: 'Ask your recommenders — with the brag sheet attached', detail: 'Teachers write in the order they were asked and the good ones close. Each ask carries a completed brag sheet and your résumé; a counselor ask carries the environmental context nobody else can supply.', metric: 'Two teachers and the counselor asked, in person where possible, with documents attached.' },
      { id: 'aug-prompts', weight: 'medium', dueDay: 31, label: 'Compile every supplemental prompt into one table', detail: 'All schools, all prompts, all word limits, in one place — then group them, because four schools are asking the same "why major" question and that is four essays or one essay used four times.', metric: 'One table; prompts clustered into 4–5 reusable core stories.' },
    ],
  },
  {
    month: 9, key: 'september', title: '25%',
    items: [
      { id: 'sep-25', weight: 'high', dueDay: 30, label: 'Finish 25% of the supplemental essays', detail: 'Start with the early-round schools, and inside those, with the longest prompts.', metric: 'A quarter of the total supplement word count is drafted.' },
      { id: 'sep-resume', weight: 'medium', dueDay: 30, label: 'Finalise the résumé and any portfolio requirements', detail: 'Arts supplements, audition tapes, code repositories and research abstracts have their own deadlines, frequently earlier than the application itself.', metric: 'Résumé final; every portfolio requirement identified with its own date.' },
    ],
  },
  {
    month: 10, key: 'october', title: '50%, early deadlines, and the FAFSA',
    items: [
      { id: 'oct-50', weight: 'high', dueDay: 25, label: 'Reach 50% of supplements — and finish the early-round ones completely', detail: 'Everything for a 1 or 15 November deadline is done and reviewed before the last week of October. Not drafted. Done.', metric: 'Early-round applications submittable a week early.' },
      { id: 'oct-fafsa', weight: 'high', dueDay: 15, label: 'File the FAFSA (and the CSS Profile where required)', detail: 'Opens 1 October. Several state and institutional aid pools are first-come, and they empty. This is the highest-value hour on the entire senior calendar measured in dollars.', metric: 'FAFSA submitted; CSS filed for every school that requires it.', costNote: 'Free. The CSS Profile fee is waived automatically for eligible families.' },
      { id: 'oct-ea', weight: 'high', dueDay: 31, label: 'Submit EA / ED applications', detail: 'Submit before the last 48 hours. Portals slow to a crawl on deadline night and a payment failure at 11:40pm is a real way to miss a round.', metric: 'Submitted, with confirmation emails saved.' },
    ],
  },
  {
    month: 11, key: 'november', title: '75%, and the money applications',
    items: [
      { id: 'nov-75', weight: 'high', dueDay: 30, label: 'Reach 75% of supplements', detail: 'Regular-decision writing carries the whole month; the volume is highest here and the motivation is lowest, which is precisely why the target is a number.', metric: 'Three-quarters of the supplement word count drafted.' },
      { id: 'nov-scholarships', weight: 'high', dueDay: 30, label: 'Submit school-specific scholarship applications', detail: 'Institutional merit scholarships often have their own November deadline and their own essay, and are frequently the largest single sum a student applies for all year.', metric: 'Every merit deadline on your list identified and met.' },
    ],
  },
  {
    month: 12, key: 'december', title: 'Submit the rest; start speaking out loud',
    items: [
      { id: 'dec-rd', weight: 'high', dueDay: 20, label: 'Submit every remaining regular-decision application', detail: 'Before the winter break, not during it. Support desks close, recommenders go away, and a 1 January deadline is functionally a 20 December one.', metric: 'All applications submitted with confirmations saved.' },
      { id: 'dec-interview', weight: 'medium', dueDay: 31, label: 'Start mock interviews from the institutional reference document', detail: 'Interviews are an alignment check: the engine scores how closely what you say matches the theme you wrote. Practice out loud and recorded — under 180 words per minute, which is slower than nerves want.', metric: 'Three recorded practice runs; alignment above 0.80 against your written theme.' },
    ],
  },
];

/**
 * The 90-day summer sprint (Section 1.8) — the same senior work, expressed as
 * a day-indexed sprint for a student starting in June with nothing done.
 */
export const SPRINT_PHASES = [
  {
    id: 'foundation', month: 1, from: 1, to: 30, title: 'Foundation & the Value-Based Theme',
    targets: [
      'Name the final Value-Based Theme — what you actually care about, not the major you will write on the form',
      'Cut the college list to 8–12, each with its round and deadline',
      'Get the teacher and counselor brag sheets written and delivered',
    ],
  },
  {
    id: 'story-bank', month: 2, from: 31, to: 60, title: 'Core story banking',
    targets: [
      'A complete personal-statement draft',
      'Every supplemental prompt collected and clustered',
      'Four to five reusable core stories mapped onto those clusters',
    ],
  },
  {
    id: 'echoes', month: 3, from: 61, to: 90, title: 'Echo generation & alignment',
    targets: [
      'Common App administrative sections complete',
      'All ten activity descriptions written to 150 characters',
      'The Creating Echoes pass: every part of the application reinforcing one theme',
    ],
  },
];

/** All four grade plans, keyed by grade level. */
export const GRADE_PLANS = { 9: FRESHMAN, 10: SOPHOMORE, 11: JUNIOR };

/** Month index → the senior pipeline block, for date-aware rendering. */
export const SENIOR_BY_MONTH = Object.fromEntries(SENIOR_PIPELINE.map(m => [m.month, m]));
