// ─────────────────────────────────────────────────────────────────────────────
// THE NARRATIVE METHOD ENGINE — the orchestrator.
//
// ── PREMIUM ROADMAP ─────────────────────────────────────────────────────────
// This is the entry point the premium gate wraps. `runEngine()` takes a `tier`
// and returns a full or a headline reading; the gate itself lives in
// src/lib/entitlements.js (`canUseNarrativeEngine`) and is currently OPEN —
// see ENFORCE_PREMIUM in ./constants.js. The free reading is a REAL reading of
// the student's own profile, never a blurred placeholder, and the Section 6
// safeguards are attached to both.
// ────────────────────────────────────────────────────────────────────────────
//
// One function, six sections out, in the order the specification defines them:
//
//   1. THEMATIC EXTRACTION & COHERENCE   — the Value-Based Theme, echo score
//   2. DETERMINISTIC EVALUATION           — all thirteen modules
//   3. AUTHENTICITY SORTER & RESONANCE    — the AI-vs-human audit
//   4. GRADE-BY-GRADE ROADMAP             — dated, for this student's grade
//   5. WRITTEN ENGINE AUDIT               — per-draft, line level
//   6. RISK MITIGATION & SAFEGUARDS       — always, for every tier
//
// ── The ordering is load-bearing ───────────────────────────────────────────
// Theme first, because every other reading is relative to it: a portfolio is
// balanced or not AGAINST something, an essay is on-theme or not AGAINST
// something. Safeguards last so they are the final thing on the screen rather
// than a disclaimer above the fold that nobody reads.
//
// ── What this function will not do ─────────────────────────────────────────
// It does not emit an admission probability (see SAFEGUARDS.emitsAdmissionProbability),
// it does not run AI detection, and it does not fabricate an input. A module
// with nothing to read returns `available: false` and says what would make it
// readable — which is the difference between a tool that is honest about a
// blank profile and one that flatters it.
// ─────────────────────────────────────────────────────────────────────────────

import { FREE_TIER, PREMIUM } from './constants.js';
import {
  scoreAcademic, scoreExtracurricular, scorePersonal, scoreRecommendation,
  composeHolistic, lambdaSensitivity,
} from './holistic.js';
import { scorePortfolio } from './portfolio.js';
import { scoreDomino } from './domino.js';
import { scoreSatHeuristics } from './satHeuristics.js';
import { retention, decayQueue } from './retention.js';
import { scoreStoryboard, validateWhyUs, validateWhyMajor } from './storyboard.js';
import { authenticityIndex, narrativeStakes, vulnerabilityAudit, saviorAudit, authenticitySorter } from './authenticity.js';
import { sprintState, seniorCalendar } from './sprint.js';
import { classifyHook } from './hooks.js';
import { scoreSyntax } from './syntax.js';
import { rankCompetitions } from './competition.js';
import { differentiateAll } from './differentiation.js';
import { scoreInterviewAlignment, alignmentDrills } from './interview.js';
import { extractTheme, echoCoherence, surfacesFromProfile } from './theme.js';
import { auditActivitiesList, auditAdditionalInfo, auditBragSheet } from './commonApp.js';
import { buildRoadmap } from './roadmap.js';
import { assembleSafeguards } from './safeguards.js';

/**
 * Every input the engine reads, and what each one unlocks.
 *
 * Used by `assessCompleteness` so the student is told what a missing field
 * costs rather than having it silently assumed — the same contract the
 * admissions calculator's intake works under (src/lib/admissions/intake.js).
 */
