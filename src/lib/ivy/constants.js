// ─────────────────────────────────────────────────────────────────────────────
// The Narrative Method Engine — every tunable constant, in one file.
//
// ═════════════════════════════════════════════════════════════════════════════
//  PREMIUM ROADMAP — READ THIS BEFORE CHANGING ANYTHING IN src/lib/ivy/
// ═════════════════════════════════════════════════════════════════════════════
//  This engine is planned as the app's first genuinely premium surface. It is
//  built complete and it currently runs for everyone; the gate exists, is
//  wired, and is OPEN.
//
//  When billing lands, exactly one thing changes: ENFORCE_PREMIUM below flips
//  to true. Nothing else. The reason it is built this way rather than added
//  later is that retro-fitting a paywall means finding every entry point, and
//  the ones you miss are the ones that matter. Every entry point is already
//  behind `canUseNarrativeEngine()` in src/lib/entitlements.js.
//
//  Two product decisions are already encoded here and should be argued with
//  before they are changed:
//
//    • FREE ALWAYS GETS A REAL ANSWER, NOT A BLUR. See FREE_TIER below. A free
//      account runs the full engine on their own profile and sees the headline
//      finding, the four rubric scores and the single highest-value action. The
//      paid tier is the depth — all thirteen modules itemized, line-level essay
//      rewrites, the dated roadmap, the interview alignment work. A locked
//      screen sells nothing; a real finding with an obvious next layer does.
//    • NOTHING BEHIND THE PAYWALL IS SAFETY-CRITICAL. Every safeguard in
//      Section 6 — the confidence intervals, the AI-detection reassurance, the
//      anti-homogeneity warnings — renders for free accounts too, always. A
//      student must never be able to buy their way into honest expectations.
//      Asserted by scripts/verifyIvyEngine.mjs.
// ═════════════════════════════════════════════════════════════════════════════
//
// Everything below is a number from the specification. They are gathered here
// rather than scattered across the modules so that the whole model can be
// audited on one screen, and so that a change to a weight is a one-line diff
// against a documented default rather than an archaeological expedition.
// ─────────────────────────────────────────────────────────────────────────────

/** The premium gate. Flip to true when billing ships. */
export const ENFORCE_PREMIUM = false;

/** What the engine is called in the product, and which tier owns it. */
export const PREMIUM = {
  featureId: 'narrative-engine',
  tier: 'premium',
  label: 'The Narrative Method Engine',
  // Shown on the upgrade surface. Written as what they get, never as what they
  // are missing — same rule as src/lib/entitlements.js.
  pitch: 'Thirteen deterministic models run against your real profile: what your file actually reads as, where your story stops matching itself, and the specific line-level rewrites that fix it.',
};

/**
 * What a free account gets. Not a preview of a locked thing — the real engine,
 * run on their real profile, reporting its headline.
 */
export const FREE_TIER = {
  modules: ['holistic', 'portfolio', 'theme'],
  showsHeadline: true,
  showsTopAction: 1,
  // Non-negotiable, and asserted by the verify script.
  alwaysIncludesSafeguards: true,
};

// ─────────────────────────────────────────────────────────────────────────────
// Module 1 — the holistic rubric.
// ─────────────────────────────────────────────────────────────────────────────

/** 𝒱, the evaluation universe. Order is load-bearing: x₁…x₄ in the Spike Index. */
export const EVALUATION_CATEGORIES = ['academic', 'extracurricular', 'personal', 'recommendation'];

/** wᵢ — baseline dimensional weights. Must sum to 1.0 (asserted at build). */
export const CATEGORY_WEIGHTS = {
  academic: 0.35,
  extracurricular: 0.30,
  personal: 0.20,
  recommendation: 0.15,
};

/** The 1–6 reader scale. 1.0 is strongest; 6.0 is weakest. */
export const RUBRIC_MIN = 1.0;
export const RUBRIC_MAX = 6.0;

/** λ — the spiky-profile coefficient. Specification range [0.5, 0.85]. */
export const LAMBDA_SPIKE = 0.70;
export const LAMBDA_RANGE = [0.5, 0.85];

/** α — the Spike Index baseline scaling parameter. Specification range (0, 0.25]. */
export const ALPHA_SPIKE = 0.15;
export const ALPHA_RANGE = [0, 0.25];

/** The per-category thresholds that raise a spike flag. */
export const SPIKE_FLAGS = {
  academic: 1.5,
  extracurricular: 1.5,
  personal: 2.0,
  recommendation: 1.5,
};

