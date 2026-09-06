#!/usr/bin/env node
// Assertions on the Activities & Resume Builder's three engines — commonApp.js (the real
// Common Application export), activityIntel.js (the always-on read of an activities list) and
// academicIntel.js (GPA history, and the college matching it drives). There is no test runner
// in this repo, so this script is the test suite for them.
//
// The properties worth failing a build over, in the order they matter:
//
//   1. THE COMMON APP LIMITS ARE THE REAL LIMITS. 50/100/150 characters, ten activity slots,
//      five honors slots, and a category that exists in the actual dropdown. This is the whole
//      reason the export was rebuilt: the old one emitted prose and our own internal category
//      names, and a student found out what the real form does only after it silently truncated
//      their sentence. An over-cap field must be reported as over-cap, with the exact characters
//      that get lost.
//   2. COMPRESSION ONLY EVER REMOVES. Filler stripping is allowed to delete the student's words;
//      it is never allowed to invent one. A regression here means the app writes application
//      content for a student, which is the integrity line the whole product is built around.
//   3. THE ACADEMIC ENGINE COMPARES ON THE RIGHT SCALE. SCHOOL_DATA's admitted-student GPAs are
//      unweighted. A weighted 4.6 must be converted before it is compared, or every recommendation
//      is confidently wrong in the student's favor — the single most dangerous failure here.
//   4. THE STRICTER AXIS WINS. A school that is a target on GPA and a reach on score is a reach.
//      Admissions offices do not average two axes into a comfortable middle, and a matcher that
//      does builds a college list with no real safeties in it.
//   5. NOTHING IS INVENTED AND NOTHING IS FLATTERED. Recommendations come only from SCHOOL_DATA,
//      never include a school already on the list, and the insight layers stay blunt where the
//      data is bad.
//
//   node scripts/verifyResumeBuilder.mjs
import {
  CA_LIMITS, CA_CATEGORIES, commonAppCategory, inferTiming, compressText, composeDescription,
  buildCommonAppExport, buildActivitySlot, renderCommonAppText, renderResumeText, renderHonorsText,
  rankActivities, rankAwards, activityWeight, CATEGORY_MAP,
} from '../src/lib/commonApp/activities.js';
import {
  scoreActivity, activityIssues, coachDraft, analyzeSlate, slateInsights, honorsInsights,
  reactToActivity, reactToAward, totalHoursPerYear, PILLARS,
} from '../src/lib/activityIntel.js';
import {
  analyzeAcademics, approxUnweighted, sortGpaEntries, gpaBand, gpaPercentileContext,
  categorizeByGpa, categorizeCombined, recommendByAcademics, academicInsights, reactToGpa,
  roleProfile,
} from '../src/lib/academicIntel.js';
import { SCHOOL_DATA } from '../src/data/constants.js';

let passed = 0;
const failures = [];
const assert = (label, cond, detail = '') => {
  if (cond) { passed += 1; return; }
  failures.push(`${label}${detail ? `\n      ${detail}` : ''}`);
};
const eq = (label, actual, expected) => assert(label, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);

// ─── Fixtures ─────────────────────────────────────────────────────────────────
const strongActivity = {
  id: 'a1', activity_type: 'Clinical/Shadowing', position: 'Emergency Department Volunteer',
  organization: "St. Mary's Regional Medical Center",
  // Deliberately sized so the composed description lands under the real 150-character cap —
  // this fixture is the "nothing is blocking" case, and it only earns that if it would
  // genuinely survive a paste into the live form.
  description: 'Stocked trauma bays and translated intake for Spanish-speaking families.',
  impact: 'Trained 6 volunteers; 140 shifts over two years.',
  status: 'ongoing', hours_per_week: 6, weeks_per_year: 44, grade_levels: ['10', '11', '12'],
  leadership_role: true, evidence_url: 'https://example.org/cert', skills_tags: ['triage', 'Spanish'],
  verification_status: 'verified',
};
const thinActivity = {
  id: 'a2', activity_type: 'Clubs & Organizations', position: 'Member', organization: '',
  description: 'I helped out.', impact: '', status: 'completed',
  hours_per_week: 1, weeks_per_year: 8, grade_levels: [], leadership_role: false,
};
const overLimitActivity = {
  id: 'a3', activity_type: 'Research', status: 'ongoing',
  position: 'Undergraduate Research Assistant and Junior Laboratory Coordinator for the Program',
  organization: 'State University Department of Molecular and Cellular Biology Summer Research Program for High School Students Cohort',
  description: 'Ran weekly PCR assays on zebrafish embryos, maintained the colony, kept the reagent inventory, and presented findings at the summer symposium in front of forty other students and six faculty members.',
  impact: 'Co-authored a poster presented at the state science conference in April.',
  hours_per_week: 12, weeks_per_year: 10, grade_levels: ['11'],
};

