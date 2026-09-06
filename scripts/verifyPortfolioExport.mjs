#!/usr/bin/env node
/**
 * The gate on the four-year export: src/lib/portfolioDossier.js,
 * src/lib/entitlements.js and the dossier renderer in src/lib/exportPDF.js.
 *
 * There is no test runner in this repo, so this is the test suite for the
 * feature with the highest cost of being wrong in this whole application.
 *
 * ── The one that matters most ───────────────────────────────────────────────
 * The personal archive contains the student's reflection journal. That journal
 * is the only surface in the app a fifteen-year-old writes honestly in, and it
 * is honest precisely because nothing else can read it — not a parent, not a
 * counselor, not a scoring engine. A leak into a parent-visible export would
 * not merely breach a boundary; it would end the honesty that makes the journal
 * worth keeping, silently and permanently.
 *
 * So section 3 below is not a normal test section. It asserts that:
 *   • archive mode THROWS for a parent or counselor audience rather than
 *     quietly returning a stripped document, because a function that silently
 *     downgrades is one whose callers stop checking;
 *   • no reflection text appears anywhere in an application-mode document, in
 *     any section, checked by searching the serialised document for the actual
 *     private strings rather than by trusting the section list;
 *   • the entitlement predicate and the builder agree — two independent layers,
 *     both enforced.
 *
 * The rest guards the things that make the document worth having: totals that
 * match their rows, date ranges that match their dates, grade bucketing that
 * puts a September shift in the right school year, and a free preview that is
 * one real page of real data rather than a mock.
 *
 *   node scripts/verifyPortfolioExport.mjs
 */
import { register } from 'node:module';

register('./_appResolve.mjs', import.meta.url);

const D = await import('../src/lib/portfolioDossier.js');
const E = await import('../src/lib/entitlements.js');
const { exportPortfolioDossier } = await import('../src/lib/exportPDF.js');

