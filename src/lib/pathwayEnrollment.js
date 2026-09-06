// ─────────────────────────────────────────────────────────────────────────────
// Parallel pathways — enrollment model
//
// The app used to hold exactly one pathway at a time: `user.specialty`. Picking
// a second one silently abandoned the first, which is not what students actually
// do. Somebody deciding between Nursing and PA wants to *run both*, compare them
// week to week, and only then commit — and the lesson data always supported that
// (progress is keyed by lesson id, and every lesson id is unique across all ten
// pathways), so the only thing standing in the way was that the profile could
// name a single one.
//
// So: `user.activePathways` is an ordered list of up to three enrolled pathway
// keys, and `user.specialty` keeps its exact old meaning — the one pathway
// currently in focus. Every existing reader of `user.specialty` (plan
// generation, opportunity matching, college scoring, Medabrain prompts, the
// Prep accent) keeps working untouched and simply follows the focused pathway.
//
// The invariants this module enforces, everywhere, so no call site has to:
//   · at most MAX_ACTIVE_PATHWAYS entries, no duplicates, no unknown keys
//   · the focused pathway is always a member of the list
//   · a profile that predates this feature (specialty only, no activePathways)
//     reads as a one-pathway enrollment rather than as an empty one
//
// Pure functions over plain objects — no React, no Dexie — so the whole model is
// verifiable by scripts/verifyParallelPathways.mjs without a browser.
// ─────────────────────────────────────────────────────────────────────────────

/** How many pathways a student may run at once. */
export const MAX_ACTIVE_PATHWAYS = 3;

/**
 * The enrolled pathway keys, in the student's own order.
 *
 * Order is the *enrollment* order, deliberately stable: it drives the switcher
 * rail left-to-right and the Alt+1/2/3 shortcuts, and a list that re-sorted
 * itself by "most recently used" would move the target out from under a student
 * mid-keystroke. Focusing a pathway never reorders anything.
 *
 * @param {object|null} user     the user profile
 * @param {object} paths         PATHS from data/constants (key → pathway)
 * @returns {string[]} valid, deduped, ≤ MAX_ACTIVE_PATHWAYS keys
 */
