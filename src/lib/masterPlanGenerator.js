// ─────────────────────────────────────────────────────────────────────────────
// The Plans tab's "master plan" generator — Medabrain's deepest, most expensive
// generation in the app. Where planGenerator.js builds ONE short onboarding
// summary, this builds a full, long-horizon, day-by-day roadmap grounded in
// every real resource MedSchoolPrep actually has (pathway units, the quiz
// library, flashcard decks, the E-Library, and every Portfolio tool) — and
// keeps extending itself as the student works through it.
//
// Routes through purpose:'masterplan' (api/groq.js), which uses Oracle
// (openai/gpt-oss-120b on Groq) — the largest-context, largest-max-output,
// Structured-Outputs-capable model Groq hosts, run with reasoning_effort so it
// actually thinks before answering. Chosen deliberately over Groq's other
// current options: Kimi K2 caps completions at 8,192 tokens (too small for a
// multi-week structured plan) and costs ~7x more per output token; Oracle's
// 32,768-token ceiling and $0.15/$0.75-per-M pricing is what makes a genuinely
// deep, multi-call plan generation both reliable and cheap enough to run per
// student, more than once, without hesitation.
//
// ── Why a roadmap + rolling day-by-day window, not one giant blob ──────────
// A truly "every single day" plan spanning months would be tens of thousands
// of JSON tokens — past what any single completion should attempt reliably,
// slow to generate, and mostly wasted (a plan for four months from now should
// adapt to what actually happened between now and then, not be locked in
// today). So generation is split in two:
//   1. generateRoadmap() — ONE call producing the durable "spine": phases,
//      milestones, and a compact one-line theme for EVERY week across the
//      whole horizon (so the plan still feels complete end-to-end).
//   2. generateDayChunk() — small calls (one term at a time) that explode the
//      NEAR-TERM window into real day-by-day tasks, referencing real app
//      resources. The window rolls forward as the student works through it
//      (see needsExtension/extendMasterPlan) — which is also how this plan
//      "keeps planning" over time instead of going stale the day it's made.
// This also keeps the stored plan small: the synced user snapshot has a
// shared 2MB ceiling (see api/progress-sync.js), so only a rolling ~2-3 weeks
// of full day detail is ever kept; older days are compacted into progressLog.
//
// Every generation call ALWAYS resolves to a complete, usable result — never
// throws, never returns a partial shape the UI has to defensively guard
// against — via the same "repair per-field from a deterministic fallback"
// pattern planGenerator.js established for the onboarding plan.
// ─────────────────────────────────────────────────────────────────────────────
import { PATHS, GRADE_STAGES, DECK_CATEGORY_ORDER, FLASH_DECKS, UNIT_STAGES, isUnitTimelyFor } from '../data/constants';
import { ALL_QUIZZES } from '../data/quizzes/index';
import { ELIB } from '../data/elib';
import {
  GOAL_OPTIONS, OBSTACLE_OPTIONS, STUDY_METHOD_OPTIONS, ACCOMPLISH_OPTIONS,
  WHY_MEDICINE_OPTIONS, DREAM_ROLE_OPTIONS, CERTAINTY_OPTIONS, GPA_OPTIONS,
  SCIENCE_OPTIONS, EXPERIENCE_OPTIONS,
} from '../components/onboarding/Onboarding';
import { deriveLoad } from './planGenerator';
import { gradeStageFor } from './gradeBand';
import { aiLane } from './aiLane.js';

const labelOf = (opts, v) => opts.find(o => o.value === v)?.label || null;
const labelsOf = (opts, arr) => (arr || []).map(v => labelOf(opts, v)).filter(Boolean);

// ── Date helpers ──────────────────────────────────────────────────────────────
// Always work in local-calendar YYYY-MM-DD strings (never toISOString(), which
// is UTC and can silently shift a date by a day) — same convention already
// used by DeadlinesPanel/PortfolioTimeline (`new Date(dateStr+'T00:00:00')`).
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function fmtDate(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function todayStr() { return fmtDate(new Date()); }
function addDaysStr(dateStr, n) { const d = new Date(dateStr + 'T00:00:00'); d.setDate(d.getDate() + n); return fmtDate(d); }
function weekdayIdx(dateStr) { return new Date(dateStr + 'T00:00:00').getDay(); }
function daysBetween(aStr, bStr) { return Math.round((new Date(bStr + 'T00:00:00') - new Date(aStr + 'T00:00:00')) / 86400000); }

function gradeIdxFromStage(stage) {
  const idx = GRADE_STAGES.findIndex(g => g.key === stage);
  return idx >= 0 ? idx : 2;
}

// The grade this student is in TODAY, not the one they typed at signup. Every caller below
// used to read `user.gradeStage` directly, which is a snapshot: a sophomore who signed up in
// 2025 planned like a sophomore in 2027, and the horizon, the gap list and the prompt's grade
// label were all a year or two behind reality. Graduation year is the stored attribute now and
// the grade derives from today's date, so this advances by itself. See src/lib/gradeBand.js.
const gradeNow = (user) => gradeStageFor(user);

// How many weeks the roadmap should span. Grade stage stands in for "how much
// runway does this student have" — a freshman gets a longer horizon than a
// senior, capped to something a human advisor would actually plan (never a
// multi-year mega-roadmap). A test date used to drive this directly; that went
// with the SAT pillar (src/lib/betaFlags.js), which is also why no plan this
// generator produces contains test prep any more.
export function computeHorizonWeeks(user) {
  const byGrade = [28, 24, 20, 16, 16]; // freshman, sophomore, junior, senior, gap
  return byGrade[gradeIdxFromStage(gradeNow(user))] ?? 20;
}
function clampPhaseCount(horizonWeeks) { return Math.min(6, Math.max(3, Math.round(horizonWeeks / 5))); }

// ── Resource catalog — the real grounding for "every single resource" ─────────
// Deliberately compact (full detail for the student's OWN pathway's units;
// counts + category names for everything else) so the model has concrete,
// real, nameable things to reference without the prompt ballooning to include
// every lesson, quiz and library entry in the app.
//
// Units on the deep tracks (physician / nursing / physicianAssistant /
// exploring) carry `stage` and `gradeFocus`, and both are passed through here
// so the generated plan can sequence against the student's actual runway —
// putting a foundation unit in front of a freshman and a Next Steps unit in
// front of a senior — rather than treating all units as interchangeable.
// `gradeStage` is optional: when omitted (or when a pathway's units carry no
// grade metadata) the catalog simply omits the timing annotations.
// ── Which lessons the student can actually start right now ─────────────────
// The pathway unlocks sequentially: a unit only opens once every lesson in the unit before it is
// complete (see lessonState in src/App.jsx). A plan that says "start Clinical Ethics tomorrow"
// when Clinical Ethics is three units behind a wall is worse than useless — the student taps the
// task, lands on a padlock, and learns that the plan does not know what it is talking about.
//
// So the unlock state travels into generation as data, in two places that both matter: the prompt
// (so the model never proposes a locked lesson in the first place) and the resolver (so a proposal
// that slips through is re-pointed at something the student can genuinely open). `pathwayState` is
// `{ byLesson: { [lessonId]: 'verified'|'done'|'studying'|'available'|'locked' } }`, computed in
// App.jsx from the same helpers the Pathway tab itself renders from — one source of truth for
// "is this open", not two that can disagree.
const DONE_LESSON_STATES = new Set(['done', 'verified']);
export function classifyPathwayLessons(specialtyKey, pathwayState = null) {
  const path = PATHS[specialtyKey] || PATHS.exploring;
  const byLesson = pathwayState?.byLesson || null;
  const all = [];
  path.units.forEach((u, unitIndex) => {
    u.lessons.forEach(l => {
      // With no unlock data at all, everything is treated as open — the pre-existing behavior,
      // and the right default: withholding tasks because we cannot see the state would make the
      // plan emptier for exactly the students whose data failed to load.
      const state = byLesson ? (byLesson[l.id] || 'locked') : 'available';
      all.push({ id: l.id, title: l.title, unitTitle: u.title, unitIndex, state });
    });
  });
  const done = all.filter(l => DONE_LESSON_STATES.has(l.state));
  const open = all.filter(l => l.state === 'available' || l.state === 'studying');
  const locked = all.filter(l => l.state === 'locked');
  return { all, done, open, locked, hasState: !!byLesson };
}

export function buildResourceCatalog(specialtyKey, gradeStage = null, pathwayState = null) {
  const path = PATHS[specialtyKey] || PATHS.exploring;
  const unitTitles = path.units.map(u => u.title);
  const lessonInfo = classifyPathwayLessons(specialtyKey, pathwayState);
  const stateOf = new Map(lessonInfo.all.map(l => [l.id, l.state]));
  const LESSON_TAG = { locked: ' [LOCKED — cannot be started yet]', verified: ' [already done]', done: ' [already done]', studying: ' [in progress]' };
  const unitLines = path.units
    .map(u => {
      const stage = u.stage ? `${UNIT_STAGES[u.stage]?.label || u.stage} stage` : null;
      const timing = isUnitTimelyFor(u, gradeStage)
        ? 'BEST TIMED FOR THIS STUDENT NOW'
        : (u.gradeFocus?.length ? `usually best in: ${u.gradeFocus.join('/')}` : null);
      const unitOpen = u.lessons.some(l => ['available', 'studying'].includes(stateOf.get(l.id)));
      const unitDone = u.lessons.every(l => DONE_LESSON_STATES.has(stateOf.get(l.id)));
      const access = !lessonInfo.hasState ? null : unitDone ? 'UNIT COMPLETE' : unitOpen ? 'OPEN NOW' : 'LOCKED — do not schedule anything from this unit';
      const tags = [stage, timing, access].filter(Boolean).join('; ');
      const lessons = u.lessons.map(l => `${l.title}${LESSON_TAG[stateOf.get(l.id)] || ''}`).join(', ');
      return `  • ${u.title} (quiz category: ${u.quizCat}${tags ? `; ${tags}` : ''}) — lessons: ${lessons}`;
    })
    .join('\n');
  // Named explicitly and up front, because "avoid the locked ones" is a rule the model has to
  // apply across a long list, while "pick from these five" is a rule it cannot get wrong.
  const openLine = !lessonInfo.hasState
    ? null
    : lessonInfo.open.length
      ? `LESSONS THIS STUDENT CAN ACTUALLY START RIGHT NOW (pick pathway lesson tasks ONLY from this list — everything else in the pathway is either finished or still locked behind it): ${lessonInfo.open.slice(0, 12).map(l => `"${l.title}" (${l.unitTitle})`).join('; ')}`
      : 'THE STUDENT HAS COMPLETED EVERY UNLOCKED PATHWAY LESSON — do not schedule new pathway lessons; use review, quizzes and Portfolio tasks instead.';
  const quizCatCounts = {};
  for (const q of ALL_QUIZZES) quizCatCounts[q.cat] = (quizCatCounts[q.cat] || 0) + 1;
  const quizCats = Object.keys(quizCatCounts);
  const quizLine = Object.entries(quizCatCounts).map(([c, n]) => `${c} (${n})`).join(', ');
  // A per-category sample of REAL quiz titles so the model can name an exact quiz
  // (which the deep-link resolver then matches to a launchable quiz id) instead
  // of inventing plausible-sounding but nonexistent practice sets.
  const quizSampleLines = quizCats
    .map(c => `  • ${c} — e.g. ${ALL_QUIZZES.filter(q => q.cat === c).slice(0, 8).map(q => `"${q.title}"`).join(', ')}`)
    .join('\n');
  const elibCats = [...new Set(ELIB.map(e => e.cat))];
  const deckNames = Object.keys(FLASH_DECKS);
  const articleSample = ELIB.slice(0, 14).map(e => `"${e.title}"`).join(', ');
  const text = [
    `PATHWAY — ${path.label} (this student's current track):`,
    unitLines,
    openLine,
    '',
    `QUIZ LIBRARY: ${ALL_QUIZZES.length} practice quizzes across ${quizLine}. Sample real quiz titles you may reference by exact name:`,
    quizSampleLines,
    `FLASHCARDS: these exact pre-built decks: ${deckNames.join(', ')} — plus "Smart Mix" (all due cards across every deck) and decks the student can generate from their own notes`,
    `E-LIBRARY: ~${ELIB.length} curated articles/videos/courses across ${elibCats.join(', ')} (sample titles: ${articleSample})`,
    `AI COACH: Medabrain chat tutor (inside Prep) for questions, explanations, and being quizzed out loud`,
    `PORTFOLIO TOOLS: College List, Essay Workspace, Deadlines Tracker, Financial Aid Tracker, Activities & Resume Builder, Research Experience Log, Skills & Certifications, Clinical Hours Log, Recommenders Tracker, Interview Prep practice, Test Score Tracker, Admissions Calculator`,
  ].filter(Boolean).join('\n');
  return { text, pathwayLabel: path.label, unitTitles, quizCats, openLessons: lessonInfo.open, lessonInfo };
}

// Turns the same raw Portfolio resource lists buildPortfolioSystemPrompt reasons over
// (src/components/PortfolioMedabrain.jsx fetches them via listItems()) into a compact
// text block grounding plan generation in the student's ACTUAL colleges, essays,
// deadlines, and activities — not just onboarding answers and summary counts. Trimmed
// to a handful of named items per category (not full essay bodies) to keep prompt size
// reasonable; every "no X yet" case is stated explicitly so the model never invents one.
// ── Portfolio read-through ────────────────────────────────────────────────
// "Look through my entire Portfolio before designing the plan" is the whole point of this
// section: every tracked row the student owns is summarized here, and the result is fed to
// every generation call (roadmap, each day chunk, every regeneration). Three properties matter:
//
//   1. NOTHING IS SILENTLY OMITTED. Every category the app can track appears in the digest —
//      including, explicitly, the empty ones ("No recommenders tracked yet"). A category that
//      simply vanished when empty is indistinguishable to the model from a category it forgot
//      to consider, and that's how a plan ends up never mentioning recommenders at all.
//   2. IT REPORTS STATE, NOT JUST COUNTS. "3 essays" tells the model nothing actionable;
//      "2 drafts untouched for 24 days, 1 has no college attached" tells it exactly what
//      tomorrow's essay task should be.
//   3. GAPS ARE NAMED, WITH THE PANEL THAT FIXES THEM. See buildPortfolioGapText below.
// Character budget for the whole "who is this student" block. Sized against api/groq.js's
// MAX_INPUT_CHARS_BY_PURPOSE.masterplan (20,000) with deliberate headroom for the rest of the
// user message — the roadmap headline/overview and the day table the chunk call appends after
// this text. Enforced by dropping whole sections (see the end of buildProfileFactsText), never
// by slicing mid-sentence.
const PROFILE_FACTS_BUDGET = 14000;

const DEFAULT_PORTFOLIO = {
  colleges: [], essays: [], deadlines: [], scholarships: [], activities: [], research: [],
  skills: [], clinicalHours: [], recommenders: [], testScores: [], awards: [], gpaEntries: [],
  collegeChecklist: [], admissionIntake: [],
};
const daysSince = (ts) => {
  if (!ts) return null;
  const t = new Date(ts).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 86400000));
};
const wordCount = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function buildPortfolioFactsText(portfolio) {
  if (!portfolio) return null;
  const p = { ...DEFAULT_PORTFOLIO, ...portfolio };
  const {
    colleges, essays, deadlines, scholarships, activities,
    research, skills, clinicalHours, recommenders, testScores, awards, gpaEntries, collegeChecklist,
    admissionIntake,
  } = p;
  const today = todayStr();
  const lines = [];

  // Colleges — names, category mix, and each school's own deadline pressure.
  if (colleges.length) {
    const byCategory = {};
    for (const c of colleges) { const k = c.category || 'uncategorized'; byCategory[k] = (byCategory[k] || 0) + 1; }
    const catMix = Object.entries(byCategory).map(([k, n]) => `${n} ${k}`).join(', ');
    const named = colleges.slice(0, 10).map(c => {
      const bits = [c.category, c.status].filter(Boolean).join('/');
      const due = c.ea_ed_deadline || c.rd_deadline;
      const d = due ? daysBetween(today, due) : null;
      const when = Number.isFinite(d) && d >= 0 ? `, applies in ${d}d` : '';
      return `${c.name}${bits ? ` (${bits}${when})` : when ? ` (${when.slice(2)})` : ''}`;
    }).join('; ');
    lines.push(`Colleges on their list (${colleges.length}: ${catMix}): ${named}${colleges.length > 10 ? `, +${colleges.length - 10} more` : ''}.`);
    const uncategorized = colleges.filter(c => !c.category).length;
    if (uncategorized) lines.push(`${uncategorized} of those ${uncategorized === 1 ? 'has' : 'have'} no reach/target/safety category set yet — a balanced list is the point of that field.`);
    if (collegeChecklist.length) {
      const doneItems = collegeChecklist.filter(i => i.done).length;
      lines.push(`Per-college application checklist: ${doneItems}/${collegeChecklist.length} items ticked off.`);
    }
  } else {
    lines.push('No colleges on their list yet (College List panel is empty).');
  }

  // Essays — status, length against limit, and staleness. This is what turns a generic
  // "work on your essay" task into "your Michigan supplement is 140 words into a 300-word
  // limit and hasn't been touched in three weeks".
  if (essays.length) {
    const finished = essays.filter(e => e.status === 'final').length;
    const named = essays.slice(0, 8).map(e => {
      const w = wordCount(e.content);
      const limit = e.word_limit ? `/${e.word_limit}` : '';
      const stale = daysSince(e.updated_at);
      const staleBit = stale != null && stale >= 10 ? `, untouched ${stale}d` : '';
      return `"${e.title || 'Untitled'}" (${e.status || 'draft'}, ${w}${limit} ${w === 1 && !limit ? 'word' : 'words'}${staleBit})`;
    }).join('; ');
    lines.push(`Essay drafts (${essays.length}, ${finished} marked final): ${named}${essays.length > 8 ? `, +${essays.length - 8} more` : ''}.`);
    const empty = essays.filter(e => wordCount(e.content) < 25).length;
    if (empty) lines.push(`${empty} essay ${empty === 1 ? 'entry has' : 'entries have'} almost nothing written yet — those are the ones to schedule real writing time for.`);
  } else {
    lines.push('No essay drafts started yet (Essay Workspace is empty).');
  }

  // Deadlines — both directions. Overdue matters as much as upcoming, and a plan that
  // never mentions a missed deadline is worse than no plan.
  const dated = deadlines.map(d => ({ ...d, days: daysBetween(today, d.due_date) })).filter(d => Number.isFinite(d.days));
  const upcoming = dated.filter(d => d.days >= 0).sort((a, b) => a.days - b.days);
  const overdue = dated.filter(d => d.days < 0).sort((a, b) => b.days - a.days);
  lines.push(upcoming.length
    ? `Upcoming deadlines, soonest first: ${upcoming.slice(0, 6).map(d => `"${d.title}" in ${d.days}d`).join('; ')}${upcoming.length > 6 ? `, +${upcoming.length - 6} more` : ''}.`
    : 'No upcoming deadlines tracked.');
  if (overdue.length) lines.push(`ALREADY PAST DUE and still on their tracker: ${overdue.slice(0, 4).map(d => `"${d.title}" (${Math.abs(d.days)}d ago)`).join('; ')} — address these explicitly rather than planning around them.`);

  // Activities — hours, leadership, and verification, not just a count.
  if (activities.length) {
    const totalHours = activities.reduce((s, a) => s + ((a.hours_per_week || 0) * (a.weeks_per_year || 0)), 0);
    const leadership = activities.filter(a => a.leadership_role).length;
    const verified = activities.filter(a => a.verification_status === 'verified').length;
    const named = activities.slice(0, 8).map(a => `${a.position || a.activity_type}${a.organization ? ` at ${a.organization}` : ''}${a.leadership_role ? ' [leadership]' : ''}`).join('; ');
    lines.push(`Activities logged (${activities.length}, ~${Math.round(totalHours)} hrs/yr total, ${leadership} with a leadership role, ${verified} verified): ${named}${activities.length > 8 ? `, +${activities.length - 8} more` : ''}.`);
    const thin = activities.filter(a => !a.description || wordCount(a.description) < 12).length;
    if (thin) lines.push(`${thin} of those ${thin === 1 ? 'has' : 'have'} a thin or missing description — those need writing up before they're usable on an application.`);
  } else {
    lines.push('No activities logged yet (Activities & résumé panel is empty).');
  }

  // Clinical / shadowing — the single most decisive Portfolio metric for a pre-health student.
  if (clinicalHours.length) {
    const total = clinicalHours.reduce((s, h) => s + (h.hours || 0), 0);
    const sites = [...new Set(clinicalHours.map(h => h.site_name).filter(Boolean))];
    const verified = clinicalHours.filter(h => h.verification_status === 'verified').reduce((s, h) => s + (h.hours || 0), 0);
    const lastEntry = clinicalHours.map(h => h.entry_date).filter(Boolean).sort().at(-1);
    const gap = lastEntry ? daysBetween(lastEntry, today) : null;
    lines.push(`${total} clinical/shadowing hour(s) logged across ${plural(sites.length, 'site')}${sites.length ? ` (${sites.slice(0, 4).join(', ')})` : ''}; ${verified} verified${Number.isFinite(gap) ? `; most recent entry ${gap}d ago` : ''}.`);
  } else {
    lines.push('No clinical/shadowing hours logged yet (Clinical Hours Log is empty).');
  }

  lines.push(research.length
    ? `Research experience (${research.length}): ${research.slice(0, 4).map(r => `${r.title}${r.institution ? ` at ${r.institution}` : ''}${r.status ? ` (${r.status})` : ''}`).join('; ')}.`
    : 'No research experience logged yet.');

  if (recommenders.length) {
    const confirmed = recommenders.filter(r => r.status === 'confirmed' || r.status === 'submitted').length;
    lines.push(`Recommenders (${recommenders.length}, ${confirmed} confirmed/submitted): ${recommenders.slice(0, 5).map(r => `${r.name}${r.relationship ? ` (${r.relationship})` : ''}${r.status ? ` — ${r.status}` : ''}`).join('; ')}.`);
  } else {
    lines.push('No recommenders tracked yet.');
  }

  lines.push(skills.length ? `Skills/certifications (${skills.length}): ${skills.slice(0, 6).map(s => s.name).join(', ')}.` : 'No skills/certifications logged yet.');
  lines.push(awards.length ? `Awards/honors (${awards.length}): ${awards.slice(0, 5).map(a => `${a.title}${a.level ? ` (${a.level})` : ''}`).join('; ')}.` : 'No awards/honors logged yet.');

  if (scholarships.length) {
    const openOnes = scholarships.map(s => ({ ...s, days: s.deadline ? daysBetween(today, s.deadline) : null }))
      .filter(s => s.days == null || s.days >= 0);
    lines.push(`Scholarships tracked (${scholarships.length}): ${openOnes.slice(0, 4).map(s => `${s.name}${s.amount ? ` ($${s.amount})` : ''}${Number.isFinite(s.days) ? ` in ${s.days}d` : ''}`).join('; ') || 'all past their deadline'}.`);
  } else {
    lines.push('No scholarships tracked yet (Financial Aid panel is empty).');
  }

  // Test scores and GPA — trend, not just the latest value.
  if (testScores.length) {
    const sorted = [...testScores].sort((a, b) => new Date(a.test_date || 0) - new Date(b.test_date || 0));
    const latest = sorted.at(-1);
    const first = sorted[0];
    const delta = sorted.length > 1 && Number.isFinite(Number(latest.composite)) && Number.isFinite(Number(first.composite))
      ? Number(latest.composite) - Number(first.composite) : null;
    lines.push(`Logged test scores (${testScores.length}): most recent ${latest.test_type} ${latest.composite}${latest.test_date ? ` on ${latest.test_date}` : ''}${delta != null ? `; ${delta >= 0 ? 'up' : 'down'} ${Math.abs(delta)} points since their first logged attempt` : ''}.`);
  } else {
    lines.push('No official/practice test scores logged in the Score Tracker yet.');
  }
  if (gpaEntries.length) {
    const sorted = [...gpaEntries].sort((a, b) => String(a.term || '').localeCompare(String(b.term || '')));
    const latest = sorted.at(-1);
    const trend = sorted.length > 1 ? (Number(latest.gpa) - Number(sorted[0].gpa)) : null;
    lines.push(`Logged GPA (${gpaEntries.length} term(s)): most recent ${latest.gpa}${latest.term ? ` (${latest.term})` : ''}${Number.isFinite(trend) && Math.abs(trend) >= 0.05 ? `, ${trend > 0 ? 'trending up' : 'trending down'} ${Math.abs(trend).toFixed(2)} since ${sorted[0].term || 'their first logged term'}` : ''}.`);
  } else {
    lines.push('No GPA terms logged yet.');
  }

  // The Admissions Calculator's intake. Reported as a COUNT of answered fields rather than as the
  // answers themselves: the plan needs to know whether the student's eligibility can be checked
  // at all, and the individual answers (citizenship, residency) are neither the planner's business
  // nor worth the tokens.
  const intake = (admissionIntake || [])[0];
  if (intake) {
    const answered = Object.keys(intake.answers && typeof intake.answers === 'object' ? intake.answers : {}).length
      + ['citizenship', 'state_residency', 'grade_level'].filter(k => intake[k]).length;
    lines.push(`Admissions Calculator intake: ${answered} field(s) answered${intake.citizenship ? '' : ', citizenship not answered (so eligibility for combined-degree programs cannot be checked)'}.`);
  } else {
    lines.push('Admissions Calculator intake not started, so no program eligibility has been checked.');
  }

  return lines.filter(Boolean).join('\n');
}

