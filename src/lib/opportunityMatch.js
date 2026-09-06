// ─────────────────────────────────────────────────────────────────────────────
// Opportunity matching — the engine behind the Portfolio ▸ Opportunities tab.
//
// src/lib/recommendOpportunities.js (still used by nothing else now) answered a
// narrow question: "given how empty this student's activity log is, what should
// they add next?". It only ever looked at activity-type counts, clinical hours
// and the pathway key, which is why its picks read the same for two students
// with completely different interests and completely different résumés.
//
// This module answers the question the student actually asks — "what should
// *I*, specifically, go do?" — by reasoning over four independent signals:
//
//   1. PASSIONS   — interest themes the student explicitly picks in the tab,
//                   plus the ones we can honestly infer from what they told us
//                   at signup (dream role, why medicine, sciences taken).
//   2. ECs        — what they have actually done: activity titles/orgs/
//                   descriptions, research entries, skills, awards. A student
//                   who already runs a robotics team should be shown the
//                   biomedical-engineering programs, not another intro club.
//   3. DIRECTION  — the pathway they're aiming at (PATHS key) and their grade,
//                   because a program open to juniors and seniors is noise for
//                   a freshman.
//   4. PRACTICALS — what they can actually say yes to: selectivity appetite,
//                   cost, format. These are hard filters, not nudges, because
//                   a recommendation a student can't afford or can't attend is
//                   worse than no recommendation.
//
// Everything here is PURE and dependency-light (constants + the catalog only),
// for two reasons: it runs synchronously on every render of the tab with no
// network round-trip, and scripts/verifyOpportunities.mjs can import it from
// plain Node and assert on its behavior — the same test-by-script convention
// the rest of this repo uses in place of a test runner.
//
// Meta Brain never *replaces* this ranking. It narrates it: buildMatchPrompt()
// hands the model the deterministic shortlist plus the profile that produced
// it, and the model is explicitly forbidden from inventing programs outside
// that list. That ordering is deliberate — the ranking has to be explainable
// and reproducible even when the AI is offline, rate-limited, or wrong.
// ─────────────────────────────────────────────────────────────────────────────

import { PATHS, GRADE_STAGES } from '../data/constants.js';
import { PROGRAM_BY_ID } from '../data/opportunityPrograms.js';
import { nextDeadline } from './opportunityEligibility.js';

