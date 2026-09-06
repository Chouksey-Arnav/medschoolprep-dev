// ─────────────────────────────────────────────────────────────────────────────
// Dexie.js — IndexedDB wrapper
// Replaces all localStorage with a proper async database.
// Supports: user profile, lessons, quiz scores, flashcards (FSRS state),
//           portfolio, achievements, study sessions, streak calendar.
// ─────────────────────────────────────────────────────────────────────────────
import Dexie from 'dexie';
import { localDateStr } from './dateUtils';
import { computeStreak, freezeCapFor, repairKey } from './streak';

const db = new Dexie('MedSchoolPrep');

// If another tab still holds an older-schema connection open, Dexie's
// version-upgrade transaction blocks indefinitely instead of erroring —
// surface it and release the stale connection so the app doesn't hang.
db.on('blocked', () => {
  console.warn('MedSchoolPrep DB upgrade blocked by another open tab');
});
// Fires when ANOTHER tab (a newer deploy, opened while this one was idle) is trying to upgrade
// the schema — Dexie requires every other connection to close first. Nothing in this codebase
// ever reopened the connection afterward, so every `db.<table>.*` call in THIS tab would throw
// DatabaseClosedError forever after this fired, with no visible error (most call sites just log
// and move on) — the tab would look alive but every read/write silently failed until the student
// happened to hit reload. This tab is also now running JS built against the OLD schema while the
// DB has moved on, so patching the connection back open isn't enough on its own — a reload is
// what actually gets this tab back to a working, matching state, same as any other stale-deploy
// recovery in this app.
db.on('versionchange', () => {
  db.close();
  console.warn('MedSchoolPrep DB schema changed in another tab — reloading to stay in sync.');
  window.location.reload();
});

db.version(1).stores({
  user:          '++id, name, specialty',
  lessons:       'lessonId, completedAt',
  quizScores:    'quizId, score, completedAt',
  flashCards:    '++id, deckName, front, back',
  portfolio:     '++id, name, type, hours, date',
  catPerf:       'category',
  achievements:  'key, unlockedAt',
  studyDays:     'date',
  cardReviews:   '++id, cardId, reviewedAt',
  mmiSessions:   '++id, questionIdx, answeredAt',
});

// v2: medical-school interview (MMI) module removed — app is scoped to
// SAT/ACT prep + college admissions for high school/undergrad students.
db.version(2).stores({
  mmiSessions: null,
});

// v3: GPA tracker for the Portfolio's academic-history section (superseded by
// the Supabase-backed gpa_entries resource in v4 — kept here only so the
// version-history chain stays valid for anyone who already ran v3).
db.version(3).stores({
  gpaEntries: '++id, term, gpa, addedAt',
});

// v4: Portfolio and GPA history moved to the Supabase-backed resources
// (activities, awards, gpa_entries via api/data/[resource].js) so activity
// tracking is one consistent system instead of a local-only duplicate.
db.version(4).stores({
  portfolio: null,
  gpaEntries: null,
});

// v5: Clinical/shadowing hours, LOR/committee-letter recommenders, and
// interview practice sessions (Standard/MMI/CASPer) — student-filled logs
// rather than official application records, so they stay local-only like
// quiz/flashcard data instead of requiring new Supabase tables/RLS policies.
db.version(5).stores({
  clinicalHours:     '++id, siteName, siteType, hours, entryDate',
  recommenders:      '++id, name, relationship, status, type',
  interviewSessions: '++id, mode, pathwayKey, completedAt',
});

// v6: Dopamine-loop gamification additions — earned streak-freeze tokens
// (loss-aversion safety net), the daily check-in cycle, and cosmetic-only
// chest unlocks.
db.version(6).stores({
  streakFreezes: '++id, earnedAt, usedOn',
  checkins:      'date, day',
  cosmetics:     'key, unlockedAt',
});

// v7: Per-deck creation timestamp for custom flashcard decks, so newly
// generated/created decks can be pinned to the top of the "All Decks" list
// (newest first) instead of trailing behind the built-in decks.
db.version(7).stores({
  deckMeta: 'name, createdAt',
});

// v8: `clinicalHours`/`recommenders` moved to the Supabase-backed resources (clinical_hours,
// recommenders via api/data/[resource].js) so Portfolio's credibility fields (verification
// status, evidence links) apply consistently everywhere instead of only on Supabase-backed
// panels. Unlike the v4 portfolio/gpaEntries move, we do NOT null out the old stores here —
// migrateLocalPortfolioLogs() in dataApi.js reads any existing rows out of them at runtime
// (once, gated by a migration flag) and clears them with a plain .clear() after a successful
// upload, which is safer than deleting the object store mid-version-upgrade.
// Also adds: `unitMastery` (quiz-verified pathway unit completions) and `studyEvents` (local-only
// engagement log — lesson video opens, quiz attempts, unit verifications — that powers the new
// Verified Progress view and is the seed schema for the future profiling plan in
// docs/PROFILING_PLAN.md; never transmitted anywhere).
db.version(8).stores({
  unitMastery: '++id, pathwayKey, unitId, verifiedAt',
  studyEvents: '++id, type, refId, ts',
});

// v9: per-pathway pacing goals — a student can optionally set a target number
// of weeks to finish their current pathway's 9 lessons, and the Verified
// Progress view shows an on-pace/behind-pace indicator computed from
// `unitMastery`/`lessons` timestamps against that target. Purely local
// accountability tooling, same as streaks/checkins; never transmitted.
db.version(9).stores({
  pathwayGoals: 'pathwayKey, startedAt, targetWeeks',
});

// v10: Medabrain multi-chat — conversations used to live only in a single
// in-memory `msgs` array (reset on every reload). Now every conversation is a
// row in `coachThreads` (title, timestamps) with its messages in
// `coachMessages`, so a student can keep several parallel chats (e.g. one for
// SAT Math, one for essay brainstorming) that persist across sessions.
db.version(10).stores({
  coachThreads:  '++id, updatedAt',
  coachMessages: '++id, threadId, ts',
});

// v11: the SAT tab. Note `satResponses` — unlike `quizScores`, which keeps only
// one best score per quiz and discards the answers, this records EVERY response
// with the choice made, whether it was right, and how long it took. Skill
// mastery, pacing analysis, the error log and the score projection are all
// impossible without per-response data, which is why this is a new store rather
// than an extension of the existing quiz tables.
//
//   satAttempts   one row per diagnostic / drill / timed set / full test
//   satResponses  one row per question answered, joined to an attempt
//   satSkillStats rolling per-skill cache so the heat map doesn't recompute
//                 over the whole response history on every render
//   satReviewLog  missed (or lucky-guess) questions, FSRS-scheduled for retry
//   satAiCache    AI-generated drill questions, persisted so a student doesn't
//                 lose generated content on reload and we don't re-spend quota
db.version(11).stores({
  satAttempts:   '++id, kind, section, status, startedAt',
  satResponses:  '++id, attemptId, questionId, skill, answeredAt',
  satSkillStats: 'skill',
  satReviewLog:  '++id, questionId, due, resolved',
  satAiCache:    'key, createdAt',
});

// v12: Pathway lesson notes + article highlights. Distinct from the existing E-Library
// `resourceNotes` (a flat string on the user profile, keyed by resource title) — these are
// per-lesson, structured enough for cross-device sync, and explicitly threaded into Meta Brain's
// context (buildPrepSystemPrompt) so the student can ask it about what they wrote down.
// `lessonHighlights` stores one row per highlighted passage (section index + character offsets
// into that section's article body) rather than raw HTML, so re-rendering the article with
// updated content later can't corrupt a saved highlight's position within a section.
db.version(12).stores({
  lessonNotes:      'lessonId, updatedAt',
  lessonHighlights: '++id, lessonId, createdAt',
});

// v13: `trackQueue` — the durable outbox behind every "Track" button (see src/lib/trackQueue.js).
// Tracking a school / scholarship / program used to be a bare `createItem()` POST: if the request
// failed (offline, flaky wifi, cold serverless function, expired session) the student got a red
// toast and the thing they chose to track simply never existed. The intent is now written HERE
// first, before any network call, so a failed track is a queued track rather than a lost one.
//
// Deliberately NOT part of buildSyncSnapshot(): a queue row is an unsent network intent, not
// progress. Syncing it to another device would let both devices flush the same intent and create
// the row twice — the exact duplicate this queue's dedupe keys exist to prevent.
db.version(13).stores({
  trackQueue: '++id, resource, status, dedupeKey, queuedAt',
});

// v14: `satBaselines` — the adaptive placement test (see src/lib/sat/baseline.js).
//
// A separate store rather than another `satAttempts` kind, for one structural
// reason: a baseline's questions are GENERATED, so unlike every other attempt
// they exist nowhere but inside their own row. A satAttempts row stores
// questionIds and resolves them against the static bank; do that for a baseline
// and the student can never review the questions they just missed, because
// those ids point at nothing. So the session — blueprint, every response, and
// the full item that was shown — is stored whole.
//
// `status` is indexed because there is exactly one query that matters on a slow
// path: "is there a baseline to resume?", asked on every mount of the panel.
//
// KNOWN LIMITATION — this store is NOT in buildSyncSnapshot(), so baselines are
// device-local. Two consequences worth being upfront about: a baseline taken on
// a phone will not show on a laptop, and the once-a-week gate is per device
// rather than per account. It is excluded because each row carries the full
// text of 35 generated questions (tens of KB), and pushing that through the
// snapshot would multiply the payload of every sync for data that is read on
// exactly one screen. The right fix is to sync the result summary while leaving
// the question bodies local; that needs a snapshot schema change, so it is
// deliberately left for its own commit rather than smuggled into this one.
db.version(14).stores({
  satBaselines: '++id, status, startedAt, finishedAt',
});

// v15: cross-device counter sync + the reward-claim outbox.
//
// `syncBaseline` — a single local-only row tracking how much of this device's current
// xp/aiChatCount/interviewCount/cardReviewCount has already been reported to the server (see
// claimSyncDelta/commitSyncDelta/resetSyncBaseline below + src/lib/progressSync.js). Replaces a
// bug where these counters synced as absolute values merged via Math.max(local, remote) — correct
// only when one device's progress is a strict superset of the other's, and silently lossy the
// moment two devices earn real, independent progress between syncs (the ordinary "phone during
// the day, laptop at night" pattern). Deliberately excluded from buildSyncSnapshot(), same as
// trackQueue: it's bookkeeping about what's already been sent, not progress itself.
//
// `rewardClaimQueue` — the durable outbox behind idempotent, once-only rewards (today's
// check-in, an achievement unlock, a weekly quest claim). Mirrors trackQueue.js's pattern: the
// claim intent is written here before any network call, so it survives a closed tab or a dead
// connection and reconciles once one's available. See src/lib/rewardClaimQueue.js.
db.version(15).stores({
  syncBaseline: 'key',
  rewardClaimQueue: '++id, claimKey, attemptId, status, queuedAt',
});

// v16: lesson difficulty feedback + durable per-lesson player progress.
//
// `lessonFeedback` — one row per "too easy / too hard / just right" answer a student gives at
// the bottom of a lesson, together with whatever Medabrain generated in response (the deeper
// continuation, or the re-teach + the resource list). Two reasons it is a table and not a flag
// on the lesson row:
//   1. The generated text has to persist. A student who asked for the harder version of a
//      passage should find it still there tomorrow, not have to re-spend a Groq call to read
//      the thing they already asked for.
//   2. The HISTORY is the point. One answer says little; the pattern across thirty lessons is
//      the most direct read we have on where a student actually is, and it is what
//      summarizeLessonFeedback() feeds into Medabrain's picture of them. Overwriting would
//      throw away the only signal worth keeping.
// Keyed by `++id` with a `lessonId` index: a lesson can be answered more than once (they come
// back later, or change their mind), and the newest row wins for display.
//
// `lessonProgress` — where the student actually is inside a lesson, keyed by lessonId and
// therefore surviving both a reload and a close-and-come-back-a-week-later. This used to live
// only in the single-slot viewState blob (localStorage), which could remember exactly one
// lesson and forgot which step you were on the moment you opened a different one. That produced
// the specific bug this fixes: read the article on Monday, come back Wednesday for the video,
// and the player dropped you at the top of the article you had already finished.
db.version(16).stores({
  lessonFeedback: '++id, lessonId, rating, createdAt',
  lessonProgress: 'lessonId, updatedAt',
});

