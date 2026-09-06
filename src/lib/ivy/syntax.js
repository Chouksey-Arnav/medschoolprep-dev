// ─────────────────────────────────────────────────────────────────────────────
// Module 10 — the syntax validation score and the three editing sweeps.
//
// ── PREMIUM ROADMAP ─────────────────────────────────────────────────────────
// Part of the Narrative Method Engine, planned as a paid tier. See PREMIUM in
// ./constants.js.
// ────────────────────────────────────────────────────────────────────────────
//
//     V_syntax = 1 − (0.4·Error_passive + 0.3·Error_clutter + 0.3·Error_adjective)
//
// Three sweeps, run in this order because that is the order they are useful in:
//
//   Sweep 1 — read aloud. Flags sentences whose vocabulary sits far above the
//             student's OWN conversational baseline. Not above some general
//             standard — above theirs, measured from the rest of their own
//             writing. A student whose whole essay is elevated has a voice; a
//             student with one sentence that spikes has a thesaurus.
//   Sweep 2 — transitions. Paragraph-to-paragraph semantic correlation below
//             0.50 is an abrupt shift, and the module names the seam.
//   Sweep 3 — final polish. Passive voice, clutter, adjective imbalance, each
//             with the literal replacement rather than a note saying "tighten".
//
// ── Why every flag carries a rewrite ───────────────────────────────────────
// "Consider revising for concision" is the most useless sentence in editing
// software. Every finding here carries either the exact replacement string or a
// question with one answer, because a student at eleven at night can act on a
// replacement and cannot act on a category.
//
// ── What this module will not do ───────────────────────────────────────────
// It will not rewrite a sentence for meaning, and it will not suggest raising
// the register. Both of those move the draft toward the polished, sterile
// middle that Section 2 exists to prevent — so the clutter list only ever
// REMOVES words, and Sweep 1 flags elevation rather than rewarding it.
// ─────────────────────────────────────────────────────────────────────────────

import { SYNTAX_PENALTIES, SYNTAX_RULES, clamp } from './constants.js';
import {
  sentences, tokenize, stem, wordRarity, passiveVoice, nounAdjectiveProfile,
  transitions, paragraphs,
} from './text.js';
import { CLUTTER_PHRASES } from '../../data/ivy/clicheBank.js';

/** Sweep 3a — passive constructions, with the active question for each. */
export function passiveSweep(text) {
  const pv = passiveVoice(text);
  return {
    ...pv,
    findings: pv.hits.map(h => ({
      phrase: h.phrase, sentence: h.sentence,
      ask: `"${h.phrase}" — who did it? Passive voice removes the person from the sentence, and in an essay about you that is the one word you cannot afford to drop.`,
    })),
  };
}

/** Sweep 3b — clutter, with literal replacements. */
export function clutterSweep(text) {
  const s = String(text || '');
  const words = tokenize(s).length || 1;
  const findings = [];
  let removed = 0;

  for (const rule of CLUTTER_PHRASES) {
    const re = new RegExp(rule.re.source, rule.re.flags.includes('g') ? rule.re.flags : rule.re.flags + 'g');
    const matches = s.match(re);
    if (!matches) continue;
    removed += matches.reduce((n, m) => n + tokenize(m).length, 0)
      - matches.length * tokenize(rule.with.replace(/\$\d/g, '')).length;
    findings.push({
      phrase: matches[0],
      count: matches.length,
      replacement: rule.with,
      fix: rule.with
        ? `"${matches[0]}" → "${rule.with.replace(/\$\d/g, matches[0])}"`
        : `"${matches[0]}" → delete it. The sentence means the same thing and moves faster.`,
    });
  }

  const wordsSaved = Math.max(0, removed);
  return {
    findings: findings.sort((a, b) => b.count - a.count),
    count: findings.reduce((n, f) => n + f.count, 0),
    wordsSaved,
    density: clamp(wordsSaved / words, 0, 1),
    // The number that actually motivates the edit, in the currency the student
    // is short of.
    note: wordsSaved > 0
      ? `About ${wordsSaved} words of packaging. In a 650-word essay that is ${Math.round((wordsSaved / 650) * 100)}% of your space, and every one of those words is currently doing nothing.`
      : 'No filler phrases found. Rare, and worth keeping.',
  };
}

/** Sweep 3c — adjective imbalance. */
export function adjectiveSweep(text) {
  const na = nounAdjectiveProfile(text);
  const over = na.adjectivesPerNoun > SYNTAX_RULES.adjectiveToNounCeiling;

  // Which adjectives are doing the least: the ones stacked on one noun.
  const stacked = (String(text || '').match(/\b(\w+ly\s+)?\w+(ous|ful|ive|able|ible|ical)\s*,?\s*\w+(ous|ful|ive|able|ible|ical)\b/gi) || []).slice(0, 5);

  return {
    nouns: na.nouns, adjectives: na.adjectives,
    ratio: na.adjectivesPerNoun === Infinity ? null : Math.round(na.adjectivesPerNoun * 1000) / 1000,
    exceeds: over,
    stacked,
    density: clamp(na.adjectivesPerNoun / 2, 0, 1),
    note: over
      ? `${na.adjectives} adjectives against ${na.nouns} concrete nouns. Above one-to-one, prose starts telling the reader how to feel about a scene instead of showing them the scene. The fix is subtraction: delete every adjective and put back only the ones whose absence changed the meaning.`
      : `${na.adjectives} adjectives against ${na.nouns} concrete nouns — the objects are carrying the writing, which is what you want.`,
  };
}

