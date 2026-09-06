// ─────────────────────────────────────────────────────────────────────────────
// The Roadmap generator — the most expensive and most consequential generation
// in MedSchoolPrep.
//
// Routes through purpose:'roadmap' (api/groq.js), which pins Oracle
// (openai/gpt-oss-120b on Groq): the largest-context (131K), largest-max-output
// (32,768-token) model Groq hosts, with native JSON mode and a tunable
// reasoning_effort. That purpose also owns a dedicated TWO-KEY pool, and pins
// each student to one of the two by a hash of their id — see the ROADMAP_KEYS
// header in api/groq.js for why a stateless round-robin would not actually
// alternate and why a multi-call build must not straddle two accounts.
//
// ── The division of labor, restated because everything here depends on it ──
// The model is NEVER asked for a date. Not once, in any of the four passes. It
// is handed a shortlist of real catalog entries that already carry their dates
// (src/lib/roadmap/catalog.js, built from the hand-checked catalog in
// src/data/roadmap) and asked to SELECT, SEQUENCE, and EXPLAIN. Anything it
// returns that is not a known catalog id is discarded by resolveSelection()
// rather than rendered. A model cannot hallucinate a deadline it was never
// asked to produce.
//
// ── Why four passes and not one ─────────────────────────────────────────────
// A twelve-month roadmap written in a single completion is either shallow
// everywhere or deep in the first season and exhausted by the third — the model
// spends its output budget in order and runs out. Worse, one pass gives it no
// opportunity to check its own work against the year as a whole.
//
//   1. strategy()  — ONE call. Reads the student and returns the year's thesis,
//                    four named seasons, and the two or three risks that will
//                    actually derail this particular person. Cheap, short, and
//                    it is the context every later pass is conditioned on.
//   2. selectSlate() — ONE call. Given the thesis and the full shortlist, picks
//                    which catalog entries belong in the year and which season
//                    each sits in, with a reason per pick and a named fallback
//                    for every long shot. This is the pass that does the actual
//                    advising.
//   3. deepen()    — ONE call PER SEASON, run for the near seasons only. Turns
//                    each selected item into real preparation: what to do in
//                    which week, what to have ready, what the student personally
//                    needs to watch for. Split per season so each gets a full
//                    output budget rather than a quarter of one.
//   4. review()    — ONE call. Reads the assembled roadmap back and writes the
//                    honest assessment: what this year does and does not do for
//                    them, and what it is betting on.
//
// ── Never fails silently ────────────────────────────────────────────────────
// Every pass resolves to a complete, usable result — the same contract
// masterPlanGenerator.js established, for the same hard-won reason spelled out
// in its callOracle header. A failed pass falls back to a DETERMINISTIC roadmap
// built purely from the scored catalog slate, which is genuinely usable (real
// programs, real dates, sensible sequencing) and merely lacks the personal
// reasoning. When that happens the roadmap is stamped `generation.degraded` and
// the UI says so and offers a retry, rather than presenting the fallback as
// Medabrain's best thinking.
// ─────────────────────────────────────────────────────────────────────────────
import { dayKey, daysBetween, shiftDays, effectiveGradeStage, GRADE_LABELS } from '../timeline.js';
import { buildCandidateSlate, shortlistForPrompt, catalogEntry } from './catalog.js';
import { answersToGates, intakeToPromptText, targetSchools, homePlace, intendedMajor } from './intake.js';
import { MAJOR_BY_ID } from '../geo/majors.js';
import { ROADMAP_VERSION, SEASON_COUNT, roadmapFingerprint, validateSlate, monthlyLoad } from './model.js';
import { measure, rung, rungForOverage, squeeze, LAST_RUNG } from './promptBudget.js';
import { TRACK_BY_ID, TRACK_IDS } from '../../data/roadmap/index.js';

// ── Wire plumbing ────────────────────────────────────────────────────────────
// Deliberately the same shape, retry policy and trace discipline as
// masterPlanGenerator.js's callOracle. Duplicated rather than shared because the
// two differ in purpose, timeout and token budget, and a shared helper taking
// five configuration arguments would be harder to read than this.

const ATTEMPTS = 4;
const BACKOFF_MS = [1500, 4000, 9000];
// Just above the server's own abort (52s by default — TIMEOUT_MS_BY_PURPOSE in
// api/groq.js), so the server's 504 wins the race and the client gets a real
// status to act on rather than an opaque abort. Raise this if
// GROQ_MASTERPLAN_TIMEOUT_MS is ever raised, or the client will start giving up
// on requests the server was still going to answer.
const TIMEOUT_MS = 58000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Failures that no amount of retrying will fix ─────────────────────────────
//
// THE BUG THIS EXISTS BECAUSE OF, stated plainly, because it is the one a
// student actually reported: the roadmap arrived stamped `degraded`, the banner
// offered "Rebuild it properly", and pressing it appeared to do nothing at all.
//
// It was not doing nothing. It was doing the identical thing that had just
// failed. `call()` treats any 5xx and any 429 as retryable, so a build against a
// server with no API key configured — or a revoked key, or a model the account
// cannot reach — spends FOUR attempts per pass across FIVE passes: twenty
// upstream calls, about ninety seconds of backoff sleeps, and then the
// deterministic slate. The retry button then repeats all twenty. From the
// outside that is a button that hangs for a minute and a half and changes
// nothing, which is exactly what it was reported as.
//
// The classification below is the fix. A failure carrying one of these codes is
// TERMINAL: it is a fact about the deployment or the account, identical on every
// subsequent call, so the first one aborts the whole build rather than being
// re-proven nineteen more times. What the student gets instead is the
// deterministic roadmap in a couple of seconds, a banner that names the real
// cause, and a retry button that is honest about whether retrying can help.
//
// Codes come from api/groq.js, which returns them alongside every error body.
// A response with no code at all is treated as transient — the conservative
// direction, since the cost of retrying a terminal failure is a slow build and
// the cost of NOT retrying a transient one is a degraded roadmap.
export const TERMINAL_CODES = new Set([
  // No key configured on the server at all. Every call, every pass, forever.
  'not_configured',
  // Every key in the pool was rejected: missing, revoked, mistyped, or barred.
  'auth_failed',
  // The pinned model is not reachable for this account.
  'model_unavailable',
  // The daily budget is spent. It does not come back before tomorrow, so the
  // remaining passes cannot succeed and neither can an immediate retry.
  'daily_limit',
  // The NETWORK's shared daily ceiling, not this student's own allowance. Same
  // terminal shape — it does not clear before tomorrow on this connection — but
  // a completely different sentence, because telling a student who has never
  // built a roadmap that they have used up their builds is a false statement
  // about them rather than about their school's wifi. See budgetVerdict() in
  // api/groq.js for the per-IP-bucket bug that made this distinction necessary.
  'shared_network_limit',
]);

/**
 * What a student should be told, and whether the retry button can honestly be
 * offered. One entry per terminal code plus the two non-terminal outcomes that
 * still end in a degraded roadmap.
 *
 * `retryable` is the field the UI hangs the button off. Offering "rebuild it
 * properly" against a cause a rebuild cannot touch is how a working button comes
 * to be reported as broken, and it is the whole reason this table exists rather
 * than one generic sentence.
 */
