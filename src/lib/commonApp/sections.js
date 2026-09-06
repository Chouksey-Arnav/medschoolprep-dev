// ─────────────────────────────────────────────────────────────────────────────
// The Common Application, modeled section by section.
//
// ── What this file is for ────────────────────────────────────────────────────
// The Portfolio already collected almost everything the Common App asks for. It
// just never said so. A student logged clinical hours in one tab, awards in
// another and essays in a third, and nothing anywhere connected those to the
// nine-field form they would eventually have to fill in — so the app read as a
// set of good habits rather than as preparation for a specific document with a
// specific deadline.
//
// This module is the spine that connects them. It models the real Common
// Application as a list of SECTIONS, each one naming:
//
//   - what the real form calls it, verbatim, so a student searching the actual
//     application finds the same words
//   - which fields it holds and what each field's real character or count limit
//     is (`fields`)
//   - which Portfolio surface feeds it (`source`), so every panel in the app can
//     say what it is building toward and link to the mirror
//   - how to derive its current state from the Portfolio (`derive`, in
//     ./derive.js — kept separate so this file stays a description of the form
//     rather than a description of our database)
//
// ── The rule that governs everything here ────────────────────────────────────
// THE LIMITS AND LABELS ARE THE REAL ONES. This file's whole value is that a
// student can trust it to match what they will see when they log in. A limit
// that is approximately right is worse than no limit at all, because it will be
// believed: a description written to a 200-character cap we invented gets
// truncated mid-sentence by the real 150-character field, and the student finds
// out after submitting. Where the real form's behavior genuinely varies by
// college — which supplements exist, whether courses and grades is required,
// how many teacher recommenders are allowed — this file says so rather than
// picking a number.
//
// ── What is deliberately NOT modeled ────────────────────────────────────────
// Anything we would be guessing at, and anything we should not hold. The Family
// section, the demographic questions, the fee-waiver questions and the
// disciplinary-history question are all named as sections so the student sees a
// complete picture of the form — but they carry no fields and derive nothing,
// because this app does not collect a student's parents' education level, their
// household income, or their disciplinary record, and it should not start in
// order to make a progress bar look better. Those sections render as "the real
// form asks this; we do not hold it" and link out.
//
// Pure data and pure functions. No React, no network, no persistence — so
// scripts/verifyCommonApp.mjs can assert on all of it directly.
// ─────────────────────────────────────────────────────────────────────────────

import { CA_LIMITS, CA_CATEGORIES, CA_GRADES, CA_TIMING } from './activities.js';

export { CA_LIMITS, CA_CATEGORIES, CA_GRADES, CA_TIMING };

/**
 * Limits the real form enforces beyond the activity/honor ones already in
 * ./activities.js. Kept in one place for the same reason those were: a
 * second copy of a number that is rendered in one file and validated in another
 * is a number that will eventually disagree with itself.
 */
export const CA_WRITING_LIMITS = {
  /** The personal essay. 650 words, and 250 is a real floor the form enforces. */
  personalEssayMax: 650,
  personalEssayMin: 250,
  /** Additional Information — the optional box, same ceiling as the essay. */
  additionalInfoMax: 650,
  /** Community Disruption, and the Challenges & Circumstances question. */
  disruptionMax: 250,
  challengesMax: 250,
  /** Honors section, five slots — mirrored from CA_LIMITS for one import site. */
  maxHonors: CA_LIMITS.maxHonors,
  /** Community-Based Organizations, on the Education tab. */
  maxCommunityOrgs: 3,
};

/**
 * The seven Common App personal essay prompts, verbatim.
 *
 * The seventh is the free-choice option and is quoted in full rather than
 * summarized as "topic of your choice", because its actual wording — that the
 * essay may be one you have already written — is the part students most often
 * do not know and the part that saves them the most work.
 */
export const CA_ESSAY_PROMPTS = [
  { id: 'background', text: 'Some students have a background, identity, interest, or talent that is so meaningful they believe their application would be incomplete without it. If this sounds like you, then please share your story.' },
  { id: 'obstacle', text: 'The lessons we take from obstacles we encounter can be fundamental to later success. Recount a time when you faced a challenge, setback, or failure. How did it affect you, and what did you learn from the experience?' },
  { id: 'belief', text: 'Reflect on a time when you questioned or challenged a belief or idea. What prompted your thinking? What was the outcome?' },
  { id: 'gratitude', text: 'Reflect on something that someone has done for you that has made you happy or thankful in a surprising way. How has this gratitude affected or motivated you?' },
  { id: 'growth', text: 'Discuss an accomplishment, event, or realization that sparked a period of personal growth and a new understanding of yourself or others.' },
  { id: 'engaging', text: 'Describe a topic, idea, or concept you find so engaging that it makes you lose all track of time. Why does it captivate you? What or who do you turn to when you want to learn more?' },
  { id: 'free', text: 'Share an essay on any topic of your choice. It can be one you have already written, one that responds to a different prompt, or one of your own design.' },
];

