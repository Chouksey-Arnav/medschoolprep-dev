// ─────────────────────────────────────────────────────────────────────────────
// Dexie.js — IndexedDB wrapper
// Replaces all localStorage with a proper async database.
// Supports: user profile, lessons, quiz scores, flashcards (FSRS state),
//           portfolio, achievements, study sessions, streak calendar.
// ─────────────────────────────────────────────────────────────────────────────
import Dexie from 'dexie';

const db = new Dexie('MedSchoolPrep');

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

// ── User ─────────────────────────────────────────────────────────────────────
export async function getUser() {
  return db.user.toCollection().first();
}
export async function saveUser(u) {
  const existing = await db.user.toCollection().first();
  if (existing) await db.user.update(existing.id, u);
  else await db.user.add({ ...u });
}

// ── Pathway ───────────────────────────────────────────────────────────────────
export async function getPathway() {
  const rows = await db.lessons.toArray();
  return Object.fromEntries(rows.map(r => [r.lessonId, r.completedAt]));
}
export async function setLessonDone(lessonId) {
  await db.lessons.put({ lessonId, completedAt: Date.now() });
}
export async function resetPathway() {
  await db.lessons.clear();
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
}
export async function resetQuizScores() {
  await db.quizScores.clear();
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
}
export async function updateCard(id, updates) {
  await db.flashCards.update(id, updates);
}
export async function deleteDeck(deckName) {
  await db.flashCards.where('deckName').equals(deckName).delete();
}
export async function recordCardReview(cardId) {
  await db.cardReviews.add({ cardId, reviewedAt: Date.now() });
}
export async function getTotalCardReviews() {
  return db.cardReviews.count();
}

// ── Portfolio ─────────────────────────────────────────────────────────────────
export async function getPortfolio() {
  return db.portfolio.toArray();
}
export async function addPortfolioItem(item) {
  return db.portfolio.add(item);
}
export async function deletePortfolioItem(id) {
  await db.portfolio.delete(id);
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
}
export async function resetCatPerf() {
  await db.catPerf.clear();
}

// ── Achievements ──────────────────────────────────────────────────────────────
export async function getAchievements() {
  const rows = await db.achievements.toArray();
  return new Set(rows.map(r => r.key));
}
export async function unlockAchievement(key) {
  try {
    await db.achievements.add({ key, unlockedAt: Date.now() });
    return true; // newly unlocked
  } catch {
    return false; // already existed
  }
}

// ── Streak / Study Days ────────────────────────────────────────────────────────
export async function recordStudyToday() {
  const today = new Date().toISOString().split('T')[0];
  try { await db.studyDays.add({ date: today }); } catch { /* already exists */ }
}
export async function getStreak() {
  const days = await db.studyDays.orderBy('date').reverse().toArray();
  if (!days.length) return 0;
  let streak = 0;
  let check = new Date();
  check.setHours(0,0,0,0);
  for (const { date } of days) {
    const d = new Date(date);
    d.setHours(0,0,0,0);
    const diff = Math.round((check - d) / 86400000);
    if (diff === 0 || diff === 1) {
      streak++;
      check = d;
    } else break;
  }
  return streak;
}
export async function getStudyDaysCount() {
  return db.studyDays.count();
}

// ── MMI Sessions ──────────────────────────────────────────────────────────────
export async function recordMMISession(questionIdx) {
  await db.mmiSessions.add({ questionIdx, answeredAt: Date.now() });
}
export async function getMMICount() {
  return db.mmiSessions.count();
}

// ── Full export ────────────────────────────────────────────────────────────────
export async function exportAllData() {
  const data = {
    user: await db.user.toArray(),
    lessons: await db.lessons.toArray(),
    quizScores: await db.quizScores.toArray(),
    portfolio: await db.portfolio.toArray(),
    achievements: await db.achievements.toArray(),
    studyDays: await db.studyDays.toArray(),
    exportDate: new Date().toISOString(),
    version: '2.0',
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
    db.flashCards.clear(), db.portfolio.clear(), db.catPerf.clear(),
    db.achievements.clear(), db.studyDays.clear(), db.cardReviews.clear(), db.mmiSessions.clear(),
  ]);
}
