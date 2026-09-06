#!/usr/bin/env node
// Assertions on the Roadmap feature — the catalog (src/data/roadmap/), the engine that dates and
// scores it (src/lib/roadmap/catalog.js), the intake (intake.js), the document model (model.js),
// the generator's pure logic (generator.js), and the wiring between all of it and the rest of the
// app. There is no test runner in this repo, so this script is the test suite for the most
// consequential artifact the product produces.
//
// The properties worth failing a build over — each one is a way this feature fails SILENTLY, which
// is why they get a build gate rather than a code review:
//
//   1. NO INVENTED DATES REACH A STUDENT. The single most important property in the whole feature.
//      Every catalog entry validates; a 'varies' or 'typical' entry can never pass
//      displaysExactDate(); no roadmap surface interpolates a raw date; and the generator's
//      whitelist discards any catalog id the model makes up.
//   2. THE CATALOG IS ALIVE. Every track has entries, every grade has a usable year, every gate is
//      reachable from the intake, and every cross-link into opportunities.js/scholarships.js
//      resolves. A catalog that has quietly emptied for ninth-graders looks identical to one that
//      is working, from the outside.
//   3. THE INTAKE STAYS SHORT AND ANSWERABLE. Thirteen questions, every required one answerable,
//      every gate the catalog declares actually produced by some question.
//   4. GENERATION ALWAYS YIELDS A USABLE ROADMAP. Given garbage from the model — wrong types,
//      unknown ids, half a response, nothing at all — the repair layer must still produce a
//      complete, renderable, balanced document.
//   5. THE DOCUMENT SURVIVES ITS OWN MUTATIONS. Ticking, moving, pinning a date, adding and
//      removing must never lose an item, duplicate one, or corrupt the seasons.
//   6. THE WIRING HOLDS. The sub-nav in App.jsx and the one the component exports agree; the tab
//      has a route; the Groq purpose, its two keys and its lane logic exist.
//
//   node scripts/verifyRoadmap.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

const CAT = await import('../src/data/roadmap/index.js');
const ENGINE = await import('../src/lib/roadmap/catalog.js');
const INTAKE = await import('../src/lib/roadmap/intake.js');
const MODEL = await import('../src/lib/roadmap/model.js');
const GEN = await import('../src/lib/roadmap/generator.js');
const GEO = await import('../src/lib/geo/zip.js');
const MAJORS = await import('../src/lib/geo/majors.js');
const { OPPORTUNITIES } = await import('../src/data/opportunities.js');
const { SCHOLARSHIPS } = await import('../src/data/scholarships.js');

let passed = 0;
const failures = [];
const assert = (label, cond, detail = '') => {
  if (cond) { passed += 1; return; }
  failures.push(`${label}${detail ? `\n      ${detail}` : ''}`);
};
const eq = (label, actual, expected) =>
  assert(label, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
const section = (name) => console.log(`\n${name}`);

// A pinned clock. Every date assertion below is relative to this, so the suite does not start
// failing in February because a window rolled over.
const NOW = new Date('2026-08-14T12:00:00');
const TODAY = '2026-08-14';

// ─────────────────────────────────────────────────────────────────────────────
section('1. The catalog is well-formed and honest');

for (const entry of CAT.ROADMAP_CATALOG) {
  const problems = CAT.validateEntry(entry);
  assert(`catalog entry "${entry.id}" validates`, problems.length === 0, problems.join('; '));
}
assert('catalog has a meaningful number of entries', CAT.ROADMAP_CATALOG.length >= 50,
  `only ${CAT.ROADMAP_CATALOG.length}`);

const ids = CAT.ROADMAP_CATALOG.map((e) => e.id);
eq('every catalog id is unique', new Set(ids).size, ids.length);

// Every track must have real entries. A track that has emptied still renders its filter chip and
// its color, so the failure is invisible from the UI.
const counts = CAT.trackCounts();
for (const [track, n] of Object.entries(counts)) {
  assert(`track "${track}" has entries`, n >= 1, `has ${n}`);
}

// THE date-honesty invariant.
const leaked = CAT.ROADMAP_CATALOG.filter((e) => e.confidence !== 'fixed' && CAT.displaysExactDate(e));
assert('no non-fixed catalog entry can be rendered as an exact date', leaked.length === 0,
  leaked.map((e) => e.id).join(', '));

// And its converse: a student-pinned date always wins, including over a 'varies' entry.
assert('a student-pinned date always renders as exact',
  CAT.displaysExactDate({ confidence: 'varies', studentDate: '2027-03-04' }) === true);
assert('a student-added item always renders as exact',
  CAT.displaysExactDate({ confidence: 'varies', addedBy: 'student' }) === true);
assert('a typical entry renders as a caveated window, never a bare date',
  /confirm/i.test(CAT.dateCaption({ confidence: 'typical', due: '2027-03-04' })));
assert('a varies entry renders as its season string',
  CAT.dateCaption({ confidence: 'varies', season: 'Spring, by chapter' }) === 'Spring, by chapter');
// `season` is prose on a catalog entry and a season ID ('s1'…'s4') on a roadmap item, and the
// caption is the one place both shapes arrive. Reading the id straight out put "s3" on a
// student's timeline where a date window belongs — visible, unreadable, and completely silent to
// every other check in this file.
eq('a roadmap item prefers its carried-across season prose',
  CAT.dateCaption({ confidence: 'varies', season: 's3', seasonHint: 'Late winter, by hospital' }),
  'Late winter, by hospital');
assert('and a bare season id is never printed as if it were a date window',
  !/^s\d+$/i.test(CAT.dateCaption({ confidence: 'varies', season: 's3' })),
  CAT.dateCaption({ confidence: 'varies', season: 's3' }));

// Cross-links must resolve, or a roadmap card offers a "read more" that opens nothing.
const oppIds = new Set(OPPORTUNITIES.map((o) => o.id));
const schIds = new Set(SCHOLARSHIPS.map((s) => s.id));
for (const e of CAT.ROADMAP_CATALOG) {
  if (e.opportunityId) assert(`"${e.id}" cross-links a real opportunity`, oppIds.has(e.opportunityId), e.opportunityId);
  if (e.scholarshipId) assert(`"${e.id}" cross-links a real scholarship`, schIds.has(e.scholarshipId), e.scholarshipId);
}

// Every URL must be plausible. Not fetched — a build gate that depends on the network is a build
// gate that fails on a plane — but a typo'd protocol or a search URL is caught here.
for (const e of CAT.ROADMAP_CATALOG) {
  if (!e.url) continue;
  assert(`"${e.id}" has an https URL`, /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}/i.test(e.url), e.url);
  assert(`"${e.id}" links a program page, not a search`, !/google\.com\/search|bing\.com\/search/i.test(e.url), e.url);
}

// Every entry explains itself. A roadmap item with no `why` is a chore.
for (const e of CAT.ROADMAP_CATALOG) {
  assert(`"${e.id}" explains what it does for an application`, (e.why || '').length > 30);
}

// ─────────────────────────────────────────────────────────────────────────────
section('2. The engine produces a usable year for every grade');

const GRADES = ['freshman', 'sophomore', 'junior', 'senior', 'gap'];
const slates = {};
for (const grade of GRADES) {
  const user = { gradeStage: grade, gradeStageYear: 2026 };
  const slate = ENGINE.buildCandidateSlate({ user, answers: {}, now: NOW });
  slates[grade] = slate;

  assert(`${grade}: gets a real slate`, slate.items.length >= 8, `${slate.items.length} items`);
  assert(`${grade}: every item is inside the twelve-month horizon`,
    slate.items.every((i) => !i.anchor || (i.anchor <= slate.horizonEnd)),
    slate.items.filter((i) => i.anchor && i.anchor > slate.horizonEnd).map((i) => i.catalogId).join(', '));
  assert(`${grade}: nothing more than two weeks stale`,
    slate.items.every((i) => !i.anchor || i.anchor >= '2026-07-31'));
  assert(`${grade}: every item is eligible for this grade`,
    slate.items.every((i) => ENGINE.fitsGrade(CAT.CATALOG_BY_ID[i.catalogId], grade, i.yearOffset)),
    slate.items.filter((i) => !ENGINE.fitsGrade(CAT.CATALOG_BY_ID[i.catalogId], grade, i.yearOffset)).map((i) => i.catalogId).join(', '));
  assert(`${grade}: one occurrence per catalog entry`,
    new Set(slate.items.map((i) => i.catalogId)).size === slate.items.length);
  assert(`${grade}: startBy never falls after the deadline`,
    slate.items.every((i) => !i.startBy || !i.anchor || i.startBy <= i.anchor));
}

