// ─────────────────────────────────────────────────────────────────────────────
// Module 2 — the Domino framework and the project viability index.
//
// ── PREMIUM ROADMAP ─────────────────────────────────────────────────────────
// Part of the Narrative Method Engine, planned as a paid tier. See PREMIUM in
// ./constants.js.
// ────────────────────────────────────────────────────────────────────────────
//
//     V_project = Σ ωₘ · Mₘ        ω⃗ = [0.25, 0.15, 0.20, 0.20, 0.20]
//
// Five milestones, in the order they actually happen, because the order is the
// method:
//
//   M₁  Frustration → Question → Obsession. Is the thesis yours, or is it one
//       of fifteen shapes already in the corpus?
//   M₂  The beta drop. Did fifty real people show up for the smallest possible
//       version, before you built the big one?
//   M₃  Credibility bridges. Has anyone outside your building put their name
//       to it?
//   M₄  Academic connection. Does it point at the thing you say you want to
//       study?
//   M₅  Assetisation. Does it exist at a URL after you stop touching it?
//
// ── Why the milestones are continuous, not checkboxes ──────────────────────
// The specification defines each Mₘ as a state in [0,1], and this module keeps
// them continuous wherever the underlying evidence is continuous (M₁ and M₄ are
// similarities; M₂ is a count against a threshold). M₃ and M₅ are genuinely
// binary — a mentor agreement either exists or it does not — and are scored
// that way. Faking continuity on a binary would let a student sit at 0.6 on
// "has a mentor" forever, which is not a state that exists.
//
// ── The 50-person threshold is the load-bearing one ────────────────────────
// M₂ is deliberately the cheapest milestone to satisfy and the one most
// students skip. Fifty people is small enough to reach in a fortnight and large
// enough that nobody can reach it by asking friends — which is exactly why it
// predicts whether a project survives contact with an audience. A project that
// cannot find fifty people does not have an audience problem to solve later; it
// has one now, while it is still cheap.
// ─────────────────────────────────────────────────────────────────────────────

import { DOMINO_WEIGHTS, DOMINO_THRESHOLDS, clamp } from './constants.js';
import { vectorize, thematicSimilarity } from './text.js';
import { compareToCorpus } from './differentiation.js';
import { DEPARTMENT_VOCABULARY, resolveDepartment } from '../../data/ivy/tierCatalog.js';

export const MILESTONES = [
  {
    id: 'm1', key: 'M1', weight: DOMINO_WEIGHTS[0], label: 'Frustration → Question → Obsession',
    short: 'The thesis is yours',
    detail: 'Start from something that actually annoys you, turn it into a question nobody around you can answer, and follow it past the point where it stops being an assignment. Measured as distance from the fifteen project shapes we see repeatedly.',
    threshold: `Similarity to an existing archetype below ${DOMINO_THRESHOLDS.m1MaxSimilarity}`,
  },
  {
    id: 'm2', key: 'M2', weight: DOMINO_WEIGHTS[1], label: 'The beta drop',
    short: 'Fifty real people',
    detail: 'Ship the smallest version that a stranger could use — one workshop, one newsletter, one prototype — and see whether anyone comes. Do this before building anything expensive.',
    threshold: `${DOMINO_THRESHOLDS.m2Engagement} active units: attendees, subscribers, or members`,
  },
  {
    id: 'm3', key: 'M3', weight: DOMINO_WEIGHTS[2], label: 'Credibility bridges',
    short: 'Someone outside vouches',
    detail: 'A named mentor who has agreed in writing, an institutional partner, or press coverage. This is the milestone that converts a school activity into something a stranger can verify — and it is the one that moves tier.',
    threshold: 'A signed mentor agreement, a partner organization, or a media mention',
  },
  {
    id: 'm4', key: 'M4', weight: DOMINO_WEIGHTS[3], label: 'Academic connection',
    short: 'It points where you say you are going',
    detail: 'The project and the major should be legibly the same interest. Not identical — a nonprofit and a biology degree can be one theme — but a reader should not need it explained.',
    threshold: `Alignment with the department\'s own vocabulary at or above ${DOMINO_THRESHOLDS.m4AcademicSimilarity}`,
  },
  {
    id: 'm5', key: 'M5', weight: DOMINO_WEIGHTS[4], label: 'Brand assetisation',
    short: 'It exists without you in the room',
    detail: 'A live site on its own domain, a published handbook, a repository, an archive. The test is whether it is still there and still usable when you stop maintaining it for a month.',
    threshold: 'A live, hosted artifact at a stable address',
  },
];

/**
 * @typedef {Object} ProjectState
 * @property {string}  description        what the project is
 * @property {number}  [engagement]       active units reached (M₂)
 * @property {boolean} [hasMentorAgreement]
 * @property {boolean} [hasMediaMention]
 * @property {boolean} [hasPartner]
 * @property {string}  [intendedMajor]    for M₄
 * @property {boolean} [hasLiveSite]
 * @property {boolean} [hasPublishedArtifact]
 */

