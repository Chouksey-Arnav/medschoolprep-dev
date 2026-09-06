// ─────────────────────────────────────────────────────────────────────────────
// Module 7 — the Authenticity Index — and Section 2, the Authenticity Sorter.
//
// ── PREMIUM ROADMAP ─────────────────────────────────────────────────────────
// Part of the Narrative Method Engine, planned as a paid tier. See PREMIUM in
// ./constants.js. Note that the SAFEGUARDS in this file are explicitly NOT
// premium: the reassurance about AI detection renders for every account,
// always, and scripts/verifyIvyEngine.mjs asserts it.
// ────────────────────────────────────────────────────────────────────────────
//
//     A_essay = w_p·P_perplexity + w_b·P_burstiness − w_c·C_cliché
//
// ══ THE RULE THIS ENTIRE FILE IS BUILT AROUND ═══════════════════════════════
//  This is NOT an AI detector, it does not produce an accusation, and it must
//  never be presented as either.
//
//  AI-detection scoring is unreliable in a specific and vicious direction: it
//  misfires on non-native English writers, on students taught to write in a
//  formal register, and on anyone whose real voice is careful. A tool that
//  turns those properties into a suspicion score would do the most damage to
//  exactly the students this product exists for.
//
//  So what this module reports is a VOICE reading, phrased as craft: this
//  sentence names an emotion where it could stage one; this paragraph has no
//  cost in it; these three phrases appear in thousands of files. Every single
//  output is a question about a specific sentence with a specific rewrite
//  attached. There is no threshold anywhere in this file that produces a
//  verdict about the student, and `AUTHENTICITY.neverAccuses` is asserted at
//  build time.
// ═════════════════════════════════════════════════════════════════════════════
//
// ── The sorter (Section 2) ─────────────────────────────────────────────────
// The other half of this file is the AI-vs-human edit sorter: the four edits a
// clinical tool makes, against the four a reader actually responds to.
//
//   REJECTED (clinical)              APPROVED (resonant)
//   1. moderating emotional intensity → amplifying raw vulnerability
//   2. flowery generic metaphor       → visceral localised motif
//   3. inserting facts and statistics → narrative stakes and risk
//   4. telling emotions and values    → showing them through choices
//
// The engine's editing suggestions are generated from the right-hand column
// only. That is the entire product difference between this and a grammar
// checker, and it is enforced structurally: the suggestion generators below
// have no path that produces a "soften this" or "add a statistic" edit.
// ─────────────────────────────────────────────────────────────────────────────

import { AUTHENTICITY, clamp } from './constants.js';
import {
  complexityIndex, burstiness, sentences, tokenize, matchRules, wordCount,
} from './text.js';
import {
  OPENING_CLICHES, NARRATIVE_TROPES, CLICHE_PHRASES, TELLING_MARKERS, STAKES_MARKERS,
} from '../../data/ivy/clicheBank.js';

/**
 * Cliché density — C_cliché.
 *
 * Openers count double, because the first sentence is read by every reader and
 * the fourth paragraph is not.
 */
export function clicheDensity(text) {
  const s = String(text || '');
  const words = wordCount(s);
  if (!words) return { count: 0, density: 0, phrases: [], tropes: [], openers: [] };

  const firstThree = sentences(s).slice(0, 3).join(' ');
  const openers = matchRules(firstThree, OPENING_CLICHES);
  const phrases = matchRules(s, CLICHE_PHRASES);
  const tropes = matchRules(s, NARRATIVE_TROPES, { key: 'patterns' });

  const count = openers.length * 2 + phrases.length + tropes.length * 2;
  // Per 250 words, which is roughly one screen and close to half a supplement.
  const density = (count / words) * 250;

  return {
    count, density: Math.round(density * 100) / 100,
    openers: openers.map(o => ({ id: o.id, match: o.match, note: o.note })),
    phrases: phrases.map(p => ({ id: p.id, match: p.match })),
    tropes: tropes.map(t => ({
      id: t.id, label: t.label, match: t.match, redirect: t.redirect,
      saviorRisk: !!t.saviorRisk, honorsHardship: !!t.honorsHardship, smoothCurve: !!t.smoothCurve,
    })),
  };
}