// v17: the earned streak.
//
// `dayActivity` — one row per local calendar day, holding the CREDITS earned that day and the
// per-action counts behind them (see src/lib/streak.js for the weights). This is what replaces
// "the app was opened today" as the definition of a study day. `met` is stored rather than
// recomputed on read because the goal it was measured against can change: a student who cleared
// a Steady day and then raises their goal to Intense has not retroactively failed last Tuesday,
// so `goalCredits` is stamped onto the row at the time it was met and never re-evaluated.
//
// `studyDays` is still written (by recordStreakActivity, only once a day is actually cleared)
// so the existing heatmap, parent digest and comeback nudge keep working unchanged — it is now
// a derived index of "days that cleared", not an independent record of app opens.
//
// `streakRewards` — the permanent claim ledger for milestone and perfect-week rewards, keyed
// `milestone:30` / `week:2026-W33`. Permanent is the point: a broken-and-rebuilt streak passing
// day 30 again does not pay out twice, and a device that syncs late cannot double-claim.
db.version(17).stores({
  dayActivity:   'date, met',
  streakRewards: 'key, claimedAt',
}).upgrade(async (tx) => {
  // Every day a pre-v17 student already had on the calendar becomes a cleared day. They earned
  // those under the old rules, and the one thing a streak system must never do on upgrade is
  // tell a student with a 90-day streak that it is now zero.
  const legacy = await tx.table('studyDays').toArray();
  if (!legacy.length) return;
  await tx.table('dayActivity').bulkPut(legacy.map(({ date }) => ({
    date, credits: 0, counts: {}, goalCredits: 0, met: 1, metAt: null, legacy: 1,
  })));
});

// v18: `boosts` — time-limited XP multipliers (see BOOST_KINDS in src/lib/streak.js).
//
// A boost is granted by the check-in calendar's milestone days and by the occasional Clean
// Sweep, and it multiplies every XP award until it expires. It is a table rather than a field
// on the user row for one reason: two boosts can be live at once (a 24-hour Surge granted on
// Monday and a 6-hour Double granted on Tuesday evening), they stack multiplicatively, and a
// single field cannot represent that without either dropping one or lying about when it ends.
//
// `expiresAt` is indexed because the only query that matters is "what is live right now", asked
// on every XP award and on every render of the boost chip.
//
// Expired rows are swept on read rather than by a timer: a background sweep in a tab that might
// be asleep for six hours is a worse guarantee than a filter that is correct by construction.
db.version(18).stores({
  boosts: '++id, kind, expiresAt',
});

// ── User ─────────────────────────────────────────────────────────────────────
export async function getUser() {
  return db.user.toCollection().first();
}
export async function saveUser(u) {
  const existing = await db.user.toCollection().first();
  if (existing) await db.user.update(existing.id, u);
  else await db.user.add({ ...u });
  pushDirty();
}

// ── Pathway ───────────────────────────────────────────────────────────────────
// Rows carry `verified`/`quizScore`/`studying` alongside the original `completedAt` so lessons
// that have a curated verification quiz (constants.js `quizIds`) can be told apart from the
// old self-report-only lessons — every existing `pathway[lesson.id]` truthy check in App.jsx
// still works unchanged since the returned value is always a truthy object once a row exists.
export async function getPathway() {
  const rows = await db.lessons.toArray();
  return Object.fromEntries(rows.map(r => [r.lessonId, {
    completedAt: r.completedAt || null, verified: !!r.verified, quizScore: r.quizScore ?? null,
    studying: !!r.studying, studyStartedAt: r.studyStartedAt || null,
  }]));
}
export async function setLessonDone(lessonId) {
  await db.lessons.put({ lessonId, completedAt: Date.now(), verified: false, studying: false });
  pushDirty();
}
// Called when a student opens a lesson's video/resource — marks it "in progress" without
// counting toward mastery, so credibility isn't granted just for opening a link.
export async function startLessonStudy(lessonId) {
  const existing = await db.lessons.get(lessonId);
  if (existing?.verified) return;
  await db.lessons.put({ lessonId, completedAt: existing?.completedAt || null, verified: false, studying: true, studyStartedAt: Date.now() });
  pushDirty();
}
// Called when a student passes a lesson's curated verification quiz — this is the only path
// that sets `verified: true`, which is what unit-unlock gating and the Progress tab's Verified
// Progress view actually check.
export async function verifyLesson(lessonId, quizScore) {
  await db.lessons.put({ lessonId, completedAt: Date.now(), verified: true, quizScore, studying: false });
  pushDirty();
}
export async function resetPathway() {
  await db.lessons.clear();
  pushDirty();
}

// ── Quiz Scores ───────────────────────────────────────────────────────────────
export async function getQuizScores() {
  const rows = await db.quizScores.toArray();
  return Object.fromEntries(rows.map(r => [r.quizId, r.score]));
}
export async function getQuizHistory() {
  return db.quizScores.orderBy('completedAt').toArray();
}
export async function saveQuizScore(quizId, score) {
  await db.quizScores.put({ quizId, score, completedAt: Date.now() });
  logStudyEvent('quiz_scored', quizId).catch(() => {});
  pushDirty();
}
export async function resetQuizScores() {
  await db.quizScores.clear();
  pushDirty();
}

// ── Flashcard Decks ───────────────────────────────────────────────────────────
export async function getFlashDecks() {
  const rows = await db.flashCards.toArray();
  // Group by deckName
  const decks = {};
  rows.forEach(r => {
    if (!decks[r.deckName]) decks[r.deckName] = [];
    decks[r.deckName].push(r);
  });
  return decks;
}
export async function saveDeck(deckName, cards) {
  // Remove existing cards for this deck, then add new ones
  await db.flashCards.where('deckName').equals(deckName).delete();
  const rows = cards.map(c => ({ deckName, ...c }));
  await db.flashCards.bulkAdd(rows);
  // First time we see this deck name, stamp it so it can be sorted
  // newest-first in the deck list. Re-saves (editing cards) don't bump it.
  const existing = await db.deckMeta.get(deckName);
  if (!existing) await db.deckMeta.put({ name: deckName, createdAt: Date.now() });
  pushDirty();
}
export async function updateCard(id, updates) {
  await db.flashCards.update(id, updates);
  pushDirty();
}
export async function deleteDeck(deckName) {
  await db.flashCards.where('deckName').equals(deckName).delete();
  await db.deckMeta.delete(deckName);
  pushDirty();
}
export async function getDeckCreatedAtMap() {
  const rows = await db.deckMeta.toArray();
  return Object.fromEntries(rows.map(r => [r.name, r.createdAt]));
}
// `cardReviews` rows (below) power the per-day streak heatmap and stay an approximate,
// Math.max-per-day cross-device merge (see applyRemoteSnapshot) — fine for a "did I study that
// day" visual. `user.cardReviewCount` is the exact, cross-device-additive total used for
// achievement thresholds (Card Master, Flashcard Marathoner) and the weekly review quest, synced
// via the same delta mechanism as xp (see claimSyncDelta below) rather than Math.max — reading
// straight from Dexie right before the write (not a value the caller passed in) avoids a stale
// closure race across rapid-fire reviews in one study session.
export async function recordCardReview(cardId) {
  await db.cardReviews.add({ cardId, reviewedAt: Date.now() });
  const u = await db.user.toCollection().first();
  if (u) await db.user.update(u.id, { cardReviewCount: (u.cardReviewCount || 0) + 1 });
  logStudyEvent('flashcard_reviewed', String(cardId)).catch(() => {});
  pushDirty();
}
export async function getTotalCardReviews() {
  return db.cardReviews.count();
}
export async function getCardReviewsSince(timestamp) {
  return db.cardReviews.where('reviewedAt').aboveOrEqual(timestamp).count();
}

// ── Category Performance ───────────────────────────────────────────────────────
export async function getCatPerf() {
  const rows = await db.catPerf.toArray();
  return Object.fromEntries(rows.map(r => [r.category, { total: r.total, count: r.count }]));
}
export async function updateCatPerf(category, score) {
  const existing = await db.catPerf.get(category);
  if (existing) {
    await db.catPerf.update(category, { total: existing.total + score, count: existing.count + 1 });
  } else {
    await db.catPerf.put({ category, total: score, count: 1 });
  }
  pushDirty();
}
export async function resetCatPerf() {
  await db.catPerf.clear();
  pushDirty();
}

// ── Achievements ──────────────────────────────────────────────────────────────
export async function getAchievements() {
  const rows = await db.achievements.toArray();
  return new Set(rows.map(r => r.key));
}
export async function unlockAchievement(key) {
  try {
    await db.achievements.add({ key, unlockedAt: Date.now() });
    pushDirty();
    return true; // newly unlocked
  } catch {
    return false; // already existed
  }
}

// ── Streak / Study Days ────────────────────────────────────────────────────────
//
// A day is a study day when the student EARNED it — see the header of
// src/lib/streak.js for why this is not "the app was opened today" any more.
// Nothing in this section is called on app load; every entry point below is
// reached from a real, completed piece of work.

/**
 * Credits `action` (a key of STREAK_ACTIONS) against today, and clears the day
 * if that pushes it past `goalCredits`.
 *
 * Returns everything the caller needs to decide whether to celebrate, without a
 * second read: `{ date, credits, goalCredits, met, justMet, added }`. `justMet`
 * is true ONLY on the transition — the call that crossed the line — so the
 * lesson-complete overlay can show "streak extended" exactly once rather than
 * on every subsequent action that day.
 *
 * Idempotency is the caller's job (a lesson can only be verified once, a quiz
 * score is only saved once), which is deliberate: re-crediting is a real bug at
 * the call site, and silently swallowing it here would hide it.
 */
export async function recordStreakActivity(action, { credits, goalCredits, times = 1 } = {}) {
  const date = localDateStr();
  const add = Math.max(0, credits ?? 0);
  const target = Math.max(1, goalCredits || 1);
  const existing = await db.dayActivity.get(date);
  const prevCredits = existing?.credits || 0;
  const wasMet = !!existing?.met;
  const nextCredits = prevCredits + add;
  // A day already cleared keeps the goal it was cleared against (see the v17
  // schema note) — raising the daily goal must not un-clear a finished day.
  const met = wasMet || nextCredits >= target;
  const counts = { ...(existing?.counts || {}) };
  if (action) counts[action] = (counts[action] || 0) + Math.max(1, times);
  // The goal this day is judged against. For a day already cleared it is the goal it
  // was cleared against, NOT the current one — otherwise raising the daily goal
  // mid-day makes a finished day start reading as unfinished again everywhere it is
  // reported, including the overlay the student is looking at right now.
  const effectiveGoal = wasMet ? (existing.goalCredits || target) : target;
  await db.dayActivity.put({
    date,
    credits: nextCredits,
    counts,
    goalCredits: effectiveGoal,
    met: met ? 1 : 0,
    metAt: wasMet ? existing.metAt : (met ? Date.now() : null),
  });
  // `studyDays` is now the derived index of cleared days — written here and
  // nowhere else, so the heatmap, the parent digest and the comeback nudge all
  // describe earned days without any of them needing to know how earning works.
  if (met && !wasMet) {
    try { await db.studyDays.add({ date }); } catch { /* already present */ }
  }
  pushDirty();
  return { date, credits: nextCredits, goalCredits: effectiveGoal, met, justMet: met && !wasMet, added: add };
}

/** Today's row, or a zeroed stand-in so callers never branch on null. */
export async function getDayActivity(date = localDateStr()) {
  const row = await db.dayActivity.get(date);
  return row || { date, credits: 0, counts: {}, goalCredits: 0, met: 0, metAt: null };
}

/** Every day row, newest last. The calendar and the streak math both read this. */
export async function getAllDayActivity() {
  return db.dayActivity.orderBy('date').toArray();
}

/** Set of YYYY-MM-DD keys that cleared their goal. */
export async function getMetDays() {
  const rows = await db.dayActivity.where('met').equals(1).toArray();
  return new Set(rows.map(r => r.date));
}

/** Dates a spent streak freeze is covering. */
export async function getBridgedDates() {
  const freezes = await db.streakFreezes.toArray();
  return new Set(freezes.filter(f => f.usedOn).map(f => f.usedOn));
}

export async function getStreak() {
  const [metDates, bridged] = await Promise.all([getMetDays(), getBridgedDates()]);
  return computeStreak(metDates, { bridged });
}

