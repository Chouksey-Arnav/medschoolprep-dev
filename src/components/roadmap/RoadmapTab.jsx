import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Map as MapIcon, Sparkles, RefreshCw, CalendarDays, Compass, ListChecks, Target,
  AlertTriangle, ShieldQuestion, Lightbulb, Plus, Download,
  Layers, Scale, Quote, X, Info, CheckCircle2, TrendingUp, ArrowRight, Circle, Lock,
} from 'lucide-react';
import { C, glass, glass2, btn, btnSm, btnG, R, CC, G, tint, pill, accentFill, accentText, onTint, autoGrid, inp } from '../../lib/theme';
import SubNav from '../ui/SubNav';
import PanelHero, { SectionTitle, StatTile } from '../ui/PanelHero';
import EmptyState from '../ui/EmptyState';
import BrandJourney from '../BrandJourney';
import { downloadIcs } from '../../lib/icsExport';
import { TRACK_BY_ID } from '../../data/roadmap/index.js';
import * as RoadmapStore from '../../lib/roadmap/store';
import * as DB from '../../lib/db';
import { fetchPortfolio } from '../PlansTab';
import { buildProfileFactsText } from '../../lib/masterPlanGenerator';
import { intakeProgress } from '../../lib/roadmap/intake';
import {
  createRoadmap, deepenSeason, seasonNeedingDepth, repairRoadmap, roadmapNeedsFullRebuild,
} from '../../lib/roadmap/generator';
import {
  allItems, itemsInSeason, currentSeason, nextActions, roadmapStats, roadmapToCalendarEvents,
  toggleItemDone, setItemStatus, setItemDate, moveItemToSeason, toggleItemStep,
  addStudentItem, addSuggestionAsItem, removeItem, itemUrgency, effectiveDue, roadmapIsStale, roadmapIsExpired,
  crunchMonths, validateSlate, OPEN_STATUSES, URGENCY_ORDER,
} from '../../lib/roadmap/model';
import RoadmapIntake from './RoadmapIntake';
import RoadmapItem from './RoadmapItem';
import RoadmapSpine from './RoadmapSpine';
import RoadmapTimeline from './RoadmapTimeline';
import RoadmapPath from './RoadmapPath';
import RoadmapAscent from './RoadmapAscent';
import { computeRoadmapReadiness, readinessContext } from '../../lib/roadmap/readiness';
import { DegradedNotice, trackColor, fmtDate, URGENCY_META } from './roadmapUi';
import { dayKey, daysBetween } from '../../lib/timeline';

// ─────────────────────────────────────────────────────────────────────────────
// The Roadmap tab.
//
// The product thesis, stated once: a private admissions counselor costs several
// thousand dollars a year and the students who most need one are exactly the
// students who will never have one. What that counselor actually does is not
// mystical — they know which deadlines exist, they know which ones apply to
// THIS student, they know how far ahead the work has to start, and they say so
// out loud a season before it matters. This tab does that, for free, for anyone.
//
// ── The five views, and why each exists ─────────────────────────────────────
//   overview — the answer to "what do I do now", plus the year's thesis and the
//              honest read-back. If a student only ever opens one screen in this
//              tab, this is the one that has to be worth it.
//   year     — the spine. The only view that answers "when does my year get
//              hard", months before it does.
//   seasons  — the strategy, quarter by quarter, with the items inside each.
//   list     — everything, filterable. The reference view for someone who knows
//              what they are looking for.
//   intake   — the fifteen answers, editable, because the roadmap is only as
//              good as its inputs and those change.
//
// ── What this tab is NOT allowed to do ──────────────────────────────────────
// Print a raw date. Every date on every one of these screens goes through
// <ItemDate>/dateCaption (see roadmapUi.jsx). scripts/verifyRoadmap.mjs greps
// this folder and fails the build on a raw interpolation.
// ─────────────────────────────────────────────────────────────────────────────

const ACCENT = C.violet;

// ── The six screens, ordered by the question a student arrives with ──────────
// Not by importance and not by how much work each took to build. A sub-nav is
// read left to right by someone who does not yet know what any of it means, so
// the order is the order the questions occur to a person:
//
//   Overview    what do I do now?
//   Your Year   when does all of it happen?
//   The Climb   what do I get out of doing it?          ← the "why bother" screen
//   Seasons     what is this stretch of my life for?
//   Everything  where is that one thing I saw?
//   Your Answers what is this even built from?
//
// The Climb sits third rather than last because it is the answer to the
// question that decides whether the other five get opened again next week, and
// burying the payoff behind four reference screens is how a plan becomes a
// chore list. See the header of RoadmapAscent.jsx.
export const ROADMAP_SUBNAV = [
  { id: 'overview', ic: Compass, label: 'Overview', color: C.violet },
  { id: 'year', ic: CalendarDays, label: 'Your year', color: C.sky },
  { id: 'climb', ic: TrendingUp, label: 'The climb', color: C.green },
  { id: 'seasons', ic: Layers, label: 'Seasons', color: C.teal },
  { id: 'list', ic: ListChecks, label: 'Everything', color: C.amber },
  { id: 'intake', ic: Target, label: 'Your answers', color: C.fuchsia },
];

// ── The build, as the student sees it ────────────────────────────────────────
// createRoadmap() narrates itself through onStage, and every label it emits is
// one of these five passes. They are listed here so the loading screen can show
// the SHAPE of the work — five named steps on a line, the same line the finished
// roadmap is drawn on — instead of a spinner and a lie about how long it will
// take. Written to describe what is genuinely happening rather than to imply it
// is nearly finished, the same discipline PlansTab's LOADING_STAGES adopted
// after the fast-and-generic failure mode it documents.
//
// `match` is how a stage string coming back from the generator is mapped onto a
// step. Deliberately a loose test on the distinctive words rather than an
// equality check on the whole sentence: pass 3 emits a per-season label ("…for
// October – January…") that cannot be predicted here, and a screen that silently
// stopped advancing because a label was reworded would be worse than no screen.
const BUILD_PASSES = [
  { id: 'read', label: 'Reading you', match: /reading your answers|portfolio/i, blurb: 'Your answers, your Portfolio, your grade, your colleges — everything we know, in one place.' },
  { id: 'strategy', label: 'The strategy', match: /what this year/i, blurb: 'What these twelve months are actually for, and what you are deliberately not doing with them.' },
  { id: 'choose', label: 'Choosing', match: /choosing/i, blurb: 'Which competitions, programs, scholarships and deadlines belong in your year — and which do not.' },
  { id: 'detail', label: 'The detail', match: /working detail/i, blurb: 'Turning each choice into real preparation: what to do, in what order, and what to have ready.' },
  { id: 'review', label: 'Read back', match: /reading it back|honest/i, blurb: 'Reading the whole year back and being straight about what it does and does not do for you.' },
];

const BUILD_FALLBACK_STAGES = [
  'Reading your answers and your whole Portfolio…',
  'Working out what this year should actually be about…',
  'Choosing the competitions, programs and deadlines that fit you…',
  'Writing the working detail, season by season…',
  'Reading it back and being honest about it…',
];

/** Which pass a generator stage label belongs to. Never regresses past the furthest reached. */
export function passIndexForStage(stage, floor = 0) {
  const i = BUILD_PASSES.findIndex((p) => p.match.test(String(stage || '')));
  return Math.max(floor, i === -1 ? floor : i);
}

/**
 * The student's whole Portfolio, and the digest built from it.
 *
 * Same self-fetch pattern PlansTab uses, and deliberately the SAME fetchPortfolio and the SAME
 * buildProfileFactsText — a second, drifting copy of "everything we know about this student" is
 * exactly how one of the two generators ends up blind to a category the other can see. The
 * roadmap needs every college, essay, logged hour and activity for the same reason the master
 * plan does: a roadmap that cannot see the six colleges already on their list cannot back-plan
 * from those colleges' deadlines, which is the entire point of asking.
 *
 * `ensure()` re-fetches right before a build so the roadmap is designed against the Portfolio as
 * it is at click time, not as it was when the tab mounted.
 */
function usePortfolioFacts(user, liveSignals) {
  const [portfolio, setPortfolio] = useState(null);
  const inFlight = useRef(null);
  const mounted = useRef(true);

  const load = useCallback(() => {
    if (inFlight.current) return inFlight.current;
    const p = fetchPortfolio()
      .then((data) => { if (mounted.current) setPortfolio(data); return data; })
      .catch(() => null)
      .finally(() => { inFlight.current = null; });
    inFlight.current = p;
    return p;
  }, []);

  useEffect(() => {
    mounted.current = true;
    load();
    return () => { mounted.current = false; };
  }, [load]);

  const facts = useMemo(
    () => (user ? buildProfileFactsText(user, liveSignals || {}, portfolio, user?.masterPlan || null) : null),
    [user, liveSignals, portfolio],
  );

  const ensureFacts = useCallback(async () => {
    const fresh = (await load()) || portfolio || null;
    return {
      portfolio: fresh,
      facts: user ? buildProfileFactsText(user, liveSignals || {}, fresh, user?.masterPlan || null) : null,
    };
  }, [load, portfolio, user, liveSignals]);

  return { portfolio, facts, ensureFacts };
}

