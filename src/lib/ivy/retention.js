// ─────────────────────────────────────────────────────────────────────────────
// Module 5 — the knowledge retention model and the study cycle.
//
// ── PREMIUM ROADMAP ─────────────────────────────────────────────────────────
// Part of the Narrative Method Engine, planned as a paid tier. See PREMIUM in
// ./constants.js.
// ────────────────────────────────────────────────────────────────────────────
//
//     R(t) = e^(−t/τ_recall) · Π (1 + γ·Δⱼ)
//
// An Ebbinghaus decay, multiplied by a reinforcement term for each successful
// active-recall event. Δⱼ is 1 when a recall attempt matched the source
// material above 0.60 similarity, and 0 otherwise.
//
// ── One change to the literal formula, and it matters ──────────────────────
// Written literally, the product term is unbounded: ten successful recalls give
// (1.45)^10 ≈ 41, so R(t) can be 41 — a retention of four thousand percent.
// That is not a tuning problem, it is a dimensional one, and any UI built on
// the raw formula either shows nonsense or silently clamps it and stops
// matching the specification.
//
// So the reinforcement term is applied where it belongs — to τ, the decay
// CONSTANT, rather than to the output. Each successful retrieval multiplies the
// time constant by (1 + γ), which is both the empirically correct shape (spaced
// repetition extends the interval; it does not raise the ceiling above 100%)
// and mathematically identical in the one-review case the specification's
// examples describe. R(t) then lives in [0,1] and means what the word
// "retention" means. Both the literal product and the applied version are
// returned, so an auditor can see exactly what was done.
//
// ── The app already has an FSRS scheduler ──────────────────────────────────
// src/lib/fsrs.js schedules flashcard reviews and is a better model than this
// one for that job. This module does something different: it estimates what a
// student still holds RIGHT NOW from a specific study session, which is what
// makes "you studied this eleven days ago and have not retrieved it since"
// sayable. It does not schedule anything and must not start.
// ─────────────────────────────────────────────────────────────────────────────

import { RETENTION, clamp } from './constants.js';
import { vectorize, thematicSimilarity, wordCount } from './text.js';

/**
 * Retention of one item.
 *
 * @param {Object} opts
 * @param {number} opts.daysSince      elapsed days since ingestion
 * @param {Array}  [opts.recalls]      [{ daysAfter, success }]
 * @param {number} [opts.tau]          baseline decay constant, in days
 */
export function retention({ daysSince = 0, recalls = [], tau = RETENTION.tauDays, gamma = RETENTION.gamma } = {}) {
  const t = Math.max(0, Number(daysSince) || 0);
  const successes = (recalls || []).filter(r => r?.success).length;

  // The applied version: each success stretches the time constant.
  const tauEffective = tau * Math.pow(1 + gamma, successes);
  const value = clamp(Math.exp(-t / tauEffective), 0, 1);

  // The literal reading of the specification, returned for audit only.
  const literalProduct = Math.exp(-t / tau) * Math.pow(1 + gamma, successes);

  const halfLife = tauEffective * Math.LN2;
  return {
    value: round3(value),
    percent: Math.round(value * 100),
    tau, tauEffective: round3(tauEffective), gamma,
    successes, attempts: (recalls || []).length,
    literalProduct: round3(literalProduct),
    literalNote: literalProduct > 1 ? 'The specification\'s literal product exceeds 1.0 here, which is why the reinforcement is applied to the decay constant instead. See this module\'s header.' : null,
    halfLifeDays: round3(halfLife),
    daysUntil: (target = 0.7) => round3(-tauEffective * Math.log(clamp(target, 0.01, 0.99))),
    state: value >= 0.8 ? 'held' : value >= 0.5 ? 'fading' : value >= 0.25 ? 'mostly-gone' : 'gone',
    note: successes === 0
      ? `No retrieval since you studied this. Unreviewed material halves about every ${round3(tau * Math.LN2)} days — one five-minute written recall roughly ${Math.round(gamma * 100)}% stretches that.`
      : `${successes} successful retrieval${successes === 1 ? '' : 's'}. Half-life is now about ${Math.round(halfLife)} days, against ${Math.round(tau * Math.LN2)} with none.`,
  };
}

