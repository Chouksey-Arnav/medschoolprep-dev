// ─────────────────────────────────────────────────────────────────────────────
// Named modes for Medabrain.
//
// ── Why an empty box is the wrong front door ────────────────────────────────
// The chat surface used to open on a blinking cursor and the word "Ask
// Medabrain anything". For an adult who already knows what an AI coach is good
// for, that is the most powerful interface there is. For a fifteen-year-old it
// is an exam question with no prompt. The observable result is the one every
// open-ended box produces: either nothing typed at all, or a first message so
// vague ("help me with med school") that the answer is generic, and the student
// concludes the product is generic and does not come back.
//
// Modes fix that by replacing "what do you want?" with "which of these six?".
// The list is the product telling a student what it is FOR — and each mode
// carries its own behavior, because the honest truth is that a coach explaining
// mitosis and a coach handling an application essay should not be the same
// coach. Essay mode is far more Socratic and far less generative than concept
// mode by design, not by accident of phrasing.
//
// ── The equity starters are not decoration ─────────────────────────────────
// A student whose mother is a physician arrives knowing that BS/MD programs
// exist, that shadowing is something you ask for, that nursing admission is
// competitive in a completely different way than pre-med. A student whose family
// has never had a doctor in it does not — and cannot ask a question whose
// subject they have never heard named. That gap compounds every year, silently,
// and no amount of "ask me anything" closes it, because the missing thing is
// precisely the knowledge of what to ask.
//
// So the app names the questions out loud. EQUITY_STARTERS below are written as
// invitations in the student's own voice ("ask me what a BS/MD program is") and
// surfaced to everyone rather than targeted at anyone — targeting would require
// inferring a student's background, which is both unreliable and insulting.
// Showing them to the whole cohort costs the well-informed student one glance
// and hands the other one a map.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The six modes.
 *
 * Fields that drive behavior rather than chrome:
 *   `tier`        — pinned model tier, or null to let the auto-router decide.
 *   `purpose`     — which key pool and which server-side rules apply. Essay mode
 *                   is 'essaycoach', which is what puts it behind the prose
 *                   guard in api/groq.js; everything else is the head coach.
 *   `generative`  — how freely this mode may produce text on the student's
 *                   behalf. 'open' writes explanations and schedules; 'none'
 *                   writes nothing they could submit.
 *   `promptBlock` — appended to the system prompt. This is where a mode stops
 *                   being a label on a button and becomes different behavior.
 */
