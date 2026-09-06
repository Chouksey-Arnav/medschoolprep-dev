// ─────────────────────────────────────────────────────────────────────────────
// The Common Application export engine.
//
// WHAT WAS WRONG BEFORE THIS FILE EXISTED
// The Activities & Resume Builder had a button labeled "Copy Common App
// format" that copied this:
//
//     ACTIVITIES
//     1. Volunteering — Shift Lead (St. Mary's)
//        I helped out at the front desk and did a lot of things there
//        Impact: it was really rewarding
//        3 hrs/wk, 20 wks/yr · ongoing · Grades: 11, 12
//
// That is not the Common App format. It is a prose dump with an ALL-CAPS
// heading on it. A student who pasted it into the real form found that the
// real form has *nine separate fields per activity*, three of them under hard
// character caps that silently truncate, a fixed dropdown of 30 activity
// categories that "Volunteering" is not one of, a ten-slot maximum, and an
// explicit instruction to list activities in order of importance. None of that
// was represented. The button produced text the student then had to hand-cut
// into a form they'd never seen, which is worse than no button, because it
// looked like the work was done.
//
// WHAT THIS FILE DOES INSTEAD
// It models the actual form. Every export is built as a list of SLOTS, and a
// slot is a real Common App activity entry: the official category from the
// real dropdown, a 50-character position, a 100-character organization, a
// 150-character description, the grade checkboxes, the timing radio, two-digit
// hours and weeks, and the "continue in college" flag. Every field carries its
// own limit, its own live character count, and its own over/under verdict, so
// the UI can show the student exactly what will and will not survive being
// pasted — before they paste it.
//
// THREE COMMITMENTS, in the same spirit as essayCritique.js:
//
// 1. NOTHING IS INVENTED. Compression only ever *removes* — filler openings,
//    doubled spaces, "I was responsible for". It never writes a sentence the
//    student didn't write. If a description is 240 characters, we say it is 90
//    over and show exactly where the cut falls; we do not silently paraphrase
//    it down and hand back words they'll submit as their own.
// 2. THE LIMITS ARE REAL LIMITS. Over-cap fields are flagged as errors, not
//    styled as warnings. A truncated description on the real form loses the
//    end of the sentence, and the student finds out after submitting.
// 3. ORDER IS PART OF THE FORMAT. The Common App tells students to list
//    activities in order of importance and readers treat slot 1 as the
//    headline. We rank them (see rankActivities) and say we did, rather than
//    exporting whatever order they happened to type them in.
//
// Pure functions. No React, no network, no persistence — so scripts/verifyResumeBuilder.mjs
// can assert on all of it directly.
// ─────────────────────────────────────────────────────────────────────────────

// ── The real form ────────────────────────────────────────────────────────────
// Character caps and slot counts as the Common Application actually enforces
// them. These are the load-bearing numbers in this file; everything else is
// presentation. They are exported so the UI renders the same limit it validates
// against rather than hardcoding a second copy that can drift.
export const CA_LIMITS = {
  position: 50,          // "Position/Leadership description"
  organization: 100,     // "Organization Name"
  description: 150,      // "Please describe this activity…"
  honorTitle: 100,       // Honors section, "Honor title"
  maxActivities: 10,     // ten activity slots, hard stop
  maxHonors: 5,          // five honors slots, hard stop
  maxHours: 99,          // hours/week is a two-digit field
  maxWeeks: 52,          // weeks/year is a two-digit field, and a year has 52
};

// The Common App's activity-category dropdown, verbatim. A student cannot type
// a category into the real form — they pick from this list — so an export that
// emits our internal label ("Health Club/HOSA") is emitting something they will
// not find in the dropdown.
export const CA_CATEGORIES = [
  'Academic', 'Art', 'Athletics: Club', 'Athletics: JV/Varsity', 'Career Oriented',
  'Community Service (Volunteer)', 'Computer/Technology', 'Cultural', 'Dance',
  'Debate/Speech', 'Environmental', 'Family Responsibilities', 'Foreign Exchange',
  'Foreign Language', 'Internship', 'Journalism/Publication', 'Junior R.O.T.C.',
  'LGBT', 'Music: Instrumental', 'Music: Vocal', 'Religious', 'Research', 'Robotics',
  'School Spirit', 'Science/Math', 'Social Justice', 'Student Govt./Politics',
  'Theater/Drama', 'Work (Paid)', 'Other Club/Activity',
];

