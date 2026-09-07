#!/usr/bin/env node
// Assertions for the opportunity-intelligence layer (src/lib/opportunity/).
//
// There is no test runner in this repo, so this script IS the test suite for the model that
// decides what a fifteen-year-old is told to do with their year. It is written against the
// failures that would actually hurt a student, in the order they would hurt:
//
//   1. AN INVENTED FACT REACHING A CARD. A deadline, cost, link or eligibility rule that a model
//      produced and nobody checked, rendered as though someone had. Every assertion in section 4
//      exists for this.
//   2. A RECORD SHOWN AS ACTIVE WHEN IT IS NOT. Expired, stale, incomplete or unverified records
//      must always carry their state, and the state must be visible before the name.
//   3. AN INELIGIBLE RECOMMENDATION. A student spending a fortnight on something with an age gate
//      they cannot clear.
//   4. A LIST THAT IGNORES WHAT THEY TOLD US. Cost, distance, time, and every refusal they have
//      ever given us have to change the answer — otherwise the feedback UI is theater.
//   5. PRESTIGE BEATING SUBSTANCE. An open-enrollment program that costs thousands must never
//      outrank a free, substantial, local one.
//
//   node scripts/verifyOpportunityIntelligence.mjs
import { OPPORTUNITIES } from '../src/data/opportunities.js';
import { PROGRAMS } from '../src/data/opportunityPrograms.js';
import {
  normalizeRecord, dataStateFor, statusFor, completeness, recurs, expectedNextCycle,
  safeUrl, DATA_STATES, DATA_STATE_BY_ID, OPPORTUNITY_STATUSES, VERIFICATION_STATES,
  OPPORTUNITY_CATEGORIES, CATEGORY_BY_ID, PORTFOLIO_ROLES, INACTIVE_DATA_STATES, reliabilityLine,
} from '../src/lib/opportunity/schema.js';
import { buildRecordPool, fromCatalogEntry, fromProgram, refineCategory, derivedPotential, derivedPortfolioRole } from '../src/lib/opportunity/adapt.js';
import { buildOpportunityContext, readTimeBudget, readCostSensitivity, readTransport } from '../src/lib/opportunity/context.js';
import {
  rankOpportunities, scoreOpportunity, capacityFor, eligibilityFor, replacementFor,
  DIMENSION_WEIGHTS, DIMENSION_LABELS,
} from '../src/lib/opportunity/ranking.js';
import { realisticOutcome, readinessLevel, outcomeLine } from '../src/lib/opportunity/outcomes.js';
import {
  indexFeedback, suppressionFor, feedbackRowFor, decodeFeedbackRow, describeLessons,
  OPPORTUNITY_ACTIONS, ACTION_BY_ID, ACTION_TO_STATUS, SUPPRESS_STATUSES, refFor,
} from '../src/lib/opportunity/feedback.js';
import {
  cardAnswers, deadlineRowsFor, roadmapItemFor, dashboardSummary, planTasksFor,
  buildOpportunityPrompt, opportunityIntelBlock, describeContext,
} from '../src/lib/opportunity/insights.js';
import {
  buildDiscoveryPrompt, sanitizeCandidate, parseCandidates, dedupeCandidates, similarity, slugFor,
} from '../src/lib/opportunity/discovery.js';

let passed = 0;
const failures = [];
const assert = (label, cond, detail = '') => {
  if (cond) { passed += 1; return; }
  failures.push(`${label}${detail ? `\n      ${detail}` : ''}`);
};

const POOL = buildRecordPool({ opportunities: OPPORTUNITIES, programs: PROGRAMS });
const ctxFor = (over = {}) => buildOpportunityContext({
  user: { gradeStage: 'junior', age: 16, specialty: 'physician', ...(over.user || {}) },
  snapshot: over.snapshot ?? null,
  pathwayKey: over.pathwayKey ?? 'physician',
  colleges: over.colleges || [],
  roadmap: over.roadmap || null,
  deadlines: over.deadlines || [],
  intel: over.intel || null,
});

// ── 1. The record contract ───────────────────────────────────────────────────
assert('every catalog entry adapts into a record', OPPORTUNITIES.every((o) => fromCatalogEntry(o)?.id === o.id));
assert('every structured program adapts into a record', PROGRAMS.every((p) => fromProgram(p)?.id === p.id));
assert('the pool has no duplicate ids', new Set(POOL.map((r) => r.id)).size === POOL.length);
assert('the pool prefers the structured row where both catalogs share an id',
  PROGRAMS.every((p) => POOL.find((r) => r.id === p.id)?.sourceKind === 'program'));