export const ENGINE_INPUTS = [
  { id: 'personal_statement', label: 'Personal statement draft', unlocks: ['Voice reading', 'Hook classification', 'Stakes audit', 'Syntax sweeps', 'Personal-qualities rating'], weight: 'high' },
  { id: 'extracurriculars', label: 'Activities, with roles and years', unlocks: ['Tiering', 'Portfolio balance', 'Differentiation', 'Activities rating'], weight: 'high' },
  { id: 'academics', label: 'GPA, rigor and any test score', unlocks: ['Academic rating'], weight: 'high' },
  { id: 'intended_major', label: 'The field your application claims', unlocks: ['Domino M₄', '"Why major" audit'], weight: 'medium' },
  { id: 'supplemental_essays', label: 'Supplement drafts', unlocks: ['Storyboard score', '"Why us" audit', 'Supplement echo'], weight: 'medium' },
  { id: 'interview_transcript', label: 'A practice interview transcript', unlocks: ['Interview alignment', 'Pacing'], weight: 'medium' },
  { id: 'project', label: 'Your passion project\'s state', unlocks: ['Domino viability', 'Next milestone'], weight: 'high' },
  { id: 'recommenders', label: 'Who you asked, and when', unlocks: ['Recommendation rating'], weight: 'medium' },
  { id: 'sat_practice', label: 'Technique practice results', unlocks: ['SAT heuristic index'], weight: 'low' },
  { id: 'study_log', label: 'Study sessions and recalls', unlocks: ['Retention curve'], weight: 'low' },
];

/** What is missing, and what each gap costs. */
export function assessCompleteness(profile = {}) {
  const p = profile.student_profile || profile;
  const drafts = p.essay_drafts || p.essayDrafts || {};
  const has = {
    personal_statement: !!(drafts.personal_statement || drafts.personalStatement),
    extracurriculars: (p.extracurriculars || p.activities || []).length > 0,
    academics: !!(p.academics && (p.academics.unweighted_gpa || p.academics.sat_act_score)),
    intended_major: !!(p.intended_major || p.intendedMajor),
    supplemental_essays: (drafts.supplemental_essays || drafts.supplementalEssays || []).length > 0,
    interview_transcript: !!(p.interview_practice_transcript || p.interviewTranscript),
    project: !!(p.project || (p.extracurriculars || []).some(a => a.leadership_role)),
    recommenders: !!p.recommenders,
    sat_practice: !!p.sat_practice,
    study_log: !!p.study_log,
  };
  const missing = ENGINE_INPUTS.filter(i => !has[i.id]);
  const weightOf = { high: 3, medium: 2, low: 1 };
  const total = ENGINE_INPUTS.reduce((s, i) => s + weightOf[i.weight], 0);
  const have = ENGINE_INPUTS.filter(i => has[i.id]).reduce((s, i) => s + weightOf[i.weight], 0);

  return {
    have, total, share: Math.round((have / total) * 100) / 100,
    present: ENGINE_INPUTS.filter(i => has[i.id]).map(i => i.id),
    missing: missing.map(i => ({ id: i.id, label: i.label, unlocks: i.unlocks, weight: i.weight })),
    next: missing.sort((a, b) => weightOf[b.weight] - weightOf[a.weight])[0] || null,
  };
}

/**
 * RUN THE ENGINE.
 *
 * @param {Object} profile   the ingestion schema, or its `student_profile` body
 * @param {Object} [opts]
 * @param {'free'|'premium'} [opts.tier]
 * @param {Date}   [opts.now]
 * @param {Object} [opts.completed]  roadmap items already done
 */
