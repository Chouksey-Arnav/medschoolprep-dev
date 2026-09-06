#!/usr/bin/env node
/**
 * Guards the promises parallel pathways makes, none of which fail loudly.
 *
 *   1. THREE PATHWAYS ARE GENUINELY INDEPENDENT. Every lesson belongs to exactly one pathway.
 *      A single shared lesson id would make one student's Nursing progress silently appear in
 *      their PA track — a "bug" that looks like a feature working suspiciously well.
 *   2. THE ENROLLMENT INVARIANTS HOLD, ALWAYS. At most three, never duplicated, never an
 *      unknown key, and the focused pathway is always one of the enrolled ones. Every one of
 *      those, violated, produces a UI that renders fine and lies.
 *   3. A PROFILE WRITTEN BEFORE THIS FEATURE STILL WORKS. Someone who last opened the app with
 *      only `specialty` set must read as enrolled in that one pathway — not as enrolled in
 *      nothing, which would present a returning student with a "pick a pathway" wall.
 *   4. DROPPING A PATHWAY NEVER DESTROYS WORK. It leaves the list; the lessons stay finished,
 *      and re-adding it resumes exactly where it was.
 *   5. WORK IS CREDITED TO THE PATHWAY IT CAME FROM. A lesson started from the parallel board
 *      belongs to its own pathway, not to whichever one happened to be in focus.
 *   6. THE SWITCHER IS EVERYWHERE, NOT ON ONE PAGE. It lives in the app shell and on the
 *      keyboard; that's what makes "switch easily" true anywhere in the app.
 *
 * Run by `npm run verify:parallel-pathways` (and by `npm run build`).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const load = (p) => import(pathToFileURL(path.join(ROOT, p)).href);

let passed = 0;
const failures = [];
const assert = (label, cond, detail = '') => {
  if (cond) { passed += 1; console.log(`  ✓ ${label}`); return; }
  failures.push(`${label}${detail ? `\n      ${detail}` : ''}`);
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
};
const eq = (label, actual, expected) =>
  assert(label, Object.is(actual, expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
const deep = (label, actual, expected) =>
  assert(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
const section = (name) => console.log(`\n${name}`);

const P = await load('src/lib/pathwayEnrollment.js');
const { PATHS } = await load('src/data/constants.js');
const app = read('src/App.jsx');
const switcher = read('src/components/PathwaySwitcher.jsx');
const profile = read('src/lib/studentProfile.js');

const KEYS = Object.keys(PATHS);
const [K1, K2, K3, K4] = KEYS;
const verified = (l, e) => !!(e?.verified || (e && !l.quizIds?.length));

// ── 1. Independence ──────────────────────────────────────────────────────────
section('Three pathways are genuinely independent');

// A lesson id may be owned by exactly one pathway, or it may be deliberately
// shared by ALL of them — the foundations tier (course strategy, certifications;
// see src/data/foundationUnits.js) is the same two units on every track, sharing
// one id space so that reading a lesson once counts everywhere. What must never
// exist is the middle case: an id on some pathways but not others. That is what
// "progress bleeding between tracks" actually looks like — a Nursing lesson
// silently marking a PA track complete — and it is what this checks for.
const owner = new Map();
const owners = new Map();
for (const [key, p] of Object.entries(PATHS)) {
  for (const unit of p.units || []) {
    for (const lesson of unit.lessons || []) {
      if (!owner.has(lesson.id)) owner.set(lesson.id, key);
      const set = owners.get(lesson.id) || new Set();
      set.add(key);
      owners.set(lesson.id, set);
    }
  }
}
const partial = [...owners.entries()]
  .filter(([, keys]) => keys.size > 1 && keys.size < KEYS.length)
  .map(([id, keys]) => `${id}: ${[...keys].join(' + ')}`);
assert('no lesson id is shared by SOME pathways — parallel progress can never bleed between tracks',
  partial.length === 0, partial.slice(0, 5).join('; '));

const sharedIds = P.sharedLessonIds(PATHS);
const soloIds = [...owners.keys()].filter((id) => !sharedIds.has(id));
assert('the shared tier is shared by every pathway, not just several',
  [...sharedIds].every((id) => owners.get(id).size === KEYS.length));

assert('there are at least as many pathways as parallel slots', KEYS.length >= P.MAX_ACTIVE_PATHWAYS);
eq('the parallel cap is three', P.MAX_ACTIVE_PATHWAYS, 3);

const index = P.buildLessonPathwayIndex(PATHS);
eq('the lesson→pathway index covers every singly-owned lesson', index.size, soloIds.length);
assert('the index agrees with the pathway definitions on every singly-owned lesson',
  soloIds.every((id) => index.get(id) === owner.get(id)));
// Deliberately absent rather than arbitrarily owned: an id in the index would
// have made the first pathway in PATHS the owner, labeling a shared lesson with
// a track the student may not be enrolled in and writing that track's unit
// verification on completion. Absent, every caller falls through to the focused
// pathway, which is the right answer for a lesson that belongs to all of them.
assert('shared lessons are absent from the index, so they credit the focused pathway',
  [...sharedIds].every((id) => !index.has(id)), [...sharedIds].slice(0, 3).join(', '));

// ── 2. Enrollment invariants ─────────────────────────────────────────────────
section('The enrollment invariants hold, always');

deep('a fresh profile with nothing set is enrolled in nothing',
  P.getActivePathways({}, PATHS), []);
eq('...and has no focused pathway to report', P.getFocusedPathway({}, PATHS), null);

const three = { activePathways: [K1, K2, K3], specialty: K2 };
deep('three enrolled reads back as three, in the student\'s own order', P.getActivePathways(three, PATHS), [K1, K2, K3]);
eq('focus is whatever specialty names', P.getFocusedPathway(three, PATHS), K2);

deep('a fourth entry written by a stale client is truncated, never trusted',
  P.getActivePathways({ activePathways: [K1, K2, K3, K4] }, PATHS), [K1, K2, K3]);
deep('duplicates collapse', P.getActivePathways({ activePathways: [K1, K1, K2] }, PATHS), [K1, K2]);
deep('unknown keys are dropped rather than rendered as empty cards',
  P.getActivePathways({ activePathways: [K1, 'astrology', null, 7] }, PATHS), [K1]);
// The focused pathway is enrolled by definition, so a half-written profile heals itself
// rather than rendering a pathway page for something the rail doesn't show.
deep('a specialty missing from the list is folded back into it, not ignored',
  P.getActivePathways({ activePathways: [K1, K2], specialty: K3 }, PATHS), [K1, K2, K3]);
eq('a focused pathway that cannot be enrolled (list already full) falls back to a real one',
  P.getFocusedPathway({ activePathways: [K1, K2, K3], specialty: K4 }, PATHS), K1);

eq('slots remaining counts down', P.slotsRemaining({ activePathways: [K1, K2] }, PATHS), 1);
eq('...and hits zero at the cap', P.slotsRemaining(three, PATHS), 0);
assert('canEnrollMore is false at the cap', !P.canEnrollMore(three, PATHS));

// enroll / focus
const e1 = P.enrollPathway({ name: 'A' }, K1, PATHS);
eq('enrolling from empty reports "enrolled"', e1.status, 'enrolled');
deep('...and lands in the list', P.getActivePathways(e1.user, PATHS), [K1]);
eq('...and takes focus', e1.user.specialty, K1);

const e2 = P.enrollPathway(e1.user, K2, PATHS);
deep('a second pathway is added without disturbing the first', P.getActivePathways(e2.user, PATHS), [K1, K2]);
eq('...and the new one takes focus, since adding it is an act of intent', e2.user.specialty, K2);

const e3 = P.enrollPathway(e2.user, K3, PATHS).user;
const e4 = P.enrollPathway(e3, K4, PATHS);
eq('a fourth is refused with a status the UI can explain', e4.status, 'full');
deep('...and changes nothing', P.getActivePathways(e4.user, PATHS), [K1, K2, K3]);
eq('...and does not steal focus', P.getFocusedPathway(e4.user, PATHS), K3);

const refocus = P.focusPathway(e3, K1, PATHS);
eq('focusing an enrolled pathway reports "focused"', refocus.status, 'focused');
deep('...and does not reorder the rail under the student\'s cursor',
  P.getActivePathways(refocus.user, PATHS), [K1, K2, K3]);
eq('focusing the already-focused pathway is a no-op', P.focusPathway(e3, K3, PATHS).status, 'unchanged');
eq('focusing an unenrolled pathway with room enrolls it', P.focusPathway(e2.user, K3, PATHS).status, 'enrolled');
eq('an unknown key is refused everywhere', P.enrollPathway(e1.user, 'nope', PATHS).status, 'unknown');

// ── 3. Backwards compatibility ───────────────────────────────────────────────
section('A profile written before this feature still works');

const legacy = { name: 'Returning', specialty: K2 };
deep('specialty-only reads as an enrollment of one', P.getActivePathways(legacy, PATHS), [K2]);
eq('...focused on that pathway', P.getFocusedPathway(legacy, PATHS), K2);
assert('...with room to add more', P.canEnrollMore(legacy, PATHS));
deep('adding to a legacy profile keeps the original first',
  P.getActivePathways(P.enrollPathway(legacy, K1, PATHS).user, PATHS), [K2, K1]);
deep('an empty activePathways array with a specialty still surfaces the specialty',
  P.getActivePathways({ activePathways: [], specialty: K3 }, PATHS), [K3]);

// ── 4. Dropping keeps work ───────────────────────────────────────────────────
section('Dropping a pathway never destroys work');

const dropped = P.dropPathway(e3, K2, PATHS);
eq('dropping reports "dropped"', dropped.status, 'dropped');
deep('...removing exactly one', P.getActivePathways(dropped.user, PATHS), [K1, K3]);
assert('...and never touches lesson progress — the user record carries no lesson data at all',
  !('lessons' in dropped.user) && !('pathway' in dropped.user));
eq('dropping a pathway that is not enrolled changes nothing', P.dropPathway(e3, K4, PATHS).status, 'unchanged');

const droppedFocused = P.dropPathway({ activePathways: [K1, K2, K3], specialty: K2 }, K2, PATHS);
eq('dropping the focused pathway hands focus to the one that takes its place', droppedFocused.focused, K3);
const droppedTail = P.dropPathway({ activePathways: [K1, K2, K3], specialty: K3 }, K3, PATHS);
eq('dropping the last one in the rail falls back to its neighbor', droppedTail.focused, K2);
const droppedOnly = P.dropPathway({ activePathways: [K1], specialty: K1 }, K1, PATHS);
deep('dropping the only pathway leaves an empty enrollment', P.getActivePathways(droppedOnly.user, PATHS), []);
eq('...and a null focus, the same state a new account is in', droppedOnly.user.specialty, null);

const swapped = P.swapPathway({ activePathways: [K1, K2, K3], specialty: K1 }, K2, K4, PATHS);
eq('a swap reports "swapped"', swapped.status, 'swapped');
deep('...and the incoming pathway takes the outgoing one\'s slot, not the end of the rail',
  P.getActivePathways(swapped.user, PATHS), [K1, K4, K3]);
eq('...and takes focus', swapped.user.specialty, K4);
eq('swapping in something already enrolled just focuses it, rather than dropping the other',
  P.swapPathway({ activePathways: [K1, K2], specialty: K1 }, K1, K2, PATHS).status, 'focused');
deep('...leaving both enrolled',
  P.getActivePathways(P.swapPathway({ activePathways: [K1, K2], specialty: K1 }, K1, K2, PATHS).user, PATHS), [K1, K2]);

// ── 5. Progress is per-pathway and honest ────────────────────────────────────
section('Every parallel surface reads the same progress');

const lessonsOf = (k) => P.pathwayLessons(PATHS[k]);
const l1 = lessonsOf(K1);
const l2 = lessonsOf(K2);
assert('the fixtures have enough lessons to test with', l1.length >= 3 && l2.length >= 3);

const progressState = {
  [l1[0].id]: { verified: true, completedAt: 1000 },
  [l1[1].id]: { verified: true, completedAt: 2000 },
  [l2[0].id]: { verified: true, completedAt: 1500 },
};
const r1 = P.pathwayProgress(K1, PATHS, progressState, verified);
eq('a pathway counts only its own finished lessons', r1.done, 2);
eq('...against its own total', r1.total, l1.length);
eq('...as its own percentage', r1.pct, Math.round((2 / l1.length) * 100));
eq('the next lesson is the first unfinished one, in order', r1.resume.lesson.id, l1[2].id);
assert('...and carries the unit it belongs to, so it can be opened directly', !!r1.resume.unit);
eq('a second pathway is scored entirely separately', P.pathwayProgress(K2, PATHS, progressState, verified).done, 1);
eq('an untouched pathway is at zero, not undefined', P.pathwayProgress(K3, PATHS, progressState, verified).done, 0);
assert('...and is marked as not started', !P.pathwayProgress(K3, PATHS, progressState, verified).started);
eq('last activity is the most recent completion in THAT pathway', r1.lastActivityAt, 2000);

const halfRead = { ...progressState, [l1[3]?.id || l1[2].id]: { studying: true } };
const rHalf = P.pathwayProgress(K1, PATHS, halfRead, verified);
eq('a half-finished lesson outranks the sequentially-next one as what to resume',
  rHalf.resume.lesson.id, l1[3]?.id || l1[2].id);
assert('...and is labelled as a continue, not a start', rHalf.resumeIsContinue);

const allDone = Object.fromEntries(l1.map((l) => [l.id, { verified: true, completedAt: 5 }]));
const rDone = P.pathwayProgress(K1, PATHS, allDone, verified);
assert('a finished pathway reports complete', rDone.complete);
eq('...at 100%', rDone.pct, 100);
eq('...with nothing left to resume', rDone.resume, null);

const rows = P.activePathwayProgress(three, PATHS, progressState, verified);
eq('the board shows one row per enrolled pathway', rows.length, 3);
// The ⌥1/⌥2/⌥3 hints the rail prints are row indexes, and the shortcut handler reads
// getActivePathways() by index. If these two orders ever diverge, every keyboard switch
// silently lands on the wrong pathway while the labels claim otherwise.
deep('rows are in slot order, matching what ⌥1/⌥2/⌥3 actually switch to',
  rows.map((r) => r.key), P.getActivePathways(three, PATHS));
assert('...with the focused one flagged in place rather than moved to the front',
  rows.filter((r) => r.focused).length === 1 && rows.find((r) => r.focused).key === K2);

assert('the parallel summary names every pathway and its real progress',
  KEYS.slice(0, 3).every((k) => P.describeParallelPathways(rows).includes(PATHS[k].label)));
assert('...and says how many are running', P.describeParallelPathways(rows).includes('3 pathways'));
assert('a single pathway is described in the singular, without parallel framing',
  !P.describeParallelPathways([rows[0]]).includes('parallel'));
assert('no enrollment is described honestly rather than as an empty list',
  P.describeParallelPathways([]).toLowerCase().includes('no pathway'));

// ── 6. Wiring ────────────────────────────────────────────────────────────────
section('Work is credited to the pathway it came from');

assert('App.jsx builds the lesson→pathway index once, from PATHS',
  /const LESSON_PATHWAY\s*=\s*buildLessonPathwayIndex\(PATHS\)/.test(app));
assert('verifying a lesson resolves ITS pathway rather than assuming the focused one',
  /const lessonPathKey\s*=\s*LESSON_PATHWAY\.get\(lesson\.id\)/.test(app));
assert('unit mastery is recorded against the lesson\'s own pathway',
  /DB\.verifyUnit\(lessonPathKey,/.test(app));
assert('the 25/50/75/100% milestone flag is namespaced by the lesson\'s own pathway',
  /pathwayMilestone:\$\{lessonPathKey\}/.test(app));
assert('the pathway-completion badge credits the lesson\'s own pathway',
  /pathwayCompletions:new Set\(\[lessonPathKey\]\)/.test(app));

section('The switcher is everywhere, not on one page');

const quickSwitchMounts = (app.match(/<PathwayQuickSwitch/g) || []).length;
assert('the quick switcher is mounted in the app shell — desktop sidebar AND mobile header',
  quickSwitchMounts >= 2, `found ${quickSwitchMounts} mount(s)`);
assert('the Pathways page leads with the rail', /<PathwayRail/.test(app));
assert('the at-a-glance board is on both the Pathways page and Home',
  (app.match(/<ParallelPathwayBoard/g) || []).length >= 2);
assert('add/swap/drop is a real screen, not a hidden setting', /<PathwayManager/.test(app));

assert('the ⌥1-3 shortcuts are keyed on e.code, so they work on macOS (where Alt+1 emits "¡")',
  /\['Digit1','Digit2','Digit3'\]\.indexOf\(e\.code\)/.test(app));
assert('...and are suppressed while typing in a field',
  /el\.tagName==='INPUT'\|\|el\.tagName==='TEXTAREA'\|\|el\.isContentEditable/.test(app));
assert('every enrolled pathway is reachable from the ⌘K palette',
  /id:`path-\$\{r\.key\}`/.test(app) && /group:'Pathways'/.test(app));
// The group must be rendered, and rendered AHEAD of the destinations — for a
// student running three tracks, "switch to Nursing" is the most-repeated action
// in the app. Matched as an ordering rather than as one exact array literal,
// because the palette has since grown a 'Recent' group in front of both and
// pinning the literal made a true property fail for a reason unrelated to it.
{
  const groups = (app.match(/\[('[^']+',?)+\]\.map\(group=>/) || [''])[0];
  const order = [...groups.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert('...and the palette actually renders that group',
    order.includes('Pathways'), `palette groups: ${order.join(', ') || 'none found'}`);
  assert('...ahead of the list of destinations',
    order.indexOf('Pathways') < order.indexOf('Jump to'), `palette groups: ${order.join(', ')}`);
}

assert('the rail is a real tablist with roving arrow-key navigation',
  /role="tablist"/.test(switcher) && /ArrowRight/.test(switcher) && /tabIndex=\{active \? 0 : -1\}/.test(switcher));
assert('the switch is animated by ONE shared indicator, so it reads as a move rather than a repaint',
  /layoutId=\{`\$\{layoutGroup\}-indicator`\}/.test(switcher));
assert('...and every animation collapses under reduced motion',
  (switcher.match(/reducedMotion/g) || []).length >= 10);
assert('the popover closes on Escape and on an outside click',
  /e\.key === 'Escape'/.test(switcher) && /wrapRef\.current\?\.contains/.test(switcher));
assert('a non-focused pathway can be resumed WITHOUT switching to it',
  /onResume/.test(switcher) && /resumePathwayRow/.test(app));
assert('...and that path opens the lesson directly rather than only navigating',
  /openLesson\(row\.resume\.lesson,row\.resume\.unit\)/.test(app));

assert('dropping a pathway is confirmed, and the confirmation says progress is kept',
  /stay saved/.test(switcher));

section('Medabrain is told a student is running several pathways');

assert('the head coach prompt accepts the parallel summary', /parallelPathwaysSummary = null/.test(profile));
assert('...and both prompts use it', (profile.match(/\$\{parallelPathwaysSummary \?/g) || []).length >= 2);
assert('...telling the coach not to push a student to "pick one"',
  /pick one/.test(profile) && /never push them to narrow down/.test(profile));
assert('App.jsx passes it to the head coach and both Medabrain panels',
  (app.match(/parallelPathwaysSummary:isParallel\?parallelSummary:null|parallelPathwaysSummary=\{isParallel\?parallelSummary:null\}/g) || []).length >= 3);

// ── Result ───────────────────────────────────────────────────────────────────
console.log('');
if (failures.length) {
  console.error(`${passed} passed, ${failures.length} failed\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`${passed} passed, 0 failed`);
console.log('Parallel pathways verified.');
