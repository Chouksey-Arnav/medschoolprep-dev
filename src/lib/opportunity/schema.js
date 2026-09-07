// ─────────────────────────────────────────────────────────────────────────────
// The unified opportunity record, and the honest states it can be in.
//
// Before this module there were three different shapes of "an opportunity" in
// the app and no shared vocabulary between them:
//
//   • src/data/opportunities.js          — ~220 browsable entries, deliberately
//                                          no URLs and no dates, because most
//                                          vary by chapter/hospital/state.
//   • src/data/opportunityPrograms.js    — the structured layer: real dates,
//                                          real age gates, real money, a link,
//                                          and the day a human last checked.
//   • (new) discovered_opportunities     — records the AI found for one student
//                                          which NOBODY has checked yet.
//
// Three shapes is survivable. Three shapes with no shared idea of *how much we
// know* is not — because the moment an AI-discovered record and a
// human-verified one render in the same list, the student has no way to tell
// which sentence on the screen someone stood behind. That is the failure this
// file exists to make structurally impossible: every record that reaches a card
// carries a `dataState`, and the card is required to render it.
//
// ── The six data states ──────────────────────────────────────────────────────
//   verified        A human checked this against the organization's own page,
//                   recently enough that it is still worth believing.
//   ai_discovered   Medabrain proposed it from its own knowledge. Real-looking,
//                   possibly real, NOT checked. Never presented as fact.
//   stale           Was verified, but long enough ago that a deadline or a fee
//                   could have moved under us. Still useful; no longer current.
//   incomplete      Missing something a student needs in order to act — no
//                   deadline, no eligibility, no cost, no link.
//   archived        The cycle closed and there is no evidence it recurs.
//   upcoming_cycle  The deadline passed AND the program reliably recurs, so the
//                   honest presentation is "next cycle", not "expired".
//
// The ordering above is deliberate and is the order `dataStateFor` tests in:
// archived beats stale beats incomplete, because "this is over" is a more
// important sentence than "this is old", which is more important than "this is
// thin".
//
// ── The rules every function here obeys ──────────────────────────────────────
//  1. ABSENCE IS NEVER A VALUE. A missing deadline is `null`, and `null` renders
//     as "not listed", never as "rolling" and never as a guess.
//  2. A RECORD IS NEVER PROMOTED BY THIS FILE. Nothing here can turn an
//     ai_discovered record into a verified one; only a human verification pass
//     writing `verified_at` + `verification_state` can (see store.js).
//  3. NEXT-CYCLE TIMING IS ONLY STATED WHEN IT IS SUPPORTED. `expectedNextCycle`
//     returns null unless the record carries a recurrence we actually recorded.
// ─────────────────────────────────────────────────────────────────────────────

const DAY = 86400000;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

const startOfDay = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const arr = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);

/**
 * How long a verified check stays believable.
 *
 * 180 days is not arbitrary: the programs in this catalog publish next year's
 * deadline somewhere between six and nine months before it, so a check older
 * than half a year has had a full publication cycle to go wrong underneath it.
 */
export const STALE_AFTER_DAYS = 180;
/** Past this, we stop calling it stale and start calling it unusable as a date source. */
export const VERY_STALE_AFTER_DAYS = 400;

/** Live-ness of the opportunity itself, as opposed to the quality of our data about it. */
export const OPPORTUNITY_STATUSES = [
  { id: 'open', label: 'Open now', tone: 'good', blurb: 'Applications are open — you can act on this today.' },
  { id: 'upcoming', label: 'Opens later', tone: 'info', blurb: 'Not open yet. Worth lining up now so you are ready.' },
  { id: 'recurring', label: 'Runs every year', tone: 'info', blurb: 'A recurring program — the date moves, the program does not.' },
  { id: 'expired', label: 'This cycle has closed', tone: 'muted', blurb: 'The deadline has passed for this cycle.' },
  { id: 'unclear', label: 'Timing unclear', tone: 'warn', blurb: 'We do not have a reliable date for this — check the official page.' },
];
export const STATUS_BY_ID = Object.fromEntries(OPPORTUNITY_STATUSES.map((s) => [s.id, s]));

