// ─────────────────────────────────────────────────────────────────────────────
// THE CERTIFICATION MODULE — the guidance layer over the credential database.
//
// ── What is already solved elsewhere ────────────────────────────────────────
// src/data/credentials/ is the authority on what each credential IS: the
// official name, what a state calls it, the age gate, the training hours, the
// cost, the renewal clock, the sources each number was read from. It is
// verified by scripts/verifyCredentialDatabase.mjs and every number in it
// carries a basis. This module does not restate any of that and must never
// hardcode a number that lives there — a second copy is a copy that goes stale
// silently and then contradicts the first one on the same screen.
//
// ── What this module adds ───────────────────────────────────────────────────
// The three things a database of facts cannot answer for a sixteen-year-old:
//
//   1. WHICH ONES. Eight credentials out of thirty-eight records are realistic
//      for a high school student to plan a summer around. THE_EIGHT names them,
//      in the order a student should consider them.
//   2. WHAT IT UNLOCKS. Not the occupation code — the actual job title a
//      seventeen-year-old can be hired into, which is the fact that makes the
//      credential worth the summer.
//   3. WHAT IT DOES TO AN APPLICATION, per pathway, honestly. A CNA moves a
//      direct-admit BSN application a great deal and a combined-degree
//      application very little, and saying so is more useful than a five-star
//      rating that is high for everything.
//
// ── The honesty rule ────────────────────────────────────────────────────────
// Strength ratings are ordinal and coarse on purpose — 'high', 'moderate',
// 'low' — with a sentence attached to each. A numeric score would imply a
// precision nobody has, and would invite a student to add up credentials.
// ─────────────────────────────────────────────────────────────────────────────

import { getCredential, CREDENTIALS } from '../data/credentials/index.js';
import { US_STATES } from '../data/constants.js';
import { credentialName, ageGateFor, provisionalNote } from './credentials.js';

/** The full name of a state from its USPS code — "Ohio", not "OH". The locator
 *  labels and the searches behind them both read better for it, and a student
 *  searching for "OH health department" gets worse results than one searching
 *  for "Ohio department of health". */
const stateNameOf = (code) => US_STATES.find(s => s.code === (code || '').toUpperCase())?.name || null;