/**
 * THE INDEX.
 *
 * Each term is normalized to [0,1] against its own target before weighting, so
 * that the composite is readable as a proportion rather than as an arbitrary
 * scale — the raw perplexity proxy runs to 200+ and the raw burstiness to 0.6,
 * and adding those together directly would make the index a perplexity score
 * with rounding error attached.
 */
export function authenticityIndex(text) {
  const s = String(text || '').trim();
  const words = wordCount(s);
  if (words < 40) {
    return {
      insufficient: true, words,
      note: 'Under forty words. Voice is not readable at this length — draft a paragraph and run it again.',
    };
  }

  const perplexity = complexityIndex(s);
  const burst = burstiness(s);
  const cliche = clicheDensity(s);

  const w = AUTHENTICITY.weights;
  const pTerm = clamp(perplexity.value / AUTHENTICITY.perplexityTarget, 0, 1.25);
  const bTerm = clamp(burst.value / AUTHENTICITY.burstinessTarget, 0, 1.25);
  const cTerm = clamp(cliche.density / 3, 0, 1.25);

  const index = clamp(w.perplexity * pTerm + w.burstiness * bTerm - w.cliche * cTerm, 0, 1);

  const flags = [];
  if (perplexity.value < AUTHENTICITY.perplexityRisk) {
    flags.push({
      id: 'flat-voice', severity: 'high',
      label: 'The prose is predictable',
      // Phrased as craft. Never as authorship.
      detail: `The vocabulary index is ${perplexity.value}, against a target above ${AUTHENTICITY.perplexityTarget}. In practice that means the sentences are about categories rather than about things: ${Math.round(perplexity.specificity * 100)}% of the words name something specific. This is the most fixable problem on this page — every generic noun replaced by the actual object moves it.`,
    });
  } else if (perplexity.value < AUTHENTICITY.perplexityTarget) {
    flags.push({
      id: 'thin-voice', severity: 'medium',
      label: 'Competent, not yet particular',
      detail: `Vocabulary index ${perplexity.value}; the target is ${AUTHENTICITY.perplexityTarget}. Nothing here reads as wrong — it reads as anyone's. The lever is concrete detail: names, objects, numbers, places.`,
    });
  }
  if (burst.value < 0.25 && burst.lengths.length >= 4) {
    flags.push({
      id: 'metronome', severity: 'medium',
      label: 'Every sentence is the same length',
      detail: `Sentence lengths ${burst.lengths.join(', ')} — mean ${Math.round(burst.mean)}, variation ${burst.value.toFixed(2)}. Human writing lurches. Put a four-word sentence somewhere in the second half and the whole paragraph changes speed.`,
    });
  }
  if (cliche.tropes.length >= 2 || cliche.density >= 2) {
    flags.push({
      id: 'crowded', severity: 'medium',
      label: `${cliche.tropes.length + cliche.phrases.length + cliche.openers.length} recognizable phrases`,
      detail: 'These are not errors and none of them is disqualifying. They are sentences thousands of other files also contain, which means they take up space without carrying anything only you could say.',
    });
  }

  return {
    insufficient: false, words,
    index: Math.round(index * 1000) / 1000,
    perplexity, burstiness: burst, cliche,
    terms: { perplexity: round3(pTerm), burstiness: round3(bTerm), cliche: round3(cTerm) },
    weights: w,
    flags,
    band: index >= 0.75 ? 'distinct' : index >= 0.55 ? 'developing' : index >= 0.35 ? 'generic' : 'flat',
    // ── The safeguard, attached to every single reading ────────────────────
    disclaimer: 'This is a reading of craft, not of authorship. It cannot tell who wrote something and it is not used to. A low score most often means the draft is about categories instead of about a particular Tuesday — and formal, careful English is a style, not a symptom.',
  };
}

const round3 = (v) => Math.round(v * 1000) / 1000;

/**
 * Section 2.2 — narrative stakes and the risk coefficient.
 *
 * Two sorters. The peer/socio-emotional one looks for conflict that cost the
 * writer something socially; the opportunity-cost one looks for the thing they
 * gave up. `smoothCurve` is the finding when a draft has an unbroken record of
 * accomplishment and neither.
 */
