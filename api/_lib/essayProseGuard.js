// ─────────────────────────────────────────────────────────────────────────────
// The essay-integrity prose guard.
//
// MedSchoolPrep's promise about essays is not a preference and not a tone: this
// product critiques, questions, structures and pushes, and it does not produce
// prose a student could submit. src/lib/aiPolicy.js states that to the student,
// in the workspace, above their draft. src/lib/essayMode.js states it to the
// model. This file is what makes it true when both of those fail — because a
// prompt is a request and a student who wants an essay written has all evening
// to phrase the request differently.
//
// ── Why word count alone cannot be the rule ─────────────────────────────────
// The naive guard is "block any long reply". It does not survive contact with
// the feature: a real critique is legitimately several hundred words — a
// diagnosis, quoted evidence, a revision plan — and capping that turns the
// product off. What has to be detected is not LENGTH, it is VOICE.
//
// Coaching prose and ghostwritten prose are trivially distinguishable, and the
// distinguishing feature is who the sentences are about. A critique addresses
// the student: "your second paragraph tells me nothing", "what actually happened
// that day?". Essay prose is the student's own first-person narrative with no
// reader in it: "I still remember the smell of the hallway outside her room."
// So the test below is: a continuous block, longer than a short illustrative
// fragment, written in first-person singular, addressing nobody. That is an
// essay paragraph, and there is no legitimate reason for this surface to emit
// one.
//
// ── Why it lives under api/_lib ─────────────────────────────────────────────
// It is imported by BOTH api/groq.js (which enforces it on the response, where
// it cannot be edited out from a browser) and the client (which uses the same
// function to reason about its own surface). Client-side enforcement alone would
// be theatre — the whole point of a hard block is that devtools cannot reach it
// — so the canonical copy sits with the server code and the client imports it,
// rather than the two keeping separate definitions that drift.
//
// Pure functions, no imports, no state. Everything here is exercised by
// scripts/verifyEssayIntegrity.mjs.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single illustrative fragment is allowed — "you could write 'the hallway
 * smelled like bleach' instead of 'it was a hospital'" is a teaching move and
 * demonstrating it is worth more than describing it. Twenty-five words is a
 * long sentence and nothing like a paragraph, and it is deliberately short
 * enough that nothing that fits under it is usable as submitted work.
 */
export const FRAGMENT_MAX_WORDS = 25;

/**
 * Across a whole reply, in case a model splits an essay into a run of short
 * paragraphs to slip under the per-block limit. Forty-five words in the
 * student's own voice is not quite two fragments; it is nowhere near an opening.
 */
export const REPLY_MAX_NARRATIVE_WORDS = 45;

// No /g flag: a global regex carries lastIndex between .test() calls, which
// would make this function's answer depend on how many times it had been
// called before — the kind of bug that shows up as one reply in five getting
// through the guard.
const FIRST_PERSON_RE = /\b(i|i'm|im|i've|i'd|i'll|my|me|myself|mine)\b/i;
const SECOND_PERSON_RE = /\b(you|you're|your|yours|yourself)\b/i;

const countWords = (s) => (String(s || '').trim().match(/\S+/g) || []).length;

/** Strips markdown decoration so a block is judged on its words, not its syntax. */
function stripMarkdown(block) {
  return String(block || '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/[*_`]/g, '')
    .trim();
}

/**
 * Splits a reply into the units a reader experiences as continuous prose: blank
 * line separated paragraphs, and each list item on its own. A seven-bullet list
 * of critiques is seven blocks and none of them is an essay; a single 200-word
 * paragraph in the student's voice is one block and is.
 */
export function splitBlocks(text) {
  const paragraphs = String(text || '').split(/\n\s*\n/);
  const blocks = [];
  for (const p of paragraphs) {
    const lines = p.split('\n');
    // A run of list items is item-by-item; anything else stays whole, because a
    // paragraph broken by soft line wraps is still one paragraph.
    const isList = lines.length > 1 && lines.every(l => /^\s*([-*+]|\d+[.)])\s+/.test(l) || !l.trim());
    if (isList) blocks.push(...lines.filter(l => l.trim()));
    else if (p.trim()) blocks.push(p);
  }
  return blocks;
}

/**
 * True when a block is written in the student's own voice rather than addressed
 * to them — the VOICE half of the test, with no length in it.
 *
 * Three conditions, all required:
 *   • NO SECOND PERSON anywhere in the block. This is the load-bearing one: a
 *     sentence containing "you" or "your" is addressed to the student, and a
 *     paragraph addressed to the student is not a paragraph they can submit.
 *   • NOT MOSTLY QUESTIONS. An essay is not a run of questions, and asking
 *     sharpening questions is the entire job of this surface.
 *   • AT LEAST ONE first-person marker, which is what makes it narrative rather
 *     than an abstract observation.
 */
export function hasEssayVoice(block) {
  const text = stripMarkdown(block);
  if (!countWords(text)) return false;
  if (SECOND_PERSON_RE.test(text)) return false;
  // Mostly-interrogative blocks are coaching however long they run.
  const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim());
  const questions = sentences.filter(s => s.trim().endsWith('?')).length;
  if (sentences.length && questions / sentences.length >= 0.5) return false;
  return FIRST_PERSON_RE.test(text);
}

