import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Sparkles, Target, Flag, TrendingUp, ChevronDown, CheckCircle2, Circle, RefreshCw,
  CalendarClock, Map as MapIcon, Clock, ArrowRight, ShieldAlert, ShieldCheck, BookOpen, Layers, Layers3,
  MessageCircle, Award, GraduationCap, ScrollText, CalendarDays, Stethoscope, History,
  FlaskConical, UserCheck, Moon, Mic, Compass, X, Lock, Undo2, GripVertical, Sunrise, CalendarPlus,
} from 'lucide-react';
import { C, glass, glass2, btn, btnSm, R, CC, G, pill, accentFill, onTint } from '../lib/theme';
import { awardXP, BONUS_COPY } from '../lib/rewards';
import { celebrateXP, celebrateBonusXP, celebrateJackpot, celebrateAchievement } from '../lib/celebrate';
import * as speech from '../lib/speech';
import { listItems } from '../lib/dataApi';
import { computePlanReadiness } from '../lib/studentProfile';
import * as PlanStore from '../lib/masterPlanStore';
import {
  createMasterPlan, extendMasterPlan, regenerateRoadmap, adaptPlanToNotes, pruneRollingWindow, toggleTaskDone,
  needsExtension, getUpcomingDays, getCurrentWeekNumber, getCurrentPhase, todayStr, addDaysStr, resolveAllTaskLinks,
  applyDailyRollover, AUTO_VERIFIABLE_KINDS, AUTO_VERIFIABLE_TYPES, moveTaskToDay, reorderTasksInDay, planIsStale,
  retargetStaleTasks, refreshDayWindow, WINDOW_DAYS,
} from '../lib/masterPlanGenerator';

// Same Portfolio resource list + self-fetch pattern PortfolioMedabrain.jsx uses — lets plan
// generation ground itself in the student's ACTUAL colleges/essays/deadlines/activities
// instead of just onboarding answers and summary counts.
// Every per-user table the Portfolio owns, mapped to the key buildPortfolioFactsText reads.
// This is the "look through my entire Portfolio before designing the plan" contract: the plan
// generator's digest covers each of these, so anything missing from this list is a category the
// Oracle is structurally blind to.
const PORTFOLIO_RESOURCE_MAP = {
  colleges: 'colleges',
  college_checklist_items: 'collegeChecklist',
  essays: 'essays',
  deadlines: 'deadlines',
  scholarships: 'scholarships',
  activities: 'activities',
  research_experience: 'research',
  skills_certifications: 'skills',
  clinical_hours: 'clinicalHours',
  recommenders: 'recommenders',
  test_scores: 'testScores',
  awards: 'awards',
  gpa_entries: 'gpaEntries',
  // The Admissions Calculator's intake — citizenship, residency, weighted/unweighted GPA, course
  // rigor, section scores, documented service hours. The planner reads it because an unanswered
  // eligibility question is a real, scheduleable task ("answer the four intake fields that decide
  // whether you are even eligible for the two combined-degree programs on your list") and
  // because a student who has told us they are 170 documented service hours short of a published
  // requirement should see that in their plan, not only in the calculator.
  admission_intake: 'admissionIntake',
  // The Narrative Method Engine's inputs — the passion project's description, how many people it
  // has actually reached, whether a mentor or partner has signed on, whether anything durable
  // exists at a URL, and the brag-sheet answers (supabase/migrations/0025_narrative_engine.sql).
  //
  // The planner reads it because this is the only record in the whole Portfolio of the thing a
  // student may be spending the most hours on. An activities row says a project exists; this says
  // what state it is in, and every one of those fields is a scheduleable task when it is empty:
  // "email one teacher to be the named mentor" is a fifteen-minute job that moves an activity out
  // of Tier 3, and a plan that cannot see the gap cannot ever name it.
  narrative_profile: 'narrativeProfile',
};
const PORTFOLIO_RESOURCES = Object.keys(PORTFOLIO_RESOURCE_MAP);

// Exported because the plan no longer refreshes only while this tab is mounted — App.jsx runs the
// same daily window refresh app-wide (see planLiveSignals there), and a second, drifting copy of
// this list is exactly how one of the two callers ends up generating a Portfolio-blind plan.
export async function fetchPortfolio() {
  const entries = await Promise.all(
    PORTFOLIO_RESOURCES.map(async r => [PORTFOLIO_RESOURCE_MAP[r], await listItems(r).catch(() => [])])
  );
  return Object.fromEntries(entries);
}

// Returns the fetched Portfolio for rendering AND an `ensure()` that resolves to it — awaiting
// the in-flight fetch if one is running, starting a fresh one if the first attempt failed, and
// re-fetching right before a build so the plan is designed against the Portfolio as it is at
// click time, not as it was when the tab mounted. Before this, hitting "Build My Full Plan" fast
// enough (or after a failed fetch) generated the whole plan with `portfolio === null` — the
// student's colleges, essays, deadlines and hours all invisible to the model — with nothing in
// the UI to indicate it had happened.
function usePortfolioData() {
  const [portfolioData, setPortfolioData] = useState(null);
  const inFlightRef = useRef(null);
  const mountedRef = useRef(true);

  const load = useCallback(() => {
    if (inFlightRef.current) return inFlightRef.current;
    const p = fetchPortfolio()
      .then(data => { if (mountedRef.current) setPortfolioData(data); return data; })
      .catch(() => null)
      .finally(() => { inFlightRef.current = null; });
    inFlightRef.current = p;
    return p;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => { mountedRef.current = false; };
  }, [load]);

  // Always re-reads: a student who just logged a clinical hour in another tab and came back to
  // build their plan should have that hour in it.
  const ensure = useCallback(async () => (await load()) || portfolioData || null, [load, portfolioData]);
  return { portfolioData, ensurePortfolio: ensure };
}

// The Plans tab's own gradient. Every other surface in the app leans on the shared aurora/ocean
// gradients; this one is deliberately pink-forward end to end, because Plans is the tab with its
// own identity in the nav (plansAccent) and the one a student opens every single day.
const PLAN_GRAD = `linear-gradient(135deg, ${C.pink} 0%, ${C.fuchsia} 55%, ${C.violet} 100%)`;

const PILLAR_META = {
  prep: { color: C.violet, label: 'Prep' },
  portfolio: { color: C.green, label: 'Portfolio' },
  progress: { color: C.cyan, label: 'Progress' },
  rest: { color: C.amber, label: 'Rest & reflect' },
};
const TYPE_ICON = {
  lesson: BookOpen, quiz: Layers, flashcards: Layers3, reading: BookOpen, coach: MessageCircle,
  activity: Award, college: GraduationCap, essay: ScrollText, deadline: CalendarDays,
  clinical: Stethoscope, research: FlaskConical, recommender: UserCheck, interview: Mic,
  reflection: Sparkles, rest: Moon,
};
// Generation is deliberately unhurried now (see callOracle in masterPlanGenerator.js — real
// retries with backoff, high reasoning effort, a two-day window written properly rather than a
// fortnight written thinly), so the stage labels run further out and describe what is actually
// happening at each point instead of implying it should have finished already.
const LOADING_STAGES = [
  { at: 0, label: 'Reading your full profile and your entire Portfolio…' },
  { at: 6000, label: 'Checking which lessons are actually open to you right now…' },
  { at: 14000, label: "Medabrain's Oracle is building your roadmap…" },
  { at: 30000, label: 'Thinking through today and tomorrow, task by task…' },
  { at: 52000, label: 'Choosing the exact quizzes, lessons and drafts to point you at…' },
  { at: 75000, label: "Still going — it's taking the time to get this right." },
];

