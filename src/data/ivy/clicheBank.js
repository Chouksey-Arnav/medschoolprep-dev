// ─────────────────────────────────────────────────────────────────────────────
// The cliché bank.
//
// ── PREMIUM ROADMAP ─────────────────────────────────────────────────────────
// This file is part of the Narrative Method Engine, which is planned as a paid
// tier (see PREMIUM in src/lib/ivy/constants.js). Nothing here is gated today.
// ────────────────────────────────────────────────────────────────────────────
//
// Every phrase below is here because it appears in a large fraction of essays
// that read as interchangeable. That is the ONLY claim being made. A phrase in
// this file is not banned, is not evidence of AI authorship, and is not a
// deduction from the student's character — it is a signal that a sentence is
// doing work thousands of other sentences are already doing, and the engine's
// only response is to ask for the specific version of the same thing.
//
// ── Why a hand-written list rather than a model ────────────────────────────
// Because it must be auditable and it must be stable. A student who rewrites a
// flagged sentence and reruns the audit has to see the flag disappear for the
// reason they were told, not for a reason that changed between two calls to a
// probabilistic scorer. Every entry below is a literal or a regexp; every flag
// the engine raises can be traced to exactly one of them and named on screen.
//
// ── The hard rule this file exists to enforce ──────────────────────────────
// A cliché flag NEVER produces a rejection, a score the student cannot recover
// from, or a suggestion that they are cheating. It produces a question: what
// actually happened, in your words, with the details only you have. See
// Section 6.2 of the specification and src/lib/ivy/safeguards.js.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Opening-line clichés. The first sentence carries more weight than any other,
 * so the openers are tracked separately and weighted harder by the hook
 * classifier (src/lib/ivy/hooks.js).
 */
