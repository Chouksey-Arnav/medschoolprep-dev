// Pure "is a weekly check-in or an academic-update nudge due" logic — in-app banners only, never
// an email or push (see AGENTS.md). Both are OFFERS: a student can dismiss/skip and the app must
// resume from where they left off rather than nagging, so every function here only ever answers
// "would it be worth asking now", never "you must answer this".
import { CHECKIN_CADENCE_DAYS, APPROX_QUARTER_STARTS, ACADEMIC_UPDATE_REMINDER_DAYS_BEFORE_QUARTER } from './benchmarks';

const DAY_MS = 86400000;

/** True when it's been >= CHECKIN_CADENCE_DAYS since the most recent checkins row. */
export function isCheckinDue(checkins = [], now = new Date()) {
  if (!checkins.length) return true;
  const latest = [...checkins].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))[0];
  const last = new Date(latest.created_at);
  if (Number.isNaN(last.getTime())) return true;
  return (now - last) / DAY_MS >= CHECKIN_CADENCE_DAYS;
}

/** ISO-ish week key used to label a check-in ("2026-W36"). */
export function currentWeekKey(now = new Date()) {
  const onejan = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil(((now - onejan) / DAY_MS + onejan.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * Whether today falls within the "worth nudging about grades/workload" window near an
 * approximate US grading-quarter boundary. Deliberately approximate (the app has no way to know a
 * specific school's real calendar) and always optional in the UI — never a requirement.
 */
export function isNearQuarterBoundary(now = new Date(), windowDays = ACADEMIC_UPDATE_REMINDER_DAYS_BEFORE_QUARTER) {
  return APPROX_QUARTER_STARTS.some(({ month, day }) => {
    const boundary = new Date(now.getFullYear(), month - 1, day);
    const diffDays = (boundary - now) / DAY_MS;
    return diffDays >= 0 && diffDays <= windowDays;
  });
}

/** Has the student updated GPA/workload recently enough that a quarter nudge isn't needed? */
export function isAcademicUpdateDue(schoolContext, gpaEntries = [], now = new Date()) {
  if (!isNearQuarterBoundary(now)) return false;
  const lastTouched = schoolContext?.updated_at || null;
  const lastGpa = [...gpaEntries].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))[0]?.created_at || null;
  const mostRecent = [lastTouched, lastGpa].filter(Boolean).sort().pop();
  if (!mostRecent) return true;
  return (now - new Date(mostRecent)) / DAY_MS >= 21; // hasn't touched either in 3 weeks
}
