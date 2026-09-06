// ─────────────────────────────────────────────────────────────────────────────
// Personalized practice generation.
//
// The static bank in src/data/sat/questions/ is finite and the same for every
// student. This module writes questions FOR ONE STUDENT: aimed at the skills
// their own data says are costing them points, pitched one notch above their
// measured level, and — where the Review Log knows it — built around the exact
// trap they keep falling for.
//
// ── THE THREE THINGS THAT MAKE THIS HARD ─────────────────────────────────────
//
// 1. A WRONG ANSWER KEY IS WORSE THAN NO QUESTION. A student who studies a
//    mis-keyed item learns something false and, worse, learns to distrust the
//    explanation screen. So nothing reaches a student on the author model's word
//    alone: every item goes through deterministic structural validation and then
//    an INDEPENDENT VERIFICATION PASS by a different model that is shown the
//    question WITHOUT the key and asked to solve it. Items where the two
//    disagree, or where the verifier reports the item as flawed, are discarded.
//    A six-question set that is right beats a ten-question set that is nearly
//    right, and the UI is built to show a short set without apologizing.
//
// 2. MODEL CHOICE IS PART OF THE DESIGN, NOT A DEFAULT.
//      author   → Oracle (openai/gpt-oss-120b) with reasoning_effort 'high' and
//                 temperature 0.45. Authoring an SAT item is a reasoning task
//                 disguised as a writing task: the model has to actually solve
//                 the problem it just invented in order to key it, and design
//                 four distractors that each correspond to a *specific* named
//                 mistake. The 8B and 20B tiers write plausible-looking items
//                 with silently wrong keys. Temperature is well below the app
//                 default of 0.7 — we want variety in scenario, not in
//                 arithmetic.
//      verify   → Sage (openai/gpt-oss-20b) at temperature 0. Was deliberately a
//                 DIFFERENT MODEL FAMILY from the author (Llama vs. gpt-oss) —
//                 a verifier that shares the author's weights shares the
//                 author's blind spots and will confidently confirm its own
//                 mistakes. Groq retired its Llama tiers in August 2026, so the
//                 cross-family split isn't available from Groq alone anymore;
//                 the verifier still runs a smaller model at a different
//                 reasoning_effort and temperature 0 than the author, which
//                 catches independent-pass mistakes even though it no longer
//                 catches ones baked into the gpt-oss family's weights itself.
//      hint /   → Guide (openai/gpt-oss-20b). Short, cheap, high volume, and
//      explain    grounded in text it is given rather than reasoning from
//                 scratch, so the deep tier would be spending money on latency.
//
// 3. LICENSING. No official College Board content may enter a prompt here, as
//    an example or otherwise: they grant no commercial license for SAT items and
//    explicitly forbid their use with generative AI. The prompts below describe
//    the published *blueprint* — domain names, skill descriptions, question
//    formats, timing — which is factual, and ask for wholly original items.
// ─────────────────────────────────────────────────────────────────────────────
import {
  SAT_SKILLS, SAT_DOMAINS, DIFFICULTY_IDS, TRAP_TAGS, skillMeta,
} from '../../data/sat/taxonomy';
import { strategyFor } from '../../data/sat/strategies';
import { renderProfileForPrompt, profileFingerprint } from './learnerProfile';
import * as DB from '../db';
import { isBalanced, CHOICE_LENGTH_CONTRACT } from './answerBalance';
import { aiLane } from '../aiLane.js';

/** Hard ceiling on items per generation request, whatever the caller asks for. */
const MAX_ITEMS = 10;
/** Below this many surviving items we tell the caller the set is thin. */
const THIN_SET = 3;
/** Generated sets are re-usable for this long before we rebuild them. */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// The authoring prompt
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Per-skill authoring spec.
 *
 * Handing the model "write a Boundaries question" produces something that is
 * about punctuation. Handing it the domain, the published skill description,
 * the taught approach, the classic trap, the pacing benchmark and the format
 * constraints produces something that behaves like the real item type. The
 * difference is most of the value in this file.
 */