/**
 * What a human has done about this record. Distinct from `dataState`, which is
 * computed: this is the stored fact, and it is the ONLY thing that can make a
 * record verified.
 */
export const VERIFICATION_STATES = [
  { id: 'verified', label: 'Verified', tone: 'good', blurb: 'Checked against the organization\'s own page.' },
  { id: 'needs_verification', label: 'Needs verification', tone: 'warn', blurb: 'Found by Medabrain. Nobody has checked it yet.' },
  { id: 'in_review', label: 'Being checked', tone: 'info', blurb: 'Queued for a human check.' },
  { id: 'rejected', label: 'Could not confirm', tone: 'bad', blurb: 'We looked and could not confirm this is real or current.' },
];
export const VERIFICATION_BY_ID = Object.fromEntries(VERIFICATION_STATES.map((v) => [v.id, v]));

/**
 * The six data states, in the order dataStateFor() tests them.
 *
 * `showAsActive` is the load-bearing field: a card may only render a record as
 * something to go do right now when it is true. Everything else has to carry
 * its label before its name.
 */
export const DATA_STATES = [
  { id: 'archived', label: 'Archived', tone: 'muted', showAsActive: false,
    blurb: 'This cycle closed and we have no evidence it comes back.' },
  { id: 'upcoming_cycle', label: 'Next cycle', tone: 'info', showAsActive: false,
    blurb: 'This year\'s deadline has passed, but the program runs again.' },
  { id: 'ai_discovered', label: 'AI-discovered — needs verification', tone: 'warn', showAsActive: true,
    blurb: 'Medabrain found this from its own knowledge. Treat every detail as a lead to confirm, not a fact.' },
  { id: 'stale', label: 'Last checked a while ago', tone: 'warn', showAsActive: true,
    blurb: 'We verified this once, but not recently enough to promise the details are still current.' },
  { id: 'incomplete', label: 'Details missing', tone: 'warn', showAsActive: true,
    blurb: 'We are missing something you need in order to act on this.' },
  { id: 'verified', label: 'Verified', tone: 'good', showAsActive: true,
    blurb: 'Checked against the organization\'s own page.' },
];
export const DATA_STATE_BY_ID = Object.fromEntries(DATA_STATES.map((d) => [d.id, d]));

/** Data states that must never be rendered as an active, do-this-now opportunity. */
export const INACTIVE_DATA_STATES = new Set(DATA_STATES.filter((d) => !d.showAsActive).map((d) => d.id));

/**
 * The fields a student needs before they can act. Missing any of these makes a
 * record `incomplete` — which is a label on the card, not a reason to hide it:
 * a real program with no published deadline is still a real program.
 */
export const ESSENTIAL_FIELDS = [
  { key: 'name', label: 'name' },
  { key: 'org', label: 'host organization' },
  { key: 'description', label: 'what it actually is' },
  { key: 'eligibility', label: 'who can apply' },
];
/** Fields whose absence is worth naming on the card but does not by itself make a record incomplete. */
export const PRACTICAL_FIELDS = [
  { key: 'url', label: 'official link' },
  { key: 'deadlineText', label: 'deadline' },
  { key: 'costText', label: 'cost' },
  { key: 'timeCommitment', label: 'time commitment' },
  { key: 'format', label: 'format' },
];

/** The categories a record can carry. Superset of the two catalogs' vocabularies. */
export const OPPORTUNITY_CATEGORIES = [
  { id: 'competition', label: 'Competition' },
  { id: 'research', label: 'Research' },
  { id: 'internship', label: 'Internship' },
  { id: 'clinical', label: 'Clinical / career exploration' },
  { id: 'summer', label: 'Summer program' },
  { id: 'scholarship', label: 'Scholarship' },
  { id: 'volunteering', label: 'Volunteer role' },
  { id: 'nonprofit', label: 'Nonprofit / community / public health' },
  { id: 'leadership', label: 'Leadership' },
  { id: 'club', label: 'Club / officer pathway' },
  { id: 'project', label: 'Independent project' },
  { id: 'grant', label: 'Grant' },
  { id: 'course', label: 'Course / certification / workshop' },
  { id: 'healthtech', label: 'Health tech' },
  { id: 'advocacy', label: 'Advocacy & policy' },
  { id: 'speaking', label: 'Speaking' },
  { id: 'writing', label: 'Writing & publication' },
  { id: 'entrepreneurship', label: 'Entrepreneurship' },
  { id: 'interest', label: 'Personal interest' },
];
export const CATEGORY_BY_ID = Object.fromEntries(OPPORTUNITY_CATEGORIES.map((c) => [c.id, c]));

