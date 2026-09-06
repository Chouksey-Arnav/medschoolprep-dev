// ─────────────────────────────────────────────────────────────────────────────
// Student-Intelligence context assembly for Medabrain.
//
// The rule this file exists to enforce: NEVER dump a student's whole history
// into a prompt. Every builder function in src/lib/studentProfile.js already
// draws on a specific SPECIALIST surface (coach / portfolio / prep / sat), and
// that surface choice IS the task-type signal — a student talking to the Prep
// specialist is tutoring, one talking to the Portfolio specialist is asking
// about opportunities/service/roadmap. This module reads that same signal
// (`taskType`) and returns only the slice of the student-intelligence tables
// (supabase/migrations/0026_student_intelligence.sql) that surface actually
// needs, pre-rendered as short prose blocks — the same "pre-render, don't hand
// over raw rows" convention timelineSummary/roadmapSummary/deepContext already
// follow elsewhere in this codebase.
//
// ── Corrections take precedence ──────────────────────────────────────────────
// `interest_history` and `reflections_log`/`checkins` are append-only-by-use
// logs: a student's most recent statement about something is read as the
// current truth, and older rows about the SAME thing are kept for history but
// are never allowed to contradict it in the summary a prompt sees. See
// `currentInterests()` below — it groups by category and keeps only the most
// recent row per category, exactly the "latest wins" rule buildPersonalBrief
// already uses for the free-text brief.
//
// ── What this block never claims ─────────────────────────────────────────────
// Every sentence here is provenance-honest: service hours are always "logged"
// or "self-reported," never "verified" (see the source check constraint on
// service_logs itself, which makes the opposite structurally impossible), and
// a student's own most recent correction is what gets stated as current.
// ─────────────────────────────────────────────────────────────────────────────
import { serviceSummary } from './serviceAnalytics';
import { activityCountGuidance, FRAME_NOTE } from './benchmarks';

const trunc = (s, n = 220) => (typeof s === 'string' && s.length > n ? `${s.slice(0, n)}…` : s);
const byRecent = (a, b, key) => String(b?.[key] || b?.created_at || '').localeCompare(String(a?.[key] || a?.created_at || ''));

/** Most recent interest_history row per category — "latest wins" for corrections. */
export function currentInterests(interestHistory = []) {
  const byCategory = {};
  for (const row of interestHistory) {
    const cat = row.category || 'other';
    const existing = byCategory[cat];
    if (!existing || String(row.occurred_at || row.created_at) > String(existing.occurred_at || existing.created_at)) {
      byCategory[cat] = row;
    }
  }
  return byCategory;
}

/** Which categories changed direction at least once — worth naming as a real signal, not noise. */
export function directionChanges(interestHistory = []) {
  const byCategory = {};
  for (const row of interestHistory) (byCategory[row.category || 'other'] ||= []).push(row);
  return Object.entries(byCategory)
    .filter(([, rows]) => rows.length > 1)
    .map(([category, rows]) => ({
      category,
      count: rows.length,
      from: [...rows].sort((a, b) => String(a.occurred_at).localeCompare(String(b.occurred_at)))[0]?.interest,
      to: [...rows].sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)))[0]?.interest,
    }));
}

/** Recommendation feedback items a coach must NOT keep re-suggesting. */
const SUPPRESS_STATUSES = new Set(['declined', 'not_interested', 'too_difficult', 'too_expensive', 'too_far_away', 'no_longer_eligible']);

function schoolContextLines(schoolContext) {
  if (!schoolContext) return [];
  const lines = [];
  const rigor = schoolContext.rigor_available || {};
  const rigorBits = Object.entries(rigor).filter(([, v]) => v).map(([k]) => k.toUpperCase());
  if (schoolContext.graduation_year) lines.push(`Graduating ${schoolContext.graduation_year}.`);
  if (schoolContext.school_type) lines.push(`School type: ${schoolContext.school_type}.`);
  if (rigorBits.length) lines.push(`Rigor options their school offers: ${rigorBits.join(', ')}.`);
  else if (Object.keys(rigor).length) lines.push(`Their school does not offer AP/IB/dual-enrollment — never fault them for a schedule that couldn't include courses their school doesn't have.`);
  if (schoolContext.current_courses?.length) lines.push(`Currently taking: ${schoolContext.current_courses.join(', ')}.`);
  if (schoolContext.workload_notes) lines.push(`In their own words about workload: "${trunc(schoolContext.workload_notes)}"`);
  return lines;
}