function skillSpec(entry) {
  const meta = skillMeta(entry.skill);
  const domain = SAT_DOMAINS[meta.domain];
  const strategy = strategyFor(entry.skill);
  const lines = [
    `SKILL: ${meta.label}  [id: ${entry.skill}]`,
    `  Section: ${meta.sectionLabel}. Domain: ${domain.label} — ${domain.blurb}`,
    `  What it tests: ${meta.blurb}`,
    `  Write ${entry.count} item(s) at difficulty ${entry.difficulty}.`,
    `  Pacing benchmark: a prepared student finishes one of these in ~${meta.targetSeconds}s, so the item must be solvable in that time without a calculator-heavy grind.`,
    `  Why this student needs it: ${entry.why}`,
  ];
  if (strategy) {
    lines.push(`  The approach this app teaches for it: ${strategy.approach}`);
    if (strategy.watchFor) lines.push(`  The classic trap for this skill: ${strategy.watchFor}`);
  }
  if (entry.trap) {
    lines.push(
      `  TARGETED: this student has fallen for "${entry.trap.label}" ${entry.trap.count} time(s). `
      + 'Build at least one of these items so that exactly that mistake produces one of the wrong choices, '
      + 'and name it in that choice\'s rationale.',
    );
  }
  return lines.join('\n');
}

const DIFFICULTY_GUIDE = [
  'DIFFICULTY CALIBRATION (this is about cognitive steps, never about obscure vocabulary or ugly numbers):',
  '  E — one step, no disguise. The student who knows the concept sees the path immediately.',
  '  M — two or three steps, or one step wrapped in an unfamiliar context. Most exam items live here.',
  '  H — multiple steps, or a step that only appears once you reframe the problem. Still solvable inside the pacing',
  '      benchmark by a prepared student. Hard must never mean tedious, obscure, or ambiguous.',
].join('\n');

const DISTRACTOR_CONTRACT = [
  'THE DISTRACTOR CONTRACT — this is the part that decides whether an item teaches anything:',
  '  * Each wrong choice must be the answer a student would reach by making one SPECIFIC, NAMEABLE mistake.',
  '    Write that mistake down in distractorExp. "This is incorrect" is a failed rationale; "this is what you get',
  '    if you find the x-coordinate of the vertex instead of the minimum value" is a passing one.',
  '  * No filler choices. If you cannot name the mistake behind a choice, replace the choice.',
  '  * Exactly one choice is defensibly correct. If a second choice could be argued for under any reasonable',
  '    reading, the item is broken — rewrite it rather than shipping it.',
  '  * No "all of the above", "none of the above", or choices that reference other choices.',
  '',
  CHOICE_LENGTH_CONTRACT,
].join('\n');

const AUTHENTICITY_RULES = [
  'DIGITAL SAT AUTHENTICITY:',
  '  * This is the adaptive, two-module-per-section Digital SAT, not the old paper test. No long paired-passage',
  '    reading sets; Reading & Writing items are short and self-contained.',
  '  * Reading & Writing stimuli: 25–150 words, academic register, INVENTED sources, studies and researchers.',
  '    Never a real named study, author, or publication.',
  '  * Math items may be pure or contextual. Numbers should be clean enough to work by hand or with a graphing',
  '    calculator; avoid answers that require rounding decisions the item does not specify.',
  '  * Use $...$ for inline mathematics (KaTeX renders it). Never use unicode superscripts or images.',
  '  * No item may depend on a figure, diagram, or chart that is not fully described in text.',
].join('\n');

const LICENSING_RULE = [
  'ORIGINALITY (non-negotiable):',
  '  Every item must be COMPLETELY ORIGINAL. Never reproduce, paraphrase, translate, or adapt any real',
  '  College Board, SAT, PSAT, Khan Academy or Bluebook question, passage, answer choice or rationale, and never',
  '  claim an item came from a real exam. Do not mention College Board or any test brand inside an item.',
].join('\n');

