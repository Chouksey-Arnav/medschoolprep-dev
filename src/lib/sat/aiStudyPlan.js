// ─────────────────────────────────────────────────────────────────────────────
// The post-diagnostic prescription.
//
// The diagnostic already produces a ranked list of weak skills. That list is
// correct and it is also, on its own, not a plan: it tells a student WHAT is
// broken and nothing about what to do on Tuesday. This module turns the measured
// picture into a plan they can actually follow — a diagnosis in one paragraph,
// three to five focus areas with a concrete amount of work attached to each, a
// weekly rhythm sized to the time they actually have, and the milestones that
// would tell them it is working.
//
// ── DESIGN CONSTRAINTS ───────────────────────────────────────────────────────
//
// GROUNDED, NOT INVENTED. The plan may only reference things that exist: the
// eight sub-tabs of this SAT pillar and the 28 skills in the taxonomy. A plan
// that tells a student to "work through the Chapter 4 exercises" is worse than
// no plan, because it makes the product look like it does not know itself. The
// prompt is given the real inventory and told to use skill ids verbatim, and
// every returned focus area is checked against the taxonomy before it renders.
//
// HONEST ABOUT ITS OWN EVIDENCE. The diagnostic measures each skill with one or
// two questions. The plan is therefore explicitly framed as a starting
// hypothesis to be revised, and the prompt forbids stating a predicted score.
// This is the same rule the Overview panel is built on and the coach prompt
// enforces; a plan that quietly breaks it would undo both.
//
// MODEL: Oracle (openai/gpt-oss-120b) with reasoning_effort 'high'. This runs
// once after a diagnostic and then sits on the Overview for weeks — it is the
// definition of a rare, high-value, structured generation, which is exactly what
// that tier exists for. Temperature 0.5: some warmth in the prose, no
// improvisation in the numbers.
// ─────────────────────────────────────────────────────────────────────────────
import { SAT_SKILLS, skillMeta } from '../../data/sat/taxonomy';
import { renderProfileForPrompt, profileFingerprint } from './learnerProfile';
import { parseJsonLoosely } from './aiPractice';
import * as DB from '../db';
import { aiLane } from '../aiLane.js';

const PLAN_CACHE_PREFIX = 'plan:v1';
/** A plan older than this is stale advice, whatever the profile says. */
const PLAN_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/** The panels a plan is allowed to send a student to. Keep in sync with SAT_SUBNAV. */
const PANELS = {
  overview: 'Overview — score estimate and next action',
  diagnostic: 'Diagnostic — the wide placement test',
  practice: 'Practice — Smart Set, Skill Drill, Timed Set and AI Set',
  tests: 'Practice Tests — full-length adaptive tests',
  review: 'Review Log — every miss, triaged by why it was missed, with spaced retries',
  skills: 'Skill Mastery — all 28 skills with strategy cards',
  toolkit: 'Calculator — Desmos plus the formula reference sheet',
  scores: 'Scores — the official score history log',
};

