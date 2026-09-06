// ─────────────────────────────────────────────────────────────────────────────
// Module 6 — the supplemental storyboard, plus the "why us" and "why major"
// structural validators (Section 5.4).
//
// ── PREMIUM ROADMAP ─────────────────────────────────────────────────────────
// Part of the Narrative Method Engine, planned as a paid tier. See PREMIUM in
// ./constants.js.
// ────────────────────────────────────────────────────────────────────────────
//
//     S_supplemental = 1 − Σ |Rₚ − Dₚ|        D⃗ = [0.15, 0.35, 0.35, 0.15]
//
// Four phases: hook, chronology, impact, reflection. The score measures how far
// the actual word distribution sits from the target one.
//
// ── The hard problem: which words are in which phase ───────────────────────
// A student's draft does not come labeled. Two approaches were possible:
//
//   • Trust the paragraphs. Fast, and wrong for the many drafts written as one
//     block or as eight short paragraphs.
//   • Classify each sentence by what it is DOING — scene-setting, narrating
//     progression, reporting numbers, or looking forward — and let the phases
//     fall where they fall.
//
// This module does the second, and then requires the phases to be CONTIGUOUS
// and in order, because that is what a storyboard is. A draft whose impact
// sentences are scattered through the chronology gets a low structural score
// and is told that specifically, which is a more useful finding than the word
// ratios alone would ever produce.
//
// ── The one absolute rule ──────────────────────────────────────────────────
// Phase 3 requires at least two quantified metrics. Not "consider adding
// numbers" — a flag, every time, because this is the single most common
// difference between an activity essay that lands and one that does not, and it
// is the easiest thing on this page for a student to fix in ten minutes.
// ─────────────────────────────────────────────────────────────────────────────

import { STORYBOARD_TARGETS, STORYBOARD_PHASES, MIN_IMPACT_METRICS, clamp } from './constants.js';
import { sentences, tokenize, wordCount, specificity, passiveVoice } from './text.js';
import { REFLECTION_MARKERS } from '../../data/ivy/clicheBank.js';
import { METRIC_PATTERNS, SUPPLEMENT_STRUCTURES } from '../../data/ivy/commonAppRules.js';