const OUTPUT_SCHEMA = [
  'OUTPUT — return ONLY a JSON object, no prose, no code fence, in exactly this shape:',
  '{"questions":[{',
  '  "skill": "<the skill id given to you, verbatim>",',
  '  "difficulty": "E" | "M" | "H",',
  '  "format": "mcq" | "spr",',
  '  "stimulus": "<passage or setup, or null if the question stands alone>",',
  '  "q": "<the question stem>",',
  '  "ch": ["<A>","<B>","<C>","<D>"],          // exactly 4 for mcq; omit or null for spr',
  '  "ans": 0,                                   // 0-based index of the correct choice; omit for spr',
  '  "sprAccept": {"values":["7","7.0"]},        // spr only: every form you would accept',
  '  "exp": "<why the correct answer is correct, worked through in 2-4 sentences>",',
  '  "distractorExp": ["<why A is right or wrong>","<B>","<C>","<D>"],  // exactly 4 for mcq; omit for spr',
  '  "trap": "<short_snake_case_tag naming the mistake this item catches>",',
  '  "solutionCheck": "<one line stating the arithmetic or textual check you performed to confirm the key>"',
  '}]}',
  '',
  'Every field is required unless marked otherwise. distractorExp must have exactly 4 entries aligned to ch by index.',
  'Before emitting each item, solve it yourself from scratch and confirm your solution matches the index you put in',
  '"ans". State that check in "solutionCheck". An item whose check does not come out is a broken item — fix it or',
  'replace it, do not ship it.',
].join('\n');

