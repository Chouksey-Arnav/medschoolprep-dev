// ─────────────────────────────────────────────────────────────────────────────
// The Narrative Method Engine's public surface.
//
// ── PREMIUM ROADMAP ─────────────────────────────────────────────────────────
// This whole subsystem is planned as the app's first purpose-built paid tier.
// The gate is `canUseNarrativeEngine()` in src/lib/entitlements.js, it is
// currently OPEN, and ENFORCE_PREMIUM in ./constants.js is the single switch
// that closes it. Panels import from here and pass a tier; they never make an
// entitlement decision themselves.
// ────────────────────────────────────────────────────────────────────────────
//
// Panels import from this file. The individual modules are implementation
// detail and are free to be reorganised.
//
// The thirteen modules, in specification order:
//
//    1. holistic.js       — the 1–6 rubric, S_applicant, the Spike Index
//    2. domino.js         — passion-project viability, V_project
//    3. portfolio.js      — tiering and B_portfolio
//    4. satHeuristics.js  — M_SAT across five named techniques
//    5. retention.js      — R(t), the study cycle
//    6. storyboard.js     — S_supplemental, plus "why us" / "why major"
//    7. authenticity.js   — A_essay, and Section 2's resonance sorter
//    8. sprint.js         — the 90-day sprint and the senior calendar
//    9. hooks.js          — the opening-line vector H⃗
//   10. syntax.js         — V_syntax and the three editing sweeps
//   11. competition.js    — I_competition
//   12. differentiation.js— D_project against the overused corpus
//   13. interview.js      — C_interview
//
// Plus theme.js (the Value-Based Theme and Echo Coherence), roadmap.js
// (Sections 3 and 4), commonApp.js (Section 5), safeguards.js (Section 6 —
// never gated), engine.js (the orchestrator) and store.js (persistence).

export { runEngine, assessCompleteness, ENGINE_INPUTS, alignmentDrills } from './engine.js';

export {
  ENFORCE_PREMIUM, PREMIUM, FREE_TIER,
  EVALUATION_CATEGORIES, CATEGORY_WEIGHTS, LAMBDA_SPIKE, ALPHA_SPIKE, SPIKE_FLAGS,
  DOMINO_WEIGHTS, DOMINO_THRESHOLDS, PORTFOLIO_TRIGGERS, SAT_HEURISTICS, RETENTION,
  STORYBOARD_PHASES, STORYBOARD_TARGETS, MIN_IMPACT_METRICS, AUTHENTICITY, SPRINT_DAYS,
  HOOK_RULES, SYNTAX_PENALTIES, SYNTAX_RULES, SCALE_FACTORS, COMPETITION_BANDS,
  INTERVIEW, SAFEGUARDS,
} from './constants.js';

// 1
export { scoreAcademic, scoreExtracurricular, scorePersonal, scoreRecommendation, composeHolistic, lambdaSensitivity, LABELS as RUBRIC_LABELS } from './holistic.js';
// 2
export { scoreDomino, microProjectSpec, MILESTONES } from './domino.js';
// 3
export { scorePortfolio, classifyActivity, normalizeActivity } from './portfolio.js';
// 4
export { scoreSatHeuristics, HEURISTIC_GUIDE } from './satHeuristics.js';
// 5
export { retention, scoreRecall, scoreSession, decayQueue } from './retention.js';
// 6
export { scoreStoryboard, validateWhyUs, validateWhyMajor, countMetrics } from './storyboard.js';
// 7 + Section 2
export { authenticityIndex, clicheDensity, narrativeStakes, vulnerabilityAudit, saviorAudit, authenticitySorter } from './authenticity.js';
// 8
export { sprintState, seniorCalendar, defaultSprintStart } from './sprint.js';
// 9
export { classifyHook, HOOK_ARCHETYPE_GUIDE } from './hooks.js';
// 10
export { scoreSyntax, passiveSweep, clutterSweep, adjectiveSweep, readAloudSweep, transitionSweep } from './syntax.js';
// 11
export { competitionIndex, rankCompetitions } from './competition.js';
// 12
export { differentiationIndex, differentiateAll, compareToCorpus, SELF_SIMILARITY } from './differentiation.js';
// 13
export { scoreInterviewAlignment, INTERVIEW_CALIBRATION } from './interview.js';

// Theme, roadmap, Common App, safeguards.
export { extractTheme, echoCoherence, surfacesFromProfile, VALUE_THEMES, SURFACES, THEME_CALIBRATION } from './theme.js';
export { buildRoadmap, executionPlan, rollTasks } from './roadmap.js';
export { auditActivityEntry, auditActivitiesList, auditAdditionalInfo, auditBragSheet } from './commonApp.js';
export { assembleSafeguards, projectionInterval, homogeneityCheck, expectationsNote, AI_POLICY_NOTE, DEMOGRAPHIC_DEFINITIONS } from './safeguards.js';

// Persistence.
export {
  loadNarrativeProfile, saveNarrativeProfile, flushNarrativeProfile, unpackProfile,
  saveRun, loadRuns, runTrend, stripDrafts, resetNarrativeCache, buildIngestion,
} from './store.js';

// Text primitives, exported because the verify script and the panels both need
// a couple of them and neither should reach past this file.
export { wordCount, sentences, tokenize, vectorize, cosine, thematicSimilarity, complexityIndex } from './text.js';

// Data.
export { TIERS, TIER_TARGETS, AWARD_CATALOG, DEPARTMENTS, resolveDepartment } from '../../data/ivy/tierCatalog.js';
export { OVERUSED_PROJECTS, OVERLAP_BANDS, overlapBand } from '../../data/ivy/overusedProjects.js';
export { GRADE_PLANS, SENIOR_PIPELINE, SPRINT_PHASES, FRESHMAN, SOPHOMORE, JUNIOR } from '../../data/ivy/gradeTimelines.js';
export { IVY_PRODUCTIVE, BURNERS, HEALTH_FLOOR, FRICTION_RULES, STUDY_CYCLE } from '../../data/ivy/productivity.js';
export { LIMITS as COMMON_APP_LIMITS, BRAG_SHEETS, SUPPLEMENT_STRUCTURES, ADDITIONAL_INFO, ORDERING_RULE, ACTION_VERBS } from '../../data/ivy/commonAppRules.js';
export { BENCHMARK_PROFILES, benchmarkById } from '../../data/ivy/benchmarks.js';