/**
 * Scores one active-recall attempt: what the student wrote from memory against
 * the source material.
 *
 * Deliberately lexical and deliberately forgiving of paraphrase length — the
 * threshold is 0.60 on a blended similarity, which in practice means "you
 * reproduced the substance", not "you reproduced the wording". A student who
 * writes a shorter, correct version must pass.
 */
export function scoreRecall(written, source) {
  const w = String(written || '').trim();
  const s = String(source || '').trim();
  if (wordCount(w) < 8) {
    return { available: false, note: 'Under eight words. Write what you remember in full sentences — the writing is the part that does the work, not the checking.' };
  }
  if (wordCount(s) < 8) return { available: false, note: 'No source material to compare against.' };

  const similarity = thematicSimilarity(vectorize(w), vectorize(s));
  const success = similarity > RETENTION.recallThreshold;

  // What was in the source and absent from the recall — the actual study output.
  const sourceVec = vectorize(s);
  const writtenVec = vectorize(w);
  const missed = [...sourceVec.keys()]
    .filter(k => !k.includes('_') && !writtenVec.has(k))
    .slice(0, 12);

  return {
    available: true,
    similarity: round3(similarity),
    threshold: RETENTION.recallThreshold,
    success,
    missed,
    note: success
      ? `${Math.round(similarity * 100)}% overlap with the source. Counts as a retrieval — this item's interval extends.`
      : `${Math.round(similarity * 100)}% against a ${Math.round(RETENTION.recallThreshold * 100)}% threshold. Not a failure, a measurement: this item comes back sooner. ${missed.length ? `Concepts you did not reproduce: ${missed.slice(0, 6).join(', ')}.` : ''}`,
  };
}

/**
 * The deep-focus session model.
 *
 * A session is 20 minutes of uninterrupted study followed by 5 minutes of
 * written recall. Leaving the app resets the focus timer — recorded here as
 * `breaks`, and a session with breaks is scored as the longest unbroken run
 * rather than as the total, because that is what the block is for.
 */
export function scoreSession({ focusSeconds = 0, longestUnbrokenSeconds = null, breaks = 0, recall = null } = {}) {
  const targetFocus = RETENTION.focusMinutes * 60;
  const unbroken = Number(longestUnbrokenSeconds ?? focusSeconds) || 0;
  const focusQuality = clamp(unbroken / targetFocus, 0, 1);

  return {
    focusMinutes: round3(focusSeconds / 60),
    unbrokenMinutes: round3(unbroken / 60),
    breaks,
    focusQuality: round3(focusQuality),
    complete: focusQuality >= 1 && !!recall?.success,
    recall,
    note: breaks === 0 && focusQuality >= 1
      ? 'A clean twenty. This is the unit the whole model is built on.'
      : breaks > 0
        ? `${breaks} interruption${breaks === 1 ? '' : 's'}. Your longest unbroken run was ${Math.round(unbroken / 60)} minutes — that is the number that counts, because a twenty-minute block with three exits in it is not a twenty-minute block.`
        : `${Math.round(unbroken / 60)} of ${RETENTION.focusMinutes} minutes.`,
  };
}

/**
 * What is decaying right now, across a set of studied items.
 * Returns the ones a student should retrieve today, most urgent first.
 */
export function decayQueue(items = [], { now = Date.now(), threshold = 0.6 } = {}) {
  return (items || [])
    .map(item => {
      const daysSince = (now - new Date(item.studiedAt || item.studied_at || now).getTime()) / 86400000;
      const r = retention({ daysSince, recalls: item.recalls || [] });
      return { ...item, daysSince: round3(daysSince), retention: r };
    })
    .filter(i => i.retention.value < threshold)
    .sort((a, b) => a.retention.value - b.retention.value);
}

const round3 = (v) => Math.round(v * 1000) / 1000;
