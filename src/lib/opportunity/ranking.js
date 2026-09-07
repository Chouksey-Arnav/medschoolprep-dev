// ─────────────────────────────────────────────────────────────────────────────
// The ranking model.
//
// src/lib/opportunityMatch.js answers "which of these programs match what this
// student is into". That question is necessary and it is not sufficient, because
// the highest-fit program in the catalog is still the wrong recommendation if
// the student cannot afford it, cannot get to it, has no hours left this term,
// has already told us no, or would be the eleventh commitment in a term with
// three deadlines in it.
//
// So this module scores across THIRTEEN dimensions, each of which can move a
// record up or down, and each of which produces its own sentence. The sentences
// are the product: a rank a student cannot interrogate is a rank they cannot
// disagree with, and a fifteen-year-old being told what to do with their year
// deserves to be able to disagree.
//
// ── The dimensions ──────────────────────────────────────────────────────────
//   fit           interests, portfolio continuity, intended direction
//   direction     pre-health/health-career relevance, without erasing the
//                 authentic non-medical interests they told us about
//   eligibility   grade, age, state, citizenship, prerequisites — a HARD gate
//   timing        how soon, and whether "soon" is soon enough to be real
//   readiness     could this student plausibly succeed at this, now
//   access        cost, and whether aid exists
//   travel        can they physically get there
//   load          hours, against hours they have
//   leadership    do they end up responsible for something
//   impact        does anyone outside them benefit
//   distinction   could it produce a named, dated result
//   portfolio     major activity vs supporting vs exploration, weighed against
//                 what their application is currently missing
//   redundancy    do they already do this
//
// ── What this model refuses to do ───────────────────────────────────────────
//  1. IT DOES NOT REWARD PRESTIGE FOR ITS OWN SAKE. `selectivity: 'elite'` is
//     worth a small distinction bonus and NOTHING else, and an expensive
//     open-enrollment program (tier 'pay_to_play') is actively penalized —
//     anyone who pays gets in, and admissions readers know it.
//  2. IT NEVER RANKS AN INELIGIBLE RECORD INTO THE ACTIVE LIST. Ineligibility
//     is a gate, not a penalty, and the record is returned in a separate
//     'blocked' bucket with what to do instead.
//  3. IT DOES NOT SHOW A FIXED NUMBER. See `capacityFor` — the size of the list
//     is itself a recommendation.
// ─────────────────────────────────────────────────────────────────────────────

import { proximity, proximityLabel } from '../geo/zip.js';
import { THEME_BY_ID } from '../opportunityMatch.js';
import {
  normalizeRecord, dataStateFor, statusFor, expectedNextCycle, recurs,
  INACTIVE_DATA_STATES, ROLE_BY_ID,
} from './schema.js';
import { suppressionFor, refFor } from './feedback.js';
import { TIME_BUDGET_BY_ID } from './context.js';

const lower = (v) => String(v || '').toLowerCase();
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/**
 * Dimension weights. Stated as data, not arithmetic, so the ranking stays
 * arguable — if you think access should outrank fit for this product, that is
 * one number here, not a rewrite.
 *
 * Note what is deliberately small: `distinction` (0.7) is worth less than
 * `access` (1.0) and much less than `fit` (1.6). That ordering is the product's
 * opinion — a substantial thing a student can actually do beats a famous thing
 * they cannot.
 */
export const DIMENSION_WEIGHTS = Object.freeze({
  fit: 1.6,
  direction: 1.0,
  timing: 1.1,
  readiness: 1.2,
  access: 1.0,
  travel: 0.9,
  load: 1.0,
  leadership: 0.7,
  impact: 0.8,
  distinction: 0.7,
  portfolio: 1.0,
  redundancy: 0.9,
});

export const DIMENSION_LABELS = Object.freeze({
  fit: 'Fits your interests',
  direction: 'Points at your direction',
  timing: 'Timing works',
  readiness: 'You are ready for it',
  access: 'You can afford it',
  travel: 'You can get to it',
  load: 'You have the hours',
  leadership: 'Leadership potential',
  impact: 'Real impact',
  distinction: 'Could produce a result',
  portfolio: 'Portfolio value',
  redundancy: 'Adds something new',
});

// ── Eligibility: the hard gate ───────────────────────────────────────────────