// ── The eight ────────────────────────────────────────────────────────────────
//
// Ordered as an argument rather than alphabetically: BLS first because it is
// free, has no real age floor, and is a prerequisite for most of the rest; then
// the credentials that lead to a paid clinical job, cheapest and youngest
// first; then the ones with a hard wall at eighteen.
export const THE_EIGHT = [
  {
    id: 'aha-bls',
    order: 1,
    // What a seventeen-year-old can actually be hired to do with it. Empty for
    // BLS, and saying so is the point — it is a gate, not a job.
    jobs: [],
    unlocks: 'Almost every clinical volunteer placement and every other credential on this list asks for it first.',
    why: 'The cheapest useful thing on this list and usually free. Get it out of the way in ninth or tenth grade.',
    strength: {
      nursing: 'low', physicianAssistant: 'low', physician: 'low', pharmacy: 'low',
      dentistry: 'low', physicalOccupTherapy: 'low', publicHealth: 'low',
      biomedResearch: 'low', healthAdmin: 'low', exploring: 'low',
    },
    strengthNote: 'On its own it is training, not a credential — nobody is admitted because of it. Its value is that it opens the door to the placements that do count.',
  },
  {
    id: 'cna',
    order: 2,
    jobs: ['Nursing assistant', 'Patient care assistant', 'Resident assistant (long-term care)'],
    unlocks: 'Paid shifts in hospitals, nursing homes and rehabilitation facilities, and a registry listing an employer can verify.',
    why: 'The strongest single credential for a nursing pathway, and the one most likely to be free through a school CTE program or an employer that trains the people it hires.',
    strength: {
      nursing: 'high', physicianAssistant: 'high', physicalOccupTherapy: 'moderate',
      physician: 'moderate', exploring: 'moderate', publicHealth: 'low',
      pharmacy: 'low', dentistry: 'low', biomedResearch: 'low', healthAdmin: 'low',
    },
    strengthNote: 'For direct-admit BSN readers this is close to the best available evidence that a student will still be in the major in year three. For PA programs the hours it produces count as direct patient care.',
  },
  {
    id: 'emr',
    order: 3,
    jobs: ['Emergency Medical Responder', 'Ski patrol', 'Event and campus medical response'],
    unlocks: 'First-response work, and the realistic entry point into prehospital care for a student who is too young for the EMT certificate.',
    why: 'Shorter and cheaper than EMT, and frequently reachable before eighteen — which is the whole reason it is on this list rather than being skipped over.',
    strength: {
      physicianAssistant: 'moderate', physician: 'moderate', nursing: 'moderate',
      exploring: 'moderate', physicalOccupTherapy: 'low', publicHealth: 'low',
      pharmacy: 'low', dentistry: 'low', biomedResearch: 'low', healthAdmin: 'low',
    },
    strengthNote: 'Read as a genuine step into emergency care rather than as a lesser EMT, particularly when it leads to actual volunteer response hours.',
  },
  {
    id: 'cpt',
    order: 4,
    jobs: ['Phlebotomy technician', 'Plasma center technician', 'Laboratory assistant'],
    unlocks: 'Drawing blood in hospitals, outpatient labs, and plasma donation centers.',
    why: 'The fastest route from nothing to a hands-on clinical job — the course is short and the skill is concrete.',
    strength: {
      nursing: 'moderate', physicianAssistant: 'high', biomedResearch: 'moderate',
      physician: 'moderate', exploring: 'moderate', pharmacy: 'low',
      dentistry: 'low', physicalOccupTherapy: 'low', publicHealth: 'low', healthAdmin: 'low',
    },
    strengthNote: 'Counts as direct patient care for most PA programs, and it is the credential most likely to still be earning money for you through college.',
  },
  {
    id: 'cpct-a',
    order: 5,
    jobs: ['Patient care technician', 'Hospital care technician', 'Dialysis technician (with additional training)'],
    unlocks: 'Hospital floor work — a nursing assistant\'s scope plus EKG and often phlebotomy.',
    why: 'The hospital version of the CNA. If your CTE program offers this instead of a plain CNA, take it.',
    strength: {
      nursing: 'high', physicianAssistant: 'high', physician: 'moderate',
      physicalOccupTherapy: 'moderate', exploring: 'moderate', publicHealth: 'low',
      pharmacy: 'low', dentistry: 'low', biomedResearch: 'low', healthAdmin: 'low',
    },
    strengthNote: 'Reads slightly stronger than a CNA to a hospital-affiliated nursing program, because the setting matches the one their students train in.',
  },
  {
    id: 'cet',
    order: 6,
    jobs: ['EKG technician', 'Monitor technician', 'Cardiac telemetry technician'],
    unlocks: 'Running and reading electrocardiograms, usually on a hospital cardiac or telemetry floor.',
    why: 'A short add-on for a student already earning a patient care credential, and a genuine differentiator for anyone interested in cardiology.',
    strength: {
      nursing: 'moderate', physicianAssistant: 'moderate', physician: 'moderate',
      exploring: 'moderate', physicalOccupTherapy: 'low', publicHealth: 'low',
      pharmacy: 'low', dentistry: 'low', biomedResearch: 'low', healthAdmin: 'low',
    },
    strengthNote: 'Strongest as a second credential rather than a first — on its own it produces fewer patient care hours than a CNA or PCT role does.',
  },
  {
    id: 'cpht',
    order: 7,
    jobs: ['Pharmacy technician', 'Retail pharmacy technician', 'Hospital pharmacy technician'],
    unlocks: 'Retail and hospital pharmacy work, with a state registration in most states on top of the certification.',
    why: 'The clearest single credential for a pharmacy pathway, and one of the few on this list with a large, stable part-time job market attached.',
    strength: {
      pharmacy: 'high', nursing: 'low', physicianAssistant: 'low', physician: 'low',
      exploring: 'moderate', healthAdmin: 'moderate', publicHealth: 'low',
      dentistry: 'low', physicalOccupTherapy: 'low', biomedResearch: 'low',
    },
    strengthNote: 'Note that pharmacy technician hours are generally NOT counted as direct patient care by PA programs, which is the most common mistake made with this one.',
  },
  {
    id: 'ccma',
    order: 8,
    jobs: ['Clinical medical assistant', 'Clinic medical assistant', 'Ambulatory care assistant'],
    unlocks: 'Clinic work spanning the front desk and the exam room — rooming patients, vitals, EKGs, injections, charting.',
    why: 'The broadest of the entry clinical credentials and the one most CTE health science programs point at, though the certificate itself usually lands after graduation.',
    strength: {
      nursing: 'moderate', physicianAssistant: 'high', physician: 'moderate',
      exploring: 'moderate', publicHealth: 'moderate', healthAdmin: 'moderate',
      pharmacy: 'low', dentistry: 'low', physicalOccupTherapy: 'low', biomedResearch: 'low',
    },
    strengthNote: 'PA programs count medical assistant hours as direct patient care, and this is one of the most common backgrounds in an admitted PA cohort.',
  },
];

