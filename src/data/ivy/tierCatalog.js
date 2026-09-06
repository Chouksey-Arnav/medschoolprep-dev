// ─────────────────────────────────────────────────────────────────────────────
// Activity tiers, the award catalog, and the academic-department vocabularies.
//
// ── PREMIUM ROADMAP ─────────────────────────────────────────────────────────
// Part of the Narrative Method Engine, planned as a paid tier. See PREMIUM in
// src/lib/ivy/constants.js.
// ────────────────────────────────────────────────────────────────────────────
//
// Module 3 needs to place every activity in a student's list into Tier 1
// (identity-defining), Tier 2 (signal-reinforcing) or Tier 3 (character-
// building) before it can measure the shape of the portfolio. That
// classification is the single most consequential judgment this engine makes,
// because it is the one a student will argue with, and it is the one that
// decides whether they are told to build something new.
//
// ── So it is evidence-led, and it defaults DOWN ────────────────────────────
// Two rules, and the second matters more than the first:
//
//   1. A tier is earned by a VERIFIABLE FACT — a named award at a known scale,
//      a computed selectivity index, a publication, a registered entity, a
//      headcount, a role with a duration. Not by adjectives in the description.
//   2. When the evidence is thin, the activity lands in the LOWER tier and the
//      engine says which single fact would move it up.
//
// Defaulting down is uncomfortable and it is correct. A tool that reads
// "founder" and awards Tier 1 tells a student their school club is a national
// distinction, and the first person to correct them will be an admissions
// officer, in April, in a letter. This file would rather be argued with in
// September.
//
// ── What Tier 1 is not ─────────────────────────────────────────────────────
// Tier 1 is not "the thing you care most about". Caring is measured elsewhere
// (the Value-Based Theme, src/lib/ivy/theme.js). Tier is a claim about how a
// stranger reading 40,000 files reads one line — nothing more, and the engine
// says so on screen every time it assigns one.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The tier definitions, with the ideal counts the Portfolio Balance Score
 * targets: exactly 1 Tier 1, 3 Tier 2, 4 Tier 3 (T⃗ = [1, 3, 4]).
 */
export const TIERS = {
  1: {
    tier: 1, key: 'tier1', label: 'Tier 1 — identity-defining', target: 1, penaltyWeight: 0.5,
    short: 'National or international recognition, published work, or a self-directed venture with verified reach.',
    reads_as: 'A reader remembers this line after closing the file.',
    examples: [
      'Peer-reviewed publication or a preprint with a named mentor',
      'ISEF finalist or category award',
      'USAMO / USACO Platinum / national Olympiad qualification',
      'Scholastic Art & Writing national gold medal',
      'RSI, TASP, or a comparable single-digit-admit summer program',
      'A registered venture or nonprofit with independently verifiable reach',
    ],
  },
  2: {
    tier: 2, key: 'tier2', label: 'Tier 2 — signal-reinforcing', target: 3, penaltyWeight: 0.3,
    short: 'State or regional recognition, or a leadership role with outcomes you can count.',
    reads_as: 'Corroborates the Tier 1 claim. Three of these make one spike believable.',
    examples: [
      'State science fair placement, regional DECA or Science Olympiad medal',
      'Founder or president of a club with measurable outcomes — headcount, funds, an event series',
      'A university research internship with a named PI',
      'All-state music, varsity captain of a competitive program',
      'U.S. Congressional Award (Gold)',
    ],
  },
  3: {
    tier: 3, key: 'tier3', label: 'Tier 3 — character-building', target: 4, penaltyWeight: 0.2,
    short: 'School-level membership, weekly service, sport, job, or family responsibility.',
    // Deliberately written to defend Tier 3 rather than dismiss it. The most
    // common misreading of this framework is that Tier 3 is filler; the engine
    // must never imply that a student's paid job or their care work is filler.
    reads_as: 'This is where the texture of a life is. Paid work and family care belong here and are read seriously — the tier is about how a line SCANS, not about what it costs you.',
    examples: [
      'Club membership, section leader, JV or varsity participation',
      'Weekly volunteering at a fixed site',
      'A part-time job',
      'Sibling care and household responsibility',
      'School play, marching band, yearbook',
    ],
  },
};

export const TIER_TARGETS = [TIERS[1].target, TIERS[2].target, TIERS[3].target];      // T⃗ = [1, 3, 4]
export const TIER_PENALTIES = [TIERS[1].penaltyWeight, TIERS[2].penaltyWeight, TIERS[3].penaltyWeight]; // β⃗