// ── Quest evidence ────────────────────────────────────────────────────────────
/**
 * Every local record a quest can be measured against, in one read.
 *
 * The quest engine (src/lib/quests.js) is pure and takes a flat list of dated events; this is the
 * one function that goes and gets the raw material for it. Deliberately a single call rather than
 * eight scattered ones in App.jsx: a quest's progress must be computed from ONE consistent view of
 * the database, or a card reviewed between two of those reads lands in one surface's number and
 * not another's.
 *
 * Nothing here is quest-specific storage. Every table read is one the app already maintains for
 * its own reasons — which is the property that keeps quest progress and the rest of the product's
 * numbers from drifting apart. `since` bounds the read to the oldest running quest's start; a
 * student with two years of card reviews should not load all of them to render a 14-day quest.
 */
export async function getQuestEvidence({ since = 0 } = {}) {
  const [
    lessons, quizScores, cardReviews, satAttempts, satResponses, satReviewLog, dayActivity,
    unitMastery, coachMessages, lessonNotes, lessonHighlights, deckMeta,
  ] = await Promise.all([
    db.lessons.toArray(),
    db.quizScores.toArray(),
    since > 0 ? db.cardReviews.where('reviewedAt').aboveOrEqual(since).toArray() : db.cardReviews.toArray(),
    db.satAttempts.toArray(),
    since > 0 ? db.satResponses.where('answeredAt').aboveOrEqual(since).toArray() : db.satResponses.toArray(),
    db.satReviewLog.toArray(),
    db.dayActivity.toArray(),
    db.unitMastery.toArray(),
    // Coach messages are the one unbounded table here — a chatty student
    // accumulates thousands — so the window bound matters more than anywhere
    // else. `ts` is indexed on coachMessages only via the compound declaration,
    // so this filters in memory over a bounded-by-nothing read; the rows are
    // small and the alternative is a schema version for a quest metric, which is
    // exactly the parallel telemetry this system exists to avoid.
    db.coachMessages.toArray(),
    db.lessonNotes.toArray(),
    db.lessonHighlights.toArray(),
    db.deckMeta.toArray(),
  ]);
  return {
    lessons, quizScores, cardReviews, satAttempts, satResponses,
    // The engine looks for `clearedAt`/`resolvedAt`; resolveSatReviewEntry writes the latter.
    satReviewLog: satReviewLog.filter(r => r.resolved),
    dayActivity,
    unitMastery,
    coachMessages: since > 0 ? coachMessages.filter(m => (m.ts || 0) >= since) : coachMessages,
    lessonNotes, lessonHighlights, deckMeta,
  };
}

// ── Streak reward claims ──────────────────────────────────────────────────────
// Permanent and once-only. `key` is `milestone:<days>` or `week:<isoWeekKey>`.
export async function getClaimedStreakRewards() {
  const rows = await db.streakRewards.toArray();
  return new Set(rows.map(r => r.key));
}
/** Returns true only for the claim that actually landed — false if already held. */
export async function claimStreakReward(key, meta = {}) {
  try {
    await db.streakRewards.add({ key, claimedAt: Date.now(), ...meta });
    pushDirty();
    return true;
  } catch {
    return false;
  }
}

// ── Streak Freezes ────────────────────────────────────────────────────────────
//
// The safety net against loss-aversion streak breaks. A freeze covers exactly one missed day.
//
// The hold cap is the student's LEAGUE cap (see STREAK_LEAGUES in src/lib/streak.js), not a
// constant: protecting a four-month streak should be easier than protecting a two-day one,
// because the four-month streak is the thing actually worth protecting. Callers pass the streak
// so this module never has to derive it (and never has to import the whole engine to do so).
//
// The floor of 1 matters: a brand-new student who wins a freeze from an achievement must be able
// to hold it, or the reward silently evaporates on the way in.

export async function getStreakFreezeCount() {
  return db.streakFreezes.filter(f => !f.usedOn).count();
}

/** Every freeze row, spent and unspent — the freeze card's history list. */
export async function getStreakFreezes() {
  return db.streakFreezes.orderBy('earnedAt').reverse().toArray();
}

/**
 * Add a freeze, if the cap allows.
 *
 * @param {object} opts
 * @param {number} opts.streak  current streak, for the league cap. 0 is safe (cap 1).
 * @param {string} opts.source  where it came from — 'milestone' | 'week' | 'month' |
 *                              'achievement' | 'purchase' | 'checkin'. Shown in the history.
 * @returns {boolean} true only when one was actually added.
 */
export async function grantStreakFreeze({ streak = 0, source = 'earned' } = {}) {
  const held = await getStreakFreezeCount();
  const cap = Math.max(1, freezeCapFor(streak));
  if (held >= cap) return false;
  await db.streakFreezes.add({ earnedAt: Date.now(), usedOn: null, source });
  pushDirty();
  return true;
}

/**
 * Run once per app load, before getStreak(). If exactly one day was missed
 * since the last study day and an unused freeze is available, spends it to
 * bridge that specific date so getStreak() can see it via `usedOn`.
 * Returns the bridged date if a freeze was newly applied this call, else null.
 *
 * Deliberately still automatic. A freeze the student has to remember to spend is a freeze that
 * is sitting unspent on the morning they needed it, which is the failure this exists to prevent —
 * and the app tells them it happened (see the toast at the call site) rather than doing it
 * silently, which is the part that makes automatic acceptable.
 */
export async function checkAndApplyStreakFreeze() {
  const days = await db.studyDays.orderBy('date').reverse().toArray();
  if (!days.length) return null;
  const mostRecent = new Date(days[0].date); mostRecent.setHours(0,0,0,0);
  const today = new Date(); today.setHours(0,0,0,0);
  const gapDays = Math.round((today - mostRecent) / 86400000);
  if (gapDays !== 2) return null; // only bridges a single missed day
  const missed = new Date(mostRecent); missed.setDate(missed.getDate() + 1);
  const missedKey = localDateStr(missed);
  const alreadyBridged = await db.streakFreezes.where('usedOn').equals(missedKey).count();
  if (alreadyBridged) return null;
  const unused = await db.streakFreezes.filter(f => !f.usedOn).first();
  if (!unused) return null;
  await db.streakFreezes.update(unused.id, { usedOn: missedKey, spentAt: Date.now() });
  pushDirty();
  return missedKey;
}

/**
 * Buy a freeze with XP.
 *
 * The XP debit is the CALLER's job — it goes through the same user-record write every other XP
 * movement uses, so the balance stays consistent with the sync baseline. This function's only
 * responsibility is the cap check and the row, and it returns false without side effects when the
 * cap is reached, so a caller that debits first and grants second can refund on false.
 */
export async function buyStreakFreeze({ streak = 0 } = {}) {
  return grantStreakFreeze({ streak, source: 'purchase' });
}

// ── Streak repair ─────────────────────────────────────────────────────────────
/**
 * When the last repair was, or null. Read off the permanent claim ledger, which is where the
 * cooldown lives — a device-local timestamp would let a student repair once per device.
 */
export async function getLastRepairAt() {
  const rows = await db.streakRewards.filter(r => String(r.key || '').startsWith('repair:')).toArray();
  if (!rows.length) return null;
  return Math.max(...rows.map(r => r.claimedAt || 0)) || null;
}

/**
 * Bridge a broken run.
 *
 * Writes one spent-freeze row per missed date, marked `source: 'repair'`, which is what makes a
 * repaired day behave exactly like a frozen one everywhere in the app: it holds the streak
 * together (computeStreak reads `usedOn`), and it can never complete a Perfect Week or a Perfect
 * Month or count toward a study-day quest, because all three of those read `metDates` and none of
 * them read `bridged`. That equivalence is the whole safety property — there is no way to buy a
 * reward, only to buy back continuity.
 *
 * The ledger row (`repair:<date>`) is what enforces the cooldown, and it is permanent and
 * cross-device for the same reason milestone claims are.
 *
 * @returns {boolean} false if this repair was already recorded (a second device got there first).
 */
export async function repairStreak(dates = []) {
  const clean = (dates || []).filter(Boolean);
  if (!clean.length) return false;
  const today = localDateStr();
  // The ledger add is first and is the gate: if another device already repaired today, this
  // throws on the unique key and we do nothing else, so two tabs cannot double-bridge.
  try {
    await db.streakRewards.add({ key: repairKey(today), claimedAt: Date.now(), dates: clean });
  } catch {
    return false;
  }
  const now = Date.now();
  for (const date of clean) {
    const already = await db.streakFreezes.where('usedOn').equals(date).count();
    if (already) continue;
    await db.streakFreezes.add({ earnedAt: now, usedOn: date, spentAt: now, source: 'repair' });
  }
  pushDirty();
  return true;
}

// ── XP boosts ─────────────────────────────────────────────────────────────────
/**
 * Live boosts only. Expired rows are deleted on the way past — a sweep on read rather than on a
 * timer, because a timer in a backgrounded tab is not a guarantee and a filter is.
 */
export async function getActiveBoosts() {
  const now = Date.now();
  const rows = await db.boosts.toArray();
  const dead = rows.filter(b => (b.expiresAt || 0) <= now);
  if (dead.length) { try { await db.boosts.bulkDelete(dead.map(b => b.id)); } catch { /* raced */ } }
  return rows.filter(b => (b.expiresAt || 0) > now);
}

/**
 * Start a boost.
 *
 * Re-granting a boost of the same kind EXTENDS the live one rather than adding a second row.
 * Two identical multipliers stacking to ×4 is not something any surface in this app promises,
 * and a student who earns a second Double XP an hour into the first should get more time, not a
 * number the copy never described.
 */
export async function grantBoost(kind, hours, { source = null } = {}) {
  const ms = Math.max(1, Number(hours) || 1) * 3600 * 1000;
  const now = Date.now();
  const existing = (await getActiveBoosts()).find(b => b.kind === kind);
  if (existing) {
    await db.boosts.update(existing.id, { expiresAt: existing.expiresAt + ms });
    pushDirty();
    return { ...existing, expiresAt: existing.expiresAt + ms, extended: true };
  }
  const row = { kind, startedAt: now, expiresAt: now + ms, source };
  const id = await db.boosts.add(row);
  pushDirty();
  return { ...row, id, extended: false };
}

export async function clearBoosts() { await db.boosts.clear(); }

// ── Daily Check-in ────────────────────────────────────────────────────────────
export async function getCheckin(date) {
  return db.checkins.get(date);
}
export async function recordCheckin(date, day) {
  try { await db.checkins.add({ date, day }); pushDirty(); return true; } catch { return false; }
}
// Whether the user has ever claimed/seen a check-in before — distinguishes a
// genuinely first-ever chest (day 1, "Welcome") from a cycle restarting at
// day 1 after a long absence ("Welcome back").
export async function hasAnyCheckin() {
  return (await db.checkins.count()) > 0;
}
/** How many times a given cycle day has been reached — `countCheckinsOnDay(28)`
 *  is how many full 28-day check-in cycles this account has completed. */
export async function countCheckinsOnDay(day) {
  return db.checkins.filter(c => Number(c.day) === Number(day)).count();
}

// ── Cosmetics (chest-reveal unlocks) ─────────────────────────────────────────
export async function getCosmetics() {
  const rows = await db.cosmetics.toArray();
  return new Set(rows.map(r => r.key));
}
export async function unlockCosmetic(key) {
  try { await db.cosmetics.add({ key, unlockedAt: Date.now() }); pushDirty(); return true; } catch { return false; }
}
export async function getStudyDaysCount() {
  return db.studyDays.count();
}
export async function getStudyDays() {
  const rows = await db.studyDays.toArray();
  return rows.map(r => r.date);
}

// ── Clinical / Shadowing Hours ────────────────────────────────────────────────
export async function getClinicalHours() {
  return db.clinicalHours.orderBy('entryDate').reverse().toArray();
}
export async function addClinicalHours(entry) {
  return db.clinicalHours.add({ ...entry, loggedAt: Date.now() });
}
export async function deleteClinicalHours(id) {
  await db.clinicalHours.delete(id);
}

// ── Recommenders (LOR writers / committee letters) ───────────────────────────
export async function getRecommenders() {
  return db.recommenders.toArray();
}
export async function addRecommender(entry) {
  return db.recommenders.add({ ...entry, addedAt: Date.now() });
}
export async function updateRecommender(id, updates) {
  await db.recommenders.update(id, updates);
}
export async function deleteRecommender(id) {
  await db.recommenders.delete(id);
}

