// ─────────────────────────────────────────────────────────────────────────────
// Achievement system — definitions and check logic
// ─────────────────────────────────────────────────────────────────────────────

export const ACHIEVEMENTS = {
  first_quiz:   { key:'first_quiz',   name:'First Steps',      desc:'Complete your first quiz',         icon:'🎯', xp:50  },
  perfect_score:{ key:'perfect_score',name:'Perfect Score',    desc:'Score 100% on any quiz',           icon:'⭐', xp:100 },
  quiz_10:      { key:'quiz_10',      name:'Quiz Champion',    desc:'Complete 10 quizzes',              icon:'🏆', xp:150 },
  level_5:      { key:'level_5',      name:'Rising Star',      desc:'Reach Level 5',                   icon:'🌟', xp:200 },
  level_10:     { key:'level_10',     name:'Dedicated Scholar',desc:'Reach Level 10',                  icon:'💎', xp:300 },
  streak_7:     { key:'streak_7',     name:'Week Warrior',     desc:'Study 7 days in a row',           icon:'🔥', xp:250 },
  streak_30:    { key:'streak_30',    name:'Iron Will',        desc:'Study 30 days in a row',          icon:'💪', xp:500 },
  cards_100:    { key:'cards_100',    name:'Card Master',      desc:'Review 100 flashcards',           icon:'🃏', xp:150 },
  unit_master:  { key:'unit_master',  name:'Unit Complete',    desc:'Master all lessons in a unit',    icon:'📚', xp:200 },
  mmi_5:        { key:'mmi_5',        name:'Interview Ready',  desc:'Practice 5 MMI stations',         icon:'🎙️', xp:100 },
  course_half:  { key:'course_half',  name:'Halfway There',    desc:'Complete 50% of the course',      icon:'🏃', xp:300 },
  ai_user:      { key:'ai_user',      name:'AI Powered',       desc:'Use MetaBrain AI Coach 5 times',  icon:'🤖', xp:75  },
};

/** Check which new achievements should be unlocked given current state */
export function checkAchievements({ level, quizCount, perfectScores, streak, cardReviews, mmiCount, mastery, aiChats, unlocked }) {
  const toUnlock = [];
  const check = (key, condition) => { if (condition && !unlocked.has(key)) toUnlock.push(ACHIEVEMENTS[key]); };

  check('first_quiz',    quizCount >= 1);
  check('perfect_score', perfectScores >= 1);
  check('quiz_10',       quizCount >= 10);
  check('level_5',       level >= 5);
  check('level_10',      level >= 10);
  check('streak_7',      streak >= 7);
  check('streak_30',     streak >= 30);
  check('cards_100',     cardReviews >= 100);
  check('unit_master',   mastery >= 33);   // at least 1 of 3 units mastered
  check('mmi_5',         mmiCount >= 5);
  check('course_half',   mastery >= 50);
  check('ai_user',       aiChats >= 5);

  return toUnlock;
}