// ═══ 1. Common App limits are the real limits ═════════════════════════════════
eq('activity slot cap is 10', CA_LIMITS.maxActivities, 10);
eq('honors slot cap is 5', CA_LIMITS.maxHonors, 5);
eq('position cap is 50', CA_LIMITS.position, 50);
eq('organization cap is 100', CA_LIMITS.organization, 100);
eq('description cap is 150', CA_LIMITS.description, 150);
eq('honor title cap is 100', CA_LIMITS.honorTitle, 100);

assert('every internal activity type maps to a real dropdown category',
  Object.values(CATEGORY_MAP).every(m => CA_CATEGORIES.includes(m.primary)),
  Object.entries(CATEGORY_MAP).filter(([, m]) => !CA_CATEGORIES.includes(m.primary)).map(([k]) => k).join(', '));
assert('every alternate is also a real dropdown category',
  Object.values(CATEGORY_MAP).every(m => m.alternates.every(a => CA_CATEGORIES.includes(a))));
assert('no internal category name leaks into the export',
  !CA_CATEGORIES.includes('Volunteering') && !CA_CATEGORIES.includes('Health Club/HOSA'));
eq('paid patient care maps to Work (Paid)', commonAppCategory('Patient Care (paid)'), 'Work (Paid)');
eq('an unknown type still resolves to a real category', commonAppCategory('Nonsense'), 'Other Club/Activity');

const overSlot = buildActivitySlot(overLimitActivity, 0);
assert('an over-cap position is flagged as over', overSlot.position.over);
eq('over-cap position reports the exact overage', overSlot.position.overBy, overLimitActivity.position.length - 50);
eq('the truncated position is exactly the first 50 characters', overSlot.position.truncated, overLimitActivity.position.slice(0, 50));
eq('the lost characters are exactly the remainder', overSlot.position.truncated + overSlot.position.lost, overSlot.position.text);
assert('an over-cap organization is flagged', overSlot.organization.over);
assert('an over-cap description is flagged', overSlot.description.over);
assert('over-cap fields produce blocking problems', overSlot.blocking);
assert('the description problem names the number of characters to cut',
  overSlot.problems.some(p => p.field === 'description' && p.text.includes(String(overSlot.description.overBy))));

const okSlot = buildActivitySlot(strongActivity, 0);
assert('a well-formed entry is not blocking', !okSlot.blocking);
eq('grades carry through in form order', okSlot.grades.join(','), '10,11,12');
eq('44 weeks reads as All year', okSlot.timing, 'All year');
eq('8 weeks reads as School break', inferTiming(8), 'School break');
eq('30 weeks reads as School year', inferTiming(30), 'School year');
eq('an ongoing activity sets continue-in-college', okSlot.continueInCollege, true);
eq('a completed activity does not', buildActivitySlot(thinActivity, 0).continueInCollege, false);

assert('hours are clamped into the form two-digit field',
  buildActivitySlot({ ...strongActivity, hours_per_week: 300 }, 0).hours === CA_LIMITS.maxHours);
assert('weeks are clamped to 52',
  buildActivitySlot({ ...strongActivity, weeks_per_year: 400 }, 0).weeks === CA_LIMITS.maxWeeks);

