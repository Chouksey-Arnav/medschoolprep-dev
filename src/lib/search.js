// ─────────────────────────────────────────────────────────────────────────────
// Fuse.js — Fuzzy search for all search fields
// Handles typos, partial matches, multi-field search.
// ─────────────────────────────────────────────────────────────────────────────
import Fuse from 'fuse.js';

export function buildQuizSearch(quizzes) {
  return new Fuse(quizzes, {
    keys: [
      { name: 'title', weight: 0.6 },
      { name: 'cat',   weight: 0.2 },
      { name: 'diff',  weight: 0.1 },
      { name: 'qs.q',  weight: 0.1 },
    ],
    threshold: 0.35,
    includeScore: true,
    useExtendedSearch: true,
    minMatchCharLength: 2,
  });
}

export function buildLibrarySearch(resources) {
  return new Fuse(resources, {
    keys: [
      { name: 'title', weight: 0.5 },
      { name: 'desc',  weight: 0.35 },
      { name: 'cat',   weight: 0.1 },
      { name: 'type',  weight: 0.05 },
    ],
    threshold: 0.4,
    includeScore: true,
    minMatchCharLength: 2,
  });
}

export function buildDeckSearch(decks) {
  return new Fuse(decks, {
    keys: [{ name: 'name', weight: 1 }],
    threshold: 0.4,
    minMatchCharLength: 1,
  });
}

export function buildSchoolSearch(schools) {
  return new Fuse(schools, {
    keys: [
      { name: 'name',  weight: 0.7 },
      { name: 'state', weight: 0.2 },
      { name: 'type',  weight: 0.1 },
    ],
    threshold: 0.35,
    includeScore: true,
    minMatchCharLength: 2,
  });
}

/** Run a fuzzy search. Returns null (show all) if query is empty. */
export function fuseSearch(index, query) {
  if (!query || !query.trim()) return null;
  return index.search(query).map(r => r.item);
}
