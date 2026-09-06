// ─────────────────────────────────────────────────────────────────────────────
// The Roadmap catalog's schema, vocabularies, and the integrity rules every
// entry in this folder is held to.
//
// ── Why a curated catalog exists at all ──────────────────────────────────────
// The Roadmap tab's whole promise is "here is the exact date". A language model
// asked for exact dates will produce them — fluently, confidently, and often
// wrong. "The Coca-Cola Scholars application is due October 31" is the kind of
// sentence that reads as authoritative to a seventeen-year-old and costs them a
// $20,000 scholarship when the real date was October 2. There is no prompt that
// makes a model reliable about a hundred separate organizations' calendars.
//
// So the division of labor is strict, and it is the single most important
// design decision in this feature:
//
//   THE CATALOG OWNS FACTS.     Which programs exist, who is eligible, roughly
//                               when they open and close, what they cost, and
//                               where to confirm. Hand-written, source-linked.
//   THE MODEL OWNS JUDGMENT.   Which of these fit THIS student, in what order,
//                               at what intensity, with what preparation, and
//                               why. That is advising, and it is what a model is
//                               genuinely good at.
//
// The generator (src/lib/roadmap/generator.js) is only ever given catalog ids to
// choose from, and anything it returns that is not a real id is dropped rather
// than rendered. See resolveCatalogSelection() there.
//
// ── The honesty rules (do not relax these) ───────────────────────────────────
//  1. EVERY ENTRY IS A REAL, INDEPENDENTLY VERIFIABLE PROGRAM. No invented
//     names, no invented organizations, no invented URLs. If you cannot find the
//     official page, the entry does not go in.
//  2. `confidence` IS NOT DECORATION. It is rendered to the student on every
//     card and it changes the sentence the UI writes:
//        'fixed'   — the date is structurally the same every year and is set by
//                    the institution itself (Common App opens Aug 1; ED I is
//                    Nov 1; FAFSA opens Oct 1; AP exams are the first two weeks
//                    of May). Shown as a date.
//        'typical' — the program runs on a predictable annual rhythm but the
//                    exact day moves (most scholarships, most summer programs).
//                    Shown as a WINDOW ("opens early January, closes late
//                    February") plus a "confirm on the official site" line.
//        'varies'  — genuinely local/chapter-dependent (regional science fairs,
//                    hospital volunteer intakes). Shown as a season, never a
//                    date, and the roadmap tells the student to find their local
//                    chapter's date and enter it.
//     A 'typical' entry must never be rendered as a hard date anywhere.
//
//     ── The subtlety that trips people up ──
//     A 'varies' entry MAY still carry a `window`. That window is a SCHEDULING
//     ESTIMATE and nothing else: it exists so the item lands in roughly the
//     right season and gets a sensible lead time, because an item with no
//     position at all cannot be planned around and quietly becomes invisible.
//     It is never shown to the student. The rule that enforces this is
//     `displaysExactDate()` below — every surface that renders a date calls it,
//     and scripts/verifyRoadmap.mjs asserts that no 'varies' entry can pass it.
//     That is why a 'varies' entry is REQUIRED to carry a human-readable
//     `season` string: that string is the only thing the UI is allowed to show,
//     so an entry without one has nothing to render.
//  3. NO PAY-TO-ATTEND PRESTIGE PRODUCTS. Same line src/data/opportunities.js
//     already draws: the leadership "summits" that mail teenagers congratulatory
//     nominations are excluded, no matter how well they market. Every entry here
//     is free, need-blind/aided, or merit-selective.
//  4. AMOUNTS AND CUTOFFS ARE RANGES, NOT PROMISES. Same rule as
//     src/data/scholarships.js.
//
// ── Why this is a separate catalog from opportunities.js/scholarships.js ─────
// Those two are BROWSABLE REFERENCE: a student goes looking, filters, and reads.
// Nothing in them is dated, because a browsable list does not need to be — and
// deliberately so (see the header of opportunities.js on why it has no `url`).
//
// A roadmap cannot work that way. It has to answer "what do I do in March",
// which means every entry needs a resolvable position on a calendar, a lead
// time before that position, and a grade gate — three fields those files
// correctly do not carry. Rather than bolt scheduling data onto a reference
// list and make both jobs worse, this catalog carries it, and CROSS-LINKS back
// by id (`opportunityId` / `scholarshipId`) so a roadmap card can open the full
// reference entry the student can already browse. verifyRoadmap.mjs checks
// every cross-link resolves.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The lanes a roadmap is built out of. A roadmap that is 90% one track is a bad
 * roadmap regardless of how good each item is, so the generator is scored on
 * spread across these (see balanceReport in src/lib/roadmap/model.js).
 *
 * `colorKey` names a key on the palette in src/lib/theme.js. This module stays
 * free of theme imports so the whole catalog can be loaded under plain Node by
 * scripts/verifyRoadmap.mjs.
 */