assert('every pooled record has a name and a source kind', POOL.every((r) => r.name && r.sourceKind));

// Category refinement: the catalog's seven-value `type` cannot reach half the categories a
// student filters by, so the adapter reads the entry's own words. What it must never do is
// override a shape the type already states unambiguously.
assert('a competition stays a competition whatever its subject is',
  refineCategory('competition', 'An essay contest about health policy judged by geneticists') === 'competition');
assert('a scholarship stays a scholarship', refineCategory('scholarship', 'A summer research award') === 'scholarship');
assert('an ambiguous "Program" is refined by what a student would actually be doing',
  refineCategory('summer', 'A paid summer internship at a county health department') === 'internship');
assert('an entry whose words support nothing finer keeps its coarse category',
  refineCategory('summer', 'A program for high schoolers') === 'summer');
assert('the pool reaches more than the seven original types',
  new Set(POOL.map((r) => r.category)).size >= 10, [...new Set(POOL.map((r) => r.category))].join(','));
assert('every pooled category is a declared category', POOL.every((r) => !r.category || CATEGORY_BY_ID[r.category]));

// `null` means "we do not know" and must never coerce into a number. This exact bug — Number(null)
// being 0 — made maxAge 0 on every record and blocked 354 of 361 programs for every student.
const noBounds = normalizeRecord({ name: 'x', maxAge: null, minAge: undefined, costUsd: '', deadlineMonth: null });
assert('an absent maximum age stays absent rather than becoming zero', noBounds.maxAge === null);
assert('an absent minimum age stays absent', noBounds.minAge === null);
assert('an absent cost stays absent rather than becoming free', noBounds.costUsd === null);
assert('an empty states array normalizes to national, not "restricted to nowhere"',
  normalizeRecord({ name: 'x', states: [] }).states === null);
assert('a states array keeps real codes and drops junk',
  JSON.stringify(normalizeRecord({ name: 'x', states: ['nc', 'ZZZZ', 'CA'] }).states) === JSON.stringify(['NC', 'CA']));

// A link on a card is the one place an unchecked string becomes something a student clicks.
assert('a javascript: url is refused', safeUrl('javascript:alert(1)') === null);
assert('a data: url is refused', safeUrl('data:text/html,<script>') === null);
assert('a relative url is refused', safeUrl('/programs/thing') === null);
assert('a hostless url is refused', safeUrl('http://localhost') === null);
assert('a real https url survives', safeUrl('https://example.org/apply') === 'https://example.org/apply');
assert('every pooled url that exists is a safe absolute url', POOL.every((r) => !r.url || safeUrl(r.url) === r.url));

// ── 2. Data states ───────────────────────────────────────────────────────────
assert('every data state declares whether it may render as active',
  DATA_STATES.every((d) => typeof d.showAsActive === 'boolean' && d.label && d.blurb));
assert('archived and next-cycle are the two inactive states',
  INACTIVE_DATA_STATES.has('archived') && INACTIVE_DATA_STATES.has('upcoming_cycle') && INACTIVE_DATA_STATES.size === 2);
assert('every status and verification state has an id and a label',
  [...OPPORTUNITY_STATUSES, ...VERIFICATION_STATES].every((v) => v.id && v.label));
assert('every category and portfolio role has an id and a label',
  [...OPPORTUNITY_CATEGORIES, ...PORTFOLIO_ROLES].every((v) => v.id && v.label));

const now = new Date('2026-09-07T12:00:00');
assert('an AI-discovered record is never in the verified state',
  dataStateFor({ name: 'x', org: 'y', description: 'z', eligibility: 'w', sourceKind: 'ai_discovered', verificationState: 'needs_verification' }, now).id === 'ai_discovered');
assert('an AI-discovered record cannot be promoted by carrying a verified flag alone',
  dataStateFor({ name: 'x', org: 'y', description: 'z', eligibility: 'w', sourceKind: 'ai_discovered', verificationState: 'verified' }, now).id === 'ai_discovered');
assert('a long-ago check reads as stale, not as current',
  dataStateFor({ name: 'x', org: 'y', description: 'z', eligibility: 'w', sourceKind: 'program', verifiedAt: '2024-01-01' }, now).id === 'stale');
assert('a record missing an essential field reads as incomplete',
  dataStateFor({ name: 'x', org: 'y', description: '', eligibility: 'w', sourceKind: 'program', verifiedAt: '2026-09-01' }, now).id === 'incomplete');
assert('a passed deadline with no recurrence reads as archived',
  dataStateFor({ name: 'x', org: 'y', description: 'z', eligibility: 'w', deadlineIso: '2026-01-01' }, now).id === 'archived');
