// The assembled Roadmap catalog. See ./schema.js for the authoring rules every
// entry is held to and the reason this catalog exists separately from the
// browsable reference lists in src/data/opportunities.js and scholarships.js.
//
// Kept free of any import from src/lib so scripts/verifyRoadmap.mjs can load the
// whole thing under plain Node with no bundler and no theme.
import { ANCHORS } from './anchors.js';
import { COMPETITIONS } from './competitions.js';
import { COMPETITIONS_EXPANSION } from './competitionsExpansion.js';
import { PROGRAMS } from './programs.js';
import { AWARDS } from './awards.js';
import { OPPORTUNITY_EXPANSION } from './expansion.js';
import { REGIONAL_PROGRAMS } from './regionalPrograms.js';
import { PRIORITY, TRACK_IDS } from './schema.js';

export * from './schema.js';
export { ANCHORS, COMPETITIONS, COMPETITIONS_EXPANSION, PROGRAMS, AWARDS, OPPORTUNITY_EXPANSION, REGIONAL_PROGRAMS };

/**
 * The competition track, assembled. Split across two authoring files rather than
 * one: competitions.js holds the original seventeen and competitionsExpansion.js
 * the fifty-four that followed. The split is purely about file size — a
 * seventy-entry literal is not reviewable in one sitting — and nothing
 * downstream knows or cares which file an entry came from.
 */
export const ALL_COMPETITIONS = [...COMPETITIONS, ...COMPETITIONS_EXPANSION];

/**
 * Every catalog entry, normalized.
 *
 * Defaults are applied HERE rather than repeated on 400 object literals — an
 * entry that omits `priority` means "helpful", an entry that omits `prepWeeks`
 * means "no lead time needed". Authoring files stay readable and the consumers
 * never have to write `entry.effort ?? 'moderate'` at every call site.
 */
export const ROADMAP_CATALOG = [...ANCHORS, ...ALL_COMPETITIONS, ...PROGRAMS, ...AWARDS, ...OPPORTUNITY_EXPANSION, ...REGIONAL_PROGRAMS].map((e) => ({
  selectivity: 'open',
  effort: 'moderate',
  format: 'varies',
  cost: 'varies',
  prepWeeks: 0,
  steps: [],
  tags: [],
  requires: {},
  ...e,
  priority: PRIORITY[e.priority] ? e.priority : 'helpful',
  weight: PRIORITY[e.priority] ?? PRIORITY.helpful,
}));

export const CATALOG_BY_ID = Object.fromEntries(ROADMAP_CATALOG.map((e) => [e.id, e]));

/** Every catalog id, as a Set — the generator's whitelist for model output. */
export const CATALOG_IDS = new Set(ROADMAP_CATALOG.map((e) => e.id));

/** Entries on one track, in priority order. */
export function entriesForTrack(track) {
  return ROADMAP_CATALOG.filter((e) => e.track === track).sort((a, b) => b.weight - a.weight);
}

/** Count per track — used by the verify script to fail on a track that has quietly emptied. */
export function trackCounts() {
  const counts = Object.fromEntries(TRACK_IDS.map((t) => [t, 0]));
  ROADMAP_CATALOG.forEach((e) => { counts[e.track] += 1; });
  return counts;
}