// Slot overflow: eleven activities must produce ten slots and one explicit overflow,
// never a silent drop.
const eleven = Array.from({ length: 11 }, (_, i) => ({
  ...thinActivity, id: `x${i}`, position: `Role ${i}`, hours_per_week: i + 1, weeks_per_year: 20,
}));
const bigExport = buildCommonAppExport(eleven, []);
eq('eleven activities fill exactly ten slots', bigExport.slots.length, 10);
eq('the eleventh is reported as overflow, not dropped', bigExport.overflow.length, 1);
eq('slot numbering starts at 1', bigExport.slots[0].slot, 1);
eq('the lowest-weight activity is the one that overflows', bigExport.overflow[0].position.text, 'Role 0');

const sixHonors = Array.from({ length: 6 }, (_, i) => ({ id: `h${i}`, title: `Honor ${i}`, level: 'School', grade_level: '11' }));
const honorExport = buildCommonAppExport([], sixHonors);
eq('six honors fill exactly five slots', honorExport.honors.length, 5);
eq('the sixth honor is reported as overflow', honorExport.honorOverflow.length, 1);

// A student-supplied ordering must win over our heuristic — the form asks them, not us.
const ordered = buildCommonAppExport([thinActivity, strongActivity], [], { order: ['a2', 'a1'] });
eq('an explicit order is respected', ordered.slots[0].position.text, 'Member');
const heuristic = buildCommonAppExport([thinActivity, strongActivity], []);
eq('without an explicit order the heavier activity leads', heuristic.slots[0].position.text, 'Emergency Department Volunteer');
assert('a real commitment outweighs a token one',
  activityWeight(strongActivity) > activityWeight(thinActivity) * 3);
eq('ranking is stable for equal weights',
  rankActivities([{ ...thinActivity, id: 'p' }, { ...thinActivity, id: 'q' }]).map(a => a.id).join(','), 'p,q');
eq('honors rank by level of recognition',
  rankAwards([
    { title: 'School thing', level: 'School' },
    { title: 'National thing', level: 'National' },
    { title: 'Regional thing', level: 'State/Regional' },
  ]).map(a => a.level).join('|'), 'National|State/Regional|School');

// ═══ 2. Compression only ever removes ════════════════════════════════════════
const compressionCases = [
  'I was responsible for organizing the annual blood drive in order to raise awareness',
  'Helped to run the tutoring program as well as the mentorship night',
  'I volunteered at the food bank every Saturday',
  'Ran the club',
  '',
];
compressionCases.forEach(src => {
  const out = compressText(src);
  assert(`compression never grows the text: "${src.slice(0, 30)}"`, out.length <= src.length + 1,
    `${src.length} -> ${out.length}`);
  // Every word in the output must have existed in the input (case-insensitively). This is the
  // assertion that makes compressText safe to ship: it may delete, it may never author.
  const srcWords = new Set(src.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean));
  const outWords = out.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  assert(`compression invents no new word: "${src.slice(0, 30)}"`,
    outWords.every(w => srcWords.has(w)),
    outWords.filter(w => !srcWords.has(w)).join(', '));
});
assert('a filler opener is actually removed',
  !/^i was responsible/i.test(compressText('I was responsible for organizing the blood drive')));
assert('compression collapses runaway whitespace',
  compressText('Ran   the    club') === 'Ran the club');

const composed = composeDescription({ description: 'Ran weekly meetings.', impact: 'Grew from 12 to 40 members' });
assert('impact leads the composed description', composed.startsWith('Grew from 12 to 40 members'));
assert('the composed description keeps both halves', composed.includes('Ran weekly meetings'));
eq('an empty activity composes to an empty description', composeDescription({}), '');

