// ─────────────────────────────────────────────────────────────────────────────
// Section 5 — the Common App validators.
//
// ── PREMIUM ROADMAP ─────────────────────────────────────────────────────────
// Part of the Narrative Method Engine, planned as a paid tier. See PREMIUM in
// ./constants.js.
// ────────────────────────────────────────────────────────────────────────────
//
// The activities list, the Additional Information box, and the two brag sheets.
// These are the mechanically constrained parts of an application — 150
// characters, ten slots, one box with a specific job — which makes them the
// parts where a tool can be unambiguously useful.
//
// ── The app already has a Common App exporter ──────────────────────────────
// src/lib/commonApp/ and src/components/portfolio/CommonAppExport.jsx build
// and export the list (the exporter itself is commonApp/activities.js; the
// section model, derivation and Portfolio sync ledger sit beside it). This module does not export anything and does not own
// the data; it AUDITS a draft against the rules and hands back per-entry
// findings. The two are wired together in the panel rather than merged, because
// the exporter's job is to be correct and this one's job is to be opinionated.
// ─────────────────────────────────────────────────────────────────────────────

import { clamp } from './constants.js';
import { tokenize, wordCount, sentences } from './text.js';
import {
  LIMITS, ACTION_VERBS, WEAK_OPENINGS, ADDITIONAL_INFO, RESOLUTION_REQUIRED,
  BRAG_SHEETS, ORDERING_RULE,
} from '../../data/ivy/commonAppRules.js';
import { countMetrics } from './storyboard.js';

const VERB_SET = new Set(ACTION_VERBS.map(v => v.toLowerCase()));

/**
 * Audits one activity description against the 150-character rules.
 *
 * @param {Object} entry  { name, description, tier }
 */
export function auditActivityEntry(entry = {}) {
  const text = String(entry.description || entry.description_draft || '').trim();
  const chars = text.length;
  const findings = [];

  if (!text) {
    return { label: entry.name || 'Untitled', chars: 0, empty: true, score: 0, findings: [{ id: 'empty', severity: 'high', label: 'No description', detail: 'An activity with no description is a title, and a title is not read.' }] };
  }

  if (chars > LIMITS.activityDescription) {
    findings.push({
      id: 'over-limit', severity: 'high',
      label: `${chars} characters`,
      detail: `${chars - LIMITS.activityDescription} over the ${LIMITS.activityDescription}-character limit. The Common App truncates rather than warning you, so this currently ends mid-word on a reader's screen.`,
    });
  } else if (chars < 60) {
    findings.push({
      id: 'under-using', severity: 'medium',
      label: `${chars} of ${LIMITS.activityDescription} characters`,
      detail: `${LIMITS.activityDescription - chars} characters unused. These ten lines are read faster and remembered longer than anything else you write; leaving 40% of one empty is the cheapest loss on the whole application.`,
    });
  }

  const firstWord = (text.match(/^[A-Za-z]+/) || [''])[0];
  const startsWithVerb = VERB_SET.has(firstWord.toLowerCase())
    || /^[A-Z][a-z]+(ed|es|s)$/.test(firstWord);
  const weak = WEAK_OPENINGS.find(w => w.re.test(text));

  if (weak) {
    findings.push({ id: `weak-opening-${weak.re.source.slice(0, 8)}`, severity: 'medium', label: `Opens "${firstWord}"`, detail: weak.note });
  } else if (!startsWithVerb) {
    findings.push({ id: 'no-verb', severity: 'medium', label: 'Does not open on a verb', detail: `Start with what you did: ${ACTION_VERBS.slice(0, 6).join(', ')}. In 150 characters the first word is 5% of the entry.` });
  }

  const metrics = countMetrics(text);
  if (!metrics.count) {
    findings.push({
      id: 'no-metric', severity: 'high',
      label: 'No number in it',
      detail: 'Every entry a reader can check has a number: people, hours, dollars, placements, a before and an after. Without one, this line is a claim about a category rather than a fact about you.',
    });
  }

  // First person is not forbidden and it is expensive here.
  if (/\b(I|my|we|our)\b/.test(text)) {
    findings.push({ id: 'first-person', severity: 'low', label: 'Uses "I" or "my"', detail: 'Every line on this page is already about you. Dropping the pronouns usually buys 8–12 characters, which is a whole clause.' });
  }

  const score = clamp(1
    - (chars > LIMITS.activityDescription ? 0.35 : 0)
    - (metrics.count ? 0 : 0.3)
    - (weak || !startsWithVerb ? 0.2 : 0)
    - (chars < 60 ? 0.15 : 0), 0, 1);

  return {
    label: entry.name || 'Untitled',
    text, chars, remaining: LIMITS.activityDescription - chars,
    startsWithVerb: startsWithVerb && !weak,
    metrics: metrics.count, metricsFound: metrics.matches,
    findings, score: round3(score),
    // The compression target, so a student rewriting has a number to hit.
    target: chars > LIMITS.activityDescription
      ? `Cut ${chars - LIMITS.activityDescription} characters. Articles, pronouns, and "helped to" are usually enough.`
      : null,
  };
}