export default function RoadmapTab({
  user, saveUser, liveSignals = null, accent = ACCENT, isMobile = false,
  view = 'overview', onViewChange, goPortfolio, goPlans,
  // One generic (tab, view) jump. The readiness gate's rows are data — each gate
  // in src/lib/roadmap/readiness.js declares where it is satisfied — so the gate
  // screen cannot use a fixed set of callbacks the way the rest of this tab
  // does. Defaults to a no-op so the component still renders standalone.
  onNavigate = null,
  // The student's motion preference, threaded down from App.jsx exactly as it is
  // for Plans. Every animated surface in this tab reads it: the build screen,
  // the spine's markers, the timeline's reveal, the drag glide.
  //
  // This prop is why the tab exists in its current form at all. It used to be
  // READ WITHOUT BEING DECLARED — <BuildingScreen … reducedMotion={reducedMotion}/>
  // with no `reducedMotion` in scope — which is a ReferenceError, thrown at
  // render, on the exact line that runs the instant a build starts. So every
  // build died at click time, before a single generator pass, and the root
  // error boundary swallowed the tab. It looked like "the roadmap will not
  // generate"; it was a one-word scope bug on the loading screen.
  reducedMotion = false,
  // The sub-nav is filtered for feature unlocks by App.jsx (visibleItems +
  // unlocks.locked) and rendered here, the same split every other pillar uses.
  // Defaults keep this component usable on its own — in a test, or if a caller
  // forgets — rather than rendering a tab with no way to move around it.
  subnavItems = ROADMAP_SUBNAV, hrefFor = null, lockedItem = null,
}) {
  const roadmap = user?.roadmap || null;
  const [building, setBuilding] = useState(false);
  const [stage, setStage] = useState(BUILD_FALLBACK_STAGES[0]);
  const [showIntake, setShowIntake] = useState(false);
  // A repair runs in place rather than behind the build screen — it is one or
  // two calls, not five passes, and replacing the whole roadmap with a loading
  // screen for ten seconds would hide the thing being repaired.
  const [repairing, setRepairing] = useState(false);
  // What the last press of the degraded banner's button achieved, so the banner
  // can say so. Session state on purpose: it is about this visit, not about the
  // roadmap, and persisting it would have a student meeting yesterday's failure
  // message on a screen that is now fine.
  const [lastAttempt, setLastAttempt] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [trackFilter, setTrackFilter] = useState('all');
  const [showDone, setShowDone] = useState(false);
  const [adding, setAdding] = useState(false);
  const deepenRef = useRef(false);
  const today = dayKey();
  const { portfolio, facts: portfolioFacts, ensureFacts } = usePortfolioFacts(user, liveSignals);

  const stats = useMemo(() => (roadmap ? roadmapStats(roadmap, today) : null), [roadmap, today]);
  const upNext = useMemo(() => (roadmap ? nextActions(roadmap, { limit: 5, today }) : []), [roadmap, today]);
  const season = useMemo(() => (roadmap ? currentSeason(roadmap, today) : null), [roadmap, today]);
  const stale = useMemo(() => roadmapIsStale(roadmap, { user, answers: roadmap?.intake || {}, portfolio }), [roadmap, user, portfolio]);
  const expired = useMemo(() => roadmapIsExpired(roadmap, today), [roadmap, today]);
  const balance = useMemo(() => (roadmap ? (roadmap.balance || validateSlate(roadmap)) : null), [roadmap]);

  // ── Can a roadmap usefully be built for this student yet? ──────────────────
  // Checked before the intake rather than after it: asking fifteen questions
  // and THEN saying "actually we cannot build this" would be the worst possible
  // ordering, and it is the ordering you get by default if the gate lives next
  // to the generator. See src/lib/roadmap/readiness.js for why each gate is
  // there and why there are only five of them.
  const readiness = useMemo(
    () => computeRoadmapReadiness(user, readinessContext({ portfolio, liveSignals })),
    [user, portfolio, liveSignals],
  );
  // The measured application strength this tab draws the climb from. Computed by
  // App.jsx from the whole Portfolio and threaded down with the rest of the live
  // signals, so the chart and the Progress tab can never disagree about a number
  // they both put on screen.
  const strength = liveSignals?.applicationStrength || null;

  // ── Persistence ────────────────────────────────────────────────────────────
  // Same "local copy is the working copy" contract the master plan uses: every
  // mutation writes through saveUser (which owns the local DB + progress_sync)
  // and mirrors to the roadmap's own table on a debounce. A failed mirror is
  // invisible to the student because it never gated anything.
  //
  // saveUser REPLACES the user record rather than merging into it (see App.jsx), so every write
  // here spreads the current user first. Passing a bare `{ roadmap }` would silently wipe their
  // name, pathway, onboarding answers and master plan — the kind of bug that looks like a
  // one-field update and is not.
  const commit = useCallback((next, reason = null) => {
    if (!next) return;
    saveUser({ ...user, roadmap: next });
    RoadmapStore.scheduleRoadmapPush(next, reason);
  }, [saveUser, user]);

  // Adopt a newer roadmap from another device on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const remote = await RoadmapStore.pullRoadmap(roadmap);
      // Re-read from Dexie rather than closing over `user`: this runs once on mount and the
      // record may have been written by another surface in between. Same reason App.jsx's own
      // plan-window refresh re-reads before saving.
      if (!cancelled && remote) {
        const current = await DB.getUser();
        saveUser({ ...(current || user), roadmap: remote });
      }
    })();
    return () => { cancelled = true; };
    // Intentionally mount-only: this is a sync-on-open, not a subscription, and
    // re-running it on every local mutation would fight the debounced push.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Deepening the next season, quietly, when the student reaches it ───────
  // The build only writes working detail for the first two seasons (see
  // createRoadmap) because the back half of a year gets rewritten by life. This
  // is what fills the rest in as it becomes near, so the roadmap keeps writing
  // itself forward instead of thinning out in month seven.
  //
  // ── Why this is attempted at most ONCE per season per mount ────────────────
  // deepenSeason returns the roadmap UNCHANGED when its call fails, which is the
  // right contract — a failed deepen must never damage a working roadmap — and
  // it means `roadmap` does not change, `seasonNeedingDepth` still names the same
  // season, and the effect is primed to fire again. It then does, because
  // `commit` is rebuilt whenever the user record's identity changes, which
  // happens on every single mutation anywhere in the tab: tick a step, pin a
  // date, mark something done, and each one fires another four-attempt Oracle
  // call for a season that is not going to deepen today. That is a quota leak
  // with no visible symptom until the daily budget is gone and the next real
  // build degrades — which is exactly the failure this tab was reported for.
  //
  // `attemptedRef` remembers the seasons already tried in this session, so a
  // failure costs one attempt rather than one per keystroke. A page reload is a
  // legitimate retry, which is why it is a ref and not persisted state.
  const attemptedDeepenRef = useRef(new Set());
  useEffect(() => {
    if (!roadmap || building || deepenRef.current) return;
    const needs = seasonNeedingDepth(roadmap, today);
    if (!needs || attemptedDeepenRef.current.has(needs.id)) return;
    deepenRef.current = true;
    attemptedDeepenRef.current.add(needs.id);
    (async () => {
      try {
        // Same lane expression as the build and the repair below. The lane now decides which
        // rate-limit budget the call spends (see subjectFor in api/groq.js), so a student who
        // fell back to their email for one call and to nothing for another would be two different
        // people to the budget — and the one with no lane at all would be charged to the whole
        // school's shared bucket, which is the failure this was all fixed for.
        const next = await deepenSeason(roadmap, needs.id, { user, portfolioFacts, lane: user?.id || user?.email || null });
        if (next !== roadmap) commit(next, `deepened ${needs.label}`);
      } finally {
        deepenRef.current = false;
      }
    })();
  }, [roadmap, building, today, user, portfolioFacts, commit]);

  // ── Build ──────────────────────────────────────────────────────────────────
  const build = useCallback(async (answers) => {
    setBuilding(true);
    setShowIntake(false);
    setStage(BUILD_FALLBACK_STAGES[0]);
    try {
      // Re-read the Portfolio at click time. A student who just added three colleges in another
      // tab and came here to build should have those colleges in the roadmap — and before this,
      // a fast enough click (or a failed first fetch) generated the whole year with the Portfolio
      // invisible, with nothing on screen to say so.
      const { portfolio: fresh, facts } = await ensureFacts();
      const next = await createRoadmap({
        user,
        answers,
        portfolioFacts: facts,
        portfolio: fresh,
        // The key-lane id. Their user id, so this student's whole multi-call
        // build stays on one of the two roadmap Groq accounts — see the
        // ROADMAP_KEYS header in api/groq.js.
        lane: user?.id || user?.email || null,
        onStage: setStage,
      });
      const current = await DB.getUser();
      saveUser({ ...(current || user), roadmap: next });
      await RoadmapStore.flushRoadmapNow(next, 'generated');
      onViewChange?.('overview');
      // A rebuild that comes back degraded AGAIN is recorded, because the banner
      // has to be able to say "we tried, it failed the same way". Without this
      // the student sees an identical screen and concludes, reasonably, that the
      // button did nothing — see the header of DegradedNotice.
      setLastAttempt(next.generation?.degraded ? { at: Date.now(), outcome: 'failed' } : null);
      toast.success(next.generation?.degraded ? 'Roadmap built — but not fully personalized.' : 'Your year is mapped.');
    } catch (err) {
      // createRoadmap is contractually total, so reaching here means something
      // outside it broke. Say so plainly rather than leaving a dead spinner.
      console.error('roadmap build failed:', err);
      toast.error('Could not build your roadmap. Try again in a moment.');
    } finally {
      setBuilding(false);
    }
  }, [user, ensureFacts, saveUser, onViewChange]);

  // ── "Rebuild it properly" ──────────────────────────────────────────────────
  //
  // Two different actions behind one affordance, chosen by what actually broke
  // (roadmapNeedsFullRebuild — see the header above it in generator.js):
  //
  //   · The year's ARGUMENT failed — strategy or slate selection fell back to the
  //     catalog. There is nothing here worth keeping, so this is a full rebuild.
  //   · Only the DETAIL failed — a season's working steps, or the read-back. The
  //     strategy and the item list are genuinely Medabrain's, and throwing them
  //     away to recover a paragraph would also throw away every date the student
  //     has pinned and every step they have ticked. So this repairs in place.
  //
  // Both paths end by recording what happened, so the banner can report it.
  const repair = useCallback(async () => {
    setRepairing(true);
    try {
      const { facts } = await ensureFacts();
      const { roadmap: next, repaired, stillDegraded } = await repairRoadmap(roadmap, {
        user, portfolioFacts: facts, lane: user?.id || user?.email || null, onStage: setStage,
      });
      if (next !== roadmap) {
        const current = await DB.getUser();
        saveUser({ ...(current || user), roadmap: next });
        await RoadmapStore.flushRoadmapNow(next, 'repaired');
      }
      if (!stillDegraded) {
        setLastAttempt(null);
        toast.success('Finished — the rest of your roadmap is written now.');
      } else {
        setLastAttempt({ at: Date.now(), outcome: repaired.length ? 'partial' : 'failed' });
        toast(repaired.length ? 'Recovered part of it.' : 'Still could not reach Medabrain.');
      }
    } catch (err) {
      console.error('roadmap repair failed:', err);
      setLastAttempt({ at: Date.now(), outcome: 'failed' });
      toast.error('Could not finish your roadmap. Try again in a moment.');
    } finally {
      setRepairing(false);
    }
  }, [roadmap, user, ensureFacts, saveUser]);

  const needsFullRebuild = useMemo(() => roadmapNeedsFullRebuild(roadmap), [roadmap]);

  const rebuild = useCallback(() => {
    if (!roadmap?.intake) { setShowIntake(true); return; }
    build(roadmap.intake);
  }, [roadmap, build]);

  /** What the degraded banner's button does — repair when that is the honest answer. */
  const fixGeneration = useCallback(() => {
    if (needsFullRebuild) rebuild();
    else repair();
  }, [needsFullRebuild, rebuild, repair]);

  // ── Item mutations ─────────────────────────────────────────────────────────
  const mutate = (fn, reason) => (...args) => commit(fn(roadmap, ...args), reason);
  const onToggleDone = mutate(toggleItemDone, 'toggled an item');
  const onSetStatus = mutate(setItemStatus, 'changed an item status');
  const onSetDate = mutate(setItemDate, 'pinned a real date');
  const onMoveSeason = mutate(moveItemToSeason, 'moved an item');
  const onToggleStep = mutate(toggleItemStep, 'ticked a step');
  const onRemove = mutate(removeItem, 'removed an item');

  /**
   * Accept a suggestion from outside the catalog, with the date the student found.
   *
   * The item that comes out is theirs — `addedBy: 'student'`, exempt from catalog
   * traceability, rendered as an exact date because a student who looked something up is
   * right about it. From here it is an ordinary roadmap item, which is the whole point:
   * it flows into the milestone feed, the sixty-day horizon and the dashboard's next
   * three alongside everything else, rather than living in a separate list of
   * suggestions nobody revisits.
   */
  const acceptSuggestion = useCallback((suggestion, date) => {
    const next = addSuggestionAsItem(roadmap, suggestion, date);
    if (next === roadmap) return;
    commit(next, `added ${suggestion.name}`);
    toast.success(date
      ? `${suggestion.name} is on your roadmap, and on your dashboard.`
      : `${suggestion.name} is on your roadmap. Add the date when you find it and it will show up on your dashboard too.`);
  }, [roadmap, commit]);

  const exportCalendar = useCallback(() => {
    const events = roadmapToCalendarEvents(roadmap);
    if (!events.length) { toast('Nothing dated to export yet.'); return; }
    downloadIcs(events, { calendarName: 'MedSchoolPrep Roadmap' });
    toast.success(`${events.length} dates exported.`);
  }, [roadmap]);

  // ── Screens ────────────────────────────────────────────────────────────────

  if (building) return <BuildingScreen stage={stage} accent={accent} isMobile={isMobile} reducedMotion={reducedMotion} />;

  // ── The gate stands in front of the FIRST build, and nothing else ─────────
  // In front, not behind: a student who has not told us their grade cannot be
  // given a year, and finding that out after fifteen questions would be the app
  // wasting their time and then blaming them for it.
  //
  // And only the first build. Once a roadmap exists the gate never appears
  // again, even if a gate has since gone unsatisfied — a student who cleared
  // their college list must still be able to open "Your Answers", change
  // something and rebuild. Blocking that would take a working feature away from
  // somebody as a punishment for editing their own record, which is not what a
  // readiness check is for.
  if (!roadmap && (showIntake || view === 'intake') && !readiness.ready) {
    return (
      <ReadinessGate
        readiness={readiness} accent={accent} isMobile={isMobile} user={user}
        onGo={(tab, v) => onNavigate?.(tab, v)}
        onBack={() => setShowIntake(false)}
      />
    );
  }

  if (showIntake || (!roadmap && view === 'intake')) {
    return (
      <div>
        <PanelHero icon={Target} color={C.fuchsia} color2={accent} eyebrow="Roadmap" m={isMobile}
          title="Thirteen questions" sub="Everything we already know about you is filled in. What is left is the handful of things a counselor would ask in a first meeting — and that nothing else in this app has ever asked." />
        <div style={{ marginTop: 20, maxWidth: 760 }}>
          <RoadmapIntake
            user={user}
            portfolio={portfolio}
            initialAnswers={roadmap?.intake || null}
            accent={accent}
            isMobile={isMobile}
            onComplete={build}
            onCancel={() => setShowIntake(false)}
          />
        </div>
      </div>
    );
  }

  if (!roadmap) {
    return (
      <IntroScreen
        accent={accent} isMobile={isMobile} user={user} readiness={readiness}
        onStart={() => setShowIntake(true)}
        onGo={(tab, v) => onNavigate?.(tab, v)}
      />
    );
  }

  const activeView = ROADMAP_SUBNAV.some((n) => n.id === view) ? view : 'overview';
  const viewAccent = ROADMAP_SUBNAV.find((n) => n.id === activeView)?.color || accent;

  const itemProps = {
    today,
    seasons: roadmap.seasons,
    isMobile,
    onToggleDone, onSetStatus, onSetDate, onMoveSeason, onToggleStep, onRemove,
  };

  return (
    <div>
      <PanelHero
        icon={MapIcon} color={accent} color2={C.fuchsia} eyebrow={`${roadmap.gradeLabel} · 12-month roadmap`}
        title={roadmap.headline} sub={roadmap.thesis} m={isMobile}
        stats={[
          { value: `${stats.done}/${stats.total - stats.skipped}`, label: 'done', color: C.green },
          ...(stats.startNow ? [{ value: stats.startNow, label: 'need starting', color: C.amber }] : []),
          ...(stats.missed ? [{ value: stats.missed, label: 'passed', color: C.rose }] : []),
        ]}
      />

      <div style={{ marginTop: 16 }}>
        <SubNav items={subnavItems} active={activeView} onChange={onViewChange} accent={viewAccent} m={isMobile} tourPrefix="roadmap-sub" hrefFor={hrefFor} locked={lockedItem} />
      </div>

      <div style={CC({ gap: 20 })}>
        <DegradedNotice
          generation={roadmap.generation}
          onRetry={fixGeneration}
          busy={repairing}
          fullRebuild={needsFullRebuild}
          lastAttempt={lastAttempt}
        />
        {(stale || expired) && (
          <StaleNotice stale={stale} expired={expired} onRebuild={rebuild} onEditAnswers={() => setShowIntake(true)} />
        )}

        {activeView === 'overview' && (
          <OverviewView
            roadmap={roadmap} stats={stats} upNext={upNext} season={season} balance={balance}
            accent={accent} isMobile={isMobile} itemProps={itemProps}
            expandedId={expandedId} setExpandedId={setExpandedId}
            strength={strength} today={today} reducedMotion={reducedMotion}
            onGoYear={() => onViewChange?.('year')}
            onGoSeasons={() => onViewChange?.('seasons')}
            onGoClimb={() => onViewChange?.('climb')}
            onExport={exportCalendar}
            onRebuild={rebuild}
          />
        )}

        {activeView === 'climb' && (
          <ClimbView
            roadmap={roadmap} strength={strength} today={today}
            isMobile={isMobile} reducedMotion={reducedMotion} accent={C.green}
            onGoList={() => onViewChange?.('list')}
            onGoPortfolio={goPortfolio}
          />
        )}

        {activeView === 'year' && (
          <YearView
            roadmap={roadmap} today={today} isMobile={isMobile} accent={C.sky} reducedMotion={reducedMotion}
            onSelectItem={(id) => { setExpandedId(id); onViewChange?.('list'); }}
            onSelectSeason={() => onViewChange?.('seasons')}
            onExport={exportCalendar}
          />
        )}

        {activeView === 'seasons' && (
          <SeasonsView
            roadmap={roadmap} today={today} isMobile={isMobile} accent={C.teal}
            itemProps={itemProps} expandedId={expandedId} setExpandedId={setExpandedId}
          />
        )}

        {activeView === 'list' && (
          <ListView
            roadmap={roadmap} today={today} isMobile={isMobile} accent={C.amber}
            itemProps={itemProps} expandedId={expandedId} setExpandedId={setExpandedId}
            trackFilter={trackFilter} setTrackFilter={setTrackFilter}
            showDone={showDone} setShowDone={setShowDone}
            adding={adding} setAdding={setAdding}
            onAdd={(draft) => { commit(addStudentItem(roadmap, draft), 'added an item'); setAdding(false); }}
            onExport={exportCalendar}
          />
        )}

        {activeView === 'intake' && (
          <AnswersView roadmap={roadmap} accent={C.fuchsia} onEdit={() => setShowIntake(true)} onRebuild={rebuild}
            onAcceptSuggestion={acceptSuggestion} />
        )}
      </div>
    </div>
  );
}