export const DEGRADED_REASONS = {
  not_configured: {
    title: 'Medabrain is not switched on for this app yet.',
    detail: 'Your roadmap was assembled straight from the verified deadline catalog instead. Every date on it is real and the sequencing is sound — what is missing is the part written for you personally. This is something we have to fix on our end, not something you can retry into working.',
    retryable: false,
  },
  auth_failed: {
    title: 'We could not sign in to Medabrain.',
    detail: 'Your roadmap was assembled from the verified deadline catalog instead. Every date on it is real. This is a problem on our side and retrying will hit the same wall — it will build properly once we have fixed it.',
    retryable: false,
  },
  model_unavailable: {
    title: 'The model that writes roadmaps is unavailable right now.',
    detail: 'Your roadmap was assembled from the verified deadline catalog instead, so every date on it is still real. This one is worth trying again later today.',
    retryable: true,
  },
  daily_limit: {
    title: 'You have used up today\'s roadmap builds.',
    detail: 'Building a year is the most expensive thing this app does, so there is a daily ceiling on it. This roadmap was assembled from the verified deadline catalog — real programs, real dates — and you can rebuild it properly tomorrow.',
    retryable: false,
  },
  shared_network_limit: {
    title: 'This network has used up today\'s roadmap builds — not you.',
    detail: 'Roadmap builds are budgeted per person, with a much larger shared ceiling for everyone on one connection, and that shared ceiling is what has been reached. Your own allowance is untouched: the same build usually works straight away on a phone off the school wifi, and the network\'s resets tomorrow. This roadmap was assembled from the verified deadline catalog in the meantime — real programs, real dates.',
    retryable: false,
  },
  shared_network_busy: {
    title: 'A lot of people on this network are asking Medabrain at once.',
    detail: 'This is the shared per-minute ceiling for your connection rather than anything to do with your own account. It clears in under a minute — the retry below should work.',
    retryable: true,
  },
  unreachable: {
    title: 'Medabrain could not be reached while this was being built.',
    detail: 'Some of your roadmap was assembled from the deadline catalog by rule rather than by judgment. Every date on it is still real — the reasoning is what is missing. This usually works on a second try.',
    retryable: true,
  },
  thin_selection: {
    title: 'Medabrain answered, but did not choose enough for a real year.',
    detail: 'Rather than show you a four-item year, the rest was filled from the verified deadline catalog. Every date is real. Trying again usually produces a fuller answer.',
    retryable: true,
  },
};

/** The student-facing explanation for a code, with a safe default. */
export function degradedReasonFor(code) {
  return { code: code || 'unreachable', ...(DEGRADED_REASONS[code] || DEGRADED_REASONS.unreachable) };
}

export function createTrace() {
  return {
    calls: 0, aiCalls: 0, fallbacks: 0, attempts: 0, errors: [], stages: {},
    // Set the first time a pass fails with a TERMINAL_CODES code. Every later
    // call() in the same build short-circuits on it without touching the network,
    // which is what turns a ninety-second twenty-call failure into a two-second
    // one-call failure that can say why.
    terminal: null,
    // Which vendor actually answered, and how small the payload had to get.
    // Both are things a student may be told: a build served entirely by the
    // relief provider is still a real build and should not carry the degraded
    // banner, and a build that had to drop to rung 2 is a legitimate reason a
    // roadmap looks thinner than the same student's last one.
    providers: {}, rungs: {}, truncations: 0,
    startedAt: Date.now(),
  };
}
function noteError(trace, stage, detail) {
  if (!trace) return;
  if (trace.errors.length < 16) trace.errors.push(`${stage}: ${detail}`);
}

export function parseLooseJSON(text) {
  if (!text) return null;
  const s = String(text).trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  const body = s.slice(first, last + 1);
  const tryParse = (t) => { try { return JSON.parse(t); } catch { return null; } };
  return (
    tryParse(body)
    || tryParse(body.replace(/,\s*([}\]])/g, '$1'))
    || tryParse(body.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/,\s*([}\]])/g, '$1'))
    || null
  );
}

const str = (v, max = 600) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const arr = (v) => (Array.isArray(v) ? v : []);

async function callOnce({ system, user, maxTokens, reasoningEffort, lane }) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), TIMEOUT_MS) : null;
  try {
    const r = await fetch('/api/groq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system, message: user, maxTokens,
        purpose: 'roadmap', tier: 'oracle', jsonMode: true, reasoningEffort,
        // The key-lane hint. Opaque to the server and used only to index into a
        // two-element array of Groq keys — see the note beside `lane` in
        // api/groq.js for why a client-supplied value is safe here.
        lane,
      }),
      signal: controller ? controller.signal : undefined,
    });
    if (!r.ok) {
      let waitMs = null;
      let code = null;
      let detail = `HTTP ${r.status}`;
      try {
        const body = await r.json();
        if (Number.isFinite(Number(body?.retryAfterMs))) waitMs = Number(body.retryAfterMs);
        if (typeof body?.code === 'string') code = body.code;
        if (body?.error) detail = `HTTP ${r.status} — ${String(body.error).slice(0, 140)}`;
      } catch { /* a non-JSON error body is still an error */ }
      // A terminal code is a fact about the deployment or the account rather
      // than about this request, so it is never retryable no matter what the
      // status number says — a 429 that means "your daily budget is spent" and a
      // 429 that means "wait four seconds" are the same status and opposite
      // instructions. See TERMINAL_CODES above for the failure this distinction
      // was added to end.
      const terminal = !!code && TERMINAL_CODES.has(code);
      // A 413 is the one status where retrying the same payload is provably
      // pointless, and it is the status a payload-too-large guard returns.
      return {
        code, terminal,
        retryable: !terminal && (r.status === 429 || r.status >= 500),
        shrink: r.status === 413,
        detail, waitMs,
      };
    }
    const d = await r.json();
    const parsed = parseLooseJSON(d && d.content);
    if (!parsed) {
      // The server tells us when it had to cut the request (api/groq.js's
      // `truncated`). A truncated request that then failed to parse is not a
      // flaky model, it is a prompt that did not fit — so this asks the caller
      // to send LESS rather than to send the same thing again, which is the loop
      // that used to end in the deterministic slate.
      const cut = Number(d?.truncatedChars) || 0;
      return {
        retryable: true,
        shrink: cut > 0,
        truncatedChars: cut,
        detail: cut
          ? `the request was ${cut} characters over the server's limit and was cut, so the reply did not parse`
          : 'response was not parseable JSON (likely truncated)',
        waitMs: 0,
      };
    }
    return { parsed, provider: d?.provider || 'groq', providerLabel: d?.providerLabel || 'Groq', truncatedChars: Number(d?.truncatedChars) || 0 };
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    return { retryable: true, detail: aborted ? 'client timeout' : `network error (${err?.message || 'unknown'})`, waitMs: aborted ? 0 : 1000 };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Ask the server whether a build can succeed BEFORE spending one.
 *
 * A build is five passes of up to four attempts. When the answer was always going to be no — no
 * key on the deployment, this student's daily allowance spent, the school's shared ceiling reached
 * — every one of those calls fails identically, and the student learns it after ninety seconds of
 * backoff sleeps in the form of a roadmap that quietly became the deterministic slate. The server
 * knows all of that before it dials anything (see the probe handler in api/groq.js), so asking
 * costs one fast round-trip and turns a ninety-second mystery into an immediate sentence.
 *
 * Deliberately fail-OPEN. A probe that errors, times out, or comes back in a shape we don't
 * recognize returns null, and the build proceeds exactly as it would have. This is an accelerant
 * for a failure we can predict, never a new way to block a build that would have worked — a
 * preflight that can veto is a preflight that can be wrong about it.
 *
 * @returns {Promise<{code: string, error: string|null}|null>} the terminal cause, or null to proceed
 */
export async function preflight({ lane = null, timeoutMs = 6000 } = {}) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const r = await fetch('/api/groq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ probe: true, purpose: 'roadmap', lane }),
      signal: controller ? controller.signal : undefined,
    });
    if (!r.ok) return null;
    const d = await r.json();
    if (!d || d.probe !== true || d.ok !== false) return null;
    // Only a cause no retry can fix is worth aborting a build for. A minute bucket that needs
    // another twenty seconds is exactly what call()'s backoff ladder is for, and short-circuiting
    // it here would turn a build that recovers on its own into one that refuses to start.
    if (!TERMINAL_CODES.has(d.code)) return null;
    return { code: d.code, error: typeof d.error === 'string' ? d.error : null };
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * One pass, with retries that get SMALLER rather than identical.
 *
 * `spec` is either a plain args object (a pass whose size never varies) or a
 * function (rungIndex) => args, which is what lets a retry rebuild the prompt at
 * a genuinely smaller size. See src/lib/roadmap/promptBudget.js for the rungs
 * and for the failure this exists to end.
 *
 * The rung is chosen before the first call, not only after a failure: a payload
 * measured as twice the budget steps straight to the rung that can fit rather
 * than spending three real API calls discovering that.
 */
