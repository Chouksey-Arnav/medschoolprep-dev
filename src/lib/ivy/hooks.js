// ─────────────────────────────────────────────────────────────────────────────
// Module 9 — hook classification and the opening-line audit.
//
// ── PREMIUM ROADMAP ─────────────────────────────────────────────────────────
// Part of the Narrative Method Engine, planned as a paid tier. See PREMIUM in
// ./constants.js.
// ────────────────────────────────────────────────────────────────────────────
//
//     H⃗ = [P_unconventional, P_sensory, P_dialogue],  Σ P = 1
//
// Three openings that work, and one syntactic test for each:
//
//   Unconventional reality — a paradoxical claim about an ordinary object.
//       "My most valuable possession is my pile of paper scraps."
//       Test: Semantic Outlier Index > 0.75 against the trope corpus.
//
//   Vivid sensory — concrete nouns doing the work, immediately.
//       "My fingers trace the pattern of my grandmother's quilt…"
//       Test: concrete-noun-to-adjective ratio > 2.0. The ratio is the whole
//       point of the rule: sensory writing done badly is adjective soup, and
//       the failure mode ("gorgeous, shimmering, breathtaking sunset") looks
//       like the success mode to anyone counting sensory words instead of
//       weighing them.
//
//   Dialogue — in medias res, spoken or internal.
//       "'I've always wanted to become an artist,' she whispers."
//       Test: quotation delimiters plus an emotional or physical marker.
//
// ── What this module refuses to do ─────────────────────────────────────────
// It does not write the hook. It classifies what is there, says whether that
// archetype's own test passes, and hands back the specific weakness. A
// generated opening line would be the engine's voice in the first sentence of
// the student's essay, which is the worst possible place for it.
// ─────────────────────────────────────────────────────────────────────────────

import { HOOK_RULES, clamp } from './constants.js';
import {
  sentences, nounAdjectiveProfile, tokenize, matchRules, specificity,
} from './text.js';
import { compareToCorpus } from './differentiation.js';
import { OPENING_CLICHES } from '../../data/ivy/clicheBank.js';

const QUOTE_RE = /["“”'‘’][^"“”]{6,}["“”]|["“][^"”]+["”]/;
const SPEECH_VERB = /\b(said|says|whispers?|whispered|shouts?|shouted|asks?|asked|replied|replies|murmurs?|murmured|calls?|called|yells?|yelled|breathes?|breathed)\b/i;
const EMOTION_MARKER = /\b(eyes|voice|hands?|breath|face|smile|smiles?|tears?|laugh|laughs?|widen|widens|trembl\w+|freeze|froze|flinch\w*|grip\w*)\b/i;

const SENSORY_VERBS = /\b(trace|traces|traced|smell|smells|smelled|taste|tastes|tasted|hear|hears|heard|touch|touches|touched|feel|feels|felt|press|presses|pressed|grip|scrape|scrapes|crackl\w+|hum|hums|creak\w*|glow\w*|drip\w*|echo\w*)\b/i;

/**
 * Classifies an opening.
 *
 * @param {string} essay      the whole draft; only the first sentences are read
 * @param {number} [count]    how many sentences count as "the hook"
 */