// Our internal activity types → the official dropdown value, plus the runners-up.
// `alternates` matter: "Clinical/Shadowing" is genuinely ambiguous on the real
// form (a hospital volunteer shift and a physician shadowing day belong in
// different categories), so the UI offers the choice instead of picking for them
// and being quietly wrong on a third of the slate.
export const CATEGORY_MAP = {
  'Clinical/Shadowing': { primary: 'Career Oriented', alternates: ['Community Service (Volunteer)', 'Internship', 'Academic'] },
  'Patient Care (paid)': { primary: 'Work (Paid)', alternates: ['Career Oriented', 'Community Service (Volunteer)'] },
  'Health Club/HOSA': { primary: 'Science/Math', alternates: ['Career Oriented', 'Academic', 'Other Club/Activity'] },
  Leadership: { primary: 'Student Govt./Politics', alternates: ['School Spirit', 'Other Club/Activity', 'Community Service (Volunteer)'] },
  Volunteering: { primary: 'Community Service (Volunteer)', alternates: ['Social Justice', 'Religious', 'Environmental'] },
  Research: { primary: 'Research', alternates: ['Science/Math', 'Academic', 'Internship'] },
  Athletics: { primary: 'Athletics: JV/Varsity', alternates: ['Athletics: Club', 'School Spirit'] },
  'Arts & Performance': { primary: 'Art', alternates: ['Music: Instrumental', 'Music: Vocal', 'Theater/Drama', 'Dance'] },
  'Work Experience': { primary: 'Work (Paid)', alternates: ['Career Oriented', 'Internship', 'Family Responsibilities'] },
  'Clubs & Organizations': { primary: 'Other Club/Activity', alternates: ['Academic', 'Cultural', 'School Spirit'] },
  Other: { primary: 'Other Club/Activity', alternates: CA_CATEGORIES.slice(0, 6) },
};

export function commonAppCategory(activityType) {
  return CATEGORY_MAP[activityType]?.primary || 'Other Club/Activity';
}
export function categoryAlternates(activityType) {
  return CATEGORY_MAP[activityType]?.alternates || [];
}

// Grade checkboxes on the real form, in the real order.
export const CA_GRADES = ['9', '10', '11', '12', 'Post-graduate'];
// The timing radio. Exactly these three, exactly these words.
export const CA_TIMING = ['School year', 'School break', 'All year'];

// Which timing radio this activity's weeks/year implies. A student who works 48
// weeks a year is not a "School year" participant, and a 6-week summer program
// is not either — the form asks, and getting it wrong reads as carelessness on
// a line an admissions reader can check against the hours.
export function inferTiming(weeksPerYear) {
  const w = Number(weeksPerYear) || 0;
  if (w >= 40) return 'All year';
  if (w > 0 && w <= 14) return 'School break';
  return 'School year';
}

// ── Text compression ─────────────────────────────────────────────────────────
// Everything here is subtractive. The rule that makes this safe to ship: a
// compressed string is always a substring-preserving edit of the student's own
// words with filler removed — never a rewrite, never a synonym, never a
// sentence they didn't write. An admissions essay's integrity line applies just
// as hard to a 150-character activity description.

// Openings that cost characters and say nothing. Ordered longest-first so
// "I was responsible for helping to" collapses in one pass rather than leaving
// a "helping to" behind.
const FILLER_OPENERS = [
  /^i\s+was\s+responsible\s+for\s+/i,
  /^i\s+am\s+responsible\s+for\s+/i,
  /^my\s+responsibilities\s+included\s+/i,
  /^i\s+was\s+in\s+charge\s+of\s+/i,
  /^i\s+had\s+the\s+opportunity\s+to\s+/i,
  /^i\s+have\s+been\s+/i,
  /^i\s+worked\s+(?:on|as|with)\s+/i,
  /^i\s+helped\s+(?:to\s+)?/i,
  /^i\s+participated\s+in\s+/i,
  /^i\s+served\s+as\s+/i,
  /^i\s+volunteered\s+(?:to\s+|at\s+|as\s+)?/i,
  /^i\s+/i,
  /^responsible\s+for\s+/i,
  /^helped\s+(?:to\s+)?/i,
  /^worked\s+(?:to\s+|on\s+)?/i,
  /^this\s+(?:activity|club|role|position)\s+(?:is|was)\s+/i,
  /^basically,?\s+/i,
];