let passed = 0;
const failures = [];
const assert = (label, cond, detail = '') => {
  if (cond) { passed += 1; return; }
  failures.push(`${label}${detail ? `\n      ${detail}` : ''}`);
};
const eq = (label, actual, expected) =>
  assert(label, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
const section = (n) => console.log(`\n${n}`);

const NOW = Date.parse('2026-10-05T12:00:00');

// Two strings that exist ONLY in private content. If either turns up in an
// application-mode document, something leaked.
const SECRET_JOURNAL = 'ZZPRIVATEJOURNALZZ';
const SECRET_WORKING_DOC = 'ZZWORKINGDOCZZ';
const SECRET_IMPACT = 'ZZPRIVATEIMPACTZZ';

const SNAP = {
  activities: [
    { activity_type: 'Clinical Volunteering', position: 'Volunteer', organization: 'Mercy Hospital',
      hours_per_week: 4, weeks_per_year: 30, grade_levels: ['10', '11'],
      description: 'Front desk and patient transport', impact: SECRET_IMPACT, status: 'ongoing',
      verification_status: 'verified' },
    { activity_type: 'Leadership', position: 'President', organization: 'HOSA Chapter',
      hours_per_week: 3, weeks_per_year: 32, leadership_role: true, grade_levels: ['11', '12'] },
    { activity_type: 'Research', position: 'Assistant', organization: 'State University Lab',
      hours_per_week: 6, weeks_per_year: 10 },
  ],
  awards: [{ title: 'HOSA State Finalist', level: 'State', grade_level: '11', issuing_organization: 'HOSA' }],
  clinicalHours: [
    { site_name: 'Mercy Hospital', site_type: 'Hospital', supervisor_name: 'Dr. Patel', hours: 8,
      entry_date: '2025-03-04', experience_kind: 'shadowing', notes: 'Full clinic day', verification_status: 'verified' },
    { site_name: 'Mercy Hospital', site_type: 'Hospital', supervisor_name: 'Dr. Patel', hours: 6,
      entry_date: '2025-05-11', experience_kind: 'shadowing' },
    { site_name: 'Free Clinic', site_type: 'Community Health / Free Clinic', supervisor_name: 'R. Gomez',
      hours: 40, entry_date: '2024-09-14', experience_kind: 'hands-on' },
  ],
  research: [{ title: 'Resistance survey', institution: 'State U', mentor_name: 'Dr. Lin', hours: 80, status: 'complete' }],
  skills: [
    { name: 'BLS/CPR', issuing_body: 'AHA', earned_date: '2024-06-01', expiry_date: '2026-06-01' },
    { name: 'Phlebotomy', issuing_body: 'NHA', earned_date: '2025-08-20', expiry_date: '2027-08-20' },
  ],
  gpaEntries: [{ term: '2024 Fall', gpa: 3.9, weighted: true, course_rigor: '3 AP' },
    { term: '2025 Spring', gpa: 4.0, weighted: true }],
  recommenders: [{ name: 'Dr. Patel', relationship: 'Physician or clinician you shadowed',
    type: 'individual', status: 'Asked', due_date: '2026-11-01', asked_at: '2026-08-05' }],
  testScores: [{ test_type: 'SAT', composite: 1480, test_date: '2026-03-14', section_scores: { RW: 730, Math: 750 } }],
  essays: [{ essay_kind: 'why_pathway', title: 'Why medicine', content: `It started at the free clinic. ${SECRET_WORKING_DOC}` },
    { essay_kind: 'supplemental', title: 'Drexel supplement', content: 'A public essay.' }],
};

const REFLECTIONS = [
  { entry_date: '2025-09-01', prompt_text: 'What surprised you this summer?', content: `How much of it is talking. ${SECRET_JOURNAL}` },
];

const STUDENT = { name: 'Maya Chen', gradeLabel: '12th grade', pathwayLabel: 'Physician', schoolName: 'Lincoln High' };

const build = (mode, audience, reflections = REFLECTIONS) =>
  D.buildDossier({ mode, audience, student: STUDENT, snapshot: SNAP, reflections, now: NOW });

// ─────────────────────────────────────────────────────────────────────────────
section('1. The document contains everything four years of logging produced');

const app = build('application', 'student');
const ids = app.sections.map(s => s.id);

for (const id of ['activities', 'clinical', 'research', 'awards', 'certifications',
  'coursework', 'recommenders', 'timeline']) {
  assert(`the ${id} section is present — a senior in October needs all of it`, ids.includes(id), ids.join(', '));
}
eq('the application-ready document carries no reflections section', ids.includes('reflections'), false);

assert('the profile names the student', app.meta.studentName === 'Maya Chen');
assert('and their grade and pathway', !!app.meta.gradeLabel && !!app.meta.pathwayLabel);
assert('the record states the span it covers', !!app.meta.recordSpan, JSON.stringify(app.meta));
assert('and when it was generated', !!app.meta.generatedLabel);

// ─────────────────────────────────────────────────────────────────────────────
section('2. Totals, date ranges and grouping are arithmetic, not decoration');

{
  const clinical = app.sections.find(s => s.id === 'clinical');
  const totals = clinical.groups.reduce((s, g) => s + g.totalHours, 0);
  eq('the shadowing log totals the hours that are actually in it', totals, 54);
  eq('it groups by site', clinical.groups.length, 2);
  eq('the busiest site is listed first', clinical.groups[0].label, 'Free Clinic');

  const mercy = clinical.groups.find(g => g.label === 'Mercy Hospital');
  eq('a site\'s total is the sum of its own entries', mercy.totalHours, 14);
  eq('a site shows the range of dates it spans', mercy.gradeSpan, 'Mar 2025 – May 2025');
  assert('each entry carries its supervisor', mercy.rows.every(r => /Dr\. Patel/.test(r.meta)));
  assert('each entry carries its specialty', mercy.rows.every(r => /Hospital/.test(r.meta)));
  assert('each entry carries its own date', mercy.rows.every(r => /2025/.test(r.title)));
  assert('entries within a site run oldest first', mercy.rows[0].title.includes('Mar'));

  const acts = app.sections.find(s => s.id === 'activities');
  assert('activities are grouped by kind rather than listed flat', acts.groups.length >= 2);
  const clinicalGroup = acts.groups.find(g => g.id === 'clinical');
  eq('an activity\'s hours come from hours/week × weeks/year', clinicalGroup.totalHours, 120);
  assert('a group states the grades it spans', /Grades/.test(clinicalGroup.gradeSpan || ''));

  eq('an expired credential is flagged rather than dropped',
    app.sections.find(s => s.id === 'certifications').rows.filter(r => r.flag === 'expired').length, 1);
  assert('and the valid one is not flagged',
    app.sections.find(s => s.id === 'certifications').rows.some(r => r.flag == null));
}

{
  eq('totals on the cover match the sections', app.stats.clinicalHours, 54);
  eq('distinct sites are counted', app.stats.sites, 2);
  eq('distinct supervisors are counted', app.stats.supervisors, 2);
  eq('every section is counted for the preview\'s closing line', app.stats.sectionCount, app.sections.length);
}

// The school-year bucketing. A September shift belongs to the year starting,
// not the year ending — get this wrong and every autumn entry lands a grade out.
eq('August starts a new school year', D.schoolYearOf('2025-08-15'), 2025);
eq('September belongs to the year that started', D.schoolYearOf('2024-09-14'), 2024);
eq('March belongs to the year that started the previous August', D.schoolYearOf('2025-03-04'), 2024);
eq('an undated value buckets as undated', D.schoolYearOf(null), null);
eq('the year label reads as a school year', D.schoolYearLabel(2024), '2024–25');

{
  const timeline = app.sections.find(s => s.id === 'timeline');
  assert('the timeline runs oldest year first',
    timeline.years[0].label < timeline.years[timeline.years.length - 1].label);
  const y2425 = timeline.years.find(y => y.label === '2024–25');
  assert('the September clinic shift lands in 2024–25', !!y2425 && y2425.events.some(e => /Free Clinic/.test(e.label)));
  const y2324 = timeline.years.find(y => y.label === '2023–24');
  assert('the June credential lands in 2023–24', !!y2324 && y2324.events.some(e => /BLS/.test(e.label)));
  assert('every timeline event carries a readable date', timeline.years
    .every(y => y.events.every(e => !!e.dateLabel)));
}

// ─────────────────────────────────────────────────────────────────────────────
section('3. The privacy boundary — the one that must never fail');

for (const audience of ['parent', 'counselor', 'admin', '', null, undefined]) {
  let threw = false;
  try { build('archive', audience); } catch { threw = true; }
  assert(`archive mode REFUSES audience "${audience}" rather than silently stripping reflections`, threw);
}
assert('the student can build their own archive', !!build('archive', 'student'));

// The real check: search the whole serialised document for the private strings.
// Asserting on the section list alone would miss a leak into any other section.
for (const audience of ['student', 'parent', 'counselor']) {
  const doc = build('application', audience);
  const serialised = JSON.stringify(doc);
  assert(`no journal text anywhere in an application document (audience: ${audience})`,
    !serialised.includes(SECRET_JOURNAL));
  assert(`no working-document text anywhere in an application document (audience: ${audience})`,
    !serialised.includes(SECRET_WORKING_DOC));
  // The opposite error, asserted in the same place so neither can be fixed at
  // the other's expense: an activity's `impact` line LOOKS private and is not.
  // It is the "what changed because you were there" field of a Common App
  // activity entry, written to be read by an admissions officer. Stripping it
  // would quietly remove application content from the application document.
  assert(`an activity's impact line IS in the application document (audience: ${audience})`,
    serialised.includes(SECRET_IMPACT));
}

{
  const archive = JSON.stringify(build('archive', 'student'));
  assert('the student\'s own archive DOES contain their journal', archive.includes(SECRET_JOURNAL));
  assert('and their working document', archive.includes(SECRET_WORKING_DOC));
  assert('and still carries the application content alongside it', archive.includes(SECRET_IMPACT));
  const doc = build('archive', 'student');
  eq('the archive marks itself as containing private content', doc.meta.containsPrivate, true);
  const refl = doc.sections.find(s => s.id === 'reflections');
  assert('and the section says it is never in the shareable version', /never included/i.test(refl.note));
  eq('the application-ready document does not mark itself private', app.meta.containsPrivate, false);
}

// The supplemental essay is application content, not private content — the
// filter must not sweep up everything in the essays table.
assert('a supplemental essay is not treated as a private reflection',
  !JSON.stringify(build('archive', 'student')).includes('A public essay.'));

// Entitlements and the builder must agree, independently.
eq('an unknown plan is free, never paid', E.readPlan({}).id, 'free');
eq('a null user is free', E.readPlan(null).id, 'free');
eq('a pro plan unlocks the full document', E.canExportFullDossier({ plan: 'pro' }), true);
eq('a free plan does not', E.canExportFullDossier({ plan: 'free' }), false);
eq('a parent on a paid plan still cannot build the archive', E.canExportArchive({ plan: 'pro' }, 'parent'), false);
eq('a counselor on a paid plan still cannot', E.canExportArchive({ plan: 'pro' }, 'counselor'), false);
eq('the student on a paid plan can', E.canExportArchive({ plan: 'pro' }, 'student'), true);
eq('the archive mode declares itself student-only in its own spec',
  D.DOSSIER_MODES.archive.audiences.join(), 'student');
assert('assertStudentOnly is the same predicate the builder uses', (() => {
  try { D.assertStudentOnly('archive', 'parent'); return false; } catch { return true; }
})());

// ─────────────────────────────────────────────────────────────────────────────
section('4. The free preview is one real page of real data');

eq('the free tier gets exactly one page', E.PAGE_LIMIT_FREE, 1);

{
  const previewDoc = await exportPortfolioDossier(app, { preview: true, save: false });
  eq('the preview is a single page', previewDoc.internal.getNumberOfPages(), 1);

  const fullDoc = await exportPortfolioDossier(app, { save: false });
  assert('the full document is longer than the preview',
    fullDoc.internal.getNumberOfPages() > 1, `got ${fullDoc.internal.getNumberOfPages()} pages`);

  const archiveDoc = await exportPortfolioDossier(build('archive', 'student'), { save: false });
  assert('the archive is at least as long as the application version',
    archiveDoc.internal.getNumberOfPages() >= fullDoc.internal.getNumberOfPages());
}

{
  // The preview notice is the conversion moment, so it must speak in the
  // student's own numbers rather than in adjectives.
  const notice = E.previewNotice(app.stats);
  assert('the notice quotes their real hour total',
    notice.includes(Math.round(app.stats.totalHours).toLocaleString()), notice);
  assert('and their real dated-entry count',
    notice.includes(String(app.stats.clinicalEntries)), notice);
  assert('an empty record gets an honest notice instead of a fake number',
    /Log some hours/i.test(E.previewNotice({ totalHours: 0 })));
}

// ─────────────────────────────────────────────────────────────────────────────
section('5. Degenerate inputs never produce a confident empty document');

{
  const empty = D.buildDossier({ mode: 'application', audience: 'student', snapshot: {}, now: NOW });
  eq('an empty record produces no sections rather than empty headings', empty.sections.length, 0);
  eq('and zeroed stats', empty.stats.totalHours, 0);
  eq('the UI is told there is not enough to bother', D.hasEnoughForDossier({}), false);
  eq('and told when there is', D.hasEnoughForDossier(SNAP), true);
  assert('a nearly-empty record is still below the bar',
    D.hasEnoughForDossier({ activities: [{}, {}] }) === false);
}

{
  let threw = false;
  try { D.buildDossier({ mode: 'not-a-mode', audience: 'student' }); } catch { threw = true; }
  assert('an unknown mode throws rather than silently defaulting', threw);
}

eq('an empty date list has no range', D.dateRangeLabel([]), null);
eq('a single date renders as one month, not a range', D.dateRangeLabel(['2025-03-04']), 'Mar 2025');
eq('an activity with no hours recorded contributes zero, not NaN', D.activityHours({}), 0);
eq('an activity missing weeks-per-year contributes zero rather than guessing',
  D.activityHours({ hours_per_week: 5 }), 0);

// ─────────────────────────────────────────────────────────────────────────────
console.log('');
if (failures.length) {
  console.error(`✗ ${failures.length} failed, ${passed} passed\n`);
  failures.forEach(f => console.error(`  • ${f}`));
  process.exit(1);
}
console.log(`✓ Four-year export verified — ${passed} assertions.`);
console.log(`  ${app.sections.length} sections, ${Object.keys(D.DOSSIER_MODES).length} modes, `
  + 'archive refused for every non-student audience.');