export const ROADMAP_TRACKS = [
  {
    id: 'application', label: 'Applications', colorKey: 'violet', short: 'Apply',
    blurb: 'The dates that cannot slip — opening days, submission deadlines, decisions.',
  },
  {
    id: 'competition', label: 'Competitions', colorKey: 'gold', short: 'Compete',
    blurb: 'Registration windows and contest days. The distinguishing half of an application.',
  },
  {
    id: 'program', label: 'Programs', colorKey: 'teal', short: 'Programs',
    blurb: 'Summer research, hospital and pipeline programs — applied for months before they run.',
  },
  {
    id: 'scholarship', label: 'Scholarships', colorKey: 'green', short: 'Money',
    blurb: 'Award cycles, with enough lead time to actually write the essays.',
  },
  {
    id: 'testing', label: 'Testing', colorKey: 'sky', short: 'Tests',
    blurb: 'Registration deadlines and exam days, back-planned from score-report timing.',
  },
  {
    id: 'aid', label: 'Financial aid', colorKey: 'emerald', short: 'Aid',
    blurb: 'FAFSA, CSS Profile, and the state windows that close first.',
  },
  {
    id: 'experience', label: 'Experience', colorKey: 'cyan', short: 'Experience',
    blurb: 'Clinical hours, shadowing, certifications, and the intakes that gate them.',
  },
  {
    id: 'academics', label: 'Academics', colorKey: 'amber', short: 'Academics',
    blurb: 'Course selection, grade checkpoints, and the exam weeks around them.',
  },
  {
    id: 'essays', label: 'Essays', colorKey: 'fuchsia', short: 'Essays',
    blurb: 'Drafting windows, sized to the real writing time rather than the due date.',
  },
  {
    id: 'relationships', label: 'Recommenders', colorKey: 'pink', short: 'People',
    blurb: 'Asking, reminding, and thanking — all of it earlier than feels necessary.',
  },
];
export const TRACK_IDS = ROADMAP_TRACKS.map((t) => t.id);
export const TRACK_BY_ID = Object.fromEntries(ROADMAP_TRACKS.map((t) => [t.id, t]));

/**
 * How confident we are in the DATE. Rendered on every card — see rule 2 above.
 * Ordered loosest → tightest so a caller can compare.
 */
export const CONFIDENCE = ['varies', 'typical', 'fixed'];

/**
 * How hard the thing is to get, which is not the same as how hard it is to DO.
 * The roadmap uses this to keep a slate honest: a plan made entirely of
 * `lottery` entries is a plan to be rejected eight times, so the generator is
 * required to pair every reach with something in reach (see SLATE_RULES).
 */
export const SELECTIVITY = ['open', 'selective', 'highly-selective', 'lottery'];

/**
 * Real hours-per-week while it is running. The intake asks the student how much
 * time they actually have, and anything above their answer is either dropped or
 * explicitly flagged as a stretch — never silently scheduled.
 */
export const EFFORT = ['light', 'moderate', 'heavy', 'immersive'];

/** Where the thing physically happens — the axis that decides feasibility for a rural student. */
export const FORMATS = ['in-person', 'virtual', 'hybrid', 'varies'];

