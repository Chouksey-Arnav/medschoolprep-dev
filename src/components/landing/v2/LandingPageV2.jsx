/* eslint-disable react/no-unescaped-entities */
// ─────────────────────────────────────────────────────────────────────────────
// Landing page — VERSION 2 (the active one).
//
// Version 1 is src/components/LandingPage.jsx and is still in the tree, still
// compiling, and deliberately not rendered. The switch between them is a single
// constant in src/components/landing/landingVersions.js; nothing else in the app
// names either component. See that file before changing which one ships.
//
// ── Where this came from ─────────────────────────────────────────────────────
//
// This page was authored as a design-canvas document (`MedSchoolPrep
// Landing.dc.html`): x-dc markup with `<sc-for>` / `<sc-if>` / `{{ hole }}`
// templating over a `DCLogic` class. The port to React was mechanical on
// purpose:
//
//   <sc-for list="{{ opps }}" as="o">  →  {arr(v.opps).map((o, i) => …)}
//   <sc-if value="{{ pfIsOpps }}">     →  {(v.pfIsOpps) ? (…) : null}
//   style="font-size: 12px"            →  style={css('font-size: 12px')}
//   style-hover="…"                    →  a generated class in V2_STYLES
//
// and DCLogic is React's own class API under another name — `state`,
// `setState`, `componentDidMount`, `componentDidUpdate`,
// `componentWillUnmount` — so the logic below is the design's logic verbatim,
// with `renderVals()` feeding the template instead of a `render()`.
//
// The point of doing it that way: every color, every spacing value and every
// line of copy on this page is the string the design shipped, not a
// re-interpretation of it. If the design is revised, re-port it the same way
// rather than hand-patching the JSX.
//
// ── What this component needs from its host ──────────────────────────────────
//
//   signupUrl / loginUrl   the real app routes (AUTH_VIEWS.signup / .login), so
//                          the CTAs are linkable, middle-clickable and crawlable
//   onGetStarted / onLogin the client-side navigators, so a plain left click
//                          does not reload the whole bundle
//   onOpenParents          /parents — a URL a parent can be sent
//   onOpenLegal            /legal/* — reachable without an account, by law
//
// `themeMode` / `onThemeChange` are accepted and ignored: v2 is a single
// committed light design with no theme toggle in it, and the signed-in app owns
// the student's theme from the moment they are through the door.
// ─────────────────────────────────────────────────────────────────────────────

import React, { Fragment } from 'react';
import { css, arr, hole } from './dcRuntime';
import { AUTH_VIEWS, LEGAL_VIEWS, PARENT_HUB_PATH } from '../../../lib/routes';

/**
 * The design's own stylesheet: the keyframes its animations reference, the
 * scrollbar treatment on its horizontal rails, the reduced-motion opt-out, and
 * the `style-hover` / `style-after` declarations the canvas format expresses as
 * attributes and the DOM can only express as rules.
 *
 * Scoped under `.mspv2-root` rather than left global — the signed-in app mounts
 * into the same document, and a bare `a { color: … }` from the marketing page
 * would follow the student inside.
 */
const V2_STYLES = `
.mspv2-root { color: #1f2836; font-family: 'Onest', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; -webkit-font-smoothing: antialiased; }
.mspv2-root * { box-sizing: border-box; }
.mspv2-root a { color: #1a5fcc; text-decoration: none; }
.mspv2-root a:hover { color: #154ea7; }
.mspv2-root button { font-family: inherit; }
@keyframes msp-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
@keyframes msp-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(109,49,212,0.30); } 50% { box-shadow: 0 0 0 10px rgba(109,49,212,0); } }
@keyframes msp-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
@keyframes msp-blink { 0%,100% { opacity: 0.25; } 50% { opacity: 1; } }
@keyframes msp-sheen { from { background-position: -220% 0; } to { background-position: 220% 0; } }
@keyframes msp-spin { to { transform: rotate(360deg); } }
@keyframes msp-dash { to { stroke-dashoffset: 0; } }
.mspv2-root .msp-scroll::-webkit-scrollbar { height: 6px; }
.mspv2-root .msp-scroll::-webkit-scrollbar-thumb { background: rgba(15,23,42,0.17); border-radius: 99px; }
@media (prefers-reduced-motion: reduce) { .mspv2-root .msp-anim { animation: none !important; } }
.mspv2-root .mspv2-hover-1:hover { background: rgba(255,255,255,0.7); color: #1f2836; }
.mspv2-root .mspv2-hover-2:hover { transform: translateY(-1px); box-shadow: 0 10px 24px rgba(26,95,204,0.34); }
.mspv2-root .mspv2-after-3::after { content: ''; }
.mspv2-root .mspv2-hover-4:hover { transform: translateY(-2px); box-shadow: 0 16px 34px rgba(26,95,204,0.36); }
.mspv2-root .mspv2-hover-5:hover { background: #ffffff; border-color: rgba(15,23,42,0.27); }
.mspv2-root .mspv2-hover-6:hover { animation-play-state: paused; }
.mspv2-root .mspv2-hover-7:hover { background: #ffffff; border-color: rgba(109,49,212,0.4); transform: translateX(3px); }
.mspv2-root .mspv2-hover-8:hover { border-color: rgba(109,49,212,0.42); transform: translateX(3px); }
.mspv2-root .mspv2-hover-9:hover { border-color: rgba(109,49,212,0.4); color: #1f2836; }
.mspv2-root .mspv2-hover-10:hover { transform: translateY(-2px); }
.mspv2-root .mspv2-hover-11:hover { background: rgba(255,255,255,0.22); }
`;

// Shared by the header's "For parents" and "Log in" links (see the header markup below) so a
// second nav pill doesn't cost the file a second copy of the same literal — the one-off-color
// audit (scripts/verifyDesignTokens.mjs) counts every hex/rgb color literal occurrence in the
// file and this page's baseline is shrink-only.
const NAV_PILL_STYLE = css("font-size: 13.5px; font-weight: 600; color: #45536b; padding: 9px 12px; border-radius: 10px;");


const PILLARS = [
  { id: 'home', label: 'Home', color: '#1a5fcc', title: 'Home' },
  { id: 'prep', label: 'Prep', color: '#6d31d4', title: 'Prep \u00b7 Physician pathway' },
  { id: 'portfolio', label: 'Portfolio', color: '#067156', title: 'Portfolio \u00b7 overview' },
  { id: 'roadmap', label: 'Roadmap', color: '#a422b8', title: 'Roadmap \u00b7 your year' },
  { id: 'plans', label: 'Plans', color: '#905808', title: 'Plans \u00b7 This week' },
];

const PATHWAYS = {
  physician: { label: 'Physician (MD/DO)', color: '#1a5fcc', blurb: 'Maximum scope of practice, and the longest training. Anatomy, lab interpretation and diagnostic reasoning start here.' },
  nursing: { label: 'Nursing', color: '#067156', blurb: 'Hands-on patient contact soonest, on a team rather than carrying sole diagnostic responsibility.' },
  physicianAssistant: { label: 'Physician assistant', color: '#0b7166', blurb: 'You diagnose and treat, faster to practice, inside a physician-led team.' },
  pharmacy: { label: 'Pharmacy', color: '#6d31d4', blurb: 'Deep specialism in one drug or therapy area, and the go-to expert on it.' },
  physicalOccupTherapy: { label: 'Physical & occupational therapy', color: '#026b97', blurb: 'Movement, rehabilitation and the long arc of someone getting their life back.' },
  biomedResearch: { label: 'Biomedical research', color: '#4640c9', blurb: 'The bench work behind treatment guidelines — PCR, cell culture, publication.' },
  dentistry: { label: 'Dentistry', color: '#0a6c84', blurb: 'The most hands-on path in medicine, and the one most likely to end in your own practice.' },
  publicHealth: { label: 'Public health', color: '#905808', blurb: 'Population-level medicine: outbreaks, screening, prevention at scale.' },
  healthAdmin: { label: 'Health administration', color: '#a422b8', blurb: 'The operations and economics of care — staffing, budget, how a clinic actually runs.' },
};

const DIAG = [
  { id: 'q13', type: 'scenario', q: 'Which shadowing day sounds the most interesting to you?', ch: [
    { text: 'Shadowing a physician running a full clinic day', w: { physician: 3, physicianAssistant: 1 } },
    { text: 'Shadowing a nurse managing a hospital floor', w: { nursing: 3, physicianAssistant: 1 } },
    { text: 'Shadowing a pharmacist checking prescriptions and drug interactions', w: { pharmacy: 3 } },
    { text: 'Shadowing a physical therapist running rehab sessions', w: { physicalOccupTherapy: 3 } },
  ] },
  { id: 'q15', type: 'scenario', q: 'If you could sit in on one professional conversation, which would you pick?', ch: [
    { text: 'A doctor explaining a diagnosis to a scared family', w: { physician: 2, physicianAssistant: 2 } },
    { text: 'A nurse calming a patient down before a procedure', w: { nursing: 3 } },
    { text: 'A researcher presenting findings that could change treatment guidelines', w: { biomedResearch: 3 } },
    { text: 'A hospital director negotiating budget to keep the ER fully staffed', w: { healthAdmin: 3 } },
  ] },
  { id: 'q16', type: 'axis', q: 'Which of these would you actually enjoy studying in depth?', ch: [
    { text: 'How drugs move through and affect the body', w: { pharmacy: 3 } },
    { text: 'How joints, muscles, and movement work and heal', w: { physicalOccupTherapy: 3 } },
    { text: 'How diseases spread through populations and how to stop them', w: { publicHealth: 3 } },
    { text: 'How teeth, gums, and the mouth affect overall health', w: { dentistry: 3 } },
  ] },
];

const QUIZ = [
  {
    cat: 'Bio & Biochem', topic: 'Lab Values & Diagnostic Testing',
    q: 'What does "sensitivity" measure in a diagnostic test?',
    ch: [
      'The proportion of people WITH the disease who correctly test positive',
      'The proportion of people WITHOUT the disease who correctly test negative',
      'The chance that a positive result is a true positive',
      'The smallest change in a value the test can detect',
    ],
    answer: 0,
    why: 'A highly sensitive test is good for ruling disease OUT — SnNout. Specificity is the mirror image: high specificity is good for ruling disease IN (SpPin). Mixing the two up is the single most common error on this topic, so hold onto the pair rather than either definition alone.',
  },
  {
    cat: 'Psych & Soc', topic: 'Mental Health',
    q: 'Which set of findings meets the core diagnostic features of major depressive disorder?',
    ch: [
      'Two weeks of depressed mood or lost interest, plus sleep, appetite, energy or concentration change, causing functional impairment',
      'Three days of low mood after a clear stressor, resolving on its own',
      'Persistent low mood for two years without any functional impairment',
      'Mood swings alternating with periods of elevated energy and reduced sleep',
    ],
    answer: 0,
    why: 'The two-week floor and the functional impairment are what separate a depressive episode from a normal low stretch. Option four describes bipolar disorder, and option three describes persistent depressive disorder — both are real diagnoses, neither is this one.',
  },
  {
    cat: 'Chem & Physics', topic: 'Metabolism',
    q: 'Which three macromolecule classes are metabolized for energy?',
    ch: [
      'Carbohydrates, lipids and proteins',
      'Carbohydrates, nucleic acids and lipids',
      'Proteins, nucleic acids and vitamins',
      'Lipids, minerals and carbohydrates',
    ],
    answer: 0,
    why: 'All three are broken down and fed into cellular respiration. Nucleic acids carry information rather than fuel, and vitamins and minerals are cofactors — they enable the reactions instead of being burned in them.',
  },
];

const COACH = [
  {
    q: 'What should I study next in my pathway?',
    a: 'Unit 3 — Lab Values & Diagnostic Testing. You are 4 of 7 lessons in, and your last two quizzes both lost points on sensitivity versus specificity, so that is the gap worth closing before you move on. After that, Unit 4 opens with pre-test probability, which builds directly on it.',
  },
  {
    q: 'Which unit is most important to master first?',
    a: 'Anatomy and physiology, without much competition. Every later unit in the Physician pathway assumes it — lab interpretation, diagnostic reasoning, even the clinical-hours reflections you write in your Portfolio. It is also the unit your shadowing hours make concrete, so doing them in parallel is cheaper than doing them in sequence.',
  },
  {
    q: "I'm stuck on a topic — can you help me understand it?",
    a: 'Sensitivity and specificity, going by your last quiz. Try it this way: a sensitive test rarely misses a sick person, so a NEGATIVE result from it is trustworthy — that is SnNout. A specific test rarely flags a healthy person, so a POSITIVE result from it is trustworthy — SpPin. Same two sentences, and every exam question on this is one of them in disguise.',
  },
];

const STEPS = [
  { id: 's1', label: 'Log your shadowing hours', why: 'Nine weeks of clinical exposure are sitting unlogged \u2014 they count for nothing until they are on the record.', cta: 'Open clinical hours', color: '#c21a3e' },
  { id: 's2', label: 'Write the impact line on your HOSA entry', why: 'It is the strongest thing on your r\u00e9sum\u00e9 and currently reads as a job title.', cta: 'Open activities', color: '#026b97' },
  { id: 's3', label: 'Add two more colleges to your list', why: 'Financial Aid needs a comparison, and aid is a comparison between schools rather than a single number.', cta: 'Open college list', color: '#6d31d4' },
];

const ACT_PARTS = [
  { id: 'time', label: 'Time committed', hint: '4 hrs/week logged for 24 weeks', points: 30 },
  { id: 'duration', label: 'Years sustained', hint: 'Two school years, not one summer', points: 15 },
  { id: 'description', label: 'Described', hint: 'What you actually did, in your words', points: 20 },
  { id: 'impact', label: 'Measurable impact', hint: 'A number a reader can check', points: 20 },
  { id: 'credibility', label: 'Role & evidence', hint: 'Named role, and someone who can confirm it', points: 15 },
];

const OPP_FILTERS = [
  { id: 'all', label: 'Everything' },
  { id: 'competition', label: 'Competitions' },
  { id: 'program', label: 'Programs' },
  { id: 'experience', label: 'Clinical & service' },
];

const OPPS = [
  { id: 'hosa', track: 'competition', name: 'HOSA competitive events season', org: 'HOSA \u2013 Future Health Professionals', why: 'Over a hundred events from Medical Terminology to Emergency Preparedness \u2014 placing at state is a line a general student cannot match.', chips: [{ label: 'Competition', color: '#a422b8' }, { label: 'Selective', color: '#905808' }, { label: '10 weeks prep', color: '#5d6b85' }] },
  { id: 'usabo', track: 'competition', name: 'USA Biology Olympiad', org: 'Center for Excellence in Education', why: 'The most recognizable biology credential open to a high-schooler. The real barrier is a teacher willing to register in September.', chips: [{ label: 'Competition', color: '#a422b8' }, { label: 'Very selective', color: '#c21a3e' }, { label: 'Free exam', color: '#067156' }] },
  { id: 'brainbee', track: 'competition', name: 'Brain Bee \u2014 local chapter round', org: 'International Brain Bee', why: 'A published study text and a small enough field that a motivated freshman can win a local round in one winter.', chips: [{ label: 'Competition', color: '#a422b8' }, { label: 'Free', color: '#067156' }, { label: 'Find the date', color: '#6d31d4' }] },
  { id: 'isef', track: 'program', name: 'Regional science fair \u2014 ISEF qualifying round', org: 'Society for Science affiliated fairs', why: 'The path to the largest pre-college science competition runs entirely through your regional fair, which closes in mid-winter.', chips: [{ label: 'Program', color: '#4640c9' }, { label: 'Immersive', color: '#c21a3e' }, { label: '24 weeks prep', color: '#5d6b85' }] },
  { id: 'volunteer', track: 'experience', name: 'Hospital volunteer intake', org: 'Your nearest teaching hospital', why: 'Intakes run once or twice a year and close early. Miss the autumn window and clinical hours wait until spring.', chips: [{ label: 'Experience', color: '#0b7166' }, { label: 'Open to you', color: '#067156' }, { label: 'Find the date', color: '#6d31d4' }] },
  { id: 'cna', track: 'experience', name: 'CNA or EMT certification course', org: 'District CTE or local ambulance service', why: 'Some districts run CNA as a no-cost CTE course, and some services train EMTs free in exchange for service hours.', chips: [{ label: 'Experience', color: '#0b7166' }, { label: 'Cost varies', color: '#905808' }] },
  { id: 'sciolympiad', track: 'program', name: 'Science Olympiad \u2014 regional tournament', org: 'Science Olympiad, Inc.', why: 'Anatomy & Physiology, Disease Detectives and Forensics are squarely pre-health, and teams form in September.', chips: [{ label: 'Program', color: '#4640c9' }, { label: 'Heavy', color: '#905808' }, { label: 'Team', color: '#5d6b85' }] },
];

const INTERVIEWS = [
  { kind: 'Traditional', q: 'Why medicine, and why not the twenty other ways to help people?', sample: 'Two shifts on the oncology floor, one sentence about what changed \u2014 then the thing you did afterwards that proves it.',
    score: 7.4, verdict: 'Solid',
    rubric: [ { label: 'Grounded in real experience', pct: 86, note: 'Named a specific shift and what you did in it' }, { label: 'Motivation examined', pct: 71, note: 'Gets past \u201cI want to help people\u201d, but only just' }, { label: 'Overclaiming', pct: 58, note: 'You describe a decision that was the nurse\u2019s, not yours' } ] },
  { kind: 'MMI station', q: 'A friend asks you to lie to a teacher to cover for them. What do you do?', sample: 'State the competing interests before you pick one \u2014 MMI scores the reasoning, not the verdict.',
    score: 6.2, verdict: 'Competent but forgettable',
    rubric: [ { label: 'Both sides named', pct: 74, note: 'Loyalty and honesty both appear' }, { label: 'A decision, made', pct: 62, note: 'You land it, but late' }, { label: 'Consequences followed', pct: 48, note: 'No mention of what happens to your friend afterwards' } ] },
  { kind: 'CASPer style', q: 'Describe a time you failed at something that mattered.', sample: 'The failure has to be real, and the reflection has to cost you something.',
    score: 8.3, verdict: 'Strong',
    rubric: [ { label: 'A real failure', pct: 91, note: 'Not a disguised success' }, { label: 'Own share of it', pct: 84, note: 'You name your own decisions' }, { label: 'What changed after', pct: 77, note: 'Concrete change, one term later' } ] },
];

const URGENCY = {
  critical: { label: 'This week', color: '#c21a3e' },
  'start-now': { label: 'Start now', color: '#905808' },
  soon: { label: 'Coming up', color: '#026b97' },
  later: { label: 'Later', color: '#5d6b85' },
  undated: { label: 'Find the date', color: '#6d31d4' },
  settled: { label: 'Done', color: '#067156' },
};

const ROADMAP = [
  { name: 'Hospital volunteer intake closes', org: 'Teaching hospital, local', urgency: 'critical', trackLabel: 'Experience', color: '#0b7166', date: 'Sep 15 \u2014 confirmed', month: 'Sep', load: 40, prep: 'No lead time', why: 'Intakes run once or twice a year. Miss this one and your clinical hours start in spring instead of autumn.', steps: ['Call the volunteer office rather than emailing \u2014 they answer', 'Ask for the pre-health placement specifically', 'Two-step background check; start it the same week'] },
  { name: 'Science Olympiad team tryouts', org: 'Science Olympiad, Inc.', urgency: 'start-now', trackLabel: 'Competition', color: '#a422b8', date: 'Late Sep \u2014 typical window', month: 'Sep', load: 62, prep: '16 weeks of prep', why: 'Twenty-three events, several of them squarely health science, with a real team and a real season. Events are claimed fast.', steps: ['Join the school team in September \u2014 tryouts are early', 'Take Anatomy & Physiology or Disease Detectives if you are pre-health', 'Event topics rotate annually and are published before the season'] },
  { name: 'USA Biology Olympiad \u2014 registration closes', org: 'Center for Excellence in Education', urgency: 'start-now', trackLabel: 'Competition', color: '#4640c9', date: 'Jan 31 \u2014 typical', month: 'Nov', load: 78, prep: '14 weeks of prep', why: 'The Open Exam is taken at your own school in February, so the only real barrier is a teacher willing to register \u2014 which is why the registration deadline matters far more than the exam date.', steps: ['A teacher must register the school \u2014 ask in September, not January', 'Campbell Biology is the de facto syllabus', 'Open Exam in February; semifinalists sit a second round in March'] },
  { name: 'HOSA regional round', org: 'HOSA \u2013 Future Health Professionals', urgency: 'soon', trackLabel: 'Competition', color: '#905808', date: 'Jan \u2014 window, chapter-set', month: 'Jan', load: 84, prep: '10 weeks of prep', why: 'The most accessible route to a health-specific competitive credential, and regionals qualify for state.', steps: ['Pick your event by November; the study guides are published and specific', 'Regional qualifies for state, state qualifies for the ILC in June', 'You compete through your chapter, not individually'] },
  { name: 'Brain Bee \u2014 local chapter round', org: 'International Brain Bee', urgency: 'undated', trackLabel: 'Competition', color: '#6d31d4', date: 'Jan\u2013Mar \u2014 chapter decides', month: 'Feb', load: 55, prep: '8 weeks of prep', why: 'A neuroscience competition with a free study text and a small field \u2014 one of the highest ratios of credential to effort available to a ninth-grader.', steps: ['Find your nearest chapter \u2014 they are hosted by universities and hospitals', 'The official study material is Brain Facts, free from the Society for Neuroscience', 'Local winners advance to the national competition'] },
  { name: 'Regional science fair \u2014 ISEF qualifier', org: 'Society for Science affiliated fairs', urgency: 'soon', trackLabel: 'Program', color: '#1a5fcc', date: 'Feb\u2013Mar \u2014 registration Jan 15', month: 'Mar', load: 90, prep: '24 weeks of prep', why: 'Any human or vertebrate subject work needs approval BEFORE you start, not after \u2014 which is why this sits on your autumn, not your spring.', steps: ['Find your regional affiliated fair in October and read its rules', 'Get subject-research approval before any data collection', 'Regional winners advance to state and then ISEF'] },
  { name: 'Summer program applications open', org: 'University pre-health programs', urgency: 'soon', trackLabel: 'Program', color: '#026b97', date: 'Mar 1 \u2014 typical', month: 'Apr', load: 70, prep: '6 weeks of prep', why: 'Most competitive summer programs close in February and March for a June start, and nearly all want a teacher recommendation.', steps: ['Shortlist by January so recommenders get three weeks, not three days', 'Check residency and cost \u2014 several are free and pay a stipend', 'Apply to a spread, not only the two everyone names'] },
  { name: 'Recommender ask window', org: 'Your teachers', urgency: 'later', trackLabel: 'Relationships', color: '#067156', date: 'May \u2014 before finals', month: 'May', load: 48, prep: '2 weeks of prep', why: 'Ask before summer, not in September. A letter written from memory in October is a weaker letter than one written while the class is still fresh.', steps: ['Ask in person, then send your r\u00e9sum\u00e9 and two specifics they can use', 'Two academic, one from clinical or service work', 'Give them the deadline and a nudge date'] },
];

const SEASONS = [
  { label: 'Autumn build-up', span: 'Sep \u2013 Nov', color: '#0b7166' },
  { label: 'Winter proving', span: 'Dec \u2013 Feb', color: '#026b97' },
  { label: 'Spring push', span: 'Mar \u2013 May', color: '#905808' },
  { label: 'Summer depth', span: 'Jun \u2013 Aug', color: '#a422b8' },
];

