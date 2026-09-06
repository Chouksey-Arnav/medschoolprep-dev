// ─────────────────────────────────────────────────────────────────────────────
// Module 13 — interview alignment.
//
// ── PREMIUM ROADMAP ─────────────────────────────────────────────────────────
// Part of the Narrative Method Engine, planned as a paid tier. See PREMIUM in
// ./constants.js.
// ────────────────────────────────────────────────────────────────────────────
//
//     C_interview = cos(V_interview, V_theme)
//
// The interview is not a second application. It is an alignment check: the
// question a reader is answering is whether the person in the room is the
// person in the file. So this module compares what a student SAYS against what
// they WROTE, and reports the gap.
//
// ── Why a low score is not a bad interview ─────────────────────────────────
// A student can give a warm, articulate, likeable interview that has nothing to
// do with their written narrative, and that is the specific failure this module
// catches — one no other part of an application review does. The output is
// therefore never "your interview was weak"; it is "these two things are about
// different subjects", with both subjects named.
//
// ── The app already scores interview PERFORMANCE ───────────────────────────
// src/lib/interviewScore.js, interviewFeedback.js and mmiRubric.js grade
// content, structure and delivery for MMI and CASPer. This module does not
// duplicate any of that and scores exactly one thing: coherence with the
// written theme. Where both are available the panel shows them side by side,
// because they genuinely answer different questions.
// ─────────────────────────────────────────────────────────────────────────────

import { INTERVIEW, clamp } from './constants.js';
import {
  vectorize, cosine, thematicSimilarity, speakingRate, fillerRate, wordCount, sentences, tokenize,
} from './text.js';

/** See the note beside `alignment` below. */
export const INTERVIEW_CALIBRATION = 0.32;

/**
 * @param {Object} opts
 * @param {string} opts.transcript      what the student said
 * @param {string} opts.themeText       the written narrative: personal statement,
 *                                      VBT statement, and activity descriptions
 * @param {number} [opts.durationSeconds]
 */