export function getActivePathways(user, paths = {}) {
  const known = (k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(paths, k);
  const out = [];
  const push = (k) => {
    if (known(k) && !out.includes(k) && out.length < MAX_ACTIVE_PATHWAYS) out.push(k);
  };
  const list = Array.isArray(user?.activePathways) ? user.activePathways : [];
  for (const k of list) push(k);
  // A profile written before parallel pathways existed carries only `specialty`.
  // It is an enrollment of one, not an empty list — otherwise every returning
  // student would open the app to "you have no pathways."
  push(user?.specialty);
  return out;
}

/**
 * The pathway currently in focus — what `user.specialty` means, now stated once.
 * Falls back to the first enrolled pathway when `specialty` is missing or points
 * at something no longer enrolled, and to null when nothing is enrolled at all.
 */
export function getFocusedPathway(user, paths = {}) {
  const active = getActivePathways(user, paths);
  if (!active.length) return null;
  const focused = user?.specialty;
  return active.includes(focused) ? focused : active[0];
}

/** Is this student already running this pathway? */
export function isEnrolled(user, key, paths = {}) {
  return getActivePathways(user, paths).includes(key);
}

/** Room for another one? */
export function canEnrollMore(user, paths = {}) {
  return getActivePathways(user, paths).length < MAX_ACTIVE_PATHWAYS;
}

/** Free slots remaining (0..MAX_ACTIVE_PATHWAYS). */
export function slotsRemaining(user, paths = {}) {
  return Math.max(0, MAX_ACTIVE_PATHWAYS - getActivePathways(user, paths).length);
}

/**
 * Add a pathway and focus it.
 *
 * Returns `{ user, status }` rather than throwing, because every caller is a
 * click handler that needs to say something specific back to the student:
 *   'enrolled' — added and focused
 *   'focused'  — already enrolled, so this was just a switch
 *   'full'     — three already running; the UI offers to swap one out
 *   'unknown'  — not a real pathway key (defensive; shouldn't reach the user)
 */
export function enrollPathway(user, key, paths = {}) {
  if (!user || !Object.prototype.hasOwnProperty.call(paths, key)) return { user, status: 'unknown' };
  const active = getActivePathways(user, paths);
  if (active.includes(key)) {
    return { user: { ...user, activePathways: active, specialty: key }, status: 'focused' };
  }
  if (active.length >= MAX_ACTIVE_PATHWAYS) {
    return { user: { ...user, activePathways: active }, status: 'full' };
  }
  return { user: { ...user, activePathways: [...active, key], specialty: key }, status: 'enrolled' };
}

/**
 * Focus an already-enrolled pathway. Enrolls first if there's room — clicking
 * "study this" on a pathway you aren't running should just work rather than
 * making you find a separate Add button.
 *
 * Returns the same `{ user, status }` shape as enrollPathway.
 */
export function focusPathway(user, key, paths = {}) {
  if (!user || !Object.prototype.hasOwnProperty.call(paths, key)) return { user, status: 'unknown' };
  const active = getActivePathways(user, paths);
  if (!active.includes(key)) return enrollPathway(user, key, paths);
  if (user.specialty === key) return { user: { ...user, activePathways: active }, status: 'unchanged' };
  return { user: { ...user, activePathways: active, specialty: key }, status: 'focused' };
}

/**
 * Stop running a pathway. Its lesson progress is untouched — dropping is about
 * what's on the student's plate this month, not about erasing four weeks of
 * work — so re-adding it later picks up exactly where it left off.
 *
 * Dropping the focused pathway moves focus to the neighbor that took its place
 * in the rail (the next one along, or the last one if it was the tail), which is
 * where the eye already is. Dropping the last pathway leaves `specialty` null,
 * the same "pick a pathway" state a brand-new account is in.
 */
export function dropPathway(user, key, paths = {}) {
  if (!user) return { user, status: 'unknown' };
  const active = getActivePathways(user, paths);
  const idx = active.indexOf(key);
  if (idx === -1) return { user, status: 'unchanged' };
  const next = active.filter((k) => k !== key);
  const focused = getFocusedPathway(user, paths);
  const nextFocus = focused === key ? (next[idx] || next[next.length - 1] || null) : focused;
  return { user: { ...user, activePathways: next, specialty: nextFocus }, status: 'dropped', focused: nextFocus };
}

/**
 * Swap `outKey` for `inKey` in one move, keeping the outgoing pathway's slot
 * position. This is what the "you're running three" dialog does — without it the
 * only way to try a fourth pathway is drop-then-add, which briefly leaves the
 * rail in a state the student didn't ask for and loses the ordering.
 */
export function swapPathway(user, outKey, inKey, paths = {}) {
  if (!user || !Object.prototype.hasOwnProperty.call(paths, inKey)) return { user, status: 'unknown' };
  const active = getActivePathways(user, paths);
  const idx = active.indexOf(outKey);
  if (idx === -1) return enrollPathway(user, inKey, paths);
  if (active.includes(inKey)) return focusPathway(user, inKey, paths);
  const next = [...active];
  next[idx] = inKey;
  return { user: { ...user, activePathways: next, specialty: inKey }, status: 'swapped' };
}

/**
 * Which pathway does a lesson belong to?
 *
 * Lesson ids are unique across every pathway (guarded by
 * scripts/verifyParallelPathways.mjs), which is what makes running several at
 * once safe: one lesson can never be two pathways' progress at the same time.
 * With parallel pathways a student can open a lesson belonging to a pathway
 * that isn't the focused one — straight from the parallel-progress panel — so
 * anything recorded *per pathway* on completion (unit mastery, the 25/50/75/100
 * milestone nudges, the completion badge) has to ask the lesson which pathway it
 * came from instead of assuming the focused one.
 *
 * ── The one exception, and why it is an omission rather than a value ────────
 * The foundations tier (course strategy and certifications — see
 * src/data/foundationUnits.js) is the same two units on all ten pathways,
 * sharing one id space so that finishing a lesson once finishes it everywhere.
 * Those lessons are deliberately LEFT OUT of this index rather than being given
 * an arbitrary owner.
 *
 * Handing them one would have been the quiet bug: the first pathway in PATHS
 * would have won, so a nursing student opening "Math sequencing" would see it
 * labeled "Exploring Pre-Health" in the wrong accent, and — much worse — the
 * unit verification written on completion would have been recorded against a
 * pathway they are not enrolled in. Absent from the index, every caller falls
 * through to the focused pathway, which is the correct answer for a lesson that
 * genuinely belongs to all of them: it is credited to the track the student is
 * actually working in, and fnd1 really is a unit of that track.
 *
 * @returns {Map<string,string>} lesson id → pathway key, for lessons owned by
 *          exactly one pathway. Shared lessons are absent; ask the caller's
 *          focused pathway instead.
 */
export function buildLessonPathwayIndex(paths = {}) {
  const seen = new Map();
  const shared = new Set();
  for (const [key, p] of Object.entries(paths)) {
    for (const unit of p?.units || []) {
      for (const lesson of unit?.lessons || []) {
        if (seen.has(lesson.id) && seen.get(lesson.id) !== key) shared.add(lesson.id);
        else seen.set(lesson.id, key);
      }
    }
  }
  for (const id of shared) seen.delete(id);
  return seen;
}

/** The lesson ids that appear on more than one pathway — the shared tier. Kept
 *  beside the index so a caller can tell "not indexed" from "not a lesson". */
export function sharedLessonIds(paths = {}) {
  const owners = new Map();
  for (const [key, p] of Object.entries(paths)) {
    for (const unit of p?.units || []) {
      for (const lesson of unit?.lessons || []) {
        if (!owners.has(lesson.id)) owners.set(lesson.id, new Set());
        owners.get(lesson.id).add(key);
      }
    }
  }
  return new Set([...owners.entries()].filter(([, keys]) => keys.size > 1).map(([id]) => id));
}

/** Every lesson in a pathway, flattened, in unit order. */
export function pathwayLessons(pathway) {
  return (pathway?.units || []).flatMap((u) => u.lessons || []);
}

/**
 * One pathway's live progress, in the shape every parallel surface needs: the
 * rail chip, the at-a-glance card, the switcher popover, and the ⌘K entries all
 * render from exactly this, so they can never disagree about how far along a
 * pathway is.
 *
 * @param {string} key                  pathway key
 * @param {object} paths                PATHS
 * @param {object} lessonProgress       lessonId → { verified, completedAt, studying, ... }
 * @param {(lesson, entry) => boolean} isComplete  the app's completion predicate
 */
export function pathwayProgress(key, paths = {}, lessonProgress = {}, isComplete = (l, e) => !!e?.verified) {
  const p = paths[key];
  const lessons = pathwayLessons(p);
  const total = lessons.length;
  let done = 0;
  let nextLesson = null;
  let nextUnit = null;
  let inProgress = null;
  for (const unit of p?.units || []) {
    for (const lesson of unit.lessons || []) {
      const entry = lessonProgress[lesson.id];
      if (isComplete(lesson, entry)) { done += 1; continue; }
      if (!nextLesson) { nextLesson = lesson; nextUnit = unit; }
      // A lesson left half-read outranks the sequentially-next one as the thing
      // to resume: "continue" should mean continue, not "start something else".
      if (!inProgress && entry?.studying) { inProgress = { lesson, unit }; }
    }
  }
  const resume = inProgress || (nextLesson ? { lesson: nextLesson, unit: nextUnit } : null);
  const completedAts = lessons
    .map((l) => lessonProgress[l.id]?.completedAt)
    .filter(Boolean)
    .sort((a, b) => a - b);
  return {
    key,
    label: p?.label || key,
    accent: p?.accent || null,
    total,
    done,
    pct: total > 0 ? Math.round((done / total) * 100) : 0,
    complete: total > 0 && done >= total,
    started: done > 0 || !!inProgress,
    resume,
    resumeIsContinue: !!inProgress,
    lastActivityAt: completedAts.length ? completedAts[completedAts.length - 1] : null,
    completedAts,
  };
}

/**
 * Every enrolled pathway's progress, in enrollment order.
 *
 * Deliberately NOT sorted focus-first, and not most-recently-used either. Slot
 * order is what the ⌥1/⌥2/⌥3 shortcuts address and what the rail prints beside
 * each chip, so a "helpful" re-sort would put ⌥2's label on ⌥1's pathway and
 * silently make every keyboard switch land on the wrong track. One order, used
 * by every surface — the rail, the board, the popover, the palette, the coach —
 * is also simply easier to learn: the second chip is always the second chip.
 * The focused one is flagged, not moved.
 */
export function activePathwayProgress(user, paths = {}, lessonProgress = {}, isComplete) {
  const focused = getFocusedPathway(user, paths);
  return getActivePathways(user, paths)
    .map((k) => ({ ...pathwayProgress(k, paths, lessonProgress, isComplete), focused: k === focused }));
}

/**
 * One line of plain English for the whole parallel enrollment — used in the
 * Home hero, the switcher's tooltip, and (verbatim) in the Medabrain system
 * prompt, so the coach knows a student is running three tracks and doesn't
 * keep answering as though there were only one.
 */
export function describeParallelPathways(rows = []) {
  if (!rows.length) return 'No pathway selected yet.';
  if (rows.length === 1) {
    const r = rows[0];
    return `Studying ${r.label} — ${r.done}/${r.total} lessons (${r.pct}%).`;
  }
  const parts = rows.map((r) => `${r.label} ${r.done}/${r.total}${r.focused ? ' (in focus)' : ''}`);
  return `Studying ${rows.length} pathways in parallel — ${parts.join(', ')}.`;
}