/** What it costs the family, before aid. `free-plus-stipend` entries are promoted for tight budgets. */
export const COSTS = ['free', 'free-plus-stipend', 'entry-fee', 'paid-tuition-aid-available', 'paid-tuition', 'varies'];

/**
 * The class years an entry is for. Matches GRADE_STAGES keys in
 * src/data/constants.js minus 'gap', which never gates a catalog entry — a
 * post-grad student's roadmap is built from the senior slate plus gap-specific
 * anchors rather than from its own catalog.
 */
export const GRADES = ['9', '10', '11', '12'];

/**
 * Which class year's calendar an entry sits on. Mirrors the `yearSlot` concept
 * in src/lib/timeline.js (resolveDate there does the same arithmetic) so the two
 * calendars can be merged without translating between two notions of "which
 * year does this August belong to".
 */
export const YEAR_SLOTS = ['freshman', 'sophomore', 'junior', 'senior', 'current', 'next'];

/**
 * Optional gates an entry can declare against the intake answers. Every key here
 * must be answerable from the intake (src/lib/roadmap/intake.js) or from the
 * student's existing profile — a gate nothing can satisfy silently deletes the
 * entry from every roadmap, which is the quietest way for a catalog to rot.
 * verifyRoadmap.mjs asserts each one is reachable.
 */
/**
 * The USPS codes an entry may declare in `states`.
 *
 * `states` is how an entry says "you have to live here". Omitting it means the
 * entry is open nationally, which is the common case and therefore the default —
 * an entry that forgot to declare its restriction is offered to everyone, which
 * is a recoverable mistake, where a default of "restricted to nowhere" would
 * make every entry invisible, which is not.
 *
 * Duplicated here rather than imported from src/lib/geo/zip.js because this
 * module must stay loadable under plain Node by scripts/verifyRoadmap.mjs with
 * no imports out of src/data — the same constraint that keeps the theme out of
 * this file. The verify script asserts the two lists agree, so they cannot
 * silently drift.
 */
export const US_STATE_CODES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'GU', 'HI', 'ID',
  'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT',
  'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'PR', 'RI',
  'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
];

export const GATE_KEYS = [
  'needsFinancialAid',   // true when the student reports aid matters
  'firstGen',            // first-generation college student
  'usCitizenOrPR',       // several federal programs require it
  'hasCarOrTransit',     // in-person weekday programs are unreachable without it
  'canTravel',           // residential/away programs
  'ruralOrSmallTown',    // promotes virtual + rural-health pipelines
  'strongMathScience',   // olympiad-track entries
  'wantsResearch',
  'wantsClinical',
  'wantsLeadership',
  'wantsCompetition',
];

/**
 * Slate-composition rules the generator must satisfy, checked after generation
 * by validateSlate() in src/lib/roadmap/model.js and asserted by the verify
 * script against generated fixtures.
 *
 * These exist because the two ways an AI-written roadmap fails are opposite and
 * both invisible to the student reading it:
 *   - ALL REACHES. Eight lottery programs and a national olympiad, none of which
 *     they will get, and a year with nothing to show at the end of it.
 *   - ALL FILLER. Nine club meetings and a virtual webinar, every one achievable
 *     and not one of them worth a line on an application.
 * A real counselor balances these instinctively. This encodes the instinct.
 */
export const SLATE_RULES = {
  /** No single track may exceed this share of dated items. */
  maxTrackShare: 0.45,
  /** At least this many items must be things the student can definitely do. */
  minAchievableCount: 4,
  /** At most this many `lottery` items — beyond this it stops being a plan. */
  maxLotteryCount: 3,
  /** Every reach needs a same-track fallback the student can actually get. */
  requireFallbackForLottery: true,
  /** Two items whose prep windows overlap and are both `heavy`+ is over-commitment. */
  maxConcurrentHeavy: 2,
};

