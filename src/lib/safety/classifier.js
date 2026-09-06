// ─────────────────────────────────────────────────────────────────────────────
// The safety classification pass.
//
// ── Why this is a separate pass and not a paragraph in the system prompt ─────
// Medabrain talks privately to thirteen-to-seventeen-year-olds about the single
// most emotionally loaded subject in their lives, and — by design — a coach
// conversation is never shown to a parent. That privacy is right, and it means
// there is no adult downstream of this code. If a disclosure is missed here, it
// is missed entirely.
//
// A system-prompt instruction ("if the student seems to be in crisis, offer
// resources") cannot carry that weight, for three reasons that are properties of
// how the product is built rather than opinions about models:
//
//   1. IT IS ONE INSTRUCTION AMONG A HUNDRED. buildCoachSystemPrompt produces
//      several thousand characters — a persona, a stance, a knowledge policy, an
//      action protocol, a whole tracked record. A safety line inside that is
//      competing for attention with "never say 'great start'", and it competes
//      on every single turn.
//   2. IT IS NOT OBSERVABLE. A prompt instruction that silently fails to fire
//      produces a normal-looking reply. There is nothing to log, nothing to
//      review, and no way to find out it happened. A classifier returns a value,
//      and a value can be logged, counted, reviewed and tested.
//   3. IT CANNOT BE TESTED. The whole bottom half of this file exists to be run
//      by scripts/verifySafety.mjs against fixed phrasings — crisis, ambiguous,
//      ordinary academic stress, and clearly benign — on every build. You cannot
//      write that test against a sentence buried in a prompt.
//
// ── The two-stage design ─────────────────────────────────────────────────────
// STAGE 1 (this file, synchronous, deterministic): a lexical screen tuned for
// RECALL, not precision. It is allowed to be over-inclusive, because its output
// is a gate rather than a verdict. It runs on every message, costs nothing, and
// works offline — which matters, since a network failure must not be able to
// switch the safety layer off.
//
// STAGE 2 (assessMessage below, asynchronous): a dedicated model call at
// temperature 0 with its own tiny prompt, its own purpose ('safety') and its own
// key pool, whose only job is to return a tier. It provides the precision the
// lexical screen deliberately lacks — it is what tells "this chem final is
// killing me" from "I don't want to be here anymore".
//
// Two rules govern how the stages combine, and both exist because of a specific
// failure:
//   • A stage-1 CRISIS hit is never downgraded by stage 2. An explicit statement
//     of intent is not something a classifier gets to talk us out of.
//   • A stage-2 failure (offline, rate limited, malformed) never clears a
//     stage-1 hit. The safe direction is the only direction a failure moves in.
//
// ── The lower tier is the feature, not a footnote ───────────────────────────
// ACADEMIC_STRESS exists because a safety layer with one threshold is a safety
// layer that fires on "I'm so behind in chem", tells a sixteen-year-old about a
// suicide hotline, and teaches them that this app panics. They stop typing
// honestly, and the layer that was supposed to catch a real disclosure has
// destroyed the only channel it had. Ordinary overwhelm therefore gets its own
// tier with its own response: acknowledge it, offer to scale the weekly goal
// back, help re-plan. That is a coaching move, not a crisis move.
//
// ── Privacy ──────────────────────────────────────────────────────────────────
// Nothing in this module retains, returns or logs the student's words. The
// result carries pattern IDENTIFIERS ('crisis.self_harm_intent'), never the text
// that matched them. That is what makes it safe for the review queue in
// src/lib/safety/log.js to record an event at all.
// ─────────────────────────────────────────────────────────────────────────────

/** Ordered, comparable severities. Higher is more urgent; the tiers are exhaustive. */
export const SEVERITY = Object.freeze({ NONE: 0, ACADEMIC_STRESS: 1, DISTRESS: 2, CRISIS: 3 });

export const TIER = Object.freeze({
  NONE: 'none',
  ACADEMIC_STRESS: 'academic_stress',
  DISTRESS: 'distress',
  CRISIS: 'crisis',
});

export const TIER_SEVERITY = Object.freeze({
  [TIER.NONE]: SEVERITY.NONE,
  [TIER.ACADEMIC_STRESS]: SEVERITY.ACADEMIC_STRESS,
  [TIER.DISTRESS]: SEVERITY.DISTRESS,
  [TIER.CRISIS]: SEVERITY.CRISIS,
});