const PLAN_DAYS = [
  { short: 'Mon', label: 'Monday', meta: '70 minutes \u00b7 light day before your shift', note: 'Short on purpose \u2014 you volunteer Monday evenings, and a plan that ignores your calendar is a plan you abandon.',
    rows: [ { id: 'm1', label: 'Physician \u00b7 Lesson 4: Reading a CBC and a metabolic panel', meta: '25m', color: '#1a5fcc' }, { id: 'm2', label: 'Flashcards \u2014 12 due, lab values weighted', meta: '15m', color: '#6d31d4' }, { id: 'm3', label: 'Log Monday shadowing hours before you forget them', meta: '5m', color: '#0b7166' }, { id: 'm4', label: 'HOSA event study block \u2014 Medical Terminology', meta: '25m', color: '#905808' } ] },
  { short: 'Tue', label: 'Tuesday', meta: '85 minutes \u00b7 your heaviest study day', note: 'Tuesday carries the quiz because your accuracy is measurably higher on days you have not been on your feet for six hours.',
    rows: [ { id: 't1', label: 'Physician \u00b7 Lesson 5: Pre-test probability', meta: '30m', color: '#1a5fcc' }, { id: 't2', label: 'Quiz: lab values & diagnostic testing', meta: '20m', color: '#067156' }, { id: 't3', label: 'Review the two you missed with Medabrain', meta: '10m', color: '#a422b8' }, { id: 't4', label: 'Draft the impact line on your HOSA activity', meta: '25m', color: '#026b97' } ] },
  { short: 'Wed', label: 'Wednesday', meta: '60 minutes \u00b7 application block', note: 'Wednesdays are for the Portfolio. Study alone does not get you in, and a r\u00e9sum\u00e9 you touch twice a year rots.',
    rows: [ { id: 'w1', label: 'Flashcards \u2014 9 due', meta: '10m', color: '#6d31d4' }, { id: 'w2', label: 'Add two colleges to your list', meta: '20m', color: '#026b97' }, { id: 'w3', label: 'Ask Dr. Alvarez for a letter \u2014 draft the message', meta: '15m', color: '#067156' }, { id: 'w4', label: 'Science Olympiad event study \u2014 Anatomy', meta: '15m', color: '#a422b8' } ] },
  { short: 'Thu', label: 'Thursday', meta: '75 minutes \u00b7 back to the pathway', note: 'Medabrain rewrote Thursday after you logged two clinical shifts \u2014 the r\u00e9sum\u00e9 block moved and the flashcard load dropped.',
    rows: [ { id: 'h1', label: 'Physician \u00b7 Lesson 6: Diagnostic reasoning traps', meta: '30m', color: '#1a5fcc' }, { id: 'h2', label: 'Flashcards \u2014 14 due', meta: '15m', color: '#6d31d4' }, { id: 'h3', label: 'Quiz: Psych & Soc \u2014 mental health', meta: '20m', color: '#067156' }, { id: 'h4', label: 'USABO registration \u2014 email your bio teacher', meta: '10m', color: '#4640c9' } ] },
  { short: 'Fri', label: 'Friday', meta: '45 minutes \u00b7 clear the week', note: 'Friday is deliberately small. A plan with no slack breaks the first week something goes wrong.',
    rows: [ { id: 'f1', label: 'Flashcards \u2014 whatever is due', meta: '15m', color: '#6d31d4' }, { id: 'f2', label: 'Verify Lesson 4 \u2014 prove you kept it', meta: '15m', color: '#067156' }, { id: 'f3', label: 'Interview Prep \u2014 one MMI station', meta: '15m', color: '#c21a3e' } ] },
  { short: 'Sat', label: 'Saturday', meta: '90 minutes \u00b7 the long block', note: 'The only slot in your week long enough for research and essay work, so that is what it holds.',
    rows: [ { id: 'a1', label: 'Science fair project \u2014 method section', meta: '45m', color: '#4640c9' }, { id: 'a2', label: 'Personal statement \u2014 free-write on the oncology shift', meta: '30m', color: '#026b97' }, { id: 'a3', label: 'Flashcards \u2014 8 due', meta: '15m', color: '#6d31d4' } ] },
  { short: 'Sun', label: 'Sunday', meta: '30 minutes \u00b7 review and reset', note: 'Sunday closes the loop: what you actually did feeds next week, which is why the plan keeps fitting.',
    rows: [ { id: 'u1', label: 'Weekly review with Medabrain', meta: '15m', color: '#a422b8' }, { id: 'u2', label: 'Set next week\u2019s three goals', meta: '10m', color: '#067156' }, { id: 'u3', label: 'Check the Roadmap for anything that needs starting', meta: '5m', color: '#6d31d4' } ] },
];

const FAQS = [
  { q: 'Is it actually free?', a: 'Yes. Every pillar on this page \u2014 the Prep module, the Portfolio, the Roadmap, Plans, Medabrain \u2014 is free, and nothing is behind a paywall. We are in open beta, which is the honest version of that sentence: things ship fast, some surfaces are newer than others, and your account is not a trial that ends.' },
  { q: 'What year should I start?', a: 'Ninth grade is the cheapest year to start, because the Roadmap is built from your circumstances rather than your record \u2014 a freshman who sees their year in September still has every hospital intake, science-fair registration and summer deadline in front of them. Juniors and seniors get the application half of the product opened immediately instead of earning it.' },
  { q: 'Do I have to pick a career now?', a: 'No. \u201cStill exploring\u201d is one of the ten pathways, with its own curriculum, and the diagnostic is designed to be retaken as your interests sharpen. Sampling physician content, nursing content and research content is a strategy, not indecision.' },
  { q: 'What is Medabrain, exactly?', a: 'The coach that runs through all four pillars. It reads the lesson you are inside, the quizzes you have taken, the notes and highlights you have written, the hours you have logged and the colleges on your list \u2014 and it writes your plan, explains your misses, reads your r\u00e9sum\u00e9 and maps your year. Same memory everywhere, a different specialist in each pillar.' },
  { q: 'Can my parents see how I am doing?', a: 'Only if you invite them. Family Access is a separate parent view with its own account, its own summary and a message thread \u2014 and it shows what you choose to share rather than everything you do.' },
];

const FEATURES = [
  { pillar: 'Prep', color: '#6d31d4', items: ['Pathway diagnostic', 'Ten full curricula', 'Quiz Library', 'Flashcards on FSRS', 'E-Library', 'Lesson audio', 'Notes & highlights', 'Verified mastery'] },
  { pillar: 'Portfolio', color: '#067156', items: ['Overview', 'Opportunities', 'Activities & r\u00e9sum\u00e9', 'Academics', 'Clinical hours', 'Research', 'Skills & certs', 'Interview prep', 'Recommenders', 'Essays', 'College list', 'Admissions calc', 'Financial aid', 'Scholarships', 'Common App export', 'Milestones'] },
  { pillar: 'Roadmap', color: '#a422b8', items: ['Overview', 'Your Year', 'Seasons', 'Everything', 'Your Answers', 'Deadline catalog', 'Prep-time scheduling'] },
  { pillar: 'Plans & Progress', color: '#905808', items: ['Day-by-day plan', 'Pace goals', 'Daily quests', 'Streaks', 'Achievements', 'Performance breakdown', 'Family Access', 'Appearance & accessibility'] },
];

class LandingPageV2Class extends React.Component {
  state = {
    heroTab: 'home', rotate: true,
    pfTab: 'overview', stepsDone: {}, tracked: {}, oppFilter: 'all',
    actParts: { time: true, duration: true }, ivIndex: 0, ivScored: false,
    rmView: 'path', rmIndex: 1,
    planDay: 3, planDone: { h1: true },
    faqOpen: 0,
    prepTab: 'diagnostic',
    diagIndex: 0, diagScores: {}, diagDone: false,
    quizIndex: 0, quizPick: null, quizChecked: false, quizRight: 0, quizDone: 0,
    coachMsgs: [], coachBusy: false,
  };

  componentDidMount() {
    this.timer = setInterval(() => {
      if (!this.state.rotate) return;
      const i = PILLARS.findIndex((p) => p.id === this.state.heroTab);
      this.setState({ heroTab: PILLARS[(i + 1) % PILLARS.length].id });
    }, 5200);
    this.observe();
  }

  componentDidUpdate() { this.observe(); }

  componentWillUnmount() {
    clearInterval(this.timer);
    clearInterval(window.__mspSweep);
    clearTimeout(this.coachTimer);
    if (this.sweep) {
      window.removeEventListener('scroll', this.sweep, { capture: true });
      window.removeEventListener('resize', this.sweep);
    }
  }

  observe() {
    if (this.sweepVersion !== 3) {
      if (this.sweep) {
        window.removeEventListener('scroll', this.sweep, { capture: true });
        window.removeEventListener('resize', this.sweep);
      }
      clearInterval(window.__mspSweep);
      this.sweepVersion = 3;
      this.sweep = () => {
        const h = window.innerHeight || 800;
        const cta = document.getElementById('msp-float-cta');
        if (cta) {
          const on = (window.scrollY || 0) > 720;
          cta.style.opacity = on ? '1' : '0';
          cta.style.transform = on ? 'none' : 'translateY(16px)';
          cta.style.pointerEvents = on ? 'auto' : 'none';
        }
        document.querySelectorAll('[data-reveal]').forEach((el) => {
          if (el.style.opacity === '1') return;
          const r = el.getBoundingClientRect();
          if (r.top < h * 0.92 && r.bottom > -80) {
            el.style.opacity = '1';
            el.style.transform = 'none';
          }
        });
      };
      window.addEventListener('scroll', this.sweep, { passive: true, capture: true });
      window.addEventListener('resize', this.sweep, { passive: true });
      window.__mspSweep = setInterval(this.sweep, 250);
    }
    requestAnimationFrame(this.sweep);
  }

  pickHero = (id) => { this.setState({ heroTab: id, rotate: false }); };

  pickDiag = (opt) => {
    const scores = { ...this.state.diagScores };
    Object.keys(opt.w).forEach((k) => { scores[k] = (scores[k] || 0) + opt.w[k]; });
    const next = this.state.diagIndex + 1;
    this.setState({ diagScores: scores, diagIndex: next, diagDone: next >= DIAG.length });
  };

  resetDiag = () => this.setState({ diagIndex: 0, diagScores: {}, diagDone: false });

  pickQuiz = (i) => { if (!this.state.quizChecked) this.setState({ quizPick: i }); };

  checkQuiz = () => { if (this.state.quizPick != null) this.setState({ quizChecked: true }); };

  nextQuiz = () => this.setState({
    quizIndex: (this.state.quizIndex + 1) % QUIZ.length,
    quizPick: null, quizChecked: false,
    quizDone: this.state.quizDone + 1,
    quizRight: this.state.quizRight + (this.state.quizPick === QUIZ[this.state.quizIndex].answer ? 1 : 0),
  });

  askCoach = (q) => {
    if (this.state.coachBusy) return;
    const hit = COACH.find((c) => c.q === q) || COACH[0];
    this.setState({ coachMsgs: [...this.state.coachMsgs, { role: 'user', text: q }], coachBusy: true });
    clearTimeout(this.coachTimer);
    this.coachTimer = setTimeout(() => {
      this.setState((s) => ({ coachMsgs: [...s.coachMsgs, { role: 'ai', text: hit.a }], coachBusy: false }));
    }, 1150);
  };

  resetCoach = () => this.setState({ coachMsgs: [], coachBusy: false });

  toggleStep = (id) => {
    const done = { ...this.state.stepsDone };
    done[id] = !done[id];
    this.setState({ stepsDone: done });
  };

  toggleTrack = (id) => {
    const t = { ...this.state.tracked };
    t[id] = !t[id];
    this.setState({ tracked: t });
  };

  toggleActPart = (id) => {
    const p = { ...this.state.actParts };
    p[id] = !p[id];
    this.setState({ actParts: p });
  };

  togglePlanRow = (id) => {
    const p = { ...this.state.planDone };
    p[id] = !p[id];
    this.setState({ planDone: p });
  };

  portfolioVals() {
    const s = this.state;
    const tabs = [
      { id: 'overview', label: 'Overview', color: '#067156' },
      { id: 'opportunities', label: 'Opportunities', color: '#0b7166' },
      { id: 'resume', label: 'Activities & r\u00e9sum\u00e9', color: '#026b97' },
      { id: 'interview', label: 'Interview prep', color: '#c21a3e' },
    ];
    const stepsDoneCount = STEPS.filter((st) => s.stepsDone[st.id]).length;
    const strength = 41 + stepsDoneCount * 16;
    const actScore = ACT_PARTS.reduce((n, p) => n + (s.actParts[p.id] ? p.points : 0), 0);
    const actVerdict = actScore >= 78 ? { label: 'Reads strong', color: '#067156' }
      : actScore >= 55 ? { label: 'Solid, underwritten', color: '#026b97' }
      : actScore >= 32 ? { label: 'Thin as written', color: '#905808' }
      : { label: 'Barely an entry', color: '#c21a3e' };
    const iv = INTERVIEWS[s.ivIndex];
    return {
      pfTabs: tabs.map((t) => {
        const on = t.id === s.pfTab;
        return {
          label: t.label,
          pick: () => this.setState({ pfTab: t.id }),
          style: `display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-family:inherit;font-size:13px;font-weight:${on ? 700 : 600};padding:10px 16px;border-radius:999px;`
            + `background:${on ? `color-mix(in srgb, ${t.color} 13%, transparent)` : 'rgba(255,255,255,0.55)'};`
            + `border:1px solid ${on ? `color-mix(in srgb, ${t.color} 30%, transparent)` : 'rgba(15,23,42,0.11)'};`
            + `color:${on ? t.color : '#45536b'};transition:background-color .18s ease, border-color .18s ease, color .18s ease, box-shadow .18s ease, transform .18s ease, opacity .18s ease;`,
          dot: `width:7px;height:7px;border-radius:50%;background:${on ? t.color : 'rgba(15,23,42,0.22)'};`,
        };
      }),
      pfIsOverview: s.pfTab === 'overview',
      pfIsOpps: s.pfTab === 'opportunities',
      pfIsResume: s.pfTab === 'resume',
      pfIsInterview: s.pfTab === 'interview',

      steps: STEPS.map((st, i) => {
        const done = !!s.stepsDone[st.id];
        return {
          label: st.label,
          why: st.why,
          cta: done ? 'Done' : st.cta,
          badge: i === 0 && !done ? 'Do this first' : '',
          showBadge: i === 0 && !done,
          toggle: () => this.toggleStep(st.id),
          badgeStyle: `font-size:9.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#c21a3e;background:rgba(194,26,62,0.12);padding:3px 8px;border-radius:999px;`,
          style: `display:flex;align-items:flex-start;gap:13px;width:100%;text-align:left;font-family:inherit;cursor:pointer;padding:15px 17px;border-radius:13px;`
            + `background:${done ? 'rgba(6,113,86,0.08)' : 'rgba(255,255,255,0.75)'};border:1px solid ${done ? 'rgba(6,113,86,0.26)' : 'rgba(15,23,42,0.11)'};`
            + `border-left:3px solid ${done ? '#067156' : st.color};transition:background-color .2s ease, border-color .2s ease, color .2s ease, box-shadow .2s ease, transform .2s ease, opacity .2s ease;`,
          check: `width:26px;height:26px;flex-shrink:0;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;font-size:13px;color:${done ? '#fff' : st.color};`
            + `background:${done ? '#067156' : `color-mix(in srgb, ${st.color} 14%, transparent)`};border:1px solid ${done ? '#067156' : `color-mix(in srgb, ${st.color} 26%, transparent)`};`,
          mark: done ? '\u2713' : '\u2192',
          titleStyle: `font-size:15px;font-weight:800;font-family:'Bricolage Grotesque',sans-serif;color:#1f2836;text-decoration:${done ? 'line-through' : 'none'};`,
        };
      }),
      strengthPct: `${strength}%`,
      strengthArc: `stroke-dashoffset:${Math.round(226 - (226 * strength) / 100)};`,
      strengthLabel: strength >= 85 ? 'Reads like a serious applicant' : strength >= 60 ? 'Building, with visible gaps' : 'Early \u2014 the record is thin',
      stepsLeft: `${STEPS.length - stepsDoneCount} of ${STEPS.length} still waiting on you`,

      oppFilters: OPP_FILTERS.map((f) => {
        const on = f.id === s.oppFilter;
        return {
          label: f.label,
          pick: () => this.setState({ oppFilter: f.id }),
          style: `cursor:pointer;font-family:inherit;font-size:12px;font-weight:${on ? 700 : 600};padding:8px 14px;border-radius:999px;`
            + `background:${on ? 'rgba(11,113,102,0.13)' : 'rgba(255,255,255,0.6)'};border:1px solid ${on ? 'rgba(11,113,102,0.3)' : 'rgba(15,23,42,0.11)'};`
            + `color:${on ? '#0b7166' : '#45536b'};transition:background-color .16s ease, border-color .16s ease, color .16s ease, box-shadow .16s ease, transform .16s ease, opacity .16s ease;`,
        };
      }),
      opps: OPPS.filter((o) => s.oppFilter === 'all' || o.track === s.oppFilter).map((o) => {
        const on = !!s.tracked[o.id];
        return {
          name: o.name,
          org: o.org,
          why: o.why,
          trackLabel: on ? 'Tracked \u2713' : 'Track it',
          toggle: () => this.toggleTrack(o.id),
          trackStyle: `flex-shrink:0;cursor:pointer;font-family:inherit;font-size:12px;font-weight:700;padding:9px 15px;border-radius:10px;`
            + `background:${on ? '#0b7166' : 'rgba(255,255,255,0.85)'};color:${on ? '#fff' : '#0b7166'};border:1px solid ${on ? '#0b7166' : 'rgba(11,113,102,0.34)'};transition:background-color .18s ease, border-color .18s ease, color .18s ease, box-shadow .18s ease, transform .18s ease, opacity .18s ease;`,
          chips: o.chips.map((c) => ({
            label: c.label,
            style: `font-size:10.5px;font-weight:700;padding:3px 9px;border-radius:999px;color:${c.color};background:color-mix(in srgb, ${c.color} 12%, transparent);border:1px solid color-mix(in srgb, ${c.color} 24%, transparent);`,
          })),
        };
      }),
      trackedCount: `${Object.keys(s.tracked).filter((k) => s.tracked[k]).length} tracked`,

      actParts: ACT_PARTS.map((p) => {
        const on = !!s.actParts[p.id];
        return {
          label: p.label,
          hint: p.hint,
          points: `${on ? p.points : 0}/${p.points}`,
          toggle: () => this.toggleActPart(p.id),
          style: `display:flex;align-items:center;gap:12px;width:100%;text-align:left;font-family:inherit;cursor:pointer;padding:12px 14px;border-radius:11px;`
            + `background:${on ? 'rgba(2,107,151,0.08)' : 'rgba(255,255,255,0.72)'};border:1px solid ${on ? 'rgba(2,107,151,0.28)' : 'rgba(15,23,42,0.11)'};transition:background-color .18s ease, border-color .18s ease, color .18s ease, box-shadow .18s ease, transform .18s ease, opacity .18s ease;`,
          box: `width:20px;height:20px;flex-shrink:0;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;color:#fff;`
            + `background:${on ? '#026b97' : 'transparent'};border:1px solid ${on ? '#026b97' : 'rgba(15,23,42,0.22)'};`,
          mark: on ? '\u2713' : '',
        };
      }),
      actScore: String(actScore),
      actBar: `width:100%;transform:scaleX(${(actScore) / 100});transform-origin:left;height:100%;border-radius:99px;background:${actVerdict.color};transition:transform .5s cubic-bezier(.16,1,.3,1);`,
      actVerdict: actVerdict.label,
      actVerdictStyle: `display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:800;padding:6px 13px;border-radius:999px;color:${actVerdict.color};background:color-mix(in srgb, ${actVerdict.color} 12%, transparent);border:1px solid color-mix(in srgb, ${actVerdict.color} 26%, transparent);`,

      ivList: INTERVIEWS.map((q, i) => {
        const on = i === s.ivIndex;
        return {
          label: q.q,
          kind: q.kind,
          pick: () => this.setState({ ivIndex: i, ivScored: false }),
          style: `display:flex;flex-direction:column;gap:5px;width:100%;text-align:left;font-family:inherit;cursor:pointer;padding:13px 15px;border-radius:12px;`
            + `background:${on ? 'rgba(194,26,62,0.08)' : 'rgba(255,255,255,0.72)'};border:1px solid ${on ? 'rgba(194,26,62,0.28)' : 'rgba(15,23,42,0.11)'};transition:background-color .18s ease, border-color .18s ease, color .18s ease, box-shadow .18s ease, transform .18s ease, opacity .18s ease;`,
          kindStyle: `font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:${on ? '#c21a3e' : '#6d798d'};`,
        };
      }),
      ivPrompt: iv.q,
      ivSample: iv.sample,
      ivScored: s.ivScored,
      ivNotScored: !s.ivScored,
      scoreIv: () => this.setState({ ivScored: true }),
      resetIv: () => this.setState({ ivScored: false }),
      ivScore: iv.score.toFixed(1),
      ivVerdict: iv.verdict,
      ivRubric: iv.rubric.map((r) => ({
        label: r.label,
        note: r.note,
        pct: `${r.pct}%`,
        bar: `width:100%;transform:scaleX(${(r.pct) / 100});transform-origin:left;height:100%;border-radius:99px;background:${r.pct >= 75 ? '#067156' : r.pct >= 55 ? '#905808' : '#c21a3e'};transition:transform .7s cubic-bezier(.16,1,.3,1);`,
      })),
    };
  }

  roadmapVals() {
    const s = this.state;
    const views = [
      { id: 'path', label: 'Path', blurb: 'Your year as a road you walk up' },
      { id: 'line', label: 'Line', blurb: 'The year to scale, with its heavy stretches' },
      { id: 'list', label: 'In order', blurb: 'Every event, in sequence' },
    ];
    const sel = ROADMAP[s.rmIndex];
    return {
      rmViews: views.map((v) => {
        const on = v.id === s.rmView;
        return {
          label: v.label,
          blurb: v.blurb,
          pick: () => this.setState({ rmView: v.id }),
          style: `display:flex;flex-direction:column;gap:3px;text-align:left;cursor:pointer;font-family:inherit;padding:11px 15px;border-radius:12px;`
            + `background:${on ? 'rgba(109,49,212,0.1)' : 'rgba(255,255,255,0.6)'};border:1px solid ${on ? 'rgba(109,49,212,0.3)' : 'rgba(15,23,42,0.11)'};transition:background-color .18s ease, border-color .18s ease, color .18s ease, box-shadow .18s ease, transform .18s ease, opacity .18s ease;`,
          labelStyle: `font-size:13px;font-weight:700;color:${on ? '#6d31d4' : '#1f2836'};`,
        };
      }),
      rmIsPath: s.rmView === 'path',
      rmIsLine: s.rmView === 'line',
      rmIsList: s.rmView === 'list',
      rmItems: ROADMAP.map((it, i) => {
        const on = i === s.rmIndex;
        const u = URGENCY[it.urgency];
        return {
          name: it.name,
          org: it.org,
          date: it.date,
          pick: () => this.setState({ rmIndex: i }),
          urgency: u.label,
          urgencyStyle: `display:inline-flex;align-items:center;gap:5px;font-size:9.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;padding:3px 8px;border-radius:999px;color:${u.color};background:color-mix(in srgb, ${u.color} 14%, transparent);`,
          trackChip: it.trackLabel,
          trackStyle: `font-size:10px;font-weight:700;padding:3px 8px;border-radius:999px;color:${it.color};background:color-mix(in srgb, ${it.color} 12%, transparent);border:1px solid color-mix(in srgb, ${it.color} 24%, transparent);`,
          cardStyle: `flex-shrink:0;width:266px;text-align:left;font-family:inherit;cursor:pointer;padding:16px;border-radius:15px;`
            + `background:${on ? '#ffffff' : 'rgba(255,255,255,0.66)'};border:1px solid ${on ? `color-mix(in srgb, ${it.color} 42%, transparent)` : 'rgba(15,23,42,0.11)'};`
            + `box-shadow:${on ? '0 14px 30px -14px rgba(15,23,42,0.28)' : 'none'};transform:translateY(${on ? '-4px' : '0'});transition:background-color .22s cubic-bezier(.16,1,.3,1), border-color .22s cubic-bezier(.16,1,.3,1), color .22s cubic-bezier(.16,1,.3,1), box-shadow .22s cubic-bezier(.16,1,.3,1), transform .22s cubic-bezier(.16,1,.3,1), opacity .22s cubic-bezier(.16,1,.3,1);`,
          nodeStyle: `width:${on ? 16 : 11}px;height:${on ? 16 : 11}px;border-radius:50%;background:${it.color};box-shadow:0 0 0 ${on ? 5 : 0}px color-mix(in srgb, ${it.color} 18%, transparent);transition:background-color .22s ease, border-color .22s ease, color .22s ease, box-shadow .22s ease, transform .22s ease, opacity .22s ease;`,
          rowStyle: `display:flex;align-items:center;gap:12px;width:100%;text-align:left;font-family:inherit;cursor:pointer;padding:13px 15px;border-radius:12px;`
            + `background:${on ? '#ffffff' : 'rgba(255,255,255,0.6)'};border:1px solid ${on ? `color-mix(in srgb, ${it.color} 38%, transparent)` : 'rgba(15,23,42,0.09)'};transition:background-color .18s ease, border-color .18s ease, color .18s ease, box-shadow .18s ease, transform .18s ease, opacity .18s ease;`,
          month: it.month,
          barStyle: `width:${it.load}%;height:8px;border-radius:99px;background:${it.color};opacity:${on ? 1 : 0.55};transition:background-color .22s ease, border-color .22s ease, color .22s ease, box-shadow .22s ease, transform .22s ease, opacity .22s ease;`,
        };
      }),
      rmSel: {
        name: sel.name, org: sel.org, why: sel.why, date: sel.date,
        prep: sel.prep, first: sel.steps[0],
      },
      rmSelSteps: sel.steps.map((t) => ({ text: t })),
      rmSelVaries: sel.urgency === 'undated',
      rmSelColor: `width:34px;height:34px;border-radius:11px;flex-shrink:0;background:linear-gradient(135deg,${sel.color},color-mix(in srgb,${sel.color} 60%, #6d31d4));`,
      rmScrollLeft: () => this.nudgeSpine(-320),
      rmScrollRight: () => this.nudgeSpine(320),
      spineRef: (el) => {
        this.spine = el;
        if (!el || el.__dragBound) return;
        el.__dragBound = true;
        let down = false; let startX = 0; let startLeft = 0; let moved = 0;
        el.addEventListener('pointerdown', (e) => {
          if (e.pointerType === 'touch') return;
          down = true; moved = 0; startX = e.clientX; startLeft = el.scrollLeft;
          el.style.cursor = 'grabbing';
        });
        el.addEventListener('pointermove', (e) => {
          if (!down) return;
          const dx = e.clientX - startX;
          moved = Math.abs(dx);
          if (moved > 4) e.preventDefault();
          el.scrollLeft = startLeft - dx;
        });
        const end = () => { down = false; el.style.cursor = 'grab'; };
        el.addEventListener('pointerup', end);
        el.addEventListener('pointerleave', end);
        el.addEventListener('click', (e) => { if (moved > 6) { e.preventDefault(); e.stopPropagation(); } }, true);
      },
      rmSeasons: SEASONS.map((x) => ({ label: x.label, span: x.span, style: `font-size:11px;font-weight:700;color:${x.color};background:color-mix(in srgb, ${x.color} 11%, transparent);border:1px solid color-mix(in srgb, ${x.color} 22%, transparent);padding:6px 12px;border-radius:999px;` })),
    };
  }

