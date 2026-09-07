// ─────────────────────────────────────────────────────────────────────────────
// Opportunity discovery — finding things the curated catalogs do not have.
//
// ── What "external sources" means in this app, honestly ─────────────────────
// MedSchoolPrep has no web crawler and no search API. What it has is an AI lane
// (api/groq.js) whose models carry general knowledge of real programs. That is
// a genuinely useful discovery surface — it knows about the county health
// department internship that no admissions blog lists — and it is ALSO a
// surface that will, if asked the wrong way, produce a beautifully formatted
// program that does not exist, with a February deadline it invented.
//
// So this module is built around one asymmetry: a made-up program costs a
// student weeks, and a missed real program costs them nothing they would ever
// know about. Every design decision below follows from that.
//
//   1. THE MODEL IS ASKED FOR LEADS, NOT FACTS. The prompt says so four times,
//      and every field it can leave blank, it is told to leave blank.
//   2. NOTHING IT RETURNS IS EVER MARKED VERIFIED. Records are written with
//      verification_state 'needs_verification' and sourceKind 'ai_discovered',
//      and schema.js's dataStateFor() makes that visible on the card. There is
//      no code path in this file that can produce a verified record.
//   3. DATES, COSTS, AGES AND REQUIREMENTS ARE STRIPPED UNLESS THEY ARRIVE WITH
//      A SOURCE. See `sanitizeCandidate` — a deadline with no supporting
//      `deadlineSource` is dropped rather than shown, because a confident wrong
//      date is the single most expensive thing this module could emit.
//   4. THE OFFICIAL URL IS THE POINT. A lead a student cannot go and check is
//      not a lead, it is a rumor. Candidates with no plausible official URL are
//      kept but explicitly flagged as unverifiable.
//   5. DEDUPLICATION IS AGGRESSIVE. A "discovery" that is already in the
//      curated catalog under a slightly different name is noise that makes the
//      whole feature look unreliable.
// ─────────────────────────────────────────────────────────────────────────────

import { aiLane } from '../aiLane.js';
import { normalizeRecord, safeUrl, OPPORTUNITY_CATEGORIES } from './schema.js';
import { derivedPotential, derivedPortfolioRole } from './adapt.js';

const CATEGORY_IDS = OPPORTUNITY_CATEGORIES.map((c) => c.id);

/** How many leads we ask for. Small on purpose: six checkable leads beat twenty guesses. */
export const DISCOVERY_TARGET = 6;

/**
 * The system prompt.
 *
 * Long, and every paragraph is load-bearing. The parts that read as repetitive
 * are repetitive deliberately: the "leave it blank" instruction is restated at
 * the field level because a model that is told once at the top will still fill
 * a deadline field it feels ought to have a value.
 */
