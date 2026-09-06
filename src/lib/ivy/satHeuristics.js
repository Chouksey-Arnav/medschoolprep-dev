// ─────────────────────────────────────────────────────────────────────────────
// Module 4 — the SAT heuristic mastery index.
//
// ── PREMIUM ROADMAP ─────────────────────────────────────────────────────────
// Part of the Narrative Method Engine, planned as a paid tier. See PREMIUM in
// ./constants.js.
// ────────────────────────────────────────────────────────────────────────────
//
//     M_SAT = (1/5) Σ Hₕ
//
// Five techniques, each scored 0–1 from the student's own attempts.
//
// ── This module is deliberately narrow ─────────────────────────────────────
// The app already has a full SAT pillar (src/lib/sat/, src/data/sat/), which is
// where question banks, adaptive forms and score scales live — and which is
// currently sealed behind a beta cover (src/lib/betaFlags.js). This module does
// not duplicate any of it and must not: it scores FIVE NAMED TECHNIQUES, which
// is a different question from "what will you score".
//
// So there is no score prediction anywhere in this file. A student's projected
// SAT score is the SAT pillar's job, and two different estimates of the same
// number on two screens is how a product loses the right to be believed.
//
// ── Unattempted is not zero ────────────────────────────────────────────────
// A heuristic with no attempts returns `available: false` and is EXCLUDED from
// the mean rather than counted as mastery zero. Otherwise a student who has
// practiced one technique well is shown 0.2 and told they are failing at four
// things they have not tried, which is both false and the fastest way to make
// someone stop using a study tool.
// ─────────────────────────────────────────────────────────────────────────────

import { SAT_HEURISTICS, clamp } from './constants.js';

/**
 * @typedef {Object} HeuristicAttempts
 * @property {number} attempted  items tried using the technique
 * @property {number} correct    items answered correctly
 * @property {number} [medianSeconds]  time per item, where the technique is
 *                                     about speed as well as accuracy
 */

/** Techniques where speed is part of the claim, with their target seconds. */
const SPEED_TARGETS = { tac: 45, pin: 60, fourq: 70 };

/** Below this many attempts, accuracy is noise rather than mastery. */
const MIN_ATTEMPTS = 8;

/**
 * @param {Object<string, HeuristicAttempts>} practice  keyed by heuristic id
 */
export function scoreSatHeuristics(practice = {}) {
  const results = SAT_HEURISTICS.map(h => {
    const p = practice[h.id] || practice[h.key] || null;
    const attempted = Number(p?.attempted ?? 0);
    const correct = Number(p?.correct ?? 0);

    if (!attempted) {
      return {
        ...h, available: false, value: null, attempted: 0,
        state: 'untried',
        note: `Not practiced yet. ${h.detail}`,
      };
    }

    const accuracy = clamp(correct / attempted, 0, 1);

    // Speed, where the technique is partly a speed claim. A student who is
    // accurate but slower than the target has the technique and not yet the
    // fluency, and those are different pieces of advice.
    const target = SPEED_TARGETS[h.id];
    const seconds = Number(p?.medianSeconds ?? NaN);
    const speedFactor = target && Number.isFinite(seconds)
      ? clamp(1 - Math.max(0, seconds - target) / (target * 1.5), 0.5, 1)
      : 1;

    // Confidence shrink: few attempts pull the estimate toward the middle
    // rather than letting 3/3 read as mastery.
    const shrink = clamp(attempted / MIN_ATTEMPTS, 0, 1);
    const value = clamp(accuracy * speedFactor * shrink + 0.5 * (1 - shrink) * accuracy, 0, 1);

    return {
      ...h, available: true,
      value: round3(value),
      accuracy: round3(accuracy), attempted, correct,
      seconds: Number.isFinite(seconds) ? seconds : null,
      speedFactor: round3(speedFactor),
      provisional: attempted < MIN_ATTEMPTS,
      state: value >= 0.85 ? 'mastered' : value >= 0.65 ? 'working' : value >= 0.4 ? 'shaky' : 'not-landing',
      note: attempted < MIN_ATTEMPTS
        ? `${correct}/${attempted} — too few attempts to call. ${MIN_ATTEMPTS - attempted} more and this becomes a real reading.`
        : value >= 0.85
          ? `${correct}/${attempted}${target && Number.isFinite(seconds) ? ` at ${seconds}s` : ''}. This one is yours; stop drilling it.`
          : speedFactor < 0.85
            ? `${correct}/${attempted} correct but ${seconds}s against a ${target}s target. You have the technique and not the fluency — the fix is volume, not more explanation.`
            : `${correct}/${attempted}. ${h.detail}`,
    };
  });

  const evaluable = results.filter(r => r.available);
  const index = evaluable.length
    ? evaluable.reduce((s, r) => s + r.value, 0) / evaluable.length
    : null;

  const untried = results.filter(r => !r.available);
  const weakest = [...evaluable].sort((a, b) => a.value - b.value)[0] || null;

  return {
    heuristics: results,
    index: index == null ? null : round3(index),
    // The specification's M_SAT is a mean over five. Where fewer than five have
    // been attempted the mean is over what exists, and the count is reported so
    // nobody reads a partial index as a full one.
    evaluated: evaluable.length, total: SAT_HEURISTICS.length,
    coverage: round3(evaluable.length / SAT_HEURISTICS.length),
    untried: untried.map(u => ({ id: u.id, label: u.label, detail: u.detail })),
    weakest: weakest ? { id: weakest.id, label: weakest.label, value: weakest.value } : null,
    next: untried[0]
      ? { id: untried[0].id, label: untried[0].label, why: 'Not practiced at all — the cheapest available gain is a technique you have never tried.' }
      : weakest && weakest.value < 0.85
        ? { id: weakest.id, label: weakest.label, why: weakest.note }
        : null,
    note: index == null
      ? 'No technique practice logged yet. Each of these five is a twenty-minute skill that transfers across every form of the test.'
      : evaluable.length < SAT_HEURISTICS.length
        ? `Index ${round3(index)} across ${evaluable.length} of ${SAT_HEURISTICS.length} techniques. The untried ones are excluded rather than counted as zero.`
        : `Index ${round3(index)} across all five techniques.`,
    // Explicit, because this is the boundary that keeps two modules honest.
    scopeNote: 'This measures five techniques, not your score. Score estimates come from full-length practice forms in the SAT pillar.',
  };
}

const round3 = (v) => Math.round(v * 1000) / 1000;

/** The techniques, for a panel that wants to teach them before scoring them. */
export const HEURISTIC_GUIDE = SAT_HEURISTICS.map(h => ({
  ...h,
  drill: {
    copa: 'Ten reading questions. Cover the answers with your hand, write your own answer in four words, then uncover. Track how often your answer matched one of them.',
    tac: 'Ten table or graph questions. Never solve forward — test choices against rows. Time each one.',
    pin: 'Ten questions with variables in the answers. Substitute 2, 3 and 10, and eliminate.',
    fourq: 'One passage, four questions. Read the questions first, then read the passage once looking only for those four things.',
    strip: 'Twenty grammar items. For each, cross out every prepositional phrase and interrupting clause, then read subject and verb aloud together.',
  }[h.id],
}));