export function runEngine(profile = {}, { tier = 'premium', now = new Date(), completed = {}, gradYear = null } = {}) {
  const p = profile.student_profile || profile;
  const drafts = p.essay_drafts || p.essayDrafts || {};
  const personalStatement = drafts.personal_statement || drafts.personalStatement || '';
  const supplements = drafts.supplemental_essays || drafts.supplementalEssays || [];
  const activities = p.extracurriculars || p.activities || [];
  const academics = p.academics || {};
  const grade = Number(p.grade_level ?? p.gradeLevel ?? 12);
  const context = p.socioeconomic_background || p.socioeconomicBackground || {};
  const intendedMajor = p.intended_major || p.intendedMajor || null;

  const completeness = assessCompleteness(p);
  // The engine honors the tier it is handed; it does not decide who gets
  // which. That decision is `narrativeEngineTier()` in src/lib/entitlements.js,
  // which consults ENFORCE_PREMIUM and today returns 'premium' for everyone.
  //
  // Keeping the two apart is what makes the free shape testable before billing
  // exists — an engine that silently upgraded every caller while the gate was
  // open would mean the free reading shipped having never once been rendered.
  const full = tier !== 'free';

  // ══ SECTION 1 — thematic extraction ═════════════════════════════════════
  const surfaces = surfacesFromProfile(p);
  const theme = extractTheme(surfaces);
  const coherence = echoCoherence(surfaces, theme);

  // ══ SECTION 2 — the thirteen modules ════════════════════════════════════

  // 3 — portfolio tiering first, because module 1 reads it.
  const portfolio = scorePortfolio(activities);

  // 7 — authenticity, because module 1's personal rating reads it.
  const psAuthenticity = personalStatement ? authenticityIndex(personalStatement) : null;
  const psStakes = personalStatement ? narrativeStakes(personalStatement) : null;

  // 1 — the holistic rubric.
  const categoryScores = {
    academic: scoreAcademic(academics, {
      context: { limitedAccess: /limited|no (dedicated |)college|rural|public school district/i.test(context.demographic_context || '') },
    }),
    extracurricular: scoreExtracurricular(portfolio),
    personal: scorePersonal({ authenticity: psAuthenticity, stakes: psStakes }),
    recommendation: scoreRecommendation(p.recommenders || null),
  };
  const holistic = composeHolistic(categoryScores);
  const sensitivity = lambdaSensitivity(categoryScores);

  // 2 — Domino, on the strongest self-directed activity.
  const project = resolveProject(p, activities, intendedMajor);
  const domino = scoreDomino(project);

  // 4 — SAT heuristics.
  const satHeuristics = scoreSatHeuristics(p.sat_practice || {});

  // 5 — retention.
  const studyLog = p.study_log || null;
  const retentionRead = studyLog
    ? { available: true, items: decayQueue(studyLog.items || [], { now: +now }), sample: retention({ daysSince: studyLog.daysSinceLast ?? 0, recalls: studyLog.recalls || [] }) }
    : { available: false, note: 'No study sessions logged. The retention curve needs a session and a written recall to say anything.' };

  // 6, 9, 10 — the essay modules, per draft.
  const essays = {
    personalStatement: personalStatement ? {
      words: personalStatement.split(/\s+/).filter(Boolean).length,
      authenticity: psAuthenticity,
      stakes: psStakes,
      vulnerability: vulnerabilityAudit(personalStatement),
      savior: saviorAudit(personalStatement),
      hook: classifyHook(personalStatement),
      syntax: scoreSyntax(personalStatement),
      storyboard: scoreStoryboard(personalStatement, { kind: 'personal-statement' }),
    } : null,
    supplements: supplements.map(s => {
      const text = s.text_draft || s.text || '';
      const type = s.prompt_type || s.promptType || 'extracurricular';
      return {
        promptType: type,
        words: text.split(/\s+/).filter(Boolean).length,
        storyboard: scoreStoryboard(text, { limit: s.word_limit || s.wordLimit || null }),
        syntax: scoreSyntax(text),
        authenticity: authenticityIndex(text),
        hook: classifyHook(text),
        whyUs: type === 'why_us' ? validateWhyUs(text, { school: s.school || null }) : null,
        whyMajor: type === 'why_major' ? validateWhyMajor(text) : null,
      };
    }),
  };

  // 8 — the sprint.
  const sprint = grade >= 12
    ? { ...sprintState({ now, completed }), calendar: seniorCalendar({ now, gradYear, completed }) }
    : { available: false, note: 'The ninety-day sprint is the summer before senior year. Your grade-level roadmap is below instead.' };

  // 11 — competitions.
  const competitions = rankCompetitions(
    activities
      .filter(a => Number(a.winners_count ?? a.winnersCount ?? 0) > 0 || /\b(award|placed|championship|olympiad|medal|finalist)\b/i.test(`${a.name} ${a.description_draft || ''}`))
      .map(a => ({
        title: `${a.name} ${a.description_draft || a.description || ''}`,
        label: a.name,
        participantsCount: a.participants_count ?? a.participantsCount,
        winnersCount: a.winners_count ?? a.winnersCount,
        scale: a.scale,
      })),
  );

  // 12 — differentiation.
  const differentiation = differentiateAll(activities);

  // 13 — interview alignment.
  const transcript = p.interview_practice_transcript || p.interviewTranscript || '';
  const interview = scoreInterviewAlignment({
    transcript,
    themeText: [surfaces.personalStatement, surfaces.activities, surfaces.supplements].filter(Boolean).join('\n\n'),
    durationSeconds: p.interview_duration_seconds ?? null,
    themeDecisive: theme.available ? theme.decisive : null,
  });

  // Section 5 — the Common App validators.
  const commonApp = {
    activities: auditActivitiesList(activities, { tiering: portfolio }),
    additionalInfo: auditAdditionalInfo(p.additional_info || p.additionalInfo || '', {
      activityDescriptions: activities.map(a => a.description_draft || a.description || ''),
    }),
    bragSheets: {
      teacher: auditBragSheet(p.brag_sheets?.teacher || {}, 'teacher'),
      counselor: auditBragSheet(p.brag_sheets?.counselor || {}, 'counselor'),
    },
  };

  // ══ SECTION 3 — the authenticity sorter ═════════════════════════════════
  const sorter = personalStatement ? authenticitySorter(personalStatement) : { insufficient: true, note: 'No personal statement to audit yet.' };

  const findings = {
    theme, coherence, holistic, portfolio, domino, satHeuristics, essays,
    interview: interview.available ? interview : null,
    commonApp, academics: { sat: Number(academics.sat_act_score ?? academics.satActScore ?? 0) },
  };

  // ══ SECTION 4 — the roadmap ═════════════════════════════════════════════
  const roadmap = buildRoadmap({ grade, findings, completed, now, gradYear });

  // ══ SECTION 6 — safeguards. Always. Both tiers. ═════════════════════════
  const safeguards = assembleSafeguards({
    holistic, completeness, coherence,
    authenticity: psAuthenticity, storyboard: essays.personalStatement?.storyboard,
    differentiation, portfolio,
    context: { firstGen: !!context.first_gen, lowIncome: !!context.low_income },
  });

  const headline = buildHeadline({ theme, coherence, holistic, portfolio, domino, essays, interview });
  const actions = rankActions({ portfolio, coherence, essays, domino, commonApp, interview, satHeuristics, holistic });

  const result = {
    studentId: p.student_id || p.studentId || null,
    grade, ranAt: new Date(now).toISOString(),
    tier: full ? 'premium' : 'free',
    completeness,

    // Section 1
    thematic: { theme, coherence },

    // Section 2
    modules: {
      holistic: { ...holistic, sensitivity },
      domino,
      portfolio,
      satHeuristics,
      retention: retentionRead,
      storyboard: essays.personalStatement?.storyboard || null,
      authenticity: psAuthenticity,
      sprint,
      hook: essays.personalStatement?.hook || null,
      syntax: essays.personalStatement?.syntax || null,
      competitions,
      differentiation,
      interview,
    },

    // Section 3
    resonance: sorter,

    // Section 4
    roadmap,

    // Section 5
    essays,
    commonApp,

    // Section 6 — never withheld from any tier.
    safeguards,

    headline,
    actions,
  };

  if (full) return result;

  // ── The free reading ────────────────────────────────────────────────────
  // A real reading of their real profile: theme, the four rubric scores, the
  // portfolio shape, one action, and every safeguard. Not a blur, not a teaser.
  return {
    studentId: result.studentId, grade, ranAt: result.ranAt, tier: 'free',
    completeness,
    thematic: { theme: { ...theme, evidence: theme.evidence?.slice(0, 1) }, coherence: coherence.available ? { available: true, score: coherence.score, band: coherence.band, headline: coherence.headline } : coherence },
    modules: {
      holistic: { scores: holistic.scores, reported: holistic.reported, spikeIndex: holistic.spikeIndex, spikeFlags: holistic.spikeFlags, headline: holistic.headline, assumptions: holistic.assumptions, confidence: holistic.confidence },
      portfolio: { counts: portfolio.counts, balance: portfolio.balance, shape: portfolio.shape, shapeNote: portfolio.shapeNote, triggers: portfolio.triggers.slice(0, 1) },
    },
    safeguards,
    headline,
    actions: actions.slice(0, FREE_TIER.showsTopAction),
    locked: {
      feature: PREMIUM.featureId, tier: PREMIUM.tier, label: PREMIUM.label, pitch: PREMIUM.pitch,
      included: [
        'All thirteen modules, itemized, with the arithmetic shown',
        'Line-level essay audit: hook, stakes, syntax sweeps, storyboard',
        'The authenticity sorter — which edits to refuse, and why',
        'Your dated roadmap, and the senior triage when you are behind',
        'Interview alignment against your own written theme',
      ],
      // Stated so nobody has to wonder.
      neverLocked: 'Honest expectations, the confidence interval, the AI-policy note and the demographic definitions are part of every reading, on every plan.',
    },
  };
}