/**
 * The decision plans the real form offers per college. Named here because the
 * choice is binding in one case and a great many students do not know which.
 */
export const CA_DECISION_PLANS = [
  { id: 'ed1', label: 'Early Decision I', binding: true, note: 'Binding. You may apply Early Decision to exactly one college, and if admitted you must withdraw every other application.' },
  { id: 'ed2', label: 'Early Decision II', binding: true, note: 'Also binding, with a later deadline — usually January. Same one-college rule.' },
  { id: 'ea', label: 'Early Action', binding: false, note: 'Not binding. You hear early and can still compare offers.' },
  { id: 'rea', label: 'Restrictive / Single-Choice Early Action', binding: false, note: 'Not binding, but restricts where else you may apply early. Read the specific college\'s rule — they differ.' },
  { id: 'rd', label: 'Regular Decision', binding: false, note: 'The standard deadline, usually early January.' },
  { id: 'rolling', label: 'Rolling Admission', binding: false, note: 'Reviewed as they arrive. Applying early genuinely helps here in a way it does not elsewhere.' },
];

/**
 * A field on the real form.
 *
 * `limit` is a hard character or word cap the form enforces; null means the
 * field has no cap or the cap varies by college. `unit` says which, because
 * "650" means something very different in characters and in words and the
 * counter has to be right.
 */
const field = (id, label, { limit = null, unit = 'characters', required = false, note = null } = {}) =>
  ({ id, label, limit, unit, required, note });

/**
 * THE SECTIONS.
 *
 * `status` on each: 'mirrored' means the Portfolio genuinely feeds it and we can
 * report real readiness; 'external' means the real form asks for it and this app
 * deliberately does not hold the answer (see the header). An 'external' section
 * is still listed, because a student's mental model of the application should be
 * the real application, not the subset we happen to store.
 *
 * `source` is the Portfolio destination that feeds this section, in the
 * {tab, view, section} shape App.jsx's goDest already understands — so every
 * panel can link to its mirror and the mirror can link back to every panel.
 */