export const MEDABRAIN_MODES = [
  {
    id: 'explain',
    label: 'Explain this differently',
    icon: 'Lightbulb',
    blurb: 'A concept you have read three times and still do not have.',
    tier: null,
    purpose: 'coach',
    generative: 'open',
    placeholder: 'What are you stuck on? Paste it, or just name it.',
    promptBlock: `
══ MODE: EXPLAIN THIS DIFFERENTLY ══
They have already read an explanation and it did not land. Repeating the textbook in a friendlier voice is the one thing that cannot help, so do not do it.

Start somewhere else entirely: a concrete analogy from something a teenager actually knows, a worked example with real numbers, or the question of what the thing is FOR before what it is. Then check they have it — ask them to explain one piece back, or give them a case where the idea breaks. If they say they still do not get it, change approach again rather than adding detail; a second explanation that is the first one slower is a wasted turn.

Use the courses they are taking and their measured weak topics to pick the entry point. Pitch at AP level. When they get it right, say so once and move on; when they get it half-right, say exactly which half is wrong before anything else — "close enough" is how a misconception survives until the test.`,
    starters: [
      'Explain the loop of Henle like I have never seen a nephron',
      'I keep mixing up mitosis and meiosis — give me a way to never confuse them again',
      'Why does buffering actually work? The textbook explanation is not sticking',
    ],
  },
  {
    id: 'quiz',
    label: 'Quiz me on this',
    icon: 'HelpCircle',
    blurb: 'Out loud, on what you are weakest at, until it sticks.',
    tier: null,
    purpose: 'coach',
    generative: 'open',
    placeholder: 'What should I quiz you on? Or say "my weakest topic".',
    promptBlock: `
══ MODE: QUIZ ME ══
You are running a live quiz, not writing a worksheet. That means: ONE question at a time, then stop and wait. Never post a numbered list of ten questions — the whole value of doing this in conversation is that the next question depends on the last answer.

Start at the level their measured performance suggests, not at the easiest thing. After each answer: say plainly whether it is right, wrong, or half-right; if it is wrong, ask what led them there before you explain, because the wrong reason is the thing worth fixing. Then go again — harder if they got it, sideways into the same idea from another angle if they did not.

Where you have their quiz history by topic, aim at the weak ones and say why you are aiming there. Every five or so questions, tell them honestly where they stand on this topic. Do not inflate it.`,
    starters: [
      'Quiz me on my weakest topic until I stop missing it',
      'Ask me questions on cardiac output like a teacher would, one at a time',
      'Test whether I actually understand inheritance patterns or just memorized them',
    ],
  },
  {
    id: 'plan_week',
    label: 'Help me plan my week',
    icon: 'CalendarDays',
    blurb: 'What actually has to happen, and what can wait.',
    tier: 'sage',
    purpose: 'coach',
    generative: 'open',
    placeholder: 'What does this week look like? Tests, deadlines, how much time you have.',
    promptBlock: `
══ MODE: PLAN MY WEEK ══
Build a real week from what you were given: their deadlines with actual dates, their weekly goal and how far into it they are, their logged hours, what their plan or roadmap already says. Never invent a task, a date or a commitment that is not in the data above.

Give it to them as a markdown table — day, what, how long — not as prose. Seven rows or fewer per week and nothing padded: a day with one thing on it is a fine day, and a week that schedules four hours of study to a student who told you they have six hours total is a plan they will abandon on Tuesday and feel bad about on Wednesday.

Ask about capacity before you fill it if you were not told. If what they are carrying does not fit in the time they have, say so plainly and cut something — name what gets dropped and why it is the right thing to drop. If they sound overwhelmed, the first move is offering to lower the weekly goal, not scheduling harder.`,
    starters: [
      'Plan my week around what is actually due soonest',
      'I have six hours this week. What matters most?',
      'My week fell apart. Help me rebuild it from today.',
    ],
  },
  {
    id: 'essay',
    label: "Review my essay's structure",
    icon: 'PenLine',
    blurb: 'Questions and structural feedback. It will not write it for you.',
    tier: null,
    // The one mode with its own purpose. See src/lib/essayMode.js and
    // api/_lib/essayProseGuard.js — this is what puts the surface behind the
    // server-side hard block rather than behind a prompt alone.
    purpose: 'essaycoach',
    generative: 'none',
    placeholder: 'Paste the paragraph you are unsure about, or tell me what it is meant to do.',
    // The full Socratic stance lives in src/lib/essayMode.js and is used when
    // the essay workspace itself is the surface. This is the compact version for
    // the head coach, so a student who picks essay mode from the chat tab gets
    // the same behavior rather than a diluted one.
    promptBlock: `
══ MODE: ESSAY — SOCRATIC, AND NOT GENERATIVE ══
You give feedback on writing they wrote. You do not produce prose they could submit: no drafts, no opening lines, no rewritten sentences or paragraphs, no "here's how I'd phrase it", not as an example and not hypothetically. This is a property of the tool and it is stated to the student in their essay workspace, so breaking it also makes the product a liar.

What you do instead, and it is more useful: name what a paragraph is actually doing ("this doesn't show me anything about you — what happened that day?"), point at the exact vague words doing no work, argue with the structure, and ask the sharpening question nobody has asked them. Most turns end in a question only somebody who read THIS draft could ask. You may quote their own sentences back at them freely, and you may show one fragment under twenty-five words to demonstrate a technique, clearly framed as a demonstration.

If they ask you to write it: decline in one warm sentence, say it is because an essay a reader can tell they did not write costs them the application, and immediately ask the question that gets at what they are actually trying to say. Never lecture, never repeat the refusal, and never end a turn on the refusal alone.`,
    starters: [
      'Does my opening paragraph earn the reader\'s attention or am I clearing my throat?',
      'What is my essay actually about? I cannot tell anymore.',
      'Which paragraph in here is doing no work?',
    ],
  },
  {
    id: 'opportunities',
    label: 'Find opportunities for me',
    icon: 'Compass',
    blurb: 'Programs, shadowing, research — filtered to what you can actually get.',
    tier: 'sage',
    purpose: 'coach',
    generative: 'open',
    placeholder: 'What are you looking for — summer, shadowing, research, volunteering?',
    promptBlock: `
══ MODE: FIND OPPORTUNITIES ══
Answer with real, named things — programs, kinds of placement, organizations — and be honest about what each one takes: when it opens, who is eligible, how competitive it actually is, and how long the lead time is. Dates and eligibility shift year to year, so give your best answer, say how confident you are, and tell them where to check.

Filter by what is true of them: their grade, their pathway, what they have already logged, what they have already saved. A rising sophomore and a senior in October need completely different lists, and telling a ninth-grader to apply to something for rising seniors wastes the one year they had to prepare for it.

The most valuable thing you can do here is name the path to something they have no connection to. "I don't know any doctors" is the most common reason a student never shadows, and it has real answers — hospital volunteer offices, a school counselor, a college's pre-health office, a local free clinic, emailing a department directly. Give those concretely, including what to actually say in the email.`,
    starters: [
      'What could I realistically do this summer, given where I am?',
      'How do I find shadowing if I do not know any doctors?',
      'Which of the programs I saved should I actually apply to first?',
    ],
  },
  {
    id: 'career',
    label: 'Ask about a career',
    icon: 'Stethoscope',
    blurb: 'What the job is really like, what the path costs, what nobody tells you.',
    tier: 'sage',
    purpose: 'coach',
    generative: 'open',
    placeholder: 'Which career? Or ask what the difference between two of them is.',
    promptBlock: `
══ MODE: ASK ABOUT A CAREER ══
Be specific and be honest, including about the parts nobody volunteers: the real length and cost of the training, what the day actually looks like, what the work is like at 3am, burnout rates, what the pay is at each stage and what the debt is against it, and how the route differs for a PA, an NP, a nurse, a therapist, a pharmacist, a physician assistant, a paramedic, a researcher, and a physician in different specialties.

Never sell medicine to them and never talk them out of it. A student who is exploring should come away knowing more about the actual job, including whether they would want it. If they ask a question with a real answer — "how hard is it to get into nursing school", "is a BS/MD program worth it" — give the real answer with numbers where you have them, and say plainly when a number moves year to year.

Connect it back to what they have actually done only where it is genuinely relevant, and do not turn a question about a career into a critique of their portfolio.`,
    starters: [
      'What is the actual difference between a PA and an NP day to day?',
      'How hard is nursing school admission really, and how is it different from pre-med?',
      'What does an anesthesiologist actually do all day?',
    ],
  },
];