// Renderers must produce the real field names, not prose headings — this is precisely the
// regression the whole export rewrite exists to prevent.
const caText = renderCommonAppText(buildCommonAppExport([strongActivity, thinActivity], sixHonors.slice(0, 2)));
['Activity type:', 'Position/Leadership:', 'Organization Name:', 'Description:', 'Grade levels:', 'Timing:', 'Hours per week:', 'Weeks per year:', 'Continue in college:']
  .forEach(f => assert(`the Common App export emits the "${f}" field`, caText.includes(f)));
assert('the Common App export states slot numbers out of ten', caText.includes('of 10'));
assert('the Common App export includes the honors section', caText.includes('HONORS SECTION'));
assert('the résumé format is a different rendering, not the same text',
  renderResumeText([strongActivity], []) !== caText);
assert('the résumé keeps the full untruncated description',
  renderResumeText([overLimitActivity], []).includes('summer symposium'));
assert('honors-only rendering handles an empty list',
  renderHonorsText([]).toLowerCase().includes('no honors'));

// ═══ 3. Activity intelligence is honest ══════════════════════════════════════
const strongScore = scoreActivity(strongActivity);
const thinScore = scoreActivity(thinActivity);
assert('a real, fully-described commitment scores well', strongScore.score >= 78, `got ${strongScore.score}`);
assert('a one-line membership scores badly', thinScore.score <= 35, `got ${thinScore.score}`);
assert('scores stay inside 0-100', [strongScore, thinScore].every(s => s.score >= 0 && s.score <= 100));
eq('hours per year is hours x weeks', strongScore.hoursPerYear, 6 * 44);
assert('an empty activity does not throw', !!scoreActivity({}));

const thinIssues = activityIssues(thinActivity);
assert('a missing impact line is called out', thinIssues.some(i => /impact/i.test(i.text)));
assert('missing grade levels are called out', thinIssues.some(i => /grade level/i.test(i.text)));
assert('a strong entry raises no blocking issues', !activityIssues(strongActivity).some(i => i.level === 'error'));
assert('an empty description is an error, not a tip',
  activityIssues({ ...thinActivity, description: '' }).some(i => i.level === 'error'));
assert('an impossible week count is an error',
  activityIssues({ ...thinActivity, weeks_per_year: 60 }).some(i => i.level === 'error'));
assert('inflated hours are challenged',
  activityIssues({ ...strongActivity, hours_per_week: 60 }).some(i => /full-time/i.test(i.text)));

const coach = coachDraft({ position: 'Member', description: 'x'.repeat(200), hours_per_week: 3, weeks_per_year: 20 });
assert('live coaching flags an over-limit description', coach.some(l => l.level === 'error' && /150/.test(l.text)));
assert('live coaching is capped so the form never becomes a wall', coachDraft(thinActivity, { limit: 3 }).length <= 3);
assert('live coaching on an empty draft says nothing', coachDraft({}).length === 0);
assert('a well-sized description earns a good note',
  coachDraft({ position: 'Captain', description: 'y'.repeat(130), organization: 'X', impact: 'Grew 12 to 40', grade_levels: ['11'], hours_per_week: 4, weeks_per_year: 30 })
    .some(l => l.level === 'good'));

const slate = analyzeSlate([strongActivity, thinActivity], [{ title: 'Honor roll', level: 'School', grade_level: '11' }]);
eq('total hours is the sum across the slate', slate.totalHours, totalHoursPerYear([strongActivity, thinActivity]));
eq('leadership is counted from the flag', slate.leadershipCount, 1);
eq('the spike is the largest commitment', slate.spike.activity.id, 'a1');
assert('spike share is a sane percentage', slate.spikeShare > 50 && slate.spikeShare <= 100);
assert('pillar coverage is a percentage', slate.coverageScore >= 0 && slate.coverageScore <= 100);
assert('gaps are real pillars', slate.gaps.every(g => PILLARS.some(p => p.id === g.id)));
assert('a clinical entry covers the clinical pillar', slate.covered.includes('clinical'));
assert('an empty slate does not throw', !!analyzeSlate([], []));

