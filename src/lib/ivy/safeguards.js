// ─────────────────────────────────────────────────────────────────────────────
// Section 6 — risk mitigation and ethical safeguards.
//
// ═════════════════════════════════════════════════════════════════════════════
//  PREMIUM ROADMAP — AND THE ONE EXCEPTION TO IT
//  Everything else in src/lib/ivy/ is planned to sit behind the premium tier.
//  THIS FILE NEVER DOES. Every output here renders for every account, on every
//  run, free or paid, and scripts/verifyIvyEngine.mjs asserts it.
//
//  The reason is simple: this file contains the things that stop the rest of
//  the engine from doing harm — the honest expectations, the reassurance about
//  AI detection, the definitions that stop a student misclaiming a demographic
//  status, and the anti-homogeneity warnings. A student must never be able to
//  buy their way into an honest answer, and a free account must never be shown
//  a confident finding without the caveats that make it safe to act on.
// ═════════════════════════════════════════════════════════════════════════════
//
// ── 6.1 Verification of success projections ────────────────────────────────
// This engine does not emit an admission probability. Not a low one, not a
// hedged one — none. The app already has a calibrated admissions model
// (src/lib/admissions/) that works in log-odds against published base rates
// with an explicit selectivity ceiling, and putting a second, differently
// derived number on another screen would mean the product contradicts itself
// about the most consequential figure it shows.
//
// What this file emits instead is the WIDTH of what is unknown: which parts of
// the reading are estimates, which are missing inputs, and what the
// specification's p ≥ 0.95 interval actually looks like on a rubric score.
//
// ── 6.2 Fear-based content and AI detection ────────────────────────────────
// The single most common thing students are sold in this market is fear. This
// engine states official policy plainly, refuses to run AI-detection scoring,
// and never converts a voice reading into a suspicion.
//
// ── 6.3 Demographic definitions ────────────────────────────────────────────
// First-generation and low-income have institutional definitions that differ
// from the colloquial ones, and a student who misreports either — in good
// faith — creates a discrepancy against their FAFSA and their counselor's
// report. The definitions are stated so a student can check rather than guess.
//
// ── 6.4 Formulaic homogeneity ──────────────────────────────────────────────
// Every structural constraint in this engine pushes toward a shape. Applied
// without a counterweight, that produces forty thousand identically-shaped
// applications, which defeats the entire purpose. The counterweight is here.
// ─────────────────────────────────────────────────────────────────────────────

import { SAFEGUARDS, clamp } from './constants.js';
// The single source of truth for what this product will and will not do with a
// student's essay. Imported rather than restated: main added this module (and
// api/_lib/essayProseGuard.js, which enforces it on the server) precisely so the
// policy the student reads, the policy the model is given, and the policy a
// feature claims are one document instead of three that agree by coincidence.
// This engine is essay-facing, so it cites it rather than paraphrasing it.
import { AI_POLICY, HARD_RULES } from '../aiPolicy.js';

/**
 * 6.1 — the confidence interval on a rubric reading.
 *
 * A rubric score built partly on assumed categories is not a point. This
 * returns the band at p ≥ 0.95, widened by exactly the things that are unknown,
 * each of them named so the student can see what would narrow it.
 */
export function projectionInterval(holistic, { completeness = null } = {}) {
  if (!holistic) return null;

  const reasons = [];
  // Irreducible: two readers, the same file, different numbers. This never
  // goes to zero and saying so is the honest floor of the whole product.
  let sigma = 0.35;
  reasons.push({ id: 'holistic-review', sigma: 0.35, fixable: false, label: 'Holistic review is not a function. The same file read by two officers produces two different ratings, and that variance is larger than most of what follows.' });

  for (const a of holistic.assumptions || []) {
    sigma += 0.40;
    reasons.push({ id: `assumed-${a.key}`, sigma: 0.40, fixable: true, label: `${a.key} could not be evaluated and is contributing the scale midpoint. Until it is real, this band is wider than your record deserves in either direction.` });
  }

  const missing = completeness?.missing?.length || 0;
  if (missing) {
    const add = clamp(missing * 0.08, 0, 0.5);
    sigma += add;
    reasons.push({ id: 'missing-intake', sigma: round2(add), fixable: true, label: `${missing} input${missing === 1 ? '' : 's'} you have not given us. Each one widens this rather than being quietly assumed.` });
  }

  // 1.96σ at p = 0.95, on the 1–6 rubric scale.
  const half = clamp(1.96 * sigma * 0.5, 0.2, 2.0);
  const centre = holistic.reported;

  return {
    level: SAFEGUARDS.confidenceLevel,
    centre: round2(centre),
    low: round2(clamp(centre - half, 1, 6)),
    high: round2(clamp(centre + half, 1, 6)),
    sigma: round2(sigma),
    reasons: reasons.sort((a, b) => b.sigma - a.sigma),
    note: `At 95% confidence your rubric reading is a band, not a number, and this one runs ${round2(clamp(centre - half, 1, 6))} to ${round2(clamp(centre + half, 1, 6))} on the 1–6 scale. Any tool that hands you one decimal place and no interval is selling precision it does not have.`,
    // The boundary, restated wherever a number appears.
    scopeNote: 'This is a reading of how a file scans. It is not a probability of admission, and this engine does not produce one — that lives in the admissions calculator, which is built against published base rates and shows its own range.',
  };
}