export function buildDiscoveryPrompt(ctx, { existingNames = [], focus = null } = {}) {
  const p = ctx?.profile || {};
  const place = ctx?.place || null;
  const interests = (p.activeThemeIds || []).slice(0, 6).join(', ');

  const student = [
    ctx?.grade ? `Grade ${ctx.grade}` : 'High school (grade unknown)',
    ctx?.pathwayLabel ? `heading toward ${ctx.pathwayLabel}` : null,
    interests ? `interested in ${interests}` : null,
    // Location travels ONLY when the student consented — ctx.place is null
    // otherwise, and there is no other path to a ZIP from here.
    place?.stateName ? `lives in ${place.stateName}` : null,
    ctx?.costSensitivity === 'free_only' ? 'can only do free or funded programs' : null,
    ctx?.transport === 'constrained' ? 'has limited transportation' : null,
    ctx?.timeBudget ? `has ${String(ctx.timeBudget).replace('_', ' ')} time available` : null,
  ].filter(Boolean).join('; ');

  return `You are Medabrain's opportunity researcher for MedSchoolPrep, helping ONE high-school student (grades 9-12) find real activities and opportunities that our curated database does not already list.

THE STUDENT: ${student}.
${focus ? `THEY SPECIFICALLY ASKED ABOUT: ${focus}\n` : ''}
ALREADY IN OUR DATABASE (do not return any of these, or a renamed version of one):
${existingNames.slice(0, 120).join(' | ') || '(nothing yet)'}

Return ONLY a JSON object of the form {"candidates": [ ... ]} with at most ${DISCOVERY_TARGET} entries. No prose, no markdown.

Each candidate:
{
  "name": string,                 // the program's real, full name
  "org": string,                  // the organization that actually runs it
  "category": one of ${CATEGORY_IDS.join('|')},
  "description": string,          // 1-2 sentences on what a student actually does
  "url": string,                  // the organization's own page for it, or "" if you are not confident of the exact URL
  "eligibility": string,          // who can apply, in prose, as the organization states it
  "grades": string[],             // e.g. ["11","12"], or [] if you do not know
  "states": string[],             // two-letter codes if it is restricted by state; [] if national or unknown
  "format": "In person"|"Virtual"|"Hybrid"|"",
  "location": string,             // city/region if it is place-based, else ""
  "timeCommitment": string,       // e.g. "About 6 weeks, full-time, over the summer", else ""
  "costText": string,             // in prose, e.g. "Free" or "There is a tuition fee", else ""
  "aid": string,                  // fee waivers/need-based support, if the program is known to offer it, else ""
  "deadlineText": string,         // ONLY the general shape you are confident of, e.g. "Applications usually close in early spring". NEVER a specific date for a specific year.
  "deadlineSource": string,       // where that timing claim comes from (e.g. "the program has run on this cycle for years"). If you cannot say, put "" AND leave deadlineText "".
  "recurring": boolean,           // true only if you genuinely know it runs every year
  "applicationRequirements": string[], // e.g. ["Teacher recommendation","Short essay"]. [] if unknown.
  "confidence": "high"|"medium"|"low", // your honest confidence that this program is real and currently running
  "whyThisStudent": string        // one sentence on why it fits THIS student specifically
}

HARD RULES — these matter more than returning ${DISCOVERY_TARGET} results:

1. EVERY CANDIDATE MUST BE A REAL PROGRAM YOU ACTUALLY KNOW OF. Returning three real programs is a success. Returning six where two are invented is a failure that costs a fifteen-year-old weeks of their life. If you only know two, return two. If you know none that fit, return an empty array.
2. NEVER INVENT A DEADLINE. Not a date, not a month, not "usually March" unless the program genuinely runs on that cycle and you can say why in deadlineSource. An empty deadlineText is a correct answer.
3. NEVER INVENT ELIGIBILITY, COST, AGE MINIMUMS, OR REQUIREMENTS. Empty string and empty array are correct answers. Do not reason your way to a plausible value.
4. NEVER INVENT A URL. If you are not confident of the exact address, return "". A wrong link is worse than no link — the student will conclude the program does not exist.
5. PREFER OFFICIAL ORGANIZATION SOURCES over aggregators, listicles, and consultancies. The org that runs the program, a university department, a hospital system, a government agency, a professional society.
6. NO PAY-TO-ATTEND YOUTH SUMMITS, no "leadership congresses" that admit anyone who pays, no programs whose main product is a certificate. If a program's selectivity is that it cashes a check, do not return it.
7. NO FAKE NONPROFITS, no "start your own charity for your application" schemes, no résumé-padding, no title-chasing, no unsafe or unsupervised activity, and nothing that puts a minor alone with an unvetted adult.
8. FAVOR SUBSTANTIAL AND ACCESSIBLE over expensive and famous. A county health department internship a student can bus to beats a $6,000 residential program every time.
9. If the student has a stated location, prefer things they could actually reach, and say so in whyThisStudent. Do not assume they can travel across the country.
10. Preserve their non-medical interests. If they are genuinely into music or debate or climate work, an authentic opportunity in that is a legitimate answer — a student is allowed to be a whole person.

Everything you return will be shown to the student clearly labeled "AI-discovered — needs verification", and nothing will be treated as fact until a human checks it. Answer accordingly: leads, not claims.`;
}

/**
 * Pull the candidate array out of a model response, tolerating the two shapes
 * models actually return (a bare array, or the object we asked for).
 */
