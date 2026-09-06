// ─────────────────────────────────────────────────────────────────────────────
// Configurable planning benchmarks for the student-intelligence layer.
//
// These numbers used to have nowhere to live except scattered inline in
// whichever component needed them, which is exactly how a "roughly 400 hours"
// rule of thumb quietly turns into three different numbers in three different
// places. Everything a coach, a dashboard tile, or a Medabrain prompt needs in
// order to say "here's roughly where you'd want to be" reads from here — and
// ONLY from here — so tuning the number is a one-line change, not a grep.
//
// Every benchmark is framed as a flexible planning reference, never a quota.
// Nothing in the app should render one of these as a checkbox a student must
// tick — see FRAME_NOTE below, which every consumer is expected to surface
// alongside the number itself.
// ─────────────────────────────────────────────────────────────────────────────

export const FRAME_NOTE = 'A planning reference, not a requirement — real students get in with more or fewer hours than this, and depth and honesty always matter more than hitting a number.';

// ── Service-hour ambition tiers ──────────────────────────────────────────────
// Keyed by the same loose "ambition tier" language the app already uses
// elsewhere (see src/data/ivy/benchmarks.js for the analogous academic-tier
// catalog this mirrors in spirit).
export const SERVICE_HOUR_BENCHMARKS = [
  {
    id: 'top20_30',
    label: 'Top-20/Top-30 ambition',
    targetHours: 400,
    note: 'Roughly 400 cumulative hours by application season is a reasonable planning target for students aiming at schools in this range — spread across 2-4 years, not crammed into one summer.',
  },
  {
    id: 'top10_ivy',
    label: 'Top-10 / Ivy-caliber dream or reach ambition',
    targetHoursMin: 500,
    targetHoursMax: 600,
    note: 'Ivy-caliber reach programs are frequently associated with 500-600+ hours, but ONLY when the time is genuinely meaningful and feasible for this student — a lower-hour, higher-impact pathway (deep, sustained leadership in one or two causes) is a completely legitimate alternative and often reads stronger than a larger, thinner hour count.',
  },
];

/** Look up one benchmark tier by id. */
export const benchmarkById = (id) => SERVICE_HOUR_BENCHMARKS.find((b) => b.id === id) || null;

// ── Activity-count guidance by grade ─────────────────────────────────────────
// Presented everywhere as "students like you tend to run" language — never as
// "you must have N activities". `coreOnly` marks the grades where the guidance
// is specifically about depth (fewer, more sustained commitments) rather than
// breadth.
export const ACTIVITY_COUNT_DEFAULTS = {
  9: { min: 4, max: 5, label: 'Freshman year', guidance: 'A wider net makes sense now — 4-5 activities while you figure out what actually holds your interest.' },
  10: { min: 3, max: 4, label: 'Sophomore year', guidance: 'Narrowing down to 3-4 activities you actually want to keep is a healthy trend at this point.' },
  11: { min: 2, max: 3, label: 'Junior year', coreOnly: true, guidance: '2-3 core commitments, held with real depth and (where it fits) leadership, tend to read stronger than a long thin list.' },
  12: { min: 1, max: 2, label: 'Senior year', coreOnly: true, guidance: '1-2 sustained, high-signal commitments — the ones with the longest track record — are what a senior year list is for; this is about depth, not adding anything new.' },
};

/** Grade (9-12, or a string like "9th"/"Freshman") -> the activity-count guidance for it, or null. */
export function activityCountGuidance(grade) {
  const n = normalizeGrade(grade);
  return n != null ? ACTIVITY_COUNT_DEFAULTS[n] || null : null;
}

function normalizeGrade(grade) {
  if (grade == null) return null;
  if (typeof grade === 'number') return grade >= 9 && grade <= 12 ? grade : null;
  const s = String(grade).toLowerCase();
  if (/^\d+$/.test(s)) return normalizeGrade(Number(s));
  if (s.includes('fresh') || s.includes('9')) return 9;
  if (s.includes('soph') || s.includes('10')) return 10;
  if (s.includes('junior') || s.includes('11')) return 11;
  if (s.includes('senior') || s.includes('12')) return 12;
  return null;
}

// ── Weekly check-in / academic-update cadence ────────────────────────────────
// In-app only — nothing here ever triggers an email or push notification (see
// AGENTS.md / product constraints). These are read by
// src/lib/studentIntel/checkins.js to decide when a dashboard banner should
// offer, never demand, a check-in.
export const CHECKIN_CADENCE_DAYS = 7;
export const ACADEMIC_UPDATE_REMINDER_DAYS_BEFORE_QUARTER = 10;

// Rough US school quarter boundaries (month, day-of-month), used only to decide
// when an academic-update NUDGE is worth showing — never to assume a specific
// school's actual calendar, which the app has no way to know. Deliberately
// approximate and always phrased as optional in the UI copy.
export const APPROX_QUARTER_STARTS = [
  { month: 1, day: 1 },  // ~start of Q3/Q4 depending on school calendar
  { month: 3, day: 15 },
  { month: 6, day: 1 },  // end of year / start of summer
  { month: 8, day: 20 }, // ~start of a new school year
  { month: 10, day: 15 },
];