/** Ordering used everywhere a list of items is rendered without an explicit sort. */
export const PRIORITY = { critical: 3, important: 2, helpful: 1 };

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/**
 * THE RENDERING RULE. May this thing be shown to a student as an exact calendar
 * date?
 *
 * Every surface in the app that prints a roadmap date goes through this — the
 * item card, the timeline spine, the Home card, the calendar export, the parent
 * digest. It exists as a function rather than as a convention because a
 * convention is one careless `{item.due}` away from telling a seventeen-year-old
 * that a scholarship closes on a day it does not.
 *
 * Three ways to earn a date:
 *   - the student typed it in themselves (they looked it up; they are right)
 *   - it is a structurally fixed institutional date ('fixed')
 *   - nothing else
 *
 * A 'typical' entry has a real window and renders as one ("closes late
 * September"). A 'varies' entry renders as its `season` string and nothing more.
 */
export function displaysExactDate(item) {
  if (!item) return false;
  if (item.studentDate) return true;
  if (item.addedBy === 'student') return true;
  return item.confidence === 'fixed';
}

/**
 * The date sentence a student may be shown for this item, always safe to print.
 * The counterpart to displaysExactDate: callers use that to decide whether to
 * render a date widget, and this for the words beside it.
 */
export function dateCaption(item, fmt = (d) => d, { compact = false } = {}) {
  if (!item) return '';
  if (displaysExactDate(item)) return fmt(item.studentDate || item.due || item.on || item.anchor);
  // ── The compact form ───────────────────────────────────────────────────────
  // For surfaces where the item is a MARK rather than a card — a node on the
  // path, a dot on the spine — the full caption ("around May 20, 2027 — confirm
  // on the official site") is three wrapped lines under a 40px circle, and it
  // collides with its neighbors.
  //
  // The compact form is allowed to say LESS and is never allowed to say more.
  // A 'typical' date drops to its month, which is strictly vaguer than the
  // caption it replaces and therefore cannot mislead anyone the long form would
  // not have. The caveat itself is not lost: the mark is drawn hollow and
  // dashed wherever this is used, the legend says what that means, and the item
  // card it opens carries the full sentence and the link.
  if (compact) {
    if (item.confidence === 'varies') return 'date varies';
    const d = item.due || item.on || item.anchor;
    if (!d) return 'not confirmed';
    const month = fmt(`${String(d).slice(0, 8)}01`, { monthOnly: true });
    return `around ${month}`;
  }
  if (item.confidence === 'varies') {
    // `season` means two different things either side of the generator, and this
    // one line is where that bites. On a CATALOG ENTRY it is the prose window —
    // "Late winter, by hospital". On a ROADMAP ITEM it is the id of the season
    // the item was placed in — 's1'…'s4' — and the prose has been carried across
    // as `seasonHint` (see pickToItem in generator.js). Reading `season` first
    // therefore printed a raw internal id where a date window belongs: a
    // student's timeline read "s3" against their hospital volunteering.
    //
    // So: prefer the hint, and refuse outright to print anything shaped like an
    // id. A vaguer caption is recoverable; an id is not something a student can
    // read, act on, or even report sensibly.
    //
    // The id guard applies to BOTH fields, not just to `season`. `seasonHint`
    // is filled from the catalog entry's prose in the normal path, but it is
    // copied through several layers to get here and anything that hands it a
    // season id instead would put "s3" where a date window belongs — the exact
    // bug this guard was written for, one field further along.
    const notAnId = (v) => (typeof v === 'string' && v.trim() && !/^s\d+$/i.test(v.trim()) ? v.trim() : null);
    const window = notAnId(item.seasonHint) || notAnId(item.season);
    return window || 'Date varies — look yours up';
  }
  const due = item.due || item.on || item.anchor;
  return due ? `around ${fmt(due)} — confirm on the official site` : 'Date not confirmed';
}

/**
 * Validates one catalog entry, returning an array of human-readable problems
 * (empty when fine). Used by scripts/verifyRoadmap.mjs to fail the build rather
 * than by the app at runtime — a malformed entry is an authoring bug, and the
 * right time to hear about it is before it ships, not in a student's browser.
 */