/**
 * Can this student apply at all, and if not, exactly which gate stops them?
 *
 * Missing facts NEVER clear a gate. A senior-only program shown to a student
 * whose grade we do not know comes back `unknown`, which the UI renders as
 * "check this" — the same rule opportunityEligibility.js already enforces for
 * the structured programs, applied here to every record.
 */
export function eligibilityFor(record, ctx) {
  const r = normalizeRecord(record);
  const blockers = [];
  const notes = [];
  let unresolved = 0;

  if (r.grades.length) {
    if (ctx.grade == null) { unresolved += 1; notes.push(`Open to grade${r.grades.length > 1 ? 's' : ''} ${r.grades.join(', ')}.`); }
    else if (!r.grades.includes(String(ctx.grade))) {
      const min = Math.min(...r.grades.map(Number));
      blockers.push(ctx.grade < min
        ? `Opens in grade ${min}; you are in grade ${ctx.grade}.`
        : `Closes after grade ${Math.max(...r.grades.map(Number))}; you are in grade ${ctx.grade}.`);
    }
  }
  if (r.minAge != null) {
    if (ctx.age == null) { unresolved += 1; notes.push(`Minimum age ${r.minAge} — add your age in Settings and this will resolve itself.`); }
    else if (ctx.age < r.minAge) blockers.push(`You are ${ctx.age}; this needs ${r.minAge}.`);
  }
  if (r.maxAge != null && ctx.age != null && ctx.age > r.maxAge) blockers.push(`Open to ${r.maxAge} and under.`);

  if (r.states?.length) {
    if (!ctx.place?.state) { unresolved += 1; notes.push(`Only open to residents of ${r.states.join(', ')}.`); }
    else if (!r.states.includes(ctx.place.state)) blockers.push(`Residents of ${r.states.join(', ')} only; you are in ${ctx.place.stateName || ctx.place.state}.`);
  }
  // Citizenship is never asked for at signup and never will be — it is not ours
  // to collect — so it is always a note the student resolves, never a verdict.
  if (r.citizenship) notes.push(r.citizenship === 'us' ? 'Requires US citizenship.' : 'Requires US citizenship or permanent residency.');
  if (r.prerequisites) notes.push(`Prerequisites: ${r.prerequisites}`);

  const status = blockers.length ? 'blocked' : unresolved ? 'unknown' : 'eligible';
  return { status, blockers, notes, unresolved };
}

// ── The dimension scorers ────────────────────────────────────────────────────
// Each returns { score: 0-1, reason: string|null, flag: string|null }. A null
// reason means the dimension is neutral and has nothing worth saying.

function scoreFit(r, ctx) {
  const hay = lower(`${r.name} ${r.org} ${r.description} ${r.eligibility} ${r.tags.join(' ')}`);
  const chosen = ctx.profile.chosenThemeIds || [];
  const inferred = ctx.profile.chosenThemeIds?.length ? [] : (ctx.profile.inferredThemeIds || []);
  const ec = ctx.profile.ecThemeIds || [];

  const hits = (ids) => ids.filter((id) => (THEME_BY_ID[id]?.keywords || []).some((k) => hay.includes(k)));
  const chosenHits = hits(chosen);
  const inferredHits = hits(inferred);
  const ecHits = hits(ec.filter((id) => !chosen.includes(id)));

  let s = 0.25; // a record that hits nothing is not disqualified, just unremarkable
  if (chosenHits.length) s += Math.min(0.55, chosenHits.length * 0.3);
  else if (inferredHits.length) s += Math.min(0.25, inferredHits.length * 0.15);
  if (ecHits.length) s += Math.min(0.2, ecHits.length * 0.1);

  const reason = chosenHits.length
    ? `Matches ${chosenHits.slice(0, 2).map((id) => lower(THEME_BY_ID[id]?.label)).join(' and ')} — interests you picked.`
    : inferredHits.length
      ? `Lines up with ${lower(THEME_BY_ID[inferredHits[0]]?.label)}, which we inferred from your signup answers.`
      : ecHits.length
        ? `Builds on the ${lower(THEME_BY_ID[ecHits[0]]?.label)} work already in your portfolio.`
        : null;
  return { score: clamp01(s), reason, flag: null };
}

/**
 * Health-career relevance — WITHOUT flattening a student into one dimension.
 *
 * A record with no pathway tag is not penalized to zero: an authentic
 * non-medical interest pursued seriously is worth more on an application than a
 * seventh medical thing done shallowly, and a product that only ever surfaces
 * pre-med opportunities teaches students to hide the rest of themselves.
 */
