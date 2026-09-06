// ─────────────────────────────────────────────────────────────────────────────
// Modes, context and equity verification.
//
// Three claims this checks, each of which is easy to break by accident and
// impossible to notice by looking at the screen:
//
//   1. THE MODES EXIST AND DIFFER. Six named modes is a menu; six named modes
//      that all produce identical behavior is a menu that lies. The test asserts
//      each one carries its own prompt block, and specifically that essay mode
//      is less generative than concept mode — the difference the whole design
//      rests on.
//   2. THE COACH IS ACTUALLY HANDED THE STUDENT. A coach that can say "your last
//      two attempts on inheritance patterns went 72% then 65%" is a different
//      product from one that answers whatever gets typed at it, and the only
//      thing separating them is whether those rows reached the prompt. The
//      context builders are exercised against realistic fixtures, and the number
//      that comes out has to be the number that went in.
//   3. THE EQUITY SHELF IS PRESENT AND SURFACED. A student with a physician
//      parent arrives knowing which questions to ask. These are those questions,
//      and they are worth nothing sitting in a constant nothing renders.
//
// Run: node scripts/verifyMedabrainModes.mjs
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MEDABRAIN_MODES, MODE_BY_ID, FREE_MODE, modeById, buildModeBlock,
  EQUITY_STARTERS, equityStarters,
} from '../src/lib/medabrainModes.js';
import {
  summarizeQuizTopics, summarizeHoursByCategory, summarizeSavedPrograms,
  summarizeWeeklyGoal, summarizeDeadlines, buildDeepContextBlock,
} from '../src/lib/coachContext.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const ok = (cond, msg) => { if (!cond) failures.push(msg); };
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ── 1. The six modes ─────────────────────────────────────────────────────────
// Named in the product requirement. Missing one is a front door with a room
// behind it nobody can reach.
const REQUIRED = {
  explain: /explain this differently/i,
  quiz: /quiz me/i,
  plan_week: /plan my week/i,
  essay: /essay/i,
  opportunities: /find opportunities/i,
  career: /career/i,
};
for (const [id, labelRe] of Object.entries(REQUIRED)) {
  const mode = MODE_BY_ID[id];
  ok(mode, `Mode "${id}" is missing.`);
  ok(mode && labelRe.test(mode.label), `Mode "${id}" has an unexpected label: ${mode?.label}`);
}
ok(MEDABRAIN_MODES.length >= 6, 'There must be at least the six named modes.');

const seenLabels = new Set();
const seenBlocks = new Set();
for (const mode of MEDABRAIN_MODES) {
  ok(!!mode.id && !!mode.label, `A mode is missing an id or label: ${JSON.stringify(mode.id)}`);
  ok(!seenLabels.has(mode.label), `Duplicate mode label: ${mode.label}`);
  seenLabels.add(mode.label);
  ok(!!mode.blurb, `Mode "${mode.id}" has no blurb — the blurb is what tells a student what it is for.`);
  ok(!!mode.placeholder, `Mode "${mode.id}" has no composer placeholder.`);
  // The whole point: a mode is different BEHAVIOR, not a different label.
  ok(mode.promptBlock && mode.promptBlock.trim().length > 200,
    `Mode "${mode.id}" has no substantial prompt block — a mode that does not change behavior is a label on a button.`);
  ok(!seenBlocks.has(mode.promptBlock),
    `Mode "${mode.id}" shares a prompt block with another mode — they must actually differ.`);
  seenBlocks.add(mode.promptBlock);
  ok(Array.isArray(mode.starters) && mode.starters.length >= 3,
    `Mode "${mode.id}" needs at least three starter prompts — an empty box is the problem modes exist to solve.`);
  ok(['open', 'none'].includes(mode.generative), `Mode "${mode.id}" must declare a generative posture.`);
  ok(['coach', 'essaycoach'].includes(mode.purpose), `Mode "${mode.id}" has an unroutable purpose: ${mode.purpose}`);
}

// Essay mode must be the tuned-down one. This is the specific asymmetry the
// requirement calls for, and asserting it means a future edit that makes essay
// mode "more helpful" fails the build instead of quietly shipping.
ok(MODE_BY_ID.essay.generative === 'none', 'Essay mode must be non-generative.');
ok(MODE_BY_ID.explain.generative === 'open', 'Concept-explanation mode must remain freely generative.');
ok(MODE_BY_ID.essay.purpose === 'essaycoach', 'Essay mode must route through the guarded purpose.');
ok(MODE_BY_ID.explain.purpose === 'coach', 'Concept mode should use the head-coach key pool.');
const essayBlock = MODE_BY_ID.essay.promptBlock;
ok(/question/i.test(essayBlock), 'Essay mode must be Socratic — questions are its default move.');
ok((essayBlock.match(/question/gi) || []).length > (MODE_BY_ID.explain.promptBlock.match(/question/gi) || []).length,
  'Essay mode must be meaningfully MORE Socratic than concept mode, not merely as Socratic.');