// ── Interest themes ──────────────────────────────────────────────────────────
// The vocabulary the student picks from ("let them choose") AND the vocabulary
// we match the catalog against. Keeping one list for both is what makes the
// chips honest: every theme a student can select is a theme that can actually
// hit entries in src/data/opportunities.js.
//
// `colorKey` is a token NAME, not a color. Capturing C.violet into a
// module-level literal would snapshot the value at import time and never
// update on a theme switch — see the header of src/lib/theme.js. Callers
// resolve C[colorKey] during render.
//
// `keywords` are matched case-insensitively against an entry's tags, name, org
// and description. They're deliberately broad-but-specific: 'neuro' hits
// neuroscience/neurology/neural, while a word like 'care' would hit half the
// catalog and is left out.
export const INTEREST_THEMES = [
  { id: 'clinical_care', label: 'Patient & clinical care', colorKey: 'pink', blurb: 'Being in the room where care happens',
    keywords: ['clinical', 'patient care', 'hospital', 'shadow', 'bedside', 'clinic support', 'caregiv', 'hospice', 'nursing'],
    pathways: ['physician', 'nursing', 'physicianAssistant'] },
  { id: 'surgery_anatomy', label: 'Surgery & anatomy', colorKey: 'rose', blurb: 'Hands, instruments, and how the body is built',
    keywords: ['surg', 'anatomy', 'orthoped', 'suture', 'operating', 'cadaver', 'physiology'],
    pathways: ['physician', 'physicianAssistant'] },
  { id: 'neuroscience', label: 'Brain & neuroscience', colorKey: 'violet', blurb: 'Neurons, cognition, and neurology',
    keywords: ['neuro', 'brain', 'cognitive', 'psychol', 'memory'],
    pathways: ['physician', 'biomedResearch'] },
  { id: 'research_lab', label: 'Lab & research', colorKey: 'amber', blurb: 'Bench work, data, and original discovery',
    keywords: ['research', 'laborator', 'stem research', 'science fair', 'publication', 'original research', 'mentored research', 'nih', 'genom', 'biochem', 'molecular'],
    pathways: ['biomedResearch', 'physician', 'pharmacy'] },
  { id: 'public_health', label: 'Public & community health', colorKey: 'green', blurb: 'Populations, prevention, and access',
    keywords: ['public health', 'community health', 'epidem', 'social determinants', 'health equity', 'food insecurity', 'rural health', 'vaccin', 'outreach', 'health polic'],
    pathways: ['publicHealth', 'healthAdmin', 'nursing'] },
  { id: 'global_health', label: 'Global health', colorKey: 'teal', blurb: 'Health beyond one country\'s borders',
    keywords: ['global health', 'world health', 'refugee', 'tropical', 'humanitarian'],
    pathways: ['publicHealth', 'physician'] },
  { id: 'mental_health', label: 'Mental health', colorKey: 'indigo', blurb: 'Psychiatry, counseling, and peer support',
    keywords: ['mental health', 'psychiatr', 'suicide prevention', 'counsel', 'wellness', 'peer support', 'crisis'],
    pathways: ['physician', 'publicHealth', 'nursing'] },
  { id: 'emergency', label: 'Emergency & first response', colorKey: 'red', blurb: 'EMS, trauma, and disaster response',
    keywords: ['emergency', 'emt', 'first aid', 'cpr', 'disaster', 'trauma', 'lifeguard', 'rescue', 'first respon'],
    pathways: ['physician', 'nursing', 'physicianAssistant'] },
  { id: 'biotech_engineering', label: 'Biomedical engineering & devices', colorKey: 'cyan', blurb: 'Building the tools medicine runs on',
    keywords: ['engineer', 'biomedical', 'robot', 'device', 'prosthe', 'invention', 'innovation', 'design challenge', 'aerospace'],
    pathways: ['biomedResearch', 'physician'] },
  { id: 'data_computing', label: 'Data, coding & health tech', colorKey: 'blue', blurb: 'Computation pointed at biology',
    keywords: ['coding', 'programming', 'computing', 'data analysis', 'bioinformatic', 'app development', 'cybersecurity', 'machine learning', 'informatics', 'statistic'],
    pathways: ['biomedResearch', 'healthAdmin', 'publicHealth'] },
  { id: 'chem_pharm', label: 'Chemistry & pharmacology', colorKey: 'lime', blurb: 'Molecules, drugs, and how they act',
    keywords: ['chemistry', 'chemical', 'pharm', 'toxicol', 'drug', 'biochem'],
    pathways: ['pharmacy', 'biomedResearch'] },
  { id: 'dental_oral', label: 'Dental & oral health', colorKey: 'sky', blurb: 'Teeth, jaws, and oral care access',
    keywords: ['dent', 'oral health', 'orthodont'],
    pathways: ['dentistry'] },
  { id: 'rehab_sports', label: 'Rehab, sports & nutrition', colorKey: 'orange', blurb: 'Movement, recovery, and fueling the body',
    keywords: ['physical therap', 'occupational therap', 'rehab', 'athletic train', 'sports medicine', 'nutrition', 'kinesiol', 'exercise'],
    pathways: ['physicalOccupTherapy', 'nursing', 'publicHealth'] },
  { id: 'advocacy_policy', label: 'Advocacy, policy & leadership', colorKey: 'fuchsia', blurb: 'Changing the system around the patient',
    keywords: ['advocacy', 'policy', 'civics', 'government', 'leadership', 'legislat', 'debate', 'model un', 'nonprofit', 'fundrais', 'public speaking'],
    pathways: ['healthAdmin', 'publicHealth'] },
  { id: 'teaching_writing', label: 'Teaching, writing & communication', colorKey: 'violet', blurb: 'Explaining medicine to people who need it',
    keywords: ['teaching', 'tutor', 'writing', 'essay', 'journal', 'mentorship', 'peer leadership', 'communicat', 'presentation'],
    pathways: ['publicHealth', 'healthAdmin', 'nursing'] },
  { id: 'service', label: 'Volunteering & direct service', colorKey: 'emerald', blurb: 'Showing up, consistently, for a community',
    keywords: ['service', 'volunteer', 'community service', 'blood drive', 'food bank', 'shelter', 'senior', 'disability inclusion', 'youth development'],
    pathways: ['nursing', 'publicHealth', 'physician'] },
];

export const THEME_BY_ID = Object.fromEntries(INTEREST_THEMES.map((t) => [t.id, t]));

/** Selectivity appetite — how much rejection risk the student wants in their list. */
export const EFFORT_APPETITES = [
  { id: 'open', label: 'Start accessible', sub: 'Things I can join now', prefers: 'Open' },
  { id: 'balanced', label: 'A balanced mix', sub: 'Some reach, some sure things', prefers: null },
  { id: 'elite', label: 'Aim high', sub: "The selective ones, even if it's a long shot", prefers: 'Elite' },
];

/** Cost stance. `free_only` is a HARD filter — see matchOpportunities. */
export const COST_STANCES = [
  { id: 'any', label: 'Any cost', sub: "I'll look at everything" },
  { id: 'free_only', label: 'Free only', sub: 'Free, stipend, or paid roles' },
];

export const FORMAT_PREFS = [
  { id: 'any', label: 'Any format' },
  { id: 'Virtual', label: 'Virtual' },
  { id: 'In person', label: 'In person' },
];

/** The `cost` values that never cost a student money (see OPPORTUNITY_COSTS). */
const FREE_COSTS = new Set(['Free', 'Free + stipend', 'Paid role']);