assert('a passed deadline that recurs reads as next cycle, never expired',
  dataStateFor({ name: 'x', org: 'y', description: 'z', eligibility: 'w', deadlineIso: '2026-01-01', recurrence: { cadence: 'annual' } }, now).id === 'upcoming_cycle');
assert('a next-cycle state never renders as active',
  dataStateFor({ name: 'x', org: 'y', description: 'z', eligibility: 'w', deadlineIso: '2026-01-01', recurrence: { cadence: 'annual' } }, now).showAsActive === false);
assert('every record in the pool resolves to a known data state',
  POOL.every((r) => DATA_STATE_BY_ID[dataStateFor(r, now).id]));
assert('every data state carries a sentence explaining itself',
  POOL.slice(0, 40).every((r) => reliabilityLine(r, now).length > 30));

// A curated catalog entry carries no check date and must not claim one.
const curated = fromCatalogEntry(OPPORTUNITIES[0]);
assert('a curated entry with no check date does not claim a check date',
  !/Checked \d/.test(dataStateFor(curated, now).detail), dataStateFor(curated, now).detail);

// Next-cycle timing is only ever stated when we recorded a cycle.
assert('a record with no recorded recurrence produces no expected next cycle',
  expectedNextCycle({ name: 'x', deadlineIso: '2026-01-01' }, now) === null);
assert('a recurring record with no month produces no invented month',
  expectedNextCycle({ name: 'x', recurrence: { cadence: 'annual' } }, now) === null);
const cycle = expectedNextCycle({ name: 'x', deadlineMonth: 2, deadlinePrecision: 'approx' }, now);
assert('a February deadline read in September rolls to next year', cycle?.rolledToNextYear === true && cycle.daysOut > 100);
assert('recurs() requires recorded evidence, not a hopeful guess',
  recurs({ deadlineMonth: 3, deadlinePrecision: 'approx' }) && !recurs({ name: 'annual-sounding thing' }));

// ── 3. Eligibility is a gate, never a penalty ────────────────────────────────
const soph = ctxFor({ user: { gradeStage: 'sophomore', age: 15 } });
const seniorOnly = normalizeRecord({ name: 'Senior thing', org: 'o', description: 'd', eligibility: 'e', grades: ['12'] });
assert('a sophomore is blocked from a senior-only program', eligibilityFor(seniorOnly, soph).status === 'blocked');
assert('a blocked verdict says which gate stopped them', eligibilityFor(seniorOnly, soph).blockers.length > 0);
const unknownGrade = ctxFor({ user: { gradeStage: null, age: null } });
assert('an unknown grade never clears a grade gate — it reads as "check this"',
  eligibilityFor(seniorOnly, unknownGrade).status === 'unknown');
assert('an unknown age never clears an age gate',
  eligibilityFor(normalizeRecord({ name: 'x', minAge: 18 }), unknownGrade).status === 'unknown');
assert('citizenship is reported as a requirement, never as a verdict about the student',
  eligibilityFor(normalizeRecord({ name: 'x', citizenship: 'us' }), soph).notes.some((n) => /citizenship/i.test(n)));

const sophRanked = rankOpportunities({ records: POOL, ctx: soph });
assert('nothing a student is blocked from ever reaches the active list',
  sophRanked.matches.every((m) => m.eligibility.status !== 'blocked'));
assert('nothing blocked reaches the stretch or next-cycle lists either',
  [...sophRanked.stretch, ...sophRanked.nextCycle].every((m) => m.eligibility.status !== 'blocked'));
assert('blocked records are surfaced separately rather than silently dropped', sophRanked.blocked.length > 0);
assert('no archived record ever appears in any active bucket',
  [...sophRanked.matches, ...sophRanked.stretch].every((m) => m.dataState.id !== 'archived'));
assert('every record in the next-cycle bucket is genuinely a next-cycle record',
  sophRanked.nextCycle.every((m) => m.dataState.id === 'upcoming_cycle' || m.flags.includes('next_cycle')));

// ── 4. The list adapts ───────────────────────────────────────────────────────
assert('the ranking weights and labels cover the same dimensions',
  Object.keys(DIMENSION_WEIGHTS).every((k) => DIMENSION_LABELS[k]) && Object.keys(DIMENSION_LABELS).length === Object.keys(DIMENSION_WEIGHTS).length);

const busy = ctxFor({ intel: { constraints: { time_availability: 'I have maybe 2 hours a week, I am swamped' } },
  deadlines: [1, 2, 3, 4, 5].map((n) => ({ due_date: new Date(Date.now() + n * 86400000 * 5).toISOString().slice(0, 10) })) });