// Used only by dataApi.migrateLocalPortfolioLogs() once local rows are confirmed uploaded to
// the Supabase-backed clinical_hours/recommenders resources — see db.js v8 comment above.
export async function clearClinicalHoursLocal() { await db.clinicalHours.clear(); }
export async function clearRecommendersLocal() { await db.recommenders.clear(); }

// ── Unit Mastery (quiz-verified pathway completion) ──────────────────────────
export async function getUnitMastery(pathwayKey) {
  const rows = await db.unitMastery.where('pathwayKey').equals(pathwayKey).toArray();
  return Object.fromEntries(rows.map(r => [r.unitId, r]));
}
export async function getAllUnitMastery() {
  return db.unitMastery.toArray();
}
export async function verifyUnit(pathwayKey, unitId, quizId, score) {
  const existing = await db.unitMastery.where({ pathwayKey, unitId }).first();
  const row = { pathwayKey, unitId, quizId, score, verifiedAt: Date.now() };
  if (existing) await db.unitMastery.update(existing.id, row);
  else await db.unitMastery.add(row);
  pushDirty();
}

// ── Pathway Pacing Goals ──────────────────────────────────────────────────────
// One row per pathway a student has set a goal for (a student can only be actively
// enrolled in one pathway at a time via specialty, but a prior pathway's goal row
// is left alone rather than deleted if they switch, so switching back restores it).
export async function getPathwayGoal(pathwayKey) {
  return db.pathwayGoals.get(pathwayKey);
}
/**
 * Set (or change) a pathway's pace goal.
 *
 * `keepStart` matters more than it looks: a student adjusting "8 weeks" to "10 weeks" three
 * weeks in is EXTENDING the same commitment, so the clock must not restart — resetting
 * startedAt would silently wipe the three weeks of pace history the status is computed from
 * and flip anyone who was behind to "on pace" for free. Restarting the clock is a separate,
 * explicit action in the UI ("Restart from today"), which passes keepStart: false.
 */
export async function setPathwayGoal(pathwayKey, targetWeeks, { keepStart = false } = {}) {
  const existing = await db.pathwayGoals.get(pathwayKey);
  await db.pathwayGoals.put({
    pathwayKey,
    startedAt: keepStart && existing?.startedAt ? existing.startedAt : Date.now(),
    targetWeeks,
    updatedAt: Date.now(),
  });
  pushDirty();
}
export async function clearPathwayGoal(pathwayKey) {
  await db.pathwayGoals.delete(pathwayKey);
  pushDirty();
}

// ── Local study-event log (Part C profiling groundwork; never transmitted) ───
export async function logStudyEvent(type, refId) {
  await db.studyEvents.add({ type, refId, ts: Date.now() });
}
export async function getStudyEvents(type) {
  return type ? db.studyEvents.where('type').equals(type).toArray() : db.studyEvents.toArray();
}

// ── Interview Practice Sessions (Standard/MMI/CASPer) ─────────────────────────
export async function getInterviewSessions() {
  return db.interviewSessions.orderBy('completedAt').reverse().toArray();
}
export async function addInterviewSession(entry) {
  return db.interviewSessions.add({ ...entry, completedAt: Date.now() });
}

// ── Pathway Lesson Notes ──────────────────────────────────────────────────────
// One free-text note per lesson (keyed by lessonId, so writing a new note for the same lesson
// simply overwrites — a student doesn't need multiple notes per lesson, just one evolving one).
export async function getLessonNote(lessonId) {
  const row = await db.lessonNotes.get(lessonId);
  return row?.text || '';
}
export async function getAllLessonNotes() {
  const rows = await db.lessonNotes.toArray();
  return Object.fromEntries(rows.map(r => [r.lessonId, r.text]));
}
export async function saveLessonNote(lessonId, text) {
  const trimmed = (text || '').trim();
  if (!trimmed) { await db.lessonNotes.delete(lessonId); pushDirty(); return; }
  await db.lessonNotes.put({ lessonId, text, updatedAt: Date.now() });
  pushDirty();
}

// ── Pathway Lesson Highlights ─────────────────────────────────────────────────
// One row per highlighted passage. `sectionIdx` + `start`/`end` are character offsets into that
// article section's plain-text body (see components/HighlightableArticle.jsx), NOT DOM offsets —
// DOM structure can change (e.g. overlapping highlights) but the underlying text doesn't.
export async function getLessonHighlights(lessonId) {
  return db.lessonHighlights.where('lessonId').equals(lessonId).sortBy('createdAt');
}
export async function addLessonHighlight(lessonId, { sectionIdx, start, end, text, color }) {
  const id = await db.lessonHighlights.add({ lessonId, sectionIdx, start, end, text, color: color || 'yellow', createdAt: Date.now() });
  pushDirty();
  return id;
}
export async function deleteLessonHighlight(id) {
  await db.lessonHighlights.delete(id);
  pushDirty();
}

/** Every highlight the student has ever made, grouped by lesson — for Medabrain's context. */
export async function getAllLessonHighlights() {
  return db.lessonHighlights.toArray();
}

// ── Lesson difficulty feedback ────────────────────────────────────────────────
// See the v16 schema note above and src/lib/lessonFeedback.js for what each rating means.

/** Newest-first feedback for one lesson (a lesson can be answered more than once). */
export async function getLessonFeedback(lessonId) {
  const rows = await db.lessonFeedback.where('lessonId').equals(lessonId).toArray();
  return rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}
/** The answer currently on screen for a lesson: the most recent one. */
export async function getLatestLessonFeedback(lessonId) {
  return (await getLessonFeedback(lessonId))[0] || null;
}
export async function getAllLessonFeedback() {
  return db.lessonFeedback.orderBy('createdAt').reverse().toArray();
}
export async function addLessonFeedback({
  lessonId, lessonTitle = '', unitId = null, unitTitle = '', pathwayKey = null, category = null,
  rating, aiText = '', resources = [], status = 'complete',
}) {
  const id = await db.lessonFeedback.add({
    lessonId, lessonTitle, unitId, unitTitle, pathwayKey, category,
    rating, aiText, resources, status,
    createdAt: Date.now(), updatedAt: Date.now(),
  });
  pushDirty();
  return id;
}
/** Used to attach the AI response once it comes back, without losing the answer itself. */
export async function updateLessonFeedback(id, patch) {
  await db.lessonFeedback.update(id, { ...patch, updatedAt: Date.now() });
  pushDirty();
}

// ── Per-lesson player progress ────────────────────────────────────────────────
// Where inside a lesson the student actually is. Written on every meaningful move within the
// player, read when a lesson is opened. See the v16 schema note for why this is keyed by
// lessonId rather than living in the single-slot viewState blob.
export async function getLessonProgress(lessonId) {
  return db.lessonProgress.get(lessonId);
}
export async function getAllLessonProgress() {
  return db.lessonProgress.toArray();
}
export async function saveLessonProgress(lessonId, patch = {}) {
  const existing = await db.lessonProgress.get(lessonId);
  const row = { ...(existing || { lessonId }), ...patch, lessonId, updatedAt: Date.now() };
  await db.lessonProgress.put(row);
  pushDirty();
  return row;
}
export async function clearLessonProgress(lessonId) {
  await db.lessonProgress.delete(lessonId);
  pushDirty();
}

// ── Medabrain Chat Threads ────────────────────────────────────────────────
// A student can run as many parallel Medabrain conversations as they want —
// each is its own row here plus a run of rows in coachMessages, so switching
// threads is just a different IndexedDB query, and nothing is lost on reload.
export async function getCoachThreads() {
  return db.coachThreads.orderBy('updatedAt').reverse().toArray();
}
export async function createCoachThread(title = 'New chat') {
  const now = Date.now();
  const id = await db.coachThreads.add({ title, createdAt: now, updatedAt: now });
  pushDirty();
  return { id, title, createdAt: now, updatedAt: now };
}
export async function renameCoachThread(id, title) {
  await db.coachThreads.update(id, { title });
  pushDirty();
}
export async function touchCoachThread(id) {
  await db.coachThreads.update(id, { updatedAt: Date.now() });
  pushDirty();
}
export async function deleteCoachThread(id) {
  await db.coachMessages.where('threadId').equals(id).delete();
  await db.coachThreads.delete(id);
  pushDirty();
}
// Scoped alternative to a full account wipe — clears every Medabrain conversation without touching
// XP, streak, quiz scores, flashcards, or pathway progress.
export async function clearAllCoachThreads() {
  await db.coachMessages.clear();
  await db.coachThreads.clear();
  pushDirty();
}
export async function getCoachMessages(threadId) {
  return db.coachMessages.where('threadId').equals(threadId).sortBy('ts');
}
export async function addCoachMessage(threadId, role, content) {
  const ts = Date.now();
  const id = await db.coachMessages.add({ threadId, role, content, ts });
  await touchCoachThread(threadId);
  return { id, threadId, role, content, ts };
}
// ── Cross-device progress sync ────────────────────────────────────────────────
// Builds/restores a JSON-safe snapshot covering every store that should follow a student across
// browsers/devices (see api/progress-sync.js + src/lib/progressSync.js for the network side).
// Deliberately excludes the local-only `studyEvents` behavioral log (docs/PROFILING_PLAN.md
// Phase 1 scope — no granular behavioral tracking leaves the device without a dedicated consent
// flow) and raw per-card review identifiers (a card's local auto-increment id means nothing on
// another device) — reviews fold into a per-date count instead, which is all "reviewed this
// week" style stats actually need.
const SYNC_VERSION = 2;

// api/progress-sync.js rejects payloads over 2 MB, and a heavy SAT user can
// accumulate thousands of responses. Only the most recent slice travels; the
// full history stays local, the same compromise `studyEvents` already makes.
// Skill stats are derived from responses but are synced separately and cheaply,
// so a new device still gets an accurate heat map even beyond the cap.
const SYNC_RESPONSE_CAP = 2000;
const SYNC_ATTEMPT_CAP = 200;

function dateKeyOf(ms) { return localDateStr(new Date(ms)); }

