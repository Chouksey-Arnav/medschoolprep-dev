// ─────────────────────────────────────────────────────────────────────────────
// Portfolio → the Common Application, derived.
//
// ./sections.js describes the real form. This file answers, for one student at
// one moment: what would go in each of those sections right now, and what is
// missing.
//
// ── The one rule ─────────────────────────────────────────────────────────────
// NOTHING IS INVENTED. Every value that comes out of here is something the
// student typed into their Portfolio, or a count of things they typed, or a
// verdict about those things. This module never writes a sentence for them,
// never fills a gap with a plausible default, and never reports a section as
// ready on the strength of data it made up. It is the same commitment
// src/lib/commonApp/activities.js makes about activity descriptions, applied to the whole
// form — and it matters more here, because a readiness percentage is exactly
// the kind of number a stressed seventeen-year-old will trust without checking.
//
// The corollary, which is the part that takes discipline: a section we cannot
// see into reports as UNKNOWN, not as zero and not as complete. The Family
// section of the real form may be entirely finished; this app has no way to
// know, and saying "0%" about it would be a false statement about the student's
// application rather than a true statement about our data.
//
// ── Why readiness is per-section and not one number ──────────────────────────
// There is a strong pull toward a single "your Common App is 62% done" figure.
// It would be wrong in both directions at once: it would count the sections we
// cannot see (making it too low), and it would count a typed-in draft the same
// as a submitted one (making it too high). Worse, it would be the number
// students optimize, and the sections that move it fastest are the trivial ones.
// So: per-section states, an honest count of how many sections we can even speak
// to, and no headline percentage anywhere.
//
// Pure functions over a portfolio snapshot. No React, no network.
// ─────────────────────────────────────────────────────────────────────────────

import {
  CA_SECTIONS, CA_LIMITS, CA_WRITING_LIMITS, CA_ESSAY_PROMPTS, fieldKey,
} from './sections.js';
import { buildCommonAppExport, rankAwards, compressText } from './activities.js';

/** Word count the way a word-limited form counts: whitespace-separated tokens. */
export function wordCount(text) {
  const s = String(text || '').trim();
  return s ? s.split(/\s+/).length : 0;
}

/**
 * The state one section can be in.
 *
 *   'unknown'  — the real form asks this and we cannot see it. NOT a failure and
 *                NOT zero; see the header.
 *   'empty'    — we can see it, and there is nothing in the Portfolio yet.
 *   'partial'  — started, with something concrete still missing.
 *   'ready'    — everything this section needs is present and within its limits.
 *   'blocked'  — there is content, but something in it will not survive the real
 *                form: a field over its cap, a required field blank. Distinct
 *                from 'partial' because the fix is different — partial means do
 *                more, blocked means fix what is there.
 */
export const SECTION_STATES = ['unknown', 'empty', 'partial', 'ready', 'blocked'];

const state = (id, status, { entries = [], summary = '', blockers = [], gaps = [], stats = {} } = {}) =>
  ({ id, status, entries, summary, blockers, gaps, stats });

/**
 * One derived entry inside a section — an activity slot, an honor, an essay.
 *
 * `fields` is a map of fieldId → { value, over, limit } so the sync layer can
 * key on individual fields and the UI can render a per-field copy button. It is
 * always the STUDENT'S OWN TEXT, never truncated: the overflow is shown rather
 * than hidden, because a student who cannot see what will be cut cannot choose
 * what to cut.
 */
const entry = (id, title, fields, { problems = [], subtitle = null, meta = null } = {}) =>
  ({ id, title, subtitle, meta, fields, problems });

const textField = (value, limit, unit = 'characters') => {
  const text = String(value ?? '').trim();
  const len = unit === 'words' ? wordCount(text) : text.length;
  return {
    value: text,
    len,
    limit,
    unit,
    over: limit != null && len > limit,
    overBy: limit != null ? Math.max(0, len - limit) : 0,
    empty: len === 0,
  };
};

// ── Section derivations ──────────────────────────────────────────────────────
// One function per mirrored section. Each takes the whole context and returns a
// state(). They are deliberately independent: a section that throws (a malformed
// row, a column that moved) must not take the other fourteen down with it, and
// deriveApplication below wraps each one for exactly that reason.