// ── The first screen a student ever sees ─────────────────────────────────────

function IntroScreen({ accent, isMobile, onStart, user, readiness, onGo }) {
  return (
    <div>
      <PanelHero icon={MapIcon} color={accent} color2={C.fuchsia} eyebrow="Roadmap" m={isMobile}
        title="The next twelve months, mapped"
        sub="Every deadline, competition, program and scholarship that applies to you — with the date it closes, the week the work has to start, and the reason it is on your list at all." />

      <div style={{ ...glass({ padding: isMobile ? 20 : 28, marginTop: 20 }) }}>
        <div style={{ fontSize: 14.5, color: C.t2, lineHeight: 1.54, maxWidth: 700 }}>
          A private admissions counselor costs several thousand dollars a year, and the students who
          need one most are the ones who will never have one. What they actually do is not mysterious:
          they know which deadlines exist, which ones apply to <b style={{ color: C.t1 }}>you</b>, how
          far ahead each one has to start, and they say so a season before it matters.
          <br /><br />
          That is what this is. Thirteen questions — most of them already filled in from what you have
          told us — and then a year built out of real programs with real dates, sequenced so nothing
          arrives too late to act on.
        </div>

        <div style={{ ...autoGrid(230, 12, { marginTop: 24 }) }}>
          <Promise icon={CalendarDays} color={C.sky} title="Real dates, never invented"
            body="Every date comes from a hand-checked catalog. Anything we are not certain of is shown as a window with a link to confirm it — never as a fact." />
          <Promise icon={Target} color={C.amber} title="Start dates, not just deadlines"
            body="A scholarship due in October that needs eight weeks of essays is an August item. That is the whole difference between a calendar and a plan." />
          <Promise icon={Scale} color={C.teal} title="Reaches with backups"
            body="Long shots are named as long shots, and every one gets something achievable beside it. A year of rejections is not a plan." />
          <Promise icon={Quote} color={C.fuchsia} title="Told straight"
            body="It will tell you what your year is betting on and what it does not cover. No flattery — you are going to be judged by strangers on paper." />
        </div>

        {readiness?.ready === false ? (
          // Not a lock screen. The button still works and still starts the
          // questions — it just lands on the gate, which is one screen listing
          // what is missing with a link beside each. Refusing outright here
          // would make the first thing this feature ever does a refusal.
          <>
            <ChecklistStrip readiness={readiness} accent={accent} onGo={onGo} isMobile={isMobile} />
            <button onClick={onStart} style={{ ...btn(accentFill(accent)), color: onTint(accent), marginTop: 16, fontSize: 15, letterSpacing: 'calc(-0.02px + var(--msp-letter-spacing))', padding: '12px 24px' }}>
              <Sparkles size={16} /> See what is left
            </button>
          </>
        ) : (
          <>
            <button onClick={onStart} style={{ ...btn(accentFill(accent)), color: onTint(accent), marginTop: 24, fontSize: 15, letterSpacing: 'calc(-0.02px + var(--msp-letter-spacing))', padding: '12px 24px' }}>
              <Sparkles size={16} /> Start the fifteen questions
            </button>
            <div style={{ fontSize: 11, color: C.t4, marginTop: 12 }}>
              About four minutes{user?.name ? `, ${user.name}` : ''} — most of it is confirming what we already know.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** The five gates as a compact progress strip, for the intro screen. */
function ChecklistStrip({ readiness, accent, onGo, isMobile }) {
  return (
    <div style={{
      marginTop: 24, padding: isMobile ? '14px 15px' : '16px 18px', borderRadius: 12,
      background: tint(accent, 0.06), border: `1px solid ${tint(accent, 0.2)}`,
    }}>
      <div style={{ ...R({ gap: 8, marginBottom: 12, flexWrap: 'wrap' }) }}>
        <span style={{ fontSize: 11.5, fontWeight: 800, color: C.t1 }}>
          {readiness.done} of {readiness.total} ready
        </span>
        <div style={{ flex: 1, minWidth: 90, height: 6, borderRadius: 4, background: C.s3, overflow: 'hidden' }}>
          <motion.div
            initial={{ width: 0 }} animate={{ width: `${readiness.pct}%` }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            style={{ height: '100%', background: accentFill(accent) }}
          />
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {readiness.checklist.map((c) => {
          const done = c.state === 'done';
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => !done && onGo?.(c.goTab, c.goView)}
              disabled={done}
              title={c.gains}
              style={{
                ...pill(done ? tint(C.green, 0.12) : C.surfHi, done ? C.green : C.t2, {
                  fontSize: 11, fontWeight: done ? 700 : 600, padding: '4px 12px', gap: 4,
                  border: `1px solid ${done ? tint(C.green, 0.3) : C.b2}`,
                  cursor: done ? 'default' : 'pointer', fontFamily: C.FB,
                }),
              }}
            >
              {done ? <CheckCircle2 size={11} /> : <Circle size={11} />}
              {c.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The gate screen.
 *
 * Reached when a student asks to build a roadmap the app does not yet know
 * enough to build well. Three rules govern how it reads, and all three exist
 * because the obvious version of this screen is a refusal with a list attached:
 *
 *   1. IT SAYS WHAT EACH THING BUYS THEM, not what it costs them. Every row
 *      carries the gate's own `gains` sentence — "grade decides the entire
 *      year", not "grade is required". A checklist standing between someone and
 *      the thing they came for has to justify every line of itself.
 *   2. EVERY ROW IS A DOOR. The action button lands exactly where the thing is
 *      done, because a list of requirements with no route to satisfying them is
 *      a dead end wearing a checklist's clothes.
 *   3. WHAT IS ALREADY DONE IS SHOWN DONE. A student who finished onboarding
 *      properly arrives at four ticks and one task, which reads as "you are
 *      nearly there". The same screen showing only the one missing item reads as
 *      "here is another hoop", and those are different screens.
 */
function ReadinessGate({ readiness, accent, isMobile, user, onGo, onBack }) {
  const next = readiness.missing[0] || null;
  return (
    <div>
      <PanelHero
        icon={Lock} color={accent} color2={C.sky} eyebrow="Roadmap" m={isMobile}
        title={`Almost — ${readiness.missing.length} thing${readiness.missing.length === 1 ? '' : 's'} left`}
        sub="Building a year is the most expensive thing this app does, and it is worth doing once, properly. These are the facts that change what comes out of it — not paperwork."
        stats={[{ value: `${readiness.done}/${readiness.total}`, label: 'ready', color: C.green }]}
      />

      <div style={{ ...glass({ padding: isMobile ? 18 : 24, marginTop: 20 }) }}>
        <div style={{ fontSize: 13, color: C.t2, lineHeight: 1.55, maxWidth: 660 }}>
          A roadmap built from a blank record is a list of national deadlines that could have been
          written for anybody — and you would only ever look at it once. Each of these changes what
          the roadmap actually says. Most take a minute.
        </div>

        <div style={{ ...CC({ gap: 8, marginTop: 20 }) }}>
          {readiness.checklist.map((c) => (
            <GateRow
              key={c.id} gate={c} isMobile={isMobile}
              highlight={c.id === next?.id}
              onGo={() => onGo?.(c.goTab, c.goView)}
            />
          ))}
        </div>

        <div style={{ ...R({ gap: 8, marginTop: 20, flexWrap: 'wrap' }) }}>
          {next && (
            <button onClick={() => onGo?.(next.goTab, next.goView)}
              style={{ ...btn(accentFill(accent)), color: onTint(accent), fontSize: 14 }}>
              {next.action} <ArrowRight size={14} />
            </button>
          )}
          <button onClick={onBack} style={btnG({ fontSize: 13 })}>Not now</button>
        </div>

        <div style={{ fontSize: 11, color: C.t4, marginTop: 12, lineHeight: 1.55, maxWidth: 620 }}>
          Nothing here is a wait — every one of them is something you can do this afternoon, from
          inside the app. Come back when they are ticked{user?.name ? `, ${user.name}` : ''} and the
          whole year takes about four minutes to build.
        </div>
      </div>
    </div>
  );
}

function GateRow({ gate, highlight, onGo, isMobile }) {
  const done = gate.state === 'done';
  const loading = gate.state === 'loading';
  const color = done ? C.green : highlight ? C.amber : C.t3;
  return (
    <div style={{
      display: 'flex', gap: 12, alignItems: 'flex-start',
      padding: isMobile ? '13px 14px' : '15px 17px', borderRadius: 12,
      background: highlight ? tint(C.amber, 0.07) : C.surf2,
      border: `1px solid ${highlight ? tint(C.amber, 0.26) : C.b1}`,
      opacity: done ? 0.72 : 1,
    }}>
      <div style={{ flexShrink: 0, marginTop: 4 }}>
        {done ? <CheckCircle2 size={18} color={C.green} />
          : loading ? <Circle size={18} color={C.t4} />
            : <Circle size={18} color={color} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13.5, fontWeight: 700, color: C.t1, lineHeight: 1.4,
          textDecoration: done ? 'line-through' : 'none',
        }}>
          {gate.label}
        </div>
        {/* The reason, always. This is the row's whole justification for existing
            and hiding it behind a tooltip would be hiding the argument. */}
        {!done && (
          <div style={{ fontSize: 11.5, color: C.t3, lineHeight: 1.55, marginTop: 4 }}>
            {gate.gains}
          </div>
        )}
      </div>
      {!done && !loading && (
        <button onClick={onGo} style={{ ...btnSm(C.surfHi, { flexShrink: 0, whiteSpace: 'nowrap' }) }}>
          {gate.action} <ArrowRight size={11} />
        </button>
      )}
    </div>
  );
}

function Promise({ icon: Icon, color, title, body }) {
  return (
    <div style={{ background: `linear-gradient(135deg,${tint(color, 0.07)},transparent 75%)`, border: `1px solid ${tint(color, 0.16)}`, borderRadius: 12, padding: '16px 16px' }}>
      <div style={{ ...R({ gap: 8, marginBottom: 8 }) }}>
        <Icon size={14} color={color} />
        <span style={{ fontSize: 12.5, fontWeight: 800, color: C.t1 }}>{title}</span>
      </div>
      <div style={{ fontSize: 11.5, color: C.t3, lineHeight: 1.55 }}>{body}</div>
    </div>
  );
}

/**
 * The build screen.
 *
 * A minute or two of waiting is the most fragile moment this feature has: it is
 * the only point where a student has committed and has nothing yet, and a bare
 * spinner there reads as "something is stuck" long before it reads as "something
 * is being made". So this screen does three things a spinner cannot.
 *
 *   1. It shows the SHAPE OF THE WORK — five named passes on a connected line,
 *      the same line their finished year is drawn on. The wait stops being
 *      formless the moment it has parts.
 *   2. It shows GENUINE PROGRESS. The passes light as the generator reports
 *      them, and the step counter and the elapsed clock are both real. Nothing
 *      here is a fake progress bar filling on a timer, because the one thing
 *      worse than an honest two-minute wait is a bar that reaches 90% in ten
 *      seconds and sits there.
 *   3. It shows WHAT IS COMING. The skeleton underneath is the timeline being
 *      built, in its real proportions, so the finished roadmap arrives into a
 *      shape the student has already been looking at rather than replacing a
 *      spinner with a wall.
 */
function BuildingScreen({ stage, accent, isMobile, reducedMotion }) {
  const [elapsed, setElapsed] = useState(0);
  const [pass, setPass] = useState(0);

  useEffect(() => {
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  // Monotonic: a later pass never falls back to an earlier one just because a
  // label was ambiguous.
  useEffect(() => { setPass((cur) => passIndexForStage(stage, cur)); }, [stage]);

  const current = BUILD_PASSES[pass] || BUILD_PASSES[0];
  const clock = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;

  return (
    <div style={{ ...glass({ padding: isMobile ? 20 : 34, overflow: 'hidden' }) }}>
      <div style={{
        display: 'flex', gap: isMobile ? 16 : 30, alignItems: 'center',
        flexDirection: isMobile ? 'column' : 'row', textAlign: isMobile ? 'center' : 'left',
      }}>
        {/* The brand journey animation, looping — this is an open-ended wait,
            and it already honors prefers-reduced-motion internally. */}
        <div style={{ flexShrink: 0 }}><BrandJourney size={isMobile ? 104 : 148} /></div>

        <div style={{ flex: 1, minWidth: 0, width: '100%' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: accent, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))'}}>
            Pass {pass + 1} of {BUILD_PASSES.length} · {clock}
          </div>
          <div style={{ fontSize: isMobile ? 19 : 25, fontWeight: 800, color: C.t1, fontFamily: C.FD, marginTop: 8, letterSpacing: 'calc(-0.02em + var(--msp-letter-spacing))', lineHeight: 1.2 }}>
            Building your year
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={stage}
              initial={reducedMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reducedMotion ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: reducedMotion ? 0 : 0.28 }}
              style={{ fontSize: isMobile ? 13 : 14, color: C.t2, marginTop: 8, lineHeight: 1.55, fontWeight: 600 }}
            >
              {stage}
            </motion.div>
          </AnimatePresence>
          <div style={{ fontSize: 11.5, color: C.t4, marginTop: 4, lineHeight: 1.55, maxWidth: 460, marginInline: isMobile ? 'auto' : 0 }}>
            {current.blurb}
          </div>
        </div>
      </div>

      {/* ── The five passes, on the same kind of line the finished roadmap uses ── */}
      <div style={{ marginTop: isMobile ? 22 : 28 }}>
        <PassRail pass={pass} accent={accent} isMobile={isMobile} reducedMotion={reducedMotion} />
      </div>

      {/* ── What is being drawn, in its real proportions ── */}
      <SpineSkeleton isMobile={isMobile} reducedMotion={reducedMotion} />

      <div style={{ fontSize: 11, color: C.t4, marginTop: 16, lineHeight: 1.55, maxWidth: 560 }}>
        This takes a minute or two, and the time is going somewhere: five separate passes over your
        year rather than one hurried one. Every date it will show you comes from a hand-checked
        catalog — Medabrain is choosing and sequencing, never inventing a deadline. Leaving this
        screen cancels the build, so give it the two minutes.
      </div>
    </div>
  );
}

function PassRail({ pass, accent, isMobile, reducedMotion }) {
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start' }}>
      {/* The rail behind the nodes: traveled up to the current pass, ahead after
          it. Inset to the FIRST and LAST node centers rather than to the edges of
          the row — the nodes sit in the middle of equal flex cells, so a rail
          drawn edge to edge overshoots both ends and the line visibly fails to
          pass through the dots it is supposed to connect. */}
      <span aria-hidden="true" style={{
        position: 'absolute', top: 8, height: 3, borderRadius: 4, background: C.s4,
        left: `${100 / (2 * BUILD_PASSES.length)}%`, right: `${100 / (2 * BUILD_PASSES.length)}%`,
      }}>
        <motion.span
          initial={false}
          animate={{ width: `${(pass / Math.max(1, BUILD_PASSES.length - 1)) * 100}%` }}
          transition={{ duration: reducedMotion ? 0 : 0.6, ease: [0.22, 1, 0.36, 1] }}
          style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 4,
            background: `linear-gradient(90deg,${tint(C.green, 0.7)},${accent})`,
          }}
        />
      </span>
      {BUILD_PASSES.map((p, i) => {
        const done = i < pass;
        const now = i === pass;
        const color = done ? C.green : now ? accent : C.t4;
        return (
          <div key={p.id} style={{
            flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center',
            minWidth: 0,
          }}>
            <span style={{
              width: now ? 19 : 15, height: now ? 19 : 15, borderRadius: '50%', marginTop: now ? -1 : 1,
              background: done || now ? color : C.bg,
              border: done || now ? `2px solid ${C.bg}` : `2px solid ${C.s5}`,
              boxShadow: now ? `0 0 0 5px ${tint(accent, 0.18)}` : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: reducedMotion ? 'none' : 'all .3s ease',
              zIndex: 1,
            }}>
              {now && !reducedMotion && (
                <motion.span
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ width: 7, height: 7, borderRadius: '50%', background: C.bg }}
                />
              )}
            </span>
            <span style={{
              fontSize: isMobile ? 9 : 10.5, fontWeight: now ? 800 : 600, marginTop: 8,
              color: done ? C.t3 : now ? C.t1 : C.t4, textAlign: 'center', lineHeight: 1.3,
              // On a phone the five labels do not fit side by side; only the
              // live one is named, and the rest are the dots you can count.
              opacity: isMobile && !now ? 0 : 1,
              whiteSpace: 'nowrap',
            }}>{p.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/** The timeline being drawn — real proportions, no content, gently shimmering. */
function SpineSkeleton({ isMobile, reducedMotion }) {
  const bars = [34, 58, 22, 76, 44, 62, 30, 52, 68, 26, 46, 38];
  const marks = [0.06, 0.13, 0.14, 0.25, 0.33, 0.41, 0.42, 0.55, 0.63, 0.71, 0.79, 0.86, 0.93];
  return (
    <div aria-hidden="true" style={{
      marginTop: isMobile ? 20 : 26, padding: isMobile ? '16px 14px' : '20px 18px',
      background: C.surf2, border: `1px solid ${C.b1}`, borderRadius: 12, overflow: 'hidden',
      position: 'relative',
    }}>
      <div className={reducedMotion ? undefined : 'rm-shimmer'} style={{ position: 'relative', height: isMobile ? 92 : 108 }}>
        {/* markers */}
        {marks.map((m, i) => (
          <span key={m} style={{
            position: 'absolute', left: `${m * 100}%`, top: (i % 3) * 14 + 6,
            width: 9, height: 9, borderRadius: '50%', background: C.s5, transform: 'translateX(-50%)',
          }} />
        ))}
        {/* stems */}
        {marks.map((m, i) => (
          <span key={`s${m}`} style={{
            position: 'absolute', left: `${m * 100}%`, top: (i % 3) * 14 + 14,
            width: 1, height: (isMobile ? 48 : 56) - (i % 3) * 14, background: C.b2, transform: 'translateX(-50%)',
          }} />
        ))}
        {/* the line */}
        <span style={{
          position: 'absolute', left: 0, right: 0, top: isMobile ? 62 : 70, height: 3, borderRadius: 4, background: C.s5,
        }} />
        {/* load */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: isMobile ? 72 : 80, display: 'flex', gap: 4, alignItems: 'flex-start' }}>
          {bars.map((b, i) => (
            <span key={i} style={{ flex: 1, height: Math.round(b * (isMobile ? 0.22 : 0.3)), borderRadius: 4, background: C.s4 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function StaleNotice({ stale, expired, onRebuild, onEditAnswers }) {
  return (
    <div style={{
      ...R({ gap: 12, flexWrap: 'wrap' }),
      background: tint(C.sky, 0.09), border: `1px solid ${tint(C.sky, 0.24)}`, borderRadius: 12, padding: '12px 16px',
    }}>
      <Info size={15} color={C.sky} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 220, fontSize: 12, color: C.t2, lineHeight: 1.55 }}>
        {expired
          ? 'This roadmap is running out of runway — it was built for a year that is nearly up. Rebuild it and it will map the next one.'
          : 'Something that shaped this roadmap has changed — your grade, your college list, or an answer you gave. It is still usable; it is just describing a slightly different you.'}
      </div>
      <div style={R({ gap: 8 })}>
        <button onClick={onEditAnswers} style={btnSm()}>Review answers</button>
        <button onClick={onRebuild} style={{ ...btnSm(tint(C.sky, 0.2), { borderColor: tint(C.sky, 0.4) }) }}>
          <RefreshCw size={12} /> Rebuild
        </button>
      </div>
    </div>
  );
}

// ── Overview ─────────────────────────────────────────────────────────────────

function OverviewView({
  roadmap, stats, upNext, season, balance, accent, isMobile, itemProps,
  expandedId, setExpandedId, strength, today, reducedMotion,
  onGoYear, onGoSeasons, onGoClimb, onExport, onRebuild,
}) {
  const first = upNext[0] || null;
  return (
    <>
      {/* ── THE ONE THING ────────────────────────────────────────────────────
          Above everything, including the rest of "do this now". A student
          opening this tab on a Tuesday between classes has about eight seconds
          of attention, and a list of five is a decision they will defer. One
          named thing, with the reason it is that one, is an action they can
          take standing up. The other four are still right underneath. */}
      {first && (
        <TheOneThing
          item={first} accent={accent} isMobile={isMobile}
          expanded={expandedId === first.id}
          onToggleExpand={() => setExpandedId(expandedId === first.id ? null : first.id)}
          itemProps={itemProps}
        />
      )}

      {/* What to do now — the rest of it. */}
      <div>
        <SectionTitle icon={Sparkles} color={C.amber}>
          {first ? 'Then these' : 'Do this now'}
        </SectionTitle>
        {upNext.length ? (
          <div style={CC({ gap: 8 })}>
            {upNext.slice(first ? 1 : 0).map((item) => (
              <RoadmapItem key={item.id} item={item} {...itemProps}
                expanded={expandedId === item.id}
                onToggleExpand={() => setExpandedId(expandedId === item.id ? null : item.id)} />
            ))}
            {upNext.length === 1 && (
              <div style={{ fontSize: 11.5, color: C.t4, lineHeight: 1.55 }}>
                Nothing else needs starting in the next three weeks —{' '}
                <button onClick={onGoYear} style={linkish}>see what is coming after that</button>.
              </div>
            )}
          </div>
        ) : (
          <div style={{ ...glass2({ padding: 16 }), ...R({ gap: 12 }) }}>
            <CheckCircle2 size={17} color={C.green} />
            <span style={{ fontSize: 12.5, color: C.t2 }}>
              Nothing needs starting in the next three weeks. That is a real result — check{' '}
              <button onClick={onGoYear} style={linkish}>your year</button> to see what is coming after that.
            </span>
          </div>
        )}
      </div>

      {/* ── What all of it is for ────────────────────────────────────────────
          The compact climb, sitting directly under the actions rather than at
          the bottom of the page. This is the answer to "why should I do any of
          this", and a screen that lists the work before ever naming the payoff
          is a screen that gets closed. Full version on its own tab. */}
      <div style={{
        ...glass({ padding: isMobile ? 16 : 22 }),
        background: `linear-gradient(135deg,${tint(C.green, 0.07)},transparent 65%)`,
        border: `1px solid ${tint(C.green, 0.2)}`,
      }}>
        <SectionTitle icon={TrendingUp} color={C.green}>What finishing this is worth</SectionTitle>
        <RoadmapAscent
          roadmap={roadmap} strength={strength} today={today}
          isMobile={isMobile} reducedMotion={reducedMotion}
          compact onExplore={onGoClimb}
        />
      </div>

      {/* Progress */}
      <div style={autoGrid(190, 12)}>
        <StatTile icon={CheckCircle2} value={`${stats.pct}%`} label="of your year done" sub={`${stats.done} of ${stats.total - stats.skipped}`} color={C.green} />
        <StatTile icon={Layers} value={season?.label || '—'} label="this season" sub={season?.theme || ''} color={C.teal} onClick={onGoSeasons} />
        <StatTile icon={Target} value={stats.startNow} label="need starting now" color={stats.startNow ? C.amber : C.t3} />
        <StatTile icon={CalendarDays} value={stats.awaitingDate} label="dates to look up" sub="tap one to pin it" color={stats.awaitingDate ? C.violet : C.t3} />
      </div>

      {/* This season's advice */}
      {season?.advice && (
        <div style={{ ...glass({ padding: 20, background: `linear-gradient(135deg,${tint(C.teal, 0.08)},transparent 70%)`, border: `1px solid ${tint(C.teal, 0.2)}` }) }}>
          <SectionTitle icon={Compass} color={C.teal}>Getting through {season.label}</SectionTitle>
          <div style={{ fontSize: 13, color: C.t2, lineHeight: 1.55 }}>{season.advice}</div>
        </div>
      )}

      {/* The honest read-back. The single most distinctive thing this tab
          produces — a counselor's verdict on their own plan, including what it
          is betting on and what it does not cover. */}
      {roadmap.review && (
        <div style={{ ...glass({ padding: isMobile ? 18 : 24 }) }}>
          <SectionTitle icon={Quote} color={accent}>Straight talk about this plan</SectionTitle>
          {roadmap.review.verdict && (
            <div style={{ fontSize: 13.5, color: C.t2, lineHeight: 1.55 }}>{roadmap.review.verdict}</div>
          )}
          <div style={{ ...autoGrid(240, 12, { marginTop: 16 }) }}>
            {roadmap.review.ifOnlyOneThing && (
              <Callout icon={Lightbulb} color={C.amber} label="If you do one thing">{roadmap.review.ifOnlyOneThing}</Callout>
            )}
            {roadmap.review.bet && (
              <Callout icon={ShieldQuestion} color={C.fuchsia} label="What this is betting on">{roadmap.review.bet}</Callout>
            )}
          </div>
          {!!roadmap.review.notCovered?.length && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: C.t3, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', marginBottom: 8 }}>
                What this year does not cover
              </div>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: C.t3, lineHeight: 1.55 }}>
                {roadmap.review.notCovered.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Risks the generator named for this specific student. */}
      {!!roadmap.risks?.length && (
        <div>
          <SectionTitle icon={AlertTriangle} color={C.rose}>What will actually derail this</SectionTitle>
          <div style={CC({ gap: 8 })}>
            {roadmap.risks.map((r, i) => (
              <div key={i} style={{ ...glass2({ padding: 16 }) }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: C.t1, marginBottom: 4 }}>{r.title}</div>
                <div style={{ fontSize: 11.5, color: C.t3, lineHeight: 1.55 }}>{r.detail}</div>
                {r.mitigation && (
                  <div style={{ ...R({ gap: 8, marginTop: 8 }) }}>
                    <Lightbulb size={12} color={C.green} style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: 11.5, color: C.t2, lineHeight: 1.55 }}>{r.mitigation}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Balance warnings from the automated checks — surfaced to the student
          rather than hidden, because "your year leans hard on long shots" is
          something they are entitled to know about their own plan. */}
      {!!balance?.warnings?.length && (
        <div style={{ ...glass2({ padding: 16 }) }}>
          <SectionTitle icon={Scale} color={C.sky}>Shape of your year</SectionTitle>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: C.t3, lineHeight: 1.55 }}>
            {balance.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      {/* What was deliberately left out. Naming this is what makes the rest
          credible — a list that only ever says yes is a list nobody trusts. */}
      {!!roadmap.omitted?.length && (
        <div style={{ ...glass2({ padding: 16 }) }}>
          <SectionTitle icon={X} color={C.t3}>Deliberately not on your list</SectionTitle>
          <div style={CC({ gap: 8 })}>
            {roadmap.omitted.map((o, i) => (
              <div key={i} style={{ fontSize: 11.5, color: C.t3, lineHeight: 1.55 }}>
                <b style={{ color: C.t2 }}>{o.name}</b> — {o.reason}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ ...R({ gap: 8, flexWrap: 'wrap' }) }}>
        <button onClick={onExport} style={btnG({ fontSize: 12 })}><Download size={13} /> Add to my calendar</button>
        <button onClick={onGoYear} style={btnG({ fontSize: 12 })}><CalendarDays size={13} /> See the whole year</button>
        <button onClick={onRebuild} style={btnG({ fontSize: 12 })}><RefreshCw size={13} /> Rebuild</button>
      </div>
    </>
  );
}

/**
 * The single most urgent thing on the roadmap, given its own frame.
 *
 * The urgency it is nearly always showing is `start-now`: an item whose
 * DEADLINE is comfortably far away and whose preparation has to begin today.
 * That state is the one this whole product exists to surface — every other
 * calendar in a student's life renders it as "in 70 days" and it is, in fact,
 * the most urgent thing on the screen — so it gets the loudest treatment in the
 * tab, once, at the top, rather than being the third row of a list of five.
 *
 * The card underneath is a normal <RoadmapItem>, unmodified. The frame supplies
 * the emphasis and the sentence naming why this one; the item supplies every
 * behavior it has everywhere else, so expanding it here does exactly what
 * expanding it anywhere else does.
 */
function TheOneThing({ item, accent, isMobile, expanded, onToggleExpand, itemProps }) {
  const urgency = itemUrgency(item, itemProps.today);
  const meta = URGENCY_META[urgency] || URGENCY_META.later;
  const line = {
    'start-now': 'The deadline is not the problem — the preparation is, and it has to start about now.',
    critical: 'This one closes this week. Everything else on your year can wait until it is done.',
    missed: 'This one has passed. Worth deciding, deliberately, whether to chase next year\'s cycle or let it go.',
    soon: 'The nearest real thing on your year.',
    undated: 'Find the real date for this one and pin it — everything after it re-plans around it.',
    later: 'The nearest real thing on your year.',
    settled: 'Done.',
  }[urgency] || 'The nearest real thing on your year.';

  return (
    <div style={{
      ...glass({ padding: isMobile ? 14 : 18, overflow: 'hidden' }),
      background: `linear-gradient(135deg,${tint(meta.color, 0.12)},transparent 62%)`,
      border: `1px solid ${tint(meta.color, 0.3)}`,
      position: 'relative',
    }}>
      {/* A single accent edge rather than a full tint, so a loud card does not
          make the four quieter ones under it look broken. */}
      <div aria-hidden style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
        background: `linear-gradient(180deg,${meta.color},${tint(meta.color, 0.1)})`,
      }} />
      <div style={{ ...R({ gap: 8, marginBottom: 8, flexWrap: 'wrap' }) }}>
        <meta.icon size={14} color={meta.color} />
        <span style={{
          fontSize: 10, fontWeight: 800, color: meta.color,
          letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', 
        }}>
          If you do one thing today
        </span>
      </div>
      <div style={{ fontSize: isMobile ? 12 : 12.5, color: C.t2, lineHeight: 1.55, marginBottom: 12, maxWidth: 620 }}>
        {line}
      </div>
      <RoadmapItem item={item} {...itemProps} expanded={expanded} onToggleExpand={onToggleExpand} />
    </div>
  );
}

// ── The Climb ────────────────────────────────────────────────────────────────

function ClimbView({ roadmap, strength, today, isMobile, reducedMotion, accent, onGoList, onGoPortfolio }) {
  const schools = (roadmap?.targetSchools || []).slice(0, 6);
  return (
    <>
      <div style={{ ...glass({ padding: isMobile ? 16 : 24 }) }}>
        <SectionTitle icon={TrendingUp} color={accent}>
          {schools.length ? 'Your climb toward these schools' : 'Your climb'}
        </SectionTitle>
        <div style={{ fontSize: 12.5, color: C.t3, lineHeight: 1.55, margin: '0px 0px 16px', maxWidth: 680 }}>
          Every other screen in this tab tells you <b style={{ color: C.t2 }}>when</b> things happen.
          This one tells you <b style={{ color: C.t2 }}>what happens to you</b> if you do them —
          where the four halves of an application stand today, which months of your year build
          which, and where the whole thing lands next August if the work gets done.
        </div>

        <RoadmapAscent
          roadmap={roadmap} strength={strength} today={today}
          isMobile={isMobile} reducedMotion={reducedMotion}
        />
      </div>

      {!!schools.length && (
        <div style={{ ...glass2({ padding: 16 }) }}>
          <SectionTitle icon={Target} color={C.fuchsia}>What you told us you are aiming at</SectionTitle>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {schools.map((s) => (
              <span key={s} style={{
                ...pill(tint(C.fuchsia, 0.12), C.fuchsia, {
                  fontSize: 11.5, fontWeight: 700, padding: '4px 12px',
                  border: `1px solid ${tint(C.fuchsia, 0.26)}`,
                }),
              }}>{s}</span>
            ))}
          </div>
          <div style={{ fontSize: 11.5, color: C.t3, lineHeight: 1.55 }}>
            Every application deadline on your roadmap was back-planned from these. Change the list
            in your Portfolio and rebuild, and the whole year re-sequences around the new one.
          </div>
        </div>
      )}

      <div style={{ ...R({ gap: 8, flexWrap: 'wrap' }) }}>
        <button onClick={onGoList} style={btnG({ fontSize: 12 })}>
          <ListChecks size={13} /> See everything that builds it
        </button>
        {onGoPortfolio && (
          <button onClick={() => onGoPortfolio()} style={btnG({ fontSize: 12 })}>
            <Target size={13} /> Update what I have logged
          </button>
        )}
      </div>
    </>
  );
}

function Callout({ icon: Icon, color, label, children }) {
  return (
    <div style={{ background: tint(color, 0.08), border: `1px solid ${tint(color, 0.2)}`, borderRadius: 12, padding: '12px 16px' }}>
      <div style={{ ...R({ gap: 8, marginBottom: 8 }) }}>
        <Icon size={13} color={color} />
        <span style={{ fontSize: 10, fontWeight: 800, color, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))'}}>{label}</span>
      </div>
      <div style={{ fontSize: 12.5, color: C.t2, lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}

// ── Year ─────────────────────────────────────────────────────────────────────

// ── The three drawings of one year, and why the tab offers a choice ─────────
// They are not three styles of the same picture. Each answers a question the
// other two structurally cannot, and a student arrives with a different one on
// different days:
//
//   Path  — "Where am I, and what is next?" A route you walk up, your position
//           marked on it. The default, because it is the question people
//           actually open this tab with.
//   Line  — "When does my year get hard?" The year drawn to scale, with load
//           taken from preparation windows rather than deadlines, so a wall in
//           March is visible in January.
//   List  — "What happens, in order?" Every event, in sequence, with its
//           working detail one tap away.
//
// The choice is remembered for the session but not persisted: a student who
// went looking for the load chart last Tuesday is still, today, most likely
// asking where they are.
const YEAR_DRAWINGS = [
  { id: 'path', label: 'Path', ic: MapIcon, blurb: 'Your year as a road you walk up' },
  { id: 'line', label: 'Line', ic: CalendarDays, blurb: 'The year to scale, with its heavy stretches' },
  { id: 'list', label: 'In order', ic: ListChecks, blurb: 'Every event, in sequence' },
];

function YearView({ roadmap, today, isMobile, accent, reducedMotion, onSelectItem, onSelectSeason, onExport }) {
  const stats = useMemo(() => roadmapStats(roadmap, today), [roadmap, today]);
  const crunch = useMemo(() => crunchMonths(roadmap), [roadmap]);
  const elapsed = daysBetween(roadmap.startDate, today);
  const pctThrough = Math.max(0, Math.min(100, Math.round((elapsed / 365) * 100)));
  const [drawing, setDrawing] = useState('path');

  return (
    <>
      {/* ── The year, drawn. Everything else on this screen is commentary. ── */}
      <div style={{ ...glass({ padding: isMobile ? 14 : 22 }) }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <SectionTitle icon={CalendarDays} color={accent}>Your next twelve months</SectionTitle>
          <div role="tablist" aria-label="How to draw your year" style={{
            display: 'inline-flex', gap: 4, padding: 4, borderRadius: 8,
            background: C.surf2, border: `1px solid ${C.b1}`,
          }}>
            {YEAR_DRAWINGS.map((d) => {
              const on = drawing === d.id;
              return (
                <button
                  key={d.id} type="button" role="tab" aria-selected={on} title={d.blurb}
                  onClick={() => setDrawing(d.id)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '4px 12px', borderRadius: 8, border: 0, cursor: 'pointer',
                    background: on ? tint(accent, 0.2) : 'transparent',
                    color: on ? accentFill(accent) : C.t3,
                    fontSize: 11.5, fontWeight: on ? 800 : 600, fontFamily: C.FB,
                    transition: 'background .15s, color .15s',
                  }}
                >
                  <d.ic size={13} /> {d.label}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ fontSize: 12, color: C.t3, lineHeight: 1.55, margin: '8px 0px 16px', maxWidth: 660 }}>
          {drawing === 'path' && (
            <>
              Your year as one road, starting at the bottom and climbing. Every stop is something
              real with a real date; the green stretch behind{' '}
              <b style={{ color: C.t2 }}>you are here</b> is the part you have already walked.{' '}
              {isMobile ? 'Swipe up' : 'Drag the path, or use the arrow keys,'} to travel it, and tap
              any stop to open what it actually takes.
            </>
          )}
          {drawing === 'line' && (
            <>
              One line, end to end — every dated thing in your year hanging off the month it lands in.
              The band under the line is <b style={{ color: C.t2 }}>how heavy each stretch is</b>, counting
              the preparation rather than the deadlines, so a wall in March shows up here in January while
              you can still do something about it. {isMobile ? 'Swipe' : 'Drag'} the line to move through
              the year; tap a marker to see what it is.
            </>
          )}
          {drawing === 'list' && (
            <>
              The whole year as a running timeline. Where you are standing is marked; everything below
              that mark is still ahead of you. Tap any event to open its working detail.
            </>
          )}
        </div>

        {drawing === 'path' && (
          <RoadmapPath
            roadmap={roadmap} today={today} isMobile={isMobile} reducedMotion={reducedMotion}
            onSelectItem={onSelectItem} onSelectSeason={onSelectSeason}
          />
        )}
        {drawing === 'line' && (
          <RoadmapSpine
            roadmap={roadmap} today={today} isMobile={isMobile} reducedMotion={reducedMotion}
            onSelectItem={onSelectItem} onSelectSeason={onSelectSeason}
          />
        )}
        {drawing === 'list' && (
          <RoadmapTimeline
            roadmap={roadmap} today={today} isMobile={isMobile} reducedMotion={reducedMotion}
            onSelectItem={onSelectItem}
          />
        )}
      </div>

      {/* Where they are in the year, in words — the one thing the drawing
          cannot state outright. */}
      <div style={autoGrid(180, 12)}>
        <StatTile icon={Compass} value={`${pctThrough}%`} label="through this roadmap" sub={`${Math.max(0, 365 - elapsed)} days left in it`} color={accent} />
        <StatTile icon={Target} value={stats.startNow} label="need starting now" color={stats.startNow ? C.amber : C.t3} />
        <StatTile icon={AlertTriangle} value={crunch.length} label="crunch months ahead" sub={crunch.length ? crunch.map(fmtMonthLabel).join(', ') : 'your year is evenly loaded'} color={crunch.length ? C.rose : C.green} />
        <StatTile icon={CalendarDays} value={stats.awaitingDate} label="dates to look up" color={stats.awaitingDate ? C.violet : C.t3} />
      </div>

      {/* The ordered list used to live down here as a second, permanent
          section. It is now the third drawing above, alongside the path and the
          line, because three stacked drawings of one year is a page a student
          scrolls past rather than three answers they can choose between — and
          the choice is the point. */}

      <button onClick={onExport} style={btnG({ fontSize: 12, alignSelf: 'flex-start' })}>
        <Download size={13} /> Add these dates to my calendar
      </button>
    </>
  );
}

const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function fmtMonthLabel(key) {
  const [y, m] = String(key).split('-').map(Number);
  return y && m ? `${MONTH_LONG[m - 1]} ${y}` : key;
}

// ── Seasons ──────────────────────────────────────────────────────────────────

function SeasonsView({ roadmap, today, isMobile, accent, itemProps, expandedId, setExpandedId }) {
  const current = currentSeason(roadmap, today);
  return (
    <div style={CC({ gap: 16 })}>
      {roadmap.seasons.map((s) => {
        const items = itemsInSeason(roadmap, s.id).sort(byUrgency(today));
        const isNow = s.id === current?.id;
        const done = items.filter((i) => i.status === 'done').length;
        return (
          <div key={s.id} style={{
            ...glass({ padding: isMobile ? 16 : 22 }),
            border: `1px solid ${isNow ? tint(accent, 0.35) : C.b1}`,
            background: isNow ? `linear-gradient(135deg,${tint(accent, 0.07)},transparent 70%)` : C.surf,
          }}>
            <div style={{ ...R({ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }) }}>
              <div>
                <div style={{ ...R({ gap: 8 }) }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: isNow ? accent : C.t3, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))'}}>
                    {s.label}
                  </span>
                  {isNow && <span style={{ ...pill(tint(accent, 0.16), accent, { fontSize: 9.5, fontWeight: 800 }) }}>NOW</span>}
                  {!s.deepened && (
                    <span title="The detail for this stretch gets written when you get closer to it — it would be out of date by then otherwise."
                      style={{ ...pill(C.s4, C.t4, { fontSize: 9.5 }) }}>outline</span>
                  )}
                </div>
                <div style={{ fontSize: isMobile ? 16 : 19, fontWeight: 800, color: C.t1, fontFamily: C.FD, marginTop: 4, letterSpacing: 'calc(-0.02em + var(--msp-letter-spacing))' }}>
                  {s.theme}
                </div>
              </div>
              <span style={{ fontSize: 11, color: C.t4, fontFamily: C.FM }}>{done}/{items.length}</span>
            </div>

            {s.narrative && <div style={{ fontSize: 12.5, color: C.t2, lineHeight: 1.55, marginBottom: 12, maxWidth: 640 }}>{s.narrative}</div>}
            {s.advice && (
              <div style={{ background: tint(C.teal, 0.07), border: `1px solid ${tint(C.teal, 0.16)}`, borderRadius: 8, padding: '12px 12px', marginBottom: 12 }}>
                <div style={{ fontSize: 11.5, color: C.t2, lineHeight: 1.55 }}>{s.advice}</div>
              </div>
            )}

            {items.length ? (
              <div style={CC({ gap: 8 })}>
                {items.map((item) => (
                  <RoadmapItem key={item.id} item={item} {...itemProps} dense
                    expanded={expandedId === item.id}
                    onToggleExpand={() => setExpandedId(expandedId === item.id ? null : item.id)} />
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: C.t4, fontStyle: 'italic' }}>
                Deliberately clear. Not every stretch of a year should have something in it.
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── List ─────────────────────────────────────────────────────────────────────

function ListView({
  roadmap, today, isMobile, accent, itemProps, expandedId, setExpandedId,
  trackFilter, setTrackFilter, showDone, setShowDone, adding, setAdding, onAdd, onExport,
}) {
  const items = allItems(roadmap);
  const tracks = useMemo(() => {
    const counts = {};
    items.forEach((i) => { counts[i.track] = (counts[i.track] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [items]);

  const visible = items
    .filter((i) => (trackFilter === 'all' || i.track === trackFilter))
    .filter((i) => (showDone ? true : OPEN_STATUSES.has(i.status)))
    .sort(byUrgency(today));

  return (
    <>
      <div style={{ ...glass2({ padding: 12 }) }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
          <FilterPill active={trackFilter === 'all'} onClick={() => setTrackFilter('all')} color={accent}>
            All {items.length}
          </FilterPill>
          {tracks.map(([t, n]) => (
            <FilterPill key={t} active={trackFilter === t} onClick={() => setTrackFilter(t)} color={trackColor(t)}>
              {TRACK_BY_ID[t]?.label || t} {n}
            </FilterPill>
          ))}
          <span style={{ flex: 1 }} />
          <label style={{ ...R({ gap: 4 }), fontSize: 11.5, color: C.t3, cursor: 'pointer' }}>
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
            Show finished
          </label>
        </div>
      </div>

      <div style={{ ...R({ gap: 8, flexWrap: 'wrap' }) }}>
        <button onClick={() => setAdding((a) => !a)} style={btnSm(C.surfHi)}>
          <Plus size={12} /> Add something of your own
        </button>
        <button onClick={onExport} style={btnSm(C.surfHi)}><Download size={12} /> Export dates</button>
      </div>

      {adding && <AddItemForm roadmap={roadmap} onAdd={onAdd} onCancel={() => setAdding(false)} accent={accent} />}

      {visible.length ? (
        <div style={CC({ gap: 8 })}>
          {visible.map((item) => (
            <RoadmapItem key={item.id} item={item} {...itemProps}
              expanded={expandedId === item.id}
              onToggleExpand={() => setExpandedId(expandedId === item.id ? null : item.id)} />
          ))}
        </div>
      ) : (
        <EmptyState
          kind="filtered" icon={ListChecks} accent={accent}
          title={showDone ? 'Nothing on this pathway yet' : 'Everything here is finished'}
          body={showDone
            ? 'This stretch of the roadmap has no items on it yet. New ones appear as your plan fills in.'
            : 'Every item on this pathway is done. Turn on "Show finished" to see what you have already cleared.'}
          actionLabel={showDone ? undefined : 'Show finished'}
          onAction={showDone ? undefined : () => setShowDone(true)} />
      )}
    </>
  );
}

function FilterPill({ active, onClick, color, children }) {
  return (
    <button onClick={onClick} style={{
      ...pill(active ? tint(color, 0.16) : 'transparent', active ? onTint(color) : C.t3, {
        fontSize: 11, fontWeight: active ? 700 : 500, padding: '4px 12px',
        border: `1px solid ${active ? tint(color, 0.4) : C.b1}`, cursor: 'pointer', fontFamily: C.FB,
      }),
    }}>{children}</button>
  );
}

/**
 * The student's own item.
 *
 * Every roadmap will be missing something — a local award only their counselor
 * knows about, their school's own deadline, a program a teacher mentioned. A
 * roadmap that cannot absorb those is a roadmap they keep a second list beside,
 * and the second list is the one that gets lost.
 */
function AddItemForm({ roadmap, onAdd, onCancel, accent }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [track, setTrack] = useState('application');
  const [note, setNote] = useState('');
  return (
    <div style={{ ...glass({ padding: 16, border: `1px solid ${tint(accent, 0.3)}` }) }}>
      <SectionTitle icon={Plus} color={accent}>Add your own</SectionTitle>
      <div style={CC({ gap: 8 })}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What is it? e.g. Rotary Club scholarship" style={inp()} />
        <div style={{ ...R({ gap: 8, flexWrap: 'wrap' }) }}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Due date" style={inp({ flex: '1 1 160px', width: 'auto' })} />
          <select value={track} onChange={(e) => setTrack(e.target.value)} aria-label="Type" style={inp({ flex: '1 1 160px', width: 'auto' })}>
            {Object.values(TRACK_BY_ID).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why does this matter? (optional)" style={inp()} />
        <div style={{ ...R({ gap: 8 }) }}>
          <button disabled={!title.trim()} onClick={() => onAdd({ title, date: date || null, track, note })}
            style={{ ...btn(accentFill(accent)), color: onTint(accent), opacity: title.trim() ? 1 : 0.4, fontSize: 13 }}>Add it</button>
          <button onClick={onCancel} style={btnG({ fontSize: 13 })}>Cancel</button>
        </div>
        <div style={{ fontSize: 10.5, color: C.t4, lineHeight: 1.55 }}>
          Your date, your item — we will not second-guess either. Leave the date blank if you still
          need to look it up and it will sit in your "dates to find" list.
        </div>
      </div>
    </div>
  );
}

// ── Suggestions from outside the catalog ─────────────────────────────────────
//
// The catalog is a whitelist for anything carrying a date, which is what makes an
// invented deadline structurally impossible. But a whitelist of a few hundred entries
// cannot hold every competition worth a student's year — their state's own contests, a
// program at the university twenty minutes away, an award in the exact field they care
// about — and refusing to name those makes the roadmap silently narrower than the world.
//
// So Medabrain may NAME things outside the catalog and may never DATE them (every
// date-shaped field is stripped server-side; see the beyondCatalog block in
// generator.js). What arrives here is a name, a reason, and who actually holds the
// deadline. This card is the seam where that becomes a real commitment: the student
// goes and finds the date, types it in, and it lands on their roadmap as their own item
// — which then flows into the milestone feed, the sixty-day horizon and the dashboard's
// next-three like any other date they own.
function BeyondCatalogCard({ suggestions, accent, onAccept }) {
  const [openId, setOpenId] = useState(null);
  const [date, setDate] = useState('');
  if (!suggestions?.length) return null;

  return (
    <div style={{ ...glass2({ padding: 16 }) }}>
      <SectionTitle icon={Sparkles} color={accentText(C.gold)}>Worth doing, and not in our catalog</SectionTitle>
      <div style={{ fontSize: 11.5, color: C.t3, lineHeight: 1.55, marginBottom: 12 }}>
        Medabrain named these because they belong in your year, not because they are on a
        list — our catalog does not have them. It is deliberately not allowed to tell you
        when they close, because it does not know and a made-up deadline is worse than no
        deadline. Find the real date, put it in, and it becomes part of your roadmap like
        anything else.
      </div>
      <div style={CC({ gap: 8 })}>
        {suggestions.map((sg, i) => {
          const id = `${sg.name}-${i}`;
          const open = openId === id;
          return (
            <div key={id} style={{ ...glass2({ padding: 12 }), border: `1px solid ${open ? tint(accent, 0.3) : C.b1}` }}>
              <div style={{ ...R({ gap: 8, flexWrap: 'wrap' }) }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.t1 }}>{sg.name}</span>
                {sg.org && <span style={{ fontSize: 11.5, color: C.t3 }}>{sg.org}</span>}
                <span style={pill(tint(C.gold, 0.14), accentText(C.gold), { fontSize: 10 })}>
                  {TRACK_BY_ID[sg.track]?.label || 'Competition'}
                </span>
                {/* A model that flags its own uncertainty is more useful than one that only
                    ever speaks confidently — so the flag is shown rather than filtered. */}
                {sg.unsure && (
                  <span style={pill(tint(C.amber, 0.14), accentText(C.amber), { fontSize: 10 })}>
                    Medabrain is not certain this exists — check before you plan around it
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.55, marginTop: 8 }}>{sg.why}</div>
              <div style={{ fontSize: 11.5, color: C.t3, lineHeight: 1.55, marginTop: 8 }}>
                <b style={{ color: C.t2 }}>Where the real date lives:</b> {sg.whereToLook}
              </div>
              {open ? (
                <div style={{ ...R({ gap: 8, marginTop: 12, flexWrap: 'wrap' }) }}>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                    aria-label={`Deadline for ${sg.name}`} style={inp({ flex: '1 1 160px', width: 'auto' })} />
                  <button onClick={() => { onAccept(sg, date || null); setOpenId(null); setDate(''); }}
                    style={{ ...btn(accentFill(accent)), color: onTint(accent), fontSize: 12, padding: '8px 16px' }}>
                    Add to my roadmap
                  </button>
                  <button onClick={() => { setOpenId(null); setDate(''); }} style={btnG({ fontSize: 12, padding: '8px 16px' })}>Cancel</button>
                  <div style={{ fontSize: 10.5, color: C.t4, lineHeight: 1.55, flexBasis: '100%' }}>
                    Leave the date blank if you have not found it yet — it will sit in your
                    &quot;dates to find&quot; list instead of being lost.
                  </div>
                </div>
              ) : (
                <button onClick={() => setOpenId(id)} style={{ ...btnSm({ fontSize: 11.5, marginTop: 12 }) }}>
                  <Plus size={12} />I found the date — add it
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Answers ──────────────────────────────────────────────────────────────────

function AnswersView({ roadmap, accent, onEdit, onRebuild, onAcceptSuggestion }) {
  const progress = intakeProgress(roadmap.intake || {});
  return (
    <>
      <div style={{ ...glass({ padding: 20 }) }}>
        <SectionTitle icon={Target} color={accent}>What this roadmap was built from</SectionTitle>
        <div style={{ fontSize: 12.5, color: C.t3, lineHeight: 1.55, marginBottom: 16, maxWidth: 640 }}>
          These fifteen answers, plus everything in your Portfolio and everything you told us during
          setup. Change any of them and rebuild — the roadmap is only ever as good as what it knows
          about you, and what it knows about you changes.
        </div>
        <div style={{ ...R({ gap: 8, flexWrap: 'wrap' }) }}>
          <button onClick={onEdit} style={{ ...btn(accentFill(accent)), color: onTint(accent), fontSize: 13 }}>
            <Target size={14} /> Review my answers
          </button>
          <button onClick={onRebuild} style={btnG({ fontSize: 13 })}><RefreshCw size={13} /> Rebuild with these</button>
        </div>
        <div style={{ fontSize: 11, color: C.t4, marginTop: 12 }}>{progress.answered} of {progress.total} answered</div>
      </div>

      <BeyondCatalogCard suggestions={roadmap.beyondCatalog} accent={accent} onAccept={onAcceptSuggestion} />

      {!!roadmap.gaps?.length && (
        <div style={{ ...glass2({ padding: 16 }) }}>
          <SectionTitle icon={ShieldQuestion} color={C.amber}>Things our catalog does not cover</SectionTitle>
          <div style={{ fontSize: 11.5, color: C.t3, lineHeight: 1.55, marginBottom: 8 }}>
            Medabrain flagged these as genuinely relevant to you and absent from the verified
            deadline catalog. We have deliberately not invented dates for them — go and find them,
            then add them to your list yourself.
          </div>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: C.t2, lineHeight: 1.55 }}>
            {roadmap.gaps.map((g, i) => <li key={i}>{g}</li>)}
          </ul>
        </div>
      )}

      {roadmap.generation && (
        <div style={{ ...glass2({ padding: 12 }) }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: C.t3, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', marginBottom: 8 }}>
            How this was built
          </div>
          <div style={{ fontSize: 11.5, color: C.t4, lineHeight: 1.55 }}>
            Built {fmtDate(dayKey(new Date(roadmap.generation.at)))} in {roadmap.generation.seconds}s
            across {roadmap.generation.aiCalls} Medabrain pass{roadmap.generation.aiCalls === 1 ? '' : 'es'}.
            Every date came from our verified catalog — Medabrain chose and sequenced, it never wrote a date.
          </div>
        </div>
      )}
    </>
  );
}

// ── Shared ───────────────────────────────────────────────────────────────────

const linkish = {
  background: 'transparent', border: 0, padding: 0, cursor: 'pointer',
  color: C.violet, fontWeight: 700, fontFamily: 'inherit', fontSize: 'inherit', textDecoration: 'underline',
};

/** Sort: most urgent first, then by date. Used by every list in the tab. */
const byUrgency = (today) => (a, b) => {
  const ua = URGENCY_ORDER.indexOf(itemUrgency(a, today));
  const ub = URGENCY_ORDER.indexOf(itemUrgency(b, today));
  if (ua !== ub) return ua - ub;
  return String(effectiveDue(a) || '9999').localeCompare(String(effectiveDue(b) || '9999'));
};