/**
 * Named distinctions whose tier is a matter of public record rather than of
 * judgment. Matching one of these skips the heuristics entirely.
 *
 * `scale` feeds the competition selectivity index (module 11); `ratio` is the
 * published or well-estimated winners-to-participants ratio where one exists,
 * so a student who does not know the counts still gets a real index.
 */
export const AWARD_CATALOG = [
  // ── International ────────────────────────────────────────────────────────
  { id: 'imo', re: /\b(international mathematical olympiad|IMO)\b/i, tier: 1, scale: 'international', ratio: 0.0002, label: 'International Mathematical Olympiad' },
  { id: 'ipho', re: /\binternational (physics|chemistry|biology|informatics) olympiad\b/i, tier: 1, scale: 'international', ratio: 0.0002 },
  { id: 'isef', re: /\b(ISEF|international science and engineering fair|regeneron isef)\b/i, tier: 1, scale: 'international', ratio: 0.004, label: 'Regeneron ISEF' },
  { id: 'iyps', re: /\binternational (young )?physicists'? tournament\b/i, tier: 1, scale: 'international', ratio: 0.01 },
  { id: 'publication', re: /\b(peer[- ]reviewed|published (a )?(paper|article|study)|first author|co[- ]?author(ed)?|journal of|preprint|arxiv|biorxiv|pubmed)\b/i, tier: 1, scale: 'international', ratio: 0.02, label: 'Peer-reviewed publication' },
  { id: 'patent', re: /\b(patent (granted|filed|pending)|USPTO)\b/i, tier: 1, scale: 'international', ratio: 0.01 },

  // ── National ─────────────────────────────────────────────────────────────
  { id: 'usamo', re: /\b(USAMO|USAJMO)\b/i, tier: 1, scale: 'national', ratio: 0.0004, label: 'USA(J)MO qualifier' },
  { id: 'aime', re: /\b(AIME)\b/i, tier: 2, scale: 'national', ratio: 0.05, label: 'AIME qualifier' },
  { id: 'usaco-plat', re: /\bUSACO\b.{0,20}\bplatinum\b/i, tier: 1, scale: 'national', ratio: 0.005 },
  { id: 'usaco-gold', re: /\bUSACO\b.{0,20}\bgold\b/i, tier: 2, scale: 'national', ratio: 0.03 },
  { id: 'sts', re: /\b(regeneron science talent search|science talent search|STS (finalist|scholar))\b/i, tier: 1, scale: 'national', ratio: 0.01 },
  { id: 'scholastic-national', re: /\bscholastic\b.{0,40}\b(national (gold|silver) medal|gold medal portfolio)\b/i, tier: 1, scale: 'national', ratio: 0.01 },
  { id: 'presidential-scholar', re: /\b(u\.?s\.? )?presidential scholars?\b/i, tier: 1, scale: 'national', ratio: 0.0008 },
  { id: 'nmf', re: /\bnational merit (finalist|semifinalist|scholar)\b/i, tier: 2, scale: 'national', ratio: 0.005, label: 'National Merit' },
  { id: 'rsi', re: /\b(RSI|research science institute)\b/i, tier: 1, scale: 'international', ratio: 0.03 },
  { id: 'tasp', re: /\b(TASP|telluride association summer)\b/i, tier: 1, scale: 'national', ratio: 0.03 },
  { id: 'mites', re: /\b(MITES|SSP|summer science program|clark scholars|garcia program)\b/i, tier: 2, scale: 'national', ratio: 0.05 },
  { id: 'congressional-gold', re: /\bcongressional award\b.{0,20}\bgold\b|\bgold medal\b.{0,20}\bcongressional\b/i, tier: 2, scale: 'national', ratio: 0.05, label: 'U.S. Congressional Award, Gold' },
  { id: 'congressional', re: /\b(u\.?s\.? )?congressional award\b/i, tier: 2, scale: 'national', ratio: 0.05 },
  { id: 'deca-nat', re: /\b(DECA|FBLA|HOSA|FFA|BPA)\b.{0,40}\b(international|national)\b.{0,20}\b(finalist|placement|winner|champion|1st|2nd|3rd|top \d+)\b/i, tier: 1, scale: 'national', ratio: 0.01 },
  { id: 'nsda-nat', re: /\b(NSDA|national speech and debate|TOC|tournament of champions)\b.{0,30}\b(qualifier|octafinalist|quarterfinalist|semifinalist|champion|bid)\b/i, tier: 1, scale: 'national', ratio: 0.01 },
  { id: 'boys-girls-state', re: /\b(boys'? state|girls'? state|boys'? nation|girls'? nation)\b/i, tier: 2, scale: 'state', ratio: 0.02 },

  // ── State / regional ─────────────────────────────────────────────────────
  { id: 'state-fair', re: /\bstate (science fair|history day|solo and ensemble)\b/i, tier: 2, scale: 'state', ratio: 0.05 },
  { id: 'all-state', re: /\ball[- ]state\b/i, tier: 2, scale: 'state', ratio: 0.03 },
  { id: 'state-champ', re: /\bstate (champion|championship|finalist|qualifier|placement|medal)\b/i, tier: 2, scale: 'state', ratio: 0.04 },
  { id: 'regional-medal', re: /\bregional\b.{0,30}\b(champion|first place|1st place|gold|medal|winner|finalist)\b/i, tier: 2, scale: 'regional', ratio: 0.08 },
  { id: 'science-olympiad-state', re: /\bscience olympiad\b.{0,30}\b(state|regional)\b/i, tier: 2, scale: 'state', ratio: 0.08 },

  // ── Local — named here so the engine does not have to guess them upward ──
  { id: 'honor-roll', re: /\b(honou?r roll|principal'?s list|dean'?s list|nhs|national honou?r society)\b/i, tier: 3, scale: 'local', ratio: 0.3 },
  { id: 'school-award', re: /\bschool\b.{0,20}\b(award|recognition|student of the (month|year))\b/i, tier: 3, scale: 'local', ratio: 0.2 },
  { id: 'perfect-attendance', re: /\bperfect attendance\b/i, tier: 3, scale: 'local', ratio: 0.4 },
];

/**
 * Heuristics applied when nothing in the catalog matches — the common case.
 *
 * Ordered; the first rule that fires wins. Every rule carries the fact it keyed
 * off (`because`) so the panel can show its reasoning, and `promotion` — the
 * one thing that would move this activity up a tier — because the whole point
 * of a tier is to be actionable.
 */
export const TIER_HEURISTICS = [
  {
    id: 'registered-venture', tier: 1,
    test: (a) => /\b(501\s?\(?c\)?\s?\(?3\)?|registered (nonprofit|charity)|incorporated|LLC|C-?corp)\b/i.test(a.text) && (a.participantsCount || 0) >= 250,
    because: 'a registered entity with verifiable reach in the hundreds',
  },
  {
    id: 'founder-scaled', tier: 1,
    test: (a) => a.isFounder && (a.participantsCount || 0) >= 1000,
    because: 'a self-directed venture reaching over a thousand people',
  },
  {
    id: 'international-scale', tier: 1,
    test: (a) => a.scale === 'international' && (a.isFounder || a.isLeader),
    because: 'a leadership role at international scale',
  },
  {
    id: 'national-placement', tier: 1,
    test: (a) => a.scale === 'national' && (a.winnersCount || 0) > 0 && (a.participantsCount || 0) / Math.max(1, a.winnersCount) >= 20,
    because: 'a placement at national scale in a field of the size you reported',
  },
  {
    id: 'founder-real', tier: 2,
    test: (a) => (a.isFounder || a.isLeader) && (a.participantsCount || 0) >= 40 && a.yearsInvolved >= 2,
    because: 'a sustained leadership role with a countable outcome',
  },
  {
    id: 'research-role', tier: 2,
    test: (a) => /\b(research|laborator|lab\b|PI\b|principal investigator|clinical trial|data analysis)\b/i.test(a.text) && a.yearsInvolved >= 1,
    because: 'a research role held for a year or more',
  },
  {
    id: 'state-regional', tier: 2,
    test: (a) => (a.scale === 'state' || a.scale === 'regional') && (a.winnersCount || 0) > 0,
    because: 'recognition at state or regional scale',
  },
  {
    id: 'captain-multi-year', tier: 2,
    test: (a) => a.isLeader && a.yearsInvolved >= 3,
    because: 'a leadership position held across multiple years',
  },
  {
    id: 'founder-thin', tier: 3,
    test: (a) => a.isFounder,
    because: 'founding a group, with no external validation or scale reported yet',
    promotion: 'A founder line is read as Tier 3 until something outside the school confirms it. One verifiable number — members, dollars, attendees, a partner organization — moves it.',
  },
];

/**
 * Academic-department vocabularies for M₄ (the Domino framework's academic
 * connection milestone), and for testing whether a "why major" essay is
 * actually about the major.
 *
 * These are not course catalogs. They are the words a department's own syllabi
 * use, which is what the milestone is defined against.
 */
export const DEPARTMENT_VOCABULARY = {
  biology: 'cell molecular genetics organism evolution ecology physiology biochemistry protein gene expression laboratory dissection microscopy assay culture enzyme metabolism neuroscience immunology microbiology anatomy',
  chemistry: 'organic inorganic physical analytical synthesis reaction stoichiometry titration spectroscopy chromatography compound molecule bond equilibrium thermodynamics kinetics laboratory reagent catalysis polymer',
  'pre-med': 'clinical patient physician medicine health care hospital diagnosis treatment anatomy physiology pathology public health epidemiology shadowing bedside triage nursing pharmacology oncology',
  'public-health': 'epidemiology population health disparity access outcomes prevention screening policy community intervention biostatistics determinants equity vaccination surveillance cohort',
  'computer-science': 'algorithm data structure computation software programming complexity systems network machine learning compiler architecture database distributed language runtime memory recursion',
  engineering: 'design constraint prototype fabrication tolerance mechanical electrical control system materials stress load circuit signal manufacturing CAD iteration testing failure analysis',
  economics: 'market price incentive supply demand equilibrium elasticity trade policy macroeconomic microeconomic econometrics regression welfare monetary fiscal exchange rate inflation labor development',
  'political-science': 'government institution policy legislature constitution electoral democracy representation federalism comparative international relations sovereignty public opinion regulation governance',
  'education-policy': 'curriculum pedagogy district equity access funding achievement gap assessment enrollment teacher preparation school reform accountability outcomes literacy tracking counselor ratio',
  psychology: 'cognition behavior memory perception development social clinical experiment participant stimulus response neural bias attachment conditioning disorder therapy statistics',
  mathematics: 'proof theorem algebra analysis topology geometry number theory combinatorics probability linear space function continuity convergence structure abstract',
  physics: 'mechanics electromagnetism quantum relativity thermodynamics particle field wave energy momentum experiment measurement uncertainty optics condensed matter',
  'environmental-science': 'ecosystem climate carbon emissions biodiversity watershed sustainability conservation pollutant remediation soil habitat modeling policy renewable',
  english: 'literature narrative rhetoric poetics criticism close reading text author genre form prose verse interpretation archive canon composition',
  history: 'archive primary source historiography period revolution empire colonial movement chronology evidence interpretation context nation memory',
  art: 'composition medium form line color figure studio portfolio critique exhibition drawing painting sculpture printmaking design visual practice',
  business: 'strategy operations finance marketing revenue margin customer market entry accounting valuation supply chain management entrepreneurship venture',
  nursing: 'patient care assessment vital signs clinical rotation bedside triage medication administration nursing process charting acute chronic caregiving',
};

/** Every department key, for the intake dropdown. */
export const DEPARTMENTS = Object.keys(DEPARTMENT_VOCABULARY);

/** Best-effort mapping from a free-text major to a department key. */
export function resolveDepartment(major) {
  const m = String(major || '').toLowerCase().trim();
  if (!m) return null;
  if (DEPARTMENT_VOCABULARY[m]) return m;
  const aliases = [
    [/\b(pre-?med|medicine|physician|md\b)/, 'pre-med'],
    [/\b(bio|biolog|biomed|neurosci|genetic)/, 'biology'],
    [/\b(chem|biochem)/, 'chemistry'],
    [/\b(public health|epidemi|global health)/, 'public-health'],
    [/\b(cs\b|computer|software|informatic|data sci)/, 'computer-science'],
    [/\b(engineer|mechatron|robotic)/, 'engineering'],
    [/\b(econ|finance)/, 'economics'],
    [/\b(education|teaching|pedagog)/, 'education-policy'],
    [/\b(political|government|public policy|international relations)/, 'political-science'],
    [/\b(psych|cognitive)/, 'psychology'],
    [/\b(math|statistic)/, 'mathematics'],
    [/\bphysic/, 'physics'],
    [/\b(environment|climate|ecolog|sustainab)/, 'environmental-science'],
    [/\b(english|literature|creative writing)/, 'english'],
    [/\bhistor/, 'history'],
    [/\b(art|studio|design|illustrat)/, 'art'],
    [/\b(business|management|marketing|entrepreneur)/, 'business'],
    [/\bnurs/, 'nursing'],
  ];
  return aliases.find(([re]) => re.test(m))?.[1] || null;
}