export const OPENING_CLICHES = [
  { id: 'dictionary', re: /\b(webster'?s|the dictionary|merriam[- ]webster)\b.{0,40}\bdefines?\b/i, note: 'The dictionary-definition opener is the single most recognized essay opening there is.' },
  { id: 'ever-since', re: /\bever since I (was|can remember)\b/i, note: '"Ever since I was little" tells the reader a fact about chronology, not about you.' },
  { id: 'as-long-as', re: /\bfor as long as I can remember\b/i, note: 'Opens on a claim of duration rather than on a moment.' },
  { id: 'always-known', re: /\bI(?:'ve| have) always (known|wanted|loved|been)\b/i, note: 'An always-statement cannot be witnessed; a scene can.' },
  { id: 'quote-open', re: /^\s*["“][^"”]{20,}["”]\s*[—-]\s*[A-Z]/, note: 'Opening on a famous person\'s quotation gives the first line of your essay to someone else.' },
  { id: 'passion-open', re: /^\s*(my (passion|dream|goal) (is|has always been)|I am passionate about)\b/i, note: 'Declares the conclusion the essay is supposed to earn.' },
];

/**
 * Whole-narrative tropes. Grouped, because the engine reports the trope rather
 * than the phrase — a student who wrote three sentences of the same trope needs
 * to hear "this is the mission-trip shape", not three separate phrase flags.
 */
export const NARRATIVE_TROPES = [
  {
    id: 'mission-trip',
    label: 'The service trip that changed me',
    patterns: [
      /\b(mission|service) trip\b/i,
      /\b(third[- ]world|developing) (country|nation|village)\b/i,
      /\bthe (children|kids|people) (there )?(had|have) so little (but|yet)\b/i,
      /\bthey taught me (more|far more) than I (taught|could teach) them\b/i,
    ],
    // Section 2.3 — the savior-complex filter. This trope is not banned; it is
    // redirected, because the version of it that works is about what the writer
    // learned about themselves, told without positioning anyone as a recipient.
    saviorRisk: true,
    redirect: 'Write the mutual version. What did the person in front of you know that you did not? What did you get wrong in the first week? Where does this connect to something you kept doing after you flew home?',
  },
  {
    id: 'sports-injury',
    label: 'The injury, the comeback, the winning point',
    patterns: [
      /\b(tore|torn|ruptured) my (acl|mcl|meniscus|rotator cuff|achilles)\b/i,
      /\bthe (final|winning) (shot|goal|point|buzzer)\b/i,
      /\b(sidelined|benched) .{0,40}\b(taught|learned|realized)\b/i,
      /\bcame back stronger\b/i,
    ],
    redirect: 'The recovery is not the story — thousands of files have it. What did you do with the season you were not playing? Who did you become to the people who were?',
  },
  {
    id: 'immigrant-sacrifice',
    label: 'My parents sacrificed everything',
    patterns: [
      /\bsacrificed everything\b/i,
      /\bcame to this country with (nothing|\$?\d{1,3} (dollars|in their pocket))\b/i,
      /\bthe american dream\b/i,
      /\bworked (two|three|multiple) jobs\b.{0,60}\bso (that )?I could\b/i,
    ],
    // Deliberately NOT marked as a savior risk or as a thing to drop. This is
    // frequently the truest thing in the file. It is flagged only because the
    // SENTENCES are shared, and the fix is specificity, never omission.
    honorsHardship: true,
    redirect: 'Keep it. Replace the summary sentences with the specific ones: the hour, the room, the smell, the thing that was said. Your parents\' story is common in these essays; your Tuesday is not.',
  },
  {
    id: 'grandparent-death',
    label: 'The grandparent who died and set my path',
    patterns: [
      /\b(my )?(grandmother|grandfather|grandma|grandpa|abuela|abuelo|nana)\b.{0,80}\b(passed away|died|lost (his|her) battle)\b/i,
      /\blost (his|her|their) battle with\b/i,
      /\bthat(?:'s| is) when I (knew|decided) I wanted to be a (doctor|physician|nurse)\b/i,
    ],
    honorsHardship: true,
    redirect: 'The death is the reason you say out loud; it is rarely the reason that shows. What did you actually go and do in the two years after — the unglamorous, repeated, boring part? Put that in the middle of the essay.',
  },
  {
    id: 'savior-tutoring',
    label: 'I taught them and it changed their life',
    patterns: [
      /\bI (helped|taught|showed) (them|him|her) (that|how)\b.{0,60}\b(could|can) (do|be) anything\b/i,
      /\bgave (them|him|her) (hope|a voice|a future)\b/i,
      /\bmade a difference in (their|his|her) li(fe|ves)\b/i,
      /\b(underprivileged|less fortunate|at[- ]risk) (kids|children|students|youth)\b/i,
    ],
    saviorRisk: true,
    redirect: 'Flip the direction of the learning. Name one thing the student you tutored taught you, and one thing you were wrong about before you met them.',
  },
  {
    id: 'excellence-treadmill',
    label: 'The résumé in paragraph form',
    patterns: [
      /\bpresident of (three|four|multiple|several)\b/i,
      /\bmaintain(?:ed|ing) a \d\.\d+ (unweighted |weighted )?gpa\b/i,
      /\bwhile (also )?(balancing|juggling)\b.{0,50}\b(varsity|clubs|activities)\b/i,
    ],
    // Section 2.2's opportunity-cost sorter keys off this one specifically: a
    // list of accomplishments with no cost attached is the smooth curve the
    // engine is supposed to interrupt.
    smoothCurve: true,
    redirect: 'A list is not a narrative. Pick the one of these you would have kept if you had been forced to drop the rest, and write about the week you nearly dropped it.',
  },
  {
    id: 'stem-savior',
    label: 'I will cure the disease that took someone',
    patterns: [
      /\bfind (a|the) cure\b/i,
      /\bcure cancer\b/i,
      /\brevolutioni[sz]e (medicine|healthcare|the field)\b/i,
      /\bchange the world\b/i,
    ],
    redirect: 'Scale down to something you have already done. A reader believes the twelve hours you actually spent pipetting; nobody believes the cure.',
  },
];

/**
 * Sentence-level phrases. Weighted lower than tropes — one of these is a nick,
 * a dozen is a voice problem.
 */
export const CLICHE_PHRASES = [
  { id: 'outside-comfort', re: /\b(stepped |step )?(out|outside) of my comfort zone\b/i },
  { id: 'learned-more', re: /\bI learned more (from|about myself)\b/i },
  { id: 'valuable-lesson', re: /\b(valuable|important) lesson\b/i },
  { id: 'taught-me-leadership', re: /\btaught me (valuable )?(leadership|teamwork|resilience|perseverance|time[- ]management)( skills)?\b/i },
  { id: 'little-did-i-know', re: /\blittle did I know\b/i },
  { id: 'at-that-moment', re: /\b(at that|in that) moment,? I (realized|knew|understood)\b/i },
  { id: 'blood-sweat', re: /\bblood,? sweat,? and tears\b/i },
  { id: 'gave-110', re: /\b(gave|give) (it )?(110|one hundred and ten|my all)\b/i,  },
  { id: 'lightbulb', re: /\b(a |the )?light ?bulb (went off|moment)\b/i },
  { id: 'roller-coaster', re: /\b(emotional |a )?roller ?coaster\b/i },
  { id: 'sea-of-faces', re: /\bsea of (faces|people)\b/i },
  { id: 'heart-racing', re: /\bmy heart (was )?(racing|pounding out of my chest)\b/i },
  { id: 'butterflies', re: /\bbutterflies in my stomach\b/i },
  { id: 'never-give-up', re: /\bnever give up\b/i },
  { id: 'shaped-who-i-am', re: /\b(shaped|made) (me into )?who I am today\b/i },
  { id: 'ignited-passion', re: /\b(ignited|sparked) (my|a) (passion|love|interest)\b/i },
  { id: 'countless-hours', re: /\bcountless hours\b/i },
  { id: 'unique-perspective', re: /\b(unique|diverse) perspective\b/i },
  { id: 'well-rounded', re: /\bwell[- ]rounded\b/i },
  { id: 'grew-as-person', re: /\bgrew as a person\b/i },
  { id: 'opened-my-eyes', re: /\bopened my eyes\b/i },
  { id: 'passion-for-helping', re: /\b(passion|desire) for helping (people|others)\b/i },
  { id: 'make-a-difference', re: /\bmake a difference\b/i },
  { id: 'pinnacle-of', re: /\bpinnacle of (academic |scholarly )?(achievement|excellence)\b/i },
  { id: 'prestigious', re: /\b(prestigious|world[- ]renowned|world[- ]class) (institution|university|faculty|professors)\b/i },
  { id: 'beautiful-campus', re: /\b(beautiful|gorgeous|stunning) campus\b/i },
];

/**
 * "Telling" constructions — Section 2.1's linguistic-smoothing deficit.
 *
 * Each of these names an emotion or a virtue instead of staging the moment
 * that would produce it in the reader. The engine's correction is always the
 * same shape: keep the claim, add the scene that earns it.
 */
export const TELLING_MARKERS = [
  { id: 'taught-me', re: /\b(taught|showed) me (the value of|that|how important)\b/i, ask: 'What happened in the ten minutes that taught you? Put the reader in those ten minutes and cut the sentence that summarises them.' },
  { id: 'i-felt', re: /\bI felt (sad|happy|proud|nervous|scared|angry|overwhelmed|excited|grateful)\b/i, ask: 'Name what your body did instead of what you felt. Hands, breath, the thing you could not stop looking at.' },
  { id: 'i-realized', re: /\bI (realized|understood|came to understand) that\b/i, ask: 'Realisations are the reader\'s job. Show the evidence you saw and let them arrive first.' },
  { id: 'i-am-passionate', re: /\bI(?:'m| am) (deeply |truly |very )?passionate about\b/i, ask: 'Passion is unprovable in a sentence and obvious in a schedule. What did you do at an inconvenient hour?' },
  { id: 'this-experience', re: /\bthis experience (taught|showed|gave) me\b/i, ask: 'The reader can see what the experience gave you if you show what you did differently afterwards.' },
  { id: 'it-was-difficult', re: /\bit was (very |extremely |really )?(difficult|hard|challenging)\b/i, ask: 'Difficulty is a verdict. What specifically failed, and what did failing cost you?' },
  { id: 'important-to-me', re: /\b(is|was|has always been) (very |really |so )?important to me\b/i, ask: 'Importance is demonstrated by what you gave up for it. What did you give up?' },
  { id: 'strong-work-ethic', re: /\b(strong|excellent) (work ethic|leadership skills|communication skills)\b/i, ask: 'These are résumé words. Replace with one specific decision only someone with that trait would have made.' },
];

/**
 * Words a reflective, forward-looking paragraph actually contains. Phase 4 of
 * the supplemental storyboard (src/lib/ivy/storyboard.js) checks for these; a
 * closing paragraph with none of them is describing the past, not connecting it
 * to anything.
 */
export const REFLECTION_MARKERS = [
  'now', 'today', 'still', 'since then', 'these days', 'currently',
  'next', 'plan', 'intend', 'hope', 'will', 'continue', 'keep', 'building',
  'want to', 'going to', 'someday', 'eventually', 'future', 'ahead',
  'because of', 'which is why', 'taught', 'changed how', 'differently',
  'carry', 'return to', 'go back', 'apply', 'bring',
];

/**
 * Cluttered constructions. Sweep 3 of the editing pipeline. Each has a literal
 * replacement, because "tighten this" is not an edit a student can act on at
 * eleven at night.
 */
export const CLUTTER_PHRASES = [
  { re: /\bin order to\b/gi, with: 'to' },
  { re: /\bdue to the fact that\b/gi, with: 'because' },
  { re: /\bin spite of the fact that\b/gi, with: 'although' },
  { re: /\bat this point in time\b/gi, with: 'now' },
  { re: /\bfor the purpose of\b/gi, with: 'to' },
  { re: /\bin the event that\b/gi, with: 'if' },
  { re: /\bit is important to note that\b/gi, with: '' },
  { re: /\bthe fact that\b/gi, with: 'that' },
  { re: /\bin today'?s (society|world)\b/gi, with: '' },
  { re: /\bneedless to say\b/gi, with: '' },
  { re: /\bfirst and foremost\b/gi, with: 'first' },
  { re: /\bas a matter of fact\b/gi, with: '' },
  { re: /\ba (large|great) number of\b/gi, with: 'many' },
  { re: /\bhas the ability to\b/gi, with: 'can' },
  { re: /\bmade the decision to\b/gi, with: 'decided to' },
  { re: /\bcame to the realization\b/gi, with: 'realised' },
  { re: /\bvery unique\b/gi, with: 'unique' },
  { re: /\bcompletely (eliminated|finished|destroyed)\b/gi, with: '$1' },
  { re: /\b(really|very|quite|extremely|incredibly|truly|actually|basically|literally|definitely|certainly)\b/gi, with: '' },
];

/**
 * Conflict and stakes markers — Section 2.2.
 *
 * `peer` catches socio-emotional conflict (the friend who stopped speaking to
 * them); `cost` catches opportunity cost (the thing they dropped). An essay
 * with neither is the smooth, unbroken curve of accomplishment the sorter is
 * built to interrupt.
 */
export const STAKES_MARKERS = {
  peer: [
    /\b(friends?|teammates?|classmates?) (stopped|refused|accused|blamed|laughed|turned)\b/i,
    /\b(accused me|blamed me|called me)\b/i,
    /\bno one (spoke to me|sat with me|would)\b/i,
    /\b(argued|fought|clashed|disagreed) with (my|the) (coach|teacher|friend|captain|parents?|father|mother)\b/i,
    /\b(backlash|fallout|rumou?rs?|isolated|ostracis?zed|ostraciz?ed)\b/i,
    /\b(disappointed|let down) (my|our) (parents?|coach|teacher|team)\b/i,
  ],
  cost: [
    /\b(quit|dropped|left|gave up|walked away from|stepped down from|turned down|declined|deferred)\b/i,
    /\b(chose|picked) .{0,40}\b(instead of|over)\b/i,
    /\b(lost|forfeited|sacrificed|missed) (my|the|a) (spot|season|position|title|scholarship|summer|chance)\b/i,
    /\b(failed|rejected|denied|did ?n[o']t get (in|the))\b/i,
    /\bcould ?n[o']t afford\b/i,
  ],
  vulnerability: [
    /\bI cried\b/i, /\bmy hands (shook|were shaking|trembled)\b/i,
    // Exhaustion and falling behind are the register in which most students
    // are actually vulnerable on the page, and the earlier list — built around
    // dramatic single moments — missed all of it. A senior writing about
    // burnout and late assignments is being more exposed than one writing "I
    // cried", and the sorter has to be able to see that.
    /\b(burn(ed)? ?out|burnout|exhaust\w+|struggl\w+|overwhelmed|fell behind|falling behind)\b/i,
    /\b(late and incomplete|piled? up|could ?n[o']t keep up|barely|scraped through)\b/i,
    /\b(empty (stomach|kitchen|fridge)|went without|hungry)\b/i,
    /\b(my )?(scars?|deformit\w+|flaws?|failures?)\b/i,
    /\bI could ?n[o']t (breathe|speak|look|sleep|stop)\b/i,
    /\bI (lied|was wrong|was ashamed|was jealous|was scared|panicked|froze)\b/i,
    /\bI threw up\b/i, /\bI did ?n[o']t tell (anyone|them|him|her)\b/i,
    /\bI wanted to quit\b/i, /\bthrew (it|them) (away|out)\b/i,
  ],
};

/** Every trope and phrase id, so the verify script can assert uniqueness. */
export const ALL_CLICHE_IDS = [
  ...OPENING_CLICHES.map(c => c.id),
  ...NARRATIVE_TROPES.map(t => t.id),
  ...CLICHE_PHRASES.map(c => c.id),
];