function scoreDirection(r, ctx) {
  const pathways = r.pathways || [];
  if (ctx.pathwayKey && ctx.pathwayKey !== 'exploring' && pathways.includes(ctx.pathwayKey)) {
    return { score: 1, reason: `Directly relevant to your ${ctx.pathwayLabel} direction.`, flag: null };
  }
  if (ctx.pathwayKey === 'exploring' && pathways.length) {
    return { score: 0.8, reason: 'A real look inside a health career while you are still narrowing things down.', flag: null };
  }
  if (pathways.length) return { score: 0.55, reason: null, flag: null };
  // No pathway tag at all: an authentic outside interest. Held at a genuine
  // middle rather than a floor, on purpose.
  const authentic = (ctx.profile.chosenThemeIds || []).length > 0;
  return {
    score: 0.5,
    reason: authentic ? 'Outside the pre-health track — kept in because a real interest pursued seriously is worth more than a seventh medical activity.' : null,
    flag: 'secondary_interest',
  };
}

function scoreTiming(r, ctx) {
  const status = statusFor(r, ctx.today);
  const cycle = expectedNextCycle(r, ctx.today);
  if (status === 'expired' && !recurs(r)) return { score: 0, reason: 'This cycle has closed and we have no record that it runs again.', flag: 'expired' };
  if (status === 'recurring' || (status === 'expired' && recurs(r))) {
    return {
      score: 0.45,
      reason: cycle?.monthLabel
        ? `This cycle has closed. The next one is expected around ${cycle.monthLabel} — start preparing now and you will be early instead of late.`
        : 'This cycle has closed, but it runs again. We do not have reliable timing for the next one.',
      flag: 'next_cycle',
    };
  }
  if (r.deadlinePrecision === 'rolling') return { score: 0.8, reason: 'No deadline — you can start this whenever you are ready.', flag: null };
  const days = cycle?.daysOut ?? daysUntil(r.deadlineIso, ctx.today);
  if (days == null) return { score: 0.5, reason: null, flag: 'timing_unclear' };
  // A deadline three weeks out is urgent AND achievable. One four days out,
  // for something that wants essays and a recommendation, is a trap — so the
  // curve peaks in the useful middle rather than at zero days.
  if (days <= 7) return { score: 0.5, reason: `Closes in ${days} day${days === 1 ? '' : 's'} — only worth starting if you can do it justice this week.`, flag: 'very_urgent' };
  if (days <= 30) return { score: 1, reason: `Closes in ${days} days — this is the one to move on now.`, flag: 'urgent' };
  if (days <= 75) return { score: 0.9, reason: `Closes in about ${Math.round(days / 7)} weeks — enough runway to do it properly.`, flag: null };
  if (days <= 150) return { score: 0.7, reason: `Closes in about ${Math.round(days / 30)} months.`, flag: null };
  return { score: 0.5, reason: `Not until ${cycle?.monthLabel || 'later in the year'} — worth knowing about, not worth acting on today.`, flag: 'far_off' };
}

function daysUntil(isoDate, today) {
  if (!isoDate) return null;
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((d - t) / 86400000);
}

/**
 * Could this student plausibly succeed at this, from where they actually are?
 *
 * Not "are they good enough" — a readiness score is about the gap between what
 * a record assumes and what a portfolio shows, and a large gap is a reason to
 * name a stepping stone, never a reason to tell a student they are not enough.
 */
function scoreReadiness(r, ctx) {
  const sel = r.selectivity;
  const evidence = (ctx.profile.researchCount || 0) + (ctx.profile.awardCount || 0) + (ctx.competitionCount || 0);
  const activities = ctx.activityCount || 0;
  const appetite = ctx.profile.effortAppetite || 'balanced';

  if (sel === 'elite') {
    const ready = evidence >= 3 || (ctx.grade != null && ctx.grade >= 11 && evidence >= 1);
    if (ready) return { score: appetite === 'open' ? 0.6 : 0.95, reason: 'A genuine reach — and your record is far enough along that it is a reach worth taking.', flag: 'reach' };
    return {
      score: appetite === 'elite' ? 0.5 : 0.3,
      reason: 'A long shot from where your portfolio is today. Worth entering for the work itself, not for the odds.',
      flag: 'stretch',
    };
  }
  if (sel === 'competitive') {
    if (evidence >= 1 || activities >= 3) return { score: 0.9, reason: 'Selective, and squarely in range for what you have already done.', flag: null };
    return { score: 0.65, reason: 'Selective, and a realistic first serious application.', flag: null };
  }
  // Open. Best possible answer for a student with nothing logged, and still
  // solid for one with plenty — accessible is not the same as unambitious.
  if (activities === 0) return { score: 1, reason: 'Open to anyone who shows up — the right kind of first thing.', flag: 'starter' };
  return { score: appetite === 'elite' ? 0.6 : 0.8, reason: null, flag: null };
}