const emptyInsights = slateInsights(analyzeSlate([], []));
assert('an empty slate still produces an opinion', emptyInsights.length > 0);
const shallow = Array.from({ length: 9 }, (_, i) => ({ ...thinActivity, id: `s${i}`, position: `Club ${i}` }));
const shallowInsights = slateInsights(analyzeSlate(shallow, []));
assert('a wide shallow list is called wide and shallow',
  shallowInsights.some(i => i.tone === 'warn' && /shallow|interchangeable/i.test(i.text)));
assert('a missing clinical pillar is raised as critical for a health applicant',
  shallowInsights.some(i => i.pillar === 'clinical' && i.tone === 'critical'));
assert('a senior is told new activities barely register',
  slateInsights(analyzeSlate(shallow, []), { gradeStage: 'senior' }).some(i => /senior/i.test(i.text)));

assert('an honors section with nothing in it is called out',
  honorsInsights(analyzeSlate([], [])).some(i => /five honors slots|Common App has five/i.test(i.text)));
assert('honors missing a level are flagged',
  honorsInsights(analyzeSlate([], [{ title: 'A thing' }])).some(i => i.tone === 'warn'));

// Reactions must be a function of the data, not a random pick: the same row twice gives the
// same sentence, and two different rows give different ones.
eq('the reaction to a row is deterministic', reactToActivity(strongActivity), reactToActivity(strongActivity));
assert('a strong entry and a thin entry get different reactions',
  reactToActivity(strongActivity) !== reactToActivity(thinActivity));
assert('an undescribed activity is told so immediately',
  /description/i.test(reactToActivity({ ...thinActivity, description: '' })));
assert('a national award is recognized as one',
  /national/i.test(reactToAward({ title: 'X', level: 'National' })));
assert('an award with no level is told to set one',
  /level of recognition/i.test(reactToAward({ title: 'X' })));

// ═══ 4. Academic history: the right scale, the stricter axis ═════════════════
eq('an unweighted GPA is unchanged', approxUnweighted(3.85, false), 3.85);
assert('a weighted GPA is pulled toward the unweighted scale', approxUnweighted(4.6, true) < 4.6);
assert('a converted weighted GPA never exceeds 4.0', approxUnweighted(5.0, true) <= 4.0);
eq('a weighted GPA already at or under 4.0 is left alone', approxUnweighted(3.7, true), 3.7);
eq('a non-numeric GPA converts to null', approxUnweighted('abc', false), null);

const terms = [
  { id: 'g3', term: 'Grade 11, Fall', gpa: 3.8 },
  { id: 'g1', term: 'Grade 9, Fall', gpa: 3.2 },
  { id: 'g2', term: 'Grade 10, Spring', gpa: 3.5 },
];
eq('terms sort into real chronological order',
  sortGpaEntries(terms).map(t => t.id).join(','), 'g1,g2,g3');
const rising = analyzeAcademics(terms);
eq('the latest term is the chronologically latest', rising.latest.id, 'g3');
eq('a climbing transcript reads as rising', rising.trend, 'rising');
eq('delta is latest minus first', rising.delta, 0.6);
const falling = analyzeAcademics([
  { term: 'Grade 9', gpa: 4.0 }, { term: 'Grade 10', gpa: 3.6 }, { term: 'Grade 11', gpa: 3.2 },
]);
eq('a declining transcript reads as falling', falling.trend, 'falling');
eq('a steady transcript reads as flat',
  analyzeAcademics([{ term: 'Grade 10', gpa: 3.7 }, { term: 'Grade 11', gpa: 3.72 }]).trend, 'flat');
eq('an empty transcript reports no data', analyzeAcademics([]).hasData, false);

const weighted = analyzeAcademics([{ term: 'Grade 11', gpa: 4.6, weighted: true }]);
assert('the comparable GPA is on the unweighted scale', weighted.comparableGpa <= 4.0,
  `comparableGpa ${weighted.comparableGpa}`);
assert('the raw weighted number is preserved for display', weighted.latestGpa === 4.6);