// Onboarding answer → interest themes it honestly implies. Only mappings a
// student would recognize as their own answer are listed; 'unsure'/'undecided'
// deliberately map to nothing rather than to a guess.
const DREAM_ROLE_THEMES = {
  physician: ['clinical_care', 'surgery_anatomy'],
  nurse: ['clinical_care', 'service'],
  pa: ['clinical_care', 'emergency'],
  mental_health: ['mental_health', 'neuroscience'],
  research: ['research_lab', 'biotech_engineering'],
  other_health: ['rehab_sports', 'chem_pharm'],
};
const WHY_MEDICINE_THEMES = {
  help_people: ['service', 'clinical_care'],
  science: ['research_lab', 'neuroscience'],
  personal: ['clinical_care', 'advocacy_policy'],
  family_field: ['clinical_care'],
  challenge: ['surgery_anatomy', 'research_lab'],
};
const SCIENCE_THEMES = {
  biology: ['research_lab'],
  chemistry: ['chem_pharm'],
  physics: ['biotech_engineering'],
  ap_bio: ['research_lab'],
  ap_chem: ['chem_pharm'],
  anatomy: ['surgery_anatomy'],
};
const EXPERIENCE_THEMES = {
  volunteering: ['service'],
  shadowing: ['clinical_care'],
  club: ['research_lab', 'advocacy_policy'],
  cpr: ['emergency'],
  family_care: ['clinical_care'],
};

// The activity-log buckets each opportunity `type` would land in, used to spot
// "you have nothing at all in this area yet" gaps. Carried over from
// recommendOpportunities.js — Academic and Scholarship stay out on purpose:
// they're recognitions, not ongoing activities, so an empty bucket says nothing.
const TYPE_TO_ACTIVITY_BUCKETS = {
  Research: ['Research'],
  Volunteering: ['Volunteering'],
  Organization: ['Clubs & Organizations', 'Health Club/HOSA'],
  Competition: ['Clubs & Organizations'],
  Program: ['Clinical/Shadowing'],
};
const GAP_PHRASE = {
  Research: 'any research experience',
  Volunteering: 'any volunteering',
  Organization: 'any club or organization',
  Competition: 'any competition',
  Program: 'a structured program like this',
};

const GRADE_KEYS = GRADE_STAGES.map((g) => g.key);
/** 'junior' → '11'. Returns null for 'gap' and anything unrecognized. */
export function gradeNumberFor(gradeStage) {
  const idx = GRADE_KEYS.indexOf(gradeStage);
  return idx >= 0 && idx <= 3 ? String(9 + idx) : null;
}

const lower = (v) => String(v || '').toLowerCase();

/** All the free text an entry offers for keyword matching, lowercased once. */
function haystack(entry) {
  return lower(`${entry.name} ${entry.org} ${entry.desc} ${entry.eligibility} ${(entry.tags || []).join(' ')}`);
}

// Keywords match at a WORD START, not anywhere in the string. A plain
// `includes()` is how "dent" matched *stu*dent — which put the Johns Hopkins
// brain-science internship at the top of a list for someone who picked dental,
// with the reason line cheerfully explaining why. The prefix half is
// deliberate and load-bearing in the other direction: `neuro` still has to
// reach neuroscience/neurology/neural, `surg` surgery/surgical, `dent`
// dental/dentistry. Compiled once per keyword and cached — this runs over 220
// entries × 16 themes on every keystroke in the tuning panel.
const KEYWORD_RE = new Map();
function keywordHits(hay, keyword) {
  let re = KEYWORD_RE.get(keyword);
  if (!re) {
    re = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
    KEYWORD_RE.set(keyword, re);
  }
  return re.test(hay);
}

/** True when any of `themeId`'s keywords appears in `hay` (already lowercased). */
function themeHits(themeId, hay) {
  return (THEME_BY_ID[themeId]?.keywords || []).some((k) => keywordHits(hay, k));
}

/** True when the theme's keywords appear anywhere in this catalog entry. Exported for the verify script. */
export function entryMatchesTheme(entry, themeId) {
  return themeHits(themeId, haystack(entry));
}

/**
 * How many programs in `opportunities` an interest can actually reach.
 *
 * The catalog is a curated ~220, not an index of everything: there are exactly
 * two dental programs and two global-health ones in it. A student who picks
 * those interests is not wrong and should not be silently handed unrelated
 * picks with confident-sounding reasons, so the tab uses this to say plainly
 * how thin the ground is (see OpportunitiesPanel).
 */
export function themeReach(themeId, opportunities = []) {
  return opportunities.filter((o) => entryMatchesTheme(o, themeId)).length;
}

/** The theme ids whose keywords appear anywhere in `text`. */
function themesInText(text) {
  const hay = lower(text);
  if (!hay.trim()) return [];
  return INTEREST_THEMES.filter((t) => themeHits(t.id, hay)).map((t) => t.id);
}

function uniq(list) {
  return [...new Set(list.filter(Boolean))];
}

/**
 * Themes the student never picked but that their signup answers imply.
 * Kept separate from picked themes everywhere downstream so the UI can say
 * "we guessed this from your answers" and let them turn it off.
 */
export function inferThemesFromUser(userRecord) {
  // `user` is legitimately null on the first renders of the Portfolio tab (the profile is loaded
  // asynchronously) and every caller passes it straight through, so this normalizes rather than
  // relying on a default parameter — a default only fires for `undefined`, not for `null`.
  const user = userRecord || {};
  const out = [];
  out.push(...(DREAM_ROLE_THEMES[user.dreamRole] || []));
  out.push(...(WHY_MEDICINE_THEMES[user.whyMedicine] || []));
  for (const s of user.sciences || []) out.push(...(SCIENCE_THEMES[s] || []));
  for (const e of user.healthExperience || []) out.push(...(EXPERIENCE_THEMES[e] || []));
  return uniq(out);
}