function buildPlanPrompt(profile) {
  const skillList = Object.keys(SAT_SKILLS)
    .map(id => {
      const m = skillMeta(id);
      return `  ${id} — ${m.label} (${m.sectionLabel})`;
    })
    .join('\n');

  return [
    'You are the head SAT coach inside a study app. A student has just finished a diagnostic, and you are writing',
    'the study plan they will follow for the next few weeks. It has to be specific enough to act on tomorrow',
    'morning and honest enough that it does not fall apart the first time reality disagrees with it.',
    '',
    '── THE STUDENT ──',
    renderProfileForPrompt(profile),
    '',
    '── WHAT ACTUALLY EXISTS IN THIS APP ──',
    'Panels you may send them to (use the id verbatim in "panel"):',
    ...Object.entries(PANELS).map(([id, desc]) => `  ${id} — ${desc}`),
    '',
    'Skills you may name (use the id verbatim in "skill"):',
    skillList,
    '',
    '── RULES ──',
    '1. Reference ONLY the panels and skills listed above. Never invent a feature, a worksheet, a video, a book,',
    '   or a "module 3". If the right advice is not expressible in terms of what exists, give different advice.',
    '2. Never state a predicted score as a single number. The score estimate above is a range with a confidence',
    '   level and a sample size; treat it that way or do not mention it.',
    '3. A diagnostic measures each skill with one or two questions. Say plainly, once, that the priorities are a',
    '   starting hypothesis that the first two weeks of practice will confirm or overturn.',
    '4. Size the weekly plan to the hours they actually have. If you do not know their hours, assume 4 a week and',
    '   say that is what you assumed. Do not build a plan that requires more time than a high-school student has.',
    '5. Order focus areas by leverage — weakness multiplied by how heavily the exam tests the skill — not by how',
    '   weak they are alone. Fixing a 1-question-per-test skill is not worth a week.',
    '6. If their triaged misses are mostly careless slips or timing, say so and prescribe process work',
    '   (pacing, checking, the Review Log) rather than more content drilling. Those are different problems.',
    '7. Be direct and specific. No motivational filler, no "remember, everyone learns differently".',
    '',
    '── OUTPUT ──',
    'Return ONLY a JSON object, no prose and no code fence:',
    '{',
    '  "headline": "<one sentence naming the single biggest thing standing between them and their target>",',
    '  "diagnosis": "<2-4 sentences: what the data actually shows, including what it is too thin to show>",',
    '  "focus": [                                  // 3 to 5 entries, highest leverage first',
    '    {"skill":"<skill id>","title":"<short label>","why":"<why this one, citing their numbers>",',
    '     "work":"<the concrete work: which panel, which mode, roughly how many questions>",',
    '     "panel":"<panel id>","questions":<integer, a realistic weekly target for this skill>}',
    '  ],',
    '  "weekly": [                                 // the shape of a typical week, 3 to 6 entries',
    '    {"label":"<e.g. Two weekday sessions>","detail":"<what they do, in one sentence>","minutes":<integer>}',
    '  ],',
    '  "milestones": ["<a checkable signal that this is working>", "..."],   // 2 to 4',
    '  "pacing": "<one paragraph of test-day pacing advice specific to their measured timing, or null if their',
    '             timing data is too thin to say anything honest>",',
    '  "assumption": "<the assumption you made about their available time>"',
    '}',
  ].join('\n');
}

/**
 * Validate and normalize a plan.
 *
 * Anything referencing a skill or panel that does not exist is dropped rather
 * than rendered — a plan that points at a screen the app does not have is worse
 * than a shorter plan.
 */
function normalisePlan(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const str = (v, max = 900) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

  const focus = (Array.isArray(raw.focus) ? raw.focus : [])
    .map(f => {
      if (!f || !SAT_SKILLS[f.skill]) return null;
      const meta = skillMeta(f.skill);
      const why = str(f.why, 400);
      const work = str(f.work, 400);
      if (!why || !work) return null;
      return {
        skill: f.skill,
        title: str(f.title, 80) || meta.label,
        label: meta.label,
        sectionLabel: meta.sectionLabel,
        color: meta.color,
        why,
        work,
        panel: PANELS[f.panel] ? f.panel : 'practice',
        questions: Number.isInteger(f.questions) && f.questions > 0 ? Math.min(120, f.questions) : null,
      };
    })
    .filter(Boolean)
    .slice(0, 5);

  if (!focus.length) return null; // a plan with no focus areas is not a plan

  const weekly = (Array.isArray(raw.weekly) ? raw.weekly : [])
    .map(w => {
      const label = str(w?.label, 90);
      const detail = str(w?.detail, 260);
      if (!label || !detail) return null;
      return { label, detail, minutes: Number.isInteger(w.minutes) && w.minutes > 0 ? Math.min(300, w.minutes) : null };
    })
    .filter(Boolean)
    .slice(0, 6);

  const milestones = (Array.isArray(raw.milestones) ? raw.milestones : [])
    .map(m => str(m, 200))
    .filter(Boolean)
    .slice(0, 4);

  const headline = str(raw.headline, 220);
  const diagnosis = str(raw.diagnosis, 900);
  if (!headline || !diagnosis) return null;

  return {
    headline,
    diagnosis,
    focus,
    weekly,
    milestones,
    pacing: str(raw.pacing, 800),
    assumption: str(raw.assumption, 220),
    createdAt: Date.now(),
  };
}

