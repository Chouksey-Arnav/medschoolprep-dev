// ─────────────────────────────────────────────────────────────────────────────
// Section 5 — the Common App sections, the brag sheets, and the two
// supplemental structures.
//
// ── PREMIUM ROADMAP ─────────────────────────────────────────────────────────
// Part of the Narrative Method Engine, planned as a paid tier. See PREMIUM in
// src/lib/ivy/constants.js.
// ────────────────────────────────────────────────────────────────────────────
//
// These are the parts of an application that are mechanically constrained: 150
// characters, ten slots, a fixed order, an Additional Information box with a
// specific job. Constraints are where a tool can be genuinely useful without
// pretending to have taste, so the rules here are checkable rather than
// advisory — every one of them is asserted against a real draft by
// src/lib/ivy/commonApp.js.
// ─────────────────────────────────────────────────────────────────────────────

/** The hard limits, from the Common App itself. */
export const LIMITS = {
  activityDescription: 150,
  activityPosition: 50,
  activityOrganization: 100,
  activitySlots: 10,
  honorSlots: 5,
  personalStatement: 650,
  personalStatementMin: 250,
  additionalInfo: 650,
};

/**
 * Action verbs that open a description properly.
 *
 * The rule is not "use a strong verb" — it is that the first word is a verb at
 * all, because 150 characters cannot afford "I was responsible for".
 */
export const ACTION_VERBS = [
  'Founded', 'Built', 'Led', 'Ran', 'Designed', 'Coached', 'Taught', 'Wrote', 'Published',
  'Organized', 'Organised', 'Raised', 'Grew', 'Launched', 'Directed', 'Managed', 'Mentored',
  'Recruited', 'Trained', 'Negotiated', 'Secured', 'Analyzed', 'Analysed', 'Engineered',
  'Programmed', 'Researched', 'Presented', 'Performed', 'Competed', 'Placed', 'Won',
  'Translated', 'Filmed', 'Edited', 'Curated', 'Repaired', 'Delivered', 'Scheduled',
  'Tutored', 'Volunteered', 'Cared', 'Cooked', 'Interpreted', 'Advocated', 'Lobbied',
];

/** Openings that waste the first twenty characters. */
export const WEAK_OPENINGS = [
  { re: /^(I|My|We)\b/i, note: 'Starts with a pronoun. The reader knows it is you — every line on this list is you.' },
  { re: /^(Responsible for|In charge of|Helped|Assisted|Participated|Member of|Worked)\b/i, note: 'Starts with a passive or a low-agency verb. This is the same sentence 40,000 other files opened with.' },
  { re: /^(A |An |The )\b/i, note: 'Starts with an article. Cut it — 150 characters is about eighteen words.' },
  { re: /^[a-z]/, note: 'Starts lowercase. Not a rule anywhere, but it reads as unproofed on a page of ten.' },
];

/**
 * What counts as a quantified metric. Phase 3 of the storyboard and the
 * activities-list validator both need this, so it lives in one place.
 */
export const METRIC_PATTERNS = [
  /\b\d{1,3}(,\d{3})+\b/,                       // 2,200
  /\$\s?\d[\d,.]*\s?(k|m|thousand|million)?\b/i, // $4,000
  /\b\d+(\.\d+)?\s?%/,                           // 40%
  /\b\d+\s?(students?|members?|people|attendees?|participants?|volunteers?|patients?|kids?|children|schools?|districts?|families|hours?|weeks?|months?|years?|events?|sessions?|workshops?|articles?|papers?|kits?|countries|chapters?|readers?|subscribers?|downloads?|users?)\b/i,
  /\b(first|1st|second|2nd|third|3rd|top\s?\d+)\b.{0,20}\b(place|of|out of|nationally|statewide|regionally)\b/i,
  /\bfrom \d+ to \d+\b/i,
  /\b\d+x\b/i,
];

/**
 * The Additional Information guardrails.
 *
 * This box is where good applications go wrong, because it is the only unbounded
 * space left and a student who has been told to "show personality" for six
 * months will use it. Its job is narrow: facts a reader needs and has nowhere
 * else to find.
 */