const tierFor = (severity) => (
  severity >= SEVERITY.CRISIS ? TIER.CRISIS
    : severity === SEVERITY.DISTRESS ? TIER.DISTRESS
      : severity === SEVERITY.ACADEMIC_STRESS ? TIER.ACADEMIC_STRESS
        : TIER.NONE
);

// ── Normalization ────────────────────────────────────────────────────────────
// Straight and curly apostrophes are folded to one form so a pattern does not
// have to spell both, and repeated whitespace is collapsed so a phrase split
// across a line break still matches. Nothing else is altered: no stemming, no
// stopword removal, no spell correction — every one of those makes the patterns
// below harder to reason about for a gain that is not worth having here.
function normalize(text) {
  return String(text || '')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

// ── Stage 1, part A: unambiguous crisis language ─────────────────────────────
// Every pattern here describes intent or action toward the student's own life or
// body. Note what is deliberately ABSENT: the bare word "die", "dead", "kill me"
// and "I'd rather die", all of which are ordinary teenage hyperbole about
// homework. "kill myself" is matched; "killing me" is not, and that single
// choice is the difference between a classifier that works and one that fires on
// half the messages a stressed junior sends.
const CRISIS_PATTERNS = [
  { id: 'crisis.self_harm_intent', re: /\b(kill(ing)?|killed)\s+myself\b|\bcommit(ting)?\s+suicide\b|\bsuicidal\b|\btake\s+my\s+own\s+life\b|\bend(ing)?\s+my\s+life\b/ },
  { id: 'crisis.wish_to_die', re: /\bi\s+(want|wanna|need)\s+to\s+(die|be\s+dead|stop\s+existing)\b|\bi\s+wish\s+i\s+(was|were)\s+dead\b/ },
  // The clause-ending anchor is doing real work: without it, "I don't want to
  // live in a dorm" and "I don't want to be here for the whole assembly" are
  // both crisis hits, and a classifier that fires on those is one nobody can
  // trust when it fires on the real thing.
  { id: 'crisis.not_be_here', re: /\b(don'?t|do\s+not)\s+want\s+to\s+(be\s+here|be\s+alive|exist|wake\s+up|live)\s*(anymore|any\s+more)?\s*([.,!?]|$)|\bnot\s+(be|being)\s+(here|alive)\s+anymore\b/ },
  { id: 'crisis.self_injury', re: /\b(hurt(ing)?|harm(ing)?|cut(ting)?)\s+myself\b|\bself[-\s]?harm(ing|ed)?\b|\bburn(ing)?\s+myself\b/ },
  { id: 'crisis.burden', re: /\b(everyone|everybody|they|my\s+(family|parents|mom|dad))\s+(would\s+be|are|is)\s+better\s+off\s+without\s+me\b|\bbetter\s+off\s+(dead|if\s+i\s+(wasn'?t|was\s+not|weren'?t)\s+(here|around|born))\b/ },
  { id: 'crisis.no_reason_to_live', re: /\bno\s+(reason|point)\s+(to|in)\s+(live|living|being\s+alive|go(ing)?\s+on|wak(e|ing)\s+up)\b/ },
  { id: 'crisis.want_it_to_stop', re: /\bi\s+(just\s+)?want\s+(it\s+all|it|everything|all\s+of\s+(it|this))\s+to\s+(stop|end|be\s+over)\b/ },
  { id: 'crisis.means', re: /\bhang\s+myself\b|\bjump\s+off\s+(a|the)\b|\bhow\s+many\s+(\w+\s+)?(pills|tablets)\b|\boverdose\s+on\b|\bswallow(ed|ing)?\s+(a\s+)?(bunch|bottle|handful)\s+of\s+pills\b/ },
  // Somebody else is the subject. Still crisis: a student carrying a friend's
  // disclosure needs exactly the same phone numbers, and often needs them more
  // urgently, because they are the only person who knows.
  { id: 'crisis.third_party', re: /\b(kill(ing)?|hurt(ing)?|harm(ing)?|cut(ting)?)\s+(him|her|them)self\b|\b(wants?|wanted|talking\s+about|thinking\s+about)\s+(to\s+)?(die|dying|killing\s+themselves|suicide)\b|\bis\s+suicidal\b/ },
  { id: 'crisis.goodbye', re: /\bthis\s+is\s+(my\s+)?goodbye\b|\bwon'?t\s+be\s+(around|here)\s+(much\s+longer|after)\b/ },
];

// ── Stage 1, part B: distress that is about the self, not the workload ───────
// Split into two classes on purpose. CORE phrases are about worth, hope and
// belonging — they are never reinterpreted as coursework stress no matter how
// much chemistry is in the same sentence, because "I hate myself for failing
// chem" is a sentence about the student and only incidentally about chem. SOFT
// phrases are overwhelm-shaped and genuinely ambiguous: identical words carry a
// disclosure in one message and a bad week in another, so they are the ones the
// academic-context rule below is allowed to move down a tier.
const DISTRESS_CORE_PATTERNS = [
  { id: 'distress.self_worth', re: /\bi\s+(hate|despise|loathe)\s+(myself|my\s+life)\b|\bi'?m\s+(worthless|a\s+failure\s+at\s+everything|useless|pathetic|broken|a\s+burden)\b|\bi\s+ruin\s+everything\b/ },
  { id: 'distress.hopeless', re: /\bhopeless\b|\bnothing\s+(matters|will\s+ever\s+get\s+better)\b|\bit'?s\s+never\s+going\s+to\s+get\s+better\b|\bwhat('?s|\s+is)\s+the\s+point\s+(of\s+any\s+of\s+(it|this))?\s*$|\bwhat('?s|\s+is)\s+the\s+point\s+of\s+(anything|living|trying\s+anymore)\b/ },
  { id: 'distress.isolation', re: /\bno\s+one\s+(would\s+)?(care|notice|miss\s+me)\b|\bnobody\s+(cares|would\s+care|would\s+notice)\b|\bi\s+have\s+no\s+one\s+to\s+talk\s+to\b|\bi\s+feel\s+(so\s+)?(alone|empty|numb|invisible|trapped)\b/ },
  // "panic attack" as a bare topic is a lesson, not a disclosure — a health-
  // careers curriculum teaches it. What makes it core is the student putting
  // themselves inside it.
  { id: 'distress.acute', re: /\b(i'?m\s+having|i\s+(had|have|keep\s+having|just\s+had)|having)\s+(a\s+)?panic\s+attacks?\b|\bi\s+can'?t\s+breathe\b|\bi\s+(get|have)\s+panic\s+attacks\b/ },
  { id: 'distress.crying', re: /\bcan'?t\s+stop\s+crying\b|\bcry(ing)?\s+(myself\s+to\s+sleep|every\s+(night|day))\b/ },
  { id: 'distress.disclosure_frame', re: /\bi\s*('?ve|\s+have)?\s*(never\s+)?told\s+(anyone|nobody|no\s+one)\b|\bcan\s+i\s+tell\s+you\s+something\s+(no\s+one|nobody)\s+knows\b/ },
];

const DISTRESS_SOFT_PATTERNS = [
  { id: 'distress.cant_go_on', re: /\bi\s+(can'?t|cannot)\s+(do|take|handle)\s+(this|it)\s+anymore\b|\bi\s+can'?t\s+go\s+on\b/ },
  { id: 'distress.giving_up', re: /\bi\s+(want\s+to\s+|wanna\s+)?give\s+up\s+on\s+everything\b|\bi'?m\s+(done|over\s+it)\s+with\s+everything\b|\bwhy\s+(do\s+i\s+even\s+)?(bother|try)\s+anymore\b/ },
  { id: 'distress.breaking', re: /\bi'?m\s+(falling\s+apart|breaking\s+down|losing\s+it)\b|\bi\s+feel\s+like\s+i'?m\s+drowning\b/ },
  { id: 'distress.worthless_at', re: /\bi'?m\s+(so\s+)?(stupid|dumb|not\s+smart\s+enough|never\s+going\s+to\s+be\s+good\s+enough)\b/ },
  { id: 'distress.tired_of_everything', re: /\bi'?m\s+(so\s+)?tired\s+of\s+(everything|all\s+of\s+(this|it)|it\s+all)\b/ },
  { id: 'distress.how_much_longer', re: /\bhow\s+much\s+longer\s+i\s+can\s+(keep\s+going|do\s+this|last|hold\s+on)\b/ },
];

// ── Stage 1, part C: ordinary academic stress and burnout ────────────────────
// The lowest tier, and the one most messages that reach this classifier at all
// will land in. Nothing here is a safety event; it is a coaching moment with a
// specific, concrete offer attached (scale the weekly goal back, re-plan the
// week) rather than a hotline.
const ACADEMIC_STRESS_PATTERNS = [
  { id: 'stress.burnout', re: /\bburn(t|ed)\s+out\b|\bburnout\b|\brunning\s+on\s+(empty|fumes)\b/ },
  { id: 'stress.overwhelmed', re: /\b(so|really|completely|totally|super)\s+(stressed|overwhelmed|exhausted|fried|swamped)\b|\bstressed\s+(out\s+)?about\b|\bi'?m\s+overwhelmed\b/ },
  { id: 'stress.behind', re: /\bi'?m\s+(so\s+|really\s+|way\s+)?behind\b|\bi\s+can'?t\s+keep\s+up\b|\bfalling\s+behind\b/ },
  { id: 'stress.workload', re: /\btoo\s+much\s+(work|homework|studying|to\s+do)\b|\bno\s+time\s+for\s+anything\b|\bnot\s+enough\s+hours\s+in\s+the\s+day\b|\bi\s+have\s+no\s+free\s+time\b/ },
  { id: 'stress.sleep', re: /\bhaven'?t\s+slept\b|\bup\s+(until|till|til)\s+\d|\bonly\s+(got\s+)?\d\s+hours\s+of\s+sleep\b/ },
  { id: 'stress.pressure', re: /\btoo\s+much\s+pressure\b|\bmy\s+parents\s+(expect|are\s+pushing)\b|\beveryone\s+expects\s+me\s+to\b|\bi'?m\s+scared\s+i'?ll\s+(fail|disappoint)\b/ },
  { id: 'stress.motivation', re: /\bcan'?t\s+(focus|concentrate|make\s+myself\s+study)\b|\bi\s+keep\s+procrastinating\b|\blost\s+(all\s+)?motivation\b/ },
];

// Words that say the sentence is about school rather than about the student's
// life. Used only to move a SOFT distress phrase down a tier — never to move a
// CORE phrase or a crisis phrase anywhere.
const ACADEMIC_CONTEXT_RE = /\b(homework|assignment|essay|paper|test|exam|quiz|final|finals|midterm|class|classes|course|grade|grades|gpa|sat|act|ap|honors|semester|study|studying|studied|schedule|workload|deadline|application|applications|college\s+apps|chem|chemistry|bio|biology|physics|calc|calculus|math|english|history|lab|labs|practice|flashcards|pathway|unit|lesson)\b/;

// A question about a subject rather than a statement about a self. This is a
// MEDICAL-CONTENT app: "explain why untreated depression raises suicide risk" is
// a legitimate academic question a student may need answered for a lesson, and a
// classifier that treats it as a disclosure both fails the student and trains
// them to avoid the topic. The gate is deliberately narrow — an explanatory
// opener AND no first-person self-reference anywhere in the message.
const ACADEMIC_FRAMING_RE = /^(explain|what\s+(is|are|causes|happens)|why\s+(do|does|is|are)|how\s+(do|does|is|are|can)|define|describe|compare|tell\s+me\s+about|quiz\s+me|test\s+me\s+on|summari[sz]e)\b/;
// Deliberately WITHOUT bare "me" and "mine". "Tell me about", "quiz me on",
// "explain to me" are all addressed to the coach rather than statements about
// the student, and counting them as first person makes every politely phrased
// academic question look personal — which is how "quiz me on the symptoms of
// diabetes" ends up treated as a student asking about their own health.
const FIRST_PERSON_RE = /\b(i|i'?m|i'?ve|i'?ll|i'?d|my|myself)\b/;

/** True when the message reads as a question about the world, not a statement about the student. */
export function isAcademicFraming(text) {
  const t = normalize(text);
  return ACADEMIC_FRAMING_RE.test(t) && !FIRST_PERSON_RE.test(t);
}

// Somebody else is the subject. Resources are still surfaced — a student asking
// how to help a friend who is talking about suicide needs exactly the same phone
// numbers — but the review queue records the distinction, because "this student
// disclosed" and "this student is carrying somebody else's disclosure" are two
// different things for whoever reads the queue.
const THIRD_PARTY_RE = /\bmy\s+(friend|best\s+friend|sister|brother|cousin|classmate|boyfriend|girlfriend|mom|dad|parent)\b|\bsomeone\s+i\s+know\b|\ba\s+friend\s+of\s+mine\b/;

function matchAll(patterns, text) {
  return patterns.filter(p => p.re.test(text)).map(p => p.id);
}

/**
 * Stage 1. Pure, synchronous, dependency-free — safe to call on every keystroke
 * if a caller ever wants to, and safe to call with no network.
 *
 * @returns {{tier: string, severity: number, signals: string[], academicContext: boolean,
 *            thirdParty: boolean, academicFraming: boolean, needsModelPass: boolean}}
 *          `signals` are pattern identifiers only. The student's text never leaves this function.
 */
export function screenMessage(text) {
  const t = normalize(text);
  const empty = {
    tier: TIER.NONE, severity: SEVERITY.NONE, signals: [],
    academicContext: false, thirdParty: false, academicFraming: false, needsModelPass: false,
  };
  if (!t) return empty;

  const academicFraming = isAcademicFraming(text);
  const academicContext = ACADEMIC_CONTEXT_RE.test(t);
  const thirdParty = THIRD_PARTY_RE.test(t);

  const crisis = matchAll(CRISIS_PATTERNS, t);
  const core = matchAll(DISTRESS_CORE_PATTERNS, t);
  const soft = matchAll(DISTRESS_SOFT_PATTERNS, t);
  const stress = matchAll(ACADEMIC_STRESS_PATTERNS, t);

  // A question with no first person in it is usually about the subject matter
  // rather than about the student — including when the subject matter is suicide,
  // which in a medical-content app it sometimes legitimately is.
  //
  // "Usually", and the exception is load-bearing. An explanatory opener is a
  // shape, not a meaning: "what is the point of anything" opens like a question
  // about the world and is not one. So framing suppresses the SOFT and STRESS
  // bands, where it is a reliable signal, and never suppresses an explicit crisis
  // phrase or a core statement about the student's own worth or hope. A gate that
  // can be walked through by starting a sentence with "what is" is not a gate.
  if (academicFraming && !crisis.length && !core.length) {
    return { ...empty, academicFraming: true, academicContext };
  }

  if (crisis.length) {
    return {
      tier: TIER.CRISIS, severity: SEVERITY.CRISIS,
      signals: [...crisis, ...core, ...soft],
      academicContext, thirdParty, academicFraming: false,
      // Nothing the model could say would lower this, so there is no reason to
      // spend a call or the latency asking.
      needsModelPass: false,
    };
  }

  if (core.length) {
    return {
      tier: TIER.DISTRESS, severity: SEVERITY.DISTRESS,
      signals: [...core, ...soft, ...stress],
      academicContext, thirdParty, academicFraming: false,
      needsModelPass: true,
    };
  }

  if (soft.length) {
    // The over-triggering guard, in one line. An overwhelm-shaped phrase in a
    // message that is visibly about coursework is coursework stress; the same
    // phrase with nothing academic around it is a person telling you something.
    const downgraded = academicContext || stress.length > 0;
    return {
      tier: downgraded ? TIER.ACADEMIC_STRESS : TIER.DISTRESS,
      severity: downgraded ? SEVERITY.ACADEMIC_STRESS : SEVERITY.DISTRESS,
      signals: [...soft, ...stress],
      academicContext, thirdParty, academicFraming: false,
      // Worth a second opinion either way: this is exactly the band where the
      // lexical screen is least trustworthy in both directions.
      needsModelPass: true,
    };
  }

  if (stress.length) {
    return {
      tier: TIER.ACADEMIC_STRESS, severity: SEVERITY.ACADEMIC_STRESS,
      signals: stress,
      academicContext, thirdParty, academicFraming: false,
      // Ordinary stress is common and cheap to get right; a model call on every
      // "I'm so behind" is latency spent to confirm what is already known. The
      // model pass is reserved for the bands where the answer is in doubt.
      needsModelPass: false,
    };
  }

  return { ...empty, academicContext, thirdParty };
}

// ── Stage 2: the dedicated model pass ────────────────────────────────────────
// Its own prompt, its own purpose, temperature 0, JSON out, ~40 tokens. It is
// given one job and no persona — this is a classifier, not a coach, and the two
// must not share a prompt (that is the failure mode this whole file exists to
// avoid).
export const SAFETY_CLASSIFIER_PROMPT = `You are a safety classifier for a study app used by US high school students aged 13-17. You do not talk to the student and you never write a reply. You read one message and return one JSON object.

Classify the message into exactly one tier:

"crisis" — the student expresses suicidal thoughts, intent or a plan, self-harm (current, recent or intended), a wish to die or not exist, believing others would be better off without them, or immediate danger. Also use this when the student is describing another person in that state.

"distress" — real emotional distress without any of the above: hopelessness, worthlessness, self-hatred, feeling utterly alone or numb, panic, uncontrollable crying, or the sense that nothing will get better. The subject is the student's life or self, not their workload.

"academic_stress" — ordinary school pressure and burnout: behind on work, overwhelmed by a schedule, exhausted, procrastinating, scared of failing a class or disappointing parents, no time, too much to do. This is the correct answer for the large majority of stressed messages. Hyperbole about schoolwork ("this chem final is killing me", "I'm dying, I have three tests") is academic_stress or none — never crisis.

"none" — anything else, including academic questions ABOUT depression, suicide, self-harm or mental illness as subject matter, which are legitimate in a health-careers curriculum.

Rules: judge only what is written; do not speculate about what a message might mean. Do not diagnose. When genuinely torn between crisis and distress, choose crisis. When torn between distress and academic_stress, look at whether the sentence is about the student or about their work.

Respond with JSON only, no prose: {"tier":"crisis|distress|academic_stress|none","confidence":0.0-1.0}`;

const VALID_TIERS = new Set([TIER.CRISIS, TIER.DISTRESS, TIER.ACADEMIC_STRESS, TIER.NONE]);

/** Parses the classifier's reply defensively. Returns null on anything unusable. */
export function parseClassifierReply(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let obj;
  try { obj = JSON.parse(text.slice(start, end + 1)); } catch { return null; }
  const tier = typeof obj?.tier === 'string' ? obj.tier.trim().toLowerCase() : null;
  if (!VALID_TIERS.has(tier)) return null;
  const confidence = Number(obj?.confidence);
  return {
    tier,
    severity: TIER_SEVERITY[tier],
    confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : null,
  };
}

/**
 * Runs stage 2. Returns null on every failure — offline, rate limited, timed
 * out, malformed — because a classifier that cannot answer must not be able to
 * clear a stage-1 hit. The caller (assessMessage) takes the higher of the two.
 *
 * The message is sent for classification and nothing else: no student profile,
 * no tracked data, no conversation history. It is not stored by this app at
 * either end.
 */
export async function classifyWithModel(text, { signal = null, timeoutMs = 6000, fetchImpl = null } = {}) {
  const message = String(text || '').trim();
  if (!message) return null;
  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!doFetch) return null;

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  // The caller's own signal still wins if it fires first.
  if (signal && controller) signal.addEventListener('abort', () => controller.abort(), { once: true });

  try {
    const res = await doFetch('/api/groq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: SAFETY_CLASSIFIER_PROMPT,
        message: message.slice(0, 2000),
        purpose: 'safety',
        tier: 'guide',
        maxTokens: 600,   // gpt-oss bills its reasoning against this budget; 600 leaves room to think and still emit the object
        temperature: 0,
        jsonMode: true,
        // A classification must never be served from a cache keyed on someone
        // else's identical sentence — not for correctness (it would be right)
        // but because a cache hit skips the review-queue event that a real
        // detection is supposed to produce.
        noCache: true,
      }),
      signal: controller ? controller.signal : signal,
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return parseClassifierReply(data?.content);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * The whole pass, as one call. This is what a chat surface uses.
 *
 * Returns the final tier plus everything the review queue and the response
 * builder need — and, again, never the student's words.
 *
 * `runModelPass` exists so a caller with a hard latency budget (or a test) can
 * pin the assessment to stage 1 alone. Doing so weakens precision, never safety:
 * stage 1 is the over-inclusive half.
 */
export async function assessMessage(text, { runModelPass = true, signal = null, fetchImpl = null } = {}) {
  const screen = screenMessage(text);

  if (!runModelPass || !screen.needsModelPass) {
    return { ...screen, source: 'screen', modelTier: null, modelConfidence: null };
  }

  const model = await classifyWithModel(text, { signal, fetchImpl });
  if (!model) {
    return { ...screen, source: 'screen', modelTier: null, modelConfidence: null, modelFailed: true };
  }

  // Take the higher of the two, always. The model can escalate an ambiguous
  // phrase the lexicon read as ordinary stress; it cannot talk the lexicon down
  // from something it matched explicitly.
  const severity = Math.max(screen.severity, model.severity);
  return {
    ...screen,
    tier: tierFor(severity),
    severity,
    source: model.severity > screen.severity ? 'model' : 'screen',
    modelTier: model.tier,
    modelConfidence: model.confidence,
  };
}

// ── The medical scope boundary ───────────────────────────────────────────────
// Not a severity tier and deliberately not part of the tier ladder: a student
// asking whether their rash is anything is not in distress, they are asking the
// wrong software a real question. It is classified here because it is the same
// kind of judgment — is this sentence about the subject matter, or about this
// person — and because both answers need the same test suite.
//
// The rule the product commits to, and the prompt block in ./prompts.js
// enforces: physiology, pathophysiology and disease mechanism are taught freely
// as academic content; nothing is ever diagnosed; a student's own symptoms, labs
// or medications are never interpreted; personal health questions go to a
// clinician or a trusted adult.
const PERSONAL_HEALTH_SUBJECT_RE = /\b(i|i'?m|i'?ve|my|myself)\b|\bmy\s+(mom|mother|dad|father|sister|brother|grandma|grandmother|grandpa|grandfather|friend|cousin|aunt|uncle)\b/;
const MEDICAL_TOPIC_RE = /\b(symptom|symptoms|rash|lump|mole|pain|hurts|aches?|headaches?|migraine|dizzy|dizziness|nausea|fever|bleeding|bruis(e|ing)|swollen|swelling|numb(ness)?|chest\s+pain|palpitations|heart\s+rate|blood\s+pressure|anemia|anemic|diagnos(is|ed|e)|condition|disorder|syndrome|lab\s+(result|results|work)|bloodwork|blood\s+work|test\s+results|mri|ct\s+scan|x-?ray|ekg|ecg|biopsy|prescription|prescribed|medication|medications|meds|dose|dosage|\d+\s*mg\b|side\s+effects?|antibiotics?|inhaler|insulin|birth\s+control|antidepressant|adderall|ozempic|therapy|therapist|psychiatrist|adhd|anxiety|depression|eating\s+disorder|anorexia|bulimia|concussion|asthma|diabetes|cancer|tumor)\b/;
const PERSONAL_HEALTH_ASK_RE = /\b(do\s+i\s+have|does\s+(my|he|she|they)\s+have|should\s+i\s+(take|stop|see|go\s+to)|is\s+(this|it|that)\s+(normal|serious|bad|dangerous)|what'?s\s+wrong\s+with\s+(me|my)|am\s+i\s+(ok|okay|dying|sick)|what\s+do\s+my\s+(labs?|results?|numbers?)\s+mean|can\s+you\s+(diagnose|tell\s+me\s+what\s+i\s+have)|is\s+my\s+\w+\s+(normal|high|low)|how\s+much\s+\w+\s+should\s+i\s+take)\b/;

/**
 * True when a message is asking about a real person's health rather than about
 * how the body or a disease works.
 *
 * Two ways in, because students ask both ways: an explicit personal ask ("do I
 * have", "should I stop taking") on its own, or a medical topic carried by a
 * first-person/family subject. Academic framing (an explanatory question with no
 * first person in it) always wins — "how does insulin resistance develop" is a
 * lesson, and answering it fully is the product working correctly.
 */
export function isPersonalMedicalQuestion(text) {
  const t = normalize(text);
  if (!t) return false;
  if (isAcademicFraming(text)) return false;
  if (PERSONAL_HEALTH_ASK_RE.test(t)) return true;
  return MEDICAL_TOPIC_RE.test(t) && PERSONAL_HEALTH_SUBJECT_RE.test(t);
}