const CHRONOLOGY_MARKERS = /\b(then|next|after|before|later|by (the )?(end|time)|first|second|finally|eventually|over the (next|following)|that (summer|year|fall|spring|winter)|freshman|sophomore|junior|senior|month|year|week|began|started|joined|became|grew|expanded|took over|stepped up|for (two|three|four) years)\b/i;
const FORWARD_MARKERS = new RegExp(`\\b(${REFLECTION_MARKERS.map(m => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'i');

/** Does this sentence contain a countable claim? */
export function countMetrics(text) {
  const s = String(text || '');
  const found = [];
  for (const re of METRIC_PATTERNS) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    const matches = s.match(g);
    if (matches) found.push(...matches);
  }
  // Dedupe by normalized text — "2,200 art kits" matched by two patterns is one
  // metric, not two, and inflating the count would defeat the whole check.
  const unique = [...new Set(found.map(f => f.trim().toLowerCase()))];
  return { count: unique.length, matches: unique };
}

/**
 * Where each phase sits, as the midpoint of its share of the target
 * distribution [0.15, 0.35, 0.35, 0.15]. Used for the positional prior below.
 */
const PHASE_CENTRES = { hook: 0.075, chronology: 0.325, impact: 0.675, reflection: 0.925 };
const PRIOR_WIDTH = 0.45;

/**
 * Classifies one sentence into the phase it is doing the work of.
 *
 * Two sources of evidence, and both are needed:
 *
 *   • A POSITIONAL PRIOR. A hook is at the start and a reflection is at the
 *     end by definition, so position is real evidence, not a fallback. Without
 *     it, a draft whose sentences trip no keyword lands entirely in one phase
 *     and scores zero — which says nothing about the draft and everything
 *     about the classifier.
 *   • MARKER EVIDENCE, which is what actually moves a sentence away from where
 *     its position would have put it. That is the informative part: an
 *     unquantified sentence sitting where the impact section should be is
 *     precisely the finding this module exists to produce.
 */
function classifySentence(sentence, position, total) {
  const metrics = countMetrics(sentence);
  const spec = specificity(sentence);
  const hasQuote = /["“][^"”]{4,}["”]/.test(sentence);

  const prior = (phase) => clamp(1 - Math.abs(position - PHASE_CENTRES[phase]) / PRIOR_WIDTH, 0, 1) * 0.40;

  const scores = {
    hook: prior('hook') + (hasQuote ? 0.40 : 0) + clamp(spec.share / 0.25, 0, 0.30),
    chronology: prior('chronology') + (CHRONOLOGY_MARKERS.test(sentence) ? 0.55 : 0),
    impact: prior('impact') + clamp(metrics.count * 0.45, 0, 0.90),
    reflection: prior('reflection') + (FORWARD_MARKERS.test(sentence) ? 0.40 : 0)
      + (/\b(taught|learned|understand|realis|realiz|matter|why|because of)\w*/i.test(sentence) ? 0.20 : 0),
  };
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return { phase: best[0], confidence: round3(best[1]), metrics: metrics.count, scores };
}

/**
 * THE STORYBOARD SCORE.
 *
 * @param {string} text        the supplement draft
 * @param {Object} [opts]
 * @param {number} [opts.limit] the prompt's word limit, if known
 */
export function scoreStoryboard(text, { limit = null, kind = 'supplement' } = {}) {
  const s = String(text || '').trim();
  const words = wordCount(s);
  if (words < 40) return { available: false, words, note: 'Under forty words. Draft a paragraph and this becomes readable.' };

  const sents = sentences(s);

  // ── Resolution floor ────────────────────────────────────────────────────
  // Four target proportions cannot be measured against four sentences: one
  // sentence is 25% of the draft, so the residual is dominated by quantisation
  // rather than by structure, and the score reads as a damning 0.1 for a
  // perfectly reasonable opening paragraph. Below six sentences the module
  // still returns its per-phase reading — which is useful — and marks the
  // score as low-resolution so nothing downstream treats it as a finding.
  const lowResolution = sents.length < 6;
  const assigned = sents.map((sentence, i) => ({
    sentence,
    words: tokenize(sentence).length,
    ...classifySentence(sentence, sents.length > 1 ? i / (sents.length - 1) : 0, sents.length),
  }));

  const totals = { hook: 0, chronology: 0, impact: 0, reflection: 0 };
  for (const a of assigned) totals[a.phase] += a.words;
  const totalWords = Object.values(totals).reduce((a, b) => a + b, 0) || 1;

  const R = STORYBOARD_PHASES.map(p => totals[p.id] / totalWords);
  const deviation = R.reduce((sum, r, i) => sum + Math.abs(r - STORYBOARD_TARGETS[i]), 0);
  const score = clamp(1 - deviation, 0, 1);

  // ── Are the phases in order and contiguous? ─────────────────────────────
  const order = ['hook', 'chronology', 'impact', 'reflection'];
  const seq = assigned.map(a => order.indexOf(a.phase));
  let inversions = 0;
  for (let i = 1; i < seq.length; i++) if (seq[i] < seq[i - 1]) inversions++;
  const structural = clamp(1 - inversions / Math.max(1, seq.length - 1), 0, 1);

  // ── Per-phase findings ──────────────────────────────────────────────────
  const metrics = countMetrics(s);
  const phases = STORYBOARD_PHASES.map((p, i) => {
    const actual = R[i];
    const target = STORYBOARD_TARGETS[i];
    const delta = actual - target;
    const phaseSentences = assigned.filter(a => a.phase === p.id);
    return {
      ...p,
      words: totals[p.id], actual: round3(actual), target, delta: round3(delta),
      sentences: phaseSentences.map(a => a.sentence),
      state: Math.abs(delta) < 0.08 ? 'balanced' : delta > 0 ? 'over' : 'under',
      advice: Math.abs(delta) < 0.08 ? null
        : delta > 0
          ? `${Math.round(actual * 100)}% of the draft against a ${Math.round(target * 100)}% target — about ${Math.round(Math.abs(delta) * totalWords)} words too many. ${OVER_ADVICE[p.id]}`
          : `${Math.round(actual * 100)}% against a ${Math.round(target * 100)}% target — about ${Math.round(Math.abs(delta) * totalWords)} words short. ${UNDER_ADVICE[p.id]}`,
    };
  });

  const findings = [];

  // Phase 1 — passive or generic opening.
  const openingPassive = passiveVoice(sents.slice(0, 2).join(' '));
  if (openingPassive.count) {
    findings.push({ phase: 'hook', severity: 'medium', label: 'The opening is passive', detail: `"${openingPassive.hits[0].phrase}" in the first two sentences. An opening in the passive voice has removed the only person the reader is here to meet.` });
  }

  // Phase 3 — the absolute rule.
  if (metrics.count < MIN_IMPACT_METRICS) {
    findings.push({
      phase: 'impact', severity: 'high', label: `${metrics.count} quantified metric${metrics.count === 1 ? '' : 's'}`,
      detail: `This draft needs at least ${MIN_IMPACT_METRICS} countable claims and has ${metrics.count}. Not to impress anyone — because "we grew a lot" and "we went from 9 members to 41 across two schools" are the same sentence to you and completely different sentences to a reader who has never met you.`,
      found: metrics.matches,
    });
  } else {
    findings.push({ phase: 'impact', severity: 'good', label: `${metrics.count} quantified claims`, detail: `${metrics.matches.slice(0, 4).join(', ')} — this is the part of the draft a reader can actually check, and it is doing its job.`, found: metrics.matches });
  }

  // Phase 4 — no forward look.
  const lastQuarter = assigned.slice(Math.floor(assigned.length * 0.75));
  if (!lastQuarter.some(a => FORWARD_MARKERS.test(a.sentence))) {
    findings.push({ phase: 'reflection', severity: 'medium', label: 'The ending does not look forward', detail: 'The draft finishes describing what happened without connecting it to anything next. One sentence about what you still do because of this, or what you would do with more of it, closes the loop a reader is holding open.' });
  }

  // Structure.
  if (inversions >= 2) {
    findings.push({ phase: 'structure', severity: 'medium', label: 'The phases are interleaved', detail: `The draft moves between narrating and reporting results ${inversions} times. Grouping the impact into one place makes both halves stronger — the story reads as a story and the numbers read as evidence rather than as interruptions.` });
  }

  if (limit && words > limit) {
    findings.push({ phase: 'structure', severity: 'high', label: `${words} words against a ${limit}-word limit`, detail: `${words - limit} over. Cut from whichever phase is furthest over target — that is ${phases.filter(p => p.state === 'over').sort((a, b) => b.delta - a.delta)[0]?.label || 'the longest phase'}.` });
  }

  return {
    available: true, words, limit, kind,
    lowResolution,
    sentenceCount: sents.length,
    resolutionNote: lowResolution
      ? `Only ${sents.length} sentences, so the word-distribution score is dominated by rounding rather than by structure — the per-phase reading below is still real, the single number is not. It becomes meaningful past about six sentences.`
      : kind === 'personal-statement'
        ? 'The four-phase model is written for the activity supplement. Applied to a personal statement it is advisory: a personal statement legitimately spends more on scene and reflection and less on countable impact.'
        : null,
    score: round3(score),
    structuralScore: round3(structural),
    deviation: round3(deviation),
    phases,
    ratios: R.map(round3), targets: STORYBOARD_TARGETS,
    inversions,
    metrics,
    findings,
    assigned,
    note: score >= 0.75
      ? 'The proportions are close to the target shape. What is left is at the sentence level.'
      : `The shape is off by ${Math.round(deviation * 100)} percentage points across the four phases. ${phases.filter(p => p.state !== 'balanced').map(p => `${p.label} is ${p.state}`).join('; ')}.`,
  };
}

const OVER_ADVICE = {
  hook: 'A hook past about three sentences stops being an opening and becomes the essay.',
  chronology: 'Compress the middle years. A reader needs the shape of the progression, not every step of it.',
  impact: 'Numbers stacked without narrative read as a résumé. Keep the two or three that a reader could not have guessed.',
  reflection: 'A long reflection tells the reader what to think. Trust the scene and cut this back.',
};
const UNDER_ADVICE = {
  hook: 'Open in a moment rather than on a summary — one scene, one object, one line of speech.',
  chronology: 'The reader cannot see how you got from starting to leading. Two or three sentences of progression are what make the impact believable.',
  impact: 'This is the half of the essay that is checkable. Numbers, names, dates, outcomes.',
  reflection: 'Close the loop: what you still do because of this, and where it points.',
};

const round3 = (v) => Math.round(v * 1000) / 1000;

/**
 * The "why us" validator (Section 5.4).
 *
 * Checks for a named course, a named person, a named program, and the sentence
 * that joins one of them to this specific student — and blocks the five
 * patterns that make a "why us" essay interchangeable.
 */
export function validateWhyUs(text, { school = null } = {}) {
  const s = String(text || '').trim();
  const structure = SUPPLEMENT_STRUCTURES.why_us;
  if (wordCount(s) < 25) return { available: false, note: 'Too short to audit.' };

  // Every offending phrase, not one per rule. Several of these rules cover a
  // family of marketing words ("prestigious", "pinnacle", "reputation" are one
  // rule), and a student rewriting the draft needs each one highlighted — being
  // told about "pinnacle", fixing it, and then being told about "reputation" is
  // the worst possible way to deliver the same list.
  const blocked = structure.blocked.flatMap(b => {
    const re = new RegExp(b.re.source, b.re.flags.includes('g') ? b.re.flags : `${b.re.flags}g`);
    const seen = new Set();
    const out = [];
    let m;
    while ((m = re.exec(s)) !== null) {
      const key = m[0].toLowerCase();
      if (!seen.has(key)) { seen.add(key); out.push({ id: b.id, match: m[0], note: b.note }); }
      if (m.index === re.lastIndex) re.lastIndex++;   // zero-width safety
    }
    return out;
  });

  // A course reads as a course when it has a code or a title-case name after a
  // course word; a person reads as a person when a name follows Professor/Dr.
  const namedCourse = /\b([A-Z]{2,5}\s?\d{3,4}[A-Z]?)\b/.test(s)
    || /\b(course|seminar|class|lab)\b[^.]{0,40}["“][^"”]+["”]/.test(s)
    || /\b(taking|take|enroll(ing)? in)\b[^.]{0,30}\b[A-Z][a-z]+\s[A-Z][a-z]+\b/.test(s);
  const namedFaculty = /\b(Professor|Prof\.|Dr\.)\s+[A-Z][a-z]+/.test(s)
    || /\b[A-Z][a-z]+\s+[A-Z][a-z]+'s\s+(research|work|lab|book|study)\b/.test(s);
  const namedProgram = /\b([A-Z][a-z]+\s){1,4}(Lab|Laboratory|Center|Centre|Institute|Initiative|Program|Programme|Fellowship|Society|Journal|Review|Collective|Consortium)\b/.test(s);
  // The join: a first-person clause in the same sentence as a specific noun.
  const theJoin = /\b(I|my)\b[^.]{0,120}\b(because|so that|which is why|since|after|having)\b/i.test(s)
    && /\b(I|my)\b[^.]{0,80}\b(want|plan|would|will|hope|intend)\b/i.test(s);

  const requirements = [
    { id: 'named-course', label: structure.requires[0].label, met: namedCourse, fix: 'Open the department\'s course catalog, find one course past the intro sequence you would actually take, and name it with its number.' },
    { id: 'named-faculty', label: structure.requires[1].label, met: namedFaculty, fix: 'Name one professor and one thing they published. Two sentences of their abstract is enough — the point is that you looked.' },
    { id: 'named-program', label: structure.requires[2].label, met: namedProgram, fix: 'Name a lab, center, publication, or tradition. Specific enough that it does not exist at the school down the road.' },
    { id: 'the-join', label: structure.requires[3].label, met: theJoin, fix: 'Add the sentence that connects one of those things to something you have already done. That sentence is the essay; the rest is evidence for it.' },
  ];

  const met = requirements.filter(r => r.met).length;
  // The swap test, which is what an admissions reader is actually applying.
  const swappable = met <= 1;

  return {
    available: true,
    requirements, met, total: requirements.length,
    blocked,
    score: round3(clamp(met / requirements.length - blocked.length * 0.15, 0, 1)),
    swapTest: {
      fails: swappable,
      note: swappable
        ? `Paste another school's name over ${school || 'this one'} and every sentence in this draft is still true. That is the test the reader applies, and this draft does not pass it.`
        : 'The draft contains things that are only true of this school.',
    },
    note: blocked.length
      ? `${blocked.length} phrase${blocked.length === 1 ? '' : 's'} that appear in this school's own marketing copy: ${blocked.map(b => `"${b.match}"`).join(', ')}. Each one is space spent telling them something they know.`
      : `${met} of ${requirements.length} structural requirements met.`,
  };
}