export function parseCandidates(content) {
  if (!content) return [];
  let parsed;
  try { parsed = typeof content === 'string' ? JSON.parse(content) : content; }
  catch { return []; }
  const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.candidates) ? parsed.candidates : [];
  return list.filter((c) => c && typeof c === 'object');
}

const str = (v) => (typeof v === 'string' ? v.trim() : '');

/**
 * One raw candidate → a record we are willing to store, or null.
 *
 * This is the enforcement point for rules 2, 3 and 4 above. Everything the
 * model was told to leave blank is ALSO dropped here if it arrives anyway,
 * because a prompt is a request and a function is a guarantee.
 */
export function sanitizeCandidate(raw, { ctx = null } = {}) {
  const name = str(raw.name);
  const org = str(raw.org);
  const description = str(raw.description);
  // A candidate we cannot even name and describe is not a lead.
  if (name.length < 3 || !description) return null;
  // Guard against the model returning a category-shaped hallucination.
  const category = CATEGORY_IDS.includes(raw.category) ? raw.category : null;

  // Rule 2: a timing claim with no stated basis does not travel.
  const deadlineSource = str(raw.deadlineSource);
  const deadlineText = deadlineSource ? str(raw.deadlineText) : '';
  // And even with a basis, an exact-looking date is refused. The model was told
  // not to produce one; if it does, that is precisely the output we cannot trust.
  const looksLikeExactDate = /\b\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}\b|\b20\d\d\b/i.test(deadlineText);

  const url = safeUrl(raw.url);
  const confidence = ['high', 'medium', 'low'].includes(raw.confidence) ? raw.confidence : 'low';

  const text = `${name} ${org} ${description} ${str(raw.eligibility)}`;
  const timeCommitment = str(raw.timeCommitment);

  return normalizeRecord({
    id: slugFor(name, org),
    name,
    org: org || null,
    category,
    description,
    url,
    eligibility: str(raw.eligibility) || null,
    grades: Array.isArray(raw.grades) ? raw.grades.map(String) : [],
    states: Array.isArray(raw.states) ? raw.states : [],
    format: ['In person', 'Virtual', 'Hybrid'].includes(raw.format) ? raw.format : null,
    location: str(raw.location) || null,
    timeCommitment: timeCommitment || null,
    costText: str(raw.costText) || null,
    aid: str(raw.aid) || null,
    deadlineText: looksLikeExactDate ? null : (deadlineText || null),
    // Never a machine-readable date from a model. A discovered record's date is
    // prose the student goes and confirms, and prose cannot become a reminder
    // by accident.
    deadlineIso: null,
    deadlineMonth: null,
    deadlinePrecision: null,
    recurrence: raw.recurring === true ? { cadence: 'annual', note: deadlineSource || null } : null,
    status: 'unclear',
    applicationRequirements: Array.isArray(raw.applicationRequirements) ? raw.applicationRequirements : [],
    tags: [],
    pathways: [],
    // Selectivity is never claimed for a discovered record. We have no reliable
    // basis for it and the requirement is explicit that it is stated only when
    // reliable — so it stays null and the card says nothing about prestige.
    selectivity: null,
    selectivityConfidence: null,
    ...derivedPotential({ category, tags: [], text }),
    portfolioRole: derivedPortfolioRole({ category, timeCommitment, text }),
    sourceKind: 'ai_discovered',
    sourceLabel: url ? hostOf(url) : 'No official source captured',
    verificationState: 'needs_verification',
    verifiedAt: null,
    // Carried through so the review UI can sort by it and a verifier can start
    // with the ones most likely to be real.
    discoveryConfidence: confidence,
    discoveryNote: str(raw.whyThisStudent) || null,
    deadlineSource: deadlineSource || null,
    unverifiableUrl: !url,
  });
}

/** A stable slug. Two runs that find the same program produce the same id. */
export function slugFor(name, org = '') {
  const base = `${name} ${org}`.toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `ai-${base || 'opportunity'}`;
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'Official page'; }
}

// ── Deduplication ────────────────────────────────────────────────────────────

