// ─────────────────────────────────────────────────────────────────────────────
// Module 11 — the competition selectivity index.
//
// ── PREMIUM ROADMAP ─────────────────────────────────────────────────────────
// Part of the Narrative Method Engine, planned as a paid tier. See PREMIUM in
// ./constants.js.
// ────────────────────────────────────────────────────────────────────────────
//
//     I_competition = ln(N_participants / N_winners) · S_tier
//
// The logarithm is the whole point. Selectivity is not linear in the eye of a
// reader: the step from "one in five" to "one in fifty" is enormous and the step
// from "one in five thousand" to "one in ten thousand" is nearly invisible,
// because both already read as "the best in the country". A ratio would say the
// opposite; a log says what a reader does.
//
// ── The scale factor is not snobbery ───────────────────────────────────────
// S_tier deflates local results by 5× against international ones. That is not a
// claim that local work matters less to the student or to the community — it is
// a claim about the size of the field the result was drawn from, which is the
// only thing a selectivity index can measure. A first place among nineteen
// entrants is a first place among nineteen entrants, and a tool that lets a
// student believe otherwise has done them harm that surfaces in April.
//
// ── The failure mode this module is built around ───────────────────────────
// Students overwhelmingly do not know their participant counts. So an unknown
// count does NOT produce a zero and does not produce a guess: it produces the
// band the competition's own scale implies, marked as an estimate, with the one
// fact that would replace it. See `estimated` on every return.
// ─────────────────────────────────────────────────────────────────────────────

import { SCALE_FACTORS, COMPETITION_BANDS, clamp } from './constants.js';
import { AWARD_CATALOG } from '../../data/ivy/tierCatalog.js';

/** Typical field-size assumptions used ONLY when the student has no counts. */
const ASSUMED_RATIO = { international: 0.01, national: 0.04, state: 0.10, regional: 0.12, local: 0.25 };

/**
 * @param {Object} entry
 * @param {number} entry.participantsCount
 * @param {number} entry.winnersCount
 * @param {'international'|'national'|'state'|'regional'|'local'} entry.scale
 * @param {string} [entry.title]
 */
export function competitionIndex(entry = {}) {
  const scale = String(entry.scale || 'local').toLowerCase();
  const tierFactor = SCALE_FACTORS[scale] ?? SCALE_FACTORS.local;

  const participants = Number(entry.participantsCount ?? entry.participants_count);
  const winners = Number(entry.winnersCount ?? entry.winners_count);

  // A catalogued award carries its own published ratio, which beats a student's
  // recollection of a field size every time.
  const catalogued = entry.title ? AWARD_CATALOG.find(a => a.re.test(entry.title)) : null;

  let ratio, basis;
  if (Number.isFinite(participants) && Number.isFinite(winners) && participants > 0 && winners > 0) {
    ratio = clamp(winners / participants, 1e-6, 1);
    basis = 'reported';
  } else if (catalogued?.ratio) {
    ratio = catalogued.ratio;
    basis = 'catalog';
  } else {
    ratio = ASSUMED_RATIO[scale] ?? 0.25;
    basis = 'assumed';
  }

  const index = Math.log(1 / ratio) * tierFactor;
  const band = COMPETITION_BANDS.find(b => ratio <= b.maxRatio) || COMPETITION_BANDS[COMPETITION_BANDS.length - 1];

  // The weight index the reference table assigns, placed inside its band by how
  // far into the band the ratio sits.
  const [wLo, wHi] = band.weight;
  const prev = COMPETITION_BANDS[COMPETITION_BANDS.indexOf(band) - 1];
  const lower = prev ? prev.maxRatio : 0;
  const span = Math.max(1e-9, band.maxRatio === Infinity ? 1 - lower : band.maxRatio - lower);
  const within = clamp(1 - (ratio - lower) / span, 0, 1);
  const weightIndex = Math.round((wLo + within * (wHi - wLo)) * 100) / 100;

  return {
    index: Math.round(index * 1000) / 1000,
    ratio,
    ratioLabel: ratio >= 0.01 ? `about 1 in ${Math.round(1 / ratio)}` : `about 1 in ${Math.round(1 / ratio).toLocaleString()}`,
    scale, scaleFactor: tierFactor,
    band: band.id, bandLabel: band.scale, weightIndex, value: band.value,
    basis,
    estimated: basis !== 'reported',
    estimateNote: basis === 'reported' ? null
      : basis === 'catalog'
        ? `Field size taken from what this competition publishes rather than from your entry, so it is right even though you did not record the counts.`
        : `You have not recorded how many people competed or how many placed, so this uses a typical ${scale} field. Two numbers would replace this estimate with your real one — and at ${scale} scale the difference between a field of 40 and a field of 4,000 is the whole story.`,
    // What a reader takes from it, said in one sentence rather than as a number.
    reading: index >= 3.5 ? 'A result a reader stops on.'
      : index >= 2.0 ? 'A genuine credential that supports a claim.'
      : index >= 1.0 ? 'Corroborating detail; it will not carry a file on its own.'
      : 'Reads as participation. Real, and not a distinction.',
  };
}

/** Ranks a set of competitive results by index. */
export function rankCompetitions(entries = []) {
  return entries
    .map(e => ({ ...e, ...competitionIndex(e) }))
    .sort((a, b) => b.index - a.index);
}
