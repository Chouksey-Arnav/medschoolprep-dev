// src/lib/mmiScorer.js
// Pure JS MMI response scorer — zero API, zero network, instant, offline.
// Scores on 5 dimensions using lexicon matching, structural analysis,
// and vocabulary statistics. Produces the same markdown format as AI feedback.

const TRANSITION_WORDS = [
  'however','furthermore','additionally','moreover','therefore','consequently',
  'on the other hand','in conclusion','in summary','that said','nevertheless',
  'firstly','secondly','thirdly','finally','in contrast','similarly','likewise',
  'as a result','for example','for instance','specifically','importantly',
  'ideally','ultimately','overall','in this case','given that','assuming',
  'to begin','building on','taking into account','it is important','one must consider',
];

const EMPATHY_LEXICON = [
  'understand','feel','concern','compassion','listen','support','respect',
  'dignity','acknowledge','appreciate','perspective','difficult','challenging',
  'important','care','patient','family','distress','worried','anxious',
  'recognize','validate','empathize','sensitive','thoughtful','considerate',
  'wellbeing','safety','trust','honest','transparent','communicate','impact',
  'emotion','experience','struggle','hardship','vulnerable','advocate','navigate',
];

const STRUCTURE_MARKERS = {
  hasIntro:      /^(in this|i would|when (faced|considering)|this (scenario|situation|question)|the (key|main|central)|to (begin|address|start))/i,
  hasConclusion: /(in (conclusion|summary|closing)|ultimately|overall|to (conclude|summarize)|therefore i would|my (final|overall)|in the end)/i,
  hasPosition:   /(i (believe|think|would|feel|consider|argue|suggest)|my position|in my view|from my perspective|i maintain)/i,
};

/**
 * Score an MMI response on 5 dimensions. Returns scores and formatted feedback text.
 * @param {string} answer - The student's typed response
 * @param {{ q: string, type: string, points: string[] }} question - The MMI question object
 * @param {number} timerSeconds - Elapsed time in seconds
 * @returns {{ structure: number, content: number, empathy: number, communication: number, timeScore: number, overall: number, feedbackText: string }}
 */