// ── Gap analysis ──────────────────────────────────────────────────────────
// Computed locally and deterministically rather than left for the model to notice. Each gap
// names the exact in-app panel that closes it, which is what lets the day-chunk generator emit
// a task that both means something and links somewhere real. Ordered most-urgent-first and
// capped, so the prompt gets a priority list rather than an undifferentiated wishlist.
function buildPortfolioGapText(portfolio, user) {
  if (!portfolio) return null;
  const p = { ...DEFAULT_PORTFOLIO, ...portfolio };
  const gradeIdx = gradeIdxFromStage(gradeNow(user));
  const isUpperclass = gradeIdx >= 2; // junior or later
  const clinicalTotal = p.clinicalHours.reduce((s, h) => s + (h.hours || 0), 0);
  const gaps = [];
  const add = (priority, gap, panel) => gaps.push({ priority, gap, panel });

  if (!p.colleges.length) add(isUpperclass ? 1 : 3, 'No college list at all', 'Portfolio → College List');
  else if (p.colleges.length < 4 && isUpperclass) add(2, `Only ${plural(p.colleges.length, 'school')} on the list — a workable list is closer to 6-10 across reach/target/safety`, 'Portfolio → College List');
  if (!clinicalTotal) add(1, 'Zero clinical or shadowing hours logged — the single most visible gap for a pre-health applicant', 'Portfolio → Clinical Hours Log');
  else if (clinicalTotal < 40 && isUpperclass) add(2, `Only ${clinicalTotal} clinical/shadowing hours — thin for a junior/senior`, 'Portfolio → Clinical Hours Log');
  if (!p.activities.length) add(1, 'No activities logged, so there is nothing to build a résumé from', 'Portfolio → Activities & résumé');
  else if (!p.activities.some(a => a.leadership_role)) add(3, 'No leadership role in any logged activity', 'Portfolio → Activities & résumé');
  if (isUpperclass && !p.recommenders.length) add(2, 'No recommenders identified yet — teachers get asked early or they get overbooked', 'Portfolio → Recommenders');
  if (isUpperclass && !p.essays.length) add(2, 'No essay drafts started', 'Portfolio → Essay Workspace');
  if (!p.gpaEntries.length) add(4, 'No GPA terms logged, so academic trend is invisible to the plan', 'Portfolio → Activities & résumé (Academics)');
  if (!p.research.length && gradeIdx >= 1) add(4, 'No research experience logged', 'Portfolio → Research Log');
  if (!p.skills.length) add(4, 'No skills/certifications logged (CPR, first aid, lab techniques all count)', 'Portfolio → Skills & Certifications');
  if (!p.scholarships.length && isUpperclass) add(4, 'No scholarships tracked', 'Portfolio → Financial Aid');
  if (!p.deadlines.length && isUpperclass) add(3, 'No application deadlines tracked', 'Portfolio → Milestones');
  if (!(p.admissionIntake || []).length) add(isUpperclass ? 2 : 4, 'Admissions Calculator intake not started — until it is, no program\'s published eligibility requirements have been checked against this student at all', 'Portfolio → Admissions Calc');
  else if (!(p.admissionIntake[0] || {}).citizenship) add(3, 'Citizenship/residency unanswered in the Admissions Calculator, which is a hard eligibility gate at several combined-degree programmes', 'Portfolio → Admissions Calc');

  if (!gaps.length) return 'Their Portfolio has at least something in every major category — the plan should deepen and polish what is there rather than fill blanks.';
  return gaps
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 7)
    .map((g, i) => `${i + 1}. ${g.gap} → fixed in ${g.panel}`)
    .join('\n');
}

// ── Plan adherence ────────────────────────────────────────────────────────
// What the student has actually DONE with the plan they already have, read back out of the
// plan's own days + compacted progressLog. This is what makes each extension/regeneration
// adapt to reality rather than re-issuing the same load the student has been quietly missing
// for two weeks. Null for a student with no plan yet (nothing to learn from).
export function buildAdherenceFacts(plan) {
  if (!plan?.days?.length && !plan?.progressLog?.length) return null;
  const today = todayStr();
  const byDate = new Map();
  for (const l of (plan.progressLog || [])) byDate.set(l.date, { total: l.tasksTotal || 0, done: l.tasksDone || 0 });
  for (const d of (plan.days || [])) byDate.set(d.date, { total: d.tasks.length, done: d.tasks.filter(t => t.done).length });
  const elapsed = [...byDate.entries()].filter(([date]) => date < today).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  if (!elapsed.length) return null;
  const recent = elapsed.slice(-21);
  const totalTasks = recent.reduce((s, [, v]) => s + v.total, 0);
  const doneTasks = recent.reduce((s, [, v]) => s + v.done, 0);
  const completionPct = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const fullDays = recent.filter(([, v]) => v.total > 0 && v.done === v.total).length;
  const zeroDays = recent.filter(([, v]) => v.total > 0 && v.done === 0).length;

  // Which kinds of task actually get done vs skipped — only computable for days still held in
  // full detail (progressLog keeps counts only), which is exactly the recent window that matters.
  const byType = new Map();
  const byWeekday = new Map();
  for (const d of (plan.days || [])) {
    if (d.date >= today) continue;
    for (const t of d.tasks) {
      const e = byType.get(t.type) || { total: 0, done: 0 };
      e.total++; if (t.done) e.done++;
      byType.set(t.type, e);
    }
    const wd = WEEKDAY_NAMES[weekdayIdx(d.date)];
    const w = byWeekday.get(wd) || { total: 0, done: 0 };
    w.total += d.tasks.length; w.done += d.tasks.filter(t => t.done).length;
    byWeekday.set(wd, w);
  }
  const rate = ([, v]) => (v.total ? v.done / v.total : 0);
  const typed = [...byType.entries()].filter(([, v]) => v.total >= 2);
  const skipped = typed.filter(e => rate(e) < 0.4).sort((a, b) => rate(a) - rate(b)).slice(0, 3).map(([k]) => k);
  const reliable = typed.filter(e => rate(e) >= 0.8).sort((a, b) => rate(b) - rate(a)).slice(0, 3).map(([k]) => k);
  const weekdays = [...byWeekday.entries()].filter(([, v]) => v.total >= 2);
  const bestDay = weekdays.sort((a, b) => rate(b) - rate(a))[0]?.[0] || null;
  const worstDay = weekdays.sort((a, b) => rate(a) - rate(b))[0]?.[0] || null;

  return {
    daysObserved: recent.length, completionPct, fullDays, zeroDays,
    skippedTypes: skipped, reliableTypes: reliable, bestDay, worstDay,
    avgTasksPerDay: recent.length ? Math.round((totalTasks / recent.length) * 10) / 10 : 0,
  };
}