export function scoreInterviewAlignment({ transcript = '', themeText = '', durationSeconds = null, themeDecisive = null } = {}) {
  const t = String(transcript || '').trim();
  const w = String(themeText || '').trim();

  if (wordCount(t) < 20) return { available: false, note: 'Under twenty words of transcript. Record a two-minute answer and this becomes readable.' };
  if (wordCount(w) < 40) return { available: false, note: 'Not enough written narrative to compare against. This needs your personal statement or your theme statement on file.' };

  const vInterview = vectorize(t);
  const vTheme = vectorize(w);

  // Reported on both measures, because they disagree in an informative way: a
  // student who uses entirely different words for the same idea scores low on
  // cosine and higher on the blended measure, and that gap is itself the
  // finding — "you are talking about the right thing in words nobody can match
  // to your file".
  const strict = cosine(vInterview, vTheme);
  const blended = thematicSimilarity(vInterview, vTheme);
  // Calibrated, for the same reason the differentiation and theme modules are
  // (see their headers): the specification's 0.80 target is defined against
  // dense embeddings, and a two-minute spoken answer measured lexically against
  // a 500-word written file cannot reach it — the length asymmetry alone caps
  // the raw number near 0.35 even for a student saying exactly what they wrote.
  //
  // 0.32 is the reference: what a transcript that genuinely restates the file
  // reaches on this measure. Uncalibrated, every student in every benchmark
  // profile was reported as disconnected, including the ones who are not,
  // which is a metric that has stopped distinguishing anything.
  const alignment = clamp(blended / INTERVIEW_CALIBRATION, 0, 1);

  const disconnect = alignment < INTERVIEW.disconnectBelow;
  const meetsTarget = alignment >= INTERVIEW.target;

  // ── Delivery ────────────────────────────────────────────────────────────
  const pacing = speakingRate(t, durationSeconds);
  const filler = fillerRate(t);
  const sents = sentences(t);
  const meanSentence = sents.length ? tokenize(t).length / sents.length : 0;

  const delivery = [];
  if (pacing.wpm && pacing.wpm > INTERVIEW.pacingCeilingWpm) {
    delivery.push({
      id: 'pacing', severity: 'medium',
      label: `${pacing.wpm} words per minute`,
      detail: `Above ${INTERVIEW.pacingCeilingWpm} reads as hurried, and hurried reads as anxious rather than as eager. The fix is not talking slower — it is finishing a thought and then stopping, which produces the pauses on its own.`,
    });
  }
  if (filler.share > INTERVIEW.fillerShare) {
    delivery.push({
      id: 'filler', severity: 'low',
      label: `${Math.round(filler.share * 100)}% filler words`,
      detail: `${filler.found.slice(0, 5).join(', ')}. Worth mentioning and not worth obsessing over — every interviewer discounts these, and a student policing their own speech mid-answer sounds worse than one saying "um".`,
    });
  }
  if (meanSentence > 0 && meanSentence < 8 && sents.length > 3) {
    delivery.push({
      id: 'clipped', severity: 'low',
      label: 'Very short answers',
      detail: `Averaging ${Math.round(meanSentence)} words a sentence. Interviewers read brevity as either confidence or reluctance, and they cannot tell which without an example — one concrete story per answer settles it.`,
    });
  }

  // ── What is present in one and absent from the other ────────────────────
  const themeOnly = topTerms(vTheme).filter(k => !vInterview.has(k)).slice(0, 8);
  const interviewOnly = topTerms(vInterview).filter(k => !vTheme.has(k)).slice(0, 8);
  const shared = topTerms(vTheme).filter(k => vInterview.has(k)).slice(0, 8);

  return {
    available: true,
    alignment: round3(alignment),
    rawSimilarity: round3(blended),
    strictCosine: round3(strict),
    calibration: INTERVIEW_CALIBRATION,
    target: INTERVIEW.target,
    meetsTarget,
    disconnect,
    band: meetsTarget ? 'aligned' : alignment >= 0.65 ? 'close' : disconnect ? 'disconnected' : 'partial',

    shared, themeOnly, interviewOnly,

    pacing: { ...pacing, ceiling: INTERVIEW.pacingCeilingWpm },
    filler: { share: round3(filler.share), found: filler.found },
    delivery,

    // ── The caveat that stops this number lying by omission ───────────────
    // A student can score very high here by reciting their activities list —
    // which is exactly what the scattered-profile archetype does. Alignment
    // with a file that has no theme is not alignment, it is repetition, and
    // reporting a green number on it would tell the one student who most needs
    // the opposite finding that this part is finished.
    themeless: themeDecisive === false,
    themelessNote: themeDecisive === false
      ? 'Read this number with care: your written application does not yet have one theme carrying it, so matching it closely means you are repeating your activities list rather than reinforcing an argument. Fix the file first; the interview follows it.'
      : null,

    headline: themeDecisive === false && meetsTarget
      ? 'What you say matches your file closely — but your file does not yet have a single theme, so this is consistency rather than alignment. That distinction is the whole finding for a profile like yours.'
      : meetsTarget
      ? 'What you say and what you wrote are recognisably the same story. That is the whole job of an interview and it is done.'
      : disconnect
        ? 'Narrative disconnect. The interview and the written application are about different things — not contradictory, just unconnected, which a reader experiences as not having met the person in the file.'
        : 'Partly aligned. The theme is in there, and it is not what you lead with.',

    guidance: meetsTarget ? null : [
      themeOnly.length && `Your file is about ${themeOnly.slice(0, 4).join(', ')} and none of that came up when you spoke. Pick one and prepare a ninety-second story about it that you can reach for from any question.`,
      interviewOnly.length && `You spoke about ${interviewOnly.slice(0, 4).join(', ')}, which is nowhere in your written application. If it matters this much to you, it may belong in the file; if it does not, it is taking the place of something that does.`,
      disconnect && 'Run three practice answers where the last sentence of each returns to the same idea. Not a script — a destination.',
    ].filter(Boolean),

    scopeNote: 'This scores coherence with your written narrative, not interview quality. Content, structure and delivery are scored separately in Interview Prep.',
  };
}

/** The heaviest unigrams in a vector, in order. */
function topTerms(vec, n = 25) {
  return [...vec.entries()]
    .filter(([k]) => !k.includes('_'))
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

const round3 = (v) => Math.round(v * 1000) / 1000;

/**
 * Practice prompts generated from the student's own theme, targeting whichever
 * part of it is not surviving into speech.
 */
export function alignmentDrills(result, { theme = null } = {}) {
  if (!result?.available || result.meetsTarget) return [];
  const label = theme?.label || 'your theme';
  return [
    {
      id: 'ninety-second-core',
      prompt: 'Tell me about yourself.',
      target: `Ninety seconds that end on ${label}. Most students use this question to summarize a résumé; it is the one question where you choose the subject of the whole interview.`,
    },
    {
      id: 'why-this',
      prompt: 'Why this major?',
      target: 'Past, present, future — the catalyst, the years of evidence, the concrete goal. Same three parts as the written version, spoken.',
    },
    {
      id: 'failure',
      prompt: 'Tell me about a time something did not work.',
      target: 'The answer needs a real cost in it. This is where an interviewer finds out whether the record was easy for you, and "I worked too hard" answers this question badly enough to be memorable.',
    },
    ...(result.themeOnly.slice(0, 2).map((term, i) => ({
      id: `bridge-${i}`,
      prompt: `Anything you would like us to know?`,
      target: `Use it to say the thing about "${term}" that is all over your file and did not survive into your practice answers.`,
    }))),
  ];
}