export const MODE_BY_ID = Object.fromEntries(MEDABRAIN_MODES.map(m => [m.id, m]));

/** The default: open chat, no mode block, auto-routed tier. */
export const FREE_MODE = Object.freeze({
  id: 'free',
  label: 'Just chat',
  icon: 'MessageCircle',
  blurb: 'Anything at all — prep, applications, or the world beyond them.',
  tier: null,
  purpose: 'coach',
  generative: 'open',
  placeholder: 'Ask Medabrain anything — a concept, a college, a deadline, a plan…',
  promptBlock: '',
  starters: [],
});

export function modeById(id) {
  return MODE_BY_ID[id] || FREE_MODE;
}

/**
 * The equity shelf.
 *
 * Every one of these is a question a student with a physician parent already
 * knows to ask and a student without one has never heard named. They are phrased
 * as the student's own request so tapping one is not an admission of anything —
 * and they are shown to everybody, because deciding which students "need" them
 * would mean guessing at a family background from a signup form.
 */
export const EQUITY_STARTERS = Object.freeze([
  'Ask me what a BS/MD program is',
  'Ask me how nursing school admission actually works',
  'Ask me how to find shadowing if I do not know any doctors',
  'Ask me what pre-med actually means, since it is not a major',
  'Ask me what a gap year does and does not cost you',
  'Ask me who writes a science recommendation and when to ask them',
  'Ask me what research a high schooler can realistically do',
  'Ask me what the difference between a hospital volunteer and a shadowing hour is',
  'Ask me how people pay for medical school',
  'Ask me what admissions officers actually mean by "demonstrated interest"',
]);

/**
 * A rotating handful, so the shelf does not read as the same three items
 * forever. `seed` keeps a student's set stable within a session — a list that
 * reshuffles on every render is a list nobody finishes reading.
 */
export function equityStarters(count = 3, seed = 0) {
  const n = EQUITY_STARTERS.length;
  const start = ((Math.abs(Math.trunc(seed)) % n) + n) % n;
  return Array.from({ length: Math.min(count, n) }, (_, i) => EQUITY_STARTERS[(start + i) % n]);
}

/**
 * The mode's contribution to the system prompt, plus the shared reminder that a
 * mode narrows behavior and never narrows what the coach is allowed to know. The
 * second half exists because the app has made this exact mistake before: a
 * prompt that said "only discuss X" produced a coach that refused everything
 * else, which is not a mode, it is a kiosk.
 */
export function buildModeBlock(modeId) {
  const mode = modeById(modeId);
  if (!mode.promptBlock) return '';
  return `${mode.promptBlock}

The student chose this mode from a menu, so it is what they want help with right now — lead with it. It is NOT a fence: if they ask something outside it, answer properly and then come back. Never tell them to switch modes to get an answer you could have given.`;
}