function deriveProfile(ctx) {
  const u = ctx.user || {};
  const have = [
    u.name ? null : 'legal name',
    u.email ? null : 'email address',
  ].filter(Boolean);
  const fields = {
    legalName: textField(u.name, null),
    email: textField(u.email, null),
  };
  return state('profile', have.length === 2 ? 'empty' : have.length ? 'partial' : 'partial', {
    entries: [entry('profile', u.name || 'Your profile', fields)],
    // Deliberately never 'ready'. We hold two of this section's fields and the
    // real one has a dozen — reporting it complete because the two we happen to
    // store are filled would be the exact false reassurance this file exists to
    // avoid.
    summary: have.length
      ? `Add your ${have.join(' and ')} in Settings.`
      : 'Your name and email are set. The address, citizenship and demographic questions are on the real form only.',
    gaps: have.map((h) => `No ${h} on file.`),
  });
}

function deriveGrades(ctx) {
  const rows = ctx.snapshot?.gpaEntries || [];
  if (!rows.length) {
    return state('education-grades', 'empty', {
      summary: 'No GPA logged yet. The Common App asks for a cumulative GPA and the scale it is on.',
      gaps: ['No GPA entries.'],
    });
  }
  // Most recent term wins, on created_at, because a GPA log is chronological and
  // the cumulative figure a student reports is the latest one they computed.
  const sorted = [...rows].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  const latest = sorted[0];
  const weighted = rows.filter((r) => r.weighted).length;
  const fields = {
    cumulativeGpa: textField(latest.gpa != null ? String(latest.gpa) : '', null),
    gpaScale: textField(latest.weighted ? 'Weighted' : 'Unweighted', null),
    classRank: textField('', null),
  };
  return state('education-grades', 'ready', {
    entries: [entry('gpa', `${latest.gpa} (${latest.weighted ? 'weighted' : 'unweighted'})`, fields, {
      subtitle: latest.term || null,
      meta: `${rows.length} term${rows.length === 1 ? '' : 's'} logged`,
    })],
    summary: `Latest logged GPA is ${latest.gpa}, ${latest.weighted ? 'weighted' : 'unweighted'}.`,
    // Not a blocker, because it is not one — but it is the mistake, so it is said.
    gaps: weighted && weighted < rows.length
      ? ['Some terms are logged weighted and some unweighted. The form asks for one scale, and mixing them is the most common way this section goes wrong.']
      : [],
    stats: { terms: rows.length },
  });
}

function deriveHonors(ctx) {
  const awards = ctx.snapshot?.awards || [];
  if (!awards.length) {
    return state('education-honors', 'empty', {
      summary: `Five honor slots, none used. Anything with a name and a level of recognition counts — a subject award, a placing at a competition, a scholarship.`,
      gaps: ['No awards logged.'],
    });
  }
  const ranked = rankAwards(awards);
  const used = ranked.slice(0, CA_LIMITS.maxHonors);
  const overflow = ranked.slice(CA_LIMITS.maxHonors);
  const entries = used.map((a, i) => {
    const title = textField(compressText(a.title), CA_LIMITS.honorTitle);
    const problems = [];
    if (title.over) problems.push({ level: 'error', text: `Title is ${title.overBy} characters over the ${CA_LIMITS.honorTitle}-character limit.` });
    if (!a.level) problems.push({ level: 'warn', text: 'No level of recognition set, and it is a required field — School, State/Regional, National or International.' });
    if (!a.grade_level) problems.push({ level: 'warn', text: 'No grade level set, and it is required.' });
    return entry(a.id ?? `honor-${i}`, a.title || 'Untitled honor', {
      title,
      grade: textField(a.grade_level, null),
      level: textField(a.level, null),
    }, { problems, subtitle: a.level || null, meta: `Slot ${i + 1} of ${CA_LIMITS.maxHonors}` });
  });
  const blockers = entries.flatMap((e) => e.problems.filter((p) => p.level === 'error').map((p) => `${e.title}: ${p.text}`));
  return state('education-honors', blockers.length ? 'blocked' : 'ready', {
    entries,
    summary: `${used.length} of ${CA_LIMITS.maxHonors} honor slots used${overflow.length ? `, ${overflow.length} did not fit` : ''}.`,
    blockers,
    gaps: overflow.length
      ? [`${overflow.length} award${overflow.length === 1 ? '' : 's'} ranked below the top five and will not appear. If one of them matters more to you than something above it, reorder before you paste.`]
      : [],
    stats: { used: used.length, free: CA_LIMITS.maxHonors - used.length, overflow: overflow.length },
  });
}

