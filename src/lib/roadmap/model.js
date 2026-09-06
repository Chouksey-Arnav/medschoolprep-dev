// ─────────────────────────────────────────────────────────────────────────────
// The roadmap document: its shape, its invariants, and every pure operation
// that reads or mutates one.
//
// Everything here is a pure function over a plain object. No React, no network,
// no theme — the UI renders what this produces, the generator repairs into this
// shape, the store persists it, and scripts/verifyRoadmap.mjs asserts on all of
// it under plain Node.
//
// ── The shape, and why it is seasons-then-items ─────────────────────────────
// A twelve-month roadmap could be modeled as a flat sorted list of dates. It is
// not, because a flat list of forty dated things is exactly what a student
// already has and cannot act on — it is a wall, and a wall does not tell you
// what this part of your life is FOR.
//
// So the document has two levels. Four seasons, each with a one-sentence thesis
// ("this autumn is about getting the hours, not the applications"), and items
// hanging off them. The seasons are what make it a strategy; the items are what
// make it actionable. The UI renders both and the student can collapse to either.
//
// ── The invariant that matters most ─────────────────────────────────────────
// EVERY ITEM'S DATE IS TRACEABLE. An item either carries a `catalogId`, in which
// case its dates came from the hand-checked catalog and can be shown as dates,
// or it does not, in which case it is a piece of advice with no date at all and
// is rendered inside a season rather than on the calendar. There is no third
// category, and in particular there is no "date the model produced". See
// assertTraceable() below, which the verify script runs against fixtures.
// ─────────────────────────────────────────────────────────────────────────────
import { dayKey, daysBetween, shiftDays } from '../timeline.js';
import { catalogEntry } from './catalog.js';
import { SLATE_RULES, TRACK_BY_ID, TRACK_IDS } from '../../data/roadmap/index.js';

export const ROADMAP_VERSION = 1;

/** Item lifecycle. 'skipped' is first-class: a student deciding not to do something is a decision the roadmap should keep, not an absence. */
export const ITEM_STATUSES = ['todo', 'doing', 'done', 'skipped'];
export const OPEN_STATUSES = new Set(['todo', 'doing']);

/** The four seasons a roadmap year is divided into, in order from the build date. */
export const SEASON_COUNT = 4;

// ── Status ───────────────────────────────────────────────────────────────────

/**
 * How urgent an open item is, today.
 *
 * `startBy` drives this, not the deadline, and that is the whole point of the
 * feature: a scholarship due in ten weeks that needs eight weeks of essays is
 * URGENT NOW, and every calendar in the world would render it as "in 70 days".
 */
export function itemUrgency(item, today = dayKey()) {
  if (!item || item.status === 'done' || item.status === 'skipped') return 'settled';
  const due = effectiveDue(item);
  if (!due) return 'undated';
  const daysToDue = daysBetween(today, due);
  if (daysToDue < 0) return 'missed';
  const start = item.startBy || due;
  const daysToStart = daysBetween(today, start);
  if (daysToDue <= 7) return 'critical';
  if (daysToStart <= 0) return 'start-now';
  if (daysToStart <= 21) return 'soon';
  return 'later';
}

export const URGENCY_ORDER = ['missed', 'critical', 'start-now', 'soon', 'later', 'undated', 'settled'];

/**
 * The date this item actually runs on: the student's own entered date if they
 * gave one, otherwise the catalog's.
 *
 * A student-entered date always wins, including over a 'fixed' catalog date.
 * They know their school's finals week and their hospital's intake date and we
 * do not, and a tool that argues with a student about a fact they looked up is
 * a tool they stop trusting.
 */
export function effectiveDue(item) {
  return item?.studentDate || item?.due || item?.on || item?.anchor || null;
}

/** True when this item is waiting on the student to supply a real local date. */
export function awaitingDate(item) {
  return !!item?.needsStudentDate && !item?.studentDate;
}

// ── Reading a roadmap ────────────────────────────────────────────────────────

export function allItems(roadmap) {
  return Array.isArray(roadmap?.items) ? roadmap.items : [];
}

export function itemsInSeason(roadmap, seasonId) {
  return allItems(roadmap).filter((i) => i.season === seasonId);
}

/** The season containing `date`, or the first one starting after it. */
export function seasonForDate(roadmap, date) {
  const seasons = roadmap?.seasons || [];
  return seasons.find((s) => date >= s.startDate && date <= s.endDate)
    || seasons.find((s) => s.startDate > date)
    || seasons[seasons.length - 1]
    || null;
}

