// ─────────────────────────────────────────────────────────────────────────────
// Module 1 — the holistic rubric, and the Spike Index.
//
// ── PREMIUM ROADMAP ─────────────────────────────────────────────────────────
// Part of the Narrative Method Engine, planned as a paid tier. See PREMIUM in
// ./constants.js.
// ────────────────────────────────────────────────────────────────────────────
//
// Selective readers score a file 1 to 6 in four categories, where 1 is the
// strongest. This module produces those four numbers from a real profile and
// then composes them two ways.
//
// ── The composition, and the discrepancy in it ─────────────────────────────
// The specification gives
//
//     S_applicant = λ·max_{i∈𝒱}(S_i) + (1−λ)·Σ wᵢSᵢ
//
// and describes max(Sᵢ) as "the applicant's single strongest category". On a
// scale where 1 is strongest, max() selects the WEAKEST category, not the
// strongest. Those are opposite behaviors, and the difference is not cosmetic:
// with λ = 0.7, the literal formula makes a student's worst category 70% of
// their score, which is a well-roundedness model wearing a spike model's name.
//
// This engine does not silently pick one. It computes BOTH:
//
//   • `literal`  — max(), exactly as written. Reported because a formula in a
//                  specification is a contract, and because reading it as
//                  "your file is dragged by its weakest category" is a
//                  defensible model that some readers do apply.
//   • `spikeFirst` — min(), the stated INTENT: the strongest category leads.
//
// and it reports the Spike Index below as the primary figure, because that one
// is unambiguous: it is written on an inverted scale (7 − xᵢ) where larger is
// better, so max() there means what everyone agrees it should mean.
//
// Silently choosing would have produced a number nobody could reproduce from
// the specification, which is the specific failure this whole engine exists to
// avoid.
//
// ── Where the four scores come from ────────────────────────────────────────
// From the profile, not from the student's self-assessment, with one exception:
// recommendations, which nobody can see and which this engine therefore refuses
// to guess. An unevaluable category is marked `assumed`, contributes the scale
// midpoint, and is named in the output every single time — see `assumptions`.
// ─────────────────────────────────────────────────────────────────────────────

import {
  EVALUATION_CATEGORIES, CATEGORY_WEIGHTS, LAMBDA_SPIKE, ALPHA_SPIKE,
  SPIKE_FLAGS, RUBRIC_MIN, RUBRIC_MAX, clamp,
} from './constants.js';

const round2 = (v) => Math.round(v * 100) / 100;
const inScale = (v) => clamp(v, RUBRIC_MIN, RUBRIC_MAX);

/**
 * Academic rating.
 *
 * Built from unweighted GPA, curriculum rigor, testing and trajectory, in that
 * order of weight. The trajectory term is the one most rubrics leave out and is
 * why a 3.12 with a +0.45 slope is not read the same way as a flat 3.12 — an
 * upward transcript is the single most persuasive academic fact a student with
 * a low GPA has, and a model that averages it away is useless to exactly the
 * students who most need one.
 */