function buildAdherenceText(plan) {
  const a = buildAdherenceFacts(plan);
  if (!a) return null;
  const lines = [
    `Over their last ${plural(a.daysObserved, 'planned day')} they completed ${a.completionPct}% of scheduled tasks (${a.fullDays} fully-finished ${a.fullDays === 1 ? 'day' : 'days'}, ${a.zeroDays} ${a.zeroDays === 1 ? 'day' : 'days'} with nothing done), averaging ${a.avgTasksPerDay} tasks/day scheduled.`,
  ];
  if (a.skippedTypes.length) lines.push(`Task types they consistently SKIP: ${a.skippedTypes.join(', ')} — either make these smaller and more concrete, schedule them on a better day, or use fewer of them.`);
  if (a.reliableTypes.length) lines.push(`Task types they reliably finish: ${a.reliableTypes.join(', ')} — anchor days around these.`);
  if (a.bestDay && a.worstDay && a.bestDay !== a.worstDay) lines.push(`Their strongest weekday is ${a.bestDay}; their weakest is ${a.worstDay} — weight the load accordingly instead of spreading it evenly.`);
  if (a.completionPct < 50) lines.push('IMPORTANT: they are finishing less than half of what is scheduled. Cut the daily task count and shorten estimates rather than repeating a load that is demonstrably not happening.');
  else if (a.completionPct > 92 && a.avgTasksPerDay < 5) lines.push('They are finishing essentially everything scheduled — it is safe to add depth or one more task per day.');
  return lines.join('\n');
}

// The live cross-app signals block — everything the rest of the app already knows about how
// this student is actually performing right now, which the plan previously saw only three or
// four fields of. Each entry is omitted (not faked) when its source has no data.
function buildPerformanceFactsText(liveSignals = {}) {
  const s = liveSignals;
  const lines = [];
  if (s.categoryAverages && Object.keys(s.categoryAverages).length) {
    const rows = Object.entries(s.categoryAverages)
      .filter(([, v]) => Number.isFinite(v))
      .sort((a, b) => a[1] - b[1])
      .map(([k, v]) => `${k} ${Math.round(v)}%`);
    if (rows.length) lines.push(`Quiz averages by category, weakest first: ${rows.join(', ')}.`);
  }
  if (Number.isFinite(s.quizzesTaken)) lines.push(`Quizzes completed so far: ${s.quizzesTaken}.`);
  if (Number.isFinite(s.pathwayMastery)) lines.push(`Pathway lesson completion: ${s.pathwayMastery}%.`);
  if (Number.isFinite(s.dueCards) && s.dueCards > 0) lines.push(`${s.dueCards} flashcard(s) due for review right now.`);
  if (s.applicationStrength) {
    const sub = s.applicationStrength.subscores || {};
    lines.push(`Application strength score: ${s.applicationStrength.score}/100 (${s.applicationStrength.label}) — academic ${sub.academic}, clinical ${sub.clinical}, application ${sub.application}, activities ${sub.activities}. The lowest subscore is where this plan should spend its extra weight.`);
  }
  if (s.recentActivitySummary) lines.push(`Recent activity across the whole app: ${s.recentActivitySummary}`);
  lines.push(`Current study streak: ${s.streak || 0} day(s).`);
  return lines.join('\n');
}

export function buildProfileFactsText(user, liveSignals = {}, portfolio = null, plan = null) {
  const { dailyMinutes, weeklyQuestions } = deriveLoad(user || {});
  const gradeLabel = GRADE_STAGES[gradeIdxFromStage(gradeNow(user))]?.label || 'high school';
  const goalLabel = labelOf(GOAL_OPTIONS, user?.goal) || 'exploring medicine';
  const obstacles = labelsOf(OBSTACLE_OPTIONS, user?.obstacles);
  const accomplish = labelsOf(ACCOMPLISH_OPTIONS, user?.accomplish);
  const studyMethodLabel = labelOf(STUDY_METHOD_OPTIONS, user?.studyMethod);
  const lines = [
    `Name: ${user?.name || 'the student'}`,
    `Grade: ${gradeLabel}`,
    `Weekly study time available: ${user?.studyHours || 'unsure'}`,
    `Pace: about ${dailyMinutes} minutes/day, ${weeklyQuestions} practice questions/week`,
    `Primary goal: ${goalLabel}`,
    labelOf(WHY_MEDICINE_OPTIONS, user?.whyMedicine) ? `Why they're drawn to medicine: ${labelOf(WHY_MEDICINE_OPTIONS, user?.whyMedicine)}` : null,
    (user?.dreamRole && user.dreamRole !== 'undecided') ? `Dream health role: ${labelOf(DREAM_ROLE_OPTIONS, user.dreamRole)}` : null,
    labelOf(CERTAINTY_OPTIONS, user?.certainty) ? `Certainty about medicine: ${labelOf(CERTAINTY_OPTIONS, user?.certainty)}` : null,
    (user?.gpaBand && user.gpaBand !== 'unsure') ? `Self-reported grades: ${labelOf(GPA_OPTIONS, user.gpaBand)}` : null,
    labelsOf(SCIENCE_OPTIONS, user?.sciences).length ? `Science courses: ${labelsOf(SCIENCE_OPTIONS, user.sciences).join(', ')}` : null,
    labelsOf(EXPERIENCE_OPTIONS, user?.healthExperience).length ? `Hands-on health experience: ${labelsOf(EXPERIENCE_OPTIONS, user.healthExperience).join(', ')}` : null,
    accomplish.length ? `Wants to accomplish: ${accomplish.join(', ')}` : null,
    obstacles.length ? `Their stated obstacles: ${obstacles.join(', ')}` : null,
    (studyMethodLabel && user?.studyMethod !== 'none') ? `Also currently using: ${studyMethodLabel}` : null,
    liveSignals.weakestCategory ? `Weakest quiz category right now: ${liveSignals.weakestCategory} (${liveSignals.weakestScore}%)` : null,
    liveSignals.nextDeadlineTitle ? `Next upcoming deadline: "${liveSignals.nextDeadlineTitle}" in ${liveSignals.nextDeadlineDays} day(s)` : null,
    // Things the student said directly (typed or dictated by mic — see PlanVoiceNotes in
    // PlansTab.jsx) — the highest-signal input there is, since it's exactly what they asked for
    // in their own words, not an inference. Weight it accordingly: treat these as real
    // constraints/requests to actually build into the plan, not just background color.
    (user?.planNotes || []).length ? `The student told Medabrain directly (treat these as real, current requests to build into the plan):\n${user.planNotes.map(n => `  • ${n}`).join('\n')}` : null,
  ].filter(Boolean);

  // Optional deep-context blocks, each tagged with a drop priority (higher = dropped first).
  // The server caps a masterplan user message at MAX_INPUT_CHARS_BY_PURPOSE.masterplan and
  // truncates from the END, which for the day-chunk call would silently amputate the list of
  // days to fill in — the single most structurally important part of the message. So the budget
  // is enforced here instead, by dropping whole low-priority sections rather than letting a
  // blind slice cut a section (or an instruction) in half.
  const blocks = [];
  const perf = buildPerformanceFactsText(liveSignals);
  if (perf) blocks.push({ drop: 2, text: `\nHOW THEY ARE ACTUALLY PERFORMING RIGHT NOW (measured in-app, not self-reported):\n${perf}` });
  const portfolioText = buildPortfolioFactsText(portfolio);
  if (portfolioText) {
    blocks.push({ drop: 1, text: `\nTHEIR ENTIRE PORTFOLIO, READ ROW BY ROW (reference these by name in Portfolio-pillar tasks instead of generic busywork — an essay task should name the real essay and its word count, a deadline task should name the real deadline, a clinical task should name the real site):\n${portfolioText}` });
    const gapText = buildPortfolioGapText(portfolio, user);
    if (gapText) blocks.push({ drop: 1, text: `\nTHE BIGGEST GAPS IN THAT PORTFOLIO, most urgent first — the plan is judged on whether it closes these:\n${gapText}` });
  } else {
    blocks.push({ drop: 1, text: '\nTHEIR PORTFOLIO: could not be read this time. Keep Portfolio tasks generic and safe — do NOT name specific colleges, essays, or deadlines you cannot see.' });
  }
  const adherenceText = buildAdherenceText(plan);
  if (adherenceText) blocks.push({ drop: 2, text: `\nHOW THEY HAVE ACTUALLY BEEN FOLLOWING THE PLAN SO FAR (adapt to this — do not repeat a load they are demonstrably not completing):\n${adherenceText}` });
  if (liveSignals.personalBrief) {
    blocks.push({ drop: 2, text: `\nWHAT THEY HAVE TOLD MEDABRAIN ABOUT THEMSELVES IN THEIR OWN WORDS (the most authoritative context here — outrank the tick-boxes above where they conflict):\n${String(liveSignals.personalBrief).slice(0, 2600)}` });
  }
  if (liveSignals.timelineSummary) {
    blocks.push({ drop: 3, text: `\nTHEIR ADMISSIONS TIMELINE (already computed for their exact class year — reason over this list, never invent dates of your own):\n${String(liveSignals.timelineSummary).slice(0, 2200)}` });
  }

  const head = lines.join('\n');
  let budget = PROFILE_FACTS_BUDGET - head.length;
  const kept = new Set();
  // Two passes over the drop-priority ladder: everything at priority 1 gets first claim on the
  // budget, then 2, then 3 — so a huge Portfolio can cost the timeline block its place, but
  // never the other way around.
  for (const level of [1, 2, 3]) {
    for (const b of blocks) {
      if (b.drop !== level || kept.has(b)) continue;
      if (b.text.length <= budget) { kept.add(b); budget -= b.text.length; }
    }
  }
  return [head, ...blocks.filter(b => kept.has(b)).map(b => b.text)].join('\n');
}

const AGE_APPROPRIATE_RULES = `- They are years away from medical school. NEVER mention the MCAT, medical-school applications, residency, clinical rotations, MMI, or CASPer. Frame everything as high-school and undergraduate-admissions prep with an eye toward a future health career.
- NEVER schedule SAT or ACT work, test-prep sessions, practice tests or score goals: this product has no test-prep tools, so such a task is one the student cannot open. Build the plan from science foundations, Portfolio-building (activities, shadowing, essays, deadlines), and honest exploration of whether medicine fits.
- Be emotionally attuned to their stated obstacles and pace — this is a teenager, not a client.
- Reference their actual goal, grade, pace, pathway, and obstacles by name so it reads as built for them, not templated.
- Ground every concrete task or resource mention ONLY in things listed in the MedSchoolPrep resource catalog below — never invent a book, tool, or resource that isn't in that list.`;

// ── JSON extraction/repair — same defensive philosophy as planGenerator.js,
// adapted for this schema's nested arrays. ──────────────────────────────────
function parseLooseJSON(text) {
  if (!text) return null;
  let s = String(text).trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const first = s.indexOf('{'); const last = s.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  const body = s.slice(first, last + 1);
  const tryParse = (t) => { try { return JSON.parse(t); } catch { return null; } };
  return (
    tryParse(body) ||
    tryParse(body.replace(/,\s*([}\]])/g, '$1')) ||
    tryParse(body.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/,\s*([}\]])/g, '$1')) ||
    null
  );
}
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

// ── Talking to the Oracle, and refusing to fail silently ───────────────────
// Every generation call in this file resolves to a complete, usable plan no matter what happens
// on the wire — which is the right contract, and was also how this feature broke without anyone
// being able to see it. A 429, a truncated completion or a timeout produced `null`, `null` became
// the deterministic heuristic days, and the student got a plan that arrived in under a second and
// said "Practice quiz / Continue your pathway / Flashcard review" every single time. It looked
// like a plan. It was an error message wearing a plan's clothes.
//
// Two things fix that here. First, real retries: a rate limit or a transient upstream failure is
// waited out with backoff (honouring the server's own retryAfterMs) rather than instantly retried
// into the same wall. Generation is allowed to take its time — it happens rarely, the student is
// looking at a progress screen, and a plan worth following is worth thirty more seconds. Second,
// every attempt is recorded on a trace that travels back with the result, so a plan that DID fall
// back is marked as such on the stored plan (`plan.generation.degraded`) and the UI can say so and
// offer a retry, instead of quietly presenting the fallback as Medabrain's best thinking.
const ORACLE_ATTEMPTS = 4;
const ORACLE_BACKOFF_MS = [1500, 4000, 9000];
// Just above the server's own abort (52s by default — see TIMEOUT_MS_BY_PURPOSE in api/groq.js),
// so the server's 504 wins the race and we get a real status to act on instead of an opaque client
// abort. If that server-side ceiling is ever raised via GROQ_MASTERPLAN_TIMEOUT_MS, raise this too
// or the client will start giving up on requests the server was still going to answer.
const ORACLE_TIMEOUT_MS = 58000;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export function createGenerationTrace() {
  return { calls: 0, aiCalls: 0, fallbacks: 0, attempts: 0, errors: [], startedAt: Date.now() };
}
function noteError(trace, stage, detail) {
  if (!trace) return;
  if (trace.errors.length < 12) trace.errors.push(`${stage}: ${detail}`);
}