/** The full system prompt for the authoring call. */
function buildAuthorPrompt({ profile, blueprint, mode }) {
  const known = new Set(Object.keys(TRAP_TAGS));
  const trapVocab = [...known].slice(0, 22).join(', ');

  return [
    'You are a senior item writer for a Digital SAT preparation product. You write original practice questions',
    'that a student will study from, and their answer keys have to be right — a mis-keyed item teaches a student',
    'something false and costs them points on test day. Accuracy outranks volume, style and speed.',
    '',
    '── THE STUDENT YOU ARE WRITING FOR ──',
    renderProfileForPrompt(profile, { verbosity: 'compact' }),
    '',
    mode === 'drill'
      ? 'They have asked to drill one specific skill, so every item targets it. Vary the scenario and the surface'
        + ' form heavily between items — same skill must not mean same question wearing a hat.'
      : 'This is a mixed set aimed at where their measured data says the points are. Interleave the skills rather'
        + ' than blocking them; interleaved practice transfers better than massed practice.',
    '',
    '── WHAT TO WRITE ──',
    blueprint.map(skillSpec).join('\n\n'),
    '',
    DIFFICULTY_GUIDE,
    '',
    DISTRACTOR_CONTRACT,
    '',
    AUTHENTICITY_RULES,
    '',
    LICENSING_RULE,
    '',
    `Prefer trap tags from this vocabulary where one fits: ${trapVocab}. Invent a new snake_case tag only if none does.`,
    '',
    OUTPUT_SCHEMA,
  ].join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic validation — everything we can check without a model
// ─────────────────────────────────────────────────────────────────────────────

// Phrases that mean the model reached for real exam content or broke character.
const FORBIDDEN = /college\s*board|\bbluebook\b|khan\s*academy|official\s+sat|released\s+(sat|psat)|as seen on the/i;

/**
 * Structural validation. Anything that fails is dropped silently — a short set
 * is a fine outcome, a malformed or unrenderable one is not.
 *
 * @returns {object|null} normalized question, or null with a reason logged
 */
function validateItem(raw, { skill, difficulty }) {
  if (!raw || typeof raw !== 'object') return null;

  const skillId = SAT_SKILLS[raw.skill] ? raw.skill : skill;
  if (!SAT_SKILLS[skillId]) return null;

  const q = typeof raw.q === 'string' ? raw.q.trim() : '';
  if (q.length < 10) return null;

  const stimulus = typeof raw.stimulus === 'string' && raw.stimulus.trim() ? raw.stimulus.trim() : null;
  if (FORBIDDEN.test(q) || (stimulus && FORBIDDEN.test(stimulus))) return null;

  const exp = typeof raw.exp === 'string' ? raw.exp.trim() : '';
  if (exp.length < 25) return null;

  const meta = skillMeta(skillId);
  const format = raw.format === 'spr' ? 'spr' : 'mcq';
  const base = {
    // A stable-ish id that still cannot collide with a bank id, and is unique
    // per generated item so the review log and the seen-set behave normally.
    id: `sat-ai-${skillId}-${Math.random().toString(36).slice(2, 10)}`,
    section: meta.section,
    domain: meta.domain,
    skill: skillId,
    difficulty: DIFFICULTY_IDS.includes(raw.difficulty) ? raw.difficulty : difficulty,
    format,
    stimulus,
    q,
    exp,
    trap: typeof raw.trap === 'string' ? raw.trap.trim().slice(0, 40).replace(/\s+/g, '_') : null,
    targetSeconds: SAT_SKILLS[skillId]?.targetSeconds || 75,
    generated: true,
  };

  if (format === 'spr') {
    // Grid-ins only exist on Math. An R&W "student-produced response" is not a
    // thing on this exam, so treat it as a malformed item rather than inventing
    // a question type the student will never see.
    if (meta.section !== 'math') return null;
    const values = Array.isArray(raw.sprAccept?.values) ? raw.sprAccept.values : [];
    const cleaned = values
      .map(v => String(v).trim())
      .filter(v => v && Number.isFinite(parseFloat(v)));
    if (!cleaned.length) return null;
    return { ...base, ch: null, ans: null, distractorExp: null, sprAccept: { values: cleaned, tolerance: raw.sprAccept?.tolerance ?? 0 } };
  }

  const ch = Array.isArray(raw.ch) ? raw.ch : null;
  if (!ch || ch.length !== 4) return null;
  if (ch.some(c => typeof c !== 'string' || !c.trim())) return null;
  const trimmed = ch.map(c => c.trim());

  // Duplicate choices mean either two correct answers or a padded list.
  if (new Set(trimmed.map(c => c.toLowerCase())).size !== 4) return null;
  // Choices that reference each other break as soon as we shuffle them.
  if (trimmed.some(c => /\b(all|none|both) of the (above|following)\b/i.test(c))) return null;

  const ans = raw.ans;
  if (!Number.isInteger(ans) || ans < 0 || ans > 3) return null;

  const de = Array.isArray(raw.distractorExp) ? raw.distractorExp : null;
  if (!de || de.length !== 4) return null;
  if (de.some(d => typeof d !== 'string' || d.trim().length < 10)) return null;

  // The length tell. A student who has noticed that the longest, most-qualified
  // choice is usually right can score above chance without reading anything,
  // and practice that rewards that habit actively harms them — the real exam
  // does not reward it, and they find that out on test day.
  //
  // The rule now lives in src/lib/sat/answerBalance.js, shared verbatim with
  // the bank audit and with the CHOICE_LENGTH_CONTRACT this model was given.
  // A validator whose threshold has drifted from the instruction the generator
  // received is a validator that rejects compliant output at random.
  if (!isBalanced(trimmed, ans)) return null;

  return { ...base, ch: trimmed, ans, distractorExp: de.map(d => d.trim()) };
}

/**
 * Arithmetic cross-check for items whose choices are all plain numbers.
 *
 * We cannot re-derive the model's reasoning, but we can catch the single most
 * common failure: the model solves correctly, then keys the wrong index. If the
 * explanation's numbers never mention the keyed value, something is off.
 */
function numericSanity(question) {
  if (question.format !== 'mcq') return true;
  const nums = question.ch.map(c => Number(String(c).replace(/[$,%\s]/g, '')));
  if (nums.some(n => !Number.isFinite(n))) return true; // not a numeric item

  const keyed = nums[question.ans];
  const haystack = `${question.exp} ${question.distractorExp?.[question.ans] || ''}`;
  const expNums = (haystack.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  if (!expNums.length) return true;
  return expNums.some(n => Math.abs(n - keyed) < 1e-6);
}

/** Drop near-duplicate stems within a batch — the model repeats itself under load. */
function dedupe(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const fingerprint = `${item.skill}::${item.q.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 90)}`;
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    out.push(item);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// The verification pass
// ─────────────────────────────────────────────────────────────────────────────

const VERIFIER_PROMPT = [
  'You are an SAT item reviewer. You are given practice questions WITHOUT their answer keys. Your job is to',
  'independently solve each one and to flag any item that is broken.',
  '',
  'For each item, working carefully:',
  '  1. Solve it from scratch. Do not guess; if it is a maths item, actually do the arithmetic.',
  '  2. Decide whether exactly one choice is defensibly correct.',
  '  3. Report a flaw if ANY of these is true: two or more choices could be argued correct; no choice is correct;',
  '     the question is ambiguous or under-specified; it depends on a figure that is not described; it relies on',
  '     outside knowledge a high-school student would not be expected to have.',
  '',
  'Be strict. It is much better to flag a usable item than to pass a broken one — a flagged item is simply not',
  'shown to the student, while a broken one teaches them something false.',
  '',
  'Return ONLY JSON: {"results":[{"i":<the item index you were given>,"answer":<0-3, or the numeric answer as a',
  'string for a grid-in>,"confident":true|false,"flaw":null|"<short description of what is broken>"}]}',
  'One entry per item, in the order you were given them.',
].join('\n');

function renderForVerification(items) {
  return items.map((item, i) => {
    const lines = [`ITEM ${i}`];
    if (item.stimulus) lines.push(`Passage/setup: ${item.stimulus}`);
    lines.push(`Question: ${item.q}`);
    if (item.format === 'mcq') {
      lines.push(...item.ch.map((c, ci) => `  ${ci}) ${c}`));
    } else {
      lines.push('  (Grid-in: the student types a number. There are no choices.)');
    }
    return lines.join('\n');
  }).join('\n\n');
}

/**
 * Ask an independent model to solve each item, and keep only the ones it agrees
 * with. On any transport failure the batch is returned UNVERIFIED rather than
 * discarded — the deterministic checks have already run, and a network blip
 * should degrade the guarantee, not delete the student's practice set.
 *
 * @returns {{items: Array, verified: boolean, rejected: number}}
 */
async function verifyItems(items, { signal } = {}) {
  if (!items.length) return { items, verified: false, rejected: 0 };

  let parsed;
  try {
    const res = await fetch('/api/groq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        system: VERIFIER_PROMPT,
        message: renderForVerification(items),
        purpose: 'sat',
        lane: aiLane(),
        // A different model family from the author on purpose — see the header.
        tier: 'sage',
        jsonMode: true,
        // Zero temperature: this is adjudication, and sampling noise here only
        // ever costs us a good item or passes a bad one.
        temperature: 0,
        // Never serve a cached verdict for a correctness gate.
        noCache: true,
        maxTokens: 2000,
      }),
    });
    if (!res.ok) return { items: items.map(q => ({ ...q, verified: false })), verified: false, rejected: 0 };
    const data = await res.json();
    parsed = parseJsonLoosely(data?.content);
  } catch {
    return { items: items.map(q => ({ ...q, verified: false })), verified: false, rejected: 0 };
  }

  const results = Array.isArray(parsed?.results) ? parsed.results : null;
  if (!results) return { items: items.map(q => ({ ...q, verified: false })), verified: false, rejected: 0 };

  const byIndex = new Map();
  for (const r of results) {
    if (Number.isInteger(r?.i)) byIndex.set(r.i, r);
  }

  const kept = [];
  let rejected = 0;
  items.forEach((item, i) => {
    const verdict = byIndex.get(i);
    // No verdict for this item: the verifier did not return a full set. Keep the
    // item but mark it unverified rather than silently claiming it was checked.
    if (!verdict) { kept.push({ ...item, verified: false }); return; }
    if (verdict.flaw) { rejected++; return; }
    // A verifier that is not confident has not verified anything. Keep the item
    // (it passed structural validation) but do not badge it as checked.
    if (verdict.confident === false) { kept.push({ ...item, verified: false }); return; }

    if (item.format === 'mcq') {
      if (!Number.isInteger(verdict.answer)) { kept.push({ ...item, verified: false }); return; }
      if (verdict.answer !== item.ans) { rejected++; return; }
    } else {
      const got = parseFloat(String(verdict.answer));
      const accepted = item.sprAccept.values.some(v => Math.abs(parseFloat(v) - got) < 1e-6);
      if (!Number.isFinite(got)) { kept.push({ ...item, verified: false }); return; }
      if (!accepted) { rejected++; return; }
    }
    kept.push({ ...item, verified: true });
  });

  return { items: kept, verified: true, rejected };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a personalized practice set.
 *
 * Always resolves. Never throws at the caller: on any failure it returns an
 * empty `questions` array plus a `reason`, and the Practice panel falls back to
 * the static bank. Practice must never be blocked by an AI outage.
 *
 * @param {object}   opts
 * @param {object}   opts.profile     from buildLearnerProfile()
 * @param {Array}    opts.blueprint   from planGeneratedSet()
 * @param {'mixed'|'drill'} [opts.mode]
 * @param {boolean}  [opts.verify]    run the independent verification pass
 * @param {boolean}  [opts.fresh]     bypass the cache (the "another set" button)
 * @param {function} [opts.onStage]   ('authoring'|'verifying') => void
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{questions:Array, verified:boolean, rejected:number, thin:boolean, reason:string|null, cached:boolean}>}
 */
