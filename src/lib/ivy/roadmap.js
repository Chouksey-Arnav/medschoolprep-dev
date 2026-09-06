// ─────────────────────────────────────────────────────────────────────────────
// Section 3 — the grade-by-grade roadmap generator, and Section 4's execution
// methods.
//
// ── PREMIUM ROADMAP ─────────────────────────────────────────────────────────
// Part of the Narrative Method Engine, planned as a paid tier. See PREMIUM in
// ./constants.js.
// ────────────────────────────────────────────────────────────────────────────
//
// Takes a grade level and everything the other modules found, and produces the
// specific dated plan for THIS student — not the grade's generic checklist.
//
// ── The two rules that make this different from a checklist ────────────────
//
//   • ITEMS ARE SUPPRESSED WHEN ALREADY DONE, and PROMOTED when a module found
//     the gap they close. A senior with no Tier 1 activity and a senior with
//     three do not get the same roadmap, and a product that gives them the same
//     one has not used anything it knows.
//   • A LATE STUDENT GETS A LATE PLAN. Every item carries `stillWorth`, and the
//     senior pipeline triages rather than pretending. The most common way a
//     roadmap fails is by being written for someone who started on time.
//
// ── The free-path rule ─────────────────────────────────────────────────────
// Where an item has an obvious paid version, the free path is the primary
// recommendation and the paid one is a footnote. Asserted by the verify script
// against the first-generation, low-income benchmark profile, because that is
// the student for whom a roadmap full of $4,000 summer programs is worse than
// no roadmap at all.
// ─────────────────────────────────────────────────────────────────────────────

import { GRADE_PLANS, SENIOR_PIPELINE } from '../../data/ivy/gradeTimelines.js';
import { IVY_PRODUCTIVE, BURNERS, HEALTH_FLOOR, FRICTION_RULES, STUDY_CYCLE } from '../../data/ivy/productivity.js';
import { seniorCalendar, sprintState } from './sprint.js';
import { microProjectSpec } from './domino.js';
import { clamp } from './constants.js';

/**
 * Builds the roadmap for a student.
 *
 * @param {Object} opts
 * @param {number} opts.grade        9 | 10 | 11 | 12
 * @param {Object} opts.findings     the engine's module outputs, used to
 *                                   promote and suppress items
 * @param {Object} [opts.completed]  { [itemId]: true }
 * @param {Date}   [opts.now]
 */
export function buildRoadmap({ grade = 12, findings = {}, completed = {}, now = new Date(), gradYear = null } = {}) {
  const g = Number(grade) || 12;

  if (g >= 12) {
    const calendar = seniorCalendar({ now, gradYear, completed });
    const sprint = sprintState({ now, completed });
    return {
      grade: 12, kind: 'senior',
      title: 'Senior year — the execution pipeline',
      premise: calendar.behind
        ? 'You are behind, which is the normal state of this month and not a reason to widen the plan. Below is what keeps its deadline and what gets cut.'
        : 'Everything from here is dated. The work is not deciding what to do; it is doing it before the date.',
      calendar, sprint,
      priorities: seniorPriorities(calendar, findings),
      execution: executionPlan(findings),
    };
  }

  const plan = GRADE_PLANS[g] || GRADE_PLANS[9];
  const items = plan.items.map(item => {
    const state = itemState(item, findings, completed);
    return { ...item, ...state };
  });

  // Promoted items come from module findings rather than from the grade plan —
  // this is where "you have no Tier 1 activity" turns into a dated task.
  const promoted = promotedItems(findings, g);

  return {
    grade: g, kind: 'underclass',
    title: `${['', '', '', '', '', '', '', '', '', 'Ninth', 'Tenth', 'Eleventh'][g] || `Grade ${g}`} grade — ${plan.title}`,
    premise: plan.premise,
    items: [...promoted, ...items].sort((a, b) => order(a) - order(b)),
    microProject: findings.portfolio?.counts?.tier1 === 0 && g <= 10
      ? microProjectSpec({ interest: findings.theme?.primary?.label || null, grade: g })
      : null,
    execution: executionPlan(findings),
  };
}

const WEIGHT_ORDER = { high: 0, medium: 1, low: 2 };
const order = (i) => (i.promoted ? -1 : 0) * 10 + (WEIGHT_ORDER[i.weight] ?? 1) + (i.done ? 10 : 0);

