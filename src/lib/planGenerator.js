// The onboarding "max-out plan" generator. Takes everything onboarding collected and produces one
// rich, personalized plan for the student — the Cal AI-style "we built your plan" payoff, but with
// a real model behind it instead of a canned animation.
//
// Routes through purpose:'plan' (the GROQ_API_KEY_PLAN pool) on the strongest model, since this is
// a once-per-student, high-value generation where quality matters more than cost. It ALWAYS resolves
// to a usable, COMPLETE plan: every field is validated and, if the model omits or mangles one, that
// single field is repaired from the deterministic heuristic plan. So the onboarding flow can never
// dead-end, and the display code can render the result without a single defensive null-check.
import {
  GOAL_OPTIONS, OBSTACLE_OPTIONS, STUDY_METHOD_OPTIONS, ACCOMPLISH_OPTIONS,
  WHY_MEDICINE_OPTIONS, DREAM_ROLE_OPTIONS, CERTAINTY_OPTIONS, GPA_OPTIONS,
  SCIENCE_OPTIONS, EXPERIENCE_OPTIONS,
} from '../components/onboarding/Onboarding';
import { aiLane } from './aiLane.js';

// Nothing in here mentions the SAT/ACT. The test-prep pillar is sealed for v1
// (src/lib/betaFlags.js), so onboarding no longer collects a track, a score or
// a test date — and a starter plan that opens with "your SAT game plan" would
// be selling a tab the student cannot open. The plan is built from what they
// did tell us: grades, science coursework, real-world experience, and time.

const GRADE_LABELS = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Applying soon'];
const labelOf = (opts, v) => opts.find(o => o.value === v)?.label || null;
const labelsOf = (opts, arr) => (arr || []).map(v => labelOf(opts, v)).filter(Boolean);

// Study-load numbers derived from onboarding pace — also the fallback plan's headline stats and the
// guidance we hand the model so its plan stays consistent with what the student signed up for.
export function deriveLoad(profile) {
  const dailyMinutes = profile.speedLevel >= 2 ? 60 : profile.speedLevel === 1 ? 40 : 25;
  const weeklyQuestions = profile.speedLevel >= 2 ? 120 : profile.speedLevel === 1 ? 80 : 50;
  return { dailyMinutes, weeklyQuestions };
}

// A complete, sensible plan built with no network — used as the fallback and as the shape contract
// the AI plan must match, so the display code can render either identically. Every field the display
// touches is present and valid here, which is what makes the merge in generateMaxOutPlan foolproof.
export function heuristicPlan(profile) {
  const { dailyMinutes, weeklyQuestions } = deriveLoad(profile);
  const goalLabel = labelOf(GOAL_OPTIONS, profile.goal) || 'building your path into medicine';
  const obstacles = labelsOf(OBSTACLE_OPTIONS, profile.obstacles);
  const grade = GRADE_LABELS[profile.gradeIdx] || 'high school';
  const roleLabel = profile.dreamRole && profile.dreamRole !== 'undecided' ? labelOf(DREAM_ROLE_OPTIONS, profile.dreamRole) : null;
  const hasScience = (profile.sciences || []).some(v => v !== 'none_yet');
  const hasExperience = (profile.experience || []).some(v => v !== 'none');
  return {
    headline: 'Your pre-health game plan',
    summary: `A balanced plan built around ${dailyMinutes} focused minutes a day — steady science practice paired with the early pre-health foundations that make a future medicine application strong. Designed for where you are now as a ${grade.toLowerCase()}, not where you'll be in four years.`,
    dailyMinutes,
    weeklyQuestions,
    focusAreas: [
      { title: 'Core science skills', why: 'Consistent daily reps are the single biggest lever on how much sticks.' },
      { title: hasScience ? 'Science depth' : 'Science foundations', why: hasScience ? "You've started the science track — now we deepen it toward pre-health strength." : 'Biology and chemistry basics now make college pre-med far less of a wall later.' },
      { title: hasExperience ? 'Build on your experience' : 'Early exposure', why: hasExperience ? "You already have real-world exposure — we'll turn it into a story colleges notice." : 'Light shadowing/volunteering helps you test whether medicine truly fits — no pressure.' },
    ],
    milestones: [
      { title: 'Find your pathway', when: 'This week', detail: 'Take the diagnostic so your prep is aimed at the health career that fits you.' },
      { title: 'First 100 questions', when: 'Weeks 1-2', detail: `Build the habit — ${weeklyQuestions} practice questions a week.` },
      { title: 'A unit under your belt', when: '~3 months', detail: 'Most students moving at this pace finish a full science unit by the first checkpoint.' },
    ],
    firstWeek: [
      'Take the Pathway Diagnostic',
      'Do your first practice quiz',
      'Start one flashcard deck from your notes',
      obstacles.includes('No structured plan') ? 'Set a daily study reminder' : 'Add one activity to your Portfolio',
    ],
    // ── Expanded fields — richer, but every one degrades gracefully because the
    // display treats them as optional and the validator repairs them from here. ──
    weeklyRhythm: [
      'Practice quizzes — 3 short sessions',
      'Science reading or a Crash Course video — 2 days',
      'Flashcard review — daily, 5 minutes',
      'One weekend catch-up + reflection block',
    ],
    strengths: [
      goalLabel ? `You already know your "why": ${goalLabel.toLowerCase()}.` : 'You have a clear reason to start.',
      'Starting in high school gives you years of runway most applicants never had.',
    ],
    watchOut: [
      obstacles[0] ? `Your biggest hurdle right now: ${obstacles[0].toLowerCase()} — the plan is built to work around it.` : 'Consistency beats intensity — small daily reps win.',
      'Don\'t let coursework crowd out exploring whether medicine actually fits you.',
    ],
    ninetyDayGoal: 'In 90 days: a steady daily study habit, a real dent in your science foundation, and at least one real-world taste of a health career (shadowing, volunteering, or a health club).',
    encouragement: roleLabel
      ? `Every ${roleLabel.toLowerCase().replace(/ \/.*$/, '')} started exactly where you are — a student with a goal and a plan. Small, steady days compound. We've got you.`
      : `You're starting earlier than most — that's a real advantage. Small, steady days compound. We've got you.`,
    // Deterministic, never AI-generated — these are the exact three activity gates
    // computePlanReadiness() (studentProfile.js) checks before unlocking the full
    // day-by-day plan in the Plans tab, so this starter plan always points at the
    // real unlock criteria instead of vague "keep using the app" language.
    unlockSteps: [
      'Take the Pathway Diagnostic',
      'Try one practice quiz',
      'Add one item to your Portfolio',
    ],
    source: 'fallback',
  };
}