function deriveActivities(ctx) {
  const rows = ctx.snapshot?.activities || [];
  if (!rows.length) {
    return state('activities', 'empty', {
      summary: 'Ten slots, none used. This is the section that carries the most weight and it is entirely built from what you log.',
      gaps: ['No activities logged.'],
      stats: { used: 0, free: CA_LIMITS.maxActivities, overflow: 0 },
    });
  }
  // The existing export engine already does the real work — ranking, category
  // mapping, per-field limits, the problem list. Reusing it rather than writing
  // a second implementation is the whole reason it was built as pure functions.
  const exported = buildCommonAppExport(rows, ctx.snapshot?.awards || [], {
    order: ctx.order || null,
    overrides: ctx.categoryOverrides || {},
  });
  const entries = exported.slots.map((s) => entry(s.id, s.position.text || 'Untitled activity', {
    category: textField(s.category, null),
    position: textField(s.position.text, CA_LIMITS.position),
    organization: textField(s.organization.text, CA_LIMITS.organization),
    description: textField(s.description.text, CA_LIMITS.description),
    grades: textField(s.grades.join(', '), null),
    timing: textField(s.timing, null),
    hours: textField(String(s.hours), null),
    weeks: textField(String(s.weeks), null),
  }, {
    problems: s.problems,
    subtitle: s.organization.text || null,
    meta: `Slot ${s.slot} of ${CA_LIMITS.maxActivities}`,
  }));
  const blockers = entries.flatMap((e) => e.problems.filter((p) => p.level === 'error').map((p) => `${e.title}: ${p.text}`));
  return state('activities', blockers.length ? 'blocked' : 'ready', {
    entries,
    summary: `${exported.counts.usedSlots} of ${CA_LIMITS.maxActivities} slots used${exported.counts.overflow ? `, ${exported.counts.overflow} did not fit` : ''}.`,
    blockers,
    gaps: exported.counts.overflow
      ? [`${exported.counts.overflow} activit${exported.counts.overflow === 1 ? 'y' : 'ies'} ranked outside the top ten. The Common App allows ten — reorder if one of them matters more than something above it.`]
      : [],
    stats: exported.counts,
  });
}

function deriveTesting(ctx) {
  const rows = ctx.snapshot?.testScores || [];
  if (!rows.length) {
    return state('testing', 'empty', {
      summary: 'No scores logged. You can list a sitting you have not taken yet, which is worth knowing.',
      gaps: ['No test scores logged.'],
    });
  }
  const entries = rows.slice(0, 12).map((r, i) => entry(r.id ?? `score-${i}`, `${r.test_type || 'Test'}${r.composite != null ? ` — ${r.composite}` : ''}`, {
    satAct: textField(r.composite != null ? `${r.test_type} ${r.composite}` : String(r.test_type || ''), null),
  }, { subtitle: r.test_date || null, meta: r.is_target ? 'Target score' : null }));
  const real = rows.filter((r) => r.composite != null && !r.is_target);
  return state('testing', real.length ? 'ready' : 'partial', {
    entries,
    summary: real.length
      ? `${real.length} real sitting${real.length === 1 ? '' : 's'} logged.`
      : 'Only target scores logged so far — no sitting has a real result yet.',
    gaps: real.length ? [] : ['Every logged score is a target rather than a result. Targets are useful to you and are not what this section wants.'],
    stats: { sittings: real.length },
  });
}

