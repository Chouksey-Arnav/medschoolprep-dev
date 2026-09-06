#!/usr/bin/env node
// Assertions on the Plans tab's master plan — the generator's pure logic (src/lib/masterPlanGenerator.js),
// the readiness gate that guards it (src/lib/studentProfile.js), and the wiring between the two
// (src/App.jsx, src/components/PlansTab.jsx). No test runner in this repo, so this script is the
// test suite for the most expensive artifact the app produces.
//
// The properties worth failing a build over:
//
//   1. THE GATE IS NEVER A DEAD END. Every unmet plan-readiness item must name a destination the
//      app can actually navigate to, and every profile field it asks for must have a real editor
//      in Settings with a matching anchor. A checklist row that leads nowhere leaves the student
//      permanently locked out of the feature with no way to unlock it.
//   2. EVERY TASK HAS A WORKING LINK. resolveTaskResource must return a launchable destination for
//      every task type, from any input the model can produce — including nonsense. A task nobody
//      can open is a to-do list, not a plan.
//   3. THE PLAN SURVIVES ITS OWN MUTATIONS. Toggling, moving, reordering, rolling over and pruning
//      must never lose a task, duplicate one, or pay XP twice.
//   4. THE PROMPT CARRIES THE WHOLE PORTFOLIO, AND FITS. Every tracked category must appear in the
//      digest (including the empty ones), and the assembled profile text must stay under the
//      server's input cap so nothing is silently truncated.
//   5. GENERATION ALWAYS YIELDS A USABLE PLAN. Given garbage from the model — wrong types, missing
//      fields, half a response — the repair layer must still produce a complete, renderable shape.
//
//   node scripts/verifyMasterPlan.mjs
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

register('./_appResolve.mjs', import.meta.url);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

const MP = await import('../src/lib/masterPlanGenerator.js');
const SP = await import('../src/lib/studentProfile.js');