// Build the model prompt from the full profile. Deliberately rich and emotionally aware (this is a
// teenager, not a client), Med-focused, and pinned to a strict JSON schema so the output renders
// reliably.
function buildPlanPrompt(profile) {
  const { dailyMinutes, weeklyQuestions } = deriveLoad(profile);
  const facts = [
    `Name: ${profile.name || 'the student'}`,
    `Grade: ${GRADE_LABELS[profile.gradeIdx] || 'high school'}`,
    `Why they're drawn to medicine: ${labelOf(WHY_MEDICINE_OPTIONS, profile.whyMedicine) || 'not shared'}`,
    `Dream health role: ${labelOf(DREAM_ROLE_OPTIONS, profile.dreamRole) || 'undecided'}`,
    `How certain they are about medicine: ${labelOf(CERTAINTY_OPTIONS, profile.certainty) || 'not shared'}`,
    `Self-reported grades: ${labelOf(GPA_OPTIONS, profile.gpa) || 'not shared'}`,
    `Science courses taken/taking: ${labelsOf(SCIENCE_OPTIONS, profile.sciences).join(', ') || 'not shared'}`,
    `Hands-on health experience: ${labelsOf(EXPERIENCE_OPTIONS, profile.experience).join(', ') || 'none yet'}`,
    `Weekly study time available: ${profile.studyHours || 'unsure'}`,
    `Chosen pace: ${['relaxed', 'steady', 'intense'][profile.speedLevel] || 'steady'} (≈${dailyMinutes} min/day, ${weeklyQuestions} Qs/week)`,
    `Primary goal: ${labelOf(GOAL_OPTIONS, profile.goal) || 'exploring medicine'}`,
    `What they want to accomplish: ${labelsOf(ACCOMPLISH_OPTIONS, profile.accomplish).join(', ') || 'not specified'}`,
    `What's in their way: ${labelsOf(OBSTACLE_OPTIONS, profile.obstacles).join(', ') || 'not specified'}`,
    `Current study method: ${labelOf(STUDY_METHOD_OPTIONS, profile.studyMethod) || 'none yet'}`,
  ].join('\n');

  const system = `You are Medabrain, the head coach of MedSchoolPrep — a platform for high-school students (grades 9-12, ~14-18 years old) exploring a future in medicine or health careers. You are creating this student's ONE personalized starter plan from their onboarding answers. This is the emotional payoff moment of their signup, so make it feel made-for-them, warm, and motivating — but also concrete and honest.

Rules:
- They are years away from medical school. NEVER mention the MCAT, medical-school applications, residency, clinical rotations, MMI, or CASPer. Frame everything as high-school and undergraduate-admissions prep with an eye toward a future health career.
- NEVER mention the SAT, the ACT, standardized-test prep, test dates, or score goals. This product does not offer test prep, so a plan that includes it is a plan the student cannot follow. Build the plan out of science foundations, exploration of whether medicine fits, and low-pressure real-world activities.
- Be emotionally attuned: acknowledge their stated obstacles supportively, and keep the tone encouraging and age-appropriate — this is a teenager building confidence.
- Use their "why medicine" and dream role to make the plan feel like it's aimed at THEIR future, not a generic student's. If they said they're still exploring or undecided, keep the medicine framing honest and pressure-free — exploration is part of the plan, not a foregone conclusion.
- Match science recommendations to the courses they've actually taken (true beginner if none), and if they already have hands-on health experience, build on it instead of suggesting they start from zero.
- Keep the study load consistent with the pace they chose (≈${dailyMinutes} min/day, ${weeklyQuestions} questions/week).
- Reference their ACTUAL goal, grade, and obstacle in the copy so it feels personal, not templated.

Confidence & calibration — this matters as much as tone:
- Every fact below is SELF-REPORTED at signup, before this student has done a single quiz, lesson, or diagnostic inside the app. Treat that as a floor of confidence, not a ceiling: this is a first-draft, day-one plan, not a data-rich verdict on their level.
- Only state something as settled fact if it is directly grounded in a field below. Never invent a specific weakness, strength, or trajectory that isn't implied by an actual answer — when a field says "not shared" or "unsure," acknowledge the gap honestly (e.g. "once you've tried a few questions we'll know exactly where to focus") rather than papering over it with generic confidence.
- Calibrate certainty language to how much they told you: a student who filled in every field (clear goal, named obstacle, science coursework) earns more specific, assertive language ("your plan targets X"); a student with several "not shared" answers earns more provisional, inviting language ("let's find out together") — the plan should never sound more certain about this student than the data supports.
- This starter plan is intentionally NOT the full day-by-day roadmap — that only unlocks once the student has given the app real signal beyond onboarding answers (taking the Pathway Diagnostic, trying one quiz, logging one Portfolio item). Frame this plan as the confident first step that leads there, not as the finished product — but don't undersell it either; it should stand on its own as genuinely useful today.

Respond with ONLY a valid JSON object (no markdown, no code fences, no prose before or after) matching exactly this schema:
{
  "headline": "short motivating title, max 8 words",
  "summary": "2-3 warm sentences describing their plan, referencing their actual goal/situation",
  "dailyMinutes": ${dailyMinutes},
  "weeklyQuestions": ${weeklyQuestions},
  "focusAreas": [ {"title": "short", "why": "one sentence"} ],  // exactly 3, balanced across science foundations, exploration, and real-world experience
  "milestones": [ {"title": "short", "when": "timeframe like 'This week' or '~3 months'", "detail": "one sentence"} ],  // exactly 3, in time order
  "firstWeek": [ "concrete action", "..." ],  // exactly 4 short first-week actions
  "weeklyRhythm": [ "short line describing a typical week's split", "..." ],  // 3 to 4 items
  "strengths": [ "one genuine strength you see in their profile", "..." ],  // exactly 2
  "watchOut": [ "one supportive heads-up tied to their obstacle", "..." ],  // exactly 2
  "ninetyDayGoal": "one concrete sentence describing where they could realistically be in 90 days",
  "encouragement": "one or two warm, personal closing sentences that name a stated obstacle or goal"
}`;

  return { system, user: `Here is the student's onboarding profile:\n${facts}\n\nGenerate their plan now as JSON only.` };
}