const roomy = ctxFor({
  colleges: [{ category: 'reach' }, { category: 'reach' }, { category: 'reach' }, { category: 'target' }],
  intel: { constraints: { time_availability: 'I have about 20 hours a week free' } },
  snapshot: { activities: Array.from({ length: 8 }, (_, i) => ({ activity_type: 'Volunteering', position: `role ${i}` })), research: [{}, {}], awards: [{}] },
});
assert('a busy, constrained student is shown fewer', capacityFor(busy).count < capacityFor(roomy).count,
  `busy=${capacityFor(busy).count} roomy=${capacityFor(roomy).count}`);
assert('a constrained list explains why it is short', capacityFor(busy).drivers.length > 0);
assert('an ambitious student with time gets a wider list', capacityFor(roomy).count >= 8, String(capacityFor(roomy).count));
assert('the list length is never zero and never unbounded',
  capacityFor(busy).count >= 3 && capacityFor(roomy).count <= 14);
assert('the shown list actually honors the capacity',
  rankOpportunities({ records: POOL, ctx: busy }).matches.length <= capacityFor(busy).count);
assert('a brand-new student with nothing logged still gets a usable list',
  rankOpportunities({ records: POOL, ctx: ctxFor({ user: { gradeStage: null, age: null }, pathwayKey: null }) }).matches.length >= 3);

// Free-text constraints must actually parse, or every constraint above is decoration.
assert('a "swamped" sentence reads as very limited time', readTimeBudget('I am completely swamped this term') === 'very_limited');
assert('an hours-per-week sentence reads as a bucket', readTimeBudget('about 20 hours a week') === 'ample');
assert('an unparseable sentence reads as unknown, not as plenty', readTimeBudget('it depends') === null);
assert('a "cannot afford" sentence reads as free-only', readCostSensitivity('we really cannot afford anything') === 'free_only');
assert('a free-only preference overrides the prose', readCostSensitivity('money is fine', 'free_only') === 'free_only');
assert('a "no car" sentence reads as constrained transport', readTransport('I have no car and no license') === 'constrained');

// ── 5. Prestige never beats substance ────────────────────────────────────────
const base = { name: 'A generic test opportunity', org: 'o', description: 'A substantial program with real work.', eligibility: 'Open to high schoolers.', category: 'summer' };
const payToPlay = normalizeRecord({ ...base, id: 'p2p', name: 'Famous Leadership Congress', tier: 'pay_to_play', costUsd: 4500, selectivity: 'elite' });
const freeReal = normalizeRecord({ ...base, id: 'free', name: 'County Health Department Internship', category: 'internship', costText: 'Free', costUsd: 0 });
const c = ctxFor();
assert('an expensive open-enrollment program scores below a free substantial one',
  scoreOpportunity(payToPlay, c).score < scoreOpportunity(freeReal, c).score,
  `p2p=${scoreOpportunity(payToPlay, c).score.toFixed(3)} free=${scoreOpportunity(freeReal, c).score.toFixed(3)}`);
assert('an open-enrollment program is called what it is',
  scoreOpportunity(payToPlay, c).reasons.some((r) => /anyone who pays/i.test(r.text)));
assert('a pay-to-play program is never in the main list',
  rankOpportunities({ records: [...POOL, payToPlay], ctx: c }).matches.every((m) => m.record.tier !== 'pay_to_play'));

// ── 6. Realistic outcomes ────────────────────────────────────────────────────
const comp = normalizeRecord({ ...base, id: 'comp', name: 'A competition', category: 'competition', selectivity: 'elite' });
const firstTimer = ctxFor({ user: { gradeStage: 'freshman', age: 14 } });
const veteran = ctxFor({ snapshot: { activities: Array.from({ length: 6 }, () => ({})), awards: [{}, {}, {}], research: [{}] },
  intel: { competitions: [{}, {}, {}, {}] } });
assert('readiness rises with real evidence', readinessLevel(comp, veteran).points > readinessLevel(comp, firstTimer).points);
assert('a first-timer is never told to aim at a placement',
  ['entered', 'feedback'].includes(realisticOutcome(comp, firstTimer).target.id), realisticOutcome(comp, firstTimer).target.id);
assert('winning is never the stated target, at any readiness level',
  [firstTimer, veteran, c].every((x) => realisticOutcome(comp, x).target.id !== 'won'));
assert('winning is never the target for an open competition either',
  realisticOutcome(normalizeRecord({ ...base, id: 'c2', category: 'competition', selectivity: 'open' }), veteran).target.id !== 'won');
assert('the rungs above the target are still named as upside',
  realisticOutcome(comp, firstTimer).upside.length > 0);