export const ADDITIONAL_INFO = {
  purpose: 'Context a reader needs and cannot get anywhere else in the file. Facts, briefly.',
  belongs: [
    'A grading system, transcript quirk or school policy that would otherwise be misread',
    'A documented interruption — illness, displacement, a death, caregiving — that explains a specific dip, WITH what happened afterwards',
    'Hours of paid work or family responsibility that did not fit the ten activity slots',
    'A COVID- or disaster-specific disruption to your school\'s offerings',
    'An activity list that genuinely overflowed, listed plainly',
  ],
  forbidden: [
    { id: 'narrative', label: 'A second personal statement', detail: 'Storytelling here reads as a student who could not follow an instruction, which is the one impression this box is uniquely able to create.' },
    { id: 'reused-essay', label: 'A supplemental essay that had nowhere else to go', detail: 'Readers recognize a repurposed draft instantly, and it displaces the facts this section exists for.' },
    { id: 'repeat-activities', label: 'Achievements already in the activities list', detail: 'Repetition costs credibility and space. If it is on the list, it is read.' },
    { id: 'excuse', label: 'An explanation with no resolution attached', detail: 'A hardship stated without what changed afterwards leaves a reader with an open question and no way to close it — see RESOLUTION_REQUIRED below.' },
  ],
  maxWords: 300,
  maxWordsNote: 'Under 300 words is the working ceiling even though the box allows 650. Length here is itself a signal.',
};

/**
 * The hardship-resolution rule, from Section 5.2.
 *
 * If a student explains a difficulty, the engine requires the stabilisation
 * sentence — not because the difficulty needs justifying, but because a reader
 * with an unanswered "and then?" fills it in themselves, and they fill it in
 * pessimistically. This is the single highest-value edit in the whole section.
 */