// Defensive JSON extraction — strips accidental code fences / leading prose and grabs the outermost
// object, then makes a couple of common-mistake repairs (trailing commas, smart quotes) before
// giving up, so a slightly-messy model still parses.
function parsePlanJSON(text) {
  if (!text) return null;
  let s = String(text).trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const first = s.indexOf('{'); const last = s.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  let body = s.slice(first, last + 1);
  const tryParse = (t) => { try { return JSON.parse(t); } catch { return null; } };
  return (
    tryParse(body) ||
    // Strip trailing commas before } or ] — the single most common model JSON error.
    tryParse(body.replace(/,\s*([}\]])/g, '$1')) ||
    // Normalize smart quotes that occasionally leak into keys/strings.
    tryParse(body.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/,\s*([}\]])/g, '$1')) ||
    null
  );
}

// ── Field-level coercion helpers ──────────────────────────────────────────────
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);

// Coerce a "list of {title, ...}" field, tolerating the model returning bare strings, a single
// object, or extra/missing keys. Pads/truncates to `want` using the fallback list.
function coerceObjList(v, keys, want, fallbackList) {
  let arr = Array.isArray(v) ? v : v ? [v] : [];
  arr = arr.map((item) => {
    if (typeof item === 'string') return { [keys[0]]: item.trim(), ...(keys[1] ? { [keys[1]]: '' } : {}) };
    if (item && typeof item === 'object') {
      const out = {};
      for (const k of keys) out[k] = str(item[k]) || '';
      // Salvage a title from any string value if the expected key was named differently.
      if (!out[keys[0]]) { const anyStr = Object.values(item).find(str); if (anyStr) out[keys[0]] = String(anyStr).trim(); }
      return out;
    }
    return null;
  }).filter((x) => x && x[keys[0]]);
  // Pad from fallback, then clamp to the desired length.
  for (let i = arr.length; i < want; i++) arr.push(fallbackList[i % fallbackList.length]);
  return arr.slice(0, want);
}

