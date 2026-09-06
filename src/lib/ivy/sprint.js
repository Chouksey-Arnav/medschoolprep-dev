// ─────────────────────────────────────────────────────────────────────────────
// Module 8 — the 90-day sprint, and the senior monthly pipeline.
//
// ── PREMIUM ROADMAP ─────────────────────────────────────────────────────────
// Part of the Narrative Method Engine, planned as a paid tier. See PREMIUM in
// ./constants.js.
// ────────────────────────────────────────────────────────────────────────────
//
//     T_sprint(d) = f(day),  d ∈ [1, 90]
//
// Three phases of thirty days: foundation and theme, story banking, echo
// generation.
//
// ── The sprint is dated against the real calendar, not against day 1 ───────
// A ninety-day plan that starts "on day one" is a plan a student reads in
// August and cannot use. This module anchors the sprint to actual dates and
// computes where the student IS — including, and especially, when they are
// behind, which is the normal case and the one every planning product handles
// worst.
//
// ── The behind-schedule rule ───────────────────────────────────────────────
// When a student is behind, the module does NOT compress the remaining work
// into the remaining days and present it as achievable. It re-prioritises: the
// deadline-bearing items keep their dates, and everything else is explicitly
// marked as cut, with what cutting it costs. Telling a student on 20 October
// that they can still complete a ninety-day plan is the lie that makes them
// stop opening the app.
// ─────────────────────────────────────────────────────────────────────────────

import { SPRINT_DAYS, clamp } from './constants.js';
import { SPRINT_PHASES, SENIOR_PIPELINE } from '../../data/ivy/gradeTimelines.js';

const DAY = 86400000;

/** Default sprint start: 1 June of the summer before senior year. */
export function defaultSprintStart(now = new Date()) {
  const y = now.getFullYear();
  const june = new Date(y, 5, 1);
  // After December, the sprint that matters is next year's.
  return now > new Date(y, 11, 31) ? new Date(y + 1, 5, 1) : june;
}

/**
 * Where the student is in the sprint.
 *
 * @param {Object} opts
 * @param {Date|string} [opts.start]   sprint day 1
 * @param {Date|string} [opts.now]
 * @param {Object} [opts.completed]    { [itemId]: true }
 */
export function sprintState({ start = null, now = new Date(), completed = {} } = {}) {
  const startDate = start ? new Date(start) : defaultSprintStart(new Date(now));
  const today = new Date(now);
  const rawDay = Math.floor((today - startDate) / DAY) + 1;
  const day = clamp(rawDay, 1, SPRINT_DAYS);
  const beforeStart = rawDay < 1;
  const past = rawDay > SPRINT_DAYS;

  const phases = SPRINT_PHASES.map(p => {
    const state = rawDay < p.from ? 'ahead' : rawDay > p.to ? 'past' : 'current';
    return {
      ...p, state,
      startsOn: new Date(startDate.getTime() + (p.from - 1) * DAY),
      endsOn: new Date(startDate.getTime() + (p.to - 1) * DAY),
      daysRemaining: state === 'current' ? p.to - rawDay + 1 : null,
    };
  });

  const current = phases.find(p => p.state === 'current') || (past ? phases[phases.length - 1] : phases[0]);

  return {
    startDate, day, rawDay, beforeStart, past,
    daysRemaining: clamp(SPRINT_DAYS - rawDay, 0, SPRINT_DAYS),
    progress: round3(clamp(rawDay / SPRINT_DAYS, 0, 1)),
    phases, current,
    headline: beforeStart
      ? `The sprint starts ${fmt(startDate)} — ${Math.abs(rawDay) + 1} days from now. Everything before then is optional and everything after it is not.`
      : past
        ? 'The ninety days are gone. What follows is the calendar that is left, which is a different plan and a real one.'
        : `Day ${day} of ${SPRINT_DAYS} — ${current.title}, with ${current.daysRemaining} days left in this phase.`,
  };
}

/**
 * The senior calendar, dated, with each item placed on its real day and marked
 * done, due, or past.
 *
 * @param {Object} opts
 * @param {Date}   [opts.now]
 * @param {number} [opts.gradYear]     the June the student graduates
 * @param {Object} [opts.completed]
 */