export function scoreAcademic(academics = {}, { context = {} } = {}) {
  const notes = [];
  const gpa = Number(academics.unweighted_gpa ?? academics.unweightedGpa);
  const sat = Number(academics.sat_act_score ?? academics.satActScore);
  const rigor = String(academics.curriculum_rigor_level ?? academics.rigor ?? '').toLowerCase();
  const slope = Number(academics.gpa_trend_slope ?? academics.gpaTrendSlope ?? 0);

  if (!Number.isFinite(gpa) && !Number.isFinite(sat)) {
    return { key: 'academic', score: 3.5, assumed: true, available: false, notes: ['No GPA and no test score, so this category is the scale midpoint and is not a reading of you.'] };
  }

  // GPA → base position. Deliberately steep at the top: the difference between
  // 3.95 and 4.00 is small; the difference between 3.4 and 3.7 is not.
  let base = 3.5;
  if (Number.isFinite(gpa)) {
    base = gpa >= 3.97 ? 1.3
      : gpa >= 3.90 ? 1.8
      : gpa >= 3.80 ? 2.3
      : gpa >= 3.65 ? 2.9
      : gpa >= 3.45 ? 3.5
      : gpa >= 3.25 ? 4.1
      : gpa >= 3.00 ? 4.6
      : 5.2;
    notes.push(`Unweighted ${gpa.toFixed(2)} places the academic baseline at ${base.toFixed(1)}.`);
  }

  // Testing moves it by up to a full point in each direction.
  if (Number.isFinite(sat) && sat > 0) {
    const satScore = sat > 36 ? sat : satToScale(sat);
    const testAdj = satScore >= 1560 ? -0.7 : satScore >= 1500 ? -0.45 : satScore >= 1450 ? -0.2
      : satScore >= 1350 ? 0.1 : satScore >= 1250 ? 0.45 : 0.8;
    base += testAdj;
    notes.push(testAdj < 0
      ? `A ${satScore} pulls the rating up by ${Math.abs(testAdj).toFixed(2)}.`
      : `A ${satScore} sits below the band where testing helps at this level; +${testAdj.toFixed(2)}.`);
  } else {
    notes.push('No test score on file. At test-optional programs this is neutral; where a score is required it is the largest single gap in this category.');
  }

  // Rigor.
  const rigorAdj = rigor === 'high' ? -0.4 : rigor === 'medium' ? 0 : rigor === 'low' ? 0.5 : 0;
  base += rigorAdj;
  if (rigor) notes.push(rigor === 'high' ? 'Most demanding available schedule: −0.4.' : `Rigor reported as ${rigor}: ${rigorAdj >= 0 ? '+' : ''}${rigorAdj}.`);

  // Trajectory. Capped, because a rise from a very low floor is still a rise
  // from a very low floor, and overpaying for it would be its own dishonesty.
  let trendAdj = 0;
  if (Number.isFinite(slope) && Math.abs(slope) > 0.03) {
    trendAdj = clamp(-slope * 0.9, -0.6, 0.6);
    base += trendAdj;
    notes.push(slope > 0
      ? `An upward transcript (slope +${slope.toFixed(2)}) is worth ${Math.abs(trendAdj).toFixed(2)} here. A reader looking at four years reads the direction before the average.`
      : `A declining transcript (slope ${slope.toFixed(2)}) costs ${trendAdj.toFixed(2)}. This is the one academic fact that needs explaining in Additional Information.`);
  }

  // Context. The rating is a reading of the record against what was available,
  // not against a national ideal — which is what a school-profile read does.
  if (context.limitedAccess) {
    base -= 0.3;
    notes.push('Read against a school with limited advanced offerings and no dedicated college advising: −0.3. Rigor is judged against what your school actually offered.');
  }

  return {
    key: 'academic', score: round2(inScale(base)), assumed: false, available: true,
    inputs: { gpa, sat, rigor, slope }, notes,
  };
}

const satToScale = (act) => Math.round(clamp(400 + (act / 36) * 1200, 400, 1600));

/**
 * Extracurricular rating, driven by the tier distribution rather than by count.
 * Takes the already-classified portfolio (module 3) so the two modules cannot
 * disagree about what Tier 1 means.
 */
export function scoreExtracurricular(tiering = {}) {
  const t1 = tiering.counts?.tier1 ?? 0;
  const t2 = tiering.counts?.tier2 ?? 0;
  const t3 = tiering.counts?.tier3 ?? 0;
  const notes = [];

  let score = t1 >= 2 ? 1.2
    : t1 === 1 ? (t2 >= 2 ? 1.6 : 2.1)
    : t2 >= 3 ? 2.6
    : t2 === 2 ? 3.1
    : t2 === 1 ? 3.7
    : t3 >= 3 ? 4.4
    : 5.0;

  notes.push(t1
    ? `${t1} identity-defining activit${t1 === 1 ? 'y' : 'ies'} with ${t2} reinforcing it.`
    : `No Tier 1 activity. With ${t2} Tier 2 and ${t3} Tier 3, this category tops out around ${score.toFixed(1)} until something external validates one of them.`);

  // Sustained depth partially substitutes for scale. Four years of one thing is
  // read differently from four years of four things, and the difference is
  // legible in the years, not in the titles.
  const deep = (tiering.activities || []).filter(a => (a.yearsInvolved || 0) >= 3).length;
  if (deep >= 2) { score -= 0.25; notes.push(`${deep} commitments held three years or longer: −0.25. Duration is the cheapest credibility there is.`); }
  if (t3 > 6) { score += 0.2; notes.push('More than six school-level lines dilutes the top of the list: +0.2.'); }

  return { key: 'extracurricular', score: round2(inScale(score)), assumed: false, available: true, notes };
}