// Phrases that are pure padding wherever they appear. Kept deliberately short:
// an aggressive list starts eating meaning, and a description that reads
// slightly long is a much smaller problem than one that reads slightly false.
// Each replacement is either the empty string or a word already present in the phrase it
// replaces ("in order to" → "to", "helped to" → "helped"). That is not a stylistic preference:
// it is what keeps compressText() a pure deletion, so the app can never put a word into a
// student's application that the student did not write. scripts/verifyResumeBuilder.mjs asserts
// this word-for-word, which is why an otherwise tempting rule like "as well as" → "and" is not
// in this list — "and" appears nowhere in the phrase it would replace.
const FILLER_PHRASES = [
  /\bin\s+order\s+to\b/gi,
  /\ba\s+variety\s+of\b/gi,
  /\bvarious\s+different\b/gi,
  /\bthe\s+process\s+of\b/gi,
  /\bthat\s+being\s+said,?\b/gi,
  /\bhelped\s+to\b/gi,
];
const FILLER_REPLACEMENTS = ['to', '', '', '', '', 'helped'];

export function compressText(input) {
  let s = String(input || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  for (const re of FILLER_OPENERS) {
    const next = s.replace(re, '');
    if (next !== s) { s = next.trim(); break; }
  }
  FILLER_PHRASES.forEach((re, i) => { s = s.replace(re, FILLER_REPLACEMENTS[i]); });
  s = s.replace(/\s+([,.;:])/g, '$1').replace(/\s{2,}/g, ' ').trim();
  // Capitalize the first letter if stripping an opener left a lowercase word.
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

// Impact first, then description — a reader with forty files left reads the
// left edge of the field, and a number belongs there far more than a summary of
// duties. Joined with a period so the two halves don't run together.
export function composeDescription(activity) {
  const impact = compressText(activity?.impact);
  const desc = compressText(activity?.description);
  if (impact && desc) {
    const lead = /[.!?]$/.test(impact) ? impact : `${impact}.`;
    return `${lead} ${desc}`.trim();
  }
  return impact || desc || '';
}

// A field, with its limit and the verdict on it. `over` is what the UI colors
// red and what blocks a clean export; `text` is always the student's real text,
// never pre-truncated — we show them the overflow rather than hiding it.
function field(value, limit, { required = false, label = '' } = {}) {
  const text = String(value ?? '').trim();
  const len = text.length;
  return {
    label, text, len, limit,
    over: len > limit,
    overBy: Math.max(0, len - limit),
    remaining: limit - len,
    empty: len === 0,
    required,
    missing: required && len === 0,
    // What actually lands in the form if they paste it as-is. Shown beside the
    // full text so the loss is visible, not theoretical.
    truncated: len > limit ? text.slice(0, limit) : text,
    lost: len > limit ? text.slice(limit) : '',
  };
}

// ── Ranking ──────────────────────────────────────────────────────────────────
// The Common App's own instruction is to list activities in order of importance
// to the student, and readers weight the first three slots heavily. Exporting
// in insertion order throws that away. This is a transparent heuristic, not a
// verdict: the UI shows the rank and lets the student drag it, but the default
// is a defensible one rather than "whatever you typed first".
export function activityWeight(a) {
  const hours = (Number(a?.hours_per_week) || 0) * (Number(a?.weeks_per_year) || 0);
  let w = 0;
  w += Math.min(40, Math.sqrt(Math.max(0, hours)) * 3.2);        // sustained time, with diminishing returns
  w += (a?.leadership_role ? 18 : 0);                             // a titled role is the strongest single signal
  w += Math.min(14, (a?.grade_levels || []).length * 4);          // multi-year commitment
  if (a?.impact && String(a.impact).trim().length > 12) w += 12;  // measurable outcome recorded
  if (/\d/.test(String(a?.impact || ''))) w += 6;                 // …with an actual number in it
  if (a?.evidence_url) w += 4;                                    // verifiable
  if (a?.verification_status === 'verified') w += 6;
  if (a?.status === 'ongoing') w += 4;                            // still running reads stronger than lapsed
  if (['Research', 'Clinical/Shadowing', 'Patient Care (paid)'].includes(a?.activity_type)) w += 8; // differentiators for a health applicant
  return Math.round(w);
}

export function rankActivities(activities = []) {
  return [...activities]
    .map((a, i) => ({ a, i, w: activityWeight(a) }))
    .sort((x, y) => y.w - x.w || x.i - y.i)
    .map(x => x.a);
}

// ── Slot building ────────────────────────────────────────────────────────────

/**
 * One Common App activity slot, fully validated.
 * `categoryOverride` lets the student pick from categoryAlternates() without us
 * mutating their stored activity_type — the export is a view of their data, not
 * a second copy of it.
 */
export function buildActivitySlot(activity, index, { categoryOverride = null } = {}) {
  const hoursRaw = Number(activity?.hours_per_week) || 0;
  const weeksRaw = Number(activity?.weeks_per_year) || 0;
  const description = composeDescription(activity);

  const fields = {
    category: commonAppCategory(activity?.activity_type),
    position: field(compressText(activity?.position), CA_LIMITS.position, { required: true, label: 'Position/Leadership description' }),
    organization: field(String(activity?.organization || '').trim(), CA_LIMITS.organization, { label: 'Organization Name' }),
    description: field(description, CA_LIMITS.description, { required: true, label: 'Description' }),
    grades: (activity?.grade_levels || []).filter(g => CA_GRADES.includes(String(g))),
    timing: inferTiming(weeksRaw),
    hours: Math.min(CA_LIMITS.maxHours, Math.round(hoursRaw)),
    weeks: Math.min(CA_LIMITS.maxWeeks, Math.round(weeksRaw)),
    continueInCollege: activity?.status === 'ongoing',
  };
  if (categoryOverride && CA_CATEGORIES.includes(categoryOverride)) fields.category = categoryOverride;

  // Problems that will actually cost them something on the real form, in the
  // order they cost. `blocking` means the paste loses data or the field is empty.
  const problems = [];
  if (fields.position.missing) problems.push({ level: 'error', field: 'position', text: 'No position or role — this field is required on the form and cannot be left blank.' });
  if (fields.description.missing) problems.push({ level: 'error', field: 'description', text: 'No description. An empty description slot is a wasted activity: the reader sees a job title and nothing else.' });
  if (fields.position.over) problems.push({ level: 'error', field: 'position', text: `Position is ${fields.position.overBy} characters over the 50-character limit — the form will cut "${fields.position.lost.trim()}".` });
  if (fields.organization.over) problems.push({ level: 'error', field: 'organization', text: `Organization name is ${fields.organization.overBy} over the 100-character limit.` });
  if (fields.description.over) problems.push({ level: 'error', field: 'description', text: `Description is ${fields.description.overBy} characters over the 150-character limit. Cut ${fields.description.overBy} characters or the sentence ends mid-word.` });
  if (!fields.grades.length) problems.push({ level: 'warn', field: 'grades', text: 'No grade levels ticked. The form requires at least one, and years-of-participation is one of the few things a reader can compare across applicants.' });
  if (hoursRaw > CA_LIMITS.maxHours) problems.push({ level: 'warn', field: 'hours', text: `${hoursRaw} hrs/week doesn't fit the form's two-digit field — it caps at 99.` });
  if (weeksRaw > CA_LIMITS.maxWeeks) problems.push({ level: 'warn', field: 'weeks', text: `${weeksRaw} weeks/year is more weeks than a year has — capped at 52.` });
  if (hoursRaw === 0 || weeksRaw === 0) problems.push({ level: 'warn', field: 'hours', text: 'Hours/week or weeks/year is zero. Both are required, and blank time on a real commitment reads as an activity that barely happened.' });
  if (!fields.organization.text) problems.push({ level: 'tip', field: 'organization', text: 'No organization name. Even "self-organized" or a school name is better than an empty field.' });
  if (fields.description.text && !/\d/.test(fields.description.text)) problems.push({ level: 'tip', field: 'description', text: 'No number anywhere in the description. A quantity — people, dollars, hours, a percentage — is the cheapest credibility there is in 150 characters.' });

  return {
    slot: index + 1,
    id: activity?.id ?? `slot-${index}`,
    sourceType: activity?.activity_type || 'Other',
    alternates: categoryAlternates(activity?.activity_type),
    weight: activityWeight(activity),
    ...fields,
    problems,
    blocking: problems.some(p => p.level === 'error'),
  };
}

export function buildHonorSlot(award, index) {
  const title = compressText(award?.title);
  const titleField = field(title, CA_LIMITS.honorTitle, { required: true, label: 'Honor title' });
  const problems = [];
  if (titleField.missing) problems.push({ level: 'error', field: 'title', text: 'Honor has no title.' });
  if (titleField.over) problems.push({ level: 'error', field: 'title', text: `Title is ${titleField.overBy} characters over the 100-character limit.` });
  if (!award?.level) problems.push({ level: 'warn', field: 'level', text: 'No level of recognition set. School / State-Regional / National / International is a required field, and it is most of what the honor communicates.' });
  if (!award?.grade_level) problems.push({ level: 'warn', field: 'grade', text: 'No grade level set — required on the form.' });
  return {
    slot: index + 1,
    id: award?.id ?? `honor-${index}`,
    title: titleField,
    grade: award?.grade_level || '',
    level: award?.level || '',
    issuer: award?.issuing_organization || '',
    problems,
    blocking: problems.some(p => p.level === 'error'),
  };
}

// Award ordering: the form shows five slots and readers read them top-down, so
// national beats regional beats school, and a tie breaks toward the more recent
// grade. Nothing subtle — it just shouldn't be insertion order.
const LEVEL_RANK = { International: 4, National: 3, 'State/Regional': 2, School: 1 };
export function rankAwards(awards = []) {
  return [...awards]
    .map((a, i) => ({ a, i, r: (LEVEL_RANK[a?.level] || 0) * 10 + (parseInt(a?.grade_level, 10) || 0) }))
    .sort((x, y) => y.r - x.r || x.i - y.i)
    .map(x => x.a);
}

// ── The export ───────────────────────────────────────────────────────────────

/**
 * The whole Common App export: ranked slots, the overflow that doesn't fit in
 * ten, honors, and a list-level verdict.
 *
 * @param {Array} activities  raw `activities` rows
 * @param {Array} awards      raw `awards` rows
 * @param {Object} opts       { order: id[] — student's own ordering, overrides: {id: category} }
 */
export function buildCommonAppExport(activities = [], awards = [], { order = null, overrides = {} } = {}) {
  // A student-supplied order wins over our heuristic — they know which activity
  // matters most to them, and the form is asking them, not us.
  let ranked;
  if (Array.isArray(order) && order.length) {
    const byId = new Map(activities.map(a => [String(a.id), a]));
    ranked = order.map(id => byId.get(String(id))).filter(Boolean);
    activities.forEach(a => { if (!ranked.includes(a)) ranked.push(a); });
  } else {
    ranked = rankActivities(activities);
  }

  const slots = ranked.slice(0, CA_LIMITS.maxActivities)
    .map((a, i) => buildActivitySlot(a, i, { categoryOverride: overrides[String(a.id)] || null }));
  const overflow = ranked.slice(CA_LIMITS.maxActivities)
    .map((a, i) => buildActivitySlot(a, CA_LIMITS.maxActivities + i, { categoryOverride: overrides[String(a.id)] || null }));

  const rankedAwards = rankAwards(awards);
  const honors = rankedAwards.slice(0, CA_LIMITS.maxHonors).map(buildHonorSlot);
  const honorOverflow = rankedAwards.slice(CA_LIMITS.maxHonors).map((a, i) => buildHonorSlot(a, CA_LIMITS.maxHonors + i));

  const errors = slots.reduce((n, s) => n + s.problems.filter(p => p.level === 'error').length, 0)
    + honors.reduce((n, s) => n + s.problems.filter(p => p.level === 'error').length, 0);
  const warnings = slots.reduce((n, s) => n + s.problems.filter(p => p.level === 'warn').length, 0)
    + honors.reduce((n, s) => n + s.problems.filter(p => p.level === 'warn').length, 0);

  return {
    slots, overflow, honors, honorOverflow,
    counts: {
      activities: activities.length, usedSlots: slots.length, freeSlots: CA_LIMITS.maxActivities - slots.length,
      awards: awards.length, usedHonors: honors.length, freeHonors: CA_LIMITS.maxHonors - honors.length,
      overflow: overflow.length, honorOverflow: honorOverflow.length,
    },
    errors, warnings,
    clean: errors === 0,
  };
}

// ── Renderers ────────────────────────────────────────────────────────────────
// Three real formats, because "copy" means different things depending on where
// the student is pasting.

// 1. FIELD-BY-FIELD — the one that actually maps to the form. Every line is
// `Field: value`, in the form's own order, so filling the real thing is
// copy-read-type down a list rather than re-reading prose and guessing.
export function renderCommonAppText(exported) {
  const L = [];
  L.push('COMMON APPLICATION — ACTIVITIES SECTION');
  L.push('Fill these into Common App > Activities. Each block is one activity slot, in the field order the form uses.');
  L.push(`${exported.counts.usedSlots} of 10 slots used${exported.counts.overflow ? ` · ${exported.counts.overflow} activity/activities did not fit and are listed at the bottom` : ''}.`);
  L.push('');
  exported.slots.forEach(s => {
    L.push(`──────── ACTIVITY ${s.slot} of 10 ────────`);
    L.push(`Activity type:        ${s.category}`);
    L.push(`Position/Leadership:  ${s.position.text}   [${s.position.len}/${CA_LIMITS.position}${s.position.over ? ' — OVER LIMIT' : ''}]`);
    L.push(`Organization Name:    ${s.organization.text}   [${s.organization.len}/${CA_LIMITS.organization}${s.organization.over ? ' — OVER LIMIT' : ''}]`);
    L.push(`Description:          ${s.description.text}   [${s.description.len}/${CA_LIMITS.description}${s.description.over ? ' — OVER LIMIT' : ''}]`);
    L.push(`Grade levels:         ${s.grades.length ? s.grades.join(', ') : '(none ticked — required)'}`);
    L.push(`Timing:               ${s.timing}`);
    L.push(`Hours per week:       ${s.hours}`);
    L.push(`Weeks per year:       ${s.weeks}`);
    L.push(`Continue in college:  ${s.continueInCollege ? 'Yes' : 'No'}`);
    if (s.problems.length) {
      L.push('  ! ' + s.problems.filter(p => p.level !== 'tip').map(p => p.text).join('\n  ! '));
    }
    L.push('');
  });

  L.push('COMMON APPLICATION — HONORS SECTION');
  if (!exported.honors.length) {
    L.push('(nothing logged — the Honors section takes up to 5)');
  } else {
    exported.honors.forEach(h => {
      L.push(`──────── HONOR ${h.slot} of 5 ────────`);
      L.push(`Honor title:            ${h.title.text}   [${h.title.len}/${CA_LIMITS.honorTitle}${h.title.over ? ' — OVER LIMIT' : ''}]`);
      L.push(`Grade level:            ${h.grade || '(not set — required)'}`);
      L.push(`Level of recognition:   ${h.level || '(not set — required)'}`);
      L.push('');
    });
  }

  if (exported.overflow.length) {
    L.push('──────── DID NOT FIT IN 10 SLOTS ────────');
    L.push('The Common App allows ten activities. These ranked lowest and were left out — if one of them matters more to you than something above, reorder before you paste.');
    exported.overflow.forEach(s => L.push(`- ${s.position.text}${s.organization.text ? ` (${s.organization.text})` : ''} — ${s.category}, ${s.hours}h/wk x ${s.weeks}wks`));
    L.push('');
  }
  if (exported.honorOverflow.length) {
    L.push('──────── HONORS THAT DID NOT FIT IN 5 ────────');
    exported.honorOverflow.forEach(h => L.push(`- ${h.title.text}${h.level ? ` (${h.level})` : ''}`));
  }
  return L.join('\n').trim();
}

// 2. RÉSUMÉ — a normal, human-readable activities résumé for a scholarship
// application, a teacher writing a letter, or a job. Grouped by category,
// full text (no 150-character cap, because this format doesn't have one).
export function renderResumeText(activities = [], awards = [], { name = null } = {}) {
  const L = [];
  if (name) { L.push(name.toUpperCase()); L.push('Activities & Experience'); L.push(''); }
  const ranked = rankActivities(activities);
  const byType = new Map();
  ranked.forEach(a => {
    const k = a.activity_type || 'Other';
    if (!byType.has(k)) byType.set(k, []);
    byType.get(k).push(a);
  });
  for (const [type, list] of byType) {
    L.push(type.toUpperCase());
    list.forEach(a => {
      const years = (a.grade_levels || []).length ? ` (Grades ${(a.grade_levels || []).join(', ')})` : '';
      L.push(`  ${a.position}${a.organization ? ` — ${a.organization}` : ''}${years}`);
      const hrs = (Number(a.hours_per_week) || 0) * (Number(a.weeks_per_year) || 0);
      if (hrs > 0) L.push(`    ${a.hours_per_week} hrs/week x ${a.weeks_per_year} weeks/year ≈ ${Math.round(hrs)} hours/year${a.status === 'ongoing' ? ' · ongoing' : ''}`);
      if (a.description) L.push(`    ${String(a.description).replace(/\s+/g, ' ').trim()}`);
      if (a.impact) L.push(`    Impact: ${String(a.impact).replace(/\s+/g, ' ').trim()}`);
      if ((a.skills_tags || []).length) L.push(`    Skills: ${a.skills_tags.join(', ')}`);
      L.push('');
    });
  }
  if (awards.length) {
    L.push('HONORS & AWARDS');
    rankAwards(awards).forEach(a => {
      L.push(`  ${a.title}${a.level ? ` — ${a.level}` : ''}${a.grade_level ? ` (Grade ${a.grade_level})` : ''}${a.issuing_organization ? `, ${a.issuing_organization}` : ''}`);
    });
  }
  return L.join('\n').trim();
}

// 3. HONORS ONLY — the one students most often need on its own (scholarship
// forms almost always ask for honors separately from activities).
export function renderHonorsText(awards = []) {
  if (!awards.length) return 'No honors or awards logged yet.';
  return rankAwards(awards).map((a, i) =>
    `${i + 1}. ${a.title}${a.level ? ` — ${a.level}` : ''}${a.grade_level ? ` (Grade ${a.grade_level})` : ''}${a.issuing_organization ? `, awarded by ${a.issuing_organization}` : ''}`
  ).join('\n');
}

// One field, on its own, for the per-field copy buttons in the export modal —
// which is how a student actually fills the real form: click the field in the
// Common App, click copy here, paste, next field.
export function slotFieldValue(slot, key) {
  switch (key) {
    case 'category': return slot.category;
    case 'position': return slot.position.text;
    case 'organization': return slot.organization.text;
    case 'description': return slot.description.text;
    case 'grades': return slot.grades.join(', ');
    case 'timing': return slot.timing;
    case 'hours': return String(slot.hours);
    case 'weeks': return String(slot.weeks);
    default: return '';
  }
}

export const EXPORT_FORMATS = [
  { id: 'commonapp', label: 'Common App fields', hint: 'Field-by-field, in the order the real form asks. This is the one to use while filling the application.' },
  { id: 'resume', label: 'Résumé', hint: 'A normal activities résumé — for scholarship forms, a recommender, or a job application.' },
  { id: 'honors', label: 'Honors only', hint: 'Just the honors list, ranked by level of recognition.' },
];