export const CA_SECTIONS = [
  // ── Profile ───────────────────────────────────────────────────────────────
  {
    id: 'profile',
    formName: 'Profile',
    label: 'Profile',
    blurb: 'Your name, contact details, address, citizenship and demographics. The first tab of the real application and the one that gates the rest.',
    status: 'partial',
    source: { tab: 'settings', view: 'profile' },
    fields: [
      field('legalName', 'Legal name', { required: true, note: 'It has to match your official documents, not what people call you. A mismatch between this and your test-score report is one of the most common causes of a score that never arrives.' }),
      field('email', 'Email address', { required: true, note: 'Use one you will still read next August. A school address that gets deactivated at graduation is the classic mistake.' }),
      field('address', 'Permanent home address', { required: true }),
      field('citizenship', 'Citizenship status', { required: true }),
    ],
    externalFields: ['Demographics', 'Geography & Nationality', 'Language', 'Common App fee waiver'],
    why: 'Nothing here is hard, and all of it blocks submission. Getting it done in an afternoon in August is the cheapest possible win.',
  },

  // ── Family ────────────────────────────────────────────────────────────────
  {
    id: 'family',
    formName: 'Family',
    label: 'Family',
    blurb: 'Household, parents or guardians, their education and occupations, and siblings.',
    status: 'external',
    fields: [],
    externalFields: ['Household', 'Parent 1 and Parent 2', 'Siblings'],
    why: 'This app does not hold anything about your family and is not going to start in order to fill in a progress bar. It is worth knowing the section exists, because the parent-education questions are what determine whether you count as first-generation — which unlocks a large number of scholarships.',
  },

  // ── Education ─────────────────────────────────────────────────────────────
  {
    id: 'education-grades',
    formName: 'Education → Grades',
    label: 'Grades',
    blurb: 'Class rank, GPA scale, cumulative GPA, and how many courses your GPA is weighted across.',
    status: 'mirrored',
    source: { tab: 'portfolio', view: 'resume', section: 'academics' },
    fields: [
      field('gpaScale', 'GPA scale reporting', { required: true, note: 'The scale matters as much as the number. A 4.4 on a 5.0 scale and a 4.4 on a 4.0 scale are different claims.' }),
      field('cumulativeGpa', 'Cumulative GPA', { required: true }),
      field('classRank', 'Class rank reporting', { note: 'Many schools no longer rank. "Not reported" is a normal answer and is not held against you.' }),
    ],
    why: 'Your GPA log already holds the terms and the weighting. This is where that number goes, and the scale question is the one students get wrong.',
  },
  {
    id: 'education-honors',
    formName: 'Education → Honors',
    label: 'Honors',
    blurb: 'Up to five academic honors, each with its level of recognition and the grade you received it in.',
    status: 'mirrored',
    source: { tab: 'portfolio', view: 'resume', section: 'activities' },
    limitCount: CA_LIMITS.maxHonors,
    fields: [
      field('title', 'Honor title', { limit: CA_LIMITS.honorTitle, required: true }),
      field('grade', 'Grade level', { required: true }),
      field('level', 'Level of recognition', { required: true, note: 'School, State/Regional, National or International. This is most of what the honor communicates and it is a required field.' }),
    ],
    why: 'Five slots, ranked. Everything you have logged as an award is a candidate, and the ordering is what a reader with forty files left actually sees.',
  },
  {
    id: 'education-cbo',
    formName: 'Education → Community-Based Organizations',
    label: 'Community-Based Organizations',
    blurb: 'Up to three organizations that have given you free help with your application — a college access program, a mentoring nonprofit, an upward-bound style program.',
    status: 'mirrored',
    // Pinned to the finder section rather than to the Opportunities view as a whole. Without the
    // section, sectionsFedBy falls back to the view-level key and this badge would also appear on
    // "What you're tracking", where it makes no sense — a tracked program is not an organization
    // that helped you with your application.
    source: { tab: 'portfolio', view: 'opportunities', section: 'find' },
    limitCount: CA_WRITING_LIMITS.maxCommunityOrgs,
    fields: [
      field('organization', 'Organization name', { required: true }),
    ],
    why: 'Almost nobody fills this in, and it is genuinely worth doing: it tells a reader you sought help out and got it, and it is three slots that cost you nothing.',
  },
  {
    id: 'education-future-plans',
    formName: 'Education → Future Plans',
    label: 'Future Plans',
    blurb: 'Your intended career and the highest degree you intend to earn.',
    status: 'mirrored',
    source: { tab: 'roadmap', view: 'intake' },
    fields: [
      field('careerInterest', 'Career interest', { required: true }),
      field('highestDegree', 'Highest degree you intend to earn', { required: true, note: 'For a pre-med student this is Doctorate, and saying so is not presumptuous — it is the question being answered accurately.' }),
    ],
    why: 'Two dropdowns, and they are the only place on the whole form where you state outright that you are going into medicine.',
  },

  // ── Testing ───────────────────────────────────────────────────────────────
  {
    id: 'testing',
    formName: 'Testing',
    label: 'Testing',
    blurb: 'Which tests you are reporting, the scores, and the dates — including tests you plan to sit but have not yet.',
    status: 'mirrored',
    source: { tab: 'portfolio', view: 'applying', section: 'calc' },
    fields: [
      field('satAct', 'SAT / ACT scores', { note: 'Self-reported here; an official report from College Board or ACT is separate and costs money, so check each college\'s policy before ordering.' }),
      field('apIb', 'AP / IB subjects and scores'),
      field('futureSittings', 'Tests you plan to take', { note: 'You can and should list a sitting that has not happened yet.' }),
    ],
    why: 'Every score you have logged is already here. The decision this section really asks is whether to report at all, which is a per-college judgment rather than one answer.',
  },

  // ── Activities ────────────────────────────────────────────────────────────
  {
    id: 'activities',
    formName: 'Activities',
    label: 'Activities',
    blurb: 'Ten slots, nine fields each, listed in order of importance to you. The single highest-leverage section of the whole application and the one with the least room.',
    status: 'mirrored',
    source: { tab: 'portfolio', view: 'resume', section: 'activities' },
    limitCount: CA_LIMITS.maxActivities,
    fields: [
      field('category', 'Activity type', { required: true, note: 'A fixed dropdown of thirty categories — you pick, you cannot type your own.' }),
      field('position', 'Position/Leadership description', { limit: CA_LIMITS.position, required: true }),
      field('organization', 'Organization name', { limit: CA_LIMITS.organization }),
      field('description', 'Please describe this activity', { limit: CA_LIMITS.description, required: true }),
      field('grades', 'Participation grade levels', { required: true }),
      field('timing', 'Timing of participation', { required: true }),
      field('hours', 'Hours spent per week', { limit: CA_LIMITS.maxHours, unit: 'max value', required: true }),
      field('weeks', 'Weeks spent per year', { limit: CA_LIMITS.maxWeeks, unit: 'max value', required: true }),
      field('continue', 'I intend to participate in college', {}),
    ],
    why: 'Everything you log — activities, clinical hours, research, certifications — competes for these ten slots. Which ten, and in what order, is the most consequential editing decision in the application.',
  },

  // ── Writing ───────────────────────────────────────────────────────────────
  {
    id: 'writing-essay',
    formName: 'Writing → Personal Essay',
    label: 'Personal essay',
    blurb: 'One essay of 250 to 650 words, answering one of seven prompts, sent to every college you apply to.',
    status: 'mirrored',
    source: { tab: 'portfolio', view: 'applying', section: 'essays' },
    fields: [
      field('prompt', 'Prompt', { required: true }),
      field('essay', 'Essay', { limit: CA_WRITING_LIMITS.personalEssayMax, unit: 'words', required: true, note: 'The 650 is a hard ceiling and the 250 is a hard floor — the form will not accept either side of them.' }),
    ],
    why: 'Six hundred and fifty words that go to every college on your list. Nothing else you write is read by as many people.',
  },
  {
    id: 'writing-additional',
    formName: 'Writing → Additional Information',
    label: 'Additional information',
    blurb: 'An optional 650-word box for anything the rest of the application has no room for.',
    status: 'mirrored',
    source: { tab: 'portfolio', view: 'applying', section: 'essays' },
    fields: [
      field('additional', 'Additional information', { limit: CA_WRITING_LIMITS.additionalInfoMax, unit: 'words', note: 'Optional, and leaving it blank is a perfectly good answer. Use it for context a reader would otherwise misread — not for a second personal essay.' }),
    ],
    why: 'The right place for an activity that did not fit in ten slots, an explained dip in a semester, or a research project that needs more than 150 characters. The wrong place for more of the same.',
  },
  {
    id: 'writing-challenges',
    formName: 'Writing → Challenges & Circumstances',
    label: 'Challenges & circumstances',
    blurb: 'An optional 250-word box for a challenge in your community or personal life that has affected your education.',
    status: 'external',
    fields: [
      field('challenges', 'Challenges & circumstances', { limit: CA_WRITING_LIMITS.challengesMax, unit: 'words' }),
    ],
    why: 'Optional, personal, and yours alone to decide about. This app does not store it and does not prompt you for it — but you should know the box exists rather than meeting it for the first time in August.',
  },
  {
    id: 'writing-disciplinary',
    formName: 'Writing → Disciplinary History',
    label: 'Disciplinary history',
    blurb: 'A yes/no question about school discipline and criminal history, with an explanation box if yes.',
    status: 'external',
    fields: [],
    why: 'Not something this app holds. Worth naming so it is not a surprise: answering honestly and briefly is consistently reported to matter far less than students fear, and answering dishonestly is the thing that actually ends applications.',
  },

  // ── Courses & Grades ──────────────────────────────────────────────────────
  {
    id: 'courses-grades',
    formName: 'Courses & Grades',
    label: 'Courses & grades',
    blurb: 'Your entire high school transcript, typed in by hand, course by course and grade by grade. Required by some colleges and not others.',
    status: 'mirrored',
    source: { tab: 'portfolio', view: 'resume', section: 'academics' },
    fields: [
      field('transcript', 'Self-reported courses and grades', { note: 'Only appears if a college on your list requires it. It takes hours — find out in August whether you need it, not in December.' }),
    ],
    why: 'The most tedious section of the application by a wide margin, and the one most likely to be discovered late. Whether you need it at all depends entirely on your college list.',
  },

  // ── College-specific ──────────────────────────────────────────────────────
  {
    id: 'college-list',
    formName: 'My Colleges',
    label: 'College list & deadlines',
    blurb: 'The colleges you are applying to, each with its own deadline and decision plan.',
    status: 'mirrored',
    source: { tab: 'portfolio', view: 'applying', section: 'colleges' },
    fields: [
      field('college', 'College', { required: true }),
      field('decisionPlan', 'Application deadline / decision plan', { required: true, note: 'Early Decision is a binding contract and you may sign exactly one. Everything else is reversible.' }),
    ],
    why: 'Adding a college to the real application is what reveals its supplements, its questions and its recommender requirements. Until you add it, you cannot see what it will ask for.',
  },
  {
    id: 'college-questions',
    formName: 'My Colleges → Questions',
    label: 'College questions',
    blurb: 'Per-college questions: intended major, campus, scholarship interest, alumni relatives, housing.',
    status: 'external',
    fields: [],
    why: 'Different at every college and only visible once you have added them. The one that catches people out is the intended-major dropdown, which at some colleges determines which admissions pool you land in.',
  },
  {
    id: 'college-supplements',
    formName: 'My Colleges → Writing Supplement',
    label: 'Writing supplements',
    blurb: 'Additional essays required by individual colleges. Anywhere from none to five per college, with their own word limits.',
    status: 'mirrored',
    source: { tab: 'portfolio', view: 'applying', section: 'essays' },
    fields: [
      field('supplement', 'Supplemental essay', { note: 'Word limits are set per prompt by each college and range from 50 to 650.' }),
    ],
    why: 'In total these are usually more writing than the personal essay, spread across more deadlines, and they are where a "why us" answer either shows you have read something about the college or shows you have not.',
  },
  {
    id: 'recommenders',
    formName: 'My Colleges → Recommenders & FERPA',
    label: 'Recommenders & FERPA',
    blurb: 'Your counselor, your teachers, and the FERPA waiver you have to sign before you can invite any of them.',
    status: 'mirrored',
    source: { tab: 'portfolio', view: 'applying', section: 'recommenders' },
    fields: [
      field('ferpa', 'FERPA release authorization', { required: true, note: 'You sign this once, it cannot be changed afterwards, and NOTHING about recommenders works until you have. Waiving your right to read the letters is the near-universal advice, because a letter the writer knows you may read is worth less to a reader.' }),
      field('counselor', 'Counselor', { required: true }),
      field('teachers', 'Teacher recommenders', { note: 'How many are allowed varies by college — usually one to three.' }),
    ],
    why: 'The FERPA waiver is a hard blocker that people hit in October and it takes two minutes. Everything about who you ask, when, and how you thank them lives in your recommender tracker.',
  },
];