/**
 * How big a thing this could become on an application.
 *
 * Named because the difference matters more than any prestige number: a
 * two-hour workshop and a two-year research project are both worth doing and
 * are not the same kind of commitment, and a student deciding where their
 * limited hours go is owed that distinction out loud.
 */
export const PORTFOLIO_ROLES = [
  { id: 'major', label: 'Could become a major activity', blurb: 'Sustained, deep, and the kind of thing an application can be built around.' },
  { id: 'supporting', label: 'Supporting activity', blurb: 'Real substance that strengthens a story you are already telling.' },
  { id: 'exploration', label: 'Exploration', blurb: 'A low-cost way to find out whether you like this before committing.' },
];
export const ROLE_BY_ID = Object.fromEntries(PORTFOLIO_ROLES.map((r) => [r.id, r]));

// ── The record ───────────────────────────────────────────────────────────────

/**
 * Every field a card may render, with `null` everywhere we do not know.
 *
 * Deliberately flat and JSON-safe: the same object is written to
 * `discovered_opportunities.payload`, handed to the ranker, and rendered.
 */
export const EMPTY_RECORD = Object.freeze({
  id: null,
  name: null,
  org: null,
  category: null,
  type: null,                 // the browsable catalog's vocabulary, kept for filters
  description: null,
  url: null,
  // Eligibility
  eligibility: null,          // prose
  grades: [],                 // ['9','10','11','12']
  minAge: null,
  maxAge: null,
  states: null,               // null = national; [] is NOT the same and is normalized to null
  prerequisites: null,
  citizenship: null,
  // Timing
  deadlineText: null,
  deadlineIso: null,
  deadlineMonth: null,
  deadlinePrecision: null,    // exact | approx | window | rolling | varies
  startsText: null,
  endsText: null,
  recurrence: null,           // { cadence: 'annual'|'semiannual'|'rolling', note }
  status: null,               // OPPORTUNITY_STATUSES id
  // Practicalities
  format: null,               // In person | Virtual | Hybrid | Varies
  location: null,
  travel: null,               // prose: what getting there actually involves
  costText: null,
  costUsd: null,
  aid: null,                  // prose: fee waivers / need-based support
  timeCommitment: null,
  applicationRequirements: [],
  // Signals
  tags: [],
  pathways: [],
  selectivity: null,          // 'open' | 'competitive' | 'elite' — only when reliable
  selectivityConfidence: null,// 'reported' | 'inferred' | null
  leadershipPotential: null,  // 0-3
  impactPotential: null,      // 0-3
  distinctionPotential: null, // 0-3
  skillBuilding: null,        // 0-3
  portfolioRole: null,        // PORTFOLIO_ROLES id
  tier: null,
  // Provenance
  sourceKind: 'catalog',      // 'catalog' | 'program' | 'ai_discovered' | 'student'
  sourceLabel: null,
  verificationState: 'verified',
  verifiedAt: null,           // ISO date a human last checked
  discoveredAt: null,
  archivedAt: null,
});