export function validateEntry(e) {
  const problems = [];
  const need = (cond, msg) => { if (!cond) problems.push(msg); };

  need(typeof e?.id === 'string' && /^[a-z0-9-]+$/.test(e.id), `id must be a kebab-case string (got ${JSON.stringify(e?.id)})`);
  need(typeof e?.name === 'string' && e.name.length > 2, 'name is required');
  need(TRACK_IDS.includes(e?.track), `track must be one of ${TRACK_IDS.join('|')} (got ${JSON.stringify(e?.track)})`);
  need(CONFIDENCE.includes(e?.confidence), `confidence must be one of ${CONFIDENCE.join('|')}`);
  need(Array.isArray(e?.grades) && e.grades.length > 0 && e.grades.every((g) => GRADES.includes(g)), 'grades must be a non-empty subset of 9/10/11/12');
  need(typeof e?.why === 'string' && e.why.length > 15, 'why must explain, in a sentence, what this does for an application');

  if (has(e, 'selectivity')) need(SELECTIVITY.includes(e.selectivity), `selectivity ${e.selectivity} is not valid`);
  if (has(e, 'effort')) need(EFFORT.includes(e.effort), `effort ${e.effort} is not valid`);
  if (has(e, 'format')) need(FORMATS.includes(e.format), `format ${e.format} is not valid`);
  if (has(e, 'cost')) need(COSTS.includes(e.cost), `cost ${e.cost} is not valid`);
  if (has(e, 'requires')) {
    Object.keys(e.requires || {}).forEach((k) => need(GATE_KEYS.includes(k), `requires.${k} is not a known gate — add it to GATE_KEYS and make the intake able to answer it`));
  }
  if (has(e, 'states')) {
    need(Array.isArray(e.states) && e.states.length > 0,
      'states, when present, must be a non-empty array — omit it entirely for a nationally open entry rather than declaring []');
    (e.states || []).forEach((s) => need(US_STATE_CODES.includes(s),
      `states entry ${JSON.stringify(s)} is not a USPS state code — use two uppercase letters ("NC", not "North Carolina")`));
  }

  // Date shape. A 'varies' entry must carry a human-readable `season`, because
  // that string is the ONLY thing the UI may render for it (see displaysExactDate
  // and the note in this file's header). Its `window`, if present, is a private
  // scheduling estimate — allowed, never shown.
  const w = e?.window;
  if (e?.confidence === 'varies') {
    need(typeof e?.season === 'string' && e.season.length > 3,
      'a varies-confidence entry must carry a human-readable `season` — it is the only date text the UI is allowed to show for it');
  } else {
    need(!!w && typeof w === 'object', 'window is required unless confidence is "varies"');
  }
  if (w) {
    need(!!w.dueMonthDay || !!w.onMonthDay, 'window needs dueMonthDay (a deadline) or onMonthDay (an event day)');
    [['opensMonthDay', w.opensMonthDay], ['dueMonthDay', w.dueMonthDay], ['onMonthDay', w.onMonthDay]].forEach(([k, v]) => {
      if (v != null) need(/^\d{2}-\d{2}$/.test(v), `window.${k} must be MM-DD (got ${JSON.stringify(v)})`);
    });
    if (w.yearSlot != null) need(YEAR_SLOTS.includes(w.yearSlot), `window.yearSlot ${w.yearSlot} is not valid`);
  }

  if (has(e, 'prepWeeks')) need(Number.isInteger(e.prepWeeks) && e.prepWeeks >= 0 && e.prepWeeks <= 52, 'prepWeeks must be 0-52');
  // A 'fixed' or 'typical' entry the student is expected to ACT on must say
  // where to confirm it. This is the concrete form of honesty rule 1: an entry
  // whose official page cannot be linked is an entry we should not be dating.
  if (e?.confidence !== 'varies' && ['scholarship', 'program', 'competition'].includes(e?.track)) {
    need(typeof e?.url === 'string' && e.url.startsWith('https://'), 'a dated scholarship/program/competition must carry its official https URL so the student can confirm');
  }
  return problems;
}
