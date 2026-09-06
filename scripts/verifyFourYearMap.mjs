#!/usr/bin/env node
/**
 * Guards the four-year map, the foundations tier, the course planner and the
 * certification module — the promises in each that are easy to break silently.
 *
 *   1. NO YEAR IS EMPTY. The whole feature exists so a student's own year is
 *      never a blank list. An earlier draft placed each unit in the earliest
 *      grade it was tagged for, which left Year 4 empty on all ten pathways —
 *      i.e. it shipped the exact bug it was written to prevent, for seniors.
 *   2. PREVIEW IS NOT A LOCK. `tierState` returns exactly three values and the
 *      rail component contains no lock/disable vocabulary. Grade band changes
 *      emphasis and never access (see lib/gradeBand.js); the likeliest way to
 *      break that here is a well-meaning future edit adding a padlock glyph to
 *      "clarify" the preview state.
 *   3. THE TIER IS OPEN AND SHARED. The foundations units carry `openAlways`,
 *      are appended (never prepended, which would renumber every existing
 *      unit's gate), and appear on all ten pathways with one id space.
 *   4. CONTENT EXISTS. Every foundations lesson has an article, and every quiz
 *      it names is real — a lesson pointing at a missing quiz id can never be
 *      completed, and nothing else in the build catches it.
 *   5. THE PLANNER FEEDS THE CALCULATOR. rigorFromPlan() produces exactly the
 *      shape scoreRigor() reads, and the two agree on the weighted total. Two
 *      screens disagreeing about a student's rigor is worse than one screen.
 *   6. THE CERTIFICATION MODULE STAYS HONEST. The EMT age gate is stated, the
 *      module hardcodes no numbers of its own, and every credential it teaches
 *      is a real record in the verified database.
 *
 * Run by `npm run verify:four-year-map` (and by `npm run build`).
 */

import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

register('./_appResolve.mjs', import.meta.url);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const load = (p) => import(pathToFileURL(path.join(ROOT, p)).href);

let failures = 0;
const fail = (msg) => { failures += 1; console.error(`  ✗ ${msg}`); };
const ok = (msg) => console.log(`  ✓ ${msg}`);
const section = (name) => console.log(`\n${name}`);

const { PATHS } = await load('src/data/constants.js');
const { FOUNDATION_UNITS, FOUNDATION_LESSON_IDS, isFoundationUnit } = await load('src/data/foundationUnits.js');
const { LESSON_CONTENT } = await load('src/data/lessonContent/index.js');
const map = await load('src/lib/fourYearMap.js');
const planner = await load('src/lib/coursePlanner.js');
const guide = await load('src/lib/certificationGuide.js');
const { scoreRigor } = await load('src/lib/admissions/academicFit.js');
const { getCredential } = await load('src/data/credentials/index.js');

const ALL_QUIZZES = (await Promise.all([
  'bioBiochem', 'chemPhys', 'psychSoc', 'lessonQuizzes',
].map((f) => load(`src/data/quizzes/${f}.js`)))).flatMap((mod) => Object.values(mod)[0]);
const QUIZ_IDS = new Set(ALL_QUIZZES.map((q) => q.id));

const PATH_KEYS = Object.keys(PATHS);

// ── 1. No year is empty, on any pathway ─────────────────────────────────────
section('Every year has content on every pathway');

let before = failures;
for (const key of PATH_KEYS) {
  const m = map.buildFourYearMap(PATHS[key].units, { pathwayKey: key, gradeStage: 'senior', isDone: () => false });
  const empty = m.tiers.filter((t) => t.empty).map((t) => t.id);
  if (empty.length) fail(`${key}: ${empty.join(', ')} would render as an empty shelf`);
}
if (failures === before) ok(`all five shelves carry units on all ${PATH_KEYS.length} pathways`);

