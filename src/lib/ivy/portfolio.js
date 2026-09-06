// ─────────────────────────────────────────────────────────────────────────────
// Module 3 — activity tiering and the Portfolio Balance Score.
//
// ── PREMIUM ROADMAP ─────────────────────────────────────────────────────────
// Part of the Narrative Method Engine, planned as a paid tier. See PREMIUM in
// ./constants.js.
// ────────────────────────────────────────────────────────────────────────────
//
//     B_portfolio = 1 − √( Σ βₖ (Nₖ − Tₖ)² )
//
// with T⃗ = [1, 3, 4] and β⃗ = [0.5, 0.3, 0.2].
//
// ── One correction to the literal formula, and why ─────────────────────────
// The specification defines Nₖ as "normalized to the total number of
// activities" — a share in [0,1] — and Tₖ as counts [1, 3, 4]. Subtracting a
// count from a share is dimensionally incoherent: with N⃗ summing to 1 and T⃗
// summing to 8, the residual can never be small, and the score is pinned near
// −2 for every student who ever uses it. A metric that returns the same wrong
// answer for everybody is not a metric.
//
// So the comparison is done in COUNT SPACE — Nₖ as actual counts against the
// target counts — which is the only reading under which the specification's own
// worked triggers (N₁ < 1, N₃ > 6) are expressible at all. Both the raw
// residual and the normalized shares are returned so anyone auditing this can
// see exactly what was compared. The deviation is scaled by the target's own
// magnitude so that "one short on Tier 1" and "one short on Tier 3" are not
// treated as equal errors, and the result is clamped into [0,1] so that the
// screen never shows a student a negative score for a portfolio that is
// merely lopsided.
//
// ── The claim a tier makes, and the claim it does not ──────────────────────
// Tier is a statement about how a LINE SCANS to a stranger reading 40,000
// files at speed. It is not a statement about worth, effort, or what the
// student should care about. Care work and paid work land in Tier 3 and are
// described here as the texture of a real life — never as filler, never as a
// consolidation candidate. That distinction is asserted by the verify script,
// because it is the one a scoring engine erodes first.
// ─────────────────────────────────────────────────────────────────────────────

import { PORTFOLIO_TRIGGERS, clamp } from './constants.js';
import { TIERS, TIER_TARGETS, TIER_PENALTIES, AWARD_CATALOG, TIER_HEURISTICS } from '../../data/ivy/tierCatalog.js';
import { competitionIndex } from './competition.js';

const FOUNDER_RE = /\b(founder|founded|co-?founder|started|launched|created|established)\b/i;
const LEADER_RE = /\b(president|captain|director|lead|leader|head|chair|editor|manager|coordinator|officer|executive)\b/i;
/** Roles that are unpaid life responsibility rather than an application line. */
const CARE_RE = /\b(sibling|siblings|household|caregiv|caring for|family (business|farm|store|restaurant)|babysit)\w*/i;
const JOB_RE = /\b(part[- ]time|job|employed|cashier|server|waiter|waitress|barista|retail|shift|paid work|wages)\b/i;

/** Normalises whichever activity shape the caller has into one the engine reads. */
export function normalizeActivity(raw = {}) {
  const name = raw.name || raw.title || '';
  const description = raw.description_draft || raw.description || raw.descriptionDraft || '';
  const role = raw.leadership_role || raw.leadershipRole || raw.role || '';
  const text = `${name} ${role} ${description}`.trim();
  return {
    id: raw.id || name,
    name, description, role, text,
    yearsInvolved: Number(raw.years_involved ?? raw.yearsInvolved ?? 0) || 0,
    hoursPerWeek: Number(raw.hours_per_week ?? raw.hoursPerWeek ?? 0) || 0,
    participantsCount: Number(raw.participants_count ?? raw.participantsCount ?? 0) || 0,
    winnersCount: Number(raw.winners_count ?? raw.winnersCount ?? 0) || 0,
    scale: String(raw.scale || 'local').toLowerCase(),
    isFounder: FOUNDER_RE.test(text),
    isLeader: LEADER_RE.test(text),
    isCare: CARE_RE.test(text),
    isPaidWork: JOB_RE.test(text),
  };
}

/**
 * Places one activity in a tier, and says why.
 *
 * Order of authority: a catalogued named distinction, then the heuristics, then
 * Tier 3. Defaulting to Tier 3 is the whole safety property of this function —
 * see the header of the tier catalog.
 */