export const CA_SECTION_BY_ID = Object.fromEntries(CA_SECTIONS.map((s) => [s.id, s]));
export const CA_SECTION_IDS = CA_SECTIONS.map((s) => s.id);

/** Only the sections the Portfolio genuinely feeds — the ones readiness is computed over. */
export const MIRRORED_SECTIONS = CA_SECTIONS.filter((s) => s.status !== 'external');

/**
 * The reverse index every Portfolio panel uses: "which Common App section am I
 * feeding?" Keyed by `tab/view` and by `tab/view:section`, so a panel can ask
 * with whatever precision it has.
 *
 * Several sections share a source (three of them are fed by the essay
 * workspace), so the values are arrays. A panel showing "this feeds the Common
 * App's Writing section" when it in fact feeds three of them would be the kind
 * of small inaccuracy that makes the whole mirror less believable.
 */
export const SECTIONS_BY_SOURCE = (() => {
  const out = {};
  const push = (key, section) => {
    if (!key) return;
    (out[key] = out[key] || []).push(section);
  };
  for (const s of CA_SECTIONS) {
    if (!s.source) continue;
    const { tab, view, section } = s.source;
    push(`${tab}/${view}`, s);
    if (section) push(`${tab}/${view}:${section}`, s);
  }
  return out;
})();