export async function buildSyncSnapshot() {
  const [
    user, lessons, quizScores, flashCards, deckMetaRows, catPerf, achievements,
    studyDays, cardReviews, streakFreezes, checkins, cosmetics, unitMastery,
    pathwayGoals, coachThreads, coachMessages,
    satAttempts, satResponses, satSkillStats, satReviewLog,
    lessonNotes, lessonHighlights, lessonFeedback, lessonProgress,
    dayActivity, streakRewards, boosts,
  ] = await Promise.all([
    db.user.toCollection().first(), db.lessons.toArray(), db.quizScores.toArray(),
    db.flashCards.toArray(), db.deckMeta.toArray(), db.catPerf.toArray(),
    db.achievements.toArray(), db.studyDays.toArray(), db.cardReviews.toArray(),
    db.streakFreezes.toArray(), db.checkins.toArray(), db.cosmetics.toArray(),
    db.unitMastery.toArray(), db.pathwayGoals.toArray(), db.coachThreads.toArray(),
    db.coachMessages.toArray(),
    db.satAttempts.toArray(), db.satResponses.toArray(), db.satSkillStats.toArray(),
    db.satReviewLog.toArray(),
    db.lessonNotes.toArray(), db.lessonHighlights.toArray(),
    db.lessonFeedback.toArray(), db.lessonProgress.toArray(),
    db.dayActivity.toArray(), db.streakRewards.toArray(), db.boosts.toArray(),
  ]);

  // SAT attempts travel keyed by `startedAt` rather than by Dexie's autoincrement
  // id, which is per-device and would collide across browsers. Responses carry
  // the same key so they can be re-joined on the receiving device.
  const completedAttempts = satAttempts
    .filter(a => a.status === 'complete')
    .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
    .slice(0, SYNC_ATTEMPT_CAP);
  const attemptKeyById = new Map(completedAttempts.map(a => [a.id, a.startedAt]));
  const syncedResponses = satResponses
    .filter(r => attemptKeyById.has(r.attemptId))
    .sort((a, b) => (b.answeredAt || 0) - (a.answeredAt || 0))
    .slice(0, SYNC_RESPONSE_CAP);

  const reviewCountsByDate = {};
  for (const r of cardReviews) {
    const k = dateKeyOf(r.reviewedAt);
    reviewCountsByDate[k] = (reviewCountsByDate[k] || 0) + 1;
  }
  const flashDecks = {};
  for (const c of flashCards) {
    const { id, ...rest } = c;
    (flashDecks[c.deckName] ||= []).push(rest);
  }
  const messagesByThread = {};
  for (const m of coachMessages) {
    (messagesByThread[m.threadId] ||= []).push({ role: m.role, content: m.content, ts: m.ts });
  }

  return {
    v: SYNC_VERSION,
    user: user ? (({ id, ...rest }) => rest)(user) : null,
    lessons: lessons.map(({ lessonId, completedAt, verified, quizScore, studying, studyStartedAt }) =>
      ({ lessonId, completedAt: completedAt || null, verified: !!verified, quizScore: quizScore ?? null, studying: !!studying, studyStartedAt: studyStartedAt || null })),
    quizScores: quizScores.map(({ quizId, score, completedAt }) => ({ quizId, score, completedAt })),
    flashDecks,
    deckMeta: deckMetaRows.map(({ name, createdAt }) => ({ name, createdAt })),
    catPerf: catPerf.map(({ category, total, count }) => ({ category, total, count })),
    achievements: achievements.map(({ key, unlockedAt }) => ({ key, unlockedAt })),
    studyDays: studyDays.map(d => d.date),
    // The earned-streak ledger. Credits are additive across devices on merge
    // (see applyRemoteSnapshot) because a lesson done on the laptop and a quiz
    // done on the phone are two real pieces of work on the same day — the
    // Math.max treatment used for the approximate review heatmap would throw
    // one of them away and could leave a genuinely cleared day showing as
    // missed.
    dayActivity: dayActivity.map(({ date, credits, counts, goalCredits, met, metAt, legacy }) => ({
      date, credits: credits || 0, counts: counts || {}, goalCredits: goalCredits || 0,
      met: met ? 1 : 0, metAt: metAt || null, legacy: legacy ? 1 : 0,
    })),
    streakRewards: streakRewards.map(({ key, claimedAt, dates }) => ({ key, claimedAt, ...(dates ? { dates } : {}) })),
    // A boost is a wall-clock window, so it travels as its absolute expiry and is simply
    // dropped on arrival if it has already run out. Keyed by `startedAt`, which is unique
    // per grant and stable across devices in a way Dexie's autoincrement id is not.
    boosts: boosts
      .filter(b => (b.expiresAt || 0) > Date.now())
      .map(({ kind, startedAt, expiresAt, source }) => ({ kind, startedAt, expiresAt, source: source || null })),
    reviewCountsByDate,
    streakFreezes: streakFreezes.map(({ earnedAt, usedOn }) => ({ earnedAt, usedOn: usedOn || null })),
    checkins: checkins.map(({ date, day }) => ({ date, day })),
    cosmetics: cosmetics.map(({ key, unlockedAt }) => ({ key, unlockedAt })),
    unitMastery: unitMastery.map(({ pathwayKey, unitId, quizId, score, verifiedAt }) => ({ pathwayKey, unitId, quizId, score, verifiedAt })),
    pathwayGoals: pathwayGoals.map(({ pathwayKey, startedAt, targetWeeks, updatedAt }) => ({ pathwayKey, startedAt, targetWeeks, updatedAt: updatedAt || null })),
    coachThreads: coachThreads.map(t => ({
      key: t.createdAt, title: t.title, createdAt: t.createdAt, updatedAt: t.updatedAt,
      messages: messagesByThread[t.id] || [],
    })),
    satAttempts: completedAttempts.map(a => ({
      key: a.startedAt, kind: a.kind, section: a.section, startedAt: a.startedAt,
      finishedAt: a.finishedAt || null, questionIds: a.questionIds || [],
      result: a.result || null, meta: a.meta || {},
    })),
    satResponses: syncedResponses.map(r => ({
      attemptKey: attemptKeyById.get(r.attemptId), questionId: r.questionId,
      skill: r.skill, correct: !!r.correct, choice: r.choice ?? null,
      seconds: r.seconds ?? null, flagged: !!r.flagged, answeredAt: r.answeredAt,
    })),
    satSkillStats: satSkillStats.map(({ skill, ...rest }) => ({ skill, ...rest })),
    satReviewLog: satReviewLog.map(r => ({
      questionId: r.questionId, errorType: r.errorType || null, resolved: r.resolved ? 1 : 0,
      missCount: r.missCount || 1, createdAt: r.createdAt, lastMissedAt: r.lastMissedAt || null,
      resolvedAt: r.resolvedAt || null, due: r.due || null, fsrsState: r.fsrsState || null,
    })),
    lessonNotes: lessonNotes.map(({ lessonId, text, updatedAt }) => ({ lessonId, text, updatedAt })),
    lessonHighlights: lessonHighlights.map(({ lessonId, sectionIdx, start, end, text, color, createdAt }) =>
      ({ lessonId, sectionIdx, start, end, text, color, createdAt })),
    // Feedback rows travel WITH their generated text: the deeper passage a student asked for is
    // part of their lesson now, and finding it missing on a second device would read as the app
    // having lost it. Keyed on lessonId+createdAt (id is per-device autoincrement).
    lessonFeedback: lessonFeedback.map(({ id, ...rest }) => rest),
    lessonProgress: lessonProgress.map(({ lessonId, step, articleRead, videoWatched, articleScrollPct, articleConfirmedAt, videoConfirmedAt, lastOpenedAt, updatedAt }) =>
      ({ lessonId, step: step || null, articleRead: !!articleRead, videoWatched: !!videoWatched,
         articleScrollPct: articleScrollPct || 0, articleConfirmedAt: articleConfirmedAt || null,
         videoConfirmedAt: videoConfirmedAt || null, lastOpenedAt: lastOpenedAt || null, updatedAt: updatedAt || 0 })),
  };
}

function mergeUserRecord(local, remote) {
  if (!remote) return local;
  if (!local) return remote;
  const merged = { ...remote, ...local };
  // xp/aiChatCount/interviewCount/cardReviewCount are server-accumulated via additive delta sync
  // (see claimSyncDelta/commitSyncDelta below + progressSync.js + api/progress-sync.js's
  // bump_progress_counters) rather than merged here — `remote` already reflects every device's
  // contributions, so it is authoritative for these four fields specifically. This replaces a
  // Math.max(local, remote) merge that silently discarded whichever device's independent gain
  // was smaller instead of summing them — falls back to local only for an old snapshot written
  // before a field existed server-side.
  for (const k of ['xp', 'aiChatCount', 'interviewCount', 'cardReviewCount']) {
    merged[k] = remote[k] != null ? remote[k] : (local[k] || 0);
  }
  for (const k of ['obstacles', 'accomplish', 'courses', 'bookmarks', 'studied']) {
    if (Array.isArray(local[k]) || Array.isArray(remote[k])) {
      merged[k] = Array.from(new Set([...(remote[k] || []), ...(local[k] || [])]));
    }
  }
  if (local.resourceNotes || remote.resourceNotes) {
    merged.resourceNotes = { ...(remote.resourceNotes || {}), ...(local.resourceNotes || {}) };
  }
  return merged;
}

// Higher reps / a further-out due date means more real study progress on that specific card —
// used to pick the "more advanced" copy when the same card (by front+back text) exists on two
// devices independently.
function fsrsWeight(card) {
  return (card.reps || 0) * 1e15 + (card.due ? new Date(card.due).getTime() : 0);
}

/**
 * Merges a freshly-pulled remote snapshot into whatever is already in this browser's Dexie
 * tables (empty, in the common "signing in on a new device" case) and writes the merged result
 * back. Safe to call with remote=null (no-op). Sync push scheduling should stay disabled for
 * the duration of this call (see setSyncEnabled) so this write-back never triggers a push of
 * its own intermediate state.
 */