// Number(null) is 0 and Number('') is 0, so a bare Number.isFinite() check
// silently turns "no maximum age" into "maximum age zero" — which blocked every
// program in the catalog the first time this shipped. Absent stays absent.
const numOrNull = (v) => {
  if (v == null || v === '' || typeof v === 'boolean') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const scoreOrNull = (v) => {
  const n = numOrNull(v);
  if (n == null) return null;
  return Math.max(0, Math.min(3, Math.round(n)));
};

/** Normalize any partial record into the full shape, dropping anything unrecognized. */
export function normalizeRecord(raw = {}) {
  const states = arr(raw.states).map((s) => String(s).toUpperCase()).filter((s) => /^[A-Z]{2}$/.test(s));
  return {
    ...EMPTY_RECORD,
    ...raw,
    id: str(raw.id) || null,
    name: str(raw.name) || null,
    org: str(raw.org) || null,
    category: CATEGORY_BY_ID[raw.category] ? raw.category : null,
    type: str(raw.type) || null,
    description: str(raw.description) || null,
    url: safeUrl(raw.url),
    eligibility: str(raw.eligibility) || null,
    grades: arr(raw.grades).map(String).filter((g) => ['9', '10', '11', '12'].includes(g)),
    minAge: numOrNull(raw.minAge),
    maxAge: numOrNull(raw.maxAge),
    // An empty array would mean "restricted to no states", which is never what
    // anyone means. National is null, and stays null.
    states: states.length ? states : null,
    prerequisites: str(raw.prerequisites) || null,
    citizenship: str(raw.citizenship) || null,
    deadlineText: str(raw.deadlineText) || null,
    deadlineIso: /^\d{4}-\d{2}-\d{2}$/.test(str(raw.deadlineIso)) ? str(raw.deadlineIso) : null,
    deadlineMonth: numOrNull(raw.deadlineMonth),
    deadlinePrecision: str(raw.deadlinePrecision) || null,
    startsText: str(raw.startsText) || null,
    endsText: str(raw.endsText) || null,
    recurrence: raw.recurrence && typeof raw.recurrence === 'object' ? raw.recurrence : null,
    status: STATUS_BY_ID[raw.status] ? raw.status : null,
    format: str(raw.format) || null,
    location: str(raw.location) || null,
    travel: str(raw.travel) || null,
    costText: str(raw.costText) || null,
    costUsd: numOrNull(raw.costUsd),
    aid: str(raw.aid) || null,
    timeCommitment: str(raw.timeCommitment) || null,
    applicationRequirements: arr(raw.applicationRequirements).map((r) => str(r)).filter(Boolean),
    tags: arr(raw.tags).map((t) => str(t).toLowerCase()).filter(Boolean),
    pathways: arr(raw.pathways).map(String),
    selectivity: ['open', 'competitive', 'elite'].includes(raw.selectivity) ? raw.selectivity : null,
    selectivityConfidence: ['reported', 'inferred'].includes(raw.selectivityConfidence) ? raw.selectivityConfidence : null,
    leadershipPotential: scoreOrNull(raw.leadershipPotential),
    impactPotential: scoreOrNull(raw.impactPotential),
    distinctionPotential: scoreOrNull(raw.distinctionPotential),
    skillBuilding: scoreOrNull(raw.skillBuilding),
    portfolioRole: ROLE_BY_ID[raw.portfolioRole] ? raw.portfolioRole : null,
    tier: str(raw.tier) || null,
    sourceKind: ['catalog', 'program', 'ai_discovered', 'student'].includes(raw.sourceKind) ? raw.sourceKind : 'catalog',
    sourceLabel: str(raw.sourceLabel) || null,
    verificationState: VERIFICATION_BY_ID[raw.verificationState] ? raw.verificationState : 'verified',
    verifiedAt: str(raw.verifiedAt) || null,
    discoveredAt: str(raw.discoveredAt) || null,
    archivedAt: str(raw.archivedAt) || null,
  };
}

/**
 * A URL we are willing to put in front of a student, or null.
 *
 * Deliberately strict. An AI-proposed record is the one place in this app where
 * a link arrives without a human having looked at it, so anything that is not a
 * plain absolute http(s) URL is dropped rather than rendered — a `javascript:`
 * href on a card is a security bug, and a relative one is a broken promise.
 */
export function safeUrl(value) {
  const s = str(value);
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname.includes('.')) return null;
    return u.href;
  } catch { return null; }
}

// ── Completeness ─────────────────────────────────────────────────────────────

/**
 * What is missing, said in the words a student would use.
 *
 * @returns {{ complete, missingEssential[], missingPractical[], score }}
 *          `score` is 0-1 over the two field lists combined, used by the ranker
 *          to prefer a record we can actually describe over one we cannot.
 */