async function call(spec, trace, stage) {
  // ── The short circuit ──────────────────────────────────────────────────────
  // A terminal failure earlier in this build has already established that no
  // call can succeed. Every later pass returns immediately, without a request:
  // five passes × four attempts against a wall is ninety seconds of the
  // student's life spent re-learning something the first call already proved.
  if (trace?.terminal) {
    trace.calls += 1;
    trace.fallbacks += 1;
    trace.stages[stage] = 'skipped';
    return null;
  }
  if (trace) trace.calls += 1;
  const build = typeof spec === 'function' ? spec : () => spec;
  let rungIdx = 0;

  // Pre-flight: if the full-size payload cannot fit, start where it can.
  {
    const first = build(0);
    const m = measure({ system: first.system || '', user: first.user || '' });
    if (!m.fits) {
      rungIdx = rungForOverage(m);
      noteError(trace, stage, `payload was ${m.over} characters over budget — starting at rung ${rung(rungIdx).name}`);
    }
  }

  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    if (trace) trace.attempts += 1;
    const args = build(rungIdx);
    const result = await callOnce(args);
    if (result.parsed) {
      if (trace) {
        trace.aiCalls += 1;
        trace.stages[stage] = 'ai';
        trace.providers[result.provider] = (trace.providers[result.provider] || 0) + 1;
        if (rungIdx > 0) trace.rungs[stage] = rung(rungIdx).name;
      }
      return result.parsed;
    }
    noteError(trace, stage, `attempt ${attempt + 1} ${result.detail}`);
    // Record the terminal cause on the trace so every later pass short-circuits
    // and so the finished roadmap can name it to the student. First one wins:
    // the cause that stopped the build is the one worth reporting.
    if (result.terminal && trace && !trace.terminal) trace.terminal = result.code;
    if (!result.retryable || attempt === ATTEMPTS - 1) break;
    // Step the payload down whenever size was implicated, and once more after a
    // second failure of any kind — a pass that has failed twice at one size has
    // earned the doubt, and a smaller real roadmap beats a deterministic one.
    if (result.shrink || attempt >= 1) {
      if (result.shrink && trace) trace.truncations += 1;
      rungIdx = Math.min(rungIdx + 1, LAST_RUNG);
    }
    await sleep(Math.max(BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)], result.waitMs || 0));
  }
  if (trace) { trace.fallbacks += 1; trace.stages[stage] = 'fallback'; }
  return null;
}

// ── Seasons ──────────────────────────────────────────────────────────────────
// Four quarters from the build date. Not calendar quarters and not school terms:
// a roadmap built in November should start with "now until February", not with
// a season that ended six weeks ago. The labels name the months so a student
// never has to work out which "Season 2" is.

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function buildSeasons(startDate, seasonCount = SEASON_COUNT) {
  const seasons = [];
  const daysEach = Math.round(365 / seasonCount);
  for (let i = 0; i < seasonCount; i += 1) {
    const start = shiftDays(startDate, i * daysEach);
    const end = i === seasonCount - 1 ? shiftDays(startDate, 364) : shiftDays(startDate, (i + 1) * daysEach - 1);
    const sm = MONTH_NAMES[Number(start.slice(5, 7)) - 1];
    const em = MONTH_NAMES[Number(end.slice(5, 7)) - 1];
    seasons.push({
      id: `s${i + 1}`,
      index: i,
      label: sm === em ? sm : `${sm} – ${em}`,
      startDate: start,
      endDate: end,
      theme: null,
      narrative: null,
    });
  }
  return seasons;
}

const seasonIdForDate = (seasons, date) =>
  (seasons.find((s) => date >= s.startDate && date <= s.endDate)
    || seasons.find((s) => s.startDate > date)
    || seasons[0])?.id || 's1';

// ── Prompt construction ──────────────────────────────────────────────────────

const ROADMAP_STANCE = `You are Medabrain's Roadmap architect — the part of this product that replaces a good private admissions counselor for a high-school student who does not have one.

Hold yourself to what a genuinely good counselor does, not to what a chatbot does:
- BE SPECIFIC OR SAY NOTHING. "Get involved in research" is worthless. "Email the four labs at the state university whose work touches immunology, in February, before their summer slots fill" is advice.
- SEQUENCE, DO NOT LIST. The value is in what comes before what, and why. If the letters take three weeks, the asking is three weeks before the deadline, and you say so.
- BE HONEST ABOUT ODDS. Name a long shot as a long shot, put something achievable beside it, and never imply an outcome is likely because the student wants it to be.
- RESPECT THEIR ACTUAL LIFE. Hours they said they have, money they said they do not, a car they said they cannot borrow. A plan that ignores a constraint is not ambitious, it is useless.
- NEVER FLATTER. This student is going to be judged by strangers on paper. Tell them what you would tell a friend's child.`;

const DATE_RULE = `ABSOLUTE RULE — YOU DO NOT PRODUCE DATES.
Every item you may choose from is listed below with its real dates already attached, taken from a hand-verified catalog. You select from that list by its exact "id". You must NEVER write a date, deadline, month or year of your own into your output, and you must NEVER name a program that is not in the list. If something you think matters is missing from the list, say so in your reasoning text — do not invent it. Any id you return that is not in the list is discarded, so inventing one costs the student that slot for nothing.`;

/** The shortlist, rendered for the prompt. Compact but complete — every field the model needs to choose well and nothing it does not. */
function shortlistText(items) {
  return items.map((i) => {
    const when = i.needsStudentDate && !i.anchor
      ? `season: ${i.season || 'varies'}`
      : [
        i.opens ? `opens ${i.opens}` : null,
        i.due ? `DUE ${i.due}` : (i.on ? `happens ${i.on}` : null),
        i.startBy ? `start work by ${i.startBy}` : null,
      ].filter(Boolean).join(', ');
    const flags = [
      i.selectivity !== 'open' ? i.selectivity : null,
      `${i.effort} effort`,
      i.cost !== 'varies' ? i.cost : null,
      i.format !== 'varies' ? i.format : null,
      i.confidence === 'typical' ? 'date is typical, not confirmed' : null,
      i.confidence === 'varies' ? 'date varies locally — student must look it up' : null,
      // Where the student stands relative to a residency restriction. Stated in the shortlist
      // rather than left for the model to work out from a state list, because "IN THEIR STATE" is
      // a reason to pick something and the model should see the reason, not the raw data it would
      // have to derive it from. Absent entirely when we do not know where they live.
      i.proximity === 'home' ? 'IN THEIR STATE — far smaller applicant pool than a national equivalent' : null,
      i.proximity === 'region' ? 'in their region' : null,
      i.proximity === 'far' ? 'RESTRICTED TO STATES THEY DO NOT LIVE IN — do not pick this' : null,
      i.missed ? 'ALREADY PASSED THIS YEAR' : null,
    ].filter(Boolean).join(' · ');
    return `id: ${i.catalogId}
  ${i.name}${i.org ? ` (${i.org})` : ''} — track: ${i.track}
  ${when}${i.prepWeeks ? ` · needs ~${i.prepWeeks} weeks of preparation` : ''}
  ${flags}
  what it does for them: ${i.why}`;
  }).join('\n\n');
}

