// ─────────────────────────────────────────────────────────────────────────────
// In-question AI: hints while a question is open, explanations after it closes.
//
// Item GENERATION moved to src/lib/sat/aiPractice.js — it needs a different
// model, a different temperature, a verification pass and the student's whole
// profile, none of which belong in the same file as a 45-word nudge.
// generateQuestions() below stays as a thin alias so existing callers keep
// working against the single authoring prompt that now lives there.
//
// THE DESIGN RULE HERE IS ABOUT WHAT THE MODEL IS TOLD, NOT WHAT IT IS ASKED.
// hintForQuestion() never receives the answer key or the rationale, so it cannot
// leak them. explainQuestion() receives both, because by then the student has
// answered. A single prompt that carries the key and is merely instructed not to
// reveal it will eventually reveal it — under a student who asks three times,
// under a long conversation, under a jailbreak a sixteen-year-old found on
// TikTok. Withholding the information is the only durable version of that rule.
// ─────────────────────────────────────────────────────────────────────────────
import { skillMeta } from '../../data/sat/taxonomy';
import { strategyFor } from '../../data/sat/strategies';
import { generateForSkill } from './aiPractice';
import { aiLane } from '../aiLane.js';

/**
 * Generate extra practice questions for one skill.
 * @deprecated prefer generatePracticeSet() in aiPractice.js, which personalises
 * across skills. Retained because the Practice panel's drill top-up wants
 * exactly this narrow behavior.
 */
export async function generateQuestions(skillId, { difficulty = 'M', count = 4, profile = null, fresh = false, signal } = {}) {
  return generateForSkill(skillId, { difficulty, count, profile, fresh, signal });
}

/**
 * A nudge for a question the student has NOT answered yet.
 *
 * Returns null on any failure — the caller falls back to the strategy card,
 * which is static, offline, and always available.
 *
 * @param {object} question
 * @param {{profile?:object}} [opts]  the learner profile, used only to pitch the
 *   hint at the right level; never to reveal anything about the item.
 */
export async function hintForQuestion(question, { profile = null, signal } = {}) {
  if (!question) return null;
  const meta = skillMeta(question.skill);
  const strategy = strategyFor(question.skill);

  // What we know about how THIS student fails on THIS skill. A student whose
  // misses are triaged as careless needs "slow down and write the step out";
  // one with a content gap needs the concept named. Same question, opposite
  // hint — and the difference is the whole reason the profile is passed in.
  const skillRecord = profile?.masteryRecordFor?.(question.skill)
    || profile?.masteryMap?.[question.skill]
    || null;
  const personal = [];
  if (skillRecord?.attempts >= 3) {
    personal.push(`They are at ${Math.round((skillRecord.mastery || 0) * 100)}% on this skill over ${skillRecord.attempts} questions.`);
  }
  const topError = profile?.errorMix?.[0];
  if (topError && topError.share >= 0.4) {
    personal.push(`Most of their logged misses are "${topError.label}", so bias the nudge accordingly.`);
  }
  if (profile?.slowSkills?.some(s => s.label === meta.label)) {
    personal.push('They run over the pacing benchmark on this skill — point them at the fastest route in, not the most thorough one.');
  }

  const system = [
    'You are an SAT tutor giving ONE hint on a question the student has not answered yet.',
    'You have NOT been told the correct answer, and you must not claim to know it.',
    'Do not solve the problem. Do not eliminate any answer choice. Do not say which choice looks likely.',
    'Give the first move only: what to notice, what to write down, or the question to ask themselves.',
    'Under 45 words. One or two sentences. No preamble, no sign-off, no encouragement padding.',
    strategy ? `The approach this app teaches for this skill: ${strategy.approach}` : '',
    personal.length ? `About this student: ${personal.join(' ')}` : '',
  ].filter(Boolean).join('\n');

  const message = [
    `SKILL: ${meta.label} (${meta.sectionLabel})`,
    question.stimulus ? `PASSAGE: ${question.stimulus}` : '',
    `QUESTION: ${question.q}`,
    // The choices are included because a hint like "compare the two that differ
    // only in punctuation" needs to see them. The key is not.
    question.format === 'mcq'
      ? `CHOICES: ${question.ch.map((c, i) => `${'ABCD'[i]}) ${c}`).join(' | ')}`
      : 'FORMAT: the student types a number. There are no choices.',
  ].filter(Boolean).join('\n');

  try {
    const res = await fetch('/api/groq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({ system, message, purpose: 'sat', tier: 'guide', temperature: 0.5, maxTokens: 160, lane: aiLane() }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.content?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Explain a question the student has already answered, grounded in the item's
 * own rationale so the model teaches rather than invents a second, competing
 * explanation the student then has to reconcile.
 */
export async function explainQuestion(question, chosenIndex, { profile = null, signal } = {}) {
  if (!question) return null;
  const chosen = question.format === 'mcq' && chosenIndex != null ? question.ch[chosenIndex] : null;

  const topError = profile?.errorMix?.[0];
  const system = [
    'You are a patient SAT tutor. A student has just answered this question and wants it explained.',
    'You are given the question, the correct answer, and the rationale it shipped with.',
    'Explain the reasoning in plain language, under 130 words.',
    'Do NOT contradict the given rationale. Do NOT invent facts that are not in the question.',
    'Address why their specific choice was tempting, then give the one check that would have caught it.',
    topError ? `This student's misses are mostly "${topError.label}" — frame the takeaway around avoiding that.` : '',
    'Use $...$ for any mathematics. No preamble.',
  ].filter(Boolean).join('\n');

  const message = [
    `QUESTION: ${question.q}`,
    question.stimulus ? `PASSAGE: ${question.stimulus}` : '',
    question.format === 'mcq' ? `CHOICES: ${question.ch.map((c, i) => `${'ABCD'[i]}) ${c}`).join(' | ')}` : '',
    question.format === 'mcq' ? `CORRECT: ${'ABCD'[question.ans]}` : '',
    chosen ? `STUDENT CHOSE: ${chosen}` : '',
    `RATIONALE THIS ITEM SHIPPED WITH: ${question.exp}`,
    question.trap ? `THE MISTAKE THIS ITEM IS BUILT TO CATCH: ${String(question.trap).replace(/_/g, ' ')}` : '',
  ].filter(Boolean).join('\n');

  try {
    const res = await fetch('/api/groq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({ system, message, purpose: 'sat', tier: 'guide', temperature: 0.4, maxTokens: 380, lane: aiLane() }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.content || null;
  } catch {
    return null;
  }
}