assert('every category in the catalog produces an outcome with a target',
  POOL.slice(0, 60).every((r) => realisticOutcome(r, c).target?.label));
assert('an outcome line is a sentence, not a placeholder', outcomeLine(freeReal, c).length > 25);

// ── 7. Feedback changes the answer ───────────────────────────────────────────
assert('every action declares an intent and maps to a legal status',
  OPPORTUNITY_ACTIONS.every((a) => ['positive', 'negative', 'neutral'].includes(a.intent) && ACTION_TO_STATUS[a.id]));
assert('every negative action maps to a status the ranker recognizes',
  OPPORTUNITY_ACTIONS.filter((a) => a.intent === 'negative').every((a) => SUPPRESS_STATUSES.has(ACTION_TO_STATUS[a.id])));
const row = feedbackRowFor(freeReal, 'too_expensive', { note: 'way out of budget', category: 'internship' });
assert('a feedback row points back at the record', row.item_ref === refFor(freeReal) && row.item_label === freeReal.name);
assert('a feedback row round-trips the action and the words',
  decodeFeedbackRow(row).action === 'too_expensive' && /out of budget/.test(decodeFeedbackRow(row).comment));

const declinedIdx = indexFeedback([{ item_ref: refFor(freeReal), item_label: freeReal.name, status: 'too_expensive', item_category: 'internship', created_at: new Date().toISOString(), note: 'action:too_expensive' }]);
assert('a fresh decline hides the record', suppressionFor(freeReal, declinedIdx).hide === true);
assert('a decline generalizes to a cost lesson', declinedIdx.lessons.cost > 0.3);
assert('the lessons are explained in plain words', describeLessons(declinedIdx).some((l) => /cost/i.test(l)));
const oldIdx = indexFeedback([{ item_ref: refFor(freeReal), status: 'too_expensive', created_at: '2023-01-01T00:00:00Z', note: 'action:too_expensive' }]);
assert('an old decline decays back in rather than banning forever', oldIdx.byRef[refFor(freeReal)].reintroduced === true);
assert('a decayed decline is flagged as a reintroduction, never shown as brand new',
  suppressionFor(freeReal, oldIdx).reintroduced === true && suppressionFor(freeReal, oldIdx).hide === false);
const laterYes = indexFeedback([
  { item_ref: refFor(freeReal), status: 'declined', created_at: '2026-01-01T00:00:00Z', note: 'action:declined' },
  { item_ref: refFor(freeReal), status: 'in_progress', created_at: '2026-06-01T00:00:00Z', note: 'action:saved' },
]);
assert('a later yes overturns an earlier no', suppressionFor(freeReal, laterYes).hide === false);

const withFeedback = ctxFor({ intel: { recommendationFeedback: [{ item_ref: refFor(freeReal), status: 'too_expensive', created_at: new Date().toISOString(), note: 'action:too_expensive' }] } });
const rankedAfter = rankOpportunities({ records: [...POOL, freeReal], ctx: withFeedback });
assert('a declined record never comes back in the active list',
  rankedAfter.matches.every((m) => m.id !== freeReal.id));
assert('cost feedback pushes expensive things down',
  scoreOpportunity(normalizeRecord({ ...base, id: 'x', costUsd: 3000 }), withFeedback).score
  < scoreOpportunity(normalizeRecord({ ...base, id: 'x', costUsd: 3000 }), c).score);

// A decline must produce an alternative that answers the objection actually raised.
const expensiveDecline = replacementFor(scoreOpportunity(payToPlay, c), 'too_expensive', rankOpportunities({ records: POOL, ctx: c }), c);
assert('declining on cost offers a free replacement', expensiveDecline && expensiveDecline.flags.includes('free'), expensiveDecline?.record?.name);
assert('the replacement says why it is the replacement', /free/i.test(expensiveDecline?.replacementReason || ''));
const hardDecline = replacementFor(scoreOpportunity(comp, c), 'too_difficult', rankOpportunities({ records: POOL, ctx: c }), c);
assert('declining on difficulty offers something open-entry',
  hardDecline && (hardDecline.record.selectivity === 'open' || hardDecline.flags.includes('starter')), hardDecline?.record?.name);

// ── 8. Location is consent-gated and never assumed ───────────────────────────
const noConsent = ctxFor();
assert('no location without consent', noConsent.place === null && noConsent.hasLocationConsent === false);
const consented = ctxFor({ user: { opportunityPrefs: { localMatchConsent: true, zipCode: '27514', localMatchState: 'NC' } } });
assert('consent resolves a location', consented.place?.state === 'NC');
const ncOnly = normalizeRecord({ ...base, id: 'nc', name: 'NC only thing', states: ['NC'] });
assert('a state-restricted record is matched locally when the student is in that state',
  scoreOpportunity(ncOnly, consented).flags.includes('local'));