/** Who this student is, in prose. Draws on onboarding, the intake, and the Portfolio digest the caller passes in. */
function studentText({ user, answers, portfolioFacts, gradeStage, today }) {
  const schools = targetSchools(answers);
  const place = homePlace(answers);
  const major = MAJOR_BY_ID[intendedMajor(answers)];
  const lines = [
    `Today is ${today}. They are a ${GRADE_LABELS[gradeStage] || gradeStage}.`,
    user?.name ? `Name: ${user.name}.` : null,
    user?.specialty || user?.pathway ? `Health pathway they are exploring: ${user.specialty || user.pathway}.` : null,
    user?.dreamRole ? `Dream role: ${user.dreamRole}.` : null,
    user?.certainty ? `How sure they are about medicine: ${user.certainty}.` : null,
    user?.whyMedicine ? `Why medicine, in their words: ${user.whyMedicine}.` : null,
    user?.gpaBand ? `Self-reported grades: ${user.gpaBand}.` : null,
    (user?.obstacles || []).length ? `What they said gets in their way: ${(user.obstacles || []).join(', ')}.` : null,
    schools.length ? `Colleges they are aiming at: ${schools.join(', ')}. Every deadline and supplement in this roadmap should be back-planned from these.` : 'They have not named target colleges yet — say so, and make building that list an early item.',
    // ── Where they live ──────────────────────────────────────────────────────
    // The STATE, never the ZIP — see the note in intakeToPromptText. Written as
    // an instruction rather than a fact because the model's job with this
    // information is specific: prefer in-state programs, and refer to the state
    // by name so the roadmap reads as having been written for a person who
    // lives somewhere.
    place
      ? `They live in ${place.stateName} (${place.regionLabel}). Programs restricted to ${place.stateName} residents are among the best-value things available to them — a state applicant pool instead of a national one — so prefer them where the shortlist offers them, and name ${place.stateName} out loud when you do. Never pick anything the shortlist flags as restricted to states they do not live in.`
      : 'They have not said where they live, so you do not know their state. Do not guess at one, do not say "near you" about anything, and prefer nationally open and virtual options. It is worth telling them once that adding a ZIP code would surface state programs they cannot currently see.',
    // ── What they want to study ──────────────────────────────────────────────
    // Framed to the model exactly as it is framed to the student, because the
    // failure to avoid is a roadmap that treats a fifteen-year-old's guess at a
    // major as a commitment and builds a narrow year around it.
    major && major.id !== 'undecided'
      ? `If they had to pick an undergraduate major today it would be: ${major.label}. Treat this as a LEAN, not a commitment — they are in high school and may well change it, and medical schools do not care which major anyone picks. What it should change is which of several equally good options you choose and what the year coheres around. For this major specifically: ${major.lean} The high-school courses it makes load-bearing next year: ${major.courses.join(', ')}.`
      : 'They have not settled on a major, which is completely normal at this stage. Build the year broad enough that none of it is wasted whichever way they go, and say that is what you are doing.',
  ].filter(Boolean);
  const intake = intakeToPromptText(answers);
  return [lines.join('\n'), intake, portfolioFacts].filter(Boolean).join('\n\n');
}

// ── Pass 1: strategy ─────────────────────────────────────────────────────────

function strategySystem(seasons, gradeStage) {
  return `${ROADMAP_STANCE}

You are writing the STRATEGY for one student's next twelve months. Not the items yet — the shape of the year.

They are a ${GRADE_LABELS[gradeStage] || gradeStage}. Their year divides into four seasons:
${seasons.map((s) => `  ${s.id}: ${s.label} (${s.startDate} to ${s.endDate})`).join('\n')}

Return ONLY this JSON:
{
  "headline": "one sentence, under 90 characters, naming what this year is FOR — written to them, specific to them, not a slogan",
  "thesis": "2-4 sentences. The actual strategic argument: given who they are and where they are aiming, what is the highest-leverage use of these twelve months, and what are they deliberately NOT doing. Name the tradeoff out loud.",
  "seasons": [
    { "id": "s1", "theme": "4-8 words naming what this season is about", "narrative": "2-3 sentences: what they are building in this stretch and why it comes before the next one" }
  ],
  "risks": [
    { "title": "short name for the risk", "detail": "what will actually go wrong, specific to this student", "mitigation": "the concrete thing that prevents it" }
  ]
}

Rules:
- Exactly four seasons, ids s1..s4, in order.
- Two or three risks. Real ones for THIS student — their stated obstacles, their crunch months, their constraints — not generic advice about procrastination.
- The thesis must name something they are giving up. A year that is about everything is about nothing, and saying so is the most useful thing you will write.
- Write to them as "you". No preamble, no markdown, JSON only.`;
}

function repairStrategy(parsed, seasons, fallback) {
  const out = {
    headline: str(parsed?.headline, 120) || fallback.headline,
    thesis: str(parsed?.thesis, 900) || fallback.thesis,
    risks: arr(parsed?.risks).slice(0, 4).map((r) => ({
      title: str(r?.title, 80) || 'Something to watch',
      detail: str(r?.detail, 400) || '',
      mitigation: str(r?.mitigation, 400) || '',
    })).filter((r) => r.detail),
  };
  const byId = Object.fromEntries(arr(parsed?.seasons).map((s) => [s?.id, s]));
  out.seasons = seasons.map((s, i) => ({
    ...s,
    theme: str(byId[s.id]?.theme, 90) || fallback.seasons[i]?.theme || s.label,
    narrative: str(byId[s.id]?.narrative, 600) || fallback.seasons[i]?.narrative || '',
  }));
  if (!out.risks.length) out.risks = fallback.risks;
  return out;
}

// ── Pass 2: slate selection ──────────────────────────────────────────────────

function selectSystem({ seasons, strategy, shortlist, gradeStage, answers }) {
  const capacity = { low: '6 to 9', moderate: '10 to 14', high: '14 to 18' }[answers?.weeklyHours || 'moderate'] || '10 to 14';
  return `${ROADMAP_STANCE}

${DATE_RULE}

THE YEAR'S STRATEGY, which you wrote and must now execute:
"${strategy.headline}"
${strategy.thesis}

SEASONS:
${seasons.map((s) => `  ${s.id}: ${s.label} (${s.startDate} to ${s.endDate}) — ${s.theme}`).join('\n')}

THE CATALOG YOU MAY CHOOSE FROM (these are the ONLY things you may put in the roadmap):

${shortlist}

Return ONLY this JSON:
{
  "picks": [
    {
      "id": "exact id from the catalog above",
      "season": "s1|s2|s3|s4",
      "reason": "1-2 sentences to the student: why THIS, for THEM, now. Reference something true about them.",
      "stretch": true|false,
      "fallbackFor": "id of the long-shot pick this one backs up, or null",
      "firstMove": "the single concrete thing to do first, in one sentence — something they could do this week"
    }
  ],
  "omitted": [
    { "id": "a catalog id you deliberately left out that they might expect", "reason": "one honest sentence why not" }
  ],
  "beyondCatalog": [
    {
      "name": "the real name of a competition, program or award that is NOT in the catalog above but genuinely belongs in THIS student's year",
      "org": "who runs it, if you are sure — otherwise null",
      "why": "1-2 sentences: why this specific student, given what you know about them. Not what it is — what it does for them.",
      "whereToLook": "how they find its real deadline — the organization's own site, a school chapter, a state coordinator. Be specific about WHO holds the date.",
      "track": "competition|program|scholarship|experience|academics|essays|relationships|testing|aid|application",
      "confidence": "sure|unsure"
    }
  ]
}

Rules that decide whether this is a real roadmap or a list:
- Pick ${capacity} items total, based on the ${answers?.weeklyHours || 'moderate'} weekly capacity they reported. Fewer, done properly, beats more.
- Put an item in the season where the WORK happens, not where the deadline falls. A scholarship due in October that needs eight weeks of essays is a summer item.
- Every item you mark "stretch": true must have at least one other pick in the same track that is genuinely achievable, and that pick must name it in "fallbackFor". A reach without a backup is a plan to have nothing.
- Do NOT stack the heavy items into one season. Look at the dates and spread the load.
- Items marked ALREADY PASSED THIS YEAR: only include one if the student can still act on next year's cycle, and say so plainly in the reason.
- Local items — the ones marked "date varies locally" — are usually the BEST bets, because the field is small and the student is already there. Use them. But no more than about two in five picks may be ones the student has to go and look the date up for, or the roadmap opens as a list of chores rather than a plan.
- "omitted" is not optional and it is not padding — naming two or three things you deliberately did not choose, and why, is what makes the rest credible.
- "beyondCatalog" is where you are allowed to go outside the list. Name up to four real things that belong in this student's year and are not above — a competition their state runs, a program at a university near them, an award in their specific field. THE ONE ABSOLUTE RULE: you may name the thing, and you may NEVER state its date. Not a day, not a month, not "usually around March", not "the deadline is in the spring". You do not know, and a date you produce here will be believed and acted on by a seventeen-year-old. Say WHO HOLDS the date instead, so they can go and get the real one. If you are not certain the thing exists under that name, mark it "unsure" — an unsure entry is useful and a confident wrong one is not.
- Every id must appear exactly once. No markdown, JSON only.`;
}