function scoreAccess(r, ctx) {
  const lesson = ctx.feedback?.lessons?.cost || 0;
  const text = lower(r.costText);
  const free = /free|no cost|no fee|stipend|paid|funded|scholarship provided/.test(text) || r.costUsd === 0;
  const usd = r.costUsd;

  if (free) return { score: 1, reason: /stipend|paid/.test(text) ? 'It pays you rather than costing you.' : 'Free to take part.', flag: 'free' };
  if (usd != null) {
    // The curve is steep on purpose. Cost is the binding constraint for most
    // students on this product, and a $4,000 program is not "slightly worse"
    // than a $400 one for a family that does not have it.
    const base = usd <= 100 ? 0.85 : usd <= 500 ? 0.6 : usd <= 1500 ? 0.35 : usd <= 4000 ? 0.18 : 0.08;
    const aided = r.aid ? Math.min(1, base + 0.2) : base;
    const penalized = clamp01(aided * (1 - lesson * 0.6));
    return {
      score: penalized,
      reason: r.aid
        ? `About $${usd.toLocaleString()}, and aid is available — ${r.aid}`
        : `About $${usd.toLocaleString()}, with no aid we know of.`,
      flag: usd >= 1500 ? 'expensive' : null,
    };
  }
  if (!r.costText) return { score: 0.5, reason: null, flag: 'cost_unknown' };
  return { score: clamp01(0.5 * (1 - lesson * 0.5)), reason: r.costText, flag: null };
}

/**
 * Can they get there — and if not, is it honest to call it a stretch rather
 * than to hide it?
 *
 * A record with no location claim is neutral, never "near". We never assume a
 * student can travel across the country, and we never assume they cannot: a
 * distant thing is labeled as an optional stretch with what the travel would
 * actually involve, and left for them to decide.
 */
function scoreTravel(r, ctx) {
  const format = lower(r.format);
  if (/virtual|online|remote/.test(format)) return { score: 1, reason: 'Fully online — where you live does not matter for this one.', flag: 'online' };

  const lesson = ctx.feedback?.lessons?.distance || 0;
  const residential = /residential|campus|on-site|in person|away from home/.test(`${lower(r.location)} ${lower(r.description)}`);

  // Transport is a constraint the student told us about directly, and it binds whether or not
  // they ever shared a location. A residential in-person program is a stretch for a student with
  // no ride regardless of which state it is in — checking `place` first would have silently
  // dropped that, which is the case this branch exists for.
  if (residential && ctx.transport === 'constrained') {
    return { score: clamp01(0.35 * (1 - lesson)), reason: 'In person and away from home, which is hard to square with the transport limits you told us about. Listed as an optional stretch.', flag: 'stretch_travel' };
  }

  if (!ctx.place) {
    // No consent, no location, no claim. Saying "this might be far" without
    // knowing is worse than saying nothing.
    return { score: 0.6, reason: null, flag: r.states?.length ? 'location_restricted' : null };
  }
  const band = proximity(ctx.place, r.states);
  const label = proximityLabel(band, ctx.place);
  if (band === 'home') {
    return { score: 1, reason: `${label} — matched to you because you told us where you are, and this one is open to students in your state.`, flag: 'local' };
  }
  if (band === 'region') {
    return { score: 0.8, reason: `${label} — close enough to be realistic, though you would need to work out the travel.`, flag: 'regional' };
  }
  if (band === 'far') {
    return {
      score: clamp01(0.25 * (1 - lesson)),
      reason: `${label} — this one is restricted to ${(r.states || []).join(', ')}, so it is not open to you where you live.`,
      flag: 'out_of_state',
    };
  }
  // National, in person. Whether that is a bus or a plane depends on where it
  // physically happens, which most records do not say.
  return { score: clamp01(0.7 * (1 - lesson * 0.4)), reason: r.travel || null, flag: residential ? 'travel_required' : null };
}

/**
 * Hours, against hours they have. Also where overload risk lives: a student
 * with six things already open and three deadlines in the next eight weeks
 * should be shown fewer things and lighter ones, and told why.
 */
