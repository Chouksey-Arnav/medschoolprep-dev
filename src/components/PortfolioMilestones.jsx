// ─────────────────────────────────────────────────────────────────────────────
// MILESTONES — Portfolio's single dated surface.
//
// This tab is the merge of two that used to sit next to each other and quietly
// contradict each other:
//
//   • "Deadlines" — a flat table of rows the student typed in, with a countdown
//     and an AI urgency read. It could edit dates but knew nothing about the
//     application year, so a freshman who had typed nothing was told, truthfully
//     and uselessly, that they had no deadlines.
//   • "Timeline" — the generated chronological arc from src/lib/timeline.js:
//     class-year milestones, test sittings, college-list dates, logged work. It
//     knew everything and could change nothing, so the fix for anything it
//     surfaced was "go to the other tab".
//
// They were never two features. They were the read half and the write half of
// one calendar, and the seam between them was where students lost dates: a
// deadline added on one tab appeared on the other only after a reload, the two
// disagreed about what was "next", and the AI summary reasoned over half the
// picture.
//
// The name. "Milestones" is the word this codebase already uses for the unit —
// MILESTONES is literally the catalog in src/lib/timeline.js, `stats.missed`
// counts "milestones that slipped past", and the tab's icon was already
// lucide's <Milestone>. It is the only word that honestly contains both halves:
// a deadline is a milestone with consequences, and a generated timeline entry is
// a milestone with a typical date. "Timeline" drops the pressure, "Deadlines"
// drops the arc, "Calendar" promises a month grid this is not, and "Roadmap" and
// "Command Center" are both taken elsewhere in Portfolio.
//
// What the merge buys, concretely:
//   1. One feed. Your dates and generated dates interleave in true chronological
//      order, so "what is actually next" is a fact rather than a comparison
//      between two tabs.
//   2. Editing happens in the feed. Rows that came from a `deadlines` row carry
//      `ownerRef` (see profileEvents in src/lib/timeline.js) and get a delete
//      control right there. Every other row is derived from another panel and
//      links to the panel that owns it, so there is exactly one place to change
//      any given date.
//   3. The old Deadlines tab survives as a lens, not a tab: "Your dates" filters
//      the feed to `source === 'profile'`. Nothing was taken away.
//   4. The AI read is grounded in the whole calendar instead of half of it.
//   5. It exports. A calendar the student can subscribe to on their phone is
//      worth more than one they have to remember to open (src/lib/icsExport.js).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  CalendarDays, Milestone, History, Hourglass, AlertTriangle, CheckCircle2, ChevronRight,
  Sparkles, GraduationCap, Info, ArrowRight, Filter, ListChecks, FileText, Plus, Trash2,
  Stethoscope, TrendingUp, UserCheck, Wallet, ScrollText, Compass, Trophy, BookOpen,
  CalendarX, Loader2, CalendarPlus, Layers, X, Loader, Flame, Undo2, BellRing, Telescope,
  // Aliased: `Map` is a JavaScript global.
  Map as MapIcon,
} from 'lucide-react';
import { C, glass, glass2, R, CC, G, pill, tint, btn, btnSm, btnG, inp, onTint } from '../lib/theme';
import { listItems, createItem, deleteItem } from '../lib/dataApi';
import { buildPortfolioSnapshot } from '../lib/portfolioData';
import { buildTimeline, TIMELINE_KINDS, KIND_BY_ID } from '../lib/timeline';
import { deriveSuggestedDeadlines } from '../lib/autoDeadlines';
import { trackItem, cancelQueuedTrack } from '../lib/trackQueue';
import { usePendingTrackKeys, useTrackQueueDrain } from '../lib/useTrackQueue';
import { rowDedupeKey, needsDeadlineDate } from '../lib/trackingCatalog';
import { sortByUrgency, urgencyOf, alertRowsFor, isAlertRow, alertParentRef as alertParentRefOf } from '../lib/milestoneUrgency';
// The one preview banner, written once and reused everywhere an out-of-band surface renders.
import { BandPreviewBanner } from './BandPreview';
import { bandOfGrade } from '../lib/gradeBand';
import { completionEffects, describeEffects, completeMilestone, reopenMilestone } from '../lib/milestoneSync';
import { collectProgramPrompts } from '../lib/programEssayPrompts';
import { showMedabrainToast } from '../lib/medabrainComments';
import { getCached, setCached, dailyKey } from '../lib/aiCache';
import { renderMarkdown } from '../lib/renderMarkdown';
import { downloadIcs } from '../lib/icsExport';
import TrackQueueNotice from './ui/TrackQueueNotice';
import PanelHero, { SectionTitle, StatTile } from './ui/PanelHero';
import Disclosure, { HelpNote, HowItWorks } from './ui/Disclosure';

// The engine returns theme KEY names (it has to stay importable from plain Node
// for scripts/verifyTimeline.mjs), so the palette lookup happens here.
const kindColor = (kind) => C[KIND_BY_ID[kind]?.colorKey] || C.blue;

const KIND_ICON = {
  application: ScrollText, testing: TrendingUp, aid: Wallet, essays: FileText,
  recommenders: UserCheck, experience: Stethoscope, academics: BookOpen,
  decision: Trophy, planning: Compass, logged: History,
};

// Status drives the whole visual language of a row: what color it borrows, what
// the right-hand chip says, and whether it reads as pressure or as a record.
const STATUS_META = {
  missed:   { label: 'slipped past', color: () => C.rose,   icon: AlertTriangle },
  today:    { label: 'today',        color: () => C.amber,  icon: Hourglass },
  soon:     { label: 'soon',         color: () => C.amber,  icon: Hourglass },
  upcoming: { label: null,           color: (k) => kindColor(k), icon: null },
  done:     { label: 'done',         color: () => C.green,  icon: CheckCircle2 },
  past:     { label: null,           color: () => C.t3,     icon: null },
};

// The `kind` values a student can pick when adding their own date. These are the
// stored `deadlines.kind` column values, which the timeline engine maps onto its
// own broader categories via DEADLINE_KIND_MAP — so this list is about how the
// student describes the date, and TIMELINE_KINDS is about how the feed groups it.
const DEADLINE_KINDS = [
  { id: 'common_app_open', label: 'Common App opens' },
  { id: 'early_action', label: 'Early Action' },
  { id: 'early_decision', label: 'Early Decision' },
  { id: 'regular_decision', label: 'Regular Decision' },
  { id: 'fafsa', label: 'FAFSA' },
  { id: 'css_profile', label: 'CSS Profile / aid' },
  { id: 'ap_exam', label: 'AP exam' },
  { id: 'ib_exam', label: 'IB exam' },
  { id: 'scholarship', label: 'Scholarship' },
  // Written by the Opportunities tab when a student saves a program — the
  // deadline itself plus its 60/30/7-day alerts. Selectable by hand too: a
  // student who finds a program we do not list files it the same way.
  { id: 'opportunity', label: 'Program / competition' },
  { id: 'custom', label: 'Other' },
];

const CURRENT_YEAR = new Date().getFullYear();
export const DEFAULT_DEADLINES = [
  { title: 'Common App opens', due_date: `${CURRENT_YEAR}-08-01`, kind: 'common_app_open' },
  { title: 'Early Action / Early Decision deadline', due_date: `${CURRENT_YEAR}-11-01`, kind: 'early_action' },
  { title: 'FAFSA opens', due_date: `${CURRENT_YEAR}-10-01`, kind: 'fafsa' },
  { title: 'Regular Decision deadline', due_date: `${CURRENT_YEAR + 1}-01-01`, kind: 'regular_decision' },
];

// The three lenses the feed can be read through. "Yours" is the old Deadlines
// tab, preserved exactly — same rows, same authority, one click away.
const LENSES = [
  { id: 'all', label: 'Everything', icon: Layers, blurb: null },
  { id: 'mine', label: 'Your dates', icon: CheckCircle2, blurb: 'Only dates you entered yourself or that came off your college list, scholarships, and recommenders. Every one of these is exact.' },
  { id: 'generated', label: 'Typical dates', icon: Sparkles, blurb: 'Only the dates MedSchoolPrep generated from your class year and track. Treat these as a normal year, not as your year — confirm each one on the official site.' },
  // The Roadmap's own items, as a lens rather than a fourth tab — same reasoning that merged
  // Deadlines and Timeline in the first place. These are commitments the student chose during a
  // fifteen-question intake, and reading them beside the dates they typed and the dates we
  // generated is the whole point of having one feed.
  { id: 'roadmap', label: 'From your roadmap', icon: MapIcon, blurb: 'Only the items on your twelve-month roadmap. Work on any of them happens in the Roadmap tab — this is where they sit on your calendar.' },
];

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// How each urgency band introduces itself. The blurb has to carry the reasoning, because the
// whole premise of this ordering is counter-intuitive: a student looking at "start this now"
// above something due sooner will assume the list is broken unless it explains itself.
const BAND_LABEL = {
  overdue: { label: 'Slipped past', blurb: 'Dated in the past and still not done. Deal with these first or decide out loud that they no longer apply.' },
  late: { label: 'Already later than you wanted', blurb: 'The date has not arrived, but the run-up these need has. They are still doable — they are no longer comfortable.' },
  start_now: { label: 'Start these now', blurb: 'Not the soonest dates on your list. These are the ones where the work behind them takes longer than the time left, which is what actually makes something urgent.' },
  start_soon: { label: 'Start within two weeks', blurb: 'You have a little slack on these, and not much. Beginning inside a fortnight keeps them comfortable.' },
  on_track: { label: 'Time in hand', blurb: 'Real dates with room before you need to begin. Worth knowing about, nothing to do today.' },
};

