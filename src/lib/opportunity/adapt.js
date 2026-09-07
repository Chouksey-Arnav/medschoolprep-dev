// ─────────────────────────────────────────────────────────────────────────────
// Adapters — the three catalogs into one record shape.
//
// Kept in its own file rather than inside schema.js because it is the only part
// of the opportunity layer that knows the older files' field names, and that
// knowledge should be replaceable without touching the record contract itself.
//
// ── The rule that shapes every function here ────────────────────────────────
// An adapter may RESTATE what a source says. It may never IMPROVE on it. So:
//
//   • src/data/opportunities.js carries no URLs by design (chapter/state
//     programs vary and a hardcoded link rots). The adapter does not go and
//     find one — the record simply has `url: null` and the card says the link
//     is not listed.
//   • That same file carries no dates. The record gets no dates. It does NOT
//     get a date borrowed from a same-named structured program unless the two
//     genuinely share an id, which is the contract those two files already
//     have with each other.
//   • Potential scores (leadership/impact/distinction/skill) are DERIVED, and
//     derived is not the same as known — see `derivedPotential` below, which
//     reads only from fields the source actually states and is deliberately
//     coarse (0-3), because a 0-100 number would imply a precision nobody has.
// ─────────────────────────────────────────────────────────────────────────────

import { normalizeRecord, safeUrl } from './schema.js';

/** Browsable-catalog `type` → the unified `category`. */
const TYPE_TO_CATEGORY = {
  Competition: 'competition',
  Research: 'research',
  Scholarship: 'scholarship',
  Volunteering: 'volunteering',
  Organization: 'club',
  Academic: 'course',
  Program: 'summer',
};

/** Structured-layer `category` ids that already match ours, plus the ones that don't. */
const PROGRAM_CATEGORY_MAP = {
  research: 'research',
  competition: 'competition',
  clinical: 'clinical',
  credential: 'course',
  summer: 'summer',
  service: 'volunteering',
  leadership: 'leadership',
  writing: 'writing',
  scholarship: 'scholarship',
};

/**
 * The catalog's `type` is a seven-value vocabulary from 2023 and it cannot reach half the
 * categories a student now filters by: everything hands-on is "Program", which collapses a
 * hospital volunteer shift, an EMT course, a county internship and a residential summer academy
 * into one chip. This reads the entry's own words to recover the distinction.
 *
 * Deliberately conservative and deliberately ordered: the first rule that matches wins, and the
 * rules run most-specific first, so "advocacy" beats "leadership" for a policy fellowship and
 * "internship" beats "summer" for a paid summer internship. A no-match keeps the coarse mapping
 * rather than guessing — an entry filed under a category it does not belong to is worse than one
 * filed under a broad one.
 */
const CATEGORY_RULES = [
  // Shape of the activity first — what a student would actually be doing.
  ['grant', /\bgrant\b|micro-?grant|seed funding/],
  ['internship', /internship|\bintern\b|apprenticeship|paid position/],
  ['research', /research|laborator|\blab\b|mentored|principal investigator/],
  ['clinical', /shadow|clinical|patient care|hospital volunteer|bedside|hospice|scribe|\bems\b|\bemt\b|nursing assistant/],
  ['course', /certif|\bcourse\b|training|workshop|dual[- ]enrollment|\bcte\b/],
  ['project', /independent project|passion project|self[- ]directed|capstone/],
  ['leadership', /officer|president|founder|chapter lead|leadership program|student council/],
  ['club', /\bclub\b|chapter|membership|student organization|society/],
  ['nonprofit', /nonprofit|community health|public health|food bank|shelter|underserved|501\(c\)/],
  ['volunteering', /volunteer|service hours|community service/],
  // Then topic, for the entries whose shape is generic but whose subject is not.
  ['healthtech', /health tech|digital health|bioinformatic|medical device|health app|telehealth|informatics/],
  ['advocacy', /advocacy|\bpolicy\b|legislat|civic|lobby|health equity/],
  ['entrepreneurship', /entrepreneur|startup|business plan|pitch|venture/],
  ['speaking', /public speaking|debate|oratory|speech contest/],
  ['writing', /essay contest|writing contest|\bjournal\b|publication|op-?ed|science communication/],
  ['summer', /summer (?:program|academy|institute|camp)|residential|pre-?college/],
];