/**
 * THE VIABILITY INDEX.
 *
 * @param {ProjectState} project
 */
export function scoreDomino(project = {}) {
  const description = String(project.description || '').trim();
  const milestones = [];

  // ── M₁ ──────────────────────────────────────────────────────────────────
  if (description.split(/\s+/).filter(Boolean).length < 6) {
    milestones.push({
      ...MILESTONES[0], value: 0, evaluable: false,
      status: 'unknown',
      note: 'No project description yet, so novelty cannot be read. This is the first thing to write, and it is one sentence: "The problem is [X], and the people affected are [Y]."',
    });
  } else {
    const { top, similarity } = compareToCorpus(description);
    // Continuous: 1 − similarity, exactly the specification's M₁ definition.
    const value = clamp(1 - similarity, 0, 1);
    const passes = similarity < DOMINO_THRESHOLDS.m1MaxSimilarity;
    milestones.push({
      ...MILESTONES[0], value: round3(value), evaluable: true,
      status: passes ? 'met' : similarity < 0.6 ? 'partial' : 'failed',
      measured: { similarity: round3(similarity), nearest: top?.label || null },
      note: passes
        ? `The thesis does not collide with anything in the archetype corpus (nearest: ${top?.label || 'none'}, ${Math.round(similarity * 100)}%).`
        : `Reads close to ${top?.label?.toLowerCase() || 'an existing archetype'} (${Math.round(similarity * 100)}%). ${top?.redirect || ''}`,
    });
  }

  // ── M₂ ──────────────────────────────────────────────────────────────────
  const engagement = Number(project.engagement ?? project.participantsCount ?? NaN);
  if (!Number.isFinite(engagement)) {
    milestones.push({
      ...MILESTONES[1], value: 0, evaluable: false, status: 'unknown',
      note: `No audience number recorded. This is the cheapest milestone on the list — ${DOMINO_THRESHOLDS.m2Engagement} people is two weeks of asking — and skipping it is how projects get built for nobody.`,
    });
  } else {
    // Linear to the threshold, then a slow tail: the first fifty are the proof,
    // and the next five hundred are scale rather than validation.
    const t = DOMINO_THRESHOLDS.m2Engagement;
    const value = clamp(engagement / t, 0, 1);
    milestones.push({
      ...MILESTONES[1], value: round3(value), evaluable: true,
      status: engagement >= t ? 'met' : engagement >= t * 0.4 ? 'partial' : 'failed',
      measured: { engagement, threshold: t },
      note: engagement >= t
        ? `${engagement.toLocaleString()} people have actually turned up. The audience question is answered.`
        : `${engagement} of ${t}. You need ${t - engagement} more before building anything larger — not because ${t} is magic, but because the first fifty are the only ones who tell you whether this works.`,
    });
  }

  // ── M₃ ── genuinely binary ──────────────────────────────────────────────
  const bridged = !!(project.hasMentorAgreement || project.hasMediaMention || project.hasPartner);
  milestones.push({
    ...MILESTONES[2], value: bridged ? 1 : 0, evaluable: true,
    status: bridged ? 'met' : 'failed',
    measured: {
      mentor: !!project.hasMentorAgreement, media: !!project.hasMediaMention, partner: !!project.hasPartner,
    },
    note: bridged
      ? 'External validation is in place. This is what moves an activity out of "school club" in a reader\'s eye.'
      : 'Nobody outside your building has put their name to this yet. One email to one person — a teacher, a librarian, a local organization, a professor whose paper you read — is the entire task, and it is worth more than another month of building.',
  });

  // ── M₄ ──────────────────────────────────────────────────────────────────
  const dept = resolveDepartment(project.intendedMajor);
  if (!dept || !description) {
    milestones.push({
      ...MILESTONES[3], value: 0, evaluable: false, status: 'unknown',
      note: dept ? 'No project description to compare.' : 'No intended field recorded, so the connection cannot be read. It does not have to be your final answer — it has to be the one the application claims.',
    });
  } else {
    const sim = thematicSimilarity(vectorize(description), vectorize(DEPARTMENT_VOCABULARY[dept]));
    // Departmental vocabulary is technical and a student's project description
    // is not, so the raw lexical overlap runs low even for a genuinely aligned
    // project. Calibrated the same way and for the same reason as the
    // differentiation index — see its header.
    const value = clamp(sim / 0.30, 0, 1);
    const passes = value >= DOMINO_THRESHOLDS.m4AcademicSimilarity;
    milestones.push({
      ...MILESTONES[3], value: round3(value), evaluable: true,
      status: passes ? 'met' : value >= 0.4 ? 'partial' : 'failed',
      measured: { department: dept, similarity: round3(sim), calibrated: round3(value) },
      note: passes
        ? `The project and ${dept.replace(/-/g, ' ')} read as one interest.`
        : `The project and ${dept.replace(/-/g, ' ')} do not yet read as the same interest. Two fixes, and the second is usually the right one: change the project, or change how you describe it so the connection is on the page instead of in your head.`,
    });
  }

  // ── M₅ ── genuinely binary ──────────────────────────────────────────────
  const asset = !!(project.hasLiveSite || project.hasPublishedArtifact);
  milestones.push({
    ...MILESTONES[4], value: asset ? 1 : 0, evaluable: true,
    status: asset ? 'met' : 'failed',
    measured: { liveSite: !!project.hasLiveSite, artifact: !!project.hasPublishedArtifact },
    note: asset
      ? 'There is something at an address. It survives you graduating, which is the point.'
      : 'Nothing permanent exists yet. A domain is about $12 a year and a static site is free; a printed handbook or a public repository counts equally. Without this the project disappears the week you stop running it.',
  });

  // ── Composition ─────────────────────────────────────────────────────────
  const viability = milestones.reduce((s, m) => s + m.weight * m.value, 0);
  const evaluableWeight = milestones.filter(m => m.evaluable).reduce((s, m) => s + m.weight, 0);
  const failures = milestones.filter(m => m.status === 'failed');
  const unknowns = milestones.filter(m => !m.evaluable);

  // The next move is always the highest-weight unmet milestone that is also the
  // earliest in the sequence — because these are dominoes, and knocking over
  // number four before number two is how a project ends up with a website and
  // no users.
  const next = milestones.find(m => m.status !== 'met') || null;

  return {
    milestones,
    weights: DOMINO_WEIGHTS,
    viability: round3(viability),
    // What the number can be trusted to mean, given what is unrecorded.
    evaluableShare: round3(evaluableWeight),
    confidence: evaluableWeight >= 0.8 ? 'high' : evaluableWeight >= 0.5 ? 'moderate' : 'low',
    failures: failures.map(f => ({ key: f.key, label: f.label, note: f.note })),
    unknowns: unknowns.map(u => ({ key: u.key, label: u.label, note: u.note })),
    next: next ? { key: next.key, label: next.label, short: next.short, note: next.note, weight: next.weight } : null,
    stage: viability >= 0.8 ? 'tier-1-candidate'
      : viability >= 0.55 ? 'building'
      : viability >= 0.3 ? 'early'
      : 'not-started',
    stageNote: {
      'tier-1-candidate': 'Four or five dominoes down. This is a Tier 1 candidate, and what it needs now is documentation rather than more building.',
      building: 'The project is real and incomplete. Work the next milestone in the list rather than the most interesting one.',
      early: 'It exists. The gap is external — nobody outside has seen it or vouched for it, and both of those are emails rather than months.',
      'not-started': 'Nothing here yet. That is fine in ninth and tenth grade and it is the central problem in twelfth.',
    }[viability >= 0.8 ? 'tier-1-candidate' : viability >= 0.55 ? 'building' : viability >= 0.3 ? 'early' : 'not-started'],
  };
}