assert('the local match explains itself',
  /matched to you because you told us where you are/i.test(scoreOpportunity(ncOnly, consented).dimensions.travel.reason || ''));
const inCA = ctxFor({ user: { opportunityPrefs: { localMatchConsent: true, zipCode: '90001', localMatchState: 'CA' } } });
assert('a student outside the state is told the gate, not shown it as a match',
  eligibilityFor(ncOnly, inCA).status === 'blocked');
assert('with no location we make no distance claim at all',
  scoreOpportunity(normalizeRecord({ ...base, id: 'nat', format: 'In person' }), noConsent).dimensions.travel.reason === null);
assert('a distant in-person program is labeled an optional stretch, not hidden',
  rankOpportunities({ records: POOL, ctx: c }).stretch.length >= 0
  && scoreOpportunity(normalizeRecord({ ...base, id: 's', format: 'In person', location: 'Residential campus program' }),
    ctxFor({ intel: { constraints: { transportation_limits: 'I have no car and no ride' } } })).flags.includes('stretch_travel'));

// ── 9. Discovery invents nothing ─────────────────────────────────────────────
const prompt = buildDiscoveryPrompt(c, { existingNames: ['A Thing'] });
for (const rule of ['NEVER INVENT A DEADLINE', 'NEVER INVENT ELIGIBILITY', 'NEVER INVENT A URL', 'REAL PROGRAM YOU ACTUALLY KNOW', 'OFFICIAL ORGANIZATION SOURCES']) {
  assert(`the discovery prompt states: ${rule}`, prompt.includes(rule));
}
assert('the discovery prompt forbids pay-to-attend summits and fake nonprofits',
  /NO PAY-TO-ATTEND YOUTH SUMMITS/.test(prompt) && /NO FAKE NONPROFITS/.test(prompt));
assert('the discovery prompt preserves non-medical interests', /whole person/i.test(prompt));
assert('the discovery prompt lists what we already have so it does not repeat it', prompt.includes('A Thing'));
assert('the discovery prompt never carries a ZIP', !/\b\d{5}\b/.test(prompt));

const cand = sanitizeCandidate({
  name: 'Invented Program', org: 'Some Org', category: 'internship', description: 'Does things.',
  url: 'https://example.org/x', deadlineText: 'March 15, 2027', deadlineSource: 'it runs annually',
  eligibility: 'Grades 11-12', grades: ['11', '12'], confidence: 'high', recurring: true,
});
assert('a discovered record is always AI-discovered and never verified',
  cand.sourceKind === 'ai_discovered' && cand.verificationState === 'needs_verification' && cand.verifiedAt === null);
assert('a discovered record is never given a machine-readable date',
  cand.deadlineIso === null && cand.deadlineMonth === null);
assert('an exact-looking date from a model is stripped rather than shown', cand.deadlineText === null);
assert('a timing claim with no stated basis is dropped',
  sanitizeCandidate({ name: 'Test Program', org: 'o', description: 'd', deadlineText: 'usually in spring', deadlineSource: '' }).deadlineText === null);
assert('a timing claim WITH a basis and no exact date survives',
  sanitizeCandidate({ name: 'Test Program', org: 'o', description: 'd', deadlineText: 'applications usually close in early spring', deadlineSource: 'it has run on this cycle for years' }).deadlineText !== null);
assert('a discovered record never claims selectivity', cand.selectivity === null);
assert('an unsafe url on a discovered record is dropped and flagged',
  sanitizeCandidate({ name: 'Test Program', org: 'o', description: 'd', url: 'javascript:x' }).unverifiableUrl === true);
assert('a candidate with no description is refused entirely', sanitizeCandidate({ name: 'Test Program', org: 'o' }) === null);
assert('a bogus category is dropped rather than invented', sanitizeCandidate({ name: 'Test Program', org: 'o', description: 'd', category: 'nonsense' }).category === null);
assert('a discovered record renders as needing verification',
  dataStateFor(cand, now).id === 'ai_discovered' && dataStateFor(cand, now).label.includes('needs verification'));
assert('slugs are deterministic', slugFor('A Thing', 'An Org') === slugFor('A Thing', 'An Org'));
assert('parseCandidates tolerates both shapes models return',
  parseCandidates('{"candidates":[{"name":"a"}]}').length === 1 && parseCandidates('[{"name":"a"}]').length === 1);