/**
 * Categories the coarse `type` mapping already gets right, and which refinement must not override.
 *
 * A competition is a competition whatever its subject is: an essay contest judged by geneticists
 * is filed under "competition", not under "writing", because that is the shape of the commitment
 * a student is taking on and the shape is what they are choosing between. Same for scholarships
 * (money) and research (a mentor and a question). Refinement exists for the ambiguous half of the
 * vocabulary — "Program", "Organization", "Academic" — where the type says almost nothing.
 */
const UNAMBIGUOUS_TYPES = new Set(['competition', 'scholarship', 'research']);

/** The finest category the entry's own words support, or the coarse mapping if none do. */
export function refineCategory(coarse, text) {
  if (UNAMBIGUOUS_TYPES.has(coarse)) return coarse;
  const hay = lower(text);
  for (const [id, re] of CATEGORY_RULES) if (re.test(hay)) return id;
  return coarse;
}

/** Browsable-catalog `cost` → prose the card prints verbatim. */
const COST_TEXT = {
  'Free': 'Free',
  'Free + stipend': 'Free — and it pays a stipend',
  'Paid role': 'Paid — this one pays you',
  'Entry fee': 'There is an entry fee',
  'Tuition (aid available)': 'Tuition, with aid available',
  'Varies': 'Cost varies — check the official page',
};

/** `effort` in the browsable catalog is a selectivity claim, and a soft one. */
const EFFORT_TO_SELECTIVITY = { Open: 'open', Competitive: 'competitive', Elite: 'elite' };

const lower = (v) => String(v || '').toLowerCase();

/**
 * Coarse 0-3 potential scores, read only off what the source states.
 *
 * These drive ranking, and ranking is arguable, so the derivation is kept in
 * one readable place rather than spread through the scorer. Every rule below is
 * a claim you could disagree with by reading it — which is the point.
 */
export function derivedPotential({ category, type, tags = [], text = '', selectivity = null, level = null }) {
  const hay = `${lower(text)} ${tags.join(' ')}`;
  const has = (...words) => words.some((w) => hay.includes(w));

  // Leadership: does the student end up responsible for other people or for a thing existing?
  let leadership = 0;
  if (category === 'leadership' || category === 'club') leadership = 3;
  else if (category === 'nonprofit' || category === 'entrepreneurship' || category === 'project') leadership = 2;
  else if (has('officer', 'president', 'found', 'organize', 'lead ', 'captain', 'chapter', 'mentor', 'teach', 'peer leader')) leadership = 2;
  else if (category === 'volunteering' || category === 'advocacy') leadership = 1;

  // Impact: does anyone outside the student measurably benefit?
  let impact = 0;
  if (category === 'volunteering' || category === 'nonprofit' || category === 'advocacy') impact = 3;
  else if (category === 'clinical' || category === 'leadership') impact = 2;
  else if (has('community', 'patient', 'underserved', 'access', 'public health', 'outreach', 'equity', 'food insecur', 'shelter')) impact = 2;
  else if (category === 'research' || category === 'healthtech') impact = 1;

  // Distinction: could this produce a named, dated thing on an application?
  let distinction = 0;
  if (category === 'competition' || category === 'scholarship' || category === 'grant') distinction = 3;
  else if (category === 'research' || category === 'writing') distinction = 2;
  else if (selectivity === 'elite') distinction = 3;
  else if (selectivity === 'competitive') distinction = 2;
  else if (category === 'summer') distinction = 1;
  if (level === 'International' || level === 'National') distinction = Math.min(3, distinction + 1);

  // Skill-building: does the student come out able to do something they could not before?
  let skill = 1;
  if (category === 'course' || category === 'research' || category === 'healthtech' || category === 'clinical') skill = 3;
  else if (category === 'internship' || category === 'project' || category === 'summer' || category === 'writing') skill = 2;
  else if (has('certif', 'training', 'workshop', 'coding', 'lab', 'technique', 'cpr', 'emt')) skill = Math.max(skill, 2);

  return { leadershipPotential: leadership, impactPotential: impact, distinctionPotential: distinction, skillBuilding: skill };
}