/** Whether the student has already satisfied a grade item, from the findings. */
function itemState(item, findings, completed) {
  if (completed[item.id]) return { done: true, state: 'done' };

  const satisfied = {
    'three-commitments': () => (findings.portfolio?.total ?? 0) >= 3 && (findings.portfolio?.total ?? 0) <= 5,
    'project-launch': () => (findings.domino?.viability ?? 0) >= 0.4,
    'six-week-challenge': () => (findings.domino?.viability ?? 0) >= 0.25,
    'profile-audit': () => !!findings.holistic,
    'formal-leadership': () => (findings.portfolio?.activities || []).some(a => a.isLeader),
    'external-award': () => (findings.portfolio?.counts?.tier1 ?? 0) + (findings.portfolio?.counts?.tier2 ?? 0) >= 1,
    'test-twice': () => (findings.academics?.sat ?? 0) > 0,
    'psat-diagnostic': () => (findings.academics?.sat ?? 0) > 0,
  }[item.id];

  const isDone = satisfied ? !!safe(satisfied) : false;
  return { done: isDone, state: isDone ? 'done' : 'open' };
}

const safe = (fn) => { try { return fn(); } catch { return false; } };

/**
 * Items the findings created, rather than the grade plan.
 * Each names the module that produced it, so the roadmap is traceable.
 */
function promotedItems(findings, grade) {
  const out = [];

  for (const t of findings.portfolio?.triggers || []) {
    if (t.id === 'critical-trajectory-gap') {
      out.push({
        id: 'promoted-tier1', promoted: true, weight: 'high', module: 'portfolio',
        label: 'Build the one activity that defines the file',
        detail: t.detail,
        metric: 'A project at Domino milestone M₃ — external validation — inside twelve months.',
        stillWorth: grade >= 11
          ? 'In eleventh or twelfth grade this will not reach Tier 1 before you apply, and it is still the right work: it makes the essays writable and it is what you will be doing next year anyway.'
          : undefined,
      });
    }
    if (t.id === 'portfolio-dilution') {
      out.push({
        id: 'promoted-consolidate', promoted: true, weight: 'medium', module: 'portfolio',
        label: 'Consolidate the school-level lines',
        detail: `${t.detail}${t.protectedFromConsolidation?.length ? ` Not these: ${t.protectedFromConsolidation.join(', ')} — paid work and family responsibility stay on the list.` : ''}`,
        metric: 'Six or fewer Tier 3 entries, with the hours moved into one of them.',
      });
    }
  }

  if (findings.coherence?.available && findings.coherence.band !== 'coherent' && findings.coherence.disconnects?.length) {
    const d = findings.coherence.disconnects[0];
    out.push({
      id: 'promoted-echo', promoted: true, weight: 'high', module: 'theme',
      label: `Close the ${d.label.toLowerCase()} disconnect`,
      detail: d.detail,
      metric: 'Every surface recognisably about the same thing.',
    });
  }

  if (findings.domino?.next && (findings.domino?.viability ?? 0) > 0) {
    out.push({
      id: `promoted-domino-${findings.domino.next.key}`, promoted: true, weight: 'high', module: 'domino',
      label: `Next domino: ${findings.domino.next.short}`,
      detail: findings.domino.next.note,
      metric: findings.domino.next.label,
    });
  }

  if (findings.satHeuristics?.next && grade >= 10) {
    out.push({
      id: 'promoted-sat', promoted: true, weight: 'medium', module: 'sat',
      label: `Drill: ${findings.satHeuristics.next.label}`,
      detail: findings.satHeuristics.next.why,
      metric: 'Twenty items, timed.',
      costNote: 'Free official practice material only. Paid courses mostly sell a schedule you can write yourself.',
    });
  }

  return out;
}