export async function applyRemoteSnapshot(remote) {
  if (!remote) return;

  const [
    localUser, localLessons, localQuizScores, localFlashRows, localDeckMeta,
    localCatPerf, localAchievements, localStudyDays, localCardReviews,
    localStreakFreezes, localCheckins, localCosmetics, localUnitMastery,
    localPathwayGoals, localCoachThreads, localCoachMessages,
    localSatAttempts, localSatSkillStats, localSatReviewLog,
    localLessonNotes, localLessonHighlights, localLessonFeedback, localLessonProgress,
    localDayActivity, localStreakRewards, localBoosts,
  ] = await Promise.all([
    db.user.toCollection().first(), db.lessons.toArray(), db.quizScores.toArray(),
    db.flashCards.toArray(), db.deckMeta.toArray(), db.catPerf.toArray(),
    db.achievements.toArray(), db.studyDays.toArray(), db.cardReviews.toArray(),
    db.streakFreezes.toArray(), db.checkins.toArray(), db.cosmetics.toArray(),
    db.unitMastery.toArray(), db.pathwayGoals.toArray(), db.coachThreads.toArray(),
    db.coachMessages.toArray(),
    db.satAttempts.toArray(), db.satSkillStats.toArray(), db.satReviewLog.toArray(),
    db.lessonNotes.toArray(), db.lessonHighlights.toArray(),
    db.lessonFeedback.toArray(), db.lessonProgress.toArray(),
    db.dayActivity.toArray(), db.streakRewards.toArray(), db.boosts.toArray(),
  ]);

  // ── profile / XP ──
  const mergedUser = mergeUserRecord(localUser, remote.user);
  if (mergedUser) await saveUser(mergedUser);

  // ── pathway / lessons ──
  const lessonMap = new Map(localLessons.map(r => [r.lessonId, r]));
  for (const r of (remote.lessons || [])) {
    const l = lessonMap.get(r.lessonId);
    if (!l) { lessonMap.set(r.lessonId, r); continue; }
    const bothScores = [l.quizScore, r.quizScore].filter(s => s != null);
    const bothCompleted = [l.completedAt, r.completedAt].filter(Boolean).sort((a, b) => a - b);
    const bothStarted = [l.studyStartedAt, r.studyStartedAt].filter(Boolean).sort((a, b) => a - b);
    const verified = !!(l.verified || r.verified);
    lessonMap.set(r.lessonId, {
      lessonId: r.lessonId,
      verified,
      quizScore: bothScores.length ? Math.max(...bothScores) : null,
      completedAt: bothCompleted[0] || null,
      studying: verified ? false : !!(l.studying || r.studying),
      studyStartedAt: bothStarted[0] || null,
    });
  }
  await db.lessons.clear();
  if (lessonMap.size) await db.lessons.bulkPut([...lessonMap.values()]);

  // ── quiz scores ──
  const quizMap = new Map(localQuizScores.map(r => [r.quizId, r]));
  for (const r of (remote.quizScores || [])) {
    const l = quizMap.get(r.quizId);
    if (!l || r.score > l.score || (r.score === l.score && r.completedAt < l.completedAt)) quizMap.set(r.quizId, r);
  }
  await db.quizScores.clear();
  if (quizMap.size) await db.quizScores.bulkPut([...quizMap.values()]);

  // ── flashcard decks (merged per-deck by front+back content signature) ──
  const localByDeck = {};
  for (const c of localFlashRows) (localByDeck[c.deckName] ||= []).push(c);
  const deckNames = new Set([...Object.keys(localByDeck), ...Object.keys(remote.flashDecks || {})]);
  for (const deckName of deckNames) {
    const localCards = localByDeck[deckName] || [];
    const remoteCards = (remote.flashDecks || {})[deckName] || [];
    const bySig = new Map();
    for (const c of localCards) bySig.set(`${c.front}␟${c.back}`, c);
    for (const c of remoteCards) {
      const sig = `${c.front}␟${c.back}`;
      const existing = bySig.get(sig);
      if (!existing || fsrsWeight(c) > fsrsWeight(existing)) bySig.set(sig, c);
    }
    await db.flashCards.where('deckName').equals(deckName).delete();
    const merged = [...bySig.values()].map(({ id, ...rest }) => ({ ...rest, deckName }));
    if (merged.length) await db.flashCards.bulkAdd(merged);
  }

  // ── deck creation timestamps ──
  const deckMetaMap = new Map(localDeckMeta.map(r => [r.name, r]));
  for (const r of (remote.deckMeta || [])) {
    const l = deckMetaMap.get(r.name);
    if (!l || r.createdAt < l.createdAt) deckMetaMap.set(r.name, r);
  }
  await db.deckMeta.clear();
  if (deckMetaMap.size) await db.deckMeta.bulkPut([...deckMetaMap.values()]);

  // ── category performance (additive — see docs note in progressSync.js) ──
  const catMap = new Map(localCatPerf.map(r => [r.category, { ...r }]));
  for (const r of (remote.catPerf || [])) {
    const l = catMap.get(r.category);
    if (l) { l.total += r.total; l.count += r.count; }
    else catMap.set(r.category, { ...r });
  }
  await db.catPerf.clear();
  if (catMap.size) await db.catPerf.bulkPut([...catMap.values()]);

  // ── achievements ──
  const achMap = new Map(localAchievements.map(r => [r.key, r]));
  for (const r of (remote.achievements || [])) {
    const l = achMap.get(r.key);
    if (!l || r.unlockedAt < l.unlockedAt) achMap.set(r.key, r);
  }
  await db.achievements.clear();
  if (achMap.size) await db.achievements.bulkPut([...achMap.values()]);

  // ── earned-streak day ledger ──
  // Credits ADD across devices (a lesson on the laptop + a quiz on the phone is
  // one real day's work), per-action counts add the same way, and `met` is
  // sticky: a day either device considered cleared stays cleared, since both
  // are reporting work that genuinely happened.
  const dayMap = new Map(localDayActivity.map(r => [r.date, { ...r }]));
  for (const r of (remote.dayActivity || [])) {
    const l = dayMap.get(r.date);
    if (!l) { dayMap.set(r.date, { ...r, met: r.met ? 1 : 0 }); continue; }
    const counts = { ...(l.counts || {}) };
    for (const [k, n] of Object.entries(r.counts || {})) counts[k] = (counts[k] || 0) + n;
    const metAts = [l.metAt, r.metAt].filter(Boolean).sort((a, b) => a - b);
    dayMap.set(r.date, {
      date: r.date,
      // Legacy (pre-v17) rows carry credits: 0 with met: 1 — adding them is a
      // no-op, which is the correct outcome: they record that a day happened,
      // not how much was done in it.
      credits: (l.credits || 0) + (r.credits || 0),
      counts,
      goalCredits: Math.max(l.goalCredits || 0, r.goalCredits || 0),
      met: (l.met || r.met) ? 1 : 0,
      metAt: metAts[0] || null,
      legacy: (l.legacy || r.legacy) ? 1 : 0,
    });
  }
  await db.dayActivity.clear();
  if (dayMap.size) await db.dayActivity.bulkPut([...dayMap.values()]);

  // ── streak calendar ── (derived: exactly the cleared days, from either side)
  const dayKeys = new Set([
    ...localStudyDays.map(r => r.date),
    ...(remote.studyDays || []),
    ...[...dayMap.values()].filter(r => r.met).map(r => r.date),
  ]);
  await db.studyDays.clear();
  if (dayKeys.size) await db.studyDays.bulkPut([...dayKeys].map(date => ({ date })));

  // ── streak reward claims (permanent, earliest claim wins) ──
  const rewardMap = new Map(localStreakRewards.map(r => [r.key, r]));
  for (const r of (remote.streakRewards || [])) {
    const l = rewardMap.get(r.key);
    if (!l || r.claimedAt < l.claimedAt) rewardMap.set(r.key, { key: r.key, claimedAt: r.claimedAt });
  }
  await db.streakRewards.clear();
  if (rewardMap.size) await db.streakRewards.bulkPut([...rewardMap.values()]);

  // ── review counts -> synthetic per-day cardReviews rows (see buildSyncSnapshot comment) ──
  // Intentionally still Math.max-per-day, not additive: this only feeds the streak heatmap's
  // per-day "did I study" display, where an approximate distribution is harmless. The count that
  // actually matters (achievement thresholds, the weekly review quest) is the exact,
  // cross-device-additive `user.cardReviewCount`, merged above in mergeUserRecord via the same
  // delta mechanism as xp — see that function's comment.
  const localCounts = {};
  for (const r of localCardReviews) { const k = dateKeyOf(r.reviewedAt); localCounts[k] = (localCounts[k] || 0) + 1; }
  const dateSet = new Set([...Object.keys(localCounts), ...Object.keys(remote.reviewCountsByDate || {})]);
  const mergedReviewRows = [];
  for (const date of dateSet) {
    const n = Math.max(localCounts[date] || 0, (remote.reviewCountsByDate || {})[date] || 0);
    const ts = new Date(`${date}T12:00:00.000Z`).getTime();
    for (let i = 0; i < n; i++) mergedReviewRows.push({ cardId: null, reviewedAt: ts });
  }
  await db.cardReviews.clear();
  if (mergedReviewRows.length) await db.cardReviews.bulkAdd(mergedReviewRows);

  // ── streak freezes ──
  const freezeMap = new Map(localStreakFreezes.map(r => [r.earnedAt, r]));
  for (const r of (remote.streakFreezes || [])) {
    const l = freezeMap.get(r.earnedAt);
    freezeMap.set(r.earnedAt, { earnedAt: r.earnedAt, usedOn: (l && l.usedOn) || r.usedOn || null });
  }
  await db.streakFreezes.clear();
  if (freezeMap.size) await db.streakFreezes.bulkPut([...freezeMap.values()]);

  // ── XP boosts ──
  // Union by `startedAt`, keeping the LATER expiry when both sides have the same grant: a boost
  // extended on the phone and not on the laptop should end when the phone says it ends. Anything
  // already expired is dropped rather than merged, so a stale snapshot cannot resurrect one.
  {
    const now = Date.now();
    const boostMap = new Map(localBoosts.filter(b => (b.expiresAt || 0) > now).map(b => [b.startedAt, b]));
    for (const r of (remote.boosts || [])) {
      if ((r.expiresAt || 0) <= now) continue;
      const l = boostMap.get(r.startedAt);
      boostMap.set(r.startedAt, {
        kind: r.kind, startedAt: r.startedAt, source: r.source || null,
        expiresAt: Math.max(l?.expiresAt || 0, r.expiresAt || 0),
      });
    }
    await db.boosts.clear();
    if (boostMap.size) await db.boosts.bulkPut([...boostMap.values()]);
  }

  // ── daily check-ins ──
  const checkinMap = new Map(localCheckins.map(r => [r.date, r]));
  for (const r of (remote.checkins || [])) if (!checkinMap.has(r.date)) checkinMap.set(r.date, r);
  await db.checkins.clear();
  if (checkinMap.size) await db.checkins.bulkPut([...checkinMap.values()]);

  // ── cosmetics ──
  const cosMap = new Map(localCosmetics.map(r => [r.key, r]));
  for (const r of (remote.cosmetics || [])) {
    const l = cosMap.get(r.key);
    if (!l || r.unlockedAt < l.unlockedAt) cosMap.set(r.key, r);
  }
  await db.cosmetics.clear();
  if (cosMap.size) await db.cosmetics.bulkPut([...cosMap.values()]);

  // ── unit mastery ──
  const unitMap = new Map(localUnitMastery.map(r => [`${r.pathwayKey}::${r.unitId}`, r]));
  for (const r of (remote.unitMastery || [])) {
    const k = `${r.pathwayKey}::${r.unitId}`;
    const l = unitMap.get(k);
    if (!l || (r.score || 0) > (l.score || 0)) {
      const verifiedAtCandidates = [l?.verifiedAt, r.verifiedAt].filter(Boolean).sort((a, b) => a - b);
      unitMap.set(k, { ...r, verifiedAt: verifiedAtCandidates[0] || r.verifiedAt });
    }
  }
  await db.unitMastery.clear();
  if (unitMap.size) await db.unitMastery.bulkPut([...unitMap.values()]);

  // ── pathway pacing goals ──
  // A goal is now editable at any time (see setPathwayGoal), so "whoever started first wins" is
  // no longer the right rule on its own — a target changed on a phone must not be reverted by a
  // laptop still holding the original. The most recent EDIT wins; goals written before
  // `updatedAt` existed fall back to the old earliest-start rule so nothing regresses.
  const goalMap = new Map(localPathwayGoals.map(r => [r.pathwayKey, r]));
  for (const r of (remote.pathwayGoals || [])) {
    const l = goalMap.get(r.pathwayKey);
    if (!l) { goalMap.set(r.pathwayKey, r); continue; }
    if (r.updatedAt || l.updatedAt) {
      if ((r.updatedAt || 0) > (l.updatedAt || 0)) goalMap.set(r.pathwayKey, r);
    } else if (r.startedAt < l.startedAt) {
      goalMap.set(r.pathwayKey, r);
    }
  }
  await db.pathwayGoals.clear();
  if (goalMap.size) await db.pathwayGoals.bulkPut([...goalMap.values()]);

  // ── Medabrain chat threads (merged by creation time; thread/message ids are per-device) ──
  const localMsgsByThread = {};
  for (const m of localCoachMessages) (localMsgsByThread[m.threadId] ||= []).push(m);
  const localThreadByKey = new Map(localCoachThreads.map(t => [t.createdAt, t]));
  for (const rt of (remote.coachThreads || [])) {
    const existing = localThreadByKey.get(rt.key);
    if (existing) {
      const existingMsgs = localMsgsByThread[existing.id] || [];
      const seen = new Set(existingMsgs.map(m => `${m.role}␟${m.ts}`));
      const toAdd = (rt.messages || []).filter(m => !seen.has(`${m.role}␟${m.ts}`));
      if (toAdd.length) await db.coachMessages.bulkAdd(toAdd.map(m => ({ threadId: existing.id, role: m.role, content: m.content, ts: m.ts })));
      if ((rt.updatedAt || 0) > (existing.updatedAt || 0)) await db.coachThreads.update(existing.id, { updatedAt: rt.updatedAt });
    } else {
      const newId = await db.coachThreads.add({ title: rt.title, createdAt: rt.createdAt, updatedAt: rt.updatedAt });
      if ((rt.messages || []).length) {
        await db.coachMessages.bulkAdd(rt.messages.map(m => ({ threadId: newId, role: m.role, content: m.content, ts: m.ts })));
      }
    }
  }

  // ── SAT attempts + responses ──
  // Attempts are additive and immutable once complete, so merging is just
  // "insert anything this device has not seen", keyed by startedAt. Responses
  // follow their attempt: we only insert responses for attempts we actually
  // created here, which keeps them from being orphaned by the sync cap.
  const localAttemptKeys = new Set(localSatAttempts.map(a => a.startedAt));
  const remoteResponsesByAttempt = {};
  for (const r of (remote.satResponses || [])) {
    (remoteResponsesByAttempt[r.attemptKey] ||= []).push(r);
  }
  for (const ra of (remote.satAttempts || [])) {
    if (localAttemptKeys.has(ra.key)) continue;
    const newId = await db.satAttempts.add({
      kind: ra.kind, section: ra.section, status: 'complete',
      startedAt: ra.startedAt, finishedAt: ra.finishedAt,
      questionIds: ra.questionIds || [], result: ra.result || null, meta: ra.meta || {},
    });
    const responses = remoteResponsesByAttempt[ra.key] || [];
    if (responses.length) {
      await db.satResponses.bulkAdd(responses.map(r => ({
        attemptId: newId, questionId: r.questionId, skill: r.skill,
        correct: !!r.correct, choice: r.choice, seconds: r.seconds,
        flagged: !!r.flagged, answeredAt: r.answeredAt,
      })));
    }
  }

  // ── SAT skill stats ──
  // Keep whichever copy is backed by more attempts; a device that has answered
  // more questions holds the better estimate.
  const statMap = new Map(localSatSkillStats.map(s => [s.skill, s]));
  for (const rs of (remote.satSkillStats || [])) {
    const local = statMap.get(rs.skill);
    if (!local || (rs.attempts || 0) > (local.attempts || 0)) statMap.set(rs.skill, rs);
  }
  if (statMap.size) await db.satSkillStats.bulkPut([...statMap.values()]);

  // ── SAT review log ──
  // Resolved wins over unresolved (the student did the work somewhere), and
  // miss counts take the larger of the two.
  const reviewMap = new Map(localSatReviewLog.map(r => [r.questionId, r]));
  for (const rr of (remote.satReviewLog || [])) {
    const local = reviewMap.get(rr.questionId);
    if (!local) { reviewMap.set(rr.questionId, rr); continue; }
    reviewMap.set(rr.questionId, {
      ...local,
      missCount: Math.max(local.missCount || 1, rr.missCount || 1),
      resolved: (local.resolved || rr.resolved) ? 1 : 0,
      resolvedAt: local.resolvedAt || rr.resolvedAt || null,
      errorType: local.errorType || rr.errorType || null,
      // The further-out due date reflects the more advanced FSRS state.
      due: Math.max(local.due || 0, rr.due || 0) || null,
      fsrsState: (rr.due || 0) > (local.due || 0) ? rr.fsrsState : local.fsrsState,
    });
  }
  await db.satReviewLog.clear();
  if (reviewMap.size) {
    await db.satReviewLog.bulkAdd([...reviewMap.values()].map(({ id, ...rest }) => rest));
  }

  // ── lesson notes (newer edit wins per lesson) ──
  const noteMap = new Map(localLessonNotes.map(r => [r.lessonId, r]));
  for (const r of (remote.lessonNotes || [])) {
    const l = noteMap.get(r.lessonId);
    if (!l || (r.updatedAt || 0) > (l.updatedAt || 0)) noteMap.set(r.lessonId, r);
  }
  await db.lessonNotes.clear();
  if (noteMap.size) await db.lessonNotes.bulkPut([...noteMap.values()]);

  // ── lesson highlights (union, de-duped by lesson+section+range) ──
  const hlSig = (h) => `${h.lessonId}::${h.sectionIdx}::${h.start}::${h.end}`;
  const hlMap = new Map(localLessonHighlights.map(r => [hlSig(r), r]));
  for (const r of (remote.lessonHighlights || [])) {
    const sig = hlSig(r);
    if (!hlMap.has(sig)) hlMap.set(sig, r);
  }
  await db.lessonHighlights.clear();
  if (hlMap.size) await db.lessonHighlights.bulkAdd([...hlMap.values()].map(({ id, ...rest }) => rest));

  // ── lesson difficulty feedback (union — every answer is history worth keeping) ──
  // Deliberately additive rather than last-write-wins: two answers on the same lesson from two
  // devices are two real moments, and the pattern across all of them is what Medabrain reads.
  // Deduped on lesson+timestamp+rating, which is exactly one physical tap.
  const fbSig = (f) => `${f.lessonId}␟${f.createdAt}␟${f.rating}`;
  const fbMap = new Map(localLessonFeedback.map(r => [fbSig(r), r]));
  for (const r of (remote.lessonFeedback || [])) {
    const sig = fbSig(r);
    const local = fbMap.get(sig);
    // Same tap seen on both devices: keep whichever copy actually carries the generated text,
    // since the device that was offline when the answer was given has the row but not the reply.
    if (!local) fbMap.set(sig, r);
    else if (!local.aiText && r.aiText) fbMap.set(sig, { ...local, aiText: r.aiText, resources: r.resources || local.resources, status: r.status || local.status });
  }
  await db.lessonFeedback.clear();
  if (fbMap.size) await db.lessonFeedback.bulkAdd([...fbMap.values()].map(({ id, ...rest }) => rest));

  // ── per-lesson player progress (furthest-along copy wins, per lesson) ──
  // Not simply "newest updatedAt": a device that merely OPENED a lesson would then overwrite
  // another device's record of having finished the article and the video. Progress through a
  // lesson only ever moves forward, so the merge takes the union of what each device has
  // actually completed, and only lets the newer row decide the current step.
  const progMap = new Map(localLessonProgress.map(r => [r.lessonId, r]));
  for (const r of (remote.lessonProgress || [])) {
    const l = progMap.get(r.lessonId);
    if (!l) { progMap.set(r.lessonId, r); continue; }
    const newer = (r.updatedAt || 0) > (l.updatedAt || 0) ? r : l;
    progMap.set(r.lessonId, {
      ...l,
      articleRead: !!(l.articleRead || r.articleRead),
      videoWatched: !!(l.videoWatched || r.videoWatched),
      articleScrollPct: Math.max(l.articleScrollPct || 0, r.articleScrollPct || 0),
      articleConfirmedAt: l.articleConfirmedAt || r.articleConfirmedAt || null,
      videoConfirmedAt: l.videoConfirmedAt || r.videoConfirmedAt || null,
      lastOpenedAt: Math.max(l.lastOpenedAt || 0, r.lastOpenedAt || 0) || null,
      step: newer.step || l.step || r.step || null,
      updatedAt: Math.max(l.updatedAt || 0, r.updatedAt || 0),
    });
  }
  await db.lessonProgress.clear();
  if (progMap.size) await db.lessonProgress.bulkPut([...progMap.values()]);
}

