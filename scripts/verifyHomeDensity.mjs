#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// verifyHomeDensity — the dashboard's progressive ladder.
//
// This module decides the first thing a brand-new student sees, which makes it
// worth pinning hard. Four properties, each of which is a real failure if it
// breaks:
//
//  1. A NEW ACCOUNT IS SMALL. The whole point. If a signal shape changes and
//     every module starts qualifying on an empty account, the regression is
//     invisible in code review and obvious to every new user.
//  2. THE THREE ALWAYS-ON MODULES ARE ALWAYS ON. A dashboard that can withhold
//     "what do I do next" has failed at the one job a dashboard has.
//  3. IT ONLY EVER OPENS. Deleting an activity must not make a module vanish.
//     A page that rearranges itself around a deletion reads as punishment for
//     tidying up.
//  4. THE STUDENT CAN ALWAYS OVERRIDE. 'full' shows everything, unconditionally,
//     on any signals at all.
// ─────────────────────────────────────────────────────────────────────────────

const D = await import('../src/lib/dashboardStages.js');
const { unlockState } = await import('../src/lib/featureUnlock.js');

const failures = [];
const assert = (label, cond, detail = '') => {
  if (cond) console.log(`  ✓ ${label}`);
  else { failures.push(`${label}${detail ? ` — ${detail}` : ''}`); console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
};
const eq = (label, actual, expected) =>
  assert(label, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
const section = (name) => console.log(`\n${name}`);

// ─────────────────────────────────────────────────────────────────────────────
section('1. The ladder is well formed');

assert('every module has a unique id', new Set(D.HOME_MODULE_IDS).size === D.HOME_MODULE_IDS.length);
for (const m of D.HOME_MODULES) {
  assert(`"${m.id}" has a label`, (m.label || '').length > 2);
  // A module is either always on or has a condition. One that is neither can
  // never appear, which is a module deleted by accident.
  assert(`"${m.id}" is either always-on or earnable`, m.always === true || typeof m.earns === 'function');
  // Every deferrable module must say what it would add, because that sentence is
  // what makes "show me everything" an informed choice rather than a mystery
  // switch.
  if (!m.always) assert(`"${m.id}" says what it would add`, (m.adds || '').length > 20, m.adds);
}
eq('exactly three modules are always on', D.ALWAYS_ON.length, 3);
for (const id of ['hero', 'nextThree', 'fourYearArc']) {
  assert(`"${id}" is always on`, D.ALWAYS_ON.includes(id),
    'a dashboard that can withhold "what do I do next" has failed at its only job');
}

// ─────────────────────────────────────────────────────────────────────────────
section('2. A brand-new account gets a small page');

const EMPTY = {};
const fresh = D.visibleModules(EMPTY, 'auto', []);
eq('a fresh account sees exactly the always-on modules', fresh.visible.size, D.ALWAYS_ON.length);
assert('and it knows it is holding things back', fresh.isFocused);
assert('every deferred module is named', fresh.deferred.length === D.HOME_MODULES.length - D.ALWAYS_ON.length);
assert('the focus note lists what is coming', (D.focusNote(fresh.deferred)?.items || []).length === fresh.deferred.length);

// Signals arrive from a dozen subsystems and several are null mid-fetch. A NaN
// comparison is false, which would silently withhold a module a student earned.
for (const junk of [null, undefined, {}, { activities: null }, { activities: 'x' }, { activities: NaN },
  { streak: undefined }, { colleges: '3' }, []]) {
  let out;
  let threw = false;
  try { out = D.visibleModules(junk, 'auto', []); } catch { threw = true; }
  assert(`${JSON.stringify(junk)} signals do not throw`, !threw);
  assert(`and still yield the always-on modules`, out && out.visible.size >= D.ALWAYS_ON.length);
}
// A numeric string is a real shape from a database driver and must count.
assert('a numeric string counts as a number', D.visibleModules({ colleges: '3' }, 'auto', []).visible.has('deadlineHorizon'));

// ─────────────────────────────────────────────────────────────────────────────
section('3. Each module appears when the thing it measures exists');

const earns = (signals, id) => D.visibleModules(signals, 'auto', []).visible.has(id);

assert('one activity earns the hours rings', earns({ activities: 1 }, 'hoursRings'));
assert('logged clinical hours earn them too', earns({ clinicalHours: 4 }, 'hoursRings'));
assert('nothing logged does not', !earns({}, 'hoursRings'));

assert('one deadline earns the sixty-day horizon', earns({ deadlines: 1 }, 'deadlineHorizon'));
assert('one college earns it too', earns({ colleges: 1 }, 'deadlineHorizon'));
assert('an empty calendar does not', !earns({}, 'deadlineHorizon'));

assert('three lessons earn the progress breakdown', earns({ lessonsDone: 3 }, 'progressDetail'));
assert('two quizzes earn it too', earns({ quizzes: 2 }, 'progressDetail'));
assert('one lesson does not', !earns({ lessonsDone: 1 }, 'progressDetail'));

assert('one achievement earns the achievements module', earns({ achievements: 1 }, 'achievements'));
assert('a two-day streak earns it too', earns({ streak: 2 }, 'achievements'));
assert('a fresh account does not', !earns({}, 'achievements'));

assert('a sealed MedEx score earns its card', earns({ hasMedexScore: true }, 'medex'));
assert('no score, no card', !earns({}, 'medex'));
assert('a built roadmap earns its card', earns({ hasRoadmap: true }, 'roadmapCard'));
assert('a tracked scholarship earns the aid card', earns({ scholarships: 1 }, 'financialAid'));
assert('one lesson earns quick actions', earns({ lessonsDone: 1 }, 'quickActions'));

// ─────────────────────────────────────────────────────────────────────────────
section('4. It only ever opens');

// THE RATCHET. A module earned yesterday stays today, even if the data behind it
// is gone — a student who deletes an activity should not watch the page
// rearrange itself around the loss.
const after = D.visibleModules({}, 'auto', ['hoursRings']);
assert('a previously earned module survives the data going away', after.visible.has('hoursRings'));
assert('and is not re-listed as deferred', !after.deferred.some((d) => d.id === 'hoursRings'));
assert('an unknown id in the earned list is harmless',
  D.visibleModules({}, 'auto', ['nope', 'gone']).visible.size === D.ALWAYS_ON.length);

// Earning is monotonic across a realistic sequence.
let earned = [];
let last = 0;
for (const signals of [{}, { activities: 1 }, { activities: 1, colleges: 1 }, { activities: 1, colleges: 1, quizzes: 2 }]) {
  const out = D.visibleModules(signals, 'auto', earned);
  assert(`the page never shrinks (${out.visible.size} >= ${last})`, out.visible.size >= last);
  last = out.visible.size;
  earned = out.earned;
}

// ─────────────────────────────────────────────────────────────────────────────
section('5. The student can always override');

const full = D.visibleModules({}, 'full', []);
eq("'full' shows every module on empty signals", full.visible.size, D.HOME_MODULE_IDS.length);
assert("'full' defers nothing", full.deferred.length === 0);
assert("'full' reports itself as not focused", !full.isFocused);
assert('a fully-earned account is offered no toggle it does not need',
  !D.visibleModules({ activities: 5, colleges: 3, deadlines: 2, lessonsDone: 10, quizzes: 5, achievements: 2, streak: 5, scholarships: 1, hasMedexScore: true, hasRoadmap: true }, 'auto', []).isFocused);
eq('the focus note is silent when nothing is deferred', D.focusNote([]), null);

// ─────────────────────────────────────────────────────────────────────────────
section('6. It agrees with the unlock ladder rather than fighting it');

// A module must never be shown for a tab the nav has not opened yet — the two
// systems answering differently is how a student ends up with a dashboard card
// that links somewhere they cannot go.
{
  const freshUser = { name: 'New' };
  const u = unlockState(freshUser, {});
  const shown = D.visibleModules({}, 'auto', []);
  assert('a fresh account sees no roadmap card while the roadmap tab is locked',
    !shown.visible.has('roadmapCard') || u.isOpen('roadmap'));
  assert('a fresh account sees no aid card while Portfolio is locked',
    !shown.visible.has('financialAid') || u.isOpen('portfolio'));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('');
if (failures.length) {
  console.log(`✗ Dashboard density verification FAILED — ${failures.length} problem(s):\n`);
  failures.forEach((f) => console.log(`  ✗ ${f}`));
  process.exit(1);
}
console.log('✓ Dashboard density verification passed.');
console.log(`  ${D.HOME_MODULES.length} modules · ${D.ALWAYS_ON.length} always on · a fresh account sees ${fresh.visible.size}.`);