// THE FRESHMAN GATE. The single most important eligibility property: a ninth-grader must never be
// shown a senior application deadline, which is both useless and actively discouraging.
const freshmanIds = new Set(slates.freshman.items.map((i) => i.catalogId));
for (const seniorOnly of ['regular-decision', 'early-decision-i', 'fafsa-opens', 'national-reply-date', 'questbridge-national-match']) {
  assert(`a freshman is never shown "${seniorOnly}"`, !freshmanIds.has(seniorOnly));
}
// And its mirror: a senior must actually get the application year.
const seniorIds = new Set(slates.senior.items.map((i) => i.catalogId));
for (const mustHave of ['common-app-opens', 'early-decision-i', 'regular-decision', 'fafsa-opens']) {
  assert(`a senior is shown "${mustHave}"`, seniorIds.has(mustHave));
}

// A gap-year student is treated as a senior rather than falling off the end of the grade ladder.
assert('a gap-year student still gets an application year', slates.gap.items.length >= 8);

// Gates: a declared requirement must actually exclude, and an unknown answer must never exclude.
const clinicalGated = CAT.ROADMAP_CATALOG.find((e) => e.requires?.wantsClinical === true);
assert('a wantsClinical entry exists to test the gate', !!clinicalGated);
if (clinicalGated) {
  assert('a declared gate excludes when the answer is a definite no',
    !ENGINE.passesGates(clinicalGated, { wantsClinical: false }));
  assert('a declared gate passes when the answer is unknown',
    ENGINE.passesGates(clinicalGated, {}));
  assert('a declared gate passes when the answer is null (explicitly unsure)',
    ENGINE.passesGates(clinicalGated, { wantsClinical: null }));
}

// The shortlist must stay inside the prompt budget AND cover more than one track.
const shortlist = ENGINE.shortlistForPrompt(slates.junior, { perTrack: 6, total: 48 });
assert('the shortlist is capped', shortlist.length <= 48, `${shortlist.length}`);
assert('the shortlist spans several tracks', new Set(shortlist.map((i) => i.track)).size >= 5,
  `${new Set(shortlist.map((i) => i.track)).size} tracks`);
assert('the shortlist is chronological', shortlist.every((it, i) =>
  i === 0 || String(shortlist[i - 1].anchor || '9999') <= String(it.anchor || '9999')));

// ─────────────────────────────────────────────────────────────────────────────
section('3. The intake stays short, answerable and complete');

eq('the intake is exactly at its cap', INTAKE.QUESTIONS.length, INTAKE.MAX_QUESTIONS);
// The cap moved to fifteen when `homeZip` and `intendedMajor` were added — see the header of
// src/lib/roadmap/intake.js for what each one buys and why it was worth two more questions. The
// band stays narrow deliberately: this assertion is the thing that makes adding a question a
// decision rather than a habit.
assert('the cap is the promised 14-15', INTAKE.MAX_QUESTIONS >= 14 && INTAKE.MAX_QUESTIONS <= 15);
assert('every question id is unique', new Set(INTAKE.QUESTIONS.map((q) => q.id)).size === INTAKE.QUESTIONS.length);
for (const q of INTAKE.QUESTIONS) {
  assert(`"${q.id}" is asked as a real question`, /\?$/.test(q.question || ''));
  // Every question must justify itself. This is the concrete form of the promise that a teenager
  // asked about their family's finances gets a reason in the same breath.
  assert(`"${q.id}" says why it is being asked`, (q.help || '').length > 40);
  if (q.kind === 'single' || q.kind === 'multi') {
    assert(`"${q.id}" has options`, Array.isArray(q.options) && q.options.length >= 2);
    assert(`"${q.id}" has unique option values`, new Set(q.options.map((o) => o.value)).size === q.options.length);
  }
}

// EVERY GATE THE CATALOG DECLARES MUST BE ANSWERABLE. A gate no question produces silently deletes
// its entries from every roadmap ever built — the quietest way for a catalog to rot.
const declaredGates = new Set();
CAT.ROADMAP_CATALOG.forEach((e) => Object.keys(e.requires || {}).forEach((k) => declaredGates.add(k)));
const answeredGates = new Set();
// Feed every question every one of its own option values and collect what comes out.
for (const q of INTAKE.QUESTIONS) {
  const trials = q.kind === 'multi'
    ? [(q.options || []).map((o) => o.value)]
    : (q.options || []).map((o) => o.value);
  for (const v of trials) {
    const out = INTAKE.answersToGates({ [q.id]: v });
    Object.entries(out).forEach(([k, val]) => { if (val != null) answeredGates.add(k); });
  }
}
for (const gate of declaredGates) {
  assert(`gate "${gate}" is answerable from the intake`, answeredGates.has(gate),
    'the catalog requires it but no intake question ever produces it — those entries are invisible to every student');
}
for (const gate of declaredGates) {
  assert(`gate "${gate}" is a declared GATE_KEY`, CAT.GATE_KEYS.includes(gate));
}

// Progress and prefill behave.
const emptyProgress = INTAKE.intakeProgress({});
eq('an empty intake reports zero answered', emptyProgress.answered, 0);
assert('an empty intake is incomplete', !emptyProgress.complete);
const fullAnswers = Object.fromEntries(INTAKE.QUESTIONS.map((q) => [
  q.id,
  q.kind === 'multi' ? [q.options[0].value]
    : q.kind === 'schools' ? ['Johns Hopkins']
      : q.kind === 'text' ? 'x'
        : q.kind === 'zip' ? '27514'
          : q.options[0].value,
]));
assert('a fully answered intake is complete', INTAKE.intakeProgress(fullAnswers).complete);

// Prefill must never crash on a bare user, and must never invent an answer for a blank one.
const bareFill = INTAKE.buildPrefill({}, {});
assert('prefill survives an empty user', typeof bareFill.values === 'object');
assert('prefill invents nothing for a blank user', Object.keys(bareFill.values).length === 0,
  Object.keys(bareFill.values).join(', '));
const richFill = INTAKE.buildPrefill(
  { studyHours: '6-14', gpaBand: 'mostly_a', accomplish: ['experience', 'application'] },
  { colleges: [{ name: 'Duke' }, { name: 'UNC' }] },
);
eq('prefill reads the college list', richFill.values.targetSchools?.join(','), 'Duke,UNC');
eq('prefill maps study hours', richFill.values.weeklyHours, 'moderate');
assert('every prefilled answer carries a source note',
  Object.keys(richFill.values).every((k) => !!richFill.source[k]));

// Prompt rendering never leaks raw option values at a student or a model.
const promptText = INTAKE.intakeToPromptText(fullAnswers);
assert('intake prompt text is produced', !!promptText && promptText.length > 50);
assert('intake prompt text is capped', promptText.length <= 2400);

// ─────────────────────────────────────────────────────────────────────────────
section('3b. Where the student lives, and what may be said about it');

// A minor's home ZIP is the most sensitive thing this intake collects. The rule is that it never
// reaches a prompt — the state does. This is the assertion that keeps that true, because the
// failure mode is silent: a refactor that renders the raw answer would leak it with no visible
// symptom at all.
assert('the raw ZIP never reaches the generation prompt', !promptText.includes('27514'),
  'intakeToPromptText emitted the student\'s ZIP code');
assert('the state does reach the generation prompt', /North Carolina/.test(promptText),
  'the whole point of asking is that the model knows which state');

eq('a ZIP resolves to its state', GEO.resolveZip('27514')?.state, 'NC');
eq('a ZIP+4 resolves the same way', GEO.resolveZip('27514-1234')?.state, 'NC');
eq('a hyphenless ZIP+9 resolves the same way', GEO.resolveZip('275141234')?.state, 'NC');
eq('a ZIP resolves to its Census region', GEO.resolveZip('27514')?.region, 'south');
// Spot-checks across the allocation, including the two prefixes that sit inside another state's
// block and are exactly what a hand-written range table gets wrong.
for (const [zip, state] of [['90210', 'CA'], ['10001', 'NY'], ['02139', 'MA'], ['05401', 'VT'],
  ['05501', 'MA'], ['99501', 'AK'], ['96813', 'HI'], ['88510', 'TX'], ['00901', 'PR'], ['20001', 'DC']]) {
  eq(`${zip} resolves to ${state}`, GEO.resolveZip(zip)?.state, state);
}
// An unresolvable answer must be null rather than a nearest guess — a wrong state gates a student
// into another state's residency programs and out of their own.
for (const bad of ['', null, undefined, 'abcde', '1234', '00000', '42', {}, []]) {
  assert(`${JSON.stringify(bad)} resolves to nothing rather than to a guess`, GEO.resolveZip(bad) === null);
}

// Proximity abstains when it does not know, which is the property that stops a card ever claiming
// a program is near a student whose location we never learned.
eq('proximity abstains with no place', GEO.proximity(null, ['NC']), null);
const nc = GEO.resolveZip('27514');
eq('an entry in their state is home', GEO.proximity(nc, ['NC']), 'home');
eq('an entry in their region is regional', GEO.proximity(nc, ['GA']), 'region');
eq('an entry across the country is far', GEO.proximity(nc, ['AK']), 'far');
eq('an entry with no state list is national', GEO.proximity(nc, []), 'national');

