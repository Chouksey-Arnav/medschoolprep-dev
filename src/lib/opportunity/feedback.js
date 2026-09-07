// ─────────────────────────────────────────────────────────────────────────────
// What the student told us about an opportunity, and what the ranker does about
// it next time.
//
// The table is `recommendation_feedback`
// (supabase/migrations/0026_student_intelligence.sql, widened in 0028): one row
// per action, with a timestamp, an optional reason, and a pointer back at what
// was recommended. Rows are never updated in place and never deleted by a
// student action — a decline that is later reversed is a NEW row saying so,
// because "I said no in October and yes in March" is a fact about a student and
// overwriting it loses it.
//
// ── Why suppression is a decay and not a ban ────────────────────────────────
// A blunt "never show this again" is wrong in both directions. A student who
// marked a program "too difficult" as a freshman is a different student as a
// junior; a student who said "too expensive" about a $4,000 program has told us
// something about MONEY, not about that program, and the useful response is to
// stop showing them expensive things generally.
//
// So every negative action produces two effects:
//   1. a per-item suppression that fades (see SUPPRESSION_HALF_LIFE_DAYS), and
//   2. a per-DIMENSION lesson that persists and generalizes — cost, distance,
//      difficulty, category, time — which is what actually stops the fourth
//      unaffordable summer program from appearing after the third was refused.
//
// ── Never silently re-surface something they refused ────────────────────────
// A suppressed item that decays back in is re-introduced as a *changed*
// recommendation, carrying `reintroduced: true` so the card can say "you passed
// on this last year — here is what is different now". Quietly showing it again
// as if the conversation never happened is how a product stops feeling like it
// is listening.
// ─────────────────────────────────────────────────────────────────────────────

const DAY = 86400000;

/**
 * Every action a student can take on an opportunity card.
 *
 * `intent` groups them for the ranker: 'positive' actions are engagement,
 * 'negative' ones suppress, 'neutral' ones record state without judgment.
 * `lesson` names the dimension a negative action generalizes to — null means
 * the action says something about this item only.
 */
export const OPPORTUNITY_ACTIONS = [
  { id: 'saved', label: 'Save', intent: 'positive', lesson: null, verb: 'saved', blurb: 'Keep it on your list.' },
  { id: 'applying', label: 'Apply now', intent: 'positive', lesson: null, verb: 'started applying to', blurb: 'You are going for it.' },
  { id: 'added_to_roadmap', label: 'Add to roadmap', intent: 'positive', lesson: null, verb: 'added to their roadmap', blurb: 'It becomes a dated item in your year.' },
  { id: 'preparing_next_cycle', label: 'Prepare for next cycle', intent: 'positive', lesson: null, verb: 'is preparing for the next cycle of', blurb: 'This cycle has closed — get ready for the next one.' },
  { id: 'monitoring', label: 'Monitor', intent: 'neutral', lesson: null, verb: 'is monitoring', blurb: 'Watch it and tell me when it opens.' },
  { id: 'completed', label: 'Mark complete', intent: 'positive', lesson: null, verb: 'completed', blurb: 'Done — log it in your portfolio.' },
  { id: 'paused', label: 'Pause', intent: 'neutral', lesson: null, verb: 'paused', blurb: 'Not now. Ask me again later.' },
  { id: 'declined', label: 'Decline', intent: 'negative', lesson: null, verb: 'declined', blurb: 'Not for you.' },
  { id: 'not_interested', label: 'Not interested', intent: 'negative', lesson: 'category', verb: 'is not interested in', blurb: 'The subject is not for you.' },
  { id: 'too_difficult', label: 'Too difficult', intent: 'negative', lesson: 'difficulty', verb: 'found this too difficult', blurb: 'Out of reach right now.' },
  { id: 'too_expensive', label: 'Too expensive', intent: 'negative', lesson: 'cost', verb: 'found this too expensive', blurb: 'Costs more than you can spend.' },
  { id: 'too_far_away', label: 'Too far away', intent: 'negative', lesson: 'distance', verb: 'found this too far away', blurb: 'You cannot realistically get there.' },
  { id: 'no_longer_eligible', label: 'No longer eligible', intent: 'negative', lesson: null, verb: 'is no longer eligible for', blurb: 'A gate you cannot clear.' },
  { id: 'too_time_consuming', label: 'Too much time', intent: 'negative', lesson: 'time', verb: 'found this too time-consuming', blurb: 'More hours than you have.' },
  { id: 'needs_help', label: 'Ask Medabrain', intent: 'neutral', lesson: null, verb: 'asked for help with', blurb: 'Get help deciding or applying.' },
  { id: 'feedback', label: 'Leave a note', intent: 'neutral', lesson: null, verb: 'left a note about', blurb: 'Tell us anything, in your own words.' },
];
export const ACTION_BY_ID = Object.fromEntries(OPPORTUNITY_ACTIONS.map((a) => [a.id, a]));