export const RESOLUTION_REQUIRED = {
  hardshipMarkers: [
    /\b(illness|diagnos|hospitali[sz]|surgery|treatment|chemo|depress|anxiety|concussion|injur)\w*/i,
    /\b(evict|homeless|displaced|shelter|fire|flood|hurricane|earthquake)\w*/i,
    /\b(death|passed away|died|funeral|loss of my)\b/i,
    /\b(divorce|separation|custody|deportation|incarcerat)\w*/i,
    /\b(caregiv|caring for|took care of my|responsible for my (siblings?|mother|father|grandmother|grandfather))\b/i,
    /\b(laid off|lost (his|her|their) job|financial hardship|could ?n[o']t afford)\b/i,
  ],
  resolutionMarkers: [
    /\b(since then|afterwards?|now|today|this year|by (the )?(spring|fall|summer|junior|senior))\b/i,
    /\b(recovered|stabili[sz]ed|returned|resumed|raised|improved|rose|climbed|back to)\b/i,
    /\b(grades? (went|came) (back )?up|GPA (rose|recovered|improved))\b/i,
    /\b(treatment|plan|accommodation|schedule|support) (is|has been) (in place|working)\b/i,
  ],
  message: 'You have explained a difficulty without saying what happened next. A reader cannot tell whether this is resolved, and they will assume the worse answer. Add one factual sentence: what changed, when, and what your record looks like since.',
};

/** The two brag sheets. Different documents, for genuinely different jobs. */
export const BRAG_SHEETS = {
  teacher: {
    id: 'teacher', title: 'Teacher brag sheet',
    purpose: 'Give one teacher the specific material to write about the version of you that existed in THEIR room. A teacher who liked you but has no detail writes a warm letter that says nothing.',
    prompts: [
      { id: 'discussion', q: 'A specific discussion or question in this class you remember', why: 'This is the anecdote the letter will open on. It is the single most valuable line on the sheet.' },
      { id: 'project', q: 'A project or assignment from this class, and what you did with it that was not required', why: 'Beyond-the-rubric work is what separates "strong student" from "the strongest student I have taught in six years".' },
      { id: 'struggle', q: 'Something in this class you were bad at first, and what you did about it', why: 'Growth is more persuasive than mastery, and only a teacher can testify to it.' },
      { id: 'reading', q: 'What you read for this subject that nobody assigned', why: 'Independent reading is the cheapest available evidence of genuine interest.' },
      { id: 'peers', q: 'A time you helped a classmate, or changed how the room worked', why: 'Letters that mention effect on peers do work no other part of the file can.' },
      { id: 'values', q: 'What you want this letter to say about you in one sentence', why: 'Alignment. The letter is one of four echoes of your theme, and a teacher cannot echo a theme they were never told.' },
      { id: 'logistics', q: 'Your résumé, the schools, the deadlines, and how to submit', why: 'Every letter that arrives late was late for a logistics reason, never a writing reason.' },
    ],
  },
  counselor: {
    id: 'counselor', title: 'Counselor brag sheet',
    purpose: 'Give the one person who writes about your CONTEXT the facts they cannot see from a transcript. This letter is where your record gets read against your circumstances instead of against a suburb.',
    prompts: [
      { id: 'household', q: 'What you are responsible for at home — hours, people, since when', why: 'Sibling care and household work are invisible on a transcript and decisive in a reading. This is the sheet that makes them visible.' },
      { id: 'work', q: 'Paid work: employer, hours a week, what it pays for', why: 'A student working 20 hours has a different transcript from a student who is not, and the counselor is the only one who can say so.' },
      { id: 'commute', q: 'How you get to school and how long it takes', why: 'A 90-minute each-way commute is context that reframes every activity you did not join.' },
      { id: 'hardship', q: 'Anything that affected a specific term — and what happened afterwards', why: 'A grade dip explained by the counselor lands better than the same dip explained by the student, and the resolution matters more than the cause.' },
      { id: 'access', q: 'What your school does not offer — courses, tests, programs', why: 'Rigor is judged against what was available to you. If your school offers four APs, that is the denominator, and someone has to say it.' },
      { id: 'first-gen', q: 'Whether you are the first in your family to apply to college here, and what that has meant practically', why: 'The institutional definition is narrow and specific; the lived version is a set of tasks nobody taught you. Both belong in this letter.' },
      { id: 'theme', q: 'The one thread you want your whole application to be about', why: 'The counselor letter is the frame around everything else. It should name the theme the rest of the file demonstrates.' },
    ],
  },
};

/**
 * The two supplemental structures. Both exist because the failure mode is
 * predictable and both failure modes are checkable.
 */
export const SUPPLEMENT_STRUCTURES = {
  why_us: {
    id: 'why_us', title: '"Why us"',
    thesis: 'A cross-reference, not a compliment. One column is something specific about you; the other is something specific about them; the essay is the join.',
    requires: [
      { id: 'named-course', label: 'At least one named course beyond the intro sequence', check: 'course-number-or-title' },
      { id: 'named-faculty', label: 'A named person and what they actually work on', check: 'faculty-name' },
      { id: 'named-program', label: 'A specific program, lab, center, publication or tradition', check: 'program-name' },
      { id: 'the-join', label: 'The sentence that explains why THIS student needs THAT thing', check: 'personal-link' },
    ],
    // Test Case 2's "why us" draft fails every one of these, which is the point
    // of including it in the benchmark suite.
    blocked: [
      { id: 'beauty', re: /\b(beautiful|gorgeous|stunning|picturesque) campus\b/i, note: 'Campus beauty. True of every school and available from a photograph.' },
      { id: 'prestige', re: /\b(prestigious|world[- ]renowned|top[- ]ranked|elite|pinnacle|reputation|ranked #?\d)\b/i, note: 'Prestige. You are telling them a thing they know, in the space where you were asked what you would do there.' },
      { id: 'generic-faculty', re: /\b(great|amazing|world[- ]class|renowned|prestigious) (professors|faculty|research opportunities)\b/i, note: 'Unnamed faculty. Replace with one person and one thing they published.' },
      { id: 'generic-community', re: /\b(vibrant|diverse|welcoming|tight[- ]knit) (community|student body|campus)\b/i, note: 'A community adjective that appears in every school\'s own marketing copy.' },
      { id: 'swap-test', re: /\b(great|excellent|strong) (academics|programs|opportunities)\b/i, note: 'Fails the swap test: paste another school\'s name in and the sentence is still true.' },
    ],
  },
  why_major: {
    id: 'why_major', title: '"Why this major"',
    thesis: 'Three parts, in order, and a reader can tell instantly when one is missing.',
    parts: [
      { id: 'catalyst', label: 'Past — the catalyst', share: 0.30, detail: 'The specific thing that started it. A moment, not an inclination.' },
      { id: 'sustained', label: 'Present — what you did about it for years', share: 0.40, detail: 'The evidence. This is the part that is usually missing, and its absence is what makes a "why major" essay read as a preference rather than a commitment.' },
      { id: 'future', label: 'Future — what the degree is for', share: 0.30, detail: 'Concrete enough to be wrong. "I want to help people" is not a goal, it is a temperament.' },
    ],
  },
  extracurricular: {
    id: 'extracurricular', title: 'The activity essay',
    thesis: 'Four narrative phases with a target word distribution — see the storyboard module.',
    parts: [
      { id: 'hook', label: 'The hook', share: 0.15 },
      { id: 'chronology', label: 'Chronology & growing involvement', share: 0.35 },
      { id: 'impact', label: 'Quantified impact', share: 0.35 },
      { id: 'reflection', label: 'Reflection & forward look', share: 0.15 },
    ],
  },
};

/** How the ten activity slots are ordered. */
export const ORDERING_RULE = {
  by: ['tier', 'depth of commitment', 'vertical growth', 'hours'],
  note: 'Highest-impact first — Tier 1, then Tier 2, then the rest. Readers spend seconds here and they spend them at the top. Ordering by chronology or by what feels modest is the most common self-inflicted wound on this page.',
};