/** The "why major" validator — past, present, future, in proportion. */
export function validateWhyMajor(text) {
  const s = String(text || '').trim();
  if (wordCount(s) < 25) return { available: false, note: 'Too short to audit.' };

  const parts = SUPPLEMENT_STRUCTURES.why_major.parts;
  const sents = sentences(s);
  const totalWords = wordCount(s) || 1;

  const PAST = /\b(when I was|at (the age of|twelve|thirteen|fourteen|fifteen)|in (middle school|freshman|sophomore)|first (time|encountered|saw|read)|growing up|as a child|it started)\b/i;
  const PRESENT = /\b(I (have |had )?(spent|built|ran|led|founded|researched|worked|volunteered|taught|wrote|coded|analy[sz]ed)|for (two|three|four) years|every (week|summer|day)|my (project|research|club|team|nonprofit))\b/i;
  const FUTURE = /\b(I (want|plan|hope|intend|will|would like) to|after (college|graduation)|career|eventually|my goal|degree in|go on to)\b/i;

  const buckets = { catalyst: 0, sustained: 0, future: 0 };
  const found = { catalyst: [], sustained: [], future: [] };
  for (const sent of sents) {
    const w = tokenize(sent).length;
    const key = FUTURE.test(sent) ? 'future' : PRESENT.test(sent) ? 'sustained' : PAST.test(sent) ? 'catalyst' : null;
    if (key) { buckets[key] += w; found[key].push(sent); }
  }
  const covered = Object.values(buckets).reduce((a, b) => a + b, 0);

  const result = parts.map(p => {
    const words = buckets[p.id] || 0;
    const share = covered ? words / covered : 0;
    return {
      ...p, words, share: round3(share), present: words > 0,
      state: !words ? 'missing' : Math.abs(share - p.share) < 0.15 ? 'balanced' : share > p.share ? 'over' : 'under',
      sentences: found[p.id],
    };
  });

  const missing = result.filter(r => !r.present);
  return {
    available: true,
    parts: result, missing: missing.map(m => m.id),
    coverage: round3(covered / totalWords),
    score: round3(clamp((3 - missing.length) / 3 - (covered / totalWords < 0.5 ? 0.2 : 0), 0, 1)),
    note: missing.length
      ? `Missing ${missing.map(m => m.label.toLowerCase()).join(' and ')}. ${missing.some(m => m.id === 'sustained') ? 'The sustained-engagement half is the one that is almost always missing and the one that decides whether this reads as a commitment or as a preference.' : ''}`
      : 'All three parts present. Check the proportions: the middle should be the largest.',
  };
}