// A student in every grade lands on their own year, never on year one by default.
for (const grade of ['freshman', 'sophomore', 'junior', 'senior', 'gap']) {
  const m = map.buildFourYearMap(PATHS.physician.units, { gradeStage: grade, isDone: () => false });
  const expected = map.tierOfGrade(grade);
  if (m.defaultTier !== expected) fail(`a ${grade} opens on ${m.defaultTier}, not their own year (${expected})`);
  if (m.byId[expected]?.state !== 'active') fail(`a ${grade}'s own year reads as ${m.byId[expected]?.state}, not active`);
}
ok('every grade opens on its own year, and that year reads as active');

// An account with no graduation year gets the whole app, per the gradeBand rule.
{
  const m = map.buildFourYearMap(PATHS.nursing.units, { gradeStage: null, isDone: () => false });
  const notActive = m.tiers.filter((t) => t.state !== 'active');
  if (notActive.length) fail(`with no grade on file, ${notActive.map((t) => t.id).join(', ')} is not active`);
  else ok('an account with no grade on file sees every year as active');
}

// ── 2. Preview is not a lock ────────────────────────────────────────────────
section('Preview is emphasis, not access');

const STATES = new Set(['past', 'active', 'preview']);
for (const tier of map.TIER_IDS) {
  for (const current of [...map.TIER_IDS, null]) {
    const s = map.tierState(tier, current);
    if (!STATES.has(s)) fail(`tierState(${tier}, ${current}) returned "${s}" — only past/active/preview may exist`);
  }
}
ok('tierState only ever returns past, active or preview');

if (map.tierState(map.FOUNDATION_TIER.id, 'y12') !== 'active') {
  fail('the foundations tier is not active for a senior — it must be active in every year');
} else ok('the foundations tier is active in every year');

// Comments are stripped first: the header of that file EXPLAINS the ban, and a
// scan that flagged its own rationale would be a check nobody could keep green.
const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

let railBefore;
const railSource = stripComments(read('src/components/prep/FourYearMap.jsx'));
railBefore = failures;
for (const word of ['Lock', 'locked', 'disabled', 'unlock', 'padlock']) {
  if (new RegExp(`\\b${word}\\b`).test(railSource)) {
    fail(`FourYearMap.jsx contains "${word}" outside its comments — a later year is browsable, and the rail must not say otherwise`);
  }
}
for (const phrase of ['not available', 'coming in', 'come back to this']) {
  if (railSource.toLowerCase().includes(phrase)) fail(`FourYearMap.jsx says "${phrase}", which reads as a closed door`);
}
if (failures === railBefore) ok('the rail contains no lock, disable or unavailable vocabulary');

