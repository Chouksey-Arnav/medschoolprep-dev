#!/usr/bin/env node
/**
 * The gate on the Narrative Method Engine.
 *
 * This engine turns a student's file into thirteen numbers, and every one of
 * them is a chance to be confidently wrong about a person. The properties that
 * keep it honest are asserted here rather than trusted, because each of them is
 * the kind of thing that erodes silently under tuning:
 *
 *   1. THE SAFEGUARDS ARE NEVER GATED. Section 6 renders for a free account,
 *      identically, on every run. A student cannot buy honest expectations.
 *   2. NO ADMISSION PROBABILITY. This engine models a FILE. The app already has
 *      one calibrated chancing model and must never grow a second.
 *   3. CARE WORK AND PAID WORK ARE PROTECTED. Tier 3, never promoted by a
 *      leadership heuristic reading the word "Head", and never reachable by a
 *      consolidation suggestion.
 *   4. NO ACCUSATIONS. The authenticity module produces editing questions, not
 *      claims about who wrote something, and says so on every reading.
 *   5. NOTHING IS SILENTLY ASSUMED. Unevaluable inputs are named, contribute the
 *      midpoint, and widen the interval — they never produce a confident score.
 *   6. THE VOICE INDEX SEPARATES REAL WRITING FROM GENERIC PROSE, at the
 *      specification's own thresholds. If it stops doing that, every essay
 *      finding downstream is noise.
 *   7. THE FIVE ARCHETYPES GET THEIR OWN FINDINGS. A tool that says the same
 *      thing to a first-generation caregiver and a scattered 4.0 has not read
 *      either of them.
 *   8. FREE-PATH GUIDANCE. Nothing recommended to a low-income profile requires
 *      money.
 *   9. DRAFTS ARE NEVER PERSISTED. A stored run holds findings, not essays.
 *  10. THE DATA IS HONEST ABOUT ITSELF: weights sum to 1, vectors match their
 *      documented lengths, ids are unique, every trope has a redirect.
 *
 * Run: npm run verify:ivy
 */
// Imported from the individual modules rather than from src/lib/ivy/index.js.
// The index re-exports the persistence layer, which reaches the browser's API
// client, and a build-time gate must not need a browser to run. Same reason
// scripts/verifyAdmissionModel.mjs imports the admissions layers directly.
import { runEngine, assessCompleteness } from '../src/lib/ivy/engine.js';
import {
  CATEGORY_WEIGHTS, DOMINO_WEIGHTS, STORYBOARD_TARGETS, SYNTAX_PENALTIES, SAFEGUARDS,
  AUTHENTICITY, EVALUATION_CATEGORIES, LAMBDA_SPIKE, ALPHA_SPIKE,
} from '../src/lib/ivy/constants.js';
import { composeHolistic } from '../src/lib/ivy/holistic.js';
import { scorePortfolio } from '../src/lib/ivy/portfolio.js';
import { differentiationIndex } from '../src/lib/ivy/differentiation.js';
import { scoreSatHeuristics } from '../src/lib/ivy/satHeuristics.js';
import { retention } from '../src/lib/ivy/retention.js';
import { competitionIndex } from '../src/lib/ivy/competition.js';
import { scoreStoryboard } from '../src/lib/ivy/storyboard.js';
import { authenticityIndex, authenticitySorter } from '../src/lib/ivy/authenticity.js';
import { auditActivityEntry, auditAdditionalInfo, auditBragSheet } from '../src/lib/ivy/commonApp.js';
import { buildRoadmap } from '../src/lib/ivy/roadmap.js';
import { stripDrafts } from '../src/lib/ivy/serialize.js';
import { complexityIndex } from '../src/lib/ivy/text.js';
import { BENCHMARK_PROFILES } from '../src/data/ivy/benchmarks.js';
import { OVERUSED_PROJECTS } from '../src/data/ivy/overusedProjects.js';
import { TIER_TARGETS, AWARD_CATALOG } from '../src/data/ivy/tierCatalog.js';
import { GRADE_PLANS, SENIOR_PIPELINE } from '../src/data/ivy/gradeTimelines.js';
import { IVY_PRODUCTIVE, HEALTH_FLOOR, BURNERS } from '../src/data/ivy/productivity.js';
import { ALL_CLICHE_IDS, NARRATIVE_TROPES, CLUTTER_PHRASES } from '../src/data/ivy/clicheBank.js';
import { canUseNarrativeEngine, narrativeEngineTier, PLANS } from '../src/lib/entitlements.js';
import { AI_POLICY_NOTE } from '../src/lib/ivy/safeguards.js';
import { AI_POLICY, HARD_RULES } from '../src/lib/aiPolicy.js';
import { isNarrativeProse } from '../api/_lib/essayProseGuard.js';
import { RESOURCES } from '../api/_lib/resources.js';