export function narrativeStakes(text) {
  const s = String(text || '');
  const hit = (list) => list.map(re => { const m = re.exec(s); return m ? m[0].trim() : null; }).filter(Boolean);

  const peer = hit(STAKES_MARKERS.peer);
  const cost = hit(STAKES_MARKERS.cost);
  const vulnerability = hit(STAKES_MARKERS.vulnerability);

  const cliche = clicheDensity(s);
  const achievementDense = cliche.tropes.some(t => t.smoothCurve)
    || /\b(president|captain|founder|award|medal|first place|4\.0|straight a)\b/i.test(s);

  const smoothCurve = achievementDense && peer.length === 0 && cost.length === 0;

  // C_risk — how much of this draft is at risk rather than at rest.
  const coefficient = clamp(
    0.40 * Math.min(1, cost.length / 2)
    + 0.35 * Math.min(1, peer.length / 2)
    + 0.25 * Math.min(1, vulnerability.length / 2),
    0, 1,
  );

  return {
    coefficient: round3(coefficient),
    peer: { count: peer.length, matches: peer },
    cost: { count: cost.length, matches: cost },
    vulnerability: { count: vulnerability.length, matches: vulnerability },
    smoothCurve,
    findings: [
      cost.length === 0 && {
        id: 'no-opportunity-cost', severity: smoothCurve ? 'high' : 'medium',
        label: 'Nothing was given up',
        detail: 'Every commitment in this draft was added and none was traded. Readers have seen thousands of unbroken accumulation curves and they read as a schedule rather than as a person. What did you drop, turn down, or fail at to make room for the thing this essay is about?',
      },
      peer.length === 0 && vulnerability.length === 0 && {
        id: 'no-conflict', severity: 'medium',
        label: 'Nobody disagreed with you',
        detail: 'There is no moment here where someone pushed back, where you were wrong, or where the room went quiet. A choice with no cost to it is not a choice a reader can weigh.',
      },
      smoothCurve && {
        id: 'smooth-curve', severity: 'high',
        label: 'The excellence treadmill',
        detail: 'This reads as an unbroken record of accomplishment. That may be exactly what your four years were — but the essay is the one place a reader finds out what it cost, and right now it says nothing cost anything.',
      },
      vulnerability.length > 0 && {
        id: 'has-vulnerability', severity: 'good',
        label: 'There is a person on the page',
        detail: `"${vulnerability[0]}" — this is the register that works. Protect it during editing; it is the first thing a polish pass removes.`,
      },
    ].filter(Boolean),
  };
}

/**
 * Section 2.1 — the vulnerability enhancement metric.
 *
 * Finds "telling" constructions and returns the SHOWING question for each. The
 * output is deliberately a question rather than a rewritten sentence: a
 * generated replacement would be the engine's voice, which is the precise thing
 * this module exists to prevent.
 */
export function vulnerabilityAudit(text) {
  const hits = matchRules(text, TELLING_MARKERS);
  const sents = sentences(text);

  const items = hits.map(h => {
    const sentence = sents.find(s => s.toLowerCase().includes(h.match.toLowerCase())) || null;
    return { id: h.id, phrase: h.match, sentence, ask: h.ask };
  });

  const density = sents.length ? items.length / sents.length : 0;
  return {
    items,
    count: items.length,
    density: round3(density),
    // M_vulnerability — high where the draft shows rather than names.
    metric: round3(clamp(1 - density * 2.5, 0, 1)),
    status: density === 0 ? 'showing' : density < 0.2 ? 'mostly-showing' : density < 0.4 ? 'mixed' : 'telling',
    note: items.length
      ? `${items.length} place${items.length === 1 ? '' : 's'} where the draft names a feeling or a virtue instead of staging the moment that would produce it. Each one is a sentence you can replace with the scene it summarises — and the scene is always shorter than people expect.`
      : 'The draft shows rather than tells. That is the harder of the two and it is done.',
  };
}

/**
 * Section 2.3 — the savior-complex filter.
 *
 * Fires on service narratives that position the writer as the one who fixed
 * something for people described only by their deficit. The redirect is always
 * mutual learning, never "drop the topic".
 */