let passed = 0;
const failures = [];
const assert = (label, cond, detail = '') => {
  if (cond) { passed += 1; return; }
  failures.push(`${label}${detail ? `\n      ${detail}` : ''}`);
};
const eq = (label, actual, expected) =>
  assert(label, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
const section = (name) => console.log(`\n${name}`);

const { todayStr, addDaysStr } = MP;
const TODAY = todayStr();
const YESTERDAY = addDaysStr(TODAY, -1);
const TOMORROW = addDaysStr(TODAY, 1);

const task = (over = {}) => ({
  id: over.id || `t-${Math.random().toString(36).slice(2, 8)}`,
  pillar: 'prep', type: 'quiz', title: 'A task', detail: '', estMinutes: 20,
  done: false, doneAt: null, resourceTab: 'prep', resourceView: 'quizzes',
  resourceKind: 'quiz', resourceId: 'q1', resourceLabel: 'A quiz',
  ...over,
});
const day = (date, tasks, over = {}) => ({
  date, dayIndex: 1, weekday: 'Monday', weekNumber: 1, phaseId: 'phase-0',
  theme: 'Theme', tasks, reflectionPrompt: null, ...over,
});
const planOf = (days, over = {}) => ({
  version: 1, headline: 'A plan', overview: 'o', startDate: TODAY, horizonWeeks: 12,
  phases: [{ id: 'phase-0', index: 0, title: 'P', weekStart: 1, weekEnd: 12, theme: 't', objectives: ['a'], resources: ['r'], successMetric: 's' }],
  weeklyThemes: [{ week: 1, phaseId: 'phase-0', theme: 't', focus: ['prep'], keyResource: 'r' }],
  milestones: [], riskMitigation: [], days, progressLog: [],
  daysGeneratedFrom: TODAY, daysGeneratedThrough: addDaysStr(TODAY, 13),
  createdAt: Date.now(), updatedAt: Date.now(),
  ...over,
});

// ── 1. The readiness gate is never a dead end ───────────────────────────────
section('Readiness gate leads somewhere real');

const appSrc = read('src/App.jsx');
const plansSrc = read('src/components/PlansTab.jsx');

const emptyReadiness = SP.computePlanReadiness(null, {});
assert('a null user is not plan-ready', emptyReadiness.ready === false);
eq('every gate is listed for a null user', emptyReadiness.checklist.length, SP.PLAN_READINESS_FIELDS.length + SP.ACTIVITY_GATES.length);

for (const item of emptyReadiness.checklist) {
  assert(`"${item.label}" names a destination tab`, !!item.goTab, `kind=${item.kind}`);
  assert(`"${item.label}" tells the student where it goes`, !!item.hint);
  if (item.kind === 'profile') {
    assert(`"${item.label}" targets Settings`, item.goTab === 'settings');
    assert(`"${item.label}" names the field to focus`, !!item.goField);
    // The anchor the Settings deep-link scrolls to has to exist in the DOM, or the tap lands
    // on the Settings tab and abandons the student to find the field themselves.
    assert(`Settings renders an anchor for "${item.goField}"`,
      appSrc.includes(`id="settings-field-${item.goField}"`),
      `no id="settings-field-${item.goField}" in src/App.jsx`);
    // …and an editor that actually writes that field back to the user record.
    assert(`Settings can actually save "${item.field}"`,
      new RegExp(`${item.field}\\s*:`).test(appSrc),
      `no writer for ${item.field} found in src/App.jsx`);
  } else {
    assert(`"${item.label}" names a sub-view`, item.goView !== undefined);
    assert(`"${item.label}" points at a real destination`,
      MP.VALID_DESTINATIONS.has(`${item.goTab}:${item.goView}`),
      `${item.goTab}:${item.goView} is not a navigable destination`);
  }
}

assert('the lock screen wires profile rows to the Settings deep link',
  /onGoProfileField=\{\(m\) => goSettings\?\.\(m\.goField\)\}/.test(plansSrc));
assert('the lock screen makes unfinished profile rows clickable',
  /clickable=\{m\.state !== 'done' && !!onGoProfileField\}/.test(plansSrc));
// The second parameter is the settings SUB-TAB (Settings has real sub-tabs now — see
// SETTINGS_SUBNAV in App.jsx). It is optional: a deep link that names only a field still works,
// because goSettings maps the field to the sub-tab that renders it. Without that mapping the
// lock screen's rows would open Settings on the wrong tab and highlight nothing.
assert('goSettings accepts a field to focus', /const goSettings = useCallback\(\(field=null,\s*view=null\)/.test(appSrc));
assert('goSettings knows which settings sub-tab owns a focusable field',
  /SETTINGS_VIEW_FOR_FIELD/.test(appSrc),
  'a focused field on a sub-tab that is not rendered is a deep link into a blank screen');
assert('goSettings ignores a click event passed as the field',
  /typeof field==='string'\?field:null/.test(appSrc),
  'onClick={goSettings} would otherwise pass a SyntheticEvent as the focus target');

// A student who fills everything in must actually become ready — a gate nobody can pass is the
// same dead end from the other direction.
const READY_USER = {
  goal: 'top_score', obstacles: ['busy'], studyHours: '3-5', onboardingTargetScore: 1400,
  gpaBand: '3.5-3.7', testTimeline: 'spring', diagnosticResult: 'physician',
};
const ready = SP.computePlanReadiness(READY_USER, { quizzesTaken: 1, portfolioItemCount: 1 });
assert('a fully-answered student is plan-ready', ready.ready === true, JSON.stringify(ready.missing));
eq('a ready student reads 100%', ready.pct, 100);
assert('every checklist row shows as done', ready.checklist.every(c => c.state === 'done'));

// Loading counts must not read as failures.
const loadingGate = SP.computePlanReadiness(READY_USER, { quizzesTaken: null, portfolioItemCount: null });
assert('unloaded counts read as loading, not pending',
  loadingGate.checklist.filter(c => c.field === 'quizAttempted' || c.field === 'portfolioTracked').every(c => c.state === 'loading'));
assert('unloaded counts do not block the plan', loadingGate.ready === true);
const zeroGate = SP.computePlanReadiness(READY_USER, { quizzesTaken: 0, portfolioItemCount: 0 });
assert('genuinely-zero counts do block the plan', zeroGate.ready === false);

// ── 2. Every task resolves to something openable ────────────────────────────
section('Every task gets a working link');

const index = {
  lessons: [{ id: 'l1', title: 'Cells and Systems', unitTitle: 'Biology Foundations' }, { id: 'l2', title: 'Acids and Bases', unitTitle: 'Chemistry' }],
  quizzes: [{ id: 'q1', title: 'Cardiac Physiology Basics', cat: 'Life Sciences' }, { id: 'q2', title: 'Stoichiometry Drill', cat: 'Physical Sciences' }],
  decks: ['Biology Core', 'Chemistry Core', 'Smart Mix'],
  articles: [{ title: 'What Shadowing Actually Looks Like', cat: 'Careers' }],
};
const ALL_TYPES = ['lesson', 'quiz', 'flashcards', 'reading', 'coach', 'activity', 'college', 'essay',
  'deadline', 'clinical', 'research', 'recommender', 'interview', 'reflection', 'rest',
  'sat_practice', 'sat_review', 'sat_test'];

for (const type of ALL_TYPES) {
  const r = MP.resolveTaskResource({ type, title: 'Do the thing', detail: '' }, index, { seedKey: TODAY });
  if (type === 'rest') {
    assert('a rest task is allowed to have no destination', r.resourceTab === null || MP.VALID_DESTINATIONS.has(`${r.resourceTab}:${r.resourceView}`));
  } else {
    assert(`"${type}" resolves to a real destination`,
      MP.VALID_DESTINATIONS.has(`${r.resourceTab}:${r.resourceView}`),
      `got ${r.resourceTab}:${r.resourceView}`);
  }
  assert(`"${type}" always reports a resource kind`, !!r.resourceKind);
  if (r.resourceKind !== 'view') assert(`"${type}" carries an id for a specific resource`, !!r.resourceId);
}

// Hallucinated destinations must degrade to a derived one, never to a broken click.
const bogus = MP.resolveTaskResource({ type: 'quiz', resourceTab: 'nowhere', resourceView: 'nope', title: 'x' }, index, { seedKey: 'k' });
eq('a hallucinated tab falls back to the type default', `${bogus.resourceTab}:${bogus.resourceView}`, 'prep:quizzes');
const badType = MP.resolveTaskResource({ type: 'not-a-type', title: 'x' }, index, { seedKey: 'k' });
assert('an unknown task type still resolves', MP.VALID_DESTINATIONS.has(`${badType.resourceTab}:${badType.resourceView}`));

// Named resources must win over the rotation fallback, or "Open: <the exact quiz>" is a lie.
const named = MP.resolveTaskResource({ type: 'quiz', resourceName: 'Stoichiometry Drill', title: 'Practice' }, index, { seedKey: 'k' });
eq('an exact quiz name resolves to that quiz', named.resourceId, 'q2');
const namedLesson = MP.resolveTaskResource({ type: 'lesson', resourceName: 'Acids and Bases', title: 'Study' }, index, { seedKey: 'k' });
eq('an exact lesson name resolves to that lesson', namedLesson.resourceId, 'l2');
const dueDeck = MP.resolveTaskResource({ type: 'flashcards', title: 'Clear your due cards', detail: 'due today' }, index, { seedKey: 'k' });
eq('a "due cards" task routes to Smart Mix', dueDeck.resourceId, 'Smart Mix');
const weakest = MP.resolveTaskResource({ type: 'quiz', title: 'Practice set' }, index, { seedKey: 'k', weakestCategory: 'Physical Sciences' });
eq('an unnamed quiz targets the weakest category', weakest.resourceId, 'q2');

// Retired sub-views from older stored plans get remapped, not dropped.
const retired = MP.resolveTaskResource({ type: 'deadline', resourceTab: 'portfolio', resourceView: 'deadlines', title: 'x' }, index, { seedKey: 'k' });
eq('a retired portfolio:deadlines link remaps to milestones', retired.resourceView, 'milestones');

// Resolution is deterministic — the same plan must not re-point its links on every render.
const a1 = MP.resolveTaskResource({ type: 'quiz', title: 'Practice' }, index, { seedKey: TODAY });
const a2 = MP.resolveTaskResource({ type: 'quiz', title: 'Practice' }, index, { seedKey: TODAY });
eq('resolution is deterministic for the same task and day', a1.resourceId, a2.resourceId);

// ── 3. The plan survives its own mutations ──────────────────────────────────
section('Plan mutations never lose or duplicate work');

// XP pays exactly once, no matter how many times a checkbox is toggled.
let p = planOf([day(TODAY, [task({ id: 'x1', type: 'essay' })])]);
let r1 = MP.toggleTaskDone(p, TODAY, 'x1');
assert('checking a task off earns XP', r1.justEarnedXP === true);
let r2 = MP.toggleTaskDone(r1.plan, TODAY, 'x1');
assert('unchecking earns nothing', r2.justEarnedXP === false);
let r3 = MP.toggleTaskDone(r2.plan, TODAY, 'x1');
assert('re-checking the same task never pays twice', r3.justEarnedXP === false);
assert('the task is still marked done after the re-check', r3.plan.days[0].tasks[0].done === true);

// Moving a task relocates it exactly once.
const twoDay = planOf([day(TODAY, [task({ id: 'm1' }), task({ id: 'm2' })]), day(TOMORROW, [task({ id: 'm3' })])]);
const moved = MP.moveTaskToDay(twoDay, 'm1', TODAY, TOMORROW);
eq('the source day loses the moved task', moved.days[0].tasks.length, 1);
eq('the target day gains it', moved.days[1].tasks.length, 2);
const allIds = moved.days.flatMap(d => d.tasks.map(t => t.id));
eq('no task is duplicated by a move', new Set(allIds).size, allIds.length);
assert('a move to a day outside the window creates that day', (() => {
  const far = addDaysStr(TODAY, 40);
  const out = MP.moveTaskToDay(twoDay, 'm1', TODAY, far);
  return out.days.some(d => d.date === far && d.tasks.length === 1) && out.daysGeneratedThrough === far;
})());
assert('moving a task that does not exist is a no-op', MP.moveTaskToDay(twoDay, 'nope', TODAY, TOMORROW) === twoDay);
assert('moving onto the same day is a no-op', MP.moveTaskToDay(twoDay, 'm1', TODAY, TODAY) === twoDay);

// Reordering keeps every task, including ones the drag never saw.
const reorderPlan = planOf([day(TODAY, [task({ id: 'r1' }), task({ id: 'r2' }), task({ id: 'r3' })])]);
const reordered = MP.reorderTasksInDay(reorderPlan, TODAY, ['r3', 'r1']);
eq('reordering keeps every task', reordered.days[0].tasks.length, 3);
eq('the requested order is applied', reordered.days[0].tasks[0].id, 'r3');
assert('an unmentioned task is appended, not dropped', reordered.days[0].tasks.some(t => t.id === 'r2'));

// Daily rollover is idempotent — the effect that calls it re-runs on every render.
const missedPlan = planOf([
  day(YESTERDAY, [task({ id: 'y1', title: 'Missed thing' }), task({ id: 'y2', title: 'Done thing', done: true })]),
  day(TODAY, [task({ id: 't1', title: 'Today thing' })]),
]);
const rolled = MP.applyDailyRollover(missedPlan, { rollover: true });
const todayAfter = rolled.days.find(d => d.date === TODAY);
eq('yesterday\'s missed task carries into today', todayAfter.tasks.length, 2);
assert('the carried task is marked as carried over', todayAfter.tasks.some(t => t.rolledOverFrom === 'y1'));
assert('a completed task is not carried over', !todayAfter.tasks.some(t => t.title === 'Done thing'));
const rolledTwice = MP.applyDailyRollover(rolled, { rollover: true });
eq('rollover is idempotent within a day', rolledTwice.days.find(d => d.date === TODAY).tasks.length, 2);
assert('rollover respects the opt-out', MP.applyDailyRollover(missedPlan, { rollover: false }).days.find(d => d.date === TODAY).tasks.length === 1);
assert('a carried task starts un-awarded', todayAfter.tasks.find(t => t.rolledOverFrom === 'y1').xpAwarded === false);

// Pruning compacts history without losing the count.
const oldDate = addDaysStr(TODAY, -10);
const prunable = planOf([day(oldDate, [task({ done: true }), task({ done: false })]), day(TODAY, [task()])]);
const pruned = MP.pruneRollingWindow(prunable);
assert('old days leave the live window', !pruned.days.some(d => d.date === oldDate));
const logged = pruned.progressLog.find(l => l.date === oldDate);
assert('an archived day keeps its completion counts', !!logged && logged.tasksTotal === 2 && logged.tasksDone === 1);
assert('today is never pruned', pruned.days.some(d => d.date === TODAY));

// Auto-verification credits the real resource, once.
const verifiable = planOf([day(TODAY, [task({ id: 'v1', resourceKind: 'quiz', resourceId: 'q1' }), task({ id: 'v2', resourceKind: 'quiz', resourceId: 'q2' })])]);
const autoDone = MP.autoCompleteResourceTasks(verifiable, MP.resourceMatch('quiz', 'q1'));
eq('exactly the matching task is completed', autoDone.completed.length, 1);
eq('and it is the right one', autoDone.completed[0].id, 'v1');
assert('an auto-completed task is marked verified', autoDone.plan.days[0].tasks[0].autoVerified === true);
eq('re-running credits nothing further', MP.autoCompleteResourceTasks(autoDone.plan, MP.resourceMatch('quiz', 'q1')).completed.length, 0);

// The plan streak reads both the live window and the compacted log.
const streakPlan = planOf(
  [day(addDaysStr(TODAY, -1), [task({ done: true })]), day(TODAY, [task({ done: false })])],
  { progressLog: [{ date: addDaysStr(TODAY, -2), tasksTotal: 2, tasksDone: 2 }] },
);
eq('the streak spans the live window and the archive', MP.getPlanStreak(streakPlan), 2);

// ── 4. The prompt reads the whole portfolio, and fits ───────────────────────
section('The prompt carries the whole Portfolio and stays under the cap');

// The client's own budget must sit under the server's cap for this purpose, or the digest gets
// truncated mid-sentence by api/groq.js instead of trimmed section-wise here.
const groqSrc = read('api/groq.js');
const capMatch = groqSrc.match(/MAX_INPUT_CHARS_BY_PURPOSE = \{[^}]*masterplan:\s*(\d+)/);
assert('api/groq.js declares a masterplan input cap', !!capMatch);
const serverCap = capMatch ? Number(capMatch[1]) : 0;
const genSrc = read('src/lib/masterPlanGenerator.js');
const budgetMatch = genSrc.match(/PROFILE_FACTS_BUDGET = (\d+)/);
assert('the generator declares its own profile budget', !!budgetMatch);
const clientBudget = budgetMatch ? Number(budgetMatch[1]) : 0;
assert('the client budget leaves headroom under the server cap',
  clientBudget > 0 && clientBudget <= serverCap - 3000,
  `budget ${clientBudget} vs cap ${serverCap}`);

// Every Portfolio table the app can write must be visible to the planner. A category the digest
// omits is one the Oracle is structurally blind to.
const PORTFOLIO_KEYS = ['colleges', 'essays', 'deadlines', 'scholarships', 'activities', 'research',
  'skills', 'clinicalHours', 'recommenders', 'testScores', 'awards', 'gpaEntries'];
const resourcesSrc = read('api/_lib/resources.js');
const plansMap = plansSrc.match(/const PORTFOLIO_RESOURCE_MAP = \{([\s\S]*?)\n\};/);
assert('PlansTab declares its Portfolio resource map', !!plansMap);
if (plansMap) {
  const fetched = [...plansMap[1].matchAll(/^\s*(\w+):/gm)].map(m => m[1]);
  // Every server-side resource that holds student-authored Portfolio content is fetched. The
  // exclusions are structural rather than content-bearing.
  //
  // credential_suggestions is the odd one out and worth naming: it is student-authored, but it is
  // not a record of anything the student has DONE. It is a proposal that our credential catalog is
  // missing something (see supabase/migrations/0018_credential_catalog.sql), addressed to us
  // rather than to their own portfolio. Feeding it to the planner would have the Oracle treating
  // "asked us to add CNA II to the database" as a portfolio entry, which is the kind of quiet
  // category error that makes a plan read as though it has not been paying attention.
  //
  // reflection_entries is excluded for a different and stronger reason: it is the one student-
  // authored surface in the whole product that is deliberately OUTSIDE the task system. The
  // reflection journal has no due dates, no overdue state and no place in any task list, because
  // a fifteen-year-old told they are behind on reflecting stops reflecting and starts performing
  // — and a performed answer is worthless as raw material three years later (see the header of
  // src/lib/healthEssays.js). Feeding it to the plan generator would produce exactly the task
  // the design exists to prevent: "write a journal entry about your summer," with a date on it.
  // The planner sees the four-year working document, because that is an `essays` row and is
  // legitimately part of the application; it does not see the journal behind it.
  //
  // medex_scores is excluded on both of the grounds above at once. It is not student-authored at
  // all — it is OUR derived weekly seal of the MedEx Score, computed from the very tables the
  // planner already reads (src/lib/medex/score.js), so feeding it back in would be the planner
  // reasoning over its own inputs a second time, laundered through a number. And the task it
  // would produce is precisely the one the score is designed not to generate: "raise your MedEx
  // Score by 40 this month" is a target on a metric rather than on the work, and a student who
  // optimises the metric instead of the portfolio has been actively mis-served. The plan should
  // say "log the 60 shadowing hours you already have"; the score moves because that happened.
  //
  // narrative_runs is excluded on exactly the medex_scores grounds, and for once that is not a
  // convenient parallel — it is the same object. A run is not student-authored: it is OUR reading
  // of a file, derived from the essays and activities the planner already reads (src/lib/ivy/),
  // so feeding it back would be the planner reasoning over its own inputs a second time, laundered
  // through a rubric score. And the task it would generate is the one that engine's own safeguards
  // exist to forbid: "raise your spike index to 2.0 this month" is a target on a metric rather
  // than on the work, and the engine is explicit that its numbers describe how a file currently
  // scans rather than naming something to optimise. The plan should say "get one person outside
  // your school to vouch for the project"; the reading moves because that happened.
  //
  // narrative_profile is NOT excluded, and the difference is the usual one: it is student-authored
  // and it is a record of what they have actually done and built.
  const CONTENTLESS = new Set(['essay_versions', 'portfolio_evidence', 'credential_suggestions', 'reflection_entries', 'medex_scores', 'narrative_runs']);
  const serverResources = [...resourcesSrc.matchAll(/^\s*'([a-z_]+)',$/gm)].map(m => m[1]);
  for (const r of serverResources) {
    if (CONTENTLESS.has(r)) continue;
    assert(`the plan reads the "${r}" table`, fetched.includes(r), `add ${r} to PORTFOLIO_RESOURCE_MAP`);
  }
}

// An empty Portfolio must still name every category, so "nothing logged" is explicit rather than
// indistinguishable from "not considered".
const emptyPortfolio = Object.fromEntries(PORTFOLIO_KEYS.map(k => [k, []]));
const emptyFacts = MP.buildProfileFactsText({ name: 'Ada', gradeStage: 'junior' }, {}, emptyPortfolio, null);
for (const label of ['colleges', 'essay', 'deadline', 'activit', 'clinical', 'research', 'recommender', 'skills', 'award', 'scholarship', 'GPA']) {
  assert(`an empty Portfolio still reports on "${label}"`, emptyFacts.toLowerCase().includes(label.toLowerCase()));
}
assert('an empty Portfolio produces a ranked gap list', /BIGGEST GAPS/.test(emptyFacts));

// A large, fully-populated Portfolio must not blow the budget.
const many = (n, f) => Array.from({ length: n }, (_, i) => f(i));
const bigPortfolio = {
  colleges: many(30, i => ({ name: `University of Somewhere Number ${i}`, category: 'target', status: 'researching', rd_deadline: addDaysStr(TODAY, 60) })),
  essays: many(25, i => ({ title: `Supplemental essay number ${i}`, status: 'draft', content: 'word '.repeat(300), word_limit: 300, updated_at: new Date().toISOString() })),
  deadlines: many(30, i => ({ title: `Deadline ${i}`, due_date: addDaysStr(TODAY, i) })),
  scholarships: many(20, i => ({ name: `Scholarship ${i}`, amount: 5000, deadline: addDaysStr(TODAY, 30) })),
  activities: many(30, i => ({ activity_type: 'volunteer', position: `Position ${i}`, organization: `Org ${i}`, description: 'x '.repeat(60), hours_per_week: 3, weeks_per_year: 30, leadership_role: true })),
  research: many(10, i => ({ title: `Research project ${i}`, institution: 'Somewhere', status: 'ongoing' })),
  skills: many(20, i => ({ name: `Skill ${i}` })),
  clinicalHours: many(50, i => ({ site_name: `Site ${i}`, hours: 4, entry_date: addDaysStr(TODAY, -i) })),
  recommenders: many(8, i => ({ name: `Teacher ${i}`, relationship: 'Science teacher', status: 'confirmed' })),
  testScores: many(6, i => ({ test_type: 'SAT', composite: 1200 + i * 20, test_date: addDaysStr(TODAY, -100 + i * 10) })),
  awards: many(15, i => ({ title: `Award ${i}`, level: 'state' })),
  gpaEntries: many(8, i => ({ term: `2025-${i}`, gpa: 3.5 + i * 0.02 })),
  collegeChecklist: many(60, i => ({ label: `Item ${i}`, done: i % 2 === 0 })),
};
const heavySignals = {
  categoryAverages: { 'Life Sciences': 71, 'Physical Sciences': 55, 'Behavioral & Social Sciences': 80 },
  quizzesTaken: 40, pathwayMastery: 62, streak: 14, dueCards: 30, satOpenReviews: 12,
  satProjection: { low: 1220, high: 1300, mid: 1260, confidence: 'medium', percentile: 82 },
  satWeakSkills: ['Boundaries', 'Linear equations', 'Inference'],
  applicationStrength: { score: 58, label: 'Building', subscores: { academic: 60, clinical: 40, application: 70, activities: 55 } },
  recentActivitySummary: 'Finished 3 quizzes and logged 6 clinical hours this week.',
  personalBrief: 'brief text. '.repeat(400),
  timelineSummary: 'timeline line. '.repeat(400),
};
const heavyPlan = planOf(many(20, i => day(addDaysStr(TODAY, -20 + i), many(4, j => task({ id: `h${i}-${j}`, done: j % 2 === 0, type: j === 0 ? 'quiz' : 'essay' })))));
const bigFacts = MP.buildProfileFactsText(
  { name: 'Ada', gradeStage: 'junior', goal: 'top_score', obstacles: ['busy'], planNotes: ['I have a trip in two weeks'] },
  heavySignals, bigPortfolio, heavyPlan,
);
assert('a maximal profile stays inside the budget', bigFacts.length <= clientBudget, `${bigFacts.length} chars > ${clientBudget}`);
assert('the Portfolio itself is never the section dropped', /READ ROW BY ROW/.test(bigFacts));
assert('the gap list survives the budget', /BIGGEST GAPS/.test(bigFacts));
assert('the student\'s own words are carried through', bigFacts.includes('I have a trip in two weeks'));
assert('measured performance is included', /Quiz averages by category/.test(bigFacts));
assert('overdue-vs-upcoming deadlines are distinguished', /Upcoming deadlines/.test(bigFacts));

// Adherence is read back from the plan's own history.
const adherence = MP.buildAdherenceFacts(heavyPlan);
assert('adherence is computed from elapsed days', !!adherence);
eq('adherence measures the completion rate', adherence.completionPct, 50);
assert('adherence names a reliably-skipped task type', adherence.skippedTypes.length + adherence.reliableTypes.length > 0);
assert('a plan with no elapsed days yields no adherence claim', MP.buildAdherenceFacts(planOf([day(TOMORROW, [task()])])) === null);

// ── 5. Generation always yields a usable plan ───────────────────────────────
section('Garbage in, complete plan out');

const catalog = MP.buildResourceCatalog('exploring', 'junior');
assert('the catalog names the pathway', !!catalog.pathwayLabel);
assert('the catalog lists real quiz categories', catalog.quizCats.length > 0);

for (const horizon of [6, 12, 20, 40]) {
  const fallback = MP.heuristicRoadmap({ testTrack: 'SAT', gradeStage: 'junior' }, horizon, catalog);
  eq(`the ${horizon}-week fallback covers every week`, fallback.weeklyThemes.length, horizon);
  assert(`the ${horizon}-week fallback phases span the horizon`,
    fallback.phases[0].weekStart === 1 && fallback.phases.at(-1).weekEnd === horizon);
  assert(`every ${horizon}-week theme belongs to a real phase`,
    fallback.weeklyThemes.every(w => fallback.phases.some(ph => ph.id === w.phaseId)));
  assert(`every ${horizon}-week milestone lands inside the horizon`,
    fallback.milestones.every(m => m.weekTarget >= 1 && m.weekTarget <= horizon));
}

// The horizon must stay sane for any input, including a test date in the past.
eq('a missing profile still gets a horizon', typeof MP.computeHorizonWeeks({}), 'number');
const pastExam = MP.computeHorizonWeeks({ examDate: addDaysStr(TODAY, -30) });
assert('a past test date does not produce a negative horizon', pastExam >= 6, `got ${pastExam}`);
const farExam = MP.computeHorizonWeeks({ examDate: addDaysStr(TODAY, 900) });
assert('a distant test date is capped', farExam <= 40, `got ${farExam}`);

// The repair layer is what stands between a bad completion and a broken tab.
const GARBAGE = [
  null, undefined, {}, { phases: 'not an array' }, { phases: [] },
  { phases: [{ title: 42 }], weeklyThemes: [{ week: 'x' }], milestones: [{}], riskMitigation: 'no' },
  { weeklyThemes: [{ week: 3, theme: 'only week three' }] },
];
for (const [i, junk] of GARBAGE.entries()) {
  const repaired = MP.repairRoadmap(junk, MP.heuristicRoadmap({ gradeStage: 'junior' }, 12, catalog), 12);
  assert(`garbage roadmap #${i} still renders`, !!repaired.headline && !!repaired.overview);
  eq(`garbage roadmap #${i} still covers every week`, repaired.weeklyThemes.length, 12);
  assert(`garbage roadmap #${i} has phases`, repaired.phases.length >= 1);
  assert(`garbage roadmap #${i} has at least 5 milestones`, repaired.milestones.length >= 5);
  assert(`garbage roadmap #${i} keeps the three pillar strategies`,
    !!repaired.pillarStrategy.prep && !!repaired.pillarStrategy.portfolio && !!repaired.pillarStrategy.progress);
  assert(`garbage roadmap #${i} never emits a null objective`,
    repaired.phases.every(ph => ph.objectives.every(o => typeof o === 'string' && o.length > 0)));
}

const fallbackDays = MP.heuristicDays(planOf([]), TODAY, 7, catalog, { testTrack: 'SAT' });
eq('the heuristic fills every requested day', fallbackDays.length, 7);
assert('every heuristic day has at least one task', fallbackDays.every(d => d.tasks.length >= 1));
assert('every heuristic task has a unique id', (() => {
  const ids = fallbackDays.flatMap(d => d.tasks.map(t => t.id));
  return new Set(ids).size === ids.length;
})());

for (const [i, junk] of [null, {}, { days: 'nope' }, { days: [{ dayIndex: 2, tasks: [{ pillar: 'bogus', type: 'bogus' }] }] }].entries()) {
  const repaired = MP.repairDays(junk, fallbackDays, planOf([]), catalog);
  eq(`garbage day-chunk #${i} still fills every day`, repaired.length, 7);
  assert(`garbage day-chunk #${i} keeps every day populated`, repaired.every(d => d.tasks.length >= 1));
  assert(`garbage day-chunk #${i} emits only valid pillars`,
    repaired.every(d => d.tasks.every(t => ['prep', 'portfolio', 'progress', 'sat', 'rest'].includes(t.pillar))));
  assert(`garbage day-chunk #${i} keeps ids unique`, (() => {
    const ids = repaired.flatMap(d => d.tasks.map(t => t.id));
    return new Set(ids).size === ids.length;
  })());
}

// Every stored plan gets its links re-resolved on load, including ones generated before deep
// links existed.
const legacy = planOf([day(TODAY, [{ id: 'old1', pillar: 'prep', type: 'quiz', title: 'Do a quiz', detail: '', estMinutes: 20, done: false }])]);
const upgraded = MP.resolveAllTaskLinks(legacy, { specialty: 'exploring' }, {});
assert('a legacy task gains a resource kind', !!upgraded.days[0].tasks[0].resourceKind);
assert('a legacy task gains a real destination',
  MP.VALID_DESTINATIONS.has(`${upgraded.days[0].tasks[0].resourceTab}:${upgraded.days[0].tasks[0].resourceView}`));
assert('an already-resolved plan is returned unchanged (no render loop)',
  MP.resolveAllTaskLinks(upgraded, { specialty: 'exploring' }, {}) === upgraded);

// ── 6. Staleness and extension scheduling ───────────────────────────────────
section('The plan keeps itself current');

const snapUser = { goal: 'top_score', obstacles: ['busy'], specialty: 'physician', gradeStage: 'junior' };
const freshPlan = planOf([day(TODAY, [task()])], { profileSnapshot: null });
assert('a plan with no snapshot is never flagged stale', MP.planIsStale(freshPlan, snapUser) === false);
const stamped = { ...freshPlan, profileSnapshot: MP.buildProfileSnapshot(snapUser) };
assert('an unchanged profile is not stale', MP.planIsStale(stamped, snapUser) === false);
assert('a changed goal makes the plan stale', MP.planIsStale(stamped, { ...snapUser, goal: 'explore' }) === true);
assert('a changed pathway makes the plan stale', MP.planIsStale(stamped, { ...snapUser, specialty: 'nursing' }) === true);

// The window is today + tomorrow, rebuilt daily (see WINDOW_DAYS in masterPlanGenerator.js). All
// three staleness conditions matter, and the third is the one the old "days of runway" check could
// not express: a window that still reaches tomorrow but was WRITTEN on an earlier day is stale, no
// matter how much runway it has, because everything the student did since is missing from it.
eq('the detailed window is two days', MP.WINDOW_DAYS, 2);
assert('a plan whose window has run out asks to be rebuilt',
  MP.needsExtension(planOf([], { daysGeneratedThrough: TODAY, windowBuiltFor: TODAY })) === true);
assert('a window planned today, covering tomorrow, is current',
  MP.needsExtension(planOf([], { daysGeneratedThrough: TOMORROW, windowBuiltFor: TODAY })) === false);
assert('a window written on an earlier day is stale even with runway left',
  MP.needsExtension(planOf([], { daysGeneratedThrough: addDaysStr(TODAY, 12), windowBuiltFor: YESTERDAY })) === true,
  'a plan written yesterday is not a plan for today');
assert('a plan stored before windowBuiltFor existed refreshes once',
  MP.needsExtension(planOf([], { daysGeneratedThrough: addDaysStr(TODAY, 12) })) === true);
assert('a plan with no window never asks', MP.needsExtension({}) === false);
assert('the tab knows whether the window still covers today',
  MP.windowCoversToday(planOf([day(TODAY, [task()])])) === true
  && MP.windowCoversToday(planOf([day(YESTERDAY, [task()])])) === false);

// ── Locked lessons never reach the plan ─────────────────────────────────────
section('The plan only ever points at lessons the student can open');

// The pathway unlocks sequentially, so most of it is behind a padlock at any given moment. A task
// pointing there is a dead end the student pays for with their trust, so the unlock state has to
// survive all the way from App.jsx into the resolved link.
const lockedIndexBase = {
  quizzes: index.quizzes, decks: index.decks, articles: index.articles,
  allLessons: [
    { id: 'open1', title: 'Cells and Systems', unitTitle: 'Biology Foundations', state: 'available' },
    { id: 'doneL', title: 'Intro to Medicine', unitTitle: 'Biology Foundations', state: 'verified' },
    { id: 'lockL', title: 'Clinical Ethics', unitTitle: 'Advanced Practice', state: 'locked' },
  ],
  lessons: [{ id: 'open1', title: 'Cells and Systems', unitTitle: 'Biology Foundations' }],
  lessonStates: new Map([['open1', 'available'], ['doneL', 'verified'], ['lockL', 'locked']]),
};
const namedLocked = MP.resolveTaskResource({ type: 'lesson', resourceName: 'Clinical Ethics', title: 'Study ethics' }, lockedIndexBase, { seedKey: 'k' });
eq('a lesson task naming a LOCKED lesson is re-pointed at an open one', namedLocked.resourceId, 'open1');
const namedDone = MP.resolveTaskResource({ type: 'lesson', resourceName: 'Intro to Medicine', title: 'Study' }, lockedIndexBase, { seedKey: 'k' });
eq('a lesson task naming an already-finished lesson is re-pointed too', namedDone.resourceId, 'open1');
const namedOpen = MP.resolveTaskResource({ type: 'lesson', resourceName: 'Cells and Systems', title: 'Study' }, lockedIndexBase, { seedKey: 'k' });
eq('an open lesson named exactly is still honored', namedOpen.resourceId, 'open1');

// The catalog the model reads must say so too — telling it not to pick locked lessons is cheaper
// and more reliable than catching every bad pick afterwards.
const lockedState = { byLesson: {} };
const openCatalog = MP.buildResourceCatalog('exploring', 'junior', null);
assert('a catalog with no unlock data stays as it was', !/LOCKED/.test(openCatalog.text));
const explInfo = MP.classifyPathwayLessons('exploring', null);
assert('with no unlock data every lesson is treated as open', explInfo.open.length === explInfo.all.length);
for (const l of explInfo.all) lockedState.byLesson[l.id] = l.id === explInfo.all[0].id ? 'available' : 'locked';
const gatedCatalog = MP.buildResourceCatalog('exploring', 'junior', lockedState);
assert('the catalog marks locked units as locked', /LOCKED/.test(gatedCatalog.text));
assert('the catalog names the lessons the student can start now',
  /CAN ACTUALLY START RIGHT NOW/.test(gatedCatalog.text));
eq('the catalog exposes exactly the open lessons', gatedCatalog.openLessons.length, 1);

// A plan already written keeps itself true as the student's progress changes.
const stalePlan = planOf([day(TODAY, [task({ id: 's1', type: 'lesson', resourceKind: 'lesson', resourceId: 'lockL', title: 'Lesson: Clinical Ethics', detail: 'Clinical Ethics — Advanced Practice' })])]);
const noSignal = MP.retargetStaleTasks(stalePlan, { specialty: 'exploring' }, {});
assert('with no unlock data the plan is left completely alone', noSignal === stalePlan);
const realState = { byLesson: Object.fromEntries(MP.classifyPathwayLessons('exploring', null).all.map((l, i) => [l.id, i === 0 ? 'available' : 'locked'])) };
const firstOpen = MP.classifyPathwayLessons('exploring', realState).open[0];
const retargeted = MP.retargetStaleTasks(stalePlan, { specialty: 'exploring' }, { pathwayState: realState });
assert('a task pointing at a locked lesson is re-pointed', retargeted !== stalePlan);
eq('and it lands on a lesson the student can open', retargeted.days[0].tasks[0].resourceId, firstOpen.id);
assert('the swap is recorded so the UI can say it happened', !!retargeted.days[0].tasks[0].retargetedFrom);
assert('the task text is rewritten to match where it now goes',
  retargeted.days[0].tasks[0].detail.includes(firstOpen.title));
assert('re-running the adjustment changes nothing further',
  MP.retargetStaleTasks(retargeted, { specialty: 'exploring' }, { pathwayState: realState }) === retargeted,
  'a non-idempotent adjustment in a render effect is an infinite save loop');
assert('a task the student already finished is never re-pointed', (() => {
  const donePlan = planOf([day(TODAY, [task({ id: 'd1', type: 'lesson', resourceKind: 'lesson', resourceId: 'lockL', done: true })])]);
  return MP.retargetStaleTasks(donePlan, { specialty: 'exploring' }, { pathwayState: realState }) === donePlan;
})());
assert('elapsed days are never rewritten', (() => {
  const pastPlan = planOf([day(YESTERDAY, [task({ id: 'p1', type: 'lesson', resourceKind: 'lesson', resourceId: 'lockL' })])]);
  return MP.retargetStaleTasks(pastPlan, { specialty: 'exploring' }, { pathwayState: realState }) === pastPlan;
})());

// App.jsx has to actually compute and hand over that unlock state, or every guard above is dead
// code protecting a signal nobody sends.
assert('App computes the pathway unlock state from the same helper the Pathway tab renders from',
  /pathwayState=\{[\s\S]{0,240}lessonState\(l,ui,planUnits\)/.test(appSrc),
  'liveSignals.pathwayState must be derived from lessonState');
assert('App passes the unlock state to the planner', /^\s*pathwayState,$/m.test(appSrc));
assert('PlansTab re-points stale tasks as progress changes', /retargetStaleTasks\(plan, user, liveSignals/.test(plansSrc));

// ── Generation is honest about failing ──────────────────────────────────────
section('A fallback plan is never passed off as a real one');

// This is the whole bug the two-day rewrite came from: every generation path resolves to a usable
// plan, so a rate-limited or timed-out build produced the deterministic heuristic days and looked
// exactly like success. The trace is what makes that visible.
const trace = MP.createGenerationTrace();
assert('a fresh trace starts clean', trace.fallbacks === 0 && trace.aiCalls === 0);
const genSrcNow = read('src/lib/masterPlanGenerator.js');
assert('generation retries rather than falling back on the first failure',
  /ORACLE_ATTEMPTS/.test(genSrcNow) && /ORACLE_BACKOFF_MS/.test(genSrcNow));
assert('a rate limit is waited out, not instantly retried into the same wall',
  /result\.waitMs/.test(genSrcNow));
assert('every generation stamps how it went onto the plan', /generation: summarizeTrace\(trace\)/.test(genSrcNow));
assert('the UI tells the student when part of their plan is the fallback',
  /generation\?\.degraded/.test(plansSrc) && /function DegradedBanner/.test(plansSrc));
assert('placeholder-level output counts as a failure, not a success',
  /daysLookGeneric/.test(genSrcNow),
  'a parseable response full of "SAT practice set" is the bug, not a plan');

// The server has to give a plan build room to make several calls in a row, or it rate-limits its
// own most important feature and every call after the first falls back.
assert('rate limits are scoped per purpose, not one bucket for the whole app',
  /MINUTE_LIMIT_BY_PURPOSE/.test(groqSrc) && /bucketKey\(subject, purpose\)/.test(groqSrc));
// ── And per STUDENT, not per IP ─────────────────────────────────────────────
// The per-purpose split above stops a plan build from exhausting the coach's budget. It does
// nothing about the other half of the same bug: a budget keyed on the client IP is shared by
// every student behind one school's NAT, so the eighth roadmap build on that network exhausted
// the day for everyone on it and the server answered code:'daily_limit' — telling a student who
// had never built one that they had used up their builds. `subjectFor` is what fixed that, and
// the per-network ceiling is what keeps a client-supplied identity from being a way around your
// own limit. Both are load-bearing; neither is meaningful without the other.
assert('a budget is charged to the student when one identifies itself',
  /function subjectFor\(ip, lane\)/.test(groqSrc) && /lane \? `u:\$\{lane\}` : `ip:\$\{ip\}`/.test(groqSrc),
  'per-IP budgets are shared by every student behind one school network');
assert('and a network ceiling still backstops a forged identity',
  /IP_CEILING_MINUTE_FACTOR/.test(groqSrc) && /IP_CEILING_DAILY_FACTOR/.test(groqSrc)
  && /shared_network_limit/.test(groqSrc),
  'without a ceiling, minting a fresh lane per request escapes the limit entirely');
assert('a network ceiling reports itself as a network ceiling, not as the student\'s own limit',
  /shared_network_limit/.test(groqSrc) && !/code: 'daily_limit'[^}]*network/i.test(groqSrc));
assert('plan generation gets a minute budget larger than a chat turn\'s', (() => {
  const m = groqSrc.match(/MINUTE_LIMIT_BY_PURPOSE = \{[^}]*masterplan:\s*(\d+)/);
  const base = groqSrc.match(/const MINUTE_LIMIT = (\d+)/);
  return !!m && !!base && Number(m[1]) > Number(base[1]) * 2;
})(), 'one plan build is several sequential Oracle calls');
assert('a 429 tells the caller how long to wait', /retryAfterMs/.test(groqSrc));
assert('plan generation is never served from the response cache',
  /NEVER_CACHED_PURPOSES/.test(groqSrc),
  'a cached plan makes "regenerate" hand back the identical plan');
// The daily refresh is now driven from two places (App-wide, and PlansTab while it is open), so
// the generator has to tolerate both asking at once — and it must never hand a student back an
// unfinished copy of something they already completed today.
assert('a concurrent refresh reuses the in-flight one rather than generating twice',
  /inFlightRefresh/.test(genSrcNow));
assert('a refresh keeps work already completed today', /doneKeys/.test(genSrcNow),
  'finishing a task and watching it reappear unfinished is how a student stops trusting the plan');
assert('the app refreshes the window app-wide, not only on the Plans tab',
  /needsPlanExtension\(plan\)/.test(appSrc) && /refreshPlanWindow\(plan/.test(appSrc),
  "Home's today card reads the same window the Plans tab does");
assert('both refresh callers read the same Portfolio list',
  /fetchPortfolio as fetchPlanPortfolio/.test(appSrc) && /export async function fetchPortfolio/.test(plansSrc));

assert('the output ceiling leaves room for the reasoning pass', (() => {
  const m = groqSrc.match(/MAX_OUTPUT_TOKENS_BY_PURPOSE = \{[^}]*masterplan:\s*(\d+)/);
  return !!m && Number(m[1]) >= 12000;
})(), 'reasoning tokens are billed against max_tokens, and a truncated response silently falls back');

// The rolling extension must read the Portfolio too, or the plan gets less personal over time.
assert('the auto-extension reads the Portfolio before generating',
  /ensurePortfolio\(\)\s*\n\s*\.then\(portfolio => extendMasterPlan\(/.test(plansSrc),
  'extendMasterPlan must be called with a portfolio');
assert('the first build waits for the full Portfolio read',
  /const portfolio = await ensurePortfolio\(\);\s*\n\s*const built = await createMasterPlan/.test(plansSrc));

// ── 7. Database integration ─────────────────────────────────────────────────
section('The plan is durably stored');

const storeSrc = read('src/lib/masterPlanStore.js');
const apiSrc = read('api/master-plan.js');
const migration = read('supabase/migrations/0005_master_plans.sql');

assert('the plan table cascades on account deletion',
  /references app_users\(id\) on delete cascade/.test(migration),
  'a deleted account must not leave plan rows behind');
assert('row level security is enabled on both plan tables',
  (migration.match(/enable row level security/g) || []).length >= 2);
assert('saving is a single atomic function', /create or replace function save_master_plan/.test(migration));
assert('conflicts resolve on the plan\'s own timestamp, not arrival order',
  /p_client_updated_at < existing\.client_updated_at/.test(migration));
assert('the row is locked for the whole save', /for update/.test(migration));
assert('history is trimmed so it cannot grow without bound', /MAX_REVISIONS/.test(migration));
assert('identical plans are not archived', /existing\.plan is distinct from p_plan/.test(migration));

// requireStudent both authenticates and rejects parent accounts, and sends the response itself —
// so the handler's obligation is to stop, not to build a 401 of its own. A plan is one student's
// own work; a parent account writing one under its own id would be nonsense data in a table that
// only students read. See api/_lib/session.js and scripts/verifyParentDashboard.mjs.
assert('the endpoint requires a student session',
  /const user = await requireStudent\(req, res\);\s*\n\s*if \(!user\) return;/.test(apiSrc));
assert('the endpoint caps the payload', /MAX_BYTES/.test(apiSrc) && /413/.test(apiSrc));
assert('the endpoint rejects a plan with no days', /Plan is missing its days/.test(apiSrc));
assert('an un-migrated deployment degrades instead of erroring', /isMissingSchema/.test(apiSrc));

// The self-hosted Express server recreates Vercel's file-system routing by hand, so a new
// endpoint that works on Vercel can 404 everywhere else unless it is registered there too.
const serverSrc = read('server.js');
assert('the self-hosted server registers /api/master-plan', /app\.all\('\/api\/master-plan'/.test(serverSrc));
assert('the body parser is larger than the endpoint\'s own payload cap', (() => {
  const limit = serverSrc.match(/express\.json\(\{ limit: '(\d+)mb' \}\)/);
  return !!limit && Number(limit[1]) >= 2;
})(), 'a parser limit below MAX_BYTES rejects legal plans before the handler sees them');
assert('a deleted plan is cleared server-side too, not just locally',
  /PlanStore\.deleteStoredPlan\(\)/.test(appSrc) && /masterPlan:null/.test(appSrc));
assert('the data export includes the plan tables',
  /master_plans', 'master_plan_revisions'/.test(read('api/auth/account.js')),
  'a plan the student can see must appear in their data export');

assert('the client never lets a sync failure surface as a broken plan',
  /catch \{\s*\n\s*return null;/.test(storeSrc));
assert('the client only adopts a strictly newer remote plan', /export function isRemoteNewer/.test(storeSrc));
assert('sign-out clears the previous account\'s plan state', /export function resetPlanStore/.test(storeSrc));
assert('App wires plan pushes into the single save choke point',
  /if\(u\?\.masterPlan\)PlanStore\.schedulePlanPush\(u\.masterPlan\);/.test(appSrc));
assert('App resets the plan store on sign-out', /PlanStore\.resetPlanStore\(\)/.test(appSrc));

// isRemoteNewer is the whole safety argument for the pull — test it directly.
assert('a newer remote plan is adopted', MP_isNewer({ updatedAt: 200 }, { updatedAt: 100 }) === true);
assert('an older remote plan is refused', MP_isNewer({ updatedAt: 50 }, { updatedAt: 100 }) === false);
assert('an equal remote plan is refused (no pointless churn)', MP_isNewer({ updatedAt: 100 }, { updatedAt: 100 }) === false);
assert('a remote plan with no local counterpart is adopted', MP_isNewer({ updatedAt: 1 }, null) === true);
assert('a missing remote plan is never adopted', MP_isNewer(null, { updatedAt: 1 }) === false);
assert('an unstamped remote plan never beats a stamped local one', MP_isNewer({}, { updatedAt: 1 }) === false);

// masterPlanStore imports authApi (which reaches for browser storage), so the predicate is
// re-derived here from the same source rather than importing the module into Node.
function MP_isNewer(remote, local) {
  const stamp = (p) => { const v = Number(p?.updatedAt); return Number.isFinite(v) ? Math.trunc(v) : 0; };
  if (!remote) return false;
  if (!local) return true;
  return stamp(remote) > stamp(local);
}

// ── Report ──────────────────────────────────────────────────────────────────
console.log('');
if (failures.length) {
  console.error(`✗ ${failures.length} master-plan assertion${failures.length === 1 ? '' : 's'} failed (${passed} passed):\n`);
  for (const f of failures) console.error(`  • ${f}`);
  process.exit(1);
}
console.log(`✓ master plan verified — ${passed} assertions passed`);