export function isNarrativeProse(block) {
  const text = stripMarkdown(block);
  // Two conditions rather than one: the VOICE test above says this is essay
  // prose rather than coaching, and the length says it is a paragraph rather
  // than the one illustrative fragment the policy allows.
  return countWords(text) > FRAGMENT_MAX_WORDS && hasEssayVoice(block);
}

/**
 * Inspects a whole reply.
 *
 * @returns {{ blocked: boolean, reason: string|null, narrativeWords: number, longestBlockWords: number }}
 */
export function inspectEssayReply(text) {
  const blocks = splitBlocks(text);
  let narrativeWords = 0;
  let longestBlockWords = 0;
  let blocked = false;
  let reason = null;

  for (const block of blocks) {
    // Accumulated on VOICE alone, deliberately. A model that has decided to
    // write the essay anyway does not need long paragraphs to do it — four
    // short ones in the student's voice are still an opening, and a rule that
    // only measures the longest block is a rule with a trivial workaround.
    if (!hasEssayVoice(block)) continue;
    const words = countWords(stripMarkdown(block));
    narrativeWords += words;
    if (words > FRAGMENT_MAX_WORDS) {
      longestBlockWords = Math.max(longestBlockWords, words);
      if (!blocked) { blocked = true; reason = 'continuous_prose_block'; }
    }
  }

  if (!blocked && narrativeWords > REPLY_MAX_NARRATIVE_WORDS) {
    blocked = true;
    reason = 'cumulative_narrative';
  }
  return { blocked, reason, narrativeWords, longestBlockWords };
}

/**
 * What the student gets instead, when the guard fires.
 *
 * Warm, not scolding, and — the part that matters — it does not end the
 * conversation. A refusal that leaves a student staring at the same blank
 * paragraph has helped nobody and is exactly the moment they go and paste the
 * prompt somewhere with no policy at all. So it declines in one sentence, says
 * why in terms of what it costs THEM rather than what the rules say, and
 * immediately offers the thing they actually need.
 */
export const ESSAY_DECLINE_MESSAGE = `I'm not going to write that part for you — not because of a rule, but because an essay an admissions reader can tell you didn't write is worse than a rough one you did. What I can do is get you to the thing you're actually trying to say, faster than you'd get there alone.

So: tell me about the moment you had in mind. Not the lesson you learned from it — what actually happened. Where were you, what did you notice, and what were you thinking that you probably wouldn't say out loud?

Give me that in whatever messy form it comes out, and I'll tell you which parts of it are worth an essay and which are the parts everybody writes.`;

// Phrasings that are asking for the writing itself. Used to sharpen the model's
// instruction for that turn, NOT to auto-refuse: a false positive that hard-
// refuses a student who asked something reasonable is its own failure, and the
// guard above is what actually holds the line.
const GHOSTWRITE_ASK_RE = /\b(write|draft|rewrite|re-?write|compose|generate|produce|finish|complete|fix\s+up|polish)\s+((me|my|the|this|it|a|an|us|some)\s+){0,3}(essay|personal\s+statement|supplement|supplemental|paragraph|intro|introduction|opening|conclusion|ending|hook|first\s+line|sentence|draft|response)\b|\b(can|could|will|would)\s+you\s+(just\s+)?(write|draft|rewrite|word)\s+(it|this|that|mine)\b|\bwrite\s+it\s+for\s+me\b|\bgive\s+me\s+(a|an|the)\s+(draft|opening|intro|hook|version)\b|\bhow\s+would\s+you\s+(write|phrase|word)\s+(it|this|that|my)\b/i;

/** True when the message is asking for prose rather than for feedback. */
export function looksLikeGhostwritingRequest(text) {
  return GHOSTWRITE_ASK_RE.test(String(text || ''));
}