/**
 * Themes visible in what the student has ALREADY done — the EC signal. Reads
 * the raw Portfolio rows (activity titles, orgs, descriptions, research titles,
 * skill names, award names) rather than any derived count, because the interest
 * lives in the words, not in the bucket the row was filed under.
 */
export function themesFromPortfolio({ activities = [], research = [], skills = [], awards = [], clinicalHours = [] } = {}) {
  const text = [
    ...activities.map((a) => `${a.position || ''} ${a.organization || ''} ${a.description || ''} ${a.activity_type || ''}`),
    ...research.map((r) => `${r.title || ''} ${r.institution || ''} ${r.description || ''} ${r.mentor_name || ''}`),
    ...skills.map((s) => `${s.name || ''} ${s.issuing_body || ''}`),
    ...awards.map((a) => `${a.title || ''} ${a.level || ''}`),
    ...clinicalHours.map((h) => `${h.site_name || ''} ${h.site_type || ''} ${h.notes || ''}`),
  ].join(' \n ');
  return { themeIds: themesInText(text), text: lower(text) };
}

/**
 * One object describing everything the matcher (and Meta Brain) knows about
 * this student. Built once per render from data the Portfolio tab has already
 * fetched — this function never touches the network.
 *
 * @param {Object}  opts
 * @param {Object}  opts.user        the user record (onboarding answers + saved prefs)
 * @param {Object}  opts.snapshot    buildPortfolioSnapshot() result, or null while loading
 * @param {string}  opts.pathwayKey  active PATHS key
 * @param {Object}  opts.prefs       the tab's own saved prefs (see readPrefs)
 */
export function buildMatchProfile({ user: userRecord = null, snapshot = null, pathwayKey = null, prefs: prefsArg = null } = {}) {
  const user = userRecord || {};
  const prefs = prefsArg || {};
  const activities = snapshot?.activities || [];
  const research = snapshot?.research || [];
  const skills = snapshot?.skills || [];
  const awards = snapshot?.awards || [];
  const clinicalRows = snapshot?.clinicalHours || [];

  const activityTypeCounts = {};
  for (const a of activities) activityTypeCounts[a.activity_type] = (activityTypeCounts[a.activity_type] || 0) + 1;
  const clinicalHours = clinicalRows.reduce((s, h) => s + (Number(h.hours) || 0), 0);

  const { themeIds: ecThemeIds, text: ecText } = themesFromPortfolio({ activities, research, skills, awards, clinicalHours: clinicalRows });
  const inferredThemeIds = inferThemesFromUser(user);
  const chosenThemeIds = uniq(prefs.themeIds || []);

  // What we actually rank on: what they picked, or — until they pick anything —
  // everything we could infer, so the tab is useful on first open instead of empty.
  const activeThemeIds = chosenThemeIds.length ? chosenThemeIds : uniq([...inferredThemeIds, ...ecThemeIds]);

  const pathway = PATHS[pathwayKey] || null;
  const gradeStage = prefs.gradeStage || user.gradeStage || null;

  return {
    chosenThemeIds,
    inferredThemeIds,
    ecThemeIds,
    activeThemeIds,
    usingInferredThemes: !chosenThemeIds.length,
    ecText,
    pathwayKey: pathwayKey || null,
    pathwayLabel: pathway?.label || 'pre-health',
    gradeStage,
    grade: gradeNumberFor(gradeStage),
    activityTypeCounts,
    totalActivities: activities.length,
    clinicalHours,
    researchCount: research.length,
    awardCount: awards.length,
    skillCount: skills.length,
    effortAppetite: prefs.effortAppetite || 'balanced',
    costStance: prefs.costStance || 'any',
    formatPref: prefs.formatPref || 'any',
    hasPortfolioData: !!snapshot,
  };
}

// ── Scoring ──────────────────────────────────────────────────────────────────
// Weights are stated as constants rather than buried in the arithmetic so the
// ranking stays arguable: if picked interests should outrank a pathway tag,
// that's one number to change here, not a rewrite.
const W = {
  chosenTheme: 24,      // per picked interest the entry hits …
  chosenThemeCap: 40,   // … capped, so one very on-theme entry can't run away with it
  inferredTheme: 5,
  inferredThemeCap: 12,
  ecTheme: 4,           // continuity with what they already do
  ecThemeCap: 10,
  pathwayExact: 16,
  pathwayBroad: 7,      // 'exploring' students get credit for any tagged pathway
  gradeListed: 9,
  gradeUnrestricted: 5,
  gap: 12,
  effortMatch: 8,
  effortAdjacent: 4,
  freeBonus: 5,
  formatMatch: 4,
  awardMomentum: 4,     // has awards already → competitions compound
};
// The denominator for the 0-100 "match" number. Deliberately BELOW the
// theoretical max (every bonus at once, ~104) so a genuinely great fit reads as
// a genuinely high number instead of topping out in the sixties.
const MATCH_SCALE = 85;