/** Picks the activity the Domino framework should be run against. */
function resolveProject(p, activities, intendedMajor) {
  if (p.project) return { intendedMajor, ...p.project };

  // The strongest self-directed thing: founder roles first, then reach.
  const candidate = [...activities]
    .map(a => ({
      raw: a,
      founder: /\b(found|start|launch|creat|establish)\w*/i.test(`${a.leadership_role || ''} ${a.description_draft || ''}`),
      reach: Number(a.participants_count ?? a.participantsCount ?? 0),
      years: Number(a.years_involved ?? a.yearsInvolved ?? 0),
    }))
    .sort((x, y) => (y.founder - x.founder) || (y.reach - x.reach) || (y.years - x.years))[0];

  if (!candidate) return { intendedMajor, description: '' };
  const a = candidate.raw;
  return {
    intendedMajor,
    name: a.name,
    description: `${a.name}. ${a.description_draft || a.description || ''}`.trim(),
    engagement: Number(a.participants_count ?? a.participantsCount ?? NaN),
    // Only asserted where the text actually says so — the engine does not
    // assume a mentor or a website into existence.
    hasMentorAgreement: /\b(mentor|advis[oe]r|supervis|under (a |the )?(professor|dr\.?|doctor)|co-?author)\w*/i.test(a.description_draft || ''),
    hasMediaMention: /\b(featured|press|news|interviewed by|published in|covered by)\b/i.test(a.description_draft || ''),
    hasPartner: /\b(partner|501\s?\(?c\)?\s?\(?3\)?|nonprofit|in collaboration with|with the (city|district|hospital|university))\b/i.test(a.description_draft || ''),
    hasLiveSite: /\b(website|site|\.org|\.com|domain|online platform|app store|github)\b/i.test(a.description_draft || ''),
    hasPublishedArtifact: /\b(published|handbook|curriculum|paper|journal|database|archive|repository)\b/i.test(a.description_draft || ''),
  };
}