// One HTTP attempt. Returns { parsed } on success, or { retryable, status, detail, waitMs } so the
// caller can decide whether waiting would plausibly help.
async function callOracleOnce({ system, user, maxTokens, reasoningEffort }) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), ORACLE_TIMEOUT_MS) : null;
  try {
    const r = await fetch('/api/groq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system, message: user, maxTokens, purpose: 'masterplan', tier: 'oracle', jsonMode: true, reasoningEffort, lane: aiLane() }),
      signal: controller ? controller.signal : undefined,
    });
    if (!r.ok) {
      let waitMs = null;
      let detail = `HTTP ${r.status}`;
      try {
        const body = await r.json();
        if (Number.isFinite(Number(body?.retryAfterMs))) waitMs = Number(body.retryAfterMs);
        if (body?.error) detail = `HTTP ${r.status} — ${String(body.error).slice(0, 120)}`;
      } catch { /* a non-JSON error body is still just an error */ }
      // 429 and 5xx are worth waiting out; a 4xx is a bad request that will fail identically.
      return { retryable: r.status === 429 || r.status >= 500, status: r.status, detail, waitMs };
    }
    const d = await r.json();
    const parsed = parseLooseJSON(d && d.content);
    // A 200 whose body will not parse is nearly always a completion truncated by the output
    // ceiling. Retrying is worth one shot — the same prompt often lands shorter — but it is a
    // distinct failure from a network one, so it is recorded as such.
    if (!parsed) return { retryable: true, status: 200, detail: 'response was not parseable JSON (likely truncated)', waitMs: 0 };
    return { parsed };
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    return { retryable: true, status: 0, detail: aborted ? 'client timeout' : `network error (${err?.message || 'unknown'})`, waitMs: aborted ? 0 : 1000 };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function callOracle(args, trace = null, stage = 'generation') {
  if (trace) trace.calls += 1;
  for (let attempt = 0; attempt < ORACLE_ATTEMPTS; attempt++) {
    if (trace) trace.attempts += 1;
    const result = await callOracleOnce(args);
    if (result.parsed) {
      if (trace) trace.aiCalls += 1;
      return result.parsed;
    }
    noteError(trace, stage, `attempt ${attempt + 1} ${result.detail}`);
    if (!result.retryable || attempt === ORACLE_ATTEMPTS - 1) break;
    const backoff = ORACLE_BACKOFF_MS[Math.min(attempt, ORACLE_BACKOFF_MS.length - 1)];
    await sleep(Math.max(backoff, result.waitMs || 0));
  }
  if (trace) trace.fallbacks += 1;
  return null;
}

// ── Deep-link destination whitelist ────────────────────────────────────────
// A model can hallucinate a tab/view that doesn't exist — validated against
// the app's real NAV/SubNav ids (src/App.jsx) so a bad value just means "no
// link" instead of a broken navigation click.
export const VALID_DESTINATIONS = new Set([
  'prep:diagnostic', 'prep:pathways', 'prep:quizzes', 'prep:flashcards', 'prep:coach', 'prep:library',
  'portfolio:overview', 'portfolio:milestones', 'portfolio:colleges', 'portfolio:essays',
  'portfolio:aid', 'portfolio:resume', 'portfolio:research', 'portfolio:skills', 'portfolio:clinical',
  'portfolio:recommenders', 'portfolio:interview', 'portfolio:tracked', 'portfolio:calc',
  'progress:overview', 'progress:verified', 'progress:performance', 'progress:achievements',
]);
// No 'sat:*' destinations. The SAT pillar is sealed for v1
// (src/lib/betaFlags.js), so a plan task pointing at it would land the student
// on a locked screen. Plans generated before the seal can still carry them;
// sanitizeDestination() drops the link, and isRetiredTask() below drops the
// task itself, so an old roadmap degrades to its non-SAT days rather than
// showing work nobody can do.
// Sub-views that were merged away. A master plan is stored on the student's
// record and re-read for months, so plans generated before the Deadlines and
// Timeline tabs became one still carry the old ids — they get remapped rather
// than silently losing their link.
const RETIRED_VIEWS = { 'portfolio:deadlines': 'milestones', 'portfolio:timeline': 'milestones', 'prep:pathway': 'pathways' };

function sanitizeDestination(tab, view) {
  if (!tab || !view) return { resourceTab: null, resourceView: null };
  const retired = RETIRED_VIEWS[`${tab}:${view}`];
  const v = retired || view;
  if (!VALID_DESTINATIONS.has(`${tab}:${v}`)) return { resourceTab: null, resourceView: null };
  return { resourceTab: tab, resourceView: v };
}
const VALID_PILLARS = new Set(['prep', 'portfolio', 'progress', 'rest']);
const VALID_TASK_TYPES = new Set(['lesson', 'quiz', 'flashcards', 'reading', 'coach', 'activity', 'college', 'essay', 'deadline', 'clinical', 'research', 'recommender', 'interview', 'reflection', 'rest']);

// Task shapes that existed before the SAT pillar was sealed. A master plan
// lives on the student's record for months, so plans built while SAT work was
// schedulable are still out there. Rather than leave a student staring at
// "Smart Set: 12 questions on Boundaries" with no way to open it, these are
// dropped wherever a stored plan is read.
const RETIRED_TASK_TYPES = new Set(['sat_practice', 'sat_review', 'sat_test']);
export function isRetiredTask(task) {
  return RETIRED_TASK_TYPES.has(task?.type) || task?.pillar === 'sat' || task?.resourceTab === 'sat';
}
/** Strip retired tasks out of a stored plan's days. Returns the same shape. */
export function dropRetiredTasks(days) {
  if (!Array.isArray(days)) return days;
  return days.map((d) => (Array.isArray(d?.tasks) && d.tasks.some(isRetiredTask)
    ? { ...d, tasks: d.tasks.filter((t) => !isRetiredTask(t)) }
    : d));
}

// ── Specific-resource resolution — the "give me the actual link" layer ─────
// A task saying "take a quiz" is only useful if clicking it opens THE quiz. Every task is resolved here, deterministically and locally,
// to a concrete launchable resource: a real quiz id, a real pathway lesson
// id, a real flashcard deck name, or a real E-Library article title. The AI
// may *suggest* a resource by name (resourceName in the day-chunk schema);
// this resolver validates that suggestion against the app's actual catalogs
// and, when it doesn't match anything real, falls back to a sensible pick —
// so a link is present and working on 100% of tasks regardless of what the
// model returned.
const TYPE_DEFAULT_DEST = {
  lesson: ['prep', 'pathways'], quiz: ['prep', 'quizzes'], flashcards: ['prep', 'flashcards'],
  reading: ['prep', 'library'], coach: ['prep', 'coach'],
  activity: ['portfolio', 'resume'], college: ['portfolio', 'colleges'], essay: ['portfolio', 'essays'],
  deadline: ['portfolio', 'milestones'], clinical: ['portfolio', 'clinical'], research: ['portfolio', 'research'],
  recommender: ['portfolio', 'recommenders'], interview: ['portfolio', 'interview'],
  reflection: ['progress', 'overview'], rest: null,
};
const VIEW_LABELS = {
  'prep:diagnostic': 'Pathway Diagnostic', 'prep:pathways': 'Your Pathway', 'prep:quizzes': 'Quiz Library',
  'prep:flashcards': 'Flashcards', 'prep:coach': 'AI Coach', 'prep:library': 'E-Library',
  'portfolio:overview': 'Portfolio Overview', 'portfolio:milestones': 'Milestones', 'portfolio:colleges': 'College List',
  'portfolio:essays': 'Essay Workspace', 'portfolio:aid': 'Financial Aid',
  'portfolio:resume': 'Activities & Resume', 'portfolio:research': 'Research Log', 'portfolio:skills': 'Skills & Certs',
  'portfolio:clinical': 'Clinical Hours Log', 'portfolio:recommenders': 'Recommenders', 'portfolio:interview': 'Interview Prep',
  'portfolio:tracked': 'Tracked Applications', 'portfolio:calc': 'Admissions Calculator',
  'progress:overview': 'Progress Overview', 'progress:verified': 'Verified Progress',
  'progress:performance': 'Performance', 'progress:achievements': 'Achievements',
};