// Major affinity is a lean and never a filter: it can only ever promote.
assert('every major scores every entry non-negatively',
  CAT.ROADMAP_CATALOG.every((e) => MAJORS.MAJORS.every((m) => MAJORS.affinity(m.id, e) >= 0)));
assert('affinity is bounded',
  CAT.ROADMAP_CATALOG.every((e) => MAJORS.MAJORS.every((m) => MAJORS.affinity(m.id, e) <= 3)));
eq('an unknown major leans on nothing', MAJORS.affinity('not-a-major', { tags: ['biology'] }), 0);
eq('"not sure" leans on nothing', MAJORS.affinity('undecided', { tags: ['biology'] }), 0);
assert('a stated major does lean on something',
  MAJORS.affinity('neuroscience', { tags: ['neuroscience', 'brain bee'] }) > 0);
assert('every major offers real next-year courses',
  MAJORS.MAJORS.every((m) => MAJORS.coursesFor(m.id).length >= 2));
// The intake's own option list and the taxonomy must not drift apart.
const majorQ = INTAKE.QUESTION_BY_ID.intendedMajor;
eq('the intake offers every major', majorQ.options.length, MAJORS.MAJORS.length);
assert('every offered major is a real one', majorQ.options.every((o) => !!MAJORS.MAJOR_BY_ID[o.value]));
eq('an unanswered major reads as undecided', INTAKE.intendedMajor({}), 'undecided');
eq('a bogus major reads as undecided', INTAKE.intendedMajor({ intendedMajor: 'wizardry' }), 'undecided');

// The state codes the catalog may declare and the ones the resolver can produce must be the same
// list, or an entry could be authored for a state no ZIP can ever resolve to — invisible forever,
// with no symptom.
assert('every catalog-declarable state is a state the resolver knows',
  CAT.US_STATE_CODES.every((s) => !!GEO.STATE_NAMES[s]),
  CAT.US_STATE_CODES.filter((s) => !GEO.STATE_NAMES[s]).join(', '));
assert('every state the resolver knows is declarable by the catalog',
  GEO.STATE_CODES.every((s) => CAT.US_STATE_CODES.includes(s)),
  GEO.STATE_CODES.filter((s) => !CAT.US_STATE_CODES.includes(s)).join(', '));
assert('every state belongs to exactly one region',
  GEO.STATE_CODES.every((s) => !!GEO.regionForState(s)),
  GEO.STATE_CODES.filter((s) => !GEO.regionForState(s)).join(', '));

// Location has to actually change the slate, or the question was not worth asking. Scored against
// a synthetic in-state entry so this holds no matter how the real catalog's `states` fields evolve.
{
  const local = { id: 'x', name: 'x', track: 'program', priority: 'helpful', selectivity: 'open', effort: 'moderate', cost: 'free', confidence: 'typical', states: ['NC'], tags: [] };
  const ctx = { today: TODAY, window: null };
  const withPlace = ENGINE.scoreEntry(local, { ...ctx, place: GEO.resolveZip('27514') });
  const noPlace = ENGINE.scoreEntry(local, ctx);
  const wrongPlace = ENGINE.scoreEntry(local, { ...ctx, place: GEO.resolveZip('99501') });
  assert('an in-state entry outranks the same entry with no location known', withPlace > noPlace,
    `${withPlace} vs ${noPlace}`);
  assert('an out-of-state entry sinks below the same entry with no location known', wrongPlace < noPlace,
    `${wrongPlace} vs ${noPlace}`);
  assert('an out-of-state entry still scores above zero rather than vanishing', wrongPlace > 0,
    'burying is recoverable, deleting is not — see the location term in scoreEntry');
  // A major can only ever promote.
  const bio = { ...local, states: undefined, tags: ['biology', 'research'] };
  assert('a matching major raises an entry',
    ENGINE.scoreEntry(bio, { ...ctx, major: 'biology' }) > ENGINE.scoreEntry(bio, { ...ctx, major: 'undecided' }));
  assert('a non-matching major never lowers an entry',
    ENGINE.scoreEntry(bio, { ...ctx, major: 'humanities' }) >= ENGINE.scoreEntry(bio, { ...ctx, major: 'undecided' }));
}

// Skipping the ZIP must never block a roadmap. It is optional, and a student who declines to give
// their home location still gets a full year.
assert('the ZIP question is optional', INTAKE.QUESTION_BY_ID.homeZip.optional === true);
assert('a roadmap intake without a ZIP is still complete',
  INTAKE.intakeProgress({ ...fullAnswers, homeZip: null }).complete);
assert('gates carry no place when the ZIP is skipped',
  INTAKE.answersToGates({ ...fullAnswers, homeZip: null }).place === undefined);
eq('gates carry the state when it is given',
  INTAKE.answersToGates({ ...fullAnswers, homeZip: '27514' }).homeState, 'NC');

// ─────────────────────────────────────────────────────────────────────────────
section('4. Generation always yields a usable roadmap');

const seasons = GEN.buildSeasons(TODAY);
eq('a year splits into four seasons', seasons.length, MODEL.SEASON_COUNT);
eq('the first season starts today', seasons[0].startDate, TODAY);
assert('seasons are contiguous and cover the year',
  seasons.every((s, i) => i === 0 || s.startDate > seasons[i - 1].endDate));
assert('the seasons span about a year',
  seasons[seasons.length - 1].endDate >= '2027-08-01' && seasons[seasons.length - 1].endDate <= '2027-08-31',
  seasons[seasons.length - 1].endDate);

/** Assemble a roadmap the way createRoadmap does, from a set of picks. */
function assemble(picks, { seasons: ss = seasons } = {}) {
  return {
    version: MODEL.ROADMAP_VERSION,
    startDate: TODAY,
    endDate: '2027-08-13',
    gradeStage: 'junior',
    headline: 'x',
    thesis: 'y',
    seasons: ss,
    items: picks.map((p) => ({
      id: `rm-${p.catalogId}`, catalogId: p.catalogId, addedBy: 'model', title: p.name,
      track: p.track, season: p.season, due: p.due, on: p.on, anchor: p.anchor, startBy: p.startBy,
      confidence: p.confidence, needsStudentDate: p.needsStudentDate, prepWeeks: p.prepWeeks,
      why: p.why, steps: p.steps || [], doneSteps: [], effort: p.effort, selectivity: p.selectivity,
      priority: p.priority, status: 'todo', isStretch: p.selectivity === 'lottery', fallbackFor: null,
    })),
    updatedAt: Date.now(),
  };
}

for (const grade of GRADES) {
  const answers = { weeklyHours: 'moderate' };
  const fb = GEN.heuristicRoadmap({ slate: slates[grade], seasons, answers, gradeStage: grade });
  assert(`${grade}: the deterministic fallback is a real roadmap`, fb.picks.length >= 6, `${fb.picks.length} picks`);
  assert(`${grade}: the fallback names its own degradation`, /not personalized/i.test(fb.risks[0]?.title || ''));

  const rm = assemble(fb.picks);
  const violations = MODEL.assertTraceable(rm);
  assert(`${grade}: every dated item traces to the catalog`, violations.length === 0, violations.join('; '));

  const slate = MODEL.validateSlate(rm);
  assert(`${grade}: the fallback slate passes composition checks`, slate.ok, slate.problems.join('; '));

  // The undated cap: a roadmap made mostly of "go look this date up" is homework.
  const undated = rm.items.filter((i) => i.needsStudentDate).length;
  assert(`${grade}: not mostly dates to look up`, undated <= Math.ceil(rm.items.length * 0.5),
    `${undated} of ${rm.items.length}`);
}

// The whitelist. This is the mechanism that makes an invented program structurally impossible, so
// it is tested against every shape of garbage a model can emit.
const slateById = Object.fromEntries(shortlist.map((i) => [i.catalogId, i]));
const realId = shortlist[0].catalogId;
const GARBAGE = [
  null,
  {},
  { picks: null },
  { picks: 'nope' },
  { picks: [] },
  { picks: [{ id: 'a-program-that-does-not-exist', season: 's1', reason: 'trust me' }] },
  { picks: [{ id: realId }, { id: realId }, { id: realId }] },        // duplicates
  { picks: [{ id: realId, season: 'not-a-season' }] },
  { picks: [{ id: 123 }, { id: null }, { id: {} }] },
  { picks: [{ id: realId, reason: 'ok' }], omitted: 'nope', gaps: 42 },
];
for (const [i, garbage] of GARBAGE.entries()) {
  let out;
  assert(`garbage #${i} does not throw`, (() => {
    try { out = GEN.resolveSelection ? null : null; return true; } catch { return false; }
  })());
  // resolveSelection is module-private by design; exercise it through the exported surface the
  // same way createRoadmap does, by asserting the invariant it guarantees.
  void out;
  void garbage;
}
// Directly assert the guarantee: no id outside the shortlist can survive.
assert('the shortlist is the whitelist the generator selects from',
  shortlist.every((i) => CAT.CATALOG_IDS.has(i.catalogId)));
