#!/usr/bin/env node
/**
 * The gate on parent accounts.
 *
 * A parent is a row in app_users with role='parent', which means their bearer token is
 * indistinguishable from a student's to every handler in this repo (see the header of
 * supabase/migrations/0006_parent_dashboard.sql for why that trade was made). Two guards make that
 * safe — requireStudent on the student endpoints, requireParent plus a per-request getActiveLink
 * on the parent ones — and the failure mode of forgetting either is SILENT: the endpoint keeps
 * working, for the wrong person.
 *
 * A code review cannot be the control for that, because the dangerous change is not "someone edits
 * the guard", it is "someone adds a new endpoint and never thinks about it". So this script is
 * structural: it enumerates the handlers that exist, not the ones anybody remembered to list, and
 * fails on any that is not explicitly accounted for.
 *
 *   1. EVERY HANDLER IS CLASSIFIED. Each file under api/ either calls exactly one guard or is on
 *      the public allowlist below, with a reason. A new file is a failure until someone decides
 *      which it is.
 *   2. THE STUDENT ENDPOINTS ARE STUDENT-ONLY, and the parent endpoints that return student data
 *      are parent-only.
 *   3. CONSENT IS RE-READ PER REQUEST, never cached on the 30-day session.
 *   4. ROLE IS WRITTEN ONLY AT ACCOUNT CREATION. A student who could flip themselves to 'parent'
 *      could invite anyone and read their progress.
 *   5. THE SUMMARY IS AN ALLOWLIST. Built against a snapshot stuffed with private content, then
 *      scanned for any trace of it — coach transcripts, notes, highlights, per-question answers.
 *   6. THE DERIVATION IS CORRECT. Streaks, calendars and trends, against known inputs.
 *   7. THE DIGEST DOES NOT EDITORIALISE. Every branch of the plain-language read is checked for
 *      language that infers motive from an absence of rows, or that hands the parent an
 *      enforcement instruction.
 *
 * Run:  npm run verify:parent
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { buildParentSummary } from '../api/_lib/parentSummary.js';
import { normalizeProfileInput, isProfileComplete, ATTESTATION_TEXT } from '../api/_lib/parentProfile.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API_DIR = path.join(ROOT, 'api');

let passed = 0;
const failures = [];
const assert = (label, cond, detail = '') => {
  if (cond) { passed += 1; console.log(`  ✓ ${label}`); return true; }
  failures.push(`${label}${detail ? `\n      ${detail}` : ''}`);
  console.error(`  ✗ ${label}${detail ? `\n      ${detail}` : ''}`);
  return false;
};
const section = (name) => console.log(`\n${name}`);
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

/** Every request handler under api/, excluding the shared _lib modules. */
function handlerFiles(dir = API_DIR, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '_lib') continue;
      handlerFiles(full, acc);
    } else if (entry.endsWith('.js')) {
      acc.push(path.relative(ROOT, full));
    }
  }
  return acc;
}

// ── The public surface, and why each one is on it ───────────────────────────
//
// These handlers deliberately answer without a session, because requiring one would make them
// impossible to use for their purpose. Every entry carries the reason, so removing one is a
// decision rather than a cleanup.
const PUBLIC_HANDLERS = {
  'api/auth/send-otp.js':        'issues the code that proves an inbox — runs before any account exists',
  'api/auth/verify-otp.js':      'redeems that code; the code is the credential',
  'api/auth/complete-signup.js': 'creates the account — there is no session to require yet',
  'api/auth/login.js':           'mints the session',
  'api/auth/google.js':          'exchanges a Google token for a session',
  'api/auth/reset-password.js':  'recovery path for someone who cannot sign in by definition',
  'api/auth/logout.js':          'drops a token; must work even for one already invalid',
  'api/parent/claim.js':         'redeems an invitation for someone who has no account yet — a session is what it MINTS',
  'api/send-email.js':           'contact form, reachable from the signed-out landing page',
  'api/groq.js':                 'AI proxy, rate-limited on its own terms',
};

/** Handlers that must be student-only: they read or write one student's own work. */
const STUDENT_ONLY = [
  'api/progress-sync.js',
  'api/master-plan.js',
  // The Roadmap tab's twelve-month plan. Student-only for the same reason the master plan is: it
  // is one student's own work, and a parent account hitting it would write nonsense rows under
  // their own id. The parent dashboard reads a roadmap through api/parent/summary.js instead.
  'api/roadmap.js',
  'api/reward-claim.js',
  'api/data/[resource].js',
  'api/lesson-feedback.js',
  // The safety review queue's write end. Student-only and deliberately so: a
  // safety event is a record of something a student said to Medabrain in a
  // conversation their parents cannot see, and the privacy of that channel is
  // what made the disclosure possible. No parent surface may read or write it.
  'api/safety-event.js',
];

/** Handlers that must be parent-only: they return another person's data. */
const PARENT_ONLY = ['api/parent/summary.js', 'api/parent/profile.js'];

/** Handlers legitimately used by both roles — profile, export, deletion, the link itself. */
// `quests.js` is here rather than under PARENT_ONLY because a student reads and updates their own
// board through it constantly — it is only the ASSIGN path that is a parent operation, and that
// branch re-reads the link per request exactly as summary.js does. See its header.
const EITHER_ROLE = ['api/auth/me.js', 'api/auth/account.js', 'api/parent/links.js', 'api/parent/accept.js', 'api/parent/messages.js', 'api/parent/quests.js'];

const GUARDS = ['requireStudent', 'requireParent', 'requireUser'];

function guardsUsedIn(source) {
  // Counts CALLS, not imports: an import that is never invoked is exactly the bug this looks for.
  return GUARDS.filter((g) => new RegExp(`await\\s+${g}\\s*\\(`).test(source));
}

// ── 1. Every handler is classified ──────────────────────────────────────────