export async function generatePracticeSet({
  profile, blueprint = [], mode = 'mixed', verify = true, fresh = false,
  onStage = null, signal = null,
} = {}) {
  const empty = (reason) => ({ questions: [], verified: false, rejected: 0, discarded: 0, thin: true, reason, cached: false });
  if (!blueprint.length) return empty('nothing to generate');

  const requested = Math.min(
    MAX_ITEMS,
    blueprint.reduce((s, b) => s + (b.count || 0), 0),
  );
  if (requested <= 0) return empty('nothing to generate');

  // ── Cache ──
  // Keyed on the student's coarse position plus this exact blueprint, so
  // reopening the panel reuses what was already generated (and already paid
  // for) while any real change in their data misses and rebuilds.
  const cacheKey = [
    'set:v2',
    mode,
    profileFingerprint(profile),
    blueprint.map(b => `${b.skill}:${b.difficulty}:${b.count}`).join(','),
  ].join('|');

  if (!fresh) {
    try {
      const hit = await DB.getSatAiCache(cacheKey);
      if (hit?.questions?.length && Date.now() - (hit.createdAt || 0) < CACHE_TTL_MS) {
        return {
          questions: hit.questions,
          verified: hit.questions.every(q => q.verified),
          rejected: 0,
          discarded: 0,
          thin: hit.questions.length < THIN_SET,
          reason: null,
          cached: true,
        };
      }
    } catch { /* a cache miss is not an error */ }
  }

  // ── Author ──
  onStage?.('authoring');
  let parsed;
  try {
    const res = await fetch('/api/groq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        system: buildAuthorPrompt({ profile, blueprint, mode }),
        message: `Write exactly ${requested} question(s) following the blueprint above. Return the JSON object and nothing else.`,
        purpose: 'sat',
        lane: aiLane(),
        // See the header: authoring is a reasoning task, so it gets the
        // reasoning model at its deepest setting.
        tier: 'oracle',
        reasoningEffort: 'high',
        jsonMode: true,
        temperature: 0.45,
        // "Another set" must not be served the set they just finished.
        noCache: fresh,
        maxTokens: 7000,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return empty(body?.error || `generation unavailable (${res.status})`);
    }
    const data = await res.json();
    parsed = parseJsonLoosely(data?.content);
  } catch (err) {
    if (err?.name === 'AbortError') return empty('cancelled');
    return empty('could not reach the generator');
  }

  const rawItems = Array.isArray(parsed?.questions) ? parsed.questions : null;
  if (!rawItems?.length) return empty('the generator returned nothing usable');

  // ── Deterministic validation ──
  // Each raw item is validated against the blueprint entry for its skill, so an
  // item that came back tagged with a skill we did not ask for is still checked
  // against that skill's real metadata rather than the wrong one.
  const bySkill = new Map(blueprint.map(b => [b.skill, b]));
  const validated = dedupe(
    rawItems
      .map(raw => {
        const entry = bySkill.get(raw?.skill) || blueprint[0];
        return validateItem(raw, { skill: entry.skill, difficulty: entry.difficulty });
      })
      .filter(Boolean)
      .filter(numericSanity),
  ).slice(0, MAX_ITEMS);

  // Items the model wrote that never made it past the structural checks. Worth
  // counting separately from verifier rejections: they are different failures
  // (malformed vs mis-keyed) and the student is told about both.
  const discarded = Math.max(0, rawItems.length - validated.length);

  if (!validated.length) return empty('every generated item failed validation');

  // ── Independent verification ──
  let final = validated.map(q => ({ ...q, verified: false }));
  let didVerify = false;
  let rejected = 0;
  if (verify) {
    onStage?.('verifying');
    const outcome = await verifyItems(validated, { signal });
    final = outcome.items;
    didVerify = outcome.verified;
    rejected = outcome.rejected;
  }

  if (!final.length) return empty('every generated item was rejected by the checker');

  try { await DB.putSatAiCache(cacheKey, final); } catch { /* non-fatal */ }

  return {
    questions: final,
    verified: didVerify && final.every(q => q.verified),
    rejected,
    discarded,
    thin: final.length < THIN_SET,
    reason: null,
    cached: false,
  };
}