const fmtDate = (d, withYear = true) =>
  new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) });

/** "2026-03" → "March 2026", for saying which month a filter has narrowed the feed to. */
const fmtMonth = (key) => {
  const [y, m] = String(key).split('-');
  return `${new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, { month: 'long' })} ${y}`;
};

const countdown = (days) => (days === 0 ? 'today' : days === 1 ? 'tomorrow' : days > 0 ? `in ${days} days` : `${Math.abs(days)} days ago`);

/**
 * One fetch, one timeline, one snapshot — shared by the Milestones tab and the
 * Home card so the dashboard and the tab can never disagree about what is next.
 *
 * `refreshKey` is how a write gets reflected: the tab bumps it after adding or
 * removing a date and the whole feed is rebuilt from the server rather than
 * patched locally, because a deadline row does not just add a row — it can also
 * retire a generated placeholder (the FAFSA milestone steps aside once you keep
 * your own FAFSA date; see `when` in the MILESTONES catalog).
 */
export function useMilestoneFeed(user, refreshKey = 0) {
  const [state, setState] = useState({ timeline: null, snapshot: null, loading: true });

  useEffect(() => {
    let alive = true;
    (async () => {
      const snapshot = await buildPortfolioSnapshot().catch(() => ({}));
      if (!alive) return;
      // The roadmap travels in so its open items interleave with the student's own dates and the
      // generated milestones in one true chronological feed — see roadmapEvents in lib/timeline.js
      // for why the Roadmap must not keep a second calendar of its own.
      // The tracked combined-degree programs are matched from the college list here rather than
      // inside timeline.js, which has to stay importable from a plain Node script and so cannot
      // pull in the program catalog. `counts` is the escape hatch that already exists for exactly
      // this (see buildTimelineContext).
      const combinedPrograms = collectProgramPrompts({ colleges: snapshot?.colleges || [] }).length;
      const build = (snap) => buildTimeline({
        user, snapshot: snap, roadmap: user?.roadmap || null,
        counts: combinedPrograms ? { combinedPrograms } : null,
      });
      let timeline;
      try { timeline = build(snapshot); } catch { timeline = build({}); }
      setState({ timeline, snapshot, loading: false });
    })();
    return () => { alive = false; };
    // Rebuilt when the identity inputs change or a write asks for it; portfolio
    // rows are re-fetched on mount, which is when this panel is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.gradeStage, user?.gradeStageYear, user?.apIb, refreshKey]);

  return state;
}

/** Timeline only — the shape the Home card and any read-only consumer wants. */
export function useTimeline(user, refreshKey = 0) {
  return useMilestoneFeed(user, refreshKey).timeline;
}

/**
 * The raw `deadlines` rows, for callers that only need the count (App.jsx's
 * achievement checks, the weekly-goal metrics). Kept here so the resource has
 * exactly one hook in the codebase.
 */
export function useDeadlines() {
  const [deadlines, setDeadlines] = useState(null);
  useEffect(() => {
    listItems('deadlines').then(setDeadlines).catch(() => setDeadlines([]));
  }, []);
  return deadlines;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function PortfolioMilestones({ accent = C.indigo, user = null, apIb = false, askMedabrain, onNavigate, onAdded, isMobile = false }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);
  const { timeline, snapshot, loading } = useMilestoneFeed(user, refreshKey);
  const { entries: pendingEntries, status: trackStatus } = usePendingTrackKeys();

  const [lens, setLens] = useState('all');
  // ── Sort order ────────────────────────────────────────────────────────────
  // Urgency by default, and that default is the point. A chronological feed answers "what is
  // next" and quietly answers the wrong question: a summer research program closing in ninety
  // days that needs two months of run-up is more urgent than a form due in thirty that takes an
  // afternoon, and date order puts the form on top. See src/lib/milestoneUrgency.js. The
  // chronological view is one tap away and unchanged, because "when is it" is still a question.
  const [sortMode, setSortMode] = useState('urgency');
  const [kindFilter, setKindFilter] = useState(null);
  const [monthFilter, setMonthFilter] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [addingAll, setAddingAll] = useState(false);
  const [seeding, setSeeding] = useState(false);
  // Rows removed in this session but not yet gone from the server round-trip.
  // Without this the delete looks like it did nothing until the refetch lands.
  const [hidden, setHidden] = useState(() => new Set());

  // Anything that flushed from the offline queue in the background belongs in
  // the feed without a manual reload.
  useTrackQueueDrain(refresh);

  const go = useCallback((action) => {
    if (!action || !onNavigate) return;
    onNavigate(action.tab, action.view);
  }, [onNavigate]);

  const deadlineRows = snapshot?.deadlines || [];

  // ── Writes ────────────────────────────────────────────────────────────────
  const addDeadline = useCallback(async (row) => {
    const res = await trackItem('deadlines', row, { dedupeKey: rowDedupeKey('deadlines', row), label: row.title, existing: deadlineRows });
    if (res.status === 'duplicate') { toast('That date is already on your timeline', { icon: '✓' }); return res; }
    if (res.status === 'created') {
      // ── The 60/30/7 ladder, on every date the student adds ────────────────
      // Saved programs have had this since they were saved; a date typed by hand had nothing,
      // which meant the one category of deadline the app knew least about — the one the student
      // found themselves — was also the only one with no run-up warning at all. Skipped for dates
      // inside a week (three reminders for something due Friday is noise) and for reminder rows
      // themselves, which would otherwise recurse. See alertRowsFor.
      const alerts = isAlertRow(row) ? [] : alertRowsFor(
        { ...row, source_ref: row.source_ref || `deadline:${res.row.id}` },
        { parentRef: row.source_ref || `deadline:${res.row.id}` },
      );
      let made = 0;
      for (const a of alerts) {
        try { await createItem('deadlines', a); made += 1; } catch { /* an alert that fails is not worth failing the date over */ }
      }
      showMedabrainToast('deadline_added', { title: res.row.title });
      if (made) toast(`Added ${made} reminder${made === 1 ? '' : 's'} before that date — 60, 30 and 7 days out.`, { icon: '⏳', duration: 5000 });
      onAdded?.();
      refresh();
    } else {
      toast(`${row.title} is saved on this device and will finish saving shortly.`, { icon: '📥', duration: 6000 });
    }
    return res;
  }, [deadlineRows, onAdded, refresh]);

  // ── Completion — the other half of two-way ────────────────────────────────
  // Finishing a date is not deleting it. Completing propagates to whatever the milestone came
  // from (the program's college-list row, the tracked activity, the scholarship) and closes the
  // row's own reminders, and the student is told what else is about to change before it does.
  // See src/lib/milestoneSync.js.
  const completeRow = useCallback(async (ownerRef) => {
    const row = deadlineRows.find(d => d.id === ownerRef.id);
    if (!row) return;
    const effects = completionEffects(row, snapshot || {});
    const also = describeEffects(effects);
    if (!window.confirm(`Mark “${row.title}” as done?${also ? `\n\n${also}` : ''}`)) return;
    try {
      const applied = await completeMilestone(row, snapshot || {});
      toast.success(applied.length
        ? `Done — and ${applied.length} other thing${applied.length === 1 ? '' : 's'} updated to match.`
        : 'Marked done.');
      onAdded?.();
      refresh();
    } catch (err) { toast.error(err.message); }
  }, [deadlineRows, snapshot, onAdded, refresh]);

  const reopenRow = useCallback(async (ownerRef) => {
    const row = deadlineRows.find(d => d.id === ownerRef.id);
    if (!row) return;
    try {
      await reopenMilestone(row);
      toast('Back on your list.', { icon: '↩️' });
      refresh();
    } catch (err) { toast.error(err.message); }
  }, [deadlineRows, refresh]);

  const removeDeadline = useCallback(async (ownerRef, eventId) => {
    const row = deadlineRows.find(d => d.id === ownerRef.id);
    // The 60/30/7 reminders this row owns go with it. Leaving them behind is how a student ends
    // up with three countdowns to a date that is no longer on their timeline — which reads as the
    // app being broken, and is the reason nobody trusts a reminder they did not set themselves.
    const children = row && row.source_ref && !isAlertRow(row)
      ? deadlineRows.filter(d => alertParentRefOf(d) === row.source_ref)
      : [];
    if (!window.confirm(children.length
      ? `Remove this date and its ${children.length} reminder${children.length === 1 ? '' : 's'} from your timeline?`
      : 'Remove this date from your timeline?')) return;
    setHidden(prev => new Set(prev).add(eventId));
    if (row) await cancelQueuedTrack('deadlines', rowDedupeKey('deadlines', row));
    try { await deleteItem('deadlines', ownerRef.id); }
    catch (err) {
      toast.error(err.message);
      setHidden(prev => { const n = new Set(prev); n.delete(eventId); return n; });
      return;
    }
    for (const child of children) {
      try { await deleteItem('deadlines', child.id); } catch { /* an orphaned reminder is survivable; failing the delete is not */ }
    }
    refresh();
    setHidden(new Set());
  }, [deadlineRows, refresh]);

  async function seedDefaults() {
    setSeeding(true);
    try {
      await Promise.all(DEFAULT_DEADLINES.map(d => createItem('deadlines', d)));
      toast.success('Added the common admissions dates — replace each one with your schools\' real dates as you confirm them.');
      onAdded?.();
      refresh();
    } catch (err) { toast.error(err.message); }
    finally { setSeeding(false); }
  }

  // ── Suggestions, derived from what is already tracked elsewhere ────────────
  const suggestions = useMemo(
    () => deriveSuggestedDeadlines({
      colleges: snapshot?.colleges || [],
      scholarships: snapshot?.scholarships || [],
      apIb,
      existingDeadlines: deadlineRows,
    }),
    [snapshot?.colleges, snapshot?.scholarships, apIb, deadlineRows]
  );
  const dateless = useMemo(() => needsDeadlineDate(snapshot?.scholarships || []), [snapshot?.scholarships]);

  async function addAllSuggestions() {
    setAddingAll(true);
    let created = 0;
    let queued = 0;
    try {
      // Sequential rather than Promise.all: a partial failure used to reject the whole batch
      // and lose every successfully-created row, leaving the feed out of sync until a reload.
      for (const s of suggestions) {
        const row = { title: s.title, due_date: s.due_date, kind: s.kind, college_id: s.college_id };
        const res = await trackItem('deadlines', row, { dedupeKey: rowDedupeKey('deadlines', row), label: s.title, existing: deadlineRows });
        if (res.status === 'created') created++;
        else if (res.status === 'queued') queued++;
      }
      if (created) { toast.success(`Added ${created} date${created === 1 ? '' : 's'} to your timeline`); onAdded?.(); }
      if (queued) toast(`${queued} saved on this device — they'll finish saving automatically.`, { icon: '📥', duration: 6000 });
      if (created || queued) refresh();
    } finally { setAddingAll(false); }
  }

  // ── Filtering ─────────────────────────────────────────────────────────────
  // Split from the month filter on purpose: the month strip has to be drawn from
  // everything the *other* filters allow, or picking a month would collapse the
  // strip to the single bar you just clicked and there would be no way to see —
  // or reach — any other month.
  const matchesExceptMonth = useCallback((e) => {
    if (hidden.has(e.id)) return false;
    if (lens === 'mine' && e.source !== 'profile') return false;
    if (lens === 'roadmap' && e.source !== 'roadmap') return false;
    if (lens === 'generated' && e.source !== 'catalog') return false;
    if (kindFilter && e.kind !== kindFilter) return false;
    return true;
  }, [hidden, lens, kindFilter]);

  const matches = useCallback(
    (e) => matchesExceptMonth(e) && (!monthFilter || e.date.slice(0, 7) === monthFilter),
    [matchesExceptMonth, monthFilter]
  );

  const filteredGroups = useMemo(() => {
    if (!timeline) return [];
    return timeline.groups
      .map(g => ({ ...g, items: g.items.filter(matches) }))
      .filter(g => g.items.length);
  }, [timeline, matches]);

  // How much of the feed renders inline. The "slipped past / this week / next 30 days" buckets
  // always do — those are the ones a student can act on — and then enough calendar months to
  // make the page feel like a year rather than a stub, before the rest goes behind a door.
  const NEAR_GROUPS = 4;
  const nearGroups = useMemo(() => filteredGroups.slice(0, NEAR_GROUPS), [filteredGroups]);
  const laterGroups = useMemo(() => filteredGroups.slice(NEAR_GROUPS), [filteredGroups]);
  const laterCount = useMemo(() => laterGroups.reduce((n, g) => n + g.items.length, 0), [laterGroups]);

  // The bands the previewed milestones belong to, so the banner names the right year
  // ("most students use this senior year") rather than a generic later-on.
  const bandsOfPreview = useMemo(() => {
    const own = bandOfGrade(timeline?.gradeStage);
    const out = [];
    (timeline?.preview || []).forEach(e => (e.bands || []).forEach(b => {
      // A milestone can span bands (grades: ['sophomore','senior'] touches both explore and
      // apply), so the student's OWN band can appear on something that is nonetheless out of
      // band for them. Naming it in the banner would read as "most students use these in 9th
      // grade" to a ninth grader, which is nonsense — so their own band is dropped here.
      if (b !== own && !out.includes(b)) out.push(b);
    }));
    return out;
  }, [timeline]);

  const visibleUpcoming = useMemo(
    () => (timeline ? timeline.upcoming.filter(matches) : []),
    [timeline, matches]
  );
  const stripEvents = useMemo(
    () => (timeline ? timeline.upcoming.filter(matchesExceptMonth) : []),
    [timeline, matchesExceptMonth]
  );

  // The same visible list, ordered by slack rather than by date, and cut into bands so the
  // ordering explains itself — an undifferentiated list sorted by an invisible number is worse
  // than a date-sorted one, because the student cannot tell why anything is where it is.
  const urgencyGroups = useMemo(() => {
    if (sortMode !== 'urgency') return [];
    const sorted = sortByUrgency(visibleUpcoming);
    const bands = new Map();
    sorted.forEach(e => {
      const b = urgencyOf(e).band;
      if (!bands.has(b.id)) bands.set(b.id, { key: b.id, band: b, items: [] });
      bands.get(b.id).items.push(e);
    });
    return [...bands.values()]
      .sort((a, b) => a.band.rank - b.band.rank)
      .map(g => ({ ...g, label: BAND_LABEL[g.band.id].label, blurb: BAND_LABEL[g.band.id].blurb }));
  }, [sortMode, visibleUpcoming]);

  // ── Meta Brain's read on the merged feed ──────────────────────────────────
  // Grounded in the actual upcoming list — the prompt embeds it and forbids
  // inventing anything outside it — and cached per-day AND per-list-shape so it
  // only re-calls Groq when the day rolls over or the calendar actually changes.
  const brainList = useMemo(
    () => (timeline ? timeline.upcoming.slice(0, 12) : []),
    [timeline]
  );
  const brainSummary = useBrainTake(askMedabrain, brainList);

  const filtersOn = !!(kindFilter || monthFilter || lens !== 'all');
  const clearFilters = () => { setKindFilter(null); setMonthFilter(null); setLens('all'); };

  function exportCalendar() {
    const events = (timeline?.upcoming || []).filter(e => e.days >= 0);
    if (!events.length) { toast('Nothing upcoming to export yet.', { icon: '📅' }); return; }
    const n = downloadIcs(events, {
      calendarName: `MedSchoolPrep — ${timeline.gradeLabel || 'Milestones'}`,
      filename: 'medschoolprep-milestones.ics',
    });
    toast.success(`${n} milestone${n === 1 ? '' : 's'} exported — open the file to add them to your calendar.`);
  }

  if (!timeline) {
    return (
      <div style={CC({ gap: 16 })}>
        <Hero accent={accent} timeline={null} isMobile={isMobile} onExport={null} />
        <div style={{ ...glass({ padding: 24, textAlign: 'center' }), color: C.t3, fontSize: 13 }}>
          <Loader size={16} className="spin" style={{ verticalAlign: 'middle', marginRight: 8 }} />
          Building your timeline…
        </div>
      </div>
    );
  }

  const { stats, gradeLabel, next } = timeline;
  const kindsPresent = TIMELINE_KINDS.filter(k => stats.byKind[k.id] && k.id !== 'logged');
  const yoursCount = deadlineRows.length;

  return (
    <div style={CC({ gap: 16 })}>
      <Hero accent={accent} timeline={timeline} isMobile={isMobile} onExport={exportCalendar} />

      <TrackQueueNotice entries={pendingEntries.filter(e => e.resource === 'deadlines')} status={trackStatus} onRetried={refresh} />

      {/* The shape of this tab, said once. Two kinds of date live in one feed here and the
          difference between them matters — without a sentence saying so, a generated "typical"
          date and a deadline the student confirmed themselves look identical. */}
      <HowItWorks
        id="milestones" color={accent} m={isMobile}
        steps={[
          { title: 'It fills itself in', body: 'Your class year builds the calendar — including the health-track dates students miss entirely: summer programs that close in December, HOSA qualifying, science-fair entry, combined-degree supplements.' },
          { title: 'Everything gets a countdown', body: 'Any date you add gets reminders at 60, 30 and 7 days. Saving a program or an opportunity builds its whole ladder for you.' },
          { title: 'Worked in the right order', body: 'Sorted by how soon you have to start rather than by which date is soonest. Tick one off and whatever it came from updates too.' },
        ]}
      />

      {/* No class year on file. This is a prompt, not a gate — the old Timeline
          tab returned early here, which in a merged tab would take the deadline
          editor away from exactly the students who most need somewhere to put a
          date. Their own dates still render below; only the generated calendar
          is withheld, because a freshman's and a senior's are nothing alike and
          showing the wrong one is worse than showing none. */}
      {!gradeLabel && (
        <CalloutCard color={C.amber} icon={GraduationCap} title="Set your graduation year to unlock the generated calendar">
          <p style={{ fontSize: 12, color: C.t2, lineHeight: 1.55, margin: 0 }}>
            We don't know what year you graduate, so we won't guess your admissions calendar — a freshman and a senior get
            completely different dates. Anything you add below still works right now and still counts down on your Home dashboard.
          </p>
          {onNavigate && (
            <button onClick={() => onNavigate('settings', null)} style={btnG({ marginTop: 12, fontSize: 12, padding: '8px 16px' })}>
              Open settings<ArrowRight size={12} />
            </button>
          )}
        </CalloutCard>
      )}

      {/* What to do first. Meta Brain's read is the only thing on this page that
          weighs the whole calendar and says a sentence about it, so it leads —
          everything below it is the calendar itself. */}
      <BrainTake summary={brainSummary} />

      <AddMilestone accent={accent} open={composerOpen} setOpen={setComposerOpen} onAdd={addDeadline} />

      {suggestions.length > 0 && (
        <CalloutCard color={C.violet} icon={ListChecks}
          title={`${suggestions.length} date${suggestions.length === 1 ? '' : 's'} we can add for you`}
          right={
            <button style={btnSm(tint(C.violet, 0.2), { color: onTint(C.violet) })} disabled={addingAll} onClick={addAllSuggestions}>
              {addingAll ? <Loader2 size={12} className="spin" /> : <Plus size={12} />}Add all
            </button>
          }>
          <p style={{ fontSize: 11.5, color: C.t3, marginBottom: 12, lineHeight: 1.5, marginTop: 0 }}>
            These come from dates you already entered on College List and Financial Aid, plus FAFSA and AP/IB. None of them are
            guesses — add one and it becomes an exact date in the list below.
          </p>
          <div style={CC({ gap: 4 })}>
            {suggestions.map((s, i) => (
              <div key={`${s.title}-${i}`} style={{ ...glass2({ padding: '8px 12px' }), display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: C.t1 }}>{s.title}</div>
                  <div style={{ fontSize: 10.5, color: C.t3, marginTop: 4 }}>{fmtDate(s.due_date)} · {s.source}</div>
                </div>
                <button style={btnSm('rgba(255,255,255,0.06)', { color: C.t2 })}
                  onClick={() => addDeadline({ title: s.title, due_date: s.due_date, kind: s.kind, college_id: s.college_id })}>
                  <Plus size={12} />Add
                </button>
              </div>
            ))}
          </div>
        </CalloutCard>
      )}

      {/* Tracked scholarships that can never produce a date because they have none.
          deriveSuggestedDeadlines() skips them by design, which used to mean a student
          who tracked six scholarships saw an empty suggestion list and reasonably
          concluded their deadlines were handled. Name the gap instead. */}
      {dateless.length > 0 && (
        <CalloutCard color={C.amber} icon={CalendarX}
          title={`${dateless.length} tracked scholarship${dateless.length === 1 ? '' : 's'} can't count down yet`}>
          <p style={{ fontSize: 11.5, color: C.t2, marginBottom: 12, marginTop: 0, lineHeight: 1.55 }}>
            {dateless.length === 1 ? 'This one is' : 'These are'} tracked on your Financial Aid tab but {dateless.length === 1 ? 'has' : 'have'} no
            deadline date, so {dateless.length === 1 ? 'it' : 'they'} can't appear below. Add the real date from the program's site on the
            Financial Aid tab — we don't guess deadlines.
          </p>
          <div style={CC({ gap: 4 })}>
            {dateless.slice(0, 8).map(s => (
              <div key={s.id} style={{ ...glass2({ padding: '8px 12px' }), fontSize: 12.5, color: C.t2 }}>{s.name}</div>
            ))}
            {dateless.length > 8 && <div style={{ fontSize: 11, color: C.t3 }}>…and {dateless.length - 8} more</div>}
          </div>
          {onNavigate && (
            <button onClick={() => onNavigate('portfolio', 'aid')} style={btnG({ marginTop: 12, fontSize: 11.5, padding: '8px 12px' })}>
              Open financial aid<ArrowRight size={11} />
            </button>
          )}
        </CalloutCard>
      )}

      {/* The counts, and where the dates came from.
          Four number tiles and a two-clause sentence about data provenance are the right thing
          to read second — after you know what's next — and completely the wrong thing to open
          a page with. The tiles are still filters (each one selects what it counts), which is
          why the line under them now says so out loud. */}
      <Disclosure id="milestones-numbers" icon={ListChecks} color={C.violet} m={isMobile}
        title="Your timeline in numbers"
        sub={`${stats.upcoming} ahead · ${stats.soon} due within two weeks · ${stats.missed} slipped past`}>
        <div style={CC({ gap: 12 })}>
          <div style={G(4, 12, {}, isMobile)}>
            <StatTile icon={Hourglass}
              value={next ? (next.days === 0 ? 'Today' : next.days < 0 ? 'Overdue' : `${next.days}d`) : '—'}
              label={next ? truncate(next.title, 30) : 'nothing ahead'}
              sub={next ? fmtDate(next.date) : null}
              color={!next ? C.t3 : next.status === 'missed' ? C.rose : next.days <= 14 ? C.amber : C.sky}
              onClick={next ? () => { clearFilters(); setOpenId(next.id); } : undefined} />
            <StatTile icon={AlertTriangle} value={stats.soon} label="due within 14 days"
              color={stats.soon > 0 ? C.amber : C.green} />
            <StatTile icon={AlertTriangle} value={stats.missed} label="slipped past, still open"
              color={stats.missed > 0 ? C.rose : C.green} />
            <StatTile icon={CheckCircle2} value={yoursCount} label="dates you added"
              sub={`${stats.fromYourData} exact · ${stats.generated} typical`}
              color={C.violet}
              onClick={() => { setKindFilter(null); setMonthFilter(null); setLens(lens === 'mine' ? 'all' : 'mine'); }} />
          </div>

          <HelpNote>Tap the first box to open that date in the list below; tap the last one to show only the dates you added yourself.</HelpNote>

          {/* Where these dates come from — said once, plainly, so a generated date is
              never mistaken for one the student confirmed. */}
          <div style={{ ...glass2({ padding: '12px 12px' }), display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <Info size={13} color={C.t3} style={{ marginTop: 4, flexShrink: 0 }} />
            <div style={{ fontSize: 11.5, color: C.t3, lineHeight: 1.55 }}>
              <b style={{ color: C.t2 }}>{stats.fromYourData}</b> of these came from what you've logged — those dates are exact.{' '}
              <b style={{ color: C.t2 }}>{stats.generated}</b> are typical-year dates worked out from your class year, courses, test track and college list. They're marked <span style={pill(C.s3, C.t3, { fontSize: 9 })}>typical</span> — check them on the school's own site before you plan around them.
            </div>
          </div>
        </div>
      </Disclosure>

      {/* ── The controls for the feed ── lens, category, month.
          Three stacked rows of pills plus a bar chart, all of which only narrow a list the
          student hasn't read yet. They're a door now, so the feed starts immediately under the
          things that ask something of you.

          The one thing that must never hide behind that door is the fact that a filter is ON:
          a closed panel with an active month filter is a feed that has silently lost most of
          its rows. So whenever anything is filtering, the state and the way out are printed
          outside the door, in words. */}
      {filtersOn && (
        <div style={{ ...glass2({ padding: '8px 12px' }), display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', border: `1px solid ${tint(accent, 0.28)}` }}>
          <Filter size={12} color={accent} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 160, fontSize: 11.5, color: C.t2, lineHeight: 1.55 }}>
            You're only seeing {[
              lens === 'mine' ? 'dates you added yourself' : lens === 'generated' ? 'typical dates' : lens === 'roadmap' ? 'items from your roadmap' : null,
              kindFilter ? (TIMELINE_KINDS.find(k => k.id === kindFilter)?.label || 'one category').toLowerCase() : null,
              monthFilter ? fmtMonth(monthFilter) : null,
            ].filter(Boolean).join(' · ')} — some of your dates are hidden.
          </span>
          <button onClick={clearFilters} style={btnSm(tint(accent, 0.16), { color: onTint(accent), fontSize: 11, padding: '4px 12px', flexShrink: 0 })}>
            <X size={11} />Show everything
          </button>
        </div>
      )}

      <Disclosure id="milestones-filters" icon={Filter} color={accent} m={isMobile}
        title="Find a particular date"
        sub="Narrow to your own dates, a category, or a month.">
      <div style={CC({ gap: 8 })}>
        <div style={R({ gap: 8, flexWrap: 'wrap' })}>
          {LENSES.map(l => {
            const on = lens === l.id;
            const Ic = l.icon;
            const col = l.id === 'mine' ? C.violet : l.id === 'generated' ? C.sky : l.id === 'roadmap' ? C.fuchsia : accent;
            return (
              <button key={l.id} onClick={() => setLens(l.id)} aria-pressed={on} style={{
                ...pill(on ? tint(col, 0.18) : C.s3, on ? col : C.t3, {
                  fontSize: 11, gap: 4, fontWeight: 700, padding: '4px 12px',
                  border: `1px solid ${on ? tint(col, 0.42) : C.b1}`,
                }),
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
              }}>
                <Ic size={11} />{l.label}
                {l.id === 'mine' && <b style={{ marginLeft: 4, fontFamily: C.FM, opacity: 0.75 }}>{stats.fromYourData}</b>}
                {l.id === 'generated' && <b style={{ marginLeft: 4, fontFamily: C.FM, opacity: 0.75 }}>{stats.generated}</b>}
              </button>
            );
          })}
          <span style={{ flex: 1 }} />
          {filtersOn && (
            <button onClick={clearFilters} style={{ ...btnSm(C.s3, { fontSize: 11, color: C.t3, padding: '4px 12px' }) }}>
              <X size={11} />Clear filters
            </button>
          )}
        </div>

        {LENSES.find(l => l.id === lens)?.blurb && (
          <div style={{ fontSize: 11, color: C.t3, lineHeight: 1.55 }}>{LENSES.find(l => l.id === lens).blurb}</div>
        )}

        {kindsPresent.length > 1 && (
          <div style={R({ gap: 8, flexWrap: 'wrap' })}>
            <button onClick={() => setKindFilter(null)} style={{
              ...pill(kindFilter ? C.s3 : tint(accent, 0.16), kindFilter ? C.t3 : accent, { fontSize: 10.5, gap: 4, border: `1px solid ${kindFilter ? C.b1 : tint(accent, 0.35)}` }),
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
            }}><Filter size={10} />All categories</button>
            {kindsPresent.map(k => {
              const col = C[k.colorKey] || C.blue;
              const on = kindFilter === k.id;
              const Ic = KIND_ICON[k.id] || CalendarDays;
              return (
                <button key={k.id} onClick={() => setKindFilter(on ? null : k.id)} title={k.blurb} aria-pressed={on} style={{
                  ...pill(on ? tint(col, 0.18) : C.s3, on ? col : C.t3, { fontSize: 10.5, gap: 4, border: `1px solid ${on ? tint(col, 0.4) : C.b1}` }),
                  cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
                }}><Ic size={10} />{k.label}</button>
              );
            })}
          </div>
        )}

        <MonthStrip events={stripEvents} active={monthFilter} onPick={setMonthFilter} accent={accent} />
        <HelpNote>Tap a bar to jump to that month — tap it again to come back to the whole year.</HelpNote>
      </div>
      </Disclosure>

      {filteredGroups.length === 0 && (
        <EmptyNote accent={accent} icon={filtersOn ? ListChecks : CalendarDays}
          text={filtersOn
            ? 'Nothing matches those filters. Clear them to see the rest of your timeline.'
            : yoursCount === 0
              ? "Nothing is on your timeline yet. Add a date above, or start from the four dates almost every applicant shares — you can edit or delete any of them afterwards."
              : 'Nothing is coming up. Everything you are tracking is either already handled or behind you.'}
          cta={filtersOn
            ? { label: 'Clear filters', onClick: clearFilters }
            : yoursCount === 0 && !loading
              ? { label: seeding ? 'Adding…' : 'Add the common admissions dates', onClick: seedDefaults }
              : null} />
      )}

      {/* The feed itself, cut where a student stops being able to act.
          buildTimeline() groups coarsely near today and by calendar month after that, which is
          right — but rendering every group means a junior's page is sixteen month cards deep,
          and the four that describe next week look exactly like the one for July. Everything
          from the fourth group on is real, still here, and one tap down: nothing between now
          and the end of the month is ever hidden, because those are the ones with something
          to do about them. */}
      {/* ── How the list is ordered ──────────────────────────────────────────
          Two honest orderings of the same dates, and the default is the one a student cannot
          produce for themselves: how long the work takes is knowledge about programs they have
          never applied to. "When is it" remains one tap away. */}
      {visibleUpcoming.length > 1 && (
        <div style={{ ...glass2({ padding: '8px 12px' }), display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Flame size={12} color={sortMode === 'urgency' ? C.amberL : C.t3} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 180, fontSize: 11.5, color: C.t3, lineHeight: 1.55 }}>
            {sortMode === 'urgency'
              ? 'Ordered by how soon you have to start, not by which date is soonest — a deadline in 90 days that needs two months of work outranks one in 30 that takes an afternoon.'
              : 'Ordered by date, soonest first.'}
          </span>
          <div style={R({ gap: 4, flexShrink: 0 })}>
            {[{ id: 'urgency', label: 'By urgency' }, { id: 'date', label: 'By date' }].map(o => {
              const on = sortMode === o.id;
              return (
                <button key={o.id} onClick={() => setSortMode(o.id)} aria-pressed={on} style={{
                  ...pill(on ? tint(accent, 0.18) : C.s3, on ? accent : C.t3, {
                    fontSize: 11, fontWeight: 700, padding: '4px 12px',
                    border: `1px solid ${on ? tint(accent, 0.4) : C.b1}`,
                  }),
                  cursor: 'pointer',
                }}>{o.label}</button>
              );
            })}
          </div>
        </div>
      )}

      {sortMode === 'urgency'
        ? urgencyGroups.map(group => (
          <MilestoneGroup key={group.key} group={group} accent={accent} openId={openId} setOpenId={setOpenId}
            onGo={go} onDelete={removeDeadline} onComplete={completeRow} isMobile={isMobile}
            urgent={group.band.rank <= 2} showUrgency />
        ))
        : (
          <>
            {nearGroups.map(group => (
              <MilestoneGroup key={group.key} group={group} accent={accent} openId={openId} setOpenId={setOpenId}
                onGo={go} onDelete={removeDeadline} onComplete={completeRow} isMobile={isMobile} />
            ))}

            {laterGroups.length > 0 && (
              <Disclosure id="milestones-later" icon={CalendarDays} color={C.sky} m={isMobile}
                title={`Further ahead (${laterCount} ${laterCount === 1 ? 'date' : 'dates'})`}
                sub={`Everything from ${laterGroups[0].label} onwards — worth knowing about, nothing you can do today.`}>
                <div style={CC({ gap: 12 })}>
                  {laterGroups.map(group => (
                    <MilestoneGroup key={group.key} group={group} accent={accent} openId={openId} setOpenId={setOpenId}
                      onGo={go} onDelete={removeDeadline} onComplete={completeRow} isMobile={isMobile} />
                  ))}
                </div>
              </Disclosure>
            )}
          </>
        )}

      {/* Already handled — kept out of the feed so it reads as work left, but
          visible on demand so the student can see the engine noticing. */}
      {timeline.done.length > 0 && (
        <CollapsibleList
          id="milestones-done"
          title={`Already handled (${timeline.done.length})`} icon={CheckCircle2} color={C.green}
          blurb="Dates you've marked done, and ones you've already satisfied with something you logged. Nothing here is nagging you."
          items={timeline.done.filter(e => !hidden.has(e.id))} onGo={go} onDelete={removeDeadline} onReopen={reopenRow} />
      )}

      {timeline.past.length > 0 && (
        <CollapsibleList
          id="milestones-past"
          title={`Your record (${timeline.past.length})`} icon={History} color={C.t3}
          blurb="Everything already behind you — hours logged, scores earned, dates that have passed."
          items={timeline.past.filter(e => !hidden.has(e.id))} onGo={go} onDelete={removeDeadline} dim />
      )}

      {/* ── The years ahead ──────────────────────────────────────────────────
          Every milestone that belongs to a different grade band: the senior
          application calendar for a ninth grader, the aid deadlines, Decision
          Day. These are NOT on the feed above and are not counted anywhere as
          work owed — that is the whole and only difference band membership
          makes. But they are here, dated against this student's own class
          years, fully readable, one tap away, because a freshman who never
          sees any of this has no way to know the app becomes something else
          in three years. See src/lib/gradeBand.js. */}
      {(timeline.preview?.length || 0) > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <BandPreviewBanner bands={bandsOfPreview} compact />
          <CollapsibleList
            id="milestones-preview"
            title={`The years ahead (${timeline.preview.length})`} icon={Telescope} color={C.cyanL}
            blurb="Dates from the parts of the road you haven't reached yet, worked out against your own class years. Nothing here is asked of you and none of it counts toward anything — it is here so you can see where this goes."
            items={timeline.preview.filter(e => !hidden.has(e.id))} onGo={go} dim />
        </div>
      )}

      {visibleUpcoming.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button onClick={exportCalendar} style={btnG({ fontSize: 12, padding: '8px 16px' })}>
            <CalendarPlus size={13} />Export {timeline.upcoming.filter(e => e.days >= 0).length} upcoming to your calendar
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pieces
// ─────────────────────────────────────────────────────────────────────────────

function Hero({ accent, timeline, isMobile, onExport }) {
  const stats = timeline?.stats;
  const next = timeline?.next;
  const gradeLabel = timeline?.gradeLabel;
  const gradYear = timeline?.years?.gradYear;
  return (
    <PanelHero tourTag="portfolio-deep-milestones" icon={Milestone} color={accent} color2={C.rose} m={isMobile}
      eyebrow="Milestones"
      title="Every date you have to hit"
      sub={gradeLabel
        ? `Deadlines, test dates and application milestones in one list, soonest first — yours, plus the ones a ${gradeLabel.toLowerCase()}${gradYear ? ` graduating in ${gradYear}` : ''} normally has. Nothing from four years away.`
        : 'Deadlines, test dates and application milestones in one list, soonest first. Add your own below — and set your graduation year in Settings and we fill in the rest of the admissions calendar around them.'}
      stats={stats ? [
        ...(next ? [{ value: next.days === 0 ? 'today' : `${next.days}d`, label: 'to your next one', color: next.days <= 14 ? C.amberL : C.indigoL }] : []),
        { value: stats.upcoming, label: 'coming up', color: C.skyL },
        ...(stats.missed ? [{ value: stats.missed, label: 'slipped past', color: C.roseL }] : []),
      ] : []}
      right={onExport && (
        <button onClick={onExport} title="Download an .ics file of everything upcoming" style={btnSm(tint(accent, 0.18), { color: onTint(accent), fontSize: 11.5, border: `1px solid ${tint(accent, 0.32)}` })}>
          <CalendarPlus size={12} />Export
        </button>
      )} />
  );
}

/**
 * Meta Brain's urgency read. Extracted into a hook because the effect's
 * dependency discipline is the entire correctness story: askMedabrain is a plain
 * closure App.jsx recreates every render, so making it a dependency would refire
 * this (and risk a duplicate in-flight Groq call) on any unrelated re-render.
 * cacheKey alone captures everything that should trigger a refetch — the day
 * rolling over, or the actual list of dates changing.
 */
function useBrainTake(askMedabrain, events) {
  const [summary, setSummary] = useState(null);
  const cacheKey = useMemo(
    () => dailyKey('milestonesPriority', events.map(e => `${e.title}:${e.date}`).join('|')),
    [events]
  );
  const fetchedKeyRef = useRef(null);

  useEffect(() => {
    if (!askMedabrain || events.length === 0) { setSummary(null); return undefined; }
    const cached = getCached(cacheKey);
    if (cached) { setSummary({ loading: false, content: cached, error: null }); fetchedKeyRef.current = cacheKey; return undefined; }
    if (fetchedKeyRef.current === cacheKey) return undefined;
    fetchedKeyRef.current = cacheKey;
    let cancelled = false;
    setSummary({ loading: true, content: null, error: null });
    const list = events
      .map(e => {
        const u = urgencyOf(e);
        return `"${e.title}" ${e.days < 0 ? `${Math.abs(e.days)}d OVERDUE` : `in ${e.days}d`} (${e.kind}${e.confidence === 'typical' ? ', typical date — not confirmed' : ', their own exact date'}; the work behind it takes about ${u.lead} days, so ${u.slack <= 0 ? 'it should already have been started' : `there are about ${u.slack} days before it has to be started`})`;
      })
      .join('; ');
    // The lead-time figures are in the prompt because "prioritize the soonest" is exactly the
    // wrong advice on this feed and it is the advice a model gives when it only sees dates.
    askMedabrain(`Here is this student's real upcoming Milestones feed: ${list}. In 2-3 concise sentences, tell them what to prioritize this week and why. Prioritize by how much SLACK is left — days until due minus the run-up the work needs — not by which date is soonest: a deadline ninety days out needing two months of preparation is more urgent than one thirty days out that takes an afternoon, and saying otherwise costs them the first one. Only reference milestones from this exact list — never invent one. If you cite a date marked "typical", say it still needs confirming on the official site.`)
      .then(content => { if (!cancelled) { setCached(cacheKey, content); setSummary({ loading: false, content, error: null }); } })
      .catch(err => { if (!cancelled) { fetchedKeyRef.current = null; setSummary({ loading: false, content: null, error: err.message }); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- askMedabrain intentionally excluded, see comment above
  }, [cacheKey]);

  return summary;
}

function BrainTake({ summary }) {
  if (!summary) return null;
  // This card now leads the tab, so a failed model call would put "we couldn't reach Meta Brain"
  // at the very top of a page whose every date is sitting right there and perfectly correct.
  // Nothing is lost by staying quiet about it: the feed below never needed the summary.
  if (summary.error) return null;
  return (
    <div style={{ ...glass2({ padding: 16 }), background: `linear-gradient(120deg,${tint(C.violet, 0.08)},rgba(255,255,255,0.02) 55%)`, border: `1px solid ${tint(C.violet, 0.25)}` }}>
      <div style={R({ gap: 8, marginBottom: summary.loading ? 0 : 8 })}>
        <Sparkles size={13} color={C.violetL} />
        <span style={{ fontSize: 11, fontWeight: 700, color: C.violetL, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))' }}>What to do first</span>
      </div>
      {summary.loading && <div style={R({ gap: 8, color: C.t3, fontSize: 12 })}><Loader2 size={13} className="spin" />Working out what's most urgent…</div>}
      {summary.content && !summary.loading && <div style={{ fontSize: 12.5, color: C.t2, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: renderMarkdown(summary.content) }} />}
    </div>
  );
}

/** The composer. Collapsed by default — this tab is mostly for reading. */
function AddMilestone({ accent, open, setOpen, onAdd }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [kind, setKind] = useState('custom');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!title.trim() || !date) return;
    setSaving(true);
    try {
      const res = await onAdd({ title: title.trim(), due_date: date, kind });
      if (res?.status !== 'duplicate') { setTitle(''); setDate(''); setKind('custom'); }
    } finally { setSaving(false); }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{
        ...glass({ padding: '12px 16px' }),
        background: `linear-gradient(120deg,${tint(accent, 0.07)},rgba(255,255,255,0.02) 55%)`,
        border: `1px dashed ${tint(accent, 0.34)}`,
        display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', width: '100%',
        textAlign: 'left', font: 'inherit', color: 'inherit',
      }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: tint(accent, 0.14), border: `1px solid ${tint(accent, 0.3)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Plus size={14} color={accent} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: C.t1 }}>Add your own date</div>
          <div style={{ fontSize: 11, color: C.t3, marginTop: 4 }}>A supplement, an interview, a program application — anything with a date lands in the feed below and on your Home dashboard.</div>
        </div>
      </button>
    );
  }

  return (
    <div style={{ ...glass({ padding: 16 }), background: `linear-gradient(120deg,${tint(accent, 0.06)},rgba(255,255,255,0.02) 55%)`, border: `1px solid ${tint(accent, 0.2)}` }}>
      <div style={R({ justifyContent: 'space-between', marginBottom: 12 })}>
        <SectionTitle icon={Plus} color={accent} extra={{ marginBottom: 0 }}>Add your own date</SectionTitle>
        <button onClick={() => setOpen(false)} aria-label="Close" style={btnSm(C.s3, { color: C.t3, padding: '4px 8px' })}><X size={12} /></button>
      </div>
      <form onSubmit={submit} style={R({ gap: 8, flexWrap: 'wrap' })}>
        <input style={inp({ flex: 1, minWidth: 180 })} placeholder="e.g. Stanford EA deadline" value={title} onChange={e => setTitle(e.target.value)} />
        <input type="date" aria-label="Date" style={inp({ width: 'auto' })} value={date} onChange={e => setDate(e.target.value)} />
        <select aria-label="Category" style={inp({ width: 'auto' })} value={kind} onChange={e => setKind(e.target.value)}>
          {DEADLINE_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
        </select>
        <button type="submit" disabled={saving || !title.trim() || !date} style={btn(accent !== C.blue ? accent : C.blueGrad, { opacity: saving || !title.trim() || !date ? 0.55 : 1 })}>
          {saving ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}Add
        </button>
      </form>
    </div>
  );
}

/**
 * The next twelve months as a density strip. A chronological feed is honest but
 * flat — this is the one view that answers "when does this year actually get
 * heavy", and doubles as the month filter.
 */
function MonthStrip({ events, active, onPick, accent }) {
  const months = useMemo(() => {
    const now = new Date();
    const out = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      out.push({ key, label: MONTH_SHORT[d.getMonth()], year: d.getFullYear(), count: 0, urgent: 0 });
    }
    const byKey = Object.fromEntries(out.map(m => [m.key, m]));
    events.forEach(e => {
      const m = byKey[e.date.slice(0, 7)];
      if (!m) return;
      m.count += 1;
      if (e.weight >= 3) m.urgent += 1;
    });
    return out;
  }, [events]);

  const peak = Math.max(1, ...months.map(m => m.count));
  if (!months.some(m => m.count)) return null;

  return (
    <div style={{ ...glass2({ padding: '12px 12px' }), overflowX: 'auto' }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', minWidth: 480 }}>
        {months.map(m => {
          const on = active === m.key;
          const col = m.urgent ? C.rose : m.count ? accent : C.t4;
          const h = m.count ? 8 + Math.round((m.count / peak) * 26) : 3;
          return (
            <button key={m.key}
              onClick={() => onPick(on ? null : m.count ? m.key : null)}
              disabled={!m.count}
              aria-pressed={on}
              title={m.count ? `${m.count} in ${m.label} ${m.year}${m.urgent ? ` · ${m.urgent} critical` : ''}` : `Nothing in ${m.label} ${m.year}`}
              style={{
                all: 'unset', flex: 1, minWidth: 30, cursor: m.count ? 'pointer' : 'default',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                opacity: m.count ? 1 : 0.4,
              }}>
              <span style={{ fontSize: 9.5, fontFamily: C.FM, color: on ? col : C.t3 }}>{m.count || ''}</span>
              <span style={{
                width: '100%', height: h, borderRadius: 4,
                background: m.count ? `linear-gradient(180deg,${tint(col, on ? 0.85 : 0.5)},${tint(col, on ? 0.5 : 0.2)})` : C.b1,
                border: on ? `1px solid ${tint(col, 0.7)}` : '1px solid transparent',
              }} />
              <span style={{ fontSize: 9.5, color: on ? col : C.t3, fontWeight: on ? 700 : 500 }}>{m.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MilestoneGroup({ group, accent, openId, setOpenId, onGo, onDelete, onComplete, isMobile, urgent = false, showUrgency = false }) {
  const missed = group.key === 'missed' || group.key === 'overdue';
  const color = missed ? C.rose : urgent ? C.amber : accent;
  return (
    <div style={{
      ...glass({ padding: isMobile ? 14 : 18 }),
      background: `linear-gradient(160deg,${tint(color, missed || urgent ? 0.09 : 0.05)},rgba(255,255,255,0.02) 45%)`,
      border: missed ? `1px solid ${tint(C.rose, 0.3)}` : urgent ? `1px solid ${tint(C.amber, 0.28)}` : undefined,
    }}>
      <SectionTitle icon={missed ? AlertTriangle : urgent ? Flame : Hourglass} color={color}>{group.label} ({group.items.length})</SectionTitle>
      {group.blurb && <div style={{ fontSize: 11.5, color: C.t3, marginTop: -8, marginBottom: 12, lineHeight: 1.55 }}>{group.blurb}</div>}
      <div style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', left: 14, top: 10, bottom: 10, width: 2, background: `linear-gradient(180deg,${tint(color, 0.35)},${tint(color, 0.04)})`, borderRadius: 4 }} />
        <div style={CC({ gap: 8 })}>
          {group.items.map(e => (
            <MilestoneRow key={e.id} e={e} open={openId === e.id} onToggle={() => setOpenId(openId === e.id ? null : e.id)}
              onGo={onGo} onDelete={onDelete} onComplete={onComplete} showUrgency={showUrgency} />
          ))}
        </div>
      </div>
    </div>
  );
}

function MilestoneRow({ e, open, onToggle, onGo, onDelete, onComplete, onReopen, showUrgency = false, dim = false }) {
  const urgency = urgencyOf(e);
  // A reminder generated by the 60/30/7 ladder, rather than a date in its own right. Marked so a
  // student can tell "start the Stanford SIMR application" apart from the application deadline
  // itself — three reminders and a deadline that all look identical is four deadlines.
  const reminder = String(e.ownerRef?.sourceRef || e.sourceRef || '').startsWith('alert:');
  const meta = STATUS_META[e.status] || STATUS_META.upcoming;
  const col = meta.color(e.kind);
  const kc = kindColor(e.kind);
  const Ic = KIND_ICON[e.kind] || CalendarDays;
  const StatusIcon = meta.icon;
  const pressing = e.status === 'missed' || e.status === 'today' || e.status === 'soon';
  // Only a row backed by a real `deadlines` row is editable here. Everything
  // else is derived from a panel that owns it, and duplicating the edit would
  // mean two places to change one date.
  const owned = !!e.ownerRef && !!onDelete;

  return (
    <div style={{ display: 'flex', gap: 12, position: 'relative', paddingLeft: 32, opacity: dim ? 0.6 : 1 }}>
      <div style={{
        position: 'absolute', left: 8, top: 16, width: 14, height: 14, borderRadius: '50%',
        background: C.s1, border: `2.5px solid ${col}`, boxShadow: pressing ? `0 0 9px ${tint(col, 0.6)}` : 'none',
      }} />
      <div style={{
        ...glass2({ padding: '12px 12px', flex: 1, minWidth: 0 }),
        background: `linear-gradient(120deg,${tint(kc, 0.06)},rgba(255,255,255,0.02) 60%)`,
        border: `1px solid ${pressing ? tint(col, 0.4) : C.b1}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={onToggle} style={{
            all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, boxSizing: 'border-box',
          }} aria-expanded={open}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: tint(kc, 0.13), border: `1px solid ${tint(kc, 0.28)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Ic size={13} color={kc} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: C.t1, lineHeight: 1.35 }}>{e.title}</div>
              <div style={{ fontSize: 10.5, color: C.t3, marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                <span>{fmtDate(e.date)}</span>
                {meta.label && <span style={{ color: col, fontWeight: 700 }}>· {e.status === 'missed' ? `${countdown(e.days)} — still open` : countdown(e.days)}</span>}
                {!meta.label && e.days >= 0 && <span>· {countdown(e.days)}</span>}
                {e.doneLabel && <span style={pill(tint(C.green, 0.14), C.greenL, { fontSize: 9 })}>{e.doneLabel}</span>}
                {reminder && <span style={pill(C.s3, C.t3, { fontSize: 9, gap: 4 })}><BellRing size={8} />reminder</span>}
                {e.confidence === 'typical' && <span style={pill(C.s3, C.t3, { fontSize: 9 })}>typical</span>}
                {e.confidence === 'exact' && e.source === 'profile' && <span style={pill(tint(C.sky, 0.12), C.skyL, { fontSize: 9 })}>yours</span>}
                {e.source === 'roadmap' && <span style={pill(tint(C.fuchsia, 0.12), C.fuchsia, { fontSize: 9 })}>roadmap</span>}
              </div>
            </div>
            {StatusIcon && <StatusIcon size={13} color={col} style={{ flexShrink: 0 }} />}
            <ChevronRight size={13} color={C.t3} style={{ flexShrink: 0, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
          </button>
          {owned && onComplete && e.status !== 'done' && (
            <button onClick={() => onComplete(e.ownerRef)} aria-label={`Mark ${e.title} done`} title="Mark this done — and update whatever it came from"
              style={btnSm(tint(C.green, 0.14), { color: C.greenL, padding: '4px 8px', flexShrink: 0 })}>
              <CheckCircle2 size={11} />
            </button>
          )}
          {owned && onReopen && e.status === 'done' && (
            <button onClick={() => onReopen(e.ownerRef)} aria-label={`Put ${e.title} back on the list`} title="Put this back on your list"
              style={btnSm(C.s3, { color: C.t3, padding: '4px 8px', flexShrink: 0 })}>
              <Undo2 size={11} />
            </button>
          )}
          {owned && (
            <button onClick={() => onDelete(e.ownerRef, e.id)} aria-label={`Remove ${e.title}`} title="Remove this date"
              style={btnSm(C.roseDim, { color: C.rose, padding: '4px 8px', flexShrink: 0 })}>
              <Trash2 size={11} />
            </button>
          )}
        </div>

        {/* The reason this row sits where it does. Only in the urgency ordering, and only when
            the run-up is long enough for the placement to be surprising — a sentence explaining
            why a two-week task is where it is would be noise. */}
        {showUrgency && urgency.reason && (
          <div style={{ fontSize: 11, color: urgency.band.rank <= 2 ? C.amberL : C.t3, lineHeight: 1.55, marginTop: 8, paddingLeft: 40 }}>
            {urgency.reason}
          </div>
        )}
        {open && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.b1}` }}>
            <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.65 }}>{e.detail}</div>
            {e.why && (
              <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <Sparkles size={11} color={C.violetL} style={{ marginTop: 4, flexShrink: 0 }} />
                <div style={{ fontSize: 11.5, color: C.t3, lineHeight: 1.6, fontStyle: 'italic' }}>{e.why}</div>
              </div>
            )}
            {e.action && onGo && (
              <button onClick={() => onGo(e.action)} style={btnSm(C.s3, { marginTop: 12, fontSize: 11.5, gap: 4 })}>
                {e.action.label}<ArrowRight size={11} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Everything behind you, on a door that remembers whether you opened it. The
 * shell is the shared Disclosure so this reads as the same kind of "more, if you
 * want it" as every other one in Portfolio — the blurb becomes the sub-line, so
 * what's inside is described before it's opened rather than after.
 */
function CollapsibleList({ id, title, icon: Icon, color, blurb, items, onGo, onDelete, onReopen = null, dim = false }) {
  if (!items.length) return null;
  return (
    <Disclosure id={id} title={title} sub={blurb} icon={Icon} color={color}>
      <div style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', left: 14, top: 10, bottom: 10, width: 2, background: tint(color, 0.18), borderRadius: 4 }} />
        <div style={CC({ gap: 8 })}>
          {items.map(e => <MilestoneRow key={e.id} e={e} open={false} onToggle={() => {}} onGo={onGo} onDelete={onDelete} onReopen={onReopen} dim={dim} />)}
        </div>
      </div>
    </Disclosure>
  );
}

function CalloutCard({ color, icon, title, right, children }) {
  return (
    <div style={{ ...glass({ padding: 16 }), background: `linear-gradient(120deg,${tint(color, 0.07)},rgba(255,255,255,0.02) 55%)`, border: `1px solid ${tint(color, 0.24)}` }}>
      <div style={R({ justifyContent: 'space-between', marginBottom: right ? 12 : 0, gap: 8, flexWrap: 'wrap' })}>
        <SectionTitle icon={icon} color={color} extra={{ marginBottom: right ? 0 : 12 }}>{title}</SectionTitle>
        {right}
      </div>
      {children}
    </div>
  );
}

function EmptyNote({ accent, icon: Icon = CalendarDays, text, cta }) {
  return (
    <div style={glass({ padding: 24, textAlign: 'center' })}>
      <div style={{ width: 46, height: 46, borderRadius: 12, background: tint(accent, 0.12), border: `1px solid ${tint(accent, 0.28)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
        <Icon size={20} color={accent} />
      </div>
      <div style={{ fontSize: 13, color: C.t2, lineHeight: 1.65, maxWidth: 520, margin: '0 auto' }}>{text}</div>
      {cta && <button onClick={cta.onClick} style={btnG({ marginTop: 12, fontSize: 12, padding: '8px 16px' })}>{cta.label}</button>}
    </div>
  );
}

const truncate = (s, n) => (String(s).length > n ? `${String(s).slice(0, n)}…` : String(s));

// ─────────────────────────────────────────────────────────────────────────────
// The Home-page card.
//
// Home used to show a single "next deadline" countdown built only from rows the
// student had typed in — so a student who had typed nothing (which is most of
// them, and all of the freshmen) got told they had no deadlines, which was
// false. This shows the same merged feed the Milestones tab shows, trimmed to
// what is genuinely next, so the dashboard is reminding them of real dates on
// day one and the two surfaces cannot disagree.
// ─────────────────────────────────────────────────────────────────────────────
export function TimelineNextCard({ user, accent = C.blue, onNavigate, limit = 4 }) {
  const timeline = useTimeline(user);
  if (!timeline) return null;

  const { stats, gradeLabel } = timeline;
  const items = timeline.upcoming.slice(0, limit);

  if (!items.length) {
    return (
      <div style={{ ...glass({ padding: 16 }), display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, color: C.t2 }}>
          {gradeLabel ? 'Nothing is coming up on your timeline yet — add your colleges and deadlines and it fills in.' : 'Set your graduation year in Settings and your application timeline builds itself.'}
        </div>
        {onNavigate && <button style={btnG({ fontSize: 12, padding: '8px 16px' })} onClick={() => onNavigate('portfolio', 'milestones')}>Open milestones</button>}
      </div>
    );
  }

  const lead = items[0];
  const leadUrgent = lead.days <= 14 || lead.status === 'missed';
  const leadColor = lead.status === 'missed' ? C.roseL : leadUrgent ? C.amberL : kindColor(lead.kind);

  return (
    <div style={{ ...glass({ padding: 16 }), border: leadUrgent ? `1px solid ${tint(leadColor, 0.4)}` : undefined }}>
      <div style={R({ gap: 8, marginBottom: 12 })}>
        <Milestone size={14} color={leadColor} />
        <span style={{ fontSize: 10, fontWeight: 700, color: C.t3, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))'}}>What's next</span>
        {gradeLabel && <span style={pill(C.s3, C.t3, { fontSize: 9.5 })}>{gradeLabel}</span>}
        <span style={{ flex: 1 }} />
        {onNavigate && (
          <button onClick={() => onNavigate('portfolio', 'milestones')} style={{ all: 'unset', cursor: 'pointer', fontSize: 11, color: C.t3, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {stats.upcoming} ahead<ChevronRight size={12} />
          </button>
        )}
      </div>

      <div style={R({ gap: 8, alignItems: 'baseline', marginBottom: 4 })}>
        <span style={{ fontSize: 28, letterSpacing: 'calc(-0.6px + var(--msp-letter-spacing))', lineHeight: 'calc(1.25 * var(--msp-line-scale))', fontWeight: 800, color: leadColor, fontFamily: C.FD }}>
          {lead.status === 'missed' ? '!' : lead.days === 0 ? 'Today' : lead.days}
        </span>
        {lead.days > 0 && <span style={{ fontSize: 12, color: C.t3 }}>day{lead.days === 1 ? '' : 's'} until</span>}
        {lead.status === 'missed' && <span style={{ fontSize: 12, color: C.roseL }}>{countdown(lead.days)} and still open</span>}
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: C.t1, fontFamily: C.FD }}>{lead.title}</div>
      <div style={{ fontSize: 11, color: C.t3, marginTop: 4, display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        <span>{fmtDate(lead.date)}</span>
        {lead.confidence === 'typical' && <span style={pill(C.s3, C.t3, { fontSize: 9 })}>typical date</span>}
      </div>
      {lead.why && <div style={{ fontSize: 11.5, color: C.t2, marginTop: 8, lineHeight: 1.55 }}>{lead.why}</div>}
      {(lead.action || lead.ownerRef) && onNavigate && (
        <button
          onClick={() => (lead.action ? onNavigate(lead.action.tab, lead.action.view) : onNavigate('portfolio', 'milestones'))}
          style={btnSm(C.s3, { marginTop: 12, fontSize: 11.5, gap: 4 })}>
          {lead.action?.label || 'Open Milestones'}<ArrowRight size={11} />
        </button>
      )}

      {items.length > 1 && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.b1}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.slice(1).map(e => {
            const col = kindColor(e.kind);
            const Ic = KIND_ICON[e.kind] || CalendarDays;
            return (
              <button key={e.id} onClick={() => onNavigate?.(e.action?.tab || 'portfolio', e.action?.view || 'milestones')} style={{
                all: 'unset', cursor: onNavigate ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <div style={{ width: 22, height: 22, borderRadius: 8, background: tint(col, 0.13), border: `1px solid ${tint(col, 0.26)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Ic size={10} color={col} />
                </div>
                <span style={{ fontSize: 12, color: C.t2, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</span>
                <span style={{ fontSize: 10.5, color: e.days <= 14 ? C.amberL : C.t3, fontFamily: C.FM, flexShrink: 0 }}>{e.days === 0 ? 'today' : `${e.days}d`}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