const round3 = (v) => Math.round(v * 1000) / 1000;

/**
 * The 6-week micro-project spec — the freshman/sophomore rehearsal for the
 * full framework, and the thing the engine hands a student who has no project
 * at all rather than telling them to "start a passion project".
 */
export function microProjectSpec({ interest = null, grade = 9 } = {}) {
  return {
    weeks: 6,
    grade,
    steps: [
      { week: 1, label: 'Write the problem statement', detail: 'One sentence: "The problem is [X], and the people affected are [Y]." If you cannot name Y specifically — not "students", but "the 40 sophomores at my school who take the bus" — you do not have a project yet.' },
      { week: 1, label: 'Find your angle', detail: `Something you have that most people working on this do not: a language, a place, an access, a skill${interest ? `, or ${interest}` : ''}.` },
      { week: 2, label: 'Secure one adult', detail: 'A teacher or a librarian who agrees to look at it every two weeks. Not a parent — the point is that someone outside the house has seen it.' },
      { week: 3, label: 'Ship the smallest version', detail: 'One workshop, one page, one prototype. It should be embarrassing. Shipping it is the milestone.' },
      { week: 4, label: 'Get it in front of ten people', detail: 'Ten, not fifty — this is the rehearsal. Write down what they said, verbatim.' },
      { week: 5, label: 'Change it based on what they said', detail: 'This is the week that separates a project from a plan.' },
      { week: 6, label: 'Write down what happened', detail: 'One page: what you tried, what broke, what you would do with six months. This page is what you show the mentor for the real project.' },
    ],
    cost: 'Zero. If it needs money in the first six weeks it is the wrong first project.',
  };
}
