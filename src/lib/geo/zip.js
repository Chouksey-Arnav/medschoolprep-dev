// ─────────────────────────────────────────────────────────────────────────────
// ZIP code → where this student actually lives.
//
// ── Why this is a lookup table and not an API call ───────────────────────────
// The roadmap needs a student's state to answer three questions that change what
// belongs in their year: which state's scholarship and aid deadlines apply to
// them, which regional health-pipeline programs they are eligible for (a great
// many are open only to residents of one state, and they are consistently the
// least competitive good things available to a teenager), and whether an
// in-person program is a bus ride or a plane ticket away.
//
// Every geocoding API that would answer this properly costs money, requires a
// key, fails on a school network that filters it, leaks a minor's home location
// to a third party, and stops the whole feature working offline. The first three
// digits of a US ZIP code already carry the state, the mapping is published, it
// changes at the rate of about one prefix a decade, and it fits in this file.
// So: no network, no key, no third party, and it works on a plane.
//
// ── The honesty line, which is the same one the catalog is held to ───────────
// This resolves a ZIP to a STATE and a REGION. It does not resolve one to a
// city, a neighborhood, a school district, or a set of hospitals within
// twenty miles, and nothing downstream may claim it does. A three-digit prefix
// covers an area that can be most of a state; treating it as a pin on a map
// would let the roadmap tell a student that a program is "near you" when it is
// four hours away, which is worse than saying nothing. What it supports is
// eligibility ("this program is for residents of your state") and proximity at
// the coarsest honest grain ("this runs in your region"), and those are exactly
// the two facts that actually gate opportunities for a high schooler.
//
// A student is always free to type their own answer instead — see the free-text
// box in the intake. This is a shortcut past a question, not a substitute for
// what they tell us.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Three-digit ZIP prefix ranges → USPS state code.
 *
 * Written as inclusive [low, high] ranges over the numeric prefix because that
 * is the shape the data actually has: states were allocated contiguous blocks.
 * Ordered lowest-first, and resolved by scan rather than by a 1000-entry map,
 * because eighty comparisons is nothing and a range list is a thing a human can
 * proofread against the published allocation.
 *
 * Gaps are deliberate and meaningful: an unallocated prefix (there are several)
 * resolves to null rather than to its nearest neighbor, because a wrong state
 * is worse than no state — it would gate a student into another state's
 * residency-restricted programs and out of their own.
 */
const PREFIX_RANGES = [
  [5, 5, 'NY'],       // Holtsville, NY (IRS)
  [6, 9, 'PR'],       // Puerto Rico and the US Virgin Islands share this block
  [10, 27, 'MA'],
  [28, 29, 'RI'],
  [30, 38, 'NH'],
  [39, 49, 'ME'],
  [50, 54, 'VT'],
  [55, 55, 'MA'],     // one MA prefix sits inside Vermont's block
  [56, 59, 'VT'],
  [60, 69, 'CT'],
  [70, 89, 'NJ'],
  [100, 149, 'NY'],
  [150, 196, 'PA'],
  [197, 199, 'DE'],
  [200, 205, 'DC'],
  [206, 219, 'MD'],
  [220, 246, 'VA'],
  [247, 268, 'WV'],
  [270, 289, 'NC'],
  [290, 299, 'SC'],
  [300, 319, 'GA'],
  [320, 349, 'FL'],
  [350, 369, 'AL'],
  [370, 385, 'TN'],
  [386, 397, 'MS'],
  [398, 399, 'GA'],
  [400, 427, 'KY'],
  [430, 459, 'OH'],
  [460, 479, 'IN'],
  [480, 499, 'MI'],
  [500, 528, 'IA'],
  [530, 549, 'WI'],
  [550, 567, 'MN'],
  [570, 577, 'SD'],
  [580, 588, 'ND'],
  [590, 599, 'MT'],
  [600, 629, 'IL'],
  [630, 658, 'MO'],
  [660, 679, 'KS'],
  [680, 693, 'NE'],
  [700, 714, 'LA'],
  [716, 729, 'AR'],
  [730, 749, 'OK'],
  [750, 799, 'TX'],
  [800, 816, 'CO'],
  [820, 831, 'WY'],
  [832, 838, 'ID'],
  [840, 847, 'UT'],
  [850, 865, 'AZ'],
  [870, 884, 'NM'],
  [885, 885, 'TX'],   // El Paso overflow
  [889, 898, 'NV'],
  [900, 961, 'CA'],
  [967, 968, 'HI'],
  [969, 969, 'GU'],
  [970, 979, 'OR'],
  [980, 994, 'WA'],
  [995, 999, 'AK'],
];

/** USPS code → the name a student would recognize. */
export const STATE_NAMES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'Washington, D.C.',
  FL: 'Florida', GA: 'Georgia', GU: 'Guam', HI: 'Hawaii', ID: 'Idaho',
  IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky',
  LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts',
  MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina',
  ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', PR: 'Puerto Rico', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