export function currentSeason(roadmap, today = dayKey()) {
  return seasonForDate(roadmap, today);
}

/**
 * The handful of things that genuinely need attention this week, most urgent
 * first — what the Home card and the coach read.
 *
 * Deliberately capped small. A "what's next" list of fifteen items is a wall
 * with a friendlier heading on it.
 */
export function nextActions(roadmap, { limit = 5, today = dayKey() } = {}) {
  return allItems(roadmap)
    .filter((i) => OPEN_STATUSES.has(i.status))
    .map((i) => ({ item: i, urgency: itemUrgency(i, today) }))
    .filter(({ urgency }) => ['missed', 'critical', 'start-now', 'soon'].includes(urgency))
    .sort((a, b) => {
      const u = URGENCY_ORDER.indexOf(a.urgency) - URGENCY_ORDER.indexOf(b.urgency);
      if (u !== 0) return u;
      return String(effectiveDue(a.item) || '9999').localeCompare(String(effectiveDue(b.item) || '9999'));
    })
    .slice(0, limit)
    .map(({ item, urgency }) => ({ ...item, urgency }));
}

/** Completion and load statistics for the whole roadmap. */
export function roadmapStats(roadmap, today = dayKey()) {
  const items = allItems(roadmap);
  const done = items.filter((i) => i.status === 'done');
  const skipped = items.filter((i) => i.status === 'skipped');
  const open = items.filter((i) => OPEN_STATUSES.has(i.status));
  const counted = items.length - skipped.length;
  const urgencies = open.map((i) => itemUrgency(i, today));
  return {
    total: items.length,
    done: done.length,
    skipped: skipped.length,
    open: open.length,
    // Skipped items are excluded from the denominator: a student who decided
    // not to do three things has not failed at three things.
    pct: counted > 0 ? Math.round((done.length / counted) * 100) : 0,
    missed: urgencies.filter((u) => u === 'missed').length,
    startNow: urgencies.filter((u) => u === 'start-now' || u === 'critical').length,
    awaitingDate: open.filter(awaitingDate).length,
    byTrack: TRACK_IDS.reduce((acc, t) => {
      acc[t] = items.filter((i) => i.track === t).length;
      return acc;
    }, {}),
  };
}

/**
 * How busy each month of the roadmap is, in weighted units.
 *
 * This is what makes over-commitment visible BEFORE it happens. An item's load
 * is spread across its whole preparation window rather than dumped on its
 * deadline, because that is when the work actually happens — which is exactly
 * the insight a student staring at a calendar of due dates does not have.
 */
const EFFORT_UNITS = { light: 1, moderate: 2, heavy: 4, immersive: 6 };

export function monthlyLoad(roadmap) {
  const buckets = new Map();
  const bump = (month, amount) => buckets.set(month, (buckets.get(month) || 0) + amount);

  allItems(roadmap).forEach((item) => {
    if (item.status === 'skipped' || item.status === 'done') return;
    const due = effectiveDue(item);
    if (!due) return;
    const units = EFFORT_UNITS[item.effort] || 2;
    const start = item.startBy && item.startBy < due ? item.startBy : due;
    const span = Math.max(1, Math.ceil((daysBetween(start, due) + 1) / 30));
    // Spread evenly across the months the prep window touches.
    for (let m = 0; m < span; m += 1) {
      const d = shiftDays(start, m * 30);
      bump(d.slice(0, 7), units / span);
    }
  });

  return [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, load]) => ({ month, load: Math.round(load * 10) / 10 }));
}

/** The months whose load is more than half again the median — where the year will actually hurt. */
export function crunchMonths(roadmap) {
  const load = monthlyLoad(roadmap);
  if (load.length < 3) return [];
  const sorted = [...load].map((l) => l.load).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 1;
  return load.filter((l) => l.load > median * 1.5).map((l) => l.month);
}

// ── Invariants ───────────────────────────────────────────────────────────────

/**
 * Every dated item traces back to a real catalog entry. See this file's header.
 * Returns the list of violations, empty when clean.
 */
export function assertTraceable(roadmap) {
  return allItems(roadmap).flatMap((item) => {
    const dated = !!(item.due || item.on || item.anchor);
    if (!dated) return [];
    if (item.addedBy === 'student') return []; // their own date, their own item
    if (!item.catalogId) return [`"${item.title}" carries a date but no catalogId — the model invented it`];
    if (!catalogEntry(item.catalogId)) return [`"${item.title}" names catalog id "${item.catalogId}", which does not exist`];
    return [];
  });
}