/**
 * The action ids the DATABASE accepts, mapped from the UI vocabulary.
 *
 * Migration 0026's check constraint predates this feature and allows a narrower
 * set; 0028 widens it. This map is what lets the UI keep the words a student
 * would recognize while the column keeps a stable, enumerable set — and it is
 * also the safety net if 0028 has not been applied to an environment yet, since
 * every value on the right-hand side is legal under 0026 too.
 */
export const ACTION_TO_STATUS = {
  saved: 'in_progress',
  applying: 'in_progress',
  added_to_roadmap: 'in_progress',
  preparing_next_cycle: 'in_progress',
  monitoring: 'in_progress',
  completed: 'completed',
  paused: 'paused',
  declined: 'declined',
  not_interested: 'not_interested',
  too_difficult: 'too_difficult',
  too_expensive: 'too_expensive',
  too_far_away: 'too_far_away',
  no_longer_eligible: 'no_longer_eligible',
  too_time_consuming: 'too_difficult',
  needs_help: 'needs_help',
  feedback: 'in_progress',
};

/** Statuses that mean "stop recommending this for now". Mirrors studentIntel/context.js. */
export const SUPPRESS_STATUSES = new Set([
  'declined', 'not_interested', 'too_difficult', 'too_expensive', 'too_far_away', 'no_longer_eligible',
]);
/** Statuses that mean the student is actively engaged — a reminder, not a recommendation. */
export const ENGAGED_STATUSES = new Set(['in_progress', 'completed', 'needs_help']);

/**
 * How long a negative signal keeps full weight.
 *
 * 240 days is chosen against the shape of a school year, not against a decay
 * curve: a refusal made in one academic year should still be honored through
 * that year, and should have loosened by the time the student is a grade older
 * and answering a different question.
 */
export const SUPPRESSION_HALF_LIFE_DAYS = 240;
/** Below this weight the suppression stops hiding an item and starts merely demoting it. */
export const REINTRODUCE_BELOW = 0.35;

const parseDate = (v) => {
  const d = new Date(String(v || ''));
  return Number.isNaN(d.getTime()) ? null : d;
};

/** A negative signal's current strength, 1 at the moment it was given, halving every half-life. */
export function suppressionWeight(row, today = new Date()) {
  const when = parseDate(row?.created_at) || parseDate(row?.updated_at);
  if (!when) return 1;
  const days = Math.max(0, (today - when) / DAY);
  return 2 ** (-days / SUPPRESSION_HALF_LIFE_DAYS);
}

/**
 * Every feedback row, folded into the two things the ranker actually consults:
 * a per-item verdict, and a set of generalized lessons.
 *
 * @returns {{
 *   byRef: Record<string, {status, action, weight, note, at, reintroduced, history[]}>,
 *   lessons: { cost, distance, difficulty, time, categories: Record<string, number> },
 *   engaged: Set<string>, helpWanted: string[], recent: [],
 * }}
 */
export function indexFeedback(rows = [], today = new Date()) {
  const byRef = {};
  const lessons = { cost: 0, distance: 0, difficulty: 0, time: 0, categories: {} };
  const engaged = new Set();
  const helpWanted = [];

  const sorted = [...(rows || [])].sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));

  for (const row of sorted) {
    const ref = refOf(row);
    if (!ref) continue;
    const status = String(row.status || '');
    const action = String(row.action || '') || statusToAction(status);
    const weight = suppressionWeight(row, today);
    const entry = byRef[ref] || (byRef[ref] = { status: null, action: null, weight: 0, note: null, at: null, reintroduced: false, history: [] });
    entry.history.push({ status, action, at: row.created_at || null, note: row.note || null });
    // Latest wins — the same "most recent statement is the current truth" rule
    // studentIntel/context.js applies to interests. A later "actually, yes"
    // genuinely does overturn an earlier decline.
    entry.status = status;
    entry.action = action;
    entry.note = row.note || entry.note;
    entry.at = row.created_at || entry.at;
    entry.weight = SUPPRESS_STATUSES.has(status) ? weight : 0;
    entry.reintroduced = SUPPRESS_STATUSES.has(status) && weight < REINTRODUCE_BELOW;

    if (ENGAGED_STATUSES.has(status)) engaged.add(ref);
    if (status === 'needs_help') helpWanted.push(row.item_label || ref);

    // The generalized lesson. Accumulated across rows and clamped at 1 so five
    // "too expensive" refusals do not push the ranker into hiding free things.
    const lesson = ACTION_BY_ID[action]?.lesson || lessonForStatus(status);
    if (lesson === 'cost') lessons.cost = Math.min(1, lessons.cost + weight * 0.5);
    else if (lesson === 'distance') lessons.distance = Math.min(1, lessons.distance + weight * 0.5);
    else if (lesson === 'difficulty') lessons.difficulty = Math.min(1, lessons.difficulty + weight * 0.5);
    else if (lesson === 'time') lessons.time = Math.min(1, lessons.time + weight * 0.5);
    else if (lesson === 'category' && row.item_category) {
      lessons.categories[row.item_category] = Math.min(1, (lessons.categories[row.item_category] || 0) + weight * 0.5);
    }
  }

  return {
    byRef,
    lessons,
    engaged,
    helpWanted,
    recent: sorted.slice(-12).reverse(),
  };
}