// ─────────────────────────────────────────────────────────────────────────────
// Module 2 — the Domino framework.
// ─────────────────────────────────────────────────────────────────────────────

/** ω⃗ — the strategic weight vector over the five milestones. Sums to 1.0. */
export const DOMINO_WEIGHTS = [0.25, 0.15, 0.20, 0.20, 0.20];

export const DOMINO_THRESHOLDS = {
  /** M₁ passes when max similarity to the overused corpus is below this. */
  m1MaxSimilarity: 0.40,
  /** M₂ passes at fifty real, active units. */
  m2Engagement: 50,
  /** M₄ passes when the project's alignment with its department is at least this. */
  m4AcademicSimilarity: 0.70,
};

// ─────────────────────────────────────────────────────────────────────────────
// Module 3 — portfolio tiering. (Targets and penalties live in the tier
// catalog beside the tier definitions themselves.)
// ─────────────────────────────────────────────────────────────────────────────

export const PORTFOLIO_TRIGGERS = {
  /** N₁ < 1 → advise launching a passion project via the Domino framework. */
  criticalTrajectoryGapBelow: 1,
  /** N₃ > 6 → recommend consolidating minor school-level activities. */
  dilutionAbove: 6,
};

// ─────────────────────────────────────────────────────────────────────────────
// Module 4 — the five SAT heuristics.
// ─────────────────────────────────────────────────────────────────────────────