function scoreEntry(entry, profile) {
  const hay = haystack(entry);
  const reasons = [];
  let score = 0;

  // 1. Interests — the reason this tab exists.
  const hits = (ids) => ids.filter((id) => themeHits(id, hay));
  const chosenHits = hits(profile.chosenThemeIds);
  // Inferred interests are a FALLBACK, not a second opinion: the moment a student picks anything,
  // the guesses stop scoring. Otherwise a student who picks "dental" but told us at signup they
  // wanted research gets a research list with a dental chip on it — the guess quietly outvoting
  // the choice, which is the exact failure this whole tab exists to fix.
  const inferredHits = profile.chosenThemeIds.length ? [] : hits(profile.inferredThemeIds);
  const ecHits = hits(profile.ecThemeIds.filter((id) => !profile.chosenThemeIds.includes(id) && !inferredHits.includes(id)));

  if (chosenHits.length) {
    score += Math.min(chosenHits.length * W.chosenTheme, W.chosenThemeCap);
    const labels = chosenHits.map((id) => THEME_BY_ID[id].label.toLowerCase());
    reasons.push({ type: 'passion', weight: 100, text: `Matches ${labels.slice(0, 2).join(' and ')} — an interest you picked.` });
  }
  if (inferredHits.length) {
    score += Math.min(inferredHits.length * W.inferredTheme, W.inferredThemeCap);
    if (!chosenHits.length) {
      reasons.push({ type: 'passion', weight: 70, text: `Lines up with ${THEME_BY_ID[inferredHits[0]].label.toLowerCase()}, based on what you told us at signup.` });
    }
  }
  if (ecHits.length) {
    score += Math.min(ecHits.length * W.ecTheme, W.ecThemeCap);
    reasons.push({ type: 'ec', weight: 85, text: `Builds directly on the ${THEME_BY_ID[ecHits[0]].label.toLowerCase()} work already in your portfolio.` });
  }

  // 2. Direction.
  const pathways = entry.pathways || [];
  if (profile.pathwayKey && profile.pathwayKey !== 'exploring' && pathways.includes(profile.pathwayKey)) {
    score += W.pathwayExact;
    reasons.push({ type: 'pathway', weight: 80, text: `Directly relevant to your ${profile.pathwayLabel} pathway.` });
  } else if (profile.pathwayKey === 'exploring' && pathways.length) {
    score += W.pathwayBroad;
    reasons.push({ type: 'pathway', weight: 40, text: 'A real look inside a health career while you\'re still narrowing things down.' });
  }

  // 3. Grade. A hard mismatch is filtered out before scoring (see matchOpportunities);
  // this only rewards an entry that names the student's grade explicitly.
  if (profile.grade && entry.grades?.length) {
    score += W.gradeListed;
    reasons.push({ type: 'grade', weight: 30, text: `Open to grade ${profile.grade} students specifically.` });
  } else if (!entry.grades?.length) {
    score += W.gradeUnrestricted;
  }

  // 4. Gaps — the one thing the old recommender got right, kept.
  const buckets = TYPE_TO_ACTIVITY_BUCKETS[entry.type];
  if (buckets && !buckets.some((b) => (profile.activityTypeCounts[b] || 0) > 0)) {
    score += W.gap;
    reasons.push({ type: 'gap', weight: 90, text: `You don't have ${GAP_PHRASE[entry.type] || 'anything like this'} logged yet — this is a real way to start.` });
  }
  if (entry.type === 'Program' && profile.clinicalHours === 0 && /clinic|shadow|hospital/.test(hay)) {
    reasons.push({ type: 'gap', weight: 88, text: 'You have no clinical or shadowing hours logged — this is a low-barrier way to get the first ones.' });
    score += 6;
  }
  if (entry.type === 'Competition' && profile.awardCount > 0) {
    score += W.awardMomentum;
    reasons.push({ type: 'momentum', weight: 50, text: 'You already have awards on file — competitions compound what you\'ve got.' });
  }

  // 5. Practicals.
  const appetite = EFFORT_APPETITES.find((a) => a.id === profile.effortAppetite);
  if (appetite?.prefers) {
    if (entry.effort === appetite.prefers) { score += W.effortMatch; }
    else if (entry.effort === 'Competitive') { score += W.effortAdjacent; }
  } else {
    score += W.effortAdjacent; // 'balanced' plays no favorites
  }
  if (FREE_COSTS.has(entry.cost)) {
    score += W.freeBonus;
    if (entry.cost === 'Free + stipend' || entry.cost === 'Paid role') {
      reasons.push({ type: 'cost', weight: 60, text: entry.cost === 'Paid role' ? 'A paid role — it pays you rather than costing you.' : 'Free to attend and it pays a stipend.' });
    }
  }
  if (profile.formatPref !== 'any' && entry.format === profile.formatPref) score += W.formatMatch;

  return { score, reasons };
}

/** The catch-all when an entry ranks well but nothing specific explains it. */
const FALLBACK_REASON = 'A well-established program that fits where you are right now.';

/**
 * Rank the catalog for one student.
 *
 * Hard filters (applied before scoring, because a recommendation the student
 * cannot act on is worse than one fewer recommendation):
 *   - grade: an entry that lists grades the student isn't in
 *   - cost:  anything not free when they've said free only
 *   - format: a format they've ruled out (entries that don't declare one stay,
 *             since excluding them would silently hide most of the catalog)
 *   - anything already tracked, via `excludeIds`
 *
 * @returns {Array<{item, score, match, reasons, reason, themeIds, rank}>}
 */