function constraintsLines(constraints) {
  if (!constraints) return [];
  const lines = [];
  if (constraints.time_availability) lines.push(`Time availability: ${trunc(constraints.time_availability, 140)}.`);
  if (constraints.transportation_limits) lines.push(`Transportation limits: ${trunc(constraints.transportation_limits, 140)}.`);
  if (constraints.cost_sensitivity) lines.push(`Cost sensitivity: ${trunc(constraints.cost_sensitivity, 140)}.`);
  if (constraints.accessibility_notes) lines.push(`Accessibility/family notes (never mention unprompted, only reason with them privately): ${trunc(constraints.accessibility_notes, 140)}.`);
  if (constraints.family_constraints) lines.push(`Family responsibilities: ${trunc(constraints.family_constraints, 140)}.`);
  return lines;
}

/**
 * Builds the compact "Student Intelligence" prose block.
 *
 * @param {object} intel - raw rows, all optional/empty-safe:
 *   { schoolContext, constraints, quickNotes, interestHistory, serviceLogs, competitions,
 *     reflectionsLog, checkins, recommendationFeedback, gradeLabel }
 * @param {'general'|'tutoring'|'opportunity'|'service'|'roadmap'} taskType
 */
export function buildStudentIntelBlock(intel = {}, taskType = 'general') {
  const {
    schoolContext = null, constraints = null, quickNotes = [], interestHistory = [],
    serviceLogs = [], competitions = [], reflectionsLog = [], checkins = [],
    recommendationFeedback = [], gradeLabel = null,
  } = intel || {};

  const sections = [];

  // Every task type gets the compact "who this is + what they told us most recently" core —
  // this is what makes the block feel like a coach who remembers, not a form dump.
  const interests = currentInterests(interestHistory);
  const interestLines = Object.values(interests)
    .filter((r) => r.status !== 'past')
    .map((r) => `${r.category || 'interest'}: "${r.interest}"${r.note ? ` (${trunc(r.note, 80)})` : ''}`);
  const changes = directionChanges(interestHistory);
  if (interestLines.length) sections.push(`Current stated interests (most recent statement per category — treat as superseding anything older): ${interestLines.join('; ')}.`);
  if (changes.length) sections.push(`Direction has shifted over time in ${changes.map((c) => `${c.category} (from "${c.from}" to "${c.to}")`).join(', ')} — a real, normal signal of exploration, never a inconsistency to point out unless they ask about it.`);

  const schoolLines = schoolContextLines(schoolContext);
  if (schoolLines.length) sections.push(`School context: ${schoolLines.join(' ')}`);

  const constraintLines = constraintsLines(constraints);
  if (constraintLines.length) sections.push(`Constraints they've shared (weigh these before recommending anything time-, cost-, or travel-heavy): ${constraintLines.join(' ')}`);

  // Most recent free-form capture / check-in / reflection — recency IS the precedence rule, so
  // only the last 2-3 are ever included regardless of how many exist in total.
  const recentNotes = [...quickNotes].sort((a, b) => byRecent(a, b, 'created_at')).slice(0, 3);
  if (recentNotes.length) {
    sections.push(`Most recent things they typed/dictated in their own words (newest first — this outranks older structured data if it conflicts): ${recentNotes.map((n) => `"${trunc(n.raw_text, 200)}"`).join(' || ')}`);
  }
  const recentCheckin = [...checkins].sort((a, b) => byRecent(a, b, 'created_at'))[0];
  if (recentCheckin) sections.push(`Their most recent weekly check-in: "${trunc(recentCheckin.raw_text, 220)}"`);
  const recentReflection = [...reflectionsLog].sort((a, b) => byRecent(a, b, 'entry_date'))[0];
  if (recentReflection) {
    const bits = [];
    if (recentReflection.motivation) bits.push(`motivation: ${trunc(recentReflection.motivation, 80)}`);
    if (recentReflection.confidence) bits.push(`confidence: ${trunc(recentReflection.confidence, 80)}`);
    if (recentReflection.stress) bits.push(`stress: ${trunc(recentReflection.stress, 80)}`);
    if (recentReflection.barriers) bits.push(`barriers: ${trunc(recentReflection.barriers, 80)}`);
    if (recentReflection.raw_text) bits.push(`in their words: "${trunc(recentReflection.raw_text, 160)}"`);
    if (bits.length) sections.push(`Their most recent self-reported reflection (voluntary — never treat as diagnosis, never bring up stress/barriers unprompted): ${bits.join('; ')}.`);
  }

  // ── Task-type-specific slices ──────────────────────────────────────────────
  if (taskType === 'service' || taskType === 'opportunity' || taskType === 'roadmap' || taskType === 'general') {
    if (serviceLogs.length) {
      const s = serviceSummary(serviceLogs);
      sections.push(
        `Self-reported service/volunteer hours (student-logged, never externally verified): ${Math.round(s.total)} total hour(s) across ${serviceLogs.length} entr${serviceLogs.length === 1 ? 'y' : 'ies'}. `
        + `${s.causeConcentration.topArea ? `Concentrated mostly in "${s.causeConcentration.topArea}" (${Math.round(s.causeConcentration.topShare * 100)}% of hours)${s.causeConcentration.concentrated ? ' — worth naming as a real specialization if they ask about their profile' : ''}.` : ''} `
        + `Consistency: active in ${s.consistency.activeWeeks} of the ~${s.consistency.totalWeeks} week(s) since their first logged entry. `
        + `${s.pace.monthlyRate ? `At their current pace (~${s.pace.monthlyRate}h/month), they'd project to roughly ${s.pace.projectedTotal} hours by application season versus the ${s.benchmark?.label || 'planning'} reference of ~${s.benchmark?.targetHours || s.benchmark?.targetHoursMin}+ hours — ${FRAME_NOTE}` : ''}`,
      );
    } else if (taskType === 'service') {
      sections.push(`No service/volunteer hours logged yet — if relevant, mention the service log (Opportunities tab) rather than assuming they have none in real life.`);
    }
  }

  if (taskType === 'opportunity' || taskType === 'roadmap' || taskType === 'general') {
    if (competitions.length) {
      sections.push(`Competitions/submissions logged: ${competitions.slice(0, 6).map((c) => `"${c.title}"${c.result ? ` (${c.result}${c.placement ? `, ${c.placement}` : ''})` : ''}`).join('; ')}${competitions.length > 6 ? `, +${competitions.length - 6} more` : ''}.`);
    }
    const suppressed = recommendationFeedback.filter((f) => SUPPRESS_STATUSES.has(f.status));
    if (suppressed.length) {
      sections.push(`Do NOT re-suggest these — the student already gave feedback: ${suppressed.slice(0, 10).map((f) => `"${f.item_label}" (${f.status.replace(/_/g, ' ')}${f.note ? `: ${trunc(f.note, 60)}` : ''})`).join('; ')}.`);
    }
    const needsHelp = recommendationFeedback.filter((f) => f.status === 'needs_help');
    if (needsHelp.length) sections.push(`They asked for help with: ${needsHelp.map((f) => `"${f.item_label}"`).join(', ')} — proactively offer concrete next steps on these.`);
    if (gradeLabel) {
      const guidance = activityCountGuidance(gradeLabel);
      if (guidance) sections.push(`Activity-count reference for ${guidance.label}: roughly ${guidance.min}-${guidance.max}${guidance.coreOnly ? ' core, sustained' : ''} commitments tends to work well — ${FRAME_NOTE}`);
    }
  }

  if (!sections.length) return '';
  return `\n\n── Student Intelligence (only what's relevant right now, not their full history) ──\n${sections.join('\n')}`;
}

/** Maps a Medabrain purpose (see api/groq.js's VALID_PURPOSES) to a studentIntel task type. */
export function taskTypeForPurpose(purpose) {
  if (purpose === 'prep' || purpose === 'sat' || purpose === 'essaycoach') return 'tutoring';
  if (purpose === 'portfolio' || purpose === 'roadmap' || purpose === 'plan' || purpose === 'masterplan') return 'roadmap';
  return 'general';
}