/**
 * 6.2 — what is actually true about AI usage and application review.
 *
 * Attached to every essay-audit output. Written flat, without hedging in either
 * direction, because a student who is frightened of a false positive writes
 * worse essays and a student who believes detection is impossible makes a
 * different mistake.
 */
export const AI_POLICY_NOTE = {
  id: 'ai-policy',
  title: 'What is actually true about AI and your application',
  points: [
    'This engine does not run AI detection. Nothing it shows you is a claim about who wrote something, and no score here can be read as one.',
    'Automated AI detectors are unreliable in a specific direction: they misfire on writing that is formal, careful, or produced by someone whose first language is not English. That is a good reason not to build a product on them, and a good reason not to change how you write because of them.',
    'The Common App handles suspected misrepresentation through a collaborative review involving your school — not through automated scoring, and not by an algorithm rejecting a file.',
    'The useful question is not "will this be detected". It is whether an essay contains something only you could have written. That is also, separately, what makes it work.',
  ],

  // ── The product-wide rules, quoted from the one place that defines them ───
  // This engine points at sentences, names weaknesses and asks questions; it
  // never produces prose a student could submit. That is not a promise this
  // module makes on its own — it is the same rule the essay workspace shows and
  // the server enforces, carried here so a student reading a narrative reading
  // sees identical wording.
  policyHeadline: AI_POLICY.headline,
  policyShort: AI_POLICY.short,
  hardRules: HARD_RULES.map(r => ({ id: r.id, title: r.title, body: r.body })),

  // Explicitly the free tier's, always.
  alwaysVisible: true,
};

/**
 * 6.3 — the institutional definitions.
 *
 * Stated because the colloquial and institutional readings differ, and a
 * student who checks the wrong box in good faith creates a discrepancy against
 * their FAFSA and their counselor's school report.
 */
export const DEMOGRAPHIC_DEFINITIONS = [
  {
    id: 'first-gen',
    label: 'First-generation college student',
    institutional: 'Most commonly: neither parent nor guardian completed a four-year bachelor\'s degree in the United States. Definitions vary — some institutions count any postsecondary attendance, some count only the parent(s) you live with, and federal TRIO programs use their own.',
    commonError: 'A degree earned abroad still counts as a degree at many institutions even when it does not transfer professionally, and a parent who attended without finishing usually does not disqualify you.',
    action: 'Check the specific school\'s wording rather than assuming, and make sure your answer matches what your counselor reports.',
  },
  {
    id: 'low-income',
    label: 'Low income',
    institutional: 'Institutional definitions are usually tied to a federal poverty-line multiple, Pell eligibility, or the family contribution your FAFSA produces — not to a self-assessment of how money feels.',
    commonError: 'Both over- and under-claiming are common. Households that feel stretched are frequently above the threshold; households that never applied for aid are frequently below it.',
    action: 'Your FAFSA output is the answer. Fee waivers follow the same eligibility, and they are worth several hundred dollars in application and testing fees.',
  },
  {
    id: 'rural-limited-access',
    label: 'Limited-resource school context',
    institutional: 'Read from your school\'s profile: how many advanced courses were offered, the counselor-to-student ratio, and what share of your class goes on to four-year colleges. Rigor is judged against what was AVAILABLE to you.',
    commonError: 'Students routinely apologize for a schedule that was the most demanding their school offered, which reads to a committee as a weaker claim than the truth.',
    action: 'This is the counselor letter\'s job. Give them the specifics on the brag sheet.',
  },
];