// Coerce a "list of strings" field with padding/clamping.
function coerceStrList(v, want, fallbackList, max) {
  let arr = Array.isArray(v) ? v : v ? [v] : [];
  arr = arr.map((x) => (typeof x === 'string' ? x.trim() : x && typeof x === 'object' ? str(x.title) || str(x.text) : null)).filter(Boolean);
  for (let i = arr.length; i < want; i++) arr.push(fallbackList[i % fallbackList.length]);
  return arr.slice(0, max || want);
}

// The core of the "foolproof" guarantee: take whatever the model produced and the deterministic
// fallback, and return a plan where EVERY field the UI reads is present and valid — repairing each
// field independently so one bad field never sinks the whole plan.
function repairPlan(parsed, fallback) {
  const p = parsed && typeof parsed === 'object' ? parsed : {};
  return {
    headline: str(p.headline) || fallback.headline,
    summary: str(p.summary) || fallback.summary,
    dailyMinutes: num(p.dailyMinutes) || fallback.dailyMinutes,
    weeklyQuestions: num(p.weeklyQuestions) || fallback.weeklyQuestions,
    focusAreas: coerceObjList(p.focusAreas, ['title', 'why'], 3, fallback.focusAreas),
    milestones: coerceObjList(p.milestones, ['title', 'when', 'detail'], 3, fallback.milestones),
    firstWeek: coerceStrList(p.firstWeek, 4, fallback.firstWeek, 4),
    weeklyRhythm: coerceStrList(p.weeklyRhythm, 3, fallback.weeklyRhythm, 4),
    strengths: coerceStrList(p.strengths, 2, fallback.strengths, 3),
    watchOut: coerceStrList(p.watchOut, 2, fallback.watchOut, 3),
    ninetyDayGoal: str(p.ninetyDayGoal) || fallback.ninetyDayGoal,
    encouragement: str(p.encouragement) || fallback.encouragement,
    // Never sourced from the model — always the same three real unlock gates (see
    // heuristicPlan above), so onboarding and any later regeneration stay in sync
    // with computePlanReadiness() no matter what the AI did or didn't return.
    unlockSteps: fallback.unlockSteps,
    source: 'ai',
    generatedAt: Date.now(),
  };
}

// Is this parsed object worth repairing, or so empty we should just retry / fall back?
// We only need a couple of the substantive fields to have survived for the repair to be meaningful.
function looksUsable(p) {
  if (!p || typeof p !== 'object') return false;
  const hasSummary = !!str(p.summary);
  const hasList = ['focusAreas', 'milestones', 'firstWeek'].some((k) => Array.isArray(p[k]) && p[k].length);
  return hasSummary || hasList;
}

// One network attempt. Returns a parsed-and-usable object, or null (so the caller can retry/fallback).
async function attemptPlan(system, user) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 11000) : null;
  try {
    const r = await fetch('/api/groq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system, message: user, maxTokens: 1400, purpose: 'plan', lane: aiLane() }),
      signal: controller ? controller.signal : undefined,
    });
    if (!r.ok) return null;
    const d = await r.json();
    const parsed = parsePlanJSON(d && d.content);
    return looksUsable(parsed) ? parsed : null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Public entry point. Always resolves to a usable, COMPLETE plan object (never throws). Tries the
// model up to twice; if both attempts fail or come back empty, returns the deterministic fallback.
export async function generateMaxOutPlan(profile) {
  const fallback = heuristicPlan(profile || {});
  try {
    const { system, user } = buildPlanPrompt(profile || {});
    let parsed = await attemptPlan(system, user);
    if (!parsed) parsed = await attemptPlan(system, user); // one retry — models occasionally emit junk
    if (!parsed) return fallback;
    return repairPlan(parsed, fallback);
  } catch {
    return fallback;
  }
}