export function completeness(record) {
  const r = record || {};
  const missingEssential = ESSENTIAL_FIELDS.filter((f) => !valuePresent(r[f.key])).map((f) => f.label);
  const missingPractical = PRACTICAL_FIELDS.filter((f) => !valuePresent(r[f.key])).map((f) => f.label);
  const total = ESSENTIAL_FIELDS.length + PRACTICAL_FIELDS.length;
  const have = total - missingEssential.length - missingPractical.length;
  return {
    complete: missingEssential.length === 0,
    missingEssential,
    missingPractical,
    score: total ? have / total : 0,
  };
}

function valuePresent(v) {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  return String(v).trim().length > 0;
}

// ── Recurrence and cycles ────────────────────────────────────────────────────

/**
 * Does this record reliably come back?
 *
 * True ONLY on recorded evidence — an explicit recurrence, a deadline month we
 * stored because the program repeats it, or a status of 'recurring'. An AI
 * record that merely *sounds* annual does not qualify, because "it probably
 * runs again" is exactly the kind of comfortable guess that turns into a
 * student waiting for a cycle that never comes.
 */
export function recurs(record) {
  const r = record || {};
  if (r.recurrence?.cadence && r.recurrence.cadence !== 'once') return true;
  if (r.status === 'recurring') return true;
  // A stored deadline MONTH (as opposed to a one-off date) is how both catalogs
  // encode "this comes round every cycle" — see opportunityPrograms.js.
  if (r.deadlineMonth != null && r.deadlinePrecision && r.deadlinePrecision !== 'varies') return true;
  return false;
}

/**
 * When the next cycle is expected — and null whenever we would be guessing.
 *
 * @returns {{ iso, month, monthLabel, precision, daysOut, supported: true } | null}
 */
export function expectedNextCycle(record, today = new Date()) {
  const r = record || {};
  if (!recurs(r)) return null;
  const month = r.deadlineMonth;
  if (month == null) {
    // We know it recurs but not when. That is a real answer and it is not a date.
    return r.recurrence?.note
      ? { iso: null, month: null, monthLabel: null, precision: 'unknown', daysOut: null, supported: true, note: r.recurrence.note }
      : null;
  }
  const t = startOfDay(today);
  // Day 15 stands in for "some time that month" exactly as
  // opportunityEligibility.nextDeadline does — same reasoning, same number, so
  // the two never disagree about which fortnight a program falls in.
  const day = r.deadlinePrecision === 'exact' && r.deadlineIso
    ? new Date(`${r.deadlineIso}T00:00:00`).getDate()
    : 15;
  let date = new Date(t.getFullYear(), month - 1, day);
  // `rolledToNextYear` is the fact a student browsing in September most needs
  // about a February deadline: the date on the card is next year's, and the
  // useful sentence is "five months away", not "you missed it".
  let rolledToNextYear = false;
  if (date < t) { rolledToNextYear = true; date = new Date(t.getFullYear() + 1, month - 1, day); }
  return {
    iso: iso(date),
    month,
    monthLabel: MONTHS[month - 1],
    precision: r.deadlinePrecision || 'approx',
    daysOut: Math.round((date - t) / DAY),
    rolledToNextYear,
    supported: true,
    note: r.recurrence?.note || null,
  };
}