// ── SAT ───────────────────────────────────────────────────────────────────────
// Attempt lifecycle: createSatAttempt() -> recordSatResponse()* -> finishSatAttempt().
// An attempt left in 'in_progress' is resumable; the full-test player relies on
// that to survive a refresh mid-module (see `deadline` on the attempt row, which
// is stored as an absolute wall-clock timestamp, NOT a remaining-seconds
// countdown — a countdown would silently gain the student time on every reload).

/** kind: 'diagnostic' | 'drill' | 'timed' | 'full' | 'review' */
export async function createSatAttempt(attempt) {
  const id = await db.satAttempts.add({
    kind: 'drill', status: 'in_progress', startedAt: Date.now(),
    section: null, questionIds: [], meta: {}, ...attempt,
  });
  pushDirty();
  return id;
}

export async function getSatAttempt(id) {
  return db.satAttempts.get(id);
}

export async function updateSatAttempt(id, patch) {
  await db.satAttempts.update(id, patch);
  pushDirty();
}

export async function finishSatAttempt(id, result = {}) {
  await db.satAttempts.update(id, { status: 'complete', finishedAt: Date.now(), ...result });
  const attempt = await db.satAttempts.get(id);
  logStudyEvent(attempt?.kind === 'diagnostic' ? 'sat_diagnostic_completed' : 'sat_attempt_completed', attempt?.kind || null).catch(() => {});
  pushDirty();
}

export async function getSatAttempts({ kind, status, limit } = {}) {
  let rows = await db.satAttempts.toArray();
  if (kind) rows = rows.filter(r => r.kind === kind);
  if (status) rows = rows.filter(r => r.status === status);
  rows.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
  return limit ? rows.slice(0, limit) : rows;
}

/** The single resumable attempt, if one exists. Used by the full-test panel. */
export async function getResumableSatAttempt() {
  const rows = await getSatAttempts({ status: 'in_progress' });
  return rows[0] || null;
}

/** Abandon any stale in-progress attempts (e.g. a test started weeks ago). */
export async function abandonSatAttempt(id) {
  await db.satAttempts.update(id, { status: 'abandoned', finishedAt: Date.now() });
  pushDirty();
}

export async function recordSatResponse(response) {
  const id = await db.satResponses.add({ answeredAt: Date.now(), ...response });
  pushDirty();
  return id;
}

export async function getSatResponses({ attemptId, skill, since } = {}) {
  let rows;
  if (attemptId != null) rows = await db.satResponses.where('attemptId').equals(attemptId).toArray();
  else if (skill) rows = await db.satResponses.where('skill').equals(skill).toArray();
  else rows = await db.satResponses.toArray();
  if (since) rows = rows.filter(r => (r.answeredAt || 0) >= since);
  return rows.sort((a, b) => (a.answeredAt || 0) - (b.answeredAt || 0));
}

/** Question ids the student has already seen — so drills don't repeat them. */
export async function getSeenSatQuestionIds() {
  const rows = await db.satResponses.toArray();
  return new Set(rows.map(r => r.questionId));
}

export async function getSatSkillStats() {
  return db.satSkillStats.toArray();
}

export async function saveSatSkillStat(stat) {
  await db.satSkillStats.put(stat);
  pushDirty();
}

export async function saveSatSkillStats(stats) {
  if (!stats?.length) return;
  await db.satSkillStats.bulkPut(stats);
  pushDirty();
}

// ── Review log ──
// One row per missed question. `resolved` is 0/1 rather than a boolean because
// IndexedDB cannot index booleans, and this store is queried by `resolved`.
export async function addSatReviewEntry(entry) {
  const existing = await db.satReviewLog.where('questionId').equals(entry.questionId).first();
  if (existing) {
    // Missing the same question twice is a stronger signal, not a duplicate row.
    await db.satReviewLog.update(existing.id, {
      missCount: (existing.missCount || 1) + 1,
      resolved: 0,
      due: entry.due ?? existing.due,
      lastMissedAt: Date.now(),
      errorType: entry.errorType ?? existing.errorType,
    });
    pushDirty();
    return existing.id;
  }
  const id = await db.satReviewLog.add({
    resolved: 0, missCount: 1, createdAt: Date.now(), lastMissedAt: Date.now(),
    errorType: null, due: Date.now(), fsrsState: null, ...entry,
  });
  pushDirty();
  return id;
}

export async function getSatReviewLog({ includeResolved = false } = {}) {
  const rows = await db.satReviewLog.toArray();
  const filtered = includeResolved ? rows : rows.filter(r => !r.resolved);
  return filtered.sort((a, b) => (a.due || 0) - (b.due || 0));
}

export async function updateSatReviewEntry(id, patch) {
  await db.satReviewLog.update(id, patch);
  pushDirty();
}

export async function resolveSatReviewEntry(id) {
  await db.satReviewLog.update(id, { resolved: 1, resolvedAt: Date.now() });
  pushDirty();
}

// ── AI question cache (local-only; regenerable, so excluded from sync) ──
export async function getSatAiCache(key) {
  return db.satAiCache.get(key);
}
export async function putSatAiCache(key, questions) {
  await db.satAiCache.put({ key, questions, createdAt: Date.now() });
}

// ── SAT baseline (adaptive placement test) ────────────────────────────────────
// Written on EVERY answer, not just at the end. A baseline is 35 generated
// questions and roughly forty minutes of a student's afternoon; losing it to a
// closed tab or a dead battery is not an acceptable failure, and the whole
// session object is small enough (a few tens of KB) that persisting it per
// answer costs nothing measurable.

export async function createSatBaseline(session) {
  const id = await db.satBaselines.add({ status: 'in_progress', ...session, startedAt: session.startedAt || Date.now() });
  pushDirty();
  return id;
}

export async function updateSatBaseline(id, patch) {
  await db.satBaselines.update(id, patch);
  pushDirty();
}

export async function finishSatBaseline(id, result) {
  await db.satBaselines.update(id, { status: 'complete', finishedAt: Date.now(), result });
  logStudyEvent('sat_baseline_completed', null).catch(() => {});
  pushDirty();
}

export async function abandonSatBaseline(id) {
  await db.satBaselines.update(id, { status: 'abandoned', finishedAt: Date.now() });
  pushDirty();
}

/** Completed baselines, newest first. */
export async function getSatBaselines({ limit } = {}) {
  const rows = (await db.satBaselines.toArray())
    .filter(r => r.status === 'complete')
    .sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0));
  return limit ? rows.slice(0, limit) : rows;
}

/**
 * The one resumable baseline, if any.
 *
 * An in-progress row older than a day is abandoned rather than offered: the
 * adaptive estimate is built from a continuous run, and a student picking up
 * question 20 a week later is a different student answering under different
 * conditions. Resuming that would produce a number neither of them earned.
 */
export async function getResumableSatBaseline() {
  const rows = (await db.satBaselines.toArray()).filter(r => r.status === 'in_progress');
  let live = null;
  for (const row of rows) {
    const stale = Date.now() - (row.startedAt || 0) > 24 * 60 * 60 * 1000;
    if (stale) await db.satBaselines.update(row.id, { status: 'abandoned', finishedAt: Date.now() });
    else if (!live || (row.startedAt || 0) > (live.startedAt || 0)) live = row;
  }
  return live;
}

// ── Track outbox (durable "Track" intents) ────────────────────────────────────
// Plain CRUD only — the retry/dedupe/flush policy lives in src/lib/trackQueue.js. None of these
// call pushDirty(): this store is deliberately device-local (see the v13 comment above).
export async function getTrackQueue() {
  return db.trackQueue.orderBy('queuedAt').toArray();
}
export async function findTrackQueueEntry(resource, dedupeKey) {
  return db.trackQueue.where('dedupeKey').equals(dedupeKey).filter(e => e.resource === resource).first();
}
export async function addTrackQueueEntry(entry) {
  return db.trackQueue.add({ status: 'pending', attempts: 0, lastError: null, queuedAt: Date.now(), ...entry });
}
export async function updateTrackQueueEntry(id, patch) {
  await db.trackQueue.update(id, patch);
}
export async function deleteTrackQueueEntry(id) {
  await db.trackQueue.delete(id);
}