/**
 * Personal-qualities rating.
 *
 * Read from the essays, because that is where this category is read in real
 * life. Composed from authenticity (is there a person in this text), stakes (is
 * there anything at risk), and specificity (is it about something in
 * particular). A profile with no essay yet is unevaluable and says so.
 */
export function scorePersonal({ authenticity = null, stakes = null } = {}) {
  if (!authenticity || authenticity.insufficient) {
    return { key: 'personal', score: 3.5, assumed: true, available: false, notes: ['No essay long enough to read yet, so this is the scale midpoint rather than a judgment. This is the category that moves most between now and submission.'] };
  }
  const notes = [];
  const complexity = authenticity.perplexity?.value ?? 0;
  let score = complexity >= 180 ? 1.6 : complexity >= 140 ? 2.1 : complexity >= 120 ? 2.5 : complexity >= 90 ? 3.2 : complexity >= 60 ? 3.9 : 4.6;
  notes.push(`Voice index ${complexity} → ${score.toFixed(1)} before stakes.`);

  if (stakes) {
    if (stakes.vulnerability.count > 0) { score -= 0.4; notes.push('The draft contains at least one moment of genuine exposure: −0.4.'); }
    if (stakes.cost.count > 0) { score -= 0.3; notes.push('Something was risked or given up, and it is on the page: −0.3.'); }
    if (stakes.smoothCurve) { score += 0.5; notes.push('An unbroken record of accomplishment with no cost attached: +0.5. This is the most common way a strong file reads flat.'); }
  }
  const cliches = authenticity.cliche?.tropes?.length || 0;
  if (cliches >= 2) { score += 0.3; notes.push(`${cliches} recognizable narrative shapes: +0.3.`); }

  return { key: 'personal', score: round2(inScale(score)), assumed: false, available: true, notes };
}

/**
 * Recommendation rating.
 *
 * Nobody can see these, including this engine, so it does NOT estimate one from
 * proxies and present it as a reading. What it scores is the only part of the
 * letter a student controls: whether the recommender was given the material to
 * write a specific letter, and asked early enough.
 */
export function scoreRecommendation(recs = null) {
  if (!recs || recs.unknown) {
    return {
      key: 'recommendation', score: 3.5, assumed: true, available: false,
      notes: ['Nobody can read these, including us. This is the scale midpoint and is not a prediction. What you control is whether each recommender has a completed brag sheet and enough notice — record that and this becomes a real reading.'],
    };
  }
  const notes = [];
  const asked = recs.asked || 0;
  const withSheets = recs.withBragSheet || 0;
  const monthsNotice = recs.monthsNotice ?? null;

  let score = asked >= 2 ? 3.0 : asked === 1 ? 3.8 : 4.6;
  if (withSheets >= 2) { score -= 0.9; notes.push('Two or more recommenders have your brag sheet: −0.9. A specific letter is almost entirely a function of what the teacher was handed.'); }
  else if (withSheets === 1) { score -= 0.45; notes.push('One recommender has your brag sheet: −0.45.'); }
  else notes.push('No brag sheets delivered. This is the single highest-value hour available in this category.');

  if (monthsNotice != null) {
    if (monthsNotice >= 2) { score -= 0.3; notes.push('Asked with real notice: −0.3.'); }
    else if (monthsNotice < 1) { score += 0.4; notes.push('Asked with under a month\'s notice: +0.4. Teachers write in the order they were asked.'); }
  }
  return { key: 'recommendation', score: round2(inScale(score)), assumed: false, available: true, notes };
}

/**
 * THE COMPOSITION.
 *
 * @param {Object} scores  { academic, extracurricular, personal, recommendation }
 *                         each the output of one of the scorers above
 * @param {Object} opts    { lambda, alpha, weights } — overridable for the
 *                         sensitivity display, defaulted from constants.js
 */