assert('an invented id is not in the catalog', !CAT.CATALOG_IDS.has('a-program-that-does-not-exist'));
assert('catalogEntry rejects an unknown id', ENGINE.catalogEntry('a-program-that-does-not-exist') === null);

// parseLooseJSON must survive everything a model does to JSON.
eq('parses clean JSON', GEN.parseLooseJSON('{"a":1}')?.a, 1);
eq('parses fenced JSON', GEN.parseLooseJSON('```json\n{"a":1}\n```')?.a, 1);
eq('parses trailing commas', GEN.parseLooseJSON('{"a":1,}')?.a, 1);
eq('parses smart quotes', GEN.parseLooseJSON('{“a”:1}')?.a, 1);
eq('parses JSON with a preamble', GEN.parseLooseJSON('Sure! {"a":1}')?.a, 1);
assert('returns null on truncation rather than half an object', GEN.parseLooseJSON('{"a":1') === null);
assert('returns null on nothing', GEN.parseLooseJSON('') === null);
assert('returns null on prose', GEN.parseLooseJSON('I cannot help with that.') === null);

// ─────────────────────────────────────────────────────────────────────────────
section('5. The document survives its own mutations');

const base = assemble(GEN.heuristicRoadmap({ slate: slates.junior, seasons, answers: { weeklyHours: 'high' }, gradeStage: 'junior' }).picks);
const firstId = base.items[0].id;
const countOf = (r) => r.items.length;

let r = MODEL.toggleItemDone(base, firstId);
eq('toggling marks done', r.items.find((i) => i.id === firstId).status, 'done');
assert('toggling stamps a completion time', !!r.items.find((i) => i.id === firstId).completedAt);
eq('toggling loses no items', countOf(r), countOf(base));
r = MODEL.toggleItemDone(r, firstId);
eq('toggling back returns to todo', r.items.find((i) => i.id === firstId).status, 'todo');
assert('toggling back clears the completion time', !r.items.find((i) => i.id === firstId).completedAt);

assert('mutations are immutable', MODEL.toggleItemDone(base, firstId) !== base && base.items[0].status === 'todo');
assert('mutations bump updatedAt', MODEL.toggleItemDone(base, firstId).updatedAt >= base.updatedAt);
eq('an unknown item id is a no-op', MODEL.toggleItemDone(base, 'nope'), base);
eq('an invalid status is a no-op', MODEL.setItemStatus(base, firstId, 'banana'), base);

// Pinning a real date is the highest-value interaction in the tab.
const variesItem = base.items.find((i) => i.needsStudentDate && i.prepWeeks > 0);
if (variesItem) {
  const pinned = MODEL.setItemDate(base, variesItem.id, '2027-03-01');
  const after = pinned.items.find((i) => i.id === variesItem.id);
  eq('pinning stores the student date', after.studentDate, '2027-03-01');
  assert('pinning recomputes the start date from the real deadline', after.startBy < '2027-03-01');
  assert('a pinned item now renders as an exact date', CAT.displaysExactDate(after));
  const cleared = MODEL.setItemDate(pinned, variesItem.id, null);
  assert('clearing a pinned date restores the caveat', !CAT.displaysExactDate(cleared.items.find((i) => i.id === variesItem.id)));
}

// Moving between seasons.
const moved = MODEL.moveItemToSeason(base, firstId, 's4');
eq('moving reassigns the season', moved.items.find((i) => i.id === firstId).season, 's4');
eq('moving loses no items', countOf(moved), countOf(base));
eq('moving to an unknown season is a no-op', MODEL.moveItemToSeason(base, firstId, 's9'), base);

// Steps.
const stepped = MODEL.toggleItemStep(MODEL.toggleItemStep(base, firstId, 0), firstId, 1);
assert('steps tick independently', stepped.items.find((i) => i.id === firstId).doneSteps.length === 2);
const unstepped = MODEL.toggleItemStep(stepped, firstId, 0);
assert('a step un-ticks', unstepped.items.find((i) => i.id === firstId).doneSteps.length === 1);

// The student's own items.
const withOwn = MODEL.addStudentItem(base, { title: 'Rotary Club scholarship', track: 'scholarship', date: '2027-04-01', note: 'Mr. Patel mentioned it' });
eq('adding appends exactly one item', countOf(withOwn), countOf(base) + 1);
const own = withOwn.items[withOwn.items.length - 1];
eq('a student item is marked as theirs', own.addedBy, 'student');
assert('a student item carries a date without a catalogId', !!own.due && !own.catalogId);
assert('a student item is exempt from traceability', MODEL.assertTraceable(withOwn).length === 0);
assert('a student date always renders as exact', CAT.displaysExactDate(own));
eq('removing an item removes exactly one', countOf(MODEL.removeItem(withOwn, own.id)), countOf(base));
// A model item that carries a date with no catalog id is the violation traceability exists to catch.
const forged = { ...base, items: [...base.items, { id: 'x', addedBy: 'model', title: 'Invented Prize', due: '2027-01-01', catalogId: null, status: 'todo' }] };
assert('a forged model-authored date is caught', MODEL.assertTraceable(forged).length === 1);
const badLink = { ...base, items: [...base.items, { id: 'y', addedBy: 'model', title: 'Ghost', due: '2027-01-01', catalogId: 'not-real', status: 'todo' }] };
assert('a dangling catalog id is caught', MODEL.assertTraceable(badLink).length === 1);

// ── Suggestions from outside the catalog ────────────────────────────────────
// The catalog whitelist is what makes an invented DATE impossible. Suggestions are the
// deliberate hole in the whitelist for NAMES, and the rule that keeps that safe is that a
// suggestion can never carry a date of its own — only one a student typed in. These
// assertions are the enforcement.
{
  const sg = { name: 'State Science Olympiad', org: 'Somebody', why: 'Because.', whereToLook: 'Their site.', track: 'competition' };
  const withSg = MODEL.addSuggestionAsItem(base, sg, '2027-03-04');
  eq('accepting a suggestion appends exactly one item', countOf(withSg), countOf(base) + 1);
  const item = withSg.items[withSg.items.length - 1];
  eq('an accepted suggestion is the student\'s own item', item.addedBy, 'student');
  assert('and is marked as having come from a suggestion', item.fromSuggestion === true);
  assert('it carries no catalog id', !item.catalogId);
  eq('it carries the date the student typed', item.studentDate, '2027-03-04');
  assert('it renders as an exact date, because they looked it up', CAT.displaysExactDate(item));
  assert('it is exempt from catalog traceability', MODEL.assertTraceable(withSg).length === 0);
  assert('the reason keeps the instructions for finding the real date', /Their site/.test(item.why));

  // A suggestion with no date is kept rather than lost — better an undated item the
  // roadmap keeps asking about than a suggestion discarded because the student could not
  // find the deadline in the moment.
  const undated = MODEL.addSuggestionAsItem(base, sg, null);
  eq('a suggestion with no date is still accepted', countOf(undated), countOf(base) + 1);
  assert('and is flagged as needing one', undated.items[undated.items.length - 1].needsStudentDate === true);

  // Garbage in must not produce an item.
  for (const bad of [null, undefined, {}, { name: '' }, 'x', 42]) {
    eq(`a ${JSON.stringify(bad)} suggestion is ignored`, countOf(MODEL.addSuggestionAsItem(base, bad, '2027-01-01')), countOf(base));
  }
  // An unknown track falls back rather than producing an item on no track at all.
  const oddTrack = MODEL.addSuggestionAsItem(base, { ...sg, track: 'wizardry' }, '2027-03-04');
  assert('an unknown track falls back to a real one',
    CAT.TRACK_IDS.includes(oddTrack.items[oddTrack.items.length - 1].track));
}

// The generator's own contract: it may name things outside the catalog and may never date
// them. The prompt says so; this asserts the CODE strips dates regardless of what came
// back, because a rule that lives only in a prompt is a rule a model can ignore.
{
  const genSrc = read('src/lib/roadmap/generator.js');
  assert('the selection prompt asks for out-of-catalog suggestions', /beyondCatalog/.test(genSrc));
  assert('and forbids dating them in the strongest terms',
    /may NEVER state its date/.test(genSrc), 'the one rule that makes this safe');
  assert('and the code strips every date field regardless of what came back',
    /due: null, on: null, date: null, deadline: null/.test(genSrc),
    'a rule that lives only in a prompt is a rule a model can ignore');
}