function fmtDateLabel(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
function relTime(ts) {
  if (!ts) return '';
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default function PlansTab({ user, saveUser, accent = C.violet, isMobile, goPrep, goPortfolio, goProgress, goSettings, openResource, liveSignals, initialExpandedDate, quizzesTaken = null, reducedMotion = false }) {
  const plan = user?.masterPlan || null;
  const { portfolioData, ensurePortfolio } = usePortfolioData();
  // portfolioData is null while its own fetch is in flight — pass null (not 0) through so
  // computePlanReadiness treats that one gate as provisionally satisfied rather than flashing
  // "locked" for a student who actually has Portfolio items, only to unlock a beat later.
  const portfolioItemCount = portfolioData ? Object.values(portfolioData).reduce((s, arr) => s + (arr?.length || 0), 0) : null;
  // Computed unconditionally (not just inside the `!plan` branch below) so the "you're ready"
  // effect can watch it with a normal, always-called hook — only meaningful pre-plan, so this is
  // cheap/pure and harmless once a plan already exists.
  const readiness = !plan ? computePlanReadiness(user, { quizzesTaken, portfolioItemCount }) : null;
  // "You're ready" — fires once per genuine false→true readiness transition observed while
  // mounted (comparing against an explicit prior `false`, not just "falsy", is what stops this
  // re-firing on a mere remount: switching tabs and back in this no-router SPA can remount
  // PlansTab, and a student who was ALREADY ready would otherwise see the celebration again every
  // time they revisit before ever building a plan). The localStorage flag below is a second,
  // belt-and-suspenders guard scoped to the account (not just this component instance) against
  // that same re-fire — cheap insurance, given how easy a one-time celebration is to get wrong.
  const prevReadyRef = useRef(null);
  useEffect(() => {
    if (!readiness) { prevReadyRef.current = null; return; }
    const wasReady = prevReadyRef.current;
    prevReadyRef.current = readiness.ready;
    if (readiness.ready && wasReady === false) {
      const flagKey = `planReadinessCelebrated:${user?.email || user?.id || 'anon'}`;
      let already = false;
      try { already = localStorage.getItem(flagKey) === '1'; } catch { /* private mode — best effort */ }
      if (already) return;
      try { localStorage.setItem(flagKey, '1'); } catch { /* best effort only */ }
      toast.success("You're all set — Medabrain has everything it needs. Let's build your plan.", { duration: 5500, icon: '✨' });
      celebrateAchievement();
    }
  }, [readiness?.ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const [view, setView] = useState('week'); // 'week' | 'roadmap'
  const [generating, setGenerating] = useState(false);
  const [stageLabel, setStageLabel] = useState(LOADING_STAGES[0].label);
  const [extending, setExtending] = useState(false);
  const [expandedDay, setExpandedDay] = useState(initialExpandedDate || null);
  const [expandedPhase, setExpandedPhase] = useState(null);

  // PlansTab can stay mounted across a Home → Plans navigation (tab switch alone doesn't
  // remount it), so a fresh initialExpandedDate (e.g. "get a head start on tomorrow") needs to
  // re-apply even when it isn't the very first render.
  useEffect(() => {
    if (initialExpandedDate) setExpandedDay(initialExpandedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialExpandedDate]);

  // Daily rollover — runs once per calendar day (guarded by plan.lastRolloverDate inside
  // applyDailyRollover itself), independent of the ~7-day chunk-extension cycle below. This is
  // what actually gets a task missed yesterday onto today's list instead of waiting for the next
  // chunk boundary.
  useEffect(() => {
    if (!plan) return;
    const rolled = applyDailyRollover(plan, user);
    if (rolled !== plan) {
      saveUser({ ...user, masterPlan: rolled });
      const carried = rolled.days.find(d => d.date === todayStr())?.tasks.filter(t => t.rolledOverFrom && t.id.includes('dailyrollover')).length || 0;
      if (carried > 0) toast(`${carried} task${carried > 1 ? 's' : ''} carried over from yesterday.`, { icon: '↻' });
    }
  }, [plan?.days?.length, todayStr()]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compact old days into progressLog on load so the synced blob never grows
  // unbounded — and upgrade any plan generated before deep links existed so
  // every task carries a working "open this exact resource" link.
  useEffect(() => {
    if (!plan) return;
    const upgraded = resolveAllTaskLinks(pruneRollingWindow(plan), user, liveSignals || {});
    if (upgraded !== plan) saveUser({ ...user, masterPlan: upgraded });
  }, [plan?.days?.length, plan?.linkVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the plan honest between generations. Finishing a lesson, or unlocking the unit that was
  // blocking one, changes what the already-written tasks should point at — and that happens far
  // more often than a full regeneration does. This is local, free and idempotent (it returns the
  // same object when nothing is stale), so it can run on every relevant render without looping.
  useEffect(() => {
    if (!plan) return;
    const adjusted = retargetStaleTasks(plan, user, liveSignals || {});
    if (adjusted === plan) return;
    saveUser({ ...user, masterPlan: adjusted });
    const n = adjusted.lastRetarget?.changes?.length || 0;
    if (n > 0) toast(`Plan adjusted — ${n === 1 ? 'a lesson' : `${n} lessons`} you'd finished or can't open yet ${n === 1 ? 'was' : 'were'} swapped for one you can start now.`, { icon: '🎯', duration: 4500 });
    // Keyed on the unlock map so this re-runs exactly when the pathway's shape changes.
  }, [plan?.days?.length, JSON.stringify(liveSignals?.pathwayState?.byLesson || null)]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-extend the rolling window in the background — this is what keeps the plan
  // "continuing to plan" instead of going stale once the generated window runs out. Re-checks
  // on mount (covers "came back after N days away") and again each time daysGeneratedThrough
  // itself moves forward (covers staying on the tab across multiple extend cycles) — `extending`
  // alone is the in-flight guard, so a later cycle can always fire once the previous one lands.
  useEffect(() => {
    if (!plan || extending) return;
    if (!needsExtension(plan)) return;
    setExtending(true);
    // Reads the Portfolio first, same as a manual build: an extension generated without it
    // would quietly drop back to generic tasks for the days it adds, so the plan would get
    // less personal the longer a student stayed on it.
    ensurePortfolio()
      .then(portfolio => extendMasterPlan(plan, user, liveSignals || {}, portfolio))
      .then(updated => {
        saveUser({ ...user, masterPlan: updated });
        PlanStore.flushPlanNow(updated, 'daily refresh').catch(() => {});
      })
      .catch(() => {})
      .finally(() => setExtending(false));
    // `windowBuiltFor` is the day the current two days were written on, so this fires once when
    // the date rolls over — which is the whole "it keeps updating" behavior, not a background
    // nicety. Watching daysGeneratedThrough alone never re-fired for a window that still had
    // runway, which is how a plan written on Tuesday was still on screen on Thursday.
  }, [plan?.daysGeneratedThrough, plan?.windowBuiltFor, todayStr()]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleBuild() {
    setGenerating(true);
    setStageLabel(LOADING_STAGES[0].label);
    // Drive stage labels off real elapsed time — the actual work is 3 sequential Groq
    // calls (roadmap + 2 day chunks), so a fixed-count interval would drift from reality.
    const start = Date.now();
    const stageTimer = setInterval(() => {
      const elapsed = Date.now() - start;
      const stage = [...LOADING_STAGES].reverse().find(s => elapsed >= s.at);
      if (stage) setStageLabel(stage.label);
    }, 700);
    try {
      // Read the ENTIRE Portfolio first, every time — the plan is only as personal as the
      // record it was designed against, and a build that raced the initial fetch used to
      // silently produce a portfolio-blind plan.
      const portfolio = await ensurePortfolio();
      const built = await createMasterPlan(user, liveSignals || {}, portfolio);
      saveUser({ ...user, masterPlan: built });
      // Straight to the server rather than waiting out the debounce: this is up to a minute of
      // the student's time and several Oracle calls, and a tab closed in the next few seconds
      // should not be able to lose it.
      PlanStore.flushPlanNow(built, 'first build').catch(() => {});
      // Never claim a plan is "ready" when part of it is the deterministic fallback. The student
      // can see the difference — that is exactly the complaint this release started from — and
      // being told it is ready when it plainly is not is worse than the fallback itself.
      if (built.generation?.degraded) toast('Your plan is up, but Medabrain couldn\'t reach its planning model for part of it — hit Replan for the full version.', { icon: '⚠️', duration: 7000 });
      else toast.success('Your full plan is ready.');
    } catch {
      toast.error("Couldn't build your plan — please try again.");
    } finally {
      clearInterval(stageTimer);
      setGenerating(false);
    }
  }

  async function handleRegenerate() {
    if (!window.confirm("Rebuild your roadmap? This refreshes your phases, milestones, and weekly themes based on where you are right now — your upcoming day-by-day tasks stay put.")) return;
    setGenerating(true);
    setStageLabel("Medabrain's Oracle is rebuilding your roadmap…");
    try {
      const portfolio = await ensurePortfolio();
      const updated = await regenerateRoadmap(plan, user, liveSignals || {}, portfolio);
      saveUser({ ...user, masterPlan: updated });
      PlanStore.flushPlanNow(updated, 'roadmap rebuild').catch(() => {});
      toast.success('Roadmap refreshed. Your previous version is saved — you can restore it from the header.');
    } catch {
      toast.error("Couldn't refresh your roadmap — please try again.");
    } finally {
      setGenerating(false);
    }
  }

  // Same rebuild as handleRegenerate, minus the confirm dialog — this one fires from the
  // "your profile changed" banner below, which is already an explicit student click, not a
  // background auto-rebuild (that would burn an Oracle call on every profile edit unprompted).
  async function handleRefreshFromProfile() {
    setGenerating(true);
    setStageLabel("Medabrain's Oracle is updating your roadmap for your new profile…");
    try {
      const portfolio = await ensurePortfolio();
      const updated = await regenerateRoadmap(plan, user, liveSignals || {}, portfolio);
      saveUser({ ...user, masterPlan: updated });
      PlanStore.flushPlanNow(updated, 'profile change').catch(() => {});
      toast.success('Your plan now reflects your updated profile.');
    } catch {
      toast.error("Couldn't refresh your roadmap — please try again.");
    } finally {
      setGenerating(false);
    }
  }

  // Rewrites just the two-day window against everything true right now — the cheap, frequent
  // counterpart to rebuilding the whole roadmap. This is the button for "today changed": it keeps
  // the roadmap spine and anything already finished today, and re-thinks the rest.
  async function handleReplanWindow() {
    if (extending) return;
    setExtending(true);
    try {
      const portfolio = await ensurePortfolio();
      const updated = await refreshDayWindow(plan, user, liveSignals || {}, portfolio);
      saveUser({ ...user, masterPlan: updated });
      PlanStore.flushPlanNow(updated, 'replanned today & tomorrow').catch(() => {});
      if (updated.generation?.degraded) toast('Replanned, but Medabrain couldn\'t reach its planning model for part of it — try again in a moment for the full version.', { icon: '⚠️', duration: 6000 });
      else toast.success('Today and tomorrow, rethought from scratch.');
    } catch {
      toast.error("Couldn't replan right now — please try again.");
    } finally {
      setExtending(false);
    }
  }

  // Manual toggling only ever applies to task types the app has no way to verify happened (see
  // AUTO_VERIFIABLE_KINDS) — quiz/lesson/deck tasks are checked off automatically, for real, from
  // inside those features (App.jsx's applyPlanAutoComplete), and TaskRow below never renders a
  // clickable checkbox for them. toggleTaskDone itself is also exploit-proof now regardless
  // (xpAwarded is a one-way flag), but keeping the checkbox off those types entirely is what
  // actually makes "check it, uncheck it, check it again" impossible rather than just unrewarding.
  function handleToggleTask(date, taskId) {
    const { plan: updated, justEarnedXP } = toggleTaskDone(plan, date, taskId);
    if (!justEarnedXP) { saveUser({ ...user, masterPlan: updated }); return; }
    const { finalXP, tier } = awardXP(6);
    saveUser({ ...user, masterPlan: updated, xp: (user?.xp || 0) + finalXP });
    toast.success(BONUS_COPY[tier] ? BONUS_COPY[tier](finalXP) : `+${finalXP} XP`, { duration: 1800 });
    if (tier === 'jackpot') celebrateJackpot();
    else if (tier === 'big' || tier === 'bonus') celebrateBonusXP();
    else celebrateXP();
  }

  // Manual rescheduling — the single mutation behind drag-and-drop, the "Move" day
  // picker, and one-click snooze, all following the same save-through-user pattern
  // as handleToggleTask above.
  function handleMoveTask(taskId, fromDate, toDate) {
    if (!taskId || !fromDate || !toDate || fromDate === toDate) return;
    const updated = moveTaskToDay(plan, taskId, fromDate, toDate);
    if (updated === plan) return;
    saveUser({ ...user, masterPlan: updated });
    toast(toDate === todayStr() ? 'Moved to today.' : toDate === addDaysStr(todayStr(), 1) ? 'Moved to tomorrow.' : `Moved to ${fmtDateLabel(toDate)}.`, { icon: '↪' });
  }

  function handleReorderTasks(date, orderedTaskIds) {
    const updated = reorderTasksInDay(plan, date, orderedTaskIds);
    if (updated !== plan) saveUser({ ...user, masterPlan: updated });
  }

  function handleSnoozeTask(date, taskId) {
    handleMoveTask(taskId, date, addDaysStr(todayStr(), 1));
  }

  // Prefer the app-provided deep-link opener (launches the exact quiz/lesson/
  // deck/article the task names); plain tab navigation is the fallback.
  function jumpTo(task) {
    if (openResource) { openResource(task); return; }
    const { resourceTab: tab, resourceView: subview } = task || {};
    if (!tab || !subview) return;
    if (tab === 'prep') goPrep?.(subview);
    else if (tab === 'portfolio') goPortfolio?.(subview);
    else if (tab === 'progress') goProgress?.(subview);
  }

  if (generating) return <GeneratingCard label={stageLabel} accent={accent} />;
  if (!plan) {
    if (!readiness.ready) {
      return (
        <LockedState
          readiness={readiness} accent={accent} isMobile={isMobile} goSettings={goSettings}
          onGoActivity={(m) => { if (m.goTab === 'prep') goPrep?.(m.goView); else if (m.goTab === 'portfolio') goPortfolio?.(m.goView); else if (m.goTab === 'progress') goProgress?.(m.goView); }}
          onGoProfileField={(m) => goSettings?.(m.goField)}
        />
      );
    }
    return <EmptyState onBuild={handleBuild} accent={accent} isMobile={isMobile} />;
  }

  // Restoring an archived version (see api/master-plan.js). Every roadmap rebuild used to be
  // irreversible — the plan it replaced was simply gone — which made the most useful button on
  // this screen also the scariest one.
  async function handleRestoreRevision(revision) {
    const restored = await PlanStore.fetchPlanRevision(revision);
    if (!restored) { toast.error("Couldn't load that version — please try again."); return false; }
    saveUser({ ...user, masterPlan: restored });
    PlanStore.flushPlanNow(restored, `restored revision ${revision}`).catch(() => {});
    toast.success('Restored. Your day-by-day plan is back to that version.');
    return true;
  }

  const weekNumber = getCurrentWeekNumber(plan);
  const phase = getCurrentPhase(plan);
  // The window is today + tomorrow (WINDOW_DAYS). Asking for a couple more covers the brief moment
  // between a date rolling over and the refresh landing, so the view is never empty.
  const upcoming = getUpcomingDays(plan, WINDOW_DAYS + 2);
  const stale = planIsStale(plan, user);

  return (
    <div style={CC({ gap: 20 })}>
      {stale && <StaleProfileBanner accent={accent} onRefresh={handleRefreshFromProfile} />}
      {plan.generation?.degraded && <DegradedBanner accent={accent} onRetry={handleReplanWindow} busy={extending} generation={plan.generation} />}
      <PlanHeader plan={plan} weekNumber={weekNumber} phase={phase} accent={accent} onRegenerate={handleRegenerate} onRestore={handleRestoreRevision} onReplan={handleReplanWindow} replanning={extending} />

      <PlanVoiceNotes user={user} saveUser={saveUser} plan={plan} liveSignals={liveSignals} ensurePortfolio={ensurePortfolio} accent={accent} />

      <div style={{ display: 'flex', gap: 4 }}>
        {[{ id: 'week', label: 'Today & tomorrow', icon: CalendarClock }, { id: 'roadmap', label: 'Full roadmap', icon: MapIcon }].map(v => {
          const active = view === v.id;
          return (
            <button key={v.id} onClick={() => setView(v.id)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 999,
              border: active ? `1px solid ${accent}66` : `1px solid ${C.b1}`, background: active ? `${accent}22` : 'rgba(255,255,255,0.02)',
              color: active ? onTint(accent) : C.t2, fontWeight: active ? 700 : 500, fontSize: 12.5, fontFamily: C.FB, cursor: 'pointer',
            }}>
              <v.icon size={13} color={active ? accent : C.t3} />{v.label}
            </button>
          );
        })}
      </div>

      {view === 'week' ? (
        <WeekView
          plan={plan} upcoming={upcoming} accent={accent} isMobile={isMobile} expandedDay={expandedDay} setExpandedDay={setExpandedDay}
          onToggleTask={handleToggleTask} jumpTo={jumpTo} extending={extending} onReplan={handleReplanWindow}
          onMoveTask={handleMoveTask} onReorderTasks={handleReorderTasks} onSnoozeTask={handleSnoozeTask}
          reducedMotion={reducedMotion}
        />
      ) : (
        <RoadmapView plan={plan} accent={accent} isMobile={isMobile} expandedPhase={expandedPhase} setExpandedPhase={setExpandedPhase} />
      )}
    </div>
  );
}

// ── Locked state ───────────────────────────────────────────────────────────
// Shown instead of the "Build" CTA when the student is missing one of the six
// core facts (see computePlanReadiness) Medabrain's Oracle needs to build a
// plan it can actually be confident in. Anyone who's been through the current
// onboarding flow already has all six by construction — this only actually
// gates legacy accounts, which is exactly the intended nudge toward Settings.
// One checklist row — done/pending/loading, with a checkmark that animates in only on a genuine
// pending→done transition (see the `justCompleted` diffing in LockedState below), never on a
// loading→done resolution (nothing changed, the data just arrived) or on first paint.
function ChecklistRow({ item, accent, onClick, clickable, justCompleted }) {
  const { state, label, hint } = item;
  const Wrapper = clickable ? motion.button : motion.div;
  return (
    <Wrapper
      onClick={clickable ? onClick : undefined}
      animate={justCompleted ? { scale: [1, 1.05, 1] } : undefined}
      transition={justCompleted ? { duration: 0.45, ease: 'easeOut' } : undefined}
      style={{
        all: clickable ? 'unset' : undefined, cursor: clickable ? 'pointer' : 'default', boxSizing: 'border-box', width: '100%',
        ...glass2({ padding: '8px 12px' }), display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
        border: state === 'done' ? `1px solid ${C.green}35` : undefined,
      }}>
      <AnimatePresence mode="wait" initial={false}>
        {state === 'done' ? (
          <motion.span key="done" initial={justCompleted ? { scale: 0, rotate: -90 } : false} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 20 }} style={{ display: 'flex', flexShrink: 0 }}>
            <CheckCircle2 size={14} color={C.greenL} />
          </motion.span>
        ) : state === 'loading' ? (
          <motion.span key="loading" animate={{ opacity: [0.3, 0.7, 0.3] }} transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }} style={{ display: 'flex', flexShrink: 0 }}>
            <Circle size={13} color={C.t3} />
          </motion.span>
        ) : (
          <span key="pending" style={{ display: 'flex', flexShrink: 0 }}>
            <Circle size={13} color={C.amberL} />
          </span>
        )}
      </AnimatePresence>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: C.t1, fontWeight: 600 }}>{label}</div>
        {state === 'done'
          ? <div style={{ fontSize: 10, color: C.t3, marginTop: 4 }}>Already have this from your onboarding</div>
          : (clickable && hint) ? <div style={{ fontSize: 10, color: C.t3, marginTop: 4 }}>Tap to open · {hint}</div> : null}
      </div>
      {clickable && state !== 'done' && <ArrowRight size={13} color={C.amberL} style={{ flexShrink: 0 }} />}
    </Wrapper>
  );
}

function LockedState({ readiness, accent, isMobile, goSettings, onGoActivity, onGoProfileField }) {
  const missingProfile = readiness.missing.filter(m => m.kind === 'profile');
  const missingActivity = readiness.missing.filter(m => m.kind === 'activity');
  const profileItems = readiness.checklist.filter(c => c.kind === 'profile');
  const activityItems = readiness.checklist.filter(c => c.kind === 'activity');

  // Diffed one render behind (via effect, not during render) so a checkmark only animates for an
  // item that just flipped pending→done since the LAST commit — a loading→done resolution (the
  // gate's own data simply finished loading, nothing the student did) never animates.
  const prevStatesRef = useRef({});
  const [justCompleted, setJustCompleted] = useState(() => new Set());
  useEffect(() => {
    const prev = prevStatesRef.current;
    const next = new Set();
    for (const item of readiness.checklist) {
      if (prev[item.field] === 'pending' && item.state === 'done') next.add(item.field);
    }
    prevStatesRef.current = Object.fromEntries(readiness.checklist.map(c => [c.field, c.state]));
    if (next.size) setJustCompleted(next);
  }, [readiness.checklist]);

  return (
    <div data-tour="plans-deep-hero" style={{ ...glass({ padding: 0, overflow: 'hidden', position: 'relative' }), border: `1px solid ${C.amber}30` }}>
      <div style={{ position: 'absolute', inset: 0, background: C.auroraGrad, opacity: 0.05, pointerEvents: 'none' }} />
      <div style={{ position: 'relative', padding: isMobile ? '28px 20px' : '46px 40px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 60, height: 60, borderRadius: 16, background: `${C.amber}20`, border: `1.5px solid ${C.amber}45`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Lock size={26} color={C.amberL} />
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', color: C.amberL, marginBottom: 8 }}>Almost ready</div>
          <h2 style={{ fontSize: 22, lineHeight: 'calc(1.35 * var(--msp-line-scale))', fontWeight: 800, color: C.t1, fontFamily: C.FD, letterSpacing: 'calc(-0.4px + var(--msp-letter-spacing))', margin: 0 }}>A few things first</h2>
        </div>
        <p style={{ fontSize: 13.5, color: C.t2, lineHeight: 1.55, maxWidth: 460, margin: 0 }}>
          Medabrain's Oracle builds the best possible plan when it actually knows where you stand — not too much, just enough to be confident. Onboarding already answered some of this for you. <b style={{ color: C.t1 }}>Tap any unfinished item below</b> and it'll take you straight to the exact place you answer it.
        </p>
        {profileItems.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 340 }}>
            <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', color: C.t3, textAlign: 'left' }}>Your profile</div>
            {/* Every unfinished row is a working link into the exact Settings field that answers
                it (see settingsFocus in App.jsx — it opens the right editor, scrolls the field
                into view and highlights it). These were previously inert text, so a student
                looking at "Your grades" had to guess which of Settings' many cards held it. */}
            {profileItems.map(m => (
              <ChecklistRow key={m.field} item={m} accent={accent}
                clickable={m.state !== 'done' && !!onGoProfileField}
                onClick={() => onGoProfileField?.(m)} justCompleted={justCompleted.has(m.field)} />
            ))}
          </div>
        )}
        {activityItems.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 340 }}>
            <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', color: C.t3, textAlign: 'left' }}>Show us where you stand</div>
            {activityItems.map(m => (
              <ChecklistRow key={m.field} item={m} accent={accent} clickable={m.state !== 'done' && !!onGoActivity}
                onClick={() => onGoActivity?.(m)} justCompleted={justCompleted.has(m.field)} />
            ))}
          </div>
        )}
        {missingProfile.length > 0 && (
          <button style={btn(C.auroraGrad, { padding: '12px 28px', fontSize: 14 })} onClick={() => goSettings?.(missingProfile[0]?.goField || null)}>
            Update my profile
          </button>
        )}
      </div>
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────
function EmptyState({ onBuild, accent, isMobile }) {
  return (
    <div data-tour="plans-deep-hero" style={{ ...glass({ padding: 0, overflow: 'hidden', position: 'relative' }), border: `1px solid ${C.pink}35` }}>
      <div style={{ position: 'absolute', inset: 0, background: PLAN_GRAD, opacity: 0.07, pointerEvents: 'none' }} />
      <div style={{ position: 'relative', padding: isMobile ? '28px 20px' : '46px 40px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 60, height: 60, borderRadius: 16, background: PLAN_GRAD, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 10px 30px ${C.pink}50` }}>
          <CalendarClock size={28} color="#fff" />
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', color: C.pinkL, marginBottom: 8 }}>Medabrain Oracle · Plans</div>
          <h2 style={{ fontSize: 24, lineHeight: 'calc(1.32 * var(--msp-line-scale))', fontWeight: 800, color: C.t1, fontFamily: C.FD, letterSpacing: 'calc(-0.47px + var(--msp-letter-spacing))', margin: 0 }}>Build your full plan</h2>
        </div>
        <p style={{ fontSize: 13.5, color: C.t2, lineHeight: 1.55, maxWidth: 480, margin: 0 }}>
          Phases and milestones for the months ahead — and then, in real detail, <b style={{ color: C.pinkL }}>today and tomorrow</b>: the exact quizzes, lessons, drafts and hours to work on, why each one is on your plan, and when in the day it belongs. Grounded in your whole profile, your entire Portfolio, and only the lessons you can actually open right now. It rewrites itself every day around what you've actually done.
        </p>
        <button style={btn(PLAN_GRAD, { padding: '12px 28px', fontSize: 14 })} onClick={onBuild}>
          <Sparkles size={15} />Build my full plan
        </button>
        <div style={{ fontSize: 11, color: C.t3 }}>Give it a minute — Medabrain's deepest model reads your whole profile and genuinely thinks this through. It's slow on purpose.</div>
      </div>
    </div>
  );
}

// ── Generating state ──────────────────────────────────────────────────────
function GeneratingCard({ label, accent }) {
  return (
    <div style={{ ...glass({ padding: 40, textAlign: 'center' }), border: `1px solid ${C.pink}35` }}>
      <motion.div
        animate={{ rotate: 360 }} transition={{ duration: 2.2, repeat: Infinity, ease: 'linear' }}
        style={{ width: 52, height: 52, borderRadius: '50%', border: `3px solid ${C.pink}25`, borderTopColor: C.pink, margin: '0 auto 20px' }}
      />
      <div style={{ fontSize: 15, fontWeight: 700, color: C.t1, fontFamily: C.FD, marginBottom: 4 }}>Building your full plan</div>
      <div style={{ fontSize: 11, color: C.t4, marginBottom: 12 }}>This is meant to take a while — it's thinking, not loading.</div>
      <AnimatePresence mode="wait">
        <motion.div key={label} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} style={{ fontSize: 12.5, color: C.t3 }}>
          {label}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ── Stale-profile banner ──────────────────────────────────────────────────
// Shown when planIsStale() detects the student's onboarding/profile facts
// (goal, target score, pathway, obstacles, grades, ...) have changed since
// this plan's roadmap was last built — e.g. after editing goals in Settings
// or switching pathway. One click regenerates the roadmap (phases/milestones/
// weekly themes) from the current profile; the day-by-day window already in
// progress is left alone, same as a manual "Rebuild Roadmap".
function StaleProfileBanner({ accent, onRefresh }) {
  return (
    <div style={{ ...glass2({ padding: '12px 16px' }), display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', border: `1px solid ${C.amber}35`, background: `${C.amber}0e` }}>
      <RefreshCw size={15} color={C.amberL} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 200, fontSize: 12.5, color: C.t1, lineHeight: 1.5 }}>
        Your profile's changed since this roadmap was built — refresh it so your plan reflects where you are now.
      </div>
      <button style={btnSm(accentFill(accent), { color: C.onAccent })} onClick={onRefresh}>Refresh my plan</button>
    </div>
  );
}

// ── "This isn't the real thing" banner ────────────────────────────────────
// Every generation path resolves to a usable plan even when the model is unreachable, which is the
// right behavior and was also the bug: the deterministic fallback rendered identically to a real
// plan, so a student whose calls were being rate-limited got the same three placeholder tasks
// every day with nothing anywhere saying why. `plan.generation.degraded` records that a fallback
// was used, and this says so plainly and offers the retry that usually fixes it.
function DegradedBanner({ accent, onRetry, busy, generation }) {
  return (
    <div style={{ ...glass2({ padding: '12px 16px' }), display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', border: `1px solid ${C.rose}40`, background: `${C.rose}0e` }}>
      <ShieldAlert size={15} color={C.roseL} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 220, fontSize: 12.5, color: C.t1, lineHeight: 1.5 }}>
        Some of this plan is Medabrain's basic fallback — its planning model couldn't be reached while this was built, so parts of it are generic rather than written for you.
        {generation?.errors?.length ? <span style={{ display: 'block', fontSize: 10.5, color: C.t3, marginTop: 4 }}>{generation.errors[0]}</span> : null}
      </div>
      <button onClick={onRetry} disabled={busy} style={{ ...btnSm(accentFill(accent), { color: C.onAccent }), opacity: busy ? 0.6 : 1 }}>
        {busy ? 'Retrying…' : 'Rebuild it properly'}
      </button>
    </div>
  );
}

// ── Header ─────────────────────────────────────────────────────────────────
// Version history — the safety net under "Rebuild Roadmap". Loaded lazily on open (the list is
// metadata only, never ten full plan bodies) and empty-stated honestly when the account has no
// archived versions or the server can't be reached, rather than pretending a failure is "none".
function PlanHistoryMenu({ accent, onRestore }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState(null);
  const [restoring, setRestoring] = useState(null);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next || history) return;
    setLoading(true);
    setHistory(await PlanStore.fetchPlanHistory());
    setLoading(false);
  }

  async function restore(rev) {
    if (restoring) return;
    if (!window.confirm('Restore this earlier version of your plan? Your current plan is archived first, so you can switch back.')) return;
    setRestoring(rev);
    const ok = await onRestore(rev);
    setRestoring(null);
    if (ok) { setOpen(false); setHistory(null); }
  }

  return (
    <div style={{ position: 'relative' }}>
      <button style={btnSm('rgba(255,255,255,0.06)', { color: C.t2 })} onClick={toggle} aria-expanded={open}>
        <History size={11} />Versions
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            style={{ ...glass({ padding: 12, position: 'absolute', right: 0, top: 'calc(100% + 8px)', width: 290, zIndex: 40 }), border: `1px solid ${accent}35` }}>
            <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', color: C.t3, marginBottom: 8 }}>Earlier versions of this plan</div>
            {loading && <div style={{ fontSize: 11.5, color: C.t3 }}>Loading…</div>}
            {!loading && history?.length === 0 && (
              <div style={{ fontSize: 11.5, color: C.t3, lineHeight: 1.5 }}>No earlier versions saved yet. Every time you rebuild your roadmap, the version it replaces is kept here.</div>
            )}
            {!loading && history?.map(h => (
              <div key={h.revision} style={{ ...glass2({ padding: '8px 12px' }), marginBottom: 4 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: C.t1, lineHeight: 1.35 }}>{h.headline}</div>
                <div style={{ fontSize: 10, color: C.t3, marginTop: 4 }}>
                  {new Date(h.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  {h.reason ? ` · replaced on ${h.reason}` : ''}
                </div>
                <button onClick={() => restore(h.revision)} disabled={!!restoring}
                  style={{ ...btnSm(`${accent}18`, { color: accent, fontSize: 10.5 }), marginTop: 8, opacity: restoring ? 0.6 : 1 }}>
                  {restoring === h.revision ? 'Restoring…' : 'Restore this version'}
                </button>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PlanHeader({ plan, weekNumber, phase, accent, onRegenerate, onRestore, onReplan, replanning }) {
  return (
    // overflow stays visible so the Versions dropdown below can escape the card; the gradient
    // background still clips to the border radius on its own.
    <div data-tour="plans-deep-hero" style={{ ...glass({ padding: 0, overflow: 'visible' }), border: `1px solid ${accent}30`, background: `linear-gradient(135deg,${accent}12,transparent 60%)`, position: 'relative' }}>
      <div style={{ padding: '20px 24px' }}>
        <div style={R({ justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' })}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', color: C.pinkL, marginBottom: 4 }}>Your Full Plan · Medabrain Oracle</div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: C.t1, fontFamily: C.FD, letterSpacing: 'calc(-0.02em + var(--msp-letter-spacing))', margin: 0, lineHeight: 1.25 }}>{plan.headline}</h1>
          </div>
          <div style={R({ gap: 8 })}>
            {weekNumber && <span style={pill(`${accent}18`, accent, { fontSize: 11 })}>Week {weekNumber} of {plan.horizonWeeks}</span>}
            {onReplan && (
              <button disabled={replanning} style={{ ...btnSm(`${C.pink}18`, { color: C.pinkL, border: `1px solid ${C.pink}40` }), opacity: replanning ? 0.6 : 1 }} onClick={onReplan}>
                <Sparkles size={11} />{replanning ? 'Replanning…' : 'Replan Today'}
              </button>
            )}
            {onRestore && <PlanHistoryMenu accent={accent} onRestore={onRestore} />}
            <button style={btnSm('rgba(255,255,255,0.06)', { color: C.t2 })} onClick={onRegenerate}><RefreshCw size={11} />Rebuild roadmap</button>
          </div>
        </div>
        <p style={{ fontSize: 13, color: C.t2, lineHeight: 1.7, margin: '12px 0px 0px', maxWidth: 780 }}>{plan.overview}</p>
        {phase && (
          <div style={{ marginTop: 12, ...glass2({ padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'center' }) }}>
            <Target size={13} color={accent} style={{ flexShrink: 0 }} />
            <div style={{ fontSize: 12, color: C.t1 }}><b>{phase.title}</b> — {phase.theme}</div>
          </div>
        )}
        <div style={{ fontSize: 10.5, color: C.t3, marginTop: 12 }}>
          Updated {relTime(plan.updatedAt)} · Today &amp; tomorrow planned in detail, rewritten daily
          {plan.generation?.tookMs > 4000 ? ` · last generation took ${Math.round(plan.generation.tookMs / 1000)}s` : ''}
        </div>
      </div>
    </div>
  );
}

// ── Dictation — "tell Medabrain more" ─────────────────────────────────────
// Same Web Speech API (src/lib/speech.js) the Live Voice Interview uses for its mic input,
// reused here so anything the student says gets folded straight into the plan: saved to
// user.planNotes (read by buildProfileFactsText in masterPlanGenerator.js, so every future
// generation — extend, regenerate, the next rolling day chunk — sees it too, not just this one
// rebuild) and immediately used to refresh the roadmap right now, so it's visibly "in" the plan
// rather than a note that silently waits for the next scheduled rebuild.
function PlanVoiceNotes({ user, saveUser, plan, liveSignals, ensurePortfolio, accent }) {
  const [draft, setDraft] = useState('');
  const [listening, setListening] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const recognizerRef = useRef(null);
  const sttSupported = speech.isSTTSupported();
  const notes = user?.planNotes || [];

  useEffect(() => () => { recognizerRef.current?.stop?.(); }, []);

  function toggleMic() {
    if (!sttSupported) return;
    if (listening) { recognizerRef.current?.stop(); return; }
    const rec = speech.createRecognizer({
      onResult: (t) => setDraft(t),
      onEnd: () => setListening(false),
      onError: (e) => { setListening(false); if (e?.error && e.error !== 'no-speech' && e.error !== 'aborted') toast.error('Mic issue — you can type instead.'); },
    });
    if (!rec) return;
    recognizerRef.current = rec;
    rec.start();
    setListening(true);
  }

  async function submit() {
    const text = draft.trim();
    if (!text || submitting) return;
    recognizerRef.current?.stop(); setListening(false);
    setSubmitting(true);
    const nextNotes = [...notes, text].slice(-8); // bounded so the profile-facts prompt never grows unbounded
    const updatedUser = { ...user, planNotes: nextNotes };
    try {
      // adaptPlanToNotes (not just regenerateRoadmap) — rewrites today-forward, still-open days
      // too, so this note visibly changes actual tasks, not just the roadmap's narrative overview.
      const portfolio = await ensurePortfolio();
      const updated = await adaptPlanToNotes(plan, updatedUser, liveSignals || {}, portfolio);
      saveUser({ ...updatedUser, masterPlan: updated });
      PlanStore.flushPlanNow(updated, 'note added').catch(() => {});
      toast.success('Got it — today and the days ahead now reflect that.');
    } catch {
      saveUser(updatedUser); // note is kept even if the live refresh call fails — it'll be included next time the plan regenerates
      toast.error("Saved — but couldn't refresh your plan right now. It'll be included next time your plan updates.");
    }
    setDraft('');
    setSubmitting(false);
  }

  function removeNote(i) {
    saveUser({ ...user, planNotes: notes.filter((_, idx) => idx !== i) });
  }

  return (
    <div style={glass({ padding: 16 })}>
      <div style={R({ gap: 8, marginBottom: 8 })}>
        <Mic size={13} color={accent} />
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', color: C.t3 }}>Tell Medabrain More</span>
      </div>
      <p style={{ fontSize: 12, color: C.t3, lineHeight: 1.55, margin: '0px 0px 12px' }}>
        Anything your plan should account for — an upcoming trip, a new goal, a subject you want more of — say it or type it, and it's folded straight into your roadmap.
      </p>
      {notes.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
          {notes.map((n, i) => (
            <span key={i} style={{ ...pill('rgba(255,255,255,0.04)', C.t2, { fontSize: 10.5 }), display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: 320 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n}</span>
              <button onClick={() => removeNote(i)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', opacity: 0.6 }} aria-label="Remove note"><X size={10} /></button>
            </span>
          ))}
        </div>
      )}
      <textarea
        style={{ width: '100%', minHeight: 60, resize: 'vertical', background: C.s2, border: `1px solid ${listening ? C.green : C.b1}`, borderRadius: 8, padding: '8px 12px', color: C.t1, fontSize: 12.5, lineHeight: 1.55, fontFamily: C.FB, boxSizing: 'border-box' }}
        placeholder={listening ? 'Listening — speak what you want added…' : sttSupported ? 'Tap the mic and speak, or type here…' : 'Type what you want added to your plan…'}
        value={draft}
        onChange={e => setDraft(e.target.value)}
      />
      <div style={R({ gap: 8, marginTop: 8 })}>
        {sttSupported && (
          <button onClick={toggleMic} disabled={submitting}
            style={{ ...btnSm(listening ? C.rose : 'rgba(255,255,255,0.04)', { color: listening ? '#fff' : C.t2, border: listening ? 'none' : `1px solid ${C.b1}` }), display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Mic size={12} />{listening ? 'Stop' : 'Speak'}
          </button>
        )}
        <button onClick={submit} disabled={!draft.trim() || submitting}
          style={{ ...btnSm(accentFill(accent), { color: C.onAccent }), display: 'inline-flex', alignItems: 'center', gap: 4, opacity: !draft.trim() || submitting ? 0.55 : 1 }}>
          {submitting ? <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={12} />}
          {submitting ? 'Updating plan…' : 'Add to My Plan'}
        </button>
      </div>
    </div>
  );
}

// ── This Week / rolling day-by-day view ──────────────────────────────────
// Rescheduling has two parallel input paths so it works for every input method:
// physical drag (mouse/trackpad — framer-motion `drag`, hit-tested against each
// day column's registered bounding rect on every drag frame) and the "Move"
// button's day-picker (keyboard/touch/screen-reader friendly, works regardless
// of which days are currently expanded). Both funnel into the same
// onMoveTask/onReorderTasks props, which is the only thing that actually
// mutates the plan.
function WeekView({ plan, upcoming, accent, isMobile, expandedDay, setExpandedDay, onToggleTask, jumpTo, extending, onReplan, onMoveTask, onReorderTasks, onSnoozeTask, reducedMotion = false }) {
  const today = todayStr();
  const tomorrow = addDaysStr(today, 1);
  const todayEntry = upcoming.find(d => d.date === today) || null;
  const restOfWeek = upcoming.filter(d => d.date !== today);

  const dayElRef = useRef(new Map());
  const taskElRef = useRef(new Map());
  const [drag, setDrag] = useState(null); // { taskId, fromDate }
  const [hoverDate, setHoverDate] = useState(null);
  const [moveFor, setMoveFor] = useState(null); // { taskId, fromDate, taskTitle }

  const registerDayEl = (date, el) => { if (el) dayElRef.current.set(date, el); else dayElRef.current.delete(date); };
  const registerTaskEl = (taskId, el) => { if (el) taskElRef.current.set(taskId, el); else taskElRef.current.delete(taskId); };

  function handleDragStart(taskId, fromDate) { setDrag({ taskId, fromDate }); }
  function handleDragMove(point) {
    let hit = null;
    for (const [date, el] of dayElRef.current) {
      const r = el.getBoundingClientRect();
      const top = r.top + window.scrollY, bottom = r.bottom + window.scrollY, left = r.left + window.scrollX, right = r.right + window.scrollX;
      if (point.x >= left && point.x <= right && point.y >= top && point.y <= bottom) { hit = date; break; }
    }
    setHoverDate(prev => (prev === hit ? prev : hit));
  }
  function handleDragEnd() {
    if (drag && hoverDate) {
      if (hoverDate === drag.fromDate) {
        const dayTasks = (plan.days.find(d => d.date === drag.fromDate)?.tasks) || [];
        const order = [...dayTasks]
          .sort((a, b) => {
            const ea = taskElRef.current.get(a.id), eb = taskElRef.current.get(b.id);
            if (!ea || !eb) return 0;
            return ea.getBoundingClientRect().top - eb.getBoundingClientRect().top;
          })
          .map(t => t.id);
        onReorderTasks(drag.fromDate, order);
      } else {
        onMoveTask(drag.taskId, drag.fromDate, hoverDate);
      }
    }
    setDrag(null); setHoverDate(null);
  }

  function openMoveMenu(taskId, fromDate, taskTitle) { setMoveFor({ taskId, fromDate, taskTitle }); }
  function pickMoveDate(toDate) {
    if (moveFor) onMoveTask(moveFor.taskId, moveFor.fromDate, toDate);
    setMoveFor(null);
  }

  const dragCtx = { drag, hoverDate, registerDayEl, registerTaskEl, onDragStart: handleDragStart, onDragMove: handleDragMove, onDragEnd: handleDragEnd, onSnooze: onSnoozeTask, onMoveClick: openMoveMenu };

  return (
    <div style={CC({ gap: 12 })}>
      <div style={G(3, 12, {}, isMobile)}>
        <PillarCard icon={Compass} title="Prep" text={plan.pillarStrategy?.prep} color={C.violet} />
        <PillarCard icon={GraduationCap} title="Portfolio" text={plan.pillarStrategy?.portfolio} color={C.green} />
        <PillarCard icon={TrendingUp} title="Progress" text={plan.pillarStrategy?.progress} color={C.cyan} />
      </div>

      {upcoming.length === 0 && !extending && (
        <div style={glass({ padding: 20, textAlign: 'center' })}>
          <div style={{ fontSize: 13, color: C.t2 }}>Your plan is between windows — it'll pick back up shortly.</div>
        </div>
      )}

      {extending && (
        <div style={{ ...glass2({ padding: '12px 16px' }), display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${C.pink}35`, background: `${C.pink}0d` }}>
          <RefreshCw size={14} color={C.pinkL} className="spin" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 12.5, color: C.t1 }}>Medabrain is rethinking today and tomorrow against everything you've done since — this takes a moment on purpose.</span>
        </div>
      )}

      {todayEntry && <TodayHero day={todayEntry} accent={accent} onToggleTask={onToggleTask} jumpTo={jumpTo} dragCtx={dragCtx} reducedMotion={reducedMotion} />}

      {/* Tomorrow is the other half of the window, so it is shown open by default rather than as a
          collapsed row in a long list of days. Two days is the whole plan — there is nothing to
          scroll past, and hiding half of it behind a chevron would be hiding half the plan. */}
      {restOfWeek.length > 0 && (
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', color: C.t3, margin: '4px 0 -4px' }}>Next — drag a task between days to reschedule it</div>
      )}
      {restOfWeek.map(day => (
        <DayCard
          key={day.date} day={day} isToday={false} accent={accent}
          expanded={expandedDay === null ? day.date === tomorrow : expandedDay === day.date}
          onToggleExpand={() => setExpandedDay(expandedDay === day.date ? '' : day.date)}
          onToggleTask={onToggleTask} jumpTo={jumpTo} dragCtx={dragCtx}
          reducedMotion={reducedMotion}
        />
      ))}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap', padding: '4px 0px' }}>
        <span style={{ fontSize: 11, color: C.t3, textAlign: 'center' }}>
          Your plan is just today and tomorrow, on purpose — and it rewrites itself every day around what you've actually done.
        </span>
        {onReplan && (
          <button onClick={onReplan} disabled={extending}
            style={{ ...btnSm(`${C.pink}18`, { color: C.pinkL, border: `1px solid ${C.pink}40`, fontSize: 11 }), display: 'inline-flex', alignItems: 'center', gap: 4, opacity: extending ? 0.55 : 1 }}>
            <RefreshCw size={11} />{extending ? 'Replanning…' : 'Replan these two days'}
          </button>
        )}
      </div>

      <MoveDayPicker moveFor={moveFor} upcoming={upcoming} accent={accent} onPick={pickMoveDate} onClose={() => setMoveFor(null)} />
    </div>
  );
}

// ── "Move" day picker — the accessible, always-available alternative to
// physical dragging. Chips for Today/Tomorrow plus every other visible day in
// the rolling window, so a keyboard or touch user can reschedule a task in one
// tap without needing to drag anything.
function MoveDayPicker({ moveFor, upcoming, accent, onPick, onClose }) {
  const today = todayStr();
  const tomorrow = addDaysStr(today, 1);
  return (
    <AnimatePresence>
      {moveFor && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(6px)' }}
          onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
          <motion.div initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.97 }}
            style={{ ...glass({ padding: 16, maxWidth: 380, width: '100%' }), border: `1px solid ${accent}35` }}>
            <div style={R({ justifyContent: 'space-between', marginBottom: 12 })}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', color: C.t3, marginBottom: 4 }}>Move task</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.t1 }}>{moveFor.taskTitle}</div>
              </div>
              <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', display: 'flex', color: C.t3 }} aria-label="Close"><X size={16} /></button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {upcoming.map(day => {
                const isFrom = day.date === moveFor.fromDate;
                const label = day.date === today ? 'Today' : day.date === tomorrow ? 'Tomorrow' : fmtDateLabel(day.date);
                return (
                  <button key={day.date} disabled={isFrom} onClick={() => onPick(day.date)}
                    style={{
                      ...pill(isFrom ? 'rgba(255,255,255,0.02)' : `${accent}16`, isFrom ? C.t4 : accent, { fontSize: 11.5, fontWeight: 700 }),
                      border: `1px solid ${isFrom ? C.b1 : `${accent}40`}`, cursor: isFrom ? 'default' : 'pointer', opacity: isFrom ? 0.5 : 1,
                    }}>
                    {label}
                  </button>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// A task card, made draggable via a dedicated grip handle (drag listener is off
// by default and started manually from the handle's pointerdown — the standard
// framer-motion "handle-only drag" pattern — so the rest of the row, including
// its own buttons, stays perfectly clickable). Registers itself into the parent
// WeekView's task-position map (used to compute a same-day drop order) and
// reports live pointer position while dragging so WeekView can hit-test it
// against every day column's bounding rect.
function DraggableTaskRow({ task, date, onToggle, onJump, dragCtx, isSpotlight, accent, reducedMotion }) {
  const controls = useDragControls();
  const isDragging = dragCtx.drag?.taskId === task.id;
  return (
    <motion.div
      layout="position"
      drag
      dragListener={false}
      dragControls={controls}
      dragMomentum={false}
      dragElastic={0.05}
      onDragStart={() => dragCtx.onDragStart(task.id, date)}
      onDrag={(_e, info) => dragCtx.onDragMove(info.point)}
      onDragEnd={dragCtx.onDragEnd}
      whileDrag={{ scale: 1.025, zIndex: 60, boxShadow: '0 16px 40px rgba(0,0,0,0.55)' }}
      animate={{ opacity: isDragging ? 0.9 : 1 }}
      style={{ position: 'relative', touchAction: 'none' }}
      ref={el => dragCtx.registerTaskEl(task.id, el)}
    >
      <TaskRow
        task={task} onToggle={onToggle} onJump={onJump}
        onSnooze={() => dragCtx.onSnooze(date, task.id)}
        onMoveClick={() => dragCtx.onMoveClick(task.id, date, task.title)}
        isSpotlight={isSpotlight} accent={accent} reducedMotion={reducedMotion}
        dragHandle={
          <span onPointerDown={e => controls.start(e)} style={{ cursor: 'grab', touchAction: 'none', display: 'flex', flexShrink: 0, marginTop: 4, color: C.t4 }} aria-hidden="true">
            <GripVertical size={14} />
          </span>
        }
      />
    </motion.div>
  );
}

// ── Today hero — pulled out of the rolling day list and given its own
// prominent, always-expanded treatment so "what do I do right now" never
// requires a click. A conic-gradient ring gives an at-a-glance sense of
// completion without pulling in a charting dependency.
function TodayHero({ day, accent, onToggleTask, jumpTo, dragCtx, reducedMotion }) {
  const total = day.tasks.length;
  const done = day.tasks.filter(t => t.done).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const totalMinutes = day.tasks.reduce((s, t) => s + (t.estMinutes || 0), 0);
  const isDropTarget = dragCtx?.drag && dragCtx.hoverDate === day.date && dragCtx.drag.fromDate !== day.date;
  // Medabrain's ONE pick for today, same rule TodayPlanNudge uses on Home: the first remaining
  // task that actually points somewhere real, falling back to the first remaining task of any
  // kind — so the plan's own full view highlights the same "first priority" thing Home does.
  const remainingTasks = day.tasks.filter(t => !t.done);
  const spotlightTask = remainingTasks.find(t => t.resourceKind && t.resourceKind !== 'view' && t.resourceLabel) || remainingTasks[0] || null;
  return (
    <div ref={el => dragCtx?.registerDayEl(day.date, el)} style={{
      ...glass({ padding: 0, overflow: 'hidden' }),
      border: isDropTarget ? `1.5px dashed ${accent}` : `1px solid ${accent}55`,
      background: isDropTarget ? `linear-gradient(135deg,${accent}22,transparent 60%)` : `linear-gradient(135deg,${accent}14,transparent 60%)`,
      transition: 'background .15s, border-color .15s',
    }}>
      <div style={{ padding: '16px 20px 4px', display: 'flex', gap: 16, alignItems: 'center' }}>
        <div style={{
          width: 54, height: 54, borderRadius: '50%', flexShrink: 0,
          background: `conic-gradient(${accent} ${pct * 3.6}deg, rgba(255,255,255,0.08) 0deg)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {/* data-fixed-height: this is the hole in the middle of the progress
              ring, and it has to stay a circle inscribed in the 54px conic
              gradient around it. The "3/5" inside is two glyphs that cannot
              wrap at any spacing setting, so there is nothing here for WCAG
              1.4.12 to clip. */}
          <div data-fixed-height style={{ width: 42, height: 42, borderRadius: '50%', background: C.s1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: C.t1, fontFamily: C.FM }}>
            {done}/{total}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={R({ gap: 4, flexWrap: 'wrap' })}>
            <span style={pill(`${accent}22`, accent, { fontSize: 9.5, fontWeight: 800 })}>TODAY</span>
            {totalMinutes > 0 && <span style={pill(`${C.pink}16`, C.pinkL, { fontSize: 9.5, fontWeight: 700 })}>{totalMinutes}m planned</span>}
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.t1, fontFamily: C.FD, marginTop: 4, letterSpacing: 'calc(-0.02em + var(--msp-letter-spacing))' }}>{day.headline || fmtDateLabel(day.date)}</div>
          <div style={{ fontSize: 11.5, color: C.t3, marginTop: 4 }}>{day.headline ? `${fmtDateLabel(day.date)} · ${day.theme}` : day.theme}</div>
        </div>
      </div>
      {/* Medabrain's read on the day as a whole — what matters most, and what to drop if the day
          gets away from them. A per-task "why" answers "why this"; this answers "why this shape". */}
      {day.coachNote && (
        <div style={{ margin: '4px 16px 0px', padding: '8px 12px', borderRadius: 12, background: `linear-gradient(135deg, ${C.pink}12, transparent 70%)`, border: `1px solid ${C.pink}28`, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <Sparkles size={13} color={C.pinkL} style={{ flexShrink: 0, marginTop: 4 }} />
          <p style={{ fontSize: 12, color: C.t1, lineHeight: 1.6, margin: 0 }}>{day.coachNote}</p>
        </div>
      )}
      <div style={{ padding: '8px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {day.tasks.map(t => {
          const isSpotlight = !!spotlightTask && t.id === spotlightTask.id;
          return dragCtx
            ? <DraggableTaskRow key={t.id} task={t} date={day.date} onToggle={() => onToggleTask(day.date, t.id)} onJump={() => jumpTo(t)} dragCtx={dragCtx} isSpotlight={isSpotlight} accent={accent} reducedMotion={reducedMotion} />
            : <TaskRow key={t.id} task={t} onToggle={() => onToggleTask(day.date, t.id)} onJump={() => jumpTo(t)} isSpotlight={isSpotlight} accent={accent} reducedMotion={reducedMotion} />;
        })}
        {day.reflectionPrompt && (
          <div style={{ fontSize: 11.5, color: C.t2, fontStyle: 'italic', padding: '8px 12px', borderLeft: `2px solid ${C.amber}50`, marginTop: 4 }}>
            {day.reflectionPrompt}
          </div>
        )}
      </div>
    </div>
  );
}

function PillarCard({ icon: Icon, title, text, color }) {
  if (!text) return null;
  return (
    <div style={{ ...glass2({ padding: 12 }), borderLeft: `2px solid ${color}` }}>
      <div style={R({ gap: 8, marginBottom: 4 })}>
        <Icon size={13} color={color} />
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', color }}>{title}</span>
      </div>
      <div style={{ fontSize: 11.5, color: C.t2, lineHeight: 1.55 }}>{text}</div>
    </div>
  );
}

function DayCard({ day, isToday, accent, expanded, onToggleExpand, onToggleTask, jumpTo, dragCtx, reducedMotion = false }) {
  const doneCount = day.tasks.filter(t => t.done).length;
  const total = day.tasks.length;
  const totalMinutes = day.tasks.reduce((s, t) => s + (t.estMinutes || 0), 0);
  const isTomorrow = day.date === addDaysStr(todayStr(), 1);
  // Registered as a drop target even while collapsed — dropping a dragged task
  // onto a collapsed day's header still works, it just doesn't require
  // expanding the day first.
  const isDropTarget = dragCtx?.drag && dragCtx.hoverDate === day.date && dragCtx.drag.fromDate !== day.date;
  return (
    <div ref={el => dragCtx?.registerDayEl(day.date, el)} style={{
      ...glass({ padding: 0, overflow: 'hidden' }),
      border: isDropTarget ? `1.5px dashed ${accent}` : isToday ? `1px solid ${accent}55` : `1px solid ${C.b1}`,
      background: isDropTarget ? `linear-gradient(135deg,${accent}20,transparent 60%)` : isToday ? `linear-gradient(135deg,${accent}10,transparent 60%)` : undefined,
      transition: 'background .15s, border-color .15s',
    }}>
      <button onClick={onToggleExpand} style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%', boxSizing: 'border-box', padding: '12px 16px' }}>
        <div style={R({ justifyContent: 'space-between', gap: 8 })}>
          <div style={R({ gap: 8 })}>
            {isToday && <span style={pill(`${accent}22`, accent, { fontSize: 9.5, fontWeight: 800 })}>TODAY</span>}
            {isTomorrow && <span style={pill(`${C.pink}1e`, C.pinkL, { fontSize: 9.5, fontWeight: 800 })}>TOMORROW</span>}
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: C.t1, fontFamily: C.FD }}>{day.headline || fmtDateLabel(day.date)}</div>
              <div style={{ fontSize: 11, color: C.t3, marginTop: 4 }}>{day.headline ? `${fmtDateLabel(day.date)} · ${day.theme}` : day.theme}</div>
            </div>
          </div>
          <div style={R({ gap: 8 })}>
            {isDropTarget && <span style={{ fontSize: 10.5, color: accent, fontWeight: 700 }}>Drop here</span>}
            {totalMinutes > 0 && <span style={{ fontSize: 10.5, color: C.t3, fontFamily: C.FM }}>{totalMinutes}m</span>}
            <span style={{ fontSize: 10.5, color: C.t3, fontFamily: C.FM }}>{doneCount}/{total}</span>
            <motion.div animate={{ rotate: expanded ? 180 : 0 }} style={{ display: 'flex', color: C.t3 }}><ChevronDown size={16} /></motion.div>
          </div>
        </div>
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} style={{ overflow: 'hidden' }}>
            <div style={{ padding: '0px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {day.coachNote && (
                <div style={{ padding: '8px 12px', borderRadius: 12, background: `linear-gradient(135deg, ${C.pink}10, transparent 70%)`, border: `1px solid ${C.pink}25`, display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 4 }}>
                  <Sparkles size={13} color={C.pinkL} style={{ flexShrink: 0, marginTop: 4 }} />
                  <p style={{ fontSize: 11.5, color: C.t1, lineHeight: 1.6, margin: 0 }}>{day.coachNote}</p>
                </div>
              )}
              {day.tasks.map(t => (
                dragCtx
                  ? <DraggableTaskRow key={t.id} task={t} date={day.date} onToggle={() => onToggleTask(day.date, t.id)} onJump={() => jumpTo(t)} dragCtx={dragCtx} reducedMotion={reducedMotion} />
                  : <TaskRow key={t.id} task={t} onToggle={() => onToggleTask(day.date, t.id)} onJump={() => jumpTo(t)} reducedMotion={reducedMotion} />
              ))}
              {day.reflectionPrompt && (
                <div style={{ fontSize: 11.5, color: C.t2, fontStyle: 'italic', padding: '8px 12px', borderLeft: `2px solid ${C.amber}50`, marginTop: 4 }}>
                  {day.reflectionPrompt}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TaskRow({ task, onToggle, onJump, onSnooze, onMoveClick, dragHandle, isSpotlight, accent, reducedMotion }) {
  const meta = PILLAR_META[task.pillar] || PILLAR_META.prep;
  const Icon = TYPE_ICON[task.type] || BookOpen;
  const canJump = task.resourceTab && task.resourceView;
  const canReschedule = !task.done && (onSnooze || onMoveClick);
  // Accountability: quiz/lesson/deck tasks can only ever be checked off by actually doing them —
  // App.jsx's applyPlanAutoComplete flips `done` (and `autoVerified`) the moment the real quiz is
  // submitted, lesson verified, or deck session finished. No checkbox is rendered for these at
  // all, so there's no self-report path to game — see AUTO_VERIFIABLE_KINDS in
  // masterPlanGenerator.js. Everything else (activities, essays, deadlines, reflection, rest…)
  // has no in-app "this really happened" signal, so it stays an honest, manually-toggled checkbox.
  const autoVerify = AUTO_VERIFIABLE_KINDS.has(task.resourceKind) || AUTO_VERIFIABLE_TYPES.has(task.type);
  // Label the link with the EXACT resource it opens ("Open: Linear Equations
  // Practice") so the student knows the click lands on the real thing, not a
  // generic tab. Specific resources (quiz/lesson/deck/article) read "Open:",
  // bare views read "Go to".
  const specific = task.resourceKind && task.resourceKind !== 'view' && task.resourceLabel;
  const linkLabel = specific
    ? `Open: ${task.resourceLabel.length > 34 ? task.resourceLabel.slice(0, 32) + '…' : task.resourceLabel}`
    : (task.resourceLabel ? `Go to ${task.resourceLabel}` : 'Open');
  // The single highest-priority incomplete task for the day gets the same "Medabrain's pick"
  // glow treatment TodayPlanNudge uses on Home — so the one thing most worth doing reads as
  // visually first everywhere the plan is shown, not just in the compact Home card. Just one
  // task at a time (see spotlightTask in TodayHero), and the pulse respects reduced-motion.
  const ringColor = accent || meta.color;
  const spotlightRing = `0 0 0 2px ${ringColor}55, 0 0 14px ${ringColor}40`;
  return (
    <motion.div
      animate={isSpotlight && !reducedMotion ? { boxShadow: [spotlightRing, `0 0 0 3px ${ringColor}70, 0 0 22px ${ringColor}66`, spotlightRing] } : undefined}
      transition={isSpotlight && !reducedMotion ? { boxShadow: { duration: 2.2, repeat: Infinity, ease: 'easeInOut' } } : undefined}
      style={{
        ...glass2({ padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'flex-start' }),
        opacity: task.done ? 0.55 : 1,
        borderLeft: isSpotlight ? `2px solid ${ringColor}` : `2px solid ${meta.color}45`,
        boxShadow: isSpotlight && reducedMotion ? spotlightRing : undefined,
      }}>
      {dragHandle}
      {autoVerify ? (
        <span title={task.done ? 'Verified automatically — you actually did this' : 'Checks off automatically when you complete it — no self-report'}
          style={{ marginTop: 4, flexShrink: 0, display: 'flex', cursor: 'default' }} aria-label={task.done ? 'Verified' : 'Verifies automatically'}>
          {task.done ? <ShieldCheck size={17} color={C.green} /> : <ShieldCheck size={17} color={C.t4} style={{ opacity: 0.5 }} />}
        </span>
      ) : (
        <button onClick={onToggle} style={{ all: 'unset', cursor: 'pointer', marginTop: 4, flexShrink: 0 }} aria-label="Toggle task done">
          {task.done ? <CheckCircle2 size={17} color={C.green} /> : <Circle size={17} color={C.t3} />}
        </button>
      )}
      <div style={{ width: 22, height: 22, borderRadius: 4, background: `${meta.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 4 }}>
        <Icon size={11} color={meta.color} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: C.t1, textDecoration: task.done ? 'line-through' : 'none' }}>{task.title}</div>
        {task.detail && <div style={{ fontSize: 11, color: C.t3, marginTop: 4, lineHeight: 1.5 }}>{task.detail}</div>}
        {/* The "why" is what separates a plan from a checklist — one sentence naming the real
            reason this task is on THIS student's day. Only rendered when generation produced one;
            plans made before this field existed simply show the detail line as they always did. */}
        {task.why && !task.done && (
          <div style={{ fontSize: 11, color: C.pinkL, marginTop: 4, lineHeight: 1.5, paddingLeft: 8, borderLeft: `2px solid ${C.pink}45` }}>{task.why}</div>
        )}
        {task.successCriteria && !task.done && (
          <div style={{ fontSize: 10.5, color: C.t3, marginTop: 4, lineHeight: 1.45 }}>
            <span style={{ fontWeight: 700, color: C.t2 }}>Done well: </span>{task.successCriteria}
          </div>
        )}
        <div style={R({ gap: 8, marginTop: 4, flexWrap: 'wrap' })}>
          {task.timeOfDay && task.timeOfDay !== 'anytime' && (
            <span style={pill(`${C.pink}14`, C.pinkL, { fontSize: 9, fontWeight: 700, textTransform: 'capitalize' })}>{task.timeOfDay}</span>
          )}
          {task.retargetedFrom && (
            <span title={`Originally "${task.retargetedFrom}" — swapped because that lesson isn't available to you right now.`}
              style={{ ...pill(`${C.cyan}18`, C.cyanL || C.cyan, { fontSize: 9 }), display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <RefreshCw size={9} />Auto-adjusted
            </span>
          )}
          <span style={pill(`${meta.color}15`, meta.color, { fontSize: 9 })}>{meta.label}</span>
          {isSpotlight && (
            <span style={{ ...pill(`${ringColor}20`, ringColor, { fontSize: 9, fontWeight: 800 }), display: 'inline-flex', alignItems: 'center', gap: 4, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))' }}>
              <Sparkles size={9} />Medabrain's pick
            </span>
          )}
          {task.rolledOverFrom && (
            <span style={{ ...pill(`${C.amber}18`, C.amberL, { fontSize: 9 }), display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Undo2 size={9} />Carried over
            </span>
          )}
          {autoVerify && (task.done
            ? <span style={pill(C.greenDim || `${C.green}18`, C.green, { fontSize: 9 })}><ShieldCheck size={9} style={{ marginRight: 4, verticalAlign: -1 }} />Verified</span>
            : <span style={pill('rgba(255,255,255,0.04)', C.t4, { fontSize: 9 })}>Auto-verifies</span>)}
          {task.estMinutes > 0 && <span style={R({ gap: 4 })}><Clock size={10} color={C.t3} /><span style={{ fontSize: 10, color: C.t3 }}>{task.estMinutes}m</span></span>}
          {canReschedule && onSnooze && (
            <button onClick={onSnooze} title="Snooze to tomorrow" aria-label="Snooze this task to tomorrow"
              style={{ all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 999, border: `1px solid ${C.b1}`, color: C.t3, fontSize: 10 }}>
              <Sunrise size={10} />Snooze
            </button>
          )}
          {canReschedule && onMoveClick && (
            <button onClick={onMoveClick} title="Move to another day" aria-label="Move this task to another day"
              style={{ all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 999, border: `1px solid ${C.b1}`, color: C.t3, fontSize: 10 }}>
              <CalendarPlus size={10} />Move
            </button>
          )}
          {canJump && (
            <motion.button whileHover={{ scale: 1.03, y: -1 }} whileTap={{ scale: 0.97 }} onClick={onJump} aria-label="Open this task's resource"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 12px', borderRadius: 999,
                border: `1px solid ${meta.color}45`, background: `${meta.color}16`, color: meta.color,
                fontSize: 10.5, fontWeight: 700, fontFamily: C.FB, cursor: 'pointer', maxWidth: '100%',
                boxShadow: `0 2px 8px ${meta.color}22`,
              }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{linkLabel}</span>
              <ArrowRight size={11} style={{ flexShrink: 0 }} />
            </motion.button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Full Roadmap view ──────────────────────────────────────────────────────
function RoadmapView({ plan, accent, isMobile, expandedPhase, setExpandedPhase }) {
  return (
    <div style={CC({ gap: 16 })}>
      <div style={glass({ padding: 16 })}>
        <SectionLabel icon={MapIcon} title="Phases" color={C.violet} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {plan.phases.map((ph, i) => (
            <PhaseCard key={ph.id} phase={ph} index={i} plan={plan} accent={accent}
              expanded={expandedPhase === ph.id} onToggle={() => setExpandedPhase(expandedPhase === ph.id ? null : ph.id)} />
          ))}
        </div>
      </div>

      <div style={glass({ padding: 16 })}>
        <SectionLabel icon={Flag} title="Milestones" color={C.blue} />
        <div style={{ marginTop: 12 }}>
          {plan.milestones.map((m, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: C.blue, boxShadow: `0 0 8px ${C.blue}` }} />
                {i < plan.milestones.length - 1 && <span style={{ width: 2, flex: 1, background: `${C.blue}30`, marginTop: 4 }} />}
              </div>
              <div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: C.t1 }}>{m.title}</span>
                  <span style={pill(`${C.blue}18`, C.blueL, { fontSize: 9.5 })}>Week {m.weekTarget}</span>
                </div>
                {m.detail && <div style={{ fontSize: 11, color: C.t3, lineHeight: 1.5, marginTop: 4 }}>{m.detail}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {plan.riskMitigation?.length > 0 && (
        <div style={glass({ padding: 16 })}>
          <SectionLabel icon={ShieldAlert} title="Watching out for" color={C.rose} />
          <div style={G(2, 10, { marginTop: 8 }, isMobile)}>
            {plan.riskMitigation.map((r, i) => (
              <div key={i} style={{ ...glass2({ padding: 12 }), borderLeft: `2px solid ${C.rose}` }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.t1, marginBottom: 4 }}>{r.obstacle}</div>
                <div style={{ fontSize: 11.5, color: C.t3, lineHeight: 1.5 }}>{r.strategy}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {plan.ninetyDayGoal && (
        <div style={{ padding: '12px 16px', borderRadius: 12, background: `linear-gradient(135deg,${C.amber}14,transparent)`, border: `1px solid ${C.amber}30`, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <TrendingUp size={15} color={C.amberL} style={{ flexShrink: 0, marginTop: 4 }} />
          <div>
            <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', color: C.amberL, marginBottom: 4 }}>Where you could be in 90 days</div>
            <p style={{ fontSize: 12.5, color: C.t1, lineHeight: 1.6, margin: 0 }}>{plan.ninetyDayGoal}</p>
          </div>
        </div>
      )}
      {plan.encouragement && (
        <p style={{ fontSize: 12.5, color: C.t2, lineHeight: 1.65, margin: 0, fontStyle: 'italic', paddingLeft: 12, borderLeft: `2px solid ${C.green}40` }}>{plan.encouragement}</p>
      )}
    </div>
  );
}

function SectionLabel({ icon: Icon, title, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Icon size={13} color={color} />
      <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', color: C.t3 }}>{title}</span>
    </div>
  );
}

function PhaseCard({ phase, index, plan, accent, expanded, onToggle }) {
  const weeks = plan.weeklyThemes.filter(w => w.week >= phase.weekStart && w.week <= phase.weekEnd);
  return (
    <div style={glass2({ padding: 0, overflow: 'hidden' })}>
      <button onClick={onToggle} style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%', boxSizing: 'border-box', padding: 12 }}>
        <div style={R({ justifyContent: 'space-between', gap: 8 })}>
          <div style={R({ gap: 8 })}>
            <span style={{ width: 24, height: 24, borderRadius: 8, background: `${accent}22`, color: accent, fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{index + 1}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.t1 }}>{phase.title}</div>
              <div style={{ fontSize: 11, color: C.t3, marginTop: 4 }}>Weeks {phase.weekStart}–{phase.weekEnd} · {phase.theme}</div>
            </div>
          </div>
          <motion.div animate={{ rotate: expanded ? 180 : 0 }} style={{ color: C.t3, flexShrink: 0 }}><ChevronDown size={15} /></motion.div>
        </div>
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} style={{ overflow: 'hidden' }}>
            <div style={{ padding: '0px 12px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', color: C.t3, marginBottom: 4 }}>Objectives</div>
                {phase.objectives.map((o, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 4 }}>
                    <CheckCircle2 size={12} color={accent} style={{ flexShrink: 0, marginTop: 4 }} />
                    <span style={{ fontSize: 12, color: C.t2, lineHeight: 1.5 }}>{o}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {phase.resources.map((r, i) => <span key={i} style={pill(`${accent}15`, accent, { fontSize: 10 })}>{r}</span>)}
              </div>
              <div style={{ fontSize: 11.5, color: C.t3, fontStyle: 'italic' }}>Success looks like: {phase.successMetric}</div>
              {weeks.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', color: C.t3, marginBottom: 4 }}>Week-by-week in this phase</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {weeks.map(w => (
                      <div key={w.week} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 11.5 }}>
                        <span style={{ color: C.t3, fontFamily: C.FM, fontSize: 10, flexShrink: 0, width: 44 }}>Wk {w.week}</span>
                        <span style={{ color: C.t2 }}>{w.theme}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