/**
 * Generate (or reuse) the student's SAT study plan.
 *
 * Always resolves; returns `{ plan: null, reason }` on failure so the caller can
 * fall back to the deterministic prescription the diagnostic already renders.
 * The AI plan is an enhancement of that screen, never a prerequisite for it.
 *
 * @param {object} profile   from buildLearnerProfile()
 * @param {{fresh?:boolean, signal?:AbortSignal}} [opts]
 */
export async function generateSatStudyPlan(profile, { fresh = false, signal = null } = {}) {
  if (!profile) return { plan: null, reason: 'no profile', cached: false };
  if (!profile.questionsAnswered) {
    return { plan: null, reason: 'nothing measured yet — take the diagnostic first', cached: false };
  }

  const key = `${PLAN_CACHE_PREFIX}|${profileFingerprint(profile)}`;

  if (!fresh) {
    const existing = await loadSatStudyPlan();
    // Reuse the stored plan when it was built for the same picture of the
    // student and has not gone stale. A plan that silently regenerates every
    // time they answer a question is not a plan they can follow.
    if (existing && existing.key === key && Date.now() - existing.plan.createdAt < PLAN_TTL_MS) {
      return { plan: existing.plan, reason: null, cached: true };
    }
  }

  let parsed;
  try {
    const res = await fetch('/api/groq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        system: buildPlanPrompt(profile),
        message: 'Write this student\'s SAT study plan now. Return the JSON object and nothing else.',
        purpose: 'sat',
        lane: aiLane(),
        tier: 'oracle',
        reasoningEffort: 'high',
        jsonMode: true,
        temperature: 0.5,
        noCache: fresh,
        maxTokens: 3200,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { plan: null, reason: body?.error || `plan generation unavailable (${res.status})`, cached: false };
    }
    const data = await res.json();
    parsed = parseJsonLoosely(data?.content);
  } catch (err) {
    if (err?.name === 'AbortError') return { plan: null, reason: 'cancelled', cached: false };
    return { plan: null, reason: 'could not reach the coach', cached: false };
  }

  const plan = normalisePlan(parsed);
  if (!plan) return { plan: null, reason: 'the plan came back unusable', cached: false };

  try { await DB.putSatAiCache(PLAN_CACHE_PREFIX, [{ key, plan }]); } catch { /* non-fatal */ }
  return { plan, reason: null, cached: false };
}

/**
 * Read the stored plan, if any. Used by the Overview so a plan generated on the
 * diagnostic screen keeps showing up afterwards — a plan you have to regenerate
 * to see again is a demo, not a feature.
 *
 * @returns {Promise<{key:string, plan:object}|null>}
 */
export async function loadSatStudyPlan() {
  try {
    const row = await DB.getSatAiCache(PLAN_CACHE_PREFIX);
    const stored = row?.questions?.[0];
    if (!stored?.plan?.focus?.length) return null;
    return stored;
  } catch {
    return null;
  }
}

/** Forget the stored plan — used by "rebuild my plan". */
export async function clearSatStudyPlan() {
  try { await DB.putSatAiCache(PLAN_CACHE_PREFIX, []); } catch { /* non-fatal */ }
}

export { PANELS as SAT_PLAN_PANELS };