/**
 * Slate-composition checks from SLATE_RULES. Returns { ok, problems, warnings }
 * — problems are things the generator must fix by re-running its repair pass,
 * warnings are things the UI tells the student about honestly rather than
 * hiding ("this year leans hard on long shots — here is why that is a choice").
 */
export function validateSlate(roadmap) {
  const items = allItems(roadmap).filter((i) => i.status !== 'skipped');
  const problems = [];
  const warnings = [];
  if (!items.length) return { ok: false, problems: ['The roadmap has no items at all.'], warnings };

  const dated = items.filter((i) => effectiveDue(i));
  const counts = {};
  dated.forEach((i) => { counts[i.track] = (counts[i.track] || 0) + 1; });
  Object.entries(counts).forEach(([track, n]) => {
    if (dated.length >= 8 && n / dated.length > SLATE_RULES.maxTrackShare) {
      warnings.push(`${Math.round((n / dated.length) * 100)}% of this year is ${TRACK_BY_ID[track]?.label || track} — a good year usually spreads wider.`);
    }
  });

  const achievable = items.filter((i) => ['open', 'selective'].includes(i.selectivity));
  if (achievable.length < SLATE_RULES.minAchievableCount) {
    problems.push(`Only ${achievable.length} item(s) here are things you can definitely do. A roadmap needs at least ${SLATE_RULES.minAchievableCount}.`);
  }

  const lotteries = items.filter((i) => i.selectivity === 'lottery');
  if (lotteries.length > SLATE_RULES.maxLotteryCount) {
    warnings.push(`${lotteries.length} of these are genuine long shots. Worth applying to — just make sure the year still works if all of them say no.`);
  }
  if (SLATE_RULES.requireFallbackForLottery) {
    lotteries.forEach((l) => {
      const hasFallback = items.some((i) => i.fallbackFor === l.id || (i.track === l.track && ['open', 'selective'].includes(i.selectivity)));
      if (!hasFallback) problems.push(`"${l.title}" is a long shot with nothing beside it — every reach needs a backup you can actually get.`);
    });
  }

  const crunch = crunchMonths(roadmap);
  if (crunch.length) {
    warnings.push(`${crunch.join(', ')} ${crunch.length > 1 ? 'are' : 'is'} noticeably heavier than the rest of your year — plan for that now rather than discovering it.`);
  }

  return { ok: problems.length === 0, problems, warnings };
}

// ── Mutations ────────────────────────────────────────────────────────────────
// All immutable: every one returns a new roadmap. The store diffs on `updatedAt`
// for conflict resolution (see api/roadmap.js), so a mutation that edited in
// place would be invisible to the sync layer.

const touch = (roadmap, patch) => ({ ...roadmap, ...patch, updatedAt: Date.now() });

function mapItem(roadmap, itemId, fn) {
  let found = false;
  const items = allItems(roadmap).map((i) => {
    if (i.id !== itemId) return i;
    found = true;
    return fn(i);
  });
  return found ? touch(roadmap, { items }) : roadmap;
}

/** Advance an item's status. Records `completedAt` so streaks and the parent digest can read it. */
export function setItemStatus(roadmap, itemId, status) {
  if (!ITEM_STATUSES.includes(status)) return roadmap;
  return mapItem(roadmap, itemId, (i) => ({
    ...i,
    status,
    completedAt: status === 'done' ? Date.now() : null,
  }));
}

/** Toggle between done and todo — what a checkbox does. */
export function toggleItemDone(roadmap, itemId) {
  const item = allItems(roadmap).find((i) => i.id === itemId);
  if (!item) return roadmap;
  return setItemStatus(roadmap, itemId, item.status === 'done' ? 'todo' : 'done');
}

/**
 * The student supplies the real local date for a 'varies' item.
 *
 * This is the single most valuable interaction in the tab. A regional science
 * fair, a hospital intake, a school's course-selection form — the roadmap knows
 * these exist and cannot know their date, and the moment the student looks one
 * up it stops being a season and becomes a deadline, with a real lead time
 * computed backwards from it.
 */
export function setItemDate(roadmap, itemId, date) {
  return mapItem(roadmap, itemId, (i) => ({
    ...i,
    studentDate: date || null,
    startBy: date ? shiftDays(date, -7 * (i.prepWeeks || 0)) : i.startBy,
  }));
}

/** Move an item to a different season — the student disagreeing with the sequencing. */
export function moveItemToSeason(roadmap, itemId, seasonId) {
  if (!(roadmap?.seasons || []).some((s) => s.id === seasonId)) return roadmap;
  return mapItem(roadmap, itemId, (i) => ({ ...i, season: seasonId, movedByStudent: true }));
}