/**
 * 6.4 — anti-homogeneity.
 *
 * The counterweight to every structural rule in this engine. Fires when a
 * profile is following the guidance so closely that it has stopped being a
 * particular person's application.
 */
export function homogeneityCheck({ coherence = null, authenticity = null, storyboard = null, differentiation = null } = {}) {
  const warnings = [];

  if (coherence?.available && coherence.redundancy?.pairs?.length) {
    warnings.push({
      id: 'surfaces-identical', severity: 'medium',
      label: 'Your surfaces are converging',
      detail: `${coherence.redundancy.pairs.map(p => `${p.a} and ${p.b}`).join('; ')} are close to being the same text. Coherence means one theme in four different forms. Four copies of one paragraph reads as an application that ran out of things to say.`,
    });
  }

  if (storyboard?.available && storyboard.score > 0.93 && (authenticity?.perplexity?.value ?? 999) < 90) {
    warnings.push({
      id: 'template-fit', severity: 'medium',
      label: 'The shape is perfect and the voice is not',
      detail: 'This draft hits the target word distribution almost exactly while scoring low on distinctiveness — which is what a filled-in template looks like from the outside. The structure is a scaffold to build against, not a form to complete.',
    });
  }

  if (differentiation?.length >= 2 && differentiation.filter(d => d.flagged).length >= 2) {
    warnings.push({
      id: 'archetype-stack', severity: 'high',
      label: 'Two or more activities collide with common archetypes',
      detail: 'Individually each of these is fine. Together they describe a profile assembled from the same list everyone else is working from. Pick the one you actually care about and take it somewhere none of the archetypes go.',
    });
  }

  return {
    warnings,
    clear: warnings.length === 0,
    // The standing statement, shown whether or not anything fired.
    principle: 'Every rule in this engine is a description of what tends to work, and any of them can be broken by someone who knows why they are breaking it. The applications that get remembered are not the ones that scored highest against a rubric — they are the ones a reader could not have predicted. Use the structure to stop making avoidable mistakes, not to decide what you are about.',
  };
}

/**
 * The realistic-expectations block that accompanies any strong reading.
 *
 * Deliberately does not soften and does not catastrophise. Both are failures of
 * the same kind: they substitute a feeling for the base rate.
 */
export function expectationsNote({ holistic = null, portfolio = null, context = {} } = {}) {
  const spike = holistic?.hasSpike;
  const tier1 = portfolio?.counts?.tier1 ?? 0;

  return {
    title: 'What this reading is and is not',
    points: [
      'A strong rubric reading does not make a highly selective outcome likely. At single-digit admit rates the pool is full of strong rubric readings and there are not enough seats — that is a fact about arithmetic, not about you.',
      spike
        ? 'You have a spike, which is what makes a file legible rather than what makes it admitted. It raises the odds it is read as a coherent whole. It does not overcome a base rate.'
        : 'No spike yet. That is the most consequential structural gap on this page, and it is an eighteen-month build, not a semester one — which is exactly why it is worth starting now if you have the time and worth accepting if you do not.',
      tier1 === 0
        ? 'Applications without a Tier 1 activity are admitted to highly selective schools every year, usually on the strength of context, a spike in a different category, or a letter nobody could have predicted. The absence of one is a real gap and it is not a verdict.'
        : 'One identity-defining activity, well documented, does more than four undifferentiated strong ones.',
      context.firstGen || context.lowIncome
        ? 'Your record is read against your circumstances by every school that reads holistically, and the counselor letter is the mechanism. Making sure they have the specifics is worth more than another activity.'
        : 'Your record is read against the resources available to you, which at a well-resourced school means the bar for "made the most of it" is higher rather than lower.',
      'Nothing on this screen is a prediction. It is a description of how the file currently scans, which is the only thing anybody can honestly measure in August.',
    ],
    alwaysVisible: true,
  };
}

/** Every safeguard, assembled. This is what the engine attaches to every run. */
export function assembleSafeguards(context = {}) {
  return {
    interval: projectionInterval(context.holistic, { completeness: context.completeness }),
    aiPolicy: AI_POLICY_NOTE,
    definitions: DEMOGRAPHIC_DEFINITIONS,
    homogeneity: homogeneityCheck(context),
    expectations: expectationsNote(context),
    emitsAdmissionProbability: SAFEGUARDS.emitsAdmissionProbability,   // false, asserted at build
  };
}

const round2 = (v) => Math.round(v * 100) / 100;