function scoreLoad(r, ctx) {
  const budget = TIME_BUDGET_BY_ID[ctx.timeBudget]?.hoursPerWeek ?? null;
  const heavy = /residential|full[- ]time|daily|intensive|\b(?:2[0-9]|[3-9][0-9])\s*hours?/.test(lower(`${r.timeCommitment} ${r.description}`));
  const light = /one[- ]day|weekend|a few hours|short|self[- ]paced|one[- ]off|\b[1-5]\s*hours?/.test(lower(`${r.timeCommitment} ${r.description}`));
  const lesson = ctx.feedback?.lessons?.time || 0;
  const pressure = ctx.roadmap?.soonDeadlines || 0;

  let s = 0.7;
  if (light) s = 0.95;
  if (heavy) s = budget != null && budget >= 12 ? 0.7 : 0.35;
  if (budget != null && budget <= 5 && heavy) s = 0.2;
  if (pressure >= 3 && heavy) s = Math.min(s, 0.25);
  s = clamp01(s * (1 - lesson * 0.4));

  const reason = heavy
    ? (budget != null && budget <= 5
      ? 'A heavy commitment, and you told us your time is limited — only worth it if something else comes off your plate.'
      : 'A substantial time commitment. Plan the term around it rather than adding it on top.')
    : light ? (r.timeCommitment ? `Light commitment: ${r.timeCommitment}` : 'A light commitment you can fit around what you already do.') : null;
  return { score: s, reason, flag: heavy ? 'heavy' : light ? 'light' : null };
}

const potentialScore = (v, fallback = 0.4) => (v == null ? fallback : v / 3);

function scoreLeadership(r, ctx) {
  const s = potentialScore(r.leadershipPotential);
  // Worth more to a student with no leadership on file: that is the gap it fills.
  const boosted = ctx.hasLeadership ? s : Math.min(1, s * 1.3);
  return {
    score: boosted,
    reason: r.leadershipPotential >= 2 && !ctx.hasLeadership
      ? 'You have no leadership role logged yet, and this is a real one rather than a title.'
      : r.leadershipPotential >= 3 ? 'You would end up running something, not just attending it.' : null,
    flag: null,
  };
}

function scoreImpact(r) {
  const s = potentialScore(r.impactPotential);
  return { score: s, reason: r.impactPotential >= 3 ? 'People outside you actually benefit from this — that is what makes service read as real.' : null, flag: null };
}

function scoreDistinction(r, ctx) {
  const s = potentialScore(r.distinctionPotential);
  // The prestige brake. An open-enrollment program that costs thousands
  // produces no distinction whatever its host's name is, and the model says so.
  if (r.tier === 'pay_to_play') {
    return { score: 0.05, reason: 'Open enrollment — anyone who pays attends, so it is not a selective credential however it is marketed.', flag: 'pay_to_play' };
  }
  return {
    score: s,
    reason: r.distinctionPotential >= 3 && ctx.collegeAmbition === 'high'
      ? 'Can produce a named, dated result — which is what your reach schools are reading for.'
      : null,
    flag: null,
  };
}

/**
 * How much this is worth to the application as a whole — which depends on what
 * the application is currently missing, not on the record in isolation.
 */
function scorePortfolio(r, ctx) {
  const role = r.portfolioRole || 'exploration';
  const counts = ctx.profile.activityTypeCounts || {};
  const total = ctx.activityCount || 0;

  let s = role === 'major' ? 0.85 : role === 'supporting' ? 0.65 : 0.45;
  // A student with nothing logged needs explorations more than they need a
  // flagship, and a student with eight activities needs depth more than a ninth.
  if (total === 0 && role === 'exploration') s = 0.8;
  if (total >= 7 && role === 'exploration') s = 0.25;
  if (total >= 7 && role === 'major') s = 0.55; // they do not need another anchor

  const gaps = [];
  if (!ctx.profile.researchCount && r.category === 'research') gaps.push('you have no research logged yet');
  if (!ctx.profile.clinicalHours && r.category === 'clinical') gaps.push('you have no clinical or shadowing hours logged yet');
  if (!ctx.serviceHours && (r.category === 'volunteering' || r.category === 'nonprofit')) gaps.push('you have no service hours logged yet');
  if (!ctx.hasLeadership && (r.category === 'leadership' || r.category === 'club')) gaps.push('you have no leadership role logged yet');
  if (!ctx.competitionCount && r.category === 'competition') gaps.push('you have never entered a competition');
  if (gaps.length) s = Math.min(1, s + 0.2);

  return {
    score: clamp01(s),
    reason: gaps.length
      ? `${gaps[0].charAt(0).toUpperCase()}${gaps.slice(0, 1)[0].slice(1)} — this is a real way to start.`
      : `${ROLE_BY_ID[role]?.label || 'Worth doing'}: ${ROLE_BY_ID[role]?.blurb || ''}`,
    flag: role,
  };
}