/** The EMT sits alongside the eight rather than inside them: the credential is
 *  not issuable under eighteen, so recommending it to a sophomore as one of
 *  eight options would be recommending something they cannot have. It is
 *  surfaced with the age gate stated first — see `emtEntry()`. */
export const EMT_ID = 'emt';

export const THE_EIGHT_IDS = THE_EIGHT.map(e => e.id);

const GUIDE_BY_ID = Object.fromEntries(THE_EIGHT.map(e => [e.id, e]));

/** Guidance for the EMT, which is on the module's list of nine things a student
 *  should know about but is not on the list of eight they should plan around. */
export function emtEntry() {
  return {
    id: EMT_ID,
    order: 9,
    jobs: ['Emergency Medical Technician (at 18)', 'Ambulance crew', 'Fire department explorer'],
    unlocks: 'Prehospital emergency care on an ambulance or fire rig — the highest responsibility a young person can carry.',
    why: 'Worth planning toward, not toward this summer, unless you are seventeen turning eighteen. Under eighteen, take the course knowing what you are buying.',
    gated: true,
    strength: {
      physicianAssistant: 'high', physician: 'high', nursing: 'moderate',
      exploring: 'moderate', physicalOccupTherapy: 'low', publicHealth: 'low',
      pharmacy: 'low', dentistry: 'low', biomedResearch: 'low', healthAdmin: 'low',
    },
    strengthNote: 'Among the strongest patient care backgrounds a PA applicant can have, and the hours are unambiguous. The constraint is the age gate, not the value.',
  };
}

/** The nine records the module teaches, in order — the eight plus the EMT. */
export const MODULE_IDS = [...THE_EIGHT_IDS, EMT_ID];

// ── Strength ─────────────────────────────────────────────────────────────────

export const STRENGTH_LEVELS = {
  high:     { label: 'Strong', order: 0, blurb: 'Moves this kind of application meaningfully on its own.' },
  moderate: { label: 'Useful', order: 1, blurb: 'Helps, mostly through the hours and the exposure it produces.' },
  low:      { label: 'Marginal', order: 2, blurb: 'Fine to have, but not what these readers are weighing.' },
};

/** How much this credential moves an application on a given pathway. Unknown
 *  pathway → 'moderate', because a pathway we have not rated is not a pathway
 *  the credential is useless for. */
export function strengthFor(guide, pathwayKey) {
  const s = guide?.strength?.[pathwayKey];
  return STRENGTH_LEVELS[s] ? s : 'moderate';
}

// ── State locators ───────────────────────────────────────────────────────────
//
// Requirements and approved-program lists are set by states, and this is one of
// the few subjects where generic national advice is actively worse than
// nothing: a student who reads NREMT's page and concludes they cannot do
// anything at sixteen has been given a wrong answer by a correct page.
//
// These build SEARCHES against the right authority rather than asserting deep
// links into fifty state websites, which change constantly and would rot into
// dead ends within a year. A search that lands on the right agency is honest
// about being a starting point; a broken deep link is not.