export function classifyHook(essay, { count = HOOK_RULES.sentences } = {}) {
  const sents = sentences(essay);
  if (!sents.length) return { available: false, note: 'No text to read.' };

  const hook = sents.slice(0, count).join(' ');
  const first = sents[0];

  // ── Raw evidence for each archetype ──────────────────────────────────────
  const na = nounAdjectiveProfile(hook);
  const spec = specificity(hook);
  const { similarity } = compareToCorpus(hook);
  const outlierIndex = clamp(1 - similarity, 0, 1);

  const hasQuote = QUOTE_RE.test(hook);
  const hasSpeechVerb = SPEECH_VERB.test(hook);
  const hasEmotionMarker = EMOTION_MARKER.test(hook);
  const hasSensoryVerb = SENSORY_VERBS.test(hook);

  // A paradox is a copula joining an unexpected pair — "my most valuable
  // possession IS my pile of scraps" — or an explicit concession.
  const paradox = /\b(is|are|was|were)\b/.test(first)
    && /\b(most|only|favou?rite|best|worst|greatest|valuable|prized)\b/i.test(first)
    && spec.concrete + spec.proper > 0;
  const concession = /^(although|though|despite|while|even though|seemingly|at first glance)\b/i.test(first);

  // ── Scores, before normalisation ─────────────────────────────────────────
  const raw = {
    dialogue: (hasQuote ? 0.55 : 0) + (hasSpeechVerb ? 0.25 : 0) + (hasEmotionMarker ? 0.20 : 0),
    sensory: (hasSensoryVerb ? 0.30 : 0)
      + clamp((na.nouns || 0) / 6, 0, 0.35)
      + (na.ratio > HOOK_RULES.nounAdjectiveRatio ? 0.25 : 0)
      + clamp(spec.share / 0.2, 0, 0.20),
    unconventional: (paradox ? 0.45 : 0) + (concession ? 0.25 : 0)
      + clamp((outlierIndex - 0.5) * 0.8, 0, 0.30),
  };

  // Every essay opens somehow; a flat distribution means "none of the three",
  // which is itself the finding. A small floor keeps the vector normalisable
  // without inventing a winner out of noise.
  const FLOOR = 0.05;
  const totals = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v + FLOOR]));
  const sum = Object.values(totals).reduce((a, b) => a + b, 0);
  const H = {
    unconventional: round3(totals.unconventional / sum),
    sensory: round3(totals.sensory / sum),
    dialogue: round3(totals.dialogue / sum),
  };

  const archetype = Object.entries(H).sort((a, b) => b[1] - a[1])[0][0];
  const confidence = Math.max(...Object.values(H));
  // Below this the opening is not doing any of the three, which is far more
  // useful to say than naming the least-bad match.
  const recognizable = Math.max(...Object.values(raw)) >= 0.45;

  // ── The archetype's own test ─────────────────────────────────────────────
  const tests = {
    unconventional: {
      metric: 'Semantic Outlier Index', value: round3(outlierIndex), threshold: HOOK_RULES.outlierIndex,
      passes: outlierIndex > HOOK_RULES.outlierIndex,
      note: outlierIndex > HOOK_RULES.outlierIndex
        ? 'The opening does not resemble anything in the trope corpus, which is what makes the paradox land.'
        : 'The opening is unusual in form but its subject matter is close to a common theme, so the surprise does less work than it should.',
    },
    sensory: {
      metric: 'Concrete nouns per adjective', value: na.ratio === Infinity ? '∞' : round3(na.ratio), threshold: HOOK_RULES.nounAdjectiveRatio,
      passes: na.ratio > HOOK_RULES.nounAdjectiveRatio,
      note: na.ratio > HOOK_RULES.nounAdjectiveRatio
        ? `${na.nouns} concrete nouns against ${na.adjectives} adjectives. The scene is made of things rather than of descriptions of things, which is the difference between immersive and purple.`
        : `${na.nouns} concrete nouns against ${na.adjectives} adjectives. Sensory openings fail by over-describing: cut adjectives until the objects are doing the work alone.`,
    },
    dialogue: {
      metric: 'Quotation plus a physical marker', value: `${hasQuote ? 'quote' : 'no quote'}${hasEmotionMarker ? ' + marker' : ''}`, threshold: 'both',
      passes: hasQuote && (hasEmotionMarker || hasSpeechVerb),
      note: hasQuote && (hasEmotionMarker || hasSpeechVerb)
        ? 'Spoken words with a body attached — the reader is in the room before they are told where the room is.'
        : hasQuote
          ? 'There is speech but nothing physical around it. One gesture — what the hands did, where the eyes went — anchors it.'
          : 'No quoted speech found, so this is not doing the thing a dialogue opening does.',
    },
  };

  // ── The clichéd-opener check runs regardless of archetype ────────────────
  const clicheHits = matchRules(hook, OPENING_CLICHES);

  return {
    available: true,
    hook, firstSentence: first,
    vector: H,
    archetype: recognizable ? archetype : null,
    archetypeLabel: recognizable ? ARCHETYPE_LABELS[archetype] : 'No recognizable hook',
    confidence: round3(confidence),
    recognizable,
    test: tests[archetype],
    allTests: tests,
    passes: recognizable && tests[archetype].passes,
    cliches: clicheHits.map(c => ({ id: c.id, match: c.match, note: c.note })),
    evidence: {
      concreteNouns: na.nouns, adjectives: na.adjectives, ratio: na.ratio === Infinity ? null : round3(na.ratio),
      outlierIndex: round3(outlierIndex), hasQuote, hasSpeechVerb, hasEmotionMarker, hasSensoryVerb,
      specificity: round3(spec.share), words: tokenize(hook).length,
    },
    verdict: !recognizable
      ? 'This opening is a statement rather than a scene. All three shapes that work put the reader somewhere in the first line: an object that contradicts itself, a physical detail, or a voice. Right now the reader is being told the topic.'
      : clicheHits.length
        ? `${clicheHits[0].note} It is a ${ARCHETYPE_LABELS[archetype].toLowerCase()} in form, and the form is fine — the specific phrasing is what thousands of files share.`
        : tests[archetype].passes
          ? `A ${ARCHETYPE_LABELS[archetype].toLowerCase()} that passes its own test. ${tests[archetype].note}`
          : `A ${ARCHETYPE_LABELS[archetype].toLowerCase()} that does not yet pass its own test. ${tests[archetype].note}`,
  };
}

const ARCHETYPE_LABELS = {
  unconventional: 'Unconventional reality',
  sensory: 'Vivid sensory imagery',
  dialogue: 'Dialogue, in medias res',
};

const round3 = (v) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : v);

/**
 * The three archetypes, with a worked example each, for the panel.
 *
 * The examples are the specification's own and are shown as ILLUSTRATIONS of a
 * structure, never as templates to fill in — the whole engine's position is
 * that a filled-in template is the problem it is solving.
 */
export const HOOK_ARCHETYPE_GUIDE = [
  {
    id: 'unconventional', label: ARCHETYPE_LABELS.unconventional,
    move: 'Say something slightly wrong about an ordinary object, then spend the essay making it true.',
    example: '"My most valuable possession is my pile of paper scraps."',
    fails: 'When the paradox is about an abstraction ("my greatest strength is my weakness") rather than about a thing you could photograph.',
  },
  {
    id: 'sensory', label: ARCHETYPE_LABELS.sensory,
    move: 'Put the reader\'s hands on something in the first eight words. Nouns and verbs; almost no adjectives.',
    example: '"My fingers trace the pattern of my grandmother\'s quilt, each stitch a story."',
    fails: 'When adjectives outnumber objects. Three adjectives on one noun is a signal you are describing a memory instead of showing one.',
  },
  {
    id: 'dialogue', label: ARCHETYPE_LABELS.dialogue,
    move: 'Open mid-conversation, with one physical detail attached to whoever is speaking.',
    example: '"Her eyes widen. \'I\'ve always wanted to become an artist,\' she whispers."',
    fails: 'When the quoted line is generic ("You can do anything you set your mind to") — a stock line in quotation marks is still a stock line.',
  },
];