function resolveSelection(parsed, { slateById, seasons, trace }) {
  const seasonIds = new Set(seasons.map((s) => s.id));
  const seen = new Set();
  const picks = [];
  let dropped = 0;

  arr(parsed?.picks).forEach((p) => {
    const id = str(p?.id, 80);
    // THE WHITELIST. An id that is not in the shortlist this student was given
    // is discarded outright — this single line is what makes it structurally
    // impossible for the model to put an invented program or an invented date
    // in front of a student.
    const item = id ? slateById[id] : null;
    if (!item || seen.has(id)) { dropped += 1; return; }
    seen.add(id);
    const season = seasonIds.has(p?.season)
      ? p.season
      : seasonIdForDate(seasons, item.startBy || item.anchor || seasons[0].startDate);
    picks.push({ ...item, season, reason: str(p?.reason, 500), stretch: p?.stretch === true, fallbackFor: str(p?.fallbackFor, 80), firstMove: str(p?.firstMove, 280) });
  });

  if (dropped) noteError(trace, 'select', `${dropped} pick(s) named an unknown or duplicate catalog id and were discarded`);

  const omitted = arr(parsed?.omitted).slice(0, 6)
    .map((o) => ({ id: str(o?.id, 80), name: slateById[o?.id]?.name || null, reason: str(o?.reason, 300) }))
    .filter((o) => o.reason && o.name);
  // ── Suggestions from outside the catalog ───────────────────────────────────
  // The catalog is a whitelist for anything carrying a DATE, and that is not
  // negotiable — it is the single mechanism that makes an invented deadline
  // structurally impossible (see the header of src/data/roadmap/schema.js). But
  // a whitelist of a few hundred entries cannot contain every competition worth
  // a student's year: their state's own contests, a program at the university
  // twenty minutes away, an award specific to the field they care about. Refusing
  // to name those means the roadmap is silently narrower than the world.
  //
  // So the model may NAME things outside the catalog, and may never DATE them.
  // That is the whole design, and the enforcement is here rather than in the
  // prompt: every date-shaped field is stripped from a suggestion before it can
  // reach a student, whatever the model returned. A suggestion arrives as a name,
  // a reason, and instructions for finding the real deadline from whoever
  // actually holds it — and it becomes a dated roadmap item only when the student
  // has looked it up and typed it in themselves.
  const beyondCatalog = arr(parsed?.beyondCatalog).slice(0, 4).map((g) => {
    const name = str(g?.name, 140);
    const why = str(g?.why, 400);
    if (!name || !why) return null;
    return {
      name,
      org: str(g?.org, 120),
      why,
      whereToLook: str(g?.whereToLook, 300) || 'Search the organization\'s own site for this year\'s deadline — it is the only place the real date lives.',
      track: TRACK_IDS.includes(g?.track) ? g.track : 'competition',
      // 'unsure' is surfaced to the student as a caveat rather than filtered out.
      // A model that flags its own uncertainty is more useful than one that only
      // ever speaks confidently, and hiding the flagged ones would train it out.
      unsure: g?.confidence === 'unsure',
      // Stripped unconditionally. Nothing downstream can render a date for a
      // suggestion because no date survives this point, whatever was returned.
      due: null, on: null, date: null, deadline: null,
    };
  }).filter(Boolean);

  // The old flat-string shape, kept so a roadmap built before this change still
  // renders its gaps rather than losing them on the next load.
  const gaps = arr(parsed?.gaps).slice(0, 5).map((g) => str(g, 300)).filter(Boolean);
  return { picks, omitted, gaps, beyondCatalog };
}

// ── Pass 3: deepening one season ─────────────────────────────────────────────

function deepenSystem(season, picks, student) {
  return `${ROADMAP_STANCE}

You are writing the working detail for ONE season of a student's roadmap.

SEASON ${season.id}: ${season.label} (${season.startDate} to ${season.endDate})
Theme: ${season.theme}
${season.narrative}

WHO THEY ARE:
${student}

THE ITEMS IN THIS SEASON (dates are fixed and given — do not restate or change them):
${picks.map((p) => `id: ${p.catalogId}
  ${p.name}${p.due ? ` — due ${p.due}` : p.on ? ` — happens ${p.on}` : ''}${p.startBy ? `, start by ${p.startBy}` : ''}
  ${p.needsStudentDate ? 'THE EXACT DATE IS LOCAL AND UNKNOWN — the student has to look it up.' : ''}
  known preparation steps: ${(p.steps || []).join(' | ') || 'none recorded'}`).join('\n\n')}

Return ONLY this JSON:
{
  "items": [
    {
      "id": "the catalog id",
      "howThisHelps": "1-2 sentences: what this specifically does for THIS student's application, given their goals and their gaps. Not what it is — what it does for them.",
      "steps": ["3-6 concrete actions, in the order they happen, each starting with a verb. Include what to have ready and who to ask. Reference the given dates relatively ('four weeks before it closes') but never write a date yourself."],
      "watchOut": "the one thing that most commonly goes wrong with this, in one sentence",
      "timeCost": "an honest estimate of hours per week while this is live, e.g. '2-3 hrs/week for six weeks'"
    }
  ],
  "seasonAdvice": "2-3 sentences to the student about how to actually get through this specific stretch, given everything on it at once."
}

Rules:
- One entry per item given, using its exact id.
- Steps must be things a seventeen-year-old can do on a Tuesday. "Network with professionals" is not a step. "Email Dr. Okafor at the county hospital, whose clinic your mum mentioned, and ask for one morning" is.
- If an item's exact date is local and unknown, the FIRST step must be looking it up and where to look.
- Never write a calendar date. No markdown, JSON only.`;
}

function applyDeepening(parsed, picks) {
  const byId = Object.fromEntries(arr(parsed?.items).map((i) => [i?.id, i]));
  const enriched = picks.map((p) => {
    const d = byId[p.catalogId];
    if (!d) return p;
    const steps = arr(d.steps).map((s) => str(s, 300)).filter(Boolean).slice(0, 8);
    return {
      ...p,
      howThisHelps: str(d.howThisHelps, 500) || p.why,
      // The model's steps replace the catalog's when it produced real ones —
      // they are personalized where the catalog's are generic. The catalog's
      // survive as the fallback so an item is never left with no steps at all.
      steps: steps.length >= 2 ? steps : p.steps,
      watchOut: str(d.watchOut, 300),
      timeCost: str(d.timeCost, 80),
    };
  });
  return { items: enriched, seasonAdvice: str(parsed?.seasonAdvice, 700) };
}

// ── Pass 4: the honest review ────────────────────────────────────────────────

function reviewSystem(roadmap, balance) {
  const bySeason = roadmap.seasons.map((s) => {
    const items = roadmap.items.filter((i) => i.season === s.id);
    return `${s.label} — ${s.theme}: ${items.map((i) => i.title).join('; ') || '(nothing scheduled)'}`;
  }).join('\n');
  return `${ROADMAP_STANCE}

Here is the roadmap you just built. Read it back as if you were a second counselor reviewing a colleague's work, and be straight about it.

"${roadmap.headline}"
${roadmap.thesis}

${bySeason}

Automated checks flagged: ${[...balance.problems, ...balance.warnings].join(' | ') || 'nothing'}

Return ONLY this JSON:
{
  "verdict": "2-3 sentences. What this year genuinely does for them, stated plainly.",
  "bet": "one sentence naming what this plan is BETTING on — the assumption that, if wrong, makes it the wrong plan",
  "ifOnlyOneThing": "if they did exactly one thing on this entire roadmap, which and why — one sentence",
  "notCovered": ["1-3 honest gaps: things this year does not address, that they should know it does not"]
}

No reassurance, no summarizing back what they can already read. The value here is the sentence they would not have thought of. JSON only.`;
}

// ── The deterministic fallback ───────────────────────────────────────────────
// A real, usable roadmap built purely from the scored catalog slate. Every date
// is correct, the sequencing is sensible, and the only thing missing is the
// personal reasoning. This is what a student gets when the model is unreachable
// — never an error screen, and never a plausible-looking empty shell.