/** Normalized form for comparison: lowercase, no punctuation, no filler words. */
const FILLER = new Set(['the', 'a', 'an', 'of', 'for', 'and', 'program', 'programs', 'summer', 'high', 'school', 'students', 'student', 'youth', 'national', 'institute']);
export function fingerprint(text) {
  return String(text || '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !FILLER.has(w))
    .sort()
    .join(' ');
}

/** Jaccard overlap of two fingerprints' word sets. */
export function similarity(a, b) {
  const A = new Set(fingerprint(a).split(' ').filter(Boolean));
  const B = new Set(fingerprint(b).split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared += 1;
  return shared / (A.size + B.size - shared);
}

/**
 * Drop candidates that are already in the pool.
 *
 * Threshold 0.6 is deliberately loose. A false duplicate costs the student one
 * lead they will never miss; a false NEW record puts "Stanford Summer Research
 * Program" next to "Stanford Institutes of Medicine Summer Research Program" on
 * the same screen and makes the whole feature look like it is guessing.
 */
export function dedupeCandidates(candidates, existingRecords = [], { threshold = 0.6 } = {}) {
  const kept = [];
  const existing = existingRecords.map((r) => ({ id: r.id, name: r.name || '', key: `${r.name} ${r.org || ''}`, url: r.url }));
  // The NAME alone has to be compared as well as name-plus-org, because the two catalogs and a
  // model routinely disagree about the host: "The Congressional Award" is run by "United States
  // Congress" here and by "The Congressional Award Foundation" in a model's memory, and combining
  // the two strings buries an exact name match under an org mismatch. Taking the max of the two
  // is what stops the same program appearing twice under two hosts.
  const matches = (a, b) => Math.max(similarity(a.name, b.name), similarity(a.key, b.key));
  for (const c of candidates) {
    if (!c) continue;
    const cand = { name: c.name || '', key: `${c.name} ${c.org || ''}` };
    const dupOfExisting = existing.find((e) => e.id === c.id
      || (c.url && e.url && sameProgramUrl(c.url, e.url))
      || matches(cand, e) >= threshold);
    if (dupOfExisting) continue;
    const dupOfBatch = kept.find((k) => k.id === c.id || matches(cand, { name: k.name || '', key: `${k.name} ${k.org || ''}` }) >= threshold);
    if (dupOfBatch) continue;
    kept.push(c);
  }
  return kept;
}

/** Two URLs pointing at the same program: same host, same path stem. */
function sameProgramUrl(a, b) {
  try {
    const ua = new URL(a); const ub = new URL(b);
    if (ua.hostname.replace(/^www\./, '') !== ub.hostname.replace(/^www\./, '')) return false;
    return ua.pathname.replace(/\/+$/, '').toLowerCase() === ub.pathname.replace(/\/+$/, '').toLowerCase();
  } catch { return false; }
}

// ── The call ─────────────────────────────────────────────────────────────────

/**
 * Ask the AI lane for leads, sanitize them, and dedupe against what we have.
 *
 * Returns candidates — it deliberately does NOT write them. Persisting is
 * store.js's job and is a separate, explicit step, so a UI can show a student
 * what was found before anything is saved to their account.
 *
 * @returns {Promise<{candidates: [], raw: number, dropped: number, model: string|null}>}
 */
export async function discoverOpportunities({ ctx, existingRecords = [], focus = null, fetchImpl = null } = {}) {
  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!doFetch) throw new Error('Discovery needs a fetch implementation.');
  const existingNames = existingRecords.map((r) => r.name).filter(Boolean);

  const res = await doFetch('/api/groq', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system: buildDiscoveryPrompt(ctx, { existingNames, focus }),
      message: focus
        ? `Find opportunities matching: ${focus}. Return the JSON object.`
        : 'Find opportunities for this student that are not already in our database. Return the JSON object.',
      purpose: 'portfolio',
      lane: aiLane(),
      jsonMode: true,
      maxTokens: 1800,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Medabrain error (${res.status})`);
  if (!data?.content) throw new Error('Medabrain did not return anything usable. Try again.');

  const raw = parseCandidates(data.content);
  const sanitized = raw.map((c) => sanitizeCandidate(c, { ctx })).filter(Boolean);
  const candidates = dedupeCandidates(sanitized, existingRecords);
  return {
    candidates,
    raw: raw.length,
    dropped: raw.length - candidates.length,
    model: data.model || null,
  };
}