/**
 * Sweep 1 — the read-aloud check.
 *
 * A sentence is flagged when its mean word rarity sits more than 15% above the
 * student's own baseline across the rest of the draft. Comparing a student to
 * themselves rather than to a corpus is the whole design: it finds the
 * thesaurus sentence in a plain essay AND leaves a genuinely erudite writer
 * alone, which a fixed threshold cannot do.
 */
export function readAloudSweep(text) {
  const sents = sentences(text);
  if (sents.length < 3) return { findings: [], baseline: null, insufficient: true };

  const scoreOf = (s) => {
    const toks = tokenize(s).map(stem).filter(t => t.length > 2);
    return toks.length ? toks.reduce((a, t) => a + wordRarity(t), 0) / toks.length : 0;
  };
  const scores = sents.map(scoreOf);
  const baseline = scores.reduce((a, b) => a + b, 0) / scores.length;

  const findings = [];
  sents.forEach((s, i) => {
    if (baseline <= 0) return;
    const drift = (scores[i] - baseline) / baseline;
    if (drift > SYNTAX_RULES.vocabularyDriftAbove) {
      findings.push({
        sentence: s, drift: Math.round(drift * 1000) / 1000,
        ask: 'Read this one out loud. If you would not say it to a friend describing the same thing, it is the sentence a reader trips on — and it usually contains one word you reached for rather than chose.',
      });
    }
  });

  return {
    baseline: Math.round(baseline * 1000) / 1000,
    findings: findings.sort((a, b) => b.drift - a.drift).slice(0, 5),
    insufficient: false,
    note: findings.length
      ? `${findings.length} sentence${findings.length === 1 ? '' : 's'} sit${findings.length === 1 ? 's' : ''} noticeably above your own register. Not wrong — audibly different from the rest of you, which is what a reader notices.`
      : 'The register is consistent across the draft. It sounds like one person.',
  };
}

/** Sweep 2 — transitions between paragraphs. */
export function transitionSweep(text) {
  const t = transitions(text);
  if (t.singleParagraph) {
    return {
      ...t, findings: [],
      note: paragraphs(text).length <= 1
        ? 'One paragraph. Personal statements are almost always four to six — the breaks are how a reader paces the story, and one block asks them to do that work themselves.'
        : 'Not enough paragraphs to measure transitions.',
    };
  }
  const findings = t.boundaries
    .filter(b => b.correlation < SYNTAX_RULES.transitionCorrelationBelow)
    .map(b => ({
      index: b.index, correlation: Math.round(b.correlation * 1000) / 1000,
      before: b.before, after: b.after,
      ask: 'These two paragraphs share almost no vocabulary, which usually means the reader is being asked to make a jump you made silently. One linking clause — an object, a name, or a time marker carried across the break — is normally the whole fix.',
    }));
  return {
    ...t, findings,
    note: findings.length
      ? `${findings.length} abrupt shift${findings.length === 1 ? '' : 's'} between paragraphs.`
      : 'Paragraphs hand off to each other cleanly.',
  };
}

/**
 * THE SCORE.
 *
 * Note that V_syntax is deliberately NOT the headline of the essay audit. A
 * mechanically clean essay with no person in it scores 0.95 here and is still
 * the draft that fails; the authenticity and stakes modules are the ones that
 * carry the finding. This one is the last pass, and the panel presents it that
 * way.
 */
export function scoreSyntax(text) {
  const s = String(text || '').trim();
  if (tokenize(s).length < 30) return { available: false, note: 'Too short to audit.' };

  const passive = passiveSweep(s);
  const clutter = clutterSweep(s);
  const adjective = adjectiveSweep(s);
  const readAloud = readAloudSweep(s);
  const transition = transitionSweep(s);

  const errors = {
    passive: clamp(passive.density, 0, 1),
    clutter: clamp(clutter.density * 4, 0, 1),   // clutter density runs small; scaled to the same [0,1] footing as the others
    adjective: clamp(adjective.density, 0, 1),
  };

  const penalty = SYNTAX_PENALTIES.passive * errors.passive
    + SYNTAX_PENALTIES.clutter * errors.clutter
    + SYNTAX_PENALTIES.adjective * errors.adjective;

  const score = clamp(1 - penalty, 0, 1);

  const priority = Object.entries({
    passive: SYNTAX_PENALTIES.passive * errors.passive,
    clutter: SYNTAX_PENALTIES.clutter * errors.clutter,
    adjective: SYNTAX_PENALTIES.adjective * errors.adjective,
  }).sort((a, b) => b[1] - a[1])[0];

  return {
    available: true,
    score: Math.round(score * 1000) / 1000,
    errors: Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, Math.round(v * 1000) / 1000])),
    penalties: SYNTAX_PENALTIES,
    sweeps: { readAloud, transition, passive, clutter, adjective },
    worst: priority[1] > 0.02 ? priority[0] : null,
    totalFindings: passive.findings.length + clutter.findings.length + readAloud.findings.length + transition.findings.length + (adjective.exceeds ? 1 : 0),
    note: score >= 0.9
      ? 'Mechanically clean. Worth saying plainly: this does not mean the essay works — a clean draft with nothing at stake in it is the most common strong-looking rejection there is.'
      : score >= 0.75
        ? `Solid, with ${priority[0]} the largest remaining drag.`
        : `The largest drag is ${priority[0]}. Fix that one first; the other two are usually downstream of it.`,
  };
}