export function composeHolistic(scores, { lambda = LAMBDA_SPIKE, alpha = ALPHA_SPIKE, weights = CATEGORY_WEIGHTS } = {}) {
  const S = {};
  const assumptions = [];
  for (const key of EVALUATION_CATEGORIES) {
    const entry = scores[key];
    S[key] = inScale(entry?.score ?? 3.5);
    if (entry?.assumed) assumptions.push({ key, note: entry.notes?.[0] || 'Not evaluable yet; contributing the scale midpoint.' });
  }

  const values = EVALUATION_CATEGORIES.map(k => S[k]);
  const weighted = EVALUATION_CATEGORIES.reduce((sum, k) => sum + (weights[k] ?? 0) * S[k], 0);
  const worst = Math.max(...values);
  const best = Math.min(...values);

  // Both readings — see the header.
  const literal = lambda * worst + (1 - lambda) * weighted;
  const spikeFirst = lambda * best + (1 - lambda) * weighted;

  // The Spike Index. Inverted scale (7 − xᵢ), so larger is stronger and max()
  // is unambiguous. This is the figure the product leads with.
  const inverted = values.map(v => 7 - v);
  const spikeIndex = Math.max(...inverted) + alpha * inverted.reduce((a, b) => a + b, 0);
  // Ceiling: all four at 1.0 → 6 + 0.15·24 = 9.6. Floor: all at 6.0 → 1 + 0.6.
  const spikeMax = 6 + alpha * 24;
  const spikeMin = 1 + alpha * 4;

  const flags = EVALUATION_CATEGORIES
    .filter(k => S[k] <= SPIKE_FLAGS[k])
    .map(k => ({ key: k, score: S[k], threshold: SPIKE_FLAGS[k] }));

  const strongest = EVALUATION_CATEGORIES.find(k => S[k] === best);
  const weakest = EVALUATION_CATEGORIES.find(k => S[k] === worst);

  return {
    scores: S,
    detail: scores,
    weights, lambda, alpha,

    weightedAverage: round2(weighted),
    literal: round2(literal),
    spikeFirst: round2(spikeFirst),
    // What the panel renders as "S_applicant". Named rather than implied.
    reported: round2(spikeFirst),
    reportedReading: 'spike-first',
    readingNote: 'The specification\'s formula uses max() on a scale where 1 is strongest, which selects the weakest category. We compute both: `spikeFirst` reads the strongest category as the spike (the stated intent), `literal` reads it as written. The Spike Index below is unambiguous and is what this engine leads with.',

    spikeIndex: round2(spikeIndex),
    spikeIndexRange: [round2(spikeMin), round2(spikeMax)],
    spikeIndexNormalized: round2(clamp((spikeIndex - spikeMin) / (spikeMax - spikeMin), 0, 1)),

    spikeFlags: flags,
    hasSpike: flags.length > 0,
    strongest, weakest,
    assumptions,
    // Every assumed category widens what this number can be trusted to mean,
    // and the panel says so rather than printing a confident figure built on
    // two midpoints.
    confidence: assumptions.length === 0 ? 'high' : assumptions.length === 1 ? 'moderate' : 'low',

    headline: flags.length
      ? `Your file has a spike: ${LABELS[strongest]} at ${S[strongest].toFixed(1)}. That is the thing the rest of the application should be arranged around.`
      : `No category is yet at spike strength. Your strongest is ${LABELS[strongest]} at ${S[strongest].toFixed(1)}; a spike starts at ${SPIKE_FLAGS[strongest].toFixed(1)}.`,
  };
}

export const LABELS = {
  academic: 'Academics',
  extracurricular: 'Extracurriculars',
  personal: 'Personal qualities',
  recommendation: 'Recommendations',
};

/**
 * Sensitivity to λ — how much of the reported score is the choice of
 * coefficient rather than the student.
 *
 * Shown because a number that swings by more than a point across the
 * specification's own permitted λ range is a number the student should be told
 * is soft, and no rubric product ever says so.
 */
export function lambdaSensitivity(scores, { alpha = ALPHA_SPIKE, weights = CATEGORY_WEIGHTS } = {}) {
  const at = (l) => composeHolistic(scores, { lambda: l, alpha, weights }).reported;
  const lo = at(0.5), hi = at(0.85);
  return {
    range: [Math.min(lo, hi), Math.max(lo, hi)],
    spread: round2(Math.abs(hi - lo)),
    note: Math.abs(hi - lo) > 0.8
      ? 'Your score moves by more than a point depending on how hard the model rewards a single spike — which means the honest reading is a band, not a number.'
      : 'Your score is stable across the model\'s tuning range, so the figure is about you rather than about the coefficient.',
  };
}