const AUTHORITY = {
  'state-occupational': (stateName, term) =>
    ({ label: `${stateName} state registry and approved programs`,
       url: `https://www.google.com/search?q=${encodeURIComponent(`${stateName} ${term} state approved training program registry`)}` }),
  'national-certification': (stateName, term) =>
    ({ label: `Approved ${term} programs in ${stateName}`,
       url: `https://www.google.com/search?q=${encodeURIComponent(`${stateName} ${term} certification approved training program`)}` }),
  'course-completion': (stateName, term) =>
    ({ label: `${term} classes near you`,
       url: `https://www.google.com/search?q=${encodeURIComponent(`${term} class ${stateName}`)}` }),
};

/**
 * Where to actually look, for one credential in one state.
 *
 * Always returns the CTE route first, because it is the free one and because
 * students consistently do not know their own district offers it. Then the
 * state authority. The credential's own `sources` (the issuing body's page)
 * are left to the UI, which already has them from the database.
 */
export function locatorsFor(credentialId, stateCode, stateName) {
  const c = getCredential(credentialId);
  if (!c) return [];
  const where = stateName || stateCode || 'your state';
  const term = c.abbreviation || c.officialName;

  const out = [{
    label: 'Your own school district first',
    detail: c.cteCommon
      ? 'This is one of the credentials high school health science programs commonly deliver free. Ask your counselor which ones your district offers and in which grade.'
      : 'Less commonly offered in high school programs, but worth one question to your counselor before paying a provider.',
    url: null,
  }];

  const build = AUTHORITY[c.type];
  if (build) {
    const l = build(where, term);
    out.push({ label: l.label, url: l.url, detail: 'Confirm the program appears on the state or issuer list by name — not merely that it says it is approved.' });
  }

  if (c.type === 'state-occupational') {
    out.push({
      label: `${where} health department`,
      url: `https://www.google.com/search?q=${encodeURIComponent(`${where} department of health ${term} certification requirements`)}`,
      detail: 'The state agency sets the age, the hours, and the fee, and is the only authority on all three.',
    });
  }

  return out;
}

// ── Assembling one entry ─────────────────────────────────────────────────────

/**
 * Everything the UI needs for one credential: the database record, the guidance,
 * the student's state name for it, and the age gate resolved against their age.
 *
 * The age gate is resolved HERE rather than in the component so that the
 * explorer, the résumé picker, and any future surface cannot disagree about
 * whether a sixteen-year-old can hold an EMT certificate.
 */
export function credentialEntry(credentialId, { stateCode = null, age = null, pathwayKey = null } = {}) {
  const record = getCredential(credentialId);
  if (!record) return null;
  const guide = credentialId === EMT_ID ? emtEntry() : GUIDE_BY_ID[credentialId];
  const naming = credentialName(record, stateCode);
  const strength = guide ? strengthFor(guide, pathwayKey) : null;
  return {
    id: credentialId,
    record,
    guide: guide || null,
    naming,
    age: ageGateFor(record, age),
    provisional: provisionalNote(record),
    strength,
    strengthMeta: strength ? STRENGTH_LEVELS[strength] : null,
    locators: locatorsFor(credentialId, stateCode, stateNameOf(stateCode)),
  };
}

/**
 * The module's list, in the order it should be read, optionally re-sorted so
 * the ones that matter most for this student's pathway come first.
 *
 * Sorting by pathway strength is offered rather than forced: the default order
 * is an argument about sequence (BLS first because everything needs it), and a
 * student who has picked a pathway is better served by relevance. The UI
 * exposes both, and neither hides anything.
 */
export function moduleEntries({ stateCode = null, age = null, pathwayKey = null, sort = 'order' } = {}) {
  const entries = MODULE_IDS.map(id => credentialEntry(id, { stateCode, age, pathwayKey })).filter(Boolean);
  if (sort === 'pathway' && pathwayKey) {
    entries.sort((a, b) =>
      (STRENGTH_LEVELS[a.strength]?.order ?? 9) - (STRENGTH_LEVELS[b.strength]?.order ?? 9)
      || (a.guide?.order ?? 99) - (b.guide?.order ?? 99));
  } else {
    entries.sort((a, b) => (a.guide?.order ?? 99) - (b.guide?.order ?? 99));
  }
  return entries;
}

/** Every state code any credential in the database renames itself in, for the
 *  "your state calls this something else" hint on the selector. */
export const RENAMING_STATES = [...new Set(CREDENTIALS.flatMap(c => Object.keys(c.stateNames || {})))].sort();