eq('a 4.0 bands as exceptional', gpaBand(4.0).id, 'exceptional');
eq('a 3.85 bands as excellent', gpaBand(3.85).id, 'excellent');
eq('a 2.6 bands as needing work', gpaBand(2.6).id, 'needswork');
const ctx = gpaPercentileContext(4.0);
eq('percentile context counts the whole tracked universe', ctx.total, SCHOOL_DATA.filter(s => Number.isFinite(s.gpa)).length);
assert('a 4.0 is at or above every tracked admitted average', ctx.atOrAbove === ctx.total);
assert('a 3.0 is at or above far fewer', gpaPercentileContext(3.0).atOrAbove < ctx.atOrAbove);

const selective = SCHOOL_DATA.find(s => s.name === 'Harvard University');
const lessSelective = SCHOOL_DATA.filter(s => s.accept > 60 && Number.isFinite(s.gpa)).sort((a, b) => a.gpa - b.gpa)[0];
eq('a sub-15% school is a reach at any GPA', categorizeByGpa(selective, 4.0), 'reach');
assert('a school well below the student is a safety', categorizeByGpa(lessSelective, 4.0) === 'safety',
  `${lessSelective?.name} @4.0 -> ${categorizeByGpa(lessSelective, 4.0)}`);

// The stricter-axis rule. A school whose GPA says target but whose SAT says reach must be a reach.
const mid = SCHOOL_DATA.find(s => s.accept >= 20 && s.sat >= 1400 && Number.isFinite(s.gpa));
if (mid) {
  const combined = categorizeCombined(mid, { comparableGpa: mid.gpa, effectiveSat: mid.sat - 400 });
  eq(`stricter axis wins at ${mid.name}`, combined.category, 'reach');
  eq('and the binding constraint is named', combined.driver, 'score');
  const other = categorizeCombined(mid, { comparableGpa: mid.gpa - 0.6, effectiveSat: mid.sat });
  eq('a GPA-bound school names the GPA as the driver', other.driver, 'gpa');
}
eq('with no data at all there is no category',
  categorizeCombined(selective, { comparableGpa: null, effectiveSat: null }).category, null);

// ═══ 5. Recommendations are grounded, balanced and career-aware ══════════════
const highScores = { hasScore: true, effectiveSat: 1500, sat: 1500, act: null, primaryTest: 'SAT' };
const strongAcademics = analyzeAcademics([{ term: 'Grade 11', gpa: 3.95 }]);
const recs = recommendByAcademics({
  academics: strongAcademics, scores: highScores,
  user: { dreamRole: 'physician' }, existing: [],
});
assert('a strong profile gets a full slate', recs.length >= 5, `got ${recs.length}`);
assert('every recommendation is a real tracked school',
  recs.every(r => SCHOOL_DATA.some(s => s.name === r.name)));
assert('every recommendation carries a reason', recs.every(r => r.reason && r.reason.length > 20));
assert('every fit score is a percentage', recs.every(r => r.fit >= 0 && r.fit <= 100));
assert('the slate is not all one category', new Set(recs.map(r => r.category)).size >= 2);
assert('a school already on the list is never recommended',
  !recommendByAcademics({
    academics: strongAcademics, scores: highScores, user: { dreamRole: 'physician' },
    existing: [{ name: recs[0].name }],
  }).some(r => r.name === recs[0].name));
assert('reaches come before safeties',
  recs.findIndex(r => r.category === 'reach') <= recs.findIndex(r => r.category === 'safety') ||
  !recs.some(r => r.category === 'safety'));

// Career fit is real: a future nurse and a future researcher with identical numbers must not get
// an identical ranking, or the onboarding answer was collected for nothing.
const nurseRecs = recommendByAcademics({ academics: strongAcademics, scores: highScores, user: { dreamRole: 'nurse' }, existing: [] });
const researchRecs = recommendByAcademics({ academics: strongAcademics, scores: highScores, user: { dreamRole: 'research' }, existing: [] });
assert('two careers on identical numbers produce different slates',
  nurseRecs.map(r => r.name).join('|') !== researchRecs.map(r => r.name).join('|'));