export function classifyActivity(raw) {
  const a = normalizeActivity(raw);

  // ── Care work and paid work short-circuit the heuristics ────────────────
  // "Head of Household Operations" contains "head", and the leadership
  // heuristics would read four years of raising three siblings as a multi-year
  // captaincy and promote it to Tier 2. That is not generosity, it is a
  // category error: the tier describes how a LINE SCANS to a stranger, and a
  // stranger does not read household care as a state-level distinction no
  // matter how the role is titled. Getting it wrong in the flattering
  // direction is worse than getting it wrong at all, because the student then
  // builds a list around a tier that does not exist.
  //
  // These land in Tier 3, `protected`, with language that says plainly what
  // Tier 3 means and does not mean — and they are excluded by construction
  // from every consolidation suggestion the engine can make.
  if ((a.isCare || a.isPaidWork) && !AWARD_CATALOG.some(e => e.re.test(a.text) && e.tier <= 2)) {
    return {
      ...a, tier: 3, basis: 'protected', protected: true,
      because: a.isCare
        ? 'Family responsibility. Tier 3 describes how the line scans to a stranger reading forty thousand files — it says nothing about what this costs you or what it is worth. It belongs on the application, it belongs in the counselor letter, and for many readers it reframes the entire transcript.'
        : 'Paid work. Tier 3 by how the line scans, and read seriously by anyone who understands what twenty hours a week does to a GPA. Record the hours honestly; they are context nothing else in the file supplies.',
      promotion: null,
      competition: null,
    };
  }

  const award = AWARD_CATALOG.find(entry => entry.re.test(a.text));
  if (award) {
    return {
      ...a, tier: award.tier, basis: 'catalog', award: award.id,
      because: `${award.label || 'This distinction'} is a known ${award.scale} credential.`,
      competition: competitionIndex({ ...a, title: a.text }),
    };
  }

  for (const rule of TIER_HEURISTICS) {
    let fired = false;
    try { fired = rule.test(a); } catch { fired = false; }
    if (!fired) continue;
    return {
      ...a, tier: rule.tier, basis: 'heuristic', rule: rule.id,
      because: `Read as Tier ${rule.tier} because of ${rule.because}.`,
      promotion: rule.promotion || promotionFor(rule.tier, a),
      competition: a.winnersCount ? competitionIndex(a) : null,
    };
  }

  return {
    ...a, tier: 3, basis: 'default',
    because: a.isCare
      ? 'Family responsibility. It sits in Tier 3 because of how the LINE scans to a stranger, which has nothing to do with what it costs you — and it belongs on the application, in the counselor letter, and very likely in Additional Information.'
      : a.isPaidWork
        ? 'Paid work. Tier 3 by how the line scans, and read seriously by anyone who understands what twenty hours a week does to a transcript.'
        : 'Nothing in this entry has been externally validated yet, so it reads as school-level.',
    protected: a.isCare || a.isPaidWork,
    promotion: a.isCare || a.isPaidWork ? null : promotionFor(3, a),
    competition: a.winnersCount ? competitionIndex(a) : null,
  };
}

function promotionFor(tier, a) {
  if (tier === 3) {
    return a.isFounder
      ? 'One verifiable number moves this to Tier 2: members, dollars raised, attendees, or a partner organization that will confirm it.'
      : 'A role with an outcome attached, or one result judged by someone outside your school, moves this to Tier 2.';
  }
  if (tier === 2) {
    return 'Tier 1 needs recognition at national scale, published work, or reach you can document in the hundreds — not a bigger version of the same role.';
  }
  return null;
}

/**
 * THE BALANCE SCORE.
 *
 * @param {Array} activities  raw activities, in any of the accepted shapes
 */