/**
 * What kind of application activity this could realistically become.
 *
 * Deliberately conservative at the top end: `major` requires either sustained
 * time or a genuinely deep format. A one-day outreach event is an exploration
 * however prestigious the host is, and telling a student otherwise is how a
 * résumé fills up with things that read as tourism.
 */
export function derivedPortfolioRole({ category, timeCommitment = '', text = '', selectivity = null }) {
  const hay = `${lower(timeCommitment)} ${lower(text)}`;
  const sustained = /year|ongoing|weekly|semester|month|season|multi-week|summer|\b\d+\s*weeks?\b/.test(hay);
  const oneOff = /one[- ]day|single day|weekend|one[- ]off|two[- ]day|half[- ]day/.test(hay);

  if (oneOff) return 'exploration';
  if (category === 'club' || category === 'leadership' || category === 'nonprofit' || category === 'entrepreneurship') return 'major';
  if (category === 'research' || category === 'internship' || category === 'project') return sustained ? 'major' : 'supporting';
  if (category === 'competition') return selectivity === 'elite' || sustained ? 'major' : 'supporting';
  if (category === 'course' || category === 'clinical') return sustained ? 'supporting' : 'exploration';
  if (category === 'volunteering' || category === 'advocacy' || category === 'writing') return sustained ? 'major' : 'supporting';
  if (category === 'summer') return 'supporting';
  if (category === 'scholarship' || category === 'grant') return 'supporting';
  return 'exploration';
}

/**
 * A browsable-catalog entry (src/data/opportunities.js) as a record.
 *
 * `verifiedAt` is deliberately null: those entries are curated by a human, but
 * the file carries no per-entry check date, and inventing one here would make
 * every one of them read as freshly verified forever. Null means the card says
 * "curated reference entry" rather than claiming a date nobody recorded.
 */
export function fromCatalogEntry(entry) {
  if (!entry?.id) return null;
  const text = `${entry.name} ${entry.org} ${entry.desc} ${entry.eligibility} ${(entry.tags || []).join(' ')}`;
  const category = refineCategory(TYPE_TO_CATEGORY[entry.type] || null, text);
  const selectivity = EFFORT_TO_SELECTIVITY[entry.effort] || null;
  const timeCommitment = entry.season ? `Runs: ${entry.season}` : null;
  return normalizeRecord({
    id: entry.id,
    name: entry.name,
    org: entry.org,
    category,
    type: entry.type,
    description: entry.desc,
    url: null,
    eligibility: entry.eligibility,
    grades: entry.grades || [],
    format: entry.format || null,
    costText: COST_TEXT[entry.cost] || null,
    timeCommitment,
    tags: entry.tags || [],
    pathways: entry.pathways || [],
    selectivity,
    // `effort` is the catalog's own editorial read, not a published acceptance
    // rate, so it travels as 'inferred' and the UI must never print a number.
    selectivityConfidence: selectivity ? 'inferred' : null,
    ...derivedPotential({ category, type: entry.type, tags: entry.tags, text, selectivity, level: entry.level }),
    portfolioRole: derivedPortfolioRole({ category, timeCommitment: timeCommitment || '', text, selectivity }),
    sourceKind: 'catalog',
    sourceLabel: 'MedSchoolPrep curated catalog',
    verificationState: 'verified',
    verifiedAt: null,
    status: null,
  });
}

/**
 * A structured program (src/data/opportunityPrograms.js) as a record. This is
 * the richest source we have: real dates, real gates, a link, and a check date.
 */