export function saviorAudit(text) {
  const s = String(text || '');
  const tropes = matchRules(s, NARRATIVE_TROPES, { key: 'patterns' }).filter(t => t.saviorRisk);
  const deficitLanguage = [
    /\b(underprivileged|less fortunate|impoverished|needy|at[- ]risk|disadvantaged|the poor)\b/i,
    /\b(they|these (kids|children|people|students)) (had|have) (so little|nothing)\b/i,
    /\bgave (them|him|her) (a )?(voice|hope|chance|future)\b/i,
  ].map(re => { const m = re.exec(s); return m ? m[0].trim() : null; }).filter(Boolean);

  const flagged = tropes.length > 0 || deficitLanguage.length > 0;
  return {
    flagged,
    tropes: tropes.map(t => ({ id: t.id, label: t.label, match: t.match, redirect: t.redirect })),
    deficitLanguage,
    guidance: flagged
      ? 'This positions you as the one who solved something for people the draft describes by what they lack. Two edits fix it, and both make the essay better rather than safer: name one specific thing you learned from someone you were supposedly helping, and name one thing you got wrong. The version of this essay that works is about being changed, not about changing someone.'
      : null,
  };
}

/**
 * THE SORTER. Section 2's table, applied to a draft.
 *
 * @returns {{rejected: Array, approved: Array}} — `rejected` is the list of
 * edits a clinical tool WOULD make on this text and that this engine refuses to
 * make, shown so the student can recognize them when another tool offers them.
 */
export function authenticitySorter(text) {
  const auth = authenticityIndex(text);
  if (auth.insufficient) return { insufficient: true, note: auth.note };

  const stakes = narrativeStakes(text);
  const vuln = vulnerabilityAudit(text);
  const savior = saviorAudit(text);

  const rejected = [
    { id: 'moderate-emotion', clinical: 'Moderate the emotional intensity — "this reads as too raw for an application"', why: 'Raw is the part that gets remembered. The moment a reader can feel is the moment they can recall three days later, and every polish pass removes it first.' },
    { id: 'flowery-metaphor', clinical: 'Add a metaphor to elevate the language', why: 'A generic metaphor is a stock photo. The localised motif you already have — the actual object on your actual desk — does the same job and can only have come from you.' },
    { id: 'insert-stats', clinical: 'Support this with a statistic or a fact about the field', why: 'A reader has the statistics. What they do not have is you. Facts inserted for credibility read as padding in a 650-word essay.' },
    { id: 'name-the-value', clinical: 'State clearly what this taught you about leadership and resilience', why: 'Naming the virtue is the fastest way to stop demonstrating it. Show the choice; the reader will name it themselves and believe their own version.' },
  ];

  const approved = [];
  if (vuln.items.length) {
    approved.push({
      id: 'amplify-vulnerability', label: 'Amplify what is raw',
      targets: vuln.items.slice(0, 4).map(i => ({ sentence: i.sentence, ask: i.ask })),
    });
  }
  if (auth.perplexity.specificity < 0.08) {
    approved.push({
      id: 'localise-motif', label: 'Replace the general with the particular',
      // Addressed to the student in the second person on purpose. It reads
      // better, and it also makes the sentence classifiable: the shared prose
      // guard (api/_lib/essayProseGuard.js) reads an unaddressed instruction
      // carrying a first-person example fragment as essay voice, which is the
      // right call on the text as written. Coaching should say who it is
      // talking to.
      note: `Only ${Math.round(auth.perplexity.specificity * 100)}% of the words in your draft name something specific. Go through it and replace every category noun with the actual object: not "supplies" but the thing itself, not the community but the street.`,
    });
  }
  if (stakes.cost.count === 0 || stakes.smoothCurve) {
    approved.push({
      id: 'add-stakes', label: 'Put something at risk',
      note: 'Add the paragraph where it cost you: what you dropped, who was disappointed, what you failed at first. This is the single highest-value edit available on most drafts.',
    });
  }
  if (savior.flagged) {
    approved.push({ id: 'flip-the-learning', label: 'Flip the direction of the learning', note: savior.guidance });
  }
  if (auth.cliche.tropes.length) {
    approved.push({
      id: 'replace-trope', label: 'Trade the recognizable shape for your version of it',
      targets: auth.cliche.tropes.map(t => ({ label: t.label, match: t.match, redirect: t.redirect })),
    });
  }

  return {
    insufficient: false,
    index: auth.index, band: auth.band,
    authenticity: auth, stakes, vulnerability: vuln, savior,
    rejected, approved,
    // Restated at the point of delivery, because this is the screen where a
    // student is most likely to conclude they are being accused of something.
    safeguard: 'Nothing on this screen is an AI-detection result. We do not run one, we could not act on one, and the Common App handles suspected misrepresentation through a collaborative review with your school rather than through automated scoring. Every item here is an editing suggestion about a specific sentence.',
  };
}