export function matchOpportunities({ opportunities = [], profile, count = 6, excludeIds = [], typeFilter = null } = {}) {
  if (!opportunities.length || !profile) return [];
  const skip = new Set(excludeIds);
  const wantFree = profile.costStance === 'free_only';

  const eligible = opportunities.filter((o) => {
    if (skip.has(o.id)) return false;
    if (typeFilter && typeFilter !== 'All' && o.type !== typeFilter) return false;
    if (profile.grade && o.grades?.length && !o.grades.includes(profile.grade)) return false;
    if (wantFree && !FREE_COSTS.has(o.cost)) return false;
    if (profile.formatPref !== 'any' && o.format && o.format !== 'Varies' && o.format !== profile.formatPref) return false;
    return true;
  });

  const scored = eligible.map((o) => {
    const { score, reasons } = scoreEntry(o, profile);
    return { item: o, score, reasons: reasons.sort((a, b) => b.weight - a.weight) };
  }).sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name));

  // Diversity pass — at most 2 of any one type in the shortlist, so a strong
  // interest signal can't return five near-identical research programs.
  const picked = [];
  const usedTypes = new Map();
  const pool = [...scored];
  while (picked.length < count && pool.length) {
    let idx = pool.findIndex((c) => (usedTypes.get(c.item.type) || 0) < 2);
    if (idx === -1) idx = 0;
    const chosen = pool.splice(idx, 1)[0];
    usedTypes.set(chosen.item.type, (usedTypes.get(chosen.item.type) || 0) + 1);
    picked.push(chosen);
  }

  return picked.map((p, i) => ({
    ...p,
    rank: i + 1,
    match: Math.max(20, Math.min(99, Math.round((p.score / MATCH_SCALE) * 100))),
    reason: p.reasons[0]?.text || FALLBACK_REASON,
    themeIds: themesInText(haystack(p.item)),
  }));
}

/**
 * Plain-English lines describing the student — rendered in the UI as "what
 * we're matching on" AND handed to Meta Brain verbatim. One source for both, so
 * the model can never be told something the student wasn't shown.
 */
export function describeProfile(profile) {
  const lines = [];
  const themeLabels = profile.activeThemeIds.map((id) => THEME_BY_ID[id]?.label).filter(Boolean);
  lines.push(themeLabels.length
    ? `Interests: ${themeLabels.join(', ')}${profile.usingInferredThemes ? ' (inferred from their signup answers — they have not picked interests yet)' : ' (picked by the student)'}`
    : 'Interests: none picked yet');
  lines.push(`Target pathway: ${profile.pathwayLabel}`);
  if (profile.gradeStage) lines.push(`Grade: ${GRADE_STAGES.find((g) => g.key === profile.gradeStage)?.label || profile.gradeStage}`);
  lines.push(profile.totalActivities
    ? `Portfolio: ${profile.totalActivities} activities, ${profile.clinicalHours} clinical/shadowing hours, ${profile.researchCount} research entries, ${profile.awardCount} awards`
    : 'Portfolio: nothing logged yet — they are starting from zero');
  const ecLabels = profile.ecThemeIds.map((id) => THEME_BY_ID[id]?.label).filter(Boolean);
  if (ecLabels.length) lines.push(`Themes visible in what they already do: ${ecLabels.join(', ')}`);
  const appetite = EFFORT_APPETITES.find((a) => a.id === profile.effortAppetite);
  if (appetite) lines.push(`Selectivity appetite: ${appetite.label} — ${appetite.sub}`);
  if (profile.costStance === 'free_only') lines.push('Constraint: only free / stipend / paid opportunities');
  if (profile.formatPref !== 'any') lines.push(`Constraint: ${profile.formatPref.toLowerCase()} only`);
  return lines;
}

/**
 * The Meta Brain prompt. The shortlist is passed in full and the model is told,
 * twice and explicitly, that it may not leave it — the catalog's whole premise
 * is that every program named to a student is real (see the header of
 * src/data/opportunities.js), and an invented program is exactly the failure
 * that premise exists to prevent.
 */
