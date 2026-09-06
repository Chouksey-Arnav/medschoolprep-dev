// ─────────────────────────────────────────────────────────────────────────────
// Module 12 — the Differentiation Index.
//
// ── PREMIUM ROADMAP ─────────────────────────────────────────────────────────
// Part of the Narrative Method Engine, planned as a paid tier. See PREMIUM in
// ./constants.js.
// ────────────────────────────────────────────────────────────────────────────
//
//     D_project = 1 − max_{p ∈ 𝒟_historical} cos(V_applicant, V_p)
//
// ── The calibration, stated openly ─────────────────────────────────────────
// The specification's bands (≥0.85 heavy, ≥0.60 moderate) are defined against
// cosine over dense 1536-dimensional embeddings. This engine computes a
// deterministic LEXICAL similarity instead (see the header of ./text.js for
// why), and a lexical measure is systematically lower: two texts that a dense
// model calls 0.85 similar share meaning, whereas the same pair might share
// only half their vocabulary.
//
// So the raw similarity is divided by SELF_SIMILARITY — the score a description
// that genuinely IS the archetype achieves against it — before the bands are
// applied. That constant was measured, not guessed: a deliberately templated
// activity description ("Founded 501c3 nonprofit that donates art supplies to
// underfunded schools…") scores 0.55 against its own archetype, and a hospital-
// volunteering line scores 0.51 against the hospital-volunteering archetype.
// 0.58 is the working midpoint, and scripts/verifyIvyEngine.mjs pins it by
// asserting that an archetypal description lands in the 'high' band and a
// genuinely unusual one does not.
//
// Without the calibration every student would be told their project is unique,
// which is the exact flattery this module exists to refuse.
//
// ── What a collision means, and what it does not ───────────────────────────
// A high score does not mean the project is worthless or copied. It means the
// DESCRIPTION is doing work that thousands of identical descriptions already
// do. Every band therefore carries a `redirect` — the specific narrowing move —
// and the engine never recommends abandoning a project. Not once, anywhere.
// ─────────────────────────────────────────────────────────────────────────────

import { clamp } from './constants.js';
import { vectorize, thematicSimilarity } from './text.js';
import { OVERUSED_PROJECTS, overlapBand } from '../../data/ivy/overusedProjects.js';

/** See the header. Calibrates a lexical score onto the specification's bands. */
export const SELF_SIMILARITY = 0.58;

/**
 * The corpus, vectorised once at module load.
 *
 * Markers are appended to the archetype text so that the words that most
 * identify a theme carry extra term frequency — a cheap, legible substitute for
 * the term weighting a trained model would have learned.
 */
const CORPUS = OVERUSED_PROJECTS.map(theme => ({
  ...theme,
  vector: vectorize(`${theme.text} ${theme.markers.join(' ')} ${theme.markers.join(' ')}`),
}));

/** Raw and calibrated similarity of one text against every archetype. */
export function compareToCorpus(text) {
  const vec = vectorize(text);
  if (!vec.size) return { matches: [], top: null, similarity: 0, raw: 0 };

  const matches = CORPUS
    .map(theme => {
      const raw = thematicSimilarity(vec, theme.vector);
      return {
        id: theme.id, label: theme.label, redirect: theme.redirect, prevalence: theme.prevalence,
        raw: Math.round(raw * 1000) / 1000,
        similarity: clamp(raw / SELF_SIMILARITY, 0, 1),
      };
    })
    .sort((a, b) => b.similarity - a.similarity);

  const top = matches[0];
  return { matches, top, similarity: top?.similarity ?? 0, raw: top?.raw ?? 0 };
}

/**
 * THE INDEX.
 *
 * @param {string} text  the project description, or the whole activity entry
 * @param {Object} [opts]
 * @param {string} [opts.label]  what to call this project on screen
 */
export function differentiationIndex(text, { label = 'this project' } = {}) {
  const source = String(text || '').trim();
  if (source.split(/\s+/).filter(Boolean).length < 6) {
    return {
      available: false, index: null,
      note: 'Too short to compare. Write two or three sentences describing what the project actually does and this becomes a real reading.',
    };
  }

  const { matches, top, similarity } = compareToCorpus(source);
  const band = overlapBand(similarity);
  const index = clamp(1 - similarity, 0, 1);

  // The runners-up matter: a project that collides with three archetypes at
  // once is generic in a way that colliding hard with one is not.
  const alsoNear = matches.slice(1, 3).filter(m => m.similarity >= 0.5);

  return {
    available: true,
    index: Math.round(index * 1000) / 1000,
    similarity: Math.round(similarity * 1000) / 1000,
    rawSimilarity: top?.raw ?? 0,
    calibration: SELF_SIMILARITY,
    band: band.id,
    bandLabel: band.label,
    penalty: band.penalty,
    flagged: band.penalty < 0,
    collidesWith: top ? { id: top.id, label: top.label, prevalence: top.prevalence } : null,
    alsoNear,
    guidance: band.guidance,
    // The specific move, from the archetype the project collided with. This is
    // the sentence the student actually acts on, and it is why the corpus is
    // written in English rather than shipped as vectors.
    redirect: band.penalty < 0 ? top?.redirect : null,
    headline: band.penalty < 0
      ? `${cap(label)} reads like ${top.label.toLowerCase()} — a shape about ${Math.round((top.prevalence || 0.05) * 100)}% of passion projects we see already have.`
      : similarity >= 0.35
        ? `${cap(label)} shares vocabulary with ${top.label.toLowerCase()}, but not its mechanism. Nothing to fix.`
        : `${cap(label)} does not resemble any of the archetypes we track. That is the position you want.`,
    note: 'This compares the words you used against fifteen project shapes we see repeatedly. It is a measure of how your DESCRIPTION reads, not of whether the work is worth doing — and nothing here is ever a reason to stop doing it.',
  };
}

const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

/** Runs the index across a whole activity list, returning the worst collisions first. */
export function differentiateAll(activities = []) {
  return (activities || [])
    .map(a => {
      const label = a.name || a.title || 'this project';
      const text = `${label} ${a.role || a.leadership_role || ''} ${a.description || a.description_draft || ''}`;
      return { id: a.id || label, label, ...differentiationIndex(text, { label }) };
    })
    .filter(r => r.available)
    .sort((a, b) => b.similarity - a.similarity);
}