/** The one sentence at the top. */
function buildHeadline({ theme, coherence, holistic, portfolio, domino, essays, interview }) {
  const parts = [];

  if (portfolio.counts.tier1 === 0 && portfolio.total >= 2) {
    parts.push({
      id: 'no-spike',
      text: `You have ${portfolio.total} activit${portfolio.total === 1 ? 'y' : 'ies'} and nothing yet reads as identity-defining. That is the structural finding, and it outranks everything else on this page.`,
    });
  }
  if (coherence.available && (coherence.band === 'scattered' || coherence.band === 'fragmented')) {
    parts.push({
      id: coherence.band,
      text: coherence.band === 'scattered'
        ? 'Your surfaces are about different things. A reader assembling your file gets a list rather than a person.'
        : 'Your theme is visible in some places and absent from others, so the file reads as partly assembled rather than as one argument.',
    });
  }
  if (theme.available && !theme.decisive && theme.secondary) {
    // Two different failures, and telling them apart matters: a genuine tie
    // means the student has two identities in the file, while a clear-but-thin
    // leader means they have one and have not said it loudly enough. The
    // advice is nearly opposite, so the headline must not merge them.
    const tied = theme.primary.score < theme.secondary.score * 1.35;
    parts.push(tied
      ? { id: 'no-theme', text: `No single theme is carrying the file: ${theme.primary.label.toLowerCase()} and ${theme.secondary.label.toLowerCase()} are running at nearly the same strength.` }
      : { id: 'thin-theme', text: `Your theme — ${theme.primary.label.toLowerCase()} — is the clear leader and is stated too faintly. It is present in what you wrote and a reader would have to infer it.` });
  }
  if (essays.personalStatement?.stakes?.smoothCurve) {
    parts.push({ id: 'smooth', text: 'The personal statement is an unbroken record of accomplishment with nothing at stake in it.' });
  }
  if (interview?.available && interview.disconnect) {
    parts.push({ id: 'interview', text: 'What you say and what you wrote are about different subjects.' });
  }
  if (holistic.hasSpike && portfolio.counts.tier1 >= 1) {
    parts.push({ id: 'spike', text: holistic.headline });
  }

  const lead = parts[0] || { id: 'thin', text: 'Not enough on file yet to find the structural problem. Add a draft and your activities and this becomes specific.' };
  return {
    lead: lead.text,
    id: lead.id,
    supporting: parts.slice(1, 3).map(p => p.text),
    theme: theme.available ? theme.headline : null,
  };
}