// The default is still an open box: modes are a front door, not a cage.
ok(modeById('free').id === 'free' && FREE_MODE.promptBlock === '', 'A free-chat mode with no prompt block must remain available.');
ok(modeById('nonsense').id === 'free', 'An unknown mode id must fall back to free chat rather than throwing.');
ok(buildModeBlock('free') === '', 'Free chat must add nothing to the prompt.');
for (const mode of MEDABRAIN_MODES) {
  const block = buildModeBlock(mode.id);
  ok(block.includes(mode.promptBlock), `buildModeBlock lost mode "${mode.id}"'s instructions.`);
  ok(/NOT a fence/i.test(block),
    `Mode "${mode.id}" must be told a mode narrows behavior and never narrows knowledge — the app has shipped "only discuss X" prompts before and they produced a coach that refused everything.`);
}

// ── 2. The equity shelf ──────────────────────────────────────────────────────
ok(EQUITY_STARTERS.length >= 8, 'The equity shelf needs enough entries to rotate meaningfully.');
// The three named in the requirement, present verbatim in substance.
for (const re of [/bs\/md/i, /nursing school admission/i, /shadowing if I do not know any doctors/i]) {
  ok(EQUITY_STARTERS.some(s => re.test(s)), `The equity shelf is missing an entry matching ${re}.`);
}
for (const s of EQUITY_STARTERS) {
  ok(/^ask me /i.test(s),
    `Equity starters must be phrased as the student's own invitation so tapping one is not an admission of anything: ${JSON.stringify(s)}`);
}
ok(new Set(EQUITY_STARTERS).size === EQUITY_STARTERS.length, 'Equity starters must be unique.');
ok(equityStarters(3, 0).length === 3, 'equityStarters must return the requested count.');
ok(equityStarters(3, 0).join('|') === equityStarters(3, 0).join('|'), 'The same seed must produce the same set — a list that reshuffles is a list nobody reads.');
ok(equityStarters(3, 0).join('|') !== equityStarters(3, 4).join('|'), 'Different seeds must produce different sets.');
ok(equityStarters(99, 3).length === EQUITY_STARTERS.length, 'Asking for more than exist must return all of them, not undefined entries.');
ok(new Set(equityStarters(5, 7)).size === 5, 'A rotated window must not repeat an entry.');

// ── 3. The deep context ──────────────────────────────────────────────────────
// The scenario from the requirement, as a fixture: two genetics attempts, both
// down. The coach must be able to say so.
const quizzes = [
  { id: 'bb04', cat: 'Life Sciences', title: 'Molecular Biology & Genetics' },
  { id: 'bb01', cat: 'Life Sciences', title: 'Enzyme Kinetics & Michaelis-Menten' },
];
const history = [
  { quizId: 'bb04', score: 80, completedAt: 1000 },
  { quizId: 'bb04', score: 72, completedAt: 2000 },
  { quizId: 'bb04', score: 61, completedAt: 3000 },
  { quizId: 'bb01', score: 90, completedAt: 1500 },
];
const quizSummary = summarizeQuizTopics(history, quizzes);
ok(quizSummary, 'A student with quiz history must produce a topic summary.');
ok(/Molecular Biology & Genetics/.test(quizSummary), 'The summary must name the TOPIC, not just the category.');
ok(/61%/.test(quizSummary) && /72%/.test(quizSummary), 'The summary must carry the real scores, in order.');
ok(/SLIPPING/.test(quizSummary), 'A falling run must be labelled as falling — that is the sentence the coach opens with.');
ok(/gone DOWN/.test(quizSummary), 'The summary must tell the model to raise a slipping topic directly.');
// A flat run must NOT be reported as a decline: quiz scores are coarse and a
// one-question difference is not a trend.
const flat = summarizeQuizTopics(
  [{ quizId: 'bb01', score: 80, completedAt: 1 }, { quizId: 'bb01', score: 76, completedAt: 2 }], quizzes);
ok(!/SLIPPING/.test(flat), 'A four-point move must not be reported as a decline — a coach confidently wrong about somebody\'s week is worse than a silent one.');
ok(summarizeQuizTopics([], quizzes) === null, 'No history must produce no summary, not an empty heading.');
ok(summarizeQuizTopics(history, []) === null, 'No quiz catalog must produce no summary.');

const hours = summarizeHoursByCategory({
  clinicalHours: [{ site_type: 'Hospital', hours: 40 }, { site_type: 'Clinic', hours: 12 }],
  activities: [{ activity_type: 'Volunteer', hours_per_week: 2, weeks_per_year: 30 }],
  research: [{ hours: 8 }],
});
ok(/Hospital/.test(hours) && /40h/.test(hours), 'Hours must be split by category with real numbers.');
ok(/Research/.test(hours), 'Research hours must appear.');
ok(summarizeHoursByCategory({}) === null, 'A student with nothing logged must produce no hours block.');
const concentrated = summarizeHoursByCategory({ clinicalHours: [{ site_type: 'Hospital', hours: 200 }], activities: [{ activity_type: 'Club', hours_per_week: 1, weeks_per_year: 4 }] });
ok(/specialization/i.test(concentrated), 'A concentrated record must be named as depth rather than as a gap.');