/**
 * Does the student already do this? A ninth club is worth less than a first lab,
 * and near-duplicate recommendations are the fastest way to make a matcher look
 * like it is not reading.
 */
function scoreRedundancy(r, ctx) {
  const name = lower(r.name);
  const org = lower(r.org);
  const words = name.split(/\W+/).filter((w) => w.length > 4);
  const inCommitments = (ctx.commitments || []).some((c) => (org && c.includes(org)) || words.some((w) => c.includes(w)));
  const inRoadmap = (ctx.roadmap?.titles || []).some((t) => (org && t.includes(org)) || words.some((w) => t.includes(w)));
  if (inCommitments) return { score: 0.15, reason: 'You already do something very close to this — worth going deeper in what you have rather than adding a parallel version.', flag: 'redundant' };
  if (inRoadmap) return { score: 0.3, reason: 'Already on your roadmap — this is a reminder, not a new idea.', flag: 'on_roadmap' };
  return { score: 1, reason: null, flag: null };
}

const SCORERS = {
  fit: scoreFit,
  direction: scoreDirection,
  timing: scoreTiming,
  readiness: scoreReadiness,
  access: scoreAccess,
  travel: scoreTravel,
  load: scoreLoad,
  leadership: scoreLeadership,
  impact: scoreImpact,
  distinction: scoreDistinction,
  portfolio: scorePortfolio,
  redundancy: scoreRedundancy,
};

/**
 * Score one record for one student.
 *
 * @returns {{ record, score, match, dimensions, reasons, flags, eligibility,
 *             dataState, status, suppression, blocked }}
 */
export function scoreOpportunity(record, ctx) {
  const r = normalizeRecord(record);
  const dimensions = {};
  const reasons = [];
  const flags = new Set();
  let weighted = 0;
  let total = 0;

  for (const [key, fn] of Object.entries(SCORERS)) {
    const out = fn(r, ctx) || { score: 0.5, reason: null, flag: null };
    const w = DIMENSION_WEIGHTS[key] || 1;
    dimensions[key] = { key, label: DIMENSION_LABELS[key], score: clamp01(out.score), weight: w, reason: out.reason || null };
    if (out.reason) reasons.push({ key, label: DIMENSION_LABELS[key], text: out.reason, weight: w * clamp01(out.score) });
    if (out.flag) flags.add(out.flag);
    weighted += clamp01(out.score) * w;
    total += w;
  }

  const eligibility = eligibilityFor(r, ctx);
  const suppression = suppressionFor(r, ctx.feedback, ctx.today);
  const dataState = dataStateFor(r, ctx.today);

  // Records we cannot describe are demoted, not hidden: a real program with a
  // thin entry is still a real program, and hiding it means a student never
  // learns it exists.
  const completenessFactor = 0.75 + 0.25 * (dataState.completenessScore ?? 1);
  // An unverified record is worth less than a verified one at equal fit — not
  // because it is likely to be wrong, but because acting on it costs the
  // student a verification step we did not do for them.
  const trustFactor = dataState.id === 'ai_discovered' ? 0.88 : dataState.id === 'stale' ? 0.92 : 1;
  const suppressionFactor = 1 - suppression.penalty * 0.85;

  const base = total ? weighted / total : 0;
  const score = clamp01(base * completenessFactor * trustFactor * suppressionFactor);

  if (suppression.reason) reasons.push({ key: 'feedback', label: 'Your own feedback', text: suppression.reason, weight: -1 });

  return {
    record: r,
    id: r.id,
    score,
    match: Math.round(score * 100),
    dimensions,
    reasons: reasons.sort((a, b) => b.weight - a.weight),
    flags: [...flags],
    eligibility,
    dataState,
    status: statusFor(r, ctx.today),
    suppression,
    blocked: eligibility.status === 'blocked',
  };
}

// ── How many to show ─────────────────────────────────────────────────────────