export function seniorCalendar({ now = new Date(), gradYear = null, completed = {} } = {}) {
  const today = new Date(now);
  // The application year runs June → December of the year BEFORE graduation.
  const year = gradYear ? gradYear - 1 : (today.getMonth() >= 5 ? today.getFullYear() : today.getFullYear() - 1);

  const months = SENIOR_PIPELINE.map(block => {
    const items = block.items.map(item => {
      const due = new Date(year, block.month - 1, item.dueDay);
      const done = !!completed[item.id];
      const overdue = !done && today > due;
      const daysOut = Math.ceil((due - today) / DAY);
      return {
        ...item, due, done, overdue,
        daysOut,
        state: done ? 'done' : overdue ? 'overdue' : daysOut <= 14 ? 'imminent' : 'upcoming',
      };
    });
    const monthStart = new Date(year, block.month - 1, 1);
    const monthEnd = new Date(year, block.month, 0);
    return {
      ...block, items,
      year, monthStart, monthEnd,
      state: today > monthEnd ? 'past' : today < monthStart ? 'future' : 'current',
      done: items.filter(i => i.done).length,
      total: items.length,
    };
  });

  const overdue = months.flatMap(m => m.items.filter(i => i.overdue));
  const imminent = months.flatMap(m => m.items.filter(i => i.state === 'imminent'));
  const highWeightOverdue = overdue.filter(i => i.weight === 'high');

  // ── The behind-schedule triage ──────────────────────────────────────────
  const behind = highWeightOverdue.length >= 2;
  const triage = behind ? buildTriage(months, today) : null;

  return {
    year, months,
    current: months.find(m => m.state === 'current') || null,
    overdue, imminent,
    behind,
    triage,
    completion: round3(months.reduce((s, m) => s + m.done, 0) / Math.max(1, months.reduce((s, m) => s + m.total, 0))),
    headline: behind
      ? `${highWeightOverdue.length} high-weight items are past their date. That is recoverable and it is not recoverable by doing all of it — below is what keeps its deadline and what gets cut.`
      : overdue.length
        ? `${overdue.length} item${overdue.length === 1 ? '' : 's'} past date, none of them structural. Clear them this week.`
        : imminent.length
          ? `${imminent.length} item${imminent.length === 1 ? '' : 's'} due inside two weeks.`
          : 'On schedule.',
  };
}

/**
 * What to keep and what to drop when there is not enough time left.
 *
 * The keeps are the items with external deadlines — the ones where missing the
 * date means the option disappears. The cuts are everything whose cost is
 * quality rather than eligibility, and each one says what cutting it costs, so
 * the student is making the trade rather than having it made for them.
 */
function buildTriage(months, today) {
  const all = months.flatMap(m => m.items.map(i => ({ ...i, month: m.month })));
  const remaining = all.filter(i => !i.done);

  const DEADLINE_BEARING = new Set(['oct-fafsa', 'oct-ea', 'nov-scholarships', 'dec-rd', 'aug-recs', 'sep-resume']);
  const keep = remaining.filter(i => DEADLINE_BEARING.has(i.id) || (i.weight === 'high' && i.due >= today));
  const cut = remaining.filter(i => !keep.includes(i));

  return {
    keep: keep.sort((a, b) => a.due - b.due).map(i => ({
      id: i.id, label: i.label, due: i.due,
      why: DEADLINE_BEARING.has(i.id)
        ? 'Missing this date removes an option permanently. Nothing else on this page is in that category.'
        : 'Everything downstream depends on it.',
    })),
    cut: cut.map(i => ({
      id: i.id, label: i.label,
      cost: CUT_COST[i.id] || 'The draft will be less polished than it would have been. That is a real cost and it is smaller than a missed deadline.',
    })),
    rule: 'Work the keep list strictly in date order. Do not start anything on the cut list until the keep list is empty — the failure mode from here is spreading effort evenly across everything and finishing none of it.',
  };
}

const CUT_COST = {
  'jun-fit': 'Your list will be less well matched. Live with it: a list of ten decent fits submitted beats a list of eight perfect ones that misses November.',
  'jul-refdoc': 'The "why us" essays get harder and thinner. Do an abbreviated version — two courses and one professor per school — rather than skipping it entirely, because these essays are unwritable without it.',
  'jul-review': 'Fewer eyes on the draft. Get one reader instead of three.',
  'dec-interview': 'Interviews go in cold. Most are evaluative but not decisive; submitting on time is worth more.',
  'jun-email': 'Use your existing address and check it daily.',
  'aug-prompts': 'You will write some essays twice that could have been written once. Costs hours, not outcomes.',
};

const fmt = (d) => d.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
const round3 = (v) => Math.round(v * 1000) / 1000;