export const SAT_HEURISTICS = [
  { id: 'copa', key: 'H1', label: 'COPA — answer before you read the options', section: 'reading-writing',
    detail: 'Draft your own answer from the passage before looking at the four choices. The distractors are engineered against the answer you have not written yet.' },
  { id: 'tac', key: 'H2', label: 'TAC — substitute down the table rows', section: 'math',
    detail: 'On data-representation questions, test the answer choices against table rows rather than solving forward. Faster and it cannot be algebraically wrong.' },
  { id: 'pin', key: 'H3', label: 'PIN — plug in numbers for the variables', section: 'math',
    detail: 'Replace variables with small integers. Converts an algebra problem you might slip on into an arithmetic one you will not.' },
  { id: 'fourq', key: 'H4', label: '4Q — read the question first', section: 'reading-writing',
    detail: 'Question before passage, so you read looking for something instead of reading to remember everything.' },
  { id: 'strip', key: 'H5', label: 'Strip to the core', section: 'writing',
    detail: 'Delete the prepositional phrases and the interrupting clause, then check subject against verb. Most grammar items are one agreement question in a costume.' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Module 5 — retention.
// ─────────────────────────────────────────────────────────────────────────────

export const RETENTION = {
  /** τ_recall, in days. Ebbinghaus-shaped baseline for unrehearsed material. */
  tauDays: 3.5,
  /** γ — how much one successful retrieval flattens the curve. */
  gamma: 0.45,
  /** The similarity above which a written recall counts as a retrieval. */
  recallThreshold: 0.60,
  focusMinutes: 20,
  recallMinutes: 5,
};

// ─────────────────────────────────────────────────────────────────────────────
// Module 6 — the supplemental storyboard. D⃗, the target word distribution.
// ─────────────────────────────────────────────────────────────────────────────

export const STORYBOARD_TARGETS = [0.15, 0.35, 0.35, 0.15];
export const STORYBOARD_PHASES = [
  { id: 'hook', label: 'The hook', target: 0.15, detail: 'A scene, in dialogue or in sensory detail. Not a thesis.' },
  { id: 'chronology', label: 'Chronology & involvement', target: 0.35, detail: 'How the involvement grew, over what period, with what changing.' },
  { id: 'impact', label: 'Quantified impact', target: 0.35, detail: 'Hard numbers. Fewer than two and the draft is flagged.' },
  { id: 'reflection', label: 'Reflection & forward look', target: 0.15, detail: 'What it connects to next. Flagged when no forward-looking language appears.' },
];
/** Phase 3 requires at least this many quantified metrics. */
export const MIN_IMPACT_METRICS = 2;

// ─────────────────────────────────────────────────────────────────────────────
// Module 7 — the authenticity index.
// ─────────────────────────────────────────────────────────────────────────────

export const AUTHENTICITY = {
  /** w_p, w_b, w_c — perplexity, burstiness, cliché penalty. */
  weights: { perplexity: 0.40, burstiness: 0.35, cliche: 0.25 },
  /** Target and risk thresholds on the perplexity proxy. */
  perplexityTarget: 120,
  perplexityRisk: 50,
  /** Burstiness — the coefficient of variation of sentence length. */
  burstinessTarget: 0.45,
  /**
   * The hard product rule, restated in code because it is the one people break.
   * The engine NEVER converts a low authenticity index into an accusation, a
   * block, or a score a student cannot recover from. It converts it into a
   * question about a specific sentence. See src/lib/ivy/safeguards.js.
   */
  neverAccuses: true,
};

// ─────────────────────────────────────────────────────────────────────────────
// Module 8 — the 90-day sprint.
// ─────────────────────────────────────────────────────────────────────────────
export const SPRINT_DAYS = 90;

// ─────────────────────────────────────────────────────────────────────────────
// Module 9 — hook classification.
// ─────────────────────────────────────────────────────────────────────────────

export const HOOK_ARCHETYPES = ['unconventional', 'sensory', 'dialogue'];
export const HOOK_RULES = {
  /** Semantic Outlier Index required of an unconventional opening. */
  outlierIndex: 0.75,
  /** Concrete nouns per adjective required of a sensory opening. */
  nounAdjectiveRatio: 2.0,
  /** How many opening sentences count as "the hook". */
  sentences: 3,
};

// ─────────────────────────────────────────────────────────────────────────────
// Module 10 — syntax validation.
// ─────────────────────────────────────────────────────────────────────────────

/** [α, β, γ] — passive voice, clutter, adjective imbalance. */
export const SYNTAX_PENALTIES = { passive: 0.4, clutter: 0.3, adjective: 0.3 };
export const SYNTAX_RULES = {
  /** Sweep 1: vocabulary index this far above the student's own baseline. */
  vocabularyDriftAbove: 0.15,
  /** Sweep 2: paragraph-to-paragraph semantic correlation below this is abrupt. */
  transitionCorrelationBelow: 0.50,
  /** Sweep 3: adjectives per concrete noun above this is flowery. */
  adjectiveToNounCeiling: 1.0,
};

// ─────────────────────────────────────────────────────────────────────────────
// Module 11 — competition selectivity.
// ─────────────────────────────────────────────────────────────────────────────

/** S_tier — the geographic scale factor. */
export const SCALE_FACTORS = {
  international: 1.0,
  national: 0.8,
  state: 0.5,        // the specification's "regional" tier; state and regional
  regional: 0.5,     // are read at the same scale factor
  local: 0.2,
};

/** The reference table: selectivity ratio → weight index and system code. */
export const COMPETITION_BANDS = [
  { id: 'COMP_INT_L1', scale: 'International', maxRatio: 0.01, weight: [0.95, 1.00], value: 'A primary factor for a Tier 1 activity.' },
  { id: 'COMP_NAT_L2', scale: 'National', maxRatio: 0.05, weight: [0.80, 0.94], value: 'A strong supporting factor for a Tier 2 portfolio.' },
  { id: 'COMP_REG_L3', scale: 'Regional', maxRatio: 0.15, weight: [0.50, 0.79], value: 'Baseline validation for a Tier 2 portfolio.' },
  { id: 'COMP_LOC_L4', scale: 'Local', maxRatio: Infinity, weight: [0.10, 0.49], value: 'A general involvement metric — Tier 3.' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Module 12 — differentiation. (Bands live beside the corpus.)
// Module 13 — interview alignment.
// ─────────────────────────────────────────────────────────────────────────────

export const INTERVIEW = {
  /** C_interview target. */
  target: 0.80,
  /** Below this, the engine reports a Narrative Disconnect. */
  disconnectBelow: 0.50,
  /** Words per minute above which delivery reads as hurried. */
  pacingCeilingWpm: 180,
  /** Filler-word share above which the engine mentions it — gently. */
  fillerShare: 0.05,
};

// ─────────────────────────────────────────────────────────────────────────────
// Section 6 — risk mitigation.
// ─────────────────────────────────────────────────────────────────────────────

export const SAFEGUARDS = {
  /** Every projection carries an interval at this level. */
  confidenceLevel: 0.95,
  /**
   * This engine models a FILE, not an outcome. It deliberately produces no
   * admission probability of its own — the app already has a calibrated model
   * for that (src/lib/admissions/), and two chancing numbers on one screen is
   * how a product starts lying. Asserted by the verify script.
   */
  emitsAdmissionProbability: false,
};

/** Clamp helper shared by every module, so bounds behave identically. */
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));