/** The whole list: per-entry audits, ordering check, and slot usage. */
export function auditActivitiesList(activities = [], { tiering = null } = {}) {
  const entries = (activities || []).map(a => auditActivityEntry(a));
  const used = entries.filter(e => !e.empty).length;

  const findings = [];
  if (used > LIMITS.activitySlots) {
    findings.push({ id: 'over-slots', severity: 'high', label: `${used} activities for ${LIMITS.activitySlots} slots`, detail: `${used - LIMITS.activitySlots} will not fit. Cut from the bottom of the tier order, and consider whether any belong in Additional Information as a plain list instead.` });
  }

  // Ordering: is the list actually in impact order?
  if (tiering?.ordering?.length && activities.length > 2) {
    const currentIds = activities.map(a => a.name || a.title);
    const idealIds = tiering.ordering.map(a => a.name);
    const misplaced = currentIds.filter((id, i) => idealIds[i] !== id);
    if (misplaced.length >= 2) {
      findings.push({
        id: 'ordering', severity: 'medium',
        label: 'Not in impact order',
        detail: `${ORDERING_RULE.note} Suggested order: ${idealIds.slice(0, 5).join(' → ')}${idealIds.length > 5 ? ' → …' : ''}.`,
        suggestedOrder: idealIds,
      });
    }
  }

  const noMetric = entries.filter(e => !e.empty && !e.metrics).length;
  if (noMetric >= 3) {
    findings.push({ id: 'metric-drought', severity: 'high', label: `${noMetric} entries with no numbers`, detail: 'This is the single highest-yield hour available on the application. Go through each one and add the count, the hours, or the outcome — you already know all of them.' });
  }

  return {
    entries, used, slots: LIMITS.activitySlots,
    findings,
    score: entries.length ? round3(entries.reduce((s, e) => s + e.score, 0) / entries.length) : 0,
    note: entries.length ? `${used} of ${LIMITS.activitySlots} slots used; average entry quality ${Math.round((entries.reduce((s, e) => s + e.score, 0) / entries.length) * 100)}%.` : 'No activities recorded.',
  };
}

/**
 * The Additional Information guardrails.
 *
 * Three checks: is it narrative when it should be factual, is it repeating the
 * activities list, and — the one that matters most — does a stated hardship
 * have its resolution attached.
 */