export function heuristicRoadmap({ slate, seasons, answers, gradeStage }) {
  const capacity = { low: 8, moderate: 12, high: 16 }[answers?.weeklyHours || 'moderate'] || 12;
  const picks = [];
  const perSeason = new Map(seasons.map((s) => [s.id, 0]));
  const softCap = Math.ceil(capacity / seasons.length) + 1;

  // A roadmap made mostly of "look this date up yourself" is homework with a
  // progress bar on it. Local items are genuinely the best bets — smaller
  // fields, less competition, the student is already there — and scoreEntry
  // rewards them for exactly that reason, which is what makes this cap
  // necessary rather than optional. Two in five is enough to carry the local
  // advantage without the roadmap opening as a list of chores.
  const undatedCap = Math.max(2, Math.round(capacity * 0.4));
  let undated = 0;

  // Highest-scoring first, but capped per season so the year does not pile into
  // whichever quarter happens to hold the most deadlines.
  for (const item of slate.items) {
    if (picks.length >= capacity) break;
    if (item.needsStudentDate && undated >= undatedCap) continue;
    const season = seasonIdForDate(seasons, item.startBy || item.anchor || seasons[0].startDate);
    if ((perSeason.get(season) || 0) >= softCap) continue;
    perSeason.set(season, (perSeason.get(season) || 0) + 1);
    if (item.needsStudentDate) undated += 1;
    picks.push({
      ...item,
      season,
      reason: item.why,
      stretch: item.selectivity === 'lottery',
      fallbackFor: null,
      firstMove: item.steps?.[0] || null,
    });
  }

  // ── Every reach gets a backup, or it is not a reach, it is a hope ──────────
  // SLATE_RULES.requireFallbackForLottery is enforced on the finished roadmap by validateSlate,
  // and the deterministic path has to satisfy it too — otherwise the one roadmap a student gets
  // when the network is down is the one that puts a 3%-admit program in front of them with
  // nothing beside it. Score order alone does not guarantee this: a lottery entry can easily
  // outrank every achievable entry on its own track.
  //
  // So for each long shot, pull in the best achievable item on the same track. If the slate has
  // none — a track that is genuinely all reaches for this student — drop the long shot instead.
  // A year with one fewer item in it is strictly better than a year with an unbacked reach.
  const picked = new Set(picks.map((p) => p.catalogId));
  const kept = [];
  for (const pick of picks) {
    if (pick.selectivity !== 'lottery') { kept.push(pick); continue; }
    const hasBackup = picks.some((p) => p.track === pick.track && ['open', 'selective'].includes(p.selectivity));
    if (hasBackup) { kept.push(pick); continue; }
    const backup = slate.items.find((i) => i.track === pick.track
      && ['open', 'selective'].includes(i.selectivity) && !picked.has(i.catalogId));
    if (!backup) continue; // no safety net available on this track — drop the reach
    picked.add(backup.catalogId);
    kept.push(pick, {
      ...backup,
      season: seasonIdForDate(seasons, backup.startBy || backup.anchor || seasons[0].startDate),
      reason: backup.why,
      stretch: false,
      fallbackFor: pick.catalogId,
      firstMove: backup.steps?.[0] || null,
    });
  }

  return {
    headline: `Your ${GRADE_LABELS[gradeStage] || gradeStage} year, mapped to real deadlines`,
    thesis: 'This roadmap was built from the verified deadline catalog rather than written for you personally — every date on it is real, and the sequencing follows what has to happen before what. Rebuild it when you have a connection and it will be tailored to your answers.',
    seasons: seasons.map((s) => ({ ...s, theme: s.label, narrative: '' })),
    risks: [{
      title: 'This roadmap was not personalized',
      detail: 'Medabrain could not be reached while this was being built, so these items were chosen by rule rather than judgment.',
      mitigation: 'Tap Rebuild to have it written for you properly.',
    }],
    picks: kept,
    omitted: [],
    gaps: [],
    beyondCatalog: [],
  };
}

// ── Assembly ─────────────────────────────────────────────────────────────────

function pickToItem(pick, seasons) {
  const entry = catalogEntry(pick.catalogId);
  return {
    id: `rm-${pick.catalogId}`,
    catalogId: pick.catalogId,
    addedBy: 'model',
    title: pick.name,
    org: pick.org || null,
    track: pick.track,
    trackLabel: TRACK_BY_ID[pick.track]?.label || pick.track,
    season: pick.season || seasons[0].id,
    // Dates are copied from the catalog-resolved slate item and never from
    // model output. This is the last place they could have been contaminated.
    opens: pick.opens || null,
    due: pick.due || null,
    on: pick.on || null,
    anchor: pick.anchor || null,
    startBy: pick.startBy || null,
    studentDate: null,
    confidence: pick.confidence,
    seasonHint: pick.season_text || entry?.season || null,
    needsStudentDate: !!pick.needsStudentDate,
    prepWeeks: pick.prepWeeks || 0,
    why: pick.reason || pick.why,
    howThisHelps: pick.howThisHelps || null,
    watchOut: pick.watchOut || null,
    timeCost: pick.timeCost || null,
    firstMove: pick.firstMove || null,
    steps: pick.steps || [],
    doneSteps: [],
    effort: pick.effort,
    selectivity: pick.selectivity,
    cost: pick.cost,
    format: pick.format,
    priority: pick.priority,
    isStretch: !!pick.stretch,
    fallbackFor: pick.fallbackFor ? `rm-${pick.fallbackFor}` : null,
    status: 'todo',
    completedAt: null,
    url: pick.url || null,
    action: pick.action || null,
    opportunityId: pick.opportunityId || null,
    scholarshipId: pick.scholarshipId || null,
  };
}

/**
 * Build a student's twelve-month roadmap.
 *
 * ALWAYS resolves to a complete roadmap. `onStage` is called with a short label
 * as each pass starts, so the UI narrates what is actually happening rather
 * than showing a spinner and a lie about how long it will take.
 *
 * @param {object} opts.user       the local user record
 * @param {object} opts.answers    intake answers (src/lib/roadmap/intake.js)
 * @param {string} opts.portfolioFacts  the Portfolio digest text (built by the caller)
 * @param {object} opts.portfolio  the raw Portfolio, for the fingerprint
 * @param {string} opts.lane       stable per-student key-lane id (their user id)
 */