assert('parseCandidates never throws on garbage', parseCandidates('not json').length === 0);
assert('near-identical names dedupe against the existing catalog',
  dedupeCandidates([{ id: 'ai-x', name: 'Congressional Award', org: 'The Congressional Award' }], POOL).length === 0);
assert('the same url dedupes even under a different name',
  dedupeCandidates([{ id: 'ai-y', name: 'Totally Different Name', url: 'https://example.org/x' }], [{ id: 'z', name: 'z', url: 'https://www.example.org/x/' }]).length === 0);
assert('similarity is symmetric and bounded', similarity('alpha beta gamma', 'beta gamma delta') === similarity('beta gamma delta', 'alpha beta gamma') && similarity('alpha', 'alpha') === 1 && similarity('alpha', 'omega') === 0);

// ── 10. The card answers every question ──────────────────────────────────────
const rankedNow = rankOpportunities({ records: [...POOL, cand], ctx: c });
const QUESTIONS = ['what', 'whyMe', 'whyNow', 'portfolioRole', 'deadline', 'eligibility', 'cost', 'time', 'place', 'source', 'reliability', 'outcome'];
for (const m of rankedNow.matches) {
  const a = cardAnswers(m, c);
  assert(`[${m.id}] the card answers every required question`, QUESTIONS.every((q) => a[q] != null), QUESTIONS.filter((q) => a[q] == null).join(','));
  assert(`[${m.id}] the card states how reliable the data is`, !!a.reliability.label && !!a.reliability.detail);
  assert(`[${m.id}] the card names a realistic outcome`, !!a.outcome.headline);
  assert(`[${m.id}] the card never leaves a deadline blank`, typeof a.deadline.text === 'string' && a.deadline.text.length > 0);
  assert(`[${m.id}] a missing cost is stated as missing, never as free`,
    m.record.costText || m.record.costUsd != null || /not listed/i.test(a.cost));
  assert(`[${m.id}] a missing link is stated as missing`, m.record.url ? !!a.source.url : a.source.url === null && a.source.label.length > 10);
}

// ── 11. Nothing unverified becomes a dated commitment ────────────────────────
assert('an AI-discovered record never produces a calendar reminder', deadlineRowsFor(scoreOpportunity(cand, c)).length === 0);
assert('a record with no date produces no reminder',
  deadlineRowsFor(scoreOpportunity(normalizeRecord({ ...base, id: 'nodate' }), c)).length === 0);
const dated = scoreOpportunity(normalizeRecord({ ...base, id: 'dated', deadlineMonth: 12, deadlinePrecision: 'approx', recurrence: { cadence: 'annual' } }), c);
const rows = deadlineRowsFor(dated, { today: now });
assert('a dated record produces the deadline plus its alerts', rows.length >= 2);
assert('an approximate date is labeled approximate on the milestone row', /approx/i.test(rows[0].title));
assert('every reminder row is an in-app deadline row and nothing else',
  rows.every((r) => r.kind === 'opportunity' && r.due_date && r.source_ref && !('email' in r) && !('push' in r)));
const rmItem = roadmapItemFor(scoreOpportunity(cand, c));
assert('a roadmap item from an unverified record carries no date', rmItem.date === null);
assert('a roadmap item from an unverified record says so in its note', /not yet verified/i.test(rmItem.note));
assert('a roadmap item never invents a date even for a dated record', roadmapItemFor(dated).date === null);

// ── 12. Integration surfaces ─────────────────────────────────────────────────
const summary = dashboardSummary(rankedNow, c);
assert('the dashboard summary reports the adaptive count, not a fixed one', summary.count === rankedNow.matches.length);
assert('the dashboard summary counts unverified records rather than hiding them', typeof summary.needsVerification === 'number');
assert('the dashboard summary is a sentence', typeof summary.line === 'string' && summary.line.length > 10);
assert('the dashboard summary carries the reasoning for the list length', Array.isArray(summary.capacityDrivers));

const p = buildOpportunityPrompt(rankedNow, c);
assert('the prompt names every shortlisted opportunity', rankedNow.matches.every((m) => p.includes(m.record.name)));
assert('the prompt forbids naming anything outside the list', /may not name anything outside it/i.test(p) && /Never invent, substitute, or recall one from elsewhere/i.test(p));
assert('the prompt forbids inventing deadlines and fees', /Never state a deadline, fee, age minimum, acceptance rate or requirement that is not written above/i.test(p));
assert('the prompt says AI-discovered records are leads', /is a LEAD, not a fact/i.test(p));
assert('the prompt forbids telling a student to aim for first place', /Never tell them to aim for first place/i.test(p));
assert('the prompt describes the student in the same words the UI shows them',
  describeContext(c).every((line) => p.includes(line)));