// ── Cross-device counter sync (delta baseline) ────────────────────────────────
// xp / aiChatCount / interviewCount / cardReviewCount are denormalized totals mutated directly
// by many call sites across the app (the `saveUser({...user, xp: user.xp+n})` shape). Naively
// syncing "the current absolute value" and merging two devices' absolutes with Math.max silently
// drops whichever device's independent gain since the last sync was smaller — see
// mergeUserRecord's comment above. Instead each device tracks how much of its current total it
// has already reported to the server (this table) and reports only the increment since then; the
// server always ADDS incoming deltas (api/progress-sync.js's bump_progress_counters RPC), never
// overwrites. See src/lib/progressSync.js for the push side.
//
// claimSyncDelta()/commitSyncDelta() are a claim/commit pair, each its own Dexie transaction, so
// two tabs of the SAME browser flushing near-simultaneously can't both compute and send the same
// increment — IndexedDB serializes transactions against the same object store even across tabs
// of one origin, so the second tab's claim always observes the first tab's already-advanced
// state (or its still-pending claim, handled below) rather than a stale snapshot. A claim that's
// never committed (its tab closed or crashed mid-request) self-heals after PENDING_STALE_MS —
// the next attempt, from any tab, reclaims it instead of stalling sync forever.
const COUNTER_FIELDS = ['xp', 'aiChatCount', 'interviewCount', 'cardReviewCount'];
const PENDING_STALE_MS = 30000;

async function getBaselineRow() {
  return (await db.syncBaseline.get('counters')) ||
    { key: 'counters', xp: 0, aiChatCount: 0, interviewCount: 0, cardReviewCount: 0, pending: null, pendingSince: null };
}

/** Atomically claims the not-yet-reported increment since the last confirmed sync, across all
 *  four counters. Returns null if a claim is already in flight and still fresh (another push —
 *  this tab or another — is currently sending it), or if there's genuinely nothing new. */
export async function claimSyncDelta() {
  return db.transaction('rw', db.syncBaseline, db.user, async () => {
    const row = await getBaselineRow();
    if (row.pending) {
      const age = Date.now() - (row.pendingSince || 0);
      if (age < PENDING_STALE_MS) return null; // a live claim is already in flight elsewhere
      // Stale: the attempt that claimed this almost certainly crashed/closed before committing.
      // Fold it back into the confirmed baseline as a no-op (its amount is still sitting in the
      // live user record, so the recompute below naturally reclaims it) and continue.
    }
    const confirmed = row.pending
      ? { xp: row.xp, aiChatCount: row.aiChatCount, interviewCount: row.interviewCount, cardReviewCount: row.cardReviewCount }
      : row;
    const u = await db.user.toCollection().first();
    const deltas = {};
    let hasAny = false;
    for (const f of COUNTER_FIELDS) {
      const d = Math.max(0, (u?.[f] || 0) - (confirmed[f] || 0));
      deltas[f] = d;
      if (d > 0) hasAny = true;
    }
    if (!hasAny) {
      if (row.pending) await db.syncBaseline.put({ ...row, pending: null, pendingSince: null });
      return null;
    }
    await db.syncBaseline.put({ ...row, ...confirmed, pending: deltas, pendingSince: Date.now() });
    return deltas;
  });
}

/** Resolves the in-flight claim: folds it into the confirmed baseline on success, or releases it
 *  (without losing the underlying local progress, which is simply reclaimed by the next attempt)
 *  on failure. */
export async function commitSyncDelta(success) {
  return db.transaction('rw', db.syncBaseline, async () => {
    const row = await getBaselineRow();
    if (!row.pending) return;
    if (success) {
      const next = { ...row, pending: null, pendingSince: null };
      for (const f of COUNTER_FIELDS) next[f] = (row[f] || 0) + (row.pending[f] || 0);
      await db.syncBaseline.put(next);
    } else {
      await db.syncBaseline.put({ ...row, pending: null, pendingSince: null });
    }
  });
}

/** Re-anchors the confirmed baseline to a just-pulled/merged user record — call once per app
 *  load, right after applyRemoteSnapshot(), so the first delta computed this session is relative
 *  to what the server already has. Without this, a fresh sign-in (baseline still at 0) would
 *  re-report this device's *entire* existing total as "new" on its very first push. */
export async function resetSyncBaseline(user) {
  const next = { key: 'counters', pending: null, pendingSince: null };
  for (const f of COUNTER_FIELDS) next[f] = user?.[f] || 0;
  await db.syncBaseline.put(next);
}

/** Called after every successful push with the server's response, which reflects every device's
 *  contributions (including any that landed since this device's last pull). Bumps local counters
 *  UP to match (never down — this device may have earned more locally during the round trip) and
 *  — critically — advances the confirmed baseline to the same values in the same transaction. If
 *  only `user.<field>` were bumped and the baseline were left behind, the next claimSyncDelta
 *  would see local-minus-old-baseline as a fresh "new" delta and re-report another device's
 *  already-confirmed contribution right back to the server, double-counting it. */
export async function absorbAuthoritativeCounters(counters) {
  if (!counters) return;
  return db.transaction('rw', db.syncBaseline, db.user, async () => {
    const u = await db.user.toCollection().first();
    const row = await getBaselineRow();
    const userPatch = {};
    const nextBaseline = { ...row };
    for (const f of COUNTER_FIELDS) {
      if (counters[f] == null) continue;
      userPatch[f] = Math.max(u?.[f] || 0, counters[f]);
      nextBaseline[f] = Math.max(row[f] || 0, counters[f]);
    }
    if (u && Object.keys(userPatch).length) await db.user.update(u.id, userPatch);
    await db.syncBaseline.put(nextBaseline);
  });
}

/** Re-anchors the counters after a mid-session merge of another device's snapshot (the 409
 *  conflict path in src/lib/progressSync.js — see absorbConflict there).
 *
 *  applyRemoteSnapshot has just replaced this device's four counters with the server's totals,
 *  because mergeUserRecord treats the server as authoritative for them. That is right, and on
 *  the boot path resetSyncBaseline immediately after it is all that is needed. Mid-session it
 *  is not enough, because there is a third quantity in play: the increment this device had
 *  already claimed for the push that was just refused.
 *
 *  Releasing that claim alone would lose it — the local total it was computed from has just been
 *  overwritten by the server's — and re-anchoring the baseline alone would silently re-report
 *  every other device's contribution as this device's own on the next push. So both are done
 *  together, in one transaction:
 *
 *    baseline := server total          — what is genuinely already confirmed
 *    local    := server total + delta  — every device's work, including this one's unsent gain
 *
 *  which leaves the next claimSyncDelta computing exactly `delta` again, reported exactly once.
 *
 *  `pending` is deliberately not cleared here: the caller resolves its own claim before calling,
 *  and a pending flag still set at this point belongs to another tab's in-flight push, which
 *  self-heals after PENDING_STALE_MS.
 */
export async function rebaseCountersAfterRemoteMerge(deltas) {
  return db.transaction('rw', db.syncBaseline, db.user, async () => {
    const u = await db.user.toCollection().first();
    const row = await getBaselineRow();
    const nextBaseline = { ...row };
    const userPatch = {};
    for (const f of COUNTER_FIELDS) {
      const serverTotal = u?.[f] || 0;   // applyRemoteSnapshot just wrote the server's value here
      nextBaseline[f] = serverTotal;
      const d = (deltas && deltas[f]) || 0;
      if (d) userPatch[f] = serverTotal + d;
    }
    if (u && Object.keys(userPatch).length) await db.user.update(u.id, userPatch);
    await db.syncBaseline.put(nextBaseline);
  });
}

/** Advances the CONFIRMED sync baseline for `field` by `amount` (may be negative, for a
 *  rollback) without going through the claim/commit pending flow. Used exclusively by
 *  rewardClaimQueue.js: XP granted via an idempotent reward claim (checkin/achievement/quest) is
 *  reported to the server through its own dedicated, dedup-safe endpoint, not the generic
 *  counterDeltas path — without this, the next generic flush would see that same local xp growth
 *  as an unreported delta and send it to the server a second time. */
export async function markCounterConfirmed(field, amount) {
  if (!amount) return;
  return db.transaction('rw', db.syncBaseline, async () => {
    const row = await getBaselineRow();
    await db.syncBaseline.put({ ...row, [field]: (row[field] || 0) + amount });
  });
}

// ── Reward claim outbox (durable idempotent-milestone intents) ────────────────
// Plain CRUD only — retry/dedupe/reconcile policy lives in src/lib/rewardClaimQueue.js. Mirrors
// trackQueue.js: the intent (and its `attemptId` — see that file for why a stable per-attempt id
// matters for a lost-response retry) is written here before any network call. Deliberately
// device-local like trackQueue (excluded from buildSyncSnapshot): an unresolved claim intent is
// not progress.
export async function getRewardClaimQueue() {
  return db.rewardClaimQueue.orderBy('queuedAt').toArray();
}
export async function findRewardClaimQueueEntry(claimKey) {
  return db.rewardClaimQueue.where('claimKey').equals(claimKey).first();
}
export async function addRewardClaimQueueEntry(entry) {
  return db.rewardClaimQueue.add({ status: 'pending', attempts: 0, lastError: null, queuedAt: Date.now(), ...entry });
}
export async function updateRewardClaimQueueEntry(id, patch) {
  await db.rewardClaimQueue.update(id, patch);
}
export async function deleteRewardClaimQueueEntry(id) {
  await db.rewardClaimQueue.delete(id);
}

// ── Sync push scheduling ──────────────────────────────────────────────────────
// src/lib/progressSync.js registers a listener here once at app start; every exported mutator
// below that touches a synced table calls pushDirty() so a debounced push follows automatically
// without every call site in App.jsx needing to remember to trigger one. Kept disabled during
// account-switch resets and while applyRemoteSnapshot() is writing back a just-pulled snapshot,
// so neither ever pushes a partial (or, in the account-switch case, empty) snapshot over real
// cloud progress.
let dirtyListener = null;
let syncEnabled = false;
export function setSyncDirtyListener(fn) { dirtyListener = fn; }
export function setSyncEnabled(on) { syncEnabled = !!on; }
export function isSyncEnabled() { return syncEnabled; }
function pushDirty() { if (syncEnabled && dirtyListener) dirtyListener(); }

// ── Full export ────────────────────────────────────────────────────────────────
export async function exportAllData() {
  const data = {
    user: await db.user.toArray(),
    lessons: await db.lessons.toArray(),
    quizScores: await db.quizScores.toArray(),
    achievements: await db.achievements.toArray(),
    studyDays: await db.studyDays.toArray(),
    interviewSessions: await db.interviewSessions.toArray(),
    unitMastery: await db.unitMastery.toArray(),
    pathwayGoals: await db.pathwayGoals.toArray(),
    exportDate: new Date().toISOString(),
    version: '3.0',
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `medschoolprep-backup-${data.exportDate.split('T')[0]}.json`;
  a.click(); URL.revokeObjectURL(url);
}

// ── Full reset ─────────────────────────────────────────────────────────────────
export async function clearAllData() {
  await Promise.all([
    db.user.clear(), db.lessons.clear(), db.quizScores.clear(),
    db.flashCards.clear(), db.catPerf.clear(),
    db.achievements.clear(), db.studyDays.clear(), db.cardReviews.clear(),
    db.clinicalHours.clear(), db.recommenders.clear(), db.interviewSessions.clear(),
    db.streakFreezes.clear(), db.checkins.clear(), db.cosmetics.clear(),
    db.deckMeta.clear(), db.unitMastery.clear(), db.studyEvents.clear(),
    db.pathwayGoals.clear(), db.coachThreads.clear(), db.coachMessages.clear(),
    db.satAttempts.clear(), db.satResponses.clear(), db.satSkillStats.clear(),
    db.satReviewLog.clear(), db.satAiCache.clear(), db.satBaselines.clear(),
    db.lessonNotes.clear(), db.lessonHighlights.clear(),
    db.trackQueue.clear(),
    // Critical on a shared/family device: without clearing these, a different account signing in
    // next would inherit the previous account's sync baseline (corrupting its own delta math from
    // its very first push) and any of its still-queued reward claims.
    db.syncBaseline.clear(), db.rewardClaimQueue.clear(),
    db.dayActivity.clear(), db.streakRewards.clear(), db.boosts.clear(),
  ]);
}