  nudgeSpine(dx) { if (this.spine) this.spine.scrollBy({ left: dx, behavior: 'smooth' }); }

  planVals() {
    const s = this.state;
    const day = PLAN_DAYS[s.planDay];
    const rows = day.rows;
    const doneCount = rows.filter((r) => s.planDone[r.id]).length;
    const pct = Math.round((doneCount / rows.length) * 100);
    return {
      planDays: PLAN_DAYS.map((d, i) => {
        const on = i === s.planDay;
        return {
          label: d.short,
          pick: () => this.setState({ planDay: i }),
          style: `width:44px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:${on ? 700 : 600};padding:9px 0;border-radius:11px;`
            + `background:${on ? 'rgba(144,88,8,0.13)' : 'rgba(255,255,255,0.6)'};border:1px solid ${on ? 'rgba(144,88,8,0.32)' : 'rgba(15,23,42,0.09)'};`
            + `color:${on ? '#905808' : '#5d6b85'};transition:background-color .16s ease, border-color .16s ease, color .16s ease, box-shadow .16s ease, transform .16s ease, opacity .16s ease;`,
        };
      }),
      planDayLabel: day.label,
      planDayMeta: day.meta,
      planPct: `${pct}%`,
      planArc: `stroke-dashoffset:${Math.round(226 - (226 * pct) / 100)};`,
      planRows: rows.map((r) => {
        const done = !!s.planDone[r.id];
        return {
          label: r.label,
          meta: r.meta,
          toggle: () => this.togglePlanRow(r.id),
          style: `display:flex;align-items:center;gap:13px;width:100%;text-align:left;font-family:inherit;cursor:pointer;padding:14px 16px;border-radius:13px;`
            + `background:${done ? 'rgba(6,113,86,0.07)' : 'rgba(255,255,255,0.76)'};border:1px solid ${done ? 'rgba(6,113,86,0.24)' : 'rgba(15,23,42,0.11)'};transition:background-color .2s ease, border-color .2s ease, color .2s ease, box-shadow .2s ease, transform .2s ease, opacity .2s ease;`,
          box: `width:22px;height:22px;flex-shrink:0;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:12px;color:#fff;`
            + `background:${done ? '#067156' : 'transparent'};border:1px solid ${done ? '#067156' : `color-mix(in srgb, ${r.color} 40%, transparent)`};`,
          mark: done ? '\u2713' : '',
          text: `flex:1;min-width:0;font-size:14.5px;line-height:1.45;color:${done ? '#6d798d' : '#1f2836'};text-decoration:${done ? 'line-through' : 'none'};`,
          metaStyle: `font-family:'JetBrains Mono',monospace;font-size:11.5px;color:${r.color};flex-shrink:0;`,
        };
      }),
      planNote: day.note,
    };
  }

  faqVals() {
    return {
      faqs: FAQS.map((f, i) => {
        const on = this.state.faqOpen === i;
        return {
          q: f.q,
          a: f.a,
          toggle: () => this.setState({ faqOpen: on ? -1 : i }),
          open: on,
          style: `display:flex;align-items:center;gap:14px;width:100%;text-align:left;font-family:inherit;cursor:pointer;padding:18px 20px;border:none;background:transparent;`,
          qStyle: `flex:1;font-size:16px;font-weight:700;font-family:'Bricolage Grotesque',sans-serif;color:#1f2836;`,
          sign: on ? '\u2212' : '+',
          signStyle: `width:26px;height:26px;flex-shrink:0;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;font-size:15px;color:#1a5fcc;background:rgba(26,95,204,0.1);border:1px solid rgba(26,95,204,0.22);`,
          bodyStyle: `overflow:hidden;max-height:${on ? 260 : 0}px;opacity:${on ? 1 : 0};transition:opacity .3s ease, transform .3s cubic-bezier(.16,1,.3,1);`,
        };
      }),
      featureGroups: FEATURES.map((g) => ({
        pillar: g.pillar,
        color: g.color,
        headStyle: `font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:${g.color};`,
        items: g.items.map((label) => ({ label, dot: `width:5px;height:5px;border-radius:50%;flex-shrink:0;background:${g.color};` })),
      })),
    };
  }