/**
 * ONE item, authored for a specific (skill, difficulty) slot in an adaptive
 * baseline. See src/lib/sat/baseline.js for why the baseline generates rather
 * than selects: a staircase needs a question at whatever difficulty the last
 * answer implied, in the skill the blueprint asked for, that this student has
 * not already seen — and an 83-item static bank cannot serve that for one
 * student, let alone for a retake a week later.
 *
 * Differs from generatePracticeSet() in four ways that all follow from being
 * one item inside a live test:
 *
 *   1. NEVER CACHED, in either direction. A baseline is a measurement. Serving
 *      a cached item would hand a student a question they may have already
 *      seen and score them on it, and caching the result would leak this run's
 *      questions into the next one. Both destroy the thing being measured.
 *   2. `avoid` carries the stems already used in this session, so the model
 *      cannot circle back to a scenario it just wrote.
 *   3. Verification is mandatory and non-optional. In practice a mis-keyed item
 *      costs a student one confusing explanation; in a baseline it moves the
 *      ability estimate the wrong way and every subsequent question is chosen
 *      off that error.
 *   4. It falls back to the static bank rather than returning nothing. A test
 *      that stalls at question 19 because of a rate limit has wasted the
 *      student's afternoon; a bank item at roughly the right difficulty is a
 *      far better outcome than an error dialog.
 */