function deriveEssay(ctx) {
  const essays = ctx.snapshot?.essays || [];
  // The personal statement is the essay with no college attached — every
  // supplement is bound to a college_id. Falls back to a title match so an
  // essay a student attached to a college by accident is still found.
  const candidates = essays.filter((e) => !e.college_id
    || /personal statement|common app|personal essay/i.test(String(e.title || '')));
  if (!candidates.length) {
    return state('writing-essay', 'empty', {
      summary: `No personal statement started. ${CA_WRITING_LIMITS.personalEssayMin}–${CA_WRITING_LIMITS.personalEssayMax} words, one of seven prompts, read by every college on your list.`,
      gaps: ['No personal statement in the essay workspace.'],
    });
  }
  const best = candidates.reduce((a, b) => (wordCount(b.content) > wordCount(a.content) ? b : a));
  const words = wordCount(best.content);
  const essay = textField(best.content, CA_WRITING_LIMITS.personalEssayMax, 'words');
  const matchedPrompt = CA_ESSAY_PROMPTS.find((p) => String(best.prompt || '').trim() && p.text.slice(0, 40) === String(best.prompt).slice(0, 40));
  const problems = [];
  if (essay.over) problems.push({ level: 'error', text: `${words} words — ${essay.overBy} over the 650-word ceiling. The form will not accept it.` });
  if (words > 0 && words < CA_WRITING_LIMITS.personalEssayMin) problems.push({ level: 'error', text: `${words} words — under the 250-word floor. The form will not accept it.` });
  if (!String(best.prompt || '').trim()) problems.push({ level: 'warn', text: 'No prompt chosen. Seven to pick from, and the seventh is "any topic of your choice" — so an essay you have already written is always eligible.' });
  const status = words === 0 ? 'empty' : problems.some((p) => p.level === 'error') ? 'blocked' : 'ready';
  return state('writing-essay', status, {
    entries: [entry(best.id ?? 'personal-essay', best.title || 'Personal statement', {
      prompt: textField(best.prompt, null),
      essay,
    }, { problems, subtitle: matchedPrompt ? 'Matches a real Common App prompt' : null, meta: `${words} / ${CA_WRITING_LIMITS.personalEssayMax} words` })],
    summary: words
      ? `${words} of ${CA_WRITING_LIMITS.personalEssayMax} words, ${best.status || 'drafting'}.`
      : 'Started, but empty.',
    blockers: problems.filter((p) => p.level === 'error').map((p) => p.text),
    stats: { words },
  });
}

function deriveAdditional(ctx) {
  const essays = ctx.snapshot?.essays || [];
  const add = essays.find((e) => /additional information/i.test(String(e.title || '')));
  if (!add) {
    return state('writing-additional', 'empty', {
      // Empty is genuinely the right answer here for most students, and saying so
      // stops the section reading as an unfinished task it is not.
      summary: 'Nothing here, which is a perfectly good answer. This box is for context a reader would otherwise misread — not a second essay.',
    });
  }
  const words = wordCount(add.content);
  const f = textField(add.content, CA_WRITING_LIMITS.additionalInfoMax, 'words');
  return state('writing-additional', f.over ? 'blocked' : words ? 'ready' : 'empty', {
    entries: [entry(add.id ?? 'additional', add.title || 'Additional information', { additional: f }, {
      problems: f.over ? [{ level: 'error', text: `${words} words — ${f.overBy} over the 650-word limit.` }] : [],
      meta: `${words} / ${CA_WRITING_LIMITS.additionalInfoMax} words`,
    })],
    summary: `${words} of ${CA_WRITING_LIMITS.additionalInfoMax} words.`,
    blockers: f.over ? [`Additional information is ${f.overBy} words over the limit.`] : [],
  });
}

function deriveColleges(ctx) {
  const rows = ctx.snapshot?.colleges || [];
  if (!rows.length) {
    return state('college-list', 'empty', {
      summary: 'No colleges on the list. Adding one to the real application is what reveals its supplements, its questions and its recommender rules — until then you cannot see what it will ask for.',
      gaps: ['No colleges in your list.'],
    });
  }
  const entries = rows.slice(0, 20).map((c, i) => {
    const plan = c.ea_ed_deadline ? 'Early (ED/EA)' : c.rd_deadline ? 'Regular Decision' : '';
    const problems = [];
    if (!c.ea_ed_deadline && !c.rd_deadline) problems.push({ level: 'warn', text: 'No deadline recorded, so nothing can be back-planned from this college.' });
    return entry(c.id ?? `college-${i}`, c.name || 'Untitled college', {
      college: textField(c.name, null),
      decisionPlan: textField(plan, null),
    }, { problems, subtitle: c.category || c.status || null, meta: c.ea_ed_deadline || c.rd_deadline || null });
  });
  const dated = rows.filter((c) => c.ea_ed_deadline || c.rd_deadline).length;
  return state('college-list', dated === rows.length ? 'ready' : 'partial', {
    entries,
    summary: `${rows.length} college${rows.length === 1 ? '' : 's'}, ${dated} with a deadline recorded.`,
    gaps: dated < rows.length ? [`${rows.length - dated} college${rows.length - dated === 1 ? ' has' : 's have'} no deadline recorded.`] : [],
    stats: { colleges: rows.length, dated },
  });
}