assert('every dream role resolves to a profile with real guidance',
  ['physician', 'nurse', 'pa', 'mental_health', 'research', 'other_health', 'undecided', undefined]
    .every(r => roleProfile(r).note && roleProfile(r).label));

assert('GPA alone is enough to recommend',
  recommendByAcademics({ academics: strongAcademics, scores: null, user: {}, existing: [] }).length > 0);
eq('no academic data and no score recommends nothing',
  recommendByAcademics({ academics: analyzeAcademics([]), scores: null, user: {}, existing: [] }).length, 0);

// ═══ 6. The GPA reaction — the moment the panel was rebuilt around ═══════════
const reaction = reactToGpa({ academics: strongAcademics, scores: highScores, user: { dreamRole: 'physician', name: 'Test' }, existing: [] });
assert('a 3.95 gets a reaction', !!reaction);
assert('the reaction leads with a verdict on the number', /3\.95/.test(reaction.headline));
assert('an excellent GPA is called excellent or outstanding', /excellent|outstanding/i.test(reaction.headline));
assert('the reaction names real schools', reaction.picks.length > 0 && reaction.picks.every(p => SCHOOL_DATA.some(s => s.name === p.name)));
assert('the reaction ties the schools to the stated career', /physician/i.test(reaction.careerLine));
assert('a strong record earns explicit belief', reaction.belief.length > 0);
assert('the reaction states where they sit across the database',
  /\d+ of the \d+ U\.S\. schools/.test(reaction.context), reaction.context);

const weakReaction = reactToGpa({ academics: analyzeAcademics([{ term: 'Grade 10', gpa: 2.4 }]), scores: null, user: {}, existing: [] });
assert('a weak GPA is not flattered', !/excellent|outstanding|great/i.test(weakReaction.headline), weakReaction.headline);
assert('a weak GPA gets no manufactured belief line', weakReaction.belief === '');
assert('a weak GPA is still given a route forward', /fixable|move|counts/i.test(weakReaction.verdict));
eq('no academic data means no reaction', reactToGpa({ academics: analyzeAcademics([]), scores: null }), null);

// Insights must stay correct in both directions and never require the network.
const acIns = academicInsights({ academics: strongAcademics, scores: highScores, user: {}, existing: [] });
assert('academic insights always produce something', acIns.length > 0);
assert('an empty transcript is told the matching is running half-blind',
  academicInsights({ academics: analyzeAcademics([]) }).some(i => /No GPA logged/i.test(i.text)));
assert('mixed weighted and unweighted entries are flagged as incomparable',
  academicInsights({
    academics: analyzeAcademics([{ term: 'Grade 10', gpa: 4.4, weighted: true }, { term: 'Grade 11', gpa: 3.8 }]),
  }).some(i => /two different scales/i.test(i.text)));
assert('a high GPA against a low score names the test as the constraint',
  academicInsights({
    academics: analyzeAcademics([{ term: 'Grade 11', gpa: 3.9 }]),
    scores: { hasScore: true, effectiveSat: 1100, sat: 1100 },
  }).some(i => /binding constraint/i.test(i.text)));

// ─── Report ───────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error(`\n✗ Resume-builder verification FAILED — ${failures.length} problem(s), ${passed} passed:\n`);
  failures.forEach(f => console.error(`  ✗ ${f}`));
  process.exit(1);
}
console.log(`✓ Resume-builder verification passed — ${passed} assertions.`);
console.log(`  Common App: ${CA_LIMITS.maxActivities} activity slots, ${CA_LIMITS.maxHonors} honors slots, ${CA_CATEGORIES.length} real categories.`);
console.log(`  Pillars: ${PILLARS.map(p => p.id).join(', ')}.`);
console.log(`  Academic matching across ${SCHOOL_DATA.filter(s => Number.isFinite(s.gpa)).length} U.S. schools with admitted-GPA data.`);