/** True when the record's own dated deadline is behind us. */
export function deadlinePassed(record, today = new Date()) {
  const r = record || {};
  if (!r.deadlineIso) return false;
  const d = new Date(`${r.deadlineIso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  return d < startOfDay(today);
}

/** Days since a record was last verified, or null when it never was. */
export function daysSinceVerified(record, today = new Date()) {
  const v = record?.verifiedAt;
  if (!v) return null;
  const d = new Date(`${String(v).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((startOfDay(today) - d) / DAY);
}

// ── The verdict ──────────────────────────────────────────────────────────────

/**
 * The single data state a card must render.
 *
 * Order matters and is the order documented at the top of this file. Read it as
 * a sequence of questions, most important first:
 *
 *   Is it over?                      → archived
 *   Is it over but coming back?      → upcoming_cycle
 *   Has anyone checked it?           → ai_discovered
 *   Was that check long ago?         → stale
 *   Can a student act on what we have? → incomplete
 *   Otherwise                        → verified
 *
 * @returns {{ id, label, tone, showAsActive, blurb, detail, nextCycle, ageDays }}
 */
export function dataStateFor(record, today = new Date()) {
  const r = normalizeRecord(record);
  const comp = completeness(r);
  const ageDays = daysSinceVerified(r, today);
  const nextCycle = expectedNextCycle(r, today);
  const passed = deadlinePassed(r, today) || r.status === 'expired';

  const decide = () => {
    if (r.archivedAt || (passed && !recurs(r))) {
      return { id: 'archived', detail: 'The deadline for this cycle has passed and we have no recorded evidence that it runs again.' };
    }
    if (passed && recurs(r)) {
      return {
        id: 'upcoming_cycle',
        detail: nextCycle?.monthLabel
          ? `This year's deadline has passed. Based on the cycle we have on record, the next one is expected around ${nextCycle.monthLabel}${nextCycle.precision === 'exact' ? '' : ' (approximate — confirm on the official page)'}.`
          : 'This year\'s deadline has passed. It runs again, but we do not have reliable timing for the next cycle — check the official page.',
      };
    }
    if (r.verificationState === 'needs_verification' || r.verificationState === 'in_review' || r.sourceKind === 'ai_discovered') {
      return { id: 'ai_discovered', detail: 'Medabrain proposed this from its own knowledge. Nothing here has been checked against the organization, so confirm the deadline, cost and eligibility yourself before you spend time on it.' };
    }
    if (ageDays != null && ageDays > STALE_AFTER_DAYS) {
      return {
        id: 'stale',
        detail: `We last checked this ${Math.round(ageDays / 30)} months ago${ageDays > VERY_STALE_AFTER_DAYS ? ' — long enough that the dates and fees below should be treated as history, not as this cycle' : ''}. The program is real; the details may have moved.`,
      };
    }
    if (!comp.complete) {
      return { id: 'incomplete', detail: `We are missing ${comp.missingEssential.join(', ')} for this one.` };
    }
    // A curated catalog entry carries no per-entry check date by design (see
    // the header of src/data/opportunities.js), so it must not borrow the
    // sentence that belongs to a record a human dated. "Curated, and varies
    // locally" is the true claim about those, and it is a different claim.
    if (ageDays == null) {
      return {
        id: 'verified',
        detail: r.sourceKind === 'catalog'
          ? 'A curated reference entry — the program is real, but the specifics (dates, minimum age, cost) are set locally by each chapter, hospital or state, so confirm them where you would apply.'
          : 'Checked against the organization\'s own page.',
      };
    }
    return { id: 'verified', detail: ageDays <= 0 ? 'Checked today.' : `Checked ${ageDays} day${ageDays === 1 ? '' : 's'} ago against the organization's own page.` };
  };

  const { id, detail } = decide();
  const base = DATA_STATE_BY_ID[id];
  return {
    ...base,
    detail,
    nextCycle,
    ageDays,
    missingEssential: comp.missingEssential,
    missingPractical: comp.missingPractical,
    completenessScore: comp.score,
  };
}

/**
 * The live status of the opportunity itself, computed when the record did not
 * declare one. Returns 'unclear' rather than inventing certainty — a program
 * with no date we can read is genuinely of unclear timing, and saying so is the
 * whole point.
 */
export function statusFor(record, today = new Date()) {
  const r = normalizeRecord(record);
  if (r.status) return r.status;
  if (r.archivedAt) return 'expired';
  if (r.deadlinePrecision === 'rolling') return 'open';
  if (deadlinePassed(r, today)) return recurs(r) ? 'recurring' : 'expired';
  if (r.deadlineIso || r.deadlineMonth != null) return 'open';
  if (recurs(r)) return 'recurring';
  return 'unclear';
}

/**
 * One line a card can always print about how much to trust what it says.
 * Every caller in the app goes through this so the sentence can never drift
 * between two surfaces.
 */
export function reliabilityLine(record, today = new Date()) {
  const state = dataStateFor(record, today);
  return `${state.label} — ${state.detail}`;
}