/**
 * Every action the modules produced, ranked.
 *
 * Ranked by leverage — structural findings above essay findings above
 * mechanical ones — and NOT by how easy they are, because the ordering a
 * student needs is the one that says which thing decides the outcome.
 */
function rankActions({ portfolio, coherence, essays, domino, commonApp, interview, satHeuristics, holistic }) {
  const out = [];
  const add = (rank, id, label, detail, source) => out.push({ rank, id, label, detail, source });

  for (const t of portfolio.triggers || []) {
    add(t.severity === 'high' ? 1 : 3, t.id, t.label, t.detail, 'portfolio');
  }
  if (domino?.next && domino.viability > 0) add(2, `domino-${domino.next.key}`, `Next domino: ${domino.next.short}`, domino.next.note, 'domino');
  for (const d of coherence.disconnects || []) add(2, `echo-${d.surface}`, `Close the ${d.label.toLowerCase()} gap`, d.detail, 'theme');

  const ps = essays.personalStatement;
  if (ps) {
    for (const f of ps.storyboard?.findings || []) if (f.severity === 'high') add(4, `sb-${f.phase}`, f.label, f.detail, 'storyboard');
    if (ps.stakes?.smoothCurve) add(3, 'stakes', 'Put a cost in the personal statement', ps.stakes.findings.find(f => f.id === 'smooth-curve')?.detail || '', 'stakes');
    if (ps.hook?.available && !ps.hook.passes) add(5, 'hook', 'Rework the opening', ps.hook.verdict, 'hook');
    for (const f of ps.syntax?.sweeps?.passive?.findings?.slice(0, 1) || []) add(6, 'passive', 'Clear the passive constructions', f.ask, 'syntax');
  }
  for (const s of essays.supplements || []) {
    if (s.whyUs?.available && s.whyUs.swapTest.fails) add(4, 'why-us', 'Rewrite the "why us" against real specifics', s.whyUs.swapTest.note, 'supplement');
    if (s.whyMajor?.available && s.whyMajor.missing.length) add(4, 'why-major', 'Add the missing part of "why this major"', s.whyMajor.note, 'supplement');
  }
  for (const f of commonApp.activities?.findings || []) add(f.severity === 'high' ? 4 : 6, `ca-${f.id}`, f.label, f.detail, 'common-app');
  for (const f of commonApp.additionalInfo?.findings || []) add(f.severity === 'high' ? 3 : 6, `ai-${f.id}`, f.label, f.detail, 'additional-info');
  if (interview?.available && !interview.meetsTarget) add(5, 'interview', 'Prepare one story that lands on your theme', interview.headline, 'interview');
  if (satHeuristics?.next) add(7, `sat-${satHeuristics.next.id}`, satHeuristics.next.label, satHeuristics.next.why, 'sat');
  for (const a of holistic.assumptions || []) add(8, `assumed-${a.key}`, `Tell us about ${a.key}`, a.note, 'completeness');

  return out.sort((a, b) => a.rank - b.rank);
}

/** Interview drills, exported for the panel. */
export { alignmentDrills };