/** Statuses map back to an action id when a row predates the `action` column. */
function statusToAction(status) {
  const hit = OPPORTUNITY_ACTIONS.find((a) => ACTION_TO_STATUS[a.id] === status);
  return hit?.id || status;
}

/** The lesson a bare status implies, for rows written before `action` existed. */
function lessonForStatus(status) {
  if (status === 'too_expensive') return 'cost';
  if (status === 'too_far_away') return 'distance';
  if (status === 'too_difficult') return 'difficulty';
  if (status === 'not_interested') return 'category';
  return null;
}

/** The stable key a feedback row points at. `opportunity:<id>` is the convention. */
export function refOf(row) {
  const raw = String(row?.item_ref || '').trim();
  if (raw) return raw;
  const label = String(row?.item_label || '').trim();
  return label ? `label:${label.toLowerCase()}` : null;
}

/** The ref this module writes for a record. One place, so reads and writes cannot drift. */
export const refFor = (record) => (record?.id ? `opportunity:${record.id}` : null);

/**
 * The row to POST to `recommendation_feedback` for one action.
 *
 * Deliberately a pure function returning a plain object: the network call lives
 * in store.js, so this is unit-testable and so a verify script can assert the
 * shape without a database.
 */
export function feedbackRowFor(record, actionId, { note = '', category = null } = {}) {
  const action = ACTION_BY_ID[actionId];
  if (!record?.id || !action) return null;
  return {
    item_label: String(record.name || record.id).slice(0, 200),
    item_ref: refFor(record),
    status: ACTION_TO_STATUS[actionId] || 'in_progress',
    // `note` carries BOTH the machine-readable action and the student's own
    // words, because migration 0026's `status` vocabulary is narrower than the
    // UI's and an environment that has not run 0028 must still record which
    // button was actually pressed.
    note: [`action:${actionId}`, category ? `category:${category}` : null, String(note || '').trim().slice(0, 400)]
      .filter(Boolean).join(' | '),
    source: 'student_entered',
  };
}

/**
 * Read back the action id and the student's own words from a stored row.
 * The inverse of feedbackRowFor's `note` encoding.
 */
export function decodeFeedbackRow(row) {
  const note = String(row?.note || '');
  const action = note.match(/action:([a-z_]+)/)?.[1] || null;
  const category = note.match(/category:([a-z_]+)/)?.[1] || null;
  const comment = note.split('|').map((p) => p.trim()).filter((p) => p && !/^(?:action|category):/.test(p)).join(' ') || null;
  return { action: ACTION_BY_ID[action] ? action : null, category, comment };
}

/**
 * How much to demote a record because of what the student already said, and
 * why. Returns 0 for a record they have never touched.
 *
 * @returns {{ penalty, hide, reason, reintroduced }}
 *   penalty       0-1, multiplied into the score by the ranker
 *   hide          true while the signal is strong enough that showing it again
 *                 would read as not listening
 */
export function suppressionFor(record, index, today = new Date()) {
  const ref = refFor(record);
  const entry = ref ? index?.byRef?.[ref] : null;
  if (!entry || !SUPPRESS_STATUSES.has(entry.status)) {
    return { penalty: 0, hide: false, reason: null, reintroduced: false };
  }
  const w = suppressionWeight({ created_at: entry.at }, today);
  const label = ACTION_BY_ID[entry.action]?.label || entry.status.replace(/_/g, ' ');
  return {
    penalty: w,
    hide: w >= REINTRODUCE_BELOW,
    reason: `You marked this "${label}"${entry.at ? ` on ${String(entry.at).slice(0, 10)}` : ''}.`,
    reintroduced: w < REINTRODUCE_BELOW,
  };
}

/**
 * The plain-English lessons, for the "why am I seeing this list" disclosure and
 * for the Medabrain context block. Only lessons strong enough to be actually
 * changing the ranking are returned — a list of imperceptible adjustments would
 * be noise dressed as transparency.
 */
export function describeLessons(index) {
  const l = index?.lessons || {};
  const out = [];
  if (l.cost >= 0.3) out.push('You have passed on things because of cost, so paid programs are ranked lower and free ones higher.');
  if (l.distance >= 0.3) out.push('You have passed on things because of distance, so we are favoring local and online options.');
  if (l.difficulty >= 0.3) out.push('You have said things were too difficult, so we are leading with options you can start from where you are.');
  if (l.time >= 0.3) out.push('You have said things took too much time, so lighter commitments come first.');
  const cats = Object.entries(l.categories || {}).filter(([, v]) => v >= 0.3).map(([k]) => k);
  if (cats.length) out.push(`You said you were not interested in ${cats.join(', ')}, so those are ranked well down.`);
  return out;
}