const MATCH_STOPWORDS = new Set(['the', 'and', 'for', 'your', 'with', 'into', 'from', 'that', 'this', 'you', 'are', 'not', 'set', 'sets', 'practice', 'quiz', 'quizzes', 'deck', 'decks', 'review', 'lesson', 'lessons', 'unit', 'library', 'session', 'question', 'questions', 'flashcard', 'flashcards', 'card', 'cards', 'study', 'read', 'reading', 'article', 'video', 'complete', 'continue', 'today', 'daily']);
function matchTokens(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/)
    .filter(w => w.length > 2 && !MATCH_STOPWORDS.has(w));
}
// Best token-overlap candidate; `min` guards against coincidental one-word hits
// when matching loose free text (title+detail) rather than an exact name.
function bestMatch(text, candidates, getTitle, min = 2) {
  const qt = new Set(matchTokens(text));
  if (!qt.size) return null;
  let best = null, bestScore = 0;
  for (const c of candidates) {
    const ct = matchTokens(getTitle(c));
    let score = 0;
    for (const t of ct) if (qt.has(t)) score++;
    if (score > bestScore || (score === bestScore && score > 0 && best && matchTokens(getTitle(best)).length > ct.length)) {
      if (score > 0) { best = c; bestScore = score; }
    }
  }
  return bestScore >= Math.min(min, matchTokens(text).length) ? best : null;
}
// Deterministic small hash so fallback picks vary day to day (and task to
// task) without any randomness — the same plan always resolves the same way.
function seedFrom(str) {
  let h = 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// `lessons` is the pool a lesson task is allowed to land on — everything the student can open
// today. `allLessons` keeps the full list so an exact name the model wrote can still be recognized
// (and then judged against the open pool) rather than falling through to a blind rotation.
function buildResourceIndex(specialtyKey, pathwayState = null) {
  const info = classifyPathwayLessons(specialtyKey, pathwayState);
  const openPool = info.open.length ? info.open : info.all;
  return {
    lessons: openPool.map(l => ({ id: l.id, title: l.title, unitTitle: l.unitTitle })),
    allLessons: info.all,
    lessonStates: new Map(info.all.map(l => [l.id, l.state])),
    quizzes: ALL_QUIZZES.map(q => ({ id: q.id, title: q.title, cat: q.cat, diff: q.diff })),
    decks: Object.keys(FLASH_DECKS),
    articles: ELIB.map(e => ({ title: e.title, cat: e.cat })),
  };
}

// True when a lesson id is one the student cannot start (locked) or has already finished — the two
// ways a lesson task goes stale. Used both at resolve time and by retargetStaleTasks below.
function lessonIsSchedulable(index, lessonId) {
  const state = index?.lessonStates?.get?.(lessonId);
  if (!state) return true; // no unlock data for this index — treat as open (see classifyPathwayLessons)
  return state === 'available' || state === 'studying';
}

// Resolves ONE task to { resourceTab, resourceView, resourceKind, resourceId,
// resourceLabel }. Never throws; always returns a complete link object (or a
// bare view link when the type has no addressable resource, e.g. coach/rest).
export function resolveTaskResource(task, index, { seedKey = '', weakestCategory = null } = {}) {
  const type = VALID_TASK_TYPES.has(task?.type) ? task.type : 'reading';
  // Destination: keep a valid AI-provided tab/view, otherwise derive from type.
  let dest = sanitizeDestination(task?.resourceTab, task?.resourceView);
  if (!dest.resourceTab) {
    const def = TYPE_DEFAULT_DEST[type];
    dest = def ? { resourceTab: def[0], resourceView: def[1] } : { resourceTab: null, resourceView: null };
  }
  const hint = [task?.resourceName, task?.title, task?.detail].filter(Boolean).join(' ');
  const exactHint = task?.resourceName || '';
  const seed = seedFrom(seedKey + (task?.title || ''));
  let kind = 'view', id = null, label = dest.resourceTab ? (VIEW_LABELS[`${dest.resourceTab}:${dest.resourceView}`] || null) : null;

  if (type === 'quiz' && dest.resourceTab === 'prep') {
    dest = { resourceTab: 'prep', resourceView: 'quizzes' };
    const hit = bestMatch(exactHint, index.quizzes, q => q.title, 1) || bestMatch(hint, index.quizzes, q => q.title, 2)
      || (() => {
        // Fallback: honor the category the task text names, else target the
        // student's weakest category, else rotate — always lands on a real quiz.
        const mentioned = index.quizzes.filter(q => hint.toLowerCase().includes(q.cat.toLowerCase()));
        const catHit = index.quizzes.filter(q => weakestCategory && q.cat === weakestCategory);
        const pool = mentioned.length ? mentioned : (catHit.length ? catHit : index.quizzes);
        return pool[seed % pool.length];
      })();
    if (hit) { kind = 'quiz'; id = hit.id; label = hit.title; }
  } else if (type === 'lesson' && dest.resourceTab === 'prep') {
    dest = { resourceTab: 'prep', resourceView: 'pathways' };
    // `index.lessons` is already narrowed to what the student can open (buildResourceIndex), so a
    // match against it is safe by construction. The extra guard catches the one remaining path:
    // an exact name that matches a real-but-locked or already-finished lesson, which is scored
    // against the FULL list on purpose — recognizing the name is what lets us reject it knowingly
    // and substitute the nearest open lesson, instead of silently linking to a padlock.
    const named = bestMatch(exactHint, index.allLessons || index.lessons, l => l.title, 1);
    const usableNamed = named && lessonIsSchedulable(index, named.id) ? named : null;
    const hit = usableNamed
      || bestMatch(exactHint, index.lessons, l => l.title, 1)
      || bestMatch(hint, index.lessons, l => `${l.title} ${l.unitTitle}`, 2)
      || index.lessons[seed % Math.max(1, index.lessons.length)];
    if (hit) { kind = 'lesson'; id = hit.id; label = hit.title; }
  } else if (type === 'flashcards' && dest.resourceTab === 'prep') {
    dest = { resourceTab: 'prep', resourceView: 'flashcards' };
    const named = bestMatch(exactHint, index.decks, d => d, 1) || bestMatch(hint, index.decks, d => d, 2);
    // "clear what's due" style tasks route to Smart Mix — the due-cards-across-
    // every-deck session — which always exists regardless of the student's decks.
    const dueish = /due|smart mix|review/i.test(hint);
    const pick = named || (dueish ? 'Smart Mix' : index.decks[seed % Math.max(1, index.decks.length)]);
    if (pick) { kind = 'deck'; id = pick; label = pick === 'Smart Mix' ? 'Smart Mix (due cards)' : pick; }
  } else if (dest.resourceTab === 'prep' && dest.resourceView === 'library') {
    // Any task pointed at the E-Library (reading, reflection, rest-day skims)
    // gets a specific article when one can be named or matched.
    const hit = bestMatch(exactHint, index.articles, a => a.title, 1) || bestMatch(hint, index.articles, a => a.title, 2);
    if (hit) { kind = 'article'; id = hit.title; label = hit.title; }
  }
  return { ...dest, resourceKind: kind, resourceId: id, resourceLabel: label };
}

// Walks an entire plan and (re-)resolves the link fields on every task —
// used both to upgrade plans generated before deep links existed and as a
// belt-and-braces pass after any generation, so no stored plan can ever have
// a task without a working link.
export function resolveAllTaskLinks(plan, user, liveSignals = {}) {
  if (!plan?.days?.length) return plan;
  const index = buildResourceIndex(user?.specialty || 'exploring', liveSignals.pathwayState);
  let changed = false;
  const days = plan.days.map(d => ({
    ...d,
    tasks: (d.tasks || []).map(t => {
      if (t.resourceKind && (t.resourceId || t.resourceKind === 'view')) return t;
      changed = true;
      return { ...t, ...resolveTaskResource(t, index, { seedKey: d.date, weakestCategory: liveSignals.weakestCategory }) };
    }),
  }));
  return changed ? { ...plan, days, linkVersion: 2 } : plan;
}

// ── Keeping an already-written plan true as the student moves ──────────────
// A plan is written at a moment and then read for days. In between, the student finishes the very
// lesson tomorrow's task points at, or clears the unit that was blocking the next one. Neither
// event regenerates anything — regeneration is expensive and happens on its own schedule — so
// without this pass, tomorrow's plan keeps pointing at a lesson that is already ticked off, or at
// one still sitting behind a padlock.
//
// This runs cheaply and locally on every load: for each still-open task from today forward whose
// target lesson has gone stale (finished, or locked), the task is re-pointed at the best lesson
// the student can actually start now. The task's own wording is left alone unless it named the old
// lesson outright, in which case the detail line is rewritten to match where the link now goes —
// a task whose text and destination disagree is its own kind of broken.
//
// Returns the same plan object when nothing needed adjusting, so it is safe to call from a render
// effect without causing a save loop.
export function retargetStaleTasks(plan, user, liveSignals = {}) {
  if (!plan?.days?.length) return plan;
  const pathwayState = liveSignals.pathwayState;
  if (!pathwayState?.byLesson) return plan; // no unlock data this render — leave the plan untouched
  const index = buildResourceIndex(user?.specialty || 'exploring', pathwayState);
  const openLessons = index.lessons;
  if (!openLessons.length) return plan;
  const today = todayStr();
  const retargeted = [];
  let changed = false;

  const days = plan.days.map(d => {
    if (d.date < today) return d;
    let dayChanged = false;
    const tasks = d.tasks.map(t => {
      if (t.done || t.resourceKind !== 'lesson' || !t.resourceId) return t;
      // Three ways a lesson target goes stale, and all three land here: it is finished, it is
      // locked, or it is not in this pathway at all — the last being what happens when a student
      // switches tracks and every lesson task in the stored plan starts pointing at nothing.
      const known = index.lessonStates.has(t.resourceId);
      if (known && lessonIsSchedulable(index, t.resourceId)) return t;
      const stale = index.allLessons.find(l => l.id === t.resourceId);
      // Prefer a lesson from the same unit the plan was aiming at — that preserves the intent of
      // the task ("keep going in Biology Foundations") rather than jumping the student somewhere
      // unrelated just because it happened to be open.
      const sameUnit = stale ? openLessons.find(l => l.unitTitle === stale.unitTitle) : null;
      const pick = sameUnit || openLessons[seedFrom(t.id) % openLessons.length];
      if (!pick || pick.id === t.resourceId) return t;
      dayChanged = true; changed = true;
      retargeted.push({ from: stale?.title || t.resourceId, to: pick.title, reason: !stale ? 'no longer in this pathway' : DONE_LESSON_STATES.has(stale.state) ? 'completed' : 'locked' });
      // Rewrite the detail line when it described the lesson we just moved away from — either
      // because it named it outright, or because the old lesson is gone from this pathway
      // entirely and so whatever the line says cannot still be about where the link now goes.
      const describesOldLesson = !stale || (stale.title && `${t.title} ${t.detail || ''}`.toLowerCase().includes(stale.title.toLowerCase()));
      return {
        ...t,
        resourceId: pick.id,
        resourceLabel: pick.title,
        detail: describesOldLesson ? `${pick.title} — ${pick.unitTitle}` : (t.detail || `${pick.title} — ${pick.unitTitle}`),
        retargetedFrom: stale?.title || t.resourceId,
      };
    });
    return dayChanged ? { ...d, tasks } : d;
  });

  if (!changed) return plan;
  return { ...plan, days, updatedAt: Date.now(), lastRetarget: { at: Date.now(), changes: retargeted.slice(0, 6) } };
}

// ═══════════════════════════════════════════════════════════════════════════
// ROADMAP — the durable spine of the plan
// ═══════════════════════════════════════════════════════════════════════════
const OBSTACLE_STRATEGY = {
  what_to_study: 'Every task in this plan is pre-picked — no more wondering where to start each day.',
  guidance: 'Lean on the AI Coach throughout this plan whenever a task is unclear or you need a second opinion.',
  busy: 'Tasks are sized to fit short windows — most days only need 20-40 focused minutes, not hours.',
  anxiety: 'Practice is spread out and low-stakes by design, so no single day or quiz carries outsized pressure.',
  motivation: 'Short, frequent wins are built in on purpose instead of marathon sessions — consistency compounds.',
  no_plan: 'This roadmap replaces the guesswork entirely — just follow the day-by-day tasks in order.',
};

export function heuristicRoadmap(user, horizonWeeks, catalog) {
  const goalLabel = labelOf(GOAL_OPTIONS, user?.goal) || 'building a strong path into medicine';
  const obstacles = labelsOf(OBSTACLE_OPTIONS, user?.obstacles);
  const phaseCount = clampPhaseCount(horizonWeeks);
  const templates = [
    { title: 'Foundations', theme: `Get oriented in ${catalog.pathwayLabel} and build a daily study habit`, objectives: [`Take the Pathway Diagnostic if you haven't yet`, `Establish a daily quiz-and-flashcard habit`, `Complete Unit 1 of your pathway`], resources: [catalog.unitTitles[0] || catalog.pathwayLabel, 'Quiz Library', 'Flashcards'] },
    { title: 'Momentum', theme: 'Deepen your science foundation while rounding out your Portfolio basics', objectives: ['Grow weekly practice-question volume', 'Start your College List and log any activities', 'Complete Unit 2 of your pathway'], resources: [catalog.unitTitles[1] || catalog.pathwayLabel, 'College List', 'Activities & Resume Builder'] },
    { title: 'Application Readiness', theme: 'Turn consistent prep into real application progress', objectives: ['Hit your target practice pace every week', 'Draft at least one essay', 'Complete Unit 3 of your pathway'], resources: [catalog.unitTitles[2] || catalog.pathwayLabel, 'Essay Workspace', 'Deadlines Tracker'] },
    { title: 'Polish & Push', theme: 'Tighten weak spots and keep every deadline covered', objectives: ['Target your weakest quiz category directly', 'Review and revise essay drafts', 'Confirm recommenders and deadlines are on track'], resources: ['Quiz Library', 'Essay Workspace', 'Recommenders Tracker'] },
    { title: 'Final Stretch', theme: 'Steady, sustainable effort through to the finish', objectives: ['Keep the daily habit unbroken', 'Close out any open Portfolio items', 'Reflect on how far you have come'], resources: ['Flashcards', 'Financial Aid Tracker', 'AI Coach'] },
  ];
  const use = templates.slice(0, phaseCount);
  const weeksPer = Math.ceil(horizonWeeks / use.length);
  const phases = use.map((t, i) => {
    const weekStart = i * weeksPer + 1;
    const weekEnd = i === use.length - 1 ? horizonWeeks : Math.min(horizonWeeks, weekStart + weeksPer - 1);
    return { id: `phase-${i}`, index: i, title: t.title, weekStart, weekEnd, theme: t.theme, objectives: t.objectives, resources: t.resources, successMetric: `By week ${weekEnd}, ${t.objectives[0].toLowerCase()}.` };
  });
  const weeklyThemes = Array.from({ length: horizonWeeks }, (_, i) => {
    const week = i + 1;
    const phase = phases.find(p => week >= p.weekStart && week <= p.weekEnd) || phases[phases.length - 1];
    return { week, phaseId: phase.id, theme: phase.theme, focus: ['prep', 'portfolio'], keyResource: phase.resources[0] };
  });
  const milestoneCount = Math.min(8, Math.max(5, phases.length + 2));
  const milestones = Array.from({ length: milestoneCount }, (_, i) => {
    const week = Math.max(1, Math.round(((i + 1) / milestoneCount) * horizonWeeks));
    return { title: i === 0 ? 'Find your pathway & start the habit' : i === milestoneCount - 1 ? 'Reach your target' : `Checkpoint ${i}`, weekTarget: week, detail: `A steady-pace checkpoint for week ${week} of your plan.` };
  });
  const riskMitigation = (obstacles.length ? obstacles : ['Staying consistent']).slice(0, 4).map((label) => {
    const key = (OBSTACLE_OPTIONS.find(o => o.label === label) || {}).value;
    return { obstacle: label, strategy: OBSTACLE_STRATEGY[key] || 'Small, repeatable daily actions beat occasional long sessions — the plan is built around that.' };
  });
  return {
    headline: `Your ${horizonWeeks}-week pre-health roadmap`,
    overview: `This is a ${horizonWeeks}-week plan built around ${goalLabel.toLowerCase()}, paced for where you are right now as a student on the ${catalog.pathwayLabel} track. It balances the early science foundations with the Portfolio-building that makes a future health-career application strong. Each phase below has its own focus, and every week has a concrete theme so you always know what "on track" looks like.`,
    pillarStrategy: {
      prep: `Your ${catalog.pathwayLabel} pathway units, quizzes, and flashcards keep your academic foundation growing every week.`,
      portfolio: `College list, activities, essays, and deadlines get built up gradually alongside prep, not crammed in at the end.`,
      progress: `Weekly themes and milestones give you a clear way to check "am I on track" without guessing.`,
    },
    phases, weeklyThemes, milestones, riskMitigation, horizonWeeks,
    ninetyDayGoal: 'In 90 days: a steady daily study habit, a real dent in your science foundation, and real Portfolio progress (college list started, at least one activity logged, one essay draft underway).',
    encouragement: `You're building this early, which is a real advantage — small, steady days compound more than you'll notice week to week. We've got you.`,
    source: 'fallback',
  };
}

function buildRoadmapSystemPrompt(horizonWeeks, catalogText) {
  return `You are Medabrain's Oracle — the deepest planning intelligence inside MedSchoolPrep, a prep platform for high-school students (grades 9-12, ~14-18 years old) exploring a future in medicine or a health career. You are building this student's full, long-horizon Study & Application Roadmap: the master plan that both the Plans tab and the rest of Medabrain (the Scout/Guide/Sage chat coach) will read from and reference for weeks or months.

This is the single most important, highest-effort generation in the app — take real care and go deep. It should read like it was built by a human academic advisor who has read the student's entire file, not a generic study calendar. Be concrete and specific.

${AGE_APPROPRIATE_RULES}
- The plan spans exactly ${horizonWeeks} weeks, split into 3-6 phases with a clear theme and objectives each — like a real syllabus, not a vague vibe.

══ USE THE WHOLE FILE, OR THIS IS JUST A TEMPLATE ══
The profile below is not background reading. It contains their measured performance, their entire Portfolio row by row, a ranked list of the gaps in it, their admissions timeline, and — if they already have a plan — how much of it they have actually been completing. A roadmap that would read the same for any student on this pathway has failed, no matter how well written it is. Specifically:
- ANCHOR ON THE RANKED GAPS. The gap list is ordered by urgency and each entry names the panel that closes it. Your phases must visibly close the top gaps in roughly that order; a milestone that ignores gap #1 is the wrong milestone.
- NAME THEIR REAL THINGS. Their colleges, their essays, their clinical sites, their deadlines, their weakest quiz category — by name, in the overview, the objectives, and the success metrics. Never invent one that is not in the profile.
- RESPECT THE ADHERENCE DATA. If they are completing 40% of what is scheduled, a heavier plan is a worse plan. Pace to what they demonstrably do, then build up.
- SEQUENCE AGAINST REAL DATES. Their timeline and their tracked deadlines dictate what must happen early; do not put essay work after the deadline it serves.
- THE OBSTACLES ARE DESIGN CONSTRAINTS, not a sympathy note. If they said they are busy, the plan's shape must show it.

Here is the real MedSchoolPrep resource catalog to ground the plan in:
${catalogText}

Respond with ONLY a valid JSON object (no markdown, no code fences, no prose before or after) matching exactly this schema:
{
  "headline": "short motivating title for the whole roadmap, max 10 words",
  "overview": "3-5 sentence deep narrative overview of the whole roadmap, referencing their actual goal/situation/pace by name",
  "pillarStrategy": { "prep": "1-2 sentences on how academic/test prep fits their plan", "portfolio": "1-2 sentences on how building their application fits", "progress": "1-2 sentences on how they'll know it's working" },
  "phases": [ { "title": "short phase name", "theme": "one line", "objectives": ["3 to 5 concrete objectives"], "resources": ["2 to 4 SPECIFIC MedSchoolPrep resource names, drawn only from the catalog above"], "successMetric": "one concrete, measurable sentence" } ],
  "weeklyThemes": [ { "week": number, "theme": "short one-line theme for that week", "focus": ["prep","portfolio", or "progress" — one or two of these], "keyResource": "one specific resource name from the catalog" } ],
  "milestones": [ { "title": "short", "weekTarget": number, "detail": "one sentence" } ],
  "riskMitigation": [ { "obstacle": "their actual stated obstacle, or a likely one for their situation", "strategy": "one concrete sentence" } ],
  "ninetyDayGoal": "one concrete sentence describing where they could realistically be in 90 days",
  "encouragement": "two or three warm, personal closing sentences that name a stated obstacle or goal"
}
Provide 3-6 "phases" entries (do not include weekStart/weekEnd — they are computed separately) covering the full ${horizonWeeks}-week horizon in order. Provide EXACTLY one "weeklyThemes" entry per week, for week 1 through week ${horizonWeeks}, in order. Provide 5-8 "milestones" spread across the horizon in week order. Provide 2-4 "riskMitigation" entries.`;
}

export function repairRoadmap(parsed, fallback, horizonWeeks) {
  const p = parsed && typeof parsed === 'object' ? parsed : {};
  const phaseCount = clampPhaseCount(horizonWeeks);
  const rawPhases = Array.isArray(p.phases) && p.phases.length ? p.phases.slice(0, 6) : fallback.phases;
  const usePhases = rawPhases.length ? rawPhases : fallback.phases;
  const weeksPer = Math.ceil(horizonWeeks / usePhases.length);
  const phases = usePhases.map((ph, i) => {
    const fb = fallback.phases[i] || fallback.phases[fallback.phases.length - 1];
    const weekStart = i * weeksPer + 1;
    const weekEnd = i === usePhases.length - 1 ? horizonWeeks : Math.min(horizonWeeks, weekStart + weeksPer - 1);
    return {
      id: `phase-${i}`, index: i,
      title: str(ph.title) || fb.title,
      weekStart, weekEnd,
      theme: str(ph.theme) || fb.theme,
      objectives: (Array.isArray(ph.objectives) ? ph.objectives.filter(str).map(String) : []).slice(0, 5).concat(fb.objectives).slice(0, Math.max(3, Math.min(5, (ph.objectives || []).length || 3))),
      resources: (Array.isArray(ph.resources) ? ph.resources.filter(str).map(String) : []).slice(0, 4).concat(fb.resources).slice(0, Math.max(2, Math.min(4, (ph.resources || []).length || 2))),
      successMetric: str(ph.successMetric) || fb.successMetric,
    };
  });
  // weeklyThemes: guarantee full 1..horizonWeeks coverage regardless of what the model returned.
  const byWeek = new Map();
  if (Array.isArray(p.weeklyThemes)) for (const w of p.weeklyThemes) { const wk = num(w?.week); if (wk) byWeek.set(wk, w); }
  const weeklyThemes = Array.from({ length: horizonWeeks }, (_, i) => {
    const week = i + 1;
    const phase = phases.find(ph => week >= ph.weekStart && week <= ph.weekEnd) || phases[phases.length - 1];
    const w = byWeek.get(week);
    const focus = Array.isArray(w?.focus) ? w.focus.filter(f => ['prep', 'portfolio', 'progress'].includes(f)) : [];
    return {
      week, phaseId: phase.id,
      theme: str(w?.theme) || phase.theme,
      focus: focus.length ? focus : ['prep', 'portfolio'],
      keyResource: str(w?.keyResource) || phase.resources[0] || catalogFirstResource(fallback),
    };
  });
  const milestones = (Array.isArray(p.milestones) ? p.milestones : []).map(m => ({
    title: str(m?.title), weekTarget: num(m?.weekTarget), detail: str(m?.detail),
  })).filter(m => m.title && m.weekTarget).slice(0, 8);
  while (milestones.length < 5) milestones.push(fallback.milestones[milestones.length % fallback.milestones.length]);
  const riskMitigation = (Array.isArray(p.riskMitigation) ? p.riskMitigation : []).map(r => ({
    obstacle: str(r?.obstacle), strategy: str(r?.strategy),
  })).filter(r => r.obstacle && r.strategy).slice(0, 4);
  return {
    headline: str(p.headline) || fallback.headline,
    overview: str(p.overview) || fallback.overview,
    pillarStrategy: {
      prep: str(p.pillarStrategy?.prep) || fallback.pillarStrategy.prep,
      portfolio: str(p.pillarStrategy?.portfolio) || fallback.pillarStrategy.portfolio,
      progress: str(p.pillarStrategy?.progress) || fallback.pillarStrategy.progress,
    },
    phases, weeklyThemes, milestones, horizonWeeks,
    riskMitigation: riskMitigation.length ? riskMitigation : fallback.riskMitigation,
    ninetyDayGoal: str(p.ninetyDayGoal) || fallback.ninetyDayGoal,
    encouragement: str(p.encouragement) || fallback.encouragement,
    source: 'ai',
  };
}
function catalogFirstResource(fallback) { return fallback.phases[0]?.resources?.[0] || 'Pathway'; }

function looksUsableRoadmap(p) {
  if (!p || typeof p !== 'object') return false;
  return !!str(p.overview) || (Array.isArray(p.phases) && p.phases.length > 0) || (Array.isArray(p.weeklyThemes) && p.weeklyThemes.length > 0);
}

export async function generateRoadmap(user, liveSignals, catalog, portfolio, plan = null, trace = null) {
  const horizonWeeks = computeHorizonWeeks(user);
  const fallback = heuristicRoadmap(user, horizonWeeks, catalog);
  try {
    const system = buildRoadmapSystemPrompt(horizonWeeks, catalog.text);
    const userMsg = `Here is the student's full profile:\n${buildProfileFactsText(user, liveSignals, portfolio, plan)}\n\nBuild their ${horizonWeeks}-week roadmap now as JSON only.`;
    const parsed = await callOracle({ system, user: userMsg, maxTokens: 10000, reasoningEffort: 'high' }, trace, 'roadmap');
    if (!looksUsableRoadmap(parsed)) {
      if (parsed) { noteError(trace, 'roadmap', 'response parsed but was missing every usable field'); if (trace) trace.fallbacks += 1; }
      return { ...fallback, horizonWeeks };
    }
    return { ...repairRoadmap(parsed, fallback, horizonWeeks), horizonWeeks };
  } catch (err) {
    noteError(trace, 'roadmap', `unexpected error (${err?.message || 'unknown'})`);
    if (trace) trace.fallbacks += 1;
    return { ...fallback, horizonWeeks };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DAY-BY-DAY CHUNKS — the rolling near-term window
// ═══════════════════════════════════════════════════════════════════════════
function weekNumberForDate(plan, date) { return plan?.startDate ? Math.floor(daysBetween(plan.startDate, date) / 7) + 1 : 1; }
function weeklyThemeForWeek(plan, week) { return plan?.weeklyThemes?.find(w => w.week === week) || null; }
function phaseForWeek(plan, week) { return plan?.phases?.find(p => week >= p.weekStart && week <= p.weekEnd) || plan?.phases?.[plan.phases.length - 1] || null; }

// The deterministic floor under every day-generation call. It exists so the tab can always render
// something, and it is deliberately plain — but "plain" is the point of a fallback, not an
// acceptable everyday output. When these tasks are what the student sees, generation failed; the
// plan is stamped `generation.degraded` so the UI says so and offers a retry, rather than passing
// this off as Medabrain's considered plan for their day.
export function heuristicDays(plan, fromDate, numDays, catalog, user, liveSignals = {}) {
  // Never point the fallback at a locked or already-finished lesson either — the same rule the
  // generated path follows. With no unlock data, openLessons is the whole pathway, as before.
  const openLessons = catalog?.openLessons?.length ? catalog.openLessons : null;
  const days = [];
  for (let i = 0; i < numDays; i++) {
    const date = addDaysStr(fromDate, i);
    const wd = weekdayIdx(date);
    const isWeekend = wd === 0 || wd === 6;
    const weekNumber = weekNumberForDate(plan, date);
    const theme = weeklyThemeForWeek(plan, weekNumber)?.theme || 'Steady progress this week';
    const phase = phaseForWeek(plan, weekNumber);
    const lesson = openLessons ? openLessons[i % openLessons.length] : null;
    const tasks = [];
    if (!isWeekend) {
      tasks.push({ pillar: 'prep', type: 'quiz', title: 'Practice quiz', detail: 'A quiz from the library, aimed at your weakest category', estMinutes: 20, timeOfDay: 'afternoon', ...sanitizeDestination('prep', 'quizzes') });
      tasks.push({ pillar: 'prep', type: 'lesson', title: lesson ? `Lesson: ${lesson.title}` : 'Continue your pathway', detail: lesson ? `${lesson.title} — ${lesson.unitTitle}` : `${catalog.pathwayLabel} — ${catalog.unitTitles[i % catalog.unitTitles.length]}`, resourceName: lesson?.title || null, estMinutes: 15, timeOfDay: 'afternoon', ...sanitizeDestination('prep', 'pathways') });
      tasks.push({ pillar: 'prep', type: 'flashcards', title: 'Flashcard review', detail: 'Clear any cards due today', estMinutes: 10, timeOfDay: 'evening', ...sanitizeDestination('prep', 'flashcards') });
      if (i % 3 === 2) tasks.push({ pillar: 'portfolio', type: 'activity', title: 'Portfolio check-in', detail: 'Log any new activity, clinical, or research hours', estMinutes: 10, timeOfDay: 'evening', ...sanitizeDestination('portfolio', 'resume') });
    } else {
      tasks.push({ pillar: 'rest', type: 'reflection', title: 'Light review + reflect', detail: `Skim one E-Library article related to ${catalog.pathwayLabel}`, estMinutes: 15, timeOfDay: 'anytime', ...sanitizeDestination('prep', 'library') });
    }
    days.push({
      date, dayIndex: i + 1, weekday: WEEKDAY_NAMES[wd], weekNumber, phaseId: phase?.id || null, theme,
      headline: isWeekend ? 'A lighter day' : theme,
      coachNote: null,
      tasks: tasks.map((t, ti) => ({ id: `${date}-t${ti}`, done: false, doneAt: null, ...t })),
      reflectionPrompt: isWeekend ? 'What felt easiest this week? What needs more attention next week?' : null,
    });
  }
  return days;
}

// ── The day prompt ─────────────────────────────────────────────────────────
// This window is deliberately short — two days, normally — and the prompt is written to spend
// everything that buys on depth. Planning fourteen days at once meant roughly a paragraph of
// thought per day and a plan whose back half was invented for a future that had not happened yet.
// Two days is the horizon a student actually acts on, and at two days there is room to say WHY
// each task is there, WHEN in the day it belongs, and what finishing it well looks like.
const BANNED_TASK_TITLES = ['Practice quiz', 'Continue your pathway', 'Flashcard review', 'Portfolio check-in', 'Study session'];

function buildDayChunkSystemPrompt(numDays, catalogText, prefsNote = '') {
  const windowWord = numDays <= 2 ? `${numDays === 1 ? 'single day' : 'two days'}` : `${numDays}-day window`;
  return `You are Medabrain's Oracle, writing a student's actual plan for the next ${windowWord} inside MedSchoolPrep. Their long-horizon roadmap already exists — your job right now is the part they will actually DO: specific, concrete, ordered tasks for ${numDays === 1 ? 'this day' : 'these days'}, consistent with the roadmap phase and week theme given below.

This is a short window on purpose. You are not sketching a fortnight — you are writing ${numDays === 1 ? "one day" : 'two days'} properly, with the care of an advisor who knows this student and has half an hour to think about their week. Depth per day is the whole point. Think hard before you answer.

${AGE_APPROPRIATE_RULES}
- Each day gets 3-5 tasks, mixing Prep (pathway lessons/quizzes/flashcards/library/coach) and Portfolio (colleges/essays/deadlines/activities/clinical hours/research/recommenders/interview prep).
- Weekend days are lighter — a shorter catch-up, reflection, or reading day, not a full load.
- Order the tasks within each day the way you would actually do them, and say when each belongs (morning/afternoon/evening/anytime).${prefsNote}

══ THE BAR THIS HAS TO CLEAR ══
A plan that could have been written without reading this student's file has failed, however tidy it looks. Concretely:
- NEVER emit a generic task. These exact titles are forbidden, and so is anything as empty as them: ${BANNED_TASK_TITLES.map(t => `"${t}"`).join(', ')}. Name the thing. "Quiz: Cell Structure & Transport — your weakest category at 41%" is a task; "Practice quiz" is a placeholder.
- EVERY PORTFOLIO TASK NAMES A REAL ROW. The profile lists their actual colleges, essays (with word counts and how long since each was touched), clinical sites, activities, recommenders and deadlines. "Work on your essays" is a failure; "Get the Michigan supplement from 140 to 300 words — it hasn't been touched in 3 weeks" is the standard.
- ONLY SCHEDULE PATHWAY LESSONS THE STUDENT CAN ACTUALLY OPEN. The catalog marks every lesson as open, already done, or LOCKED. A locked lesson is behind unfinished work and tapping it hits a padlock — never schedule one, and never schedule a lesson already marked done.
- CLOSE THE RANKED GAPS. The profile ends with a priority-ordered gap list, each naming the exact panel that fixes it. Put a concrete step against the top gap in this window.
- OVERDUE BEATS UPCOMING. Anything already past due is handled on the first day, explicitly.
- MATCH THE MEASURED WEAKNESS. Quiz tasks target their weakest measured category by name, and a category they have already failed once comes before a brand-new one.
- FIT THE REAL DAY. Total estMinutes across a day must be close to their stated pace. The adherence data (if present) says which weekdays and which task types actually get done — put the demanding work where they historically follow through, not where it looks tidy.
- THE TWO DAYS ARE DIFFERENT DAYS. Same shape twice is the most common failure here. Vary the resource, the angle, and the pillar mix.
- EVERY TASK EARNS ITS "why". One sentence, addressed to the student, naming the real reason THIS task is on THEIR plan today — their score gap, their deadline, their untouched draft. "It's good practice" is not a reason.

Here is the real MedSchoolPrep resource catalog to ground tasks in:
${catalogText}

Respond with ONLY valid JSON (no markdown, no code fences, no prose) matching exactly this schema:
{ "days": [ { "dayIndex": number, "headline": "a real title for this specific day, max 8 words", "theme": "short line tying the day to its week theme", "coachNote": "2-3 sentences to the student about the shape of this day — what matters most, what to protect, what to let go if time runs short", "tasks": [ { "pillar": "prep|portfolio|progress|rest", "type": "lesson|quiz|flashcards|reading|coach|activity|college|essay|deadline|clinical|research|recommender|interview|reflection|rest", "title": "short specific action, max 12 words", "detail": "one specific sentence naming the actual resource and the actual target", "why": "one sentence to the student on why this task is on their plan today, citing something real from their profile", "successCriteria": "one short sentence describing what finishing this well looks like", "timeOfDay": "morning|afternoon|evening|anytime", "estMinutes": number, "resourceTab": "prep|portfolio|progress or null", "resourceView": "the specific sub-view id (e.g. quizzes, pathways, colleges, essays, practice, review) or null", "resourceName": "the EXACT title of the one specific quiz, lesson, flashcard deck, or E-Library resource this task uses, copied verbatim from the catalog above — or null for tasks that don't target a single named resource" } ], "reflectionPrompt": "string or null — a short end-of-day question, on the last day of the window or a natural reflection day" } ] }
Provide EXACTLY one "days" entry per dayIndex, 1 through ${numDays}, in order, with the tasks already in the order they should be done. For every quiz/lesson/flashcards/reading task, ALWAYS fill "resourceName" with a real name from the catalog — this becomes a clickable link that opens that exact resource for the student.`;
}

const VALID_TIMES_OF_DAY = new Set(['morning', 'afternoon', 'evening', 'anytime']);

export function repairDays(parsed, fallbackDays, plan, catalog) {
  const byIndex = new Map();
  if (Array.isArray(parsed?.days)) for (const d of parsed.days) { const idx = num(d?.dayIndex); if (idx) byIndex.set(idx, d); }
  return fallbackDays.map((fb, i) => {
    const d = byIndex.get(i + 1);
    if (!d) return fb;
    const rawTasks = Array.isArray(d.tasks) ? d.tasks : [];
    const tasks = rawTasks.map((t, ti) => {
      const pillar = VALID_PILLARS.has(t?.pillar) ? t.pillar : (fb.tasks[ti]?.pillar || 'prep');
      const type = VALID_TASK_TYPES.has(t?.type) ? t.type : (fb.tasks[ti]?.type || 'reading');
      const dest = sanitizeDestination(t?.resourceTab, t?.resourceView);
      return {
        id: `${fb.date}-t${ti}`, done: false, doneAt: null,
        pillar, type,
        title: str(t?.title) || fb.tasks[ti]?.title || 'Study session',
        detail: str(t?.detail) || fb.tasks[ti]?.detail || '',
        // The three fields that turn a checklist into a plan: why this, when in the day, and what
        // "done properly" means. All optional — an older stored plan simply has none of them, and
        // the UI renders without them rather than showing an empty label.
        why: str(t?.why) || null,
        successCriteria: str(t?.successCriteria) || null,
        timeOfDay: VALID_TIMES_OF_DAY.has(t?.timeOfDay) ? t.timeOfDay : (fb.tasks[ti]?.timeOfDay || null),
        estMinutes: num(t?.estMinutes) || fb.tasks[ti]?.estMinutes || 20,
        resourceName: str(t?.resourceName) || null,
        ...dest,
      };
    });
    return {
      ...fb,
      theme: str(d.theme) || fb.theme,
      headline: str(d.headline) || fb.headline || null,
      coachNote: str(d.coachNote) || null,
      tasks: tasks.length ? tasks : fb.tasks,
      reflectionPrompt: str(d.reflectionPrompt) || fb.reflectionPrompt,
    };
  });
}

// Did the model actually write something for this student, or did it hand back the same shape the
// fallback would have produced? Used to decide whether a generation counts as real — a "success"
// that returns three placeholder titles is a failure that parsed.
function daysLookGeneric(days) {
  if (!days?.length) return true;
  const titles = days.flatMap(d => d.tasks.map(t => String(t.title || '').trim().toLowerCase()));
  if (!titles.length) return true;
  const banned = new Set(BANNED_TASK_TITLES.map(t => t.toLowerCase()));
  const bannedCount = titles.filter(t => banned.has(t)).length;
  return bannedCount / titles.length >= 0.5;
}

// ── Onboarding "addBack"/"rollover" prefs — real deterministic behavior ────
// Onboarding.jsx's toggleAddBack/toggleRollover steps promise two things
// ("if you study more than planned, we'll count it toward tomorrow too" /
// "missed a session? we'll fold it into tomorrow's plan") — both are applied
// here as plain post-processing on a freshly-generated day chunk, not left as
// a prompt hint the model might silently ignore. Both are pure functions over
// plain plan-day data, so they're testable independent of the LLM entirely.

// Rollover: carries not-yet-`done` tasks from the last couple of already-
// generated days into the first day of the new chunk (deduped by title, fresh
// ids, `rolledOverFrom` pointing at the original task) — capped at 2 so a
// student who's fallen behind doesn't get an ever-growing pile-up.
export function applyRolloverPrefs(days, priorDays, prefs) {
  if (!prefs?.rollover || !priorDays?.length || !days?.length) return days;
  const missed = priorDays.flatMap(d => d.tasks.filter(t => !t.done)).slice(-2);
  if (!missed.length) return days;
  const [first, ...rest] = days;
  const existingTitles = new Set(first.tasks.map(t => t.title));
  const rolled = missed
    .filter(t => !existingTitles.has(t.title))
    .map((t, i) => ({ ...t, id: `${first.date}-rollover${i}`, done: false, doneAt: null, xpAwarded: false, rolledOverFrom: t.id }));
  if (!rolled.length) return days;
  return [{ ...first, tasks: [...rolled, ...first.tasks] }, ...rest];
}

// Daily rollover — the day-boundary counterpart to applyRolloverPrefs above.
// applyRolloverPrefs only ever fires when a NEW chunk is generated (every ~7
// days), so a task missed on Monday wouldn't reach Tuesday's list until the
// next chunk boundary, days later. This runs once per calendar day instead:
// it merges any not-done tasks from the single most recent past day straight
// into TODAY's already-generated day entry (today's tasks were written days
// ago as part of a chunk — this doesn't regenerate them, only adds to them).
// Idempotent via plan.lastRolloverDate so re-running on every render/effect
// firing is safe and never duplicates a rolled-over task.
export function applyDailyRollover(plan, user) {
  if (!plan?.days?.length) return plan;
  const today = todayStr();
  if (plan.lastRolloverDate === today) return plan;
  if (!user?.rollover) return { ...plan, lastRolloverDate: today };
  const todayIdx = plan.days.findIndex(d => d.date === today);
  if (todayIdx === -1) return { ...plan, lastRolloverDate: today };
  const prior = [...plan.days].filter(d => d.date < today).sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-1)[0];
  if (!prior) return { ...plan, lastRolloverDate: today };
  const missed = prior.tasks.filter(t => !t.done);
  if (!missed.length) return { ...plan, lastRolloverDate: today };
  const todayDay = plan.days[todayIdx];
  const existingTitles = new Set(todayDay.tasks.map(t => t.title));
  const rolled = missed
    .filter(t => !existingTitles.has(t.title))
    .slice(0, 2)
    .map((t, i) => ({ ...t, id: `${today}-dailyrollover${i}`, done: false, doneAt: null, xpAwarded: false, autoVerified: false, rolledOverFrom: t.id }));
  if (!rolled.length) return { ...plan, lastRolloverDate: today };
  const days = plan.days.map((d, i) => (i === todayIdx ? { ...d, tasks: [...rolled, ...d.tasks] } : d));
  return { ...plan, days, lastRolloverDate: today };
}

// Add-back: when the most recent already-generated day was fully completed
// (every task done — the "studied more than planned" signal available from
// this data model), trims one task off the new chunk's first day as a lighter
// reward day. Never trims below a 3-task floor, so a light day doesn't become
// an empty one.
export function applyAddBackPrefs(days, priorDays, prefs) {
  if (!prefs?.addBack || !priorDays?.length || !days?.length) return days;
  const lastDay = priorDays[priorDays.length - 1];
  const overCompleted = lastDay?.tasks?.length > 0 && lastDay.tasks.every(t => t.done);
  if (!overCompleted) return days;
  const [first, ...rest] = days;
  if (first.tasks.length <= 3) return days;
  return [{ ...first, tasks: first.tasks.slice(0, -1) }, ...rest];
}

// Generates the next `numDays` of daily tasks starting the day after
// plan.daysGeneratedThrough (or `fromDate` for the very first chunk).
export async function generateDayChunk(plan, user, liveSignals, catalog, fromDate, numDays = WINDOW_DAYS, portfolio, trace = null) {
  const fallback = heuristicDays(plan, fromDate, numDays, catalog, user, liveSignals);
  // Final belt-and-braces pass: EVERY task — AI-written or fallback — leaves
  // here resolved to a concrete launchable resource (see resolveTaskResource),
  // so the "open this exact quiz/lesson/deck/article" link always works.
  const index = buildResourceIndex(user?.specialty || 'exploring', liveSignals?.pathwayState);
  const linkAll = (days) => days.map(d => ({
    ...d,
    tasks: d.tasks.map(t => ({ ...t, ...resolveTaskResource(t, index, { seedKey: d.date, weakestCategory: liveSignals?.weakestCategory }) })),
  }));
  // Applied identically regardless of whether the AI call below succeeds or
  // falls back — the rollover/addBack promise shouldn't depend on that.
  const priorDays = (plan?.days || []).filter(d => d.date < fromDate).slice(-2);
  const prefs = { rollover: user?.rollover, addBack: user?.addBack };
  const applyPrefs = (days) => applyAddBackPrefs(applyRolloverPrefs(days, priorDays, prefs), priorDays, prefs);
  const prefsNote = [
    prefs.rollover ? ' This student opted into "rollover" — if a note below mentions catching up, keep today\'s load reasonable since rolled-over tasks are added separately.' : '',
    prefs.addBack ? ' This student opted into "add back" — if they\'ve been finishing early, today can be slightly lighter.' : '',
  ].join('');
  try {
    const dayTable = fallback.map(d => `Day ${d.dayIndex}: ${d.date} (${d.weekday}) — Week ${d.weekNumber}, phase "${phaseForWeek(plan, d.weekNumber)?.title || ''}", week theme: "${weeklyThemeForWeek(plan, d.weekNumber)?.theme || d.theme}"`).join('\n');
    const system = buildDayChunkSystemPrompt(numDays, catalog.text, prefsNote);
    // The day table leads. Everything else in this message is context the model reasons WITH;
    // the table is the thing it must cover exactly once each, so it goes where no cap can reach it.
    const userMsg = `Days to fill in — generate EXACTLY one entry per dayIndex below, in order:\n${dayTable}\n\nRoadmap headline: "${plan.headline}"\nOverview: ${plan.overview}\n\nStudent profile:\n${buildProfileFactsText(user, liveSignals, portfolio, plan)}\n\nGenerate the tasks for ${numDays === 1 ? 'this day' : `these ${numDays} days`} now as JSON only.`;
    // Budget generously per day and always leave room for the reasoning pass, which is billed
    // against the same ceiling on this model family. A two-day window at 6,000 tokens has room to
    // think properly and still write every field; the old formula gave a long window a budget the
    // thinking alone could exhaust, and the truncated JSON became a silent fallback.
    const maxTokens = Math.min(16000, 3500 + numDays * 1300);
    // Always 'high'. Every call this function makes is now a short, deep window rather than a
    // long, shallow one, and reasoning effort is exactly what buys the difference between a plan
    // that names the student's weakest skill and one that says "practice set".
    const parsed = await callOracle({ system, user: userMsg, maxTokens, reasoningEffort: 'high' }, trace, `days ${fromDate}`);
    if (!parsed) return applyPrefs(linkAll(fallback));
    const repaired = repairDays(parsed, fallback, plan, catalog);
    // A parseable response that still reads like the fallback is not a success. Count it as one
    // so the plan is honestly marked degraded rather than presenting placeholders as a plan.
    if (daysLookGeneric(repaired)) {
      noteError(trace, `days ${fromDate}`, 'model returned placeholder-level tasks');
      if (trace) { trace.aiCalls = Math.max(0, trace.aiCalls - 1); trace.fallbacks += 1; }
    }
    return applyPrefs(linkAll(repaired));
  } catch (err) {
    noteError(trace, `days ${fromDate}`, `unexpected error (${err?.message || 'unknown'})`);
    if (trace) trace.fallbacks += 1;
    return applyPrefs(linkAll(fallback));
  }
}

// Everything the UI needs to tell the student the truth about how this plan was made.
function summarizeTrace(trace) {
  if (!trace) return null;
  return {
    generatedAt: Date.now(),
    tookMs: Date.now() - trace.startedAt,
    aiCalls: trace.aiCalls,
    fallbacks: trace.fallbacks,
    attempts: trace.attempts,
    degraded: trace.fallbacks > 0,
    errors: trace.errors.slice(0, 6),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Orchestration — public entry points used by the Plans tab
// ═══════════════════════════════════════════════════════════════════════════
// ── Why the window is two days ─────────────────────────────────────────────
// This used to generate fourteen days up front and roll a week forward at a time. That is a lot of
// plan, and almost none of it survived contact with the week: by Thursday the student had done
// things the Tuesday generation could not have known about, so days 5-14 were a confident schedule
// for a situation that no longer existed — and the cost of writing them was paid out of the
// thinking available for the days that mattered.
//
// Two days is the horizon a student actually acts on: today, and enough of tomorrow to prepare for
// it. Generating only that means every generation is cheap enough to run OFTEN — the window is
// rebuilt whenever it no longer covers today and tomorrow, which in practice is once a day — and
// each one gets the full depth of a high-reasoning call spent on days that are real. "Constantly
// updating" and "actually thought through" are the same change.
export const WINDOW_DAYS = 2; // today + tomorrow

// ── Profile staleness — "keeps updating based on the student's updated
// profile" ────────────────────────────────────────────────────────────────
// The plan is expensive to regenerate (3 sequential Oracle calls), so it
// isn't rebuilt on every keystroke in Settings. Instead, every roadmap-level
// generation (createMasterPlan/regenerateRoadmap/adaptPlanToNotes) stamps a
// snapshot of the profile fields it was actually built from onto the plan.
// planIsStale() compares that snapshot to the student's CURRENT profile so
// the UI can prompt a refresh the moment something the plan depends on
// (goal, pathway, obstacles, ...) has genuinely changed —
// instead of the plan silently going stale until the student happens to hit
// "Rebuild Roadmap" themselves.
const PROFILE_SNAPSHOT_FIELDS = [
  'goal', 'obstacles', 'accomplish', 'studyMethod', 'studyHours',
  'gpaBand', 'sciences', 'healthExperience', 'whyMedicine', 'dreamRole', 'certainty',
  'specialty', 'gradeStage',
];
export function buildProfileSnapshot(user) {
  const snap = {};
  for (const f of PROFILE_SNAPSHOT_FIELDS) snap[f] = user?.[f] ?? null;
  return snap;
}
function snapshotsEqual(a, b) {
  if (!a || !b) return false;
  return PROFILE_SNAPSHOT_FIELDS.every(f => JSON.stringify(a[f] ?? null) === JSON.stringify(b[f] ?? null));
}
// Plans generated before this feature shipped have no profileSnapshot at
// all — treated as "not stale" rather than retroactively flagged, since
// there's nothing to compare against.
export function planIsStale(plan, user) {
  if (!plan?.profileSnapshot || !user) return false;
  return !snapshotsEqual(plan.profileSnapshot, buildProfileSnapshot(user));
}

function catalogFor(user, liveSignals) {
  return buildResourceCatalog(user?.specialty || 'exploring', user?.gradeStage || null, liveSignals?.pathwayState);
}

export async function createMasterPlan(user, liveSignals, portfolio) {
  const trace = createGenerationTrace();
  const catalog = catalogFor(user, liveSignals);
  const roadmap = await generateRoadmap(user, liveSignals, catalog, portfolio, null, trace);
  const startDate = todayStr();
  const planShell = { ...roadmap, startDate, days: [] };
  // One call, two days, full reasoning effort — rather than two shallower calls covering a
  // fortnight. See WINDOW_DAYS above.
  const days = await generateDayChunk(planShell, user, liveSignals, catalog, startDate, WINDOW_DAYS, portfolio, trace);
  const now = Date.now();
  return {
    version: 2, linkVersion: 2, ...roadmap, startDate,
    days, daysGeneratedFrom: startDate, daysGeneratedThrough: addDaysStr(startDate, WINDOW_DAYS - 1),
    windowBuiltFor: startDate,
    progressLog: [], createdAt: now, updatedAt: now, lastExtendedAt: now,
    generation: summarizeTrace(trace),
    profileSnapshot: buildProfileSnapshot(user),
  };
}

// ── The refresh that keeps the plan current ────────────────────────────────
// Rewrites the two-day window from scratch against everything true right now: today's real
// progress, the lessons that unlocked overnight, the deadline that moved a day closer. Days that
// have already elapsed are archived, not rewritten, and a task the student already finished today
// is carried over as done rather than reissued — finishing something and watching it reappear
// unfinished is the fastest way to stop trusting a plan.
// Two independent callers can ask for the same refresh at the same moment: the app-wide daily
// effect in App.jsx and PlansTab's own, when the student happens to have the Plans tab open as the
// date turns over. Both would be correct and both would spend a full Oracle generation, then race
// to save. Collapsing them here — keyed on the day being planned — means whichever asks first does
// the work and the other simply awaits the same result.
let inFlightRefresh = null; // { key, promise }
export async function refreshDayWindow(plan, user, liveSignals, portfolio) {
  const key = `${todayStr()}|${user?.id || user?.email || 'local'}`;
  if (inFlightRefresh?.key === key) return inFlightRefresh.promise;
  const promise = refreshDayWindowUncoalesced(plan, user, liveSignals, portfolio)
    .finally(() => { if (inFlightRefresh?.key === key) inFlightRefresh = null; });
  inFlightRefresh = { key, promise };
  return promise;
}

async function refreshDayWindowUncoalesced(plan, user, liveSignals, portfolio) {
  const trace = createGenerationTrace();
  const catalog = catalogFor(user, liveSignals);
  const today = todayStr();
  const fresh = await generateDayChunk(plan, user, liveSignals, catalog, today, WINDOW_DAYS, portfolio, trace);

  // Preserve completion: match by resource where there is one (the student did that exact quiz),
  // otherwise by title. Only for today — tomorrow has not happened yet.
  const doneToday = (plan?.days || []).find(d => d.date === today)?.tasks.filter(t => t.done) || [];
  const doneKeys = new Set(doneToday.map(t => (t.resourceKind && t.resourceId ? `${t.resourceKind}:${t.resourceId}` : `title:${t.title}`)));
  const days = fresh.map(d => (d.date !== today ? d : {
    ...d,
    tasks: d.tasks.map(t => {
      const key = t.resourceKind && t.resourceId ? `${t.resourceKind}:${t.resourceId}` : `title:${t.title}`;
      return doneKeys.has(key) ? { ...t, done: true, doneAt: Date.now(), xpAwarded: true } : t;
    }),
  }));

  const keptPast = (plan?.days || []).filter(d => d.date < today);
  return pruneRollingWindow({
    ...plan,
    days: [...keptPast, ...days],
    daysGeneratedFrom: today,
    daysGeneratedThrough: addDaysStr(today, WINDOW_DAYS - 1),
    windowBuiltFor: today,
    updatedAt: Date.now(), lastExtendedAt: Date.now(),
    generation: summarizeTrace(trace),
  });
}

// Kept under its original name because it is the same promise from the student's side — "the plan
// keeps going without me asking" — and because App/PlansTab and the verification suite address it
// by this name. With a two-day window, extending it and refreshing it are the same operation.
export const extendMasterPlan = refreshDayWindow;

// Regenerates the roadmap from scratch (profile/goals changed enough to want
// a fresh spine) but keeps the already-generated near-term days untouched so
// in-progress work isn't lost, and re-derives their week/phase linkage
// against the new roadmap.
export async function regenerateRoadmap(plan, user, liveSignals, portfolio) {
  const trace = createGenerationTrace();
  const catalog = catalogFor(user, liveSignals);
  const roadmap = await generateRoadmap(user, liveSignals, catalog, portfolio, plan, trace);
  const startDate = plan?.startDate || todayStr();
  const days = (plan?.days || []).map(d => {
    const weekNumber = weekNumberForDate({ startDate }, d.date);
    const phase = phaseForWeek(roadmap, weekNumber);
    return { ...d, weekNumber, phaseId: phase?.id || null };
  });
  return { ...plan, ...roadmap, startDate, days, updatedAt: Date.now(), generation: summarizeTrace(trace), profileSnapshot: buildProfileSnapshot(user) };
}

// The real "Add to plan" mechanism — regenerates the roadmap spine (as
// regenerateRoadmap does) AND rewrites the not-yet-elapsed, not-yet-finished
// portion of the day-by-day window, so a note like "I have a dentist
// appointment tomorrow" visibly changes actual tomorrow tasks, not just the
// roadmap's narrative overview. Any day before today, or any day (today or
// later) whose tasks are already fully done, is left completely untouched —
// only the first still-open day onward gets a fresh, note-aware generation.
export async function adaptPlanToNotes(plan, user, liveSignals, portfolio) {
  const trace = createGenerationTrace();
  const catalog = catalogFor(user, liveSignals);
  const roadmap = await generateRoadmap(user, liveSignals, catalog, portfolio, plan, trace);
  const today = todayStr();
  const startDate = plan?.startDate || today;
  const sorted = [...(plan?.days || [])].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const firstOpenIdx = sorted.findIndex(d => d.date >= today && !(d.tasks.length && d.tasks.every(t => t.done)));
  const keep = firstOpenIdx === -1 ? sorted : sorted.slice(0, firstOpenIdx);
  const regenFrom = firstOpenIdx === -1 ? null : sorted[firstOpenIdx].date;
  const through = plan?.daysGeneratedThrough || regenFrom;
  let freshDays = [];
  if (regenFrom && through) {
    // Never rewrite more than the window: the note the student just added is about the next day or
    // two, and asking for a longer rewrite is exactly the shallow-many-days trade WINDOW_DAYS
    // exists to refuse.
    const numDays = Math.min(WINDOW_DAYS, Math.max(1, daysBetween(regenFrom, through) + 1));
    const shell = { ...plan, ...roadmap, startDate };
    freshDays = await generateDayChunk(shell, user, liveSignals, catalog, regenFrom, numDays, portfolio, trace);
  }
  // A regenerated day replaces the stored one for the same date rather than sitting alongside it.
  const freshDates = new Set(freshDays.map(d => d.date));
  const days = [...keep.filter(d => !freshDates.has(d.date)), ...freshDays]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map(d => {
      const weekNumber = weekNumberForDate({ startDate }, d.date);
      const phase = phaseForWeek(roadmap, weekNumber);
      return { ...d, weekNumber, phaseId: phase?.id || null };
    });
  const lastDate = days.length ? days[days.length - 1].date : plan?.daysGeneratedThrough;
  return {
    ...plan, ...roadmap, startDate, days,
    daysGeneratedThrough: lastDate || plan?.daysGeneratedThrough,
    windowBuiltFor: today,
    updatedAt: Date.now(), generation: summarizeTrace(trace), profileSnapshot: buildProfileSnapshot(user),
  };
}

// True when the stored window no longer is what it claims to be: today and tomorrow, planned
// today. Three distinct ways that happens, and all three matter —
//   1. the window has run out (the student came back after a few days away),
//   2. it does not reach tomorrow (so "what's next" is blank), or
//   3. it reaches tomorrow but was written on an earlier day, so it predates everything that has
//      happened since. This is the common case, and the one the old three-days-of-runway check
//      missed entirely: a fortnight-long window always had runway, so it never refreshed, so a
//      Thursday student was still reading Tuesday's idea of Thursday.
export function needsExtension(plan) {
  if (!plan?.daysGeneratedThrough) return false;
  const today = todayStr();
  if (daysBetween(today, plan.daysGeneratedThrough) < WINDOW_DAYS - 1) return true;
  // A plan stored before windowBuiltFor existed gets one refresh, then behaves normally.
  return plan.windowBuiltFor !== today;
}

// Is the plan showing the student a day that has already ended? Cheap, synchronous, and used by
// the UI to decide whether to show today's tasks or a "refreshing" state.
export function windowCoversToday(plan) {
  return !!plan?.days?.some(d => d.date === todayStr());
}

// Archives days more than a few days in the past into a compact progressLog
// entry (date + completion count only) and drops their full task detail —
// keeps the synced blob small regardless of how long a student has been on
// the same plan. Call on load, before rendering.
export function pruneRollingWindow(plan) {
  if (!plan?.days?.length) return plan;
  const cutoff = addDaysStr(todayStr(), -3);
  const keep = []; const archive = [];
  for (const d of plan.days) (d.date < cutoff ? archive : keep).push(d);
  if (!archive.length) return plan;
  const log = [...(plan.progressLog || [])];
  for (const d of archive) log.push({ date: d.date, tasksTotal: d.tasks.length, tasksDone: d.tasks.filter(t => t.done).length });
  return { ...plan, days: keep, progressLog: log.slice(-60) };
}

// Toggling a task's checkbox flips its visible `done` state, but XP is a
// one-time reward for the underlying accomplishment — not for the checkbox.
// Without `xpAwarded` as a separate, never-reset flag, unchecking then
// rechecking the same task re-triggers the "just completed" branch and pays
// out again, indefinitely (the exact exploit: check → +XP, uncheck, check →
// +XP again). `xpAwarded` only ever flips false→true and is never cleared by
// unchecking, so a given task can earn its XP exactly once, no matter how
// many times it's toggled afterward.
export function toggleTaskDone(plan, date, taskId) {
  let justEarnedXP = false;
  const days = plan.days.map(d => {
    if (d.date !== date) return d;
    return {
      ...d,
      tasks: d.tasks.map(t => {
        if (t.id !== taskId) return t;
        const nextDone = !t.done;
        if (nextDone && !t.xpAwarded) justEarnedXP = true;
        return { ...t, done: nextDone, doneAt: nextDone ? Date.now() : null, xpAwarded: t.xpAwarded || nextDone };
      }),
    };
  });
  return { plan: { ...plan, days, updatedAt: Date.now() }, justEarnedXP };
}

// Manual rescheduling — drag-and-drop, the "Move" day picker, and one-click
// "snooze to tomorrow" all funnel through this single mutation. Moving a task
// off a day clears its `rolledOverFrom` pointer: that field means "this was
// carried here because it was missed", and a task the student *deliberately*
// relocated no longer reads as behind schedule. `toDate` may land beyond
// `plan.daysGeneratedThrough` (dragging far into the visible-but-not-yet-
// "through" tail of the rolling window, or the window boundary itself) — in
// that case a fresh day entry is created in place rather than silently
// dropping the task, so the mutation can never crash or lose data regardless
// of exactly which days already exist in the array.
export function moveTaskToDay(plan, taskId, fromDate, toDate) {
  if (!plan?.days?.length || !taskId || !fromDate || !toDate || fromDate === toDate) return plan;
  const fromDay = plan.days.find(d => d.date === fromDate);
  const task = fromDay?.tasks.find(t => t.id === taskId);
  if (!task) return plan;
  const movedTask = { ...task, id: `${toDate}-moved-${seedFrom(taskId + Date.now())}`, rolledOverFrom: null };
  let days = plan.days.map(d => (d.date === fromDate ? { ...d, tasks: d.tasks.filter(t => t.id !== taskId) } : d));
  const toIdx = days.findIndex(d => d.date === toDate);
  if (toIdx === -1) {
    const weekNumber = weekNumberForDate(plan, toDate);
    const phase = phaseForWeek(plan, weekNumber);
    const newDay = {
      date: toDate,
      dayIndex: days.length + 1,
      weekday: WEEKDAY_NAMES[weekdayIdx(toDate)],
      weekNumber,
      phaseId: phase?.id || null,
      theme: weeklyThemeForWeek(plan, weekNumber)?.theme || 'Steady progress this week',
      tasks: [movedTask],
      reflectionPrompt: null,
    };
    days = [...days, newDay].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  } else {
    days = days.map((d, i) => (i === toIdx ? { ...d, tasks: [...d.tasks, movedTask] } : d));
  }
  const daysGeneratedThrough = plan.daysGeneratedThrough && toDate > plan.daysGeneratedThrough ? toDate : plan.daysGeneratedThrough;
  return { ...plan, days, daysGeneratedThrough, updatedAt: Date.now() };
}

// Within-day drag-to-reorder — `orderedTaskIds` is the full new order for that
// day (any task id it doesn't mention, e.g. one that arrived after the drag
// started, is appended at the end rather than dropped).
export function reorderTasksInDay(plan, date, orderedTaskIds) {
  if (!plan?.days?.length || !date || !Array.isArray(orderedTaskIds) || !orderedTaskIds.length) return plan;
  let changed = false;
  const days = plan.days.map(d => {
    if (d.date !== date) return d;
    const byId = new Map(d.tasks.map(t => [t.id, t]));
    const known = new Set(orderedTaskIds);
    const reordered = orderedTaskIds.map(id => byId.get(id)).filter(Boolean);
    for (const t of d.tasks) if (!known.has(t.id)) reordered.push(t);
    changed = reordered.some((t, i) => t.id !== d.tasks[i]?.id);
    return changed ? { ...d, tasks: reordered } : d;
  });
  return changed ? { ...plan, days, updatedAt: Date.now() } : plan;
}

// Task types the app can verify actually happened, rather than trusting a
// self-reported checkbox — see resolveTaskResource for how resourceKind gets
// set. Quiz/lesson/deck all have a real "completed this in the app" event to
// hook; everything else (activities logged outside the app, essays, deadline
// admin, reflection, rest days, ...) has no such signal and stays a manual,
// self-reported checkbox.
export const AUTO_VERIFIABLE_KINDS = new Set(['quiz', 'lesson', 'deck']);

// Builds an `isMatch(task)` predicate for the common case — a task whose
// resolved resource is exactly this {kind, id} (a specific quiz/lesson/deck).
// `id` may be an array to match any of several (e.g. a Smart Mix session
// completing should also credit a task that names one specific deck).
export function resourceMatch(kind, id) {
  const ids = Array.isArray(id) ? id : [id];
  return (t) => t.resourceKind === kind && ids.includes(t.resourceId);
}

// Task types with no addressable resourceId (Portfolio actions like logging an
// activity, adding a college, sending a coach message) but still a real,
// unambiguous in-app "this happened" signal — matched by task type instead of
// a specific resource. `interview` is included for consistency even though its
// call site predates this helper and in-lines the same predicate.
export const AUTO_VERIFIABLE_TYPES = new Set(['activity', 'college', 'essay', 'deadline', 'clinical', 'research', 'recommender', 'coach', 'interview']);
export function typeMatch(type) { return (t) => t.type === type; }

// Auto-checks off every not-yet-done task across the whole plan (not just
// today — a student who works ahead should still get credit) that `isMatch`
// accepts. This is the real accountability mechanism: for auto-verifiable
// task types (see AUTO_VERIFIABLE_KINDS) the UI removes the manual checkbox
// entirely (see PlansTab's TaskRow), so the *only* way these ever become done
// is by actually doing the linked quiz/lesson/deck — there's no self-report
// path left to game. XP follows the same one-time-only rule as the manual
// toggle above (`xpAwarded`), just set proactively here since there's no
// separate "toggle" event to gate it on.
export function autoCompleteResourceTasks(plan, isMatch) {
  if (!plan?.days?.length || typeof isMatch !== 'function') return { plan, completed: [] };
  const completed = [];
  let changed = false;
  const days = plan.days.map(d => ({
    ...d,
    tasks: d.tasks.map(t => {
      if (t.done || !isMatch(t)) return t;
      changed = true;
      completed.push({ date: d.date, id: t.id, title: t.title, type: t.type, resourceKind: t.resourceKind });
      return { ...t, done: true, doneAt: Date.now(), xpAwarded: true, autoVerified: true };
    }),
  }));
  if (!changed) return { plan, completed: [] };
  return { plan: { ...plan, days, updatedAt: Date.now() }, completed };
}

// ── Read helpers — shared by the Plans tab UI and the coach system prompt ──
export function getTodayPlanEntry(plan) { return plan?.days?.find(d => d.date === todayStr()) || null; }
export function getCurrentWeekNumber(plan) { return plan?.startDate ? weekNumberForDate(plan, todayStr()) : null; }
export function getCurrentPhase(plan) { const w = getCurrentWeekNumber(plan); return w ? phaseForWeek(plan, w) : null; }
export function getWeekTheme(plan, week) { return weeklyThemeForWeek(plan, week); }
export function getUpcomingDays(plan, n = 7) {
  const today = todayStr();
  return (plan?.days || []).filter(d => d.date >= today).slice(0, n);
}
export function getPlanDay(plan, dateStr) { return plan?.days?.find(d => d.date === dateStr) || null; }
export function getNextPlanDay(plan) {
  const today = todayStr();
  return (plan?.days || []).filter(d => d.date > today).sort((a, b) => (a.date < b.date ? -1 : 1))[0] || null;
}

// Plan-specific "on track" streak — distinct from the general study streak in
// db.js — counting consecutive fully-completed days walking backward from
// today. Reads both the live `plan.days` window and the compacted
// `progressLog` (pruneRollingWindow archives older days into
// {date, tasksTotal, tasksDone} entries there) so the streak survives the
// rolling window pruning older days out of full detail. Today doesn't have to
// be finished yet to keep the streak alive — only a fully-elapsed day with
// unfinished tasks breaks it.
export function getPlanStreak(plan) {
  if (!plan) return 0;
  const byDate = new Map();
  for (const d of (plan.days || [])) byDate.set(d.date, { total: d.tasks.length, done: d.tasks.filter(t => t.done).length });
  for (const l of (plan.progressLog || [])) if (!byDate.has(l.date)) byDate.set(l.date, { total: l.tasksTotal, done: l.tasksDone });
  let streak = 0;
  let date = todayStr();
  const todayEntry = byDate.get(date);
  if (todayEntry && todayEntry.total > 0 && todayEntry.done === todayEntry.total) streak++;
  date = addDaysStr(date, -1);
  while (byDate.has(date)) {
    const e = byDate.get(date);
    if (e.total > 0 && e.done === e.total) { streak++; date = addDaysStr(date, -1); }
    else break;
  }
  return streak;
}

// Compact summary folded into buildCoachSystemPrompt so Scout/Guide/Sage all
// know the plan exists and what it says for *right now* — this is the "meta
// brain" link between the Plans tab and the chat coach.
export function summarizePlanForCoach(plan) {
  if (!plan?.headline) return null;
  const weekNumber = getCurrentWeekNumber(plan);
  const phase = getCurrentPhase(plan);
  const weekTheme = weekNumber ? getWeekTheme(plan, weekNumber) : null;
  const today = getTodayPlanEntry(plan);
  return {
    headline: plan.headline,
    horizonWeeks: plan.horizonWeeks,
    weekNumber,
    phaseTitle: phase?.title || null,
    weekTheme: weekTheme?.theme || null,
    todaysTasks: (today?.tasks || []).map(t => t.title),
  };
}

export { todayStr, addDaysStr, daysBetween };