/** A step inside an item, ticked off. Steps are how a big item stops being intimidating. */
export function toggleItemStep(roadmap, itemId, stepIndex) {
  return mapItem(roadmap, itemId, (i) => {
    const done = new Set(i.doneSteps || []);
    if (done.has(stepIndex)) done.delete(stepIndex); else done.add(stepIndex);
    return { ...i, doneSteps: [...done].sort((a, b) => a - b) };
  });
}

/**
 * The student adds something the catalog does not know about — a local award, a
 * program a teacher told them about, their own school's deadline.
 *
 * `addedBy: 'student'` is what exempts it from assertTraceable(): their date is
 * their own, and the app has no business second-guessing it.
 */
/**
 * Only http(s) URLs survive onto an item.
 *
 * Every catalog URL is hand-written and build-checked, so this exists for the other two ways a
 * URL can reach an item: one a student types, and one that arrives on a roadmap restored from a
 * revision or synced from another device. Both end up in an `<a href>` the student then clicks,
 * and `javascript:` in an href is script execution — a small self-XSS today, and a real one the
 * moment roadmaps are ever shareable. Cheaper to close now than to remember later.
 */
export function linkableUrl(url) {
  if (typeof url !== 'string' || !url) return null;
  try {
    const parsed = new URL(url, 'https://medschoolprep.cloud');
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

export function addStudentItem(roadmap, { title, track = 'application', date = null, note = '', url = null, season = null }) {
  const id = `student-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const resolvedSeason = season || seasonForDate(roadmap, date || dayKey())?.id || roadmap?.seasons?.[0]?.id || null;
  const item = {
    id,
    catalogId: null,
    addedBy: 'student',
    title: String(title || 'Untitled').slice(0, 140),
    org: null,
    track: TRACK_IDS.includes(track) ? track : 'application',
    season: resolvedSeason,
    due: date || null,
    on: null,
    anchor: date || null,
    startBy: date || null,
    studentDate: date || null,
    confidence: 'fixed',
    needsStudentDate: !date,
    why: String(note || 'You added this yourself.').slice(0, 400),
    steps: [],
    doneSteps: [],
    effort: 'moderate',
    selectivity: 'open',
    priority: 'important',
    status: 'todo',
    url: linkableUrl(url),
    prepWeeks: 0,
  };
  return touch(roadmap, { items: [...allItems(roadmap), item] });
}

/**
 * Accept a suggestion from outside the catalog, with the date the student went
 * and found themselves.
 *
 * ── Why the date is a required argument and not an optional one ──────────────
 * This is the seam where an un-dated suggestion becomes a dated commitment, and
 * it is the exact point at which an invented deadline would enter the system if
 * one ever could. It cannot: resolveSelection strips every date-shaped field
 * from a suggestion before it reaches a student (see the beyondCatalog block in
 * generator.js), so the only date available here is one a human typed. The item
 * that comes out is `addedBy: 'student'` for that reason — it is theirs, it is
 * exempt from catalog traceability, and it renders as an exact date because a
 * student who looked something up is right about it.
 *
 * A null date is allowed and produces an undated item the roadmap keeps asking
 * them to fill in — which is better than losing the suggestion because they
 * could not find the deadline in the moment.
 */
export function addSuggestionAsItem(roadmap, suggestion, date = null) {
  if (!suggestion?.name) return roadmap;
  const note = [
    suggestion.why,
    suggestion.whereToLook ? `Where to confirm the date: ${suggestion.whereToLook}` : null,
  ].filter(Boolean).join(' ');
  const next = addStudentItem(roadmap, {
    title: suggestion.org ? `${suggestion.name} (${suggestion.org})` : suggestion.name,
    track: suggestion.track || 'competition',
    date,
    note,
  });
  // Stamp the provenance onto the item that was just appended. Worth recording:
  // "Medabrain suggested this and you looked the date up" is a different kind of
  // item from "you typed this in from nowhere", and the roadmap should be able
  // to say which.
  const items = allItems(next);
  const added = items[items.length - 1];
  return touch(roadmap, {
    items: [...items.slice(0, -1), { ...added, fromSuggestion: true }],
  });
}

export function removeItem(roadmap, itemId) {
  return touch(roadmap, { items: allItems(roadmap).filter((i) => i.id !== itemId) });
}

// ── Staleness ────────────────────────────────────────────────────────────────

/**
 * A fingerprint of the inputs a roadmap was built from. When this changes, the
 * roadmap is describing a student who no longer exists — a junior who became a
 * senior, a college list that doubled, an intake answer they revised — and the
 * tab says so and offers a rebuild rather than quietly serving stale advice.
 */
export function roadmapFingerprint({ user, answers = {}, portfolio = null } = {}) {
  const parts = [
    user?.gradeStage || '',
    user?.specialty || user?.pathway || '',
    (answers.targetSchools || []).join('|'),
    (answers.yearTheme || []).join('|'),
    answers.weeklyHours || '',
    answers.selectivityStomach || '',
    answers.needsFinancialAid || '',
    String((portfolio?.colleges || []).length),
  ];
  return parts.join('~');
}

export function roadmapIsStale(roadmap, inputs) {
  if (!roadmap) return false;
  return !!roadmap.fingerprint && roadmap.fingerprint !== roadmapFingerprint(inputs);
}

/**
 * True when the roadmap has simply been overtaken by the calendar — the horizon
 * it was built for has largely elapsed. Separate from staleness because the
 * remedy is different: a stale roadmap needs rebuilding from new answers, an
 * expired one needs extending into the next year.
 */
export function roadmapIsExpired(roadmap, today = dayKey()) {
  if (!roadmap?.endDate) return false;
  return daysBetween(today, roadmap.endDate) < 60;
}

// ── Export ───────────────────────────────────────────────────────────────────

/**
 * Roadmap items → the event shape src/lib/icsExport.js takes, so a student can
 * put their whole year in the calendar they actually use.
 *
 * Only items with a real date are exported. An unconfirmed date sitting in
 * someone's real calendar with an alarm attached is the highest-stakes place
 * this app's honesty rules apply — it is the one context where nobody will ever
 * see our caveat in the UI — so unconfirmed items travel as
 * `confidence: 'typical'`, which buildIcs already renders as a TENTATIVE event
 * with "(typical)" in the summary and the confirm-it-yourself line in the body.
 * Reusing that path rather than hand-decorating the title here keeps the
 * treatment identical to the Portfolio timeline's export, which is the calendar
 * these events will sit next to.
 */
export function roadmapToCalendarEvents(roadmap) {
  return allItems(roadmap)
    .filter((i) => OPEN_STATUSES.has(i.status) && effectiveDue(i))
    .map((i) => {
      const confirmed = !!i.studentDate || i.confidence === 'fixed';
      return {
        id: `roadmap-${i.id}`,
        date: effectiveDue(i),
        title: i.title,
        detail: [i.why, i.url ? `Official page: ${i.url}` : null].filter(Boolean).join('\n\n'),
        why: i.howThisHelps || null,
        kind: i.track,
        confidence: confirmed ? 'confirmed' : 'typical',
        source: 'roadmap',
      };
    });
}

/**
 * A compact rendering for Medabrain's system prompts, so the coach argues from
 * the same year the student is looking at instead of re-deriving one.
 *
 * Mirrors summarizeTimelineForPrompt() in timeline.js, including its explicit
 * instruction about which dates may be stated flatly — the coach is the surface
 * most likely to repeat a date without its caveat.
 */
export function summarizeRoadmapForPrompt(roadmap, { limit = 8, today = dayKey() } = {}) {
  if (!roadmap?.items?.length) return null;
  const season = currentSeason(roadmap, today);
  const next = nextActions(roadmap, { limit, today });
  const stats = roadmapStats(roadmap, today);
  if (!next.length) return null;
  const lines = next.map((i) => {
    const due = effectiveDue(i);
    const d = daysBetween(today, due);
    const when = d < 0 ? `${Math.abs(d)}d OVERDUE` : d === 0 ? 'TODAY' : `in ${d}d`;
    const provenance = i.studentDate ? '[their own date]' : i.confidence === 'fixed' ? '[confirmed date]' : '[typical date, not confirmed]';
    return `- ${due} (${when}) ${i.title} — ${i.urgency} ${provenance}`;
  });
  return `THEIR 12-MONTH ROADMAP (built from a 13-question intake plus their whole Portfolio; ${stats.done}/${stats.total} done).
This season: ${season?.label || '—'} — ${season?.theme || ''}
Next up:
${lines.join('\n')}
Dates marked [typical date] are normal-year dates from our catalog, NOT confirmed — if you cite one, say so and tell them to check the official site. [confirmed date] and [their own date] can be stated flatly. Never invent a roadmap item that is not on this list, and never tell them to do something from a different class year.`;
}