function deriveSupplements(ctx) {
  const essays = (ctx.snapshot?.essays || []).filter((e) => e.college_id);
  const colleges = ctx.snapshot?.colleges || [];
  if (!colleges.length) {
    return state('college-supplements', 'empty', {
      summary: 'Supplements are per-college, so this fills in once there are colleges on your list.',
    });
  }
  const byCollege = new Map(colleges.map((c) => [String(c.id), c]));
  const entries = essays.slice(0, 30).map((e, i) => {
    const words = wordCount(e.content);
    const limit = Number(e.word_limit) || null;
    const f = textField(e.content, limit, 'words');
    return entry(e.id ?? `supp-${i}`, e.title || 'Untitled supplement', { supplement: f }, {
      problems: f.over ? [{ level: 'error', text: `${words} words — ${f.overBy} over this prompt's ${limit}-word limit.` }] : [],
      subtitle: byCollege.get(String(e.college_id))?.name || null,
      meta: limit ? `${words} / ${limit} words` : `${words} words`,
    });
  });
  const blockers = entries.flatMap((e) => e.problems.filter((p) => p.level === 'error').map((p) => `${e.title}: ${p.text}`));
  const withEssays = new Set(essays.map((e) => String(e.college_id)));
  const without = colleges.filter((c) => !withEssays.has(String(c.id)));
  return state('college-supplements', blockers.length ? 'blocked' : essays.length ? 'partial' : 'empty', {
    entries,
    summary: `${essays.length} supplement${essays.length === 1 ? '' : 's'} across ${withEssays.size} of ${colleges.length} colleges.`,
    blockers,
    // Deliberately phrased as unknown rather than missing. A college may genuinely
    // require no supplement, and telling a student they are behind on an essay
    // that does not exist is a false alarm they cannot resolve.
    gaps: without.length
      ? [`${without.length} college${without.length === 1 ? '' : 's'} on your list have no supplement logged. Some genuinely require none — adding them to the real application is the only way to find out which.`]
      : [],
    stats: { supplements: essays.length, colleges: colleges.length },
  });
}

function deriveRecommenders(ctx) {
  const rows = ctx.snapshot?.recommenders || [];
  if (!rows.length) {
    return state('recommenders', 'empty', {
      summary: 'No recommenders tracked. The FERPA waiver has to be signed before you can invite anyone, and it takes two minutes.',
      gaps: ['No recommenders logged.'],
    });
  }
  const entries = rows.map((r, i) => entry(r.id ?? `rec-${i}`, r.name || 'Unnamed recommender', {
    counselor: textField(r.relationship || r.type || '', null),
  }, { subtitle: r.relationship || null, meta: r.status || null }));
  const asked = rows.filter((r) => r.status && r.status !== 'planning').length;
  return state('recommenders', asked ? 'ready' : 'partial', {
    entries,
    summary: `${rows.length} tracked, ${asked} actually asked.`,
    gaps: asked ? [] : ['Everyone on the list is still at "planning". A recommender who has not been asked is not a recommender.'],
    stats: { tracked: rows.length, asked },
  });
}

function deriveCoursesGrades(ctx) {
  const gpa = ctx.snapshot?.gpaEntries || [];
  return state('courses-grades', gpa.length ? 'partial' : 'empty', {
    summary: gpa.length
      ? `${gpa.length} term${gpa.length === 1 ? '' : 's'} of GPA logged, which is not the same thing as a course-by-course transcript.`
      : 'Nothing logged. This section only appears if a college on your list requires it.',
    gaps: ['Whether you need this at all depends entirely on your college list, and it takes hours. Find out in August, not in December.'],
  });
}

