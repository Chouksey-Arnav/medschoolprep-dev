#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// verifyCommonApp — the Common Application mirror and the Portfolio ↔ Common App
// sync, asserted end to end.
//
// Three things this suite exists to prevent, in order of how badly they would
// hurt a student:
//
//  1. A WRONG LIMIT. The whole value of the mirror is that a student can trust
//     it to match the real form. A description written to a cap we got wrong is
//     truncated mid-sentence by the real field and discovered after submitting.
//     Every limit is pinned here against the number the real Common App
//     enforces, so changing one is a deliberate act with a failing test in front
//     of it.
//
//  2. A FALSE READINESS CLAIM. "Ready" has to mean ready. The derivation must
//     never report a section complete on data it invented, must report a section
//     it cannot see as unknown rather than as zero, and must survive a portfolio
//     that is empty, partial, or malformed without either throwing or lying.
//
//  3. A SYNC THAT LOSES AN EDIT. The ledger's only job is to notice that the
//     Portfolio changed after the student copied something into the real form.
//     Every state transition is exercised here, including the two that are easy
//     to get wrong and invisible when wrong: drift after an edit, and a conflict
//     when both sides move.
// ─────────────────────────────────────────────────────────────────────────────

const CA = await import('../src/lib/commonApp/index.js');