for (const tierId of ['y9', 'y12']) {
  const t = map.TIER_BY_ID[tierId];
  for (const state of ['past', 'preview']) {
    const text = map.tierBannerText(t, state);
    if (!text || text.length < 20) fail(`${tierId}/${state} has no banner sentence`);
    if (/lock|unavailable|not yet|can'?t/i.test(text)) fail(`${tierId}/${state} banner reads as a closed door: "${text}"`);
  }
}
ok('every non-active banner invites the student in rather than turning them away');

// ── 3. The foundations tier ─────────────────────────────────────────────────
section('The foundations tier is open, appended, and on every pathway');

before = failures;
for (const key of PATH_KEYS) {
  const units = PATHS[key].units;
  const foundation = units.filter(isFoundationUnit);
  if (foundation.length !== FOUNDATION_UNITS.length) {
    fail(`${key}: carries ${foundation.length} foundations units, expected ${FOUNDATION_UNITS.length}`);
    continue;
  }
  // Appended, not prepended: every foundations unit sits after every year unit,
  // so no existing unit's index — and therefore no existing student's gate —
  // moved when the tier was added.
  const firstFoundationIdx = units.findIndex(isFoundationUnit);
  const lastYearIdx = units.map(isFoundationUnit).lastIndexOf(false);
  if (firstFoundationIdx < lastYearIdx) fail(`${key}: a foundations unit sits before a year unit, which renumbers existing units' gates`);
  for (const u of foundation) {
    if (!u.openAlways) fail(`${key}: foundations unit ${u.id} is missing openAlways and would sit behind the sequential gate`);
  }
}
if (failures === before) ok(`both foundations units are appended to all ${PATH_KEYS.length} pathways, open from the start`);

// One id space: the same lesson on every track, so finishing it once finishes it.
{
  const perPath = PATH_KEYS.map((k) => PATHS[k].units.filter(isFoundationUnit).flatMap((u) => u.lessons.map((l) => l.id)).join(','));
  if (new Set(perPath).size !== 1) fail('the foundations lesson ids differ between pathways — progress would not be shared');
  else ok('every pathway carries the identical foundations lesson ids, so progress is shared');
}

// App.jsx has to honour openAlways, or the tier is gated after all.
const app = read('src/App.jsx');
{
  if (!app.includes('units[ui]?.openAlways')) fail('lessonState() in App.jsx does not exempt openAlways units from the sequential gate');
  else ok('lessonState() exempts the foundations tier from the sequential gate');
}

// ── The cost of sharing one id space across ten pathways ────────────────────
// The cross-pathway lesson total flattens every unit of every track. The shared
// tier is nine lessons that appear on all ten, so a naive flatten counts eighty
// -one lessons that do not exist and prints them on the Home tile. This is the
// only place in the app where a lesson id is legitimately reachable twice, so
// it is the only place that has to de-duplicate — and the failure is silent,
// which is what puts it in a verify script rather than in a comment.
{
  const dedupes = /const allL\s*=\s*\[\.\.\.new Map\(/.test(app);
  if (!dedupes) {
    fail('App.jsx builds the cross-pathway lesson list without de-duplicating by id — the shared foundations lessons would be counted once per pathway');
  } else ok('the cross-pathway lesson total counts each shared lesson once');
}

// ── The two tools stay out of the first-load bundle ─────────────────────────
// Both are one tool under one unit behind a closed door. Statically imported
// they land in the entry graph that scripts/verifyPayload.mjs budgets, paid by
// every student on every boot including the ones who never open the tier. The
// regression is invisible — the app looks identical and the number moves — so
// it is asserted rather than trusted.
{
  before = failures;
  for (const [name, file] of [['CoursePlannerPanel', 'prep/CoursePlannerPanel'], ['CertificationExplorer', 'prep/CertificationExplorer']]) {
    const lazy = new RegExp(`const ${name}\\s*=\\s*React\\.lazy\\(\\s*\\(\\)\\s*=>\\s*import\\('\\./components/${file}'\\)`);
    const staticImport = new RegExp(`^import ${name} from`, 'm');
    if (staticImport.test(app)) fail(`${name} is statically imported into App.jsx — it belongs behind React.lazy, off the boot path`);
    else if (!lazy.test(app)) fail(`${name} is no longer lazily imported in App.jsx`);
  }
  // coursePlanner.js carries the course catalog and the gap rules; importing it
  // on boot for one helper would pull all of that back in behind the panel's
  // own split and quietly cancel it.
  if (/^import \{[^}]*\bemptyPlan\b[^}]*\} from '\.\/lib\/coursePlanner'/m.test(app)) {
    fail('App.jsx imports coursePlanner.js eagerly, which pulls the course catalog back into the entry graph');
  }
  if (failures === before) ok('both foundations tools, and the planner engine, stay out of the first-load bundle');
}

// ── 4. The content is real ──────────────────────────────────────────────────
section('Every foundations lesson has an article and a working quiz');

before = failures;
for (const unit of FOUNDATION_UNITS) {
  for (const lesson of unit.lessons) {
    const content = LESSON_CONTENT[lesson.id];
    if (!content?.article?.sections?.length) { fail(`${lesson.id}: no article content`); continue; }
    if (content.article.sections.some((s) => !s.heading || !s.body)) fail(`${lesson.id}: a section is missing its heading or body`);
    if (!content.article.keyTakeaways?.length) fail(`${lesson.id}: no key takeaways`);
    if (!lesson.objectives?.length) fail(`${lesson.id}: no objectives`);
    for (const q of lesson.quizIds || []) {
      if (!QUIZ_IDS.has(q)) fail(`${lesson.id}: names quiz "${q}", which does not exist — the lesson could never be verified`);
    }
    if (!lesson.quizIds?.length) fail(`${lesson.id}: no verification quiz`);
  }
}
if (failures === before) ok(`${FOUNDATION_LESSON_IDS.length} lessons, each with an article, takeaways, objectives and a real quiz`);

// The two claims this unit exists to make, asserted so a future copy edit cannot
// quietly soften them back into the consensus advice they were written against.
{
  const strategy = read('src/data/lessonContent/courseStrategy.js').toLowerCase();
  if (!strategy.includes('statistics') || !strategy.includes('calculus')) fail('the math sequencing lesson no longer names both statistics and calculus');
  if (!strategy.includes('organic chemistry')) fail('the AP credit lesson no longer covers the organic chemistry jump');
  if (!strategy.includes('dual enrollment')) fail('the no-AP-school lesson no longer covers dual enrollment');
  if (!strategy.includes('school profile')) fail('the rigor lesson no longer explains the school profile, which is the mechanism');
  ok('the course strategy lessons still make the four claims they exist to make');
}

// ── 5. The planner feeds the calculator ─────────────────────────────────────
section('The course planner produces the calculator\'s own rigor shape');

{
  const plan = planner.emptyPlan();
  plan.years.y9 = [planner.makeCourse('biology', 'honors'), planner.makeCourse('english')];
  plan.years.y10 = [planner.makeCourse('chemistry', 'ap'), planner.makeCourse('geometry', 'honors')];
  plan.years.y11 = [planner.makeCourse('physics', 'ap'), planner.makeCourse('anatomy', 'de')];
  plan.offeredAdvanced = 10;

  const rigor = planner.rigorFromPlan(plan);
  for (const k of ['ap', 'ib', 'honors', 'dualEnrollment', 'offeredAdvanced']) {
    if (!(k in rigor)) fail(`rigorFromPlan is missing "${k}", which scoreRigor reads`);
  }
  const scored = scoreRigor(rigor);
  if (!scored.available) fail('scoreRigor could not use the planner\'s output');
  // The number the planner shows the student and the number the calculator uses
  // must be the same number, or the two screens contradict each other.
  if (Math.abs(scored.takenWeighted - planner.weightedAdvanced(plan)) > 1e-9) {
    fail(`the planner shows ${planner.weightedAdvanced(plan)} weighted courses and the calculator computes ${scored.takenWeighted}`);
  } else ok('the planner and the calculator agree on the weighted advanced total');

  if (scored.offered !== 10) fail('the school\'s advanced-course count did not reach scoreRigor');
  else ok('the "how many does your school offer" answer reaches the calculator');
}

// Fixability: a senior is never told to fix something in a year that has passed.
{
  const plan = planner.emptyPlan();
  const senior = planner.evaluatePlan(plan, { pathways: ['nursing'], gradeStage: 'senior' });
  if (senior.findings.some((f) => f.fixBy && f.fixBy !== '12th grade')) fail('a senior is being told to fix something in a year that has already passed');
  const graduated = planner.evaluatePlan(plan, { pathways: ['nursing'], gradeStage: 'gap' });
  if (graduated.findings.some((f) => f.severity !== 'note')) fail('a graduated student is still being shown fixable gaps');
  if (graduated.findings.some((f) => f.fix)) fail('a graduated student is being given an instruction they cannot act on');
  ok('findings degrade to notes once there is no year left to fix them in');
}

// The nursing-versus-calculus claim, enforced rather than trusted: a nursing
// plan with statistics and no calculus must not be flagged for calculus.
{
  const plan = planner.emptyPlan();
  plan.years.y12 = [planner.makeCourse('statistics', 'ap')];
  const nursing = planner.evaluatePlan(plan, { pathways: ['nursing'], gradeStage: 'freshman' });
  if (nursing.findings.some((f) => f.id === 'calculus-for-combined')) {
    fail('a nursing plan is being told it needs calculus, which is the myth this unit exists to correct');
  }
  const combined = planner.evaluatePlan(plan, { pathways: ['physician'], gradeStage: 'freshman', combined: true });
  if (!combined.findings.some((f) => f.id === 'calculus-for-combined')) {
    fail('a combined-degree plan without calculus is not being flagged, and there it genuinely matters');
  }
  ok('calculus is required of combined-degree plans and not of nursing plans');
}

// ── 6. The certification module ─────────────────────────────────────────────
section('The certification module stays inside the verified database');

{
  const entries = guide.moduleEntries({ stateCode: 'OH', age: 16, pathwayKey: 'nursing' });
  if (entries.length !== guide.MODULE_IDS.length) fail(`the module lists ${entries.length} credentials, expected ${guide.MODULE_IDS.length}`);
  for (const id of guide.MODULE_IDS) {
    if (!getCredential(id)) fail(`the module teaches "${id}", which is not a record in the credential database`);
  }
  ok(`all ${guide.MODULE_IDS.length} credentials resolve to real database records`);

  // The state selector has to actually change something, or it is theatre.
  const cna = entries.find((e) => e.id === 'cna');
  if (!cna?.naming?.matched || !/STNA/.test(cna.naming.name)) {
    fail('an Ohio student is not shown STNA for the nursing assistant credential');
  } else ok('the state selector renames the credential (Ohio → STNA)');

  // The age gate a sixteen-year-old most needs, stated before they spend a summer.
  const emt = entries.find((e) => e.id === guide.EMT_ID);
  if (!emt) fail('the EMT is missing from the module entirely');
  else if (emt.age.status === 'ok') fail('the EMT reads as having no age condition for a sixteen-year-old');
  else if (!emt.age.headline || !emt.age.detail) fail('the EMT age gate has no sentence explaining it');
  else if (!/18/.test(emt.age.headline + emt.age.detail)) fail('the EMT age gate never states the actual age');
  else ok('the EMT age gate is stated, with its nuance, for a sixteen-year-old');

  // Every credential the module teaches must say what it opens — the fact that
  // makes it worth a teenager's summer — except BLS, which opens nothing on its
  // own and says so.
  for (const e of entries) {
    if (!e.guide) { fail(`${e.id}: no guidance record`); continue; }
    if (!e.guide.unlocks || !e.guide.strengthNote) fail(`${e.id}: missing its unlocks or strength note`);
    if (e.id !== 'aha-bls' && !(e.guide.jobs || []).length) fail(`${e.id}: names no job it opens`);
  }
  ok('every credential names what it opens and what it does to an application');

  // Strength has to discriminate, or a rating on everything is a rating on nothing.
  const nursingStrengths = new Set(entries.map((e) => e.strength));
  if (nursingStrengths.size < 2) fail('every credential rates the same for nursing — the rating carries no information');
  else ok('pathway strength ratings discriminate between credentials');
}

// No number typed into the guidance layer or the component: those belong to the
// database, and a second copy goes stale silently and then contradicts the first.
{
  const guideSrc = read('src/lib/certificationGuide.js');
  const body = guideSrc.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
  const money = body.match(/\$\s?\d/g);
  if (money) fail(`certificationGuide.js hardcodes a dollar figure (${money[0]}) that belongs to the credential database`);
  const hours = body.match(/\b\d{2,4}\s*hours\b/gi);
  if (hours) fail(`certificationGuide.js hardcodes "${hours[0]}" — training hours belong to the credential database`);
  ok('the guidance layer hardcodes no cost or hours of its own');
}

// ── Done ────────────────────────────────────────────────────────────────────
console.log('');
if (failures) {
  console.error(`${failures} check${failures === 1 ? '' : 's'} failed.`);
  process.exit(1);
}
console.log('Four-year map, foundations tier, course planner and certification module all verified.');