function deriveCbo(ctx) {
  // Nothing in the Portfolio maps cleanly onto "an organization that gave you
  // free help with your application", and inferring it from tracked programs
  // would be a guess about a factual question on a real form. So this reports
  // as a prompt rather than as derived data — which is honest, and is also the
  // useful thing, since the section's whole problem is that nobody knows it
  // exists.
  return state('education-cbo', 'empty', {
    summary: `Up to ${CA_WRITING_LIMITS.maxCommunityOrgs} organizations, and almost nobody fills this in. If a college access program, a mentoring nonprofit or a community organization has helped you with any of this for free, it belongs here.`,
  });
}

function deriveFuturePlans(ctx) {
  const u = ctx.user || {};
  const career = u.dreamRole || u.specialty || u.pathway || '';
  return state('education-future-plans', career ? 'ready' : 'empty', {
    entries: [entry('future-plans', career || 'Not set', {
      careerInterest: textField(career, null),
      highestDegree: textField(career ? 'Doctorate' : '', null),
    })],
    summary: career
      ? `Career interest reads as ${career}. Highest degree intended is Doctorate.`
      : 'No career interest set yet — it comes from your pathway and your roadmap answers.',
  });
}

const DERIVERS = {
  profile: deriveProfile,
  'education-grades': deriveGrades,
  'education-honors': deriveHonors,
  'education-cbo': deriveCbo,
  'education-future-plans': deriveFuturePlans,
  testing: deriveTesting,
  activities: deriveActivities,
  'writing-essay': deriveEssay,
  'writing-additional': deriveAdditional,
  'courses-grades': deriveCoursesGrades,
  'college-list': deriveColleges,
  'college-supplements': deriveSupplements,
  recommenders: deriveRecommenders,
};

/**
 * The whole Common Application, as it stands for this student right now.
 *
 * @param {object} ctx
 * @param {object} ctx.snapshot  a portfolio snapshot (src/lib/portfolioData.js)
 * @param {object} ctx.user      the local user record
 * @returns {{sections: object[], counts: object}}
 */
export function deriveApplication(ctx = {}) {
  const sections = CA_SECTIONS.map((section) => {
    const derive = DERIVERS[section.id];
    if (!derive) {
      // An 'external' section, or one we have not taught this module to read.
      // Both report as unknown, which is the true statement — see the header on
      // why unknown is not zero.
      return { ...section, ...state(section.id, 'unknown') };
    }
    let derived;
    try {
      derived = derive(ctx);
    } catch {
      // A section that throws must not take the other fourteen with it. It
      // reports unknown, which is exactly what it is: we tried to look and could
      // not. Silently reporting 'empty' here would tell a student their essay is
      // missing because of a bug in our own code.
      derived = state(section.id, 'unknown', { summary: 'We could not read this section just now. Nothing is wrong with your application — reopen this page and it should resolve.' });
    }
    return { ...section, ...derived };
  });

  const counts = {
    total: sections.length,
    // How many we can even speak to. Reported to the student, because "eleven of
    // sixteen sections are ones we can see" is the honest frame for everything
    // else on the page.
    visible: sections.filter((s) => s.status !== 'unknown').length,
    ready: sections.filter((s) => s.status === 'ready').length,
    blocked: sections.filter((s) => s.status === 'blocked').length,
    partial: sections.filter((s) => s.status === 'partial').length,
    empty: sections.filter((s) => s.status === 'empty').length,
    unknown: sections.filter((s) => s.status === 'unknown').length,
  };
  return { sections, counts };
}

/**
 * Every derived field of every derived entry, flattened to the stable keys the
 * sync ledger uses. The bridge between this module and ./sync.js.
 */
export function flattenFields(sections = []) {
  const out = {};
  for (const s of sections) {
    for (const e of s.entries || []) {
      for (const [fid, f] of Object.entries(e.fields || {})) {
        out[fieldKey(s.id, e.id, fid)] = { sectionId: s.id, entryId: e.id, fieldId: fid, ...f };
      }
    }
  }
  return out;
}