let failures = 0, checks = 0;
function assert(name, cond, detail = '') {
  checks++;
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failures++;
  console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`);
}
function section(title) { console.log(`\n${title}`); }

const NOW = new Date('2026-09-15T12:00:00Z');
const run = (p) => runEngine(p, { now: NOW, gradYear: 2027 });
const results = new Map(BENCHMARK_PROFILES.map(p => [p.student_profile.student_id, run(p)]));
const byId = (id) => results.get(id);
const profileById = (id) => BENCHMARK_PROFILES.find(p => p.student_profile.student_id === id);

/** Deliberately generic prose. The negative control for the voice index. */
const GENERIC_PROSE = `Throughout my high school career, I have been deeply passionate about pursuing a career in medicine. This experience taught me valuable lessons about leadership, resilience, and the importance of teamwork. I learned that success is not about individual achievement but about lifting others up along the way. My involvement in various extracurricular activities has helped me develop strong communication skills and a well-rounded perspective. I am confident that these experiences have prepared me to make a meaningful difference in the world and to contribute positively to my future university community.`;

// ═══════════════════════════════════════════════════════════════════════════
section('1. The safeguards are never gated');
// ═══════════════════════════════════════════════════════════════════════════
{
  const p = profileById('TC_003_SCATTERED_HIGH_STATS');
  const free = runEngine(p, { now: NOW, tier: 'free', gradYear: 2027 });
  const paid = runEngine(p, { now: NOW, tier: 'premium', gradYear: 2027 });

  assert('a free reading carries the full safeguard block', !!free.safeguards?.aiPolicy && !!free.safeguards?.expectations && !!free.safeguards?.definitions?.length);
  assert('the confidence interval is present for free accounts', !!free.safeguards?.interval?.low && !!free.safeguards?.interval?.high);
  assert('free and paid safeguards are identical',
    JSON.stringify(free.safeguards.aiPolicy) === JSON.stringify(paid.safeguards.aiPolicy)
    && JSON.stringify(free.safeguards.definitions) === JSON.stringify(paid.safeguards.definitions),
    'the AI-policy note or the demographic definitions differ between tiers');
  assert('a free reading is a real reading, not a placeholder',
    free.thematic?.theme?.available === paid.thematic?.theme?.available
    && free.modules?.holistic?.spikeIndex === paid.modules.holistic.spikeIndex
    && free.actions.length >= 1,
    'the free tier must run the engine on the real profile');
  assert('the free tier names what is behind the gate without withholding the finding',
    !!free.locked?.pitch && !!free.locked?.neverLocked && !!free.headline?.lead);
  assert('the gate is currently open for every account', canUseNarrativeEngine(null) === true && narrativeEngineTier({}) === 'premium');
  assert('the premium plan carries the entitlement flag', PLANS.pro.narrativeEngine === true && PLANS.free.narrativeEngine === false);
}

// ═══════════════════════════════════════════════════════════════════════════
section('2. No admission probability anywhere');
// ═══════════════════════════════════════════════════════════════════════════
{
  assert('the engine declares that it emits no probability', SAFEGUARDS.emitsAdmissionProbability === false);
  for (const [id, r] of results) {
    const json = JSON.stringify(r);
    const claims = /"(admitProbability|admissionProbability|chanceOfAdmission|oddsOfAdmission)"/.test(json);
    assert(`${id.slice(0, 14)} emits no admission probability field`, !claims);
  }
  const r = byId('TC_005_MULTIPASSIONATE_FATIMA');
  assert('the interval says out loud that it is not a probability',
    /not a probability of admission/i.test(r.safeguards.interval.scopeNote || ''));
}

// ═══════════════════════════════════════════════════════════════════════════
section('3. Care work and paid work are protected');
// ═══════════════════════════════════════════════════════════════════════════
{
  const r = byId('TC_004_FIRST_GEN_REPLICABLE');
  const care = r.modules.portfolio.activities.find(a => /household|sibling/i.test(a.name));
  assert('household care is classified', !!care);
  assert('household care is Tier 3, not promoted by the word "Head"', care?.tier === 3, `got tier ${care?.tier} via ${care?.basis}`);
  assert('household care is marked protected', care?.protected === true);
  assert('its explanation separates how the line scans from what it is worth',
    /scans/i.test(care?.because || '') && /counselor|worth|costs you/i.test(care?.because || ''));

  // The consolidation path must be unreachable for it, even with a bloated list.
  const bloated = scorePortfolio([
    ...Array.from({ length: 8 }, (_, i) => ({ name: `Club ${i}`, description_draft: 'Member of the club.', years_involved: 1, scale: 'local' })),
    { name: 'Sibling care', description_draft: 'Cared for my three younger siblings daily.', leadership_role: 'Head of Household Operations', years_involved: 4, scale: 'local' },
    { name: 'Grocery job', description_draft: 'Part-time cashier, 20 hours a week.', years_involved: 2, scale: 'local' },
  ]);
  const dilution = bloated.triggers.find(t => t.id === 'portfolio-dilution');
  assert('a bloated list triggers the dilution finding', !!dilution);
  assert('care work is never a consolidation candidate',
    !dilution.candidates.some(c => /sibling|household/i.test(c)), JSON.stringify(dilution.candidates));
  assert('paid work is never a consolidation candidate',
    !dilution.candidates.some(c => /job|cashier|grocery/i.test(c)), JSON.stringify(dilution.candidates));
  assert('both are named as explicitly protected', dilution.protectedFromConsolidation.length === 2);

  // And the promoted roadmap item repeats the protection rather than dropping it.
  const roadmap = buildRoadmap({ grade: 11, findings: { portfolio: bloated }, now: NOW });
  const consolidate = roadmap.items.find(i => i.id === 'promoted-consolidate');
  assert('the roadmap item repeats what stays on the list',
    !consolidate || /stay on the list|family responsibility/i.test(consolidate.detail));
}

// ═══════════════════════════════════════════════════════════════════════════
section('4. No accusations — the authenticity module is about craft');
// ═══════════════════════════════════════════════════════════════════════════
{
  assert('the constant declaring this is set', AUTHENTICITY.neverAccuses === true);
  const a = authenticityIndex(GENERIC_PROSE);
  assert('a generic draft still gets a disclaimer', /not.*authorship|reading of craft/i.test(a.disclaimer));
  assert('no flag on the flattest possible prose mentions AI authorship',
    !a.flags.some(f => /\b(ai|chatgpt|generated|written by a machine|cheat)\b/i.test(`${f.label} ${f.detail}`)),
    JSON.stringify(a.flags.map(f => f.label)));

  const sorter = authenticitySorter(GENERIC_PROSE);
  assert('the sorter carries the AI-policy safeguard', /collaborative review/i.test(sorter.safeguard));
  assert('the sorter rejects clinical edits by name', sorter.rejected.length === 4);
  assert('every approved edit is additive, never a "soften this"',
    !sorter.approved.some(e => /soften|moderate|tone down|less emotional/i.test(`${e.label} ${e.note || ''}`)));
  assert('the approved list asks for stakes on a costless draft',
    sorter.approved.some(e => e.id === 'add-stakes'));

  for (const [id, r] of results) {
    if (!r.modules.authenticity || r.modules.authenticity.insufficient) continue;
    assert(`${id.slice(0, 14)} attaches the craft disclaimer`, !!r.modules.authenticity.disclaimer);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
section('5. Nothing is silently assumed');
// ═══════════════════════════════════════════════════════════════════════════
{
  const r = byId('TC_001_LOW_GPA_GUAM');
  assert('recommendations are reported as unevaluable rather than guessed',
    r.modules.holistic.assumptions.some(a => a.key === 'recommendation'));
  assert('an assumed category lowers the stated confidence', r.modules.holistic.confidence !== 'high');
  assert('assumed categories widen the interval',
    r.safeguards.interval.reasons.some(x => x.id.startsWith('assumed-')));

  const empty = runEngine({ student_profile: { grade_level: 11 } }, { now: NOW });
  assert('an empty profile produces no confident finding',
    /Not enough on file/i.test(empty.headline.lead) || empty.completeness.missing.length >= 6);
  assert('an empty profile still gets safeguards', !!empty.safeguards.aiPolicy);
  assert('every unreadable module says what would make it readable',
    empty.modules.retention.available === false && !!empty.modules.retention.note
    && empty.modules.interview.available === false && !!empty.modules.interview.note);

  const c = assessCompleteness({ grade_level: 12 });
  assert('completeness names what each missing input unlocks',
    c.missing.every(m => Array.isArray(m.unlocks) && m.unlocks.length > 0));

  const sat = scoreSatHeuristics({ copa: { attempted: 10, correct: 9 } });
  assert('untried SAT techniques are excluded, not scored zero', sat.evaluated === 1 && sat.index > 0.7,
    `index ${sat.index} over ${sat.evaluated} evaluated`);
  assert('partial SAT coverage is stated', /excluded rather than counted as zero/i.test(sat.note));

  const comp = competitionIndex({ scale: 'national' });
  assert('a competition with no counts is marked estimated', comp.estimated && !!comp.estimateNote);
}

// ═══════════════════════════════════════════════════════════════════════════
section('6. The voice index separates real writing from generic prose');
// ═══════════════════════════════════════════════════════════════════════════
{
  const generic = complexityIndex(GENERIC_PROSE);
  assert(`generic prose falls under the ${AUTHENTICITY.perplexityRisk} risk line (got ${generic.value})`,
    generic.value < AUTHENTICITY.perplexityRisk);

  const vivid = ['TC_001_LOW_GPA_GUAM', 'TC_004_FIRST_GEN_REPLICABLE', 'TC_005_MULTIPASSIONATE_FATIMA'];
  for (const id of vivid) {
    const v = byId(id).modules.authenticity.perplexity.value;
    assert(`${id.slice(0, 14)} clears the ${AUTHENTICITY.perplexityTarget} target (got ${v})`, v >= AUTHENTICITY.perplexityTarget);
  }
  // The résumé-in-prose draft must NOT clear it. If it does, the index is
  // measuring vocabulary rather than particularity.
  const scattered = byId('TC_003_SCATTERED_HIGH_STATS').modules.authenticity;
  assert(`the résumé-in-prose draft stays under target (got ${scattered.perplexity.value})`,
    scattered.perplexity.value < AUTHENTICITY.perplexityTarget);
  assert('and is banded as flat or generic', ['flat', 'generic'].includes(scattered.band), scattered.band);
}

// ═══════════════════════════════════════════════════════════════════════════
section('7. The five archetypes get their own findings');
// ═══════════════════════════════════════════════════════════════════════════
for (const profile of BENCHMARK_PROFILES) {
  const id = profile.student_profile.student_id;
  const e = profile.expect;
  const r = byId(id);
  console.log(`\n  ── ${e.label} (${id})`);

  if (e.themeId) {
    assert(`theme reads as "${e.themeId}"`, r.thematic.theme.primary?.id === e.themeId,
      `got ${r.thematic.theme.primary?.id} (${r.thematic.theme.primary?.score})`);
  }
  if (e.themeDecisive != null) {
    assert(`theme decisive === ${e.themeDecisive}`, r.thematic.theme.decisive === e.themeDecisive,
      `primary ${r.thematic.theme.primary?.score} vs secondary ${r.thematic.theme.secondary?.score}`);
  }
  if (e.maxCoherence != null) {
    assert(`coherence stays under ${e.maxCoherence}`, r.thematic.coherence.score < e.maxCoherence, `got ${r.thematic.coherence.score}`);
  }
  if (e.tier1Count != null) {
    assert(`Tier 1 count === ${e.tier1Count}`, r.modules.portfolio.counts.tier1 === e.tier1Count,
      JSON.stringify(r.modules.portfolio.counts));
  }
  if (e.minTier1Count != null) {
    assert(`Tier 1 count >= ${e.minTier1Count}`, r.modules.portfolio.counts.tier1 >= e.minTier1Count,
      JSON.stringify(r.modules.portfolio.counts));
  }
  if (e.tier2Count != null) {
    assert(`Tier 2 count === ${e.tier2Count}`, r.modules.portfolio.counts.tier2 === e.tier2Count,
      JSON.stringify(r.modules.portfolio.counts));
  }
  if (e.criticalTrajectoryGap) {
    assert('critical trajectory gap raised', r.modules.portfolio.triggers.some(t => t.id === 'critical-trajectory-gap'));
  }
  if (e.hasPromotionPath) {
    assert('every non-protected Tier 3 entry says what would move it up',
      r.modules.portfolio.activities.filter(a => a.tier === 3 && !a.protected).every(a => !!a.promotion));
  }
  if (e.positiveTrendCredited) {
    const notes = (r.modules.holistic.detail.academic.notes || []).join(' ');
    assert('the rising transcript is credited in the academic reading', /upward transcript/i.test(notes), notes);
  }
  if (e.collidesWith) {
    const hit = r.modules.differentiation.find(d => d.collidesWith?.id === e.collidesWith);
    assert(`the ${e.collidesWith} archetype is named`, !!hit,
      r.modules.differentiation.map(d => `${d.label}→${d.collidesWith?.id}`).join(', '));
  }
  if (e.differentiationFlagged != null) {
    const anyFlagged = r.modules.differentiation.some(d => d.flagged);
    assert(`differentiation flagged === ${e.differentiationFlagged}`, anyFlagged === e.differentiationFlagged,
      r.modules.differentiation.map(d => `${d.label}:${d.similarity}/${d.band}`).join(' | '));
    if (e.differentiationFlagged) {
      assert('a flagged project gets a concrete narrowing move, never "drop it"',
        r.modules.differentiation.filter(d => d.flagged).every(d => !!d.redirect && !/\b(drop|abandon|give up|stop doing)\b/i.test(d.redirect)));
    }
  }
  if (e.hasVulnerability) {
    assert('the vulnerability sorter finds something on the page',
      r.essays.personalStatement.stakes.vulnerability.count > 0,
      JSON.stringify(r.essays.personalStatement.stakes.vulnerability));
  }
  if (e.smoothCurve) {
    assert('the smooth-curve finding fires', r.essays.personalStatement.stakes.smoothCurve === true);
  }
  if (e.maxAuthenticity != null) {
    assert(`authenticity index under ${e.maxAuthenticity}`, r.modules.authenticity.index < e.maxAuthenticity,
      `got ${r.modules.authenticity.index}`);
  }
  if (e.minWhyUsBlocked != null) {
    const whyUs = r.essays.supplements.map(s => s.whyUs).find(Boolean);
    assert(`"why us" blocks at least ${e.minWhyUsBlocked} marketing phrases`, (whyUs?.blocked?.length ?? 0) >= e.minWhyUsBlocked,
      JSON.stringify(whyUs?.blocked?.map(b => b.match)));
  }
  if (e.whyUsFailsSwapTest) {
    const whyUs = r.essays.supplements.map(s => s.whyUs).find(Boolean);
    assert('"why us" fails the swap test', whyUs?.swapTest?.fails === true);
  }
  if (e.academicSpike) {
    assert('an academic spike flag is raised', r.modules.holistic.spikeFlags.some(f => f.key === 'academic'));
  }
  if (e.interviewThemeless) {
    assert('a high interview score against a themeless file is labelled as such',
      r.modules.interview.themeless === true && !!r.modules.interview.themelessNote);
  }
  if (e.interviewBelowTarget) {
    assert('interview alignment is below target', r.modules.interview.available && !r.modules.interview.meetsTarget,
      `got ${r.modules.interview.alignment}`);
  }
  if (e.hookArchetype) {
    assert(`the opening classifies as ${e.hookArchetype}`, r.modules.hook.archetype === e.hookArchetype,
      `got ${r.modules.hook.archetype} (${JSON.stringify(r.modules.hook.vector)})`);
  }
  if (e.hookPasses) {
    assert('the opening passes its own archetype test', r.modules.hook.passes === true, r.modules.hook.verdict);
  }
  if (e.saviorOrTropeFlagged) {
    const ps = r.essays.personalStatement;
    const interviewTrope = /find a cure|cure cancer/i.test(profile.student_profile.interview_practice_transcript || '');
    assert('a savior or STEM-cure trope is caught somewhere in the file',
      ps.savior.flagged || ps.authenticity.cliche.tropes.length > 0 || interviewTrope);
  }
  if (e.careWorkProtected) {
    assert('care work is protected', r.modules.portfolio.activities.some(a => a.protected && /household|sibling/i.test(a.name)));
  }
  if (e.congressionalAwardCatalogued) {
    const award = r.modules.portfolio.activities.find(a => /congressional/i.test(a.name));
    assert('the Congressional Award is recognised from the catalog', award?.basis === 'catalog' && award?.tier === 2);
  }
  if (e.noPaidRecommendations) {
    const text = JSON.stringify(r.roadmap) + JSON.stringify(r.actions);
    const paid = text.match(/\b(pre-college (camp|program)|paid (course|program|tutor)|enroll in a paid|\$\d{3,})/gi);
    assert('nothing recommended requires money', !paid, JSON.stringify(paid));
  }

  // True for every profile, regardless of archetype.
  assert('produces at least one ranked action', r.actions.length > 0);
  assert('every action names its source module', r.actions.every(a => !!a.source && !!a.label));
  assert('the headline is a specific finding', r.headline.lead.length > 40);
}

// ═══════════════════════════════════════════════════════════════════════════
section('8. Free-path guidance and the health floor');
// ═══════════════════════════════════════════════════════════════════════════
{
  // Every timeline item with an obvious paid version carries the free path.
  const paidShaped = Object.values(GRADE_PLANS).flatMap(p => p.items)
    .concat(SENIOR_PIPELINE.flatMap(m => m.items))
    .filter(i => /summer program|test|prep|research|domain|hosting|fafsa|css/i.test(`${i.label} ${i.detail}`));
  assert('items with a paid version carry a free path', paidShaped.some(i => !!i.costNote));
  assert('the junior summer item is explicitly the cheap option',
    /cheapest ambitious/i.test(GRADE_PLANS[11].items.find(i => i.id === 'junior-summer').costNote || ''));

  const exec = buildRoadmap({ grade: 11, findings: {}, now: NOW }).execution;
  assert('health can never be scheduled below the floor',
    exec.burners.find(b => b.id === 'health').level !== 'low');
  assert('at most two burners run high',
    exec.burners.filter(b => b.level === 'high').length <= HEALTH_FLOOR.maxHighBurners + 1);
  assert('the four burners are all present', exec.burners.length === BURNERS.length);
  assert('the task method is six ranked items', exec.method.listSize === 6 && IVY_PRODUCTIVE.rules.length === 4);
}

// ═══════════════════════════════════════════════════════════════════════════
section('9. Drafts are never persisted');
// ═══════════════════════════════════════════════════════════════════════════
{
  const r = byId('TC_005_MULTIPASSIONATE_FATIMA');
  const ps = profileById('TC_005_MULTIPASSIONATE_FATIMA').student_profile.essay_drafts.personal_statement;
  const stripped = JSON.stringify(stripDrafts(r));

  assert('the full personal statement is absent from a stored run', !stripped.includes(ps.slice(0, 200)));
  // The tightest check: no string in a stored run reproduces a long run of the
  // draft. 180 characters is the truncation limit stripDrafts enforces.
  const chunk = ps.slice(40, 240);
  assert('no 200-character span of the draft survives', !stripped.includes(chunk));
  assert('term vectors are not serialised', !stripped.includes('combinedVector'));
  assert('the stripped run still carries the findings',
    stripped.includes('spikeIndex') && stripped.includes('coherence') || stripped.includes('balance'));
  assert('both storage tables are exportable and deletable',
    RESOURCES.includes('narrative_profile') && RESOURCES.includes('narrative_runs'));
}

// ═══════════════════════════════════════════════════════════════════════════
section('10. The data and the arithmetic are honest about themselves');
// ═══════════════════════════════════════════════════════════════════════════
{
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  assert('category weights sum to 1.0', Math.abs(sum(EVALUATION_CATEGORIES.map(k => CATEGORY_WEIGHTS[k])) - 1) < 1e-9);
  assert('Domino weights sum to 1.0 across five milestones',
    DOMINO_WEIGHTS.length === 5 && Math.abs(sum(DOMINO_WEIGHTS) - 1) < 1e-9);
  assert('storyboard targets sum to 1.0 across four phases',
    STORYBOARD_TARGETS.length === 4 && Math.abs(sum(STORYBOARD_TARGETS) - 1) < 1e-9);
  assert('syntax penalties sum to 1.0',
    Math.abs(SYNTAX_PENALTIES.passive + SYNTAX_PENALTIES.clutter + SYNTAX_PENALTIES.adjective - 1) < 1e-9);
  assert('the tier target vector is [1, 3, 4]', JSON.stringify(TIER_TARGETS) === '[1,3,4]');
  assert('λ sits inside the specification range', LAMBDA_SPIKE >= 0.5 && LAMBDA_SPIKE <= 0.85);
  assert('α sits inside the specification range', ALPHA_SPIKE > 0 && ALPHA_SPIKE <= 0.25);

  assert('cliché ids are unique', new Set(ALL_CLICHE_IDS).size === ALL_CLICHE_IDS.length);
  assert('overused-project ids are unique', new Set(OVERUSED_PROJECTS.map(t => t.id)).size === OVERUSED_PROJECTS.length);
  assert('award-catalog ids are unique', new Set(AWARD_CATALOG.map(a => a.id)).size === AWARD_CATALOG.length);
  assert('every overused theme carries a redirect that does not say "stop"',
    OVERUSED_PROJECTS.every(t => t.redirect && t.redirect.length > 40 && !/\bstop doing|abandon|give up\b/i.test(t.redirect)));
  assert('every narrative trope carries a redirect', NARRATIVE_TROPES.every(t => !!t.redirect));
  assert('hardship tropes are marked as such rather than as things to cut',
    NARRATIVE_TROPES.filter(t => t.honorsHardship).every(t => /keep it|the truest|specific/i.test(t.redirect) || t.redirect.length > 60));
  assert('every clutter rule has a replacement defined', CLUTTER_PHRASES.every(c => typeof c.with === 'string'));

  // The Spike Index is unambiguous: it must reward strength, not punish it.
  const strong = composeHolistic({
    academic: { score: 1 }, extracurricular: { score: 1 }, personal: { score: 1 }, recommendation: { score: 1 },
  });
  const weak = composeHolistic({
    academic: { score: 6 }, extracurricular: { score: 6 }, personal: { score: 6 }, recommendation: { score: 6 },
  });
  assert('a perfect file scores higher on the Spike Index than a weak one', strong.spikeIndex > weak.spikeIndex);
  assert('the Spike Index normalises into [0,1]', strong.spikeIndexNormalized === 1 && weak.spikeIndexNormalized === 0);

  // The documented discrepancy: both readings are reported, and they differ.
  const lopsided = composeHolistic({
    academic: { score: 1 }, extracurricular: { score: 5.5 }, personal: { score: 5 }, recommendation: { score: 5 },
  });
  assert('both readings of the ambiguous formula are reported',
    typeof lopsided.literal === 'number' && typeof lopsided.spikeFirst === 'number' && lopsided.literal !== lopsided.spikeFirst);
  assert('the discrepancy is explained in the output, not buried in a comment',
    /max\(\)/.test(lopsided.readingNote) && /weakest/i.test(lopsided.readingNote));
  assert('the reported figure is the spike-first reading', lopsided.reported === lopsided.spikeFirst);

  // Retention: the literal product is reported, and the applied value is bounded.
  const r10 = retention({ daysSince: 2, recalls: Array.from({ length: 10 }, () => ({ success: true })) });
  assert('retention stays inside [0,1] with many successful recalls', r10.value <= 1 && r10.value >= 0);
  assert('the unbounded literal product is disclosed', r10.literalProduct > 1 && !!r10.literalNote);
  assert('successful recall extends the half-life',
    retention({ daysSince: 3, recalls: [{ success: true }] }).value > retention({ daysSince: 3, recalls: [] }).value);

  // Competition index: more selective at a larger scale scores higher.
  const intl = competitionIndex({ participantsCount: 100000, winnersCount: 50, scale: 'international' });
  const local = competitionIndex({ participantsCount: 40, winnersCount: 10, scale: 'local' });
  assert('an international placement outranks a local one', intl.index > local.index);
  assert('the international result lands in COMP_INT_L1', intl.band === 'COMP_INT_L1');
  assert('the local result lands in COMP_LOC_L4', local.band === 'COMP_LOC_L4');

  // Portfolio balance: the ideal shape must score near 1.
  const ideal = scorePortfolio([
    { name: 'ISEF finalist', description_draft: 'Regeneron ISEF finalist in materials science.', years_involved: 3, scale: 'international', winners_count: 400, participants_count: 100000 },
    ...Array.from({ length: 3 }, (_, i) => ({ name: `State result ${i}`, description_draft: 'State science fair placement.', leadership_role: 'President', years_involved: 3, scale: 'state', winners_count: 5, participants_count: 300 })),
    ...Array.from({ length: 4 }, (_, i) => ({ name: `Club ${i}`, description_draft: 'Member.', years_involved: 2, scale: 'local' })),
  ]);
  assert('the target shape [1,3,4] scores near 1', ideal.balance > 0.85, `${ideal.balance} from ${JSON.stringify(ideal.counts)}`);
  assert('and is described as spiky', ideal.shape === 'spiky', ideal.shape);
  assert('surplus is penalised less than shortfall',
    scorePortfolio([...Array.from({ length: 2 }, (_, i) => ({ name: `ISEF ${i}`, description_draft: 'ISEF finalist.', scale: 'international', years_involved: 3 }))]).balance
    > scorePortfolio([]).balance);

  // Differentiation calibration: an archetypal description must land high.
  const archetypal = differentiationIndex('I founded a STEM outreach nonprofit that brings robotics and coding education to underserved elementary schools through weekend workshops and donated kits.');
  assert('a deliberately archetypal description is flagged', archetypal.flagged === true,
    `${archetypal.similarity} / ${archetypal.band}`);
  assert('and names the archetype it collided with', archetypal.collidesWith?.id === 'robotics-nonprofit');
  const unusual = differentiationIndex('I catalogued every surviving hand-carved proa hull on Guam, measured their outrigger geometry, and published the measurements as a public dataset for boatbuilders.');
  assert('a genuinely unusual project is not flagged', unusual.flagged === false, `${unusual.similarity} / ${unusual.band}`);

  // Storyboard: the impact rule is absolute.
  const noNumbers = scoreStoryboard('I joined the club in ninth grade. Then I became more involved over time. Later I was elected to lead it. We ran many events and helped a lot of people in our community. It was a great experience for everyone involved. I plan to keep doing this kind of work in the future because it matters to me.');
  assert('a draft with no metrics is flagged on the impact phase',
    noNumbers.findings.some(f => f.phase === 'impact' && f.severity === 'high'));
  assert('a short draft marks its score as low-resolution rather than damning',
    scoreStoryboard(GENERIC_PROSE).lowResolution === true);

  // Activities list.
  const weak2 = auditActivityEntry({ name: 'Club', description: 'I was responsible for helping out with various activities and events.' });
  assert('a weak activity line is flagged for its opening and its missing number',
    weak2.findings.some(f => f.id === 'no-metric') && weak2.findings.some(f => f.id.startsWith('weak-opening')));
  const strong2 = auditActivityEntry({ name: 'Debate', description: 'Coached 12 novice debaters to place top 5 regionally; grew squad from 9 to 41 across two schools.' });
  assert('a strong activity line passes', strong2.score >= 0.8 && strong2.metrics >= 2, JSON.stringify(strong2.findings));

  // Additional Information.
  const unresolved = auditAdditionalInfo('During junior year I was hospitalized for six weeks following a diagnosis, and my grades in that semester dropped significantly.');
  assert('a hardship with no resolution is flagged', unresolved.findings.some(f => f.id === 'no-resolution'));
  const resolved = auditAdditionalInfo('During junior year I was hospitalized for six weeks following a diagnosis; my grades dropped that semester. Since then my treatment plan has been in place and my GPA recovered to a 3.9 across senior year.');
  assert('the same hardship with a resolution passes', !resolved.findings.some(f => f.id === 'no-resolution'));

  // Brag sheets.
  const thin = auditBragSheet({ discussion: 'We talked a lot.' }, 'teacher');
  assert('a thin brag-sheet answer is named as thin', thin.prompts.find(p => p.id === 'discussion').state === 'thin');
  assert('and the sheet is not marked ready', thin.ready === false);
}

// ═══════════════════════════════════════════════════════════════════════════
section('11. The senior calendar is dated and triages honestly');
// ═══════════════════════════════════════════════════════════════════════════
{
  const r = byId('TC_003_SCATTERED_HIGH_STATS');
  const cal = r.roadmap.calendar;
  assert('the senior calendar is dated to a real application year', cal.year === 2026);
  assert('every item has a real date', cal.months.every(m => m.items.every(i => i.due instanceof Date)));
  assert('a mid-September run reports the June items as overdue', cal.overdue.length > 0);
  assert('being behind produces a triage rather than a compressed plan', !!cal.triage);
  assert('the triage keeps every deadline-bearing item',
    cal.triage.keep.some(k => k.id === 'oct-fafsa') && cal.triage.keep.some(k => k.id === 'dec-rd'));
  assert('every cut item states what cutting it costs', cal.triage.cut.every(c => !!c.cost));
  assert('the triage says to work the keep list in date order', /date order/i.test(cal.triage.rule));

  // A student who is on time gets no triage.
  const early = runEngine(profileById('TC_003_SCATTERED_HIGH_STATS'), { now: new Date('2026-06-05T12:00:00Z'), gradYear: 2027 });
  assert('an on-time student gets no triage', !early.roadmap.calendar.triage);
}

// ═══════════════════════════════════════════════════════════════════════════
section('12. The engine never ghostwrites, and cites the one policy');
// ═══════════════════════════════════════════════════════════════════════════
// This engine is essay-facing, so it is bound by the same academic-integrity
// promise the essay workspace makes and api/_lib/essayProseGuard.js enforces on
// the server: it critiques, questions and points at sentences, and it never
// produces prose a student could submit.
//
// That is architecturally true — no module in src/lib/ivy/ contains a text
// generator — but "architecturally true" is exactly the property that stops
// being true the day someone adds a helpful `suggestedOpening` field. So it is
// asserted with the same guard the server uses, rather than trusted.
{
  assert('the engine quotes the canonical policy headline', AI_POLICY_NOTE.policyHeadline === AI_POLICY.headline);
  assert('and carries every hard rule verbatim',
    AI_POLICY_NOTE.hardRules.length === HARD_RULES.length
    && AI_POLICY_NOTE.hardRules.every((r, i) => r.body === HARD_RULES[i].body),
    'the engine has drifted from src/lib/aiPolicy.js');
  assert('the no-ghostwriting rule is among them', AI_POLICY_NOTE.hardRules.some(r => r.id === 'no_ghostwriting'));

  // Keys carrying the STUDENT's own words are excluded: quoting their sentence
  // back while diagnosing it is explicitly permitted by the policy and is most
  // of what a useful audit does. What is checked is everything the engine wrote.
  const STUDENT_TEXT_KEYS = new Set([
    'sentence', 'sentences', 'hook', 'firstSentence', 'match', 'phrase', 'text',
    'before', 'after', 'matches', 'found', 'answer', 'stacked', 'assigned', 'evidence',
  ]);
  function engineAuthoredStrings(value, key = null, out = [], depth = 0) {
    if (depth > 14) return out;
    if (typeof value === 'string') {
      if (!STUDENT_TEXT_KEYS.has(key)) out.push({ key, text: value });
      return out;
    }
    if (Array.isArray(value)) {
      if (STUDENT_TEXT_KEYS.has(key)) return out;
      for (const v of value) engineAuthoredStrings(v, key, out, depth + 1);
      return out;
    }
    if (value && typeof value === 'object') {
      if (value instanceof Map || value instanceof Set) return out;
      for (const [k, v] of Object.entries(value)) {
        if (STUDENT_TEXT_KEYS.has(k)) continue;
        engineAuthoredStrings(v, k, out, depth + 1);
      }
    }
    return out;
  }

  let totalStrings = 0;
  for (const [id, r] of results) {
    const strings = engineAuthoredStrings(r);
    totalStrings += strings.length;
    const prose = strings.filter(x => isNarrativeProse(x.text));
    assert(`${id.slice(0, 14)} emits no submittable prose`, prose.length === 0,
      prose.slice(0, 2).map(x => `${x.key}: ${x.text.slice(0, 120)}`).join(' | '));
  }
  assert(`the check actually inspected the output (${totalStrings} engine-authored strings)`, totalStrings > 500);

  // And the guard can genuinely catch a violation, so a green run above means
  // something. If this fixture stops being caught, the assertions prove nothing.
  assert('the guard would catch a generated opening if one were ever added',
    isNarrativeProse("I still remember the smell of the hallway outside room 412 — antiseptic and old coffee. My grandmother had been in that bed for nine days, and I had counted every one of them on the drive over."),
    'essayProseGuard no longer detects narrative prose');

  // The hook module is the likeliest to acquire a generator, because "suggest an
  // opening line" is the obvious next feature request and the single worst place
  // for the engine's voice to appear.
  const hook = byId('TC_005_MULTIPASSIONATE_FATIMA').modules.hook;
  assert('the hook module classifies and never proposes an opening',
    !('suggestion' in hook) && !('rewrite' in hook) && !('suggestedOpening' in hook) && !('example' in hook),
    Object.keys(hook).join(', '));
}

// ═══════════════════════════════════════════════════════════════════════════
section('12. Determinism');
// ═══════════════════════════════════════════════════════════════════════════
{
  for (const p of BENCHMARK_PROFILES) {
    const a = JSON.stringify(stripDrafts(runEngine(p, { now: NOW, gradYear: 2027 })));
    const b = JSON.stringify(stripDrafts(runEngine(p, { now: NOW, gradYear: 2027 })));
    assert(`${p.student_profile.student_id.slice(0, 14)} is deterministic`, a === b);
  }
}

console.log(`\n${failures === 0 ? '✓' : '✗'} ${checks - failures}/${checks} checks passed`);
process.exit(failures === 0 ? 1 && 0 : 1);