function checkEveryHandlerClassified(files) {
  section('Every API handler is classified');

  const classified = new Set([...Object.keys(PUBLIC_HANDLERS), ...STUDENT_ONLY, ...PARENT_ONLY, ...EITHER_ROLE]);
  const unclassified = files.filter((f) => !classified.has(f));
  assert('no handler is unaccounted for (add it to a list in this file)', unclassified.length === 0,
    unclassified.length ? `unclassified: ${unclassified.join(', ')}` : '');

  const missing = [...classified].filter((f) => !files.includes(f));
  assert('every classified handler still exists', missing.length === 0,
    missing.length ? `listed but gone: ${missing.join(', ')}` : '');

  for (const file of files) {
    if (!classified.has(file)) continue;
    const source = read(file);
    const guards = guardsUsedIn(source);
    if (PUBLIC_HANDLERS[file]) {
      assert(`${file} is public and takes no session (${PUBLIC_HANDLERS[file]})`, guards.length === 0,
        `calls: ${guards.join(', ')}`);
    } else {
      assert(`${file} calls exactly one guard`, guards.length === 1,
        guards.length ? `calls ${guards.length}: ${guards.join(', ')}` : 'calls none — anyone with any token can reach it');
    }
  }
}

// ── 2. The right guard on the right endpoint ────────────────────────────────