export async function createRoadmap({
  user, answers = {}, portfolioFacts = null, portfolio = null, lane = null,
  now = new Date(), onStage = () => {},
} = {}) {
  const trace = createTrace();
  const gradeStage = effectiveGradeStage(user, now) || user?.gradeStage || 'junior';
  const today = dayKey(now);
  const gates = answersToGates(answers);

  onStage('Reading your answers and your whole Portfolio…');
  const slate = buildCandidateSlate({ user, answers: gates, now, horizonMonths: 12 });
  const seasons = buildSeasons(today);

  // ── Preflight ──────────────────────────────────────────────────────────────
  // One cheap round-trip that asks whether a build can succeed at all. Seeding the trace's
  // terminal field is all it takes to change the outcome: every call() short-circuits on it
  // without touching the network, so a doomed build resolves to the deterministic slate in about
  // two seconds carrying the real reason, rather than in ninety carrying "unreachable". Fails
  // open — see preflight().
  const gate = await preflight({ lane });
  if (gate) {
    trace.terminal = gate.code;
    noteError(trace, 'preflight', gate.error || gate.code);
  }

  // ── Everything the model is shown, sized per rung ──────────────────────────
  // The shortlist and the student digest are the only two parts of these prompts
  // that scale with a student, so they are the only two that shrink. The stance,
  // the date rule and the JSON contract are fixed-size and never trimmed — they
  // are the instructions, and a prompt that loses its instructions to make room
  // for its data is how this broke in the first place.
  const shortlistAt = (i) => shortlistForPrompt(slate, { perTrack: rung(i).perTrack, total: rung(i).total });
  const studentAt = (i) => studentText({
    user, answers, gradeStage, today,
    portfolioFacts: portfolioFacts
      ? squeeze(portfolioFacts, Math.round(28000 * rung(i).digest))
      : null,
  });

  // The full shortlist is what resolveSelection() whitelists against, so it is
  // built once at rung 0 regardless of which rung a prompt ended up using: an id
  // the model returned from a smaller list is still in the bigger one, and a
  // student who retries should not have a pick rejected for having been chosen
  // from a shorter menu.
  const shortlist = shortlistAt(0);
  const slateById = Object.fromEntries(shortlist.map((i) => [i.catalogId, i]));
  const student = studentAt(0);
  const fallback = heuristicRoadmap({ slate, seasons, answers, gradeStage });

  // Pass 1 — strategy.
  onStage('Working out what this year should actually be about…');
  const strategyRaw = await call((i) => ({
    system: strategySystem(seasons, gradeStage),
    user: studentAt(i),
    maxTokens: 3000,
    reasoningEffort: 'high',
    lane,
  }), trace, 'strategy');
  const strategy = repairStrategy(strategyRaw, seasons, fallback);

  // Pass 2 — which items, in which season. The heaviest prompt in the app, and
  // the one the rungs were built for.
  onStage('Choosing the competitions, programs and deadlines that fit you…');
  const selectionRaw = await call((i) => ({
    system: selectSystem({ seasons: strategy.seasons, strategy, shortlist: shortlistText(shortlistAt(i)), gradeStage, answers }),
    user: studentAt(i),
    maxTokens: 8000,
    reasoningEffort: 'high',
    lane,
  }), trace, 'select');
  let selection = selectionRaw
    ? resolveSelection(selectionRaw, { slateById, seasons: strategy.seasons, trace })
    : { picks: fallback.picks, omitted: [], gaps: [], beyondCatalog: [] };
  // A model that returned JSON but chose almost nothing usable is a failed pass,
  // not a minimal roadmap. Four is the floor below which this is not a year.
  if (selection.picks.length < 4) {
    noteError(trace, 'select', `only ${selection.picks.length} usable pick(s) — falling back to the catalog slate`);
    if (trace) {
      trace.fallbacks += 1;
      trace.stages.select = 'fallback';
      // Distinct from "could not be reached": Medabrain answered, it just did not
      // choose enough to be a year. The student is told which, because the two
      // have different odds on a retry and pretending otherwise is how a retry
      // button loses its credibility.
      if (!trace.thinSelection) trace.thinSelection = true;
    }
    selection = { picks: fallback.picks, omitted: [], gaps: selection.gaps, beyondCatalog: selection.beyondCatalog };
  }

  // Pass 3 — deepen the near seasons, one call each.
  //
  // Only the first two. The back half of a twelve-month roadmap will be rewritten
  // by life before the student gets there, and spending two more expensive calls
  // writing week-by-week detail for next August is exactly the waste
  // masterPlanGenerator.js's rolling window exists to avoid. extendRoadmap()
  // below deepens a later season on demand, when it is actually near.
  const deepened = new Map();
  const seasonAdvice = {};
  const nearSeasons = strategy.seasons.slice(0, 2);
  for (const season of nearSeasons) {
    const inSeason = selection.picks.filter((p) => p.season === season.id);
    if (!inSeason.length) continue;
    onStage(`Writing the working detail for ${season.label}…`);
    const raw = await call((i) => ({
      system: deepenSystem(season, inSeason, studentAt(i)),
      user: `Write the working detail for ${season.label}. Return JSON only.`,
      maxTokens: 9000,
      reasoningEffort: 'high',
      lane,
    }), trace, `deepen:${season.id}`);
    if (!raw) continue;
    const { items, seasonAdvice: advice } = applyDeepening(raw, inSeason);
    items.forEach((i) => deepened.set(i.catalogId, i));
    if (advice) seasonAdvice[season.id] = advice;
  }

  const picks = selection.picks.map((p) => deepened.get(p.catalogId) || p);
  const items = picks.map((p) => pickToItem(p, strategy.seasons));

  let roadmap = {
    version: ROADMAP_VERSION,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    startDate: today,
    endDate: shiftDays(today, 364),
    gradeStage,
    gradeLabel: GRADE_LABELS[gradeStage] || gradeStage,
    headline: strategy.headline,
    thesis: strategy.thesis,
    targetSchools: targetSchools(answers),
    seasons: strategy.seasons.map((s) => ({ ...s, advice: seasonAdvice[s.id] || null, deepened: nearSeasons.some((n) => n.id === s.id) })),
    items,
    risks: strategy.risks,
    omitted: selection.omitted,
    gaps: selection.gaps,
    beyondCatalog: selection.beyondCatalog || [],
    intake: answers,
    fingerprint: roadmapFingerprint({ user, answers, portfolio }),
  };

  const balance = validateSlate(roadmap);

  // Pass 4 — the honest read-back.
  onStage('Reading it back and being honest about it…');
  const reviewRaw = await call({
    system: reviewSystem(roadmap, balance),
    user: 'Review this roadmap. Return JSON only.',
    maxTokens: 2000,
    reasoningEffort: 'medium',
    lane,
  }, trace, 'review');

  roadmap.review = reviewRaw ? {
    verdict: str(reviewRaw.verdict, 700),
    bet: str(reviewRaw.bet, 300),
    ifOnlyOneThing: str(reviewRaw.ifOnlyOneThing, 300),
    notCovered: arr(reviewRaw.notCovered).slice(0, 4).map((n) => str(n, 300)).filter(Boolean),
  } : null;

  roadmap.balance = balance;
  roadmap.monthlyLoad = monthlyLoad(roadmap);
  const providers = Object.keys(trace.providers);
  roadmap.generation = {
    at: Date.now(),
    model: 'openai/gpt-oss-120b',
    passes: trace.stages,
    aiCalls: trace.aiCalls,
    attempts: trace.attempts,
    // The one field the UI must never ignore: true when any pass fell back, so
    // the student is told this is not Medabrain's best thinking and offered a
    // retry, rather than being shown the deterministic slate as if it were.
    degraded: trace.fallbacks > 0,
    // WHY it degraded, in the student's language, plus whether a retry can
    // honestly be offered. Before this the banner said "Medabrain could not be
    // reached" for every cause — a missing API key, a spent daily budget and a
    // genuine outage all produced the same sentence and the same button, and for
    // two of those three the button could not possibly work. See
    // DEGRADED_REASONS at the top of this file.
    ...(trace.fallbacks > 0
      ? { degradedReason: degradedReasonFor(trace.terminal || (trace.thinSelection ? 'thin_selection' : 'unreachable')) }
      : {}),
    // Which passes fell back, so a repair can re-run exactly those rather than
    // rebuilding a year that was mostly fine. See repairRoadmap below.
    failedStages: Object.entries(trace.stages).filter(([, v]) => v !== 'ai').map(([k]) => k),
    // Which vendors answered. A build served wholly or partly by the relief
    // provider (api/_lib/aiProviders.js) is NOT degraded — a different company's
    // model did the thinking, and the roadmap is real. It is recorded because it
    // is true, and because "why did this build take ninety seconds" has an
    // answer worth keeping.
    providers,
    servedByRelief: providers.some((p) => p && p !== 'groq'),
    // The rung each pass had to shrink to, when any did, and how many times the
    // server reported cutting a request. Both are here so a thin roadmap can be
    // explained rather than guessed at.
    rungs: trace.rungs,
    truncations: trace.truncations,
    errors: trace.errors,
    seconds: Math.round((Date.now() - trace.startedAt) / 1000),
  };
  return roadmap;
}

/**
 * Deepen a season that was left as a spine at build time — called when the
 * student reaches it, or when they ask for it. One call, and it never damages
 * the existing roadmap: a failure returns the roadmap unchanged.
 *
 * `trace` is optional and exists for repairRoadmap, which deepens several seasons in one run: a
 * terminal cause established while repairing the first season has to stop the rest, and it can
 * only do that if they share a trace. Called on its own, this still gets a fresh one.
 */