let failures = [];
const assert = (label, cond, detail = '') => {
  if (cond) console.log(`  ✓ ${label}`);
  else { failures.push(`${label}${detail ? ` — ${detail}` : ''}`); console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
};
const eq = (label, actual, expected) =>
  assert(label, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
const section = (name) => console.log(`\n${name}`);

// ─────────────────────────────────────────────────────────────────────────────
section('1. The form is modelled with the real limits and the real names');

// THE PINNED NUMBERS. Every one of these is a limit the real Common Application
// enforces. A failing assertion here is not a broken test — it is a claim that
// one of these changed, which needs checking against the live form before the
// number is edited.
eq('an activity position is capped at 50 characters', CA.CA_LIMITS.position, 50);
eq('an organization name is capped at 100 characters', CA.CA_LIMITS.organization, 100);
eq('an activity description is capped at 150 characters', CA.CA_LIMITS.description, 150);
eq('an honor title is capped at 100 characters', CA.CA_LIMITS.honorTitle, 100);
eq('there are exactly 10 activity slots', CA.CA_LIMITS.maxActivities, 10);
eq('there are exactly 5 honor slots', CA.CA_LIMITS.maxHonors, 5);
eq('hours per week is a two-digit field', CA.CA_LIMITS.maxHours, 99);
eq('weeks per year caps at 52', CA.CA_LIMITS.maxWeeks, 52);
eq('the personal essay ceiling is 650 words', CA.CA_WRITING_LIMITS.personalEssayMax, 650);
eq('the personal essay floor is 250 words', CA.CA_WRITING_LIMITS.personalEssayMin, 250);
eq('additional information is 650 words', CA.CA_WRITING_LIMITS.additionalInfoMax, 650);
eq('there are 3 community-based-organization slots', CA.CA_WRITING_LIMITS.maxCommunityOrgs, 3);
eq('the activity category dropdown has 30 options', CA.CA_CATEGORIES.length, 30);
eq('there are 7 personal essay prompts', CA.CA_ESSAY_PROMPTS.length, 7);

// ── The other copy of these numbers ─────────────────────────────────────────
// The Narrative Method Engine ships its own Common App auditor (src/lib/ivy/commonApp.js) with
// its own LIMITS table in src/data/ivy/commonAppRules.js. That separation is deliberate and
// correct — this layer MODELS and DERIVES the form, that one AUDITS a draft opinionatedly — but
// it means the same real-world number is written down twice, in two files, by two features.
//
// Two copies of a fact eventually disagree, and when these two disagree the app tells a student
// two different things about the same field of the same form. So they are pinned to each other
// here: either both are right or the build fails. Neither module owns the other; this assertion
// is the contract between them.
const IVY = await import('../src/data/ivy/commonAppRules.js');
for (const [ours, theirs, label] of [
  [CA.CA_LIMITS.description, IVY.LIMITS.activityDescription, 'activity description'],
  [CA.CA_LIMITS.position, IVY.LIMITS.activityPosition, 'activity position'],
  [CA.CA_LIMITS.organization, IVY.LIMITS.activityOrganization, 'organization name'],
  [CA.CA_LIMITS.maxActivities, IVY.LIMITS.activitySlots, 'activity slots'],
  [CA.CA_LIMITS.maxHonors, IVY.LIMITS.honorSlots, 'honor slots'],
  [CA.CA_WRITING_LIMITS.personalEssayMax, IVY.LIMITS.personalStatement, 'personal essay ceiling'],
  [CA.CA_WRITING_LIMITS.personalEssayMin, IVY.LIMITS.personalStatementMin, 'personal essay floor'],
  [CA.CA_WRITING_LIMITS.additionalInfoMax, IVY.LIMITS.additionalInfo, 'additional information'],
]) {
  eq(`the ${label} limit agrees with the narrative engine's copy`, ours, theirs);
}

assert('every section has a unique id',
  new Set(CA.CA_SECTION_IDS).size === CA.CA_SECTION_IDS.length);
for (const s of CA.CA_SECTIONS) {
  assert(`"${s.id}" names what the real form calls it`, (s.formName || '').length > 2, s.formName);
  assert(`"${s.id}" explains why it matters`, (s.why || '').length > 40);
  assert(`"${s.id}" has a student-facing label`, (s.label || '').length > 2);
  // A field with a limit must say what the limit counts. "650" means something
  // very different in characters and in words and a counter that gets that wrong
  // is worse than no counter.
  for (const f of s.fields || []) {
    if (f.limit != null) assert(`"${s.id}.${f.id}" says what its limit counts`, ['characters', 'words', 'max value'].includes(f.unit), f.unit);
    assert(`"${s.id}.${f.id}" has a label`, (f.label || '').length > 2);
  }
}

// Exactly the sections we can genuinely read carry a source. A section claiming a
// Portfolio source it does not have would link a student to a panel that does
// not feed it.
for (const s of CA.CA_SECTIONS) {
  if (s.status === 'external') assert(`"${s.id}" is external and claims no Portfolio source`, !s.source);
}

// The reverse index must resolve. Every panel in the app asks this to find out
// what it is building toward.
assert('the activities panel knows it feeds the Activities section',
  CA.sectionsFedBy('portfolio', 'resume', 'activities').some((s) => s.id === 'activities'));
assert('the essay workspace feeds more than one Writing section',
  CA.sectionsFedBy('portfolio', 'applying', 'essays').length >= 2,
  'the personal essay, additional information and supplements are three different sections');
eq('a surface that feeds nothing says so', CA.sectionsFedBy('sat', 'practice').length, 0);

// A NAMED section that has no mapping must return nothing, never the union of its view's
// mappings. The Applying page has nine sections and six mappings; when this fell back to the
// view-level key, financial aid, interview prep, combined degrees, the MedEx Score and the
// narrative reading each rendered a badge claiming they fed Testing, Writing, the College List
// and Recommenders at once. Five panels making a false claim, and none of them wrong in a way a
// reader would notice.
for (const unmapped of ['aid', 'interview', 'combined', 'medex', 'narrative']) {
  eq(`the "${unmapped}" section claims to feed nothing rather than everything`,
    CA.sectionsFedBy('portfolio', 'applying', unmapped).length, 0);
}
// …while a caller with no section to give still gets the view's union, which is what the
// fallback was written for.
assert('a caller that names no section still gets the view mapping',
  CA.sectionsFedBy('portfolio', 'applying').length > 1);
assert('every declared source resolves back through the index',
  CA.CA_SECTIONS.filter((s) => s.source).every((s) =>
    CA.sectionsFedBy(s.source.tab, s.source.view, s.source.section).some((x) => x.id === s.id)));

// ─────────────────────────────────────────────────────────────────────────────
section('2. Derivation never invents, and never lies about what it cannot see');

const EMPTY = { snapshot: {}, user: {} };
const emptyApp = CA.deriveApplication(EMPTY);
eq('an empty portfolio still yields every section', emptyApp.sections.length, CA.CA_SECTIONS.length);
assert('an empty portfolio reports nothing as ready',
  emptyApp.sections.every((s) => s.status !== 'ready'),
  emptyApp.sections.filter((s) => s.status === 'ready').map((s) => s.id).join(', '));
assert('a section we cannot see reports unknown rather than zero',
  emptyApp.sections.filter((s) => s.status === 'unknown').length > 0);
assert('the external sections are exactly the unknown ones on an empty portfolio',
  CA.CA_SECTIONS.filter((s) => s.status === 'external').every((s) =>
    emptyApp.sections.find((x) => x.id === s.id)?.status === 'unknown'));
assert('counts report how many sections we can even speak to',
  emptyApp.counts.visible + emptyApp.counts.unknown === emptyApp.counts.total);

// Nothing anywhere emits a single headline percentage — see the header of
// derive.js for why that number would be wrong in both directions at once.
assert('no headline completion percentage is produced',
  !('percent' in emptyApp.counts) && !('completion' in emptyApp.counts));

// Malformed rows must not take the page down. Every one of these is a shape a
// real database has produced at some point.
for (const junk of [null, undefined, 'nope', 42, [], { activities: null }, { activities: 'x' },
  { awards: [null] }, { essays: [{}] }, { colleges: [{ id: null }] }, { gpaEntries: [{ gpa: null }] }]) {
  let ok = true;
  try { CA.deriveApplication({ snapshot: junk, user: null }); } catch { ok = false; }
  assert(`a ${JSON.stringify(junk)} snapshot does not throw`, ok);
}
// And a section that DOES fail reports unknown rather than empty — telling a
// student their essay is missing because of a bug in our code is the worst
// available outcome.
{
  const hostile = { snapshot: { get activities() { throw new Error('boom'); } }, user: {} };
  let app;
  let threw = false;
  try { app = CA.deriveApplication(hostile); } catch { threw = true; }
  assert('a throwing section does not take the application down', !threw);
  eq('a throwing section reports unknown, not empty',
    app?.sections.find((s) => s.id === 'activities')?.status, 'unknown');
}

// A real portfolio.
const SNAP = {
  activities: [
    { id: 'a1', activity_type: 'Volunteering', position: 'Shift lead', organization: "St. Mary's Hospital",
      description: 'Ran the front desk on Saturday mornings', impact: 'Trained 6 new volunteers',
      hours_per_week: 4, weeks_per_year: 40, grade_levels: ['10', '11'], status: 'ongoing', leadership_role: true },
    { id: 'a2', activity_type: 'Research', position: 'Student researcher', organization: 'State University',
      description: 'x'.repeat(300), impact: '', hours_per_week: 10, weeks_per_year: 8, grade_levels: ['11'] },
  ],
  awards: [
    { id: 'w1', title: 'National Merit Semifinalist', level: 'National', grade_level: '11' },
    { id: 'w2', title: 'Science fair, first place', level: 'State/Regional', grade_level: '10' },
  ],
  gpaEntries: [{ id: 'g1', term: 'Junior fall', gpa: 4.1, weighted: true, created_at: '2026-01-01' }],
  essays: [{ id: 'e1', title: 'Personal statement', prompt: '', content: 'word '.repeat(400), status: 'drafting' }],
  colleges: [{ id: 'c1', name: 'Johns Hopkins', rd_deadline: '2027-01-02' }],
  testScores: [{ id: 't1', test_type: 'SAT', composite: 1480, test_date: '2026-05-02' }],
  recommenders: [{ id: 'r1', name: 'Ms. Patel', relationship: 'AP Biology', status: 'asked' }],
};
const app = CA.deriveApplication({ snapshot: SNAP, user: { name: 'Ada', email: 'ada@example.com', dreamRole: 'surgeon' } });
const byId = Object.fromEntries(app.sections.map((s) => [s.id, s]));

eq('activities with an over-limit description report blocked', byId.activities.status, 'blocked');
assert('the blocker names the real overflow', byId.activities.blockers.some((b) => /over the 150-character/.test(b)),
  byId.activities.blockers.join(' | '));
eq('honors derive from awards', byId['education-honors'].entries.length, 2);
assert('honors rank national above regional',
  byId['education-honors'].entries[0].title.includes('National Merit'));
eq('grades derive from the GPA log', byId['education-grades'].status, 'ready');
eq('the college list derives', byId['college-list'].entries.length, 1);
eq('testing derives a real sitting', byId.testing.status, 'ready');
eq('recommenders count only the ones actually asked', byId.recommenders.stats.asked, 1);
// The profile section is never 'ready': we hold two of a dozen real fields.
assert('profile never claims to be complete', byId.profile.status !== 'ready',
  'we hold two of this section\'s dozen fields and must not imply otherwise');

// An essay under the floor is as blocked as one over the ceiling — the real form
// rejects both, and only checking the ceiling is the easy half of this.
{
  const short = CA.deriveApplication({ snapshot: { essays: [{ id: 'e', title: 'Personal statement', content: 'word '.repeat(100) }] }, user: {} });
  const s = short.sections.find((x) => x.id === 'writing-essay');
  eq('an essay under 250 words is blocked', s.status, 'blocked');
  assert('and the reason names the floor', s.blockers.some((b) => /250-word floor/.test(b)), s.blockers.join(' | '));
}
{
  const long = CA.deriveApplication({ snapshot: { essays: [{ id: 'e', title: 'Personal statement', content: 'word '.repeat(700) }] }, user: {} });
  const s = long.sections.find((x) => x.id === 'writing-essay');
  eq('an essay over 650 words is blocked', s.status, 'blocked');
}

// The overflow past ten slots is reported, never silently dropped.
{
  const many = Array.from({ length: 14 }, (_, i) => ({
    id: `x${i}`, activity_type: 'Other', position: `Role ${i}`, organization: 'Org',
    description: 'Did a thing', hours_per_week: 2, weeks_per_year: 20, grade_levels: ['11'],
  }));
  const s = CA.deriveApplication({ snapshot: { activities: many }, user: {} }).sections.find((x) => x.id === 'activities');
  eq('only ten slots are used', s.entries.length, 10);
  eq('the other four are reported as overflow', s.stats.overflow, 4);
  assert('and the student is told they exist', s.gaps.some((g) => /did not fit|ranked outside/.test(g)), s.gaps.join(' | '));
}

// Flattening produces the stable keys the ledger depends on.
const flat = CA.flattenFields(app.sections);
assert('flattening produces keys', Object.keys(flat).length > 10);
assert('every key is section::entry::field', Object.keys(flat).every((k) => k.split('::').length === 3));
assert('a key round-trips through fieldKey',
  !!flat[CA.fieldKey('activities', 'a1', 'position')],
  'the key builder and the flattener must agree or the whole ledger misses');

// ─────────────────────────────────────────────────────────────────────────────
section('3. The sync ledger tracks both copies of the truth');

// Normalisation: every shape a stored blob can arrive in has to degrade to an
// empty ledger rather than throw. Throwing here means a Portfolio tab that will
// not render.
for (const junk of [null, undefined, 'x', 42, [], { filled: 'no' }, { filled: [] }, { overrides: null }, { sections: 7 }]) {
  const s = CA.normalizeState(junk);
  assert(`a ${JSON.stringify(junk)} ledger normalises to something usable`,
    s && typeof s.filled === 'object' && typeof s.overrides === 'object' && !Array.isArray(s.filled));
}

// Hashing ignores reflowing. A student who re-wrapped a paragraph has not
// changed it, and reporting that as drift would train them to ignore drift.
eq('hashing normalises whitespace', CA.hashValue('a  b\nc'), CA.hashValue('a b c'));
assert('hashing distinguishes real edits', CA.hashValue('a b c') !== CA.hashValue('a b d'));
eq('null and empty hash alike', CA.hashValue(null), CA.hashValue(''));

const KEY = CA.fieldKey('activities', 'a1', 'description');
const V1 = 'Ran the front desk on Saturday mornings';
const V2 = 'Ran the front desk and trained new volunteers';

let ledger = CA.emptyState();
eq('an untouched field with a value is unfilled',
  CA.fieldSyncState({ portfolioValue: V1, record: ledger.filled[KEY], override: null }).status, 'unfilled');
eq('an untouched field with no value is blank',
  CA.fieldSyncState({ portfolioValue: '', record: null, override: null }).status, 'blank');

ledger = CA.markFilled(ledger, KEY, V1);
eq('a field copied across reads as synced',
  CA.fieldSyncState({ portfolioValue: V1, record: ledger.filled[KEY], override: null }).status, 'synced');
assert('the ledger stores a hash, not the text',
  !JSON.stringify(ledger.filled[KEY]).includes('front desk'),
  'there is no reason to keep a second copy of a student\'s writing in a sync ledger');

// THE STATE THIS WHOLE FEATURE EXISTS FOR. Edit here after copying across, and
// the real form is now stale — which is invisible without a ledger and is
// exactly how a student submits a description they rewrote in November.
eq('editing after copying reads as drifted',
  CA.fieldSyncState({ portfolioValue: V2, record: ledger.filled[KEY], override: null }).status, 'drifted');
// Reflowing is not an edit.
eq('reflowing after copying is not drift',
  CA.fieldSyncState({ portfolioValue: `  ${V1}  `, record: ledger.filled[KEY], override: null }).status, 'synced');

// An override is a deliberate difference and must stop the nagging.
let withOverride = CA.setOverride(ledger, KEY, 'Front desk lead; trained 6 volunteers', V1);
eq('a Common-App-side edit reads as overridden',
  CA.fieldSyncState({ portfolioValue: V1, record: withOverride.filled[KEY], override: withOverride.overrides[KEY] }).status, 'overridden');
// …until the Portfolio moves under it, at which point nobody can pick.
eq('both sides moving is a conflict',
  CA.fieldSyncState({ portfolioValue: V2, record: withOverride.filled[KEY], override: withOverride.overrides[KEY] }).status, 'conflict');
// Keeping the override settles it without touching the Portfolio.
const settled = CA.keepOverride(withOverride, KEY, V2);
eq('keeping the override settles the conflict',
  CA.fieldSyncState({ portfolioValue: V2, record: settled.filled[KEY], override: settled.overrides[KEY] }).status, 'overridden');
// Marking filled again also settles it — the student has just said what is in
// the real form, which outranks everything we inferred.
const refilled = CA.markFilled(withOverride, KEY, V2);
eq('re-marking filled clears the override', refilled.overrides[KEY], undefined);
eq('and the field is synced again',
  CA.fieldSyncState({ portfolioValue: V2, record: refilled.filled[KEY], override: refilled.overrides[KEY] }).status, 'synced');

// Adoption is the reverse direction and returns an intent, never a write.
const intent = CA.adoptCommonAppWording(withOverride, KEY);
eq('adopting returns the Common-App-side text', intent.text, 'Front desk lead; trained 6 volunteers');
eq('adopting identifies the field to patch', intent.fieldId, 'description');
eq('adopting identifies the row to patch', intent.entryId, 'a1');
eq('adopting a field with no override returns nothing', CA.adoptCommonAppWording(ledger, KEY), null);

// Immutability: every write returns a new ledger and leaves the old one alone.
assert('writes are immutable', CA.markFilled(ledger, 'other', 'x') !== ledger && !ledger.filled.other);
assert('writes bump updatedAt', CA.markFilled(ledger, 'other', 'x').updatedAt >= ledger.updatedAt);
// clearFilled is the undo, and it must actually undo.
eq('clearing a filled field forgets it', CA.clearFilled(ledger, KEY).filled[KEY], undefined);

// ─────────────────────────────────────────────────────────────────────────────
section('4. Reconciliation reports what a student should act on');

// Marked against the DERIVED value, not the raw database column. The two differ
// on purpose: an activity's Common App description is impact-first, composed
// from the impact and description fields (see composeDescription). Hashing the
// raw column would report every activity as permanently drifted, which is the
// bug this line exists to keep caught.
const derivedDescription = flat[KEY].value;
const reconciledLedger = CA.markFilled(CA.emptyState(), KEY, derivedDescription);
const rec = CA.reconcile(app.sections, reconciledLedger);
assert('reconcile produces a verdict per field', Object.keys(rec.fields).length === Object.keys(flat).length);
assert('every field carries a status', Object.values(rec.fields).every((f) => typeof f.status === 'string'));
assert('the synced field is reported synced', rec.fields[KEY].status === 'synced', rec.fields[KEY].status);
assert('reconcile rolls up per section', rec.sections.length === app.sections.length);
assert('a blank field is never counted as tracked',
  rec.counts.tracked === Object.values(rec.fields).filter((f) => f.status !== 'blank').length);

// The attention list is the only part most students will read, so it must
// contain drift and conflicts and nothing else.
{
  const edited = { ...SNAP, activities: [{ ...SNAP.activities[0], description: 'Something completely different' }, SNAP.activities[1]] };
  const editedApp = CA.deriveApplication({ snapshot: edited, user: {} });
  const r2 = CA.reconcile(editedApp.sections, reconciledLedger);
  assert('an edit after copying shows up as needing attention', r2.attention.length >= 1, JSON.stringify(r2.counts));
  assert('the attention list is only drift and conflicts',
    r2.attention.every((a) => a.status === 'drifted' || a.status === 'conflict'));
  assert('each attention row says why in plain words',
    r2.attention.every((a) => (a.reason || '').length > 30));
  assert('each attention row names its section for the student',
    r2.attention.every((a) => (a.sectionLabel || '').length > 2));
}

// An orphan is a real fact, not litter: a row still sitting in the student's
// real Common App that they have since deleted here.
{
  const stale = CA.markFilled(reconciledLedger, CA.fieldKey('activities', 'deleted-row', 'description'), 'gone');
  const r3 = CA.reconcile(app.sections, stale);
  assert('a ledger entry with no matching field is reported as an orphan', r3.orphans.length === 1, JSON.stringify(r3.orphans));
  assert('orphans are not silently dropped', r3.counts.orphans === 1);
  const forgotten = CA.forgetOrphans(stale, r3.orphans.map((o) => o.key));
  eq('and can be forgotten explicitly', CA.reconcile(app.sections, forgotten).orphans.length, 0);
}

// Reconciling against a missing or broken ledger must work — most students will
// have no ledger at all for most of the year.
for (const junk of [null, undefined, {}, 'x']) {
  let ok = true;
  try { CA.reconcile(app.sections, junk); } catch { ok = false; }
  assert(`reconciling against a ${JSON.stringify(junk)} ledger works`, ok);
}
assert('with no ledger, nothing needs attention', CA.reconcile(app.sections, null).attention.length === 0);

// ─────────────────────────────────────────────────────────────────────────────
section('5. The panel badge is ordered by what to fix first');

{
  const blocked = { status: 'blocked', blockers: ['Description is 150 over.'] };
  eq('a field that will not fit outranks everything', CA.panelBadge(blocked, { drifted: 3, conflict: 2 }).tone, 'error');
  eq('a conflict outranks drift', CA.panelBadge({ status: 'ready' }, { conflict: 1, drifted: 4, tracked: 5 }).tone, 'error');
  eq('drift outranks not-yet-copied', CA.panelBadge({ status: 'ready' }, { drifted: 1, unfilled: 4, tracked: 5 }).tone, 'warn');
  eq('a fully synced section reads good', CA.panelBadge({ status: 'ready' }, { tracked: 3, synced: 3 }).tone, 'good');
  eq('an empty section says so plainly', CA.panelBadge({ status: 'empty' }, null).tone, 'idle');
  // A section with no data has not passed a check, it has not taken one — so it
  // must not render a reassuring badge.
  eq('an unknown section produces no badge at all', CA.panelBadge({ status: 'unknown' }, null), null);
  eq('no section produces no badge', CA.panelBadge(null, null), null);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('');
if (failures.length) {
  console.log(`✗ Common App verification FAILED — ${failures.length} problem(s):\n`);
  failures.forEach((f) => console.log(`  ✗ ${f}`));
  process.exit(1);
}
console.log(`✓ Common App verification passed.`);
console.log(`  ${CA.CA_SECTIONS.length} sections modelled, ${CA.MIRRORED_SECTIONS.length} fed by the Portfolio.`);
console.log(`  ${CA.CA_LIMITS.maxActivities} activity slots · ${CA.CA_LIMITS.maxHonors} honor slots · ${CA.CA_ESSAY_PROMPTS.length} essay prompts.`);