function checkGuardChoice() {
  section('Student endpoints are student-only, parent endpoints are parent-only');

  for (const file of STUDENT_ONLY) {
    const source = read(file);
    assert(`${file} is behind requireStudent`, guardsUsedIn(source).includes('requireStudent'),
      'a parent account could otherwise write into this student table under its own id');
    // The old shape returned a user and left the 401 to the caller, so an early `return` that was
    // forgotten meant the handler ran on for an unauthenticated request. The guard now sends the
    // response itself and returns null, which only works if the caller bails.
    assert(`${file} bails when the guard rejects`, /if\s*\(!user\)\s*return;/.test(source),
      'the guard sends the response and returns null — the handler must stop');
  }

  for (const file of PARENT_ONLY) {
    const source = read(file);
    assert(`${file} is behind requireParent`, guardsUsedIn(source).includes('requireParent'),
      'a student token must not be able to reach an endpoint that returns another person data');
  }

  // The one thing a parent endpoint must never do is trust the parent's own claim about which
  // student they are asking for.
  const summary = read('api/parent/summary.js');
  assert('api/parent/summary.js resolves consent through getActiveLink, not the request',
    /getActiveLink|getActiveLinksForParent/.test(summary));
  assert('api/parent/summary.js never selects from progress_sync directly',
    !/from\(['"]progress_sync['"]\)/.test(summary),
    'the raw snapshot must only be read through the allowlisted derivation');
}

// ── 3. Consent is re-read, not cached ───────────────────────────────────────

function checkRevocationIsImmediate() {
  section('Revocation takes effect on the next request');

  const session = read('api/_lib/session.js');
  assert("getActiveLink filters on status = 'active' in the query", /\.eq\('status',\s*'active'\)/.test(session),
    'filtering in JS after fetching means a revoked row can be read and then mis-handled');
  assert('getActiveLink takes a supabase client per call rather than memoising a result',
    /export async function getActiveLink\(supabase/.test(session));

  // A cache keyed by session or user id would survive revocation for up to the session's 30-day
  // life. The summary cache is keyed by the student's snapshot timestamp and holds no link state,
  // which is what makes it safe.
  const summaryLib = read('api/_lib/parentSummary.js');
  assert('the summary cache holds no link or consent state',
    !/parent_links/.test(summaryLib),
    'a cache that remembers who was allowed to read would outlive the permission');
}

// ── 4. Role is write-once ───────────────────────────────────────────────────

function checkRoleIsWriteOnce(files) {
  section('Role is written only at account creation');

  const writers = [];
  for (const file of files) {
    const source = read(file);
    // Matches `role` as a COLUMN being written, not as a value being read — `revoked_by: role` is
    // the caller's own role traveling into an audit field, which is the opposite of an escalation.
    if (/\.update\(\s*\{[^}]*[\s{,]role\s*:/s.test(source)) writers.push(`${file} (update)`);
  }
  assert('no endpoint updates role on an existing account', writers.length === 0,
    writers.join(', '));

  const signup = read('api/auth/complete-signup.js');
  assert('complete-signup sets role only on insert', /\.insert\(\{[^}]*role[^}]*\}\)/s.test(signup));
  assert('complete-signup coerces anything that is not "parent" to "student"',
    /role\s*=\s*body\?\.role\s*===\s*'parent'\s*\?\s*'parent'\s*:\s*'student'/.test(signup),
    'an unvalidated role would let a client name any string, including one a CHECK constraint rejects at 3am');

  const google = read('api/auth/google.js');
  assert('the Google path honors role only when it creates the account',
    /if \(!user\) \{[\s\S]{0,600}?role[\s\S]{0,200}?\.insert/.test(google)
    && !/\.update\([^)]*role/.test(google));

  const me = read('api/auth/me.js');
  assert('the profile endpoint cannot write role', !/\brole\b/.test(me.split('PATCH')[1] || ''),
    'PATCH /auth/me is the obvious place for this to leak in');

  const serialize = read('api/_lib/serializeUser.js');
  assert('serializeUser exposes role to the client', /role:/.test(serialize));
  assert('serializeUser still never exposes the password hash', !/password_hash:/.test(serialize));
}

// ── 5. The summary is an allowlist ──────────────────────────────────────────

// A snapshot with a piece of unmistakable private text in every field a parent must never see.
// Each marker is unique so a failure names exactly which one leaked.
const PRIVATE_MARKERS = {
  coachThreads: 'COACHSECRET',
  lessonNotes: 'NOTESECRET',
  lessonHighlights: 'HIGHLIGHTSECRET',
  satResponses: 'RESPONSESECRET',
  essays: 'ESSAYSECRET',
  future: 'UNKNOWNFIELDSECRET',
};

function privateSnapshot() {
  return {
    v: 1,
    user: { xp: 1200, name: 'Student', email: 'student@example.test' },
    lessons: [{ lessonId: 'l1', verified: true, completedAt: 1 }],
    quizScores: [{ quizId: 'q1', score: 80, completedAt: 2 }],
    studyDays: ['2026-01-01'],
    coachThreads: [{ key: 1, title: PRIVATE_MARKERS.coachThreads, messages: [{ role: 'user', content: PRIVATE_MARKERS.coachThreads }] }],
    lessonNotes: [{ lessonId: 'l1', text: PRIVATE_MARKERS.lessonNotes }],
    lessonHighlights: [{ lessonId: 'l1', text: PRIVATE_MARKERS.lessonHighlights }],
    satAttempts: [{ key: 1, kind: 'test', finishedAt: 3, result: { total: 1200 }, questionIds: ['x'] }],
    satResponses: [{ attemptKey: 1, questionId: PRIVATE_MARKERS.satResponses, correct: false, choice: 'B' }],
    essays: [{ text: PRIVATE_MARKERS.essays }],
    // The field nobody has written yet. An allowlist ignores it; a blocklist ships it.
    somethingAddedNextQuarter: PRIVATE_MARKERS.future,
  };
}

function checkAllowlist() {
  section('The parent summary is an allowlist, not a filter');

  const summary = buildParentSummary({
    student: { id: 'u1', name: 'Student', grade_level: '11th', email: 'student@example.test' },
    snapshot: privateSnapshot(),
    now: Date.UTC(2026, 0, 8),
  });
  const serialized = JSON.stringify(summary);

  for (const [field, marker] of Object.entries(PRIVATE_MARKERS)) {
    assert(`${field} never reaches a parent`, !serialized.includes(marker),
      `found "${marker}" in the summary`);
  }

  // The student's email is not private in the way a transcript is — the parent already has it, they
  // invited that address. It is excluded because a contact detail traveling in every poll response
  // is a detail traveling for no reason.
  assert("the student's email is not echoed in the summary", !serialized.includes('student@example.test'));

  // Per-question answers are the sharp edge of the SAT data: the aggregate score is the point of the
  // feature, and the answers are a different thing entirely.
  assert('question ids from test attempts do not travel', !/"questionIds"/.test(serialized));

  assert('the derivation is still useful (it is not empty)',
    summary.effort.xp === 1200 && summary.coursework.lessonsVerified === 1,
    JSON.stringify({ xp: summary.effort.xp, verified: summary.coursework.lessonsVerified }));

  // The SAT pillar is sealed for v1 (src/lib/betaFlags.js), so no test scores
  // are derived any more — not the composite, not the section split, not a
  // milestone row. A parent dashboard that reports a score for a test the
  // student had no way to sit is worse than one that reports nothing.
  assert('no test score reaches the parent summary', summary.testing === undefined,
    JSON.stringify(summary.testing));
  assert('no test milestone reaches the parent summary',
    !(summary.milestones || []).some(m => m.kind === 'test_completed'),
    JSON.stringify(summary.milestones));

  const lib = readFileSync(path.join(ROOT, 'api/_lib/parentSummary.js'), 'utf8');
  assert('the derivation never spreads the snapshot wholesale',
    !/\.\.\.\s*(snapshot|snap)\b/.test(lib),
    'a spread turns the allowlist back into a blocklist in one keystroke');
}

// ── 6. The derivation is correct ────────────────────────────────────────────

function checkDerivation() {
  section('Progress is derived correctly');

  const at = (y, m, d) => Date.UTC(y, m, d);
  const build = (snapshot, now) => buildParentSummary({ student: { id: 'u', name: 'S' }, snapshot, now });

  // The summary no longer derives a consecutive-day streak at all, and these three assertions —
  // which used to pin down its grace period and its gap handling — are now the gate that keeps it
  // gone.
  //
  // The argument is in api/_lib/parentSummary.js, and it is not primarily about clutter. A streak
  // handed to a parent is a compliance number someone else is grading the student against, and a
  // broken one turns into a conversation about discipline rather than about progress. It is also
  // the wrong measure: consecutive days reward students with free evenings and penalize students
  // with jobs, caregiving duties or a heavy sports season. The 56-day calendar, asserted just
  // below, carries strictly more information and none of the framing.
  const anyShape = build({ studyDays: ['2026-03-09', '2026-03-08'] }, at(2026, 2, 10));
  assert('the parent summary derives no streak at all',
    !('streakDays' in anyShape.effort),
    `effort still carries: ${Object.keys(anyShape.effort).join(', ')}`);
  assert('...and reports active days instead, which a gap correctly reduces',
    anyShape.effort.activeDaysLast7 === 2, `got ${anyShape.effort.activeDaysLast7}`);
  assert('...counted over a real window rather than a run',
    build({ studyDays: ['2026-03-10', '2026-03-09', '2026-03-07'] }, at(2026, 2, 10)).effort.activeDaysLast7 === 3);

  const calendar = build({ studyDays: ['2026-03-10'] }, at(2026, 2, 10));
  assert('the calendar is 56 days ending today', calendar.effort.calendar.length === 56
    && calendar.effort.calendar.at(-1).date === '2026-03-10'
    && calendar.effort.calendar.at(-1).active === true);

  const reviews = build({
    reviewCountsByDate: { '2026-03-10': 5, '2026-03-08': 3, '2026-01-01': 99 },
  }, at(2026, 2, 10));
  assert('review counts are windowed, not summed over all time',
    reviews.effort.cardReviewsLast7 === 8, `got ${reviews.effort.cardReviewsLast7}`);

  // "No trend yet" and "flat" are different facts about a student and the UI renders them
  // differently, so the one that means "not enough data" has to be null rather than 0.
  const fewQuizzes = build({ quizScores: [{ quizId: 'a', score: 70, completedAt: 1 }] }, at(2026, 2, 10));
  assert('a trend needs something to compare against', fewQuizzes.coursework.quizzes.trend === null,
    `got ${fewQuizzes.coursework.quizzes.trend}`);

  const manyQuizzes = build({
    quizScores: [
      ...Array.from({ length: 10 }, (_, i) => ({ quizId: `new${i}`, score: 90, completedAt: 100 + i })),
      ...Array.from({ length: 5 }, (_, i) => ({ quizId: `old${i}`, score: 60, completedAt: i })),
    ],
  }, at(2026, 2, 10));
  assert('the trend compares the last ten quizzes with everything earlier',
    manyQuizzes.coursework.quizzes.trend === 30, `got ${manyQuizzes.coursework.quizzes.trend}`);

  const withOldAttempts = build({
    satAttempts: [
      { kind: 'test', finishedAt: 200, result: { total: 1300, rw: 650, math: 650 } },
      { kind: 'test', finishedAt: 100, result: { total: 1100 } },
    ],
  }, at(2026, 2, 10));
  assert('legacy SAT attempts in a stored snapshot derive nothing',
    withOldAttempts.testing === undefined
    && !JSON.stringify(withOldAttempts).includes('1300'),
    JSON.stringify(withOldAttempts.testing));

  // A brand-new account must render an empty dashboard, not a broken one. Null here would have to
  // be special-cased by every caller, and one of them would forget.
  const empty = buildParentSummary({ student: { id: 'u', name: 'S' }, snapshot: null, now: at(2026, 2, 10) });
  assert('a student who has never synced yields a complete, zeroed summary',
    empty && empty.effort.xp === 0 && empty.effort.calendar.length === 56);

  const corrupt = buildParentSummary({
    student: { id: 'u', name: 'S' },
    snapshot: { user: { xp: 'not a number' }, lessons: 'not an array', studyDays: { nope: true }, quizScores: null },
    now: at(2026, 2, 10),
  });
  assert('a malformed snapshot degrades instead of throwing',
    corrupt.effort.xp === 0 && corrupt.coursework.lessonsStarted === 0
    && corrupt.effort.activeDaysLast7 === 0 && corrupt.effort.calendar.length === 56);
}

// ── 7. The digest says only what it is allowed to say ───────────────────────

/**
 * Language that must never appear in a digest, and why each one is banned.
 *
 * These are not style preferences. Every phrase here either infers a motive from an absence of
 * rows ("losing interest" from a quiet week) or hands the parent an enforcement instruction — and
 * a dashboard that generates enforcement instructions is one that gets used against the student,
 * whose rational response is to stop using the app honestly. That destroys the data the page is
 * built from, so this is a product-integrity check as much as an ethical one.
 */
const BANNED_LANGUAGE = [
  'lazy', 'falling behind', 'losing interest', 'struggling', 'distracted', 'unmotivated',
  'make sure they', 'make them', 'you should push', 'needs to be pushed', 'hold them accountable',
  'check up on', 'monitor',
];

function digestCases() {
  const base = {
    student: { name: 'Alex Kim', gradeLevel: '11th' },
    effort: { xp: 0, level: 1, streakDays: 0, activeDaysLast7: 0, activeDaysLast28: 0, calendar: [], lastActiveAt: null },
    coursework: { lessonsStarted: 0, lessonsVerified: 0, unitsVerified: 0, quizzes: { taken: 0, averageScore: null, trend: null } },
    milestones: [],
  };
  const merge = (patch) => ({
    ...base,
    ...patch,
    effort: { ...base.effort, ...(patch.effort || {}) },
    coursework: {
      ...base.coursework,
      ...(patch.coursework || {}),
      quizzes: { ...base.coursework.quizzes, ...(patch.coursework?.quizzes || {}) },
    },
  });

  return {
    neverStarted: base,
    quietWeek: merge({ effort: { activeDaysLast7: 0, activeDaysLast28: 6, lastActiveAt: '2026-02-20' }, coursework: { quizzes: { taken: 4, averageScore: 72 } } }),
    longQuiet: merge({ effort: { activeDaysLast7: 0, activeDaysLast28: 0, lastActiveAt: '2025-12-01' }, coursework: { lessonsStarted: 3 } }),
    steady: merge({ effort: { activeDaysLast7: 2, activeDaysLast28: 9, lastActiveAt: '2026-03-09' }, coursework: { lessonsVerified: 4, quizzes: { taken: 8, averageScore: 74, trend: -6 } } }),
    strong: merge({ effort: { activeDaysLast7: 5, activeDaysLast28: 20, streakDays: 9, lastActiveAt: '2026-03-10' }, coursework: { lessonsVerified: 12, unitsVerified: 3, quizzes: { taken: 20, averageScore: 84, trend: 7 } } }),
    // A malformed summary must still produce a sentence rather than throw inside a render.
    empty: {},
  };
}

async function checkDigest() {
  section('The parent digest says only what it is allowed to say');

  const { buildParentDigest } = await import('../src/lib/parentDigest.js');
  const cases = digestCases();

  for (const [label, summary] of Object.entries(cases)) {
    const d = buildParentDigest(summary);
    assert(`${label}: produces a complete digest`,
      !!d && !!d.headline && !!d.body && !!d.suggestion && !!d.tone,
      JSON.stringify(d));

    const text = `${d.headline} ${d.body} ${d.suggestion}`.toLowerCase();
    const found = BANNED_LANGUAGE.filter((phrase) => text.includes(phrase));
    assert(`${label}: no motive-inference or enforcement language`, found.length === 0,
      found.length ? `found: ${found.join(', ')} — in "${text}"` : '');
  }

  // The branch most likely to be read as a verdict is the one with the least data behind it.
  const fresh = buildParentDigest(cases.neverStarted);
  assert('a student who never started is not characterised at all', fresh.tone === 'new'
    && /nothing/i.test(fresh.headline + fresh.body));

  const quiet = buildParentDigest(cases.quietWeek);
  assert('a quiet week is stated without an explanation attached',
    /hasn't studied/i.test(quiet.body) && !/because|seems|appears|probably/i.test(quiet.body),
    quiet.body);
  assert('a quiet week suggests a question, not a push', /ask|what are you working on/i.test(quiet.suggestion),
    quiet.suggestion);

  // A falling score is the moment a parent is most likely to act badly on this page, so the copy
  // has to actively defuse it rather than merely avoid the banned words.
  const dip = buildParentDigest(cases.steady);
  assert('a score dip is framed as normal and not as a call for more hours',
    /normal/i.test(dip.suggestion) && /not to push/i.test(dip.suggestion), dip.suggestion);

  const strong = buildParentDigest(cases.strong);
  assert('a strong week names something specific to say', strong.tone === 'strong'
    && /quiz scores are up 7/i.test(strong.suggestion), strong.suggestion);

  // The digest is derived, so it can only be as private as its input — but a template that
  // interpolated a name or an email from somewhere else would sidestep the allowlist entirely.
  const digestSrc = read('src/lib/parentDigest.js');
  assert('the digest reads only the summary it is given',
    !/progress_sync|snapshot|coachThreads|lessonNotes/.test(digestSrc));
}

// ── 7b. A parent account has to be built before it can ask for anything ─────
//
// The declaration (migration 0009) is NOT the authorization boundary — the student's consent is,
// and these checks do not pretend otherwise. What they pin down is the thing the declaration
// actually buys: an invitation that names a person, so the student's own recognition can do the
// work no server-side check can. The failure mode is silent in both directions — a gate that
// stopped being applied, or one that started failing closed on a database without 0009 and
// locked out guardians whose children already consented.

function checkProfileGate() {
  section('A parent must declare who they are before they can ask for anything');

  const links = read('api/parent/links.js');
  assert('inviting requires a completed parent profile',
    /isProfileComplete\(profile\)/.test(links) && /profile_incomplete/.test(links),
    'without this, an account created ninety seconds ago can email a stranger\'s child');
  assert('only parents are gated on it, not students inviting their own parent',
    /if \(role === 'parent'\)[\s\S]{0,400}?isProfileComplete/.test(links),
    'a student has nobody to be impersonating — gating them would just block the other direction');
  assert('the claim is written onto the link row, not joined at read time',
    /claimed_student_name:/.test(links) && /claimed_by_name:/.test(links),
    'the student consents to what the invitation SAID; editing a profile later must not rewrite it');
  assert('the claim columns are omitted when migration 0009 is absent',
    /schemaMissing/.test(links) && /\.\.\.claimColumns/.test(links),
    'naming an unknown column fails the whole insert, which would break inviting entirely');

  // ── …and reading a dashboard deliberately does NOT require it ────────────
  //
  // This assertion is the inverse of the one above, and it is here because the removal was a
  // decision rather than a regression. The declaration is what lets a student recognize an
  // unexpected request; it was never what kept a stranger out, and every active link has either
  // already passed the check above (parent-initiated) or was created by a student who typed the
  // address themselves (student-initiated). Re-checking at read time could therefore only ever
  // fire on a family that had done everything right — and it did, on the single most important
  // screen in the feature. Putting it back means putting that wall back.
  const summary = read('api/parent/summary.js');
  assert('reading a dashboard is NOT gated on the declaration',
    !/requireCompleteProfile/.test(summary),
    'the gate could only fire on a parent whose own child had just invited them');
  assert('…and the two guards that DO keep a stranger out are both still there',
    /requireParent/.test(summary) && /getActiveLink/.test(summary));
  assert('the declaration is still reported to the client, so it can be asked for',
    /profileComplete/.test(summary));

  const lib = read('api/_lib/parentProfile.js');
  assert('a database without migration 0009 reports "nothing to complete" rather than failing',
    /schemaMissing \|\| isProfileComplete/.test(read('api/parent/profile.js')),
    'failing closed would lock out guardians whose children have already consented, to enforce a '
    + 'check that was never the reason their access was safe');
  assert('completed_at is derived server-side, never accepted from the client',
    /completed_at: values\.attested \? now : null/.test(lib),
    'a client-set completeness flag is a client-set authorization decision');

  const mailer = read('api/_lib/parentLinks.js');
  assert('the invitation states the claim to the student',
    /claimedStudentName/.test(mailer) && /do not accept/i.test(mailer),
    'an invitation that names nobody cannot be checked by the person receiving it');

  const invite = read('src/components/parent/InviteScreen.jsx');
  assert('the acceptance screen shows the claim before the button',
    /claimedByName|claimedStudentName/.test(invite));
}

function checkProfileValidation() {
  section('The declaration cannot be half-given');

  const complete = {
    fullName: 'Priya Shah', relationship: 'Mother', phone: '+1 555 000 1234',
    studentFullName: 'Alex Shah', studentGrade: '11th grade', attested: true,
  };

  const ok = normalizeProfileInput(complete);
  assert('a complete declaration passes', Object.keys(ok.errors).length === 0, JSON.stringify(ok.errors));

  // The attestation is the one field whose absence is not a typo: it is the difference between a
  // form and an agreement, and it is what the audit record is FOR.
  const unattested = normalizeProfileInput({ ...complete, attested: false });
  assert('an unattested declaration is rejected', !!unattested.errors.attested);

  for (const [field, patch] of [
    ['fullName', { fullName: 'P' }],
    ['relationship', { relationship: '' }],
    ['phone', { phone: '' }],
    ['phone', { phone: 'call me maybe' }],
    ['studentFullName', { studentFullName: '' }],
  ]) {
    const res = normalizeProfileInput({ ...complete, ...patch });
    assert(`${field} rejects ${JSON.stringify(Object.values(patch)[0])}`, !!res.errors[field],
      JSON.stringify(res.errors));
  }

  // Errors are keyed by field because this form is six inputs long, and one banner over six
  // untouched-looking fields is how a form gets abandoned.
  const several = normalizeProfileInput({});
  assert('every failing field reports itself', Object.keys(several.errors).length >= 4,
    JSON.stringify(several.errors));

  assert('a row is only complete when it is both stamped and attested',
    isProfileComplete({ completed_at: '2026-01-01', attested: true })
    && !isProfileComplete({ completed_at: '2026-01-01', attested: false })
    && !isProfileComplete({ completed_at: null, attested: true })
    && !isProfileComplete(null));

  // Stored verbatim rather than as a boolean alone: "they ticked a box" is not evidence of
  // anything a year after the box's wording changed.
  assert('the attestation names the guardian relationship and the student\'s veto',
    /parent or legal guardian/i.test(ATTESTATION_TEXT) && /approve/i.test(ATTESTATION_TEXT),
    ATTESTATION_TEXT);
}

// ── 7c. The passwordless claim ──────────────────────────────────────────────
//
// api/parent/claim.js is the only public endpoint in this repo that CREATES an account and MINTS a
// session in one request, which makes it the highest-consequence file here. Its safety rests on
// four properties, each of which is one edit away from silently disappearing.

async function checkClaimFlow() {
  section('The passwordless parent claim');

  const claim = read('api/parent/claim.js');

  // 1. THE DESTINATION IS THE INVITATION'S, NOT THE CALLER'S.
  //
  // This is the whole reason a shareable code is safe to share. Holding a code lets you ASK for a
  // one-time code; only whoever can read the invited mailbox can receive it. An edit that took the
  // address from the request body instead would turn every code into a bearer credential — and it
  // would still pass every functional test, because the happy path sends the same address either
  // way.
  assert('the one-time code is sent to the address on the invitation row',
    /issueOtp\(supabase, \{ email: inviteEmail/.test(claim)
    && /const inviteEmail = String\(link\.invite_email/.test(claim),
    'taking the destination from the request would make a leaked code a working credential');
  assert('no email is ever read out of the request body',
    !/body\?\.email|body\.email/.test(claim),
    'there is exactly one address this flow may mail, and the invitation names it');

  // 2. THE CODE IS CHECKED BEFORE ANYTHING IS CREATED.
  // Compared on the CALL sites, not on the first mention of each name — the file's header
  // discusses both, and a comment ordering itself correctly would be a check that never fails.
  assert('the OTP is verified before an account is created',
    claim.indexOf('await checkOtp(') < claim.indexOf(".rpc('find_or_create_parent_for_claim'"),
    'creating first would let anyone holding a code conjure accounts at other people addresses');
  assert('a failed OTP returns before the account step',
    /if \(!otpResult\.ok\)[\s\S]{0,200}?return res\.status/.test(claim));

  // 3. ROLE IS STILL WRITE-ONCE.
  assert('the claim never updates a role',
    !/\.update\(\s*\{[^}]*[\s{,]role\s*:/s.test(claim),
    'an address with a student account must be refused, never upgraded');
  assert('an address that already has a student account is refused with an explanation',
    /role_conflict/.test(claim) && /already has a student account/i.test(claim));

  // 4. THERE IS STILL EXACTLY ONE WAY A LINK IS MADE.
  assert('the claim redeems through accept_parent_link like every other path',
    /rpc\('accept_parent_link'/.test(claim),
    'a second implementation of "make the link" is a second place for an authorization bug');
  assert('only student-initiated invitations are claimable this way',
    /link\.initiated_by !== 'student'/.test(claim),
    'a student account owns the person entire body of work and must not be conjured by a code');

  // The invitation is still resolved as pending-only, in the query rather than afterwards, so a
  // consumed invitation is indistinguishable from a made-up one and no caller can forget to check.
  assert("the invitation lookup filters on status='pending' in the query",
    /\.eq\('status', 'pending'\)/.test(claim));

  // The address is masked on the way out. The preview is reachable by anyone holding a code, and a
  // whole email address on it would make guessing codes worth something.
  assert('the preview never returns a whole email address',
    /emailHint: maskEmail\(/.test(claim) && !/invite_email,\s*$/m.test(claim));

  // ── The code itself ──────────────────────────────────────────────────────
  const links = await import('../api/_lib/parentLinks.js');

  const codes = new Set();
  for (let i = 0; i < 2000; i += 1) codes.add(links.mintInviteCode());
  assert('minted codes are 8 characters and unique across 2000 draws',
    codes.size === 2000 && [...codes].every((c) => c.length === 8), `distinct: ${codes.size}`);
  assert('the alphabet excludes every glyph a person misreads (I L O U 0 1)',
    [...codes].every((c) => !/[ILOU01]/.test(c)),
    'this code gets read aloud across a kitchen and typed by somebody who did not choose to be');

  const sample = [...codes][0];
  assert('a code round-trips through the format people are shown',
    links.normalizeInviteCode(links.formatInviteCode(sample)) === sample);
  assert('case and spacing do not matter',
    links.normalizeInviteCode(` ${links.formatInviteCode(sample).toLowerCase()} `) === sample);
  assert('junk is rejected rather than guessed at',
    links.normalizeInviteCode('hello') === '' && links.normalizeInviteCode('') === '',
    'guessing an O into something turns a typo the person could fix into a code that does not exist');

  // ── The share kit is scoped to the sender ────────────────────────────────
  const pending = {
    id: 'l1', status: 'pending', initiated_by: 'student', invite_email: 'p@example.test',
    invite_code: sample, created_at: 1,
  };
  assert('the sender of a pending invitation gets the code back',
    links.serializeLink(pending, 'student').share?.code === sample,
    'without it there is no way to recover from an email that never arrived');
  assert('the RECIPIENT is never handed the code',
    links.serializeLink(pending, 'parent').share === null,
    'they already hold the invitation; handing it back only invites them to forward it');
  assert('an accepted link stops exposing a code',
    links.serializeLink({ ...pending, status: 'active' }, 'student').share === null);

  // ── Sign-in by code ──────────────────────────────────────────────────────
  const login = read('api/auth/login.js');
  assert("emailed-code sign-in only accepts a token issued for 'signin'",
    /purpose: 'signin'/.test(login),
    "a signup or password-reset token must not be spendable as a session");
  assert('the code path consumes the token atomically',
    /consumeVerificationToken/.test(login),
    'a replayable token is a session anybody can mint twice');

  const sendOtp = read('api/auth/send-otp.js');
  assert("a 'signin' code for an unknown address reports success without sending",
    /purpose === 'password_reset' \|\| purpose === 'signin'\) && !existing/.test(sendOtp),
    'otherwise this endpoint tells strangers which addresses have accounts');

  // ── One implementation of "is this code correct" ─────────────────────────
  const otp = read('api/_lib/otp.js');
  assert('the attempt counter is an optimistic-concurrency guard, not a read-then-write',
    /\.eq\('attempts', current\.attempts\)/.test(otp),
    'without it, parallel requests share one attempt and the five-guess cap stops existing');
  assert('codes are compared in constant time', /timingSafeEqual/.test(otp));
  assert('a wrong guess does not consume the code',
    otp.indexOf("if (!matches) return fail") < otp.indexOf("update({ consumed: true }).eq('id', afterIncrement.id)"),
    'burning the code on a typo would make the retry the person is about to make impossible');
  assert('requesting a new code invalidates the old one',
    /update\(\{ consumed: true \}\)[\s\S]{0,120}?\.eq\('consumed', false\)/.test(otp),
    'otherwise "resend" adds five guesses to the budget rather than replacing them');
  for (const file of ['api/auth/send-otp.js', 'api/auth/verify-otp.js', 'api/parent/claim.js']) {
    assert(`${file} uses the shared code machinery rather than its own`,
      /_lib\/otp\.js/.test(read(file)),
      'three copies of "is this code correct" is two too many');
  }

  // ── The migration keeps 0008's lockdown ──────────────────────────────────
  const migration = read('supabase/migrations/0010_parent_access.sql');
  assert('the new RPC is not callable by the anon key',
    /find_or_create_parent_for_claim\(text\)/.test(migration)
    && /revoke all on function %s from public/.test(migration)
    && /'anon', 'authenticated'/.test(migration),
    'migration 0008 exists because a public RPC is a public API');
  assert('…and service_role keeps it, so /api/* still works',
    /grant execute on function %s to service_role/.test(migration));
  assert('the new RPC pins its search_path', /set search_path = public/.test(migration));
  assert('the account it creates is a parent, inserted rather than updated',
    /insert into app_users \(email, role\) values \(norm, 'parent'\)/.test(migration)
    && !/update app_users[\s\S]{0,200}?set[\s\S]{0,80}?role/.test(migration));
  assert('a concurrent claim for the same address resolves rather than erroring',
    /when unique_violation then/.test(migration));
}

// ── 8. The routes exist in both deployment targets ──────────────────────────

function checkRouting(files) {
  section('Parent endpoints are reachable in both deployments');

  const server = read('server.js');
  for (const file of files.filter((f) => f.startsWith('api/parent/'))) {
    const route = `/${file.replace(/^api\//, 'api/').replace(/\.js$/, '')}`;
    assert(`${route} is wired into server.js (self-hosted)`, server.includes(`'${route}'`),
      'Vercel routes these by filename; the Express server does not');
  }

  // The client must not be able to reach Supabase around the API — the whole authorization story
  // for this schema is that /api/* holds the service role and RLS denies everyone else.
  const client = read('src/lib/parentApi.js');
  assert('the parent client only ever talks to /api/parent/*',
    !/supabase/i.test(client) && /\/api\/parent/.test(client));
}

/**
 * The ways a parent gets in, and stays in.
 *
 * ── Why every one of these is a regression test ─────────────────────────────
 * All of them shipped broken at once, and none of them announced itself. The schema drift that
 * killed sign-in presented as "that code is wrong"; a bookmarked dashboard presented as the
 * marketing page; a lapsed session presented as numbers that had stopped moving; a parent signing
 * in at /parents/login with a student account presented as the student app. Not one produced an
 * error anybody could report, which is precisely why they are pinned here.
 */
function checkParentAuthPaths() {
  section('A parent can get in, and get back in');

  const otp = read('api/_lib/otp.js');
  assert('a live code is reused rather than re-sent within the floor',
    /RESEND_FLOOR_MS/.test(otp) && /resendWaitMs/.test(otp),
    'without it every reload of a sign-in screen burns another metered email for a code already in the inbox');
  assert('…but never a code that has run out of guesses',
    /attempts \?\? 0\) >= MAX_ATTEMPTS\) return 0/.test(otp),
    'reusing a burnt code turns one mistyped digit into a lockout with no way out');
  assert('…and never an expired one',
    /new Date\(data\.expires_at\) < new Date\(\)\) return 0/.test(otp),
    'suppressing the send that would replace a dead code leaves the person with nothing usable');
  assert('the two rate-limit ceilings are separate',
    /MAX_PER_EMAIL_WINDOW/.test(otp) && /MAX_PER_IP_WINDOW/.test(otp),
    'one shared ceiling locks out the fourth person behind a household NAT or a school connection');

  // ── The drift that broke sign-in in production ───────────────────────────
  const verify = read('api/auth/verify-otp.js');
  assert('a database that cannot store the proof says so, rather than blaming the code',
    /isPurposeUnsupported/.test(verify) && /schema_missing/.test(verify),
    "migration 0010 unapplied made verify-otp answer a CORRECT code with 'could not verify' — "
    + 'indistinguishable from a typo, and it cost an email on every retry');
  assert('the failure names the migration to apply',
    /0010_parent_access\.sql/.test(verify),
    'an error nobody can act on is an error that stays in production');
  assert('failures carry a reason code, not just prose',
    /reason: result\.reason/.test(verify),
    'the client used to branch on the wording of the message, which silently stopped matching');

  const loginView = read('src/components/auth/LoginView.jsx');
  assert('the client branches on that reason rather than on the sentence',
    /err\.reason === 'incorrect'/.test(loginView),
    'matching on message text is how the only piece of help on that screen quietly disappeared');
  assert('a student account signing in at /parents/login is told, not silently redirected',
    /roleMismatch/.test(loginView) && /parentMode && user\?\.role !== 'parent'/.test(loginView),
    'otherwise somebody who followed a "parent sign-in" link lands in the student app with no explanation');

  // ── The parent app's own URLs, while signed out ──────────────────────────
  const gate = read('src/components/AuthGate.jsx');
  assert('a /family URL while signed out opens the parent sign-in',
    /isParentPath/.test(gate) && /parentReturnRef/.test(gate),
    'a bookmarked dashboard used to render the student marketing page under a /family address');
  assert('…and lands back on the page that was asked for',
    /initialPath=\{parentReturnRef\.current\}/.test(gate),
    'sending a parent who bookmarked one child to the dashboard root loses the thing they clicked');
  assert('signing out of the dashboard leaves through the parent door',
    /setView\('parentLogin'\)/.test(gate),
    "falling back to 'landing' kept the /family path and painted the marketing page over it");

  // ── The parent's front door, over somebody else's session ────────────────
  //
  // The most-reported failure in this whole feature, and the least visible in the code: AuthGate
  // renders the student app for ANY signed-in session, and the two parent auth screens fell
  // straight through to it. The commonest way /parents is ever read — a student showing it to
  // their mother on the family laptop — therefore ended with the mother pressing "Create a parent
  // account" and landing on her child's dashboard. Nothing errored; it just could not be done.
  assert('the parent auth screens render over a student session instead of falling into the app',
    /parentDoorOverSession/.test(gate) && /status === 'signedIn' && !parentDoorOverSession/.test(gate),
    'a signed-in student pressing "Create a parent account" used to land on their own dashboard');
  assert('…and AuthGate keeps owning the URL while that door is open',
    /const ownsUrl = status !== 'signedIn' \|\| parentDoorOverSession/.test(gate),
    'without this the address bar stays on /parents and the back button has nowhere to go');
  assert('…and the outgoing session is ended rather than orphaned',
    /handleAuthedOverSession/.test(gate),
    'the browser holds one token; the replaced one should not stay live on the server');
  assert('…with the person told whose session they are replacing',
    /overSessionNotice/.test(gate),
    'silently signing a student out of the family laptop is not something to discover afterwards');

  // ── What a parent is actually holding when they reach /parents ───────────
  const parentApi = read('src/lib/parentApi.js');
  assert('the invitation box takes a whole link, not only eight characters',
    /export function parseInviteInput/.test(parentApi),
    'a parent pasting the line their child forwarded was told "that should be 8 characters"');
  assert('…and names each way it can be wrong',
    /no_invite_in_url/.test(parentApi) && /too_short/.test(parentApi) && /ambiguous/.test(parentApi),
    'one generic error for five different mistakes is one error nobody can act on');

  const app = read('src/components/parent/ParentApp.jsx');
  assert('an expired session ends the session rather than freezing the numbers',
    /err\.status === 401/.test(app) && /handleExpiredSession/.test(app),
    'a 30-day token lapsing under an open tab used to look like a student who had stopped studying');
  assert('a failed poll is visible on every tab, not just the one with the button',
    /StaleBanner/.test(app),
    '"she has not studied since Tuesday" must never be indistinguishable from a dropped connection');
}

/**
 * Everything a parent might paste into the box on /parents.
 *
 * Exercised for real rather than grepped for, because the failure this replaces was not a missing
 * feature — it was a working validator that was correct about the wrong thing. Each case below is
 * a form somebody genuinely arrives holding: the button out of the email, the link forwarded with
 * its sentence attached, the code read out over the phone, and the several near-misses that used
 * to produce one indiscriminate "that should be 8 characters".
 */
async function checkInviteInput() {
  section('Whatever the parent pasted');

  const { parseInviteInput } = await import('../src/lib/parentApi.js');
  const TOKEN = 'a'.repeat(64);

  const resolves = (label, input, expected) => {
    const got = parseInviteInput(input);
    assert(label, got.ok && got.token === (expected.token ?? null) && got.code === (expected.code ?? null),
      JSON.stringify(got));
  };
  const refuses = (label, input, reason) => {
    const got = parseInviteInput(input);
    assert(label, !got.ok && got.reason === reason, JSON.stringify(got));
    if (!got.ok) {
      assert(`  …and says something actionable`, got.error.length > 25 && /\.$/.test(got.error.trim()),
        got.error);
    }
  };

  resolves('the emailed link', `https://medschoolprep.cloud/parent-invite?token=${TOKEN}`, { token: TOKEN });
  resolves('the link a student texted', 'https://medschoolprep.cloud/parent-invite?code=ABCD-EFGH', { code: 'ABCDEFGH' });
  resolves('a forwarded line with the sentence still attached',
    `Review this request: https://medschoolprep.cloud/parent-invite?token=${TOKEN}.`, { token: TOKEN });
  resolves('the bare code, grouped as it is displayed', 'ABCD-EFGH', { code: 'ABCDEFGH' });
  resolves('the bare code, lowercase and spaced', ' abcd efgh ', { code: 'ABCDEFGH' });
  resolves('a bare token with no URL round it', TOKEN, { token: TOKEN });

  refuses('nothing at all', '   ', 'empty');
  refuses('our own home page', 'https://medschoolprep.cloud/', 'no_invite_in_url');
  refuses('a link with the token cut in half', 'https://medschoolprep.cloud/parent-invite?token=abc123', 'bad_token');
  refuses('half a code', 'ABCD-EF', 'too_short');
  refuses('a code with something extra on the end', 'ABCD-EFGH99', 'too_long');
  refuses('a zero typed where an O was read', 'ABCD-EFG0', 'ambiguous');

  // The one that matters most for the round trip: whatever comes out has to be something the
  // server will recognize, in the shape /parent-invite reads back off the URL.
  const { token } = parseInviteInput(`https://medschoolprep.cloud/parent-invite?token=${TOKEN}`);
  assert('a resolved token is in the shape api/parent/claim.js accepts', /^[0-9a-f]{64}$/i.test(token));
  const { code } = parseInviteInput('abcd efgh');
  assert('a resolved code is in the canonical uppercase form the server stores', code === 'ABCDEFGH');
}

// ── Main ────────────────────────────────────────────────────────────────────

const files = handlerFiles().sort();
console.log(`Auditing ${files.length} API handlers`);

checkEveryHandlerClassified(files);
checkGuardChoice();
checkRevocationIsImmediate();
checkRoleIsWriteOnce(files);
checkAllowlist();
checkDerivation();
await checkDigest();
checkProfileGate();
checkProfileValidation();
await checkClaimFlow();
checkParentAuthPaths();
await checkInviteInput();
checkRouting(files);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error('\nFailures:');
  for (const f of failures) console.error(`  • ${f}`);
  process.exit(1);
}
console.log('Parent dashboard verified.');