export async function generateBaselineItem({
  skill, difficulty = 'M', profile = null, avoid = [], signal = null,
} = {}) {
  const meta = SAT_SKILLS[skill] ? skillMeta(skill) : null;
  if (!meta) return null;

  const blueprint = [{
    skill,
    label: meta.label,
    sectionLabel: meta.sectionLabel,
    difficulty: DIFFICULTY_IDS.includes(difficulty) ? difficulty : 'M',
    count: 1,
    why: 'This is one question inside an adaptive placement test. Its difficulty was chosen from how the student '
      + 'has answered so far, so it must land squarely at the stated difficulty — an item that is secretly easier '
      + 'or harder than requested corrupts the estimate and every question chosen after it.',
  }];

  const avoidBlock = avoid.length
    ? '\n\n── ALREADY USED IN THIS TEST (do not reuse these scenarios, subjects, or framings) ──\n'
      + avoid.slice(-14).map(t => `  - ${String(t).slice(0, 110)}`).join('\n')
    : '';

  let parsed;
  try {
    const res = await fetch('/api/groq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        system: buildAuthorPrompt({ profile, blueprint, mode: 'drill' }) + avoidBlock,
        message: `Write exactly 1 question following the blueprint above, at difficulty ${blueprint[0].difficulty}. Return the JSON object and nothing else.`,
        purpose: 'sat',
        lane: aiLane(),
        tier: 'oracle',
        reasoningEffort: 'high',
        jsonMode: true,
        // Slightly warmer than a practice set. One item at a time, 35 times,
        // with the same skill recurring: at 0.45 the model converges on the
        // same scenario shape over and over.
        temperature: 0.6,
        noCache: true,
        maxTokens: 1800,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    parsed = parseJsonLoosely(data?.content);
  } catch {
    return null;
  }

  const raw = Array.isArray(parsed?.questions) ? parsed.questions[0] : parsed;
  const item = validateItem(raw, { skill, difficulty: blueprint[0].difficulty });
  if (!item || !numericSanity(item)) return null;

  const outcome = await verifyItems([item], { signal });
  if (!outcome.items.length) return null;

  return { ...outcome.items[0], generated: true, baseline: true };
}

/**
 * Single-skill top-up, used when the static bank cannot fill a drill without
 * repeating itself. Thin wrapper over generatePracticeSet() so there is exactly
 * one authoring prompt in the codebase to keep correct.
 */
export async function generateForSkill(skillId, { profile = null, difficulty = 'M', count = 4, fresh = false, onStage, signal } = {}) {
  if (!SAT_SKILLS[skillId]) return [];
  const meta = skillMeta(skillId);
  const result = await generatePracticeSet({
    profile,
    mode: 'drill',
    fresh,
    onStage,
    signal,
    blueprint: [{
      skill: skillId,
      label: meta.label,
      sectionLabel: meta.sectionLabel,
      difficulty: DIFFICULTY_IDS.includes(difficulty) ? difficulty : 'M',
      count: Math.min(count, MAX_ITEMS),
      why: 'topping up a drill the static bank cannot fill without repeating questions',
      trap: null,
    }],
  });
  return result.questions;
}

/**
 * Parse a model's JSON reply, tolerating a code fence or stray prose around it.
 * Groq's json_object mode makes this rare, but "rare" over thousands of calls is
 * still a support ticket.
 */
function parseJsonLoosely(content) {
  if (!content) return null;
  const text = String(content).trim();
  try { return JSON.parse(text); } catch { /* fall through */ }
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try { return JSON.parse(fenced[1]); } catch { /* fall through */ }
  }
  const braced = text.match(/\{[\s\S]*\}/);
  if (braced) {
    try { return JSON.parse(braced[0]); } catch { /* fall through */ }
  }
  return null;
}

export { parseJsonLoosely, MAX_ITEMS, THIN_SET };
