// ─────────────────────────────────────────────────────────────────────────────
// Pure derivations over a student's `service_logs` rows (self-reported service
// and volunteer hours — see supabase/migrations/0026_student_intelligence.sql).
// No fetching, no persistence, same spirit as weeklyGoals.js / academicIntel.js:
// hand it rows, get back numbers a component or a prompt can render directly.
//
// Nothing here is ever framed as verified — every function name and every
// returned label says "logged" or "reported", never "confirmed" or "verified".
// ─────────────────────────────────────────────────────────────────────────────
import { benchmarkById, FRAME_NOTE } from './benchmarks';

const hoursOf = (row) => Number(row?.hours) || 0;
const monthKey = (d) => String(d || '').slice(0, 7); // 'YYYY-MM'
const weekKey = (d) => {
  const date = new Date(`${String(d).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const onejan = new Date(date.getFullYear(), 0, 1);
  const week = Math.ceil(((date - onejan) / 86400000 + onejan.getDay() + 1) / 7);
  return `${date.getFullYear()}-W${String(week).padStart(2, '0')}`;
};

/** Total logged hours across every row. */
export const cumulativeHours = (rows = []) => rows.reduce((s, r) => s + hoursOf(r), 0);

/** { 'YYYY-MM': totalHours }, sorted chronologically. */
export function hoursByMonth(rows = []) {
  const map = {};
  for (const r of rows) {
    const k = monthKey(r.entry_date);
    if (!k) continue;
    map[k] = (map[k] || 0) + hoursOf(r);
  }
  return Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)));
}

/** { organization: totalHours }, sorted descending by hours. */
export function hoursByOrg(rows = []) {
  const map = {};
  for (const r of rows) {
    const k = (r.organization || 'Unspecified').trim();
    map[k] = (map[k] || 0) + hoursOf(r);
  }
  return Object.fromEntries(Object.entries(map).sort(([, a], [, b]) => b - a));
}

/** { causeArea: totalHours }, sorted descending, plus which one dominates (>50% of total). */
export function causeAreaConcentration(rows = []) {
  const total = cumulativeHours(rows);
  const map = {};
  for (const r of rows) {
    const k = (r.cause_area || 'Unspecified').trim();
    map[k] = (map[k] || 0) + hoursOf(r);
  }
  const byHours = Object.fromEntries(Object.entries(map).sort(([, a], [, b]) => b - a));
  const [topArea, topHours] = Object.entries(byHours)[0] || [null, 0];
  const topShare = total > 0 ? topHours / total : 0;
  return { byHours, topArea, topShare, concentrated: topShare >= 0.5, total };
}

/**
 * Consistency: how many distinct ISO weeks (since the first logged entry through today) had at
 * least one entry, as a ratio. A student who logs once a month for a year reads very differently
 * from one who logged forty hours in one August week — same total, different pattern — and this
 * is the number that tells them apart.
 */
export function consistency(rows = []) {
  const dated = rows.filter((r) => r.entry_date).map((r) => String(r.entry_date).slice(0, 10)).sort();
  if (!dated.length) return { activeWeeks: 0, totalWeeks: 0, ratio: 0 };
  const first = new Date(`${dated[0]}T00:00:00`);
  const now = new Date();
  const totalWeeks = Math.max(1, Math.ceil((now - first) / (7 * 86400000)));
  const activeWeeks = new Set(rows.map((r) => weekKey(r.entry_date)).filter(Boolean)).size;
  return { activeWeeks, totalWeeks, ratio: Math.min(1, activeWeeks / totalWeeks) };
}

/** { organization: { firstDate, lastDate, months, hours } } — how long each involvement has run. */
export function durationByOrg(rows = []) {
  const groups = {};
  for (const r of rows) {
    if (!r.entry_date) continue;
    const k = (r.organization || 'Unspecified').trim();
    (groups[k] ||= []).push(r);
  }
  const out = {};
  for (const [org, entries] of Object.entries(groups)) {
    const dates = entries.map((r) => String(r.entry_date).slice(0, 10)).sort();
    const first = dates[0];
    const last = dates[dates.length - 1];
    const months = Math.max(1, Math.round((new Date(last) - new Date(first)) / (30 * 86400000)) + 1);
    out[org] = { firstDate: first, lastDate: last, months, hours: entries.reduce((s, r) => s + hoursOf(r), 0) };
  }
  return out;
}

/**
 * Leadership progression from `activity_role_history` rows tied to service-type activities —
 * a simple timeline per activity: role, when it started/ended, and what came of it.
 * `rows` here are activity_role_history rows (not service_logs).
 */
export function leadershipProgression(roleRows = []) {
  const byActivity = {};
  for (const r of roleRows) {
    (byActivity[r.activity_id || 'unlinked'] ||= []).push(r);
  }
  return Object.fromEntries(
    Object.entries(byActivity).map(([activityId, entries]) => [
      activityId,
      [...entries].sort((a, b) => String(a.started_at || '').localeCompare(String(b.started_at || ''))),
    ]),
  );
}

/**
 * Projected pace toward a configurable long-term target.
 *
 * Uses the student's own average monthly rate over the logged history to project whether they
 * are on pace for `targetHours` by `targetDate` — never a countdown demanding a fixed weekly
 * number, just an honest "at your current rate, you'd land around X" readout.
 */
export function projectedPace(rows = [], { targetHours, targetDate } = {}) {
  const total = cumulativeHours(rows);
  const dated = rows.filter((r) => r.entry_date).map((r) => String(r.entry_date).slice(0, 10)).sort();
  if (!dated.length || !targetHours) {
    return { total, onPace: null, projectedTotal: total, monthlyRate: 0 };
  }
  const monthsElapsed = Math.max(1, Math.round((new Date() - new Date(dated[0])) / (30 * 86400000)));
  const monthlyRate = total / monthsElapsed;
  let monthsRemaining = null;
  if (targetDate) {
    monthsRemaining = Math.max(0, Math.round((new Date(targetDate) - new Date()) / (30 * 86400000)));
  }
  const projectedTotal = monthsRemaining != null ? total + monthlyRate * monthsRemaining : total;
  return {
    total, monthlyRate: Math.round(monthlyRate * 10) / 10,
    projectedTotal: Math.round(projectedTotal),
    onPace: monthsRemaining != null ? projectedTotal >= targetHours : null,
    monthsRemaining,
  };
}

/** One convenience bundle a component or prompt can render directly. */
export function serviceSummary(rows = [], { benchmarkId = 'top20_30', targetDate = null } = {}) {
  const benchmark = benchmarkById(benchmarkId);
  const targetHours = benchmark?.targetHours || benchmark?.targetHoursMin || 400;
  return {
    total: cumulativeHours(rows),
    byMonth: hoursByMonth(rows),
    byOrg: hoursByOrg(rows),
    causeConcentration: causeAreaConcentration(rows),
    consistency: consistency(rows),
    durationByOrg: durationByOrg(rows),
    pace: projectedPace(rows, { targetHours, targetDate }),
    benchmark,
    frameNote: FRAME_NOTE,
  };
}