/**
 * Which Common App sections a Portfolio surface feeds.
 *
 * Returns an empty array for a surface that feeds nothing, which is a normal and
 * common answer — the SAT tab, the Progress tab, and several Portfolio sections
 * feed no part of the Common App and must not pretend to.
 *
 * ── Why a named section does NOT fall back to its view ──────────────────────
 * This used to fall back from the specific key to the view-level one, on the
 * theory that a more general answer beats none. It is the opposite: the
 * view-level key holds the union of every section under that view, so asking
 * about one unmapped section returned ALL of them. The Applying page has nine
 * sections and six mappings, so financial aid, interview prep, combined degrees,
 * the MedEx Score and the narrative reading each rendered a badge claiming they
 * fed the Common App's Testing, Writing, College List and Recommenders sections
 * at once. That is not vague, it is false — the aid panel feeds none of them —
 * and it appeared on five panels at once.
 *
 * So: if the caller NAMES a section, they get that section's mapping or nothing.
 * The view-level fallback is only for a caller that genuinely has no section to
 * give, which is the case it was written for.
 */
export function sectionsFedBy(tab, view, section = null) {
  if (section) return SECTIONS_BY_SOURCE[`${tab}/${view}:${section}`] || [];
  return SECTIONS_BY_SOURCE[`${tab}/${view}`] || [];
}

/** The stable key one field of one entry is tracked under. See ./sync.js. */
export function fieldKey(sectionId, entryId, fieldId) {
  return `${sectionId}::${entryId ?? '_'}::${fieldId}`;
}