/**
 * The size of the list is itself a recommendation.
 *
 * A high-achieving junior with time, transport and a list full of reaches can
 * usefully hold a dozen live options in their head. A tenth-grader with two
 * spare hours a week, no ride, no money and three deadlines this month cannot,
 * and handing them twelve is not generosity — it is the thing that makes them
 * close the tab and do none of them.
 *
 * So capacity starts at a deliberately small base and is EARNED upward by
 * evidence of headroom, and reduced by every constraint the student actually
 * told us about.
 *
 * @returns {{ count, floor, ceiling, drivers: string[], posture }}
 */
export function capacityFor(ctx) {
  let count = 6;
  const drivers = [];

  // Headroom.
  const budget = TIME_BUDGET_BY_ID[ctx.timeBudget]?.hoursPerWeek ?? null;
  if (budget != null) {
    if (budget <= 2) { count -= 3; drivers.push('You told us your time is very limited, so this is a short list you can actually finish.'); }
    else if (budget <= 5) { count -= 2; drivers.push('You told us your time is limited, so we are showing fewer and lighter options.'); }
    else if (budget >= 15) { count += 3; drivers.push('You told us you have real time available, so there is more here to choose from.'); }
    else if (budget >= 10) { count += 1; }
  }

  // Ambition — the college list, not a guess about the student.
  if (ctx.collegeAmbition === 'high') { count += 2; drivers.push('Your list leans toward highly selective schools, so we are showing more, and harder, options.'); }
  else if (ctx.collegeAmbition === 'steady') { count -= 1; }

  // Readiness / momentum.
  if ((ctx.activityCount || 0) >= 6) { count += 1; }
  if ((ctx.activityCount || 0) === 0) { count -= 1; drivers.push('You have nothing logged yet, so we are starting you with a small number of accessible things rather than a catalog.'); }
  if ((ctx.profile?.researchCount || 0) + (ctx.competitionCount || 0) >= 3) count += 1;

  // Pressure.
  const soon = ctx.roadmap?.soonDeadlines || 0;
  if (soon >= 4) { count -= 3; drivers.push(`You already have ${soon} deadlines inside the next eight weeks — adding more right now would make all of them worse.`); }
  else if (soon >= 2) { count -= 1; drivers.push('You have deadlines coming up, so we have trimmed the list.'); }
  if ((ctx.roadmap?.openCount || 0) >= 12) { count -= 1; drivers.push('Your roadmap is already full.'); }

  // Constraints.
  if (ctx.costSensitivity === 'free_only') { count -= 1; drivers.push('You have told us cost is a hard constraint, so paid programs are mostly out and the list is shorter and free.'); }
  if (ctx.transport === 'constrained') { count -= 1; drivers.push('You told us getting places is hard, so we are favoring online and nearby options.'); }
  if (ctx.accessibilityNotes) { drivers.push('We have weighed the access needs you shared privately — say the word if something here does not work.'); }
  if (ctx.familyConstraints) { count -= 1; }

  // Feedback: a student who keeps declining is being shown too much.
  const declines = Object.values(ctx.feedback?.byRef || {}).filter((e) => e.weight > 0.5).length;
  if (declines >= 4) { count -= 1; drivers.push('You have passed on several suggestions, so we are being more selective about what we put in front of you.'); }

  const floor = 3;
  const ceiling = 14;
  const final = Math.max(floor, Math.min(ceiling, count));
  return {
    count: final,
    floor,
    ceiling,
    drivers,
    posture: final <= 4 ? 'focused' : final >= 10 ? 'expansive' : 'balanced',
  };
}

// ── The ranked list ──────────────────────────────────────────────────────────

/**
 * Rank a pool of records for one student.
 *
 * Returns FIVE buckets rather than one list, because they are five different
 * conversations and merging them is how a student ends up preparing for a
 * program they are not eligible for:
 *
 *   matches     — act on these now
 *   nextCycle   — closed this year, comes back, prepare
 *   stretch     — real, but distant/expensive/hard: optional, labeled as such
 *   blocked     — a gate they cannot clear, with what to do instead
 *   suppressed  — they already said no; kept for the "show what I passed on" view
 */