export const STATE_CODES = Object.keys(STATE_NAMES);

/**
 * Census regions, which is the grain most multi-state programs actually use.
 *
 * These are the official four Census regions rather than a set invented here,
 * for a boring but load-bearing reason: when a program says "open to students in
 * the Southeast", the definition it is using is almost always somebody's version
 * of this, and a hand-rolled grouping would put a student on the wrong side of a
 * line for no reason anyone could later reconstruct.
 */
export const REGIONS = {
  northeast: {
    label: 'the Northeast',
    states: ['CT', 'ME', 'MA', 'NH', 'RI', 'VT', 'NJ', 'NY', 'PA'],
  },
  midwest: {
    label: 'the Midwest',
    states: ['IL', 'IN', 'MI', 'OH', 'WI', 'IA', 'KS', 'MN', 'MO', 'NE', 'ND', 'SD'],
  },
  south: {
    label: 'the South',
    states: ['DE', 'DC', 'FL', 'GA', 'MD', 'NC', 'SC', 'VA', 'WV', 'AL', 'KY', 'MS', 'TN', 'AR', 'LA', 'OK', 'TX'],
  },
  west: {
    label: 'the West',
    states: ['AZ', 'CO', 'ID', 'MT', 'NV', 'NM', 'UT', 'WY', 'AK', 'CA', 'HI', 'OR', 'WA'],
  },
  territories: {
    label: 'the U.S. territories',
    states: ['PR', 'GU'],
  },
};

const REGION_OF_STATE = (() => {
  const out = {};
  Object.entries(REGIONS).forEach(([id, r]) => r.states.forEach((s) => { out[s] = id; }));
  return out;
})();

/** The Census region id for a state code, or null. */
export function regionForState(state) {
  return REGION_OF_STATE[String(state || '').toUpperCase()] || null;
}

/** Every state in the same region as `state`, including it. Empty for an unknown state. */
export function neighborStates(state) {
  const region = regionForState(state);
  return region ? REGIONS[region].states : [];
}

/**
 * True when a ZIP is well-formed. Accepts the two shapes a student actually
 * types — five digits, or ZIP+4 with or without the hyphen — and nothing else.
 * Deliberately not a "does this ZIP exist" check: that needs the full ZCTA list,
 * and a well-formed prefix that resolves to a state is all this module promises.
 */
export function isValidZip(input) {
  return /^\d{5}(?:-?\d{4})?$/.test(String(input || '').trim());
}

/** The bare five digits of whatever the student typed, or null. */
export function normalizeZip(input) {
  const s = String(input || '').trim();
  return isValidZip(s) ? s.slice(0, 5) : null;
}

/**
 * Resolve a ZIP to everything this module can honestly say about it.
 *
 * @returns {{zip, prefix, state, stateName, region, regionLabel, nearbyStates}|null}
 *          null for anything unparseable or in an unallocated block — see the
 *          note on gaps above for why that is a real answer rather than a bug.
 */
export function resolveZip(input) {
  const zip = normalizeZip(input);
  if (!zip) return null;
  const prefix = parseInt(zip.slice(0, 3), 10);
  if (!Number.isFinite(prefix)) return null;
  const hit = PREFIX_RANGES.find(([lo, hi]) => prefix >= lo && prefix <= hi);
  if (!hit) return null;
  const state = hit[2];
  const region = regionForState(state);
  return {
    zip,
    prefix: zip.slice(0, 3),
    state,
    stateName: STATE_NAMES[state] || state,
    region,
    regionLabel: region ? REGIONS[region].label : null,
    // The student's own state first — it is the one that gates residency
    // programs — then the rest of the region.
    nearbyStates: [state, ...neighborStates(state).filter((s) => s !== state)],
  };
}

/**
 * How close an opportunity is to this student, as a coarse, honest band.
 *
 * `scope` is what a catalog entry declares about itself:
 *   - no `states` at all → national, reachable by anyone
 *   - `states: ['NC']`   → residency- or location-restricted
 *
 * Returns one of 'home' | 'region' | 'national' | 'far', or null when we do not
 * know where the student lives — in which case NOTHING downstream may claim
 * distance, which is why this returns null rather than defaulting to 'national'.
 */
export function proximity(place, states) {
  if (!place?.state) return null;
  if (!Array.isArray(states) || !states.length) return 'national';
  const upper = states.map((s) => String(s).toUpperCase());
  if (upper.includes(place.state)) return 'home';
  const region = neighborStates(place.state);
  if (upper.some((s) => region.includes(s))) return 'region';
  return 'far';
}

/** The sentence a card may print about proximity. Empty when we cannot say. */
export function proximityLabel(band, place) {
  switch (band) {
    case 'home': return place?.stateName ? `In ${place.stateName}` : 'In your state';
    case 'region': return place?.regionLabel ? `In ${place.regionLabel}` : 'In your region';
    case 'national': return 'Open nationally';
    case 'far': return 'Out of state';
    default: return '';
  }
}