/** The senior month's three things, in the order they should be worked. */
function seniorPriorities(calendar, findings) {
  const out = [];
  if (calendar.triage) {
    out.push({
      id: 'triage', severity: 'high', label: 'Work the keep list, in date order',
      detail: calendar.triage.rule,
      items: calendar.triage.keep.slice(0, 4),
    });
  } else {
    const soon = [...calendar.overdue, ...calendar.imminent].slice(0, 4);
    if (soon.length) out.push({ id: 'due', severity: 'high', label: 'Due now', detail: 'These have dates on them.', items: soon.map(i => ({ id: i.id, label: i.label, due: i.due })) });
  }

  if (findings.coherence?.available && findings.coherence.band === 'scattered') {
    out.push({ id: 'theme', severity: 'high', label: 'Name the theme before writing another supplement', detail: 'Writing supplements without one means writing each essay twice — once now and once when you work out what they were supposed to be about.' });
  }
  if (findings.essays?.personalStatement?.stakes?.smoothCurve) {
    out.push({ id: 'stakes', severity: 'medium', label: 'Put a cost in the personal statement', detail: 'The single highest-value edit available on this draft, and it is one paragraph.' });
  }
  return out;
}

/**
 * Section 4 — the execution layer.
 *
 * Returns the Ivy Productive list and a Four Burner allocation for the week,
 * with the health floor enforced structurally rather than mentioned.
 */
export function executionPlan(findings = {}, { burnerFocus = null } = {}) {
  const requested = Array.isArray(burnerFocus) ? burnerFocus : [];
  // The floor: at most two burners high, and health may never be scheduled low.
  const high = requested.filter(b => b !== 'health').slice(0, HEALTH_FLOOR.maxHighBurners);
  const allocation = BURNERS.map(b => ({
    ...b,
    level: b.id === 'health'
      ? (high.length >= HEALTH_FLOOR.maxHighBurners ? HEALTH_FLOOR.minLevel : 'high')
      : high.includes(b.id) ? 'high' : 'medium',
    floored: b.id === 'health',
  }));

  return {
    method: IVY_PRODUCTIVE,
    burners: allocation,
    healthFloor: HEALTH_FLOOR,
    friction: FRICTION_RULES,
    studyCycle: STUDY_CYCLE,
    // The six tasks, seeded from what the engine actually found. A student who
    // opens this to an empty list writes six low-value tasks; one who opens it
    // to the engine's six edits them.
    suggestedSix: suggestSix(findings).slice(0, IVY_PRODUCTIVE.listSize),
  };
}

function suggestSix(findings) {
  const out = [];
  const push = (label, why, source) => out.push({ label, why, source });

  for (const t of findings.portfolio?.triggers || []) {
    if (t.severity === 'high') push(t.label, t.detail, 'portfolio');
  }
  if (findings.domino?.next) push(`Domino: ${findings.domino.next.short}`, findings.domino.next.note, 'domino');
  for (const f of findings.essays?.personalStatement?.storyboard?.findings || []) {
    if (f.severity === 'high') push(f.label, f.detail, 'storyboard');
  }
  for (const d of findings.coherence?.disconnects || []) push(`Fix: ${d.label}`, d.detail, 'theme');
  if (findings.commonApp?.activities?.findings?.length) {
    const f = findings.commonApp.activities.findings[0];
    push(f.label, f.detail, 'common-app');
  }
  if (findings.interview?.available && !findings.interview.meetsTarget) {
    push('One ninety-second story on your theme', findings.interview.headline, 'interview');
  }
  if (findings.satHeuristics?.next) push(findings.satHeuristics.next.label, findings.satHeuristics.next.why, 'sat');

  return out;
}

/**
 * The rolling task list. Uncompleted tasks move to the top of tomorrow, and a
 * task that has rolled three times is reported as mis-sized rather than as a
 * failure of discipline — which is almost always what it actually is.
 */
export function rollTasks(yesterday = [], { completedIds = [] } = {}) {
  const done = new Set(completedIds);
  const rolled = yesterday
    .filter(t => !done.has(t.id))
    .map(t => ({ ...t, rollCount: (t.rollCount || 0) + 1 }))
    .sort((a, b) => b.rollCount - a.rollCount || (a.rank ?? 99) - (b.rank ?? 99));

  return {
    tasks: rolled.map((t, i) => ({ ...t, rank: i + 1 })),
    stuck: rolled.filter(t => t.rollCount >= IVY_PRODUCTIVE.rollWarningAt)
      .map(t => ({ ...t, advice: IVY_PRODUCTIVE.rollWarning })),
    capacity: clamp(IVY_PRODUCTIVE.listSize - rolled.length, 0, IVY_PRODUCTIVE.listSize),
  };
}

export { SENIOR_PIPELINE, IVY_PRODUCTIVE, BURNERS };