export function buildMatchPrompt(profile, matches) {
  const list = matches.map((m, i) => (
    `${i + 1}. ${m.item.name} — ${m.item.type}, ${m.item.level}, ${m.item.effort}${m.item.cost ? `, ${m.item.cost}` : ''}. Ranked ${m.match}% match because: ${m.reason}`
  )).join('\n');
  // The structured facts, where we have them. This is the ONLY source of dates,
  // ages and money the model is allowed to use: without it, a model asked about
  // SIMR will happily produce a deadline from memory, and a confidently wrong
  // February date is worse than no date at all.
  const factLines = matches
    .map((m) => ({ m, f: PROGRAM_BY_ID[m.item.id] }))
    .filter((x) => x.f)
    .map(({ m, f }) => {
      const bits = [];
      // How many days out the NEXT occurrence is, computed rather than
      // remembered. Without it the model can say "the deadline is in February"
      // to a student reading this in March and be technically correct and
      // practically useless — the useful sentence is "that is eleven months
      // away, so this is next year's".
      const dl = nextDeadline(f);
      if (dl?.daysOut != null) {
        bits.push(`next deadline is ${dl.label}, ${dl.daysOut} days away${dl.passedThisCycle ? " (this year's has already passed, so that is next cycle)" : ''}`);
      }
      if (f.deadline?.note) bits.push(`deadline: ${f.deadline.note}`);
      if (f.minAge != null) bits.push(`minimum age ${f.minAge}`);
      if (f.minGrade != null) bits.push(`grade ${f.minGrade}${f.maxGrade && f.maxGrade !== f.minGrade ? `-${f.maxGrade}` : ''} only`);
      if (f.citizenship) bits.push(f.citizenship === 'us' ? 'US citizenship required' : 'US citizenship or green card required');
      if (f.cost?.note) bits.push(`cost: ${f.cost.note}`);
      if (f.selectivity) bits.push(`selectivity: ${f.selectivity}`);
      if (f.tier === 'pay_to_play') bits.push('OPEN ENROLLMENT — anyone who pays attends, so it is not a selective credential');
      return `- ${m.item.name}: ${bits.join('; ')}`;
    });

  return [
    'You are Meta Brain, advising one high-school pre-health student on which opportunities and competitions to pursue.',
    '',
    'THE STUDENT:',
    ...describeProfile(profile).map((l) => `- ${l}`),
    '',
    'THE SHORTLIST (already ranked deterministically against their real portfolio — this is your entire universe of programs):',
    list,
    ...(factLines.length ? ['', 'VERIFIED FACTS for some of those programs (the only dates, ages, citizenship rules and costs you may state):', ...factLines] : []),
    '',
    'Write 3-5 short sentences, addressed to them as "you":',
    '1. Name the through-line you see in their interests and what they have already done.',
    '2. Say which ONE of the numbered programs above to start with, and why it specifically fits them — the reason has to be about THEM, not about the program being good.',
    '3. Name one other program from the list worth lining up after it.',
    '4. If their portfolio has an obvious hole (no clinical hours, no research, nothing logged at all), say so plainly and kindly.',
    '',
    'Be honest rather than encouraging where the two conflict:',
    '- If something you name is a genuine reach for where they are right now, say the word "reach" and say what would make it less of one.',
    '- If a cheaper or free option on the list would serve them just as well as a costly one, say so and name it. Cost is the binding constraint for most students here.',
    '- If a program has an age, grade or citizenship gate they may not clear, name the gate rather than the disappointment.',
    '',
    'Hard rules: only ever name programs from the numbered list above — never invent, substitute, or recall a program from elsewhere. Never state a deadline, fee, age minimum or acceptance rate that is not in the VERIFIED FACTS block, and when you do state one, add that they should confirm it on the official page. No headings, no bullet points, no preamble — just the paragraph.',
  ].join('\n');
}

// ── Saved preferences ────────────────────────────────────────────────────────
// Stored on the user record under one key so the whole tuning panel is a single
// saveUser() write, and so a student's picks survive a device change with the
// rest of their account rather than living in localStorage.
export const PREFS_KEY = 'opportunityPrefs';

// ── The application pipeline ─────────────────────────────────────────────────
// The Opportunities tab used to have exactly two states for a program: you had
// tracked it, or you hadn't. That is a bookmark, not a pipeline, and it is why
// students would save eleven programs in October and apply to none of them —
// nothing in the interface distinguished "I might do this" from "my essay is
// half written and the deadline is Tuesday".
//
// These five stages live in prefs rather than in a table because until you
// submit, a stage is an intention rather than a record. The moment it becomes a
// record — you were accepted — it belongs in Activities & Honors, and the
// 'accepted' stage says so.
export const PIPELINE_STAGES = [
  { id: 'interested', label: 'Interested', colorKey: 't3', sub: 'On your list' },
  { id: 'preparing', label: 'Preparing', colorKey: 'blue', sub: 'Gathering what it asks for' },
  { id: 'applying', label: 'Applying', colorKey: 'amber', sub: 'Writing it now' },
  { id: 'submitted', label: 'Submitted', colorKey: 'violet', sub: 'Sent — waiting' },
  { id: 'accepted', label: 'Accepted', colorKey: 'green', sub: 'Log it in Activities & Honors' },
];
export const STAGE_BY_ID = Object.fromEntries(PIPELINE_STAGES.map(s => [s.id, s]));
/** The stages that mean a student still has work to do before a deadline. */
export const ACTIVE_STAGES = ['interested', 'preparing', 'applying'];