export function rankOpportunities({ records = [], ctx, capacity = null, categoryFilter = null, includeSuppressed = false } = {}) {
  if (!ctx) return { matches: [], nextCycle: [], stretch: [], blocked: [], suppressed: [], capacity: { count: 0, drivers: [] } };
  const cap = capacity || capacityFor(ctx);

  const scored = records
    .filter((r) => r && r.id)
    .filter((r) => !categoryFilter || categoryFilter === 'all' || r.category === categoryFilter)
    .map((r) => scoreOpportunity(r, ctx));

  const suppressed = [];
  const blocked = [];
  const nextCycle = [];
  const stretch = [];
  const active = [];

  for (const s of scored) {
    if (s.suppression.hide) { suppressed.push(s); continue; }
    if (s.blocked) { blocked.push(s); continue; }
    if (s.dataState.id === 'archived' || s.flags.includes('expired')) continue;
    if (s.dataState.id === 'upcoming_cycle' || s.flags.includes('next_cycle')) { nextCycle.push(s); continue; }
    // A stretch is a real opportunity we are not going to pretend is easy.
    const isStretch = s.flags.includes('stretch') || s.flags.includes('out_of_state')
      || s.flags.includes('stretch_travel') || s.flags.includes('expensive') || s.flags.includes('pay_to_play');
    if (isStretch) { stretch.push(s); continue; }
    active.push(s);
  }

  const byScore = (a, b) => b.score - a.score || String(a.record.name).localeCompare(String(b.record.name));
  active.sort(byScore); nextCycle.sort(byScore); stretch.sort(byScore); blocked.sort(byScore); suppressed.sort(byScore);

  return {
    matches: diversify(active, cap.count),
    // Deliberately smaller lists. These are context, not the main answer.
    nextCycle: diversify(nextCycle, Math.max(2, Math.round(cap.count / 3))),
    stretch: diversify(stretch, Math.max(1, Math.round(cap.count / 4))),
    blocked: blocked.slice(0, 4),
    suppressed: includeSuppressed ? suppressed.slice(0, 10) : [],
    capacity: cap,
    totalConsidered: scored.length,
  };
}

/**
 * At most two of any category in a bucket, so one strong interest signal cannot
 * return five near-identical research programs — the same rule
 * matchOpportunities() already applies over `type`, applied here over the
 * unified `category`.
 */
function diversify(list, count) {
  const picked = [];
  const used = new Map();
  const pool = [...list];
  while (picked.length < count && pool.length) {
    let idx = pool.findIndex((c) => (used.get(c.record.category) || 0) < 2);
    if (idx === -1) idx = 0;
    const chosen = pool.splice(idx, 1)[0];
    used.set(chosen.record.category, (used.get(chosen.record.category) || 0) + 1);
    picked.push(chosen);
  }
  return picked.map((p, i) => ({ ...p, rank: i + 1 }));
}

/**
 * Something else to offer when a student turns one down.
 *
 * Not simply "the next one on the list": the replacement is chosen to answer
 * the objection they actually raised. Too expensive → a free one in the same
 * category. Too far → an online or in-state one. Too difficult → an open-entry
 * one. That is the difference between a product that heard them and one that
 * shuffled.
 */
export function replacementFor(declined, actionId, ranked, ctx) {
  const pool = [...(ranked?.matches || []), ...(ranked?.stretch || []), ...(ranked?.nextCycle || [])]
    .filter((s) => s.id !== declined?.id);
  if (!pool.length) return null;

  const sameCategory = pool.filter((s) => s.record.category === declined?.record?.category);
  const from = sameCategory.length ? sameCategory : pool;

  const pick = (fn, why) => {
    const hit = from.find(fn) || pool.find(fn);
    return hit ? { ...hit, replacementReason: why } : null;
  };

  switch (actionId) {
    case 'too_expensive':
      return pick((s) => s.flags.includes('free'), 'Free, and in the same area as the one you passed on.');
    case 'too_far_away':
      return pick((s) => s.flags.includes('online') || s.flags.includes('local'),
        'Online or in your state, so distance is not the problem this time.');
    case 'too_difficult':
      return pick((s) => s.record.selectivity === 'open' || s.flags.includes('starter'),
        'Open entry — you can start this from exactly where you are.');
    case 'too_time_consuming':
      return pick((s) => s.flags.includes('light'), 'A lighter commitment that still counts for something.');
    case 'not_interested':
      return pick((s) => s.record.category !== declined?.record?.category, 'Something different — a change of direction rather than more of the same.');
    case 'no_longer_eligible':
      return pick((s) => s.eligibility.status === 'eligible', 'One you definitely clear the gates for.');
    default:
      return from[0] ? { ...from[0], replacementReason: 'The next best fit on your list.' } : null;
  }
}
