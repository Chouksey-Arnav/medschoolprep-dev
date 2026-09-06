// ─────────────────────────────────────────────────────────────────────────────
// Windowed rendering for long lists.
//
// ── The problem this exists to solve ────────────────────────────────────────
// The e-library is 1,628 resources and the quiz bank is comparable, and both
// screens rendered EVERY row every time the tab opened. Measured, in a real
// browser against a real build: /prep/library alone put 53,001 nodes and
// ~10,500 event listeners into the document in one commit — roughly 32 DOM
// nodes per card, each card also carrying a framer-motion instance for its
// hover effect. That is not a slow render, it is a browser tab that cannot be
// used while it is open: the tab was measured at multiple GB of resident
// memory, climbing as the student moved between tabs, because a detached copy
// of that tree stayed reachable for a long while after each unmount.
//
// The fix is to stop conflating "how many results there are" with "how many
// rows are in the document". Searching, filtering and sorting all still run
// over the FULL list — only rendering is windowed. A student sees the same
// results in the same order; the document just holds a screenful of them at a
// time instead of sixteen hundred.
//
// ── Why a hand-rolled window and not react-window ───────────────────────────
// The rows here are not fixed-height: a library card grows when its notes
// panel opens, and the grid reflows from two columns to one on a phone. A
// virtualizer needs to know row heights to position an absolutely-placed
// viewport, so making these rows work with one means pinning their heights,
// which is exactly the layout freedom the cards use. Appending in pages needs
// no height information at all, adds no dependency to a first-load budget that
// is already ratcheted (scripts/verifyPayload.mjs), and keeps the rows in
// normal document flow — so Cmd-F, tab order and screen-reader navigation
// behave the way they always did over what is rendered.
//
// ── Growth is driven by an observer AND a button, deliberately ──────────────
// The sentinel makes it feel like an ordinary long page: scroll, more arrives.
// The button is not a fallback for old browsers (IntersectionObserver is
// universal now) — it is what a keyboard user reaches, since tabbing to the
// end of the rendered rows never scrolls a sentinel into view, and it is what
// makes the behavior testable and announceable. Both are load-bearing.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, useMemo } from 'react';

// One screenful of a two-column card grid, plus enough slack that the sentinel
// starts below the fold on a tall desktop window — otherwise the observer fires
// immediately on mount and pages in twice before the student has done anything.
export const DEFAULT_PAGE = 24;

/**
 * @param {Array}  items      the FULL result list (already searched/filtered/sorted)
 * @param {object} opts
 * @param {number} opts.page  how many rows to add per step
 * @param {any}    opts.resetKey  changing this snaps the window back to the first page
 * @param {boolean} opts.fromEnd  window the TAIL instead of the head, growing backwards.
 *   For a transcript: the newest messages are the ones on screen, and "more" means
 *   older. `offset` is then the number of items hidden ABOVE the window, which the
 *   caller needs to build stable React keys — see the note on keys below.
 * @returns {{visible:Array, offset:number, hasMore:boolean, remaining:number,
 *            total:number, showMore:()=>void, sentinelRef:React.RefObject}}
 */
export default function useWindowedList(items, { page = DEFAULT_PAGE, resetKey = null, fromEnd = false } = {}) {
  const list = Array.isArray(items) ? items : [];
  const [count, setCount] = useState(page);
  // ── A callback ref, not useRef, and this is load-bearing ───────────────────
  //
  // The sentinel does not exist when this hook first runs. It is rendered by the
  // screen that consumes the window, which mounts later (the tab is not open yet,
  // or `items` is still empty on the first pass), and a plain useRef gives the
  // effect below no way to learn that it has since appeared: the effect would run
  // once against a null ref, bail out, and never re-run — because the only things
  // that re-trigger it are `count` and `list.length`, and the only thing that
  // moves `count` is the observer it failed to attach. A deadlock that leaves the
  // button working and silently kills scroll-to-load.
  //
  // Storing the node in state means mounting it IS a state change, so the effect
  // re-runs and observes it the moment it appears, and unmounting sets it back to
  // null and tears the observer down.
  const [sentinelEl, setSentinelEl] = useState(null);
  const sentinelRef = useCallback((node) => { setSentinelEl(node); }, []);

  // A new search or filter is a new list, and the student is looking at the top
  // of it — carrying a grown window across would render hundreds of rows for a
  // query that matched three. `resetKey` is whatever the caller considers "a
  // different list"; the length is folded in so clearing a filter re-windows too.
  useEffect(() => { setCount(page); }, [resetKey, page, list.length]);

  const showMore = useCallback(() => {
    setCount(c => Math.min(c + page, list.length));
  }, [page, list.length]);

  useEffect(() => {
    if (!sentinelEl || count >= list.length) return undefined;
    // rootMargin pulls the trigger a screen early so the next page is committed
    // before the student reaches the bottom and the growth is invisible to them.
    const io = new IntersectionObserver(
      entries => { if (entries.some(e => e.isIntersecting)) setCount(c => Math.min(c + page, list.length)); },
      { rootMargin: '600px 0px' },
    );
    io.observe(sentinelEl);
    return () => io.disconnect();
  }, [sentinelEl, count, list.length, page]);

  // Slicing allocates, and this runs on every keystroke in the search box while
  // `list` is stable — memoizing keeps the children's props referentially equal
  // so React can bail out of re-rendering rows that did not change.
  //
  // ── A note on keys, for `fromEnd` callers ──────────────────────────────────
  // A tail window's slice indices move every time it grows: today's index 0 is
  // tomorrow's index 24. Keying rendered rows by their position WITHIN the slice
  // therefore re-keys every row on each "load earlier", which unmounts and
  // remounts the whole transcript — the exact churn this hook exists to avoid.
  // `offset` is the count of items hidden above the window, so `offset + i` is a
  // row's stable position in the full list and is what a caller should key on
  // (or key on the item's own id, if it has one).
  const offset = fromEnd ? Math.max(0, list.length - count) : 0;
  const visible = useMemo(
    () => (fromEnd ? list.slice(Math.max(0, list.length - count)) : list.slice(0, count)),
    [list, count, fromEnd],
  );

  return {
    visible,
    offset,
    hasMore: count < list.length,
    remaining: Math.max(0, list.length - count),
    total: list.length,
    showMore,
    sentinelRef,
  };
}