export function scoreMmiResponse(answer, question, timerSeconds) {
  const lower     = answer.toLowerCase();
  const words     = answer.split(/\s+/).filter(Boolean);
  const sentences = answer.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 5);
  const uniqueWords = new Set(words.map(w => w.toLowerCase().replace(/[^a-z]/g, '').slice(0, 12)));

  // ── 1. Structure (0–10) ─────────────────────────────────────────────────────
  let structure = 2.5;
  const transitionsFound = TRANSITION_WORDS.filter(t => lower.includes(t));
  structure += Math.min(3.0, transitionsFound.length * 0.75);
  if (STRUCTURE_MARKERS.hasIntro.test(answer))      structure += 1.0;
  if (STRUCTURE_MARKERS.hasConclusion.test(lower))  structure += 1.5;
  if (STRUCTURE_MARKERS.hasPosition.test(lower))    structure += 0.5;
  if (sentences.length >= 5)                        structure += 0.5;
  if (sentences.length >= 8)                        structure += 0.5;
  structure = Math.min(10, Math.round(structure * 10) / 10);

  // ── 2. Content (0–10) ───────────────────────────────────────────────────────
  let content = 1.5;
  const allPointWords = question.points.join(' ').toLowerCase()
    .split(/\s+/).filter(w => w.length > 4).map(w => w.replace(/[^a-z]/g, ''));
  const matchedCount = allPointWords.filter(kw => lower.includes(kw)).length;
  const coverageRatio = allPointWords.length > 0 ? matchedCount / allPointWords.length : 0;
  content += coverageRatio * 5.5;
  const pointsCovered = question.points.filter(pt => {
    const ptWords = pt.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    return ptWords.some(w => lower.includes(w));
  }).length;
  content += pointsCovered * 1.0;
  if (words.length >= 120) content += 0.5;
  content = Math.min(10, Math.round(content * 10) / 10);

  // ── 3. Empathy (0–10) ───────────────────────────────────────────────────────
  let empathy = 1.5;
  const empathyFound = EMPATHY_LEXICON.filter(w => lower.includes(w));
  empathy += Math.min(5.0, empathyFound.length * 0.65);
  const highEmpathyTypes = ['Ethics','Communication','Cultural Competency','Personal','Situational'];
  if (highEmpathyTypes.includes(question.type)) {
    empathy += empathyFound.length >= 4 ? 2.5 : empathyFound.length >= 2 ? 1.5 : 0.5;
  } else {
    empathy += empathyFound.length >= 3 ? 1.0 : 0;
  }
  empathy = Math.min(10, Math.round(empathy * 10) / 10);

  // ── 4. Communication (0–10) ─────────────────────────────────────────────────
  let communication = 2.0;
  const vocabDiversity = words.length > 0 ? uniqueWords.size / words.length : 0;
  communication += vocabDiversity * 3.5;
  const sentLengths = sentences.map(s => s.split(/\s+/).length);
  const avgLen = sentLengths.reduce((a, b) => a + b, 0) / Math.max(sentLengths.length, 1);
  if (avgLen >= 8 && avgLen <= 28)   communication += 1.5;
  else if (avgLen >= 5 && avgLen < 8) communication += 0.8;
  if (words.length >= 100 && words.length <= 450) communication += 1.5;
  else if (words.length >= 60 && words.length < 100) communication += 0.8;
  else if (words.length < 40) communication -= 1.0;
  communication = Math.min(10, Math.max(1, Math.round(communication * 10) / 10));

  // ── 5. Time Management (0–10) ────────────────────────────────────────────────
  let timeScore = 3.5;
  if (timerSeconds >= 90 && timerSeconds <= 240)       timeScore = 8.0;
  else if (timerSeconds >= 60 && timerSeconds < 90)    timeScore = 6.5;
  else if (timerSeconds > 240 && timerSeconds <= 360)  timeScore = 7.0;
  else if (timerSeconds > 360)                         timeScore = 5.5;
  else if (timerSeconds < 45)                          timeScore = 3.0;
  if (words.length >= 100 && timerSeconds >= 90 && timerSeconds <= 300) timeScore += 1.5;
  timeScore = Math.min(10, Math.round(timeScore * 10) / 10);

  // ── Overall (weighted average) ────────────────────────────────────────────────
  const overall = Math.round((
    structure    * 0.20 +
    content      * 0.35 +
    empathy      * 0.20 +
    communication * 0.15 +
    timeScore    * 0.10
  ) * 10) / 10;

  // ── Feedback text ─────────────────────────────────────────────────────────────
  const improvements = [];
  if (structure < 6.5)    improvements.push(`Add clearer structure — use phrases like "firstly," "however," or "in conclusion" to guide your response`);
  if (content < 6.0)      improvements.push(`Address the key considerations more directly: **${question.points[0]}**`);
  if (empathy < 6.0 && highEmpathyTypes.includes(question.type)) {
    improvements.push(`Show more empathetic awareness — acknowledge the emotional stakes and human impact of this scenario`);
  }
  if (communication < 6.0) improvements.push(`Vary your sentence length and vocabulary for a more natural, articulate flow`);
  if (words.length < 60)   improvements.push(`Expand your response — aim for at least 100 words to fully develop your reasoning`);
  if (transitionsFound.length === 0) improvements.push(`Use signposting language so the interviewer can follow your reasoning clearly`);

  const strengths = [];
  if (structure >= 7.5)      strengths.push('well-organized response');
  if (content >= 7.5)        strengths.push('strong coverage of key considerations');
  if (empathy >= 7.5)        strengths.push('excellent empathetic language');
  if (communication >= 7.5)  strengths.push('clear and articulate communication');

  const strengthStr = strengths.length > 0
    ? `Your response demonstrated ${strengths.join(' and ')}. `
    : `Your response made a solid attempt at addressing the question. `;

  const improvStr = improvements.length > 0
    ? `To strengthen further: ${improvements[0]}${improvements.length > 1 ? `. Also consider: ${improvements[1]}` : ''}.`
    : `Continue refining your delivery — you are on a strong track.`;

  const structureLabel = structure >= 8 ? `Excellent structure with clear signposting` : structure >= 6.5 ? `Good organization, some transitions present` : structure >= 5 ? `Basic structure present, needs more organization` : `Needs clearer intro, body, and conclusion`;
  const contentLabel   = content >= 8 ? `All key considerations addressed thoroughly` : content >= 6.5 ? `Most considerations covered` : content >= 5 ? `Partial coverage — some key points missed` : `Key considerations need more direct attention`;
  const empathyLabel   = empathy >= 8 ? `Strong empathetic awareness throughout` : empathy >= 6.5 ? `Good empathetic language present` : empathy >= 5 ? `Some empathy shown` : `Acknowledge the human and emotional impact more directly`;
  const commLabel      = communication >= 8 ? `Clear, varied, and professional` : communication >= 6.5 ? `Reasonably clear with room to improve` : communication >= 5 ? `Somewhat clear, work on variety and flow` : `Focus on sentence structure and vocabulary range`;
  const overallLabel   = overall >= 8.5 ? `Excellent response — strong MMI candidate` : overall >= 7 ? `Good response with some areas to develop` : overall >= 5.5 ? `Developing response — keep practicing` : `Needs significant development — review MMI technique`;

  const feedbackText =
    `**Structure:** ${structure}/10 — ${structureLabel}\n` +
    `**Content:** ${content}/10 — ${contentLabel}\n` +
    `**Empathy:** ${empathy}/10 — ${empathyLabel}\n` +
    `**Communication:** ${communication}/10 — ${commLabel}\n` +
    `**Overall:** ${overall}/10 — ${overallLabel}\n\n` +
    `${strengthStr}${improvStr}`;

  return { structure, content, empathy, communication, timeScore, overall, feedbackText };
}