const programs = summarizeSavedPrograms([
  { name: 'Summer Health Scholars', stageLabel: 'Researching', deadline: '2027-02-01' },
  { name: 'Local Hospital Volunteer Program', stageLabel: 'Applied', stale: true },
]);
ok(/Summer Health Scholars/.test(programs), 'Saved programs must be named.');
ok(/statement of intent/i.test(programs), 'Saved programs must be framed as the intent signal they are.');
ok(/weeks without any movement/i.test(programs), 'A stale saved program must be flagged once.');
ok(/have not saved any/i.test(summarizeSavedPrograms([])), 'An empty saved list must say so rather than being omitted silently.');

const goal = summarizeWeeklyGoal([{ label: 'Clinical hours', unit: 'hrs', target: 6, current: 1 }], { daysLeft: 3 });
ok(/6/.test(goal) && /1/.test(goal), 'The weekly goal must carry both the target and the real progress.');
ok(/offer to lower it/i.test(goal),
  'The weekly-goal block must license lowering the target — that offer is the concrete move the academic-stress tier makes.');
ok(/3 day/.test(goal), 'Days left in the week must be stated when known.');
ok(/have not set a weekly goal/i.test(summarizeWeeklyGoal([])), 'No goal must produce an honest "none set" line.');

const soon = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
const past = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
const deadlines = summarizeDeadlines([
  { title: 'QuestBridge application', due_date: soon, kind: 'application' },
  { title: 'Something already gone', due_date: past, kind: 'application' },
]);
ok(/QuestBridge application/.test(deadlines), 'Upcoming deadlines must be listed by name.');
ok(!/already gone/.test(deadlines), 'Past deadlines must be dropped, not counted down from.');
ok(/never invent one/i.test(deadlines), 'The deadline block must forbid inventing a date.');
ok(summarizeDeadlines([]) === null, 'No deadlines must produce no block.');

// Assembly: a brand-new student produces nothing at all, which is correct — a
// coach reciting everything a student has not done is worse than one that asks.
ok(buildDeepContextBlock({}) === '', 'An empty profile must produce an empty context block.');
const assembled = buildDeepContextBlock({ quizTopics: quizSummary, weeklyGoal: goal, deadlines });
ok(/ACTUALLY BEEN DOING/.test(assembled), 'The assembled block must be headed so the model can tell it from advice.');
ok(/Never state a number that is not here/i.test(assembled),
  'The assembled block must forbid inventing numbers — this is the block most likely to be embellished.');
ok(assembled.includes(quizSummary) && assembled.includes(goal), 'Assembly must not drop any block it was handed.');

// ── 4. Wiring ────────────────────────────────────────────────────────────────
const appSrc = read('src/App.jsx');
ok(/buildModeBlock\(coachMode\)/.test(appSrc), 'App.jsx must pass the chosen mode into the system prompt.');
ok(/deepContext:coachDeepContext/.test(appSrc), 'App.jsx must pass the deep context into the system prompt.');
ok(/function ModePicker/.test(appSrc), 'App.jsx must render a mode picker.');
ok(/<ModePicker/.test(appSrc), 'The mode picker must actually be mounted.');
ok(/equityStarters\(/.test(appSrc), 'The equity shelf must be surfaced in the chat, not just defined.');
ok(/mode\.tier\|\|/.test(appSrc), 'A mode must be able to pin its model tier.');
ok(/mode\.purpose/.test(appSrc), "A mode's purpose must reach the request, or essay mode loses its server-side guard.");
ok(/summarizeQuizTopics\(/.test(appSrc) && /summarizeSavedPrograms\(/.test(appSrc) && /summarizeWeeklyGoal\(/.test(appSrc),
  'App.jsx must build the deep context from the real rows.');

const profileSrc = read('src/lib/studentProfile.js');
ok(/deepContext = null/.test(profileSrc), 'buildCoachSystemPrompt must accept the deep context.');
ok(/modeBlock = ''/.test(profileSrc), 'buildCoachSystemPrompt must accept the mode block.');
ok(/\(deepContext \|\| ''\)/.test(profileSrc), 'The deep context must actually be concatenated into the prompt.');
ok(/modeBlock \?/.test(profileSrc), 'The mode block must actually be concatenated into the prompt.');

// ── Report ───────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error(`\n✗ Modes/context verification failed — ${failures.length} problem(s):\n`);
  for (const f of failures) console.error(`  • ${f}`);
  console.error('');
  process.exit(1);
}
console.log(`✓ Medabrain modes verified — ${MEDABRAIN_MODES.length} distinct modes with their own behavior, ${EQUITY_STARTERS.length} equity starters surfaced, and five deep-context builders producing real numbers.`);