export function scorePortfolio(activities = []) {
  const classified = (activities || []).map(classifyActivity);
  const counts = {
    tier1: classified.filter(a => a.tier === 1).length,
    tier2: classified.filter(a => a.tier === 2).length,
    tier3: classified.filter(a => a.tier === 3).length,
  };
  const N = [counts.tier1, counts.tier2, counts.tier3];
  const total = classified.length;

  // The residual, in count space, scaled by each target's own magnitude — see
  // the header. Both this and the raw share vector are returned.
  // Deviation is ASYMMETRIC, and deliberately so. Falling short of a target is
  // a gap; exceeding one is not the same kind of problem. Two Tier 1
  // activities is not twice as wrong as zero, and a symmetric residual says it
  // is. Surplus is discounted to a quarter weight — enough that the dilution
  // case (too many Tier 3 lines) still registers, not so much that a student
  // with two identity-defining activities is told their portfolio is broken.
  const SURPLUS_DISCOUNT = 0.25;
  const terms = N.map((n, k) => {
    const t = TIER_TARGETS[k];
    const dev = (n - t) / Math.max(1, t);
    const weight = TIER_PENALTIES[k] * (dev > 0 ? SURPLUS_DISCOUNT : 1);
    return { tier: k + 1, count: n, target: t, deviation: n - t, scaled: dev, weighted: weight * dev * dev };
  });
  const residual = Math.sqrt(terms.reduce((s, t) => s + t.weighted, 0));
  const balance = clamp(1 - residual, 0, 1);

  const shares = total ? N.map(n => n / total) : [0, 0, 0];

  // ── The two operational triggers from the specification ─────────────────
  const triggers = [];
  if (counts.tier1 < PORTFOLIO_TRIGGERS.criticalTrajectoryGapBelow) {
    triggers.push({
      id: 'critical-trajectory-gap', severity: 'high',
      label: 'No identity-defining activity',
      detail: total
        ? `You have ${total} activities and none of them yet reads as Tier 1. That is not a verdict on the work — it is a statement that nothing outside your school has confirmed any of it. The route is a passion project built on the Domino framework, and it is a twelve-to-eighteen-month build, not a summer one.`
        : 'No activities recorded yet, so there is nothing to place. Start with the three-commitment rule.',
      action: 'domino',
    });
  }
  if (counts.tier3 > PORTFOLIO_TRIGGERS.dilutionAbove) {
    const consolidatable = classified.filter(a => a.tier === 3 && !a.protected);
    triggers.push({
      id: 'portfolio-dilution', severity: consolidatable.length > PORTFOLIO_TRIGGERS.dilutionAbove ? 'medium' : 'low',
      label: `${counts.tier3} school-level lines`,
      detail: `Past about six, additional Tier 3 entries make the top of your list harder to see rather than making the list longer. Consolidate the club memberships and put the hours into going vertical on one of them.`,
      // Care work and paid jobs are excluded from the consolidation suggestion
      // by construction. Telling a student to drop caring for their siblings to
      // tidy an activities list would be the single worst thing this engine
      // could say, so it is not reachable.
      candidates: consolidatable.map(a => a.name),
      protectedFromConsolidation: classified.filter(a => a.protected).map(a => a.name),
      action: 'consolidate',
    });
  }
  if (counts.tier2 < TIERS[2].target && counts.tier1 >= 1) {
    triggers.push({
      id: 'unsupported-spike', severity: 'medium',
      label: 'A spike with thin support',
      detail: `One Tier 1 activity with ${counts.tier2} Tier 2 ${counts.tier2 === 1 ? 'entry' : 'entries'} behind it reads as a single event rather than as a trajectory. Three reinforcing activities are what make a reader believe the first one was not luck.`,
      action: 'reinforce',
    });
  }

  const shape = counts.tier1 >= 1 && counts.tier2 >= 3 ? 'spiky'
    : counts.tier1 >= 1 ? 'emerging'
    : counts.tier2 >= 3 ? 'broad-strong'
    : total >= 6 ? 'flat'
    : 'thin';

  return {
    activities: classified,
    counts, total,
    N, shares, targets: TIER_TARGETS, penalties: TIER_PENALTIES,
    terms,
    residual: Math.round(residual * 1000) / 1000,
    balance: Math.round(balance * 1000) / 1000,
    shape,
    shapeNote: {
      spiky: 'The shape selective readers are looking for: one thing that defines you, three that prove it was not an accident.',
      emerging: 'You have the top of the pyramid. What is missing is the middle — the reinforcing results that make a reader read the spike as a pattern.',
      'broad-strong': 'Strong across the middle with nothing on top. This is the most common shape among genuinely accomplished applicants and the most common one to be rejected with.',
      flat: 'Many activities, none of them yet distinguishable from the others. Depth beats coverage at every selectivity level, and the fix is subtractive before it is additive.',
      thin: 'Not enough recorded yet to read a shape. Log what you actually do first — most students under-record.',
    }[shape],
    triggers,
    // Ordering for the Common App list. Tier first, then years, then reach.
    ordering: [...classified].sort((a, b) =>
      a.tier - b.tier
      || b.yearsInvolved - a.yearsInvolved
      || b.participantsCount - a.participantsCount),
  };
}