export function auditAdditionalInfo(text, { activityDescriptions = [] } = {}) {
  const s = String(text || '').trim();
  if (!s) return { empty: true, note: 'Empty, which is the correct state for most applications. This box is for context a reader needs and cannot get anywhere else — not for anything you wish you had room for.' };

  const words = wordCount(s);
  const sents = sentences(s);
  const findings = [];

  if (words > ADDITIONAL_INFO.maxWords) {
    findings.push({ id: 'too-long', severity: 'medium', label: `${words} words`, detail: ADDITIONAL_INFO.maxWordsNote });
  }

  // Narrative detection: scene-setting, dialogue, and long sentences in a box
  // that is supposed to be a list of facts.
  const hasDialogue = /["“][^"”]{10,}["”]/.test(s);
  const meanSentence = sents.length ? words / sents.length : 0;
  const scenic = /\b(I remember|that morning|the (smell|sound|sight) of|I could feel|as I walked)\b/i.test(s);
  if (hasDialogue || scenic || meanSentence > 28) {
    findings.push({
      id: 'narrative', severity: 'high',
      label: 'This reads as an essay',
      detail: 'Storytelling here reads as a student who could not follow an instruction — the one impression this box is uniquely able to create. Convert to facts: what happened, when, what the effect on your record was, what changed afterwards.',
    });
  }

  // Redundancy against the activities list.
  const activityWords = new Set(activityDescriptions.flatMap(d => tokenize(d)).filter(w => w.length > 4));
  const overlap = tokenize(s).filter(w => w.length > 4 && activityWords.has(w));
  const overlapShare = words ? overlap.length / words : 0;
  if (overlapShare > 0.25) {
    findings.push({
      id: 'repeats-activities', severity: 'high',
      label: 'Repeats the activities list',
      detail: `About ${Math.round(overlapShare * 100)}% of this is vocabulary already in your activity descriptions. Repetition costs credibility and displaces the facts this box exists for.`,
    });
  }

  // ── The resolution rule ─────────────────────────────────────────────────
  const hardship = RESOLUTION_REQUIRED.hardshipMarkers.some(re => re.test(s));
  const resolution = RESOLUTION_REQUIRED.resolutionMarkers.some(re => re.test(s));
  if (hardship && !resolution) {
    findings.push({ id: 'no-resolution', severity: 'high', label: 'A difficulty with no "and then"', detail: RESOLUTION_REQUIRED.message });
  }

  return {
    empty: false, words, hardship, resolution,
    findings,
    score: round3(clamp(1 - findings.filter(f => f.severity === 'high').length * 0.3 - findings.filter(f => f.severity === 'medium').length * 0.15, 0, 1)),
    belongs: ADDITIONAL_INFO.belongs,
    forbidden: ADDITIONAL_INFO.forbidden,
  };
}

/**
 * Brag-sheet completeness, per recommender.
 *
 * Scored on whether the ANSWERS are specific rather than on whether the fields
 * are filled: "we had good discussions" and "you asked whether Antigone was
 * right and I argued with you for twenty minutes" both fill the box, and only
 * one of them produces a letter.
 */
export function auditBragSheet(answers = {}, type = 'teacher') {
  const sheet = BRAG_SHEETS[type] || BRAG_SHEETS.teacher;
  const prompts = sheet.prompts.map(p => {
    const a = String(answers[p.id] || '').trim();
    const words = wordCount(a);
    const metrics = countMetrics(a);
    const specific = words >= 25 || metrics.count > 0 || /["“]/.test(a);
    return {
      ...p, answer: a, words,
      state: !a ? 'empty' : specific ? 'specific' : 'thin',
      note: !a ? null
        : specific ? null
          : 'Too general to write from. One concrete detail — a date, a title, a thing that was said — is the difference between a warm letter and a specific one.',
    };
  });

  const answered = prompts.filter(p => p.state !== 'empty').length;
  const specific = prompts.filter(p => p.state === 'specific').length;

  return {
    type, title: sheet.title, purpose: sheet.purpose,
    prompts, answered, specific, total: prompts.length,
    score: round3(specific / prompts.length),
    ready: specific >= Math.ceil(prompts.length * 0.7),
    note: answered === 0
      ? `Nothing filled in. This document is most of what determines whether the letter is specific — the teacher liked you either way; what they lack is material.`
      : specific < answered
        ? `${answered} of ${prompts.length} answered, ${specific} of them specific enough to write from.`
        : `${specific} of ${prompts.length} answered with real detail.`,
  };
}

const round3 = (v) => Math.round(v * 1000) / 1000;

export { LIMITS, BRAG_SHEETS, ORDERING_RULE };