export const DEFAULT_PREFS = Object.freeze({
  themeIds: [], effortAppetite: 'balanced', costStance: 'any', formatPref: 'any', gradeStage: null,
  // Two-letter state code, used to hide programs a student is not eligible for
  // on residency grounds. Never inferred from anything — a wrong guess here
  // hides real opportunities silently, which is the worst failure mode there
  // is, so it stays null until the student says.
  homeState: null,
  // ── Local opportunity matching consent (optional, revocable) ────────────────
  // Deliberately separate from `homeState` above, which is an eligibility filter the student
  // enters as part of normal tuning. This pair exists specifically so ZIP/state can additionally
  // be used to surface NEARBY activities/volunteer roles/programs/internships/competitions, and
  // only when the student has explicitly opted in — see the "Local opportunity matching" card in
  // OpportunitiesPanel.jsx. `zipCode` and `localMatchState` are never read by anything unless
  // `localMatchConsent` is true; turning consent off is what "revoking" means, and nothing in the
  // app should read these two fields while it is false.
  localMatchConsent: false,
  localMatchConsentAt: null,
  localMatchConsentRevokedAt: null,
  zipCode: null,
  localMatchState: null,
  // programId -> PIPELINE_STAGES id.
  stages: {},
  // eventId -> level id, for the HOSA competitive events a student is chasing
  // (see HOSA_EVENTS in src/data/opportunityPrograms.js). Lives here rather
  // than in its own resource because it is a preference — "I intend to compete
  // in Medical Terminology" — until it becomes a placement, at which point it
  // belongs in Activities & Honors as an award.
  hosa: {},
});

/** Saved prefs merged over the defaults, with anything unrecognized dropped. */
export function readPrefs(user) {
  const raw = user?.[PREFS_KEY] || {};
  return {
    ...DEFAULT_PREFS,
    ...raw,
    themeIds: (raw.themeIds || []).filter((id) => THEME_BY_ID[id]),
    effortAppetite: EFFORT_APPETITES.some((a) => a.id === raw.effortAppetite) ? raw.effortAppetite : DEFAULT_PREFS.effortAppetite,
    costStance: COST_STANCES.some((c) => c.id === raw.costStance) ? raw.costStance : DEFAULT_PREFS.costStance,
    formatPref: FORMAT_PREFS.some((f) => f.id === raw.formatPref) ? raw.formatPref : DEFAULT_PREFS.formatPref,
    gradeStage: GRADE_KEYS.includes(raw.gradeStage) ? raw.gradeStage : DEFAULT_PREFS.gradeStage,
    hosa: (raw.hosa && typeof raw.hosa === 'object' && !Array.isArray(raw.hosa)) ? raw.hosa : {},
    homeState: /^[A-Z]{2}$/.test(String(raw.homeState || '').toUpperCase()) ? String(raw.homeState).toUpperCase() : null,
    localMatchConsent: !!raw.localMatchConsent,
    localMatchConsentAt: raw.localMatchConsentAt || null,
    localMatchConsentRevokedAt: raw.localMatchConsentRevokedAt || null,
    // Never trust a stored ZIP/state for matching once consent is false, even if the raw values
    // are still sitting on the record — see the field comment on DEFAULT_PREFS above.
    zipCode: raw.localMatchConsent && /^\d{5}$/.test(String(raw.zipCode || '')) ? String(raw.zipCode) : (raw.zipCode || null),
    localMatchState: /^[A-Z]{2}$/.test(String(raw.localMatchState || '').toUpperCase()) ? String(raw.localMatchState).toUpperCase() : null,
    // Anything not a real stage id is dropped rather than kept: a stale value
    // from an older build would otherwise render as a blank chip forever.
    stages: Object.fromEntries(
      Object.entries((raw.stages && typeof raw.stages === 'object' && !Array.isArray(raw.stages)) ? raw.stages : {})
        .filter(([, v]) => STAGE_BY_ID[v]),
    ),
  };
}

/** How many programs sit in each pipeline stage. Drives the tab's header counts. */
export function stageCounts(stages = {}) {
  const out = Object.fromEntries(PIPELINE_STAGES.map(s => [s.id, 0]));
  for (const v of Object.values(stages)) if (out[v] != null) out[v] += 1;
  return out;
}

/** A new user object with `patch` merged into the saved prefs. Never mutates. */
export function writePrefs(user, patch) {
  return { ...(user || {}), [PREFS_KEY]: { ...readPrefs(user), ...patch } };
}

/**
 * The ONE place anything in the app may read a student's ZIP/state for local-opportunity
 * matching. Returns null unless the student explicitly opted in — a caller that reaches for
 * `prefs.zipCode` directly instead of this function is exactly the bug this exists to prevent.
 */
export function usableLocation(prefs) {
  if (!prefs?.localMatchConsent) return null;
  if (!prefs.zipCode && !prefs.localMatchState) return null;
  return { zipCode: prefs.zipCode || null, state: prefs.localMatchState || null };
}

/** Turns local-opportunity-matching consent on, stamping when. Never infers ZIP/state itself. */
export function grantLocalMatchConsent(user, { zipCode = null, state = null } = {}) {
  return writePrefs(user, {
    localMatchConsent: true, localMatchConsentAt: new Date().toISOString(), localMatchConsentRevokedAt: null,
    zipCode, localMatchState: state,
  });
}

/**
 * Revokes consent. Deliberately does NOT delete the stored ZIP/state — the student may want to
 * turn matching back on later without retyping — it only flips the flag every consumer must
 * check, which is what "stop using it for matching" means everywhere else in this file.
 */
export function revokeLocalMatchConsent(user) {
  return writePrefs(user, { localMatchConsent: false, localMatchConsentRevokedAt: new Date().toISOString() });
}