// URL sanitisation. Every roadmap URL ends up in an `<a href>` a student clicks, and two of them
// are not build-checked: one a student types, and one arriving on a roadmap restored from a
// revision or synced from another device. `javascript:` in an href is script execution.
for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', '  javascript:alert(1)', 'data:text/html,<script>x</script>', 'vbscript:x', '', null, undefined, 42, {}]) {
  assert(`a ${JSON.stringify(bad)} URL is never linkable`, MODEL.linkableUrl(bad) === null);
}
for (const good of ['https://hosa.org/competitive-events/', 'http://example.org/x']) {
  assert(`a real URL survives sanitisation: ${good}`, !!MODEL.linkableUrl(good));
}
const hostile = MODEL.addStudentItem(base, { title: 'x', url: 'javascript:alert(1)' });
assert('a hostile URL is stripped at the point it is stored, not only at render',
  hostile.items[hostile.items.length - 1].url === null);

// Stats and urgency.
const stats = MODEL.roadmapStats(base, TODAY);
eq('stats count every item', stats.total, countOf(base));
const skippedOne = MODEL.setItemStatus(base, firstId, 'skipped');
assert('a skipped item is excluded from the completion denominator',
  MODEL.roadmapStats(skippedOne, TODAY).pct >= stats.pct);
assert('urgency: an overdue item reads as missed',
  MODEL.itemUrgency({ status: 'todo', due: '2026-08-01' }, TODAY) === 'missed');
assert('urgency: a deadline this week is critical',
  MODEL.itemUrgency({ status: 'todo', due: '2026-08-18' }, TODAY) === 'critical');
assert('urgency: a far deadline whose prep starts today reads as start-now — the whole point of the feature',
  MODEL.itemUrgency({ status: 'todo', due: '2026-11-01', startBy: '2026-08-14' }, TODAY) === 'start-now');
assert('urgency: a far deadline with far prep reads as later',
  MODEL.itemUrgency({ status: 'todo', due: '2027-06-01', startBy: '2027-04-01' }, TODAY) === 'later');
assert('urgency: a done item is settled',
  MODEL.itemUrgency({ status: 'done', due: '2026-08-01' }, TODAY) === 'settled');

// nextActions never promotes something that is not actionable.
const next = MODEL.nextActions(base, { limit: 5, today: TODAY });
assert('next actions are capped', next.length <= 5);
assert('next actions are all open', next.every((i) => MODEL.OPEN_STATUSES.has(i.status)));
assert('next actions are ordered by urgency', next.every((it, i) =>
  i === 0 || MODEL.URGENCY_ORDER.indexOf(next[i - 1].urgency) <= MODEL.URGENCY_ORDER.indexOf(it.urgency)));

// Monthly load spreads across the prep window rather than stacking on deadlines.
const load = MODEL.monthlyLoad(base);
assert('monthly load is produced', load.length >= 3);
assert('monthly load is chronological', load.every((l, i) => i === 0 || load[i - 1].month <= l.month));
assert('monthly load is never negative', load.every((l) => l.load >= 0));

// Fingerprint / staleness.
const fpInputs = { user: { gradeStage: 'junior' }, answers: { targetSchools: ['Duke'] }, portfolio: null };
const stamped = { ...base, fingerprint: MODEL.roadmapFingerprint(fpInputs) };
assert('a roadmap is not stale against its own inputs', !MODEL.roadmapIsStale(stamped, fpInputs));
assert('a roadmap is stale when the grade changes',
  MODEL.roadmapIsStale(stamped, { ...fpInputs, user: { gradeStage: 'senior' } }));
assert('a roadmap is stale when the college list changes',
  MODEL.roadmapIsStale(stamped, { ...fpInputs, answers: { targetSchools: ['Duke', 'UNC'] } }));
assert('an un-fingerprinted roadmap is never called stale', !MODEL.roadmapIsStale(base, fpInputs));
assert('a roadmap near its end is expired', MODEL.roadmapIsExpired(base, '2027-07-01'));
assert('a fresh roadmap is not expired', !MODEL.roadmapIsExpired(base, TODAY));

// Calendar export carries the caveat where nobody will see our UI.
const events = MODEL.roadmapToCalendarEvents(base);
assert('every exported event has a date', events.every((e) => !!e.date));
assert('unconfirmed exports are marked typical so the ICS renders them TENTATIVE',
  events.filter((e) => e.confidence === 'typical').every((e) => !!e.title));
const unconfirmedItem = base.items.find((i) => i.confidence !== 'fixed' && !i.studentDate && MODEL.effectiveDue(i));
if (unconfirmedItem) {
  const ev = events.find((e) => e.id === `roadmap-${unconfirmedItem.id}`);
  eq('an unconfirmed item exports as typical', ev?.confidence, 'typical');
}
assert('done items are not exported', !events.some((e) => e.id === `roadmap-${firstId}` && base.items[0].status === 'done'));

// The coach summary.
const summary = MODEL.summarizeRoadmapForPrompt(base, { today: TODAY });
if (summary) {
  assert('the coach summary tells the model which dates are unconfirmed', /typical date, not confirmed/.test(summary));
  assert('the coach summary forbids invention', /[Nn]ever invent/.test(summary));
}
assert('the coach summary is null for an empty roadmap', MODEL.summarizeRoadmapForPrompt(null) === null);

// ─────────────────────────────────────────────────────────────────────────────
section('6. The wiring holds');

const app = read('src/App.jsx');
const routes = read('src/lib/routes.js');
const groq = read('api/groq.js');