export async function deepenSeason(roadmap, seasonId, { user, portfolioFacts, lane, trace: sharedTrace = null, onStage = () => {} } = {}) {
  const season = (roadmap?.seasons || []).find((s) => s.id === seasonId);
  if (!season) return roadmap;
  const picks = (roadmap.items || []).filter((i) => i.season === seasonId && i.status !== 'skipped');
  if (!picks.length) return roadmap;

  const trace = sharedTrace || createTrace();
  onStage(`Writing the working detail for ${season.label}…`);
  const studentAt = (i) => studentText({
    user, answers: roadmap.intake || {},
    portfolioFacts: portfolioFacts ? squeeze(portfolioFacts, Math.round(28000 * rung(i).digest)) : null,
    gradeStage: roadmap.gradeStage, today: dayKey(),
  });
  const raw = await call((i) => ({
    system: deepenSystem(season, picks.map((p) => ({ ...p, name: p.title })), studentAt(i)),
    user: `Write the working detail for ${season.label}. Return JSON only.`,
    maxTokens: 9000,
    reasoningEffort: 'high',
    lane,
  }), trace, `deepen:${seasonId}`);
  if (!raw) return roadmap;

  const byId = Object.fromEntries(arr(raw.items).map((i) => [i?.id, i]));
  const items = (roadmap.items || []).map((i) => {
    const d = i.catalogId ? byId[i.catalogId] : null;
    if (!d) return i;
    const steps = arr(d.steps).map((s) => str(s, 300)).filter(Boolean).slice(0, 8);
    return {
      ...i,
      howThisHelps: str(d.howThisHelps, 500) || i.howThisHelps,
      steps: steps.length >= 2 ? steps : i.steps,
      watchOut: str(d.watchOut, 300) || i.watchOut,
      timeCost: str(d.timeCost, 80) || i.timeCost,
    };
  });
  return {
    ...roadmap,
    items,
    seasons: roadmap.seasons.map((s) => (s.id === seasonId
      ? { ...s, advice: str(raw.seasonAdvice, 700) || s.advice, deepened: true }
      : s)),
    updatedAt: Date.now(),
  };
}

/**
 * Which season should be deepened next, if any — the first not-yet-deepened
 * season the student is within eight weeks of. The Roadmap tab checks this on
 * mount, so the year keeps writing itself forward instead of thinning out.
 */
export function seasonNeedingDepth(roadmap, today = dayKey()) {
  return (roadmap?.seasons || []).find((s) => !s.deepened && daysBetween(today, s.startDate) <= 56) || null;
}

// ── Repairing a degraded roadmap, instead of rebuilding a good one ───────────
//
// "Rebuild it properly" used to mean one thing: throw the whole year away and
// run all five passes again. That is the right answer when the year's THINKING
// failed — a strategy or a slate assembled by rule is not worth patching around
// — and it is a bad answer when it did not. A roadmap whose strategy and slate
// came back beautifully and whose second season's working detail timed out is a
// roadmap that is ninety percent Medabrain's own work, and rebuilding it spends
// five calls to re-derive four things that were already right, re-rolls the
// student's whole item list under them, and can perfectly well come back worse.
//
// So the retry is split by what actually failed:
//
//   · strategy or select fell back  → the year's argument is not real. Full
//     rebuild; there is nothing here worth keeping.
//   · only deepen and/or review fell back → repair. Re-run exactly those passes
//     against the roadmap that already exists, keep every item, every pinned
//     date and every ticked step, and change nothing that worked.
//
// `roadmapNeedsFullRebuild` is the predicate, exported so the UI can label the
// button honestly rather than guessing.

/** The two passes whose failure makes the year itself untrustworthy. */
const STRUCTURAL_STAGES = new Set(['strategy', 'select']);

/**
 * True when a degraded roadmap's failure was structural, and a repair would be
 * patching detail onto an argument that was never written.
 */
export function roadmapNeedsFullRebuild(roadmap) {
  const failed = roadmap?.generation?.failedStages;
  // No record of which passes failed — an older roadmap, built before this was
  // tracked. Rebuild: it is the answer that is never wrong, only sometimes
  // wasteful, and guessing the other way would silently leave a bad year in place.
  if (!Array.isArray(failed) || !failed.length) return true;
  return failed.some((s) => STRUCTURAL_STAGES.has(s));
}

/**
 * Re-run only the passes that fell back, onto the roadmap already on screen.
 *
 * Always resolves to a roadmap — the existing one, unchanged, if nothing could
 * be repaired. The returned `generation` is restamped so the student can see
 * that an attempt genuinely happened and what it achieved, which is the whole
 * difference between a retry button that works and a retry button that is
 * reported as doing nothing.
 *
 * @returns {{ roadmap: object, repaired: string[], stillDegraded: boolean }}
 */
export async function repairRoadmap(roadmap, {
  user, portfolioFacts = null, lane = null, onStage = () => {},
} = {}) {
  const failed = (roadmap?.generation?.failedStages || []).filter((s) => !STRUCTURAL_STAGES.has(s));
  if (!roadmap || !failed.length) {
    return { roadmap, repaired: [], stillDegraded: !!roadmap?.generation?.degraded };
  }

  const trace = createTrace();

  // The same preflight the initial build runs, and it matters more here than there. This is the
  // "Rebuild it properly" button, and the failure it was reported for was pressing it against a
  // cause a rebuild cannot touch: a minute and a half of nothing, then the same banner. Seeding
  // the terminal code makes the button answer honestly and instantly instead. Fails open.
  const gate = await preflight({ lane });
  if (gate) {
    trace.terminal = gate.code;
    noteError(trace, 'preflight', gate.error || gate.code);
  }

  let out = roadmap;
  const repaired = [];

  // The seasons whose working detail never got written.
  for (const stage of failed) {
    if (!stage.startsWith('deepen:')) continue;
    const seasonId = stage.slice('deepen:'.length);
    const season = (out.seasons || []).find((s) => s.id === seasonId);
    if (!season) continue;
    onStage(`Writing the working detail for ${season.label}…`);
    const next = await deepenSeason(out, seasonId, { user, portfolioFacts, lane, trace });
    // deepenSeason returns the SAME object on failure, which is what makes this
    // identity check a truthful test of whether anything was actually repaired.
    if (next !== out) { out = next; repaired.push(stage); }
  }

  // The honest read-back. Cheap, and the most distinctive thing the tab
  // produces, so it is worth one call of its own to recover.
  if (failed.includes('review') && out.items?.length) {
    onStage('Reading it back and being honest about it…');
    const balance = out.balance || validateSlate(out);
    const raw = await call({
      system: reviewSystem(out, balance),
      user: 'Review this roadmap. Return JSON only.',
      maxTokens: 2000,
      reasoningEffort: 'medium',
      lane,
    }, trace, 'review');
    if (raw) {
      out = {
        ...out,
        review: {
          verdict: str(raw.verdict, 700),
          bet: str(raw.bet, 300),
          ifOnlyOneThing: str(raw.ifOnlyOneThing, 300),
          notCovered: arr(raw.notCovered).slice(0, 4).map((n) => str(n, 300)).filter(Boolean),
        },
      };
      repaired.push('review');
    }
  }

  const stillFailed = failed.filter((s) => !repaired.includes(s));
  const stillDegraded = stillFailed.length > 0;
  const gen = roadmap.generation || {};
  const providers = [...new Set([...(gen.providers || []), ...Object.keys(trace.providers)])];

  return {
    roadmap: {
      ...out,
      updatedAt: Date.now(),
      generation: {
        ...gen,
        // `at` is deliberately NOT restamped — the roadmap was built when it was
        // built, and a repair is not a rebuild. `repairedAt` is its own fact.
        repairedAt: Date.now(),
        repairs: (gen.repairs || 0) + 1,
        aiCalls: (gen.aiCalls || 0) + trace.aiCalls,
        providers,
        degraded: stillDegraded,
        failedStages: stillFailed,
        ...(stillDegraded
          ? { degradedReason: degradedReasonFor(trace.terminal || 'unreachable') }
          : { degradedReason: null }),
        errors: [...(gen.errors || []), ...trace.errors].slice(-16),
      },
    },
    repaired,
    stillDegraded,
  };
}

export { buildCandidateSlate, shortlistForPrompt };