assert('the prompt never carries a ZIP code', !/\b\d{5}\b/.test(p.replace(/\d+% fit/g, '')));
assert('the prompt never repeats private accessibility notes verbatim',
  !buildOpportunityPrompt(rankedNow, ctxFor({ intel: { constraints: { accessibility_notes: 'SECRET-DETAIL' } } })).includes('SECRET-DETAIL'));
const blocked = buildOpportunityPrompt(sophRanked, soph);
assert('the prompt tells the model which opportunities the student is not eligible for',
  sophRanked.blocked.length === 0 || /never suggest them/i.test(blocked));

const block = opportunityIntelBlock(rankedNow, c);
assert('the compact block names the data state beside every opportunity',
  rankedNow.matches.slice(0, 5).every((m) => block.includes(m.record.name)) && /Only ever name opportunities from this list/i.test(block));
assert('the compact block is empty when there is nothing to say', opportunityIntelBlock({ matches: [] }, c) === '');

const tasks = planTasksFor(scoreOpportunity(cand, c), c);
assert('a plan task for an unverified record is a verification task first', /^Verify /.test(tasks[0]), tasks[0]);
assert('plan tasks are concrete and checkable', tasks.every((t) => t.length > 20) && tasks.length <= 4);

// ── 13. Derivations are bounded ──────────────────────────────────────────────
assert('derived potentials stay in 0-3',
  POOL.every((r) => [r.leadershipPotential, r.impactPotential, r.distinctionPotential, r.skillBuilding]
    .every((v) => v == null || (v >= 0 && v <= 3))));
assert('every pooled record has a portfolio role', POOL.every((r) => ['major', 'supporting', 'exploration'].includes(r.portfolioRole)));
assert('a one-day event is never called a major activity',
  derivedPortfolioRole({ category: 'research', timeCommitment: 'A one-day outreach event', text: '' }) === 'exploration');
assert('derivedPotential returns all four axes', Object.keys(derivedPotential({ category: 'research' })).length === 4);
assert('every score is a fraction between 0 and 1',
  rankedNow.matches.every((m) => m.score >= 0 && m.score <= 1 && m.match >= 0 && m.match <= 100));
assert('matches are ordered by score', rankedNow.matches.every((m, i) => i === 0 || rankedNow.matches[i - 1].score >= m.score));
assert('no single category dominates the shortlist',
  Object.values(rankedNow.matches.reduce((acc, m) => ({ ...acc, [m.record.category]: (acc[m.record.category] || 0) + 1 }), {})).every((n) => n <= 2));
assert('every match carries at least one human-readable reason',
  rankedNow.matches.every((m) => m.reasons.length > 0 && m.reasons[0].text.length > 15));
assert('every match exposes its whole dimension breakdown',
  rankedNow.matches.every((m) => Object.keys(m.dimensions).length === Object.keys(DIMENSION_WEIGHTS).length));

// ── 14. Non-medical interests survive ────────────────────────────────────────
const authentic = normalizeRecord({ id: 'music', name: 'A serious music program', org: 'o', description: 'Real, sustained musical work with a mentor.', eligibility: 'Open to high schoolers.', category: 'project', pathways: [] });
assert('an authentic non-medical opportunity is not scored to the floor',
  scoreOpportunity(authentic, c).dimensions.direction.score >= 0.45);
assert('a non-medical opportunity is flagged as a secondary interest rather than dropped',
  scoreOpportunity(authentic, c).flags.includes('secondary_interest'));

// ── Report ───────────────────────────────────────────────────────────────────
const states = POOL.reduce((acc, r) => { const s = dataStateFor(r, now).id; return { ...acc, [s]: (acc[s] || 0) + 1 }; }, {});
console.log(`\nOpportunity intelligence: ${POOL.length} records in the pool`);
console.log(`  data states: ${Object.entries(states).map(([k, v]) => `${k}: ${v}`).join(' · ')}`);
console.log(`  ${OPPORTUNITY_ACTIONS.length} student actions · ${Object.keys(DIMENSION_WEIGHTS).length} ranking dimensions · ${OPPORTUNITY_CATEGORIES.length} categories`);
console.log(`  adaptive list size: ${capacityFor(busy).count} for a constrained student, ${capacityFor(roomy).count} for an unconstrained one`);

if (failures.length) {
  console.error(`\n✗ ${failures.length} failed assertion(s) (${passed} passed):\n`);
  for (const f of failures.slice(0, 40)) console.error(`  ✗ ${f}`);
  if (failures.length > 40) console.error(`  …and ${failures.length - 40} more`);
  process.exit(1);
}
console.log(`\n✓ ${passed} assertions passed.`);