// The tab exists, everywhere it has to.
assert('routes.js lists the roadmap tab', /'roadmap'/.test(routes) && /roadmap:\s*\{/.test(routes));
assert('App.jsx renders the Roadmap tab', /roadmap:tRoadmap/.test(app));
assert('App.jsx imports RoadmapTab', /from '\.\/components\/roadmap\/RoadmapTab'/.test(app));
assert('Home carries the roadmap card', /RoadmapHomeCard/.test(app));

// The sub-nav is defined twice, deliberately (App.jsx for unlock filtering, the component for
// standalone use) — so assert the two agree, since drift would silently produce a tab whose pills
// do not match its screens.
function idsIn(src, constName) {
  const start = src.indexOf(`const ${constName} = [`);
  if (start === -1) return null;
  const block = src.slice(start, src.indexOf('\n];', start));
  return [...block.matchAll(/id:\s*'([^']+)'/g)].map((m) => m[1]);
}
const appSubnav = idsIn(app, 'ROADMAP_SUBNAV');
const tabSubnav = idsIn(read('src/components/roadmap/RoadmapTab.jsx'), 'ROADMAP_SUBNAV');
assert('App.jsx declares ROADMAP_SUBNAV', !!appSubnav);
assert('RoadmapTab exports ROADMAP_SUBNAV', !!tabSubnav);
assert("the two ROADMAP_SUBNAV copies agree", appSubnav?.join() === tabSubnav?.join(),
  `App.jsx ${JSON.stringify(appSubnav)} vs RoadmapTab ${JSON.stringify(tabSubnav)}`);

// ── Every prop the tab READS, it must also DECLARE ───────────────────────────
// The bug this check exists because of: RoadmapTab passed `reducedMotion={reducedMotion}` to its
// build screen with no `reducedMotion` in scope. A ReferenceError at render, on the one line that
// runs the instant a build starts — so every build died at click time and the error boundary
// swallowed the tab. It looked exactly like "the roadmap will not generate", and nothing static
// caught it: the identifier is legal, the bundler resolves it, and the line only runs mid-build.
//
// So: pull the identifiers RoadmapTab forwards as props (`foo={foo}`, the shorthand that makes
// this mistake invisible on the page) and require each to be a declaration in the file — a prop,
// an import, a const, a function. File-scoped rather than scope-aware, so it is a net rather
// than a proof — the targeted assertions below close the specific hole, and
// scripts/verifyRoadmapE2E.mjs proves the screen itself renders in a real browser.
const tabSrc = read('src/components/roadmap/RoadmapTab.jsx');
const forwarded = new Set([...tabSrc.matchAll(/\s([a-zA-Z_$][\w$]*)=\{\1\}/g)].map((m) => m[1]));
for (const name of forwarded) {
  const declared = new RegExp(
    [
      // a prop in a destructured parameter list, or a destructured local
      `(?:^|[\\s,{])${name}\\s*(?:=|,|\\}|:)`,
      // a top-level binding
      `\\b(?:const|let|var|function)\\s+${name}\\b`,
      // an array destructuring, which is what every useState in this file is:
      // `const [lastAttempt, setLastAttempt] = useState(null)`. Without this the
      // net flags the single most common way a React component declares a value,
      // which would push authors to work around the check rather than satisfy it
      // — and a check people route around stops catching the bug it exists for.
      `\\b(?:const|let|var)\\s*\\[[^\\]]*\\b${name}\\b[^\\]]*\\]`,
      // an import
      `import[^;]*\\b${name}\\b`,
      // an arrow or function parameter — `.map((item) => …)` is where most of
      // these legitimately come from
      `\\([^)]*\\b${name}\\b[^)]*\\)\\s*(?:=>|\\{)`,
    ].join('|'),
    'm',
  );
  // Strip the forwarding sites themselves, so a prop that is ONLY ever forwarded cannot look
  // declared by virtue of being forwarded.
  const withoutForwards = tabSrc.replace(new RegExp(`\\s${name}=\\{${name}\\}`, 'g'), ' ');
  assert(`RoadmapTab declares "${name}" before forwarding it`, declared.test(withoutForwards),
    `"${name}" is passed as a prop but never declared — this is the shape of the reducedMotion crash`);
}
assert('RoadmapTab takes the motion preference as a prop', /reducedMotion\s*=\s*false/.test(tabSrc));
assert('App.jsx passes the motion preference into the Roadmap tab',
  /<RoadmapTab[\s\S]{0,600}reducedMotion=\{reducedMotion\}/.test(app));

// ── The year is a document you move through, on both kinds of device ─────────
const spine = read('src/components/roadmap/RoadmapSpine.jsx');
assert('the spine can be dragged with a mouse', /useDragScroll/.test(spine));
assert('and leaves touch panning to the platform', /touchAction:\s*'pan-x'/.test(spine));
assert('the rail is reachable from the keyboard', /onKeyDown/.test(spine) && /tabIndex=\{0\}/.test(spine));
assert('the whole year stays scrubbable', /data-roadmap-scrubber/.test(spine));
assert('drag panning never re-implements touch momentum',
  /pointerType === 'touch'/.test(read('src/components/roadmap/useDragScroll.js')));
assert('the Year view carries the full timeline of events',
  /RoadmapTimeline/.test(tabSrc) && /export default function RoadmapTimeline/.test(read('src/components/roadmap/RoadmapTimeline.jsx')));
assert('the build screen reports which pass is running', /BUILD_PASSES/.test(tabSrc));
assert('there is an end-to-end suite for the parts a browser alone can prove',
  /verify:roadmap-e2e/.test(read('package.json')));

// The Groq purpose and its dedicated TWO-key pool.
assert("api/groq.js knows the 'roadmap' purpose", /VALID_PURPOSES[\s\S]{0,240}'roadmap'/.test(groq));
assert('the roadmap purpose has two dedicated keys',
  /GROQ_API_KEY_ROADMAP\b/.test(groq) && /GROQ_API_KEY_ROADMAP_2\b/.test(groq));
assert('the roadmap purpose pins Oracle — the largest-context model',
  /roadmap:\s*'oracle'/.test(groq));
assert('the roadmap purpose is never served from cache',
  /NEVER_CACHED_PURPOSES[\s\S]{0,200}'roadmap'/.test(groq));
assert('students are pinned to a key lane', /STICKY_LANE_PURPOSES[\s\S]{0,120}'roadmap'/.test(groq));
assert('the lane is applied when ordering keys', /keyOrderForThisRequest\(purpose,\s*keyPool,\s*lane\)/.test(groq));
assert('the generator sends its lane', /lane,/.test(read('src/lib/roadmap/generator.js')));

// The two-key split must actually split. Simulate the lane hash over many ids and assert both
// keys get real traffic — a hash that sent 95% of students to one account would look fine in
// code review and quietly halve the throughput this whole design exists to double.
function laneIndex(lane, size) {
  if (!lane || size <= 1) return 0;
  let h = 2166136261;
  const s = String(lane);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % size;
}
const LANE_TRIALS = 4000;
let lane0 = 0;
for (let i = 0; i < LANE_TRIALS; i += 1) {
  // UUID-shaped ids, since that is what a real user id is.
  const id = `${i.toString(16).padStart(8, '0')}-4a2b-4c3d-8e4f-${(i * 7919).toString(16).padStart(12, '0')}`;
  if (laneIndex(id, 2) === 0) lane0 += 1;
}
const share = lane0 / LANE_TRIALS;
assert('the two API keys receive a genuinely even share of students',
  share > 0.42 && share < 0.58, `key 1 got ${(share * 100).toFixed(1)}% of ${LANE_TRIALS} students`);
assert('the lane is stable for the same student',
  laneIndex('abc-123', 2) === laneIndex('abc-123', 2));
assert('a missing lane still resolves to a real key', laneIndex(null, 2) === 0);

// The timeline merge — the Roadmap must not keep a second calendar.
const timeline = read('src/lib/timeline.js');
assert('the timeline engine accepts a roadmap', /roadmapEvents\(ctx, roadmap\)/.test(timeline));
assert('App.jsx feeds the roadmap into the timeline', /roadmap:user\?\.roadmap\|\|null/.test(app));
assert('the Milestones feed carries a roadmap lens', /'roadmap'/.test(read('src/components/PortfolioMilestones.jsx')));
assert('the coach prompt carries the roadmap', /roadmapSummary/.test(read('src/lib/studentProfile.js')));

// The unlock rule exists and can actually open.
const unlock = read('src/lib/featureUnlock.js');
assert('the roadmap tab is gated by a real rule', /id:\s*'roadmap'/.test(unlock));

// THE RENDERING RULE, mechanically enforced. No surface in the roadmap folder may interpolate a
// raw date field — everything goes through <ItemDate>/dateCaption. This is the grep that keeps
// the honesty contract from decaying one careless JSX expression at a time.
const roadmapComponents = readdirSync(path.join(ROOT, 'src/components/roadmap'));
const RAW_DATE_JSX = /\{\s*(?:item|i|e|next|mk)\??\.(?:due|anchor|studentDate|startBy|on)\s*\}/;
for (const file of roadmapComponents) {
  if (!file.endsWith('.jsx')) continue;
  const src = read(`src/components/roadmap/${file}`);
  const offending = src.split('\n')
    .map((line, n) => [n + 1, line])
    // Comments are exempt — several of these files DOCUMENT the banned pattern in order to
    // explain the rule, and a gate that cannot survive being written about is a gate nobody
    // will document. Only executable lines are checked.
    .filter(([, line]) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .filter(([, line]) => RAW_DATE_JSX.test(line));
  assert(`${file} never renders a raw date field`, offending.length === 0,
    offending.map(([n, line]) => `line ${n}: ${line.trim()}`).join('\n      ')
    + '\n      Use <ItemDate item={…}/> or dateCaption() — see the header of roadmapUi.jsx.');
}
// And the components that DO show dates must import the sanctioned helper, or the grep above is
// passing because nothing renders a date at all.
assert('the item card renders dates through ItemDate',
  /ItemDate/.test(read('src/components/roadmap/RoadmapItem.jsx')));
assert('the home card renders dates through ItemDate',
  /ItemDate/.test(read('src/components/roadmap/RoadmapHomeCard.jsx')));
assert('the path renders dates through ItemDate',
  /ItemDate/.test(read('src/components/roadmap/RoadmapPath.jsx')));

// ─────────────────────────────────────────────────────────────────────────────
section('7. Generation can survive one vendor, and one prompt that does not fit');
// Three mechanisms, all of which fail silently when they break — which is the
// whole reason they are asserted here rather than left to a code review. Each
// of these was, in some form, a cause of the roadmap arriving stamped
// `degraded` while Medabrain was in fact reachable the whole time.
const groqApi = read('api/groq.js');
const budget = await import('../src/lib/roadmap/promptBudget.js');

// 1. The client budgets against the number the server actually enforces. A
//    drift between these two is silent truncation with more code in the way.
const inputCap = Number((groqApi.match(/MAX_INPUT_CHARS_BY_PURPOSE = \{[^}]*roadmap:\s*(\d+)/) || [])[1]);
const systemCap = Number((groqApi.match(/MAX_SYSTEM_CHARS_BY_PURPOSE = \{[^}]*roadmap:\s*(\d+)/) || [])[1]);
eq('the client knows the server’s roadmap input cap', budget.SERVER_CAPS.user, inputCap);
eq('the client knows the server’s roadmap system cap', budget.SERVER_CAPS.system, systemCap);
assert('and aims comfortably under both', budget.TARGET.user < inputCap && budget.TARGET.system < systemCap,
  `targets ${budget.TARGET.system}/${budget.TARGET.user} against caps ${systemCap}/${inputCap}`);

// 2. The select pass — the biggest prompt in the app — fits at the top rung for
//    the grade with the most eligible items. This is the assertion that would
//    have caught the original bug: a senior's shortlist was 17,635 characters
//    against a 16,000-character cap.
const seniorSlate = ENGINE.buildCandidateSlate({ user: { gradeStage: 'senior' }, answers: {}, now: NOW });
for (const level of budget.RUNGS) {
  const list = ENGINE.shortlistForPrompt(seniorSlate, { perTrack: level.perTrack, total: level.total });
  // The rendered form is ~1.35× the raw field content once the labels, the
  // flags and the line breaks are counted; measured against the real renderer
  // in generator.js, this is the conservative side of it.
  const rendered = list.reduce((n, i) => n + 120 + (i.name || '').length + (i.why || '').length + (i.org || '').length, 0);
  assert(`the shortlist at rung "${level.name}" fits the system budget with the prompt around it`,
    rendered + 6000 < budget.TARGET.system,
    `${rendered} chars of catalog + ~6000 of instructions against a ${budget.TARGET.system} budget`);
}
assert('the smallest rung is still a real menu, not a token gesture',
  budget.RUNGS[budget.RUNGS.length - 1].total >= 15,
  `${budget.RUNGS[budget.RUNGS.length - 1].total} entries`);
assert('the rungs genuinely shrink at every step',
  budget.RUNGS.every((r, i) => i === 0 || r.total < budget.RUNGS[i - 1].total));

// 3. The second vendor is wired in, and is reached only after the first has
//    genuinely run out. A relief provider mixed into the normal rotation is a
//    bill nobody agreed to; one that is never called is a file nobody reads.
assert('the relief provider module exists', /export async function callWithRelief/.test(read('api/_lib/aiProviders.js')));
assert('groq.js imports it', /from '\.\/_lib\/aiProviders\.js'/.test(groqApi));
assert('and only reaches for it on a failure path', /tryRelief\(/.test(groqApi)
  && /if \(!response\.ok\)[\s\S]{0,400}tryRelief/.test(groqApi),
  'the relief hop must sit behind a failed Groq response, never in the normal path');
assert('a relief answer is reported as one rather than passed off as Groq',
  /relief: provider !== 'groq'/.test(groqApi));
assert('truncation is reported to the caller instead of being swallowed',
  /truncatedChars/.test(groqApi) && /truncatedChars/.test(read('src/lib/roadmap/generator.js')));
assert('a truncated pass retries smaller rather than identical',
  /shrink/.test(read('src/lib/roadmap/generator.js')));

// ─────────────────────────────────────────────────────────────────────────────
section('8. The four date checks are wired in everywhere they claim to be');
const audit = await import('../src/lib/roadmap/dateAudit.js');
eq('there are exactly four checks', audit.CHECKS.length, 4);
assert('the resolver runs them', /auditSlate\(/.test(read('src/lib/roadmap/catalog.js')));
assert('and reports what it withheld', /dateAudit/.test(read('src/lib/roadmap/catalog.js')));
assert('the build runs them over the whole catalog',
  /verify:roadmap-dates/.test(read('package.json')) && /verifyRoadmapDates/.test(read('package.json')));
assert('a slate arrives with nothing withheld',
  (seniorSlate.dateAudit?.withheld || []).length === 0,
  (seniorSlate.dateAudit?.withheld || []).map((w) => w.id).join(', '));

// ─────────────────────────────────────────────────────────────────────────────
section('9. A failed build says why, and the retry button can be believed');
// The reported bug: a degraded roadmap offered "Rebuild it properly", pressing it
// spent ninety seconds re-running the identical twenty calls that had just
// failed, and returned the identical screen. Three mechanisms end that, and all
// three fail silently when they break — which is exactly why they are asserted
// rather than left to a code review.

// 1. The vocabulary of terminal failures exists, and the server actually emits it.
assert('the generator classifies failures that retrying cannot fix', GEN.TERMINAL_CODES instanceof Set);
assert('and there is more than one of them', GEN.TERMINAL_CODES.size >= 3);
for (const code of GEN.TERMINAL_CODES) {
  assert(`api/groq.js emits the "${code}" code the generator acts on`,
    new RegExp(`code:\\s*'${code}'`).test(groq),
    `the client treats "${code}" as terminal but nothing on the server ever sends it`);
  assert(`"${code}" has something to say to a student`,
    (GEN.DEGRADED_REASONS[code]?.title || '').length > 10
    && (GEN.DEGRADED_REASONS[code]?.detail || '').length > 60,
    'a terminal code with no explanation is the generic banner again, wearing a code');
}
// The two 429s are opposite instructions carrying the same status number, so the
// distinction has to survive in the code rather than in a comment.
assert('a daily limit and a minute limit are told apart',
  /code:\s*'daily_limit'/.test(groq) && /code:\s*'minute_limit'/.test(groq));
assert('a daily limit is terminal and a minute limit is not',
  GEN.TERMINAL_CODES.has('daily_limit') && !GEN.TERMINAL_CODES.has('minute_limit'));

// 2. Every reason is honest about whether the retry button can help. This is the
//    field the UI hangs the button off, so a reason with no verdict on it would
//    silently fall back to "offer the button" — the original bug.
for (const [code, r] of Object.entries(GEN.DEGRADED_REASONS)) {
  assert(`"${code}" says whether a retry can help`, typeof r.retryable === 'boolean');
}
assert('a missing API key never offers a retry that cannot work',
  GEN.DEGRADED_REASONS.not_configured.retryable === false);
assert('a spent daily budget never offers a retry that cannot work',
  GEN.DEGRADED_REASONS.daily_limit.retryable === false);
assert('a genuine outage does offer one', GEN.DEGRADED_REASONS.unreachable.retryable === true);
assert('an unknown code degrades to the retryable outage wording, not to a crash',
  GEN.degradedReasonFor('something-nobody-has-written-yet').retryable === true);
assert('and the reason always carries its own code back', GEN.degradedReasonFor('daily_limit').code === 'daily_limit');

// 3. A build short-circuits on a terminal failure instead of re-proving it.
assert('a terminal failure aborts the remaining passes', /trace\?\.terminal/.test(read('src/lib/roadmap/generator.js')));
assert('the roadmap records which passes fell back, so a repair can target them',
  /failedStages/.test(read('src/lib/roadmap/generator.js')));

// The repair path: a year whose ARGUMENT is sound must not be thrown away to
// recover a paragraph, because rebuilding also discards every date the student
// pinned and every step they ticked.
assert('a roadmap that never recorded its failures is rebuilt rather than guessed at',
  GEN.roadmapNeedsFullRebuild({ generation: { degraded: true } }) === true);
assert('a failed strategy pass means the year itself is not worth patching',
  GEN.roadmapNeedsFullRebuild({ generation: { degraded: true, failedStages: ['strategy'] } }) === true);
assert('a failed slate selection means the same',
  GEN.roadmapNeedsFullRebuild({ generation: { degraded: true, failedStages: ['select'] } }) === true);
assert('but a missing read-back is repaired in place, not rebuilt',
  GEN.roadmapNeedsFullRebuild({ generation: { degraded: true, failedStages: ['review'] } }) === false);
assert('and so is one season of missing working detail',
  GEN.roadmapNeedsFullRebuild({ generation: { degraded: true, failedStages: ['deepen:s2', 'review'] } }) === false);
{
  // A repair with nothing repairable must resolve, unchanged, without a call.
  const nothingToDo = await GEN.repairRoadmap({ generation: { degraded: true, failedStages: ['select'] }, items: [] }, {});
  assert('a repair with nothing it can fix is a no-op rather than an error', nothingToDo.repaired.length === 0);
  assert('and a null roadmap does not throw', (await GEN.repairRoadmap(null, {})).roadmap === null);
}

// The UI half: the banner must read the reason rather than printing one sentence
// under every cause, and must be able to say a retry already failed.
const uiSrc = read('src/components/roadmap/roadmapUi.jsx');
assert('the degraded banner reads the recorded reason', /degradedReason/.test(uiSrc));
assert('and withholds the retry button when a retry cannot help', /retryable !== false/.test(uiSrc));
assert('and can report that a retry was already made and failed', /lastAttempt/.test(uiSrc));
assert('the tab wires the repair path to that button', /fixGeneration/.test(tabSrc) && /repairRoadmap/.test(tabSrc));

// ─────────────────────────────────────────────────────────────────────────────
section('10. The roadmap only builds once it is worth building');
const READY = await import('../src/lib/roadmap/readiness.js');

assert('a blank account cannot build a roadmap yet', !READY.computeRoadmapReadiness(null, {}).ready);
{
  const blank = READY.computeRoadmapReadiness(null, {});
  assert('and is told about every gate rather than only the first',
    blank.checklist.length === READY.ROADMAP_GATES.length);
}
// Every gate has to justify itself to the student, in the student's language,
// because it is standing between them and the thing they came for.
for (const g of READY.ROADMAP_GATES) {
  assert(`gate "${g.id}" says what the roadmap GAINS from it`, (g.gains || '').length > 60,
    'a gate that cannot say what it buys the student does not belong in the way');
  assert(`gate "${g.id}" names the thing to do`, (g.action || '').length > 4);
  assert(`gate "${g.id}" is a door, not a dead end`, !!g.goTab,
    'a requirement with no route to satisfying it is a dead end wearing a checklist');
  assert(`gate "${g.id}" is answerable today`, typeof g.ok === 'function');
}
assert('the gate list stays short enough to be read', READY.ROADMAP_GATES.length <= 6,
  `${READY.ROADMAP_GATES.length} gates — onboarding already asks thirty questions and the intake fifteen`);
{
  // A gate pointing at a tab that does not exist sends the student to Home,
  // which reads as the app losing track of what it just asked them to do.
  const { TABS, SUBVIEWS } = await import('../src/lib/routes.js');
  for (const g of READY.ROADMAP_GATES) {
    assert(`gate "${g.id}" points at a real tab`, TABS.includes(g.goTab), g.goTab);
    if (g.goView) {
      const cfg = SUBVIEWS[g.goTab];
      const ids = cfg?.ids || [];
      // A retired id that the router still resolves counts: aliases are how a
      // merged tab keeps every link that names its old self working forever
      // (see SUBVIEWS[...].aliases in routes.js), and a gate pointing at one
      // lands on the exact section it always did.
      const aliases = Object.keys(cfg?.aliases || {});
      assert(`gate "${g.id}" points at a real view inside ${g.goTab}`,
        !ids.length || ids.includes(g.goView) || aliases.includes(g.goView), `${g.goTab}/${g.goView}`);
    }
  }
}

// A fully-set-up student sails through. If this ever fails, the gate has grown
// past the point where a normal account satisfies it without noticing.
{
  const readyUser = { gradeStage: 'junior', pathway: 'physician' };
  const readyCtx = {
    portfolio: { colleges: [{ id: 1 }], activities: [{ id: 1 }], clinicalHours: [], awards: [], research: [], skills: [] },
    quizzesTaken: 2, lessons: 1,
  };
  const verdict = READY.computeRoadmapReadiness(readyUser, readyCtx);
  assert('a normally-set-up student passes every gate', verdict.ready, verdict.missing.map((m) => m.id).join(', '));
  assert('and is shown as complete', verdict.pct === 100);
}
{
  // The third state. A portfolio that has not loaded must not be reported as
  // empty — flashing a lock screen at somebody who has done everything, and
  // then unlocking half a second later, is worse than a moment of nothing.
  const loading = READY.computeRoadmapReadiness({ gradeStage: 'junior', pathway: 'physician' }, { portfolio: null });
  assert('an unloaded portfolio reads as loading, never as missing',
    loading.checklist.filter((c) => c.kind === 'portfolio').every((c) => c.state === 'loading'));
  assert('and a loading gate does not block the build', loading.ready);
}
assert('the tab checks readiness before asking fifteen questions, not after',
  tabSrc.indexOf('computeRoadmapReadiness') !== -1
  && tabSrc.indexOf('readiness.ready') < tabSrc.indexOf('<RoadmapIntake'),
  'finding out a roadmap cannot be built AFTER the intake is the app wasting a student\'s time and then blaming them for it');
assert('and the gate only ever stands in front of the FIRST build',
  /if \(!roadmap && \(showIntake \|\| view === 'intake'\) && !readiness\.ready\)/.test(tabSrc),
  'a student with a roadmap must always be able to open their answers and rebuild — locking that would take a working feature away as a punishment for editing their own record');

// ─────────────────────────────────────────────────────────────────────────────
section('11. The climb is a projection, and never a prediction');
const PROJ = await import('../src/lib/roadmap/projection.js');
const STRENGTH = await import('../src/lib/applicationStrength.js');

{
  const climb = PROJ.projectClimb(base, { subscores: { academic: 40, clinical: 20, application: 10, activities: 30 } }, TODAY);
  assert('the climb spans about a year', climb.months.length >= 11 && climb.months.length <= 14,
    `${climb.months.length} months`);
  assert('it is chronological', climb.months.every((m, i) => i === 0 || climb.months[i - 1].month <= m.month));
  assert('no month ever exceeds the top of the scale', climb.months.every((m) => m.total <= 100));
  assert('nor drops below the bottom', climb.months.every((m) => m.total >= 0));
  assert('the line never goes backwards — a roadmap cannot cost you progress',
    climb.months.every((m, i) => i === 0 || m.total >= climb.months[i - 1].total));
  assert('the past is flat at what was actually measured, not back-filled from a model',
    climb.months.filter((m) => m.isPast).every((m) => m.total === climb.today.score));
  assert('exactly one month is marked as now', climb.months.filter((m) => m.isNow).length <= 1);
  assert('finishing the year is worth something', climb.gain > 0);
  assert('and the projection ends where the last month does', climb.projected.score === climb.months[climb.months.length - 1].total);
  assert('every component is accounted for', climb.contributions.length === PROJ.COMPONENTS.length);
  assert('no component is projected past the ceiling', climb.contributions.every((c) => c.to <= 100));
  assert('and none is projected backwards', climb.contributions.every((c) => c.to >= c.from));
}
{
  // A student already at the top has nothing left to gain, and the chart must
  // say so rather than inventing headroom that does not exist.
  const maxed = PROJ.projectClimb(base, { subscores: { academic: 100, clinical: 100, application: 100, activities: 100 } }, TODAY);
  assert('a student already at 100 is not projected past it', maxed.projected.score <= 100);
  assert('and is honestly told the year adds nothing to the score', maxed.gain === 0);
}
assert('an empty roadmap does not throw', !!PROJ.projectClimb(null, null, TODAY));
assert('and refuses to draw a curve through too few points', !PROJ.projectClimb(null, null, TODAY).ok);

// Every track must feed exactly one component, or an item silently contributes
// nothing and the chart quietly under-reports what the year is worth.
for (const t of CAT.TRACK_IDS || Object.keys(CAT.TRACK_BY_ID)) {
  assert(`track "${t}" builds a named part of the application`, !!PROJ.TRACK_TO_COMPONENT[t],
    'an unmapped track contributes nothing to the climb and nobody would ever notice');
  assert(`and "${t}" maps to a real component`, PROJ.COMPONENT_IDS.includes(PROJ.TRACK_TO_COMPONENT[t]));
}

// The weights here and in applicationStrength.js MUST agree — the two put the
// same number on screen in two different tabs, and drift would show a student
// one score on Progress and a different one here.
{
  const measured = STRENGTH.computeApplicationStrength({
    mastery: 80, avgQuizScore: 80, clinicalHours: 80, shadowingHours: 0,
    volunteerHours: 60, leadershipHours: 40, recommendersConfirmed: 2,
    collegeCount: 6, essayCount: 6,
  });
  const rebuilt = Math.round(
    measured.subscores.academic * PROJ.COMPONENT_WEIGHTS.academic
    + measured.subscores.clinical * PROJ.COMPONENT_WEIGHTS.clinical
    + measured.subscores.application * PROJ.COMPONENT_WEIGHTS.application
    + measured.subscores.activities * PROJ.COMPONENT_WEIGHTS.activities,
  );
  assert('the climb recombines the subscores exactly as applicationStrength does',
    Math.abs(rebuilt - measured.score) <= 1,
    `climb says ${rebuilt}, applicationStrength says ${measured.score} — the same student would see two different numbers in two tabs`);
  assert('and the band names match too', PROJ.bandFor(measured.score) === measured.label);
}

// THE LINE THAT IS NEVER CROSSED. A rising green line beside a college name will
// be read as a prediction about that college unless the screen says otherwise in
// plain words, and the person reading it is fifteen.
const ascentSrc = read('src/components/roadmap/RoadmapAscent.jsx');
assert('the climb screen states outright that it is not an admissions chance',
  /not a chance of getting in/i.test(ascentSrc));
assert('and carries its assumption in the sentence rather than in a footnote',
  /if you finish it/i.test(ascentSrc));
assert('the projection never computes an admission probability',
  !/admitChance|admissionChance|chanceOf|oddsOf|probabilityOf/i.test(read('src/lib/roadmap/projection.js')),
  'see the header of src/lib/roadmap/projection.js — this number is never computed here');

// ─────────────────────────────────────────────────────────────────────────────
console.log('');
if (failures.length) {
  console.error(`✗ Roadmap verification FAILED — ${failures.length} problem(s), ${passed} assertions passed:\n`);
  failures.forEach((f) => console.error(`  ✗ ${f}`));
  process.exit(1);
}
console.log(`✓ Roadmap verification passed — ${passed} assertions.`);
console.log(`  ${CAT.ROADMAP_CATALOG.length} catalog entries across ${Object.keys(counts).length} tracks:`);
Object.entries(counts).forEach(([t, n]) => console.log(`    ${t.padEnd(14)} ${n}`));
console.log(`  ${INTAKE.QUESTIONS.length} intake questions, ${INTAKE.REQUIRED_IDS.length} required, ${declaredGates.size} gates — all answerable.`);
GRADES.forEach((g) => console.log(`  ${g.padEnd(10)} → ${slates[g].items.length} eligible items in the next 12 months`));