  prepVals() {
    const s = this.state;
    const q = DIAG[Math.min(s.diagIndex, DIAG.length - 1)];
    const ranked = Object.keys(PATHWAYS)
      .map((id) => ({ id, score: s.diagScores[id] || 0 }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
    const top = ranked[0] ? ranked[0].score : 1;
    const quiz = QUIZ[s.quizIndex];
    return {
      prepTab: s.prepTab,
      prepIsDiag: s.prepTab === 'diagnostic',
      prepIsQuiz: s.prepTab === 'quizzes',
      prepIsCoach: s.prepTab === 'coach',
      prepTabs: [
        { id: 'diagnostic', label: 'Diagnostic pathways', color: '#6d31d4' },
        { id: 'quizzes', label: 'Quiz library', color: '#067156' },
        { id: 'coach', label: 'Medabrain', color: '#a422b8' },
      ].map((t) => {
        const on = t.id === s.prepTab;
        return {
          label: t.label,
          pick: () => this.setState({ prepTab: t.id }),
          style: `display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-family:inherit;font-size:13px;font-weight:${on ? 700 : 600};padding:10px 16px;border-radius:999px;`
            + `background:${on ? `color-mix(in srgb, ${t.color} 13%, transparent)` : 'rgba(255,255,255,0.55)'};`
            + `border:1px solid ${on ? `color-mix(in srgb, ${t.color} 30%, transparent)` : 'rgba(15,23,42,0.11)'};`
            + `color:${on ? t.color : '#45536b'};transition:background-color .18s ease, border-color .18s ease, color .18s ease, box-shadow .18s ease, transform .18s ease, opacity .18s ease;`,
          dot: `width:7px;height:7px;border-radius:50%;background:${on ? t.color : 'rgba(15,23,42,0.22)'};`,
        };
      }),
      diagPrompt: q.q,
      diagKind: q.type === 'scenario' ? 'Scenario' : 'Work style',
      diagStep: `Question ${Math.min(s.diagIndex + 1, DIAG.length)} of ${DIAG.length}`,
      diagBar: `width:100%;transform:scaleX(${(((s.diagDone ? DIAG.length : s.diagIndex) / DIAG.length) * 100) / 100});transform-origin:left;height:100%;border-radius:99px;background:linear-gradient(90deg,#6d31d4,#a422b8);transition:transform .5s cubic-bezier(.16,1,.3,1);`,
      diagDone: s.diagDone,
      diagNotDone: !s.diagDone,
      quizNotChecked: !s.quizChecked,
      coachHasMsgs: s.coachMsgs.length > 0,
      diagOptions: q.ch.map((o) => ({ text: o.text, pick: () => this.pickDiag(o) })),
      diagResults: ranked.map((r, i) => ({
        label: PATHWAYS[r.id].label,
        pct: `${Math.round((r.score / top) * (i === 0 ? 94 : 88))}%`,
        bar: `width:100%;transform:scaleX(${(Math.round((r.score / top) * (i === 0 ? 94 : 88))) / 100});transform-origin:left;height:100%;border-radius:99px;background:${PATHWAYS[r.id].color};transition:transform .8s cubic-bezier(.16,1,.3,1);`,
        chip: `font-size:9.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;padding:3px 8px;border-radius:999px;color:${PATHWAYS[r.id].color};background:color-mix(in srgb, ${PATHWAYS[r.id].color} 13%, transparent);`,
        rank: i === 0 ? 'Best fit' : `#${i + 1}`,
        color: PATHWAYS[r.id].color,
      })),
      diagTopLabel: ranked[0] ? PATHWAYS[ranked[0].id].label : 'Physician (MD/DO)',
      diagTopBlurb: ranked[0] ? PATHWAYS[ranked[0].id].blurb : '',
      resetDiag: this.resetDiag,

      quizCat: quiz.cat,
      quizTopic: quiz.topic,
      quizPrompt: quiz.q,
      quizChecked: s.quizChecked,
      quizCorrect: s.quizChecked && s.quizPick === quiz.answer,
      quizVerdict: s.quizPick === quiz.answer ? 'Correct' : 'Not quite',
      quizVerdictStyle: s.quizPick === quiz.answer
        ? 'display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:800;color:#067156;background:rgba(6,113,86,0.12);border:1px solid rgba(6,113,86,0.26);padding:6px 12px;border-radius:999px;'
        : 'display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:800;color:#c21a3e;background:rgba(194,26,62,0.12);border:1px solid rgba(194,26,62,0.26);padding:6px 12px;border-radius:999px;',
      quizExplain: quiz.why,
      quizScore: `${s.quizRight}/${s.quizDone}`,
      quizChoices: quiz.ch.map((text, i) => {
        const picked = s.quizPick === i;
        const right = i === quiz.answer;
        let bg = 'rgba(255,255,255,0.72)'; let bd = 'rgba(15,23,42,0.11)'; let col = '#1f2836';
        if (s.quizChecked && right) { bg = 'rgba(6,113,86,0.12)'; bd = 'rgba(6,113,86,0.4)'; col = '#055d46'; }
        else if (s.quizChecked && picked) { bg = 'rgba(194,26,62,0.1)'; bd = 'rgba(194,26,62,0.36)'; col = '#9f1533'; }
        else if (picked) { bg = 'rgba(26,95,204,0.1)'; bd = 'rgba(26,95,204,0.36)'; }
        return {
          text,
          pick: () => this.pickQuiz(i),
          mark: String.fromCharCode(65 + i),
          markStyle: `width:24px;height:24px;flex-shrink:0;border-radius:7px;display:inline-flex;align-items:center;justify-content:center;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;color:${col};background:${picked || (s.quizChecked && right) ? 'rgba(255,255,255,0.85)' : 'rgba(15,23,42,0.05)'};border:1px solid ${bd};`,
          style: `display:flex;align-items:flex-start;gap:11px;width:100%;text-align:left;cursor:${s.quizChecked ? 'default' : 'pointer'};font-family:inherit;font-size:14px;line-height:1.5;color:${col};padding:13px 15px;border-radius:12px;background:${bg};border:1px solid ${bd};transition:background-color .16s ease, border-color .16s ease, color .16s ease, box-shadow .16s ease, transform .16s ease, opacity .16s ease;`,
        };
      }),
      checkQuiz: this.checkQuiz,
      nextQuiz: this.nextQuiz,
      quizCanCheck: s.quizPick != null && !s.quizChecked,
      quizCheckStyle: `display:inline-flex;align-items:center;gap:8px;font-family:inherit;font-size:14px;font-weight:700;padding:12px 20px;border-radius:12px;border:none;color:#fff;background:${s.quizPick != null ? 'linear-gradient(135deg,#067156,#055d46)' : 'rgba(15,23,42,0.18)'};cursor:${s.quizPick != null ? 'pointer' : 'default'};`,

      coachMsgs: s.coachMsgs.map((m) => ({
        text: m.text,
        wrap: `display:flex;justify-content:${m.role === 'user' ? 'flex-end' : 'flex-start'};`,
        bubble: m.role === 'user'
          ? "max-width:82%;background:rgba(109,49,212,0.13);border:1px solid rgba(109,49,212,0.28);border-radius:14px 14px 3px 14px;padding:11px 14px;font-size:13.5px;line-height:1.55;color:#1f2836;"
          : "max-width:88%;background:rgba(255,255,255,0.82);border:1px solid rgba(15,23,42,0.11);border-radius:14px 14px 14px 3px;padding:12px 15px;font-size:13.5px;line-height:1.65;color:#1f2836;",
      })),
      coachBusy: s.coachBusy,
      coachEmpty: s.coachMsgs.length === 0,
      coachSuggestions: COACH.map((c) => ({ text: c.q, ask: () => this.askCoach(c.q) })),
      resetCoach: this.resetCoach,
    };
  }

  renderVals() {
    const tab = this.state.heroTab;
    const active = PILLARS.find((p) => p.id === tab) || PILLARS[0];
    const dot = (c) => `width:7px;height:7px;border-radius:50%;flex-shrink:0;background:${c};`;
    return {
      ...this.prepVals(),
      ...this.portfolioVals(),
      ...this.roadmapVals(),
      ...this.planVals(),
      ...this.faqVals(),
      signupUrl: this.props.signupUrl ?? 'https://medschoolprep.cloud/signup',
      loginUrl: this.props.loginUrl ?? 'https://medschoolprep.cloud/login',
      heroPaneTitle: active.title,
      heroIsHome: tab === 'home',
      heroIsPrep: tab === 'prep',
      heroIsPortfolio: tab === 'portfolio',
      heroIsRoadmap: tab === 'roadmap',
      heroIsPlans: tab === 'plans',
      heroNav: PILLARS.map((p) => {
        const on = p.id === tab;
        return {
          label: p.label,
          pick: () => this.pickHero(p.id),
          dotStyle: dot(on ? p.color : 'rgba(15,23,42,0.22)'),
          style: `display:flex;align-items:center;gap:8px;width:100%;text-align:left;cursor:pointer;font-family:inherit;padding:6px 8px;border-radius:8px;margin-bottom:3px;font-size:9.5px;font-weight:${on ? 700 : 500};`
            + `background:${on ? `color-mix(in srgb, ${p.color} 12%, transparent)` : 'transparent'};`
            + `border:1px solid ${on ? `color-mix(in srgb, ${p.color} 26%, transparent)` : 'transparent'};`
            + `color:${on ? p.color : '#5d6b85'};transition:background .2s ease,color .2s ease;`,
        };
      }),
      heroToday: [
        { label: 'Review 15 due flashcards', done: true, color: '#6d31d4' },
        { label: 'Physician pathway \u2014 Lesson 4', done: true, color: '#1a5fcc' },
        { label: 'Bio & Biochem quiz \u2014 Lab values', done: false, color: '#067156' },
        { label: "Log Tuesday's shadowing hours", done: false, color: '#0b7166' },
      ].map((r) => ({
        label: r.label,
        dot: `width:12px;height:12px;border-radius:50%;flex-shrink:0;border:1px solid color-mix(in srgb, ${r.color} 34%, transparent);background:${r.done ? `color-mix(in srgb, ${r.color} 26%, transparent)` : 'transparent'};`,
        text: `font-size:9.5px;color:${r.done ? '#6d798d' : '#1f2836'};text-decoration:${r.done ? 'line-through' : 'none'};`,
      })),
      heroPlanRows: [
        { label: 'Physician \u00b7 Lesson 5: Pre-test probability', mins: '25m', color: '#1a5fcc' },
        { label: 'Flashcards \u2014 12 due, lab values weighted', mins: '15m', color: '#6d31d4' },
        { label: 'Quiz: lab values & diagnostic testing', mins: '20m', color: '#067156' },
        { label: 'HOSA event study block', mins: '15m', color: '#905808' },
      ].map((r) => ({ label: r.label, mins: r.mins, dot: `width:8px;height:8px;border-radius:50%;flex-shrink:0;background:${r.color};` })),
      marquee: (() => {
        const items = [
          ['10 health pathways', '#1a5fcc'], ['Pathway diagnostic', '#6d31d4'], ['Quiz Library', '#067156'],
          ['Medabrain coach', '#a422b8'], ['Flashcards with FSRS', '#4640c9'], ['E-Library', '#0a6c84'],
          ['Opportunities database', '#0b7166'], ['Activities & r\u00e9sum\u00e9', '#026b97'], ['Interview prep', '#c21a3e'],
          ['Twelve-month Roadmap', '#905808'], ['Day-by-day Plans', '#865d05'], ['Common App export', '#1a5fcc'],
          ['Scholarships', '#067156'], ['Family access', '#6d31d4'],
        ];
        return [...items, ...items].map(([label, c], i) => ({ key: i, label, dot: `width:5px;height:5px;border-radius:50%;background:${c};` }));
      })(),
    };
  }

  render() {
    // `renderVals()` is the design's own template contract; the two click
    // handlers are this app's addition, so that a CTA is both a real link (it
    // has an href) and a client-side navigation (it does not reload the bundle).
    const v = {
      ...this.renderVals(),
      onLoginClick: this.props.onLoginClick,
      onSignupClick: this.props.onSignupClick,
      parentsUrl: this.props.parentsUrl,
      onParentsClick: this.props.onParentsClick,
      termsUrl: this.props.termsUrl,
      onTermsClick: this.props.onTermsClick,
      privacyUrl: this.props.privacyUrl,
      onPrivacyClick: this.props.onPrivacyClick,
    };
    return (
      <div className="mspv2-root">
        <style>{V2_STYLES}</style>
        <div style={css("min-height: 100vh; background:\n    radial-gradient(ellipse 75% 60% at 72% -8%, rgba(29,102,219,0.10) 0%, transparent 62%),\n    radial-gradient(ellipse 60% 50% at 2% 12%, rgba(109,49,212,0.06) 0%, transparent 58%),\n    #dfe3ea;")}>
          {' '}
          <header style={css("position: sticky; top: 0; z-index: 40; min-height: 68px; border-bottom: 1px solid rgba(15,23,42,0.11); background: rgba(223,227,234,0.86); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);")}>
            {' '}
            <div style={css("max-width: 1360px; margin: 0 auto; padding: 10px clamp(18px,4.5vw,56px); min-height: 68px; display: flex; align-items: center; gap: 18px; flex-wrap: wrap;")}>
              {' '}
              <a href="#top" style={css("display: flex; align-items: center; gap: 10px;")}>
                {' '}
                <img src="/logo-mark.png" alt="MedSchoolPrep" style={css("width: 30px; height: 30px;")} />
                {' '}
                <span style={css("font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800; font-size: 16px; letter-spacing: -0.02em; color: #1f2836;")}>
                  {"MedSchoolPrep"}
                </span>
                {' '}
                <span style={css("font-family: 'JetBrains Mono', monospace; font-size: 9.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #6d31d4; background: rgba(109,49,212,0.1); border: 1px solid rgba(109,49,212,0.22); border-radius: 999px; padding: 3px 7px;")}>
                  {"Beta"}
                </span>
                {' '}
              </a>
              {' '}
              <nav style={css("margin-left: 6px; display: flex; align-items: center; gap: clamp(12px,2vw,26px); flex-wrap: wrap;")}>
                {' '}
                <a href="#prep" style={css("font-size: 13.5px; font-weight: 600; color: #45536b;")}>
                  {"Prep"}
                </a>
                {' '}
                <a href="#portfolio" style={css("font-size: 13.5px; font-weight: 600; color: #45536b;")}>
                  {"Portfolio"}
                </a>
                {' '}
                <a href="#roadmap" style={css("font-size: 13.5px; font-weight: 600; color: #45536b;")}>
                  {"Roadmap"}
                </a>
                {' '}
                <a href="#plans" style={css("font-size: 13.5px; font-weight: 600; color: #45536b;")}>
                  {"Plans"}
                </a>
                {' '}
                <a href="#everything" style={css("font-size: 13.5px; font-weight: 600; color: #45536b;")}>
                  {"Everything else"}
                </a>
                {' '}
              </nav>
              {' '}
              <div style={css("margin-left: auto; display: flex; align-items: center; gap: 12px;")}>
                {' '}
                {/* The header is the first thing anyone sees, whichever door they came in
                    through — so a parent deciding whether this is worth their kid's time
                    gets a way to their own page from the very first screen, not a 13px
                    link buried in the footer. Styled identically to "Log in" (same shared
                    style object, not a new literal — see NAV_PILL_STYLE) so it reads as a
                    sibling nav action rather than a competing accent. */}
                <a className="mspv2-hover-1" href={v.parentsUrl} onClick={v.onParentsClick} style={NAV_PILL_STYLE}>
                  {"For parents"}
                </a>
                {' '}
                <a className="mspv2-hover-1" href={v.loginUrl} onClick={v.onLoginClick} style={NAV_PILL_STYLE}>
                  {"Log in"}
                </a>
                {' '}
                <a className="mspv2-hover-2" href={v.signupUrl} onClick={v.onSignupClick} style={css("display: inline-flex; align-items: center; gap: 8px; font-size: 13.5px; font-weight: 700; color: #ffffff; background: linear-gradient(135deg,#1a5fcc 0%,#154ea7 100%); border-radius: 11px; padding: 11px 18px; box-shadow: 0 6px 18px rgba(26,95,204,0.28);")}>
                  {"Get started free\n          "}
                  <span style={css("font-size: 15px; line-height: 1;")}>
                    {"→"}
                  </span>
                  {' '}
                </a>
                {' '}
              </div>
              {' '}
            </div>
            {' '}
          </header>
          {' '}
          <section id="top" style={css("max-width: 1360px; margin: 0 auto; padding: clamp(28px,5vh,64px) clamp(18px,4.5vw,56px) clamp(40px,6vh,80px);")}>
            {' '}
            <div style={css("display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 400px), 1fr)); gap: clamp(32px,4vw,64px); align-items: center;")}>
              {' '}
              <div>
                {' '}
                <div style={css("display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 999px; background: rgba(6,113,86,0.1); border: 1px solid rgba(6,113,86,0.24); color: #067156; font-size: 12px; font-weight: 700;")}>
                  {' '}
                  <span className="msp-anim mspv2-after-3" style={css("width: 7px; height: 7px; border-radius: 50%; background: #067156;")}></span>
                  {"\n          Free forever · nothing paywalled\n        "}
                </div>
                {' '}
                <h1 style={css("margin: 22px 0 0; font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800; letter-spacing: -0.035em; line-height: 1.02; font-size: clamp(40px,4.8vw,74px); color: #1f2836; text-wrap: balance;")}>
                  {"Find your path into medicine."}
                </h1>
                {' '}
                <p style={css("margin: 20px 0 0; max-width: 52ch; font-size: clamp(16px,1.3vw,18.5px); line-height: 1.65; color: #45536b;")}>
                  {"Four things, one account: a "}
                  <b style={css("color: #1f2836; font-weight: 700;")}>
                    {"Prep module"}
                  </b>
                  {" that finds the health career that fits you and teaches it, a "}
                  <b style={css("color: #1f2836; font-weight: 700;")}>
                    {"Portfolio"}
                  </b>
                  {" that holds your whole application, a "}
                  <b style={css("color: #1f2836; font-weight: 700;")}>
                    {"Roadmap"}
                  </b>
                  {" of your next twelve months, and "}
                  <b style={css("color: #1f2836; font-weight: 700;")}>
                    {"Plans"}
                  </b>
                  {" that tells you what to do today. Medabrain, the coach, reads all four."}
                </p>
                {' '}
                <div style={css("margin-top: 30px; display: flex; align-items: center; gap: 14px; flex-wrap: wrap;")}>
                  {' '}
                  <a className="mspv2-hover-4" href={v.signupUrl} onClick={v.onSignupClick} style={css("display: inline-flex; align-items: center; gap: 9px; font-size: 15px; font-weight: 700; color: #ffffff; background: linear-gradient(135deg,#1a5fcc 0%,#154ea7 100%); border-radius: 13px; padding: 14px 24px; box-shadow: 0 10px 26px rgba(26,95,204,0.3);")}>
                    {"Start the diagnostic "}
                    <span style={css("font-size: 16px; line-height: 1;")}>
                      {"→"}
                    </span>
                  </a>
                  {' '}
                  <a className="mspv2-hover-5" href="#prep" style={css("display: inline-flex; align-items: center; gap: 9px; font-size: 15px; font-weight: 600; color: #1f2836; background: rgba(255,255,255,0.7); border: 1px solid rgba(15,23,42,0.17); border-radius: 13px; padding: 14px 22px;")}>
                    {"Try it right here, no account"}
                  </a>
                  {' '}
                </div>
                {' '}
                <p style={css("margin-top: 15px; font-size: 13px; color: #5d6b85;")}>
                  {"Under a minute to join · in open beta · every feature below is live on this page"}
                </p>
                {' '}
              </div>
              {' '}
              <div style={css("position: relative;")}>
                {' '}
                <div style={css("position: absolute; inset: -6% -4% -10% -4%; background: radial-gradient(ellipse at 60% 30%, rgba(26,95,204,0.16), transparent 62%); filter: blur(28px);")}></div>
                {' '}
                <div style={css("position: relative; border-radius: 20px; overflow: hidden; border: 1px solid rgba(15,23,42,0.17); background: #eff3f9; box-shadow: 0 28px 70px -28px rgba(15,23,42,0.35), 0 2px 6px rgba(15,23,42,0.06);")}>
                  {' '}
                  <div style={css("display: flex; height: 452px;")}>
                    {' '}
                    <div style={css("width: 148px; flex-shrink: 0; border-right: 1px solid rgba(15,23,42,0.11); background: #e7ebf1; padding: 12px 10px;")}>
                      {' '}
                      <div style={css("display: flex; align-items: center; gap: 7px; margin-bottom: 14px;")}>
                        {' '}
                        <img src="/logo-mark.png" alt="" style={css("width: 19px; height: 19px;")} />
                        {' '}
                        <div>
                          {' '}
                          <div style={css("font-size: 9px; font-weight: 800; font-family: 'Bricolage Grotesque', sans-serif; color: #1f2836;")}>
                            {"MedSchoolPrep"}
                          </div>
                          {' '}
                          <div style={css("font-size: 6.5px; color: #6d798d; letter-spacing: 0.1em; text-transform: uppercase;")}>
                            {"Your path into medicine"}
                          </div>
                          {' '}
                        </div>
                        {' '}
                      </div>
                      {' '}
                      {arr(v.heroNav).map((row, __k0) => (
                        <Fragment key={__k0}>
                          {' '}
                          <button onClick={row.pick} style={css(row.style)}>
                            {' '}
                            <span style={css(row.dotStyle)}></span>
                            {hole(row.label)}
                            {"\n                "}
                          </button>
                          {' '}
                        </Fragment>
                      ))}
                      {' '}
                      <div style={css("margin-top: 14px; padding: 9px; border-radius: 10px; background: rgba(255,255,255,0.6); border: 1px solid rgba(15,23,42,0.055);")}>
                        {' '}
                        <div style={css("font-size: 7px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #6d798d;")}>
                          {"Streak"}
                        </div>
                        {' '}
                        <div style={css("display: flex; align-items: baseline; gap: 4px; margin-top: 3px;")}>
                          {' '}
                          <span style={css("font-family: 'JetBrains Mono', monospace; font-size: 15px; font-weight: 700; color: #905808;")}>
                            {"12"}
                          </span>
                          {' '}
                          <span style={css("font-size: 7.5px; color: #6d798d;")}>
                            {"days"}
                          </span>
                          {' '}
                        </div>
                        {' '}
                      </div>
                      {' '}
                    </div>
                    {' '}
                    <div style={css("flex: 1; min-width: 0; padding: 13px; display: flex; flex-direction: column; gap: 9px; background: #eff3f9;")}>
                      {' '}
                      <div style={css("display: flex; align-items: center; justify-content: space-between; gap: 8px;")}>
                        {' '}
                        <div style={css("font-size: 12px; font-weight: 800; font-family: 'Bricolage Grotesque', sans-serif; letter-spacing: -0.02em; color: #1f2836;")}>
                          {hole(v.heroPaneTitle)}
                        </div>
                        {' '}
                        <div style={css("font-size: 7.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #6d798d;")}>
                          {"Live preview"}
                        </div>
                        {' '}
                      </div>
                      {' '}
                      {(v.heroIsHome) ? (
                        <Fragment>
                          {' '}
                          <div style={css("display: flex; flex-direction: column; gap: 9px;")}>
                            {' '}
                            <div style={css("padding: 11px; border-radius: 12px; background: linear-gradient(120deg, rgba(26,95,204,0.12), rgba(255,255,255,0.5) 65%); border: 1px solid rgba(26,95,204,0.24); display: flex; align-items: center; gap: 11px;")}>
                              {' '}
                              <svg viewBox="0 0 44 44" style={css("width: 44px; height: 44px; flex-shrink: 0;")}>
                                {' '}
                                <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(15,23,42,0.1)" strokeWidth="4"></circle>
                                {' '}
                                <circle cx="22" cy="22" r="18" fill="none" stroke="#1a5fcc" strokeWidth="4" strokeLinecap="round" strokeDasharray="113" strokeDashoffset="43" transform="rotate(-90 22 22)"></circle>
                                {' '}
                              </svg>
                              {' '}
                              <div>
                                {' '}
                                <div style={css("font-size: 8px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #154ea7;")}>
                                  {"Your pathway match"}
                                </div>
                                {' '}
                                <div style={css("font-size: 12px; font-weight: 800; font-family: 'Bricolage Grotesque', sans-serif; letter-spacing: -0.02em; margin-top: 2px; color: #1f2836;")}>
                                  {"Physician (MD/DO)"}
                                </div>
                                {' '}
                                <div style={css("font-size: 9.5px; color: #45536b; margin-top: 2px; line-height: 1.45;")}>
                                  {"Scored across all 10 pathways — this one fits you best."}
                                </div>
                                {' '}
                              </div>
                              {' '}
                            </div>
                            {' '}
                            <div style={css("display: grid; grid-template-columns: repeat(3,1fr); gap: 8px;")}>
                              {' '}
                              <div style={css("padding: 9px; border-radius: 10px; background: rgba(255,255,255,0.72); border: 1px solid rgba(15,23,42,0.11);")}>
                                {' '}
                                <div style={css("font-size: 7.5px; color: #6d798d;")}>
                                  {"Mastery"}
                                </div>
                                {' '}
                                <div style={css("font-family: 'JetBrains Mono', monospace; font-size: 15px; font-weight: 700; color: #067156; margin-top: 3px;")}>
                                  {"68%"}
                                </div>
                                {' '}
                              </div>
                              {' '}
                              <div style={css("padding: 9px; border-radius: 10px; background: rgba(255,255,255,0.72); border: 1px solid rgba(15,23,42,0.11);")}>
                                {' '}
                                <div style={css("font-size: 7.5px; color: #6d798d;")}>
                                  {"Due cards"}
                                </div>
                                {' '}
                                <div style={css("font-family: 'JetBrains Mono', monospace; font-size: 15px; font-weight: 700; color: #6d31d4; margin-top: 3px;")}>
                                  {"15"}
                                </div>
                                {' '}
                              </div>
                              {' '}
                              <div style={css("padding: 9px; border-radius: 10px; background: rgba(255,255,255,0.72); border: 1px solid rgba(15,23,42,0.11);")}>
                                {' '}
                                <div style={css("font-size: 7.5px; color: #6d798d;")}>
                                  {"Need starting"}
                                </div>
                                {' '}
                                <div style={css("font-family: 'JetBrains Mono', monospace; font-size: 15px; font-weight: 700; color: #905808; margin-top: 3px;")}>
                                  {"3"}
                                </div>
                                {' '}
                              </div>
                              {' '}
                            </div>
                            {' '}
                            <div style={css("padding: 11px; border-radius: 12px; background: linear-gradient(135deg, rgba(109,49,212,0.09), rgba(255,255,255,0.4) 70%); border: 1px solid rgba(109,49,212,0.24);")}>
                              {' '}
                              <div style={css("display: flex; align-items: center; gap: 7px;")}>
                                {' '}
                                <span style={css("font-size: 8.5px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: #6d31d4;")}>
                                  {"Roadmap · Autumn build-up"}
                                </span>
                                {' '}
                              </div>
                              {' '}
                              <div style={css("font-size: 11.5px; font-weight: 800; font-family: 'Bricolage Grotesque', sans-serif; color: #1f2836; margin-top: 5px;")}>
                                {"HOSA competitive events season"}
                              </div>
                              {' '}
                              <div style={css("font-size: 9.5px; color: #45536b; margin-top: 4px; line-height: 1.5;")}>
                                <b style={css("color: #1f2836;")}>
                                  {"First move: "}
                                </b>
                                {"Join your school chapter in the autumn — you compete through it, not individually"}
                              </div>
                              {' '}
                            </div>
                            {' '}
                            <div style={css("padding: 11px; border-radius: 12px; background: rgba(255,255,255,0.72); border: 1px solid rgba(15,23,42,0.11);")}>
                              {' '}
                              <div style={css("font-size: 8px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #6d798d; margin-bottom: 8px;")}>
                                {"Today"}
                              </div>
                              {' '}
                              {arr(v.heroToday).map((row, __k1) => (
                                <Fragment key={__k1}>
                                  {' '}
                                  <div style={css("display: flex; align-items: center; gap: 8px; margin-bottom: 7px;")}>
                                    {' '}
                                    <span style={css(row.dot)}></span>
                                    {' '}
                                    <span style={css(row.text)}>
                                      {hole(row.label)}
                                    </span>
                                    {' '}
                                  </div>
                                  {' '}
                                </Fragment>
                              ))}
                              {' '}
                            </div>
                            {' '}
                          </div>
                          {' '}
                        </Fragment>
                      ) : null}
                      {' '}
                      {(v.heroIsPrep) ? (
                        <Fragment>
                          {' '}
                          <div style={css("display: flex; flex-direction: column; gap: 9px;")}>
                            {' '}
                            <div style={css("display: flex; gap: 6px;")}>
                              {' '}
                              <span style={css("font-size: 8px; font-weight: 700; padding: 4px 9px; border-radius: 999px; background: rgba(109,49,212,0.12); color: #6d31d4; border: 1px solid rgba(109,49,212,0.24);")}>
                                {"Diagnostic"}
                              </span>
                              {' '}
                              <span style={css("font-size: 8px; font-weight: 700; padding: 4px 9px; border-radius: 999px; background: rgba(255,255,255,0.6); color: #5d6b85; border: 1px solid rgba(15,23,42,0.11);")}>
                                {"Pathway"}
                              </span>
                              {' '}
                              <span style={css("font-size: 8px; font-weight: 700; padding: 4px 9px; border-radius: 999px; background: rgba(255,255,255,0.6); color: #5d6b85; border: 1px solid rgba(15,23,42,0.11);")}>
                                {"Quiz Library"}
                              </span>
                              {' '}
                              <span style={css("font-size: 8px; font-weight: 700; padding: 4px 9px; border-radius: 999px; background: rgba(255,255,255,0.6); color: #5d6b85; border: 1px solid rgba(15,23,42,0.11);")}>
                                {"Flashcards"}
                              </span>
                              {' '}
                            </div>
                            {' '}
                            <div style={css("padding: 12px; border-radius: 12px; background: rgba(255,255,255,0.72); border: 1px solid rgba(15,23,42,0.11);")}>
                              {' '}
                              <div style={css("font-size: 10.5px; font-weight: 700; color: #1f2836; line-height: 1.5;")}>
                                {"Unit 3 · Reading a CBC and a metabolic panel"}
                              </div>
                              {' '}
                              <div style={css("height: 6px; border-radius: 99px; background: rgba(15,23,42,0.08); margin-top: 9px; overflow: hidden;")}>
                                {' '}
                                <div style={css("width: 62%; height: 100%; border-radius: 99px; background: linear-gradient(90deg,#1a5fcc,#0a6c84);")}></div>
                                {' '}
                              </div>
                              {' '}
                              <div style={css("display: flex; justify-content: space-between; margin-top: 6px; font-size: 8px; color: #6d798d;")}>
                                <span>
                                  {"4 of 7 lessons verified"}
                                </span>
                                <span style={css("font-family: 'JetBrains Mono', monospace;")}>
                                  {"62%"}
                                </span>
                              </div>
                              {' '}
                            </div>
                            {' '}
                            <div style={css("padding: 12px; border-radius: 12px; background: linear-gradient(120deg, rgba(109,49,212,0.1), rgba(255,255,255,0.45) 70%); border: 1px solid rgba(109,49,212,0.24);")}>
                              {' '}
                              <div style={css("display: flex; align-items: center; gap: 8px;")}>
                                {' '}
                                <span style={css("width: 22px; height: 22px; border-radius: 7px; background: linear-gradient(135deg,#6d31d4,#a422b8); display: inline-flex; align-items: center; justify-content: center; color: #fff; font-size: 10px; font-weight: 800;")}>
                                  {"M"}
                                </span>
                                {' '}
                                <span style={css("font-size: 10px; font-weight: 800; color: #1f2836; font-family: 'Bricolage Grotesque', sans-serif;")}>
                                  {"Medabrain"}
                                </span>
                                {' '}
                                <span style={css("font-size: 7.5px; color: #6d798d;")}>
                                  {"Lesson Helper"}
                                </span>
                                {' '}
                              </div>
                              {' '}
                              <div style={css("font-size: 9.5px; color: #45536b; line-height: 1.55; margin-top: 8px;")}>
                                {"“Sensitivity is about ruling things "}
                                <i>
                                  {"out"}
                                </i>
                                {". Here is the version of that sentence that will survive an exam question…”"}
                              </div>
                              {' '}
                            </div>
                            {' '}
                            <div style={css("display: grid; grid-template-columns: repeat(2,1fr); gap: 8px;")}>
                              {' '}
                              <div style={css("padding: 10px; border-radius: 10px; background: rgba(255,255,255,0.72); border: 1px solid rgba(15,23,42,0.11);")}>
                                {' '}
                                <div style={css("font-size: 7.5px; color: #6d798d;")}>
                                  {"Quiz accuracy"}
                                </div>
                                {' '}
                                <div style={css("font-family: 'JetBrains Mono', monospace; font-size: 14px; font-weight: 700; color: #067156; margin-top: 3px;")}>
                                  {"84%"}
                                </div>
                                {' '}
                              </div>
                              {' '}
                              <div style={css("padding: 10px; border-radius: 10px; background: rgba(255,255,255,0.72); border: 1px solid rgba(15,23,42,0.11);")}>
                                {' '}
                                <div style={css("font-size: 7.5px; color: #6d798d;")}>
                                  {"Weakest topic"}
                                </div>
                                {' '}
                                <div style={css("font-size: 9.5px; font-weight: 700; color: #c21a3e; margin-top: 4px;")}>
                                  {"Lab values"}
                                </div>
                                {' '}
                              </div>
                              {' '}
                            </div>
                            {' '}
                          </div>
                          {' '}
                        </Fragment>
                      ) : null}
                      {' '}
                      {(v.heroIsPortfolio) ? (
                        <Fragment>
                          {' '}
                          <div style={css("display: flex; flex-direction: column; gap: 9px;")}>
                            {' '}
                            <div style={css("padding: 12px; border-radius: 12px; background: linear-gradient(125deg, rgba(26,95,204,0.11), rgba(6,113,86,0.06) 58%, rgba(255,255,255,0.4)); border: 1px solid rgba(26,95,204,0.24);")}>
                              {' '}
                              <div style={css("font-size: 8px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #154ea7;")}>
                                {"Start here"}
                              </div>
                              {' '}
                              <div style={css("font-size: 12px; font-weight: 800; font-family: 'Bricolage Grotesque', sans-serif; color: #1f2836; margin-top: 3px;")}>
                                {"Here’s what to do next"}
                              </div>
                              {' '}
                              <div style={css("font-size: 9.5px; color: #45536b; margin-top: 4px; line-height: 1.5;")}>
                                {"Pick the top one. Everything further down this page is just detail on how it’s going."}
                              </div>
                              {' '}
                            </div>
                            {' '}
                            <div style={css("padding: 11px; border-radius: 11px; background: rgba(255,255,255,0.72); border: 1px solid rgba(15,23,42,0.11); border-left: 3px solid #c21a3e;")}>
                              {' '}
                              <div style={css("display: flex; align-items: center; gap: 7px;")}>
                                {' '}
                                <span style={css("font-size: 10.5px; font-weight: 800; color: #1f2836; font-family: 'Bricolage Grotesque', sans-serif;")}>
                                  {"Log your shadowing hours"}
                                </span>
                                {' '}
                                <span style={css("font-size: 7.5px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: #c21a3e; background: rgba(194,26,62,0.12); padding: 2px 6px; border-radius: 999px;")}>
                                  {"Do this first"}
                                </span>
                                {' '}
                              </div>
                              {' '}
                              <div style={css("font-size: 9px; color: #5d6b85; margin-top: 4px; line-height: 1.5;")}>
                                {"Nine weeks of clinical exposure are sitting unlogged — they count for nothing until they are on the record."}
                              </div>
                              {' '}
                            </div>
                            {' '}
                            <div style={css("display: grid; grid-template-columns: repeat(3,1fr); gap: 8px;")}>
                              {' '}
                              <div style={css("padding: 9px; border-radius: 10px; background: rgba(255,255,255,0.72); border: 1px solid rgba(15,23,42,0.11);")}>
                                {' '}
                                <div style={css("font-size: 7.5px; color: #6d798d;")}>
                                  {"Activities"}
                                </div>
                                {' '}
                                <div style={css("font-family: 'JetBrains Mono', monospace; font-size: 14px; font-weight: 700; color: #1a5fcc; margin-top: 3px;")}>
                                  {"11"}
                                </div>
                                {' '}
                              </div>
                              {' '}
                              <div style={css("padding: 9px; border-radius: 10px; background: rgba(255,255,255,0.72); border: 1px solid rgba(15,23,42,0.11);")}>
                                {' '}
                                <div style={css("font-size: 7.5px; color: #6d798d;")}>
                                  {"Clinical hrs"}
                                </div>
                                {' '}
                                <div style={css("font-family: 'JetBrains Mono', monospace; font-size: 14px; font-weight: 700; color: #0b7166; margin-top: 3px;")}>
                                  {"96"}
                                </div>
                                {' '}
                              </div>
                              {' '}
                              <div style={css("padding: 9px; border-radius: 10px; background: rgba(255,255,255,0.72); border: 1px solid rgba(15,23,42,0.11);")}>
                                {' '}
                                <div style={css("font-size: 7.5px; color: #6d798d;")}>
                                  {"Colleges"}
                                </div>
                                {' '}
                                <div style={css("font-family: 'JetBrains Mono', monospace; font-size: 14px; font-weight: 700; color: #6d31d4; margin-top: 3px;")}>
                                  {"8"}
                                </div>
                                {' '}
                              </div>
                              {' '}
                            </div>
                            {' '}
                            <div style={css("padding: 11px; border-radius: 11px; background: rgba(255,255,255,0.72); border: 1px solid rgba(15,23,42,0.11);")}>
                              {' '}
                              <div style={css("font-size: 8px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #6d798d; margin-bottom: 8px;")}>
                                {"This week’s goals"}
                              </div>
                              {' '}
                              <div style={css("display: flex; flex-direction: column; gap: 7px;")}>
                                {' '}
                                <div style={css("display: flex; align-items: center; justify-content: space-between; gap: 8px;")}>
                                  <span style={css("font-size: 9.5px; color: #1f2836;")}>
                                    {"Two clinical shifts logged"}
                                  </span>
                                  <span style={css("font-family: 'JetBrains Mono', monospace; font-size: 9px; color: #067156;")}>
                                    {"2/2"}
                                  </span>
                                </div>
                                {' '}
                                <div style={css("display: flex; align-items: center; justify-content: space-between; gap: 8px;")}>
                                  <span style={css("font-size: 9.5px; color: #1f2836;")}>
                                    {"Draft the Common App activity list"}
                                  </span>
                                  <span style={css("font-family: 'JetBrains Mono', monospace; font-size: 9px; color: #905808;")}>
                                    {"1/3"}
                                  </span>
                                </div>
                                {' '}
                                <div style={css("display: flex; align-items: center; justify-content: space-between; gap: 8px;")}>
                                  <span style={css("font-size: 9.5px; color: #1f2836;")}>
                                    {"Ask Dr. Alvarez for a letter"}
                                  </span>
                                  <span style={css("font-family: 'JetBrains Mono', monospace; font-size: 9px; color: #6d798d;")}>
                                    {"0/1"}
                                  </span>
                                </div>
                                {' '}
                              </div>
                              {' '}
                            </div>
                            {' '}
                          </div>
                          {' '}
                        </Fragment>
                      ) : null}
                      {' '}
                      {(v.heroIsRoadmap) ? (
                        <Fragment>
                          {' '}
                          <div style={css("display: flex; flex-direction: column; gap: 9px;")}>
                            {' '}
                            <div style={css("display: flex; gap: 6px; flex-wrap: wrap;")}>
                              {' '}
                              <span style={css("font-size: 8px; font-weight: 700; padding: 4px 9px; border-radius: 999px; background: rgba(109,49,212,0.12); color: #6d31d4; border: 1px solid rgba(109,49,212,0.24);")}>
                                {"Overview"}
                              </span>
                              {' '}
                              <span style={css("font-size: 8px; font-weight: 700; padding: 4px 9px; border-radius: 999px; background: rgba(255,255,255,0.6); color: #5d6b85; border: 1px solid rgba(15,23,42,0.11);")}>
                                {"Your Year"}
                              </span>
                              {' '}
                              <span style={css("font-size: 8px; font-weight: 700; padding: 4px 9px; border-radius: 999px; background: rgba(255,255,255,0.6); color: #5d6b85; border: 1px solid rgba(15,23,42,0.11);")}>
                                {"Seasons"}
                              </span>
                              {' '}
                              <span style={css("font-size: 8px; font-weight: 700; padding: 4px 9px; border-radius: 999px; background: rgba(255,255,255,0.6); color: #5d6b85; border: 1px solid rgba(15,23,42,0.11);")}>
                                {"Everything"}
                              </span>
                              {' '}
                            </div>
                            {' '}
                            <div style={css("position: relative; padding: 12px; border-radius: 12px; background: rgba(255,255,255,0.72); border: 1px solid rgba(15,23,42,0.11); overflow: hidden;")}>
                              {' '}
                              <svg viewBox="0 0 300 120" style={css("width: 100%; height: 118px; display: block;")}>
                                {' '}
                                <path d="M6 104 C 60 104, 62 62, 106 62 S 168 24, 214 24 S 276 12, 294 12" fill="none" stroke="rgba(15,23,42,0.1)" strokeWidth="8" strokeLinecap="round"></path>
                                {' '}
                                <path className="msp-anim" d="M6 104 C 60 104, 62 62, 106 62 S 168 24, 214 24 S 276 12, 294 12" fill="none" stroke="url(#msp-hero-grad)" strokeWidth="3" strokeLinecap="round" strokeDasharray="420" strokeDashoffset="420" style={css("animation: msp-dash 2.6s 0.4s ease-out forwards;")}></path>
                                {' '}
                                <defs>
                                  {' '}
                                  <linearGradient id="msp-hero-grad" x1="0" y1="1" x2="1" y2="0">
                                    {' '}
                                    <stop offset="0" stopColor="#0b7166"></stop>
                                    {' '}
                                    <stop offset="0.55" stopColor="#1a5fcc"></stop>
                                    {' '}
                                    <stop offset="1" stopColor="#6d31d4"></stop>
                                    {' '}
                                  </linearGradient>
                                  {' '}
                                </defs>
                                {' '}
                                <circle cx="6" cy="104" r="5" fill="#067156"></circle>
                                {' '}
                                <circle cx="106" cy="62" r="6" fill="#905808"></circle>
                                {' '}
                                <circle cx="214" cy="24" r="5" fill="#1a5fcc"></circle>
                                {' '}
                                <circle cx="294" cy="12" r="5" fill="#6d31d4"></circle>
                                {' '}
                              </svg>
                              {' '}
                              <div style={css("display: flex; justify-content: space-between; font-size: 7.5px; color: #6d798d; font-family: 'JetBrains Mono', monospace;")}>
                                <span>
                                  {"Sep"}
                                </span>
                                <span>
                                  {"Dec"}
                                </span>
                                <span>
                                  {"Mar"}
                                </span>
                                <span>
                                  {"Jun"}
                                </span>
                              </div>
                              {' '}
                            </div>
                            {' '}
                            <div style={css("padding: 11px; border-radius: 11px; background: rgba(144,88,8,0.08); border: 1px solid rgba(144,88,8,0.24);")}>
                              {' '}
                              <div style={css("display: flex; align-items: center; gap: 6px;")}>
                                {' '}
                                <span style={css("font-size: 7.5px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: #905808; background: rgba(144,88,8,0.14); padding: 2px 7px; border-radius: 999px;")}>
                                  {"Start now"}
                                </span>
                                {' '}
                                <span style={css("font-size: 8px; color: #6d798d; font-family: 'JetBrains Mono', monospace;")}>
                                  {"10 weeks of prep"}
                                </span>
                                {' '}
                              </div>
                              {' '}
                              <div style={css("font-size: 11px; font-weight: 800; font-family: 'Bricolage Grotesque', sans-serif; color: #1f2836; margin-top: 6px;")}>
                                {"USA Biology Olympiad — registration closes"}
                              </div>
                              {' '}
                              <div style={css("font-size: 9px; color: #45536b; margin-top: 4px; line-height: 1.5;")}>
                                {"A teacher must register the school — ask in September, not January."}
                              </div>
                              {' '}
                            </div>
                            {' '}
                          </div>
                          {' '}
                        </Fragment>
                      ) : null}
                      {' '}
                      {(v.heroIsPlans) ? (
                        <Fragment>
                          {' '}
                          <div style={css("display: flex; flex-direction: column; gap: 9px;")}>
                            {' '}
                            <div style={css("padding: 12px; border-radius: 12px; background: linear-gradient(120deg, rgba(144,88,8,0.1), rgba(255,255,255,0.45) 70%); border: 1px solid rgba(144,88,8,0.24); display: flex; align-items: center; gap: 11px;")}>
                              {' '}
                              <svg viewBox="0 0 44 44" style={css("width: 44px; height: 44px; flex-shrink: 0;")}>
                                {' '}
                                <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(15,23,42,0.1)" strokeWidth="4"></circle>
                                {' '}
                                <circle cx="22" cy="22" r="18" fill="none" stroke="#905808" strokeWidth="4" strokeLinecap="round" strokeDasharray="113" strokeDashoffset="34" transform="rotate(-90 22 22)"></circle>
                                {' '}
                              </svg>
                              {' '}
                              <div>
                                {' '}
                                <div style={css("font-size: 8px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #905808;")}>
                                  {"Week 6 of your plan"}
                                </div>
                                {' '}
                                <div style={css("font-size: 11.5px; font-weight: 800; font-family: 'Bricolage Grotesque', sans-serif; color: #1f2836; margin-top: 2px;")}>
                                  {"On pace — 4 of 6 days cleared"}
                                </div>
                                {' '}
                              </div>
                              {' '}
                            </div>
                            {' '}
                            <div style={css("padding: 11px; border-radius: 12px; background: rgba(255,255,255,0.72); border: 1px solid rgba(15,23,42,0.11);")}>
                              {' '}
                              <div style={css("font-size: 8px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #6d798d; margin-bottom: 8px;")}>
                                {"Thursday · 75 minutes"}
                              </div>
                              {' '}
                              {arr(v.heroPlanRows).map((row, __k2) => (
                                <Fragment key={__k2}>
                                  {' '}
                                  <div style={css("display: flex; align-items: center; gap: 8px; margin-bottom: 8px;")}>
                                    {' '}
                                    <span style={css(row.dot)}></span>
                                    {' '}
                                    <span style={css("flex: 1; min-width: 0; font-size: 9.5px; color: #1f2836; line-height: 1.4;")}>
                                      {hole(row.label)}
                                    </span>
                                    {' '}
                                    <span style={css("font-family: 'JetBrains Mono', monospace; font-size: 8px; color: #6d798d;")}>
                                      {hole(row.mins)}
                                    </span>
                                    {' '}
                                  </div>
                                  {' '}
                                </Fragment>
                              ))}
                              {' '}
                            </div>
                            {' '}
                            <div style={css("padding: 10px 11px; border-radius: 11px; background: linear-gradient(120deg, rgba(109,49,212,0.09), rgba(255,255,255,0.4) 70%); border: 1px solid rgba(109,49,212,0.22); font-size: 9px; color: #45536b; line-height: 1.55;")}>
                              <b style={css("color: #6d31d4;")}>
                                {"Medabrain rewrote Friday."}
                              </b>
                              {" You logged two clinical shifts, so the résumé block moved and the flashcard load dropped."}
                            </div>
                            {' '}
                          </div>
                          {' '}
                        </Fragment>
                      ) : null}
                      {' '}
                    </div>
                    {' '}
                  </div>
                  {' '}
                </div>
                {' '}
                <div className="msp-anim" style={css("position: absolute; right: -10px; bottom: -14px; display: flex; align-items: center; gap: 9px; padding: 10px 14px; border-radius: 14px; background: #ffffff; border: 1px solid rgba(109,49,212,0.28); box-shadow: 0 12px 30px rgba(15,23,42,0.14);")}>
                  {' '}
                  <span style={css("width: 26px; height: 26px; border-radius: 8px; background: linear-gradient(135deg,#6d31d4,#a422b8); display: inline-flex; align-items: center; justify-content: center; color: #fff; font-size: 12px; font-weight: 800; font-family: 'Bricolage Grotesque', sans-serif;")}>
                    {"M"}
                  </span>
                  {' '}
                  <div>
                    {' '}
                    <div style={css("font-size: 11px; font-weight: 800; color: #1f2836; font-family: 'Bricolage Grotesque', sans-serif;")}>
                      {"Medabrain"}
                    </div>
                    {' '}
                    <div style={css("font-size: 9.5px; color: #5d6b85;")}>
                      {"reads all four pillars"}
                    </div>
                    {' '}
                  </div>
                  {' '}
                </div>
                {' '}
              </div>
              {' '}
            </div>
            {' '}
          </section>
          {' '}
          <section style={css("border-top: 1px solid rgba(15,23,42,0.11); border-bottom: 1px solid rgba(15,23,42,0.11); background: rgba(255,255,255,0.42); overflow: hidden;")}>
            {' '}
            <div className="msp-anim mspv2-hover-6" style={css("display: flex; width: max-content; gap: 0; padding: 14px 0;")}>
              {' '}
              <div className="msp-anim" style={css("display: flex; gap: 0; animation: msp-marquee 38s linear infinite;")}>
                {' '}
                {arr(v.marquee).map((m, __k3) => (
                  <Fragment key={__k3}>
                    {' '}
                    <span style={css("display: inline-flex; align-items: center; gap: 12px; padding: 0 26px; font-size: 13.5px; font-weight: 600; color: #45536b; white-space: nowrap;")}>
                      {' '}
                      <span style={css(m.dot)}></span>
                      {hole(m.label)}
                      {"\n          "}
                    </span>
                    {' '}
                  </Fragment>
                ))}
                {' '}
              </div>
              {' '}
            </div>
            {' '}
          </section>
          {' '}
          <section id="prep" style={css("max-width: 1360px; margin: 0 auto; padding: clamp(56px,8vh,110px) clamp(18px,4.5vw,56px) 0;")}>
            {' '}
            <div data-reveal="1" style={css("opacity: 0; transform: translateY(20px); transition: opacity .7s cubic-bezier(.16,1,.3,1), transform .7s cubic-bezier(.16,1,.3,1); max-width: 780px;")}>
              {' '}
              <div style={css("display: inline-flex; align-items: center; gap: 9px; font-size: 11.5px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: #6d31d4;")}>
                {' '}
                <span style={css("width: 22px; height: 2px; background: #6d31d4; border-radius: 2px;")}></span>
                {"Pillar one · the Prep module\n      "}
              </div>
              {' '}
              <h2 style={css("margin: 16px 0 0; font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800; letter-spacing: -0.035em; line-height: 1.06; font-size: clamp(30px,3.6vw,50px); color: #1f2836; text-wrap: balance;")}>
                {"Not sure which health career fits? Find out first."}
              </h2>
              {' '}
              <p style={css("margin: 18px 0 0; font-size: clamp(15px,1.2vw,17.5px); line-height: 1.65; color: #45536b; max-width: 62ch;")}>
                {"Ten pathways, scored against how you actually think — then a full curriculum for the one that fits, a quiz library that makes you prove it, and Medabrain sitting inside every lesson. Everything in this panel is the real thing. Use it."}
              </p>
              {' '}
            </div>
            {' '}
            <div data-reveal="1" style={css("opacity: 0; transform: translateY(24px); transition: opacity .8s cubic-bezier(.16,1,.3,1) .1s, transform .8s cubic-bezier(.16,1,.3,1) .1s; margin-top: 34px; display: flex; gap: 10px; flex-wrap: wrap;")}>
              {' '}
              {arr(v.prepTabs).map((t, __k4) => (
                <Fragment key={__k4}>
                  {' '}
                  <button onClick={t.pick} style={css(t.style)}>
                    <span style={css(t.dot)}></span>
                    {hole(t.label)}
                  </button>
                  {' '}
                </Fragment>
              ))}
              {' '}
            </div>
            {' '}
            <div data-reveal="1" style={css("opacity: 0; transform: translateY(26px); transition: opacity .8s cubic-bezier(.16,1,.3,1) .15s, transform .8s cubic-bezier(.16,1,.3,1) .15s; margin-top: 18px; border-radius: 22px; border: 1px solid rgba(15,23,42,0.15); background: #eff3f9; box-shadow: 0 24px 60px -30px rgba(15,23,42,0.32), 0 1px 3px rgba(15,23,42,0.05); overflow: hidden;")}>
              {' '}
              <div style={css("display: flex; align-items: center; gap: 10px; padding: 12px 18px; border-bottom: 1px solid rgba(15,23,42,0.09); background: rgba(255,255,255,0.6);")}>
                {' '}
                <span style={css("display: flex; gap: 6px;")}>
                  {' '}
                  <span style={css("width: 9px; height: 9px; border-radius: 50%; background: rgba(15,23,42,0.14);")}></span>
                  {' '}
                  <span style={css("width: 9px; height: 9px; border-radius: 50%; background: rgba(15,23,42,0.14);")}></span>
                  {' '}
                  <span style={css("width: 9px; height: 9px; border-radius: 50%; background: rgba(15,23,42,0.14);")}></span>
                  {' '}
                </span>
                {' '}
                <span style={css("font-family: 'JetBrains Mono', monospace; font-size: 10.5px; color: #6d798d;")}>
                  {"medschoolprep.cloud/prep"}
                </span>
                {' '}
                <span style={css("margin-left: auto; display: inline-flex; align-items: center; gap: 7px; font-size: 10.5px; font-weight: 700; color: #067156;")}>
                  {' '}
                  <span className="msp-anim" style={css("width: 6px; height: 6px; border-radius: 50%; background: #067156;")}></span>
                  {"Live — no account needed\n        "}
                </span>
                {' '}
              </div>
              {' '}
              <div style={css("padding: clamp(18px,2.6vw,34px);")}>
                {' '}
                {(v.prepIsDiag) ? (
                  <Fragment>
                    {' '}
                    <div style={css("display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr)); gap: clamp(20px,2.6vw,40px); align-items: start;")}>
                      {' '}
                      <div>
                        {' '}
                        {(v.diagDone) ? (
                          <Fragment>
                            {' '}
                            <div>
                              {' '}
                              <div style={css("display: inline-flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #6d31d4;")}>
                                {"Your match, from three questions"}
                              </div>
                              {' '}
                              <h3 style={css("margin: 10px 0 0; font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800; letter-spacing: -0.03em; font-size: clamp(24px,2.4vw,34px); color: #1f2836;")}>
                                {hole(v.diagTopLabel)}
                              </h3>
                              {' '}
                              <p style={css("margin: 10px 0 0; font-size: 14.5px; line-height: 1.6; color: #45536b; max-width: 54ch;")}>
                                {hole(v.diagTopBlurb)}
                              </p>
                              {' '}
                              <div style={css("margin-top: 22px; display: flex; flex-direction: column; gap: 14px;")}>
                                {' '}
                                {arr(v.diagResults).map((r, __k5) => (
                                  <Fragment key={__k5}>
                                    {' '}
                                    <div>
                                      {' '}
                                      <div style={css("display: flex; align-items: center; gap: 10px; margin-bottom: 7px;")}>
                                        {' '}
                                        <span style={css("font-size: 14px; font-weight: 700; color: #1f2836;")}>
                                          {hole(r.label)}
                                        </span>
                                        {' '}
                                        <span style={css(r.chip)}>
                                          {hole(r.rank)}
                                        </span>
                                        {' '}
                                        <span style={css("margin-left: auto; font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 700; color: #45536b;")}>
                                          {hole(r.pct)}
                                        </span>
                                        {' '}
                                      </div>
                                      {' '}
                                      <div style={css("height: 8px; border-radius: 99px; background: rgba(15,23,42,0.07); overflow: hidden;")}>
                                        {' '}
                                        <div style={css(r.bar)}></div>
                                        {' '}
                                      </div>
                                      {' '}
                                    </div>
                                    {' '}
                                  </Fragment>
                                ))}
                                {' '}
                              </div>
                              {' '}
                              <div style={css("margin-top: 26px; display: flex; gap: 12px; flex-wrap: wrap;")}>
                                {' '}
                                <a href={v.signupUrl} onClick={v.onSignupClick} style={css("display: inline-flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 700; color: #fff; background: linear-gradient(135deg,#6d31d4,#4640c9); padding: 13px 20px; border-radius: 12px; box-shadow: 0 10px 24px rgba(109,49,212,0.28);")}>
                                  {"Take the full 20-question diagnostic "}
                                  <span style={css("font-size: 15px; line-height: 1;")}>
                                    {"→"}
                                  </span>
                                </a>
                                {' '}
                                <button onClick={v.resetDiag} style={css("font-family: inherit; font-size: 14px; font-weight: 600; color: #1f2836; background: rgba(255,255,255,0.7); border: 1px solid rgba(15,23,42,0.17); padding: 13px 18px; border-radius: 12px; cursor: pointer;")}>
                                  {"Run it again"}
                                </button>
                                {' '}
                              </div>
                              {' '}
                            </div>
                            {' '}
                          </Fragment>
                        ) : null}
                        {' '}
                        {(v.diagNotDone) ? (
                          <Fragment>
                            {' '}
                            <div>
                              {' '}
                              <div style={css("display: flex; align-items: center; gap: 12px;")}>
                                {' '}
                                <span style={css("font-family: 'JetBrains Mono', monospace; font-size: 11.5px; font-weight: 700; color: #6d31d4;")}>
                                  {hole(v.diagStep)}
                                </span>
                                {' '}
                                <span style={css("font-size: 10.5px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #6d798d; background: rgba(15,23,42,0.05); padding: 3px 9px; border-radius: 999px;")}>
                                  {hole(v.diagKind)}
                                </span>
                                {' '}
                              </div>
                              {' '}
                              <div style={css("height: 5px; border-radius: 99px; background: rgba(15,23,42,0.07); margin-top: 12px; overflow: hidden;")}>
                                {' '}
                                <div style={css(v.diagBar)}></div>
                                {' '}
                              </div>
                              {' '}
                              <h3 style={css("margin: 20px 0 0; font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800; letter-spacing: -0.03em; line-height: 1.2; font-size: clamp(20px,2vw,28px); color: #1f2836; text-wrap: pretty;")}>
                                {hole(v.diagPrompt)}
                              </h3>
                              {' '}
                              <div style={css("margin-top: 20px; display: flex; flex-direction: column; gap: 10px;")}>
                                {' '}
                                {arr(v.diagOptions).map((o, __k6) => (
                                  <Fragment key={__k6}>
                                    {' '}
                                    <button className="mspv2-hover-7" onClick={o.pick} style={css("text-align: left; width: 100%; font-family: inherit; font-size: 14.5px; line-height: 1.5; color: #1f2836; background: rgba(255,255,255,0.75); border: 1px solid rgba(15,23,42,0.11); border-radius: 13px; padding: 15px 17px; cursor: pointer; transition: background-color .16s ease, border-color .16s ease, color .16s ease, box-shadow .16s ease, transform .16s ease, opacity .16s ease;")}>
                                      {hole(o.text)}
                                    </button>
                                    {' '}
                                  </Fragment>
                                ))}
                                {' '}
                              </div>
                              {' '}
                            </div>
                            {' '}
                          </Fragment>
                        ) : null}
                        {' '}
                      </div>
                      {' '}
                      <div style={css("display: flex; flex-direction: column; gap: 12px;")}>
                        {' '}
                        <div style={css("padding: 18px; border-radius: 16px; background: rgba(255,255,255,0.72); border: 1px solid rgba(15,23,42,0.11);")}>
                          {' '}
                          <div style={css("font-size: 11px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #6d798d;")}>
                            {"How the real one works"}
                          </div>
                          {' '}
                          <div style={css("margin-top: 12px; display: flex; flex-direction: column; gap: 12px;")}>
                            {' '}
                            <div style={css("display: flex; gap: 11px;")}>
                              <span style={css("font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 700; color: #6d31d4; flex-shrink: 0;")}>
                                {"20"}
                              </span>
                              <span style={css("font-size: 13.5px; line-height: 1.55; color: #45536b;")}>
                                {"questions, half work-style and half scenario, taking about two minutes."}
                              </span>
                            </div>
                            {' '}
                            <div style={css("display: flex; gap: 11px;")}>
                              <span style={css("font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 700; color: #6d31d4; flex-shrink: 0;")}>
                                {"10"}
                              </span>
                              <span style={css("font-size: 13.5px; line-height: 1.55; color: #45536b;")}>
                                {"pathways scored by a weighted engine, not by vote-counting — every answer moves several at once."}
                              </span>
                            </div>
                            {' '}
                            <div style={css("display: flex; gap: 11px;")}>
                              <span style={css("font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 700; color: #6d31d4; flex-shrink: 0;")}>
                                {"∞"}
                              </span>
                              <span style={css("font-size: 13.5px; line-height: 1.55; color: #45536b;")}>
                                {"retakes. Your fit shifts as you learn more about yourself, and the pathway follows."}
                              </span>
                            </div>
                            {' '}
                          </div>
                          {' '}
                        </div>
                        {' '}
                        <div style={css("padding: 18px; border-radius: 16px; background: linear-gradient(135deg, rgba(109,49,212,0.1), rgba(255,255,255,0.4) 70%); border: 1px solid rgba(109,49,212,0.24);")}>
                          {' '}
                          <div style={css("font-size: 13.5px; line-height: 1.6; color: #45536b;")}>
                            {"The match is not a label. It picks your curriculum: units, lessons, flashcard decks, quiz weighting, and the shadowing your Portfolio starts asking you to log."}
                          </div>
                          {' '}
                        </div>
                        {' '}
                      </div>
                      {' '}
                    </div>
                    {' '}
                  </Fragment>
                ) : null}
                {' '}
                {(v.prepIsQuiz) ? (
                  <Fragment>
                    {' '}
                    <div style={css("display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr)); gap: clamp(20px,2.6vw,40px); align-items: start;")}>
                      {' '}
                      <div>
                        {' '}
                        <div style={css("display: flex; align-items: center; gap: 10px; flex-wrap: wrap;")}>
                          {' '}
                          <span style={css("font-size: 10.5px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #067156; background: rgba(6,113,86,0.12); border: 1px solid rgba(6,113,86,0.24); padding: 4px 10px; border-radius: 999px;")}>
                            {hole(v.quizCat)}
                          </span>
                          {' '}
                          <span style={css("font-size: 12.5px; color: #5d6b85;")}>
                            {hole(v.quizTopic)}
                          </span>
                          {' '}
                          <span style={css("margin-left: auto; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #6d798d;")}>
                            {hole(v.quizScore)}
                            {" this session"}
                          </span>
                          {' '}
                        </div>
                        {' '}
                        <h3 style={css("margin: 18px 0 0; font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800; letter-spacing: -0.03em; line-height: 1.25; font-size: clamp(19px,1.9vw,26px); color: #1f2836; text-wrap: pretty;")}>
                          {hole(v.quizPrompt)}
                        </h3>
                        {' '}
                        <div style={css("margin-top: 18px; display: flex; flex-direction: column; gap: 9px;")}>
                          {' '}
                          {arr(v.quizChoices).map((c, __k7) => (
                            <Fragment key={__k7}>
                              {' '}
                              <button onClick={c.pick} style={css(c.style)}>
                                {' '}
                                <span style={css(c.markStyle)}>
                                  {hole(c.mark)}
                                </span>
                                {' '}
                                <span>
                                  {hole(c.text)}
                                </span>
                                {' '}
                              </button>
                              {' '}
                            </Fragment>
                          ))}
                          {' '}
                        </div>
                        {' '}
                        <div style={css("margin-top: 20px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap;")}>
                          {' '}
                          {(v.quizChecked) ? (
                            <Fragment>
                              {' '}
                              <div style={css("display: flex; align-items: center; gap: 12px; flex-wrap: wrap;")}>
                                {' '}
                                <span style={css(v.quizVerdictStyle)}>
                                  {hole(v.quizVerdict)}
                                </span>
                                {' '}
                                <button onClick={v.nextQuiz} style={css("font-family: inherit; font-size: 14px; font-weight: 700; color: #fff; background: linear-gradient(135deg,#1a5fcc,#154ea7); border: none; padding: 12px 20px; border-radius: 12px; cursor: pointer;")}>
                                  {"Next question"}
                                </button>
                                {' '}
                              </div>
                              {' '}
                            </Fragment>
                          ) : null}
                          {' '}
                          {(v.quizNotChecked) ? (
                            <Fragment>
                              {' '}
                              <button onClick={v.checkQuiz} style={css(v.quizCheckStyle)}>
                                {"Check answer"}
                              </button>
                              {' '}
                            </Fragment>
                          ) : null}
                          {' '}
                        </div>
                        {' '}
                        {(v.quizChecked) ? (
                          <Fragment>
                            {' '}
                            <div style={css("margin-top: 18px; padding: 17px; border-radius: 14px; background: linear-gradient(120deg, rgba(109,49,212,0.09), rgba(255,255,255,0.45) 70%); border: 1px solid rgba(109,49,212,0.24);")}>
                              {' '}
                              <div style={css("display: flex; align-items: center; gap: 9px;")}>
                                {' '}
                                <span style={css("width: 24px; height: 24px; border-radius: 8px; background: linear-gradient(135deg,#6d31d4,#a422b8); display: inline-flex; align-items: center; justify-content: center; color: #fff; font-size: 11px; font-weight: 800; font-family: 'Bricolage Grotesque', sans-serif;")}>
                                  {"M"}
                                </span>
                                {' '}
                                <span style={css("font-size: 13px; font-weight: 800; color: #1f2836; font-family: 'Bricolage Grotesque', sans-serif;")}>
                                  {"Medabrain"}
                                </span>
                                {' '}
                                <span style={css("font-size: 11.5px; color: #6d798d;")}>
                                  {"explains the miss, not just the answer"}
                                </span>
                                {' '}
                              </div>
                              {' '}
                              <p style={css("margin: 11px 0 0; font-size: 14px; line-height: 1.65; color: #45536b;")}>
                                {hole(v.quizExplain)}
                              </p>
                              {' '}
                            </div>
                            {' '}
                          </Fragment>
                        ) : null}
                        {' '}
                      </div>
                      {' '}
                      <div style={css("display: flex; flex-direction: column; gap: 12px;")}>
                        {' '}
                        <div style={css("padding: 18px; border-radius: 16px; background: rgba(255,255,255,0.72); border: 1px solid rgba(15,23,42,0.11);")}>
                          {' '}
                          <div style={css("font-size: 11px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #6d798d;")}>
                            {"The library"}
                          </div>
                          {' '}
                          <div style={css("margin-top: 13px; display: flex; flex-direction: column; gap: 10px;")}>
                            {' '}
                            <div style={css("display: flex; align-items: center; justify-content: space-between; gap: 10px;")}>
                              <span style={css("font-size: 13.5px; color: #1f2836;")}>
                                {"Bio & Biochem"}
                              </span>
                              <span style={css("font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #067156;")}>
                                {"deep"}
                              </span>
                            </div>
                            {' '}
                            <div style={css("display: flex; align-items: center; justify-content: space-between; gap: 10px;")}>
                              <span style={css("font-size: 13.5px; color: #1f2836;")}>
                                {"Chem & Physics"}
                              </span>
                              <span style={css("font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #067156;")}>
                                {"deep"}
                              </span>
                            </div>
                            {' '}
                            <div style={css("display: flex; align-items: center; justify-content: space-between; gap: 10px;")}>
                              <span style={css("font-size: 13.5px; color: #1f2836;")}>
                                {"Psych & Soc"}
                              </span>
                              <span style={css("font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #067156;")}>
                                {"deep"}
                              </span>
                            </div>
                            {' '}
                            <div style={css("display: flex; align-items: center; justify-content: space-between; gap: 10px;")}>
                              <span style={css("font-size: 13.5px; color: #1f2836;")}>
                                {"Lesson quizzes"}
                              </span>
                              <span style={css("font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #067156;")}>
                                {"per unit"}
                              </span>
                            </div>
                            {' '}
                          </div>
                          {' '}
                          <p style={css("margin: 14px 0 0; font-size: 13px; line-height: 1.6; color: #5d6b85;")}>
                            {"Every quiz you take feeds two things: the flashcard deck built from what you missed, and the weighting on tomorrow’s plan."}
                          </p>
                          {' '}
                        </div>
                        {' '}
                        <div style={css("padding: 18px; border-radius: 16px; background: rgba(255,255,255,0.72); border: 1px solid rgba(15,23,42,0.11);")}>
                          {' '}
                          <div style={css("font-size: 11px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #6d798d;")}>
                            {"Where a wrong answer goes"}
                          </div>
                          {' '}
                          <div style={css("margin-top: 13px; display: flex; flex-direction: column; gap: 9px;")}>
                            {' '}
                            <div style={css("display: flex; align-items: center; gap: 9px; font-size: 13.5px; color: #45536b;")}>
                              <span style={css("width: 7px; height: 7px; border-radius: 50%; background: #6d31d4;")}></span>
                              {"A flashcard, scheduled by FSRS"}
                            </div>
                            {' '}
                            <div style={css("display: flex; align-items: center; gap: 9px; font-size: 13.5px; color: #45536b;")}>
                              <span style={css("width: 7px; height: 7px; border-radius: 50%; background: #905808;")}></span>
                              {"A weak-topic flag on Progress"}
                            </div>
                            {' '}
                            <div style={css("display: flex; align-items: center; gap: 9px; font-size: 13.5px; color: #45536b;")}>
                              <span style={css("width: 7px; height: 7px; border-radius: 50%; background: #1a5fcc;")}></span>
                              {"A review block on tomorrow’s plan"}
                            </div>
                            {' '}
                          </div>
                          {' '}
                        </div>
                        {' '}
                      </div>
                      {' '}
                    </div>
                    {' '}
                  </Fragment>
                ) : null}
                {' '}
                {(v.prepIsCoach) ? (
                  <Fragment>
                    {' '}
                    <div style={css("display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr)); gap: clamp(20px,2.6vw,40px); align-items: start;")}>
                      {' '}
                      <div style={css("border-radius: 18px; border: 1px solid rgba(109,49,212,0.26); background: rgba(255,255,255,0.6); overflow: hidden; display: flex; flex-direction: column; min-height: 420px;")}>
                        {' '}
                        <div style={css("padding: 15px 18px; border-bottom: 1px solid rgba(15,23,42,0.09); background: linear-gradient(120deg, rgba(109,49,212,0.12), rgba(255,255,255,0.4)); display: flex; align-items: center; gap: 11px;")}>
                          {' '}
                          <span style={css("width: 34px; height: 34px; border-radius: 11px; background: linear-gradient(135deg,#6d31d4,#a422b8); display: inline-flex; align-items: center; justify-content: center; color: #fff; font-size: 15px; font-weight: 800; font-family: 'Bricolage Grotesque', sans-serif; box-shadow: 0 6px 16px rgba(109,49,212,0.32);")}>
                            {"M"}
                          </span>
                          {' '}
                          <div style={css("flex: 1; min-width: 0;")}>
                            {' '}
                            <div style={css("font-size: 14.5px; font-weight: 800; color: #1f2836; font-family: 'Bricolage Grotesque', sans-serif;")}>
                              {"Medabrain"}
                            </div>
                            {' '}
                            <div style={css("font-size: 11.5px; color: #5d6b85;")}>
                              {"Pathway Helper · Physician (MD/DO)"}
                            </div>
                            {' '}
                          </div>
                          {' '}
                          <button onClick={v.resetCoach} style={css("font-family: inherit; font-size: 11.5px; font-weight: 600; color: #5d6b85; background: rgba(255,255,255,0.7); border: 1px solid rgba(15,23,42,0.11); padding: 7px 12px; border-radius: 999px; cursor: pointer;")}>
                            {"New chat"}
                          </button>
                          {' '}
                        </div>
                        {' '}
                        <div style={css("flex: 1; padding: 18px; display: flex; flex-direction: column; gap: 12px;")}>
                          {' '}
                          {(v.coachEmpty) ? (
                            <Fragment>
                              {' '}
                              <div style={css("padding: 17px; border-radius: 14px; background: linear-gradient(120deg, rgba(109,49,212,0.08), rgba(255,255,255,0.5) 70%); border: 1px solid rgba(109,49,212,0.22);")}>
                                {' '}
                                <p style={css("margin: 0; font-size: 14px; line-height: 1.6; color: #45536b;")}>
                                  {"Ask me anything about your Physician (MD/DO) pathway — what to study next, or help understanding a topic. I read your lessons, your quiz history, your notes and your highlights."}
                                </p>
                                {' '}
                                <div style={css("margin-top: 14px; display: flex; flex-direction: column; gap: 8px;")}>
                                  {' '}
                                  {arr(v.coachSuggestions).map((s, __k8) => (
                                    <Fragment key={__k8}>
                                      {' '}
                                      <button className="mspv2-hover-8" onClick={s.ask} style={css("text-align: left; font-family: inherit; font-size: 13.5px; color: #1f2836; background: rgba(255,255,255,0.85); border: 1px solid rgba(15,23,42,0.11); border-radius: 11px; padding: 11px 14px; cursor: pointer; transition: background-color .16s ease, border-color .16s ease, color .16s ease, box-shadow .16s ease, transform .16s ease, opacity .16s ease;")}>
                                        {hole(s.text)}
                                      </button>
                                      {' '}
                                    </Fragment>
                                  ))}
                                  {' '}
                                </div>
                                {' '}
                              </div>
                              {' '}
                            </Fragment>
                          ) : null}
                          {' '}
                          {arr(v.coachMsgs).map((m, __k9) => (
                            <Fragment key={__k9}>
                              {' '}
                              <div style={css(m.wrap)}>
                                <div style={css(m.bubble)}>
                                  {hole(m.text)}
                                </div>
                              </div>
                              {' '}
                            </Fragment>
                          ))}
                          {' '}
                          {(v.coachBusy) ? (
                            <Fragment>
                              {' '}
                              <div style={css("display: flex; align-items: center; gap: 9px; font-size: 13px; color: #5d6b85;")}>
                                {' '}
                                <span style={css("display: inline-flex; gap: 4px;")}>
                                  {' '}
                                  <span className="msp-anim" style={css("width: 6px; height: 6px; border-radius: 50%; background: #6d31d4; animation: msp-blink 1s infinite;")}></span>
                                  {' '}
                                  <span className="msp-anim" style={css("width: 6px; height: 6px; border-radius: 50%; background: #6d31d4; animation: msp-blink 1s .18s infinite;")}></span>
                                  {' '}
                                  <span className="msp-anim" style={css("width: 6px; height: 6px; border-radius: 50%; background: #6d31d4; animation: msp-blink 1s .36s infinite;")}></span>
                                  {' '}
                                </span>
                                {"\n                    Medabrain is thinking…\n                  "}
                              </div>
                              {' '}
                            </Fragment>
                          ) : null}
                          {' '}
                          {(v.coachHasMsgs) ? (
                            <Fragment>
                              {' '}
                              <div style={css("margin-top: auto; display: flex; flex-wrap: wrap; gap: 8px;")}>
                                {' '}
                                {arr(v.coachSuggestions).map((s, __k10) => (
                                  <Fragment key={__k10}>
                                    {' '}
                                    <button className="mspv2-hover-9" onClick={s.ask} style={css("font-family: inherit; font-size: 12px; color: #45536b; background: rgba(255,255,255,0.8); border: 1px solid rgba(15,23,42,0.11); border-radius: 999px; padding: 8px 13px; cursor: pointer;")}>
                                      {hole(s.text)}
                                    </button>
                                    {' '}
                                  </Fragment>
                                ))}
                                {' '}
                              </div>
                              {' '}
                            </Fragment>
                          ) : null}
                          {' '}
                        </div>
                        {' '}
                        <div style={css("padding: 14px 16px; border-top: 1px solid rgba(15,23,42,0.09); display: flex; gap: 9px; align-items: center;")}>
                          {' '}
                          <div style={css("flex: 1; font-size: 13px; color: #6d798d; background: #fcfdff; border: 1px solid rgba(15,23,42,0.14); border-radius: 11px; padding: 12px 14px;")}>
                            {"Ask about your pathway…"}
                          </div>
                          {' '}
                          <span style={css("width: 42px; height: 42px; border-radius: 11px; background: linear-gradient(135deg,#6d31d4,#a422b8); display: inline-flex; align-items: center; justify-content: center; color: #fff; font-size: 15px;")}>
                            {"↑"}
                          </span>
                          {' '}
                        </div>
                        {' '}
                      </div>
                      {' '}
                      <div style={css("display: flex; flex-direction: column; gap: 12px;")}>
                        {' '}
                        <div style={css("padding: 18px; border-radius: 16px; background: rgba(255,255,255,0.72); border: 1px solid rgba(15,23,42,0.11);")}>
                          {' '}
                          <div style={css("font-size: 11px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #6d798d;")}>
                            {"What Medabrain already knows"}
                          </div>
                          {' '}
                          <div style={css("margin-top: 13px; display: flex; flex-direction: column; gap: 10px; font-size: 13.5px; line-height: 1.55; color: #45536b;")}>
                            {' '}
                            <div style={css("display: flex; gap: 9px;")}>
                              <span style={css("color: #6d31d4; font-weight: 800;")}>
                                {"·"}
                              </span>
                              {"The lesson you are inside, section by section"}
                            </div>
                            {' '}
                            <div style={css("display: flex; gap: 9px;")}>
                              <span style={css("color: #6d31d4; font-weight: 800;")}>
                                {"·"}
                              </span>
                              {"Every quiz you have taken and what you missed"}
                            </div>
                            {' '}
                            <div style={css("display: flex; gap: 9px;")}>
                              <span style={css("color: #6d31d4; font-weight: 800;")}>
                                {"·"}
                              </span>
                              {"Your notes, your highlights, your difficulty ratings"}
                            </div>
                            {' '}
                            <div style={css("display: flex; gap: 9px;")}>
                              <span style={css("color: #6d31d4; font-weight: 800;")}>
                                {"·"}
                              </span>
                              {"Your pathway, your grade, and the pace you set"}
                            </div>
                            {' '}
                          </div>
                          {' '}
                        </div>
                        {' '}
                        <div style={css("padding: 18px; border-radius: 16px; background: linear-gradient(135deg, rgba(109,49,212,0.1), rgba(164,34,184,0.05) 60%, rgba(255,255,255,0.4)); border: 1px solid rgba(109,49,212,0.24);")}>
                          {' '}
                          <p style={css("margin: 0; font-size: 13.5px; line-height: 1.65; color: #45536b;")}>
                            {"There is a Medabrain in Prep, in Portfolio, in Plans and in the Roadmap. Same memory, different specialist — which is why the answer you get in a lesson knows about the hours you logged last week."}
                          </p>
                          {' '}
                        </div>
                        {' '}
                      </div>
                      {' '}
                    </div>
                    {' '}
                  </Fragment>
                ) : null}
                {' '}
              </div>
              {' '}
            </div>
            {' '}
          </section>
          {' '}
          <section style={css("max-width: 1360px; margin: 0 auto; padding: clamp(48px,7vh,96px) clamp(18px,4.5vw,56px) 0;")}>
            {' '}
            <div data-reveal="1" style={css("opacity: 0; transform: translateY(22px); transition: opacity .8s cubic-bezier(.16,1,.3,1), transform .8s cubic-bezier(.16,1,.3,1); border-radius: 24px; padding: clamp(22px,3vw,44px); background: linear-gradient(135deg, rgba(109,49,212,0.12), rgba(164,34,184,0.06) 45%, rgba(26,95,204,0.08)); border: 1px solid rgba(109,49,212,0.24);")}>
              {' '}
              <div style={css("display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 360px), 1fr)); gap: clamp(24px,3vw,52px); align-items: center;")}>
                {' '}
                <div>
                  {' '}
                  <div style={css("display: inline-flex; align-items: center; gap: 10px;")}>
                    {' '}
                    <span className="msp-anim" style={css("width: 40px; height: 40px; border-radius: 13px; background: linear-gradient(135deg,#6d31d4,#a422b8); display: inline-flex; align-items: center; justify-content: center; color: #fff; font-size: 18px; font-weight: 800; font-family: 'Bricolage Grotesque', sans-serif; box-shadow: 0 8px 22px rgba(109,49,212,0.32); animation: msp-pulse 3.4s infinite;")}>
                      {"M"}
                    </span>
                    {' '}
                    <span style={css("font-size: 11.5px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: #6d31d4;")}>
                      {"Medabrain · the thing that joins it up"}
                    </span>
                    {' '}
                  </div>
                  {' '}
                  <h2 style={css("margin: 18px 0 0; font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800; letter-spacing: -0.035em; line-height: 1.08; font-size: clamp(26px,3vw,40px); color: #1f2836; text-wrap: balance;")}>
                    {"One coach, reading all four pillars at once."}
                  </h2>
                  {' '}
                  <p style={css("margin: 16px 0 0; font-size: clamp(15px,1.2vw,17px); line-height: 1.65; color: #45536b; max-width: 54ch;")}>
                    {"Most study apps bolt a chatbot on the side. Medabrain is the wiring. It writes your plan from your pathway and your calendar, explains the quiz question you just missed using the lesson you just read, reads your résumé the way an admissions officer would, and re-plans your year the moment you log a shift. Every pillar below is a different specialist with the same memory."}
                  </p>
                  {' '}
                </div>
                {' '}
                <div style={css("display: grid; grid-template-columns: repeat(2,1fr); gap: 12px;")}>
                  {' '}
                  <div style={css("padding: 17px; border-radius: 15px; background: rgba(255,255,255,0.78); border: 1px solid rgba(15,23,42,0.11);")}>
                    {' '}
                    <div style={css("font-size: 11px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #6d31d4;")}>
                      {"In Prep"}
                    </div>
                    {' '}
                    <p style={css("margin: 9px 0 0; font-size: 13.5px; line-height: 1.6; color: #45536b;")}>
                      {"Grounded in the lesson you are inside, section by section — not general knowledge with your topic pasted in."}
                    </p>
                    {' '}
                  </div>
                  {' '}
                  <div style={css("padding: 17px; border-radius: 15px; background: rgba(255,255,255,0.78); border: 1px solid rgba(15,23,42,0.11);")}>
                    {' '}
                    <div style={css("font-size: 11px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #067156;")}>
                      {"In Portfolio"}
                    </div>
                    {' '}
                    <p style={css("margin: 9px 0 0; font-size: 13.5px; line-height: 1.6; color: #45536b;")}>
                      {"Reads your activities and tells you which line is doing nothing for you, and why."}
                    </p>
                    {' '}
                  </div>
                  {' '}
                  <div style={css("padding: 17px; border-radius: 15px; background: rgba(255,255,255,0.78); border: 1px solid rgba(15,23,42,0.11);")}>
                    {' '}
                    <div style={css("font-size: 11px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #a422b8;")}>
                      {"In Roadmap"}
                    </div>
                    {' '}
                    <p style={css("margin: 9px 0 0; font-size: 13.5px; line-height: 1.6; color: #45536b;")}>
                      {"Turns a deadline catalog into your twelve months, with the week the work has to start."}
                    </p>
                    {' '}
                  </div>
                  {' '}
                  <div style={css("padding: 17px; border-radius: 15px; background: rgba(255,255,255,0.78); border: 1px solid rgba(15,23,42,0.11);")}>
                    {' '}
                    <div style={css("font-size: 11px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #905808;")}>
                      {"In Plans"}
                    </div>
                    {' '}
                    <p style={css("margin: 9px 0 0; font-size: 13.5px; line-height: 1.6; color: #45536b;")}>
                      {"Writes the day-by-day schedule, and keeps extending it as your week actually happens."}
                    </p>
                    {' '}
                  </div>
                  {' '}
                </div>
                {' '}
              </div>
              {' '}
            </div>
            {' '}
          </section>
          {' '}
          <section id="portfolio" style={css("max-width: 1360px; margin: 0 auto; padding: clamp(56px,8vh,110px) clamp(18px,4.5vw,56px) 0;")}>
            {' '}
            <div data-reveal="1" style={css("opacity: 0; transform: translateY(20px); transition: opacity .7s cubic-bezier(.16,1,.3,1), transform .7s cubic-bezier(.16,1,.3,1); max-width: 800px;")}>
              {' '}
              <div style={css("display: inline-flex; align-items: center; gap: 9px; font-size: 11.5px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: #067156;")}>
                {' '}
                <span style={css("width: 22px; height: 2px; background: #067156; border-radius: 2px;")}></span>
                {"Pillar two · the full Portfolio\n      "}
              </div>
              {' '}
              <h2 style={css("margin: 16px 0 0; font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800; letter-spacing: -0.035em; line-height: 1.06; font-size: clamp(30px,3.6vw,50px); color: #1f2836; text-wrap: balance;")}>
                {"Everything your application needs, in one place."}
              </h2>
              {' '}
              <p style={css("margin: 18px 0 0; font-size: clamp(15px,1.2vw,17.5px); line-height: 1.65; color: #45536b; max-width: 62ch;")}>
                {"One page that decides what you do next, a database of programs ranked against what you have already done, a résumé that scores itself, and interview practice built from your own experiences. Four of the sixteen surfaces in this pillar — click through them."}
              </p>
              {' '}
            </div>
            {' '}
            <div data-reveal="1" style={css("opacity: 0; transform: translateY(24px); transition: opacity .8s cubic-bezier(.16,1,.3,1) .1s, transform .8s cubic-bezier(.16,1,.3,1) .1s; margin-top: 34px; display: flex; gap: 10px; flex-wrap: wrap;")}>
              {' '}
              {arr(v.pfTabs).map((t, __k11) => (
                <Fragment key={__k11}>
                  {' '}
                  <button onClick={t.pick} style={css(t.style)}>
                    <span style={css(t.dot)}></span>
                    {hole(t.label)}
                  </button>
                  {' '}
                </Fragment>
              ))}
              {' '}
            </div>
            {' '}
            <div data-reveal="1" style={css("opacity: 0; transform: translateY(26px); transition: opacity .8s cubic-bezier(.16,1,.3,1) .15s, transform .8s cubic-bezier(.16,1,.3,1) .15s; margin-top: 18px; border-radius: 22px; border: 1px solid rgba(15,23,42,0.15); background: #eff3f9; box-shadow: 0 24px 60px -30px rgba(15,23,42,0.32); overflow: hidden;")}>
              {' '}
              <div style={css("display: flex; align-items: center; gap: 10px; padding: 12px 18px; border-bottom: 1px solid rgba(15,23,42,0.09); background: rgba(255,255,255,0.6);")}>
                {' '}
                <span style={css("display: flex; gap: 6px;")}>
                  {' '}
                  <span style={css("width: 9px; height: 9px; border-radius: 50%; background: rgba(15,23,42,0.14);")}></span>
                  {' '}
                  <span style={css("width: 9px; height: 9px; border-radius: 50%; background: rgba(15,23,42,0.14);")}></span>
                  {' '}
                  <span style={css("width: 9px; height: 9px; border-radius: 50%; background: rgba(15,23,42,0.14);")}></span>
                  {' '}
                </span>
                {' '}
                <span style={css("font-family: 'JetBrains Mono', monospace; font-size: 10.5px; color: #6d798d;")}>
                  {"medschoolprep.cloud/portfolio"}
                </span>
                {' '}
                <span style={css("margin-left: auto; font-size: 10.5px; font-weight: 700; color: #067156;")}>
                  {"Everything here is clickable"}
                </span>
                {' '}
              </div>
              {' '}
              <div style={css("padding: clamp(18px,2.6vw,34px);")}>
                {' '}
                {(v.pfIsOverview) ? (
                  <Fragment>
                    {' '}
                    <div style={css("display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr)); gap: clamp(20px,2.6vw,40px); align-items: start;")}>
                      {' '}
                      <div>
                        {' '}
                        <div style={css("padding: 20px; border-radius: 16px; background: linear-gradient(125deg, rgba(26,95,204,0.11), rgba(6,113,86,0.05) 58%, rgba(255,255,255,0.4)); border: 1px solid rgba(26,95,204,0.24);")}>
                          {' '}
                          <div style={css("font-size: 11px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #154ea7;")}>
                            {"Start here"}
                          </div>
                          {' '}
                          <h3 style={css("margin: 6px 0 0; font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800; letter-spacing: -0.02em; font-size: 20px; color: #1f2836;")}>
                            {"Here’s what to do next"}
                          </h3>
                          {' '}
                          <p style={css("margin: 7px 0 0; font-size: 13.5px; line-height: 1.6; color: #45536b; max-width: 62ch;")}>
                            {"Pick the top one. Everything further down this page is just detail on how it’s going — you don’t have to read it."}
                          </p>
                          {' '}
                        </div>
                        {' '}
                        <div style={css("margin-top: 14px; display: flex; flex-direction: column; gap: 10px;")}>
                          {' '}
                          {arr(v.steps).map((st, __k12) => (
                            <Fragment key={__k12}>
                              {' '}
                              <button onClick={st.toggle} style={css(st.style)}>
                                {' '}
                                <span style={css(st.check)}>
                                  {hole(st.mark)}
                                </span>
                                {' '}
                                <span style={css("flex: 1; min-width: 0;")}>
                                  {' '}
                                  <span style={css("display: flex; align-items: center; gap: 9px; flex-wrap: wrap;")}>
                                    {' '}
                                    <span style={css(st.titleStyle)}>
                                      {hole(st.label)}
                                    </span>
                                    {' '}
                                    {(st.showBadge) ? (
                                      <Fragment>
                                        {' '}
                                        <span style={css(st.badgeStyle)}>
                                          {hole(st.badge)}
                                        </span>
                                        {' '}
                                      </Fragment>
                                    ) : null}
                                    {' '}
                                  </span>
                                  {' '}
                                  <span style={css("display: block; font-size: 13px; color: #5d6b85; margin-top: 4px; line-height: 1.55;")}>
                                    {hole(st.why)}
                                  </span>
                                  {' '}
                                </span>
                                {' '}
                                <span style={css("flex-shrink: 0; font-size: 12px; font-weight: 700; color: #45536b;")}>
                                  {hole(st.cta)}
                                </span>
                                {' '}
                              </button>
                              {' '}
                            </Fragment>
                          ))}
                          {' '}
                        </div>
                        {' '}
                        <div style={css("margin-top: 12px; font-size: 12.5px; color: #6d798d;")}>
                          {hole(v.stepsLeft)}
                          {" · tick one and watch the rest of the page move."}
                        </div>
                        {' '}
                      </div>
                      {' '}
                      <div style={css("display: flex; flex-direction: column; gap: 12px;")}>
                        {' '}
                        <div style={css("padding: 20px; border-radius: 16px; background: rgba(255,255,255,0.76); border: 1px solid rgba(15,23,42,0.11); display: flex; align-items: center; gap: 16px;")}>
                          {' '}
                          <svg viewBox="0 0 84 84" style={css("width: 84px; height: 84px; flex-shrink: 0;")}>
                            {' '}
                            <circle cx="42" cy="42" r="36" fill="none" stroke="rgba(15,23,42,0.09)" strokeWidth="8"></circle>
                            {' '}
                            <circle cx="42" cy="42" r="36" fill="none" stroke="#067156" strokeWidth="8" strokeLinecap="round" strokeDasharray="226" style={css(`${v.strengthArc} transition: stroke-dashoffset .7s cubic-bezier(.16,1,.3,1);`)} transform="rotate(-90 42 42)"></circle>
                            {' '}
                          </svg>
                          {' '}
                          <div>
                            {' '}
                            <div style={css("font-size: 11px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #6d798d;")}>
                              {"Application strength"}
                            </div>
                            {' '}
                            <div style={css("font-family: 'JetBrains Mono', monospace; font-size: 26px; font-weight: 700; color: #067156; margin-top: 3px;")}>
                              {hole(v.strengthPct)}
                            </div>
                            {' '}
                            <div style={css("font-size: 12.5px; color: #45536b; margin-top: 2px;")}>
                              {hole(v.strengthLabel)}
                            </div>
                            {' '}
                          </div>
                          {' '}
                        </div>
                        {' '}
                        <div style={css("padding: 18px; border-radius: 16px; background: rgba(255,255,255,0.76); border: 1px solid rgba(15,23,42,0.11);")}>
                          {' '}
                          <div style={css("font-size: 11px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #6d798d;")}>
                            {"Also on this page"}
                          </div>
                          {' '}
                          <div style={css("margin-top: 12px; display: flex; flex-wrap: wrap; gap: 7px;")}>
                            {' '}
                            <span style={css("font-size: 12px; color: #45536b; background: rgba(255,255,255,0.8); border: 1px solid rgba(15,23,42,0.11); padding: 6px 11px; border-radius: 999px;")}>
                              {"This week’s goals"}
                            </span>
                            {' '}
                            <span style={css("font-size: 12px; color: #45536b; background: rgba(255,255,255,0.8); border: 1px solid rgba(15,23,42,0.11); padding: 6px 11px; border-radius: 999px;")}>
                              {"Milestones & deadlines"}
                            </span>
                            {' '}
                            <span style={css("font-size: 12px; color: #45536b; background: rgba(255,255,255,0.8); border: 1px solid rgba(15,23,42,0.11); padding: 6px 11px; border-radius: 999px;")}>
                              {"Clinical hours total"}
                            </span>
                            {' '}
                            <span style={css("font-size: 12px; color: #45536b; background: rgba(255,255,255,0.8); border: 1px solid rgba(15,23,42,0.11); padding: 6px 11px; border-radius: 999px;")}>
                              {"Medabrain’s read"}
                            </span>
                            {' '}
                            <span style={css("font-size: 12px; color: #45536b; background: rgba(255,255,255,0.8); border: 1px solid rgba(15,23,42,0.11); padding: 6px 11px; border-radius: 999px;")}>
                              {"College list health"}
                            </span>
                            {' '}
                          </div>
                          {' '}
                        </div>
                        {' '}
                      </div>
                      {' '}
                    </div>
                    {' '}
                  </Fragment>
                ) : null}
                {' '}
                {(v.pfIsOpps) ? (
                  <Fragment>
                    {' '}
                    <div>
                      {' '}
                      <div style={css("display: flex; align-items: center; gap: 9px; flex-wrap: wrap;")}>
                        {' '}
                        {arr(v.oppFilters).map((f, __k13) => (
                          <Fragment key={__k13}>
                            {' '}
                            <button onClick={f.pick} style={css(f.style)}>
                              {hole(f.label)}
                            </button>
                            {' '}
                          </Fragment>
                        ))}
                        {' '}
                        <span style={css("margin-left: auto; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #0b7166;")}>
                          {hole(v.trackedCount)}
                        </span>
                        {' '}
                      </div>
                      {' '}
                      <div style={css("margin-top: 16px; display: grid; grid-template-columns: repeat(auto-fill, minmax(320px,1fr)); gap: 12px;")}>
                        {' '}
                        {arr(v.opps).map((o, __k15) => (
                          <Fragment key={__k15}>
                            {' '}
                            <div style={css("padding: 17px; border-radius: 15px; background: rgba(255,255,255,0.76); border: 1px solid rgba(15,23,42,0.11);")}>
                              {' '}
                              <div style={css("display: flex; align-items: flex-start; gap: 12px;")}>
                                {' '}
                                <div style={css("flex: 1; min-width: 0;")}>
                                  {' '}
                                  <div style={css("font-size: 15px; font-weight: 800; font-family: 'Bricolage Grotesque', sans-serif; color: #1f2836; line-height: 1.3;")}>
                                    {hole(o.name)}
                                  </div>
                                  {' '}
                                  <div style={css("font-size: 12px; color: #6d798d; margin-top: 3px;")}>
                                    {hole(o.org)}
                                  </div>
                                  {' '}
                                </div>
                                {' '}
                                <button onClick={o.toggle} style={css(o.trackStyle)}>
                                  {hole(o.trackLabel)}
                                </button>
                                {' '}
                              </div>
                              {' '}
                              <div style={css("display: flex; flex-wrap: wrap; gap: 6px; margin-top: 11px;")}>
                                {' '}
                                {arr(o.chips).map((c, __k14) => (
                                  <Fragment key={__k14}>
                                    {' '}
                                    <span style={css(c.style)}>
                                      {hole(c.label)}
                                    </span>
                                    {' '}
                                  </Fragment>
                                ))}
                                {' '}
                              </div>
                              {' '}
                              <p style={css("margin: 11px 0 0; font-size: 13px; line-height: 1.6; color: #45536b;")}>
                                {hole(o.why)}
                              </p>
                              {' '}
                            </div>
                            {' '}
                          </Fragment>
                        ))}
                        {' '}
                      </div>
                      {' '}
                      <p style={css("margin: 16px 0 0; font-size: 13px; color: #5d6b85; max-width: 74ch;")}>
                        {"Tracking one puts its deadline on your Milestones, its prep window on your Roadmap, and its next step on tomorrow’s plan. The real database holds hundreds of programs, competitions and scholarships, ranked against what you have already logged."}
                      </p>
                      {' '}
                    </div>
                    {' '}
                  </Fragment>
                ) : null}
                {' '}
                {(v.pfIsResume) ? (
                  <Fragment>
                    {' '}
                    <div style={css("display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr)); gap: clamp(20px,2.6vw,40px); align-items: start;")}>
                      {' '}
                      <div>
                        {' '}
                        <div style={css("padding: 18px; border-radius: 15px; background: rgba(255,255,255,0.78); border: 1px solid rgba(15,23,42,0.11);")}>
                          {' '}
                          <div style={css("display: flex; align-items: center; gap: 10px; flex-wrap: wrap;")}>
                            {' '}
                            <span style={css("font-size: 10.5px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #026b97; background: rgba(2,107,151,0.12); padding: 4px 10px; border-radius: 999px;")}>
                              {"Clinical exposure"}
                            </span>
                            {' '}
                            <span style={css("font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #6d798d;")}>
                              {"96 hrs · 2 years"}
                            </span>
                            {' '}
                          </div>
                          {' '}
                          <div style={css("font-size: 17px; font-weight: 800; font-family: 'Bricolage Grotesque', sans-serif; color: #1f2836; margin-top: 10px;")}>
                            {"Volunteer, oncology floor — Duke Regional"}
                          </div>
                          {' '}
                          <p style={css("margin: 8px 0 0; font-size: 13.5px; line-height: 1.6; color: #45536b;")}>
                            {"The same entry, scored the way the app scores it. Tick what is true of your version and watch the number move — this is exactly how a thin résumé line becomes a strong one."}
                          </p>
                          {' '}
                        </div>
                        {' '}
                        <div style={css("margin-top: 13px; display: flex; flex-direction: column; gap: 9px;")}>
                          {' '}
                          {arr(v.actParts).map((p, __k16) => (
                            <Fragment key={__k16}>
                              {' '}
                              <button onClick={p.toggle} style={css(p.style)}>
                                {' '}
                                <span style={css(p.box)}>
                                  {hole(p.mark)}
                                </span>
                                {' '}
                                <span style={css("flex: 1; min-width: 0;")}>
                                  {' '}
                                  <span style={css("display: block; font-size: 14px; font-weight: 700; color: #1f2836;")}>
                                    {hole(p.label)}
                                  </span>
                                  {' '}
                                  <span style={css("display: block; font-size: 12.5px; color: #5d6b85; margin-top: 2px;")}>
                                    {hole(p.hint)}
                                  </span>
                                  {' '}
                                </span>
                                {' '}
                                <span style={css("font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #026b97; flex-shrink: 0;")}>
                                  {hole(p.points)}
                                </span>
                                {' '}
                              </button>
                              {' '}
                            </Fragment>
                          ))}
                          {' '}
                        </div>
                        {' '}
                      </div>
                      {' '}
                      <div style={css("display: flex; flex-direction: column; gap: 12px;")}>
                        {' '}
                        <div style={css("padding: 20px; border-radius: 16px; background: rgba(255,255,255,0.78); border: 1px solid rgba(15,23,42,0.11);")}>
                          {' '}
                          <div style={css("font-size: 11px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #6d798d;")}>
                            {"How this entry reads"}
                          </div>
                          {' '}
                          <div style={css("display: flex; align-items: baseline; gap: 8px; margin-top: 8px;")}>
                            {' '}
                            <span style={css("font-family: 'JetBrains Mono', monospace; font-size: 34px; font-weight: 700; color: #1f2836;")}>
                              {hole(v.actScore)}
                            </span>
                            {' '}
                            <span style={css("font-size: 13px; color: #6d798d;")}>
                              {"/ 100"}
                            </span>
                            {' '}
                          </div>
                          {' '}
                          <div style={css("height: 9px; border-radius: 99px; background: rgba(15,23,42,0.07); margin-top: 12px; overflow: hidden;")}>
                            {' '}
                            <div style={css(v.actBar)}></div>
                            {' '}
                          </div>
                          {' '}
                          <div style={css("margin-top: 13px;")}>
                            <span style={css(v.actVerdictStyle)}>
                              {hole(v.actVerdict)}
                            </span>
                          </div>
                          {' '}
                        </div>
                        {' '}
                        <div style={css("padding: 18px; border-radius: 16px; background: linear-gradient(120deg, rgba(2,107,151,0.09), rgba(255,255,255,0.45) 70%); border: 1px solid rgba(2,107,151,0.24);")}>
                          {' '}
                          <p style={css("margin: 0; font-size: 13.5px; line-height: 1.65; color: #45536b;")}>
                            {"The same record exports as Common App fields in the order the real form asks for them, as a normal résumé for a job or a scholarship, or as an honors list ranked by level of recognition."}
                          </p>
                          {' '}
                        </div>
                        {' '}
                      </div>
                      {' '}
                    </div>
                    {' '}
                  </Fragment>
                ) : null}
                {' '}
                {(v.pfIsInterview) ? (
                  <Fragment>
                    {' '}
                    <div style={css("display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr)); gap: clamp(20px,2.6vw,40px); align-items: start;")}>
                      {' '}
                      <div style={css("display: flex; flex-direction: column; gap: 9px;")}>
                        {' '}
                        <div style={css("font-size: 11px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #6d798d;")}>
                          {"Pick a question"}
                        </div>
                        {' '}
                        {arr(v.ivList).map((q, __k17) => (
                          <Fragment key={__k17}>
                            {' '}
                            <button onClick={q.pick} style={css(q.style)}>
                              {' '}
                              <span style={css(q.kindStyle)}>
                                {hole(q.kind)}
                              </span>
                              {' '}
                              <span style={css("font-size: 14px; font-weight: 600; color: #1f2836; line-height: 1.45;")}>
                                {hole(q.label)}
                              </span>
                              {' '}
                            </button>
                            {' '}
                          </Fragment>
                        ))}
                        {' '}
                        <p style={css("margin: 6px 0 0; font-size: 12.5px; line-height: 1.6; color: #5d6b85;")}>
                          {"In the app you answer out loud — there is a live voice mode — and the score comes back against the same rubric shown here."}
                        </p>
                        {' '}
                      </div>
                      {' '}
                      <div style={css("padding: 22px; border-radius: 17px; background: rgba(255,255,255,0.78); border: 1px solid rgba(15,23,42,0.11);")}>
                        {' '}
                        <h3 style={css("margin: 0; font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800; letter-spacing: -0.02em; font-size: clamp(18px,1.8vw,24px); line-height: 1.3; color: #1f2836;")}>
                          {hole(v.ivPrompt)}
                        </h3>
                        {' '}
                        <p style={css("margin: 10px 0 0; font-size: 13.5px; line-height: 1.6; color: #5d6b85;")}>
                          {hole(v.ivSample)}
                        </p>
                        {' '}
                        {(v.ivNotScored) ? (
                          <Fragment>
                            {' '}
                            <button onClick={v.scoreIv} style={css("margin-top: 18px; font-family: inherit; font-size: 14px; font-weight: 700; color: #fff; background: linear-gradient(135deg,#c21a3e,#9f1533); border: none; padding: 13px 20px; border-radius: 12px; cursor: pointer;")}>
                              {"Score a sample answer"}
                            </button>
                            {' '}
                          </Fragment>
                        ) : null}
                        {' '}
                        {(v.ivScored) ? (
                          <Fragment>
                            {' '}
                            <div style={css("margin-top: 18px;")}>
                              {' '}
                              <div style={css("display: flex; align-items: center; gap: 14px; flex-wrap: wrap;")}>
                                {' '}
                                <span style={css("font-family: 'JetBrains Mono', monospace; font-size: 32px; font-weight: 700; color: #1f2836;")}>
                                  {hole(v.ivScore)}
                                </span>
                                {' '}
                                <span style={css("font-size: 13px; font-weight: 800; color: #c21a3e; background: rgba(194,26,62,0.1); border: 1px solid rgba(194,26,62,0.24); padding: 6px 13px; border-radius: 999px;")}>
                                  {hole(v.ivVerdict)}
                                </span>
                                {' '}
                                <button onClick={v.resetIv} style={css("margin-left: auto; font-family: inherit; font-size: 12px; font-weight: 600; color: #5d6b85; background: rgba(255,255,255,0.8); border: 1px solid rgba(15,23,42,0.11); padding: 8px 14px; border-radius: 999px; cursor: pointer;")}>
                                  {"Reset"}
                                </button>
                                {' '}
                              </div>
                              {' '}
                              <div style={css("margin-top: 18px; display: flex; flex-direction: column; gap: 14px;")}>
                                {' '}
                                {arr(v.ivRubric).map((r, __k18) => (
                                  <Fragment key={__k18}>
                                    {' '}
                                    <div>
                                      {' '}
                                      <div style={css("display: flex; align-items: center; gap: 10px;")}>
                                        {' '}
                                        <span style={css("font-size: 13.5px; font-weight: 700; color: #1f2836;")}>
                                          {hole(r.label)}
                                        </span>
                                        {' '}
                                        <span style={css("margin-left: auto; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #45536b;")}>
                                          {hole(r.pct)}
                                        </span>
                                        {' '}
                                      </div>
                                      {' '}
                                      <div style={css("height: 7px; border-radius: 99px; background: rgba(15,23,42,0.07); margin-top: 6px; overflow: hidden;")}>
                                        {' '}
                                        <div style={css(r.bar)}></div>
                                        {' '}
                                      </div>
                                      {' '}
                                      <div style={css("font-size: 12.5px; color: #5d6b85; margin-top: 5px;")}>
                                        {hole(r.note)}
                                      </div>
                                      {' '}
                                    </div>
                                    {' '}
                                  </Fragment>
                                ))}
                                {' '}
                              </div>
                              {' '}
                            </div>
                            {' '}
                          </Fragment>
                        ) : null}
                        {' '}
                      </div>
                      {' '}
                    </div>
                    {' '}
                  </Fragment>
                ) : null}
                {' '}
              </div>
              {' '}
            </div>
            {' '}
            <p data-reveal="1" style={css("opacity: 0; transform: translateY(14px); transition: opacity .7s ease .1s, transform .7s ease .1s; margin: 18px 0 0; font-size: 14px; color: #5d6b85; max-width: 76ch;")}>
              {"Those four are a quarter of this pillar. Essays, College List, Admissions Calc, Financial Aid, Scholarships, Recommenders, Milestones, Academics, Clinical Hours, Research, Skills & Certs and Common App export all live on the same record — "}
              <a href="#everything">
                {"see the rest"}
              </a>
              {"."}
            </p>
            {' '}
          </section>
          {' '}
          <section id="roadmap" style={css("max-width: 1360px; margin: 0 auto; padding: clamp(56px,8vh,110px) clamp(18px,4.5vw,56px) 0;")}>
            {' '}
            <div data-reveal="1" style={css("opacity: 0; transform: translateY(20px); transition: opacity .7s cubic-bezier(.16,1,.3,1), transform .7s cubic-bezier(.16,1,.3,1); display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 380px), 1fr)); gap: clamp(24px,3vw,52px); align-items: end;")}>
              {' '}
              <div>
                {' '}
                <div style={css("display: inline-flex; align-items: center; gap: 9px; font-size: 11.5px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: #a422b8;")}>
                  {' '}
                  <span style={css("width: 22px; height: 2px; background: #a422b8; border-radius: 2px;")}></span>
                  {"Pillar three · the Roadmap\n        "}
                </div>
                {' '}
                <h2 style={css("margin: 16px 0 0; font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800; letter-spacing: -0.035em; line-height: 1.06; font-size: clamp(30px,3.6vw,50px); color: #1f2836; text-wrap: balance;")}>
                  {"Your whole year, with the week the work has to start."}
                </h2>
                {' '}
              </div>
              {' '}
              <p style={css("margin: 0; font-size: clamp(15px,1.2vw,17px); line-height: 1.65; color: #45536b;")}>
                {"Every calendar a student owns says “in 70 days”. This one says "}
                <b style={css("color: #905808;")}>
                  {"start now"}
                </b>
                {" — because a registration that closes in January is an ask you make in September. Drag the road, tap anything on it."}
              </p>
              {' '}
            </div>
            {' '}
            <div data-reveal="1" style={css("opacity: 0; transform: translateY(24px); transition: opacity .8s cubic-bezier(.16,1,.3,1) .1s, transform .8s cubic-bezier(.16,1,.3,1) .1s; margin-top: 30px; border-radius: 22px; border: 1px solid rgba(15,23,42,0.15); background: #eff3f9; box-shadow: 0 24px 60px -30px rgba(15,23,42,0.32); overflow: hidden;")}>
              {' '}
              <div style={css("display: flex; align-items: center; gap: 12px; padding: 16px 18px; border-bottom: 1px solid rgba(15,23,42,0.09); background: rgba(255,255,255,0.6); flex-wrap: wrap;")}>
                {' '}
                {arr(v.rmViews).map((v, __k19) => (
                  <Fragment key={__k19}>
                    {' '}
                    <button onClick={v.pick} style={css(v.style)}>
                      {' '}
                      <span style={css(v.labelStyle)}>
                        {hole(v.label)}
                      </span>
                      {' '}
                      <span style={css("font-size: 11px; color: #6d798d;")}>
                        {hole(v.blurb)}
                      </span>
                      {' '}
                    </button>
                    {' '}
                  </Fragment>
                ))}
                {' '}
                <div style={css("margin-left: auto; display: flex; gap: 8px;")}>
                  {' '}
                  <button onClick={v.rmScrollLeft} style={css("width: 36px; height: 36px; border-radius: 10px; cursor: pointer; font-family: inherit; font-size: 15px; color: #45536b; background: rgba(255,255,255,0.8); border: 1px solid rgba(15,23,42,0.14);")}>
                    {"←"}
                  </button>
                  {' '}
                  <button onClick={v.rmScrollRight} style={css("width: 36px; height: 36px; border-radius: 10px; cursor: pointer; font-family: inherit; font-size: 15px; color: #45536b; background: rgba(255,255,255,0.8); border: 1px solid rgba(15,23,42,0.14);")}>
                    {"→"}
                  </button>
                  {' '}
                </div>
                {' '}
              </div>
              {' '}
              <div style={css("padding: clamp(16px,2.2vw,28px);")}>
                {' '}
                <div style={css("display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px;")}>
                  {' '}
                  {arr(v.rmSeasons).map((s, __k20) => (
                    <Fragment key={__k20}>
                      {' '}
                      <span style={css(s.style)}>
                        {hole(s.label)}
                        {" · "}
                        {hole(s.span)}
                      </span>
                      {' '}
                    </Fragment>
                  ))}
                  {' '}
                </div>
                {' '}
                {(v.rmIsPath) ? (
                  <Fragment>
                    {' '}
                    <div className="msp-scroll" ref={v.spineRef} style={css("overflow-x: auto; overflow-y: hidden; cursor: grab; padding: 6px 2px 16px; user-select: none;")}>
                      {' '}
                      <div style={css("display: flex; align-items: stretch; gap: 18px; width: max-content; padding-bottom: 4px;")}>
                        {' '}
                        {arr(v.rmItems).map((it, __k21) => (
                          <Fragment key={__k21}>
                            {' '}
                            <div style={css("display: flex; flex-direction: column; gap: 12px; align-items: flex-start;")}>
                              {' '}
                              <button onClick={it.pick} style={css(it.cardStyle)}>
                                {' '}
                                <span style={css("display: flex; align-items: center; gap: 7px; flex-wrap: wrap;")}>
                                  {' '}
                                  <span style={css(it.urgencyStyle)}>
                                    {hole(it.urgency)}
                                  </span>
                                  {' '}
                                  <span style={css(it.trackStyle)}>
                                    {hole(it.trackChip)}
                                  </span>
                                  {' '}
                                </span>
                                {' '}
                                <span style={css("display: block; font-size: 14.5px; font-weight: 800; font-family: 'Bricolage Grotesque', sans-serif; color: #1f2836; margin-top: 9px; line-height: 1.3;")}>
                                  {hole(it.name)}
                                </span>
                                {' '}
                                <span style={css("display: block; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #45536b; margin-top: 7px;")}>
                                  {hole(it.date)}
                                </span>
                                {' '}
                                <span style={css("display: block; font-size: 11.5px; color: #6d798d; margin-top: 4px;")}>
                                  {hole(it.org)}
                                </span>
                                {' '}
                              </button>
                              {' '}
                              <div style={css("display: flex; align-items: center; gap: 0; width: 284px;")}>
                                {' '}
                                <span style={css(it.nodeStyle)}></span>
                                {' '}
                                <span style={css("flex: 1; height: 3px; background: linear-gradient(90deg, rgba(15,23,42,0.14), rgba(15,23,42,0.07));")}></span>
                                {' '}
                              </div>
                              {' '}
                              <span style={css("font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #6d798d;")}>
                                {hole(it.month)}
                              </span>
                              {' '}
                            </div>
                            {' '}
                          </Fragment>
                        ))}
                        {' '}
                      </div>
                      {' '}
                    </div>
                    {' '}
                  </Fragment>
                ) : null}
                {' '}
                {(v.rmIsLine) ? (
                  <Fragment>
                    {' '}
                    <div className="msp-scroll" ref={v.spineRef} style={css("overflow-x: auto; cursor: grab; padding-bottom: 12px; user-select: none;")}>
                      {' '}
                      <div style={css("display: flex; align-items: flex-end; gap: 20px; width: max-content; height: 210px; padding: 8px 2px;")}>
                        {' '}
                        {arr(v.rmItems).map((it, __k22) => (
                          <Fragment key={__k22}>
                            {' '}
                            <button onClick={it.pick} style={css("display: flex; flex-direction: column; justify-content: flex-end; gap: 9px; width: 150px; height: 100%; cursor: pointer; font-family: inherit; background: none; border: none; text-align: left;")}>
                              {' '}
                              <span style={css("display: block; font-size: 11.5px; font-weight: 700; color: #1f2836; line-height: 1.35;")}>
                                {hole(it.name)}
                              </span>
                              {' '}
                              <span style={css(it.urgencyStyle)}>
                                {hole(it.urgency)}
                              </span>
                              {' '}
                              <span style={css(it.barStyle)}></span>
                              {' '}
                              <span style={css("font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #6d798d;")}>
                                {hole(it.month)}
                              </span>
                              {' '}
                            </button>
                            {' '}
                          </Fragment>
                        ))}
                        {' '}
                      </div>
                      {' '}
                    </div>
                    {' '}
                  </Fragment>
                ) : null}
                {' '}
                {(v.rmIsList) ? (
                  <Fragment>
                    {' '}
                    <div style={css("display: flex; flex-direction: column; gap: 8px;")}>
                      {' '}
                      {arr(v.rmItems).map((it, __k23) => (
                        <Fragment key={__k23}>
                          {' '}
                          <button onClick={it.pick} style={css(it.rowStyle)}>
                            {' '}
                            <span style={css(it.nodeStyle)}></span>
                            {' '}
                            <span style={css("flex: 1; min-width: 0;")}>
                              {' '}
                              <span style={css("display: block; font-size: 14.5px; font-weight: 700; color: #1f2836;")}>
                                {hole(it.name)}
                              </span>
                              {' '}
                              <span style={css("display: block; font-size: 12px; color: #6d798d; margin-top: 2px;")}>
                                {hole(it.org)}
                              </span>
                              {' '}
                            </span>
                            {' '}
                            <span style={css(it.urgencyStyle)}>
                              {hole(it.urgency)}
                            </span>
                            {' '}
                            <span style={css("font-family: 'JetBrains Mono', monospace; font-size: 11.5px; color: #45536b; flex-shrink: 0;")}>
                              {hole(it.date)}
                            </span>
                            {' '}
                          </button>
                          {' '}
                        </Fragment>
                      ))}
                      {' '}
                    </div>
                    {' '}
                  </Fragment>
                ) : null}
                {' '}
                <div style={css("margin-top: 18px; padding: 20px; border-radius: 17px; background: rgba(255,255,255,0.78); border: 1px solid rgba(15,23,42,0.11);")}>
                  {' '}
                  <div style={css("display: flex; align-items: flex-start; gap: 14px;")}>
                    {' '}
                    <span style={css(v.rmSelColor)}></span>
                    {' '}
                    <div style={css("flex: 1; min-width: 0;")}>
                      {' '}
                      <div style={css("font-size: 17px; font-weight: 800; font-family: 'Bricolage Grotesque', sans-serif; color: #1f2836; letter-spacing: -0.02em;")}>
                        {hole(v.rmSel.name)}
                      </div>
                      {' '}
                      <div style={css("display: flex; gap: 14px; flex-wrap: wrap; margin-top: 6px;")}>
                        {' '}
                        <span style={css("font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #45536b;")}>
                          {hole(v.rmSel.date)}
                        </span>
                        {' '}
                        <span style={css("font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #905808;")}>
                          {hole(v.rmSel.prep)}
                        </span>
                        {' '}
                        <span style={css("font-size: 12px; color: #6d798d;")}>
                          {hole(v.rmSel.org)}
                        </span>
                        {' '}
                      </div>
                      {' '}
                      <p style={css("margin: 12px 0 0; font-size: 14px; line-height: 1.65; color: #45536b; max-width: 82ch;")}>
                        {hole(v.rmSel.why)}
                      </p>
                      {' '}
                      <div style={css("margin-top: 14px; display: flex; flex-direction: column; gap: 8px;")}>
                        {' '}
                        {arr(v.rmSelSteps).map((st, __k24) => (
                          <Fragment key={__k24}>
                            {' '}
                            <div style={css("display: flex; gap: 10px; align-items: flex-start;")}>
                              {' '}
                              <span style={css("width: 6px; height: 6px; border-radius: 50%; background: #a422b8; margin-top: 7px; flex-shrink: 0;")}></span>
                              {' '}
                              <span style={css("font-size: 13.5px; line-height: 1.55; color: #45536b;")}>
                                {hole(st.text)}
                              </span>
                              {' '}
                            </div>
                            {' '}
                          </Fragment>
                        ))}
                        {' '}
                      </div>
                      {' '}
                      {(v.rmSelVaries) ? (
                        <Fragment>
                          {' '}
                          <div style={css("margin-top: 14px; padding: 12px 14px; border-radius: 11px; background: rgba(109,49,212,0.07); border: 1px solid rgba(109,49,212,0.2); font-size: 12.5px; line-height: 1.6; color: #45536b;")}>
                            {"This one runs on a local schedule we cannot know — your chapter, your school, your hospital. Look up the real date and pin it here, and the roadmap will re-plan everything around it."}
                          </div>
                          {' '}
                        </Fragment>
                      ) : null}
                      {' '}
                    </div>
                    {' '}
                  </div>
                  {' '}
                </div>
                {' '}
              </div>
              {' '}
            </div>
            {' '}
            <p data-reveal="1" style={css("opacity: 0; transform: translateY(14px); transition: opacity .7s ease .1s, transform .7s ease .1s; margin: 18px 0 0; font-size: 14px; color: #5d6b85; max-width: 78ch;")}>
              {"Nothing on the roadmap prints a date it cannot stand behind. A confirmed deadline reads as a date; a typical one reads as a window with the caveat attached and a marker you can tap to pin the real one."}
            </p>
            {' '}
          </section>
          {' '}
          <section id="plans" style={css("max-width: 1360px; margin: 0 auto; padding: clamp(56px,8vh,110px) clamp(18px,4.5vw,56px) 0;")}>
            {' '}
            <div data-reveal="1" style={css("opacity: 0; transform: translateY(20px); transition: opacity .7s cubic-bezier(.16,1,.3,1), transform .7s cubic-bezier(.16,1,.3,1); max-width: 800px;")}>
              {' '}
              <div style={css("display: inline-flex; align-items: center; gap: 9px; font-size: 11.5px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: #905808;")}>
                {' '}
                <span style={css("width: 22px; height: 2px; background: #905808; border-radius: 2px;")}></span>
                {"Pillar four · Plans\n      "}
              </div>
              {' '}
              <h2 style={css("margin: 16px 0 0; font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800; letter-spacing: -0.035em; line-height: 1.06; font-size: clamp(30px,3.6vw,50px); color: #1f2836; text-wrap: balance;")}>
                {"Stop deciding what to do today."}
              </h2>
              {' '}
              <p style={css("margin: 18px 0 0; font-size: clamp(15px,1.2vw,17.5px); line-height: 1.65; color: #45536b; max-width: 62ch;")}>
                {"Medabrain turns everything it knows about you — your pathway, your colleges, your deadlines, your hours — into a day-by-day plan, and keeps extending it as you go. Tick a row and the week re-balances."}
              </p>
              {' '}
            </div>
            {' '}
            <div data-reveal="1" style={css("opacity: 0; transform: translateY(24px); transition: opacity .8s cubic-bezier(.16,1,.3,1) .1s, transform .8s cubic-bezier(.16,1,.3,1) .1s; margin-top: 30px; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr)); gap: clamp(18px,2.4vw,32px); align-items: start;")}>
              {' '}
              <div style={css("border-radius: 22px; border: 1px solid rgba(15,23,42,0.15); background: #eff3f9; box-shadow: 0 24px 60px -30px rgba(15,23,42,0.32); overflow: hidden;")}>
                {' '}
                <div style={css("display: flex; align-items: center; gap: 8px; padding: 15px 18px; border-bottom: 1px solid rgba(15,23,42,0.09); background: rgba(255,255,255,0.6); flex-wrap: wrap;")}>
                  {' '}
                  {arr(v.planDays).map((d, __k25) => (
                    <Fragment key={__k25}>
                      {' '}
                      <button onClick={d.pick} style={css(d.style)}>
                        {hole(d.label)}
                      </button>
                      {' '}
                    </Fragment>
                  ))}
                  {' '}
                </div>
                {' '}
                <div style={css("padding: clamp(16px,2.2vw,26px);")}>
                  {' '}
                  <div style={css("display: flex; align-items: center; gap: 16px; flex-wrap: wrap;")}>
                    {' '}
                    <svg viewBox="0 0 84 84" style={css("width: 68px; height: 68px; flex-shrink: 0;")}>
                      {' '}
                      <circle cx="42" cy="42" r="36" fill="none" stroke="rgba(15,23,42,0.09)" strokeWidth="8"></circle>
                      {' '}
                      <circle cx="42" cy="42" r="36" fill="none" stroke="#905808" strokeWidth="8" strokeLinecap="round" strokeDasharray="226" style={css(`${v.planArc} transition: stroke-dashoffset .6s cubic-bezier(.16,1,.3,1);`)} transform="rotate(-90 42 42)"></circle>
                      {' '}
                    </svg>
                    {' '}
                    <div>
                      {' '}
                      <div style={css("font-size: 19px; font-weight: 800; font-family: 'Bricolage Grotesque', sans-serif; color: #1f2836;")}>
                        {hole(v.planDayLabel)}
                      </div>
                      {' '}
                      <div style={css("font-size: 13px; color: #5d6b85; margin-top: 3px;")}>
                        {hole(v.planDayMeta)}
                      </div>
                      {' '}
                    </div>
                    {' '}
                    <div style={css("margin-left: auto; font-family: 'JetBrains Mono', monospace; font-size: 20px; font-weight: 700; color: #905808;")}>
                      {hole(v.planPct)}
                    </div>
                    {' '}
                  </div>
                  {' '}
                  <div style={css("margin-top: 18px; display: flex; flex-direction: column; gap: 9px;")}>
                    {' '}
                    {arr(v.planRows).map((r, __k26) => (
                      <Fragment key={__k26}>
                        {' '}
                        <button onClick={r.toggle} style={css(r.style)}>
                          {' '}
                          <span style={css(r.box)}>
                            {hole(r.mark)}
                          </span>
                          {' '}
                          <span style={css(r.text)}>
                            {hole(r.label)}
                          </span>
                          {' '}
                          <span style={css(r.metaStyle)}>
                            {hole(r.meta)}
                          </span>
                          {' '}
                        </button>
                        {' '}
                      </Fragment>
                    ))}
                    {' '}
                  </div>
                  {' '}
                  <div style={css("margin-top: 16px; padding: 14px 16px; border-radius: 13px; background: linear-gradient(120deg, rgba(109,49,212,0.09), rgba(255,255,255,0.45) 70%); border: 1px solid rgba(109,49,212,0.22); display: flex; gap: 11px; align-items: flex-start;")}>
                    {' '}
                    <span style={css("width: 24px; height: 24px; flex-shrink: 0; border-radius: 8px; background: linear-gradient(135deg,#6d31d4,#a422b8); display: inline-flex; align-items: center; justify-content: center; color: #fff; font-size: 11px; font-weight: 800; font-family: 'Bricolage Grotesque', sans-serif;")}>
                      {"M"}
                    </span>
                    {' '}
                    <p style={css("margin: 0; font-size: 13.5px; line-height: 1.6; color: #45536b;")}>
                      {hole(v.planNote)}
                    </p>
                    {' '}
                  </div>
                  {' '}
                </div>
                {' '}
              </div>
              {' '}
              <div style={css("display: flex; flex-direction: column; gap: 12px;")}>
                {' '}
                <div style={css("padding: 20px; border-radius: 17px; background: rgba(255,255,255,0.76); border: 1px solid rgba(15,23,42,0.11);")}>
                  {' '}
                  <div style={css("font-size: 11px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #6d798d;")}>
                    {"What the plan is built from"}
                  </div>
                  {' '}
                  <div style={css("margin-top: 13px; display: flex; flex-direction: column; gap: 11px; font-size: 13.5px; line-height: 1.55; color: #45536b;")}>
                    {' '}
                    <div style={css("display: flex; gap: 10px;")}>
                      <span style={css("width: 6px; height: 6px; border-radius: 50%; background: #1a5fcc; margin-top: 7px; flex-shrink: 0;")}></span>
                      {"Your pathway, your grade and the hours you said you have"}
                    </div>
                    {' '}
                    <div style={css("display: flex; gap: 10px;")}>
                      <span style={css("width: 6px; height: 6px; border-radius: 50%; background: #067156; margin-top: 7px; flex-shrink: 0;")}></span>
                      {"Your quiz accuracy, topic by topic"}
                    </div>
                    {' '}
                    <div style={css("display: flex; gap: 10px;")}>
                      <span style={css("width: 6px; height: 6px; border-radius: 50%; background: #a422b8; margin-top: 7px; flex-shrink: 0;")}></span>
                      {"Every deadline on your Roadmap, and its prep window"}
                    </div>
                    {' '}
                    <div style={css("display: flex; gap: 10px;")}>
                      <span style={css("width: 6px; height: 6px; border-radius: 50%; background: #026b97; margin-top: 7px; flex-shrink: 0;")}></span>
                      {"What is unfinished in your Portfolio"}
                    </div>
                    {' '}
                    <div style={css("display: flex; gap: 10px;")}>
                      <span style={css("width: 6px; height: 6px; border-radius: 50%; background: #905808; margin-top: 7px; flex-shrink: 0;")}></span>
                      {"What you actually did last week, not what you meant to"}
                    </div>
                    {' '}
                  </div>
                  {' '}
                </div>
                {' '}
                <div style={css("padding: 20px; border-radius: 17px; background: linear-gradient(135deg, rgba(144,88,8,0.1), rgba(255,255,255,0.4) 70%); border: 1px solid rgba(144,88,8,0.24);")}>
                  {' '}
                  <div style={css("font-size: 15px; font-weight: 800; font-family: 'Bricolage Grotesque', sans-serif; color: #1f2836;")}>
                    {"Pace goals, not guilt"}
                  </div>
                  {' '}
                  <p style={css("margin: 8px 0 0; font-size: 13.5px; line-height: 1.65; color: #45536b;")}>
                    {"You set the pace — how many minutes on a school night, how many at the weekend. The plan fits inside it, and it tells you honestly when your goal and your calendar disagree."}
                  </p>
                  {' '}
                </div>
                {' '}
                <a className="mspv2-hover-10" href={v.signupUrl} onClick={v.onSignupClick} style={css("display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 18px 20px; border-radius: 17px; background: linear-gradient(135deg,#1a5fcc,#154ea7); color: #fff; box-shadow: 0 14px 32px rgba(26,95,204,0.28);")}>
                  {' '}
                  <span>
                    {' '}
                    <span style={css("display: block; font-size: 15px; font-weight: 800; font-family: 'Bricolage Grotesque', sans-serif;")}>
                      {"Get your own plan"}
                    </span>
                    {' '}
                    <span style={css("display: block; font-size: 12.5px; opacity: 0.85; margin-top: 2px;")}>
                      {"Free, in open beta, under a minute to join"}
                    </span>
                    {' '}
                  </span>
                  {' '}
                  <span style={css("font-size: 20px;")}>
                    {"→"}
                  </span>
                  {' '}
                </a>
                {' '}
              </div>
              {' '}
            </div>
            {' '}
          </section>
          {' '}
          <section id="everything" style={css("max-width: 1360px; margin: 0 auto; padding: clamp(56px,8vh,110px) clamp(18px,4.5vw,56px) 0;")}>
            {' '}
            <div data-reveal="1" style={css("opacity: 0; transform: translateY(20px); transition: opacity .7s cubic-bezier(.16,1,.3,1), transform .7s cubic-bezier(.16,1,.3,1); max-width: 780px;")}>
              {' '}
              <div style={css("display: inline-flex; align-items: center; gap: 9px; font-size: 11.5px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: #1a5fcc;")}>
                {' '}
                <span style={css("width: 22px; height: 2px; background: #1a5fcc; border-radius: 2px;")}></span>
                {"And this still isn’t all of it\n      "}
              </div>
              {' '}
              <h2 style={css("margin: 16px 0 0; font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800; letter-spacing: -0.035em; line-height: 1.06; font-size: clamp(30px,3.6vw,50px); color: #1f2836; text-wrap: balance;")}>
                {"Four pillars, thirty-eight surfaces."}
              </h2>
              {' '}
              <p style={css("margin: 18px 0 0; font-size: clamp(15px,1.2vw,17.5px); line-height: 1.65; color: #45536b; max-width: 62ch;")}>
                {"The app does not put all of this in front of you on day one — it opens as you go, in the order the work actually happens, and each locked surface tells you the one thing that opens it. Here is the whole inventory anyway."}
              </p>
              {' '}
            </div>
            {' '}
            <div data-reveal="1" style={css("opacity: 0; transform: translateY(24px); transition: opacity .8s cubic-bezier(.16,1,.3,1) .1s, transform .8s cubic-bezier(.16,1,.3,1) .1s; margin-top: 30px; display: grid; grid-template-columns: repeat(auto-fit, minmax(250px,1fr)); gap: 14px;")}>
              {' '}
              {arr(v.featureGroups).map((g, __k28) => (
                <Fragment key={__k28}>
                  {' '}
                  <div style={css("padding: 20px; border-radius: 17px; background: rgba(255,255,255,0.7); border: 1px solid rgba(15,23,42,0.11);")}>
                    {' '}
                    <div style={css(g.headStyle)}>
                      {hole(g.pillar)}
                    </div>
                    {' '}
                    <div style={css("margin-top: 13px; display: flex; flex-direction: column; gap: 8px;")}>
                      {' '}
                      {arr(g.items).map((i, __k27) => (
                        <Fragment key={__k27}>
                          {' '}
                          <div style={css("display: flex; align-items: center; gap: 9px; font-size: 13.5px; color: #45536b;")}>
                            {' '}
                            <span style={css(i.dot)}></span>
                            {hole(i.label)}
                            {"\n              "}
                          </div>
                          {' '}
                        </Fragment>
                      ))}
                      {' '}
                    </div>
                    {' '}
                  </div>
                  {' '}
                </Fragment>
              ))}
              {' '}
            </div>
            {' '}
            <div data-reveal="1" style={css("opacity: 0; transform: translateY(18px); transition: opacity .7s ease .1s, transform .7s ease .1s; margin-top: 16px; padding: 18px 20px; border-radius: 15px; background: rgba(26,95,204,0.07); border: 1px solid rgba(26,95,204,0.2); font-size: 14px; line-height: 1.65; color: #45536b;")}>
              {"\n      Plus the parts that are hard to put in a list: a quick-jump palette that understands what you call a screen rather than what we call it, a live voice interview mode, lesson audio, PDF and Common App export, four themes with a font-scale and contrast knob, and a parent view your family only sees if you invite them.\n    "}
            </div>
            {' '}
          </section>
          {' '}
          <section id="faq" style={css("max-width: 1360px; margin: 0 auto; padding: clamp(56px,8vh,110px) clamp(18px,4.5vw,56px) 0;")}>
            {' '}
            <div style={css("display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr)); gap: clamp(24px,3vw,56px); align-items: start;")}>
              {' '}
              <div data-reveal="1" style={css("opacity: 0; transform: translateY(20px); transition: opacity .7s cubic-bezier(.16,1,.3,1), transform .7s cubic-bezier(.16,1,.3,1);")}>
                {' '}
                <div style={css("display: inline-flex; align-items: center; gap: 9px; font-size: 11.5px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: #067156;")}>
                  {' '}
                  <span style={css("width: 22px; height: 2px; background: #067156; border-radius: 2px;")}></span>
                  {"Free, and in beta\n        "}
                </div>
                {' '}
                <h2 style={css("margin: 16px 0 0; font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800; letter-spacing: -0.035em; line-height: 1.06; font-size: clamp(28px,3.2vw,44px); color: #1f2836; text-wrap: balance;")}>
                  {"Built for students, not for a paywall."}
                </h2>
                {' '}
                <p style={css("margin: 16px 0 0; font-size: 15.5px; line-height: 1.7; color: #45536b; max-width: 46ch;")}>
                  {"Private admissions consulting costs thousands of dollars, and the students who need a map most are the least likely to be handed one. This is the whole thing, free, while we are in open beta — and free after it."}
                </p>
                {' '}
                <div style={css("margin-top: 22px; display: flex; flex-direction: column; gap: 10px;")}>
                  {' '}
                  <div style={css("display: flex; align-items: center; gap: 10px; font-size: 14px; color: #1f2836;")}>
                    <span style={css("width: 20px; height: 20px; border-radius: 6px; background: rgba(6,113,86,0.14); color: #067156; display: inline-flex; align-items: center; justify-content: center; font-size: 12px;")}>
                      {"✓"}
                    </span>
                    {"No paywalled features"}
                  </div>
                  {' '}
                  <div style={css("display: flex; align-items: center; gap: 10px; font-size: 14px; color: #1f2836;")}>
                    <span style={css("width: 20px; height: 20px; border-radius: 6px; background: rgba(6,113,86,0.14); color: #067156; display: inline-flex; align-items: center; justify-content: center; font-size: 12px;")}>
                      {"✓"}
                    </span>
                    {"No card, no trial clock"}
                  </div>
                  {' '}
                  <div style={css("display: flex; align-items: center; gap: 10px; font-size: 14px; color: #1f2836;")}>
                    <span style={css("width: 20px; height: 20px; border-radius: 6px; background: rgba(6,113,86,0.14); color: #067156; display: inline-flex; align-items: center; justify-content: center; font-size: 12px;")}>
                      {"✓"}
                    </span>
                    {"Export your record whenever you want"}
                  </div>
                  {' '}
                </div>
                {' '}
              </div>
              {' '}
              <div data-reveal="1" style={css("opacity: 0; transform: translateY(24px); transition: opacity .8s cubic-bezier(.16,1,.3,1) .1s, transform .8s cubic-bezier(.16,1,.3,1) .1s;")}>
                {' '}
                <h3 style={css("margin: 0 0 14px; font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800; letter-spacing: -0.02em; font-size: 22px; color: #1f2836;")}>
                  {"Questions, answered."}
                </h3>
                {' '}
                <div style={css("display: flex; flex-direction: column; gap: 10px;")}>
                  {' '}
                  {arr(v.faqs).map((f, __k29) => (
                    <Fragment key={__k29}>
                      {' '}
                      <div style={css("border-radius: 15px; background: rgba(255,255,255,0.72); border: 1px solid rgba(15,23,42,0.11); overflow: hidden;")}>
                        {' '}
                        <button onClick={f.toggle} style={css(f.style)}>
                          {' '}
                          <span style={css(f.qStyle)}>
                            {hole(f.q)}
                          </span>
                          {' '}
                          <span style={css(f.signStyle)}>
                            {hole(f.sign)}
                          </span>
                          {' '}
                        </button>
                        {' '}
                        <div style={css(f.bodyStyle)}>
                          {' '}
                          <p style={css("margin: 0; padding: 0 20px 18px; font-size: 14px; line-height: 1.7; color: #45536b;")}>
                            {hole(f.a)}
                          </p>
                          {' '}
                        </div>
                        {' '}
                      </div>
                      {' '}
                    </Fragment>
                  ))}
                  {' '}
                </div>
                {' '}
              </div>
              {' '}
            </div>
            {' '}
          </section>
          {' '}
          <section style={css("max-width: 1360px; margin: 0 auto; padding: clamp(56px,8vh,110px) clamp(18px,4.5vw,56px) clamp(40px,6vh,80px);")}>
            {' '}
            <div data-reveal="1" style={css("opacity: 0; transform: translateY(22px); transition: opacity .8s cubic-bezier(.16,1,.3,1), transform .8s cubic-bezier(.16,1,.3,1); position: relative; border-radius: 26px; padding: clamp(30px,5vw,72px); text-align: center; overflow: hidden; background: linear-gradient(135deg, #1a5fcc 0%, #4640c9 55%, #6d31d4 100%); box-shadow: 0 30px 70px -30px rgba(26,95,204,0.55);")}>
              {' '}
              <div style={css("position: absolute; inset: 0; background: radial-gradient(ellipse 60% 70% at 20% 10%, rgba(255,255,255,0.18), transparent 60%);")}></div>
              {' '}
              <div style={css("position: relative;")}>
                {' '}
                <h2 style={css("margin: 0; font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800; letter-spacing: -0.035em; line-height: 1.05; font-size: clamp(28px,3.6vw,52px); color: #fff; text-wrap: balance;")}>
                  {"Ready to find your path?"}
                </h2>
                {' '}
                <p style={css("margin: 16px auto 0; max-width: 46ch; font-size: clamp(15px,1.3vw,18px); line-height: 1.6; color: rgba(255,255,255,0.88);")}>
                  {"Take the diagnostic. Get your match. Start today."}
                </p>
                {' '}
                <div style={css("margin-top: 30px; display: flex; gap: 14px; justify-content: center; flex-wrap: wrap;")}>
                  {' '}
                  <a className="mspv2-hover-10" href={v.signupUrl} onClick={v.onSignupClick} style={css("display: inline-flex; align-items: center; gap: 9px; font-size: 15.5px; font-weight: 700; color: #1a5fcc; background: #fff; padding: 15px 26px; border-radius: 13px; box-shadow: 0 12px 28px rgba(15,23,42,0.22);")}>
                    {"Get started free "}
                    <span style={css("font-size: 16px;")}>
                      {"→"}
                    </span>
                  </a>
                  {' '}
                  <a className="mspv2-hover-11" href={v.loginUrl} onClick={v.onLoginClick} style={css("display: inline-flex; align-items: center; gap: 9px; font-size: 15.5px; font-weight: 600; color: #fff; background: rgba(255,255,255,0.14); border: 1px solid rgba(255,255,255,0.4); padding: 15px 24px; border-radius: 13px;")}>
                    {"Log in"}
                  </a>
                  {' '}
                </div>
                {' '}
                <p style={css("margin: 18px 0 0; font-size: 13px; color: rgba(255,255,255,0.75);")}>
                  {"Free forever · under a minute to join · open beta"}
                </p>
                {' '}
              </div>
              {' '}
            </div>
            {' '}
          </section>
          {' '}
          <footer style={css("border-top: 1px solid rgba(15,23,42,0.11); background: rgba(255,255,255,0.4);")}>
            {' '}
            <div style={css("max-width: 1360px; margin: 0 auto; padding: 34px clamp(18px,4.5vw,56px); display: flex; align-items: center; gap: 20px; flex-wrap: wrap;")}>
              {' '}
              <div style={css("display: flex; align-items: center; gap: 10px;")}>
                {' '}
                <img src="/logo-mark.png" alt="" style={css("width: 26px; height: 26px;")} />
                {' '}
                <span style={css("font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800; font-size: 14.5px; color: #1f2836;")}>
                  {"MedSchoolPrep"}
                </span>
                {' '}
              </div>
              {' '}
              <span style={css("font-size: 13px; color: #5d6b85;")}>
                {"A free path into medicine for high schoolers."}
              </span>
              {' '}
              <div style={css("margin-left: auto; display: flex; align-items: center; gap: 18px; flex-wrap: wrap;")}>
                {' '}
                <a href="#prep" style={css("font-size: 13px; color: #45536b;")}>
                  {"Prep"}
                </a>
                {' '}
                <a href="#portfolio" style={css("font-size: 13px; color: #45536b;")}>
                  {"Portfolio"}
                </a>
                {' '}
                <a href="#roadmap" style={css("font-size: 13px; color: #45536b;")}>
                  {"Roadmap"}
                </a>
                {' '}
                <a href="#plans" style={css("font-size: 13px; color: #45536b;")}>
                  {"Plans"}
                </a>
                {' '}
                <a href={v.loginUrl} onClick={v.onLoginClick} style={css("font-size: 13px; color: #45536b;")}>
                  {"Log in"}
                </a>
                {' '}
                {/*
                  Three links the design did not draw and the site cannot ship
                  without. "For parents" is a real page a parent gets sent, and
                  the two documents have to be readable by someone who has not
                  agreed to them yet — a Terms link you can only open after
                  creating an account is not notice. Styled as the footer's own
                  links so they read as part of it.
                */}
                <a href={v.parentsUrl} onClick={v.onParentsClick} style={css("font-size: 13px; color: #45536b;")}>
                  {"For parents"}
                </a>
                {' '}
                <a href={v.termsUrl} onClick={v.onTermsClick} style={css("font-size: 13px; color: #45536b;")}>
                  {"Terms"}
                </a>
                {' '}
                <a href={v.privacyUrl} onClick={v.onPrivacyClick} style={css("font-size: 13px; color: #45536b;")}>
                  {"Privacy"}
                </a>
                {' '}
                <span style={css("font-size: 12.5px; color: #6d798d;")}>
                  {"© 2026 MedSchoolPrep. Free forever."}
                </span>
                {' '}
              </div>
              {' '}
            </div>
            {' '}
          </footer>
          {' '}
          <div id="msp-float-cta" style={css("position: fixed; right: clamp(14px,3vw,28px); bottom: clamp(14px,3vw,28px); z-index: 60; display: flex; align-items: center; gap: 10px; padding: 11px 13px 11px 16px; border-radius: 16px; background: rgba(255,255,255,0.94); border: 1px solid rgba(15,23,42,0.14); box-shadow: 0 16px 38px rgba(15,23,42,0.2); backdrop-filter: blur(10px); opacity: 0; transform: translateY(16px); pointer-events: none; transition: opacity .35s ease, transform .35s ease;")}>
            {' '}
            <span style={css("font-size: 13px; font-weight: 600; color: #45536b;")}>
              {"Free, in open beta"}
            </span>
            {' '}
            <a href={v.loginUrl} onClick={v.onLoginClick} style={css("font-size: 13px; font-weight: 600; color: #45536b; padding: 9px 12px; border-radius: 10px; border: 1px solid rgba(15,23,42,0.14);")}>
              {"Log in"}
            </a>
            {' '}
            <a href={v.signupUrl} onClick={v.onSignupClick} style={css("display: inline-flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 700; color: #fff; background: linear-gradient(135deg,#1a5fcc,#154ea7); padding: 10px 16px; border-radius: 11px;")}>
              {"Get started "}
              <span style={css("font-size: 14px;")}>
                {"→"}
              </span>
            </a>
            {' '}
          </div>
        </div>
      </div>
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The host wrapper.
//
// Everything above is the design, ported. Everything below is this app: the
// body class the page needs in order to scroll, and the translation from
// AuthGate's callbacks into the two `{{ loginUrl }}` / `{{ signupUrl }}` holes
// the design left for exactly this purpose.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A CTA is a real `<a href="/signup">` *and* a client-side navigation.
 *
 * The href is what makes it middle-clickable, copyable, crawlable, and what
 * makes it still work if the JS handler is not there. The handler is what stops
 * a plain left click from reloading the entire bundle to render a screen the
 * running app already has. Modified clicks (new tab, new window, download) fall
 * through to the browser untouched.
 */
function clientNav(go) {
  return (e) => {
    if (!go) return;
    if (e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    go();
  };
}

export default function LandingPageV2({
  onGetStarted, onLogin, onOpenParents, onOpenLegal,
  // Accepted so the component is prop-compatible with v1 (AuthGate passes the
  // same set to whichever version is active); v2 has no theme control.
  themeMode, onThemeChange, // eslint-disable-line no-unused-vars
}) {
  const handleSignIn = onLogin || onGetStarted;

  // The landing page is the one screen in this app that scrolls the document
  // itself — the signed-in app is a fixed-height shell with its own scroll
  // containers. See `body.msp-landing-active` in src/index.css.
  React.useEffect(() => {
    document.body.classList.add('msp-landing-active');
    const previousScrollBehavior = document.documentElement.style.scrollBehavior;
    // The header's #prep / #portfolio / #roadmap / #plans links are in-page
    // anchors, and the design assumes they glide.
    document.documentElement.style.scrollBehavior = 'smooth';
    return () => {
      document.body.classList.remove('msp-landing-active');
      document.documentElement.style.scrollBehavior = previousScrollBehavior;
    };
  }, []);

  return (
    <LandingPageV2Class
      signupUrl={AUTH_VIEWS.signup}
      loginUrl={AUTH_VIEWS.login}
      onSignupClick={clientNav(onGetStarted)}
      onLoginClick={clientNav(handleSignIn)}
      parentsUrl={PARENT_HUB_PATH}
      onParentsClick={clientNav(onOpenParents)}
      termsUrl={LEGAL_VIEWS.terms}
      privacyUrl={LEGAL_VIEWS.privacy}
      onTermsClick={clientNav(onOpenLegal && (() => onOpenLegal(LEGAL_VIEWS.terms)))}
      onPrivacyClick={clientNav(onOpenLegal && (() => onOpenLegal(LEGAL_VIEWS.privacy)))}
    />
  );
}