export function fromProgram(program) {
  if (!program?.id) return null;
  const text = `${program.name} ${program.org} ${program.why || ''} ${program.eligibility || ''}`;
  // The structured layer DOES declare its own category, and where it does that declaration is a
  // human's and wins. Refinement only fills the gap where it declared none.
  const category = PROGRAM_CATEGORY_MAP[program.category] || refineCategory(TYPE_TO_CATEGORY[program.type] || null, text);
  const d = program.deadline || null;
  const timeCommitment = program.starts?.note || null;
  return normalizeRecord({
    id: program.id,
    name: program.name,
    org: program.org,
    category,
    type: program.type,
    description: program.why || program.eligibility || null,
    url: safeUrl(program.url),
    eligibility: program.eligibility,
    grades: gradesFromRange(program.minGrade, program.maxGrade),
    minAge: program.minAge,
    maxAge: program.maxAge,
    states: program.states || null,
    citizenship: program.citizenship || null,
    deadlineText: d?.note || null,
    deadlineMonth: d?.month ?? null,
    deadlinePrecision: d?.precision || null,
    startsText: program.starts?.note || null,
    // A month-shaped deadline with a stated precision IS the recurrence claim
    // this codebase already makes about these rows — see nextDeadline() in
    // opportunityEligibility.js, which rolls them to next year unprompted.
    recurrence: d?.month != null && d.precision !== 'varies'
      ? { cadence: 'annual', note: d.note || null }
      : (d?.precision === 'rolling' ? { cadence: 'rolling', note: d.note || null } : null),
    format: program.remote === true ? 'Virtual' : program.remote === false ? 'In person' : null,
    location: program.location || null,
    costText: program.cost?.note || null,
    costUsd: program.cost?.usd ?? null,
    aid: aidLine(program),
    timeCommitment,
    tags: [],
    pathways: program.pathways || [],
    selectivity: program.selectivity || null,
    selectivityConfidence: program.selectivity ? 'reported' : null,
    ...derivedPotential({ category, type: program.type, tags: [], text, selectivity: program.selectivity, level: null }),
    portfolioRole: derivedPortfolioRole({ category, timeCommitment: timeCommitment || '', text, selectivity: program.selectivity }),
    tier: program.tier || null,
    sourceKind: 'program',
    sourceLabel: program.org || 'Official program page',
    verificationState: 'verified',
    verifiedAt: program.verified || null,
    status: d?.precision === 'rolling' ? 'open' : null,
  });
}

/** ['9','10'] from minGrade/maxGrade, or [] when the program states no bound. */
function gradesFromRange(min, max) {
  if (min == null && max == null) return [];
  const lo = min == null ? 9 : Math.max(9, min);
  const hi = max == null ? 12 : Math.min(12, max);
  const out = [];
  for (let g = lo; g <= hi; g += 1) out.push(String(g));
  return out;
}

/** The aid sentence, only where a program actually publishes one. */
function aidLine(program) {
  const bits = [];
  if (program.feeWaiver === true) bits.push('Fee waivers are available');
  if (program.stipend === true) bits.push('Participants are paid a stipend');
  if (program.stipend === 'need_based') bits.push('Need-based stipends are available');
  if (program.cost?.model === 'free') bits.push('No cost to participate');
  return bits.length ? `${bits.join('. ')}.` : null;
}

/**
 * A stored `discovered_opportunities` row as a record.
 *
 * The row's `payload` is a record this same file wrote, so the adapter is
 * mostly a re-normalize — but it re-stamps provenance from the ROW rather than
 * trusting the payload, because the payload is the part an AI wrote and the row
 * columns are the part the app controls.
 */
export function fromDiscoveredRow(row) {
  if (!row) return null;
  const payload = (row.payload && typeof row.payload === 'object') ? row.payload : {};
  return normalizeRecord({
    ...payload,
    id: row.slug || payload.id || row.id,
    name: row.name || payload.name,
    org: row.org || payload.org,
    url: safeUrl(row.url || payload.url),
    sourceKind: 'ai_discovered',
    sourceLabel: row.source_label || 'Proposed by Medabrain from its own knowledge',
    verificationState: row.verification_state || 'needs_verification',
    verifiedAt: row.verified_at || null,
    discoveredAt: row.created_at || null,
    archivedAt: row.archived_at || null,
    // The database row is the authority on this, never the model's own claim.
    rowId: row.id,
  });
}

/** All three sources, adapted and concatenated. Catalog first — it is the widest. */
export function buildRecordPool({ opportunities = [], programs = [], discovered = [] } = {}) {
  const out = [];
  const seen = new Set();
  const push = (rec) => {
    if (!rec?.id || seen.has(rec.id)) return;
    seen.add(rec.id);
    out.push(rec);
  };
  // Programs first: where an id exists in both files the structured row is
  // strictly better (dates, link, check date), and the two files share ids by
  // contract precisely so this de-duplication is possible.
  for (const p of programs) push(fromProgram(p));
  for (const o of opportunities) push(fromCatalogEntry(o));
  for (const d of discovered) push(fromDiscoveredRow(d));
  return out;
}
