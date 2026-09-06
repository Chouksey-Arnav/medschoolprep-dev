import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { setActiveTab } from './lib/sat/activeTabStore';
import { generateAIFlashcards } from './lib/aiFlashcards';
import { polishFlashcardsWithAI } from './lib/flashcards/aiPolish';
import { AnimatePresence, motion } from 'framer-motion';
import toast, { Toaster } from 'react-hot-toast';
import {
  Chart as ChartJS, RadialLinearScale, PointElement, LineElement,
  Filler, Tooltip, Legend, CategoryScale, LinearScale, BarElement, ArcElement
} from 'chart.js';
import { Radar, Line, Doughnut } from 'react-chartjs-2';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import {
  Home, Compass, Route, Layers, MessageCircle, Layers3, BookOpen, Library,
  Trophy, Building2, LineChart, Settings, Flame, Zap, CheckCircle2, TrendingUp,
  Lock, Check, X, AlertTriangle, FileDown, Sparkles, Coffee, Target, PartyPopper,
  Search, Package, Handshake, FlaskConical, CalendarDays, Award, ChevronRight, ChevronLeft,
  RefreshCw, Star, Gem, Dumbbell, Milestone, Dna, Calculator, Circle, Clock, ArrowUp, ArrowRight,
  Bookmark,
  ListFilter, Timer, Trash2, GraduationCap, ScrollText, Play, ExternalLink, Plus,
  Mic, Hammer, Sun, ShieldCheck, Crown, Lightbulb, Brain, Wand2, Snowflake,
  Stethoscope, HeartPulse, ClipboardList, Pill, Smile, Microscope, Globe, Landmark, UserCheck,
  Copy, RotateCcw, BadgeCheck, Pencil, Menu, Volume2, UserCog, Cloud, CloudOff, CalendarClock, CalendarRange,
  Highlighter, Accessibility, Gauge, Info, Download, Headphones, Users,
  Shuffle, Flag, Swords, Gift, ListChecks, Loader2,
  // Aliased: `Radar` is already taken in this file by react-chartjs-2's chart component.
  Radar as RadarIcon,
  // Aliased for the same reason: `Map` is a JavaScript global this file uses.
  Map as MapIcon,
  // Medabrain's named modes (src/lib/medabrainModes.js) and the equity shelf.
  HelpCircle, PenLine, KeyRound,
} from 'lucide-react';

const ACH_ICONS = { Target, Star, Trophy, Sparkles, Gem, Flame, Dumbbell, Layers3, BookOpen, Milestone, MessageCircle, Building2, CalendarDays, ScrollText, Award, Mic, GraduationCap, Stethoscope, UserCheck, ShieldCheck, Layers, Crown, Compass };
const TIER_ICONS = { Sparkles, Hammer, Compass, Trophy, Sun, ShieldCheck, Crown };

import { ALL_QUIZZES } from './data/quizzes/index';
import { ELIB } from './data/elib';
import useWindowedList from './lib/useWindowedList';
import { PATHS, FLASH_DECKS, SCHOOL_DATA, DIAG_QS, PATH_COACH_NOTES, US_STATES, COURSE_CAT_MAP, GRADE_STAGES, CLASS_YEAR_ROADMAP, DECK_CATEGORY_ORDER, getDeckCategory, UNIT_STAGES, isUnitTimelyFor } from './data/constants';
import BandPreview, { BandPreviewTag, BandPreviewBanner } from './components/BandPreview';
// The year rail itself is small and renders on every visit to the Pathways tab,
// so it stays in the entry graph. Its logic module is pure data and functions.
import FourYearMap from './components/prep/FourYearMap';
import { buildFourYearMap } from './lib/fourYearMap';
// ── The two foundations tools are lazy, for the Narrative Engine's reason ────
// Each is one tool under one unit, opened deliberately, and each drags real
// weight behind it: the planner pulls the whole course catalog and gap-rule
// engine, and the explorer pulls the credential database plus the fifty-state
// list. Statically imported, both land in the FIRST-LOAD bundle that
// scripts/verifyPayload.mjs guards — paid by every student on every boot,
// including the ones who never scroll to the foundations tier. Behind
// React.lazy, Rollup gives them their own chunks, fetched the first time
// somebody actually opens the unit. Same trap as the note above: adding either
// to a manualChunk would pin it back into the entry graph and cancel the split.
const CoursePlannerPanel = React.lazy(() => import('./components/prep/CoursePlannerPanel'));
const CertificationExplorer = React.lazy(() => import('./components/prep/CertificationExplorer'));
import { typicalAgeForGrade } from './lib/credentials';
import { LESSON_CONTENT } from './data/lessonContent';
import { rankQuizzes, getMedabrainPickPrompt, medabrainPicksProgress, MEDABRAIN_PICKS_UNLOCK_AT } from './lib/recommend';
import { scorePathways, explainMatch } from './lib/diagnosticEngine';
import QuizRecommendationsPanel from './components/QuizRecommendationsPanel';
import AnimatedLogo from './components/AnimatedLogo';
import { BrandLoader, BrandLoaderScreen, BrandShowcase, useBrandShowcase, useFirstPassGate } from './components/BrandJourney';
import ThemeToggle from './components/ThemeToggle';
import { getLevelInfo, getWeeklyQuests, getIsoWeekKey, getStartOfWeek, getClaimedQuests, claimQuest, bumpWeeklyCoachCount, getWeeklyCoachCount, dueDecksBadge, dueDecksSub } from './lib/gamification';
import InterviewPrepPanel from './components/InterviewPrepPanel';

import * as DB from './lib/db';
import * as ProgressSync from './lib/progressSync';
import * as PlanStore from './lib/masterPlanStore';
import { loadViewState, saveViewState, clearViewState } from './lib/viewState';
import { SUBVIEWS, bootRoute, routeFromState, resolveView, formatPath, LEGAL_VIEWS, AUTH_VIEWS, PARENT_HUB_PATH } from './lib/routes';
// What every screen is CALLED by the person looking for it, plus the scorer the
// quick-jump palette ranks with — see the header of src/lib/navMap.js for the
// searches that returned nothing before it existed.
import { keywordsFor, searchNav, readRecents, pushRecent } from './lib/navMap';
// …and the CONTENT it holds. navMap answers "what else might somebody call this
// screen"; contentSearch answers "where is the actual thing I am looking for" —
// the named scholarship, the summer program, the BS/MD at Drexel. See the header
// of src/lib/contentSearch.js for why that is a different problem and why it is
// the bigger half of navigating this app.
import { loadContentIndex, searchContent } from './lib/contentSearch';
import { LEGAL, TRADEMARK_NOTICE } from './legal/legalConfig';
import useAppRouter, { isPlainLeftClick } from './lib/useAppRouter';
import * as AuthAPI from './lib/authApi';
import { listItems, createItem, migrateLocalPortfolioLogs } from './lib/dataApi';
import { trackItem, installTrackQueueLifecycle } from './lib/trackQueue';
import { claimReward as claimRewardXP, installRewardClaimQueueLifecycle } from './lib/rewardClaimQueue';
import { usePendingTrackKeys } from './lib/useTrackQueue';
import { trackedKeySet, isCatalogSourced } from './lib/trackingCatalog';
import { scheduleCard, getDueCards, sortForStudy, nextReviewLabel, getRetainability, STATE_LABELS } from './lib/fsrs';
import { buildQuizSearch, buildLibrarySearch, buildDeckSearch, searchDecks, fuseSearch } from './lib/search';
import { play, setSFX, isSFXEnabled } from './lib/sounds';
import { celebrateXP, celebrateLevelUp, celebratePerfect, celebrateAchievement, celebrateMastery, celebrateStreak, celebrateBonusXP, celebrateJackpot, setConfettiEnabled, isConfettiEnabled } from './lib/celebrate';
import { awardXP, BONUS_COPY } from './lib/rewards';
import { getCached, setCached, dailyKey } from './lib/aiCache';
import { logEvent } from './lib/eventLog';
import { summarizeRecentActivity } from './lib/recentActivity';
import { pickNudge } from './lib/nudges';
import {
  loadCheckinState, claimCheckin, getCheckinReward, CYCLE_LENGTH, rewardSummary,
} from './lib/dailyCheckin';
import { localDateStr } from './lib/dateUtils';
import {
  PERFECT_WEEK_REWARD, PERFECT_MONTH_REWARD, DEFAULT_GOAL_ID, creditsFor, goalCreditsFor, getGoal,
  streakTargetFor, targetProgress, dayStatus, weekProgress, monthProgress, longestStreak,
  nextMilestone, unclaimedMilestones, rewardKey, perfectWeekKey, perfectMonthKey,
  // ── The expansion layer ──
  // Leagues give the streak an identity and a real, compounding benefit; boosts are the
  // short timed multipliers the check-in calendar hands out; repair is what the app says
  // the morning after a long streak actually breaks. See src/lib/streak.js for why each
  // exists and what it deliberately does NOT do.
  leagueProgress, streakBonusLabel, xpMultiplier, activeBoosts, BOOST_KINDS,
  freezeCost, canBuyFreeze, repairOffer, repairCost, freezeCapFor,
} from './lib/streak';
import { academicFallYear, buildTimeline, summarizeTimelineForPrompt } from './lib/timeline';
// ── Grade band ──────────────────────────────────────────────────────────────
// Graduation year is now a core user attribute, and grade band (explore /
// build / apply) is what the app sequences itself around. The rule everything
// below obeys: BAND CHANGES EMPHASIS AND NEVER ACCESS — every feature stays
// visible and clickable to every student, out-of-band surfaces render in
// preview state (BandPreview) and are simply left out of the active task list.
// See src/lib/gradeBand.js.
import { GradeBandProvider } from './lib/useGradeBand';
import { bandFor, bandOfGrade, confirmationStamp, needsGradYearConfirmation, gradeStageFor, graduationYearFor_user, graduationYearChoices, graduationYearLabel, bandsFromGrades, BAND_BY_ID, BAND_IDS, DESTINATION_BANDS } from './lib/gradeBand';
import { landingFor, flowForBand, shouldShowReturnScreen, PATHWAY_SKIP_LABEL, DIAGNOSTIC_REOFFER, shouldReofferDiagnostic } from './lib/onboardingFlow';
import GradYearCheckIn from './components/GradYearCheckIn';
import ReturningBreakScreen from './components/ReturningBreakScreen';
import { summarizeRoadmapForPrompt } from './lib/roadmap/model';
import { setAiLane, aiLane } from './lib/aiLane';
// The Common App mirror, split out of the first-load bundle for the same reason the foundations
// tools and the narrative engine are (see the React.lazy notes above). It pulls the whole
// section model, the derivation layer and the sync ledger, and it lives behind a gated sub-tab a
// student only reaches once they have logged an activity or a college — so statically importing
// it charged every boot for a screen most students have not unlocked yet. The badge strip that
// appears on the other Portfolio pages stays a normal import: it is small, and it renders on
// pages a student does reach on day one.
const CommonAppMirror = React.lazy(() => import('./components/portfolio/CommonAppMirror'));
import CommonAppMirrorBadge from './components/portfolio/CommonAppMirrorBadge';
import { useCommonApp } from './lib/commonApp/useCommonApp';
import { visibleModules as homeModules, focusNote as homeFocusNote, DENSITIES as HOME_DENSITIES } from './lib/dashboardStages';
import { rollCosmetic } from './lib/cosmetics';
import { renderMarkdown } from './lib/renderMarkdown';
import { exportQuizResult, exportFlashDeck, exportPathwayCertificate } from './lib/exportPDF';
import { ACHIEVEMENTS, checkAchievements, PATHWAY_KEYS } from './lib/achievements';
import CollegeListPanel from './components/CollegeListPanel';
import AdmissionCalculatorPanel from './components/portfolio/admissions/AdmissionCalculatorPanel';
// ── The Narrative Method Engine is lazy, and has to be ──────────────────────
// The panel pulls the whole engine behind it: thirteen modules plus the cliché
// bank, the overused-project corpus, the tier catalog and the grade timelines.
// Statically imported that is ~82 KB gzipped added to the FIRST-LOAD bundle —
// the number scripts/verifyPayload.mjs guards because it decides whether a
// student on a mid-range Android ever sees the app at all.
//
// Nobody pays that on boot. This is one section of one page of the Portfolio,
// opened deliberately, so Rollup follows the import() and gives it its own
// chunk fetched the first time somebody actually opens the reading. Same
// reasoning as the jspdf note in vite.config.js — and the same trap: adding
// this module to a manualChunk would pin it back into the entry graph and
// silently cancel the split.
const NarrativeEnginePanel = React.lazy(() => import('./components/portfolio/ivy/NarrativeEnginePanel'));
// The cache reset runs on sign-out, when the panel may never have been opened,
// so it is imported eagerly. store.js is a few hundred bytes and carries none
// of the corpora — the weight is all behind the lazy boundary above.
import { resetNarrativeCache } from './lib/ivy/store.js';
// loadIntake/saveIntake/flushIntake are here for the course planner, which
// writes the rigor counts it derives straight into the calculator's intake
// rather than asking the same question a second time in different words.
import { resetIntakeCache, derivePortfolioSignals, deriveApplicantFromPortfolio, buildApplicant, assessCompleteness, unpackIntake, loadIntake, saveIntake, flushIntake } from './lib/admissions';
import { computeMedEx, loadSeals, sealIfNeeded, planSeal, readMirror, resetMedexCache } from './lib/medex';
import MedExHomeCard from './components/medex/MedExHomeCard';
import MedExPanel from './components/medex/MedExPanel';
import MedExChip from './components/medex/MedExChip';
import EssayWorkspacePanel from './components/EssayWorkspacePanel';
import FinancialAidPanel from './components/FinancialAidPanel';
import FinancialAidHomeCard from './components/FinancialAidHomeCard';
import StreakHeatmap from './components/StreakHeatmap';
import StreakPanel from './components/streak/StreakPanel';
import PathwayStreakStrip from './components/streak/PathwayStreakStrip';
import LessonCompleteOverlay from './components/streak/LessonCompleteOverlay';
import BoostChip from './components/streak/BoostChip';
// ── Quests ──────────────────────────────────────────────────────────────────
// The long-horizon commitment layer (src/data/questCatalog.js + src/lib/quests.js). Deliberately
// threaded through five surfaces rather than parked in one tab: a quest that is only visible on
// the screen you go to when you remember quests exist is a quest that gets forgotten in week two.
import QuestBoard from './components/quests/QuestBoard';
import QuestStrip from './components/quests/QuestStrip';
import QuestCompleteOverlay from './components/quests/QuestCompleteOverlay';
import DailyQuestRail from './components/quests/DailyQuestRail';
import * as QuestAPI from './lib/questApi';
import {
  buildQuestEvents, evaluateAll as evaluateQuests,
  summarize as summarizeQuests, TERMINAL_STATUSES as QUEST_TERMINAL,
  recommendQuests, claimedIds as claimedQuestIds, nextInChain,
} from './lib/quests';
// ── Daily quests ────────────────────────────────────────────────────────────
// The other half of the quest system: three small jobs drawn fresh every morning, gone by
// midnight, deterministic per student per day so they cannot be rerolled and do not need
// syncing. See src/lib/dailyQuests.js. `dailyKey` is deliberately NOT imported — the name is
// already taken by lib/aiCache's cache-key helper, and every surface here reads `row.key`.
import {
  evaluateDay as evaluateDailyQuests, capabilities as dailyCapabilities,
  tomorrowSet as tomorrowDailySet, streakOverlap as dailyStreakOverlap,
  DAILY_SET_BONUS,
} from './lib/dailyQuests';
import ActivitiesResumePanel, { RESUME_SECTIONS } from './components/ActivitiesResumePanel';
import ApplyingPanel, { APPLYING_SECTIONS } from './components/portfolio/ApplyingPanel';
import CombinedDegreePanel from './components/portfolio/CombinedDegreePanel';
import SectionScroller from './components/portfolio/SectionScroller';
import RewardChest from './components/RewardChest';
import RecommendersPanel from './components/RecommendersPanel';
// Milestones is the merge of the old Deadlines and Timeline tabs — one dated surface that both
// generates the admissions calendar and edits the student's own dates. See PortfolioMilestones.jsx.
import PortfolioMilestones, { useDeadlines } from './components/PortfolioMilestones';
import PortfolioMedabrain from './components/PortfolioMedabrain';
import PrepMedabrain from './components/PrepMedabrain';
import HighlightableArticle from './components/HighlightableArticle';
import LessonAudioPlayer from './components/LessonAudioPlayer';
import { buildArticleSegments } from './lib/lessonAudio';
import {
  buildVerificationQuiz, describeVerificationQuiz, getAttemptCount, recordAttempt, clearAttempts,
  VERIFY_PASS_PCT,
} from './lib/quizPersonalization';
import LessonNotesPanel from './components/LessonNotesPanel';
import PaceGoalCard from './components/PaceGoalCard';
import LessonDifficultyCheck from './components/LessonDifficultyCheck';
import { computePaceStatus, describePace, paceHeadline, paceTone, formatPaceDate } from './lib/paceGoal';
import { seededShuffle, newShuffleSeed } from './lib/shuffle';
import { summarizeLessonFeedback, FEEDBACK_LABELS } from './lib/lessonFeedback';
import { logLessonFeedback } from './lib/lessonFeedbackApi';
import OpportunitiesPanel from './components/portfolio/OpportunitiesPanel';
import { buildMatchProfile, matchOpportunities, readPrefs, THEME_BY_ID, ACTIVE_STAGES } from './lib/opportunityMatch';
import { OPPORTUNITIES } from './data/opportunities';
import { PROGRAMS } from './data/opportunityPrograms';
// Aliased, and it MUST stay aliased: the component below binds a local
// `upcomingDeadlines` to the student's own saved deadline rows (useDeadlines()),
// which shadows this import for the whole body. Imported under its own name, the
// one call site that wants the FUNCTION — opportunityPreview, which runs on
// every render — called an array instead and threw, taking the entire app into
// the root error boundary on load. Two different things were sharing one name;
// this gives the function its own.
import { upcomingDeadlines as upcomingProgramDeadlines, studentEligibilityFacts } from './lib/opportunityEligibility';
import PanelHero, { SectionTitle, StatTile } from './components/ui/PanelHero';
// Parallel pathways — a student can run up to three tracks at once (see
// lib/pathwayEnrollment.js for the model, PathwaySwitcher.jsx for the surfaces).
import {
  MAX_ACTIVE_PATHWAYS, getActivePathways, getFocusedPathway, activePathwayProgress,
  enrollPathway, focusPathway, dropPathway, swapPathway, buildLessonPathwayIndex,
  describeParallelPathways,
} from './lib/pathwayEnrollment';
import {
  PathwayRail, PathwayQuickSwitch, ParallelPathwayBoard, PathwayManager, PATH_ICONS,
} from './components/PathwaySwitcher';
import MyPlanCard from './components/MyPlanCard';
import TodayPlanNudge from './components/TodayPlanNudge';
import PlansTab, { fetchPortfolio as fetchPlanPortfolio } from './components/PlansTab';
import RoadmapTab from './components/roadmap/RoadmapTab';
import RoadmapHomeCard from './components/roadmap/RoadmapHomeCard';
import PlanTaskStrip from './components/ui/PlanTaskStrip';
// ── The student dashboard ────────────────────────────────────────────────────
// Six modules, in a fixed order, rebuilt around the question a student actually
// opens the app with. See src/components/dashboard/ for the reasoning behind
// each one and src/lib/nextThree.js for the ranking that drives the first.
import NextThreeCard from './components/dashboard/NextThreeCard';
import FourYearArc from './components/dashboard/FourYearArc';
import HoursRings from './components/dashboard/HoursRings';
import DeadlineHorizon from './components/dashboard/DeadlineHorizon';
import ProgressDetail from './components/dashboard/ProgressDetail';
import SubstanceAchievements from './components/dashboard/SubstanceAchievements';
import { nextThree } from './lib/nextThree';
import PortfolioPlanWeek from './components/PortfolioPlanWeek';
import WeeklyGoalsBoard from './components/portfolio/WeeklyGoalsBoard';
import TrackedPanel from './components/portfolio/TrackedPanel';
// Progressive disclosure + the Overview's "Start here" card. The Portfolio Overview used to open
// with eleven equally-weighted blocks and no answer to "so what do I do"; these are what turn it
// back into one decision up top and everything else one clearly-labeled tap down.
import Disclosure, { HelpNote } from './components/ui/Disclosure';
import NextStepsCard from './components/portfolio/NextStepsCard';
import { buildNextSteps } from './lib/portfolioNextSteps';
import { goalsForWeek, measureWeek, METRIC_BY_ID, daysLeftInWeek } from './lib/weeklyGoals';
import QuizPlanToday from './components/QuizPlanToday';
import {
  summarizePlanForCoach, autoCompleteResourceTasks, resourceMatch, typeMatch, getTodayPlanEntry, getNextPlanDay, getPlanStreak,
  toggleTaskDone as togglePlanTaskDone, moveTaskToDay, todayStr as planTodayStr, addDaysStr as planAddDaysStr,
  needsExtension as needsPlanExtension, refreshDayWindow as refreshPlanWindow, dropRetiredTasks,
} from './lib/masterPlanGenerator';
import SubNav from './components/ui/SubNav';
import TabContentGuard from './components/TabContentGuard';
import EmptyState from './components/ui/EmptyState';
import { useMediaQuery, useViewport, Arc, Bar, Stat } from './components/ui/primitives';
// The SAT pillar ships sealed for v1 — the tab renders behind SatBetaCover and
// nothing outside it integrates with SAT any more. See src/lib/betaFlags.js.
import SatTab from './components/sat/SatTab';
import SatBetaCover from './components/sat/SatBetaCover';
import { SAT_ENABLED } from './lib/betaFlags';
import AppTour from './components/AppTour';
// Progressive feature unlocking — the nav shows what this student can use today,
// not everything the product contains. See src/lib/featureUnlock.js for the ladder
// and why day one is four doors instead of thirty-eight.
import { unlockState, visibleItems, recordUnlocks, seedExistingAccount, sectionKey, ruleCopy, studyActions, MARQUEE_IDS, NAV_MODES } from './lib/featureUnlock';
import NextUnlockCard from './components/NextUnlockCard';
import UnlockCelebration from './components/UnlockCelebration';
import Onboarding, { GOAL_OPTIONS, OBSTACLE_OPTIONS, STUDY_METHOD_OPTIONS, ACCOMPLISH_OPTIONS, STUDY_HOURS_OPTIONS, GPA_OPTIONS, SCIENCE_OPTIONS, EXPERIENCE_OPTIONS } from './components/onboarding/Onboarding';
import { computeApplicationStrength } from './lib/applicationStrength';
// snapshotItemCount is deliberately NOT re-exported here — it lives in weeklyGoals.js (see the
// note at the top of portfolioData.js) and nothing in this file uses it. Importing it anyway was
// only a warning to Rollup but a hard module error to the dev server's native ESM, which blanked
// the whole app in development.
import { buildPortfolioSnapshot } from './lib/portfolioData';
import { buildTrackedItems, buildDailyReport } from './lib/trackedItems';
import { buildInsights } from './lib/insights';
// computePlanReadiness is the Plans generator's own bar, read by the unlock ladder so that
// tab opens only once it can actually build something — see the `planReady` signal below.
import { buildCoachSystemPrompt, buildOnboardingRecap, computeOnboardingCompleteness, computePlanReadiness } from './lib/studentProfile';
// ── Modes, deep context, and the safety layer ───────────────────────────────
// The three things that turn the chat tab from a text box into a coach: named
// modes instead of a blank prompt (medabrainModes), the measured record shaped
// into sentences the model can quote (coachContext), and a dedicated
// classification pass on every message the student sends (safety/*).
import { MEDABRAIN_MODES, FREE_MODE, modeById, buildModeBlock, equityStarters } from './lib/medabrainModes';
import { summarizeQuizTopics, summarizeHoursByCategory, summarizeSavedPrograms, summarizeWeeklyGoal, summarizeDeadlines, buildDeepContextBlock } from './lib/coachContext';
import { runSafetyPass } from './lib/safety/pass';
import { loadCrisisResources } from './lib/safety/resources';
import CrisisResourceCard from './components/safety/CrisisResourceCard';
import { buildNotesDigest, buildHighlightsDigest } from './lib/lessonMemory';
import {
  C, catMeta, tint, glass, glass2, btn, btnSm, btnG, inp, lbl, R, CC, G, pill,
  onTint, accentText, accentFill, accentGrad, accentSweep, shade, isLight,
  applyTheme, getStoredMode, storeMode, resolveMode, watchSystemTheme, THEME_MODES, CONTROL_TRANSITION } from './lib/theme';
import { loadA11y, saveA11y, applyA11y, motionReduced, DEFAULTS as A11Y_DEFAULTS, FONT_SCALE_STEPS, announce } from './lib/a11y';
import { subscribeViewport, setViewportBase } from './lib/useViewport';
import AboutMePanel from './components/AboutMePanel';
import AppearanceSettings from './components/AppearanceSettings';
import ConnectionsPanel from './components/parent/ConnectionsPanel';
import * as ParentAPI from './lib/parentApi';
import { getBriefEntries, briefStats, buildPersonalBriefBlock } from './lib/personalBrief';

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend, CategoryScale, LinearScale, BarElement, ArcElement);

// ── Design tokens & style helpers ────────────────────────────────────────────
// All of this used to be defined inline here, duplicating src/lib/theme.js
// token for token. It now lives in that one module, because a palette that
// exists in two places cannot be switched at runtime — and light mode needs
// exactly that. See the header of theme.js for why `C` is a mutable object
// rather than a set of CSS custom properties.
//
// `deckCatMeta` stays local (it's keyed to DECK_CATEGORY_ORDER, which is a
// flashcard concern) but is now built per call for the same reason catMeta is:
// a module-level object literal would freeze the dark palette at import time
// and never follow a theme change.
const DECK_CAT_HUES = {
  'Core Skills':    ['sky',    'oceanGrad',  '\u270f\ufe0f'],
  'Science':        ['green',  'forestGrad', '\ud83e\uddea'],
  'Social Studies': ['pink',   'sunsetGrad', '\ud83c\udfdb\ufe0f'],
  'Study Skills':   ['teal',   'forestGrad', '\ud83e\udde0'],
  'Pathway & Admissions': ['indigo', 'oceanGrad', '\ud83c\udf93'],
  'My Decks':       ['violet', 'violetGrad', '\ud83d\uddc2\ufe0f'],
};
const deckCatMeta = (cat) => {
  const [hue, grad, emoji] = DECK_CAT_HUES[cat] || ['amber', 'sunsetGrad', '\ud83d\udcda'];
  return { color:C[hue], light:C[`${hue}L`], dim:C[`${hue}Dim`], grad:C[grad], emoji };
};

// ── Quiz scrambling ───────────────────────────────────────────────────────────
function shuffleArr(arr){const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}

const TOTAL_QUESTIONS = ALL_QUIZZES.reduce((n,q)=>n+q.qs.length,0);
function scrambleQuiz(quiz){
  const qs = quiz.qs;
  const shuffled = shuffleArr(qs);
  if (quiz.sameChoices) {
    const numChoices = shuffled[0].ch.length;
    const idx = shuffleArr([...Array(numChoices).keys()]);
    return shuffled.map(q => ({
      ...q,
      ch: idx.map(i => q.ch[i]),
      ans: idx.indexOf(q.ans)
    }));
  }
  return shuffled.map(q=>{
    const idx=shuffleArr([...Array(q.ch.length).keys()]);
    return{...q,ch:idx.map(i=>q.ch[i]),ans:idx.indexOf(q.ans)};
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtT   = s => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
const scCol  = p => p>=80?C.green:p>=60?C.blue:C.amber;
const AI_MSG = 'AI features require an OpenAI API key. Set OPENAI_KEY in your Vercel environment variables.';

// NOTE: a `scoreToSection` helper used to live here, mapping a science-quiz

// NOTE: a scoreSchool() helper used to live here — an additive 100-point-plus-bonuses
// score per school that produced Likely/Target/Reach/Stretch tiers. It was replaced
// wholesale by the layered model in src/lib/admissions/, which works in probability
// against each program's real base rate rather than in points. See the header of
// src/components/portfolio/admissions/AdmissionCalculatorPanel.jsx.

// Boiled down from 17 flat destinations to 4: Home + three pillars. Prep and
// Portfolio each absorb several formerly-top-level tabs via their own SubNav
// (see prepView/portfolioView state + PREP_SUBNAV/PORTFOLIO_SUBNAV below).
// Settings lives in the account menu (avatar click), not the main nav.
const NAV = [
  {id:'home',ic:Home,label:'Home'},
  {id:'sat',ic:Target,label:'SAT'},
  {id:'prep',ic:Compass,label:'Prep'},
  {id:'portfolio',ic:Building2,label:'Portfolio'},
  // Sits between Portfolio and Plans, and the ordering is the argument: Portfolio is the record
  // of what a student has already done, Plans is what they are doing today, and the Roadmap is
  // the twelve months that connect the two. It is the only tab in this nav that looks further
  // ahead than next week.
  {id:'roadmap',ic:MapIcon,label:'Roadmap'},
  {id:'plans',ic:CalendarClock,label:'Plans'},
  {id:'progress',ic:LineChart,label:'Progress'},
  {id:'settings',ic:Settings,label:'Settings'},
];
// The SAT pillar. Sits second because onboarding sells score improvement harder
// than anything else in the product, and until now nothing behind that promise
// existed — see src/data/sat/taxonomy.js for the content model it runs on.
// One identity color across the whole pillar (see SatTab.jsx) — the SAT tab
// holds itself to a stricter, assessment-grade visual standard than the rest
// of the app, so its sub-views share C.sky rather than a per-view rainbow.
// Review Log keeps rose because there the color MEANS something: work owed.
const SAT_SUBNAV = [
  {id:'overview',ic:Target,label:'Overview',color:C.sky},
  // Sits directly after Overview, ahead of the Diagnostic, because it is the
  // first thing a new student should do: the Diagnostic tells them WHAT to work
  // on, but only the Baseline tells them roughly where they currently score,
  // and every other panel's advice reads differently at 1050 than at 1400.
  {id:'baseline',ic:Gauge,label:'Baseline',color:C.sky},
  {id:'diagnostic',ic:Compass,label:'Diagnostic',color:C.sky},
  {id:'practice',ic:Layers,label:'Practice',color:C.sky},
  {id:'tests',ic:ClipboardList,label:'Full tests',color:C.sky},
  {id:'review',ic:AlertTriangle,label:'Review Log',color:C.rose},
  {id:'skills',ic:TrendingUp,label:'Skill Mastery',color:C.sky},
  // The Digital SAT hands every student the Desmos graphing calculator on every
  // Math question. This is its home: the real calculator at full size, the
  // formula sheet the exam does (and does not) give you, and the technique list
  // that turns "there is a calculator" into points.
  // The bank, browsable, plus College Board's own free material. Sits beside
  // the Calculator rather than under Train because it is a reference surface —
  // somewhere you go looking for a specific thing, not somewhere you are sent.
  {id:'library',ic:Library,label:'Library',color:C.sky},
  {id:'toolkit',ic:Calculator,label:'Calculator',color:C.sky},
  {id:'scores',ic:LineChart,label:'Scores',color:C.sky},
];
/** The placeholder a lazily-loaded foundations tool shows while its chunk
 *  arrives. Sized so the card does not collapse and then jump when the real
 *  panel lands — a layout shift under the student's thumb is worse than the
 *  half-second of waiting it was trying to hide. */
const ToolLoading = () => (
  <div style={{ minHeight: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: C.t3 }} />
  </div>
);

const PREP_SUBNAV = [
  {id:'diagnostic',ic:Compass,label:'Diagnostic',color:C.cyan},
  {id:'pathways',ic:Route,label:'Pathways',color:C.blue},
  {id:'quizzes',ic:Layers,label:'Quiz library',color:C.green},
  {id:'flashcards',ic:Layers3,label:'Flashcards',color:C.amber},
  {id:'coach',ic:MessageCircle,label:'AI coach',color:C.violet},
  {id:'library',ic:BookOpen,label:'E-Library',color:C.pink},
];
// Five tabs. Not eleven.
//
// A horizontal strip on a 390px phone fits about four 90px pills before it
// becomes a carousel, and a carousel is not navigation — it hides destinations
// behind a gesture nobody performs. Portfolio had eleven, mitigated with fade
// edges and chevrons, which is treating the symptom.
//
// So the eleven became five, by merging along the questions a student actually
// asks rather than along our table names:
//
//   Overview      — how am I doing
//   Activities    — what have I done            (was: Activities & Resume,
//                                                Research, Skills & Certs,
//                                                Clinical Hours)
//   Opportunities — what should I go do next    (+ Tracked, which is the
//                                                follow-through for exactly
//                                                that question)
//   Applying      — where am I applying and     (was: College List, Essays,
//                   what do they still need      Financial Aid, Recommenders,
//                                                Interview Prep, Admissions
//                                                Calculator)
//   Milestones    — when is everything due
//
// Every merged surface still exists in full, as a section of a single scrolling
// page with a summary on top and a sticky in-page jumper (see
// SectionScroller.jsx). Every old URL and every in-app link that names a
// retired tab still resolves and now lands on the exact section — see
// PORTFOLIO_GROUP_FOR_VIEW below and the aliases in src/lib/routes.js.
//
// Labels are one plain word each, icon always paired with text, one row.
const PORTFOLIO_SUBNAV = [
  {id:'overview',ic:Building2,label:'Overview',color:C.blue},
  {id:'resume',ic:Award,label:'Activities',color:C.amber},
  {id:'opportunities',ic:Trophy,label:'Opportunities',color:C.gold},
  {id:'applying',ic:GraduationCap,label:'Applying',color:C.sky},
  // The Common App mirror. Sits directly after Applying because it is the thing every panel in
  // this tab feeds — see src/lib/commonApp/sections.js. Deliberately not first: a student who
  // opens Portfolio should land on their work, not on the form the work is for.
  {id:'commonapp',ic:ClipboardList,label:'Common App',color:C.teal},
  // One tab, not two. 'Deadlines' (the dates you type) and 'Timeline' (the dates we generate)
  // were the write half and the read half of the same calendar; splitting them meant a date added
  // on one showed up on the other only after a reload, and the two could disagree about what was
  // next. /portfolio/timeline and /portfolio/deadlines still resolve here — see routes.js aliases.
  {id:'milestones',ic:Milestone,label:'Milestones',color:C.indigo},
];
// Every retired Portfolio tab → [the tab that now holds it, the section it became].
// Every caller in the app (and every old URL) still names them by their old tab id; this is the
// one place that translation happens, so goPortfolio('essays') still means "open the essay
// workspace" — it just opens it as a section of Applying instead of as a tab.
//
// 'credentials' is an alias for 'skills' so goDest('portfolio/resume:credentials') — the id
// NAV_KEYWORDS and the deep-link protocol both use, since "credentials" is the section's actual
// label — resolves the same as the palette's own 'skills' command instead of landing on nothing.
const PORTFOLIO_GROUP_FOR_VIEW = {
  activities:['resume','activities'], academics:['resume','academics'],
  clinical:['resume','clinical'], research:['resume','research'],
  skills:['resume','credentials'], credentials:['resume','credentials'],
  colleges:['applying','colleges'], essays:['applying','essays'], aid:['applying','aid'],
  recommenders:['applying','recommenders'], interview:['applying','interview'], calc:['applying','calc'],
  // The MedEx Score's own address. Sits under Applying beside the calculator
  // because they answer the same question at two altitudes — position vs. odds —
  // and a student sent here from Home should land on the number, not the page.
  medex:['applying','medex'],
  // The Narrative Method Engine's own address. Its own entry rather than only a
  // section id because it is the screen a counselor or a parent is sent a link
  // to — "run the narrative reading on your file" — and because it is the one
  // Applying section a student arrives at from outside the page.
  narrative:['applying','narrative'],
  // The combined-degree and direct-admit catalog. Addressable in its own right
  // (/portfolio/combined) because it is the one screen in this app a student is
  // sent a link to by a parent or a counselor — "look at the BS/MD list" — and
  // because its whole audience is ninth and tenth graders who will not find it
  // by working down the Applying page.
  combined:['applying','combined'],
  tracked:['opportunities','tracked'],
};
// The [view, section] an old-style URL names, if any: /portfolio/clinical → ['resume','clinical'],
// /portfolio/essays → ['applying','essays']. routes.js already forwards those paths to the merged
// view; this recovers the part it cannot carry, since an alias by design never round-trips back
// out of formatPath().
function portfolioSectionFromPath(pathname=''){
  const parts = String(pathname).split('/').filter(Boolean);
  return (parts[0]==='portfolio' && PORTFOLIO_GROUP_FOR_VIEW[parts[1]]) || null;
}
// The Roadmap pillar. Defined here, in the same shape and the same place as every other
// sub-nav, so scripts/verifyRouting.mjs can pin it to SUBVIEWS.roadmap in routes.js the way it
// pins the rest — the tab's own module exports the identical array (see ROADMAP_SUBNAV in
// src/components/roadmap/RoadmapTab.jsx) and verifyRoadmap.mjs asserts the two agree, so the
// component and the router can never drift apart.
const ROADMAP_SUBNAV = [
  {id:'overview',ic:Compass,label:'Overview',color:C.violet},
  {id:'year',ic:CalendarDays,label:'Your year',color:C.sky},
  // The payoff screen — see the header above ROADMAP_SUBNAV in
  // src/components/roadmap/RoadmapTab.jsx for why it sits third rather than last.
  {id:'climb',ic:TrendingUp,label:'The climb',color:C.green},
  {id:'seasons',ic:Layers,label:'Seasons',color:C.teal},
  {id:'list',ic:ListChecks,label:'Everything',color:C.amber},
  {id:'intake',ic:Target,label:'Your answers',color:C.fuchsia},
];
const PROGRESS_SUBNAV = [
  {id:'overview',ic:LineChart,label:'Overview',color:C.blue},
  // Streak sits directly after Overview and is deliberately NOT gated: it is the
  // only view in this tab with a live deadline on it (today is still winnable),
  // and every other Progress view is retrospective. It is also the answer to
  // "which tab does the streak calendar live in" — Progress is the tab a student
  // opens to ask how they are doing, Home is a one-decision dashboard, and
  // Settings is where records go to be forgotten. See StreakPanel.jsx's header.
  {id:'streak',ic:Flame,label:'Streak',color:C.amber},
  // Quests sits directly after Streak, and is likewise never gated. The two are the
  // same kind of object — a live commitment with a deadline on it — and separating
  // them by three retrospective views would put the only two forward-facing screens
  // in this tab at opposite ends of it.
  {id:'quests',ic:Swords,label:'Quests',color:C.violet},
  {id:'verified',ic:ShieldCheck,label:'Verified progress',color:C.green},
  {id:'performance',ic:TrendingUp,label:'Performance',color:C.violet},
  {id:'achievements',ic:Trophy,label:'Achievements',color:C.amber},
];
// Settings was the last tab with no addressable parts: seven groups in one long scroll, so
// every instruction anywhere in the product that ended "…in Settings" was a hunt, and the two
// things people are actually sent here for — family access and accessibility — were the
// furthest down. Each group is a sub-tab with its own URL now (see SUBVIEWS.settings in
// src/lib/routes.js), which is what makes /settings/family a link an invitation email can
// contain.
//
// Family sits third, above the fold on every screen size, because it is the only one of these
// that another person is waiting on.
const SETTINGS_SUBNAV = [
  {id:'profile',ic:UserCog,label:'Profile & goals',color:C.amber},
  {id:'study',ic:Route,label:'Study setup',color:C.blue},
  {id:'family',ic:Users,label:'Family access',color:C.violet},
  {id:'appearance',ic:Accessibility,label:'Appearance',color:C.cyan},
  {id:'medabrain',ic:Brain,label:'Medabrain',color:C.fuchsia},
  {id:'data',ic:Volume2,label:'Preferences & data',color:C.green},
  {id:'account',ic:ShieldCheck,label:'Account',color:C.rose},
];
// Every destination's student-facing name, keyed the way featureUnlock.js keys them
// ('portfolio', 'sat/review'). Built from the nav arrays themselves rather than
// re-typed, so an unlock toast can never announce a tab under a name the nav doesn't
// use — the one place two copies of a label would definitely drift.
const UNLOCK_LABELS = Object.fromEntries([
  ...NAV.map(n=>[n.id,n.label]),
  ...SAT_SUBNAV.map(n=>[`sat/${n.id}`,n.label]),
  ...PREP_SUBNAV.map(n=>[`prep/${n.id}`,n.label]),
  ...PORTFOLIO_SUBNAV.map(n=>[`portfolio/${n.id}`,n.label]),
  ...ROADMAP_SUBNAV.map(n=>[`roadmap/${n.id}`,n.label]),
  ...PROGRESS_SUBNAV.map(n=>[`progress/${n.id}`,n.label]),
  ...SETTINGS_SUBNAV.map(n=>[`settings/${n.id}`,n.label]),
  // The parts of the merged Portfolio pages are gated one level deeper than a
  // sub-tab (see sectionKey in featureUnlock.js), and they get announced the
  // same way, so their names come from the same single source.
  ...RESUME_SECTIONS.map(s=>[`portfolio/resume:${s.id}`,s.label]),
  ...APPLYING_SECTIONS.map(s=>[`portfolio/applying:${s.id}`,s.label]),
  ['portfolio/opportunities:tracked','What you\u2019re tracking'],
]);
const QUICK_P_GROUPS = [
  { label:'Content help', icon:'FlaskConical', prompts:[
    'Explain how to solve a system of equations simply',
    'What is photosynthesis and why does it matter?',
    'Explain supply and demand with an example',
  ]},
  { label:'Study strategy', icon:'Compass', prompts:[
    'How do I approach SAT Reading passages on test day?',
    'Most high-yield topics for SAT Math?',
    'Give me a 2-week study schedule for the ACT Science section',
  ]},
];
// No 'Test Prep' shelf in v1 — those rows are filtered out of ELIB itself (see src/data/elib.js).
const LIB_CATS  = ['All','Life Sciences','Physical Sciences','Math & Data','Behavioral & Social Sciences','Research Methods','Clinical Exposure','Admissions & Planning','Wellness & Balance'];
const COURSE_GROUPS = [
  { group:'Math', items:['Algebra II','Precalculus','Calculus AB','Calculus BC','Statistics'] },
  { group:'Science', items:['Biology','Chemistry','Physics','Environmental Science'] },
  { group:'English', items:['English','AP English Language','AP English Literature'] },
  { group:'History & Social Studies', items:['US History','World History','AP US History','AP World History','AP Government','AP Psychology'] },
  { group:'World Language', items:['Spanish','French','Mandarin','Other Language'] },
];
const COURSE_GROUP_ICONS = {
  Math:Calculator, Science:FlaskConical, English:BookOpen,
  'History & Social Studies':Landmark, 'World Language':Globe,
};
// ── Responsive hook ───────────────────────────────────────────────────────────
// useMediaQuery, Arc, Bar and Stat now live in src/components/ui/primitives.jsx
// so the SAT panels (and any future standalone panel) can use them without
// importing this file. Imported at the top; re-exported nowhere.

// ── KaTeX math renderer ───────────────────────────────────────────────────────
function MathText({ text, style }) {
  if (!text) return null;
  const parts = String(text).split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g);
  return (
    <span style={style}>
      {parts.map((p, i) => {
        try {
          if (p.startsWith('$$') && p.endsWith('$$')) {
            return <span key={i} dangerouslySetInnerHTML={{ __html: katex.renderToString(p.slice(2,-2), { displayMode:true, throwOnError:false }) }} />;
          }
          if (p.startsWith('$') && p.endsWith('$') && p.length > 2) {
            return <span key={i} dangerouslySetInnerHTML={{ __html: katex.renderToString(p.slice(1,-1), { displayMode:false, throwOnError:false }) }} />;
          }
        } catch { /* fallback to plain */ }
        return <span key={i}>{p}</span>;
      })}
    </span>
  );
}

// ── Error Boundary ────────────────────────────────────────────────────────────
// `resetKey` lets a caller declare "this boundary's crash is scoped to this value" — e.g. the
// active tab. Without it, a boundary that trips once stays tripped forever (this.state is never
// otherwise cleared), so switching away from whatever crashed and back does nothing: the same
// stale fallback screen sits there until a full page reload remounts the tree from scratch. That
// mismatch — "reload fixes it, nothing else does" — is exactly what a crash on tab switch looks
// like from outside, whatever the underlying throw turns out to be. Passing `tab` as resetKey
// means navigating to a different section (which the fallback screen itself doesn't block, since
// this boundary no longer wraps the sidebar/nav — see its call site) clears the error and gives
// the newly-selected tab's content a fresh render instead of inheriting the old crash.
class ErrorBoundary extends React.Component {
  constructor(p){super(p);this.state={err:false,msg:''};}
  static getDerivedStateFromError(e){return{err:true,msg:e?.message||'Unexpected error'};}
  componentDidCatch(e,i){console.error('MSP:',e,i);}
  componentDidUpdate(prevProps){
    if(this.state.err && prevProps.resetKey!==this.props.resetKey) this.setState({err:false,msg:''});
  }
  render(){
    if(this.state.err) return(
      <div style={{minHeight:'var(--msp-vh)',display:'flex',alignItems:'center',justifyContent:'center',background:C.bg,fontFamily:C.FB,flexDirection:'column',gap:20,padding:40}}>
        <div style={{width:60,height:60,borderRadius:'50%',background:C.roseDim,border:`1px solid ${C.rose}40`,display:'flex',alignItems:'center',justifyContent:'center'}}><AlertTriangle size={26} color={C.rose}/></div>
        <h2 style={{fontSize:20, letterSpacing: 'calc(-0.28px + var(--msp-letter-spacing))',fontWeight:700,color:C.t1,fontFamily:C.FD}}>Oops! Loading issue.</h2>
        <p style={{color:C.t2,textAlign:'center',maxWidth:400,lineHeight: 1.55,fontSize:14}}>Try reloading — if it keeps happening, contact our support team at <a href="mailto:medschoolprepsupport@gmail.com" style={{color:C.blueL}}>medschoolprepsupport@gmail.com</a>.</p>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'center'}}>
          <a href="/prep" style={{...btnG(),textDecoration:'none'}} onClick={e=>{e.preventDefault();this.setState({err:false});this.props.onEscapeToPrep?.();}}>Go to Prep</a>
          <button style={btn()} onClick={()=>this.setState({err:false})}>Try again</button>
        </div>
      </div>
    );
    return this.props.children;
  }
}

// ── Loading Screen ────────────────────────────────────────────────────────────
// The boot wait is the one moment every student sits through, so it runs the
// brand journey (src/components/BrandJourney.jsx): the mark assembles itself in
// six beats — book, spark, climber, path, star, ring — which is the product's
// whole promise stated without a word of copy.
function LoadingScreen({onFirstPass}) {
  return (
    <BrandLoaderScreen
      caption="Loading MedSchoolPrep…"
      sub="Opening your pathway, your plan, and everything you've earned so far."
      onFirstPass={onFirstPass}
    />
  );
}

// ── Arc (circular progress) ───────────────────────────────────────────────────
// ── Dot (mastery status) ──────────────────────────────────────────────────────
function Dot({state='locked'}){
  const cfg={
    verified:{bg:C.green,Ic:ShieldCheck,c:'#fff',sz:12},
    done:{bg:C.green,Ic:Check,c:'#fff',sz:12},
    studying:{bg:'transparent',Ic:BookOpen,c:C.amberL,brd:C.amberL,sz:10},
    available:{bg:'transparent',Ic:Circle,c:C.blueL,brd:C.blueL,sz:8},
    locked:{bg:'transparent',Ic:Lock,c:C.t4,brd:C.t4,sz:10},
  };
  const d=cfg[state]||cfg.locked;
  return<span style={{width:22,height:22,borderRadius:'50%',background:d.bg,border:`1.5px solid ${d.brd||C.green}`,display:'inline-flex',alignItems:'center',justifyContent:'center',color:d.c,flexShrink:0,boxShadow:(state==='done'||state==='verified')?`0 0 8px ${C.green}60`:undefined}}><d.Ic size={d.sz} strokeWidth={state==='available'||state==='studying'?0:2.5} fill={state==='available'||state==='studying'?d.c:'none'}/></span>;
}


// ── Page header (colored icon badge + eyebrow/title/sub) ─────────────────────
// A single reusable header pattern applied across Progress/Portfolio/Flashcards
// so the top of every section reads as one consistent, colorful design system
// instead of each tab inventing its own title treatment.
function PageHeader({icon,color=C.blue,eyebrow,title,sub,right,m=false}){
  const Ic=icon;
  return(
    <div style={{...glass({padding:m?16:20,background:`linear-gradient(120deg,${color}14,transparent 70%)`,border:`1px solid ${color}25`}),display:'flex',alignItems:'center',gap:m?12:16,flexWrap:'wrap'}}>
      {Ic&&<div style={{width:m?38:46,height:m?38:46,borderRadius:12,background:`linear-gradient(135deg,${color}40,${color}18)`,border:`1.5px solid ${color}45`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,boxShadow:`0 6px 18px ${color}25`}}><Ic size={m?18:22} color={color}/></div>}
      <div style={{flex:1,minWidth:160}}>
        {eyebrow&&<div style={{fontSize:10,fontWeight:700,color:color,letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', marginBottom:4}}>{eyebrow}</div>}
        <h2 style={{fontSize:m?19:24,fontWeight:800,color:C.t1,fontFamily:C.FD,letterSpacing: 'calc(-0.03em + var(--msp-letter-spacing))',margin:0}}>{title}</h2>
        {sub&&<div style={{fontSize:m?11.5:12.5,color:C.t2,marginTop:4,lineHeight:1.5,maxWidth:520}}>{sub}</div>}
      </div>
      {right&&<div style={{flexShrink:0}}>{right}</div>}
    </div>
  );
}

// ── Video Modal ───────────────────────────────────────────────────────────────
// YouTube's postMessage-based IFrame Player API is the only client-side way to know
// whether a given ytId actually loaded (vs. removed/private/embedding-disabled) —
// a plain <iframe> never fires a DOM error for that. We load the API once, attach a
// player to our iframe, and surface real onError codes as a graceful fallback UI
// instead of a silently broken embed.
function extractYouTubeId(url){
  if(!url)return null;
  const m=String(url).match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{6,})/);
  return m?m[1]:null;
}
let ytApiPromise=null;
function loadYouTubeIframeAPI(){
  if(window.YT&&window.YT.Player)return Promise.resolve(window.YT);
  if(ytApiPromise)return ytApiPromise;
  ytApiPromise=new Promise(resolve=>{
    const prev=window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady=()=>{prev&&prev();resolve(window.YT);};
    if(!document.getElementById('yt-iframe-api')){
      const tag=document.createElement('script');
      tag.id='yt-iframe-api';
      tag.src='https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
  });
  return ytApiPromise;
}
const YT_ERROR_MESSAGES={
  2:'This video link looks malformed.',
  5:"This video can't be played in the current browser.",
  100:'This video was removed or made private.',
  101:'The video owner disabled embedded playback.',
  150:'The video owner disabled embedded playback.',
};
function VideoModal({ytId,title,url,onClose,m=false}){
  const frameId=useRef(`ytp-${ytId}-${Math.random().toString(36).slice(2)}`).current;
  const playerRef=useRef(null);
  const [status,setStatus]=useState('loading'); // loading | ready | error | timeout
  const [errMsg,setErrMsg]=useState('');
  const watchUrl=url||`https://www.youtube.com/watch?v=${ytId}`;

  useEffect(()=>{const h=e=>{if(e.key==='Escape')onClose();};document.addEventListener('keydown',h);return()=>document.removeEventListener('keydown',h);},[onClose]);

  useEffect(()=>{
    let cancelled=false;
    const timeout=setTimeout(()=>setStatus(s=>s==='loading'?'timeout':s),9000);
    loadYouTubeIframeAPI().then(YT=>{
      if(cancelled)return;
      playerRef.current=new YT.Player(frameId,{
        events:{
          onReady:()=>{if(!cancelled)setStatus('ready');},
          onError:(e)=>{
            if(cancelled)return;
            setErrMsg(YT_ERROR_MESSAGES[e?.data]||'This video failed to load.');
            setStatus('error');
          },
        },
      });
    });
    return ()=>{cancelled=true;clearTimeout(timeout);try{playerRef.current?.destroy?.();}catch{}};
  },[frameId]);

  const broken=status==='error'||status==='timeout';
  // Embeds use youtube-nocookie.com, not youtube.com. On the regular domain
  // YouTube writes its ad/viewing-tracking cookies as soon as the iframe
  // loads, whether or not the student ever presses play — so on a page a
  // fourteen-year-old opened to watch a lesson, we would be handing Google a
  // tracked impression for merely opening the lesson. Privacy-enhanced mode
  // defers that to an actual play, which is what src/legal/privacy.js § 9 tells
  // users happens. The player API, autoplay, and error events all behave
  // identically on this domain.
  return(
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.93)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:m?12:24,backdropFilter:'blur(8px)'}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <motion.div initial={{scale:.95,y:10}} animate={{scale:1,y:0}} exit={{scale:.95,y:10}} style={{width:'100%',maxWidth:920,...glass({padding:0,overflow:'hidden',borderRadius:m?12:20,border:`1px solid ${C.b2}`,boxShadow:'0 40px 100px rgba(0,0,0,0.9)'})}}>
        <div style={{...R({justifyContent:'space-between'}),padding:'12px 20px',borderBottom:`1px solid ${C.b1}`,background:C.s1}}>
          <div style={R({gap:8})}>
            <span style={{...pill('rgba(239,68,68,0.2)','#f87171',{fontSize:10}),display:'inline-flex',alignItems:'center',gap:4}}><Play size={9} fill="currentColor"/>YouTube</span>
            <span style={{fontSize:14,fontWeight:600,color:C.t1,fontFamily:C.FB}}>{title}</span>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',color:C.t3,cursor:'pointer',width:32,height:32,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:8}} onMouseEnter={e=>e.currentTarget.style.color=C.t1} onMouseLeave={e=>e.currentTarget.style.color=C.t3}><X size={16}/></button>
        </div>
        <div style={{position:'relative',paddingBottom:'56.25%',height:0}}>
          <iframe id={frameId} style={{position:'absolute',top:0,left:0,width:'100%',height:'100%',border:'none',visibility:broken?'hidden':'visible'}} src={`https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&rel=0&modestbranding=1&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`} title={title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen/>
          {status==='loading'&&<div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:C.s1,pointerEvents:'none'}}>
            <div style={{width:32,height:32,borderRadius:'50%',border:`3px solid ${C.b2}`,borderTopColor:C.blue,animation:'spin .8s linear infinite'}}/>
          </div>}
          {broken&&<div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:12,background:C.s1,padding:24,textAlign:'center'}}>
            <AlertTriangle size={28} color="#f87171"/>
            <div style={{fontSize:13,color:C.t2,maxWidth:380,lineHeight: 1.55}}>{status==='timeout'?"This video is taking too long to respond — it may be region-locked or temporarily unavailable.":errMsg}</div>
            <a href={watchUrl} target="_blank" rel="noreferrer" style={{...btnSm(C.blueDim,{color:C.blueL,border:`1px solid ${C.blue}30`,textDecoration:'none',fontSize:12}),display:'inline-flex',alignItems:'center',gap:4}}>Watch on YouTube<ExternalLink size={12}/></a>
          </div>}
        </div>
      </motion.div>
    </motion.div>
  );
}
// ── Lesson Video (inline, non-modal — embedded as one step of LessonPlayer) ──
// Same YouTube IFrame Player API technique as VideoModal (real embed + error
// detection), but rendered inline in a wizard step instead of a popup, and
// tracking watch progress so the quiz step can gate on it actually finishing.
function LessonVideoInline({ytId,title,onWatched,watched=false}){
  const frameId=useRef(`ytlp-${ytId}-${Math.random().toString(36).slice(2)}`).current;
  const playerRef=useRef(null);
  const watchedRef=useRef(watched);
  const [status,setStatus]=useState('loading'); // loading | ready | error | timeout

  useEffect(()=>{
    let cancelled=false;
    let poll=null;
    const timeout=setTimeout(()=>setStatus(s=>s==='loading'?'timeout':s),9000);
    loadYouTubeIframeAPI().then(YT=>{
      if(cancelled)return;
      playerRef.current=new YT.Player(frameId,{
        events:{
          onReady:()=>{if(!cancelled)setStatus('ready');},
          onStateChange:(e)=>{
            if(cancelled)return;
            if(e.data===YT.PlayerState.ENDED&&!watchedRef.current){watchedRef.current=true;onWatched();}
            if(e.data===YT.PlayerState.PLAYING&&!poll){
              poll=setInterval(()=>{
                try{
                  const p=playerRef.current;
                  const dur=p?.getDuration?.();
                  const cur=p?.getCurrentTime?.();
                  if(dur>0&&cur/dur>=0.9&&!watchedRef.current){watchedRef.current=true;onWatched();}
                }catch{/* player not ready yet */}
              },2000);
            }
          },
          onError:(e)=>{
            if(cancelled)return;
            setStatus('error');
            playerRef.current={...playerRef.current,_errMsg:YT_ERROR_MESSAGES[e?.data]||'This video failed to load.'};
          },
        },
      });
    });
    return ()=>{cancelled=true;clearTimeout(timeout);if(poll)clearInterval(poll);try{playerRef.current?.destroy?.();}catch{}};
  },[frameId]);

  const broken=status==='error'||status==='timeout';
  return(
    <div>
      <div style={{position:'relative',paddingBottom:'56.25%',height:0,borderRadius:12,overflow:'hidden',border:`1px solid ${C.b1}`,background:C.s1}}>
        <iframe id={frameId} style={{position:'absolute',top:0,left:0,width:'100%',height:'100%',border:'none',visibility:broken?'hidden':'visible'}} src={`https://www.youtube-nocookie.com/embed/${ytId}?rel=0&modestbranding=1&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`} title={title} allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen/>
        {status==='loading'&&<div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',pointerEvents:'none'}}>
          <div style={{width:32,height:32,borderRadius:'50%',border:`3px solid ${C.b2}`,borderTopColor:C.blue,animation:'spin .8s linear infinite'}}/>
        </div>}
        {broken&&<div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:12,padding:20,textAlign:'center'}}>
          <AlertTriangle size={24} color="#f87171"/>
          <div style={{fontSize:12.5,color:C.t2,maxWidth:320,lineHeight: 1.55}}>{status==='timeout'?"This video is taking too long to respond — it may be temporarily unavailable.":(playerRef.current?._errMsg||'This video failed to load.')}</div>
          <div style={R({gap:8})}>
            <a href={`https://www.youtube.com/watch?v=${ytId}`} target="_blank" rel="noreferrer" style={{...btnSm(C.blueDim,{color:C.blueL,border:`1px solid ${C.blue}30`,textDecoration:'none',fontSize:11.5}),display:'inline-flex',alignItems:'center',gap:4}}>Watch on YouTube<ExternalLink size={11}/></a>
            {!watched&&<button style={btnSm(C.s3,{color:C.t2,fontSize:11.5})} onClick={()=>{watchedRef.current=true;onWatched();}}>Continue anyway</button>}
          </div>
        </div>}
      </div>
      {!broken&&<div style={{fontSize:11,color:C.t3,marginTop:8,textAlign:'center'}}>{watched?'Watched — you can continue.':'Watch to the end to unlock the quiz.'}</div>}
    </div>
  );
}

// ── Lesson Player (immersive, mobile-first, full-app-takeover lesson flow) ──
// Overview -> Article -> Video -> Quiz -> Complete. Replaces the old
// "Study opens an external tab / modal, Verify is a separate button" flow —
// every step happens inside one continuous, swipeable-feeling wizard so a
// pathway lesson never bounces the student out of the app. The Quiz step
// hands off to the app's existing aQuiz/QuizEngine fullscreen gate (reusing
// openVerifyQuiz/finishQuiz as-is) rather than duplicating quiz logic here.
function LessonPlayer({lesson,unit,pathwayLabel,pathwayEntry,step,onStep,articleRead,onArticleRead,videoWatched,onVideoWatched,initialScrollPct=0,onScrollProgress,onClose,onStartQuiz,onNextLesson,hasNextLesson,accent=C.blue,m=false,highlights=[],onAddHighlight,onRemoveHighlight,quizBlurb='',
  // ── Added with the "did you actually finish this?" flow ──
  confirms={article:false,video:false},   // the student's own tick per step
  onConfirmStep,                          // (step) => void
  onContinueLater,                        // save my spot and let me go
  feedbackSlot=null,                      // <LessonDifficultyCheck/>, owned by App
  reviewMode=false,
}){
  const content = LESSON_CONTENT[lesson.id];
  const videoId = content?.video?.ytId || extractYouTubeId(lesson.url);
  const hasArticle = !!content?.article;
  const hasVideo = !!videoId;
  const isVerified = !!pathwayEntry?.verified;
  const stepOrder = ['overview', hasArticle&&'article', hasVideo&&'video', 'quiz', 'complete'].filter(Boolean);
  const curIdx = Math.max(0,stepOrder.indexOf(step));
  const articleScrollRef = useRef(null);
  const restoredScrollRef = useRef(false);

  // ── "Are you sure you're done?" ────────────────────────────────────────────
  // Continue used to be a pure navigation button: scrolling to the bottom of the article (or
  // letting the video run out) unlocked it, and pressing it silently counted the step as
  // finished. Neither of those is evidence the student actually did the thing — a scroll to the
  // bottom takes one flick, and a video plays to the end whether or not anyone is watching. So
  // leaving the article or the video now asks once, plainly, and takes the student at their
  // word. `confirms` persists per lesson (DB.lessonProgress), so this is asked once per step,
  // not every time they page back and forth.
  const [pendingConfirm,setPendingConfirm]=useState(null); // 'article' | 'video' | null
  const needsConfirm=(s)=>!reviewMode&&!isVerified&&((s==='article'&&hasArticle&&!confirms.article)||(s==='video'&&hasVideo&&!confirms.video));

  function advance(){
    const idx=stepOrder.indexOf(step);
    if(idx<stepOrder.length-1)onStep(stepOrder[idx+1]);
  }
  function goNext(){
    if(needsConfirm(step)){ setPendingConfirm(step); return; }
    advance();
  }
  function goBack(){
    const idx=stepOrder.indexOf(step);
    if(idx>0)onStep(stepOrder[idx-1]);
  }
  // Restores exactly where a student scrolled to in this article the moment the step mounts
  // (e.g. resuming after a reload) — a plain "read/unread" flag alone can't do that, only a
  // remembered scroll fraction of the actual content can.
  useEffect(()=>{
    if(step!=='article'||restoredScrollRef.current)return;
    const el=articleScrollRef.current;
    if(!el||initialScrollPct<=0)return;
    restoredScrollRef.current=true;
    requestAnimationFrame(()=>{ if(el)el.scrollTop = (initialScrollPct/100)*(el.scrollHeight-el.clientHeight); });
  },[step,initialScrollPct]);
  const scrollSaveTimer=useRef(null);
  function handleArticleScroll(e){
    const el=e.target;
    if(!articleRead&&el.scrollHeight-el.scrollTop-el.clientHeight<48)onArticleRead();
    if(!onScrollProgress)return;
    clearTimeout(scrollSaveTimer.current);
    scrollSaveTimer.current=setTimeout(()=>{
      const denom=el.scrollHeight-el.clientHeight;
      const pct=denom>0?Math.min(100,Math.round((el.scrollTop/denom)*100)):100;
      onScrollProgress(pct);
    },400);
  }

  const canContinueArticle = !hasArticle || articleRead;
  const canContinueVideo = !hasVideo || videoWatched;

  // ── Listen mode ────────────────────────────────────────────────────────────
  // The narration script is derived once per lesson; `speakingSection` is the
  // article block currently being read aloud, which HighlightableArticle tints
  // and scrolls to so the page follows the voice.
  const audioSegments = useMemo(()=>hasArticle?buildArticleSegments(content,lesson.title):[],[content,lesson.title,hasArticle]);
  const [speakingSection,setSpeakingSection] = useState(null);
  // Reaching the end of the narration is the listener's equivalent of scrolling
  // to the bottom — without this, a student who listened to the whole article on
  // the bus would still be stuck behind a disabled "Continue" button.
  const handleAudioFinished = useCallback(()=>{ if(!articleRead)onArticleRead(); },[articleRead,onArticleRead]);

  return(
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} style={{minHeight:'var(--msp-vh)',width:'100%',flex:1,background:`radial-gradient(ellipse 90% 60% at 50% -10%,${accent}1c 0%,transparent 60%),radial-gradient(ellipse 70% 50% at 100% 100%,${accent}12 0%,transparent 55%),${C.bg}`,color:C.t1,fontFamily:C.FB,display:'flex',flexDirection:'column'}}>
      {/* Thin pathway-colored top rule so the immersive lesson view still reads as "this pathway" at a glance */}
      <div style={{height:3,width:'100%',flexShrink:0,background:`linear-gradient(90deg,${accent},${accent}55,transparent)`}}/>
      {/* Header — progress dots + close */}
      <div style={{position:'sticky',top:0,zIndex:20,background:`${C.bg}f2`,backdropFilter:'blur(12px)',borderBottom:`1px solid ${C.b1}`,padding:m?'12px 14px':'16px 24px'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,maxWidth:860,margin:'0 auto',width:'100%'}}>
          <button onClick={onClose} aria-label="Close lesson" style={{background:'none',border:'none',color:C.t3,cursor:'pointer',width:40,height:40,minWidth:40,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:8,flexShrink:0}}><X size={18}/></button>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:m?12:13,fontWeight:700,color:C.t1,fontFamily:C.FD,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{lesson.title}</div>
            <div style={{fontSize:10,color:C.t3,marginTop:4}}>{unit.title}{pathwayLabel?` · ${pathwayLabel}`:''}</div>
          </div>
          <div style={{display:'flex',gap:4,flexShrink:0}}>
            {stepOrder.map((s,i)=>(
              <span key={s} style={{width:i===curIdx?18:7,height:7,borderRadius:4,background:i<curIdx||isVerified?C.green:i===curIdx?accent:C.s4,transition: CONTROL_TRANSITION}}/>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{flex:1,overflowY:step==='article'?undefined:'auto'}}>
        <div style={{maxWidth:860,margin:'0 auto',padding:m?'20px 16px 100px':'32px 24px 110px',width:'100%',boxSizing:'border-box'}}>

          {step==='overview'&&(
            <div style={CC({gap:16})}>
              <div style={{width:56,height:56,borderRadius:16,background:`${accent}18`,border:`1px solid ${accent}35`,display:'flex',alignItems:'center',justifyContent:'center'}}><BookOpen size={24} color={accent}/></div>
              <h2 style={{fontSize:m?21:26,fontWeight:800,color:C.t1,fontFamily:C.FD,letterSpacing: 'calc(-0.03em + var(--msp-letter-spacing))',margin:0}}>{lesson.title}</h2>
              <div style={R({gap:12,flexWrap:'wrap'})}>
                {hasArticle&&<span style={{...pill(C.s3,C.t2,{fontSize:10.5}),display:'inline-flex',alignItems:'center',gap:4}}><ScrollText size={11}/>{content.readMins||5} min read</span>}
                {hasArticle&&<span style={{...pill(`${accent}18`,accent,{fontSize:10.5}),display:'inline-flex',alignItems:'center',gap:4}}><Headphones size={11}/>Or listen to it</span>}
                {hasVideo&&<span style={{...pill(C.s3,C.t2,{fontSize:10.5}),display:'inline-flex',alignItems:'center',gap:4}}><Play size={10}/>Watch to reinforce</span>}
                <span style={{...pill(C.greenDim,C.greenL,{fontSize:10.5}),display:'inline-flex',alignItems:'center',gap:4}}><ShieldCheck size={11}/>Quiz to verify</span>
              </div>
              {hasArticle&&(
                <div style={{fontSize:11.5,color:C.t3,lineHeight: 1.55,marginTop:-6}}>
                  Reading isn't the only way through this — every article can be played as audio, so you can finish it on the bus or while you're doing something else.
                </div>
              )}
              {lesson.objectives?.length>0&&(
                <div style={glass2({padding:16})}>
                  <div style={{fontSize:9.5,fontWeight:700,color:C.t3, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))',marginBottom:8}}>What you'll learn</div>
                  <div style={CC({gap:8})}>
                    {lesson.objectives.map((o,i)=>(
                      <div key={i} style={{fontSize:13,color:C.t2,display:'flex',gap:8,alignItems:'flex-start',lineHeight:1.5}}><span style={{color:accent,flexShrink:0,marginTop:4}}>–</span>{o}</div>
                    ))}
                  </div>
                </div>
              )}
              {!hasArticle&&lesson.url&&(
                <div style={{...glass2({padding:12,background:C.amberDim,border:`1px solid ${C.amber}25`})}}>
                  <div style={{fontSize:12,color:C.t2,lineHeight:1.6}}>This lesson's full in-house article hasn't been migrated off its original source yet — you'll see the reference material and a dedicated verification quiz below.</div>
                </div>
              )}
              {isVerified&&<div style={{...pill(C.greenDim,C.greenL,{fontSize:11}),display:'inline-flex',alignItems:'center',gap:4,alignSelf:'flex-start'}}><ShieldCheck size={12}/>Already verified{pathwayEntry?.quizScore!=null?` · ${pathwayEntry.quizScore}%`:''}</div>}
            </div>
          )}

          {step==='article'&&hasArticle&&(
            <div style={CC({gap:12})}>
            {/* Audio sits above the scroll region, not inside it — a listener must be able to
                pause without first scrolling back to the top of the article. */}
            <LessonAudioPlayer segments={audioSegments} accent={accent} m={m}
              onSpeakingSection={setSpeakingSection} onFinished={handleAudioFinished}/>
            <div ref={articleScrollRef} onScroll={handleArticleScroll} style={{maxHeight:m?'calc(var(--msp-vh) - 296px)':'calc(var(--msp-vh) - 312px)',overflowY:'auto',paddingRight:4}}>
              <div style={CC({gap:20})}>
                {!m&&<div style={{fontSize:10.5,color:C.t4,display:'flex',alignItems:'center',gap:4}}><Highlighter size={12}/>Select any passage to highlight it</div>}
                <HighlightableArticle sections={content.article.sections} highlights={highlights} onAdd={onAddHighlight} onRemove={onRemoveHighlight} accent={accent} m={m} activeSectionIdx={speakingSection}/>
                {content.article.keyTakeaways?.length>0&&(
                  <div style={{...glass2({padding:16,background:`${accent}0a`,border:`1px solid ${accent}25`})}}>
                    <div style={{fontSize:9.5,fontWeight:700,color:accent, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))',marginBottom:8}}>Key takeaways</div>
                    <div style={CC({gap:8})}>
                      {content.article.keyTakeaways.map((t,i)=>(
                        <div key={i} style={{fontSize:12.5,color:C.t2,display:'flex',gap:8,alignItems:'flex-start',lineHeight:1.55}}><Check size={13} color={accent} style={{flexShrink:0,marginTop:4}}/>{t}</div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Medabrain's difficulty check lives at the true bottom of the passage —
                    INSIDE the scroll region, after the key takeaways. Anywhere else and it is
                    asking about something the student can't see; here, "too easy" and the
                    deeper passage Medabrain writes in response land in the same column of
                    text, which is what makes the expansion read as part of the lesson. */}
                {feedbackSlot}
                <div style={{height:1}}/>
                {!articleRead&&<div style={{fontSize:11,color:C.t3,textAlign:'center',padding:'8px 0px'}}>Read to the end — or listen to the whole thing — to continue</div>}
              </div>
            </div>
            </div>
          )}

          {step==='video'&&hasVideo&&(
            <div style={CC({gap:12})}>
              {/* The old label for this step was "verification video", which reviewers read as
                  "record yourself to prove you did the lesson" — the exact opposite of what it is.
                  The heading and the line under it now say plainly who is watching whom, and why
                  the step exists at all. */}
              <div style={CC({gap:4})}>
                <div style={{fontSize:m?16:18,fontWeight:800,color:C.t1,fontFamily:C.FD,display:'flex',alignItems:'center',gap:8}}>
                  <Play size={15} color={accent}/>Watch to reinforce
                </div>
                <div style={{fontSize:12.5,color:C.t2,lineHeight: 1.55}}>
                  Watch to reinforce what you just read — seeing it explained visually helps it stick. Nothing is recorded, and nothing is asked of you here; just press play.
                </div>
              </div>
              <LessonVideoInline ytId={videoId} title={content?.video?.title||lesson.title} watched={videoWatched} onWatched={onVideoWatched}/>
              {content?.video?.channel&&<div style={{fontSize:11,color:C.t3,textAlign:'center'}}>via {content.video.channel}</div>}
            </div>
          )}

          {step==='quiz'&&(
            <div style={CC({gap:16,alignItems:'center',textAlign:'center',paddingTop:20})}>
              <div style={{width:64,height:64,borderRadius:16,background:`${C.green}18`,border:`1px solid ${C.green}35`,display:'flex',alignItems:'center',justifyContent:'center'}}><ShieldCheck size={28} color={C.green}/></div>
              <h3 style={{fontSize:m?18:21,fontWeight:800,color:C.t1,fontFamily:C.FD,margin:0}}>Ready to verify this lesson?</h3>
              <p style={{fontSize:13,color:C.t2,lineHeight: 1.55,maxWidth:420,margin:0}}>Pass the quiz at {VERIFY_PASS_PCT}% or higher to mark "{lesson.title}" verified — this is the only thing that actually counts toward unit and pathway mastery. The bar is the same {VERIFY_PASS_PCT}% for every student; the questions are not.</p>
              {/* Says out loud that the draw is per-student — the personalization is real
                  (lib/quizPersonalization.js) but invisible unless we name it. */}
              {quizBlurb&&<div style={{fontSize:11.5,color:C.t3,lineHeight: 1.55,maxWidth:420}}>{quizBlurb}</div>}
              {pathwayEntry?.quizScore!=null&&!isVerified&&<div style={{...pill(C.roseDim,C.rose,{fontSize:11})}}>Last attempt: {pathwayEntry.quizScore}% — try again below</div>}
              <motion.button whileHover={{scale:1.03}} whileTap={{scale:.97}} style={{...btn(`linear-gradient(135deg,${C.green},#059669)`,{padding:'12px 28px',fontSize:14}),display:'inline-flex',alignItems:'center',gap:8}} onClick={onStartQuiz}>{pathwayEntry?.quizScore!=null?'Try Again':'Start Verification Quiz'}<ArrowRight size={15}/></motion.button>
            </div>
          )}

          {step==='complete'&&(
            <div style={CC({gap:16,alignItems:'center',textAlign:'center',paddingTop:24})}>
              <div style={{width:72,height:72,borderRadius:16,background:`${C.green}18`,border:`1px solid ${C.green}35`,display:'flex',alignItems:'center',justifyContent:'center',boxShadow:`0 0 30px ${C.green}30`}}><ShieldCheck size={32} color={C.green}/></div>
              <h3 style={{fontSize:m?20:24,fontWeight:800,color:C.t1,fontFamily:C.FD,margin:0}}>Lesson verified{pathwayEntry?.quizScore!=null?` — ${pathwayEntry.quizScore}%`:''}</h3>
              <p style={{fontSize:13,color:C.t2,lineHeight: 1.55,maxWidth:420,margin:0}}>"{lesson.title}" is locked in for good. {hasNextLesson?'Keep the momentum going with the next one.':'That was the last lesson in this unit — nice work.'}</p>
              <div style={R({gap:8,justifyContent:'center',flexWrap:'wrap'})}>
                {hasNextLesson&&<motion.button whileHover={{scale:1.03}} whileTap={{scale:.97}} style={{...btn(accent===C.blue?C.blueGrad:accentGrad(accent),{padding:'12px 24px',fontSize:13}),display:'inline-flex',alignItems:'center',gap:8}} onClick={onNextLesson}>Next lesson<ArrowRight size={14}/></motion.button>}
                <button style={{...btnG({padding:'12px 20px',fontSize:13}),display:'inline-flex',alignItems:'center',gap:4}} onClick={onClose}>Back to Pathway</button>
              </div>
              {/* Also offered here, not only under the article: a lesson with no in-app article
                  would otherwise never get asked, and a student who only decides how a lesson
                  went once they've finished the quiz still deserves to be asked. */}
              {feedbackSlot&&<div style={{width:'100%',maxWidth:640,textAlign:'left',marginTop:8}}>{feedbackSlot}</div>}
            </div>
          )}

        </div>
      </div>

      {/* Footer nav — big, thumb-reachable tap targets */}
      {step!=='quiz'&&step!=='complete'&&(
        <div style={{position:'sticky',bottom:0,background:`${C.bg}f5`,backdropFilter:'blur(12px)',borderTop:`1px solid ${C.b1}`,padding:m?'12px 14px':'16px 24px',paddingBottom:m?'calc(12px + env(safe-area-inset-bottom))':16}}>
          <div style={{display:'flex',gap:8,maxWidth:860,margin:'0 auto'}}>
            <button onClick={goBack} disabled={curIdx===0} style={{...btnG({flex:'0 0 auto',padding:'12px 16px',fontSize:13,opacity:curIdx===0?.4:1,minHeight:48}),display:'inline-flex',alignItems:'center',gap:4}}><ChevronLeft size={16}/>Back</button>
            <motion.button whileHover={{scale:1.01}} whileTap={{scale:.98}} onClick={goNext}
              disabled={(step==='article'&&!canContinueArticle)||(step==='video'&&!canContinueVideo)}
              style={{...btn(accent===C.blue?C.blueGrad:accentGrad(accent),{flex:1,padding:'12px 16px',fontSize:14,minHeight:48,opacity:((step==='article'&&!canContinueArticle)||(step==='video'&&!canContinueVideo))?.45:1,cursor:((step==='article'&&!canContinueArticle)||(step==='video'&&!canContinueVideo))?'not-allowed':'pointer'}),display:'inline-flex',alignItems:'center',justifyContent:'center',gap:8}}>
              {step==='overview'?'Begin':'Continue'}<ChevronRight size={16}/>
            </motion.button>
          </div>
        </div>
      )}

      {/* ── Step confirmation ──────────────────────────────────────────────────
          Asked once per step per lesson, on the way OUT of the article or the video. Three
          answers, because "did you finish?" genuinely has three: yes, not yet, and "yes but I
          have to go" — which is the ordinary case (dinner, a ride, a class starting) and the
          one that previously had no button at all. Every one of them keeps the student's spot;
          the difference is only where they land next. */}
      <AnimatePresence>
        {pendingConfirm&&(
          <>
            <motion.div key="cbd" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
              onClick={()=>setPendingConfirm(null)}
              style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:400}}/>
            <motion.div key="cdlg" role="dialog" aria-modal="true" aria-label="Confirm you finished this step"
              initial={{opacity:0,scale:.94,y:12}} animate={{opacity:1,scale:1,y:0}} exit={{opacity:0,scale:.96,y:8}}
              transition={{type:'spring',damping:26,stiffness:340}}
              style={{position:'fixed',zIndex:401,left:'50%',top:'50%',transform:'translate(-50%,-50%)',
                width:'min(460px,92vw)',background:C.s0,border:`1px solid ${C.b2}`,borderRadius:16,
                padding:m?20:26,boxShadow:'0 20px 60px rgba(0,0,0,0.55)'}}>
              <div style={{width:44,height:44,borderRadius:12,background:`${accent}18`,border:`1px solid ${accent}35`,display:'grid',placeItems:'center',marginBottom:12}}>
                {pendingConfirm==='article'?<ScrollText size={20} color={accent}/>:<Play size={19} color={accent}/>}
              </div>
              <h3 style={{fontSize:m?16.5:18.5,fontWeight:800,color:C.t1,fontFamily:C.FD,margin:'0px 0px 8px',letterSpacing: 'calc(-0.02em + var(--msp-letter-spacing))'}}>
                {pendingConfirm==='article'?'Did you finish reading it?':'Did you finish the video?'}
              </h3>
              <p style={{fontSize:12.5,color:C.t2,lineHeight: 1.55,margin:'0px 0px 16px'}}>
                {pendingConfirm==='article'
                  ? `We can see you reached the bottom of "${lesson.title}", but scrolling isn't the same as reading it. Only tick this off if you actually got through it — nothing bad happens if you didn't.`
                  : `We can see the video played through, but that isn't the same as you watching it. Only tick this off if you actually did — you can go back and finish it instead.`}
              </p>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                <motion.button whileTap={{scale:.98}} autoFocus
                  onClick={()=>{ onConfirmStep?.(pendingConfirm); setPendingConfirm(null); advance(); }}
                  style={{...btn(accent===C.blue?C.blueGrad:accentGrad(accent),{padding:'12px 16px',fontSize:13.5,minHeight:48}),display:'inline-flex',alignItems:'center',justifyContent:'center',gap:8}}>
                  <Check size={15}/>Yes — I'm done with this, mark it off
                </motion.button>
                <button onClick={()=>setPendingConfirm(null)}
                  style={{...btnG({padding:'12px 16px',fontSize:13,minHeight:46}),display:'inline-flex',alignItems:'center',justifyContent:'center',gap:8}}>
                  <ChevronLeft size={14}/>Not yet — take me back
                </button>
                {onContinueLater&&(
                  <button onClick={()=>{ onConfirmStep?.(pendingConfirm); setPendingConfirm(null); onContinueLater(); }}
                    style={{...btnG({padding:'12px 16px',fontSize:12.5,minHeight:46,border:'none',color:C.t3}),display:'inline-flex',alignItems:'center',justifyContent:'center',gap:8}}>
                    <Coffee size={14}/>Done, but I have to go — save my spot
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Quiz Engine ───────────────────────────────────────────────────────────────
function QuizEngine({quiz,onFinish,onClose,accent=C.blue,readonly=false,m=false}){
  const scoreRef=useRef(0);
  const [qi,setQi]=useState(0);const [sel,setSel]=useState(null);const [conf,setConf]=useState(false);
  const [answers,setAnswers]=useState([]);const [phase,setPhase]=useState('quiz');const [ri,setRi]=useState(0);
  // `preScrambled` quizzes (verification draws from lib/quizPersonalization) already have their
  // question and choice order fixed by a per-student seed; re-running the Math.random scramble
  // here would throw that determinism away and make a refreshed attempt a different quiz.
  const [scrambledQs]=useState(()=>(readonly||quiz.preScrambled)?quiz.qs:scrambleQuiz(quiz));
  const [elapsed,setElapsed]=useState(0);
  const tot=scrambledQs.length,q=scrambledQs[qi],prog=Math.round(((qi+(conf?1:0))/tot)*100);

  useEffect(()=>{
    if(readonly||phase!=='quiz')return;
    const id=setInterval(()=>setElapsed(t=>t+1),1000);
    return()=>clearInterval(id);
  },[readonly,phase]);

  function confirm(){
    if(sel===null||conf)return;
    const ok=sel===q.ans;
    if(ok){scoreRef.current++;play('correct');}else play('wrong');
    setAnswers(a=>[...a,{q:q.q,choices:q.ch,sel,correct:q.ans,exp:q.exp,ok}]);
    setConf(true);
  }
  function next(){if(qi<tot-1){setQi(i=>i+1);setSel(null);setConf(false);}else setPhase('review');}

  if(phase==='review'){
    const pct=tot>0?Math.round((scoreRef.current/tot)*100):0;
    const sc=scCol(pct);const a=answers[ri];
    if(pct===100)setTimeout(()=>celebratePerfect(),100);
    return(
      <div style={{padding:m?16:28}}>
        <div style={{...glass({padding:32,background:`${sc}08`,border:`1px solid ${sc}20`,marginBottom:24,textAlign:'center'})}}>
          <Arc pct={pct} size={96} stroke={7} color={sc} label={`${pct}%`} sub="SCORE"/>
          <div style={{fontSize:22,fontWeight:800,fontFamily:C.FM,marginBottom:4,color:sc,marginTop:12}}>{scoreRef.current}/{tot} correct</div>
          <div style={{fontSize:13,color:C.t2}}>{quiz.title}</div>
          {!readonly&&<div style={{fontSize:11,color:C.t3,marginTop:4,fontFamily:C.FM,display:'inline-flex',alignItems:'center',gap:4}}><Timer size={11}/>{fmtT(elapsed)} elapsed</div>}
          <div style={R({justifyContent:'center',gap:8,marginTop:20})}>
            <button style={{...btn(accentGrad(sc)),display:'inline-flex',alignItems:'center',gap:8}} onClick={()=>onFinish(scoreRef.current,tot)}>Save & exit<ArrowRight size={15}/></button>
            <button style={{...btnG(),display:'inline-flex',alignItems:'center',gap:4}} onClick={()=>exportQuizResult(quiz,answers,scoreRef.current,tot)}><FileDown size={14}/>Export PDF</button>
          </div>
        </div>
        <div style={R({justifyContent:'space-between',marginBottom:16})}>
          <span style={{fontSize:10,fontWeight:700,color:C.t3,letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))'}}>Review · Q {ri+1} / {tot}</span>
          <div style={R({gap:8})}>
            <button style={{...btnSm(C.s3,{color:C.t2}),display:'inline-flex',alignItems:'center',gap:4}} onClick={()=>setRi(i=>Math.max(0,i-1))} disabled={ri===0}><ChevronLeft size={13}/>Prev</button>
            <button style={{...btnSm(C.s3,{color:C.t2}),display:'inline-flex',alignItems:'center',gap:4}} onClick={()=>setRi(i=>Math.min(tot-1,i+1))} disabled={ri===tot-1}>Next<ChevronRight size={13}/></button>
          </div>
        </div>
        {a&&<div style={glass()}>
          <MathText text={a.q} style={{fontSize:15,fontWeight:600,lineHeight:1.7,color:C.t1,fontFamily:C.FB,display:'block',marginBottom:16}}/>
          <div style={CC({gap:8})}>
            {a.choices.map((ch,ci)=>{const ok=ci===a.correct,bad=ci===a.sel&&!a.ok;return(
              <div key={ci} style={{...glass2({background:ok?C.greenDim:bad?C.roseDim:'rgba(255,255,255,0.02)',border:`1px solid ${ok?`${C.green}40`:bad?`${C.rose}40`:C.b1}`,padding:'12px 16px'}),display:'flex',gap:12,alignItems:'center'}}>
                <span style={{width:26,height:26,borderRadius:8,background:ok?`${C.green}20`:bad?`${C.rose}20`:C.s3,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:ok?C.green:bad?C.rose:C.t3,flexShrink:0,fontFamily:C.FM,border:`1px solid ${ok?`${C.green}40`:bad?`${C.rose}40`:C.b1}`}}>{ok?<Check size={13}/>:bad?<X size={13}/>:String.fromCharCode(65+ci)}</span>
                <span style={{fontSize:13,color:ok?C.green:bad?C.rose:C.t2,lineHeight:1.5}}>{ch}</span>
              </div>
            );})}
          </div>
          <div style={{marginTop:16,background:C.blueDim,border:`1px solid rgba(45,127,255,0.2)`,borderRadius:8,padding:16}}>
            <div style={{fontSize:10,fontWeight:700,color:C.blueL,letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))',marginBottom:8}}>Explanation</div>
            <MathText text={a.exp} style={{fontSize:13,color:C.t1,lineHeight:1.75,display:'block'}}/>
          </div>
        </div>}
        {/* gap 8, not 4: on a touch screen each of these chips carries a 44px
            hit area (see the touch-target block in index.css), and at a 4px gap
            those areas overlap enough that a thumb aiming at question 7 lands
            on 6. 8px is the minimum separation that keeps adjacent targets
            distinguishable. */}
        <div style={R({flexWrap:'wrap',gap:8,marginTop:16})}>
          {/* The selected chip is marked with a box-shadow ring rather than an
              `outline`, because `outline` is now the focus indicator and only
              the focus indicator. Drawing selection with the same property put
              two different meanings on one visual — a keyboard user tabbing
              across this grid could not tell which chip was focused and which
              was merely being reviewed. box-shadow sits outside the box model
              too, so nothing shifts.
              data-fixed-height: a square chip holding one or two digits, with
              nothing to reflow at any spacing setting. */}
          {answers.map((ans,i)=><button key={i} data-fixed-height onClick={()=>setRi(i)} aria-label={`Question ${i+1}, ${ans.ok?'correct':'incorrect'}`} aria-current={ri===i?'true':undefined} style={{width:28,height:28,borderRadius:4,background:ans.ok?C.green:C.rose,border:'none',cursor:'pointer',fontSize:10,color:'#fff',fontWeight:700,fontFamily:C.FM,boxShadow:ri===i?`0 0 0 2px ${C.bg}, 0 0 0 4px ${C.t1}`:undefined,opacity:ri===i?1:.55,transition:'opacity .15s'}}>{i+1}</button>)}
        </div>
      </div>
    );
  }

  return(
    <div style={{padding:m?16:28}}>
      <div style={R({marginBottom:m?18:26})}>
        <div style={{flex:1}}>
          <div style={R({gap:8,marginBottom:8})}>
            <span style={{fontSize:11,color:C.t3,fontFamily:C.FM}}>{readonly?'Reviewing':'Question'} {qi+1} / {tot}</span>
            {!readonly&&<span style={{fontSize:11,color:C.t3,fontFamily:C.FM,display:'inline-flex',alignItems:'center',gap:4,marginLeft:'auto',marginRight:12}}><Timer size={11}/>{fmtT(elapsed)}</span>}
          </div>
          <Bar pct={prog} color={accent} h={3} glow/>
        </div>
        <button onClick={onClose} aria-label="Exit quiz" title="Exit quiz" style={{...btnG({padding:'8px',marginLeft:16,width:32,height:32}),display:'inline-flex',alignItems:'center',justifyContent:'center'}}><X size={15}/></button>
      </div>
      <MathText text={q.q} style={{fontSize:m?15:17,fontWeight:600,lineHeight:1.75,marginBottom:m?18:24,color:C.t1,fontFamily:C.FB,display:'block'}}/>
      <div style={CC({gap:m?8:10})}>
        {q.ch.map((ch,ci)=>{
          let bg='rgba(255,255,255,0.025)',brd=C.b1,tc=C.t2;
          if(sel===ci&&!conf){bg=C.blueDim;brd=`${C.blue}60`;tc=C.t1;}
          if(conf){if(ci===q.ans){bg=C.greenDim;brd=`${C.green}50`;tc=C.green;}else if(ci===sel){bg=C.roseDim;brd=`${C.rose}50`;tc=C.rose;}}
          return(
            <motion.div key={ci} whileHover={!conf?{scale:1.01}:{}} whileTap={!conf?{scale:.99}:{}} onClick={()=>{if(!conf){setSel(ci);play('select');}}}
              style={{...glass2({background:bg,border:`1px solid ${brd}30`,padding:m?'12px 14px':'14px 18px'}),cursor:conf?'default':'pointer',display:'flex',alignItems:'center',gap:m?10:14,transition:'background .15s,border-color .15s'}}>
              <span style={{width:m?24:28,height:m?24:28,borderRadius:8,background:conf&&ci===q.ans?`${C.green}20`:conf&&ci===sel?`${C.rose}20`:sel===ci?C.blueDim:C.s4,border:`1px solid ${conf&&ci===q.ans?`${C.green}40`:conf&&ci===sel?`${C.rose}40`:sel===ci?`${C.blue}50`:C.b1}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:tc,flexShrink:0,fontFamily:C.FM}}>{String.fromCharCode(65+ci)}</span>
              <span style={{fontSize:m?13:14,lineHeight:1.6,color:conf?tc:sel===ci?C.t1:C.t2,fontFamily:C.FB}}>{ch}</span>
              {conf&&ci===q.ans&&<motion.span initial={{scale:0}} animate={{scale:1}} style={{marginLeft:'auto',color:C.green,display:'flex'}}><Check size={18}/></motion.span>}
              {conf&&ci===sel&&ci!==q.ans&&<motion.span initial={{scale:0}} animate={{scale:1}} style={{marginLeft:'auto',color:C.rose,display:'flex'}}><X size={18}/></motion.span>}
            </motion.div>
          );
        })}
      </div>
      {conf&&<motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} style={{marginTop:16,background:C.blueDim,border:`1px solid rgba(45,127,255,0.2)`,borderRadius:8,padding:16}}>
        <div style={{fontSize:10,fontWeight:700,color:C.blueL,letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))',marginBottom:8}}>Explanation</div>
        <MathText text={q.exp} style={{fontSize:13,color:C.t1,lineHeight:1.75,display:'block'}}/>
      </motion.div>}
      <div style={{marginTop:20,...R({justifyContent:'flex-end',gap:8})}}>
        {!conf&&sel!==null&&<button style={{...btn(),display:'inline-flex',alignItems:'center',gap:8}} onClick={confirm}>Confirm answer<ArrowRight size={15}/></button>}
        {conf&&<button style={{...btn(),display:'inline-flex',alignItems:'center',gap:8}} onClick={next}>{qi<tot-1?'Next Question':'View Results'}<ArrowRight size={15}/></button>}
      </div>
    </div>
  );
}

// ── Flip Card ─────────────────────────────────────────────────────────────────
// Per call, not a frozen literal — see the note in theme.js's header.
const diffColor = (d) => ({ easy:C.green, medium:C.amber, hard:C.rose }[d]);
function FlipCard({card,flipped,onClick,m=false,streak=0}){
  const [showHint,setShowHint]=useState(false);
  const ret=getRetainability(card);const nxt=card.due?nextReviewLabel(card):null;
  const dCol=diffColor(card.difficulty)||C.blueL;
  const heat=Math.min(streak,10)/10; // 0→1, brightens the glow as the streak climbs
  const glowShadow=streak>=3
    ? `0 8px 40px rgba(245,158,11,${0.10+heat*0.28}),0 0 0 1px rgba(245,158,11,${0.14+heat*0.22}),inset 0 1px 0 rgba(255,255,255,0.05)`
    : '0 2px 12px rgba(0,0,0,0.5),inset 0 1px 0 rgba(255,255,255,0.04)';
  return(
    <div style={{perspective:1200,width:'100%',minHeight:m?320:260}}>
      <motion.div key={card.front} initial={{opacity:0,scale:.97}} animate={{opacity:1,scale:1,rotateY:flipped?180:0}} transition={{rotateY:{duration:.55,ease:[.16,1,.3,1]},opacity:{duration:.25},scale:{duration:.25}}} style={{position:'relative',width:'100%',minHeight:m?320:260,transformStyle:'preserve-3d'}}>
        {/* Front */}
        <div onClick={()=>{onClick();play('flip');setShowHint(false);}} style={{position:'absolute',inset:0,cursor:'pointer',backfaceVisibility:'hidden',WebkitBackfaceVisibility:'hidden',...glass({display:'flex',alignItems:'center',justifyContent:'center',textAlign:'center',flexDirection:'column',gap:16,padding:m?24:36,boxShadow:glowShadow,transition:'box-shadow .4s ease',overflowY:'auto'})}}>
          <div style={{position:'absolute',top:16,left:16,...R({gap:4,flexWrap:'wrap',maxWidth:'60%'})}}>
            {card.category&&<span style={pill(C.s4,C.t2,{fontSize:9.5})}>{card.category}</span>}
            {card.difficulty&&<span style={pill(`${dCol}18`,dCol,{fontSize:9.5})}>{card.difficulty}</span>}
            {card.type==='cloze'&&<span style={pill(C.violetDim,C.violetL,{fontSize:9.5})}>Fill in the blank</span>}
          </div>
          {nxt&&<div style={{...pill(C.blueDim,C.blueL,{fontSize:10,position:'absolute',top:16,right:16})}}>{`Next: ${nxt}`}</div>}
          <div style={{fontSize:10,fontWeight:700,color:C.t3,letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', marginTop:card.category||card.difficulty||card.type==='cloze'?14:0}}>QUESTION · Tap to reveal</div>
          <MathText text={card.front} style={{fontSize:m?16:18,fontWeight:600,lineHeight: 1.55,color:C.t1,fontFamily:C.FD,display:'block'}}/>
          {card.hint&&(
            <div onClick={e=>e.stopPropagation()}>
              {showHint?(
                <div style={{...pill(C.amberDim,C.amberL,{fontSize:11,gap:4,maxWidth:360,whiteSpace:'normal',textAlign:'left'})}}><Lightbulb size={12} style={{flexShrink:0}}/>{card.hint}</div>
              ):(
                <button onClick={()=>setShowHint(true)} style={{...btnSm(C.s4,{color:C.t2,fontSize:11}),display:'inline-flex',alignItems:'center',gap:4}}><Lightbulb size={12}/>Show hint</button>
              )}
            </div>
          )}
          <div style={R({gap:4,justifyContent:'center',marginTop:4})}>{[0,1,2].map(i=><div key={i} style={{width:5,height:5,borderRadius:'50%',background:C.s5}}/>)}</div>
        </div>
        {/* Back */}
        <div onClick={()=>{onClick();play('flip');}} style={{position:'absolute',inset:0,cursor:'pointer',backfaceVisibility:'hidden',WebkitBackfaceVisibility:'hidden',transform:'rotateY(180deg)',background:`linear-gradient(135deg,${C.blueDim},rgba(6,182,212,0.08))`,border:`1px solid rgba(45,127,255,0.2)`,borderRadius:16,display:'flex',alignItems:'center',justifyContent:'center',textAlign:'center',flexDirection:'column',gap:16,padding:m?24:36,boxShadow:glowShadow,transition:'box-shadow .4s ease',overflowY:'auto'}}>
          <div style={{position:'absolute',top:16,left:16,...R({gap:4})}}>
            {card.category&&<span style={pill(C.s4,C.t2,{fontSize:9.5})}>{card.category}</span>}
          </div>
          <div style={{fontSize:10,fontWeight:700,color:C.blueL,letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))'}}>ANSWER</div>
          <MathText text={card.back} style={{fontSize:m?14:16,lineHeight: 1.55,color:C.t1,fontFamily:C.FB,display:'block'}}/>
          <div style={R({gap:4,justifyContent:'center'})}>
            {ret!==null&&<div style={{...pill(C.greenDim,C.greenL,{fontSize:10})}}>Retention: {ret}%</div>}
            {streak>=3&&<div style={{...pill(C.amberDim,C.amberL,{fontSize:10}),display:'inline-flex',alignItems:'center',gap:4}}><Flame size={11}/>{streak} streak</div>}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ── Card Manager Modal (add/edit/delete cards in a custom deck) ──────────────
function CardManagerModal({deckName,cards,onAdd,onUpdate,onDelete,onClose,m=false}){
  const [editIdx,setEditIdx]=useState(null);
  const [editFront,setEditFront]=useState('');
  const [editBack,setEditBack]=useState('');
  const [newFront,setNewFront]=useState('');
  const [newBack,setNewBack]=useState('');

  useEffect(()=>{const h=e=>{if(e.key==='Escape')onClose();};document.addEventListener('keydown',h);return()=>document.removeEventListener('keydown',h);},[onClose]);

  function startEdit(i){setEditIdx(i);setEditFront(cards[i].front);setEditBack(cards[i].back);}
  function saveEdit(){if(editFront.trim()&&editBack.trim())onUpdate(editIdx,editFront.trim(),editBack.trim());setEditIdx(null);}
  function addCard(){if(!newFront.trim()||!newBack.trim())return;onAdd(newFront.trim(),newBack.trim());setNewFront('');setNewBack('');}

  return(
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:m?12:24,backdropFilter:'blur(6px)'}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <motion.div initial={{scale:.96,y:10}} animate={{scale:1,y:0}} exit={{scale:.96,y:10}} style={{width:'100%',maxWidth:640,maxHeight:'85vh',display:'flex',flexDirection:'column',...glass({padding:0,overflow:'hidden',borderRadius:m?12:18,border:`1px solid ${C.b2}`,boxShadow:'0 40px 100px rgba(0,0,0,0.9)'})}}>
        <div style={{...R({justifyContent:'space-between'}),padding:'16px 20px',borderBottom:`1px solid ${C.b1}`,background:C.s1,flexShrink:0}}>
          <div>
            <div style={{fontSize:15, letterSpacing: 'calc(-0.02px + var(--msp-letter-spacing))',fontWeight:700,color:C.t1,fontFamily:C.FD}}>Manage Cards</div>
            <div style={{fontSize:11,color:C.t3,marginTop:4}}>{deckName} · {cards.length} card{cards.length===1?'':'s'}</div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',color:C.t3,cursor:'pointer',width:32,height:32,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:8}} onMouseEnter={e=>e.currentTarget.style.color=C.t1} onMouseLeave={e=>e.currentTarget.style.color=C.t3}><X size={16}/></button>
        </div>
        <div style={{flex:1,overflowY:'auto',padding:20}}>
          <div style={CC({gap:8,marginBottom:16})}>
            {cards.map((c,i)=>(
              <div key={i} style={glass2({padding:12})}>
                {editIdx===i?(
                  <div style={CC({gap:8})}>
                    <textarea style={inp({minHeight:50,resize:'vertical',fontSize:12.5})} value={editFront} onChange={e=>setEditFront(e.target.value)} placeholder="Front (question)"/>
                    <textarea style={inp({minHeight:50,resize:'vertical',fontSize:12.5})} value={editBack} onChange={e=>setEditBack(e.target.value)} placeholder="Back (answer)"/>
                    <div style={R({gap:8})}>
                      <button style={btnSm(C.blueGrad,{color:C.onAccent,fontSize:11})} onClick={saveEdit}>Save</button>
                      <button style={btnG({fontSize:11,padding:'4px 12px'})} onClick={()=>setEditIdx(null)}>Cancel</button>
                    </div>
                  </div>
                ):(
                  <div style={R({alignItems:'flex-start',gap:8})}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12.5,color:C.t1,fontWeight:600,lineHeight:1.5,marginBottom:4}}>{c.front}</div>
                      <div style={{fontSize:12,color:C.t3,lineHeight:1.5}}>{c.back}</div>
                    </div>
                    <div style={R({gap:4,flexShrink:0})}>
                      <button style={{background:'none',border:'none',color:C.t3,cursor:'pointer',padding:4,borderRadius:4}} onClick={()=>startEdit(i)} aria-label="Edit" title="Edit"><ScrollText size={13}/></button>
                      <button style={{background:'none',border:'none',color:C.rose,cursor:'pointer',padding:4,borderRadius:4}} onClick={()=>onDelete(i)} aria-label="Delete" title="Delete"><Trash2 size={13}/></button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {cards.length===0&&<div style={{textAlign:'center',color:C.t3,padding:'20px 0px',fontSize:12.5}}>No cards yet — add your first one below.</div>}
          </div>
        </div>
        <div style={{padding:16,borderTop:`1px solid ${C.b1}`,background:C.s1,flexShrink:0}}>
          <div style={lbl()}>Add a card</div>
          <div style={CC({gap:8})}>
            <textarea style={inp({minHeight:44,resize:'vertical',fontSize:12.5})} value={newFront} onChange={e=>setNewFront(e.target.value)} placeholder="Front (question)"/>
            <textarea style={inp({minHeight:44,resize:'vertical',fontSize:12.5})} value={newBack} onChange={e=>setNewBack(e.target.value)} placeholder="Back (answer)"/>
            <button style={{...btn(C.blueGrad,{fontSize:12,alignSelf:'flex-start'}),display:'inline-flex',alignItems:'center',gap:4}} onClick={addCard} disabled={!newFront.trim()||!newBack.trim()}><Plus size={14}/>Add card</button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── New Deck Modal ────────────────────────────────────────────────────────────
function NewDeckModal({onCreate,onClose,m=false}){
  const [name,setName]=useState('');
  useEffect(()=>{const h=e=>{if(e.key==='Escape')onClose();};document.addEventListener('keydown',h);return()=>document.removeEventListener('keydown',h);},[onClose]);
  return(
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:m?12:24,backdropFilter:'blur(6px)'}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <motion.div initial={{scale:.96,y:10}} animate={{scale:1,y:0}} exit={{scale:.96,y:10}} style={{width:'100%',maxWidth:420,...glass({borderRadius:m?12:18,border:`1px solid ${C.b2}`,boxShadow:'0 40px 100px rgba(0,0,0,0.9)'})}}>
        <div style={{fontSize:15, letterSpacing: 'calc(-0.02px + var(--msp-letter-spacing))',fontWeight:700,color:C.t1,fontFamily:C.FD,marginBottom:12}}>New Deck</div>
        <input autoFocus style={{...inp(),marginBottom:12}} placeholder="Deck name (e.g. Cell Biology Vocab)" value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&name.trim())onCreate(name.trim());}}/>
        <div style={R({gap:8})}>
          <button style={btn(C.blueGrad,{fontSize:12.5})} onClick={()=>name.trim()&&onCreate(name.trim())} disabled={!name.trim()}>Create deck</button>
          <button style={btnG({fontSize:12.5})} onClick={onClose}>Cancel</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Pathway Overview Card ────────────────────────────────────────────────────
// PATH_ICONS now lives in components/PathwaySwitcher.jsx (imported above) so the switcher
// surfaces and this file share exactly one pathway→icon mapping.
// Which pathway each lesson belongs to. With parallel pathways a student can open a lesson
// from a pathway that isn't the focused one (straight off the parallel board), so every
// per-pathway write on completion — unit mastery, milestone nudges, the completion badge —
// has to ask the lesson rather than assume `user.specialty`.
const LESSON_PATHWAY = buildLessonPathwayIndex(PATHS);
// Roadmap item key → icon + accent, used by the Portfolio Class Year Roadmap.
const ROADMAP_ICONS = {
  diagnostic:{Ic:Compass,color:C.blue}, flashcards:{Ic:Layers3,color:C.violet}, quiz:{Ic:Layers,color:C.green},
  activity:{Ic:Award,color:C.orange}, clinical:{Ic:Stethoscope,color:C.cyan}, colleges:{Ic:GraduationCap,color:C.amber},
  recommenders:{Ic:UserCheck,color:C.violetL}, essays:{Ic:ScrollText,color:C.rose}, deadlines:{Ic:CalendarDays,color:C.roseL},
  interview:{Ic:Mic,color:C.blueL}, resume:{Ic:Award,color:C.violet}, aid:{Ic:Handshake,color:C.green}, mastery:{Ic:Route,color:C.blue},
};
/**
 * The full detail card for a single pathway (diagnostic intro + the "pick one first" screens).
 *
 * `current` = this pathway is the one in focus. `enrolled` = it is one of the up-to-three the
 * student is running. The two are different states now and the card has to say which is which,
 * because "Currently Active" on a card while two other pathways are also active would be a
 * straightforward lie. `full` disables adding a fourth, and says why rather than just greying out.
 */
function PathwayCard({ pathKey, p, current, enrolled=false, full=false, onSelect, m=false }){
  const Ic = PATH_ICONS[pathKey]||Compass;
  const lessonCount = (p.units||[]).reduce((s,u)=>s+(u.lessons?.length||0),0);
  return(
    <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} whileHover={{y:-2,borderColor:`${p.accent}45`,boxShadow:`0 10px 32px rgba(0,0,0,0.5),0 0 0 1px ${p.accent}25`}}
      style={{...glass({padding:m?18:24,transition:'box-shadow .2s,border-color .2s'}),border:current?`1px solid ${p.accent}55`:`1px solid ${C.b1}`}}>
      <div style={R({alignItems:'flex-start',marginBottom:12})}>
        <div style={{width:44,height:44,borderRadius:12,background:`${p.accent}18`,border:`1px solid ${p.accent}35`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Ic size={20} color={accentText(p.accent)}/></div>
        <div style={{flex:1,minWidth:0}}>
          <div style={R({gap:8})}>
            <div style={{fontSize:16,fontWeight:800,color:C.t1,fontFamily:C.FD,letterSpacing: 'calc(-0.05px + var(--msp-letter-spacing))'}}>{p.label}</div>
            {current
              ?<span style={{...pill(`${p.accent}20`,p.accent,{fontSize:9}),display:'inline-flex',alignItems:'center',gap:4,flexShrink:0}}><Check size={9}/>In focus</span>
              :enrolled&&<span style={{...pill(`${p.accent}18`,accentText(p.accent),{fontSize:9}),display:'inline-flex',alignItems:'center',gap:4,flexShrink:0}}><Check size={9}/>Studying</span>}
          </div>
          {p.tagline&&<div style={{fontSize:12,color:accentText(p.accent),marginTop:4,fontWeight:600,lineHeight:1.4}}>{p.tagline}</div>}
        </div>
      </div>
      {p.overview&&<p style={{fontSize:12.5,color:C.t2,lineHeight: 1.55,margin:'0px 0px 16px'}}>{p.overview}</p>}
      {p.highlights&&<div style={{marginBottom:16}}>
        <div style={{fontSize:9,fontWeight:700,color:C.t3,letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', marginBottom:8}}>What this pathway builds</div>
        <div style={CC({gap:8})}>
          {p.highlights.map((h,i)=>(
            <div key={i} style={{display:'flex',gap:8,alignItems:'flex-start'}}>
              <Check size={12} color={accentText(p.accent)} style={{flexShrink:0,marginTop:4}}/>
              <span style={{fontSize:12,color:C.t2,lineHeight: 1.55}}>{h}</span>
            </div>
          ))}
        </div>
      </div>}
      {p.outcomes&&<div style={{marginBottom:16}}>
        <div style={{fontSize:9,fontWeight:700,color:C.t3,letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', marginBottom:8}}>Leads toward majors like</div>
        <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
          {p.outcomes.map(o=><span key={o} style={pill(C.s3,C.t2,{fontSize:10,border:`1px solid ${C.b1}`})}>{o}</span>)}
        </div>
      </div>}
      {p.bestFor&&<div style={{marginBottom:16,background:'rgba(255,255,255,0.02)',border:`1px solid ${C.b1}`,borderRadius:8,padding:'12px 12px'}}>
        <div style={{fontSize:9,fontWeight:700,color:C.t3,letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', marginBottom:8}}>This might be for you if</div>
        <div style={CC({gap:4})}>
          {p.bestFor.map((b,i)=><div key={i} style={{fontSize:11.5,color:C.t2,lineHeight: 1.55}}>· {b}</div>)}
        </div>
      </div>}
      <div style={R({justifyContent:'space-between'})}>
        <span style={{fontSize:10,color:C.t3,fontFamily:C.FM}}>{(p.units||[]).length} units · {lessonCount} lessons</span>
        {(()=>{
          const blocked=current||(full&&!enrolled);
          return(
            <motion.button whileHover={blocked?undefined:{scale:1.03}} whileTap={blocked?undefined:{scale:.97}} disabled={blocked}
              title={full&&!enrolled&&!current?`You're already studying ${MAX_ACTIVE_PATHWAYS} pathways — swap one out on the Pathways page to add this.`:undefined}
              style={{...btn(blocked?C.s3:accentGrad(p.accent),{fontSize:11.5,padding:'8px 16px',opacity:blocked?.6:1,cursor:blocked?'default':'pointer',boxShadow:blocked?'none':`0 4px 14px ${p.accent}35`}),display:'inline-flex',alignItems:'center',gap:4}}
              onClick={()=>!blocked&&onSelect(pathKey)}>
              {current?<>Studying now<Check size={13}/></>
                :enrolled?<>Switch to this<ChevronRight size={13}/></>
                :full?<>All {MAX_ACTIVE_PATHWAYS} slots in use<Lock size={12}/></>
                :<>Add this pathway<Plus size={13}/></>}
            </motion.button>
          );
        })()}
      </div>
    </motion.div>
  );
}

// ── The end-of-grid affordance for a windowed list ──────────────────────────
//
// Declared at module scope rather than inside the render function that uses it.
// A component declared inside a render is a NEW COMPONENT TYPE on every render,
// so React cannot reconcile it — it unmounts the old subtree and mounts a fresh
// one each time, which here would tear down and rebuild the sentinel and its
// IntersectionObserver on every keystroke in the search box. Out here it is one
// stable type and the subtree updates in place.
//
// The sentinel is what makes scrolling feel like an ordinary long page; the button
// is what a keyboard user reaches, since tabbing past the last card never scrolls a
// sentinel into view. The live count is the honest answer to "is this everything?" —
// without it a windowed list is indistinguishable from a truncated one.
//
// `older` flips it for a tail window (the coach transcript): the control sits ABOVE
// the rows, reveals what came before rather than what comes next, and deliberately
// has no sentinel — auto-loading on scroll-up fights the browser's scroll anchoring
// and yanks the thread under the reader. Loading older messages stays an explicit ask.
function MoreRows({ win, label, older = false }) {
  if (!win.hasMore) return null;
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:8,padding:older?'4px 0 16px':'16px 0 4px'}}>
      {!older&&<div ref={win.sentinelRef} aria-hidden="true" style={{width:1,height:1}}/>}
      <button
        onClick={win.showMore}
        style={{background:tint(C.t1,0.04),border:`1px solid ${C.b1}`,borderRadius:12,
                padding:'8px 16px',color:C.t2,fontSize:12,fontWeight:700,cursor:'pointer',
                fontFamily:C.FB,transition:CONTROL_TRANSITION}}
      >
        {older?`Load earlier ${label}`:`Show more ${label}`}
      </button>
      <div aria-live="polite" style={{fontSize:10.5,color:C.t3}}>
        {older
          ? `${win.remaining} earlier in this conversation`
          : `Showing ${win.visible.length} of ${win.total} \u00b7 ${win.remaining} more`}
      </div>
    </div>
  );
}

// ── Achievement Toast ─────────────────────────────────────────────────────────
function showAchievementToast(achievement) {
  play('achieve');
  celebrateAchievement();
  const AIc=ACH_ICONS[achievement.icon]||Award;
  toast.custom((t) => (
    <motion.div initial={{scale:.8,opacity:0,y:-20}} animate={{scale:1,opacity:1,y:0}} exit={{scale:.8,opacity:0}} style={{background:C.s1,border:`1px solid ${C.amber}40`,borderRadius:12,padding:'12px 16px',display:'flex',alignItems:'center',gap:12,boxShadow:`0 8px 32px rgba(0,0,0,0.6),0 0 0 1px ${C.amber}20`,maxWidth:320,fontFamily:C.FB,cursor:'pointer'}} onClick={()=>toast.dismiss(t.id)}>
      <div style={{width:40,height:40,borderRadius:8,background:`${C.amber}18`,border:`1px solid ${C.amber}30`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><AIc size={19} color={C.amberL}/></div>
      <div>
        <div style={{fontSize:12,fontWeight:700,color:C.amberL,letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', marginBottom:4}}>Achievement Unlocked!</div>
        <div style={{fontSize:14,fontWeight:700,color:C.t1}}>{achievement.name}</div>
        <div style={{fontSize:12,color:C.t2,marginTop:4}}>{achievement.desc}</div>
        <div style={{...pill(C.amberDim,C.amberL,{fontSize:10,marginTop:4})}}>+{achievement.xp} XP</div>
      </div>
    </motion.div>
  ), { duration:5000 });
}
// A per-student seed for Medabrain Picks' tie-break (see studentTiebreak() in lib/recommend.js) —
// generated once and persisted, never regenerated, so the SAME student's ranking stays stable
// across sessions while DIFFERENT students/devices never land on the exact same tie order just
// because their profiles happen to look alike (e.g. both brand new, same pathway, no quiz history).
function getMedabrainSeed() {
  try {
    const KEY = 'msp_medabrain_seed';
    let seed = localStorage.getItem(KEY);
    if (!seed) {
      seed = (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
      localStorage.setItem(KEY, seed);
    }
    return seed;
  } catch {
    return null; // localStorage unavailable (e.g. private mode) — ranking still works, just without the tiebreak
  }
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function App({ account, onAccountChange, onOpenLegal }) {
  // The legal documents live above the app shell (AuthGate renders them ahead
  // of the signed-in branch), so opening one from in here is a navigation, not
  // a tab change. Falls back to letting the anchor's href do a normal page load
  // if the callback is absent — a legal link that does nothing on click is
  // worse than no link at all.
  const openLegalLink = React.useCallback((path) => (e) => {
    if (!onOpenLegal) return;
    e.preventDefault();
    onOpenLegal(path);
  }, [onOpenLegal]);
  // One source of truth for "how much room is there" — see useIsMobile in
  // components/ui/primitives.jsx for why this is no longer a media query.
  const viewport = useViewport();
  const isMobile = viewport.isMobile;

  // ── DB loading ──────────────────────────────────────────────────────────────
  const [dbReady, setDbReady] = useState(false);

  // ── Core state ──────────────────────────────────────────────────────────────
  // Every user record entering React state passes through here first, so a
  // master plan generated before the SAT pillar was sealed (src/lib/betaFlags.js)
  // loses its SAT tasks on the way in — one choke point rather than a filter in
  // PlansTab, PlanTaskStrip, PortfolioPlanWeek and every progress counter. The
  // stored record is left alone; the next saveUser writes the cleaned plan back.
  const [user, setUserRaw] = useState(null);
  const setUser_ = useCallback((next) => {
    setUserRaw((prev) => {
      const value = typeof next === 'function' ? next(prev) : next;
      if (!value?.masterPlan?.days?.length) return value;
      const days = dropRetiredTasks(value.masterPlan.days);
      return days === value.masterPlan.days ? value : { ...value, masterPlan: { ...value.masterPlan, days } };
    });
  }, []);
  const [pathway,  setPathway_] = useState({});
  const [qScores,  setQScores_] = useState({});
  const [qHistory, setQHistory] = useState([]);
  const [cDecks,   setCDecks_]  = useState({});
  // A ref mirror, so the stable `saveDeck` callback below can ask "is this deck new" without
  // taking `cDecks` as a dependency — which would rebuild it on every card edit and re-render
  // every deck surface in the app.
  const cDecksRef = useRef({});
  // Highlights are credited in threes (see addLessonHighlight); this counts toward the next one.
  const highlightRunRef = useRef(0);
  const [deckCreatedAt, setDeckCreatedAt] = useState({});
  const [portActivities, setPortActivities] = useState([]);
  const [portAwards,     setPortAwards]     = useState([]);
  const [portGpa,        setPortGpa]        = useState([]);
  const [portLoaded,     setPortLoaded]     = useState(false);
  // One shared snapshot of EVERY portfolio resource (src/lib/portfolioData.js), fetched once per
  // Portfolio visit and handed to the weekly-goal dashboards and the Tracked tab. Both surfaces
  // read the same rows, so a goal bar and the tracking report can never disagree about what the
  // student actually has.
  const [portSnapshot,   setPortSnapshot]   = useState(null);
  const [portSnapLoading,setPortSnapLoading]= useState(false);
  const [catPerf,  setCatPerf_] = useState({});
  const [achiev,   setAchiev_]  = useState(new Set());
  // The substance milestone earned most recently in THIS session, which is what the dashboard's
  // achievements module flashes. Session-scoped on purpose: a milestone earned last week should
  // not re-celebrate on every cold open, and persisting it would do exactly that.
  const [lastEarnedAchievement, setLastEarnedAchievement] = useState(null);
  const [streak,   setStreak]   = useState(0);
  const [comebackGap, setComebackGap] = useState(null); // days since last study day (returning-user nudge), null = n/a
  const [streakFreezes, setStreakFreezes] = useState(0);
  // ── Earned-streak state ────────────────────────────────────────────────────
  // `dayRows` is every dayActivity row (the calendar's data), `claimedStreakRewards`
  // the permanent claim ledger. Everything else about the streak — today's status,
  // the week, the target bar — is DERIVED from these below rather than stored, so
  // there is exactly one place a number can come from and no chance of two
  // surfaces disagreeing about whether today is done.
  const [dayRows, setDayRows] = useState([]);
  const [bridgedDates, setBridgedDates] = useState(new Set());
  const [claimedStreakRewards, setClaimedStreakRewards] = useState(new Set());
  // ── The expansion layer's own state ────────────────────────────────────────
  // `boosts` are the live XP multipliers (Dexie `boosts`, swept on read). `freezeHistory` is
  // every freeze row spent and unspent, for the receipt on the freeze card. `checkinState` is
  // the whole 28-day calendar in one object. `streakBusy` keys the three buttons that hit the
  // network or the database so each can disable itself without a spinner-per-callback.
  const [boosts, setBoosts] = useState([]);
  const [freezeHistory, setFreezeHistory] = useState([]);
  const [checkinState, setCheckinState] = useState(null);
  const [streakBusy, setStreakBusy] = useState({});
  // Today's three. `dailyEvents` is a SEPARATE evidence read from the long quests' one: theirs
  // is bounded by the oldest running quest and is empty when nothing is running, and a daily
  // quest has to work for a student who has never taken a long quest in their life.
  const [dailyEvents, setDailyEvents] = useState([]);
  const [dailyBusyKey, setDailyBusyKey] = useState(null);
  // The full-screen lesson-complete takeover (see LessonCompleteOverlay.jsx).
  const [lessonCelebration, setLessonCelebration] = useState(null);
  const [cosmetics, setCosmetics] = useState(new Set());
  const [chest, setChest] = useState(null); // { title, eyebrow, xp, cosmetic }
  const upcomingDeadlines = useDeadlines();
  // ── Who Medabrain requests are budgeted to ─────────────────────────────────
  // Set here, in the one place that learns who the student is, and read at call time by every
  // /api/groq caller in the app (see src/lib/aiLane.js). Threading the user object through
  // nineteen unrelated modules to achieve the same thing would be the worse trade.
  //
  // An effect rather than a hook into each setUser_ call site, because the requirement is "the
  // lane always matches the signed-in student", and an effect on the identity itself is the only
  // form of that which cannot be forgotten at a new call site. Runs with null on sign-out, which
  // is the correct value: an unclaimed request is budgeted to the network.
  useEffect(()=>{ setAiLane(user); },[user?.id,user?.email]);
  const [totalReviews, setTotalReviews] = useState(0);
  const [aiChatCount, setAiChatCount] = useState(0);
  const [interviewCount, setInterviewCount] = useState(0);
  const [coachRequestsRemaining, setCoachRequestsRemaining] = useState(300);
  const [coachRequestsUsedToday, setCoachRequestsUsedToday] = useState(0);
  // Kept in sync with api/groq.js's DAILY_LIMIT (returned as `dailyLimit` on every response)
  // instead of hardcoded, so the usage bar/label below never drifts out of sync with the
  // server's actual cap the way a hardcoded number silently did before.
  const [coachDailyLimit, setCoachDailyLimit] = useState(300);
  const [appCounts, setAppCounts] = useState({colleges:0,essays:0,resume:false});
  const [clinicalHoursTotal, setClinicalHoursTotal] = useState(0);
  const [clinicalHoursEntries, setClinicalHoursEntries] = useState([]);
  const [recommendersCount, setRecommendersCount] = useState(0);
  // Lightweight portfolio-breadth counts so the head Medabrain coach's system prompt (see
  // buildCoachSystemPrompt) can reference them too — actual full-detail reasoning over these
  // resources lives in the Portfolio tab's "Ask Meta Brain" sidebar (purpose:'portfolio'), which
  // fetches the complete lists itself rather than relying on these summary counts.
  const [scholarshipCount, setScholarshipCount] = useState(0);
  // The tracked scholarship rows themselves (not just the count) — the Opportunities database
  // needs them to mark type:'Scholarship' entries as already-tracked and to dedupe a repeat tap.
  const [portScholarships, setPortScholarships] = useState([]);
  const [researchCount, setResearchCount] = useState(0);
  const [skillsCount, setSkillsCount] = useState(0);
  const [mmiCasperCount, setMmiCasperCount] = useState(0);
  const [weekCardReviews, setWeekCardReviews] = useState(0);
  const [questTick, setQuestTick] = useState(0);
  // ── Long-horizon quests ────────────────────────────────────────────────────
  // `questRows` is the server's list (every status, so the board can show history); `questEvents`
  // is this device's evidence, rebuilt from Dexie whenever something a quest could measure
  // happens. Progress itself is never stored in React — it is DERIVED from those two by the
  // engine, for the same reason the streak derives today's status rather than storing it: one
  // source, no chance of two surfaces disagreeing about the same bar.
  const [questRows, setQuestRows] = useState([]);
  const [questEvents, setQuestEvents] = useState([]);
  const [questsAvailable, setQuestsAvailable] = useState(true);
  const [questsLoading, setQuestsLoading] = useState(true);
  const [questBusyId, setQuestBusyId] = useState(null);
  const [questError, setQuestError] = useState(null);
  // The completion takeover, and the set of quest row ids already celebrated this session so a
  // re-render (or a second progress report) cannot fire it twice.
  const [questCelebration, setQuestCelebration] = useState(null);
  const celebratedQuests = useRef(new Set());
  const [pathwayGoal, setPathwayGoalState] = useState(null); // { pathwayKey, startedAt, targetWeeks } | null

  // ── UI state ────────────────────────────────────────────────────────────────
  // Where this session of the app starts. The URL wins when it names a real screen — a
  // bookmark, a shared link, a reload after the back button, a PWA cold start on a deep
  // link — and the last-persisted view state (src/lib/viewState.js) fills in everything
  // the URL didn't say. Computed once, on mount: after this, state leads and the address
  // bar follows (see the useAppRouter block below). The persisted half is what already
  // made a reload resume on the same screen instead of dropping back to Home — see the
  // restore/persist effects near the flashcards state below for the "resume mid-deck" case.
  const [boot] = useState(()=>bootRoute(loadViewState()));
  const [tab,   setTab]   = useState(boot.tab);
  // Mirrors `tab` into a plain external store, synchronously, before paint —
  // see src/lib/sat/activeTabStore.js for why SatToolsProvider needs this
  // instead of a prop.
  useLayoutEffect(() => { setActiveTab(tab); }, [tab]);
  const [vidM,  setVM]    = useState(null);
  // ── Lesson Player state (immersive Overview->Article->Video->Quiz->Complete) ─
  const [activeLesson, setActiveLesson] = useState(null); // { lesson, unit } while the player is open
  const [lessonStep, setLessonStep] = useState('overview');
  const [articleRead, setArticleRead] = useState(false);
  const [videoWatched, setVideoWatched] = useState(false);
  const [articleScrollPct, setArticleScrollPct] = useState(0); // exact scroll position within the article step, for resuming mid-passage
  // Explicit "yes, I actually did this" confirmations, per step, per lesson. Reaching the
  // bottom of a scroll container is evidence someone scrolled, not evidence someone read — and
  // the app was treating the two as the same thing. Ticks recorded here are the student's own
  // word for it, which is the only thing worth marking a lesson off against.
  const [lessonConfirms, setLessonConfirms] = useState({ article:false, video:false });
  // ── Prep Meta Brain (purpose:'prep') — lifted up here rather than owned locally by
  // PrepMetaBrain.jsx because the component is mounted from two different places (inside the
  // full-screen LessonPlayer overlay, and inside the Prep tab itself — LessonPlayer replaces
  // the entire app shell in an early return, so it can't share a DOM node/component instance
  // with the Prep tab's tree). Lifting open/messages here means the same conversation and
  // open/closed state survives a student entering or exiting a lesson, instead of resetting.
  const [prepBrainOpen, setPrepBrainOpen] = useState(false);
  const [prepBrainMessages, setPrepBrainMessages] = useState([]);
  // The SAT tab used to lift its own Medabrain conversation up here for the same
  // reason Prep's is lifted. It is gone with the seal (src/lib/betaFlags.js):
  // SatTab is passed a permanently-closed panel and an empty thread, because a
  // coach a student can neither open nor type into has no state worth keeping.
  // ── Lesson notes + highlights — loaded fresh for whichever lesson is active, so switching
  // lessons never bleeds one lesson's notes/highlights into another's UI, even for an instant.
  const [notesOpen, setNotesOpen] = useState(false);
  const [lessonNote, setLessonNote] = useState('');
  const [lessonHighlights, setLessonHighlightsState] = useState([]);
  const [reviewMode, setReviewMode] = useState(false); // true while browsing an already-verified lesson via the "Review" button, so it opens on Overview instead of snapping to Complete
  // ── Lesson difficulty feedback ("too easy / too hard / just right") ──────────
  // `lessonFeedbackRow` is the answer for whichever lesson is open (so re-opening a lesson
  // shows what Medabrain already wrote rather than asking again); `allLessonFeedback` is the
  // full history, which is what summarizeLessonFeedback turns into Medabrain's read on where
  // this student actually sits.
  const [lessonFeedbackRow, setLessonFeedbackRow] = useState(null);
  const [allLessonFeedback, setAllLessonFeedback] = useState([]);
  // Every highlight across every lesson — Medabrain reads these at the pathway level, since the
  // passages a student chose to mark are among the most direct evidence of what they care about
  // and what they found hard.
  const [allLessonHighlights, setAllLessonHighlights] = useState([]);
  const [allLessonNotes, setAllLessonNotes] = useState({});
  const [cmdOpen, setCmdOpen] = useState(false); // Cmd/Ctrl+K quick switcher
  const [cmdQ,    setCmdQ]    = useState('');
  // The last handful of screens this student was on, newest first, so an empty
  // palette leads with where they have been instead of with a fixed list of
  // thirty destinations. Read once at mount and kept in step by the effect
  // beside the router below. See src/lib/navMap.js.
  const [cmdRecents, setCmdRecents] = useState(readRecents);
  // ── The searchable library ─────────────────────────────────────────────────
  // ~900 curated records — every scholarship, opportunity, combined-degree
  // program, college, lesson and deck the app ships — loaded on the FIRST
  // keystroke of the first search and then held for the session. Not at mount:
  // it is a few hundred kilobytes of catalog that a student who never opens the
  // palette should never pay for, and the nav half of the search is synchronous
  // and already on screen while this resolves. See src/lib/contentSearch.js.
  const [contentIndex, setContentIndex] = useState(null);
  const [contentLoading, setContentLoading] = useState(false);

  // True for the rest of this session once completeOnboarding() runs — lets Home greet a
  // genuinely first-time user with "Welcome" instead of the default "Welcome back".
  const [justOnboarded, setJustOnboarded] = useState(false);
  // Two once-in-a-while interstitials, both dismissed for the rest of the session once handled:
  // the annual "still on track for the class of 2028?" check-in (first login of a new academic
  // year) and the "here's what changed and what's due" screen for a student coming back after
  // three weeks or more away. Both are landing screens rather than modals — see
  // GradYearCheckIn.jsx and ReturningBreakScreen.jsx.
  const [gradYearHandled, setGradYearHandled] = useState(false);
  const [breakScreenHandled, setBreakScreenHandled] = useState(false);
  const [sGrade, setSGrade] = useState(''); // settings: grade-stage editor
  // Dev-only: lets Settings re-open the ~30-screen onboarding wizard to preview it without
  // touching the signed-in account's saved profile. Remove once onboarding is stable.
  const [previewOnboarding, setPreviewOnboarding] = useState(false);

  // ── Prep / Portfolio sub-navigation ──────────────────────────────────────────
  // Prep and Portfolio each absorb several formerly-top-level tabs; these track
  // which absorbed view is active, switched via the SubNav pill bar.
  // Sub-view ids are also URL segments (/prep/flashcards, /portfolio/milestones …) — the
  // canonical list of each lives in src/lib/routes.js, which `npm run verify:routing`
  // pins to the *_SUBNAV arrays above so a new sub-tab can't ship without a URL.
  const [prepView, setPrepView] = useState(boot.prepView); // diagnostic|pathway|quizzes|flashcards|coach|library
  const [portfolioView, setPortfolioView] = useState(boot.portfolioView); // overview|tracked|milestones|colleges|essays|aid|resume|interview|calc
  const [roadmapView, setRoadmapView] = useState(boot.roadmapView); // overview|year|seasons|list|intake
  const [progressView, setProgressView] = useState(boot.progressView); // overview|verified|performance|achievements
  const [satView, setSatView] = useState(boot.satView); // overview|diagnostic|practice|tests|review|skills|scores
  const [settingsView, setSettingsView] = useState(boot.settingsView); // profile|study|family|appearance|medabrain|data|account
  // Deep-link params for the SAT tab (e.g. "drill this specific skill", "resume
  // this attempt"), set by the Overview's next-best-action card and by the
  // Review Log. Cleared by the receiving panel once consumed.
  const [satParams, setSatParams] = useState(null);

  // ── The brand journey ───────────────────────────────────────────────────────
  // Two hooks, both about the loading animation in src/components/BrandJourney.jsx.
  //
  // `bootPlayed` holds the boot screen open until the six beats have actually
  // played once. Without it a student on a fast connection sees a book start to
  // open and then the app cuts in — which is worse than no animation at all.
  // It is a per-tab gate, so a reload a minute later goes straight through.
  //
  // `showcase` is the same story shown when nothing is loading, because a
  // student whose data always arrives quickly would otherwise never see past
  // the first beat. It waits for a tab change (a moment they are already
  // pausing), stays out of the way while anything is genuinely in progress, and
  // does not come back for another twenty-five minutes.
  const [bootPlayed, markBootPlayed] = useFirstPassGate();
  const showcase = useBrandShowcase(
    tab,
    !activeLesson && !vidM && !cmdOpen && !questCelebration && !previewOnboarding
      && !(tab === 'sat' && ['tests', 'practice', 'diagnostic'].includes(satView)),
  );

  // Resolves retired sub-view ids on the way in (resolveView), which is what makes
  // goPrep('pathway') keep working: that id is still sitting inside every master plan row
  // generated before the rename, and a plan task whose destination silently no-ops is worse
  // than one that never had a destination at all.
  const goPrep = useCallback((view)=>{ setTab('prep'); const v=resolveView('prep',view); if(v) setPrepView(v); }, []);
  const goSat = useCallback((view, params=null)=>{ setTab('sat'); if(view) setSatView(view); setSatParams(params); }, []);
  // Which section of Activities & résumé is open. It lives here rather than inside the panel
  // because the three tabs that were merged into it are still addressed by name from all over
  // the app — the Home tiles, the weekly goals, the timeline's milestone actions, the class-year
  // roadmap, and every old /portfolio/clinical URL in a student's history. Those callers should
  // not have to know the merge happened: goPortfolio('clinical') still means "open the clinical
  // hours form", it just opens it as a section instead of a tab.
  // null is the ordinary case and the point of the merge: Activities & résumé is ONE scrolling
  // page, so the default is its summary, not one of its five parts. A value here means some
  // caller named a section and the page should jump to it.
  // { view, id, n } — the section of a merged Portfolio tab a caller named, and a nonce so
  // naming the same section twice still moves the page. null is the ordinary case and the point
  // of the merge: a merged tab is ONE scrolling page, so the default is its summary, not one of
  // its parts.
  const [portfolioSection, setPortfolioSection] = useState(()=>{
    const hit = portfolioSectionFromPath(typeof window!=='undefined' ? window.location.pathname : '');
    return hit ? { view:hit[0], id:hit[1], n:0 } : null;
  });
  const focusPortfolioSection = useCallback((view, id)=>{
    setPortfolioSection(prev => (prev && prev.view===view && prev.id===id ? prev : { view, id, n:(prev?.n||0)+1 }));
  }, []);
  const goPortfolio = useCallback((view)=>{
    setTab('portfolio');
    if(!view) return;
    const mapped = PORTFOLIO_GROUP_FOR_VIEW[view];
    if(mapped){ setPortfolioView(mapped[0]); focusPortfolioSection(mapped[0], mapped[1]); return; }
    setPortfolioView(view);
  }, [focusPortfolioSection]);
  // Which section each merged tab should jump to, or null when the student simply opened the tab.
  const sectionFor = useCallback((view)=>(portfolioSection?.view===view ? portfolioSection.id : null), [portfolioSection]);
  const sectionNonce = portfolioSection?.n || 0;
  const goProgress = useCallback((view)=>{ setTab('progress'); if(view) setProgressView(view); }, []);
  // Settings deep link. `field` names one editable profile field (see PLAN_READINESS_TARGETS in
  // src/lib/studentProfile.js) — passing it opens whichever editor owns that field, scrolls it
  // into view and highlights it, which is what makes the Plans lock screen's checklist rows
  // actual links instead of instructions to go hunting. Plain goSettings() is unchanged.
  const [settingsFocus,setSettingsFocus]=useState(null);
  // Which sub-tab a focusable profile field lives on. Without this, a deep link from the Plans
  // lock screen ("add your GPA") would open Settings on whatever sub-tab was last used and
  // highlight a field that is not currently rendered — the exact failure sub-tabs introduce and
  // the reason the mapping is data rather than a rule.
  const SETTINGS_VIEW_FOR_FIELD = useMemo(()=>({
    name:'profile', age:'profile', gpaBand:'profile', sciences:'profile', healthExperience:'profile',
    goal:'profile', accomplish:'profile', obstacles:'profile', whyMedicine:'profile', dreamRole:'profile',
    gradeStage:'study', specialty:'study', studyHours:'study',
    studyMethod:'study', addBack:'study', rollover:'study',
  }),[]);
  const goSettings = useCallback((field=null,view=null)=>{
    setTab('settings');
    const focus = typeof field==='string'?field:null;
    setSettingsFocus(focus);
    const wanted = view || (focus?SETTINGS_VIEW_FOR_FIELD[focus]:null);
    if(wanted) setSettingsView(wanted);
  }, [SETTINGS_VIEW_FOR_FIELD]);
  /** Straight to Settings ▸ Family Access — the parent-dashboard entry point, from anywhere. */
  const goFamily = useCallback(()=>{ setTab('settings'); setSettingsFocus(null); setSettingsView('family'); }, []);
  // How many people can see this account, for the rail's label. Fetched once per session rather
  // than polled: a connection changes when the student changes it (and ConnectionsPanel reloads
  // itself), so a poll here would be a request a minute to re-learn a number that almost never
  // moves. Failure is silent and leaves the label reading "Invite a parent", which is the right
  // thing to say when we don't know.
  const [familyLinkCount,setFamilyLinkCount]=useState(0);
  // Messages waiting from a parent. Nothing about family messages emails or notifies anybody, on
  // purpose (see supabase/migrations/0011_family_messages.sql) — so this number on this one rail
  // item is the ONLY way a student learns their mother asked them something. Fetched on the same
  // once-per-session terms as the link count and for the same reason; the panel itself reloads
  // when it is opened, and marking a thread read is what clears it.
  const [familyUnread,setFamilyUnread]=useState(0);
  useEffect(()=>{
    let cancelled=false;
    ParentAPI.listLinks()
      .then(({links})=>{ if(!cancelled) setFamilyLinkCount((links||[]).filter(l=>l.status==='active').length); })
      .catch(()=>{});
    ParentAPI.fetchMessages()
      .then(({unread})=>{ if(!cancelled) setFamilyUnread(unread||0); })
      .catch(()=>{});
    return ()=>{ cancelled=true; };
  },[]);
  const [plansOpenDate,setPlansOpenDate]=useState(null);
  const goPlans = useCallback((dateStr)=>{ setTab('plans'); setPlansOpenDate(dateStr||null); }, []);
  const goRoadmap = useCallback((view)=>{ setTab('roadmap'); if(view) setRoadmapView(view); }, []);
  // One generic (tab, view) jump, for surfaces that carry their own deep links as data rather
  // than as hard-coded callbacks — the Timeline's per-milestone actions (src/lib/timeline.js)
  // are the first of them, so a milestone can say "this is handled in Portfolio > Financial Aid"
  // in the catalog and have the button actually land there.
  const goAnywhere = useCallback((tabId, view)=>{
    if(tabId==='prep')return goPrep(view);
    if(tabId==='sat')return goSat(view);
    if(tabId==='portfolio')return goPortfolio(view);
    if(tabId==='progress')return goProgress(view);
    if(tabId==='plans')return goPlans();
    if(tabId==='settings')return goSettings(null,view);
    // Roadmap was missing here, which meant a data-driven deep link naming it —
    // a milestone action, a Home tile — silently landed on Home instead.
    if(tabId==='roadmap')return goRoadmap(view);
    setTab('home');
  }, [goPrep,goSat,goPortfolio,goProgress,goPlans,goSettings,goRoadmap]);

  /**
   * The same jump, taking one destination id instead of two arguments.
   *
   * The unlock ladder, the router and the nav keyword map all speak in ids —
   * 'plans', 'portfolio/essays', 'portfolio/resume:clinical' — so anything
   * driven by those needs a way to act on one without first taking it apart.
   * The three-part form is the sections of Activities & résumé, which are a
   * level below a sub-view; goPortfolio already understands a section name and
   * resolves it to the tab that now holds it.
   */
  const goDest = useCallback((dest)=>{
    const [tabId, rest] = String(dest||'').split('/');
    if(!tabId) return;
    if(!rest) return goAnywhere(tabId, null);
    const [view, section] = rest.split(':');
    if(tabId==='portfolio') return goPortfolio(section||view);
    return goAnywhere(tabId, view);
  }, [goAnywhere,goPortfolio]);

  // ── Arriving somewhere holding a specific record ───────────────────────────
  // The search does not merely navigate to the screen that holds the Coca-Cola
  // scholarship — it hands that screen the scholarship. Landing a student on a
  // page of ninety cards and leaving them to find the one they typed the name
  // of is the same wall with an extra step in front of it.
  //
  // `kind` picks which panel is being spoken to (a page can hold several
  // searchable databases — Financial Aid holds three), `id` is the card, `q` is
  // what its own search box should say, and `n` is a nonce so that searching the
  // SAME record twice still moves the page. Without the nonce the second search
  // is a no-op and, to the student, the palette has stopped working.
  //
  // Consumed via useSearchFocus() in src/lib/useSearchFocus.js.
  const [contentFocus,setContentFocus]=useState(null); // { kind, id, q, n }
  const focusContent=useCallback((dest,focus)=>{
    if(focus?.kind && focus.kind!=='none'){
      setContentFocus(prev=>({ kind:focus.kind, id:focus.id||null, q:focus.q||'', n:(prev?.n||0)+1 }));
    }
    goDest(dest);
  },[goDest]);
  /** The arrival, if it was addressed to this panel. Panels see null the rest of the time. */
  const focusFor=useCallback((kind)=>(contentFocus?.kind===kind?contentFocus:null),[contentFocus]);

  // Persist the current tab/sub-view on every change so a reload (a stuck PWA, the phone
  // locking, a flaky connection) resumes on the same screen instead of resetting to Home.
  useEffect(()=>{ saveViewState({ tab, prepView, portfolioView, roadmapView, progressView, satView, settingsView }); },[tab, prepView, portfolioView, roadmapView, progressView, satView, settingsView]);

  // Keep the browser tab title in sync with where the student actually is — previously the
  // <title> in index.html ("MedSchoolPrep — Your Path Into Medicine") never changed after load,
  // so every tab looked identical whether you were on Plans, Flashcards, or Settings, which is
  // useless with multiple tabs open. Home keeps the full marketing title (that's the one place a
  // generic, welcoming title actually makes sense); everywhere else leads with the specific
  // section so it's identifiable at a glance in a crowded tab strip.
  useEffect(()=>{
    if(tab==='home'){ document.title='MedSchoolPrep — Your Path Into Medicine'; return; }
    const navLabel=NAV.find(n=>n.id===tab)?.label||'MedSchoolPrep';
    const subLabel=
      tab==='prep'?PREP_SUBNAV.find(n=>n.id===prepView)?.label:
      tab==='portfolio'?PORTFOLIO_SUBNAV.find(n=>n.id===portfolioView)?.label:
      tab==='roadmap'?ROADMAP_SUBNAV.find(n=>n.id===roadmapView)?.label:
      tab==='progress'?PROGRESS_SUBNAV.find(n=>n.id===progressView)?.label:
      tab==='sat'?SAT_SUBNAV.find(n=>n.id===satView)?.label:
      tab==='settings'?SETTINGS_SUBNAV.find(n=>n.id===settingsView)?.label:
      null;
    document.title=`${subLabel?`${subLabel} · `:''}${navLabel} · MedSchoolPrep`;
  },[tab,prepView,portfolioView,roadmapView,progressView,satView,settingsView]);

  // ── Post-onboarding product tour — a short spotlight walkthrough hitting each ──
  // top-level pillar once, offered right after a new account is created (see
  // completeOnboarding()). Deliberately kept to a handful of steps: a 70-step
  // deep-dive tour was tested and users bailed out of it before finishing — the
  // fix isn't a better tour, it's a shorter one. One beat per pillar plus the
  // ⌘K power-tip is enough for someone to orient themselves; everything below
  // the nav level (sub-tabs, individual cards, settings sections) is left for
  // them to discover on their own once they're actually inside the app, which
  // is a better teacher than a spotlight ring ever is.
  const [tourActive, setTourActive] = useState(false);
  const startTour = useCallback(()=>setTourActive(true), []);
  const finishTour = useCallback(()=>{
    setTourActive(false);
    celebrateAchievement();
    setUser_(u=>{ if(!u) return u; const next={...u,tourCompletedAt:Date.now()}; DB.saveUser(next).catch(console.error); return next; });
  }, []);
  // Keyboard-navigable highlight index — arrow keys + Enter, not mouse-only,
  // since that's the whole point of a command palette for a fast typist.
  const [cmdActiveIdx,setCmdActiveIdx]=useState(0);
  useEffect(()=>{ setCmdActiveIdx(0); },[cmdQ,cmdOpen]);
  // Keep the highlighted row on screen. Without this the arrow keys walk the
  // selection off the bottom of a scrollable list and the student is driving
  // blind — which now happens far sooner than it used to, because the results
  // include the library and not only the thirty-odd screens.
  const cmdListRef=useRef(null);
  useEffect(()=>{
    const row=cmdListRef.current?.querySelector('[data-cmd-active="true"]');
    row?.scrollIntoView({ block:'nearest' });
  },[cmdActiveIdx,cmdQ]);
  // ⌘ on a Mac, Ctrl everywhere else. Printing "⌘K" to a student on a
  // Chromebook is an instruction they cannot follow, and this hint is the only
  // place most of them will ever learn the shortcut exists.
  const isApple=useMemo(()=>{
    if(typeof navigator==='undefined') return false;
    const p=navigator.userAgentData?.platform||navigator.platform||navigator.userAgent||'';
    return /mac|iphone|ipad|ipod/i.test(p);
  },[]);
  const cmdKeyHint=isApple?'⌘K':'Ctrl K';
  // ── Opening the search, on every keyboard there is ─────────────────────────
  // ⌘K is the convention a Mac user already has in their fingers and Ctrl+K is
  // the same key everywhere else — both have always worked here. What did not
  // was "/", which is the shortcut a student learns from every other product
  // they use all day (Gmail, YouTube, GitHub, Slack), needs no modifier at all,
  // and is therefore the only one that is reachable on a Chromebook without
  // knowing which key is Meta. It is guarded on not already typing: a "/" while
  // the cursor is in an essay draft is a slash, and stealing it would be a bug
  // in the most expensive possible place.
  const isTypingTarget=useCallback((el)=>{
    if(!el) return false;
    const tag=el.tagName;
    return tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||el.isContentEditable===true;
  },[]);
  useEffect(()=>{
    function onKey(e){
      if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){ e.preventDefault(); setCmdOpen(o=>!o); }
      else if(e.key==='Escape'){ setCmdOpen(false); }
      else if(e.key==='/'&&!e.metaKey&&!e.ctrlKey&&!e.altKey&&!isTypingTarget(e.target)){ e.preventDefault(); setCmdOpen(true); }
    }
    document.addEventListener('keydown',onKey);
    return ()=>document.removeEventListener('keydown',onKey);
  },[isTypingTarget]);
  useEffect(()=>{ if(!cmdOpen) setCmdQ(''); },[cmdOpen]);
  // The library loads on the first keystroke of the first search and is then
  // held for the session — see the note beside contentIndex above. Failure is
  // silent and leaves the search working exactly as it did before content
  // search existed, which is a degraded search rather than a broken one.
  useEffect(()=>{
    if(!cmdOpen||contentIndex||contentLoading||cmdQ.trim().length<2) return;
    setContentLoading(true);
    loadContentIndex().then(setContentIndex).catch(()=>{}).finally(()=>setContentLoading(false));
  },[cmdOpen,cmdQ,contentIndex,contentLoading]);

  // ── Diagnostic ──────────────────────────────────────────────────────────────
  const [dStep,setDS]=useState(0);const [dAns,setDA]=useState([]);const [dDone,setDD]=useState(false);const [dRes,setDR]=useState(null);const [dCats,setDCats]=useState(null);const [dWhy,setDWhy]=useState(null);
  const [dIntro,setDIntro]=useState(true); // show pathway overview + manual selection before the diagnostic quiz starts

  // ── Quiz ────────────────────────────────────────────────────────────────────
  const [aQuiz,setAQ]=useState(null);const [qSrch,setQSrch]=useState('');const [qCat,setQC]=useState('All');const [qDiff,setQD]=useState('All');const [qSort,setQSort]=useState('default');
  // Set when a quiz is launched from a pathway lesson's "Verify" button (rather than the Quiz
  // Library) so finishQuiz() knows to grade it as a verification attempt instead of a plain quiz.
  const [verifyCtx,setVerifyCtx]=useState(null); // { lesson, unit }

  // ══ BROWSER HISTORY ═══════════════════════════════════════════════════════════
  // Everything above is navigation state; this is what makes the browser's back and
  // forward buttons (and the Android/iOS back gesture) move through it instead of
  // straight out of the app.
  //
  // Two full-screen surfaces get URLs of their own: the lesson player and the quiz
  // runner. They early-return over the entire shell, so if history only tracked the
  // tab, a back press inside a lesson would swap the tab *underneath* the overlay and
  // leave the student staring at the same lesson with no way back.
  //
  // The tab/sub-view is derived, never stored twice — see routeFromState.
  const overlayRoute = useMemo(()=>(
    activeLesson ? { kind:'lesson', unitId:activeLesson.unit.id, lessonId:activeLesson.lesson.id }
    : aQuiz      ? { kind:'quiz', quizId:aQuiz.id }
    : null
  ),[activeLesson,aQuiz]);
  const route = useMemo(()=>routeFromState({ tab, satView, prepView, portfolioView, roadmapView, progressView, settingsView, overlay:overlayRoute }),
    [tab,satView,prepView,portfolioView,roadmapView,progressView,settingsView,overlayRoute]);

  // ── Where they have been ────────────────────────────────────────────────────
  // Recorded off the SAME route object the address bar is driven from, rather
  // than inside the palette's own click handler. That is the difference between
  // "screens you reached through the palette" — a small and rather circular
  // list — and "screens you have been on", which is what somebody reopening the
  // palette is actually looking for. Every route into a screen counts: the nav,
  // a deep link, the back button, a card on Home.
  useEffect(()=>{
    if(!route?.tab) return;
    const dest = route.view ? `${route.tab}/${route.view}` : route.tab;
    setCmdRecents(pushRecent(dest));
  },[route?.tab,route?.view]);

  // Flat [{lesson,unit}] for the active pathway, so a lesson URL can be resolved back
  // to the lesson it names. A ref (filled by an effect further down) rather than a
  // dependency, because the resolver below runs from a history event, not a render.
  const lessonIndexRef = useRef([]);
  const lessonBootRef = useRef(false); // has the boot URL's lesson (if any) been consumed?

  // Applies a route that came *from* history (a back/forward press). Held in a ref and
  // rewritten every render so it always closes over current props/state — a useCallback
  // with a dependency list would either go stale or churn the popstate listener.
  const applyRouteRef = useRef(null);
  applyRouteRef.current = (next) => {
    setTab(next.tab);
    const sub = SUBVIEWS[next.tab];
    if (sub && next.view) {
      if (next.tab === 'sat') setSatView(next.view);
      else if (next.tab === 'prep') setPrepView(next.view);
      else if (next.tab === 'portfolio') {
        setPortfolioView(next.view);
        // A back/forward press onto an old /portfolio/clinical-style URL: the route already
        // resolved to `resume`, so recover the section from the address bar itself (history has
        // already updated window.location by the time this runs).
        const hit = portfolioSectionFromPath(window.location.pathname);
        if (hit) focusPortfolioSection(hit[0], hit[1]);
      }
      else if (next.tab === 'roadmap') setRoadmapView(next.view);
      else if (next.tab === 'progress') setProgressView(next.view);
      else if (next.tab === 'settings') setSettingsView(next.view);
    }

    const ov = next.overlay;
    // Leaving a lesson/quiz via the back button has to run the same teardown the
    // Close button does, or the next lesson opens carrying the last one's notes.
    if (ov?.kind !== 'lesson' && activeLesson) closeLesson();
    if (ov?.kind !== 'quiz' && aQuiz) { setAQ(null); setVerifyCtx(null); }

    if (ov?.kind === 'lesson' && activeLesson?.lesson?.id !== ov.lessonId) {
      // Forward button back into a lesson, or a shared lesson link. Resolvable only
      // within the student's current pathway; if it isn't there any more, we simply
      // don't open it and the effect below rewrites the URL to the tab underneath.
      const match = lessonIndexRef.current.find(x => x.lesson.id === ov.lessonId && x.unit.id === ov.unitId);
      if (match) openLessonFromHistory(match.lesson, match.unit);
    }
    // A quiz is a live attempt, not a document: re-entering one from a URL would
    // fabricate a session that was never saved. Deliberately not restored — the
    // router replaces the stale /quiz/… URL with the tab it was launched from.
  };
  const applyRoute = useCallback((next)=>applyRouteRef.current(next),[]);

  const { replaceNext: replaceHistoryEntryNext } = useAppRouter({ route, onNavigate: applyRoute });

  // Real hrefs for the nav. The click is still handled in-app (no reload); the href is
  // what makes the nav behave like navigation — ⌘/middle-click opens a tab, the browser
  // shows the destination on hover, and a copied link actually lands where it says.
  // Each points at the sub-view the student last had open in that tab, matching exactly
  // where clicking will take them.
  const subViewOf = useMemo(()=>({sat:satView,prep:prepView,portfolio:portfolioView,roadmap:roadmapView,progress:progressView,settings:settingsView}),
    [satView,prepView,portfolioView,roadmapView,progressView,settingsView]);
  const tabHref = useCallback((id)=>formatPath({tab:id,view:subViewOf[id]}),[subViewOf]);
  const satHref = useCallback((v)=>formatPath({tab:'sat',view:v}),[]);
  const prepHref = useCallback((v)=>formatPath({tab:'prep',view:v}),[]);
  const portfolioHref = useCallback((v)=>formatPath({tab:'portfolio',view:v}),[]);
  const roadmapHref = useCallback((v)=>formatPath({tab:'roadmap',view:v}),[]);
  const progressHref = useCallback((v)=>formatPath({tab:'progress',view:v}),[]);
  const settingsHref = useCallback((v)=>formatPath({tab:'settings',view:v}),[]);
  // Shared by every nav item: keep modified clicks with the browser, handle plain ones.
  const onNavLinkClick = useCallback((e,go)=>{
    if(!isPlainLeftClick(e))return;
    e.preventDefault();
    go();
  },[]);

  // ── AI Coach (Medabrain — multi-chat) ────────────────────────────────────
  const [msgs,setMsgs]=useState([]);const [ci,setCi]=useState('');const [cLoad,setCLoad]=useState(false);const chatEnd=useRef(null);
  const [copiedIdx,setCopiedIdx]=useState(null);
  // Every conversation is a row in DB.coachThreads (see src/lib/db.js v10) so a student can run
  // as many parallel Medabrain chats as they want, and none of them disappear on reload the way
  // the old single in-memory `msgs` array did.
  const [coachThreads,setCoachThreads]=useState([]);
  const [activeThreadId,setActiveThreadId]=useState(null);
  const [threadsLoading,setThreadsLoading]=useState(true);
  const [coachSidebarOpen,setCoachSidebarOpen]=useState(false); // mobile-only slide-over
  // Which named mode the chat is in (src/lib/medabrainModes.js). 'free' is the
  // old blank-box behavior and stays available — the modes are a front door, not
  // a cage. Deliberately NOT persisted: a mode is about what the student is
  // doing in the next ten minutes, and reopening the app three days later in
  // "review my essay's structure" would be the app remembering the wrong thing.
  const [coachMode,setCoachMode]=useState('free');
  // The safety tier of the message currently being answered. Held in a ref
  // rather than in state because requestAIResponse reads it during the same tick
  // it is written, and a state update would not have landed yet — a one-render
  // lag here means the crisis guidance misses the exact turn it was for.
  const safetyTierRef=useRef(null);
  const [crisisConfig,setCrisisConfig]=useState(null);
  const [renamingThreadId,setRenamingThreadId]=useState(null);
  const [renameDraft,setRenameDraft]=useState('');
  // Which of Medabrain's three model tiers answered the most-recent message — same idea as Claude's
  // Haiku/Sonnet/Opus, but the tier itself is chosen automatically per message by
  // classifyCoachTier() below (the "meta brain"), not by the student. This state is purely for
  // display (the small badge in the coach header showing which tier just responded).
  const [coachTier,setCoachTier]=useState('guide');
  // ── Appearance & accessibility ───────────────────────────────────────────
  // `a11y` holds every appearance/accessibility preference (see src/lib/a11y.js).
  // `themeEpoch` is the mechanism that makes a palette change actually visible:
  // the app styles itself with inline style objects built from the mutable `C`
  // token object, so switching palettes has to force those objects to be rebuilt.
  // Bumping the epoch and using it as a `key` on the rendered subtree remounts
  // the view — App's own state (which tab you're on, your chat, your draft) lives
  // above the key and survives, while every descendant recomputes its styles.
  const [a11y,setA11y]=useState(()=>loadA11y());
  const [themeEpoch,setThemeEpoch]=useState(0);
  // Only highContrast/readableFont and the resolved dark-vs-light palette force
  // a remount (they mutate the C token object, which inline styles snapshotted
  // at render time can't pick up any other way — see theme.js). Every other
  // a11y setting (cursor size, large tap targets, motion, spacing…) is applied
  // purely via data-attributes/CSS custom properties in applyA11y(), which take
  // effect live with no remount needed. Remounting for those anyway used to
  // reset scroll position to the top of the page on every single toggle —
  // most noticeably when turning on the large pointer, since that's a control
  // students reach for mid-page rather than at the top of Settings.
  const epochKeyRef=useRef(null);
  const applyA11yAndSync=useCallback((settings)=>{
    const resolved=applyA11y(settings);
    const epochKey=`${resolved}|${settings.highContrast}|${settings.readableFont}`;
    if(epochKeyRef.current!==epochKey){
      epochKeyRef.current=epochKey;
      setThemeEpoch(e=>e+1);
    }
    return resolved;
  },[]);

  // Apply on mount and on every change. applyA11y is fully declarative, so
  // running it repeatedly is safe and always converges on the same DOM state.
  useEffect(()=>{
    applyA11yAndSync(a11y);
    saveA11y(a11y);
    storeMode(a11y.themeMode);
  },[a11y,applyA11yAndSync]);

  // Follow the OS while the student has chosen "match my device". Nothing to do
  // in the other two modes — an explicit choice should not be overridden.
  useEffect(()=>{
    if(a11y.themeMode!=='system') return;
    return watchSystemTheme(()=>{ applyA11yAndSync(a11y); });
  },[a11y,applyA11yAndSync]);

  // ── Follow the screen ──────────────────────────────────────────────────────
  // Re-fits the app whenever the viewport meaningfully changes: a window
  // dragged between a laptop display and an external monitor, a tablet rotated,
  // a Chromebook waking on a different screen, a phone keyboard opening. The
  // shared watcher in src/lib/useViewport.js coalesces all of that to one
  // measurement per frame and only calls back when the snapped scale or the
  // measured size actually moved, so this is not a per-frame restyle.
  //
  // applyA11yAndSync rather than a bare re-render: the effective zoom lives in a
  // custom property on <html>, so refitting IS re-applying the a11y settings.
  // It is declarative and converges, which is what makes calling it from a
  // resize safe. Nothing is saved — the fit is a property of the screen, not a
  // preference, and writing it to storage would carry one device's screen to
  // the next one the student signs in on.
  useEffect(()=>{
    if(a11y.autoFit===false) return;
    setViewportBase(a11y.fontScale);
    return subscribeViewport(()=>{ applyA11yAndSync(a11y); });
  },[a11y,applyA11yAndSync]);

  const updateA11y=useCallback((patch)=>{setA11y(s=>({...s,...patch}));},[]);
  // Framer Motion is driven from JS, so the CSS reduced-motion rules can't reach
  // it. Every animated surface that matters reads this and collapses its
  // transition to zero.
  const reducedMotion=motionReduced(a11y);
  const motionT=useMemo(()=>(reducedMotion?{duration:0}:undefined),[reducedMotion]);

  const COACH_TIERS=[
    {id:'scout',label:'Scout',desc:'Fastest — quick answers and everyday questions',color:C.cyan},
    {id:'guide',label:'Guide',desc:'Balanced — the default for most coaching',color:C.violet},
    {id:'sage',label:'Sage',desc:'Deepest reasoning — essay feedback, complex strategy',color:C.amber},
  ];
  // Model preference: 'auto' lets Medabrain route each message itself (classifyCoachTier);
  // 'scout'/'guide'/'sage' pins every message to that model. Device-local so it survives reloads
  // without touching the synced profile schema.
  // Which half of the Medabrain page is showing: the conversation, or the
  // personal brief ("About you"). They live on one page rather than in separate
  // tabs because the brief is not a settings screen — it is the other half of
  // talking to Medabrain, and a student should be able to add to it the moment
  // an answer makes them realize it doesn't know something.
  const [coachView,setCoachView]=useState('chat'); // 'chat' | 'about'
  // Model picker + quota breakdown, collapsed by default. This used to be
  // permanently pinned above the thread and cost ~180px of the conversation.
  const [coachMetaOpen,setCoachMetaOpen]=useState(false);
  const [coachModelPref,setCoachModelPref]=useState(()=>{try{return localStorage.getItem('msp_coachModelPref')||'auto';}catch{return 'auto';}});
  useEffect(()=>{try{localStorage.setItem('msp_coachModelPref',coachModelPref);}catch{/* private mode */}},[coachModelPref]);
  // How many answers each model has produced — powers the usage breakdown (which model you lean on
  // most vs least). Local tally; resets only if storage is cleared.
  const [coachTierCounts,setCoachTierCounts]=useState(()=>{try{return JSON.parse(localStorage.getItem('msp_coachTierCounts'))||{scout:0,guide:0,sage:0};}catch{return {scout:0,guide:0,sage:0};}});
  useEffect(()=>{try{localStorage.setItem('msp_coachTierCounts',JSON.stringify(coachTierCounts));}catch{/* private mode */}},[coachTierCounts]);

  // ── Flashcards ──────────────────────────────────────────────────────────────
  const [activeDeck,setAD]=useState(null);const [cIdx,setCIdx]=useState(0);const [flip,setFlip]=useState(false);const [notes,setNotes]=useState('');const [gLoad,setGL]=useState(false);const [gStage,setGStage]=useState(0);const [gShake,setGShake]=useState(false);const [dSrch,setDS2]=useState('');const [studyMode,setStudyMode]=useState('all'); // 'all' | 'due'
  // Re-rolled every time a Smart Mix session is started (and by the in-session Reshuffle
  // button), and held constant for the rest of that session — see src/lib/shuffle.js.
  const [smartMixSeed,setSmartMixSeed]=useState(newShuffleSeed);
  const [deckFilter,setDeckFilter]=useState('all'); // 'all' | 'due' | 'custom' | 'builtin'
  const [deckCategory,setDeckCategory]=useState('all'); // 'all' | one of DECK_CATEGORY_ORDER
  const [deckSubcat,setDeckSubcat]=useState('all'); // 'all' | a subcategory within deckCategory
  const [manageDeck,setManageDeck]=useState(null); // deck name currently being edited in the card manager modal
  const [newDeckOpen,setNewDeckOpen]=useState(false);
  const [newDeckName,setNewDeckName]=useState('');
  const [sessionStats,setSessionStats]=useState({reviewed:0,again:0,hard:0,good:0,easy:0,startedAt:Date.now(),streak:0,bestStreak:0,xp:0});
  // Rolls a brand-new Smart Mix order and drops straight into it. Every Smart Mix entry point
  // goes through here so the "every card, freshly shuffled, every time" promise can't be half
  // implemented at one of them.
  const rerollSmartMix=useCallback(()=>{
    setSmartMixSeed(newShuffleSeed());
    setCIdx(0);setFlip(false);
  },[]);
  const startSmartMix=useCallback(()=>{
    rerollSmartMix();
    setAD({name:'Smart Mix',builtin:true,smartMix:true});
    setStudyMode('all');
    setSessionStats({reviewed:0,again:0,hard:0,good:0,easy:0,startedAt:Date.now(),streak:0,bestStreak:0,xp:0});
  },[rerollSmartMix]);
  // A deck queued up by a Plan task deep link (openPlanResource), waiting on the "Start Studying"
  // screen below rather than dropping straight into the review loop — see tFlash()'s
  // planDeckPending branch. Every OTHER deck entry point in the app (deck list, Smart Mix banner,
  // "Study Again") stays instant-start on purpose: those are already a deliberate, in-context
  // click on a specific deck. A Plan task is different — it's handed to the student as an
  // assignment, so landing on a real "here's what you're about to study, hit Start" screen first
  // reads as a considered session instead of an abrupt jump-scare into flashcards.
  const [planDeckPending,setPlanDeckPending]=useState(null); // {name,builtin,smartMix} | null
  const [genCount,setGenCount]=useState(20);
  const [genCountInput,setGenCountInput]=useState('20'); // raw text of the count field, so typing isn't clobbered mid-edit
  const [genCountMode,setGenCountMode]=useState('auto'); // 'auto' (content decides the count) | 'manual' (genCount)
  const [genPolishNote,setGenPolishNote]=useState(''); // last AI-polish summary, shown under the generator

  // ── Library ─────────────────────────────────────────────────────────────────
  const [lSrch,setLS]=useState('');
  const [lCat,setLC]=useState('All');
  const [lType,setLType]=useState('All');
  const [lDiff,setLDiff]=useState('All'); // All | Introductory | AP / Intermediate | Undergrad / Advanced
  const [lFreeOnly,setLFreeOnly]=useState(false);
  const [lSort,setLSort]=useState('default');
  const [lSubTab,setLSubTab]=useState('all'); // all | saved | completed
  const [openNotes,setOpenNotes]=useState({});

  // ── Portfolio ───────────────────────────────────────────────────────────────


  // ── Settings ────────────────────────────────────────────────────────────────
  const [sName,setSN]=useState('');const [sAge,setSAge]=useState('');const [sSpec,setSS]=useState('');const [sfxOn,setSfxOn]=useState(isSFXEnabled);const [confettiOn,setConfettiOn]=useState(isConfettiEnabled);
  // Settings > "Your Goals" — lets a student revisit/update what onboarding collected (goal,
  // obstacles, study method, things they want to accomplish) instead of it being locked in at
  // signup forever. Buffers are only seeded from `user` when the Edit button is clicked (tSettings()).
  const [sGoalsEditing,setSGoalsEditing]=useState(false);
  const [sGoal,setSGoal]=useState(null);
  const [sObstacles,setSObstacles]=useState([]);
  const [sStudyMethod,setSStudyMethod]=useState(null);
  const [sAccomplish,setSAccomplish]=useState([]);
  // studyHours is in ONBOARDING_FIELDS (studentProfile.js) — without an edit path here, a
  // student who skipped it could never reach 100% onboarding completeness, since it was
  // previously an onboarding-only field.
  const [sStudyHours,setSStudyHours]=useState(null);

  // ── Settings deep-link focus ────────────────────────────────────────────────
  // goSettings('gpaBand') has to do three things before the student sees anything: open the
  // editor that owns the field (the Goals card is collapsed by default, so its inputs are not
  // in the DOM at all), scroll that field into view, and mark it so it is visually obvious
  // which of the ~20 controls on the page they were sent to. The scroll waits a frame for the
  // editor to mount; the highlight clears itself so it never becomes permanent chrome.
  const GOALS_EDITOR_FIELDS=useMemo(()=>new Set(['goal','obstacles','studyMethod','accomplish','studyHours']),[]);
  // Scrolling happens once per deep link. Without this guard the effect would re-fire on the
  // next saveUser — i.e. the moment the student answers the question they were sent here for —
  // and yank the page back to the field they had just finished with.
  const scrolledForRef=useRef(null);
  useEffect(()=>{
    if(tab!=='settings'||!settingsFocus){ if(!settingsFocus)scrolledForRef.current=null; return; }
    if(GOALS_EDITOR_FIELDS.has(settingsFocus)&&!sGoalsEditing){
      setSGoal(user?.goal||null);setSObstacles(user?.obstacles||[]);setSStudyMethod(user?.studyMethod||null);
      setSAccomplish(user?.accomplish||[]);setSStudyHours(user?.studyHours||null);
      setSGoalsEditing(true);
      return; // re-runs once the editor is open and the anchor exists
    }
    if(scrolledForRef.current===settingsFocus)return;
    scrolledForRef.current=settingsFocus;
    const scroll=setTimeout(()=>{
      document.getElementById(`settings-field-${settingsFocus}`)?.scrollIntoView({behavior:'smooth',block:'center'});
    },120);
    // The highlight is a wayfinding cue, not permanent chrome — it retires itself.
    const clear=setTimeout(()=>setSettingsFocus(null),8000);
    return ()=>{clearTimeout(scroll);clearTimeout(clear);};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[tab,settingsFocus,sGoalsEditing]);
  // Leaving Settings drops the highlight — coming back later shouldn't re-pulse a field the
  // student already dealt with.
  useEffect(()=>{ if(tab!=='settings'&&settingsFocus)setSettingsFocus(null); },[tab,settingsFocus]);
  // Applied to whichever card/field goSettings was pointed at.
  const focusStyle=useCallback((field)=>(settingsFocus===field?{border:`1px solid ${C.amber}`,boxShadow:`0 0 0 3px ${C.amber}25`,scrollMarginTop:90}:{scrollMarginTop:90}),[settingsFocus]);

  // ── Pomodoro ────────────────────────────────────────────────────────────────
  const [pomT,setPT]=useState(25*60);const [pomR,setPR]=useState(false);const [pomM,setPomM]=useState('focus');const [pomSessions,setPomSessions]=useState(0);

  // ── DB Init ──────────────────────────────────────────────────────────────────
  useEffect(()=>{
    async function loadFromDb(){
      // If this device's local profile belongs to a different signed-in account (shared
      // family/school computer, or someone else's earlier session), wipe it before loading —
      // otherwise the newly signed-in account would silently inherit a stranger's name, XP,
      // streak, and pathway progress instead of its own clean slate or account-backed rebuild.
      // Also wipe whenever the server-side account record says onboarding was never finished —
      // that flag is the actual source of truth, so a leftover local profile at that point can
      // only be stale (an old email-less row, a previous account on this device, an interrupted
      // signup) and must not be allowed to silently skip a brand-new account past onboarding
      // straight into the dashboard.
      const priorLocalUser = await DB.getUser();
      const staleForDifferentAccount = priorLocalUser?.email && account?.email && priorLocalUser.email!==account.email;
      const staleForUnonboardedAccount = priorLocalUser && account && account.onboardingComplete===false;
      if(staleForDifferentAccount || staleForUnonboardedAccount){
        // Sync must stay off across this wipe — it belongs to whichever account is signed
        // in when the debounced push actually fires, and that's about to become this
        // (different) account, so pushing here would overwrite that account's real cloud
        // progress with a stranger's leftover local cache.
        DB.setSyncEnabled(false);
        await DB.clearAllData();
        clearViewState();
      }
      // Pull this account's cloud snapshot (XP, streak, quiz scores, flashcards, pathway
      // progress, achievements, Medabrain threads, etc.) and merge it into whatever's already
      // in this browser's IndexedDB — the common case right after the reset above is an empty
      // local DB, so this is effectively "restore," but a genuine merge runs too in case this
      // device has progress of its own (e.g. it was used before ever syncing). Sync stays
      // disabled for the duration so this write-back never triggers a push of its own
      // intermediate state. Best-effort: offline or a fresh (never-synced) account both just
      // fall through to whatever's already local.
      if(account?.email){
        try{
          const remoteSnapshot = await ProgressSync.pullSnapshot();
          if(remoteSnapshot) await DB.applyRemoteSnapshot(remoteSnapshot);
          // Re-anchor the local delta baseline to what the server just confirmed — every load,
          // unconditionally, whether this is a brand-new device, a normal reopen, or the first
          // run after this sync mechanism shipped. Without this, the first push of a session
          // would treat this device's entire existing xp/aiChatCount/interviewCount/
          // cardReviewCount as a brand-new "delta" on top of a server total that (from an older
          // client, or an earlier session) already reflects roughly that same number — silently
          // inflating it. See src/lib/db.js's resetSyncBaseline for the full reasoning.
          const justMergedUser = await DB.getUser();
          await ProgressSync.resetSyncBaseline(justMergedUser);
        }catch(err){ console.error('Progress sync pull failed (continuing offline):', err); }
      }
      // Must run before getStreak() so a bridged (freeze-covered) gap is
      // already reflected in the streak calculation below.
      await DB.checkAndApplyStreakFreeze();
      const [u,pw,qs,qh,decks,deckMeta,cp,ach,str,rev,freezes,cos] = await Promise.all([
        DB.getUser(), DB.getPathway(), DB.getQuizScores(), DB.getQuizHistory(),
        DB.getFlashDecks(), DB.getDeckCreatedAtMap(), DB.getCatPerf(),
        DB.getAchievements(), DB.getStreak(), DB.getTotalCardReviews(),
        DB.getStreakFreezeCount(), DB.getCosmetics(),
      ]);
      // Backfill the account email onto older local profiles that predate this device/account
      // binding, so a mismatch on this device can actually be detected on a future sign-in.
      if(u&&!u.email&&account?.email){ u.email=account.email; DB.saveUser(u).catch(()=>{}); }
      if(u){setUser_(u);setAiChatCount(u.aiChatCount||0);setInterviewCount(u.interviewCount||0);}
      setPathway_(pw||{});
      setQScores_(qs||{});
      setQHistory(qh||[]);
      // Merge built-in decks with custom decks from DB
      const allDecks={};
      // Custom decks override built-in if same name
      Object.entries(decks||{}).forEach(([name,cards])=>{allDecks[name]=cards;});
      setCDecks_(allDecks);
      setDeckCreatedAt(deckMeta||{});
      setCatPerf_(cp||{});
      setAchiev_(ach||new Set());
      setStreak(str||0);
      setTotalReviews(rev||0);
      setStreakFreezes(freezes||0);
      setCosmetics(cos||new Set());
      // Load Medabrain's persisted chat threads and resume the most recently
      // active one (if any) — mirrors how a normal chat app reopens where you left
      // off, instead of dropping a returning student back into an empty composer.
      try{
        const threads=await DB.getCoachThreads();
        setCoachThreads(threads||[]);
        if(threads?.length){
          setActiveThreadId(threads[0].id);
          const rows=await DB.getCoachMessages(threads[0].id);
          setMsgs((rows||[]).map(r=>({role:r.role,content:r.content})));
        }
      }catch(err){console.error('Failed to load Medabrain chat threads',err);}
      setThreadsLoading(false);
      // The gap since the last EARNED day, for the returning-user nudge. Since the
      // rewrite this is safe to compute anywhere in the load path: opening the app no
      // longer stamps today, so today can only already be present if the student has
      // genuinely done work today.
      if(u){
        const priorDays=(await DB.getStudyDays()).slice().sort();
        if(priorDays.length){
          const todayStr=localDateStr();
          const lastDay=priorDays[priorDays.length-1];
          if(lastDay!==todayStr){
            const gapDays=Math.round((new Date(todayStr)-new Date(lastDay))/86400000);
            if(gapDays>=2)setComebackGap(gapDays);
          }
        }
      }
      // NOTE: nothing here records a study day any more. The old attendance-based
      // recorder ran on every app load, which meant the streak measured tab-opening
      // rather than studying — a student who opened the app and did nothing kept a
      // 40-day streak alive. Days are earned now, at the call sites that finish real
      // work (see creditStreak below). scripts/verifyStreak.mjs fails the build if
      // anything on this path starts stamping days again.
      const [dayRowsInit, bridgedInit, claimedInit] = await Promise.all([
        DB.getAllDayActivity(), DB.getBridgedDates(), DB.getClaimedStreakRewards(),
      ]);
      setDayRows(dayRowsInit || []);
      setBridgedDates(bridgedInit || new Set());
      setClaimedStreakRewards(claimedInit || new Set());
    }
    async function init(){
      try{
        // Guard against IndexedDB/Dexie hanging forever (e.g. a blocked schema
        // upgrade because another tab still has the DB open at an older
        // version). Without this timeout, a hung promise here never resolves
        // or rejects, so setDbReady(true) is never reached and the app is
        // stuck on the loading screen indefinitely.
        await Promise.race([
          loadFromDb(),
          new Promise((_,reject)=>setTimeout(()=>reject(new Error('DB init timed out')),8000)),
        ]);
      }catch(e){console.error('DB init error:',e);}
      // Only start pushing local changes to the cloud once the initial load (including the
      // remote-merge write-back above) has fully settled, so nothing here races with it.
      DB.setSyncDirtyListener(ProgressSync.scheduleSyncPush);
      DB.setSyncEnabled(true);
      ProgressSync.installLifecycleFlush();
      // Flushes anything the student tracked in a previous session that never reached the server
      // (tracked offline, or while signed out), and re-flushes on reconnect/refocus from here on.
      installTrackQueueLifecycle();
      // Same idea for any daily-check-in/achievement/quest claim that didn't resolve before the
      // last session ended — replays it with its original attemptId (see rewardClaimQueue.js).
      installRewardClaimQueueLifecycle();
      setDbReady(true);
    }
    init();
    // Deliberately mount-only: `account` is read for its value at the moment this device's
    // local profile is loaded (to detect a different account signing in on this device), not
    // watched for changes — AuthGate remounts App fresh on every sign-in, so this always sees
    // the right account regardless.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // ── Sync status (for the "Synced just now" indicator in Settings) ───────────
  const [syncStatus,setSyncStatus]=useState(()=>ProgressSync.getSyncStatus());
  useEffect(()=>ProgressSync.subscribeSyncStatus(setSyncStatus),[]);
  // ── Progress that arrived from another device mid-session ───────────────────
  // Everything below this component reads Dexie once, at mount, and holds the
  // result in React state. So when progressSync merges another device's snapshot
  // into IndexedDB — on a foreground reconcile, or after a push was refused for
  // being stale — the merged data is on disk but not on screen, and the two only
  // agree again after a reload.
  //
  // Reloading on the student's behalf is not an option: this can fire in the
  // middle of a lesson, a timed SAT section or a half-written essay. So it is
  // offered instead, once, and it waits — which is also the honest version of
  // what happened, since nothing they can see has changed yet.
  useEffect(()=>{
    const onMerged=()=>{
      toast.success(
        (t)=>(
          <span style={{display:'flex',alignItems:'center',gap:8}}>
            Progress from another device is ready.
            <button
              onClick={()=>{toast.dismiss(t.id);window.location.reload();}}
              style={{fontWeight:700,color:C.blueL,background:'none',border:'none',cursor:'pointer',padding:0,textDecoration:'underline'}}
            >Refresh</button>
          </span>
        ),
        {id:'remote-progress-merged',duration:8000,icon:'☁️'},
      );
    };
    window.addEventListener(ProgressSync.REMOTE_MERGE_EVENT,onMerged);
    return()=>window.removeEventListener(ProgressSync.REMOTE_MERGE_EVENT,onMerged);
  },[]);
  // Forces the "Xm ago" label in Settings to keep advancing even when no new
  // sync event has fired — only ticks while Settings is actually open.
  const [,setSyncTick]=useState(0);
  useEffect(()=>{
    if(tab!=='settings')return;
    const id=setInterval(()=>setSyncTick(t=>t+1),15000);
    return()=>clearInterval(id);
  },[tab]);

  // ── Portfolio (Supabase-backed: activities, awards, GPA history) ─────────────
  useEffect(()=>{
    if(tab!=='portfolio'||portLoaded)return;
    (async()=>{
      try{
        await migrateLocalPortfolioLogs();
        const [a,w,g]=await Promise.all([listItems('activities'),listItems('awards'),listItems('gpa_entries')]);
        setPortActivities(a||[]);
        setPortAwards(w||[]);
        setPortGpa(g||[]);
      }catch(e){console.error('Portfolio load error:',e);}
      setPortLoaded(true);
    })();
  },[tab,portLoaded]);

  // Full-portfolio snapshot for the Overview dashboards + Tracked tab. Kept separate from the
  // three-resource load above (which predates it and feeds the activity/award/GPA lists) so a
  // slow full fetch never delays the parts of Overview that were already fast.
  const refreshPortSnapshot = useCallback(async()=>{
    setPortSnapLoading(true);
    try{ setPortSnapshot(await buildPortfolioSnapshot()); }
    catch(e){ console.error('Portfolio snapshot error:',e); }
    finally{ setPortSnapLoading(false); }
  },[]);
  // Home is in this list because the MedEx Score lives there and is computed from these rows
  // (see the MEDEX SCORE block below). Fetching only on the Portfolio tab meant a student who
  // opened the app to their dashboard and never navigated saw a skeleton where their score
  // should be — for the whole session.
  useEffect(()=>{
    if(!['portfolio','home'].includes(tab)||portSnapshot||portSnapLoading)return;
    refreshPortSnapshot();
  },[tab,portSnapshot,portSnapLoading,refreshPortSnapshot]);

  // ── Pathway pacing goal (loaded per active pathway) ───────────────────────────
  useEffect(()=>{
    if(!user)return;
    const key=user.specialty||'exploring';
    DB.getPathwayGoal(key).then(g=>setPathwayGoalState(g||null)).catch(()=>setPathwayGoalState(null));
  },[user?.specialty]);
  // Setting OR changing a goal. `keepStart` is passed through from PaceGoalCard: editing the
  // target extends the existing clock, "Restart from today" resets it (see DB.setPathwayGoal).
  async function setPathwayPaceGoal(weeks,{keepStart=false}={}){
    const key=user?.specialty||'exploring';
    const had=!!pathwayGoal?.targetWeeks;
    await DB.setPathwayGoal(key,weeks,{keepStart});
    setPathwayGoalState(await DB.getPathwayGoal(key));
    // Setting a goal is an act of intent, so it un-dismisses the prompt too — otherwise
    // removing a goal later would drop the student back to a permanently hidden card.
    localStorage.removeItem(`pathwayGoalDismissed:${key}`);
    setGoalPromptDismissed(false);
    logEvent('pace_goal_set',`${key}:${weeks}`);
    const label=PATHS[key]?.label||'this pathway';
    toast.success(
      had&&keepStart?`Pace goal updated — ${weeks} week${weeks===1?'':'s'} to finish ${label}.`
      :had?`Pace goal restarted — ${weeks} week${weeks===1?'':'s'} from today to finish ${label}.`
      :`Pace goal set — ${weeks} week${weeks===1?'':'s'} to finish ${label}.`,
      {icon:<Target size={16}/>});
  }
  async function clearPathwayPaceGoal(){
    const key=user?.specialty||'exploring';
    await DB.clearPathwayGoal(key);
    setPathwayGoalState(null);
    toast('Pace goal removed — set a new one whenever you want.',{icon:<Target size={16}/>});
  }
  const [goalPromptDismissed,setGoalPromptDismissed]=useState(false);
  useEffect(()=>{
    const key=user?.specialty||'exploring';
    setGoalPromptDismissed(!!localStorage.getItem(`pathwayGoalDismissed:${key}`));
  },[user?.specialty]);
  function dismissPathwayPaceGoal(){
    const key=user?.specialty||'exploring';
    localStorage.setItem(`pathwayGoalDismissed:${key}`,'1');
    setGoalPromptDismissed(true);
  }

  // ── Lightweight Applications-side counts, for the achievement/reward loop ────
  useEffect(()=>{
    if(!user||!['portfolio','progress'].includes(tab))return;
    (async()=>{
      try{
        const [cols,ess]=await Promise.all([listItems('colleges'),listItems('essays')]);
        // The "why this pathway" working document is an essays row but is not an application
        // essay — see src/lib/healthEssays.js. Counting it here would credit the "start an essay"
        // achievement to a student who opened a notebook.
        setAppCounts(c=>({...c,colleges:cols?.length||0,essays:(ess||[]).filter(e=>e?.essay_kind!=='why_pathway').length}));
      }catch(e){/* non-critical — achievement counts, fail silently */}
      try{
        const [hours,recs,sessions]=await Promise.all([listItems('clinical_hours'),listItems('recommenders'),DB.getInterviewSessions()]);
        setClinicalHoursEntries(hours||[]);
        setClinicalHoursTotal((hours||[]).reduce((s,h)=>s+(h.hours||0),0));
        setRecommendersCount((recs||[]).length);
        setMmiCasperCount((sessions||[]).filter(s=>s.mode==='mmi'||s.mode==='casper').length);
      }catch(e){/* non-critical */}
      try{
        const [scholarships,research,skills]=await Promise.all([listItems('scholarships'),listItems('research_experience'),listItems('skills_certifications')]);
        setPortScholarships(scholarships||[]);
        setScholarshipCount((scholarships||[]).length);
        setResearchCount((research||[]).length);
        setSkillsCount((skills||[]).length);
      }catch(e){/* non-critical — portfolio-breadth counts for the coach prompt only */}
    })();
  },[tab,user]);

  useEffect(()=>{
    if(!user)return;
    checkAndUnlockAchievements(user,qTaken,qHistory.filter(q=>q.score===100).length,streak,totalReviews,mastery,aiChatCount);
  },[appCounts,portActivities.length,(upcomingDeadlines||[]).length,clinicalHoursTotal,recommendersCount,mmiCasperCount]);

  // ── Weekly quest progress (cards reviewed since Monday) ──────────────────────
  useEffect(()=>{
    if(!['home','progress'].includes(tab))return;
    DB.getCardReviewsSince(getStartOfWeek().getTime()).then(setWeekCardReviews).catch(()=>{});
  },[tab,totalReviews]);

  // Live view of the Track outbox, so an opportunity queued offline reads as "Queued" (and flips
  // to "Tracked" on its own once the flush lands) instead of looking untracked.
  // Tracked-board summary for the Overview, derived from the same shared snapshot the Tracked tab
  // renders from. Memoized here rather than computed inside tPort(): tPort is a plain function
  // invoked during App's render, so anything built in its body is rebuilt on every unrelated state
  // change in a 7,000-line component — classifying every tracked row and regenerating the daily
  // report each time.
  const trackedSummary = useMemo(()=>{
    const items=portSnapshot?buildTrackedItems(portSnapshot):[];
    return { items, report:buildDailyReport(items), needsAction:items.filter(i=>i.stage==='needs_action').length };
  },[portSnapshot]);

  const pendingTracks = usePendingTrackKeys();
  const trackedActivityKeys = useMemo(()=>trackedKeySet('activities',portActivities),[portActivities]);
  const trackedScholarshipKeys = useMemo(()=>trackedKeySet('scholarships',portScholarships),[portScholarships]);

  // Durable tracking for anything the student picks out of the Opportunities database. Routes
  // through the Track outbox (src/lib/trackQueue.js) rather than a bare createItem(), so a failed
  // request queues the intent instead of discarding it, and a second tap on something already
  // tracked returns 'duplicate' instead of creating a second row. `resource` is 'activities' for
  // most entries and 'scholarships' for type:'Scholarship' ones — see resourceForOpportunity().
  const trackOpportunity = useCallback(async(resource,row,opts)=>{
    const existing=resource==='activities'?portActivities:portScholarships;
    const res=await trackItem(resource,row,{...opts,existing});
    if(res.status==='created'){
      if(resource==='activities')setPortActivities(p=>[...p,res.row]);
      else setPortScholarships(p=>[...p,res.row]);
      // Keeps the Overview dashboards and the Tracked tab in step with the tap that just
      // happened — without this, a freshly tracked program wouldn't appear on the Tracked board
      // (or count toward this week's "opportunities tracked" goal) until the next visit.
      setPortSnapshot(s=>s?{...s,[resource]:[...(s[resource]||[]),res.row]}:s);
    }
    return res;
  },[portActivities,portScholarships]);

  // ── Reward chest (unwrap/reveal ceremony for quest claims + daily check-in) ──
  const openChest = useCallback((opts)=>{ setChest(opts); },[]);
  const closeChest = useCallback(()=>{ setChest(null); },[]);

  // ── The XP multiplier ──────────────────────────────────────────────────────
  // Two things scale every XP award in the app: the streak LEAGUE (a permanent percentage that
  // climbs with the streak) and any live BOOST (a short timed multiplier from the check-in
  // calendar). They stack multiplicatively and are applied here, at the award site, on top of
  // the variable-ratio roll in lib/rewards.js.
  //
  // Deliberately a ref rather than a closed-over value: the five call sites below live inside
  // event handlers and plain functions declared at different points in this component, and a
  // stale closure on the multiplier would silently pay a student the wrong amount — the single
  // worst class of bug this system can have. The ref is written by the effect under it on every
  // change to the streak or the boost list, so every award reads the current number.
  //
  // Milestone rewards (streak rungs, quest claims, check-ins) are NOT routed through here: they
  // are deterministic and advertised in advance, and a milestone that paid a different number
  // than the card showed is worse than one that paid nothing.
  const xpMultRef = useRef(1);
  const awardBoostedXP = useCallback((base, opts)=>{
    const rolled = awardXP(base, opts);
    const mult = xpMultRef.current;
    if(!(mult>1) || !(rolled.finalXP>0)) return { ...rolled, multiplierApplied:1, boosted:false };
    return {
      ...rolled,
      finalXP: Math.max(1, Math.round(rolled.finalXP * mult)),
      multiplierApplied: mult,
      boosted: true,
    };
  },[]);

  // ── Optimistic save helpers ──────────────────────────────────────────────────
  // Every write to the user record also mirrors the master plan into its own database row
  // (src/lib/masterPlanStore.js). This is the one choke point every plan mutation in the app
  // already funnels through — generation, task toggles, drag-to-reschedule, the rolling
  // auto-extension, the rollover pass — so the mirror can't be forgotten at a call site. The
  // push is debounced, skips unchanged plans, and can never throw into this path.
  // Returns the Dexie write so a caller that is about to do its OWN read-modify-write
  // of the user row (creditStreak, when a streak milestone pays out XP) can await it
  // first. Without that, the two writes race: creditStreak re-reads `xp` from Dexie,
  // and if this update has not landed yet it reads the pre-award value and writes back
  // a total missing the XP that was just granted. Every other caller ignores the
  // promise exactly as before.
  const saveUser = useCallback((u)=>{
    setUser_(u);
    const written = DB.saveUser(u).catch(console.error);
    if(u?.masterPlan)PlanStore.schedulePlanPush(u.masterPlan);
    return written;
  },[]);
  // rewardClaimQueue.claimReward() writes xp straight to Dexie itself (so a durable claim intent
  // and its optimistic local grant land together, even if this component isn't mounted to hear
  // about it — e.g. a queued claim resolving on app start). Call this right after to pull that
  // write back into React state, instead of using the `saveUser` wrapper above (which would
  // re-write Dexie a second time from a stale `user` closure).
  const syncUserFromDb = useCallback(async ()=>{ const u = await DB.getUser(); if(u) setUser_(u); return u; },[]);
  // ── Plan accountability: auto-checks off Plan tasks when their exact linked resource is
  // actually completed elsewhere in the app (quiz submitted, lesson verified, flashcard deck
  // session finished) — see AUTO_VERIFIABLE_KINDS in masterPlanGenerator.js for why only quiz/
  // lesson/deck tasks get this treatment; PlansTab strips the manual checkbox from those exact
  // task types, so this auto-complete path is the ONLY way they can ever become done — closing
  // the "check it, uncheck it, check it again" loophole at the root instead of just capping XP.
  // Takes the user object as of right now so a caller mid-XP-award for the primary action (e.g.
  // finishQuiz already bumping xp for the quiz score) can pass its own freshly-built `newUser`
  // instead of racing stale closure state, and folds the Plan XP into that same object so there's
  // only ever one saveUser() call per action.
  function applyPlanAutoComplete(baseUser, isMatch){
    refreshRecentActivity(); // this choke point fires after nearly every trackable action app-wide
    const plan=baseUser?.masterPlan;
    if(!plan)return baseUser;
    const {plan:updatedPlan,completed}=autoCompleteResourceTasks(plan,isMatch);
    if(!completed.length)return baseUser;
    // Getting ahead — finishing a task dated after today (e.g. tomorrow's plan, started early
    // off a "get a head start" nudge) earns a +25% XP bonus on top of the normal 6/task, to
    // actually reward the early-start behavior TodayPlanNudge invites rather than just permit it.
    const today=planTodayStr();
    const earlyCount=completed.filter(c=>c.date>today).length;
    const rawXP=6*completed.length+Math.round(6*earlyCount*0.25);
    const {finalXP,tier}=awardBoostedXP(rawXP);
    // Contextual "staying on track" nudge — fires the moment a Plan-linked quiz/lesson/deck is
    // actually completed (not just when the whole day wraps up), so the reinforcement lands right
    // where the student is working, not only back on Home. Wording and the live plan streak vary
    // by what just got checked off, so it reads as "I noticed exactly what you did" rather than a
    // generic completion toast.
    const liveStreak=getPlanStreak(updatedPlan);
    const streakBit=liveStreak>1?` ${liveStreak}-day streak — keep it up!`:'';
    const single=completed.length===1?completed[0]:null;
    const isQuiz=single&&(single.type==='quiz'||single.resourceKind==='quiz');
    const nudgeHeadline=single
      ? (isQuiz?`Great! You're staying on track.${streakBit||' Keep it up.'}`:`✓ Daily task complete: ${single.title}`)
      : `${completed.length} plan tasks auto-verified on your plan.${streakBit}`;
    const earlyBit=earlyCount>0?` · +25% early-start bonus (${earlyCount} task${earlyCount===1?'':'s'} done ahead of schedule)`:'';
    toast.success(`${nudgeHeadline} · ${BONUS_COPY[tier](finalXP)}${earlyBit}`,{icon:<ShieldCheck size={16}/>,duration:3200});
    if(tier==='jackpot'){celebrateJackpot();play('jackpot');}
    else if(tier==='big'||tier==='bonus')celebrateBonusXP();
    else celebrateXP();
    // If this completion just finished off TODAY's entire day, that's worth calling out on its
    // own — the concrete "stay on track" reinforcement the plan is meant to give, wired through
    // this one shared choke point so every auto-complete source (quiz, lesson, deck, coach,
    // interview, clinical, activity, college, essay, research) gets it for free.
    const wasTodayDone=(t)=>{const d=getTodayPlanEntry(t);return !!d&&d.tasks.length>0&&d.tasks.every(x=>x.done);};
    if(!wasTodayDone(plan)&&wasTodayDone(updatedPlan)){
      const planStreak=getPlanStreak(updatedPlan);
      const nextDay=getNextPlanDay(updatedPlan);
      setTimeout(()=>toast.success(
        `Today's plan complete${planStreak>1?` — ${planStreak} day streak on track!`:'!'}${nextDay?.tasks?.length?' You can start tomorrow\'s tasks early.':''}`,
        {icon:<Flame size={16}/>,duration:4500}
      ),600);
    }
    return {...baseUser,masterPlan:updatedPlan,xp:(baseUser.xp||0)+finalXP};
  }
  // Runs once the full ~30-screen onboarding flow (src/components/onboarding/Onboarding.jsx)
  // finishes. Creates the local (per-device) profile immediately so the app feels instant, and
  // separately pushes name/grade/onboardingComplete to the Supabase-backed account —
  // fire-and-forget, since local state is already the source of truth for this render.
  // Which pillar a brand-new user lands in depends on their GRADE BAND, not on the goal they
  // picked — a senior who said "strengthen my academics" still has a November 1 deadline, and a
  // foundations-upward lesson track is the wrong first screen for them whatever they told us
  // about their goals. See landingFor() in src/lib/onboardingFlow.js. The goal still shapes the
  // plan; it just no longer decides the door.
  const completeOnboarding = useCallback((profile)=>{
    const name=(profile.name||'').trim();
    if(!name)return;
    // The stored attribute is the GRADUATION YEAR, confirmed on step two. gradeStage is written
    // alongside it purely so older readers of user.gradeStage keep working — nothing derives a
    // band from it while a graduation year exists, and gradeStageFor() prefers the year, so the
    // grade advances itself every August 1 with nobody editing anything.
    const graduationYear = Number.isFinite(Number(profile.graduationYear)) ? Number(profile.graduationYear) : null;
    const gradeStage = graduationYear
      ? gradeStageFor({ graduationYear })
      : (GRADE_STAGES[profile.gradeIdx]?.key || null);
    let age = null;
    if(profile.month && profile.day && profile.year) {
      const birthDate = new Date(profile.year, profile.month - 1, profile.day);
      const today = new Date();
      age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if(monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
    }
    // Every one of these used to be computed for routing purposes only and
    // then discarded — Medabrain, the dashboard, and Portfolio never saw
    // them again. Persisting them onto the user record is what lets
    // buildCoachSystemPrompt() (src/lib/studentProfile.js) and the
    // onboarding recap card actually use what the student told us.
    saveUser({
      // A senior who skipped the diagnostic told us their pathway on that same screen, so it
      // lands here rather than leaving them with no pathway at all — the one thing the skip
      // must never cost them.
      name, specialty:profile.pathway||null, gradeStage, age, xp:0, streak:1, lastActive:Date.now(), email:account?.email,
      goal:profile.goal||null, obstacles:profile.obstacles||[], studyMethod:profile.studyMethod||null,
      accomplish:profile.accomplish||[], studyHours:profile.studyHours||null,
      generatedPlan:profile.generatedPlan||null,
      // Med-focused profile answers from the redesigned flow — persisted so the
      // coach prompt, plan generators, and dashboard recap can use them (see
      // studentProfile.js / planGenerator.js).
      whyMedicine:profile.whyMedicine||null, dreamRole:profile.dreamRole||null, certainty:profile.certainty||null,
      gpaBand:profile.gpa||null, sciences:profile.sciences||[], healthExperience:profile.experience||[],
      // The onboarding toggleAddBack/toggleRollover steps promise these are used to shape the
      // Plans tab's day-by-day roadmap (see applyRolloverPrefs/applyAddBackPrefs in
      // masterPlanGenerator.js) and are editable later in Settings — persisting them here is what
      // makes both of those promises real instead of the answers being silently dropped.
      addBack:profile.addBack!==false, rollover:profile.rollover!==false,
      onboardingCompletedAt:Date.now(),
      // The academic year this grade was recorded in. gradeStage is a snapshot that nobody
      // ever goes back and edits, so without this stamp a sophomore who signed up in 2025 is
      // still a sophomore in 2027 — and a timeline built off a two-year-stale grade shows the
      // wrong year's deadlines with full confidence. See effectiveGradeStage() in
      // src/lib/timeline.js, which advances the stored grade by the years elapsed since.
      gradeStageYear:academicFallYear(new Date()),
      // ── The core attribute ─────────────────────────────────────────────────────────────
      // Stored instead of the grade, so it self-advances (see src/lib/gradeBand.js). Stamped
      // as confirmed for THIS academic year, so the annual check-in doesn't fire at a student
      // who confirmed their year forty seconds ago on step two.
      graduationYear,
      gradYearConfirmedFor:academicFallYear(new Date()),
      // The band-specific answers. Only the ones this student's flow actually asked for are
      // ever set; the rest stay null and nothing downstream assumes otherwise.
      scienceClass:profile.scienceClass||null, weeklyGoalPace:profile.weeklyGoal||null,
      testingPlan:profile.testingPlan||null,
      earlyApplication:profile.earlyApplication||null, combinedProgram:profile.combinedProgram||null,
      // A senior who told us their pathway instead of sitting through the diagnostic. The flag
      // is what lets the app re-offer the diagnostic later as optional rather than never
      // mentioning it again — see shouldReofferDiagnostic() in src/lib/onboardingFlow.js.
      skippedDiagnostic:!!profile.skipDiagnostic,
    });
    AuthAPI.updateMe({ name, gradeLevel:gradeStage, onboardingComplete:true }).then(({user:updated})=>onAccountChange?.(updated)).catch(()=>{});
    // The parent invitation the student asked for on the family step, sent now that there is an
    // account for it to come from. Fire-and-forget on purpose: a failed send must not block or
    // undo an otherwise-finished onboarding, and Settings ▸ Family Access is a working second
    // chance that the toast points at. A student who skipped the step has nothing here.
    const parentEmail=(profile.parentInviteEmail||'').trim();
    if(parentEmail){
      ParentAPI.invite(parentEmail, (profile.parentRelationship||'').trim()||null)
        .then(()=>toast.success(`Request sent to ${parentEmail}. Nothing is shared until they accept.`))
        .catch(()=>toast('We couldn\'t send that request — you can try again in Settings ▸ Family Access.'));
    }
    // The door is chosen by grade band. Explore lands on the lesson track, build on a
    // pre-populated junior-year portfolio timeline, apply on the portfolio with real deadlines
    // on it — and a student who skipped the diagnostic skips straight past it rather than being
    // shown the screen they just declined.
    const band = bandFor({ graduationYear, gradeStage });
    const dest = landingFor(band, { skippedDiagnostic: !!profile.skipDiagnostic });
    if(dest.tab==='portfolio') goPortfolio(dest.view);
    else goPrep(dest.view);
    toast.success(pickNudge('welcome_new_user',{name}));
    // The handoff from the ~30-screen onboarding flow into the real app used to be completely
    // flat — no different from any other page load — despite being the single biggest payoff
    // moment in the whole flow. One-time burst, not looped, so it reads as a landing moment.
    play('achieve');
    celebrateAchievement();
    setJustOnboarded(true);
    startTour();
  },[saveUser,goPrep,goPortfolio,onAccountChange,account,startTour]);
  // Cross-device: if this device has no local profile yet but the signed-in account already
  // finished onboarding elsewhere, rebuild the local profile from the account instead of asking
  // for their name again.
  useEffect(()=>{
    if(!dbReady||user||!account?.onboardingComplete||!account?.name)return;
    saveUser({ name:account.name, specialty:null, gradeStage:account.gradeLevel||null, xp:0, streak:1, lastActive:Date.now(), email:account.email });
  },[dbReady,user,account,saveUser]);
  // A lesson only counts toward mastery/unlock-gating once it's actually verified (curated quiz
  // passed) — for lessons with no quizIds yet (pathways not migrated to the new model this pass),
  // presence in `pathway` is still enough, matching the original self-report behavior.
  const isLessonComplete = useCallback((lesson,entry)=>{
    if(!entry)return false;
    if(lesson.quizIds?.length)return !!entry.verified;
    return true;
  },[]);
  const saveQuizScore = useCallback(async(quizId,score)=>{ setQScores_(q=>({...q,[quizId]:score})); await DB.saveQuizScore(quizId,score); const h=await DB.getQuizHistory(); setQHistory(h); },[]);
  const saveDeck = useCallback(async(name,cards)=>{
    // Only the FIRST save of a name is a deck being built — every save after that is a card
    // being edited, and crediting those would turn "build a deck" into "type in a deck and
    // then rename a card nine times".
    const isNew = !cDecksRef.current[name];
    setCDecks_(d=>({...d,[name]:cards}));
    setDeckCreatedAt(m=>m[name]?m:{...m,[name]:Date.now()});
    await DB.saveDeck(name,cards);
    if(isNew) creditStreak('deck_created',{silent:true}).catch(console.error);
  },[]);
  const deleteDeck_ = useCallback(async(name)=>{
    setCDecks_(d=>{const nd={...d};delete nd[name];return nd;});
    setDeckCreatedAt(m=>{const nm={...m};delete nm[name];return nm;});
    await DB.deleteDeck(name);
  },[]);
  const createDeck = useCallback(async(name)=>{ await saveDeck(name,[]); },[saveDeck]);
  const addCardToDeck = useCallback(async(name,front,back)=>{
    const cards=[...(cDecks[name]||[]),{front,back}];
    await saveDeck(name,cards);
  },[cDecks,saveDeck]);
  const updateCardInDeck = useCallback(async(name,idx,front,back)=>{
    const cards=[...(cDecks[name]||[])];
    if(cards[idx])cards[idx]={...cards[idx],front,back};
    await saveDeck(name,cards);
  },[cDecks,saveDeck]);
  const deleteCardFromDeck = useCallback(async(name,idx)=>{
    const cards=(cDecks[name]||[]).filter((_,i)=>i!==idx);
    await saveDeck(name,cards);
  },[cDecks,saveDeck]);
  const saveCatPerf = useCallback((cat,score)=>{ setCatPerf_(cp=>({...cp,[cat]:{ total:(cp[cat]?.total||0)+score, count:(cp[cat]?.count||0)+1 }})); DB.updateCatPerf(cat,score).catch(console.error); },[]);

  // ── Timers ───────────────────────────────────────────────────────────────────
  useEffect(()=>{if(!pomR)return;const id=setInterval(()=>setPT(t=>t>0?t-1:0),1000);return()=>clearInterval(id);},[pomR]);
  useEffect(()=>{if(pomT===0&&pomR){setPR(false);play('bell');const n=pomM==='focus'?'break':'focus';setPomM(n);setPT(n==='focus'?25*60:5*60);if(pomM==='focus')setPomSessions(s=>s+1);toast.success(pomM==='focus'?'Focus session complete — take a short break.':"Break's over — back to studying.");}},[ pomT,pomR,pomM]);
  useEffect(()=>{chatEnd.current?.scrollIntoView({behavior:'smooth'});},[msgs]);

  // ── Flashcard study keyboard shortcuts (Space/Enter flip, 1-4 rate) ──────────
  useEffect(()=>{
    if(tab!=='prep'||prepView!=='flashcards'||!activeDeck)return;
    function onKey(e){
      if(e.target&&['TEXTAREA','INPUT'].includes(e.target.tagName))return;
      if(e.key===' '||e.key==='Enter'){e.preventDefault();setFlip(f=>!f);return;}
      if(flip&&['1','2','3','4'].includes(e.key)){
        const label=['Again','Hard','Good','Easy'][parseInt(e.key,10)-1];
        rateCard(label);
      }
    }
    document.addEventListener('keydown',onKey);
    return()=>document.removeEventListener('keydown',onKey);
  },[tab,prepView,activeDeck,flip,cIdx]);

  // ── Computed values ──────────────────────────────────────────────────────────
  const eSpec   = user?.specialty||'exploring';
  const curPath = PATHS[eSpec]||PATHS['exploring'];
  // ── Parallel pathways ───────────────────────────────────────────────────────
  // `eSpec` above keeps its exact old meaning — the pathway currently IN FOCUS — so every
  // existing reader of user.specialty (plan generation, opportunity matching, college
  // scoring, Medabrain prompts, the Prep accent wash) needs no change and simply follows
  // whichever pathway the student is looking at. What's new is that up to three can be
  // enrolled at once, and switching focus between them is free: no data moves, nothing is
  // reset, and the other two keep their progress exactly where it was.
  const activePathways = useMemo(()=>getActivePathways(user,PATHS),[user]);
  const focusedPathway = useMemo(()=>getFocusedPathway(user,PATHS),[user]);
  const isParallel = activePathways.length>1;
  // Whether the Pathways page's add/swap/drop catalog is expanded. Collapsed by default so
  // the page opens on the student's own work rather than on ten choices — the wall of options
  // this app deliberately keeps tearing down.
  const [pathwayManagerOpen,setPathwayManagerOpen]=useState(false);
  // ── The four-year map's selected shelf ──────────────────────────────────────
  // null means "follow the student's own year", which is what almost everyone
  // wants and what a returning student should get without touching anything. A
  // non-null value means they deliberately went to look at another year, and it
  // is deliberately NOT persisted: reading ahead into senior year in March
  // should not be where the app leaves them in April.
  const [mapTier,setMapTier]=useState(null);
  // ── The course plan ─────────────────────────────────────────────────────────
  // Local-only, on purpose and for now. It is a planning scratchpad rather than
  // a record of anything that happened, it is worthless on another device
  // without the rest of the account, and the one piece of it that genuinely has
  // to reach the server — the rigor counts — travels through the admissions
  // intake, which already has a row, a schema and a debounced writer.
  //
  // Read as opaque JSON, deliberately: normalizing it here would mean importing
  // coursePlanner.js on boot for one helper, dragging its course catalog and
  // gap-rule tables back into the entry graph that the React.lazy above just got
  // them out of. `null` means "nothing saved"; the panel — which owns the shape
  // and is the only thing that reads it — normalizes whatever it is handed.
  const [coursePlan,setCoursePlan_]=useState(()=>{
    try{ const raw=localStorage.getItem('msp_coursePlan'); return raw?JSON.parse(raw):null; }
    catch{ return null; }
  });
  const [rigorApplied,setRigorApplied]=useState(false);
  // The same key the Portfolio's credential picker already uses, deliberately.
  // A student's state is one fact about them, and asking for it twice in two
  // places — then showing them their state's name for a credential on one screen
  // and the national name on the other — is the exact inconsistency the state
  // naming work existed to remove.
  const [credentialState,setCredentialState_]=useState(()=>{
    try{ return localStorage.getItem('credentialStateCode')||''; }catch{ return ''; }
  });
  const setCredentialState=useCallback((code)=>{
    setCredentialState_(code);
    try{ if(code) localStorage.setItem('credentialStateCode',code); }catch{ /* private mode; it holds for the session */ }
  },[]);
  const setCoursePlan=useCallback((next)=>{
    setCoursePlan_(next);
    setRigorApplied(false); // the plan moved, so what the calculator holds is now behind
    try{ localStorage.setItem('msp_coursePlan',JSON.stringify(next)); }catch{ /* private mode; the plan still works this session */ }
  },[]);
  // One input, two outputs: the courses the student typed become the calculator's
  // `rigorCounts`/`rigorOffered` answers rather than being asked for a second
  // time in different words. The calculator owns that store, so this merges into
  // whatever is already there rather than replacing the intake.
  const applyPlanRigor=useCallback(async(rigor)=>{
    try{
      const intake=await loadIntake();
      const answers={...(intake.answers||{}), rigorCounts:{ap:rigor.ap,ib:rigor.ib,honors:rigor.honors,dualEnrollment:rigor.dualEnrollment}};
      if(rigor.offeredAdvanced!=null) answers.rigorOffered=rigor.offeredAdvanced;
      saveIntake({answers,programRounds:intake.programRounds||{}});
      await flushIntake();
      setRigorApplied(true);
    }catch(err){ console.error('Could not send course rigor to the calculator:',err); }
  },[]);
  // Expanding the catalog is useless if it opens below the fold — the "Add pathway" affordances
  // scattered around the app all route through here so the student actually lands on it.
  const openPathwayManager = useCallback(()=>{
    setPathwayManagerOpen(true);
    if(typeof document==='undefined')return;
    // Retried rather than fired once: this is also the landing point for the sidebar's "Add
    // pathway" from another tab entirely, where the Pathways view has to mount first.
    let tries=0;
    const land=()=>{
      const el=document.getElementById('msp-pathway-manager');
      if(el){ el.scrollIntoView({behavior:'smooth',block:'start'}); return; }
      if(tries++<12)setTimeout(land,60);
    };
    requestAnimationFrame(()=>requestAnimationFrame(land));
  },[]);
  // "Add a pathway" from anywhere in the shell: go to the Pathways view, then open and scroll to
  // the catalog — rather than dropping the student on the page and leaving them to find it.
  const goManagePathways = useCallback(()=>{ goPrep('pathways'); openPathwayManager(); },[goPrep,openPathwayManager]);
  // The Overview's Opportunities card shows the SAME top picks the Opportunities tab leads with —
  // one matcher, one answer, so the card is a real preview of the tab rather than a second, quieter
  // recommendation that happens to disagree with it. Memoized here for the same reason
  // trackedSummary is: tPort() re-runs on every unrelated state change in this component.
  // It also carries the two facts from the structured layer that a dashboard is
  // the right place for and a tab is the wrong place for, because you have to
  // go to a tab: the single next deadline the student is eligible for, and how
  // many applications they have started and not sent. A card that says "your
  // top three picks" is a menu. A card that says "Rockefeller closes in 41 days
  // and you have two half-written applications" is a reason to open the tab.
  const opportunityPreview = useMemo(()=>{
    const prefs = readPrefs(user);
    const profile = buildMatchProfile({ user, snapshot:portSnapshot, pathwayKey:eSpec, prefs });
    const facts = studentEligibilityFacts({ user, grade: profile.grade });
    const [next] = upcomingProgramDeadlines(PROGRAMS, facts, {
      limit:1, freeOnly: prefs.costStance==='free_only', state: prefs.homeState,
    });
    const inProgress = Object.values(prefs.stages||{}).filter(s=>ACTIVE_STAGES.includes(s)).length;
    return {
      profile,
      matches: matchOpportunities({ opportunities:OPPORTUNITIES, profile, count:3 }),
      next: next || null,
      inProgress,
    };
  },[user,portSnapshot,eSpec]);
  // accentText, not the raw brand hex: a pathway's accent is fixed identity
  // (constants.js `physician: '#2d7fff'`), tuned as a fill, and this same value
  // is used as a TEXT color for unit kickers, stat numbers and taglines all
  // over the app. #2d7fff is ~3.0:1 on a light card, so every one of those
  // labels was washed out in the light themes. accentText returns the color
  // untouched when it already reads — which is every dark theme — and walks it
  // down until it does otherwise.
  const accent  = accentText(curPath?.accent||C.blue);
  // Per-tab color identity — Prep and Home stay keyed to the chosen pathway's own accent (that
  // pathway color IS their identity, and Home's hero is deliberately tinted per-pathway), but
  // Portfolio/Progress/Settings are generic app sections with no pathway of their own, so each
  // gets a fixed color instead of every tab in the app reusing the exact same accent.
  const portfolioAccent = C.green;
  const progressAccent = C.cyan;
  const settingsAccent = C.amber;
  const plansAccent = C.pink;
  const satAccent = C.sky;
  // Violet, which the Prep nav item also uses — deliberate, and the only shared nav color in
  // the app. Prep is "learn the material" and Roadmap is "learn what to do with your year";
  // they are the two forward-looking pillars, and reading as a pair is closer to the truth than
  // spending the last unused hue on a tab that would then match nothing.
  const roadmapAccent = C.violet;
  // Same identity, applied to the nav itself — so the active tab actually highlights in its own
  // fixed color instead of every nav item lighting up in whatever the current pathway's accent
  // happens to be. Home/Prep's own content can still layer pathway-adaptive tinting on top
  // (Home's hero, Prep's pathway/diagnostic views) — this only fixes the nav identity.
  const navColor = { home: C.blue, sat: satAccent, prep: C.violet, portfolio: portfolioAccent, roadmap: roadmapAccent, plans: plansAccent, progress: progressAccent, settings: settingsAccent };
  // What onboarding collected, turned back into human-readable copy — shown on both the
  // Progress overview (read-only recap) and Settings ("Your Goals," editable). See
  // src/lib/studentProfile.js for why this exists: onboarding answers used to be discarded
  // after routing the student to their first pillar and never seen again.
  const onboardingRecap = useMemo(()=>buildOnboardingRecap(user),[user]);
  const onboardingCompleteness = useMemo(()=>computeOnboardingCompleteness(user),[user]);
  // DISTINCT lessons, across every pathway. The de-duplication is not defensive
  // tidying — the foundations tier (course strategy, certifications) is the same
  // two units on all ten tracks by design, sharing one id space so that reading
  // a lesson once counts everywhere. Flattened naively those nine lessons appear
  // ninety times, and "Pathways · 12/321 lessons" on the Home tile would be
  // counting eighty-one lessons that do not exist. Pathway-scoped counts
  // (`curPathAllL` below) are unaffected: within one track every id is unique.
  const allL    = [...new Map(
    Object.values(PATHS).flatMap(p=>(p.units||[]).flatMap(u=>u.lessons||[])).map(l=>[l.id,l])
  ).values()];
  const doneL   = allL.filter(l=>isLessonComplete(l,pathway[l.id])).length;
  const mastery = allL.length>0?Math.round((doneL/allL.length)*100):0;
  // Current-pathway-only lesson count (distinct from the cross-pathway `allL`/`doneL`/`mastery`
  // above), for the pacing goal indicator — a goal is "6 of 24 lessons in Physician," not a share
  // of every lesson across every pathway.
  const curPathAllL  = (curPath?.units||[]).flatMap(u=>u.lessons||[]);
  const curPathDoneL = curPathAllL.filter(l=>isLessonComplete(l,pathway[l.id])).length;
  const curPathMastery = curPathAllL.length>0?Math.round((curPathDoneL/curPathAllL.length)*100):0;
  // When each of this pathway's finished lessons was actually finished — the raw material for
  // "how many did you do in the last 7 days" and the demonstrated-pace projection in
  // lib/paceGoal.js. Sorted only so a max() over it is cheap to read.
  const curPathCompletedAts = useMemo(()=>curPathAllL
    .map(l=>pathway[l.id]?.completedAt)
    .filter(Boolean)
    .sort((a,b)=>a-b),
  [curPathAllL,pathway]);
  // Every enrolled pathway's live progress + its exact next lesson, in slot order. ONE
  // computation feeding every parallel surface there is — the rail, the sidebar switcher, the
  // at-a-glance board, the Home strip, the ⌘K entries and the coach's context — so no two of
  // them can ever disagree about how far along a pathway is, or about which pathway ⌥2 means.
  const pathwayRows = useMemo(
    ()=>activePathwayProgress(user,PATHS,pathway,isLessonComplete),
    [user,pathway,isLessonComplete]);
  const parallelSummary = useMemo(()=>describeParallelPathways(pathwayRows),[pathwayRows]);
  // ONE computation of "are they on pace", shared by the Pathway editor card, the Home
  // dashboard card and both Medabrain system prompts. Two surfaces disagreeing about whether
  // a student is behind is worse than neither of them saying anything.
  const paceStatus = useMemo(()=>computePaceStatus({
    goal:pathwayGoal, totalLessons:curPathAllL.length, doneLessons:curPathDoneL, completedAts:curPathCompletedAts,
  }),[pathwayGoal,curPathAllL.length,curPathDoneL,curPathCompletedAts]);
  const paceText = useMemo(()=>describePace(paceStatus,curPath?.label||'this pathway'),[paceStatus,curPath?.label]);
  // The student's class-year label, resolved once — several surfaces need it, and the
  // Pathway view's per-unit "right time for you" badge reads it on every unit row.
  // The grade this student is in TODAY, derived from their stored graduation year rather than
  // read off a snapshot taken at signup — so it advances by itself every August 1 and a
  // sophomore who signed up in 2025 is not still a sophomore in 2027. See src/lib/gradeBand.js.
  const effGrade = useMemo(()=>gradeStageFor(user),[user?.graduationYear,user?.gradeStage,user?.gradeStageYear,user?.onboardingCompletedAt]);
  const gradeBand = useMemo(()=>bandFor(user),[user?.graduationYear,user?.gradeStage,user?.gradeStageYear,user?.onboardingCompletedAt]);
  const gradeLabel = useMemo(()=>GRADE_STAGES.find(g=>g.key===effGrade)?.label||null,[effGrade]);
  // The pillars this band does not lead with. They stay in the nav, in full, clickable — the
  // marker says "most students use this in another year", nothing more. An explore student
  // keeps Portfolio in the nav from day one on purpose: a ninth grader who never sees the
  // program tracker will never ask a parent to pay for it.
  const previewPillars = useMemo(()=>flowForBand(gradeBand).previewPillars||[],[gradeBand]);
  const bandsAwayFromPillar = useMemo(()=>BAND_IDS.filter(b=>b!==gradeBand),[gradeBand]);
  const levelInfo = getLevelInfo(user?.xp||0);
  const lvl     = levelInfo.level;
  const xpIn    = levelInfo.xpIntoLevel;
  const xpForNext = levelInfo.xpForNext;
  const nearLevelUp = (xpForNext-xpIn) > 0 && (xpForNext-xpIn) <= 25;
  const qTaken  = Object.keys(qScores).length;
  const avgSc   = qTaken>0?Math.round(Object.values(qScores).reduce((a,b)=>a+b,0)/qTaken):0;
  // Live progress toward every one of the 40 achievements — recomputed from the same counters
  // that drive checkAndUnlockAchievements, so "X/Y" here always matches what would actually
  // trigger the unlock, and updates automatically as those counters change (no separate cache to
  // go stale). Shared by the Home "Achievements Unlocked" strip and the Progress > Achievements
  // deep view so the two never drift apart.
  const achievementProgress = useMemo(()=>{
    const perfectCount = qHistory.filter(q=>q.score===100).length;
    const pathwayProgress = {};
    let livePathwayCompletions = 0;
    for (const k of PATHWAY_KEYS) {
      const lessons = (PATHS[k]?.units||[]).flatMap(u=>u.lessons||[]);
      const done = lessons.filter(l=>isLessonComplete(l,pathway[l.id])).length;
      pathwayProgress[k] = [done, lessons.length||1];
      if (lessons.length>0 && done>=lessons.length) livePathwayCompletions++;
    }
    return {
      first_quiz:[qTaken,1], perfect_score:[perfectCount,1], quiz_10:[qTaken,10],
      level_5:[lvl,5], level_10:[lvl,10], streak_7:[streak,7], streak_30:[streak,30], cards_100:[totalReviews,100],
      unit_master:[mastery,33], course_half:[mastery,50], ai_user:[aiChatCount,5],
      college_added:[appCounts.colleges,1], deadline_set:[(upcomingDeadlines||[]).length,1], essay_started:[appCounts.essays,1],
      activity_logged:[portActivities.length,1], interview_first:[interviewCount,1], interview_5:[interviewCount,5],
      clinical_hours_50:[clinicalHoursTotal,50], recommender_added:[recommendersCount,1], mmi_practiced:[mmiCasperCount,1],
      quiz_50:[qTaken,50], perfect_5:[perfectCount,5], cards_500:[totalReviews,500],
      streak_14:[streak,14], streak_100:[streak,100], course_complete:[mastery,100], level_20:[lvl,20],
      ai_user_25:[aiChatCount,25], path_explorer:[livePathwayCompletions,3],
      ...Object.fromEntries(PATHWAY_KEYS.map(k=>[`path_${k}_complete`,pathwayProgress[k]])),
    };
  },[qHistory,qTaken,lvl,streak,totalReviews,mastery,aiChatCount,appCounts,upcomingDeadlines,portActivities,interviewCount,clinicalHoursTotal,recommendersCount,mmiCasperCount,pathway]);
  const pomPct  = pomM==='focus'?(pomT/(25*60))*100:(pomT/(5*60))*100;

  // Science-quiz category averages. These are legitimate measures of quiz
  // performance and feed the coach, the radar chart and the insight callouts —
  // what was wrong was mapping them onto a fake SAT score, not the averages.
  const cats3   = ['Life Sciences','Physical Sciences','Behavioral & Social Sciences'];
  const secAvgs = cats3.map(cat=>{const cQ=ALL_QUIZZES.filter(q=>q.cat===cat);const tk=cQ.filter(q=>qScores[q.id]!==undefined);return tk.length?Math.round(tk.reduce((s,q)=>s+qScores[q.id],0)/tk.length):null;});

  // No SAT score projection here any more. The pillar is sealed for v1
  // (src/lib/betaFlags.js), so a student cannot generate SAT practice data, and
  // a projection built from nothing is exactly the invented number this app
  // removed once already. Home, Progress and the admissions calculator ask for
  // a real score instead of estimating one.

  // Cross-app "what has this student actually been doing" digest (src/lib/recentActivity.js,
  // reading the studyEvents log) — fed into every Medabrain surface (coach/prep/portfolio/sat/plan
  // generation) so MedaBrain's knowledge keeps expanding from real activity, not just onboarding
  // answers and today's summary counts. Refreshed opportunistically via applyPlanAutoComplete
  // below, the same shared choke point nearly every trackable action already flows through.
  const [recentActivitySummary,setRecentActivitySummary]=useState(null);
  const refreshRecentActivity=useCallback(()=>{summarizeRecentActivity(7).then(r=>setRecentActivitySummary(r?.text||null)).catch(()=>{});},[]);
  useEffect(()=>{ if(dbReady) refreshRecentActivity(); },[dbReady,refreshRecentActivity]);

  // ── Master plan: adopt the server's copy when it's genuinely newer ──────────
  // Runs once the local profile has settled. The plan has its own table (see
  // api/master-plan.js) precisely so a plan built on one device shows up whole on the next,
  // even when the shared progress snapshot is large or a push was interrupted mid-way.
  // pullPlan() compares the plan's OWN updatedAt against this device's and returns null unless
  // the server's is strictly newer, so this can never clobber local work — including work done
  // offline, which always carries the later stamp once it syncs.
  const planPulledRef = useRef(false);
  useEffect(()=>{
    if(!dbReady||!user||planPulledRef.current)return;
    planPulledRef.current=true;
    let cancelled=false;
    (async()=>{
      const remote=await PlanStore.pullPlan(user.masterPlan||null);
      if(cancelled||!remote)return;
      const current=await DB.getUser();
      // Re-check against the record as it stands NOW: the fetch is async, and the student may
      // have generated or edited a plan while it was in flight.
      if(!PlanStore.isRemoteNewer(remote,current?.masterPlan||null))return;
      saveUser({...(current||user),masterPlan:remote});
      toast('Picked up the newer version of your plan from your account.',{icon:'☁️'});
    })();
    return()=>{cancelled=true;};
  },[dbReady,user,saveUser]);
  // ══ PROGRESSIVE FEATURE UNLOCKING ═════════════════════════════════════════════
  // The nav used to be a directory of everything the product contains: seven top-level
  // tabs and thirty-one sub-tabs, all visible in the first second of the first visit,
  // to a fourteen-year-old who had done nothing yet. A Review Log with nothing to
  // review, a Recommenders form for someone with no activities logged, an Admissions
  // Calculator with no scores to put in it. Every one of those is a good screen shown
  // at the wrong time, and thirty-eight simultaneous wrong times is the drop-off.
  //
  // Now the nav is a directory of what's useful to THIS student RIGHT NOW, and it grows
  // as they do. The ladder, the reasoning, and the three guarantees that keep it safe
  // (sticky, never unreachable, never silent) all live in src/lib/featureUnlock.js —
  // this is only the wiring: real counters in, visible nav out.
  // Everything a student has actually put into their Portfolio, counted the way PlansTab
  // counts it (every resource row, not just activities) — the generator's third readiness
  // gate is "one Portfolio item of any kind".
  const portfolioItems = portActivities.length+portAwards.length+portGpa.length
    +appCounts.colleges+appCounts.essays+trackedSummary.items.length;
  const unlockSignals = useMemo(()=>({
    quizzes: qTaken,
    lessons: doneL,
    colleges: appCounts.colleges,
    essays: appCounts.essays,
    activities: portActivities.length,
    trackedItems: trackedSummary.items.length,
    achievements: achiev.size,
    level: lvl,
    planBuilt: !!user?.masterPlan,
    // Half of the Plans milestone. `onboardingCompletedAt` is stamped by
    // completeOnboarding(); the name fallback covers accounts created before it
    // was, who have certainly finished onboarding — there is no other way to get
    // a local user record.
    onboarded: !!(user?.onboardingCompletedAt||user?.name),
    // The other half: the Plans generator's own bar, computed by the same function its
    // lock screen uses, so the nav and the tab can never disagree about whether a plan
    // can actually be built. Deliberately conservative while Portfolio is still loading
    // (0, not the null PlansTab passes): an unlock is written down permanently the moment
    // it is earned, so guessing "ready" early would hand out the milestone on a load
    // flicker. Under-reporting only delays it by one Dexie round-trip, and the
    // celebration itself waits for signalsSettled either way.
    planReady: computePlanReadiness(user,{quizzesTaken:qTaken,portfolioItemCount:portLoaded?portfolioItems:0}).ready,
    // A senior — or anyone already out of high school — does not get to spend three
    // sessions earning their way into the application half of the product. For them
    // the deadline is the thing, so Portfolio, Recommenders and Interview Prep are
    // open from the first second. The ladder is for students who have time to climb it.
    applicationUrgent: user?.gradeStage==='senior' || user?.gradeStage==='gap',
  }),[qTaken,doneL,appCounts,portActivities.length,trackedSummary.items.length,achiev,lvl,user,portLoaded,portfolioItems]);
  const unlocks = useMemo(()=>unlockState(user,unlockSignals),[user,unlockSignals]);

  // Two writes, both one-way, both here so nothing else in the app has to think about them.
  //
  // seedExistingAccount: nobody wakes up to a smaller app than they went to sleep with.
  // An account that was already in use before this shipped gets every gate opened once,
  // permanently — progressive disclosure is for people meeting the product, not for
  // taking tabs away from someone mid-application.
  //
  // recordUnlocks: an unlock, once shown, is written down. It survives the signal that
  // earned it going away (a deleted activity, a reset deck), because a tab that silently
  // disappears is indistinguishable from a bug, and re-locking would punish the exact
  // exploration this is meant to encourage.
  useEffect(()=>{
    if(!user||!dbReady) return;
    const seeded=seedExistingAccount(user,unlockSignals);
    if(seeded){ saveUser(seeded); return; }
    const recorded=recordUnlocks(user,unlocks.pending);
    if(recorded) saveUser(recorded);
  },[user,dbReady,unlockSignals,unlocks.pending,saveUser]);

  // Announce a newly-earned area rather than letting it quietly appear in the sidebar.
  // The unlock IS the reward for the work that earned it, and a student who never
  // notices Plans arriving gets no benefit from having waited for it. Only fires for
  // gates crossed during this session (`seenUnlocks` starts as whatever was already
  // recorded), so a returning student is never toasted about old news.
  const seenUnlocks = useRef(new Set());
  // The one gate that gets a modal instead of a toast — null unless a marquee
  // milestone opened in this session. See UnlockCelebration.jsx.
  const [milestoneUnlock,setMilestoneUnlock] = useState(null);
  // Every counter behind unlockSignals starts at zero and climbs as Dexie resolves, so
  // "earned since last render" is meaningless until all of them have reported in — on a
  // returning account it would read as two dozen simultaneous unlocks, every load. Until
  // then we keep re-baselining what counts as already-seen, so the first real toast can
  // only be a gate this student crossed with their own hands.
  const signalsSettled = dbReady && portLoaded;
  useEffect(()=>{
    if(!user) return;
    if(!signalsSettled){ seenUnlocks.current=new Set([...(user.unlockedFeatures||[]),...unlocks.earned]); return; }
    const fresh=unlocks.earned.filter(id=>!seenUnlocks.current.has(id));
    if(!fresh.length) return;
    fresh.forEach(id=>seenUnlocks.current.add(id));
    // The milestone gets a moment, not a toast. Plans is the thing the whole ladder
    // climbs toward — the generator that reads the entire student and writes back a
    // day-by-day plan — and announcing it in the same three-second gray rectangle as
    // "Flashcards unlocked" is how the app's best feature stayed invisible. A modal,
    // the work that earned it named back at the student, and one button that walks
    // them into it: that is the reward loop the unlock is supposed to close.
    const marquee=fresh.find(id=>MARQUEE_IDS.includes(id));
    const rest=fresh.filter(id=>id!==marquee);
    if(marquee) setMilestoneUnlock(ruleCopy(marquee));
    if(!rest.length) return;
    // One toast even when several open at once — three stacked toasts reads as an error
    // state, and the student only needs to be told to go look.
    const names=rest.map(id=>UNLOCK_LABELS[id]||id);
    const headline=names.length===1?`${names[0]} unlocked`:`${names.length} new areas unlocked`;
    toast.success(`${headline}${names.length>1?` — ${names.join(', ')}`:''}`,{icon:<Sparkles size={16}/>,duration:4200});
    play('achieve');
  },[unlocks.earned,user,signalsSettled]);

  // What the student can actually see right now. Everything downstream — the sidebar, the
  // mobile bar, every SubNav, ⌘K, the product tour, the browser title — reads these rather
  // than the full arrays, so there is exactly one definition of "visible" in the app.
  const navItems       = useMemo(()=>visibleItems(NAV,unlocks),[unlocks]);
  const satSubnav      = useMemo(()=>visibleItems(SAT_SUBNAV,unlocks,'sat'),[unlocks]);
  const prepSubnav     = useMemo(()=>visibleItems(PREP_SUBNAV,unlocks,'prep'),[unlocks]);
  const portfolioSubnav= useMemo(()=>visibleItems(PORTFOLIO_SUBNAV,unlocks,'portfolio'),[unlocks]);
  const roadmapSubnav  = useMemo(()=>visibleItems(ROADMAP_SUBNAV,unlocks,'roadmap'),[unlocks]);
  const progressSubnav = useMemo(()=>visibleItems(PROGRESS_SUBNAV,unlocks,'progress'),[unlocks]);
  // Settings deliberately runs through the same filter as the others even though nothing in it
  // is gated: the day someone does gate a settings group, the sub-nav will already respect it.
  const settingsSubnav = useMemo(()=>visibleItems(SETTINGS_SUBNAV,unlocks,'settings'),[unlocks]);

  // Guarantee #2: nothing is ever unreachable. A locked surface still has a URL, and
  // arriving at one directly — a link a friend sent, a bookmark, an old history entry,
  // a ⌘K jump made before the gate closed — opens it for good instead of bouncing to a
  // screen the student didn't ask for. A lock in this app means "we haven't put this in
  // front of you yet", never "you may not have this".
  useEffect(()=>{
    if(!user||!dbReady) return;
    const view={sat:satView,prep:prepView,portfolio:portfolioView,roadmap:roadmapView,progress:progressView}[tab]||null;
    if(unlocks.isOpen(tab,view)) return;
    const recorded=recordUnlocks(user,[tab,view?`${tab}/${view}`:null].filter(Boolean));
    if(recorded) saveUser(recorded);
  },[tab,satView,prepView,portfolioView,roadmapView,progressView,unlocks,user,dbReady,saveUser]);

  // The same guarantee, one level deeper: the sections of the merged tabs are gated too
  // (a publications form is not a day-one ask, and neither is the aid comparison), and
  // /portfolio/clinical is a URL a student may already have in their history. Landing on a
  // locked section — by link, by back button, or from a Home tile that names it — opens it
  // for good rather than bouncing them somewhere else.
  const resumeSectionLocks = useMemo(()=>unlocks.locked('portfolio/resume'),[unlocks]);
  const applyingSectionLocks = useMemo(()=>unlocks.locked('portfolio/applying'),[unlocks]);
  useEffect(()=>{
    if(!user||!dbReady) return;
    if(tab!=='portfolio') return;
    // No section named (the ordinary landing-on-the-summary case) — nothing to unlock yet;
    // opening one from the page itself calls focusPortfolioSection and lands back here.
    const sec=portfolioSection;
    if(!sec||sec.view!==portfolioView) return;
    if(unlocks.isOpen('portfolio',sec.view,sec.id)) return;
    const recorded=recordUnlocks(user,[sectionKey('portfolio',sec.view,sec.id)]);
    if(recorded) saveUser(recorded);
  },[tab,portfolioView,portfolioSection,unlocks,user,dbReady,saveUser]);

  // completeOnboarding() calls startTour() directly, right after the onboarding
  // handoff — the tour's own first step (`nav-home`) already forces the tab back
  // to Home via its onEnter, so there's no separate "wait until they land on Home"
  // step needed; the whole point is the tour picks up the instant onboarding ends.
  //
  // Built from `navItems`, not NAV: the tour must never spotlight a pillar the
  // student can't see, and never the sealed SAT tab. On a brand-new account that
  // means a two-beat tour (Home, Prep) plus the ⌘K tip instead of a seven-beat march through tabs that
  // won't exist when they get back to the app — which is a shorter, truer tour
  // and exactly the direction the tour's own history says to go.
  const TOUR_COPY = useMemo(()=>({
    home:      { section:'Home', color:C.blue, title:'Your dashboard', body:"Streak, XP, and today's next lesson — every session starts here.", onEnter:()=>setTab('home') },
    prep:      { section:'Prep', color:C.violet, title:'Your curriculum', body:"Take the 2-minute diagnostic to find your pathway, then work through it lesson by lesson.", onEnter:()=>setTab('prep') },
    portfolio: { section:'Portfolio', color:C.green, title:'Your application', body:"College list, essays, deadlines, and activities — everything admissions cares about, in one place.", onEnter:()=>setTab('portfolio') },
    plans:     { section:'Plans', color:C.fuchsia, title:'Your roadmap', body:"One click builds a day-by-day plan pulled from everything above, and keeps extending itself as you go.", onEnter:()=>setTab('plans') },
    progress:  { section:'Progress', color:C.cyan, title:'Proof of the work', body:"Verified mastery, performance by topic, and every badge you've earned.", onEnter:()=>setTab('progress') },
  }),[]);
  // ── Parallel pathway actions ────────────────────────────────────────────────
  // Switching focus is deliberately the cheapest operation in the app: one write of a single
  // string. No progress moves, no plan regenerates, nothing resets — which is exactly why it
  // can be bound to a click, a keystroke, a ⌘K entry and a popover row all at once without
  // any of them needing a confirmation step.
  const switchPath = useCallback((key,{ silent=false }={})=>{
    if(!user)return;
    const { user:next, status } = focusPathway(user,key,PATHS);
    if(status==='unknown'||status==='unchanged')return;
    saveUser(next);
    play('click');
    logEvent('pathway_focused',key);
    // If the student is looking at the Pathways page when they switch, bring the rail back into
    // view. Without it, someone scrolled down to unit 6 of Physician lands at the same pixel
    // offset in Nursing — mid-way through units they've never seen, with no idea the page
    // changed under them. Everywhere else in the app (sidebar, ⌘K, ⌥1-3) the scroll position is
    // left exactly alone, since it has nothing to do with what just changed.
    if(typeof document!=='undefined'){
      const rail=document.querySelector('[data-tour="pathway-rail"]');
      if(rail)requestAnimationFrame(()=>rail.scrollIntoView({behavior:reducedMotion?'auto':'smooth',block:'start'}));
    }
    if(silent)return;
    const p=PATHS[key];
    toast(
      status==='enrolled'?`${p?.label} added — now studying ${getActivePathways(next,PATHS).length} pathways in parallel.`
                         :`Now in focus: ${p?.label}`,
      {icon:<RefreshCw size={16}/>,duration:2200});
  },[user,saveUser,reducedMotion]);

  const enrollPath = useCallback((key)=>{
    if(!user)return;
    const { user:next, status } = enrollPathway(user,key,PATHS);
    const p=PATHS[key];
    if(status==='full'){
      toast(`You're already running ${MAX_ACTIVE_PATHWAYS} pathways — swap one out to add ${p?.label}.`,{icon:<Info size={16}/>,duration:3600});
      return;
    }
    if(status==='unknown')return;
    saveUser(next);
    play('click');
    logEvent(status==='enrolled'?'pathway_enrolled':'pathway_focused',key);
    if(status==='enrolled'){
      const count=getActivePathways(next,PATHS).length;
      celebrateXP();
      toast.success(
        count>1?`${p?.label} added — ${count} pathways running in parallel. Switch anytime with ⌥${count}.`
               :`${p?.label} pathway activated.`,
        {icon:<Route size={16}/>,duration:3600});
    }else{
      toast(`Now in focus: ${p?.label}`,{icon:<RefreshCw size={16}/>,duration:2200});
    }
  },[user,saveUser]);

  const dropPath = useCallback((key)=>{
    if(!user)return;
    const { user:next, status, focused } = dropPathway(user,key,PATHS);
    if(status!=='dropped')return;
    saveUser(next);
    logEvent('pathway_dropped',key);
    toast(
      focused?`Stopped studying ${PATHS[key]?.label}. Your progress is saved — now in focus: ${PATHS[focused]?.label}.`
             :`Stopped studying ${PATHS[key]?.label}. Your progress is saved — pick a pathway whenever you're ready.`,
      {icon:<Info size={16}/>,duration:4000});
  },[user,saveUser]);

  const swapPath = useCallback((outKey,inKey)=>{
    if(!user)return;
    const { user:next, status } = swapPathway(user,outKey,inKey,PATHS);
    if(status==='unknown')return;
    saveUser(next);
    play('click');
    logEvent('pathway_swapped',`${outKey}->${inKey}`);
    toast.success(`${PATHS[inKey]?.label} swapped in for ${PATHS[outKey]?.label} — the old progress is kept.`,{icon:<Route size={16}/>,duration:3600});
  },[user,saveUser]);

  // "Continue" on a pathway that ISN'T in focus. The whole point of running three at once is
  // that a five-minute lesson in the other track shouldn't cost a context switch, so this opens
  // the lesson directly and leaves focus alone. Everything that lesson writes on completion is
  // keyed off the lesson's own pathway (see LESSON_PATHWAY), not the focused one.
  const resumePathwayRow = useCallback((row)=>{
    if(!row?.resume)return;
    goPrep('pathways');
    openLesson(row.resume.lesson,row.resume.unit);
    if(row.key!==focusedPathway){
      toast(`Opened in ${PATHS[row.key]?.label} — your focus stays on ${PATHS[focusedPathway]?.label}.`,
        {icon:<Route size={15}/>,duration:2800});
    }
  },[goPrep,focusedPathway]); // eslint-disable-line react-hooks/exhaustive-deps

  // ⌥1 / ⌥2 / ⌥3 — jump straight to the nth pathway from anywhere in the app.
  // Keyed off e.code, not e.key: on macOS Alt+1 emits '¡', so matching on the character
  // would make the shortcut work on Windows and silently fail on a Mac. Suppressed while a
  // text field or a modal has focus, so typing "3" into a search box never re-themes the app.
  useEffect(()=>{
    if(activePathways.length<2)return undefined;
    function onKey(e){
      if(!e.altKey||e.metaKey||e.ctrlKey)return;
      const idx=['Digit1','Digit2','Digit3'].indexOf(e.code);
      if(idx===-1||idx>=activePathways.length)return;
      const el=document.activeElement;
      if(el&&(el.tagName==='INPUT'||el.tagName==='TEXTAREA'||el.isContentEditable))return;
      e.preventDefault();
      const key=activePathways[idx];
      if(key===focusedPathway)return;
      switchPath(key);
    }
    document.addEventListener('keydown',onKey);
    return ()=>document.removeEventListener('keydown',onKey);
  },[activePathways,focusedPathway,switchPath]);

  const TOUR_STEPS = useMemo(()=>[
    ...navItems.filter(n=>TOUR_COPY[n.id]).map(n=>({ target:`nav-${n.id}`, ...TOUR_COPY[n.id] })),
    // Only worth a step once there's actually something to switch between — a tour that
    // explains parallel pathways to somebody running one is teaching a feature they can't see.
    ...(activePathways.length>1?[{
      target:'pathway-quickswitch', section:'Everywhere', color:C.violetL, title:'Your pathways, side by side',
      body:`You're studying ${activePathways.length} pathways at once. This stays with you on every screen — click it to switch, or press ⌥1 / ⌥2${activePathways.length>2?' / ⌥3':''}. Nothing is lost when you move between them.`,
      onEnter:()=>{setCmdOpen(false);},
    }]:[]),
    { target:'cmdk', section:'Everywhere', color:C.blueL, title:'Search everything', body:`From anywhere, press ${cmdKeyHint} — or just "/" — to search. Not only the tabs: type a scholarship, a summer program, a BS/MD, a college or a lesson by name and it takes you to the exact card. On a phone, tap the magnifier up here.`, onEnter:()=>{setTab('home');setCmdOpen(false);} },
  ],[navItems,TOUR_COPY,activePathways,cmdKeyHint]);

  // ── Quick-switch command palette — one searchable jump point across every ────
  // pillar/subview so the whole product (Prep, Portfolio, Progress, and every
  // absorbed sub-app inside them) reads as one thing you can move around in fast.
  //
  // Scoped to what's unlocked, for the same reason the nav is: a palette that
  // offers to jump you to a Review Log holding nothing, or an Admissions
  // Calculator with no scores in it, is the wall of options again with a search
  // box in front of it. It re-grows automatically as the ladder opens.
  const COMMANDS = useMemo(()=>[
    // Every enrolled pathway, switchable by name — first in the list, because for a student
    // running three at once "switch to Nursing" is the most-repeated action in the app, and
    // because this array's order is also the keyboard order: filteredCmds[0] is what Enter
    // picks the moment the palette opens, so it has to be what the eye lands on too.
    ...(activePathways.length>1?pathwayRows.filter(r=>r.key!==focusedPathway).map(r=>({
      id:`path-${r.key}`, label:`${r.label} — ${r.done}/${r.total} lessons`, group:'Pathways',
      ic:PATH_ICONS[r.key]||Route, action:()=>switchPath(r.key),
    })):[]),
    ...(activePathways.length<MAX_ACTIVE_PATHWAYS?[{
      id:'path-add', label:'Add another pathway', group:'Pathways', ic:Plus, action:goManagePathways,
    }]:[]),
    ...navItems.map(n=>({ id:`nav-${n.id}`, dest:n.id, keywords:keywordsFor(n.id), label:n.label, group:'Jump to', ic:n.ic, action:()=>setTab(n.id) })),
    ...prepSubnav.map(n=>({ id:`prep-${n.id}`, dest:`prep/${n.id}`, keywords:keywordsFor(`prep/${n.id}`), label:n.label, group:'Prep', ic:n.ic, action:()=>goPrep(n.id) })),
    ...portfolioSubnav.map(n=>({ id:`port-${n.id}`, dest:`portfolio/${n.id}`, keywords:keywordsFor(`portfolio/${n.id}`), label:n.label, group:'Portfolio', ic:n.ic, action:()=>goPortfolio(n.id) })),
    // Every section of a merged Portfolio page that used to be a tab of its own. Without these,
    // merging them would have made "clinical hours" or "essays" un-findable in the one place a
    // fast typist looks for anything — the surfaces still exist, so they still get a command.
    // Each rides on its page's unlock, since that's the tab that actually holds it, and on its
    // own section gate where it has one.
    ...(unlocks.isOpen('portfolio','applying')?APPLYING_SECTIONS.filter(sec=>unlocks.isOpen('portfolio','applying',sec.id)).map(sec=>({
      id:`port-${sec.id}`, dest:`portfolio/applying:${sec.id}`, keywords:keywordsFor(`portfolio/applying:${sec.id}`),
      label:sec.label, group:'Portfolio', ic:sec.ic, action:()=>goPortfolio(sec.id),
    })):[]),
    ...(unlocks.isOpen('portfolio','opportunities','tracked')?[{
      id:'port-tracked', dest:'portfolio/opportunities:tracked', keywords:keywordsFor('portfolio/opportunities:tracked'),
      label:'What you\u2019re tracking', group:'Portfolio', ic:RadarIcon, action:()=>goPortfolio('tracked'),
    }]:[]),
    ...(unlocks.isOpen('portfolio','resume')?[
      { id:'port-clinical', dest:'portfolio/resume:clinical', keywords:keywordsFor('portfolio/resume:clinical'), label:'Clinical hours', group:'Portfolio', ic:Stethoscope, action:()=>goPortfolio('clinical') },
      { id:'port-research', dest:'portfolio/resume:research', keywords:keywordsFor('portfolio/resume:research'), label:'Research', group:'Portfolio', ic:FlaskConical, action:()=>goPortfolio('research') },
      { id:'port-skills', dest:'portfolio/resume:credentials', keywords:keywordsFor('portfolio/resume:credentials'), label:'Skills & certs', group:'Portfolio', ic:BadgeCheck, action:()=>goPortfolio('skills') },
    ]:[]),
    ...roadmapSubnav.map(n=>({ id:`road-${n.id}`, dest:`roadmap/${n.id}`, keywords:keywordsFor(`roadmap/${n.id}`), label:n.label, group:'Roadmap', ic:n.ic, action:()=>goRoadmap(n.id) })),
    ...progressSubnav.map(n=>({ id:`prog-${n.id}`, dest:`progress/${n.id}`, keywords:keywordsFor(`progress/${n.id}`), label:n.label, group:'Progress', ic:n.ic, action:()=>goProgress(n.id) })),
    // Settings has sub-tabs now, so it gets the same treatment as every other pillar. Family
    // Access earns its place here more than most: it is the one settings screen another person
    // is waiting on, and "⌘K, fam" is a great deal faster than remembering which tab it is under.
    ...settingsSubnav.map(n=>({ id:`set-${n.id}`, dest:`settings/${n.id}`, keywords:keywordsFor(`settings/${n.id}`), label:n.label, group:'Settings', ic:n.ic, action:()=>goSettings(null,n.id) })),
  ],[navItems,prepSubnav,portfolioSubnav,roadmapSubnav,progressSubnav,satSubnav,settingsSubnav,unlocks,goPrep,goPortfolio,goRoadmap,goProgress,goSat,goSettings,activePathways,pathwayRows,focusedPathway,switchPath,goManagePathways]);
  // ── What the palette shows ──────────────────────────────────────────────────
  // Three different jobs, and they used to be one:
  //
  //   TYPING   → rank every destination by how well it answers the words the
  //              student used, including the words that are not its label
  //              (searchNav, src/lib/navMap.js). Substring-matching labels meant
  //              "deadlines", "gpa", "fafsa" and "dark mode" all returned
  //              nothing at all, for screens that exist and are finished.
  //   ALSO     → rank the LIBRARY: the ~900 named records — scholarships,
  //              programs, combined degrees, colleges, lessons, decks — that a
  //              student is far more likely to be looking for than a screen.
  //              Nobody wants "Financial Aid"; they want Coca-Cola. See
  //              contentCmds below and src/lib/contentSearch.js.
  //   NOT YET  → an empty palette was a fixed list of thirty-odd destinations,
  //              which is a scan. It leads with the handful of screens this
  //              student was actually just on, because that is overwhelmingly
  //              where they are going back to.
  const recentCmds = useMemo(()=>{
    if(cmdQ.trim()) return [];
    const byDest=new Map(COMMANDS.filter(c=>c.dest).map(c=>[c.dest,c]));
    return cmdRecents.map(d=>byDest.get(d)).filter(Boolean).map(c=>({...c,group:'Recent'}));
  },[COMMANDS,cmdQ,cmdRecents]);
  // ── The screens the ladder has not shown them yet ──────────────────────────
  // A guided-mode student searching for something that is still gated used to
  // get "No matches — try a different word", which is false: the screen exists,
  // it is finished, and this app's own rule is that a lock means "we have not
  // put this in front of you yet", never "you may not have this". Landing on a
  // gated surface by any route — a link, a bookmark, the back button — already
  // opens it for good (see Guarantee #2 above), so a search that finds one and
  // a tap that opens it is exactly the behavior that already exists, reached
  // by the one route that was refusing to offer it.
  //
  // They are offered only when something has been typed, and they sort last, so
  // the palette still opens as the short list of what this student is doing now.
  const lockedCmds = useMemo(()=>unlocks.locked().map(l=>({
    id:`locked-${l.id}`, dest:l.id, keywords:keywordsFor(l.id), label:l.label,
    group:'Not shown yet', ic:Lock, hint:l.hint, locked:true, action:()=>goDest(l.id),
  })),[unlocks,goDest]);
  // ── The library, as commands ───────────────────────────────────────────────
  // Each hit carries its own breadcrumb ('Portfolio › Applying › Financial aid')
  // and, where the landing screen can act on it, the focus that opens the exact
  // card. The breadcrumb is not decoration: it is the only part of this feature
  // that teaches a student where things live, which is the only way anybody ever
  // stops needing to search in the first place.
  const CONTENT_ICONS = useMemo(()=>({
    Scholarships:Landmark, Opportunities:Trophy, 'Combined degrees':Stethoscope,
    Colleges:GraduationCap, Lessons:BookOpen, Flashcards:Layers,
  }),[]);
  const contentCmds = useMemo(()=>{
    const q=cmdQ.trim();
    if(q.length<2||!contentIndex) return [];
    return searchContent(q, contentIndex).map(e=>({
      id:`content-${e.id}`, label:e.label, hint:e.sub, where:e.where, group:e.group,
      ic:CONTENT_ICONS[e.group]||Search, action:()=>focusContent(e.dest, e.focus),
    }));
  },[cmdQ,contentIndex,CONTENT_ICONS,focusContent]);
  const filteredCmds = useMemo(()=>{
    const q=cmdQ.trim();
    if(!q) return [...recentCmds, ...COMMANDS.filter(c=>!recentCmds.some(r=>r.id===c.id))];
    // Screens first, records second. Both were ranked on the same scale (see
    // CONTENT_PENALTY in src/lib/contentSearch.js), so this is not a thumb on
    // the scale — it is the tiebreak that makes Enter mean the same thing every
    // time: typing "essays" opens the Essays section, never a scholarship that
    // happens to be an essay contest.
    return [...searchNav(q, [...COMMANDS, ...lockedCmds]), ...contentCmds];
  },[COMMANDS,cmdQ,recentCmds,lockedCmds,contentCmds]);
  const runCommand=useCallback((cmd)=>{ cmd.action(); setCmdOpen(false); play('click'); },[]);
  const onCmdInputKeyDown=useCallback((e)=>{
    if(e.key==='ArrowDown'){ e.preventDefault(); setCmdActiveIdx(i=>Math.min(i+1,filteredCmds.length-1)); }
    else if(e.key==='ArrowUp'){ e.preventDefault(); setCmdActiveIdx(i=>Math.max(i-1,0)); }
    // Home/End jump the list rather than moving the caret, which is what every
    // other palette on this student's machine does and what makes a long result
    // list navigable without thirty presses of an arrow key.
    else if(e.key==='Home'){ e.preventDefault(); setCmdActiveIdx(0); }
    else if(e.key==='End'){ e.preventDefault(); setCmdActiveIdx(Math.max(0,filteredCmds.length-1)); }
    else if(e.key==='Enter'){ e.preventDefault(); const cmd=filteredCmds[cmdActiveIdx]; if(cmd)runCommand(cmd); }
  },[filteredCmds,cmdActiveIdx,runCommand]);

  // A built-in deck's cards get a progressed (FSRS-scheduled) copy saved into cDecks under the
  // same name the first time it's actually reviewed — see rateCard() below, which persists
  // built-in deck progress the same way it always has for custom decks. Before that first
  // review, FLASH_DECKS' pristine static copy is all there is. Centralizing this lookup (instead
  // of repeating the ternary at every call site) also guarantees allCards/allDecksList never
  // double-count a built-in deck that's been studied once its progressed copy exists in cDecks.
  const builtinDeckNames = useMemo(()=>new Set(Object.keys(FLASH_DECKS)),[]);
  const cardsForDeck = useCallback((name,builtin)=>{
    if(builtin) return cDecks[name]||FLASH_DECKS[name]||[];
    return cDecks[name]||[];
  },[cDecks]);

  // FSRS due count (across built-in and custom decks)
  const allCards = useMemo(()=>[
    ...Object.keys(FLASH_DECKS).flatMap(n=>cardsForDeck(n,true)),
    ...Object.entries(cDecks).filter(([n])=>!builtinDeckNames.has(n)).flatMap(([,c])=>c),
  ],[cDecks,builtinDeckNames,cardsForDeck]);
  const dueCards = useMemo(()=>getDueCards(allCards).length,[allCards]);
  const avgRetention = useMemo(()=>{
    const rets = allCards.map(c=>getRetainability(c)).filter(r=>r!==null);
    return rets.length?Math.round(rets.reduce((s,r)=>s+r,0)/rets.length):null;
  },[allCards]);

  // Per-category quiz performance + the "what to do next" insight callouts built from it — lifted
  // to component scope (previously computed only inside tProgress()) so Portfolio can surface the
  // same gap-to-action callouts Progress already shows, instead of being two disconnected views
  // of the same underlying data.
  const catStats = useMemo(()=>cats3.map(cat=>{
    const cQ=ALL_QUIZZES.filter(q=>q.cat===cat);
    const taken=cQ.filter(q=>qScores[q.id]!==undefined);
    const avg=taken.length?Math.round(taken.reduce((s,q)=>s+qScores[q.id],0)/taken.length):null;
    return{cat,avg,taken:taken.length,total:cQ.length};
  }),[qScores]);
  const benchmarks = curPath?.benchmarks||{};
  const insights = useMemo(()=>buildInsights({
    catStats, pathwayLabel:curPath?.label, mastery, clinicalHours:clinicalHoursTotal, benchmarks,
    recommendersCount, collegeCount:appCounts.colleges, essayCount:appCounts.essays, streak, dueCards,
  }),[catStats,curPath,mastery,clinicalHoursTotal,benchmarks,recommendersCount,appCounts,streak,dueCards]);

  // Next lesson to resume (first not-done lesson in current pathway, in order)
  const nextLesson = useMemo(()=>{
    for(const u of (curPath?.units||[])){ for(const l of (u.lessons||[])){ if(!isLessonComplete(l,pathway[l.id])) return {...l,unitTitle:u.title}; } }
    return null;
  },[curPath,pathway,isLessonComplete]);

  // Today's Plan resource targets — which exact quizzes/lessons/decks today's plan
  // wants done, so the Quiz Library and Pathway can highlight those specific items
  // in place (not just recommend from scratch) instead of leaving the student to
  // hunt for "the two quizzes my plan mentioned" inside a library of hundreds.
  // Only *undone* tasks count — once a task is done it stops competing for attention.
  const todayPlanTargets = useMemo(()=>{
    const entry = getTodayPlanEntry(user?.masterPlan);
    const quizIds = new Set(), lessonIds = new Set(), deckNames = new Set(), articleTitles = new Set();
    (entry?.tasks||[]).forEach(t=>{
      if(t.done||!t.resourceId)return;
      if(t.resourceKind==='quiz')quizIds.add(t.resourceId);
      else if(t.resourceKind==='lesson')lessonIds.add(t.resourceId);
      else if(t.resourceKind==='deck')deckNames.add(t.resourceId);
      else if(t.resourceKind==='article')articleTitles.add(t.resourceId);
    });
    return {quizIds,lessonIds,deckNames,articleTitles,hasAny:quizIds.size>0||lessonIds.size>0||deckNames.size>0||articleTitles.size>0};
  },[user?.masterPlan]);

  // ═══ STUDENT DASHBOARD ═══════════════════════════════════════════════════════
  // Everything the six Home modules read, derived once here rather than inside
  // tHome() — the dashboard is the highest-traffic screen in the app and these
  // are the same rows the Portfolio, the coach and the Admissions Calculator
  // already reason over, so recomputing them per render would be both slower and
  // a second opinion about the student's own numbers.

  /**
   * Hours by the four categories the pathway benchmarks are stated in.
   *
   * Shadowing and clinical are split on `experience_kind`, matching the split
   * src/lib/admissions/intake.js already makes, so the rings and the Calculator
   * can never disagree about how many shadowing hours a student has. Volunteer
   * and leadership come from the activities list, where hours are stored as a
   * per-week rate times weeks per year rather than as a total.
   */
  const dashboardHours = useMemo(()=>{
    const clinical = portSnapshot?.clinical || clinicalHoursEntries || [];
    const acts = portSnapshot?.activities || portActivities || [];
    const sum = (rows,pick)=>rows.reduce((s,r)=>s+(Number(pick(r))||0),0);
    const actHours = (a)=>(Number(a?.hours_per_week)||0)*(Number(a?.weeks_per_year)||0);
    return {
      shadowing: sum(clinical.filter(r=>r?.experience_kind==='shadowing'), r=>r.hours),
      // Everything that is not explicitly shadowing is hands-on exposure —
      // the same default intake.js uses, since a row logged before the kind
      // field existed is far more often hands-on than observation.
      clinical:  sum(clinical.filter(r=>r?.experience_kind!=='shadowing'), r=>r.hours),
      volunteer: sum(acts.filter(a=>/volunteer|service|community/i.test(a?.activity_type||'')), actHours),
      leadership: sum(acts.filter(a=>a?.leadership_role), actHours),
    };
  },[portSnapshot,clinicalHoursEntries,portActivities]);

  /**
   * Cards RETAINED, not cards reviewed.
   *
   * A student who reviewed two hundred cards in March and has forgotten them
   * has not retained two hundred cards, and the substance milestone that claims
   * otherwise would be exactly the hollow competence signal that module exists
   * to avoid. 80% retrievability is the threshold below which FSRS considers a
   * card at real risk of being lost.
   */
  const cardsRetained = useMemo(
    ()=>allCards.filter(c=>{ const r=getRetainability(c); return r!==null && r>=80; }).length,
    [allCards]
  );

  // `nextThreeItems` — the ranked three — is built further down, immediately
  // after `dueDeckCount`, because it reads the deck counts and a `const` cannot
  // be referenced above its own declaration.

  // Medabrain Quiz Recommendations — ranked #1..#N picks driven by real performance
  // data (weak categories, enrolled courses, pathway). See lib/recommend.js.
  const catAverages = useMemo(()=>Object.fromEntries(cats3.map((c,i)=>[c,secAvgs[i]])),[secAvgs]);
  const courseCats  = useMemo(()=>new Set((user?.courses||[]).map(c=>COURSE_CAT_MAP[c]).filter(Boolean)),[user?.courses]);
  const medabrainSeed = useMemo(()=>getMedabrainSeed(),[]);
  // Medabrain Picks only unlocks once there's real performance data to personalize against —
  // before that, every student's inputs look alike (no scores, often no courses/pathway set
  // yet), so the panel shows a progress card instead of a ranked list that can't yet mean much.
  const medabrainPicksUnlocked = qTaken >= MEDABRAIN_PICKS_UNLOCK_AT;
  const medabrainPicksProg = medabrainPicksProgress(qScores);
  const rankedQuizzes = useMemo(()=>rankQuizzes({
    quizzes: ALL_QUIZZES, qScores, catAverages, courseCats,
    pathwayCats: curPath?.quizCats||[], pathwayLabel: curPath?.label||'',
    gradeKey: user?.gradeStage||null, gpaBand: user?.gpaBand||null, studentKey: medabrainSeed, count:6,
  }),[qScores,catAverages,courseCats,curPath,user?.gradeStage,user?.gpaBand,medabrainSeed]);
  const topPick = rankedQuizzes[0];

  // Optional one-line Medabrain (Groq) narration of the #1 pick — the ranking
  // above is fully deterministic and never depends on this; it's cosmetic.
  const askMedabrainAboutPick = useCallback(async(pick)=>{
    // Cached per quiz per day — this narration is cosmetic and identical for a given pick
    // within a day, so repeat views/clicks shouldn't re-hit Groq.
    const cacheKey = dailyKey('pickNarration', pick?.quiz?.id||'');
    const cached = getCached(cacheKey);
    if(cached) return cached;
    const prompt = getMedabrainPickPrompt({ pick, studentName: user?.name, pathwayLabel: curPath?.label });
    if(!prompt) return null;
    const text = await callGroqAI('You are Medabrain, an encouraging AI study coach for a high schooler. Respond with exactly one short sentence, no markdown.', prompt, 60, null, 'scout');
    setCached(cacheKey, text);
    return text;
  },[user?.name,curPath]);

  // ── Pathway helpers ──────────────────────────────────────────────────────────
  // Which pathway a lesson actually belongs to, and its key. Everything the lesson player shows
  // or records — its title strip, its accent, its "next lesson", its verification quiz, the
  // tutor's grounding — has to come from THIS, not from `curPath`: a student running three
  // pathways can open a Nursing lesson while Physician is in focus, and labeling that lesson
  // "Physician (MD/DO)" in blue is simply wrong. (Lesson ids are unique across pathways, which
  // is what makes the lookup unambiguous — guarded by verifyParallelPathways.mjs.)
  const pathwayKeyOf = useCallback((lesson)=>(lesson?.id&&LESSON_PATHWAY.get(lesson.id))||eSpec,[eSpec]);
  const pathwayOf = useCallback((lesson)=>PATHS[pathwayKeyOf(lesson)]||curPath,[pathwayKeyOf,curPath]);
  const unitM = (unit)=>unit?.lessons?.length?Math.round(unit.lessons.filter(l=>isLessonComplete(l,pathway[l.id])).length/unit.lessons.length*100):0;
  // States: 'verified' (quiz passed), 'done' (legacy self-report, no curated quiz on this lesson),
  // 'studying' (opened but not yet verified — does NOT unlock the next unit), 'available', 'locked'.
  const lessonState = (lesson,ui,units)=>{
    const entry=pathway[lesson.id];
    if(entry){
      if(lesson.quizIds?.length)return entry.verified?'verified':'studying';
      return'done';
    }
    if(ui===0)return'available';
    // The foundations tier sits behind nothing. Course strategy and credentials
    // are decisions with an external deadline — a course selection sheet is due
    // whether or not the student has finished three biology units — so these
    // units carry `openAlways` and are exempt from the sequential gate. Every
    // other unit's gating is untouched (see the note beside FOUNDATION_UNITS in
    // data/constants.js for why they are appended rather than prepended).
    if(units[ui]?.openAlways)return'available';
    const prev=units[ui-1];
    if(!prev)return'available';
    return prev.lessons.every(l=>isLessonComplete(l,pathway[l.id]))?'available':'locked';
  };

  async function signOut(){
    // Flush any progress still sitting behind the debounce window before wiping this device's
    // local copy, so a burst of XP/reviews right before signing out isn't lost from the cloud
    // snapshot the next device pulls. Best-effort — an offline sign-out still clears locally.
    try{ await ProgressSync.flushNow(); }catch(err){ console.error('Pre-signout sync flush failed:',err); }
    DB.setSyncEnabled(false);
    ProgressSync.resetSyncStatus();
    PlanStore.resetPlanStore(); // drop the previous account's plan-push state with everything else
    resetIntakeCache();         // …and the Admissions Calculator's cached intake row, so a second
                                // account on this browser never sees the first one's answers
    resetNarrativeCache();       // …and the Narrative Method Engine's cached inputs, for the same
                                 // reason and with more at stake: that row holds a student's
                                 // passion-project description and their Additional Information
                                 // draft, which must never appear under a second account
    await DB.clearAllData();
    clearViewState();
    resetMedexCache(user?.id);   // …and the MedEx seal history plus its localStorage mirror, for
                                 // the same reason: the score is one of the most personal numbers
                                 // in the app and must not survive into a second account's session
    setMedexSeals(null);setMedexSealState(null);
    setUser_(null);setPathway_({});setQScores_({});setCDecks_({});setPortActivities([]);setPortAwards([]);setPortGpa([]);setPortLoaded(false);setPortSnapshot(null);setCatPerf_({});setAchiev_(new Set());setStreak(0);setTab('home');
    toast('Signed out. See you next time!');
  }

  // ── Achievement checker ──────────────────────────────────────────────────────
  const checkAndUnlockAchievements = useCallback(async(u,qCount,perfect,str,reviews,mast,aiC,extra={})=>{
    const unlocked = await DB.getAchievements();
    // Every call site only ever passes the single pathway that just completed (if any) —
    // derive the account's true cumulative history from already-unlocked path_*_complete
    // badges instead, so multi-pathway achievements (path_explorer) actually accumulate across
    // separate pathway completions instead of only ever seeing a 0-or-1-element set.
    const pathwayCompletions = new Set([
      ...PATHWAY_KEYS.filter(k=>unlocked.has(`path_${k}_complete`)),
      ...(extra.pathwayCompletions||[]),
    ]);
    const toUnlock = checkAchievements({
      level:u?getLevelInfo(u.xp||0).level:1, quizCount:qCount, perfectScores:perfect, streak:str, cardReviews:reviews, mastery:mast, aiChats:aiC,
      interviewSessions: extra.interviewSessions??interviewCount, colleges: extra.colleges??appCounts.colleges, essays: extra.essays??appCounts.essays,
      activities: extra.activities??portActivities.length, deadlines: extra.deadlines??(upcomingDeadlines||[]).length, resumeBuilt: extra.resumeBuilt??appCounts.resume,
      clinicalHours: extra.clinicalHours??clinicalHoursTotal, recommenders: extra.recommenders??recommendersCount, mmiCasperSessions: extra.mmiCasperSessions??mmiCasperCount,
      pathwayCompletions,
      // The three substance milestones the dashboard weights above everything else.
      // `cardsRetained` is deliberately not `reviews` — see achievements.js for why
      // "reviewed a hundred cards once" is not "retained a hundred cards".
      shadowingHours: extra.shadowingHours??dashboardHours.shadowing,
      certifications: extra.certifications??skillsCount,
      cardsRetained: extra.cardsRetained??cardsRetained,
      unlocked,
    });
    for(const achievement of toUnlock){
      const isNew = await DB.unlockAchievement(achievement.key);
      if(isNew){
        setAchiev_(prev=>new Set([...prev,achievement.key]));
        // Drives the dashboard's one celebration: a 200ms scale-and-fade on the row that just
        // landed, and only on a substance milestone. Everything else unlocks silently, because an
        // animation that fires on every save teaches the student it means nothing.
        if(achievement.substance) setLastEarnedAchievement(achievement.key);
        const bonusXP=achievement.xp||0;
        // `achievements` itself is already deduped cross-device (unlocked once, merged by key —
        // see db.js), but this XP grant runs the instant THIS device notices the condition is
        // met, which can happen independently on two devices before either has synced. Route the
        // bonus through the idempotent reward-claim path (keyed by the achievement, which is
        // already a stable, globally-unique-per-account identity) so it can only ever land once.
        if(u&&bonusXP>0){ claimRewardXP(`achievement:${achievement.key}`,bonusXP).then(syncUserFromDb).catch(console.error); }
        if(achievement.key==='streak_7'||achievement.key==='streak_30'){
          const granted=await DB.grantStreakFreeze({streak,source:'achievement'});
          if(granted){
            setStreakFreezes(await DB.getStreakFreezeCount());
            toast(pickNudge('streak_freeze_earned'),{icon:<Snowflake size={14} color={C.blueL}/>,duration:4500});
          }
        }
        showAchievementToast(achievement);
      }
    }
  },[saveUser,interviewCount,appCounts,upcomingDeadlines,portActivities,clinicalHoursTotal,recommendersCount,mmiCasperCount,dashboardHours,skillsCount,cardsRetained]);

  // ── Level-up checker ─────────────────────────────────────────────────────────
  const prevLvlRef = useRef(1);
  useEffect(()=>{
    if(!user)return;
    const curLvl=getLevelInfo(user.xp||0).level;
    if(curLvl>prevLvlRef.current){
      celebrateLevelUp();
      play('levelUp');
      toast.success(pickNudge('level_up',{level:curLvl,tier:getLevelInfo(user.xp||0).tier}),{duration:4000,icon:<Trophy size={16}/>});
    }
    prevLvlRef.current=curLvl;
  },[user?.xp]);

  // ── The check-in calendar (rewards opening the app, before any studying) ───
  //
  // This is the OTHER ladder. The streak below measures work; this measures turning up. They
  // are drawn differently, named differently, and never share a number — a check-in can never
  // clear a streak day, and studying can never advance the check-in cycle.
  //
  // The cycle is 28 days and deliberately lumpy: nine specific days carry freezes, chests and
  // XP boosts, and the calendar is drawn in full so a student on day 12 can see that day 14 is
  // a chest and six hours of Double XP. That two-days-out visibility is the actual mechanic;
  // the chest animation is just the payment.
  const checkinTriggeredRef = useRef(false);

  // `lastRepairAt` backs the comeback-offer calculation further down (see `streakRepair`), but
  // has to be declared here, ahead of `refreshStreakState`, which writes to it.
  const [lastRepairAt, setLastRepairAt] = useState(null);

  /** Re-reads the whole streak ledger. Called after anything writes to it. Declared ahead of
   *  claimTodayCheckin below, which closes over it in its own useCallback deps — as a `const`,
   *  referencing it from an earlier callback would throw before this line ever ran. */
  const refreshStreakState = useCallback(async()=>{
    const [rows,bridged,claimed,str,freezes,history,live,repairedAt] = await Promise.all([
      DB.getAllDayActivity(), DB.getBridgedDates(), DB.getClaimedStreakRewards(),
      DB.getStreak(), DB.getStreakFreezeCount(),
      DB.getStreakFreezes(), DB.getActiveBoosts(), DB.getLastRepairAt(),
    ]);
    setDayRows(rows||[]);
    setBridgedDates(bridged||new Set());
    setClaimedStreakRewards(claimed||new Set());
    setStreak(str||0);
    setStreakFreezes(freezes||0);
    setFreezeHistory(history||[]);
    setBoosts(live||[]);
    setLastRepairAt(repairedAt||null);
    return { rows, bridged, claimed, streak: str||0 };
  },[]);

  /** Re-reads the whole cycle. Called on load and after every claim. */
  const refreshCheckin = useCallback(async()=>{
    try{
      const state = await loadCheckinState();
      setCheckinState(state);
      return state;
    }catch(e){ console.error('check-in state',e); return null; }
  },[]);

  /**
   * Take today's check-in.
   *
   * Everything a day can carry is granted here and nowhere else: XP (through the idempotent
   * reward-claim outbox, keyed `checkin:<date>`, so claiming on a phone and a laptop pays
   * once), a streak freeze, an XP boost, and the chest ceremony. `claimCheckin` is the local
   * gate — it fails on a second call for the same date, which is what makes a reload race or a
   * double tap harmless.
   */
  const claimTodayCheckin = useCallback(async({ceremony=true}={})=>{
    const state = checkinState || await refreshCheckin();
    if(!state?.claimable) return;
    const { day, reward, everChecked } = state;
    setStreakBusy(b=>({...b,checkin:true}));
    try{
      const cosmetic = reward.chest ? rollCosmetic(cosmetics) : null;
      const grant = async()=>{
        const claimed = await claimCheckin(day);
        // Today was already recorded on this device (reload race) — do not double-grant.
        if(!claimed) return;
        play('xp');
        if(cosmetic){ await DB.unlockCosmetic(cosmetic.key); setCosmetics(prev=>new Set([...prev,cosmetic.key])); }
        // A freeze, if the day carries one and the league cap allows it.
        if(reward.freeze>0){
          let granted=0;
          for(let i=0;i<reward.freeze;i++){
            // eslint-disable-next-line no-await-in-loop
            if(await DB.grantStreakFreeze({streak,source:'checkin'})) granted+=1;
          }
          if(granted>0){
            toast(`Day ${day}: ${granted} streak freeze${granted>1?'s':''} added.`,
              {icon:<Snowflake size={14} color={C.blueL}/>,duration:4500});
          }else{
            // Being honest about the cap beats silently swallowing a reward the card promised.
            toast(`Day ${day}'s freeze could not be added — you are already holding the ${freezeCapFor(streak)} your league allows.`,
              {icon:<Info size={14} color={C.t2}/>,duration:5000});
          }
        }
        // A boost, if the day carries one.
        if(reward.boost && BOOST_KINDS[reward.boost]){
          const def = BOOST_KINDS[reward.boost];
          await DB.grantBoost(def.id, def.hours, {source:`checkin:${day}`});
          toast.success(`${def.label} active — ${def.blurb}`,
            {icon:<Zap size={15} color={def.color}/>,duration:6000});
        }
        // XP last, through the outbox. Optimistic locally, reconciled with the server in the
        // background; a losing claim rolls its local grant back and says so.
        const { granted: xpGranted } = await claimRewardXP(`checkin:${localDateStr()}`, reward.xp);
        await syncUserFromDb();
        if(xpGranted===false){
          toast('That check-in was already claimed on your other device — XP adjusted.',{icon:<Info size={14} color={C.t2}/>,duration:5000});
        }
        await Promise.all([refreshCheckin(), refreshStreakState()]);
      };

      if(ceremony){
        openChest({
          title: reward.label ? `Day ${day} · ${reward.label}` : `Day ${day} Check-in`,
          eyebrow: everChecked ? 'Welcome back' : 'Welcome',
          xp: reward.xp,
          cosmetic,
          onOpen: grant,
        });
      }else{
        await grant();
      }
    }finally{
      setStreakBusy(b=>({...b,checkin:false}));
    }
  },[checkinState,refreshCheckin,cosmetics,streak,openChest,syncUserFromDb,refreshStreakState]);

  // Load the cycle once the database is open, and offer today's chest automatically — the
  // ceremony is the reason the first tap of the day feels like something.
  useEffect(()=>{
    if(!dbReady||!user||checkinTriggeredRef.current)return;
    checkinTriggeredRef.current=true;
    (async()=>{
      const state = await refreshCheckin();
      if(state?.claimable) await claimTodayCheckin();
    })();
  },[dbReady,user]); // eslint-disable-line react-hooks/exhaustive-deps

  // ══ EARNED STREAK ══════════════════════════════════════════════════════════
  // One source of truth (dayRows + bridgedDates + the user's two goal settings)
  // and every streak number in the app derived from it. Home's card, the Progress
  // tab, the pathway strip and the lesson-complete takeover all read these exact
  // objects, which is what makes it impossible for two screens to disagree about
  // whether today is done.
  useEffect(()=>{ cDecksRef.current = cDecks; },[cDecks]);

  const dayActivityMap = useMemo(()=>new Map(dayRows.map(r=>[r.date,r])),[dayRows]);
  const metDates       = useMemo(()=>new Set(dayRows.filter(r=>r.met).map(r=>r.date)),[dayRows]);
  const goalCredits    = useMemo(()=>goalCreditsFor(user),[user?.streakGoalId]);
  const streakTarget   = useMemo(()=>streakTargetFor(user),[user?.streakTarget]);
  const todayStatus    = useMemo(()=>{
    const row = dayActivityMap.get(localDateStr());
    // A day already cleared keeps the goal it was cleared against, so raising the
    // daily goal mid-day cannot un-earn a finished day (mirrors DB.recordStreakActivity).
    return dayStatus(row?.credits||0, row?.met ? (row.goalCredits||goalCredits) : goalCredits);
  },[dayActivityMap,goalCredits]);
  const weekInfo       = useMemo(()=>weekProgress(metDates,{bridged:bridgedDates}),[metDates,bridgedDates]);
  const monthInfo      = useMemo(()=>monthProgress(metDates,{bridged:bridgedDates}),[metDates,bridgedDates]);
  const streakTargetInfo = useMemo(()=>targetProgress(streak,streakTarget),[streak,streakTarget]);
  const bestStreakEver = useMemo(()=>Math.max(streak,longestStreak(metDates,bridgedDates)),[streak,metDates,bridgedDates]);
  const nextStreakReward = useMemo(()=>nextMilestone(streak),[streak]);
  // The streak's identity, and the two numbers it is actually worth.
  const xpMult         = useMemo(()=>xpMultiplier({streak,boosts}),[streak,boosts]);
  const liveBoosts     = useMemo(()=>activeBoosts(boosts),[boosts]);
  // Keep the award-site ref in step with the derived multiplier. See awardBoostedXP above for
  // why this is a ref and not a closed-over value.
  useEffect(()=>{ xpMultRef.current = xpMult.total; },[xpMult.total]);
  /**
   * The comeback offer. Recomputed from the ledger rather than stored, so it appears the moment
   * a streak is actually broken and disappears the moment one is rebuilt, with nothing to clean
   * up either way. `lastRepairAt` comes off the permanent claim ledger, so the once-a-month
   * cooldown is per ACCOUNT rather than per device. (State declared earlier, alongside
   * refreshStreakState — see the check-in section above.)
   */
  const streakRepair = useMemo(()=>repairOffer(metDates,{
    bridged: bridgedDates, lastRepairAt, xp: user?.xp||0,
  }),[metDates,bridgedDates,lastRepairAt,user?.xp]);
  // What Medabrain is told about the streak. It gets the student's own goal and
  // whether TODAY is cleared — not just the streak length — because "you haven't
  // studied today yet" is the single most useful thing a coach can say here, and
  // it is only honest if the coach knows a day is earned rather than attended.
  const medabrainStreakContext = useMemo(()=>({
    goalLabel:getGoal(user?.streakGoalId).label,
    goalCredits:todayStatus.goalCredits,
    creditsToday:todayStatus.credits,
    dayMet:todayStatus.met,
    weekMet:weekInfo.met,
    weekStillPossible:weekInfo.stillPossible,
    target:streakTarget,
    freezes:streakFreezes,
  }),[user?.streakGoalId,todayStatus,weekInfo,streakTarget,streakFreezes]);

  /**
   * THE one place a streak day is earned.
   *
   * Every call site is a piece of finished work (a verified lesson, a submitted
   * quiz, ten reviewed cards). Nothing about opening, navigating or reading the
   * app reaches here — that is the whole point of the rewrite.
   *
   * Also pays out anything the new streak length unlocked: milestone rungs and
   * the Perfect Week. Both go through DB.claimStreakReward, which is a permanent
   * once-ever ledger, so a rebuilt streak passing day 30 again pays nothing and a
   * second device syncing late cannot double-claim.
   *
   * Returns the shape the lesson-complete overlay needs, so the caller does not
   * have to re-read anything.
   */
  const creditStreak = useCallback(async(action,{times=1,silent=false}={})=>{
    const credits = creditsFor(action,times);
    if(!credits) return null;
    const before = await DB.getStreak();
    let result;
    try{
      result = await DB.recordStreakActivity(action,{credits,goalCredits:goalCreditsFor(user),times});
    }catch(e){ console.error('Failed to record streak activity',e); return null; }

    const after = await DB.getStreak();
    let xpFromRewards = 0;
    let milestoneHit = null;
    let perfectWeekJustEarned = false;
    let perfectMonthJustEarned = false;

    if(result.justMet){
      const claimed = await DB.getClaimedStreakRewards();
      // ── Milestone rungs ──
      for(const rung of unclaimedMilestones(after,claimed)){
        // eslint-disable-next-line no-await-in-loop
        if(!await DB.claimStreakReward(rewardKey(rung.days),{days:rung.days}))continue;
        xpFromRewards += rung.xp;
        // The cap a freeze grant is checked against is the LEAGUE's cap at the streak length
        // that just unlocked this rung — so the rung that promotes a student to Blaze can
        // itself pay out the third freeze Blaze allows.
        // eslint-disable-next-line no-await-in-loop
        for(let i=0;i<(rung.freezes||0);i++) await DB.grantStreakFreeze({streak:after,source:'milestone'});
        if(!milestoneHit||rung.days>milestoneHit.days)milestoneHit=rung;
      }
      // ── Perfect week ── recomputed AFTER the write so today counts toward it.
      const rows = await DB.getAllDayActivity();
      const met = new Set(rows.filter(r=>r.met).map(r=>r.date));
      const bridgedNow = await DB.getBridgedDates();
      const wk = weekProgress(met,{bridged:bridgedNow});
      if(wk.complete && await DB.claimStreakReward(perfectWeekKey(wk.weekKey),{week:wk.weekKey})){
        xpFromRewards += PERFECT_WEEK_REWARD.xp;
        for(let i=0;i<PERFECT_WEEK_REWARD.freezes;i++) await DB.grantStreakFreeze({streak:after,source:'week'});
        perfectWeekJustEarned = true;
      }
      // ── Perfect month ── the same idea one octave down, and genuinely hard: a single
      // missed Sunday in week one ends it. Only checked on the day it can actually complete,
      // which is the last day of the month.
      const mo = monthProgress(met,{bridged:bridgedNow});
      if(mo.complete && await DB.claimStreakReward(perfectMonthKey(mo.monthKey),{month:mo.monthKey})){
        xpFromRewards += PERFECT_MONTH_REWARD.xp;
        for(let i=0;i<PERFECT_MONTH_REWARD.freezes;i++) await DB.grantStreakFreeze({streak:after,source:'month'});
        perfectMonthJustEarned = true;
      }
    }

    // Milestone/perfect-week XP is deterministic on purpose — never routed
    // through awardXP's variable roll. A reward a student can see coming from ten
    // days away has to pay exactly what it advertised.
    if(xpFromRewards>0){
      const u = await DB.getUser();
      if(u){ await DB.saveUser({...u,xp:(u.xp||0)+xpFromRewards}); }
      await syncUserFromDb();
    }

    const fresh = await refreshStreakState();
    const wkAfter = weekProgress(
      new Set((fresh.rows||[]).filter(r=>r.met).map(r=>r.date)),
      {bridged:fresh.bridged||new Set()},
    );

    if(!silent){
      if(milestoneHit){
        celebrateStreak();play('achieve');
        toast.success(`${milestoneHit.days}-day streak — ${milestoneHit.title}! +${milestoneHit.xp} XP`,
          {icon:<Flame size={16} color={C.amberL}/>,duration:5000});
      }
      if(perfectWeekJustEarned){
        celebrateStreak();
        toast.success(`Perfect Week — all seven days earned. +${PERFECT_WEEK_REWARD.xp} XP and a streak freeze.`,
          {icon:<Trophy size={16} color={C.goldL}/>,duration:5000});
      }
      if(perfectMonthJustEarned){
        celebrateStreak();play('achieve');
        toast.success(`Perfect Month — every single day. +${PERFECT_MONTH_REWARD.xp} XP and ${PERFECT_MONTH_REWARD.freezes} freezes.`,
          {icon:<Trophy size={16} color={C.goldL}/>,duration:6000});
      }
    }

    return {
      ...result, streakBefore:before, streak:after,
      milestoneHit, perfectWeekJustEarned, perfectMonthJustEarned, xpFromRewards,
      week:wkAfter,
      day:dayStatus(result.credits,result.goalCredits),
    };
  },[user,refreshStreakState,syncUserFromDb]);

  // ── The freeze shop ────────────────────────────────────────────────────────
  /**
   * Buy a streak freeze with XP.
   *
   * XP, never money. A paid streak freeze sells relief from anxiety the product itself
   * manufactured, which is the most cynical mechanic in this category of app. XP is a real
   * budget with real alternative uses, so the decision stays meaningful and nobody's parent
   * gets a charge for a missed Tuesday.
   *
   * The debit happens first and is rolled back if the grant is refused, so a cap reached on
   * another device between the check and the write cannot silently take the XP.
   */
  const buyFreeze = useCallback(async()=>{
    const held = await DB.getStreakFreezeCount();
    const offer = canBuyFreeze({streak,held,xp:user?.xp||0});
    if(!offer.ok){ toast(offer.reason,{icon:<Info size={14} color={C.t2}/>,duration:4500}); return; }
    setStreakBusy(b=>({...b,freeze:true}));
    try{
      const u = await DB.getUser();
      if(!u || (u.xp||0) < offer.cost){ toast.error('Not enough XP for that.'); return; }
      await DB.saveUser({...u,xp:(u.xp||0)-offer.cost});
      const granted = await DB.grantStreakFreeze({streak,source:'purchase'});
      if(!granted){
        await DB.saveUser({...u,xp:u.xp||0}); // refund — the cap was reached elsewhere
        toast('You are already holding as many freezes as your league allows.',{icon:<Info size={14} color={C.t2}/>,duration:4500});
        return;
      }
      await syncUserFromDb();
      await refreshStreakState();
      play('achieve');
      toast.success(`Freeze bought for ${offer.cost.toLocaleString()} XP. One missed day is now survivable.`,
        {icon:<Snowflake size={15} color={C.blueL}/>,duration:4500});
    }catch(e){
      console.error('buy freeze',e);
      toast.error('Could not buy that freeze. Nothing was charged.');
    }finally{
      setStreakBusy(b=>({...b,freeze:false}));
    }
  },[streak,user?.xp,syncUserFromDb,refreshStreakState]);

  // ── The comeback ───────────────────────────────────────────────────────────
  /**
   * Buy back a broken streak.
   *
   * The repaired days are written as bridged (exactly what a freeze produces), so the run
   * continues and NOTHING else changes: a repaired day can never complete a Perfect Week or a
   * Perfect Month, and it never moves a study-day quest. Continuity is purchasable; credit for
   * work that did not happen is not.
   */
  const doStreakRepair = useCallback(async()=>{
    const offer = streakRepair;
    if(!offer?.available) return;
    setStreakBusy(b=>({...b,repair:true}));
    try{
      const u = await DB.getUser();
      if(!u || (u.xp||0) < offer.cost){ toast.error('Not enough XP to restore that streak.'); return; }
      await DB.saveUser({...u,xp:(u.xp||0)-offer.cost});
      const ok = await DB.repairStreak(offer.dates);
      if(!ok){
        await DB.saveUser({...u,xp:u.xp||0}); // refund — another device repaired first
        toast('That streak was already restored on your other device.',{icon:<Info size={14} color={C.t2}/>,duration:4500});
      }else{
        celebrateStreak();play('achieve');
        toast.success(`${offer.lost}-day streak restored. Do not waste it — go and earn today.`,
          {icon:<Flame size={16} color={C.amberL}/>,duration:6000});
      }
      await syncUserFromDb();
      await refreshStreakState();
    }catch(e){
      console.error('streak repair',e);
      toast.error('Could not restore that streak. Nothing was charged.');
    }finally{
      setStreakBusy(b=>({...b,repair:false}));
    }
  },[streakRepair,syncUserFromDb,refreshStreakState]);

  // ══ QUESTS ═════════════════════════════════════════════════════════════════
  //
  // The whole lifecycle lives in this block, in the order it runs:
  //
  //   load        pull the student's rows from the server (every status)
  //   derive      rebuild this device's evidence from Dexie
  //   evaluate    run the pure engine over the two → what every surface renders
  //   report      push the derived numbers back so the parent's board agrees
  //   celebrate   the takeover, once, the moment one completes
  //   claim       the reward, through the same idempotent path everything else uses
  //
  // Progress is never stored in React state. It is recomputed from `questRows` +
  // `questEvents` on every render by the memo below, which is what makes the Home card,
  // four strips, and the board structurally incapable of showing different numbers.

  const loadQuests = useCallback(async ()=>{
    // A failed request here used to leave `questsLoading` stuck true forever — nothing set it
    // back to false on the throw path, so every quest surface stayed on its loading state until
    // a full reload re-ran this from scratch. try/finally guarantees the flag always resolves,
    // and the catch surfaces the failure through the existing questError state instead of an
    // unhandled promise rejection.
    try{
      const { quests, available } = await QuestAPI.list();
      setQuestRows(quests);
      setQuestsAvailable(available);
      setQuestError(null);
      return quests;
    }catch(e){
      console.error('QuestAPI.list failed:',e);
      setQuestError(e?.message||'Could not load quests.');
      return [];
    }finally{
      setQuestsLoading(false);
    }
  },[]);

  /**
   * Rebuild the evidence list from Dexie.
   *
   * Bounded to the oldest running quest's start — a student two years in should not read a
   * hundred thousand card reviews to render a fortnight-long quest. When nothing is running
   * there is nothing to measure, so the read is skipped entirely.
   */
  //
  // The portfolio half of the evidence, shared by the long quests and today's three.
  //
  // These rows live behind the API rather than in Dexie, so they come from the snapshot the
  // Portfolio tab already fetches. Absent (student has not opened Portfolio this session) simply
  // means those metrics do not move yet — they catch up the moment the tab is visited, and no
  // quest ever loses credit, because everything here is recomputed from scratch every time
  // rather than accumulated.
  const questPortfolio = useMemo(()=>({
    activities:portSnapshot?.activities||portActivities,
    research:portSnapshot?.research||[],
    skills:portSnapshot?.skills||[],
    clinical:portSnapshot?.clinical||clinicalHoursEntries,
    // Filtered for the same reason as appCounts above: the "why this pathway" working document
    // is an essays row and is not an application essay, so no quest credits opening it.
    essays:(portSnapshot?.essays||[]).filter(e=>e?.essay_kind!=='why_pathway'),
    awards:portSnapshot?.awards||portAwards||[],
    colleges:portSnapshot?.colleges||[],
    scholarships:portSnapshot?.scholarships||portScholarships||[],
    recommenders:portSnapshot?.recommenders||[],
    // "Tracked" means a row that came out of the curated Opportunities/Scholarships
    // catalogs, which is exactly what isCatalogSourced() already answers for the Tracked
    // board (src/lib/trackingCatalog.js). Reusing that predicate rather than inventing a
    // flag is what keeps the quest and the Tracked tab counting the same rows — an
    // activity the student typed in themselves is portfolio work, not a program they found.
    tracked:[...(portSnapshot?.activities||[]),...(portSnapshot?.scholarships||portScholarships||[])]
      .filter(r=>isCatalogSourced(r?.notes)||isCatalogSourced(r?.description)),
  }),[portSnapshot,portActivities,clinicalHoursEntries,portScholarships,portAwards]);

  // ═══ MEDEX SCORE ═════════════════════════════════════════════════════════════
  // One number for where this student stands against the class that gets admitted at the most
  // selective school on their list. See src/lib/medex/ — the score is a PROJECTION of the
  // Admissions Calculator's own five-layer model, never a second scoring model, so the two
  // surfaces can never tell a student different things about the same portfolio.
  //
  // Everything below is derived from the shared Portfolio snapshot, which means the Home card,
  // the breakdown panel and the Calculator are all reasoning over one fetch (src/lib/portfolioData.js).
  const [medexSeals, setMedexSeals] = useState(null);       // null = not read yet; [] = read, empty
  const [medexSealState, setMedexSealState] = useState(null);

  // The saved intake rides along in the snapshot, so the score knows the student's GPA, rigor and
  // citizenship without a second request — and without asking them for it twice.
  const medexIntake = useMemo(()=>unpackIntake(portSnapshot?.admissionIntake?.[0]||null),[portSnapshot]);

  const medex = useMemo(()=>{
    if(!portSnapshot) return null;
    const portfolio = derivePortfolioSignals(portSnapshot);
    const derived = deriveApplicantFromPortfolio({ snapshot:portSnapshot, user });
    const applicant = buildApplicant({ derived, answers:medexIntake.answers, portfolio });
    const completeness = assessCompleteness({ applicant, answers:medexIntake.answers });
    return computeMedEx({
      colleges:portSnapshot.colleges||[], applicant, portfolio, completeness,
      programRounds:medexIntake.programRounds,
    });
  },[portSnapshot,medexIntake,user]);

  // ── The weekly seal ──────────────────────────────────────────────────────────
  // Read the history once the snapshot lands, then take this week's seal if it has not been
  // taken. Both are idempotent: sealIfNeeded() is a no-op on a week that already sealed, and the
  // unique index on (user_id, week_key) settles the race between two open tabs.
  useEffect(()=>{
    if(!portSnapshot||medexSeals!==null)return;
    let cancelled=false;
    loadSeals(portSnapshot).then(rows=>{ if(!cancelled) setMedexSeals(rows||[]); }).catch(()=>{ if(!cancelled) setMedexSeals([]); });
    return ()=>{ cancelled=true; };
  },[portSnapshot,medexSeals]);

  useEffect(()=>{
    if(medexSeals===null)return;
    const live=medex?.headline;
    // A student with no score yet (too little logged, or a requirement they do not meet) seals
    // nothing. Writing a row for a week whose number we declined to show would put a score in
    // their history that they were never told about.
    if(!live?.showsScore){ setMedexSealState(planSeal({ rows:medexSeals, liveScore:null })); return; }
    let cancelled=false;
    sealIfNeeded({ rows:medexSeals, live, benchmark:medex.headline.program, userId:user?.id })
      .then(next=>{ if(!cancelled) setMedexSealState(next); })
      .catch(()=>{ if(!cancelled) setMedexSealState(planSeal({ rows:medexSeals, liveScore:live.score })); });
    return ()=>{ cancelled=true; };
  },[medexSeals,medex,user?.id]);

  // What every MedEx surface reads. `loading` is true only while we genuinely have nothing to
  // show: once the snapshot is in, the card renders even if the seal write is still in flight,
  // because the live score is already the right number to display.
  const medexState = useMemo(()=>({
    loading:!portSnapshot,
    medex,
    seal:medexSealState,
    rows:medexSeals||[],
    mirror:readMirror(user?.id),
  }),[portSnapshot,medex,medexSealState,medexSeals,user?.id]);

  // A mover names a model dimension ('clinical', 'research', 'academics'); the student needs the
  // Portfolio section where that thing is actually logged.
  const goMedexDimension = useCallback((key)=>{
    const dest={
      academics:'academics', clinical:'clinical', shadowing:'clinical', research:'research',
      service:'activities', leadership:'activities', competitions:'activities',
      certifications:'credentials', verification:'activities', completeness:'medex',
    }[key]||'medex';
    goPortfolio(dest);
  },[goPortfolio]);

  const refreshQuestEvents = useCallback(async (rows)=>{
    const live=(rows||[]).filter(q=>!QUEST_TERMINAL.has(q.status));
    if(!live.length){ setQuestEvents([]); return []; }
    const since=Math.min(...live.map(q=>q.startedAt||Date.now()));
    try{
      const evidence=await DB.getQuestEvidence({since});
      const events=buildQuestEvents({...evidence, portfolio:questPortfolio});
      setQuestEvents(events);
      return events;
    }catch(e){ console.error('quest evidence',e); return []; }
  },[questPortfolio]);

  /**
   * Today's evidence, for the daily quests.
   *
   * A separate read from the long quests' one on purpose. Theirs is bounded by the oldest
   * RUNNING quest and returns nothing at all when nothing is running — and today's three have
   * to work for a student who has never taken a long quest in their life. Bounding this at
   * local midnight also keeps it cheap: it is the smallest useful window there is.
   */
  const refreshDailyEvents = useCallback(async ()=>{
    try{
      const start=new Date(); start.setHours(0,0,0,0);
      const evidence=await DB.getQuestEvidence({since:start.getTime()});
      const events=buildQuestEvents({...evidence, portfolio:questPortfolio});
      setDailyEvents(events);
      return events;
    }catch(e){ console.error('daily quest evidence',e); return []; }
  },[questPortfolio]);

  // First load, once the database is open and we know who this is.
  useEffect(()=>{
    if(!dbReady||!user)return;
    let cancelled=false;
    (async()=>{
      const rows=await loadQuests();
      if(!cancelled) await refreshQuestEvents(rows);
    })();
    return ()=>{ cancelled=true; };
  },[dbReady,user?.id,loadQuests]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-derive whenever something a quest could possibly measure has moved. These are the same
  // counters every other derived surface in the app keys off, so a quest bar updates on exactly
  // the same beat as the streak and the XP total rather than on a timer of its own.
  useEffect(()=>{
    if(!dbReady||!questRows.length)return;
    refreshQuestEvents(questRows);
  },[dbReady,questRows,totalReviews,qHistory.length,streak,dayRows,portSnapshot,clinicalHoursTotal,interviewCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── TODAY'S THREE ──────────────────────────────────────────────────────────
  //
  // Deterministic per student per day (see src/lib/dailyQuests.js): the same three on every
  // device, unrerollable by a reload, and stored nowhere. Progress comes from the evidence
  // pipeline the long quests use, and claims go in the same permanent reward ledger the streak
  // milestones use — so the whole feature adds no storage of its own and nothing to drift.

  // Which templates the draw is even allowed to offer: a card a student has no way to act on
  // is a card they have to ignore, and a set with one ignorable item in it is a set nobody
  // clears.
  //
  // ── Why this is frozen for the session ──────────────────────────────────────
  // The draw is a pure function of (student, date, capabilities), so a capability that CHANGES
  // changes the set — and every input here arrives asynchronously. `cDecks` is empty until the
  // decks load, and a student who enrols in a pathway at 8pm would flip `hasPathway`
  // mid-evening. Either would reshuffle today's three under somebody who was halfway through
  // one of them, which is the single thing this system promises not to do.
  //
  // So: nothing is drawn until Dexie has reported in, and the first known value is the one that
  // holds for the rest of the session. New capabilities are picked up tomorrow morning, which is
  // exactly when a new set is due anyway. Both devices converge because the underlying data is
  // persisted — the freeze is per session, not per account.
  const dailyCapsLive = useMemo(()=>dailyCapabilities({
    hasPathway: !!curPath,
    hasPlan: !!user?.masterPlan,
    deckCount: Object.keys(cDecks||{}).length,
    portfolioTouched: true,
  }),[curPath,user?.masterPlan,cDecks]);
  const dailyCapsRef = useRef(null);
  const dailyCaps = useMemo(()=>{
    if(!dbReady) return dailyCapsRef.current;
    if(!dailyCapsRef.current) dailyCapsRef.current = dailyCapsLive;
    return dailyCapsRef.current;
  },[dbReady,dailyCapsLive]);

  // The student key the draw is seeded from. Stable per account, so a phone and a laptop
  // derive the same three with nothing to sync.
  const dailySeedKey = useMemo(()=>String(user?.email||user?.id||''),[user?.email,user?.id]);

  /**
   * The one evaluation every daily-quest surface reads. Same rule as questBoard below: two
   * evaluations would be two sets of three that can disagree about the same day.
   *
   * Null until the capabilities are known, and every surface renders nothing for a null day —
   * so the rail appears once, fully formed, rather than appearing with a placeholder set and
   * then swapping it.
   */
  const dailyDay = useMemo(()=>(dailyCaps ? evaluateDailyQuests({
    userKey: dailySeedKey,
    caps: dailyCaps,
    events: dailyEvents,
    claimedKeys: claimedStreakRewards,
  }) : null),[dailySeedKey,dailyCaps,dailyEvents,claimedStreakRewards]);

  const dailyTomorrow = useMemo(
    ()=>(dailyCaps ? tomorrowDailySet({userKey:dailySeedKey,caps:dailyCaps}) : []),
    [dailySeedKey,dailyCaps],
  );
  // The one honest line tying today's set to the streak, when there is one to draw.
  const dailyStreakHint = useMemo(()=>dailyStreakOverlap(dailyDay,todayStatus),[dailyDay,todayStatus]);

  // Rebuild today's evidence on the same beat as everything else. These are the counters every
  // other derived surface keys off, so a daily quest bar moves at exactly the moment the streak
  // and the XP total do rather than on a timer of its own.
  useEffect(()=>{
    if(!dbReady||!user)return;
    refreshDailyEvents();
  },[dbReady,user?.id,totalReviews,qHistory.length,streak,dayRows,portSnapshot,clinicalHoursTotal,interviewCount,aiChatCount]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Claim one of today's three.
   *
   * Two writes, in this order: the permanent ledger row (which is the idempotency gate — a
   * second tap or a second device fails here and stops), then the XP through the same outbox
   * every other once-only reward uses. Keyed `daily:<date>:<questId>`, so yesterday's quiz
   * quest and today's are different claims and a template can be drawn again next week.
   */
  const claimDailyQuest = useCallback(async(row)=>{
    if(!row?.claimable||dailyBusyKey)return;
    setDailyBusyKey(row.key);
    try{
      const took = await DB.claimStreakReward(row.key,{daily:row.quest.id,xp:row.xp});
      if(!took){
        toast('Already claimed — probably on your other device.',{icon:<Info size={14} color={C.t2}/>,duration:4000});
        await refreshStreakState();
        return;
      }
      const { granted } = await claimRewardXP(row.key, row.xp);
      await syncUserFromDb();
      await refreshStreakState();
      play('xp');
      if(granted===false){
        toast('That one was already claimed on your other device — XP adjusted.',{icon:<Info size={14} color={C.t2}/>,duration:5000});
      }else{
        celebrateXP();
        toast.success(`${row.quest.title} — +${row.xp} XP`,{icon:<Gift size={15} color={C.greenL}/>,duration:3500});
      }
    }catch(e){
      console.error('claim daily quest',e);
      toast.error('Could not claim that one. It will still be there in a moment.');
    }finally{
      setDailyBusyKey(null);
    }
  },[dailyBusyKey,refreshStreakState,syncUserFromDb]);

  /**
   * Claim the Clean Sweep — all three claimed.
   *
   * Worth more than the gold quest on purpose: it is the mechanic that gets the third card done
   * on an evening a student would have stopped after two. Gets the chest ceremony, because
   * clearing a whole day is the kind of thing that deserves one.
   */
  const claimDailySetBonus = useCallback(async()=>{
    const bonus = dailyDay?.setBonus;
    if(!bonus?.claimable||dailyBusyKey)return;
    setDailyBusyKey(bonus.key);
    try{
      const took = await DB.claimStreakReward(bonus.key,{daily:'set',xp:bonus.xp});
      if(!took){
        await refreshStreakState();
        return;
      }
      const cosmetic = Math.random()<0.35 ? rollCosmetic(cosmetics) : null;
      const claimPromise = claimRewardXP(bonus.key,bonus.xp).then(async(r)=>{ await syncUserFromDb(); return r; });
      openChest({
        title:'Clean Sweep',
        eyebrow:'All three, done',
        xp:bonus.xp,
        cosmetic,
        onOpen:async()=>{
          play('achieve');
          if(cosmetic){ await DB.unlockCosmetic(cosmetic.key); setCosmetics(prev=>new Set([...prev,cosmetic.key])); }
          const { granted } = await claimPromise;
          if(granted===false){
            toast('That bonus was already claimed on your other device — XP adjusted.',{icon:<Info size={14} color={C.t2}/>,duration:5000});
          }
          await refreshStreakState();
        },
      });
    }catch(e){
      console.error('claim daily set',e);
      toast.error('Could not claim the bonus. It will still be there in a moment.');
    }finally{
      setDailyBusyKey(null);
    }
  },[dailyDay,dailyBusyKey,cosmetics,openChest,refreshStreakState,syncUserFromDb]);

  /**
   * What to suggest the student take on next.
   *
   * The same recommender the parent dashboard uses, given the student's own numbers. It is
   * chain-aware — a claimed quest promotes the rung above it — which is what turns the picker
   * from a catalog into a road, and every suggestion carries the sentence that justifies it.
   */
  const questRecommendations = useMemo(()=>recommendQuests({
    activeDaysLast7: dayRows.filter(r=>r.met&&r.date>=localDateStr(new Date(Date.now()-7*86400000))).length,
    activeDaysLast28: dayRows.filter(r=>r.met&&r.date>=localDateStr(new Date(Date.now()-28*86400000))).length,
    lessonsVerified: Object.values(pathway).filter(l=>l?.verified).length,
    quizzesTaken: qHistory.length,
    averageScore: qHistory.length ? Math.round(qHistory.reduce((a,q)=>a+(q.score||0),0)/qHistory.length) : null,
    cardReviewsLast28: totalReviews,
    activitiesLogged: portActivities.length,
    clinicalHours: clinicalHoursTotal,
    gradeLevel: user?.gradeStage||'',
    hasPlan: !!user?.masterPlan,
    planCompletionPct: user?.masterPlan ? Math.round((getPlanStreak(user.masterPlan)>0?60:20)) : 0,
    coachChats: aiChatCount,
    collegeCount: appCounts.colleges,
    scholarshipCount: portScholarships.length,
    essayCount: appCounts.essays,
    recommenderCount: recommendersCount,
    interviewCount,
  },
  questRows.filter(q=>!QUEST_TERMINAL.has(q.status)).map(q=>q.questId),
  claimedQuestIds(questRows),
  ),[dayRows,pathway,qHistory,totalReviews,portActivities.length,clinicalHoursTotal,user?.gradeStage,user?.masterPlan,aiChatCount,appCounts,portScholarships.length,recommendersCount,interviewCount,questRows]);

  /** The single evaluation every quest surface in the app reads. */
  const questBoard = useMemo(
    ()=>evaluateQuests(questRows,questEvents),
    [questRows,questEvents],
  );
  const questStats = useMemo(()=>summarizeQuests(questBoard),[questBoard]);

  /**
   * Push the derived numbers back to the server.
   *
   * Only when they have actually moved — the server takes the max of what it holds and what it
   * is told (see the handler), so an unchanged report is a request that could not change
   * anything, and the parent's dashboard polls every 90 seconds regardless.
   *
   * The response is authoritative about STATUS: the server is what decides a quest is complete
   * (it re-checks both the target and the active-day floor), and reflecting its answer back into
   * `questRows` is what arms the celebration below.
   */
  useEffect(()=>{
    if(!questBoard.length||!questsAvailable)return;
    const stale=questBoard.filter(({assignment,ev})=>
      ev.progress>(assignment.progress||0)||ev.activeDays>(assignment.activeDays||0));
    if(!stale.length)return;
    let cancelled=false;
    (async()=>{
      for(const {assignment,ev} of stale){
        try{
          // eslint-disable-next-line no-await-in-loop
          const {quest}=await QuestAPI.report(assignment.id,{progress:ev.progress,activeDays:ev.activeDays});
          if(cancelled)return;
          setQuestRows(prev=>prev.map(q=>q.id===quest.id?quest:q));
        }catch{ /* offline, or the schema is not deployed — the next render tries again */ }
      }
    })();
    return ()=>{ cancelled=true; };
  },[questBoard,questsAvailable]);

  // The completion takeover. Fires off the SERVER's status rather than the engine's `done`, so a
  // quest is never celebrated before the server agrees it is finished — and each row can only
  // fire once per session (`celebratedQuests`), because a second progress report on an already
  // completed quest would otherwise re-open it.
  useEffect(()=>{
    if(questCelebration)return;
    const fresh=questBoard.find(({assignment})=>
      assignment.status==='completed'&&!celebratedQuests.current.has(assignment.id));
    if(!fresh)return;
    celebratedQuests.current.add(fresh.assignment.id);
    celebrateAchievement();play('achieve');
    setQuestCelebration(fresh);
  },[questBoard,questCelebration]);

  /**
   * Take a quest's reward.
   *
   * Three steps, in this order and for these reasons:
   *   1. the server marks the row claimed and hands back ITS xp figure — the client never picks
   *      the number (see api/_lib/questCatalog.js);
   *   2. that figure goes through the same idempotent reward-claim outbox as achievements and the
   *      daily check-in, keyed `quest:assigned:<row id>`, so claiming on a phone and a laptop pays
   *      exactly once;
   *   3. the chest opens over the top, which is the reveal ceremony every other milestone gets.
   */
  const claimQuestXP = useCallback(async (assignment)=>{
    if(!assignment||questBusyId)return;
    setQuestBusyId(assignment.id);
    setQuestError(null);
    try{
      const { quest, xp } = await QuestAPI.claim(assignment.id);
      setQuestRows(prev=>prev.map(q=>q.id===quest.id?quest:q));
      setQuestCelebration(null);
      const claimPromise = claimRewardXP(`quest:assigned:${quest.id}`,xp).then(async(r)=>{ await syncUserFromDb(); return r; });
      const wonCosmetic = Math.random()<0.4 ? rollCosmetic(cosmetics) : null;
      openChest({
        title:'Quest complete',
        eyebrow:quest.title,
        xp,
        cosmetic:wonCosmetic,
        onOpen:async()=>{
          if(wonCosmetic){ await DB.unlockCosmetic(wonCosmetic.key); setCosmetics(prev=>new Set([...prev,wonCosmetic.key])); }
          const { granted } = await claimPromise;
          if(granted===false){
            toast('That quest was already claimed on your other device — XP adjusted.',{icon:<Info size={14} color={C.t2}/>,duration:5000});
          }
        },
      });
    }catch(err){
      setQuestError(err?.message||'Could not claim that quest.');
      toast.error(err?.message||'Could not claim that quest.');
    }finally{
      setQuestBusyId(null);
    }
  },[questBusyId,cosmetics,openChest,syncUserFromDb]);

  /** Take one on. The catalog is the same one a parent picks from. */
  const startQuest = useCallback(async (questId)=>{
    const { quest } = await QuestAPI.assign({ questId });
    setQuestRows(prev=>[quest,...prev]);
    toast.success(`${quest.title} started. It runs until ${new Date(quest.dueAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})}.`,
      {icon:<Swords size={15} color={C.violetL}/>,duration:5000});
    return quest;
  },[]);

  /** Say no to something a parent asked for — a real answer, and visible to them as one. */
  const declineQuest = useCallback(async (assignment)=>{
    setQuestBusyId(assignment.id);
    try{
      const { quest } = await QuestAPI.decline(assignment.id);
      setQuestRows(prev=>prev.map(q=>q.id===quest.id?quest:q));
      toast('Declined. They will see that you said no, and why is up to you.',{icon:<Info size={14} color={C.t2}/>,duration:5000});
    }catch(err){ toast.error(err?.message||'Could not decline that.'); }
    finally{ setQuestBusyId(null); }
  },[]);

  /** Drop one you set yourself. */
  const dropQuest = useCallback(async (assignment)=>{
    setQuestBusyId(assignment.id);
    try{
      await QuestAPI.withdraw(assignment.id);
      setQuestRows(prev=>prev.map(q=>q.id===assignment.id?{...q,status:'cancelled',endedReason:'Dropped'}:q));
      toast('Dropped. You can pick it up again whenever you want.',{icon:<Info size={14} color={C.t2}/>});
    }catch(err){ toast.error(err?.message||'Could not drop that.'); }
    finally{ setQuestBusyId(null); }
  },[]);

  /** The one button on every quest card: go where the work actually happens. */
  const goQuestDestination = useCallback((dest)=>{
    if(!dest)return;
    goAnywhere(dest.tab,dest.view);
  },[goAnywhere]);

  // ── Streak-at-risk nudge — opportunity-framed, once per day, dismissible ────
  const streakNudgeRef = useRef(false);
  useEffect(()=>{
    if(!dbReady||!user||streakNudgeRef.current||streak<=2)return;
    if(new Date().getHours()<18)return; // evening only
    (async()=>{
      const todayKey = localDateStr();
      const nudgeKey = `streakNudge:${todayKey}`;
      if(localStorage.getItem(nudgeKey))return;
      const days = await DB.getStudyDays();
      if(days.includes(todayKey))return; // already studied today
      localStorage.setItem(nudgeKey,'1');
      streakNudgeRef.current=true;
      toast(pickNudge('streak_at_risk',{streak}),{icon:<Flame size={14} color={C.amberL}/>,duration:5000});
    })();
  },[dbReady,user,streak]);

  // ── Today's-plan-remaining nudge — once per day, app-wide (not just inside the
  // Plans tab), same evening-only/localStorage-gated pattern as the streak-at-risk
  // nudge above so it can't re-fire on every reload the same day.
  const planNudgeRef = useRef(false);
  useEffect(()=>{
    if(!dbReady||!user?.masterPlan||planNudgeRef.current)return;
    if(new Date().getHours()<18)return; // evening only
    const today = getTodayPlanEntry(user.masterPlan);
    if(!today?.tasks?.length)return;
    const remaining = today.tasks.filter(t=>!t.done).length;
    if(remaining<=0)return;
    const todayKey = localDateStr();
    const nudgeKey = `planNudge:${todayKey}`;
    if(localStorage.getItem(nudgeKey))return;
    localStorage.setItem(nudgeKey,'1');
    planNudgeRef.current=true;
    toast(pickNudge('plan_tasks_remaining',{count:remaining,plural:remaining===1?'':'s'}),{icon:<CalendarClock size={14} color={C.violetL}/>,duration:5000});
  },[dbReady,user?.masterPlan]);

  // ── Streak milestone / personal-best nudges — fires once per session, compares
  // against a cross-session localStorage baseline so it only celebrates a genuine
  // new milestone/record rather than re-firing every time the app is reopened at
  // an already-reached streak length (see level-up checker above for the pattern
  // this avoids: comparing only against an in-session ref default).
  const streakCheckedRef = useRef(false);
  useEffect(()=>{
    if(!dbReady||streakCheckedRef.current)return;
    streakCheckedRef.current=true;
    const lastKnown=parseInt(localStorage.getItem('lastKnownStreak')||'0',10);
    const best=parseInt(localStorage.getItem('bestStreakEver')||'0',10);
    if(streak>lastKnown&&streak>0){
      const milestones=[3,7,14,30,50,100];
      if(milestones.includes(streak)){
        toast.success(pickNudge(`streak_day_${streak}`,{streak}),{icon:<Flame size={16} color={C.amberL}/>,duration:4000});
      } else if(streak>best&&streak>2){
        toast.success(pickNudge('personal_best_streak',{streak}),{icon:<Trophy size={16}/>,duration:3500});
      }
    }
    if(streak>best)localStorage.setItem('bestStreakEver',String(streak));
    localStorage.setItem('lastKnownStreak',String(streak));
  },[dbReady,streak]);

  // ── Comeback nudge — fires once per session for a returning user who had a
  // multi-day gap since their last EARNED day (see loadFromDb — opening the app
  // does not create a day, so the gap it measures is a real absence from studying).
  const comebackCheckedRef = useRef(false);
  useEffect(()=>{
    if(!dbReady||comebackCheckedRef.current||comebackGap==null)return;
    comebackCheckedRef.current=true;
    if(comebackGap===2)toast(pickNudge('comeback_short'),{icon:<Coffee size={14}/>,duration:4500});
    else if(comebackGap>=3&&comebackGap<=6)toast(pickNudge('comeback_medium'),{icon:<Coffee size={14}/>,duration:4500});
    else if(comebackGap>=7)toast(pickNudge('comeback_long'),{icon:<Coffee size={14}/>,duration:5000});
  },[dbReady,comebackGap]);

  // ── AI (Medabrain, powered by Groq) ────────────────────────────────────────────
  // The meta-router: picks which of Medabrain's 3 model tiers should answer a given message, purely
  // from the message itself — no manual switcher, no extra model call to classify (keeps it free
  // and instant). Deep/strategic asks (essays, MMI/CASPer, comparing schools, long messages) get
  // Sage; short/simple asks get Scout; everything else gets Guide, the balanced default.
  // Ordering matters here, and it used to be wrong in a way that produced the
  // single worst Medabrain failure in the app. `quickSignals` matched anything
  // starting "when is"/"who is", and any message under 42 characters, and sent
  // it to Scout — the lightest-effort tier Medabrain has. So
  // "When do I apply to Duke?" (24 chars) and "Who was president in 1954?"
  // (26 chars) were routed to the model least able to recall a real-world fact,
  // and the answer came back as a shrug or a redirect. Those are exactly the
  // questions a student most needs answered correctly.
  //
  // So knowledge-recall is now checked BEFORE brevity, and it wins: a question
  // whose answer is a fact about the world (a named university, a deadline, a
  // date, a historical figure, a policy, a required score) goes to Sage, the
  // deeper tier, regardless of how short it is. Scout is left with what it is
  // genuinely good at — restating, defining a term, quick arithmetic, chit-chat
  // — and only when nothing in the message suggests a fact needs to be right.
  function classifyCoachTier(message) {
    const text = (message || '').trim();
    const lower = text.toLowerCase();

    const deepSignals = /\b(essay|personal statement|statement of purpose|critique|feedback on|review my|rewrite|revise|edit my|supplement|application strategy|which (school|college)s? should|compare .*(school|college|program)|trade-?off|mmi|casper|interview answer|scholarship essay)\b/;

    // Anything whose answer is a verifiable fact about the world rather than a
    // restatement of something the student already knows. Deliberately broad:
    // the cost of over-routing to Sage is a little latency; the cost of
    // under-routing is a confidently wrong answer about a college deadline.
    const knowledgeSignals = new RegExp([
      // Named institutions and program types the student might ask about.
      /\b(duke|harvard|yale|princeton|stanford|mit|columbia|cornell|brown|dartmouth|penn|upenn|johns hopkins|hopkins|nyu|ucla|berkeley|michigan|emory|vanderbilt|rice|northwestern|wustl|case western|ivy|ivies|university of|college of|bs\/?md|ba\/?md|direct med)\b/,
      // Admissions mechanics whose specifics change year to year.
      /\b(deadline|due date|when (do|should|does|can|is|are)|application opens?|early decision|early action|\bed\b|\bea\b|\brea\b|\bed ?ii\b|regular decision|rolling admission|common app|coalition app|supplement|fafsa|css profile|superscore|score choice|test.?optional|test.?blind|acceptance rate|admit rate|average sat|median sat|what sat score|need for|requirements? for|prereq)\b/,
      // General world knowledge — history, science, geography, civics.
      /\b(who (is|was|were)|what year|in \d{4}|president|prime minister|capital of|discovered|invented|history of|why does|how does .* work|difference between)\b/,
      // Explicit requests for facts/numbers.
      /\b(statistics?|percentile|ranking|ranked|tuition|cost of attendance|average|typical|how much does)\b/,
    ].map(r => r.source).join('|'));

    if (deepSignals.test(lower) || knowledgeSignals.test(lower) || text.length > 260) return 'sage';

    // Scout only gets the genuinely cheap turns now: short messages with no
    // factual load at all.
    const chattySignals = /^(hi|hey|hello|thanks|thank you|ok|okay|got it|yes|no|cool|nice|sure)\b/;
    const restateSignals = /^(explain that again|say that (again|simpler)|shorter|tl;?dr|summari[sz]e that|in simpler terms)\b/;
    if (chattySignals.test(lower) || restateSignals.test(lower) || text.length <= 28) return 'scout';

    return 'guide';
  }
  // `purpose` selects which Medabrain subsystem key-pool the server routes this call through
  // (coach/interview/portfolio/prep/plan — see api/groq.js). Defaults to the head coach so every
  // existing caller is unchanged; portfolio/prep/plan features pass their own purpose.
  // `extra` carries the per-request fields the server reads directly — today
  // only `safetyTier`, which lets api/groq.js append its own crisis instruction
  // rather than trusting a client-assembled system prompt to still contain one
  // (see the SERVER_CRISIS_GUARDRAIL note in that file).
  async function callGroqAI(sys, msg, toks = 700, hist = null, tier = 'guide', purpose = 'coach', extra = {}) {
    let r, d;
    try {
      r = await fetch('/api/groq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // `...extra` carries the server-read per-request fields (today safetyTier). `lane` comes
        // AFTER it deliberately: it identifies the student to the rate-limit budgets, and a caller
        // passing a lane of its own through `extra` must not be able to charge someone else's
        // allowance. With no lane at all, every request from one school's NAT shares one budget —
        // see src/lib/aiLane.js for the failure that produced.
        body: JSON.stringify({ system: sys, message: msg, messages: hist, maxTokens: toks, tier, purpose, ...extra, lane: aiLane() }),
      });
    } catch {
      throw new Error("Couldn't reach Medabrain — check your connection and try again.");
    }
    try {
      d = await r.json();
    } catch {
      throw new Error('Medabrain sent back an unreadable response. Please try again.');
    }
    if (typeof d.requestsRemaining === 'number') setCoachRequestsRemaining(d.requestsRemaining);
    if (typeof d.requestsUsedToday === 'number') setCoachRequestsUsedToday(d.requestsUsedToday);
    if (typeof d.dailyLimit === 'number') setCoachDailyLimit(d.dailyLimit);
    if (!r.ok) {
      const m = d?.error || '';
      if (r.status === 429) throw new Error(m || 'Rate limit reached. Please wait a moment.');
      if (r.status === 500 && m.includes('not configured')) throw new Error('Add GROQ_API_KEY to Vercel environment variables.');
      if (r.status === 504) throw new Error(m || 'Medabrain took too long to respond. Please try again.');
      throw new Error(m || `Error ${r.status}`);
    }
    if (typeof d.content !== 'string' || !d.content.trim()) {
      throw new Error("Medabrain didn't return a usable answer. Please try again.");
    }
    return d.content;
  }

  // Used by the Financial Aid tab's scholarship-database search (ScholarshipDatabase.jsx) when a
  // searched scholarship isn't in the curated list. Routes through purpose:'portfolio' — its own
  // key pool, same as the rest of Portfolio's AI — but with a lightweight system prompt since it's
  // answering from general knowledge, not reasoning over the student's tracked data (that deeper,
  // grounded reasoning is what the Ask Meta Brain sidebar / buildPortfolioSystemPrompt is for).
  // `maxTokens` defaults to the 400 every existing caller was built around. The Opportunities tab
  // asks for more because its prompt is a whole profile plus a six-program shortlist and the answer
  // has to name two specific programs and a gap — at 400 that answer was getting cut mid-sentence.
  async function askPortfolioMedabrain(question, maxTokens = 400) {
    return callGroqAI(
      "You are Meta Brain, MedSchoolPrep's Portfolio Intelligence specialist. You do not have web access — answer only from general knowledge, and say so plainly if you don't actually recognize something instead of inventing details.",
      question, maxTokens, null, 'guide', 'portfolio',
    );
  }

  // Moves a touched thread to the top of the local sidebar list and stamps its
  // updatedAt, mirroring what DB.addCoachMessage() already did in IndexedDB —
  // avoids a full re-fetch of the thread list on every message.
  function bumpThreadLocally(id){
    setCoachThreads(list=>{
      const now=Date.now();
      const idx=list.findIndex(t=>t.id===id);
      if(idx===-1)return list;
      const touched={...list[idx],updatedAt:now};
      return [touched,...list.slice(0,idx),...list.slice(idx+1)];
    });
  }

  // ── The coach's copy of the student's timeline ─────────────────────────────
  // Built from the same engine the Timeline tab and the Home card use, so Medabrain's answer
  // to "what's coming up" is the exact list the student can go look at. App.jsx holds running
  // counts rather than the Portfolio rows themselves, so those are passed through `counts`
  // (see buildTimelineContext) — without them the coach would be told a student with nine
  // schools on their list has none, and would cheerfully tell them to start a college list.
  const appTimeline=useMemo(()=>{
    if(!user?.gradeStage)return null;
    try{
      return buildTimeline({
        user,
        // The Roadmap's open items become timeline events too, so Home's "next up", the coach's
        // timeline summary and the Milestones feed all describe one calendar rather than two.
        roadmap:user?.roadmap||null,
        // Once the Portfolio tab has been opened, portSnapshot holds every row and the engine
        // derives everything itself. Before that it hasn't been fetched, so we hand over the
        // partial rows App does keep plus its running counts — enough for the engine to tell a
        // student with nine schools on their list from one with none.
        snapshot:portSnapshot||{ deadlines:upcomingDeadlines||[], clinicalHours:clinicalHoursEntries||[], scholarships:portScholarships||[] },
        counts:portSnapshot?null:{
          colleges:appCounts.colleges, essays:appCounts.essays, activities:portActivities.length,
          clinicalHours:clinicalHoursTotal, recommenders:recommendersCount,
          scholarships:scholarshipCount, research:researchCount, skills:skillsCount,
          interviewSessions:interviewCount,
        },
      });
    }catch{ return null; }
  },[user,portSnapshot,upcomingDeadlines,clinicalHoursEntries,portScholarships,appCounts,portActivities.length,clinicalHoursTotal,recommendersCount,scholarshipCount,researchCount,skillsCount,interviewCount]);
  const timelineSummary=useMemo(()=>{
    try{ return summarizeTimelineForPrompt(appTimeline); }catch{ return null; }
  },[appTimeline]);
  // The Roadmap, condensed for every Medabrain prompt in the app. Built here rather than inside
  // the tab because the coach, the Prep specialist and the plan generator all need it and none
  // of them mounts the Roadmap tab — a summary computed where it is rendered would be missing
  // from every surface that matters.
  // ── The Common App mirror's live state ──────────────────────────────────────
  // One derivation and one ledger for the whole app: the mirror screen and every panel badge read
  // this same object, so they cannot disagree about whether a section is ready — the same "one
  // fetch, one truth" rule the shared portfolio snapshot exists for.
  //
  // `persist` merges rather than replacing, because saveUser takes the WHOLE user record. Handing
  // it a bare { commonApp } would replace the account with a single key.
  const persistCommonApp=useCallback((ledger)=>{ setUser_(u=>{ if(!u) return u; const next={...u,commonApp:ledger}; DB.saveUser(next).catch(console.error); return next; }); },[]);
  const commonApp=useCommonApp(user,persistCommonApp,portSnapshot);

  // ── The mirror strip every Portfolio page carries ──────────────────────────
  // One factory, handed to each scrolling page as a render-prop. A page whose section feeds no
  // part of the Common App gets null back and renders nothing, which is the honest output —
  // a neutral badge would read as a check that was performed and passed.
  // ── What the dashboard leads with ───────────────────────────────────────────
  // Home renders fourteen modules and six of them are readings of progress a brand-new account
  // does not have yet — rings at zero, an empty sixty-day horizon, five unearned achievements.
  // Scrolling past a page of empty measurements of yourself reads as a list of things you are
  // already behind on, which is the wrong first impression in a damaging and specific way.
  //
  // Nothing is removed: every deferred module is still on its own tab right now, and
  // `homeDensity:'full'` brings them all back permanently. See src/lib/dashboardStages.js for the
  // ladder and for why it ratchets rather than tracking the data down again.
  const homeSignals=useMemo(()=>({
    activities: portActivities.length,
    clinicalHours: clinicalHoursTotal,
    deadlines: (upcomingDeadlines||[]).length,
    colleges: appCounts.colleges,
    lessonsDone: curPathDoneL,
    quizzes: qTaken,
    achievements: achiev.size,
    streak,
    scholarships: (portScholarships||[]).length,
    hasMedexScore: !!medexState?.score,
    hasRoadmap: !!user?.roadmap,
  }),[portActivities.length,clinicalHoursTotal,upcomingDeadlines,appCounts.colleges,curPathDoneL,qTaken,achiev.size,streak,portScholarships,medexState,user?.roadmap]);
  const home=useMemo(()=>homeModules(homeSignals,user?.homeDensity||'auto',user?.homeEarnedModules||[]),
    [homeSignals,user?.homeDensity,user?.homeEarnedModules]);
  // Persist newly-earned modules so the ratchet survives a reload — a module that appeared
  // yesterday must not vanish today because an activity was deleted in between.
  useEffect(()=>{
    if(!user||user.homeDensity==='full')return;
    const known=new Set(user.homeEarnedModules||[]);
    if(home.earned.every(id=>known.has(id)))return;
    saveUser({...user,homeEarnedModules:home.earned});
  },[home.earned,user,saveUser]);

  const commonAppBadgeFor=useCallback((view)=>(sectionId)=>(
    <CommonAppMirrorBadge
      tab="portfolio" view={view} section={sectionId}
      application={commonApp.application} sync={commonApp.sync}
      onOpenMirror={()=>{ setPortfolioView('commonapp'); play('click'); }}
    />
  ),[commonApp.application,commonApp.sync]);

  const roadmapSummary=useMemo(()=>{
    try{ return summarizeRoadmapForPrompt(user?.roadmap); }catch{ return null; }
  },[user?.roadmap]);

  // ── Everything measurable the app knows, in one object, for the planner ────
  // Hoisted out of the Plans tab's own render because the plan no longer only updates while that
  // tab is open. It now rewrites its two-day window whenever the day rolls over (see the effect
  // below), and Home, the Quiz tab and the Portfolio all read that same window — so a plan that
  // only refreshed on a visit to Plans would show yesterday's day everywhere else in the app.
  //
  // `pathwayState` is the newest and most load-bearing entry: which pathway lessons this student
  // can actually open right now. The pathway unlocks sequentially, so without it the Oracle
  // happily schedules a lesson three units deep and the student taps through to a padlock. It is
  // computed from lessonState — the exact function the Pathway tab renders its own locks from — so
  // the plan and the pathway can never disagree about what is open.
  const planLiveSignals=useMemo(()=>{
    const weakIdx=secAvgs.map((v,i)=>({v,i})).filter(o=>o.v!==null).sort((a,b)=>a.v-b.v)[0];
    const nextDeadline=(upcomingDeadlines||[]).map(d=>({...d,days:Math.ceil((new Date(d.due_date)-new Date())/86400000)})).filter(d=>d.days>=0).sort((a,b)=>a.days-b.days)[0];
    const planUnits=curPath?.units||[];
    const pathwayState={
      byLesson:Object.fromEntries(planUnits.flatMap((u,ui)=>u.lessons.map(l=>[l.id,lessonState(l,ui,planUnits)]))),
      pathwayLabel:curPath?.label||null,
    };
    return {
      weakestCategory:weakIdx?cats3[weakIdx.i]:null, weakestScore:weakIdx?weakIdx.v:null,
      pathwayState,
      dueCards, nextDeadlineTitle:nextDeadline?.title||null, nextDeadlineDays:nextDeadline?.days??null,
      portfolioActivityCount:portActivities.length, clinicalHours:clinicalHoursTotal,
      recommendersCount, collegeCount:appCounts.colleges, essayCount:appCounts.essays, streak,
      streakContext:medabrainStreakContext,
      recentActivitySummary,
      categoryAverages:catAverages, quizzesTaken:qTaken, pathwayMastery:mastery,
      timelineSummary, roadmapSummary, personalBrief:buildPersonalBriefBlock(user),
      applicationStrength:computeApplicationStrength({
        mastery, avgQuizScore:avgSc, clinicalHours:clinicalHoursTotal,
        recommendersConfirmed:recommendersCount, collegeCount:appCounts.colleges, essayCount:appCounts.essays,
      }),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[secAvgs,cats3,upcomingDeadlines,curPath,pathway,dueCards,portActivities.length,clinicalHoursTotal,recommendersCount,appCounts,streak,medabrainStreakContext,recentActivitySummary,catAverages,qTaken,mastery,avgSc,timelineSummary,user]);

  // ── The plan rewrites itself when the day turns over ──────────────────────
  // The detailed window is today + tomorrow, written today (see WINDOW_DAYS in
  // masterPlanGenerator.js). Keeping that true is what "it constantly updates" actually means, and
  // it has to happen app-wide rather than on the Plans tab alone, because Home's "today's plan"
  // card reads the same window. Guarded three ways so this never becomes a generation loop: an
  // in-flight ref, the plan's own windowBuiltFor stamp, and needsExtension itself. PlansTab runs
  // its own copy of this while mounted; whichever fires first wins and the other sees a current
  // window and does nothing.
  const windowRefreshRef=useRef(null);
  useEffect(()=>{
    const plan=user?.masterPlan;
    if(!dbReady||!plan||!user?.specialty)return;
    if(!needsPlanExtension(plan))return;
    const stamp=`${planTodayStr()}|${plan.windowBuiltFor||''}`;
    if(windowRefreshRef.current===stamp)return; // already tried for this day — don't retry in a loop
    windowRefreshRef.current=stamp;
    let cancelled=false;
    (async()=>{
      try{
        const portfolio=await fetchPlanPortfolio();
        const updated=await refreshPlanWindow(plan,user,planLiveSignals,portfolio);
        if(cancelled)return;
        const current=await DB.getUser();
        saveUser({...(current||user),masterPlan:updated});
      }catch{ /* the existing window stays on screen — better than an error the student can't act on */ }
    })();
    return()=>{cancelled=true;};
  },[dbReady,user?.masterPlan?.windowBuiltFor,user?.masterPlan?.daysGeneratedThrough,user?.specialty]); // eslint-disable-line react-hooks/exhaustive-deps

  // The crisis-resource config (public/safety-resources.json), fetched once so
  // the numbers the coach says out loud and the numbers on the card come from
  // the same place. Null until it lands; every consumer falls back to the
  // compiled-in defaults, so nothing waits on this.
  useEffect(()=>{
    let alive=true;
    loadCrisisResources().then(cfg=>{ if(alive)setCrisisConfig(cfg); }).catch(()=>{});
    return()=>{alive=false;};
  },[]);

  // The weekly goal, with its real numbers — targets the student set, against
  // what they have actually done this week. Medabrain needs both halves: the
  // academic-stress response is "your goal is 6 clinical hours and you're at 1;
  // want to make it 2 this week?", and neither number can be invented.
  const weeklyGoalRows=useMemo(()=>{
    try{
      const targets=goalsForWeek(user)||{};
      const measured=portSnapshot?measureWeek(portSnapshot):{};
      return Object.entries(targets).map(([id,target])=>{
        const metric=METRIC_BY_ID[id];
        if(!metric)return null;
        return { id, label:metric.short||metric.label, unit:metric.unitShort||metric.unit||'', target:Number(target)||0, current:Number(measured[id])||0 };
      }).filter(Boolean);
    }catch{ return []; }
  },[user,portSnapshot]);

  // ── The deep context block ─────────────────────────────────────────────────
  // Recomputed only when the underlying rows change, because it walks the whole
  // quiz history and the whole tracker and is then serialized into the prompt on
  // every single turn. See src/lib/coachContext.js for why each of these five is
  // prose rather than an object.
  const coachDeepContext=useMemo(()=>{
    try{
      return buildDeepContextBlock({
        quizTopics:summarizeQuizTopics(qHistory,ALL_QUIZZES),
        hoursByCategory:summarizeHoursByCategory({
          clinicalHours:clinicalHoursEntries||[],
          activities:portActivities||[],
          research:portSnapshot?.research||[],
        }),
        savedPrograms:summarizeSavedPrograms(trackedSummary?.items||[]),
        weeklyGoal:summarizeWeeklyGoal(weeklyGoalRows,{daysLeft:daysLeftInWeek()}),
        deadlines:summarizeDeadlines(upcomingDeadlines||[]),
      });
    }catch{ return ''; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[qHistory,clinicalHoursEntries,portActivities,portSnapshot,trackedSummary,weeklyGoalRows,upcomingDeadlines]);

  async function requestAIResponse(history,threadId,chatCountForAchievements=aiChatCount){
    setCLoad(true);
    try{
      const weakIdx=secAvgs.map((v,i)=>({v,i})).filter(o=>o.v!==null).sort((a,b)=>a.v-b.v)[0];
      const nextDeadline=(upcomingDeadlines||[]).map(d=>({...d,days:Math.ceil((new Date(d.due_date)-new Date())/86400000)})).filter(d=>d.days>=0).sort((a,b)=>a.days-b.days)[0];
      const sysPrompt=buildCoachSystemPrompt({
        pathwayLabel:curPath?.label||'college prep',
        pathCoachNote:PATH_COACH_NOTES[eSpec]||PATH_COACH_NOTES.exploring,
        gradeLabel,
        user,
        courses:user?.courses||[],
        apIb:!!user?.apIb,
        weakestCategory:weakIdx?cats3[weakIdx.i]:null,
        weakestScore:weakIdx?weakIdx.v:null,
        dueCards,
        nextDeadlineTitle:nextDeadline?.title||null,
        nextDeadlineDays:nextDeadline?.days??null,
        timelineSummary,
        roadmapSummary,
        portfolioActivityCount:portActivities.length,
        clinicalHours:clinicalHoursTotal,
        recommendersCount,
        collegeCount:appCounts.colleges,
        essayCount:appCounts.essays,
        scholarshipCount,
        researchCount,
        skillsCount,
        streak,
        streakContext:medabrainStreakContext,
        planSummary:summarizePlanForCoach(user?.masterPlan),
        recentActivitySummary,
        paceText,
        feedbackSummary:feedbackSummary.promptText,
        parallelPathwaysSummary:isParallel?parallelSummary:null,
        deepContext:coachDeepContext,
        modeBlock:buildModeBlock(coachMode),
        // Empty on almost every turn. When the classifier fired on the message
        // being answered, this is what suspends the demanding-mentor stance and
        // replaces it with acknowledge-first — see src/lib/safety/prompts.js.
        safetyBlock:safetyTierRef.current?.block||'',
        // Student-intelligence digest (src/lib/studentIntel/context.js) — reads off the same
        // portSnapshot the Portfolio/Home tabs already fetch (src/lib/portfolioData.js), so this
        // adds no extra request. Null until portSnapshot has loaded once, which is the correct
        // "nothing to add yet" state rather than a fetch this call site needs to own.
        studentIntel:portSnapshot?{
          schoolContext:portSnapshot.schoolContext?.[0]||null,
          constraints:portSnapshot.constraintsProfile?.[0]||null,
          quickNotes:portSnapshot.quickNotes||[],
          interestHistory:portSnapshot.interestHistory||[],
          serviceLogs:portSnapshot.serviceLogs||[],
          competitions:portSnapshot.competitions||[],
          reflectionsLog:portSnapshot.reflectionsLog||[],
          checkins:portSnapshot.checkins||[],
          recommendationFeedback:portSnapshot.recommendationFeedback||[],
          gradeLabel,
        }:null,
      });
      const lastUser=[...history].reverse().find(m=>m.role==='user');
      const mode=modeById(coachMode);
      // A mode may pin a tier (essay work and career questions want depth, a
      // quiz turn does not); otherwise honor a pinned model, otherwise let
      // Medabrain auto-route this message.
      const tier=mode.tier||(coachModelPref==='auto'?classifyCoachTier(lastUser?.content||''):coachModelPref);
      setCoachTier(tier);
      // 1600 (up from 700): a full breakdown or plan-style reply routinely ran past 700 tokens and
      // got cut off mid-sentence. api/groq.js's per-purpose ceiling for 'coach' was raised to match.
      // The mode's purpose — not always 'coach' — is what puts essay mode behind
      // the server-side prose guard rather than behind its prompt alone.
      const r=await callGroqAI(sysPrompt,lastUser?.content||'',1600,history.filter(m=>m.role!=='error'),tier,mode.purpose||'coach',
        safetyTierRef.current?.safetyTier?{safetyTier:safetyTierRef.current.safetyTier}:{});
      setCoachTierCounts(c=>({...c,[tier]:(c[tier]||0)+1}));
      setMsgs(m=>[...m,{role:'assistant',content:r}]);
      if(threadId){ DB.addCoachMessage(threadId,'assistant',r).catch(console.error); bumpThreadLocally(threadId); }
      checkAndUnlockAchievements(user,qTaken,qHistory.filter(q=>q.score===100).length,streak,totalReviews,mastery,chatCountForAchievements);
    }catch(e){setMsgs(m=>[...m,{role:'error',content:e.message}]);toast.error(e.message.slice(0,80));}
    setCLoad(false);
  }

  const lastSendAtRef = useRef(0);
  async function sendChat(message){
    if(!message.trim()||cLoad)return;
    if(coachRequestsRemaining<=0){toast.error(`Your daily Medabrain quota has been reached. Try again tomorrow.`);return;}
    // Small cooldown (independent of cLoad, which only covers the in-flight request) so a fast
    // double-tap on send can't fire two nearly-identical Groq calls back to back.
    const now=Date.now();
    if(now-lastSendAtRef.current<3000){toast('Give Medabrain a moment before sending again.',{icon:'⏳'});return;}
    lastSendAtRef.current=now;
    let threadId=activeThreadId;
    if(!threadId){
      // First message in a fresh compose view — lazily create the thread now
      // (rather than on "New chat" click) so browsing away without typing
      // anything never leaves an empty chat cluttering the sidebar.
      const title=message.trim().slice(0,48)||'New chat';
      try{
        const thread=await DB.createCoachThread(title);
        threadId=thread.id;
        setActiveThreadId(threadId);
        setCoachThreads(list=>[thread,...list]);
      }catch(err){console.error('Failed to create chat thread',err);toast.error('Could not start a new chat — try again.');return;}
    }
    const um={role:'user',content:message};const next=[...msgs,um];
    setMsgs(next);setCi('');
    DB.addCoachMessage(threadId,'user',message).catch(console.error);
    bumpThreadLocally(threadId);

    // ── The safety pass ──────────────────────────────────────────────────────
    // Runs BEFORE the coach call and is awaited, because its result changes what
    // the coach is told to do on this exact turn — a detection that lands one
    // message late is a detection that missed. The cost is bounded: the
    // deterministic screen is free and synchronous, and the model half only runs
    // on the genuinely ambiguous band (see needsModelPass in
    // src/lib/safety/classifier.js), so an ordinary "explain glycolysis" pays
    // nothing at all.
    //
    // Everything here fails open toward safety and never toward an error the
    // student has to deal with: if the whole assessment throws, the turn
    // proceeds as an ordinary one rather than failing.
    // One call: classify, arm the resource card, log the event to the internal
    // review queue (timestamp, user and severity — never a word of what was
    // said, and no parent notified by it or by anything downstream of it), and
    // produce the block that reshapes this turn's system prompt.
    const safety=await runSafetyPass(message,{surface:'coach',crisisConfig});
    safetyTierRef.current=safety.block?safety:null;
    const newCount=aiChatCount+1;setAiChatCount(newCount);logEvent('coach_message_sent',threadId);saveUser(applyPlanAutoComplete({...user,aiChatCount:newCount},typeMatch('coach')));bumpWeeklyCoachCount(getIsoWeekKey());
    await requestAIResponse(next,threadId,newCount);
  }

  function retryChat(){
    if(cLoad)return;
    const trimmed=msgs[msgs.length-1]?.role==='error'?msgs.slice(0,-1):msgs;
    setMsgs(trimmed);
    requestAIResponse(trimmed,activeThreadId);
  }

  // ── Chat thread management ───────────────────────────────────────────────────
  function startNewChat(){
    setActiveThreadId(null);
    setMsgs([]);
    setCoachSidebarOpen(false);
  }
  async function switchChatThread(id){
    if(id===activeThreadId){ setCoachSidebarOpen(false); return; }
    setActiveThreadId(id);
    setCoachSidebarOpen(false);
    try{
      const rows=await DB.getCoachMessages(id);
      setMsgs((rows||[]).map(r=>({role:r.role,content:r.content})));
    }catch(err){console.error('Failed to load chat thread',err);toast.error('Could not load that chat.');}
  }
  function beginRenameThread(thread){
    setRenamingThreadId(thread.id);
    setRenameDraft(thread.title);
  }
  async function commitRenameThread(){
    const title=renameDraft.trim();
    const id=renamingThreadId;
    setRenamingThreadId(null);
    if(!title||!id)return;
    setCoachThreads(list=>list.map(t=>t.id===id?{...t,title}:t));
    try{ await DB.renameCoachThread(id,title); }catch(err){console.error('Failed to rename chat thread',err);}
  }
  async function deleteChatThread(id){
    if(!window.confirm('Delete this chat? This cannot be undone.'))return;
    setCoachThreads(list=>list.filter(t=>t.id!==id));
    if(id===activeThreadId){ setActiveThreadId(null); setMsgs([]); }
    try{ await DB.deleteCoachThread(id); }catch(err){console.error('Failed to delete chat thread',err);toast.error('Could not delete that chat.');}
  }

  async function clearAllChats(){
    if(!coachThreads.length){ toast('No Medabrain conversations to clear.'); return; }
    if(!window.confirm(`Delete all ${coachThreads.length} Medabrain conversation${coachThreads.length===1?'':'s'}? This cannot be undone — your XP, streak, and study progress are unaffected.`))return;
    setCoachThreads([]);setActiveThreadId(null);setMsgs([]);
    try{ await DB.clearAllCoachThreads(); toast.success('Medabrain chat history cleared.'); }catch(err){console.error('Failed to clear chat history',err);toast.error('Could not clear chat history.');}
  }

  function copyMsg(text,i){
    navigator.clipboard?.writeText(text).then(()=>{
      setCopiedIdx(i);
      setTimeout(()=>setCopiedIdx(c=>c===i?null:c),1600);
    });
  }

  const GEN_STAGES = ['Reading your notes…', 'Extracting key concepts…', 'Selecting the best cards…', 'Handing off to Medabrain for a final pass…'];
  const GEN_COUNT_MIN = 5, GEN_COUNT_MAX = 150;
  // Auto mode's ceiling on the offline engine: big note dumps can surface far more than a flat 20
  // distinct facts, small ones far fewer — the engine never pads short of what it finds (see
  // rank.js), so requesting this ceiling just means "give me everything worth keeping, up to a
  // sane deck size" instead of an arbitrary fixed count regardless of how much was pasted in.
  const GEN_COUNT_AUTO_CEILING = 90;

  function commitGenCount(raw) {
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) { setGenCountInput(String(genCount)); return; }
    const clamped = Math.min(GEN_COUNT_MAX, Math.max(GEN_COUNT_MIN, n));
    if (clamped !== n) toast(`Card count clamped to ${clamped} (range is ${GEN_COUNT_MIN}–${GEN_COUNT_MAX}).`, { icon: <Wand2 size={14}/> });
    setGenCount(clamped);
    setGenCountInput(String(clamped));
  }

  async function genDeck() {
    const sourceOk = notes.trim().length >= 40;
    if (!sourceOk || gLoad) {
      if (!sourceOk) {
        toast.error('Paste at least a few sentences of notes (minimum ~5 sentences).');
        setGShake(true); setTimeout(()=>setGShake(false), 420);
      }
      return;
    }
    setGL(true); setGStage(0); setGenPolishNote('');
    const stageTimer = setInterval(()=>setGStage(s=>Math.min(s+1, GEN_STAGES.length-1)), 750);
    const startedAt = Date.now();
    try {
      const targetCount = genCountMode === 'auto' ? GEN_COUNT_AUTO_CEILING : genCount;
      const { cards, requested, generated, coverage } = generateAIFlashcards({ text: notes, count: targetCount });

      // Final pass: hand the offline-generated deck to Medabrain's Scout tier (the same
      // model/key pool behind the rest of Medabrain) to tighten wording and drop anything
      // still redundant. Fails soft — polishResult is null on any network/parsing issue, and
      // the original offline deck is used untouched.
      const polishResult = await polishFlashcardsWithAI({ cards, notesText: notes });
      const finalCards = polishResult?.cards?.length ? polishResult.cards : cards;

      // Guarantee the stage narrative has time to actually play out, so
      // generation never feels like an instant flicker even though the local
      // engine resolves in a few milliseconds (the polish call above already
      // adds real latency of its own when it succeeds).
      const minFloor = GEN_STAGES.length * 550;
      const elapsed = Date.now() - startedAt;
      if (elapsed < minFloor) await new Promise(r => setTimeout(r, minFloor - elapsed));
      const deckName = `Notes Deck — ${new Date().toLocaleDateString()}`;
      await saveDeck(deckName, finalCards);
      setNotes('');
      setAD({ name: deckName, cards: finalCards, builtin: false });
      setCIdx(0);
      setFlip(false);

      const sizeNote = genCountMode === 'auto' ? `sized to your notes (${finalCards.length} card${finalCards.length===1?'':'s'})` : coverage === 'full' ? `all ${generated} you asked for` : `${generated} of the ${requested} you asked for — that's every distinct fact we could find`;
      if (polishResult) {
        setGenPolishNote(polishResult.note || 'Medabrain reviewed this deck for clarity.');
        toast.success(`Generated ${sizeNote}, then polished by Medabrain (Scout).`, { icon: <Brain size={16}/> });
      } else {
        toast(`Generated ${sizeNote}. (Medabrain's polish pass was unavailable — the deck is fully usable as-is.)`, { icon: <Wand2 size={16}/>, duration: 5000 });
      }
    } catch (e) {
      toast.error(e.message.slice(0, 160));
    }
    clearInterval(stageTimer);
    setGL(false);
  }

  async function rateCard(label){
    if(!currentCard||!activeDeck)return;
    const updated=scheduleCard(currentCard,label);
    // Smart Mix pulls due cards from several decks into one session, so a card's real home
    // deck (where the FSRS update actually needs to be written back) isn't necessarily
    // activeDeck itself — see the _srcDeck/_srcBuiltin tags added when building that pool below.
    const deckName=activeDeck.smartMix?currentCard._srcDeck:activeDeck.name;
    const deckIsBuiltin=activeDeck.smartMix?currentCard._srcBuiltin:activeDeck.builtin;
    const allDeckCards=[...cardsForDeck(deckName,deckIsBuiltin)];
    const idx=allDeckCards.findIndex(c=>c.front===currentCard.front&&c.back===currentCard.back);
    if(idx>=0)allDeckCards[idx]=updated;
    // Persisted for built-in decks too now, not just custom ones — otherwise every review of a
    // shipped deck's cards would silently reset the moment the page reloads, defeating spaced
    // repetition for the majority of decks in the library.
    await saveDeck(deckName,allDeckCards);
    await DB.recordCardReview(currentCard.id||cIdx);
    const newTotal=totalReviews+1;setTotalReviews(newTotal);
    checkAndUnlockAchievements(user,qTaken,qHistory.filter(q=>q.score===100).length,streak,newTotal,mastery,aiChatCount);

    // ── Combo streak + XP: the dopamine loop for card review ──────────────────
    const correct = label !== 'Again';
    const xpMap = { Again: 0, Hard: 2, Good: 4, Easy: 6 };
    const nextCombo = correct ? sessionStats.streak + 1 : 0;
    const bonus = correct && nextCombo >= 3 ? Math.min(5, Math.floor(nextCombo / 3)) : 0;
    const baseGain = xpMap[label] + bonus;
    const nextBest = Math.max(sessionStats.bestStreak, nextCombo);
    let xpGain = 0, cardTier = 'none';
    let cardXpWrite = Promise.resolve();
    if (baseGain > 0) {
      ({ finalXP: xpGain, tier: cardTier } = awardBoostedXP(baseGain));
      cardXpWrite = saveUser({ ...user, xp: (user?.xp || 0) + xpGain });
      play('xp');
      if (cardTier === 'jackpot') { celebrateJackpot(); play('jackpot'); }
      else if (cardTier === 'big' || cardTier === 'bonus') { celebrateBonusXP(); }
      if (cardTier !== 'none') toast.success(BONUS_COPY[cardTier](xpGain), { duration: cardTier==='jackpot'?3500:1800 });
    }
    if (correct && [5, 10, 15, 20, 25].includes(nextCombo)) {
      play('achieve');
      celebrateStreak();
      toast.success(`${nextCombo} in a row — you're on fire!`, { icon: <Flame size={16} color={C.amberL}/>, duration: 2600 });
    } else if (!correct && sessionStats.streak >= 5) {
      toast(`Streak broken at ${sessionStats.streak} — back at it.`, { icon: <RefreshCw size={14}/>, duration: 1800 });
    }
    setSessionStats(s => ({ ...s, reviewed: s.reviewed + 1, [label.toLowerCase()]: s[label.toLowerCase()] + 1, streak: nextCombo, bestStreak: nextBest, xp: s.xp + xpGain }));
    // One streak credit per TEN cards, not per card — a 60-second tap-through of a
    // deck must not be able to clear a serious daily goal. Counted off the all-time
    // total so a session split across two sittings still banks the batch. Chained
    // behind this review's own XP write so a milestone payout can't be clobbered by it.
    if (newTotal % 10 === 0) cardXpWrite.then(() => creditStreak('flashcards_batch')).catch(console.error);
    if(cIdx===deckCards.length-1)setTimeout(()=>toast.success(pickNudge('flashcard_session_complete'),{icon:<Layers3 size={16}/>,duration:3200}),300);
    setCIdx(i=>Math.min(deckCards.length-1,i+1));
    setFlip(false);
  }

  // ── Lesson Player (Overview → Article → Video → Quiz → Complete) ────────────
  // VERIFY_PASS_PCT is imported from lib/quizPersonalization — it lives next to the
  // per-student draw logic precisely so it's obvious that the *questions* vary per
  // student while the *bar* never does.
  // "Next lesson" means the next one in THIS lesson's pathway. With parallel pathways the open
  // lesson isn't always from the focused track — a Nursing lesson started from the parallel board
  // must hand off to the next Nursing lesson, not drop the student into Physician's unit 1.
  function getNextLesson(lesson){
    const path=pathwayOf(lesson);
    const flat=(path?.units||[]).flatMap(u=>u.lessons.map(l=>({lesson:l,unit:u})));
    const idx=flat.findIndex(x=>x.lesson.id===lesson.id);
    return (idx===-1||idx===flat.length-1)?null:flat[idx+1];
  }
  // The step a saved progress row should reopen on. This is the fix for the specific complaint
  // that a student who read the article on Monday and came back on Wednesday for the video was
  // dropped at the top of the article they had already finished: what they confirmed done is
  // remembered per lesson (DB.lessonProgress), so they land on the first thing they haven't.
  function resumeStepFor(prog,{hasArticle,hasVideo}){
    if(!prog)return 'overview';
    // A saved step is honored as long as it still exists for this lesson (content can change).
    const order=['overview',hasArticle&&'article',hasVideo&&'video','quiz'].filter(Boolean);
    if(prog.step&&order.includes(prog.step)&&prog.step!=='overview')return prog.step;
    if(hasArticle&&!prog.articleRead)return 'article';
    if(hasVideo&&!prog.videoWatched)return 'video';
    if(prog.articleRead||prog.videoWatched)return 'quiz';
    return 'overview';
  }

  async function openLesson(lesson,unit){
    const already=pathway[lesson.id];
    const isResuming=!!already?.studying&&!already?.verified;
    DB.startLessonStudy(lesson.id).catch(console.error);
    logEvent('lesson_video_watched',lesson.id); // legacy id — recentActivity.js reads it as "lessons studied"
    if(!already?.verified)setPathway_(pw=>({...pw,[lesson.id]:{...(pw[lesson.id]||{}),studying:true,studyStartedAt:Date.now()}}));
    setActiveLesson({lesson,unit});
    // Optimistic defaults so the player renders instantly; the saved row below refines them.
    setArticleRead(!!already?.verified);
    setVideoWatched(!!already?.verified);
    setArticleScrollPct(0);
    setLessonStep(already?.verified?'complete':'overview');
    setReviewMode(false);
    setLessonConfirms({article:!!already?.verified,video:!!already?.verified});

    if(!already?.verified){
      const hour=new Date().getHours(),day=new Date().getDay();
      const scenario=isResuming?'session_resume':(day===0||day===6)?'weekend_session':hour<10?'morning_session':hour>=20?'evening_session':'lesson_started';
      toast(pickNudge(scenario,{lesson:lesson.title}),{icon:<BookOpen size={16}/>,duration:2600});
    }

    try{
      const prog=await DB.getLessonProgress(lesson.id);
      await DB.saveLessonProgress(lesson.id,{lastOpenedAt:Date.now()});
      if(!prog||already?.verified)return;
      const content=LESSON_CONTENT[lesson.id];
      const hasArticle=!!content?.article;
      const hasVideo=!!(content?.video?.ytId||extractYouTubeId(lesson.url));
      setArticleRead(!!prog.articleRead);
      setVideoWatched(!!prog.videoWatched);
      setArticleScrollPct(prog.articleScrollPct||0);
      setLessonConfirms({article:!!prog.articleConfirmedAt,video:!!prog.videoConfirmedAt});
      const step=resumeStepFor(prog,{hasArticle,hasVideo});
      setLessonStep(step);
      // Say WHY they landed somewhere other than the start, so being dropped into the middle of
      // a lesson reads as the app remembering rather than the app losing their place.
      if(step!=='overview'){
        const where=step==='article'?'back in the article':step==='video'?'straight at the video':'at the verification quiz';
        toast(`Picking up where you left off — ${where}.`,{icon:<RefreshCw size={15}/>,duration:3000});
      }
    }catch(e){ console.error('lesson progress restore failed:',e); }
  }
  function closeLesson(){ setActiveLesson(null); setLessonStep('overview'); setArticleRead(false); setVideoWatched(false); setArticleScrollPct(0); setNotesOpen(false); setLessonNote(''); setLessonHighlightsState([]); setReviewMode(false); setLessonFeedbackRow(null); setLessonConfirms({article:false,video:false}); }

  // The student's own confirmation that they finished a step, recorded with a timestamp so it
  // survives to the next visit and syncs across devices.
  function confirmLessonStep(step){
    if(!activeLesson)return;
    setLessonConfirms(c=>({...c,[step]:true}));
    if(step==='article')setArticleRead(true);
    if(step==='video')setVideoWatched(true);
    if(!reviewMode){
      DB.saveLessonProgress(activeLesson.lesson.id,
        step==='article'?{articleConfirmedAt:Date.now(),articleRead:true}:{videoConfirmedAt:Date.now(),videoWatched:true}
      ).catch(console.error);
    }
  }

  // "Something came up — hold my place." Progress is already written on every step change, so
  // this is really about saying so out loud: a student who closes a lesson mid-way should leave
  // knowing the app kept their spot rather than hoping it did.
  function continueLessonLater(){
    const title=activeLesson?.lesson?.title;
    closeLesson();
    toast.success(
      title?`Saved your spot in "${title}". Go do what you need to — it'll be exactly here when you're back.`
           :"Saved your spot. It'll be exactly here when you're back.",
      {icon:<Coffee size={16}/>,duration:4500});
  }

  // Re-opens a lesson the student is navigating *back into* with the forward button (or
  // landing on from a shared /prep/…/lesson/… link). Same screen as openLesson, minus
  // everything openLesson does because the student just *started* studying: no
  // startLessonStudy write, no 'lesson_video_watched' event, no motivational toast.
  // Replaying those on a history move would inflate their study log with sessions they
  // never had.
  function openLessonFromHistory(lesson,unit){
    const already=pathway[lesson.id];
    setActiveLesson({lesson,unit});
    setArticleRead(!!already?.verified);
    setVideoWatched(!!already?.verified);
    setArticleScrollPct(0);
    setLessonStep(already?.verified?'complete':'overview');
    setReviewMode(!!already?.verified);
    setLessonConfirms({article:!!already?.verified,video:!!already?.verified});
  }

  // Re-opens an already-verified lesson so the student can actually browse its article/video
  // content again, instead of the normal openLesson() behavior which (via the auto-complete
  // effect below) snaps a verified lesson straight to the Complete screen. Bypasses the
  // "studying" bookkeeping and nudge toast entirely — this isn't new study progress, just a
  // read of something already mastered.
  function reviewLesson(lesson,unit){
    setReviewMode(true);
    setActiveLesson({lesson,unit});
    setArticleRead(true);
    setVideoWatched(true);
    setArticleScrollPct(0);
    setLessonStep('overview');
    setLessonConfirms({article:true,video:true});
  }

  // Loads this lesson's saved note + highlights fresh every time a different lesson opens, so
  // Meta Brain and the highlighter always reflect the lesson actually on screen.
  useEffect(()=>{
    if(!activeLesson){ setLessonNote(''); setLessonHighlightsState([]); setLessonFeedbackRow(null); return; }
    let cancelled=false;
    DB.getLessonNote(activeLesson.lesson.id).then(text=>{ if(!cancelled)setLessonNote(text); }).catch(console.error);
    DB.getLessonHighlights(activeLesson.lesson.id).then(rows=>{ if(!cancelled)setLessonHighlightsState(rows); }).catch(console.error);
    DB.getLatestLessonFeedback(activeLesson.lesson.id).then(row=>{ if(!cancelled)setLessonFeedbackRow(row); }).catch(console.error);
    return ()=>{ cancelled=true; };
  },[activeLesson?.lesson?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function saveLessonNoteText(text){
    setLessonNote(text);
    if(activeLesson)DB.saveLessonNote(activeLesson.lesson.id,text).catch(console.error);
  }
  async function addLessonHighlight({sectionIdx,start,end,color}){
    if(!activeLesson)return;
    // Every third highlight in a session earns a credit. Batched for the same reason
    // flashcards are: one highlight is a click, three is reading with a pen in your hand.
    highlightRunRef.current += 1;
    if(highlightRunRef.current % 3 === 0) creditStreak('notes_batch',{silent:true}).catch(console.error);
    const content=LESSON_CONTENT[activeLesson.lesson.id];
    const body=content?.article?.sections?.[sectionIdx]?.body||'';
    const text=body.slice(start,end);
    const id=await DB.addLessonHighlight(activeLesson.lesson.id,{sectionIdx,start,end,text,color});
    setLessonHighlightsState(hs=>[...hs,{id,lessonId:activeLesson.lesson.id,sectionIdx,start,end,text,color,createdAt:Date.now()}]);
    DB.getAllLessonHighlights().then(setAllLessonHighlights).catch(console.error);
  }

  // The cross-lesson stores Medabrain reads from: every difficulty answer, every highlight, and
  // every note. Loaded once the DB is up and refreshed whenever a lesson closes, which is the
  // moment any of the three can have changed.
  useEffect(()=>{
    if(!dbReady)return;
    DB.getAllLessonFeedback().then(setAllLessonFeedback).catch(console.error);
    DB.getAllLessonHighlights().then(setAllLessonHighlights).catch(console.error);
    DB.getAllLessonNotes().then(setAllLessonNotes).catch(console.error);
  },[dbReady,activeLesson?.lesson?.id]);
  function removeLessonHighlight(id){
    DB.deleteLessonHighlight(id).catch(console.error);
    setLessonHighlightsState(hs=>hs.filter(h=>h.id!==id));
    DB.getAllLessonHighlights().then(setAllLessonHighlights).catch(console.error);
  }

  // ── Lesson difficulty feedback ──────────────────────────────────────────────
  // Three writes per answer, in a deliberate order:
  //   1. Dexie, immediately — the answer is durable before anything can fail.
  //   2. progress_sync, via DB's pushDirty — so it follows the student across devices.
  //   3. the lesson_feedback table, via /api/lesson-feedback — the queryable log.
  // (3) is fire-and-forget: it is analytics, and a student must never see an error for having
  // told us how a lesson went. See src/lib/lessonFeedbackApi.js.
  const feedbackMetaFor=useCallback((lesson,unit)=>({
    lessonId:lesson.id, lessonTitle:lesson.title,
    unitId:unit?.id||null, unitTitle:unit?.title||'',
    pathwayKey:eSpec, category:unit?.quizCat||null,
  }),[eSpec]);

  const submitLessonFeedback=useCallback(async({rating,clientTs})=>{
    if(!activeLesson)return null;
    const {lesson,unit}=activeLesson;
    const meta=feedbackMetaFor(lesson,unit);
    const id=await DB.addLessonFeedback({...meta,rating,status:'pending',aiText:'',resources:[]});
    const row={id,...meta,rating,status:'pending',aiText:'',resources:[],createdAt:clientTs};
    setLessonFeedbackRow(row);
    setAllLessonFeedback(f=>[row,...f.filter(x=>x.id!==id)]);
    logEvent('lesson_feedback',`${lesson.id}:${rating}`);
    logLessonFeedback({...meta,rating,clientTs});
    return row;
  },[activeLesson,feedbackMetaFor]);

  const updateLessonFeedbackRow=useCallback(async(id,patch)=>{
    if(id==null)return;
    const {clientTs,...dbPatch}=patch;
    await DB.updateLessonFeedback(id,dbPatch);
    setLessonFeedbackRow(r=>r&&r.id===id?{...r,...dbPatch}:r);
    setAllLessonFeedback(f=>f.map(r=>r.id===id?{...r,...dbPatch}:r));
    // Re-post so the server row carries the generated text too. The clientTs makes this an
    // update of the row written a moment ago rather than a duplicate.
    const row=await DB.getLessonFeedback(activeLesson?.lesson?.id||'').then(rows=>rows.find(r=>r.id===id)).catch(()=>null);
    if(row&&clientTs)logLessonFeedback({...row,clientTs,aiText:dbPatch.aiText||row.aiText,resources:dbPatch.resources||row.resources});
  },[activeLesson?.lesson?.id]);

  // What Medabrain knows about this student's level, from every answer they've given.
  const feedbackSummary=useMemo(()=>summarizeLessonFeedback(allLessonFeedback),[allLessonFeedback]);

  // Lesson ids are opaque ("phy1l1"), so every digest resolves them to real titles across ALL
  // pathways — a student's notes don't stop mattering because they switched tracks.
  const lessonTitleById=useMemo(()=>{
    const map={};
    for(const p of Object.values(PATHS))for(const u of (p.units||[]))for(const l of (u.lessons||[]))map[l.id]=l.title;
    return map;
  },[]);
  const titleFor=useCallback((id)=>lessonTitleById[id]||id,[lessonTitleById]);
  const notesDigest=useMemo(()=>buildNotesDigest(allLessonNotes,titleFor),[allLessonNotes,titleFor]);
  const highlightsDigest=useMemo(()=>buildHighlightsDigest(allLessonHighlights,titleFor),[allLessonHighlights,titleFor]);

  // Resume a lesson that was mid-read/mid-video when the page reloaded — same pattern as the
  // flashcard-session resume below, restoring not just which lesson but the exact step, whether
  // the article/video were already marked read/watched, and how far into the article the student
  // had scrolled, so a reload never bounces them back to the top of a passage they were mid-way
  // through. Only resumes if the persisted tab was actually 'prep' (mirrors the flashcard guard)
  // and the lesson still resolves within the CURRENT pathway (a pathway switch since then means
  // the old in-progress lesson isn't necessarily relevant anymore, so it's safe to just drop it).
  //
  // The URL takes precedence over the persisted session when it names a lesson itself
  // (someone opened a /prep/…/lesson/… link, or reloaded while a lesson was open), in
  // which case there's no saved step to resume — just the lesson.
  useEffect(()=>{
    if(!dbReady||!curPath)return;
    const flat=(curPath.units||[]).flatMap(u=>u.lessons.map(l=>({lesson:l,unit:u})));
    lessonIndexRef.current=flat;

    const persisted=loadViewState();
    // The boot URL is only ever honored once — a later pathway switch re-runs this
    // effect, and re-opening the lesson from the original URL then would fight the
    // student instead of helping them.
    const fromUrl=(!lessonBootRef.current&&boot.overlay?.kind==='lesson')?boot.overlay:null;
    lessonBootRef.current=true;
    const al=fromUrl?{lessonId:fromUrl.lessonId,unitId:fromUrl.unitId}:persisted.activeLesson;
    if(!al?.lessonId)return;
    if(!fromUrl&&persisted.tab!=='prep')return;
    const match=flat.find(x=>x.lesson.id===al.lessonId&&x.unit.id===al.unitId);
    if(!match)return; // lesson/unit no longer exists in the current pathway — nothing safe to resume
    // Resuming isn't a navigation the student made, so it belongs in the history entry
    // they're already on: a back press should leave the lesson, not replay opening it.
    replaceHistoryEntryNext();
    setActiveLesson({lesson:match.lesson,unit:match.unit});
    setLessonStep(al.step||'overview');
    setArticleRead(!!al.articleRead);
    setVideoWatched(!!al.videoWatched);
    setArticleScrollPct(al.articleScrollPct||0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[dbReady,curPath]);

  // ...and keep that lesson's exact position saved as it progresses.
  //
  // TWO stores, doing two different jobs, which is why both writes are here:
  //   · viewState (localStorage, one slot) answers "the tab was reloaded — what was on screen?"
  //   · DB.lessonProgress (IndexedDB, one row per lesson, synced) answers "they came back three
  //     days later and opened this lesson again — where were they in it?" The single-slot
  //     viewState cannot answer that: opening any other lesson overwrites it.
  // Review mode is excluded from the durable write on purpose — re-reading a verified lesson is
  // browsing, and letting it stamp articleRead/videoWatched would rewrite a real study record.
  useEffect(()=>{
    if(activeLesson){
      saveViewState({activeLesson:{lessonId:activeLesson.lesson.id,unitId:activeLesson.unit.id,step:lessonStep,articleRead,videoWatched,articleScrollPct}});
      if(!reviewMode){
        DB.saveLessonProgress(activeLesson.lesson.id,{step:lessonStep,articleRead,videoWatched,articleScrollPct}).catch(console.error);
      }
    }else{
      saveViewState({activeLesson:null});
    }
  },[activeLesson,lessonStep,articleRead,videoWatched,articleScrollPct,reviewMode]);
  // Once the active lesson's quiz is passed (verified flips true in `pathway`), jump the
  // player to the Complete step — this is what lets the Quiz step hand off to the app-level
  // aQuiz/QuizEngine fullscreen gate and have control cleanly return to LessonPlayer afterward
  // instead of duplicating quiz-scoring logic inside the player itself.
  useEffect(()=>{
    if(!activeLesson||reviewMode)return;
    if(pathway[activeLesson.lesson.id]?.verified&&lessonStep!=='complete')setLessonStep('complete');
  },[pathway,activeLesson,lessonStep,reviewMode]);
  // Which quiz a student gets is no longer "the first id in the list" for everyone — the bank,
  // the questions drawn from it, and their order are all derived from this student's onboarding
  // profile, pathway and attempt number (lib/quizPersonalization.js). Same 70% bar for everyone.
  function openVerifyQuiz(lesson,unit){
    const attempt=getAttemptCount(lesson.id);
    // Personalized against the lesson's OWN pathway, matching the blurb the player showed.
    const quiz=buildVerificationQuiz(lesson,ALL_QUIZZES,{user,pathwayKey:pathwayKeyOf(lesson),attempt});
    if(!quiz){toast.error('No verification quiz found for this lesson yet.');return;}
    recordAttempt(lesson.id);
    logEvent('quiz_attempt',lesson.id);
    setVerifyCtx({lesson,unit});
    setAQ(quiz);
    play('click');
  }

  // ── Quiz finish ───────────────────────────────────────────────────────────────
  async function finishQuiz(score,total){
    const pct=total>0?Math.round((score/total)*100):0;
    if(verifyCtx){
      const {lesson,unit}=verifyCtx;
      const passed=pct>=VERIFY_PASS_PCT;
      if(passed){
        await DB.verifyLesson(lesson.id,pct);
        // Passing closes the attempt series — a student who comes back to re-take this lesson
        // later starts from the best-fit bank again rather than deep in the retry rotation.
        clearAttempts(lesson.id);
        logEvent('unit_lesson_verified',lesson.id);
        setPathway_(pw=>({...pw,[lesson.id]:{completedAt:Date.now(),verified:true,quizScore:pct,studying:false}}));
        const { finalXP, tier } = awardBoostedXP(15); // 10 XP already awarded on Study — verifying tops the lesson up to the usual 25 XP baseline
        const xpBeforeAward=user?.xp||0;
        const bumpedUser={...user,xp:xpBeforeAward+finalXP};
        // A Plan task could point at either the lesson itself or its verification quiz
        // (resolveTaskResource can resolve a "quiz" task to any real quiz, including this one) —
        // match both so either shape gets credited.
        const lessonMatch=resourceMatch('lesson',lesson.id), quizMatch=resourceMatch('quiz',aQuiz.id);
        const newUser=applyPlanAutoComplete(bumpedUser,t=>lessonMatch(t)||quizMatch(t));
        // Awaited: creditStreak below may grant milestone XP with its own
        // read-modify-write of the same row (see saveUser's note).
        await saveUser(newUser);
        play('xp');
        // No confetti burst and no "lesson verified" toast here any more: the
        // full-screen takeover below owns this moment end to end, and firing both
        // would announce the same event twice, the second time behind the first.
        // Streak credit + any milestone/perfect-week payout it unlocks. This is the
        // action the whole streak system is tuned around: one verified lesson clears
        // the default daily goal exactly.
        const streakResult=await creditStreak('lesson_verified',{silent:true});
        // Which pathway this lesson belongs to — NOT necessarily the focused one. With parallel
        // pathways a student can start a lesson from another enrolled track straight off the
        // at-a-glance board, and crediting that work to whatever happened to be in focus would
        // quietly corrupt both pathways' unit mastery and milestone state.
        const lessonPathKey=LESSON_PATHWAY.get(lesson.id)||eSpec;
        const lessonPath=PATHS[lessonPathKey]||curPath;
        const allVerified=unit.lessons.every(l=>l.id===lesson.id?true:pathway[l.id]?.verified);
        if(allVerified){
          await DB.verifyUnit(lessonPathKey,unit.id,aQuiz.id,pct);
          logEvent('unit_verified',unit.id);
          // A unit is a bigger thing than the lesson that finished it, and it gets its own
          // credit on top. Silent: the lesson-complete takeover is already on screen and a
          // second streak toast behind it would be noise, not celebration.
          creditStreak('unit_verified',{silent:true}).catch(console.error);
          setTimeout(()=>celebrateMastery(),400);
          toast.success(pickNudge('unit_verified',{unit:unit.title}),{duration:4000});
        }
        // Pathway-wide milestone nudge (25/50/75/100%) — computed off this
        // pathway's own lessons (not the global cross-pathway `mastery`), and
        // fired at most once per threshold per pathway via a localStorage flag.
        const pathLessons=(lessonPath?.units||[]).flatMap(u=>u.lessons);
        const pathDoneCount=pathLessons.filter(l=>l.id===lesson.id?true:isLessonComplete(l,pathway[l.id])).length;
        const pathPct=pathLessons.length?Math.round((pathDoneCount/pathLessons.length)*100):0;
        const milestone=[100,75,50,25].find(m=>pathPct>=m);
        if(milestone){
          const flagKey=`pathwayMilestone:${lessonPathKey}:${milestone}`;
          if(!localStorage.getItem(flagKey)){
            localStorage.setItem(flagKey,'1');
            toast.success(pickNudge(`pathway_${milestone}`,{pathway:lessonPath?.label}),{duration:4500,icon:<Milestone size={16}/>});
          }
          // Pathway-completion badge — checkAndUnlockAchievements/DB.unlockAchievement are
          // both idempotent (already-unlocked keys are skipped), so it's safe to call this
          // every time 100% is reached rather than gating it behind the nudge's one-time flag.
          if(milestone===100){
            checkAndUnlockAchievements(user,qTaken,qHistory.filter(q=>q.score===100).length,streak,totalReviews,mastery,aiChatCount,{pathwayCompletions:new Set([lessonPathKey])});
          }
        }
        // ── The moment. Full screen, two pages: what you earned, then where it
        // puts you. See LessonCompleteOverlay.jsx for why this is a takeover and
        // not the 3-second corner toast it replaced.
        const upNext=getNextLesson(lesson);
        const streakNow=streakResult?.streak??streak;
        setLessonCelebration({
          lessonTitle:lesson.title,
          unitTitle:unit.title,
          pathwayLabel:lessonPath?.label||'',
          quizScore:pct,
          xpAwarded:finalXP+(streakResult?.xpFromRewards||0),
          xpTier:tier,
          xpBefore:xpBeforeAward,
          streak:streakNow,
          streakBefore:streakResult?.streakBefore??streakNow,
          dailyGoal:streakResult?.day||null,
          week:streakResult?.week||null,
          targetInfo:targetProgress(streakNow,streakTargetFor(user)),
          nextReward:nextMilestone(streakNow),
          milestoneHit:streakResult?.milestoneHit||null,
          perfectWeekJustEarned:!!streakResult?.perfectWeekJustEarned,
          nextLesson:upNext,
        });
      } else {
        toast(pickNudge(pct>=65?'quiz_close_miss':'quiz_fail',{lesson:lesson.title,pct}),{icon:<RefreshCw size={14}/>,duration:4000});
      }
      setVerifyCtx(null);
      setAQ(null);
      return;
    }
    if(qScores[aQuiz.id]!==undefined){setAQ(null);return;}
    await saveQuizScore(aQuiz.id,pct);
    saveCatPerf(aQuiz.cat,pct);
    const { finalXP:xpGain, tier:quizTier } = awardBoostedXP(Math.round(pct*0.5));
    const bumpedUser={...user,xp:(user?.xp||0)+xpGain};
    const newUser=applyPlanAutoComplete(bumpedUser,resourceMatch('quiz',aQuiz.id));
    await saveUser(newUser);
    if(quizTier==='jackpot'){celebrateJackpot();play('jackpot');}
    else if(quizTier==='big'||quizTier==='bonus'){celebrateBonusXP();}
    toast.success(`${pct}% · ${BONUS_COPY[quizTier](xpGain)}`,{icon:pct>=80?<Star size={16}/>:pct>=60?<LineChart size={16}/>:<Dumbbell size={16}/>,duration:quizTier==='jackpot'?4000:3000});
    if(pct===100)setTimeout(()=>toast.success(pickNudge('perfect_quiz',{lesson:aQuiz.title}),{icon:<Star size={16}/>,duration:3500}),350);
    // Two quizzes clear the default daily goal, which is the second of the two
    // routes the goal is deliberately tuned around (one lesson, or two quizzes).
    // Only a first-time score reaches here — the `qScores[aQuiz.id]!==undefined`
    // guard above returns early on a retake — so a quiz cannot be farmed for credit.
    await creditStreak('quiz_completed');
    const newQCount=qTaken+1;
    checkAndUnlockAchievements(newUser,newQCount,qHistory.filter(q=>q.score===100).length+(pct===100?1:0),streak,totalReviews,mastery,aiChatCount);
    if(pct===100)setTimeout(()=>celebratePerfect(),300);
    setAQ(null);
  }

  // ── Diagnostic ────────────────────────────────────────────────────────────────
  function finalizeDiag(answers){
    const { top, ranked, vector, scored } = scorePathways(answers);
    setDR(top);
    setDCats(ranked.filter(k=>k!==top).slice(0,2)); // top 2 alternates, shown as "you might also fit"
    setDWhy(explainMatch(vector, top, { scored })); // reasoning behind the match, not just the label
    setDD(true);
    logEvent('pathway_diagnostic_completed',top);
    refreshRecentActivity();
    saveUser({...user,diagnosticResult:top});
  }

  // ── Search indexes (memoized) ─────────────────────────────────────────────────
  const quizFuse = useMemo(()=>buildQuizSearch(ALL_QUIZZES),[]);
  const libFuse  = useMemo(()=>buildLibrarySearch(ELIB),[]);

  // ── Filtered data ─────────────────────────────────────────────────────────────
  const DIFF_RANK = {Easy:0,Medium:1,Hard:2,Expert:3};
  const fQuiz   = useMemo(()=>{
    const s=fuseSearch(quizFuse,qSrch)||ALL_QUIZZES;
    const filtered=s.filter(q=>(qCat==='All'||q.cat===qCat)&&(qDiff==='All'||q.diff===qDiff));
    if(qSort==='default')return filtered;
    const arr=[...filtered];
    if(qSort==='difficulty')arr.sort((a,b)=>DIFF_RANK[a.diff]-DIFF_RANK[b.diff]);
    if(qSort==='unattempted')arr.sort((a,b)=>(qScores[a.id]!==undefined?1:0)-(qScores[b.id]!==undefined?1:0));
    if(qSort==='score')arr.sort((a,b)=>{const av=qScores[a.id],bv=qScores[b.id];if(av===undefined&&bv===undefined)return 0;if(av===undefined)return 1;if(bv===undefined)return -1;return av-bv;});
    return arr;
  },[qSrch,qCat,qDiff,qSort,qScores]);
  const fLib = useMemo(() => {
    let result = fuseSearch(libFuse, lSrch) || ELIB;
    if (lSrch && lSrch.trim()) {
      const q = lSrch.toLowerCase();
      // Collect any items that have matching personal notes but weren't returned by fuzzy search
      const noteMatches = ELIB.filter(r => {
        const note = user?.resourceNotes?.[r.title];
        return note && note.toLowerCase().includes(q);
      });
      // Merge and preserve order/uniqueness
      const seen = new Set(result.map(r => r.title));
      noteMatches.forEach(r => {
        if (!seen.has(r.title)) {
          result.push(r);
        }
      });
    }

    // Category filter
    if (lCat !== 'All') {
      result = result.filter(r => r.cat === lCat);
    }

    // Type filter
    if (lType !== 'All') {
      result = result.filter(r => r.type === lType);
    }

    // Difficulty filter
    if (lDiff !== 'All') {
      result = result.filter(r => r.difficulty === lDiff);
    }

    // Cost/Access filter
    if (lFreeOnly) {
      result = result.filter(r => r.free);
    }

    // Sub-tab filter (All, Saved, Completed, Notes)
    if (user) {
      if (lSubTab === 'saved') {
        const bms = user.bookmarks || [];
        result = result.filter(r => bms.includes(r.title));
      } else if (lSubTab === 'completed') {
        const studied = user.studied || [];
        result = result.filter(r => studied.includes(r.title));
      } else if (lSubTab === 'notes') {
        const notesObj = user.resourceNotes || {};
        result = result.filter(r => notesObj[r.title] && notesObj[r.title].trim());
      }
    }

    // Sorting logic
    if (lSort === 'alpha') {
      result = [...result].sort((a, b) => a.title.localeCompare(b.title));
    } else if (lSort === 'alpha-desc') {
      result = [...result].sort((a, b) => b.title.localeCompare(a.title));
    }

    return result;
  }, [libFuse, lSrch, lCat, lType, lDiff, lFreeOnly, lSubTab, lSort, user]);

  // ── How much of the library is actually put in the document ───────────────
  //
  // `fLib` is the full result set and stays that way: the counts in the section
  // headers, the empty states and everything downstream still describe every
  // matching resource. What changed is that the two grids below render a window
  // onto it rather than all of it.
  //
  // The measurement that forced this: /prep/library committed 53,001 DOM nodes
  // and ~10,500 event listeners in a single render — 1,628 cards, each ~32 nodes
  // and each carrying a framer-motion hover instance. Opening the tab was enough
  // to make the whole browser unusable, and a detached copy of that tree stayed
  // reachable well past unmount, so the cost accumulated as a student moved
  // around the app instead of being paid once.
  //
  // The split into two windows (rather than one over `fLib`) keeps the existing
  // shape of the page: videos are their own section above the reading list, and
  // each grows on its own as you reach it.
  const libYt  = useMemo(()=>fLib.filter(r=>r.type==='YouTube'),[fLib]);
  const libReg = useMemo(()=>fLib.filter(r=>r.type!=='YouTube'),[fLib]);
  // Every control that can change WHICH resources match, plus the sub-tab itself.
  //
  // The filters are the obvious half: changing one means the student is looking at
  // a new list from the top, so the window snaps back rather than dumping hundreds
  // of rows for a query that matched a handful.
  //
  // `prepScreen` is the half that is easy to miss and matters more. These hooks
  // live at the top of App, so their state outlives the screen that renders them —
  // without it, a student who scrolled deep into the library once would get that
  // entire expanded list rebuilt on EVERY later visit to the tab, having asked for
  // it once. It has to fold in `tab` and not just `prepView`: leaving for the Home
  // tab does not change which PREP sub-view is selected, so keying on `prepView`
  // alone would hold a fully-expanded library across a trip to the dashboard and
  // back. Keyed on both, leaving the screen by any route releases it, and coming
  // back starts at one page again — which is also what a student expects, having
  // left and returned.
  const prepScreen = tab === 'prep' ? prepView : `away:${tab}`;
  const libWindowKey = `${prepScreen}|${lSrch}|${lCat}|${lType}|${lDiff}|${lFreeOnly}|${lSubTab}|${lSort}`;
  const ytWindow  = useWindowedList(libYt,  { resetKey: libWindowKey });
  const regWindow = useWindowedList(libReg, { resetKey: libWindowKey });

  // The quiz grid has the same shape of problem as the library, an order of
  // magnitude smaller: 342 cards measured at 6,864 nodes in one commit. Same
  // treatment, same reasoning — the ordering below (plan quizzes stable-partitioned
  // to the front) still runs over every quiz, so "the two quizzes my plan asked
  // for" are in the first page by construction, not by luck of where the window
  // happens to fall.
  const orderedQuiz = useMemo(()=>{
    const onPlan=(q)=>todayPlanTargets.quizIds.has(q.id);
    const planned=fQuiz.filter(onPlan);
    return planned.length?[...planned,...fQuiz.filter(q=>!onPlan(q))]:fQuiz;
  },[fQuiz,todayPlanTargets]);
  const quizWindow = useWindowedList(orderedQuiz, { resetKey: `${prepScreen}|${qSrch}|${qCat}|${qDiff}|${qSort}` });

  // ── The coach transcript ──────────────────────────────────────────────────
  //
  // `coachMessages` is described in src/lib/db.js as "the one unbounded table
  // here — a chatty student accumulates thousands", and the thread rendered every
  // row of it. Each one is a framer-motion element with a `layout` animation, and
  // every assistant turn additionally runs renderMarkdown (marked + DOMPurify)
  // over its content on each render. Seeded with 1,200 messages — a realistic
  // year of use, not a pathological case — opening /prep/coach committed 13,593
  // nodes and cost 19 MB of heap on that one route.
  //
  // (Wording note: this comment avoids one particular adjective for "believable"
  // on purpose. scripts/verifyLegal.mjs greps this file for analytics SDK names to
  // prove the Privacy Policy's "no tracking" claim is still true, and one of those
  // product names is an ordinary English word.)
  //
  // Windowed from the END, because a transcript is read from the bottom: the most
  // recent exchange is what the student is looking at, and "more" means older.
  // Threads reset the window, so switching conversations does not carry one
  // thread's scrollback into another.
  const msgWindow = useWindowedList(msgs, { page: 30, fromEnd: true, resetKey: `${prepScreen}|${activeThreadId}` });
  // All decks: custom decks first (newest created on top), then built-in decks —
  // so a deck you just generated or created is always the first thing you see.
  const allDecksList = useMemo(()=>{
    // cDecks can now hold a progressed copy of a built-in deck (saved the first time it's
    // studied — see rateCard) under that deck's own name, so exclude those from "custom" or
    // they'd show up twice: once correctly as built-in (with real progress), once again here
    // mislabeled as a user-created deck.
    const customSorted = Object.entries(cDecks)
      .filter(([n])=>!builtinDeckNames.has(n))
      .map(([n,c])=>({name:n,cards:c,builtin:false}))
      .sort((a,b)=>(deckCreatedAt[b.name]||0)-(deckCreatedAt[a.name]||0));
    return [
      ...customSorted,
      ...Object.keys(FLASH_DECKS).map(n=>({name:n,cards:cardsForDeck(n,true),builtin:true})),
    ];
  },[cDecks,deckCreatedAt,builtinDeckNames,cardsForDeck]);
  // How many decks have at least one card due — surfaced instead of the raw due-card count so
  // the number stays small and approachable no matter how large the underlying library grows.
  const dueDeckCount = useMemo(()=>allDecksList.filter(d=>getDueCards(d.cards).length>0).length,[allDecksList]);

  /**
   * Everything with a date on it that the dashboard should treat as a deadline.
   *
   * ── The gap this closes ─────────────────────────────────────────────────────
   * `upcomingDeadlines` is the `deadlines` TABLE — dates the student typed in or saved from a
   * program card. The Roadmap keeps its year in its own document, and until now the two only met
   * on the Milestones feed. So a student could accept a competition into their roadmap, see it on
   * their roadmap, and have the dashboard go on saying there was nothing coming up — the two
   * surfaces they check most often describing two different calendars.
   *
   * Roadmap items are mapped into the row shape the dashboard modules already read rather than
   * teaching those modules a second shape, so "the next three things" and the sixty-day horizon
   * both see one calendar without either of them knowing the Roadmap exists.
   *
   * ── What is deliberately excluded ───────────────────────────────────────────
   * An item with no resolvable date, and an item whose date is a catalog ESTIMATE rather than a
   * real one. The dashboard prints dates as facts; a 'typical' window shown here as "due Nov 14"
   * would be exactly the invented deadline the whole catalog design exists to prevent. Those
   * items stay on the Roadmap, where the UI renders them as a window and says so.
   */
  const homeDeadlineRows = useMemo(()=>{
    const rows = [...(upcomingDeadlines || [])];
    const items = user?.roadmap?.items || [];
    for (const item of items) {
      if (item.status === 'done' || item.status === 'skipped') continue;
      // Only dates we can state as facts — see above.
      const exact = !!item.studentDate || item.confidence === 'fixed' || item.addedBy === 'student';
      if (!exact) continue;
      const date = item.studentDate || item.due || item.on || item.anchor;
      if (!date) continue;
      rows.push({
        id: `roadmap:${item.id}`,
        title: item.title,
        due_date: date,
        completed_at: null,
        kind: item.track === 'competition' ? 'competition' : item.track === 'scholarship' ? 'scholarship' : 'other',
        source: 'roadmap',
      });
    }
    return rows;
  },[upcomingDeadlines,user?.roadmap]);

  /**
   * The three things — the dashboard's first and most prominent module.
   *
   * Ranked by urgency × impact over deadlines, the next unstarted lesson, the
   * weakest hours category, due flashcards and incomplete portfolio work. See
   * src/lib/nextThree.js for why the product of the two is the only ordering
   * that degrades correctly at both ends, and scripts/verifyNextThree.mjs for
   * the cases that pin it down.
   *
   * Recomputed whenever any input moves, so finishing one promotes the next
   * rather than leaving a completed row sitting on the dashboard.
   *
   * `counts` stays undefined until the Portfolio snapshot has actually loaded.
   * nextThree() reads a missing counts object as "unknown" and offers no
   * portfolio gaps at all, which is what stops a returning senior with six
   * programs saved being told to save their first one for the length of a fetch.
   */
  const nextThreeItems = useMemo(()=>nextThree({
    gradeBand, gradeStage: effGrade,
    deadlines: homeDeadlineRows,
    nextLesson, doneLessons: curPathDoneL, totalLessons: curPathAllL.length,
    hours: dashboardHours, benchmarks,
    dueCards, dueDecks: dueDeckCount,
    counts: portLoaded ? {
      recommenders: recommendersCount, colleges: appCounts.colleges,
      activities: (portSnapshot?.activities||portActivities||[]).length,
      essays: appCounts.essays,
    } : undefined,
  }),[gradeBand,effGrade,homeDeadlineRows,nextLesson,curPathDoneL,curPathAllL.length,
      dashboardHours,benchmarks,dueCards,dueDeckCount,portLoaded,recommendersCount,
      appCounts,portSnapshot,portActivities]);
  // ── Medabrain plan spotlight ─────────────────────────────────────────────────
  // Drives both the Home spotlight (TodayPlanNudge picks exactly ONE task to glow) and the small
  // nav-badge dot below (ANY pillar with outstanding plan tasks today, reusing PlanTaskStrip's
  // own `t.pillar===pillar` filter so "does this tab have something due" can't drift out of sync
  // between the two places that ask it).
  const todayPlanEntry = useMemo(()=>getTodayPlanEntry(user?.masterPlan),[user?.masterPlan]);
  const planPillarsDueToday = useMemo(()=>{
    const set = new Set();
    for(const t of (todayPlanEntry?.tasks||[])) if(!t.done && t.pillar) set.add(t.pillar);
    return set;
  },[todayPlanEntry]);
  const deckFuse = useMemo(()=>buildDeckSearch(allDecksList),[allDecksList]);
  const newestDeckName = useMemo(()=>{
    const entries = Object.entries(deckCreatedAt);
    if(!entries.length) return null;
    return entries.reduce((a,b)=>b[1]>a[1]?b:a)[0];
  },[deckCreatedAt]);
  const [dSrchLive,setDSrchLive] = useState('');
  useEffect(()=>{ const t=setTimeout(()=>setDS2(dSrchLive),120); return()=>clearTimeout(t); },[dSrchLive]);

  // Active deck cards (sorted for study). Smart Mix is a virtual "deck" that pools EVERY card
  // in the library — all 866 built-in cards plus anything custom — into one cross-category
  // session, freshly shuffled on every entry (see startSmartMix/seededShuffle). Each card is
  // tagged with where it actually lives so rateCard() can write its FSRS update back to the
  // right place.
  //
  // It deliberately does NOT filter to due cards or sort by FSRS state the way a single deck
  // does. Smart Mix's job is full-library interleaving — every card, in a genuinely different
  // order each session — and both a due-filter and a stability sort work against that: the
  // due-filter shrinks the pool to a handful once a student is caught up, and the sort makes
  // consecutive sessions replay the same ordering. Per-deck study still honors both (below),
  // so the scheduled path is intact for anyone who wants it.
  const deckCards = useMemo(()=>{
    if(!activeDeck)return[];
    if(activeDeck.smartMix){
      const pool=allDecksList.flatMap(d=>d.cards.map(c=>({...c,_srcDeck:d.name,_srcBuiltin:d.builtin})));
      return seededShuffle(pool,smartMixSeed);
    }
    const cards=cardsForDeck(activeDeck.name,activeDeck.builtin);
    return studyMode==='due'?sortForStudy(getDueCards(cards)):cards;
  },[activeDeck,cDecks,studyMode,allDecksList,cardsForDeck,smartMixSeed]);

  const currentCard = deckCards[cIdx];

  // Resume a flashcard session that was mid-review when the page reloaded. Deferred until the
  // DB (and its custom decks) has finished loading, since telling a builtin deck apart from a
  // custom one needs both FLASH_DECKS and cDecks. Only restores if the persisted tab/sub-view
  // was actually the flashcards screen — otherwise the tab/prepView restore above already put
  // the student back on whatever screen they were really on, and jumping into a card view here
  // would fight that.
  useEffect(()=>{
    if(!dbReady)return;
    const persisted=loadViewState();
    const fc=persisted.flashcards;
    if(!fc?.deckName||persisted.prepView!=='flashcards')return;
    const isBuiltin=!!FLASH_DECKS[fc.deckName];
    const isCustom=!isBuiltin&&Array.isArray(cDecks[fc.deckName]);
    if(!isBuiltin&&!isCustom)return; // deck was deleted/renamed since the last session
    setAD({name:fc.deckName,builtin:isBuiltin});
    setStudyMode(fc.studyMode==='due'?'due':'all');
    setCIdx(fc.cIdx||0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[dbReady]);

  // ...and keep that session's position saved as it progresses, so the very next reload picks
  // up from wherever the student actually is, not just where the deck was opened.
  useEffect(()=>{
    if(activeDeck)saveViewState({flashcards:{deckName:activeDeck.name,cIdx,studyMode}});
    else saveViewState({flashcards:null});
  },[activeDeck,cIdx,studyMode]);

  // Drop a queued Plan-deck Start screen the moment the student leaves Flashcards entirely, so it
  // never resurfaces out of context on a later, unrelated visit — openPlanResource sets tab/
  // prepView to 'prep'/'flashcards' in the same batch it sets planDeckPending, so this never
  // clears the screen it was just asked to show.
  useEffect(()=>{ if(tab!=='prep'||prepView!=='flashcards')setPlanDeckPending(null); },[tab,prepView]);

  function startPlanDeck(){
    if(!planDeckPending)return;
    const pd=planDeckPending;
    if(pd.smartMix){ setPlanDeckPending(null); startSmartMix(); play('click'); return; }
    setAD(pd);
    setStudyMode(getDueCards(cardsForDeck(pd.name,pd.builtin)).length>0?'due':'all');
    setCIdx(0);setFlip(false);
    setSessionStats({reviewed:0,again:0,hard:0,good:0,easy:0,startedAt:Date.now(),streak:0,bestStreak:0,xp:0});
    setPlanDeckPending(null);
    play('click');
  }

  // ── Perfect-session celebration (fires once when a completed session was 100% remembered) ──
  const celebratedSessionRef=useRef(null);
  useEffect(()=>{
    if(!activeDeck||currentCard)return;
    const total=sessionStats.reviewed;
    if(total<3||sessionStats.again>0)return;
    const key=`${activeDeck.name}:${sessionStats.startedAt}`;
    if(celebratedSessionRef.current===key)return;
    celebratedSessionRef.current=key;
    celebratePerfect();
  },[activeDeck,currentCard,sessionStats]);
  // ── Plan accountability: a flashcard session finishing (every due card reviewed) auto-checks
  // off any Plan task pointed at this exact deck — same once-only ref-guard pattern as the
  // perfect-session celebration just above, since this effect re-fires on every sessionStats
  // change while the "session complete" render state persists. Smart Mix pools due cards from
  // every deck into one session, so it credits every source deck actually cleared (tagged via
  // `_srcDeck` on each pooled card), plus the literal "Smart Mix" resource id some tasks resolve
  // to directly (see resolveTaskResource's dueish fallback in masterPlanGenerator.js).
  const planAutoDeckRef=useRef(null);
  useEffect(()=>{
    if(!activeDeck||currentCard||sessionStats.reviewed===0)return;
    const key=`${activeDeck.name}:${sessionStats.startedAt}`;
    if(planAutoDeckRef.current===key)return;
    planAutoDeckRef.current=key;
    const ids=activeDeck.smartMix?[...new Set([...deckCards.map(c=>c._srcDeck).filter(Boolean),'Smart Mix'])]:[activeDeck.name];
    if(!ids.length)return;
    const newUser=applyPlanAutoComplete(user,resourceMatch('deck',ids));
    if(newUser!==user)saveUser(newUser);
  },[activeDeck,currentCard,sessionStats]);
  // ═══ TAB RENDERS ══════════════════════════════════════════════════════════════

  const SL = ({children,extra={}}) => <div style={{fontSize:10,fontWeight:700,color:C.t3,letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', marginBottom:16,...extra}}>{children}</div>;

  // ── HOME ─────────────────────────────────────────────────────────────────────
  function tHome(){
    const units=curPath?.units||[];
    const HomeIcon=PATH_ICONS[eSpec]||Compass;
    return(
      <div style={CC({gap:20})}>
        {/* Hero — tinted with the active pathway's own gradient/glow so identity shifts per pathway */}
        <div style={{...glass({padding:28}),background:curPath?.gradient?`linear-gradient(135deg,${curPath.accent}14,${(curPath.accent2||curPath.accent)}08)`:'linear-gradient(135deg,rgba(45,127,255,0.08),rgba(6,182,212,0.04))',border:`1px solid ${accent}26`,position:'relative',overflow:'hidden'}}>
          <div style={{position:'absolute',right:-60,top:-60,width:200,height:200,borderRadius:'50%',background:`radial-gradient(circle,${curPath?.glow||`${accent}18`},transparent 70%)`,pointerEvents:'none'}}/>
          <div style={{position:'relative',...R({gap:16,alignItems:'flex-start'})}}>
            <div style={{width:52,height:52,borderRadius:16,background:`${accent}1c`,border:`1.5px solid ${accent}40`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,boxShadow:`0 0 24px ${curPath?.glow||`${accent}25`}`}}><HomeIcon size={24} color={accent}/></div>
            <div>
              <div style={{fontSize:11,fontWeight:700,color:accent,letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', marginBottom:8}}>{justOnboarded?'Welcome':'Welcome back'}</div>
              <h1 style={{fontSize:30,fontWeight:800,color:C.t1,margin:'0px 0px 12px',letterSpacing: 'calc(-0.67px + var(--msp-letter-spacing))',fontFamily:C.FD,lineHeight:1.15}}>{user.name}</h1>
              <div style={R({gap:8,flexWrap:'wrap'})}>
                <span style={pill(`${accent}22`,accent)}>{curPath?.label}</span>
                {/* Renders nothing until there is a real score — see MedExChip. */}
                <MedExChip state={medexState} onClick={()=>goPortfolio('medex')}/>
                {/* No streak chip here. The streak lives on exactly one surface in this product —
                    the achievements module at the bottom of this dashboard — and nowhere else,
                    least of all in the first thing a student reads on opening the app. Putting it
                    in the hero makes a consecutive-day count the headline fact about a person,
                    which is both the wrong measure and the wrong greeting. Level moved out for the
                    same reason: it is a number that only means something inside this app. */}
                {/* Same rule as the nav badge: don't advertise decks from a tab this student
                    hasn't unlocked yet. Flashcards open after their first quiz. */}
                {dueDeckCount>0&&unlocks.isOpen('prep','flashcards')&&<span style={{...pill(C.violetDim,C.violetL),display:'inline-flex',alignItems:'center',gap:4}}><Layers3 size={11}/>{dueDecksBadge(dueDeckCount)}</span>}
                {/* Pace status — "am I actually keeping up?" against a target the student chose
                    themselves, which is the autonomy-supporting version of the question a streak
                    asks badly. */}
                {paceStatus&&(()=>{
                  const t=paceTone(paceStatus.state);
                  const dim=t==='good'?C.greenDim:t==='warn'?C.amberDim:C.roseDim;
                  const lt =t==='good'?C.greenL  :t==='warn'?C.amberL  :C.roseL;
                  return <span title={`${paceStatus.targetWeeks}-week pace goal · target ${formatPaceDate(paceStatus.deadline)}`} style={{...pill(dim,lt),display:'inline-flex',alignItems:'center',gap:4}}><Target size={11}/>{paceStatus.label}</span>;
                })()}
              </div>
            </div>
          </div>
        </div>

        {/* ═══ 1 · NEXT THREE THINGS ═══════════════════════════════════════════
            First and most prominent, because it is the only block on this screen
            that answers "what do I do in the next twenty minutes" rather than
            "how am I doing". A student should never open this app and wonder
            what to do; everything below this is context for the decision this
            module makes for them. Ranked by urgency × impact — see
            src/lib/nextThree.js. Never more than three. */}
        <NextThreeCard
          items={nextThreeItems}
          onGo={(item)=>{goDest(item.destination);play('click');}}
          accent={accent}
          m={isMobile}
          reducedMotion={reducedMotion}
          loading={!portLoaded&&upcomingDeadlines===null}
        />

        {/* ═══ 2 · THE FOUR-YEAR ARC ═══════════════════════════════════════════
            Second, because the question it answers is the one a freshman is
            silently asking while looking at the module above: why does any of
            this matter yet? Three of the four modules below this are scoped to
            the next sixty days, and a ninth grader who only ever sees those
            correctly concludes they should come back junior year. */}
        <FourYearArc
          gradeStage={effGrade}
          accent={accent}
          m={isMobile}
        />

        {/* ═══ 3 · HOURS RINGS ═════════════════════════════════════════════════
            Hours by category against the active pathway's own benchmarks. This
            is the substance framing in its purest form: four fractions, each
            legible to a seventeen-year-old and to an admissions officer. */}
        {home.visible.has('hoursRings')&&<HoursRings
          hours={dashboardHours}
          benchmarks={benchmarks}
          pathwayLabel={curPath?.label||'your pathway'}
          onLogHours={()=>{goPortfolio('activities');play('click');}}
          accent={C.green}
          m={isMobile}
        />}

        {/* ═══ 4 · DEADLINE HORIZON ════════════════════════════════════════════
            Sixty days, colored by when work has to START rather than when it
            is due — the first rung of the app's own 60/30/7 alert ladder. */}
        {home.visible.has('deadlineHorizon')&&<DeadlineHorizon
          deadlines={homeDeadlineRows}
          onOpen={()=>{goPortfolio('milestones');play('click');}}
          onOpenAll={()=>{goPortfolio('milestones');play('click');}}
          accent={C.rose}
          m={isMobile}
        />}

        {/* ═══ 5 · PROGRESS DETAIL ═════════════════════════════════════════════
            Track completion, quiz trend by topic, flashcard retention, practice
            test trend. Ordered by how quickly a student can move each one. */}
        {home.visible.has('progressDetail')&&<ProgressDetail
          trackLabel={curPath?.label||'your pathway'}
          lessonsDone={curPathDoneL}
          lessonsTotal={curPathAllL.length}
          units={units.map(u=>({id:u.id,title:u.title,pct:unitM(u)}))}
          catStats={catStats}
          quizHistory={qHistory}
          retention={avgRetention}
          cardsTracked={allCards.length}
          testScores={portSnapshot?.testScores||[]}
          accent={accent}
          m={isMobile}
        />}

        {/* ═══ 6 · ACHIEVEMENTS, WEIGHTED BY SUBSTANCE ═════════════════════════
            Five milestones that each name something true about the student
            outside this app, and — under them, small, once, and nowhere else in
            the product — the streak. See the component header for why the
            streak is deliberately not a headline. */}
        {home.visible.has('achievements')&&<SubstanceAchievements
          context={{
            shadowingHours: dashboardHours.shadowing,
            certifications: skillsCount,
            cardsRetained,
            colleges: appCounts.colleges,
            lessonsDone: curPathDoneL,
            lessonsTotal: curPathAllL.length,
          }}
          streak={streak}
          lastEarnedKey={lastEarnedAchievement}
          onGo={(row)=>{goDest(row.destination);play('click');}}
          onOpenAll={()=>{goProgress('achievements');play('click');}}
          accent={C.amber}
          m={isMobile}
          reducedMotion={reducedMotion}
        />}

        {/* ── Supporting surfaces ──────────────────────────────────────────────
            Everything below the six modules is a shortcut into work that lives
            elsewhere, not a seventh reading of how the student is doing. The XP
            total, the level bar, the daily quest rail, the check-in card and the
            old badge strip were all removed rather than moved: they are the
            "points and badges" framing the six modules above deliberately
            replace, and every one of them still exists in full on the Progress
            tab for the student who goes looking. */}

        {/* The MedEx Score — the one remaining block about the outside world.
            It seals weekly, so unlike everything above it is deliberately not a
            today-shaped number. */}
        {home.visible.has('medex')&&<MedExHomeCard
          state={medexState}
          onOpen={()=>goPortfolio('medex')}
          onGoTo={goMedexDimension}
          m={isMobile}
          reducedMotion={reducedMotion}
        />}

        {/* Today's plan, if one has been generated. Distinct from module 1: the
            plan is what the student committed to, the next three is what the
            app would pick. Both are worth showing; they are different claims. */}
        {user.masterPlan && <TodayPlanNudge user={user} accent={accent} onOpenPlan={goPlans} onOpenNextDay={(d)=>goPlans(d)} onOpenTask={openPlanResource} onToggleTask={handlePlanToggleTask} onSnoozeTask={handlePlanSnoozeTask} planStreak={getPlanStreak(user.masterPlan)} isMobile={isMobile} reducedMotion={reducedMotion}/>}

        {/* The student's own "finish this pathway in N weeks" commitment, reported
            on the dashboard rather than only on the tab where it was set. A goal
            you have to go looking for stops steering anything after week one.
            Kept deliberately while the streak card was dropped: this is a target
            the student chose themselves against a pathway they picked, which is
            the autonomy-supporting version of the question a streak asks badly.
            Read-only here — changing it belongs on the Pathway tab, next to what
            the new number costs per week. */}
        {curPathAllL.length>0&&unlocks.isOpen('prep','pathways')&&(
          <PaceGoalCard
            goal={pathwayGoal} pathwayLabel={curPath?.label||'your pathway'}
            totalLessons={curPathAllL.length} doneLessons={curPathDoneL}
            completedAts={curPathCompletedAts}
            accent={accent} variant="compact" isMobile={isMobile}
            onEditRequest={()=>goPrep('pathways')}
          />
        )}

        {/* The max-out plan Medabrain wrote at onboarding. Kept because it is a
            different artifact from anything above — not a reading of progress
            but the student's own stated ambition, revisitable rather than a
            one-time onboarding screen. */}
        {user.generatedPlan?.summary && <MyPlanCard plan={user.generatedPlan} accent={accent} onGoUnlock={()=>goPlans()}/>}

        {/* The Roadmap's single most urgent twelve-month item — nearly always
            something whose preparation starts now for a date months away, which
            is the half of the question module 4's sixty-day window cannot see. */}
        {home.visible.has('roadmapCard')&&unlocks.isOpen('roadmap')&&(
          <RoadmapHomeCard
            user={user} isMobile={isMobile}
            onOpen={()=>goRoadmap('overview')}
            onStart={()=>goRoadmap('intake')}
          />
        )}

        {/* Running several pathways? "Which of my three do I touch today" is a
            dashboard-level question — answering it anywhere else would mean two
            navigations before a single lesson opens. Silent for one pathway. */}
        {isParallel&&unlocks.isOpen('prep','pathways')&&(
          <div>
            <div style={R({justifyContent:'space-between',marginBottom:8,flexWrap:'wrap',gap:8})}>
              <SectionTitle icon={Layers3} color={C.violetL} extra={{marginBottom:0}}>Your {activePathways.length} pathways</SectionTitle>
              <button onClick={()=>goPrep('pathways')} style={{...btnG({fontSize:11,padding:'4px 12px'}),display:'inline-flex',alignItems:'center',gap:4}}>Manage<ChevronRight size={11}/></button>
            </div>
            <ParallelPathwayBoard
              rows={pathwayRows} focused={focusedPathway}
              onFocus={switchPath} onResume={resumePathwayRow}
              m={isMobile} reducedMotion={reducedMotion}
            />
          </div>
        )}

        {/* Financial aid & scholarships — every tracked scholarship one glance
            from the dashboard rather than three taps into Portfolio. Hidden
            entirely when nothing is tracked. */}
        {home.visible.has('financialAid')&&<FinancialAidHomeCard scholarships={portScholarships} accent={C.green} onOpen={()=>goPortfolio('aid')}/>}

        {/* Quick actions, filtered through the unlock ladder like every other
            route into the app — a shortcut to a screen the nav has deliberately
            not shown yet is the wall of options rebuilt on the dashboard. */}
        {home.visible.has('quickActions')&&<div>
          <SL>Quick Actions</SL>
          <div style={G(3,14,{},isMobile)}>
            {[
              {Ic:Compass,lbl:'Diagnostic',sub:'Find your pathway',pillar:'prep',view:'diagnostic',col:C.violet},
              {Ic:Route,lbl:'Pathways',sub:`${doneL}/${allL.length} lessons`,pillar:'prep',view:'pathways',col:accent},
              {Ic:Layers,lbl:'Quiz library',sub:`${qTaken}/${ALL_QUIZZES.length} taken`,pillar:'prep',view:'quizzes',col:C.green},
              {Ic:MessageCircle,lbl:'AI coach',sub:'Medabrain tutor',pillar:'prep',view:'coach',col:C.cyan},
              {Ic:Layers3,lbl:'Flashcards',sub:`${dueDeckCount>0?dueDecksSub(dueDeckCount):`${Object.keys(FLASH_DECKS).length+Object.keys(cDecks).length} decks`}`,pillar:'prep',view:'flashcards',col:dueDeckCount>0?C.violet:C.orange},
              {Ic:Building2,lbl:'Admissions',sub:'Program list builder',pillar:'portfolio',view:'calc',col:C.rose},
            ].filter(a=>unlocks.isOpen(a.pillar,a.view)).map((a,i)=>(
              <motion.div key={i} whileHover={{y:-3,boxShadow:`0 12px 40px rgba(0,0,0,0.5),0 0 0 1px ${a.col}30`}} whileTap={{scale:.98}}
                onClick={()=>{if(a.pillar==='prep')goPrep(a.view);else if(a.pillar==='portfolio')goPortfolio(a.view);play('click');}}
                style={{...glass({padding:20}),cursor:'pointer',transition:'border-color .2s',position:'relative',overflow:'hidden'}}
                onMouseEnter={e=>e.currentTarget.style.borderColor=`${a.col}35`}
                onMouseLeave={e=>e.currentTarget.style.borderColor=C.b1}>
                <div style={{position:'absolute',top:-20,right:-20,width:60,height:60,borderRadius:'50%',background:`${a.col}08`,pointerEvents:'none'}}/>
                <div style={{width:40,height:40,borderRadius:8,background:`${a.col}15`,border:`1px solid ${a.col}20`,display:'flex',alignItems:'center',justifyContent:'center',marginBottom:12,boxShadow:`0 4px 12px ${a.col}20`}}><a.Ic size={19} color={a.col}/></div>
                <div style={{fontSize:14,fontWeight:700,color:C.t1,fontFamily:C.FD,marginBottom:4}}>{a.lbl}</div>
                <div style={{fontSize:11,color:C.t3}}>{a.sub}</div>
              </motion.div>
            ))}
          </div>
        </div>}

        {/* What opens next — the unlock ladder stated in full, in the one place
            a new student actually starts. Disappears once nothing is left. */}
        {unlocks.locked().length>0&&(
          <NextUnlockCard items={unlocks.locked()} variant="card" accent={C.violet}/>
        )}

        {/* ── What this page is not showing yet ────────────────────────────────
            The dashboard is deliberately a reduced view for a new account (see
            src/lib/dashboardStages.js), and this card is what keeps that honest. It
            names every module being held back and what each one would add, and it offers
            the switch — because deciding for someone what they are ready to see, with no
            way to disagree, is its own kind of condescension. Disappears the moment
            nothing is deferred. */}
        {home.isFocused&&(()=>{
          const note=homeFocusNote(home.deferred);
          if(!note)return null;
          return (
            <div style={{...glass({padding:20}),border:`1px solid ${tint(C.violet,0.18)}`,background:`linear-gradient(135deg,${tint(C.violet,0.05)},transparent 60%)`}}>
              <SectionTitle icon={Sparkles} color={C.violetL}>{note.title}</SectionTitle>
              <p style={{fontSize:12.5,color:C.t2,lineHeight:1.6,margin:'0 0 12px'}}>{note.body}</p>
              <ul style={{margin:'0 0 16px',paddingLeft:24}}>
                {note.items.map((it,i)=>(
                  <li key={i} style={{fontSize:11.5,color:C.t3,lineHeight:1.55,marginBottom:4}}>{it}</li>
                ))}
              </ul>
              <button onClick={()=>{saveUser({...user,homeDensity:'full'});play('click');toast('Everything is on your dashboard now. You can go back to the focused view in Settings.',{icon:'✨',duration:5000});}}
                style={{...btnG({fontSize:12,padding:'8px 16px'}),display:'inline-flex',alignItems:'center',gap:8}}>
                Show me all of it anyway<ChevronRight size={12}/>
              </button>
            </div>
          );
        })()}
      </div>
    );
  }

  // ── DIAGNOSTIC ────────────────────────────────────────────────────────────────
  function tDiag(){
    if(dDone&&dRes){const path=PATHS[dRes];
      const ResIcon=PATH_ICONS[dRes]||Compass;
      const alternates=(dCats||[]).map(k=>PATHS[k]).filter(Boolean);
      const totalLessons=(path?.units||[]).reduce((s,u)=>s+u.lessons.length,0);
      return(
      <div style={CC({gap:20})}>
        <div><div style={{...lbl(),color:C.cyanL}}>Pathway Diagnostic</div><h2 style={{fontSize:26, lineHeight: 'calc(1.28 * var(--msp-line-scale))',fontWeight:800,color:C.t1,fontFamily:C.FD,letterSpacing: 'calc(-0.53px + var(--msp-letter-spacing))',margin:0}}>Your match</h2></div>
        <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} style={{...glass({padding:40,textAlign:'center',background:path?.gradient?`linear-gradient(135deg,${path.accent}14,${path.accent2||path.accent}08)`:`linear-gradient(135deg,${C.blueDim},rgba(6,182,212,0.05))`,border:`1px solid ${path?.accent||C.blue}30`})}}>
          <div style={{width:80,height:80,borderRadius:'50%',background:`${path?.accent||accent}18`,border:`2px solid ${path?.accent||accent}40`,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 20px',boxShadow:`0 0 30px ${path?.glow||`${accent}30`}`}}><ResIcon size={34} color={accentText(path?.accent||accent)}/></div>
          <h2 style={{fontSize:30, lineHeight: 'calc(1.21 * var(--msp-line-scale))',fontWeight:800,color:C.t1,fontFamily:C.FD,letterSpacing: 'calc(-0.67px + var(--msp-letter-spacing))',margin:'0px 0px 12px'}}>{path?.label}</h2>
          <p style={{color:C.t2,maxWidth:480,margin:'0 auto 12px',lineHeight: 1.55,fontSize:14}}>Based on your answers — how you think, what pulls you in, and what you already know about these careers — <strong style={{color:C.t1}}>{path?.label}</strong> is your closest match.</p>
          <p style={{color:C.t3,maxWidth:480,margin:'0 auto 28px',lineHeight: 1.55,fontSize:12}}>Starting this pathway loads {totalLessons} lessons across {(path?.units||[]).length} units, sequenced around the content most relevant to {path?.label}.</p>
          <div style={R({justifyContent:'center',gap:12})}>
            <button style={{...btn(path?.gradient||C.blueGrad,{padding:'12px 32px',fontSize:14}),display:'inline-flex',alignItems:'center',gap:8}} onClick={()=>{enrollPath(dRes);setDD(false);setDS(0);setDA([]);setTab('prep');setPrepView('pathways');}}>Accept & start pathway<ChevronRight size={16}/></button>
            <button style={{...btnG({padding:'12px 24px'}),display:'inline-flex',alignItems:'center',gap:4}} onClick={()=>{setDD(false);setDS(0);setDA([]);}}><RefreshCw size={13}/>Retake</button>
          </div>
        </motion.div>

        {/* Why this path — the actual decision logic (5-axis work-style vector + scenario
            votes, see diagnosticEngine.js), not just a bare label the student has to trust. */}
        <div style={glass({padding:16,borderLeft:`3px solid ${path?.accent||C.cyan}55`,background:`linear-gradient(120deg,${path?.accent||C.cyan}08,transparent 45%)`})}>
          <SectionTitle icon={Lightbulb} color={accentText(path?.accent||C.cyanL)}>Why {path?.label}</SectionTitle>
          {dWhy?.reasons?.length>0?(
            <div style={CC({gap:8})}>
              <p style={{fontSize:12.5,color:C.t2,lineHeight: 1.55,margin:0}}>Your answers leaned toward:</p>
              <div style={R({gap:8,flexWrap:'wrap'})}>
                {dWhy.reasons.map(r=>(
                  <span key={r.axis} style={{...pill(`${path?.accent||accent}18`,path?.accent||accent,{fontSize:12}),display:'inline-flex',alignItems:'center',gap:4}}><Check size={11}/>{r.leaning}</span>
                ))}
              </div>
              {dWhy.confidence&&(
                <p style={{fontSize:11.5,color:C.t3,lineHeight: 1.55,margin:'4px 0px 0px'}}>
                  {dWhy.confidence.isClear
                    ?`A clear match — ${path?.label} scored well ahead of every other pathway on your answers.`
                    :`A closer call — ${PATHS[dWhy.confidence.runnerUp]?.label||'another pathway'} was also a strong fit, so it's worth reading through that one too before committing.`}
                </p>
              )}
            </div>
          ):(
            <p style={{fontSize:12.5,color:C.t3,lineHeight: 1.55,margin:0}}>{dRes==='exploring'?`${path?.label} is the broad, exploratory track — a solid pick when your answers didn't strongly lean toward one specialty yet, or if you're still deciding.`:`Your answers didn't lean strongly in one direction, but ${path?.label} still came out as your best overall match.`} Any of the pathways below sequence the same core SAT/ACT prep either way, so it's easy to switch later.</p>
          )}
        </div>

        <div style={{...glass({padding:12}),display:'flex',alignItems:'center',gap:8,background:'rgba(255,255,255,0.02)'}}>
          <Milestone size={14} color={C.t3}/>
          <span style={{fontSize:12,color:C.t3}}>Interests shift as you learn more — it's worth retaking this diagnostic every few months to confirm your pathway still fits.</span>
        </div>
        {alternates.length>0&&<div style={glass({padding:16})}>
          <SectionTitle icon={Sparkles} color={C.violetL}>You Might Also Fit</SectionTitle>
          <div style={G(2,10,{},isMobile)}>
            {alternates.map(p=>{const key=Object.entries(PATHS).find(([,v])=>v===p)?.[0];const AltIcon=PATH_ICONS[key]||Compass;return(
              <motion.div key={key} whileHover={{borderColor:`${p.accent}40`,background:`${p.accent}08`}} onClick={()=>{enrollPath(key);setDD(false);setDS(0);setDA([]);setTab('prep');setPrepView('pathways');}} style={{...glass2({cursor:'pointer',padding:12,transition:'background .15s'}),display:'flex',alignItems:'center',gap:12}}>
                <div style={{width:36,height:36,borderRadius:8,background:`${p.accent}18`,border:`1px solid ${p.accent}35`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><AltIcon size={16} color={accentText(p.accent)}/></div>
                <div>
                  <div style={{fontSize:13,fontWeight:700,color:accentText(p.accent),fontFamily:C.FD}}>{p.label}</div>
                  {p.tagline&&<div style={{fontSize:11,color:C.t3,marginTop:4,lineHeight:1.4}}>{p.tagline}</div>}
                </div>
              </motion.div>
            );})}
          </div>
        </div>}
        <div style={glass({padding:16})}>
          <SectionTitle icon={Compass} color={C.cyanL}>All Pathways</SectionTitle>
          <div style={G(3,10,{},isMobile)}>
            {Object.entries(PATHS).filter(([k])=>k!==dRes).map(([key,p])=>(
              <motion.div key={key} whileHover={{borderColor:`${p.accent}40`,background:`${p.accent}08`}} onClick={()=>{enrollPath(key);setDD(false);setDS(0);setDA([]);setTab('prep');setPrepView('pathways');}} style={{...glass2({cursor:'pointer',padding:12,transition:'background .15s'})}}>
                <div style={{fontSize:13,fontWeight:700,color:accentText(p.accent),fontFamily:C.FD}}>{p.label}</div>
                {p.tagline&&<div style={{fontSize:11,color:C.t3,marginTop:4,lineHeight:1.5}}>{p.tagline}</div>}
                <div style={{fontSize:10,color:C.t4,marginTop:4,fontFamily:C.FM}}>{p.units.length} units</div>
              </motion.div>
            ))}
          </div>
        </div>
        <button style={{...btnG({alignSelf:'flex-start'}),display:'inline-flex',alignItems:'center',gap:4}} onClick={()=>{setDD(false);setDS(0);setDA([]);setDIntro(true);}}><Compass size={13}/>Back to Pathway Overview</button>
      </div>
    );}

    // ── Intro / manual-selection landing ────────────────────────────────────
    if(dIntro){
      return(
        <div style={CC({gap:20})}>
          <PanelHero icon={Compass} color={C.cyan} color2={C.blue} m={isMobile}
            eyebrow="Pathway diagnostic" title="Find your pathway"
            sub={`Every pathway below sequences the same core SAT/ACT prep — math, reading/writing, and science — around the units and quizzes most relevant to a specific health career, so studying also builds toward the path you're most likely to pursue. Take the diagnostic for a recommendation, or read through the pathways yourself and pick one directly. You can always switch later.`}
            stats={[
              {value:DIAG_QS.length,label:'questions'},
              {value:'~6',label:'min',color:C.blue},
              {value:Object.keys(PATHS).length,label:'pathways',color:C.violet},
            ]}/>
          <motion.div data-tour="prep-deep-diagnostic" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} style={{...glass({padding:28,background:`linear-gradient(135deg,${C.cyanDim},${C.blueDim} 70%,transparent)`,border:`1px solid ${C.cyan}30`,position:'relative',overflow:'hidden'}),display:'flex',alignItems:'center',gap:20,flexWrap:'wrap'}}>
            <div style={{position:'absolute',inset:0,background:C.oceanGrad,opacity:0.05,pointerEvents:'none'}}/>
            <div style={{position:'relative',width:56,height:56,borderRadius:16,background:C.oceanGrad,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,boxShadow:`0 8px 22px ${C.cyan}40`}}><Compass size={26} color="#fff"/></div>
            <div style={{position:'relative',flex:1,minWidth:220}}>
              <div style={{fontSize:15, letterSpacing: 'calc(-0.02px + var(--msp-letter-spacing))',fontWeight:800,color:C.t1,fontFamily:C.FD}}>Not sure which fits? Take the diagnostic.</div>
              <div style={{fontSize:12,color:C.t2,marginTop:4}}>{DIAG_QS.length} questions about how you think, what actually interests you, and what these careers look like day to day — takes about 6 minutes.</div>
            </div>
            <div style={{position:'relative',display:'flex',flexDirection:'column',gap:8,flexShrink:0}}>
              <motion.button whileHover={{scale:1.03}} whileTap={{scale:.97}} style={{...btn(C.oceanGrad,{fontSize:13,padding:'12px 24px',boxShadow:`0 6px 18px ${C.cyan}35,inset 0 1px 0 rgba(255,255,255,0.15)`}),display:'inline-flex',alignItems:'center',gap:8,position:'relative'}} onClick={()=>setDIntro(false)}>Start diagnostic<ChevronRight size={15}/></motion.button>
              {/* The skip, given equal weight and put where the decision is actually made.
                  A real share of juniors, seniors, and students from healthcare families walk in
                  already knowing their pathway; six minutes of diagnostic charged before they have
                  seen any value is friction paid by exactly the people who least need it. This
                  drops them into the pathway list below, which is the thing the diagnostic exists
                  to produce. The diagnostic itself never goes anywhere — it stays on this screen
                  and gets re-offered later as optional. See src/lib/onboardingFlow.js. */}
              <button style={{...btnG({fontSize:12,padding:'8px 16px'}),display:'inline-flex',alignItems:'center',justifyContent:'center',gap:8}}
                onClick={()=>{saveUser({...user,skippedDiagnostic:true});document.getElementById('pathway-manual-list')?.scrollIntoView({behavior:'smooth',block:'start'});}}>
                {PATHWAY_SKIP_LABEL}<ChevronRight size={13}/>
              </button>
            </div>
          </motion.div>
          <div id="pathway-manual-list">
            <SectionTitle icon={Route} color={C.cyanL}>All Pathways — Choose Manually</SectionTitle>
            <div style={G(isMobile?1:2,16,{},false)}>
              {Object.entries(PATHS).map(([key,p])=>(
                <PathwayCard key={key} pathKey={key} p={p} m={isMobile}
                  current={focusedPathway===key} enrolled={activePathways.includes(key)} full={activePathways.length>=MAX_ACTIVE_PATHWAYS}
                  onSelect={(k)=>{enrollPath(k);goPrep('pathways');}}/>
              ))}
            </div>
          </div>
        </div>
      );
    }

    const q=DIAG_QS[dStep];if(!q)return null;
    return(
      <div style={CC({gap:20})}>
        <div style={R()}>
          <div>
            <div style={{...lbl(),color:C.cyanL}}>Pathway Diagnostic</div>
            <h2 style={{fontSize:24, lineHeight: 'calc(1.32 * var(--msp-line-scale))',fontWeight:800,color:C.t1,fontFamily:C.FD,letterSpacing: 'calc(-0.47px + var(--msp-letter-spacing))',margin:0}}>Question {dStep+1} <span style={{color:C.t3,fontWeight:400}}>of {DIAG_QS.length}</span></h2>
            {/* Step dots — answered steps fill cyan, current step glows, the rest stay dim */}
            <div style={R({gap:4,marginTop:8})}>
              {DIAG_QS.map((_,i)=>(
                <span key={i} style={{width:i===dStep?16:6,height:6,borderRadius:4,background:i<dStep?C.cyan:i===dStep?C.cyanL:C.s4,boxShadow:i===dStep?`0 0 8px ${C.cyan}80`:'none',transition: CONTROL_TRANSITION}}/>
              ))}
            </div>
          </div>
          <div style={{marginLeft:'auto'}}><Arc pct={(dStep/DIAG_QS.length)*100} size={52} stroke={4} color={C.cyan} label={`${dStep+1}/${DIAG_QS.length}`}/></div>
        </div>
        <Bar pct={(dStep/DIAG_QS.length)*100} color={C.cyan} h={3} glow/>
        <motion.div key={dStep} initial={{opacity:0,x:20}} animate={{opacity:1,x:0}} style={{...glass({padding:28,borderLeft:`3px solid ${C.cyan}55`,background:`linear-gradient(160deg,${C.cyan}08,transparent 50%)`})}}>
          <p style={{fontSize:16, letterSpacing: 'calc(-0.05px + var(--msp-letter-spacing))',fontWeight:600,lineHeight: 1.5,marginBottom:20,color:C.t1,fontFamily:C.FB}}>{q.q}</p>
          <div style={CC({gap:8})}>
            {q.ch.map((ch,ci)=>(
              <motion.div key={ci} whileHover={{background:C.cyanDim,borderColor:`${C.cyan}45`,x:3}} whileTap={{scale:.98}}
                onClick={()=>{const next=[...dAns,ci];setDA(next);play('select');if(dStep<DIAG_QS.length-1)setDS(s=>s+1);else finalizeDiag(next);}}
                style={{...glass2({padding:'16px 16px',cursor:'pointer',transition: CONTROL_TRANSITION}),display:'flex',alignItems:'center',gap:12}}>
                <span style={{width:28,height:28,borderRadius:8,background:`${C.cyan}12`,border:`1px solid ${C.cyan}30`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:C.cyanL,flexShrink:0,fontFamily:C.FM}}>{String.fromCharCode(65+ci)}</span>
                <span style={{fontSize:14,color:C.t1,fontFamily:C.FB}}>{ch.text}</span>
                <ChevronRight size={14} color={C.t4} style={{marginLeft:'auto',flexShrink:0}}/>
              </motion.div>
            ))}
          </div>
        </motion.div>
        <div style={R({gap:8})}>
          {dStep>0&&<button style={{...btnG(),display:'inline-flex',alignItems:'center',gap:4}} onClick={()=>{setDS(s=>s-1);setDA(a=>a.slice(0,-1));}}><ChevronLeft size={14}/>Back</button>}
          <button style={{...btnG(),display:'inline-flex',alignItems:'center',gap:4}} onClick={()=>{setDIntro(true);setDS(0);setDA([]);}}><Compass size={13}/>Back to Pathway Overview</button>
        </div>
      </div>
    );
  }
  // ── PATHWAY ───────────────────────────────────────────────────────────────────
  function tPath(){
    const units=curPath?.units||[];
    // ── The four-year map ────────────────────────────────────────────────────
    // Same units, grouped into five shelves. `isDone` is INJECTED rather than
    // reimplemented in the map module, because "complete" here means "verified
    // if it has a quiz" and a second copy of that rule is a second chance to be
    // wrong about a student's progress.
    const fourYear=buildFourYearMap(units,{
      pathwayKey:eSpec,
      gradeStage:effGrade,
      isDone:(l)=>isLessonComplete(l,pathway[l.id]),
    });
    const activeTier=fourYear.byId[mapTier]||fourYear.byId[fourYear.defaultTier]||fourYear.tiers[0];
    // The units on the selected shelf, carrying their ORIGINAL index — the one
    // lessonState() gates on. Filtering for display must never renumber them,
    // or a unit would read available on one shelf and not on another.
    const shelfUnits=activeTier?activeTier.units:units.map((u,i)=>({unit:u,index:i,basis:'tagged'}));
    // Dropping every pathway is a legitimate state (it's how a student clears the decks and
    // starts over), so it gets a real screen rather than silently falling back to Exploring.
    if(activePathways.length===0){
      return(
        <div style={CC({gap:20})}>
          <PanelHero icon={Route} color={C.blue} color2={C.violet} m={isMobile}
            eyebrow="Pathways" title="Pick where to start"
            sub={`Choose up to ${MAX_ACTIVE_PATHWAYS} pathways and study them side by side — nothing is locked in, and switching between them takes one click.`}/>
          <PathwayManager
            paths={PATHS} rows={pathwayRows} focused={focusedPathway}
            onEnroll={enrollPath} onFocus={switchPath} onDrop={dropPath} onSwap={swapPath}
            onDetails={()=>{setDIntro(true);goPrep('diagnostic');}}
            m={isMobile} reducedMotion={reducedMotion}
          />
        </div>
      );
    }
    return(
      <div style={CC({gap:20})}>
        {/* The switcher, first thing on the page and above the pathway's own hero: on the one
            screen that is entirely about pathways, "which of mine am I looking at" outranks
            "what is this one called". */}
        <PathwayRail
          rows={pathwayRows} focused={focusedPathway} onFocus={switchPath}
          onAdd={openPathwayManager}
          m={isMobile} reducedMotion={reducedMotion}
        />
        {/* The diagnostic, re-offered once to a student who skipped it — as an invitation, not
            a nag. The framing is the true and useful one: the diagnostic's real value to
            somebody who already knows their pathway is the SECOND pathway it surfaces, not a
            confirmation of the first. Dismissing it is permanent; the diagnostic itself stays
            on the Diagnostic tab forever either way. See src/lib/onboardingFlow.js. */}
        {shouldReofferDiagnostic(user,{studyActions:studyActions(unlockSignals)})&&(
          <div style={{...glass({padding:'16px 16px',background:`linear-gradient(135deg,${C.cyanDim},transparent 70%)`,border:`1px solid ${C.cyan}2E`}),display:'flex',gap:16,alignItems:'flex-start',flexWrap:'wrap'}}>
            <Compass size={18} color={C.cyanL} style={{flexShrink:0,marginTop:4}}/>
            <div style={{flex:1,minWidth:220}}>
              <div style={{fontSize:14,fontWeight:800,color:C.t1,fontFamily:C.FD}}>{DIAGNOSTIC_REOFFER.title}</div>
              <div style={{fontSize:12.5,color:C.t2,marginTop:4,lineHeight:1.55}}>{DIAGNOSTIC_REOFFER.body}</div>
            </div>
            <div style={R({gap:8,flexShrink:0})}>
              <button style={btnG({fontSize:12,padding:'8px 16px'})} onClick={()=>saveUser({...user,diagnosticReoffered:true})}>{DIAGNOSTIC_REOFFER.dismiss}</button>
              <button style={btn(C.oceanGrad,{fontSize:12,padding:'8px 16px'})} onClick={()=>{saveUser({...user,diagnosticReoffered:true});setDIntro(false);setDS(0);setDA([]);goPrep('diagnostic');}}>{DIAGNOSTIC_REOFFER.cta}</button>
            </div>
          </div>
        )}
        {/* The stretch between finishing one lesson and opening the next is where a
            student actually decides whether to keep going, and until now nothing in
            the app spoke to them there. One line, state-driven, always pointing at
            the next concrete thing — see PathwayStreakStrip.jsx. */}
        <PathwayStreakStrip
          streak={streak} day={todayStatus} week={weekInfo}
          remainingLessons={Math.max(0,curPathAllL.length-curPathDoneL)}
          onOpen={()=>goProgress('streak')} m={isMobile}
        />
        {/* Running more than one? Show all of them, with each one's real next lesson, startable
            in place. The easiest switch is the one you don't have to make. */}
        {isParallel&&(
          <div>
            <div style={R({justifyContent:'space-between',marginBottom:8,flexWrap:'wrap',gap:8})}>
              <SectionTitle icon={Layers3} color={C.violetL} extra={{marginBottom:0}}>Running in parallel</SectionTitle>
              <span style={{fontSize:10.5,color:C.t3,fontFamily:C.FM}}>
                {isMobile?'Tap a card to jump in':`⌥1–⌥${activePathways.length} to switch · ⌘K to search`}
              </span>
            </div>
            <ParallelPathwayBoard
              rows={pathwayRows} focused={focusedPathway}
              onFocus={switchPath} onResume={resumePathwayRow}
              onAdd={openPathwayManager}
              m={isMobile} reducedMotion={reducedMotion}
            />
          </div>
        )}
        {/* Keyed on the focused pathway so React remounts this whole block on a switch and
            framer-motion plays one short cross-fade. Without it, switching swapped every color,
            title and progress number in place in a single frame — correct, but it read as a
            glitch rather than as a move between two things you own. */}
        <motion.div
          key={eSpec} id="pathway-rail-panel"
          role="tabpanel" aria-labelledby={`pathway-rail-tab-${eSpec}`}
          initial={reducedMotion?false:{opacity:0,y:8}}
          animate={{opacity:1,y:0}}
          transition={{duration:reducedMotion?0:.28,ease:[.22,.61,.36,1]}}
          style={CC({gap:20})}
        >
        <div data-tour="prep-deep-pathway" style={{...glass({padding:20,background:`linear-gradient(120deg,${accent}22,${curPath?.accent2||accent}12 60%,transparent)`,border:`1px solid ${accent}35`,position:'relative',overflow:'hidden'}),display:'flex',alignItems:'center',gap:16,flexWrap:'wrap'}}>
          <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,${accent},${curPath?.accent2||accent}00)`}}/>
          <div style={{position:'absolute',inset:0,background:curPath?.gradient||C.blueGrad,opacity:0.08,pointerEvents:'none'}}/>
          <div style={{position:'relative',width:56,height:56,borderRadius:16,background:curPath?.gradient||C.blueGrad,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,boxShadow:`0 6px 20px ${accent}45`}}>
            {(()=>{const Ic=PATH_ICONS[eSpec]||Compass;return <Ic size={26} color="#fff"/>;})()}
          </div>
          <div style={{position:'relative',flex:1,minWidth:200}}>
            <div style={{...lbl(),color:accent}}>Learning Pathway</div>
            <h2 style={{fontSize:24, lineHeight: 'calc(1.32 * var(--msp-line-scale))',fontWeight:800,color:C.t1,fontFamily:C.FD,letterSpacing: 'calc(-0.47px + var(--msp-letter-spacing))',margin:0}}>{curPath?.label}</h2>
            {curPath?.tagline&&<div style={{fontSize:12,color:accent,fontWeight:600,marginTop:4}}>{curPath.tagline}</div>}
          </div>
          {/* Scoped to THIS pathway, not the cross-pathway totals. A header titled
              "Physician (MD/DO)" reporting progress against every lesson in all ten
              pathways read as a bug even at 90 lessons, and became actively misleading
              once the deep tracks grew — it disagreed with the pace-goal card directly
              below it, which was already pathway-scoped. Cross-pathway `mastery`/`allL`
              still drive the Home dashboard, where that framing is the correct one. */}
          <div style={{position:'relative',marginLeft:isMobile?0:'auto',...R({gap:12})}}>
            <div style={{textAlign:'right'}}><div style={{fontSize:12,color:C.t2,fontFamily:C.FM}}>{curPathDoneL}/{curPathAllL.length}</div><div style={{fontSize:10,color:C.t3}}>lessons</div></div>
            <Arc pct={curPathMastery} size={60} stroke={5} color={accent} label={`${curPathMastery}%`}/>
          </div>
        </div>
        {curPath?.overview&&<div style={{...glass2({padding:'12px 16px',background:`${accent}12`,border:`1px solid ${accent}28`})}}>
          <p style={{fontSize:12.5,color:C.t2,lineHeight: 1.55,margin:0}}>{curPath.overview}</p>
        </div>}
        <Bar pct={curPathMastery} color={accent} h={5} glow/>
        {(()=>{
          const totalLessons=curPathAllL.length;
          const pathComplete=totalLessons>0&&curPathDoneL>=totalLessons;
          if(pathComplete){
            const scores=curPathAllL.map(l=>pathway[l.id]?.quizScore).filter(s=>s!=null);
            const avgScore=scores.length?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length):null;
            const completedTimes=curPathAllL.map(l=>pathway[l.id]?.completedAt).filter(Boolean);
            const lastCompletedAt=completedTimes.length?Math.max(...completedTimes):Date.now();
            return(
              <div style={{...glass2({padding:'12px 16px',background:C.greenDim,border:`1px solid ${C.green}40`})}}>
                <div style={R({gap:8})}>
                  <ShieldCheck size={16} color={C.green}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12.5,fontWeight:700,color:C.t1}}>Pathway complete!</div>
                    <div style={{fontSize:11,color:C.t3,marginTop:4}}>Every lesson in {curPath?.label} is verified.</div>
                  </div>
                  <button style={{...btnSm(`${C.green}22`,{color:C.greenL,border:`1px solid ${C.green}40`}),display:'inline-flex',alignItems:'center',gap:4}} onClick={()=>exportPathwayCertificate(curPath?.label||'Pathway',{studentName:user?.name||'Student',totalLessons,completedLessons:curPathDoneL,avgScore,completedAt:lastCompletedAt})}><FileDown size={13}/>Download certificate</button>
                </div>
              </div>
            );
          }
          // The pace goal is the student's own commitment, so the Pathway tab is where it can
          // actually be authored: any target they type, changeable at any time, restartable,
          // removable. PaceGoalCard owns all of that (and the identical status math the Home
          // card and Medabrain read), so this is just the wiring.
          return(
            <PaceGoalCard
              goal={pathwayGoal} pathwayLabel={curPath?.label||'this pathway'}
              totalLessons={totalLessons} doneLessons={curPathDoneL}
              completedAts={curPathCompletedAts}
              accent={accent} variant="full" isMobile={isMobile}
              dismissed={goalPromptDismissed}
              onSetGoal={setPathwayPaceGoal} onClearGoal={clearPathwayPaceGoal}
              onDismiss={dismissPathwayPaceGoal}
            />
          );
        })()}
        {/* The year rail. It changes which units are on screen and nothing else —
            sequencing, unlocking and every lesson's own state are computed below
            exactly as they were before it existed. */}
        <FourYearMap
          map={fourYear} selected={activeTier?.id} onSelect={setMapTier}
          accent={accent} m={isMobile} reducedMotion={reducedMotion}
        />
        {shelfUnits.map(({unit,index:ui,basis})=>{
          const p=unitM(unit);const done=p===100;const ucm=catMeta(unit.quizCat);
          // Grade personalization — the deep tracks (physician/nursing/PA/exploring) tag each
          // unit with the class years it's genuinely best timed for. This only ever *labels*:
          // sequencing and unlocking are unchanged, so the pathway still runs foundation-first
          // for everyone. Units without the metadata render exactly as before.
          //
          // The honesty problem this has to solve: the units best timed for an older student
          // (Advanced, Next Steps) are exactly the ones furthest behind the sequential unlock,
          // so a senior would otherwise see "Right time for Senior" sitting on a locked unit
          // with no explanation. When the unit isn't reachable yet the badge says so and names
          // what stands between them and it, instead of pointing at a wall.
          const stageMeta=unit.stage?UNIT_STAGES[unit.stage]:null;
          const reachable=unit.openAlways||ui===0||(units[ui-1]?.lessons||[]).every(l=>isLessonComplete(l,pathway[l.id]));
          const timely=isUnitTimelyFor(unit,effGrade)&&!done;
          // The unit's recommended BAND, derived from the gradeFocus it already declares — one
          // tag, no second list to keep in sync. Out-of-band units are marked and left out of the
          // active task list; they are NOT locked, dimmed, or reordered. Sequencing and unlocking
          // are untouched, so a ninth grader can open a senior-timed unit today exactly as before
          // — they simply are not asked to.
          const unitBands=bandsFromGrades(unit.gradeFocus);
          return(
            <motion.div key={unit.id} initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:ui*.05}} style={{...glass({borderLeft:`3px solid ${done?C.green:accent}55`}),background:`linear-gradient(120deg,${done?C.green:accent}0a,transparent 40%)`}}>
              <div style={R({marginBottom:20})}>
                <Arc pct={p} size={50} stroke={4} color={done?C.green:accent} label={`${p}%`}/>
                <div style={{flex:1}}>
                  <div style={R({gap:8,marginBottom:4,flexWrap:'wrap'})}>
                    <span style={{...pill(done?C.greenDim:`${accent}14`,done?C.greenL:accent,{fontSize:9.5,fontWeight:800,fontFamily:C.FM,letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))',padding:'4px 8px'})}}>UNIT {ui+1}</span>
                    <span style={{...pill(ucm.dim,ucm.light,{fontSize:9.5})}}>{ucm.emoji} {unit.quizCat}</span>
                    {stageMeta&&<span title={stageMeta.blurb} style={{...pill(C.s3,C.t2,{fontSize:9.5,fontFamily:C.FM,letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))'})}}>{stageMeta.label}</span>}
                    {timely&&<span title={reachable?undefined:`Work through ${units[ui-1]?.title} to open this up.`} style={{...pill(C.violetDim,C.violetL,{fontSize:9.5,fontWeight:700}),display:'inline-flex',alignItems:'center',gap:4}}><Sparkles size={9}/>{reachable?`Right time for ${gradeLabel||'your grade'}`:`Worth reaching this year${gradeLabel?` — ${gradeLabel} focus`:''}`}</span>}
                    {done&&<span style={{...pill(C.greenDim,C.greenL,{fontSize:10}),display:'inline-flex',alignItems:'center',gap:4}}><Check size={10}/>Mastered</span>}
                    {!done&&<BandPreviewTag bands={unitBands}/>}
                  </div>
                  <div style={{fontSize:15, letterSpacing: 'calc(-0.02px + var(--msp-letter-spacing))',fontWeight:700,color:C.t1,fontFamily:C.FD}}>{unit.title}</div>
                  {unit.blurb&&<div style={{fontSize:11.5,color:C.t3,marginTop:4,lineHeight:1.5,maxWidth:560}}>{unit.blurb}</div>}
                  <div style={{fontSize:11,color:C.t3,marginTop:4}}>{unit.lessons.filter(l=>isLessonComplete(l,pathway[l.id])).length}/{unit.lessons.length} lessons complete</div>
                </div>
              </div>
              {/* Motivation boost: turn "the next unit is locked" into a concrete, encouraging
                  countdown instead of just a dimmed lock icon — a visible, achievable next step
                  keeps momentum going into the next section of the pathway. */}
              {/* …except where there is nothing to unlock. The foundations tier is
                  open from the start and does not gate the unit after it, so this
                  nudge would be making a promise the sequencing does not keep. */}
              {!done&&units[ui+1]&&!unit.openAlways&&!units[ui+1].openAlways&&(()=>{
                const remaining=unit.lessons.filter(l=>!isLessonComplete(l,pathway[l.id])).length;
                return(
                  <div style={{...glass2({padding:'8px 12px',marginBottom:16,background:`${accent}0a`,border:`1px solid ${accent}22`}),display:'flex',alignItems:'center',gap:8}}>
                    <Sparkles size={13} color={accent} style={{flexShrink:0}}/>
                    <span style={{fontSize:11.5,color:C.t2,lineHeight:1.5}}>
                      {remaining} more lesson{remaining===1?'':'s'} here unlocks <strong style={{color:C.t1}}>{units[ui+1].title}</strong> — you're closer than it looks.
                    </span>
                  </div>
                );
              })()}
              <div style={CC({gap:8})}>
                {unit.lessons.map((lesson)=>{
                  const state=lessonState(lesson,ui,units);
                  const isDone=state==='done';const isVerified=state==='verified';const isStudying=state==='studying';
                  const avail=state==='available';
                  // Lessons named by today's plan get the same "on your plan today" treatment
                  // quizzes get — a warm glow + badge, right in place inside the pathway, so the
                  // exact 1-2 lessons the plan wants are unmistakable while scrolling units.
                  const planned=state!=='locked'&&todayPlanTargets.lessonIds.has(lesson.id);
                  return(
                    <motion.div key={lesson.id} whileHover={state==='locked'?{}:{borderColor:`${planned?C.amber:isVerified||isDone?C.green:accent}35`,background:`${planned?C.amber:isVerified||isDone?C.green:accent}08`}}
                      style={{...glass2({padding:'12px 16px',opacity:state==='locked'?.4:1,transition:'background .15s',background:planned?`linear-gradient(120deg,${C.amber}14,transparent 70%)`:undefined,border:planned?`1px solid ${C.amber}40`:undefined,boxShadow:planned?`0 0 0 1px ${C.amber}20,0 4px 16px ${C.amber}18`:undefined}),display:'flex',flexDirection:'column',gap:8}}>
                      {planned&&(
                        <div style={{...pill(C.amberDim,C.amberL,{fontSize:9.5,fontWeight:800}),display:'inline-flex',alignItems:'center',gap:4,alignSelf:'flex-start'}}>
                          <Target size={9}/>On your plan today
                        </div>
                      )}
                      <div style={{display:'flex',alignItems:'center',gap:12}}>
                        <Dot state={state}/>
                        <div style={{flex:1}}>
                          <div style={{fontSize:13,fontWeight:(isDone||isVerified||planned)?700:400,color:planned?C.amberL:isVerified?C.green:isDone?C.green:C.t1,fontFamily:C.FB}}>{lesson.title}</div>
                          <div style={R({gap:4,marginTop:4})}>
                            <span style={{fontSize:11,color:C.t3}}>{lesson.src}</span>
                            {isVerified&&<span style={pill(C.greenDim,C.greenL,{fontSize:9})}><ShieldCheck size={9} style={{marginRight:4}}/>Verified{pathway[lesson.id]?.quizScore!=null?` (${pathway[lesson.id].quizScore}%)`:''}</span>}
                            {isStudying&&<span style={pill(C.amberDim,C.amberL,{fontSize:9})}>In progress — continue when ready</span>}
                          </div>
                        </div>
                        {(avail||isStudying)&&<motion.button whileHover={{scale:1.04}} whileTap={{scale:.96}} style={{...btnSm(planned?`linear-gradient(135deg,${accentFill(C.amber)},${accentFill(C.rose)})`:`linear-gradient(135deg,${accentFill(accent)},${shade(accentFill(accent),0.18)})`,{fontSize:11,color:C.onAccent,boxShadow:`0 2px 8px ${planned?C.amber:accent}30`}),display:'inline-flex',alignItems:'center',gap:4}} onClick={()=>openLesson(lesson,unit)}>{planned?<Target size={11}/>:isStudying?<RefreshCw size={11}/>:<Play size={11}/>}{planned?"Do it — today's plan":isStudying?'Continue':'Start Lesson'}</motion.button>}
                        {isVerified&&<button onClick={()=>reviewLesson(lesson,unit)} title="Re-read this lesson's article and video" style={{...btnSm(C.s4,{color:C.t2,fontSize:11}),display:'inline-flex',alignItems:'center',gap:4}}><ScrollText size={11}/>Review</button>}
                        {(isDone||isVerified)&&<Check size={14} color={C.green} strokeWidth={3}/>}
                        {state==='locked'&&<Lock size={12} color={C.t4}/>}
                      </div>
                      {lesson.objectives?.length>0&&(avail||isStudying)&&(
                        <div style={{marginLeft:32,display:'flex',flexDirection:'column',gap:4}}>
                          <div style={{fontSize:9.5,fontWeight:700,color:C.t3, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))',marginBottom:4}}>What to actually do</div>
                          {lesson.objectives.map((o,oi)=>(
                            <div key={oi} style={{fontSize:11.5,color:C.t2,display:'flex',gap:4,alignItems:'flex-start'}}><span style={{color:accent,flexShrink:0}}>–</span>{o}</div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
              {/* The tool that belongs to this unit, inline. A student who has just
                  read "most nursing programs want statistics, not calculus" wants
                  to look at their own four years right now; putting the planner
                  three tabs away converts that impulse into an intention, and
                  intentions do not survive a navigation. */}
              {/* ── The tool that belongs to this unit ──────────────────────
                  Behind a named door, for the reason Disclosure exists: the
                  unit is a reading list first, and a four-year form plus a
                  nine-card credential catalog rendered under it unasked buries
                  the three lessons the student came for. The door is also what
                  makes the React.lazy above worth anything — closed, the chunk
                  is never fetched and the panel's DOM never exists — and the
                  choice is remembered per student, so somebody who lives in the
                  planner finds it open next time. */}
              {unit.tool==='coursePlanner'&&(
                <div style={{marginTop:16}}>
                  <Disclosure
                    id="prep-course-planner" icon={CalendarRange} color={accent} m={isMobile}
                    title="Plan your four years"
                    sub="Enter the courses you have taken and plan to take, and see the gaps against your pathways.">
                    <React.Suspense fallback={<ToolLoading/>}>
                      <CoursePlannerPanel
                        plan={coursePlan} onPlanChange={setCoursePlan}
                        pathways={activePathways} gradeStage={effGrade}
                        accent={accent} m={isMobile}
                        onApplyRigor={applyPlanRigor} rigorApplied={rigorApplied}
                      />
                    </React.Suspense>
                  </Disclosure>
                </div>
              )}
              {unit.tool==='certifications'&&(
                <div style={{marginTop:16}}>
                  <Disclosure
                    id="prep-certification-explorer" icon={BadgeCheck} color={accent} m={isMobile}
                    title="Compare the credentials"
                    sub="Nine credentials with the real age requirement, cost, and what each one opens — for your state.">
                    <React.Suspense fallback={<ToolLoading/>}>
                      <CertificationExplorer
                        stateCode={credentialState} onStateChange={setCredentialState}
                        age={typicalAgeForGrade(effGrade)}
                        pathwayKey={eSpec} pathwayLabel={curPath?.label||''}
                        accent={accent} m={isMobile}
                      />
                    </React.Suspense>
                  </Disclosure>
                </div>
              )}
            </motion.div>
          );
        })}
        </motion.div>
        {/* Replaces the old "Switch Study Track" grid, where every tile silently replaced the
            student's pathway with no warning and no way back. Now the same ten tiles ADD to
            what you're running (up to three), state exactly what a click does, and keep every
            finished lesson when something is dropped. Collapsed by default so the page still
            ends on the student's own pathway rather than on a catalog. */}
        <div id="msp-pathway-manager" style={glass({padding:16})}>
          <div style={R({justifyContent:'space-between',marginBottom:pathwayManagerOpen?14:0,flexWrap:'wrap',gap:8})}>
            <SectionTitle icon={Route} color={accent} extra={{marginBottom:0}}>
              {isParallel?`Your ${activePathways.length} pathways`:'Study another pathway too'}
            </SectionTitle>
            <div style={R({gap:8})}>
              <button style={{...btnG({fontSize:11,padding:'4px 12px'}),display:'inline-flex',alignItems:'center',gap:4}} onClick={()=>{setDIntro(true);goPrep('diagnostic');}}>Full pathway details<ChevronRight size={12}/></button>
              <button
                aria-expanded={pathwayManagerOpen} aria-controls="msp-pathway-manager-body"
                style={{...btnSm(pathwayManagerOpen?`${accent}16`:C.surfHi,{fontSize:11,color:pathwayManagerOpen?accent:C.t2,border:`1px solid ${pathwayManagerOpen?`${accent}35`:C.b1}`}),display:'inline-flex',alignItems:'center',gap:4}}
                onClick={()=>{const next=!pathwayManagerOpen;setPathwayManagerOpen(next);if(next)openPathwayManager();}}>
                {pathwayManagerOpen?<><X size={11}/>Done</>:<><Plus size={11}/>Add or change pathways</>}
              </button>
            </div>
          </div>
          {!pathwayManagerOpen&&(
            <div style={{fontSize:11.5,color:C.t3,marginTop:8,lineHeight: 1.55}}>
              {activePathways.length<MAX_ACTIVE_PATHWAYS
                ? `You can run up to ${MAX_ACTIVE_PATHWAYS} pathways at once — ${MAX_ACTIVE_PATHWAYS-activePathways.length} slot${MAX_ACTIVE_PATHWAYS-activePathways.length===1?'':'s'} open. Progress in one never affects another.`
                : `All ${MAX_ACTIVE_PATHWAYS} slots are in use. Swap one out whenever you want — nothing you've finished is ever lost.`}
            </div>
          )}
          <AnimatePresence initial={false}>
            {pathwayManagerOpen&&(
              <motion.div id="msp-pathway-manager-body"
                initial={reducedMotion?{opacity:0}:{opacity:0,height:0}}
                animate={{opacity:1,height:'auto'}}
                exit={reducedMotion?{opacity:0}:{opacity:0,height:0}}
                transition={{duration:reducedMotion?0:.22}}
                style={{overflow:'hidden'}}>
                <PathwayManager
                  paths={PATHS} rows={pathwayRows} focused={focusedPathway}
                  onEnroll={enrollPath} onFocus={switchPath} onDrop={dropPath} onSwap={swapPath}
                  onDetails={()=>{setDIntro(true);goPrep('diagnostic');}}
                  m={isMobile} reducedMotion={reducedMotion}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  // ── QUIZ LIBRARY ──────────────────────────────────────────────────────────────
  function tQuizzes(){
    const dColors={Easy:C.green,Medium:C.cyan,Hard:C.amber,Expert:C.rose};
    const diffLevels=['Easy','Medium','Hard','Expert'];
    const COURSE_CAT_MAP={Biology:'Life Sciences','Environmental Science':'Life Sciences',Chemistry:'Physical Sciences',Physics:'Physical Sciences','AP Psychology':'Behavioral & Social Sciences','US History':'Behavioral & Social Sciences','World History':'Behavioral & Social Sciences','AP US History':'Behavioral & Social Sciences','AP World History':'Behavioral & Social Sciences'};
    const myCourseCats=new Set((user.courses||[]).map(c=>COURSE_CAT_MAP[c]).filter(Boolean));
    const filtersActive = qSrch.trim()!==''||qCat!=='All'||qDiff!=='All'||qSort!=='default';
    const clearFilters = ()=>{setQSrch('');setQC('All');setQD('All');setQSort('default');};
    // Stable-partition today's plan quizzes to the very front, ahead of whatever sort/filter
    // is active — "the two quizzes my plan asked for" should never be buried in a 342-quiz grid.
    const onPlan=(q)=>todayPlanTargets.quizIds.has(q.id);
    // Rendered rows only — see the comment on `quizWindow` above. Every count and
    // every empty state on this screen still speaks for the full `fQuiz` result set.
    const shownQuiz=quizWindow.visible;
    return(
      <div style={CC({gap:20})}>
        <PanelHero tourTag="prep-deep-quizzes" icon={Layers} color={C.green} color2={C.cyan} m={isMobile}
          eyebrow="Quiz library" title="Practice quizzes"
          sub="Exam-style questions across every subject."/>
        {/* Medabrain ranked quiz recommendations — placed first, above the stat
            tiles and filter toolbar, so it's the first thing a student sees
            rather than something buried below the library's chrome. Ranking
            itself factors in this student's real category performance,
            enrolled courses, pathway, grade level, and self-reported grades
            (see lib/recommend.js) — this is not a static "top picks" list. */}
        {(medabrainPicksUnlocked ? rankedQuizzes.length>0 : qTaken<ALL_QUIZZES.length)&&<QuizRecommendationsPanel
          ranked={rankedQuizzes} onStart={(quiz)=>{setAQ(quiz);play('click');}} onAskMedabrain={askMedabrainAboutPick} planQuizIds={todayPlanTargets.quizIds}
          unlocked={medabrainPicksUnlocked} unlockProgress={medabrainPicksProg}/>}
        {/* Stat tiles */}
        <div style={G(3,12,{},isMobile)}>
          <StatTile icon={Layers} value={ALL_QUIZZES.length} label={`quizzes · ${TOTAL_QUESTIONS} questions`} color={C.sky}/>
          <StatTile icon={CheckCircle2} value={`${qTaken}/${ALL_QUIZZES.length}`} label="completed" color={C.green}/>
          <StatTile icon={Target} value={avgSc>0?`${avgSc}%`:'—'} label="average score" sub={avgSc>0?undefined:'take a quiz to start tracking'} color={avgSc>0?scCol(avgSc):C.violet}/>
        </div>
        {/* Filter toolbar */}
        <div style={glass({padding:16})}>
          <div style={R({justifyContent:'space-between',marginBottom:12})}>
            <SectionTitle icon={ListFilter} color={C.greenL} extra={{marginBottom:0}}>Filter & Sort</SectionTitle>
            {filtersActive&&<button style={{...btnG({fontSize:10.5,padding:'4px 12px'}),display:'inline-flex',alignItems:'center',gap:4}} onClick={clearFilters}><RefreshCw size={10}/>Reset filters</button>}
          </div>
          {/* Category identity chips — same color language as the E-Library's category row */}
          <div style={R({gap:8,flexWrap:'wrap',marginBottom:12})}>
            {['All','Life Sciences','Physical Sciences','Behavioral & Social Sciences'].map(c=>{
              const active=qCat===c;
              const cm=c==='All'?{color:C.green,light:C.greenL,dim:C.greenDim,emoji:'✨'}:catMeta(c);
              return(
                <motion.button key={c} whileHover={{scale:1.05,y:-1}} whileTap={{scale:.96}} onClick={()=>setQC(c)}
                  style={{...pill(active?cm.color:cm.dim,active?'#fff':cm.light,{fontSize:11,padding:'4px 12px',cursor:'pointer',border:`1px solid ${active?cm.color:'transparent'}`,boxShadow:active?`0 4px 14px ${cm.color}45`:'none',fontWeight:700})}}>
                  {cm.emoji} {c==='Behavioral & Social Sciences'?'Behavioral Sci.':c}
                </motion.button>
              );
            })}
          </div>
          <div style={R({gap:8,flexWrap:'wrap',marginBottom:12})}>
            {diffLevels.map(d=>{const cnt=ALL_QUIZZES.filter(q=>q.diff===d).length;const dc=dColors[d];return cnt>0&&(
              <div key={d} onClick={()=>setQD(qDiff===d?'All':d)} style={{background:qDiff===d?`${dc}18`:'rgba(255,255,255,0.02)',border:`1px solid ${qDiff===d?dc+'55':C.b1}`,padding:'8px 12px',display:'flex',gap:8,alignItems:'center',cursor:'pointer',borderRadius:8,transition: CONTROL_TRANSITION}}>
                <span style={{width:7,height:7,borderRadius:'50%',background:dc,boxShadow:`0 0 6px ${dc}80`,flexShrink:0}}/>
                <span style={{fontSize:11,color:qDiff===d?dc:C.t2,fontWeight:700}}>{d}</span>
                <span style={{fontSize:11,color:C.t3,fontFamily:C.FM}}>{cnt}</span>
              </div>
            );})}
          </div>
          <div style={R({flexWrap:'wrap',gap:8})}>
            <div style={{flex:1,minWidth:180,position:'relative'}}>
              <span style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:C.t3,display:'flex',pointerEvents:'none'}}><Search size={14}/></span>
              <input style={inp({paddingLeft:36})} placeholder="Search quizzes…" value={qSrch} onChange={e=>setQSrch(e.target.value)}/>
            </div>
            <div style={{position:'relative'}}>
              <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:C.t3,display:'flex',pointerEvents:'none'}}><ListFilter size={13}/></span>
              <select style={inp({width:'auto',paddingLeft:28})} value={qSort} onChange={e=>setQSort(e.target.value)}>
                <option value="default">Sort: default</option>
                <option value="unattempted">Sort: Unattempted first</option>
                <option value="difficulty">Sort: Easiest first</option>
                <option value="score">Sort: Lowest score first</option>
              </select>
            </div>
          </div>
        </div>
        {/* Today's Plan — collapsible, previews 2-3 upcoming plan-assigned quizzes (this
            week, not just today) with a direct deep-link to each; the quiz grid below
            still stable-partitions today's exact targets to the front (see onPlan/
            orderedQuiz above), so this section and that ordering reinforce each other
            instead of duplicating the same one-line count this used to be. */}
        {user.masterPlan&&<QuizPlanToday user={user} accent={C.amber} onOpenTask={openPlanResource}/>}
        <div style={R({justifyContent:'space-between'})}>
          <SectionTitle icon={Layers} color={C.greenL} extra={{marginBottom:0}}>{fQuiz.length} {fQuiz.length===1?'Quiz':'Quizzes'}</SectionTitle>
        </div>
        <div style={G(2,14,{},isMobile)}>
          {shownQuiz.map((q,qi)=>{
            const sc=qScores[q.id];const taken=sc!==undefined;const dc=dColors[q.diff]||C.t2;const scc=taken?scCol(sc):null;const cm=catMeta(q.cat);
            const planned=onPlan(q);
            const glowColor=planned?C.amber:cm.color;
            return(
              <motion.div key={q.id} initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:Math.min(qi,10)*.03}}
                whileHover={{y:-2,boxShadow:`0 12px 40px rgba(0,0,0,0.6),0 0 0 1px ${glowColor}${planned?'55':'25'}`}}
                style={{...glass({padding:0,overflow:'hidden',background:planned?`linear-gradient(160deg,${C.amber}16,transparent 60%)`:`linear-gradient(160deg,${cm.color}0d,transparent 55%)`,borderLeft:`3px solid ${glowColor}${planned?'':'55'}`,border:planned?`1px solid ${C.amber}45`:undefined,boxShadow:planned?`0 0 0 1px ${C.amber}25,0 8px 28px ${C.amber}18`:undefined}),transition:'box-shadow .2s'}}>
                <div style={{height:3,background:`linear-gradient(90deg,${planned?C.amber:(taken?scc:dc)},${(planned?C.amber:(taken?scc:dc))}77)`}}/>
                <div style={{padding:20}}>
                  {planned&&(
                    <motion.div initial={{opacity:0,y:-4}} animate={{opacity:1,y:0}} style={{...pill(C.amberDim,C.amberL,{fontSize:10,fontWeight:800,marginBottom:12}),display:'inline-flex',alignItems:'center',gap:4}}>
                      <Target size={10}/>On your plan today
                    </motion.div>
                  )}
                  <div style={R({marginBottom:12,flexWrap:'wrap'})}>
                    <span style={{...pill(`${dc}18`,dc,{fontSize:10}),display:'inline-flex',alignItems:'center',gap:4}}><span style={{width:6,height:6,borderRadius:'50%',background:dc,flexShrink:0}}/>{q.diff}</span>
                    {myCourseCats.has(q.cat)&&<span style={pill(C.greenDim,C.greenL,{fontSize:9})}>Matches your courses</span>}
                    <span style={{marginLeft:'auto',...pill(cm.dim,cm.light,{fontSize:10})}}>{cm.emoji} {q.cat}</span>
                  </div>
                  <div style={{fontSize:15, letterSpacing: 'calc(-0.02px + var(--msp-letter-spacing))',fontWeight:700,color:C.t1,marginBottom:4,lineHeight:1.4,fontFamily:C.FD}}>{q.title}</div>
                  <div style={{fontSize:11,color:C.t3,marginBottom:16,fontFamily:C.FM,display:'flex',alignItems:'center',gap:4}}><ScrollText size={11}/>{q.qs.length} questions{taken?<span style={{...pill(`${scc}16`,scc,{fontSize:9,marginLeft:4}),display:'inline-flex',alignItems:'center',gap:4}}><CheckCircle2 size={9}/>completed</span>:null}</div>
                  <div style={R()}>
                    {taken?(
                      <>
                        <motion.button whileHover={{scale:1.02}} whileTap={{scale:.98}} style={{...btn(C.s3,{flex:1,fontSize:12,border:`1px solid ${C.b2}`,color:C.t2}),display:'inline-flex',alignItems:'center',justifyContent:'center',gap:4}} onClick={()=>{setAQ({...q,readonly:true});play('click');}}>
                          <ScrollText size={13}/>Review
                        </motion.button>
                        <div style={{fontSize:18, letterSpacing: 'calc(-0.17px + var(--msp-letter-spacing))',fontWeight:800,color:scc,fontFamily:C.FM,minWidth:52,textAlign:'right'}}>{sc}%</div>
                      </>
                    ):planned?(
                      <motion.button whileHover={{scale:1.02}} whileTap={{scale:.98}} style={{...btn(`linear-gradient(135deg,${C.amber},${C.rose})`,{flex:1,fontSize:12,boxShadow:`0 4px 14px ${C.amber}45,inset 0 1px 0 rgba(255,255,255,0.12)`}),display:'inline-flex',alignItems:'center',justifyContent:'center',gap:4}} onClick={()=>{setAQ(q);play('click');}}>
                        <Target size={13}/>Do it — today's plan<ChevronRight size={14}/>
                      </motion.button>
                    ):(
                      <motion.button whileHover={{scale:1.02}} whileTap={{scale:.98}} style={{...btn(cm.grad,{flex:1,fontSize:12,boxShadow:`0 4px 14px ${cm.color}35,inset 0 1px 0 rgba(255,255,255,0.12)`}),display:'inline-flex',alignItems:'center',justifyContent:'center',gap:4}} onClick={()=>{setAQ(q);play('click');}}>
                        Start quiz<ChevronRight size={14}/>
                      </motion.button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
        <MoreRows win={quizWindow} label="quizzes"/>
        {fQuiz.length===0&&<EmptyState kind="filtered" icon={Layers} accent={accent} title="No quizzes match those filters" body="Nothing in the bank matches what you have selected. Clearing the filters brings all of them back." actionLabel="Clear filters" onAction={()=>{setQSrch('');setQC('All');setQD('All');}}/>}
      </div>
    );
  }

  // ── AI COACH ─────────────────────────────────────────────────────────────────
  const COACH_ICONS = { FlaskConical, Compass, Sparkles, Lightbulb, HelpCircle, CalendarDays, PenLine, Stethoscope, MessageCircle, KeyRound };
  // ── The mode picker ────────────────────────────────────────────────────────
  // Rendered large in the empty state (where an unprompted student needs to be
  // told what this thing is for) and as a compact row above the composer once a
  // conversation is running (where it is a control, not an invitation).
  // Switching mid-thread is allowed and deliberately does not clear the thread:
  // a student who has been explaining a concept and now wants to be quizzed on
  // it is describing one continuous piece of work.
  function ModePicker({compact=false}){
    const active=modeById(coachMode);
    const options=[FREE_MODE,...MEDABRAIN_MODES];
    return(
      <div role="group" aria-label="What do you want help with?" style={{display:'flex',gap:8,flexWrap:compact?'nowrap':'wrap',overflowX:compact?'auto':'visible',paddingBottom:compact?4:0}}>
        {options.map(m=>{
          const Ic=COACH_ICONS[m.icon]||Sparkles;
          const on=m.id===active.id;
          return(
            <motion.button key={m.id} whileTap={{scale:.97}} onClick={()=>{setCoachMode(m.id);play('click');}}
              aria-pressed={on} title={m.blurb}
              style={{display:'inline-flex',alignItems:'center',gap:6,flexShrink:0,
                padding:compact?'4px 12px':'8px 12px',borderRadius:compact?8:12,cursor:'pointer',
                border:`1px solid ${on?tint(C.violet,0.45):C.b1}`,
                background:on?tint(C.violet,0.16):C.surf2,
                color:on?C.t1:C.t3,fontSize:compact?11.5:12.5,fontWeight:on?700:600,fontFamily:C.FB,
                transition:CONTROL_TRANSITION}}>
              <Ic size={compact?12:13} color={on?C.violetL:C.t4}/>
              {m.label}
            </motion.button>
          );
        })}
      </div>
    );
  }
  // Builds a "For you right now" group from the same profile signals already
  // fed into buildCoachSystemPrompt (weakest category, due cards, stated
  // goal) so the starter prompts a student actually sees are
  // grounded in their real data instead of the same three generic examples
  // every account was shown before.
  const personalizedQuickPrompts=useCallback(()=>{
    const personal=[];
    const weakIdx=secAvgs.map((v,i)=>({v,i})).filter(o=>o.v!==null).sort((a,b)=>a.v-b.v)[0];
    if(weakIdx)personal.push(`I'm scoring lowest in ${cats3[weakIdx.i]} (${weakIdx.v}%) — walk me through how to approach it`);
    if(dueCards>0)personal.push(`Quiz me out loud on my ${dueCards} due flashcard${dueCards===1?'':'s'} instead of the review screen`);
    const goalLabel=GOAL_OPTIONS.find(o=>o.value===user?.goal)?.label;
    if(goalLabel)personal.push(`My goal is "${goalLabel}" — what's the single highest-leverage thing I should do this week?`);
    // The mode's own starters come first when one is picked: the student just
    // told the app what they want, and answering that with the generic shelf
    // would be the interface ignoring them.
    const mode=modeById(coachMode);
    const modeGroup=mode.starters?.length
      ?[{label:mode.label,icon:mode.icon,prompts:mode.starters}]
      :[];
    // ── The equity shelf ─────────────────────────────────────────────────────
    // Questions a student with a physician in the family already knows to ask.
    // Shown to everyone, always — see the header of src/lib/medabrainModes.js
    // for why targeting these at "students who need them" would be both
    // unreliable and insulting. Seeded on the account so the three a student
    // sees are stable within a session rather than reshuffling on every render.
    const equityGroup={
      label:'Questions nobody told you to ask',
      icon:'KeyRound',
      prompts:equityStarters(3,(user?.id?String(user.id).length:0)+(user?.name?user.name.length:0)+aiChatCount),
    };
    const personalGroup=personal.length?[{label:'For you right now',icon:'Sparkles',prompts:personal.slice(0,3)}]:[];
    return [...modeGroup,...personalGroup,equityGroup,...(modeGroup.length?[]:QUICK_P_GROUPS)];
  },[secAvgs,cats3,user,dueCards,coachMode,aiChatCount]);
  function TypingDots(){
    return(
      <div style={{display:'flex',alignItems:'center',gap:4,padding:'4px 4px'}}>
        {[0,1,2].map(i=>(
          <motion.span key={i} animate={{opacity:[.3,1,.3],y:[0,-3,0]}} transition={{duration:1.1,repeat:Infinity,delay:i*0.15,ease:'easeInOut'}} style={{width:6,height:6,borderRadius:'50%',background:C.violetL,display:'inline-block'}}/>
        ))}
      </div>
    );
  }
  function relTime(ts){
    if(!ts)return '';
    const diffMs=Date.now()-ts, m=Math.floor(diffMs/60000), h=Math.floor(m/60), d=Math.floor(h/24);
    if(m<1)return 'just now';
    if(m<60)return `${m}m ago`;
    if(h<24)return `${h}h ago`;
    if(d<7)return `${d}d ago`;
    return new Date(ts).toLocaleDateString(undefined,{month:'short',day:'numeric'});
  }
  function ChatThreadList(){
    return(
      <div style={{display:'flex',flexDirection:'column',height:'100%'}}>
        <div style={{paddingBottom:12,flexShrink:0}}>
          <motion.button whileHover={{scale:1.02,filter:'brightness(1.08)'}} whileTap={{scale:.97}} onClick={startNewChat}
            style={{...btn(C.violetGrad,{width:'100%',justifyContent:'flex-start',padding:'8px 12px',fontSize:12.5}),boxShadow:`0 4px 14px ${C.violet}35`}}>
            <Plus size={14}/>New chat
          </motion.button>
        </div>
        <div style={{flex:1,overflowY:'auto',display:'flex',flexDirection:'column',gap:4,paddingRight:4}}>
          {threadsLoading&&<div style={{fontSize:11.5,color:C.t4,padding:'8px 4px'}}>Loading chats…</div>}
          {!threadsLoading&&coachThreads.length===0&&<div style={{fontSize:11.5,color:C.t4,padding:'8px 4px',lineHeight:1.5}}>No chats yet — ask Medabrain something below to start your first one.</div>}
          {coachThreads.map(t=>{
            const active=t.id===activeThreadId;
            return(
              <div key={t.id} className="mb-thread-row" onClick={()=>renamingThreadId!==t.id&&switchChatThread(t.id)}
                style={{position:'relative',borderRadius:8,padding:'8px 8px',cursor:'pointer',background:active?`${C.violet}18`:'transparent',border:active?`1px solid ${C.violet}35`:'1px solid transparent',display:'flex',alignItems:'center',gap:8,transition:'background .15s'}}>
                <MessageCircle size={13} color={active?C.violetL:C.t4} style={{flexShrink:0}}/>
                {renamingThreadId===t.id?(
                  <input autoFocus value={renameDraft} onChange={e=>setRenameDraft(e.target.value)}
                    onKeyDown={e=>{if(e.key==='Enter')commitRenameThread();if(e.key==='Escape')setRenamingThreadId(null);}}
                    onBlur={commitRenameThread} onClick={e=>e.stopPropagation()}
                    style={{...inp({padding:'4px 8px',fontSize:12}),flex:1}}/>
                ):(
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12.5,fontWeight:active?700:500,color:active?C.t1:C.t2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{t.title}</div>
                    <div style={{fontSize:10,color:C.t4,marginTop:4}}>{relTime(t.updatedAt)}</div>
                  </div>
                )}
                {renamingThreadId!==t.id&&(
                  <div className="mb-thread-actions" style={{display:'flex',gap:4,flexShrink:0}}>
                    <button onClick={e=>{e.stopPropagation();beginRenameThread(t);}} aria-label="Rename chat" title="Rename chat" style={{width:22,height:22,borderRadius:4,border:'none',background:'transparent',color:C.t4,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}><Pencil size={11}/></button>
                    <button onClick={e=>{e.stopPropagation();deleteChatThread(t.id);}} aria-label="Delete chat" title="Delete chat" style={{width:22,height:22,borderRadius:4,border:'none',background:'transparent',color:C.t4,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}><Trash2 size={11}/></button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  // ══ MEDABRAIN COACH ═══════════════════════════════════════════════════════
  //
  // Layout note. This panel used to set `height: calc(100vh - 64px)` while
  // living inside <main>'s padded wrapper — so it was sized against the whole
  // viewport while actually starting 30px down and ending 70px early, and the
  // composer sat below the fold on every screen. The chrome made it worse: a
  // model-usage breakdown and a daily-quota bar were pinned above the thread,
  // costing ~180px of vertical space permanently to information a student looks
  // at roughly once.
  //
  // So: the height now subtracts the real chrome around it, and everything that
  // isn't the conversation collapses into a disclosure. What's left is a single
  // 52px header bar, a thread that takes all remaining height, and a composer
  // pinned to the bottom of the panel rather than the bottom of the document.
  const COACH_CHROME_PX = isMobile
    ? 190   // mobile header (50) + wrapper padding (20+40) + main's bottom-nav gutter (80)
    : 106;  // wrapper padding only (30 top + 70 bottom), plus a hairline
  function tCoach(){
    const usagePct=Math.round(((coachDailyLimit-coachRequestsRemaining)/coachDailyLimit)*100);
    const usageColor=usagePct>=100?C.rose:usagePct>=80?C.amber:C.violet;
    const tierTotal=(coachTierCounts.scout||0)+(coachTierCounts.guide||0)+(coachTierCounts.sage||0);
    const rankedTiers=[...COACH_TIERS].sort((a,b)=>(coachTierCounts[b.id]||0)-(coachTierCounts[a.id]||0));
    const activePinned=coachModelPref!=='auto';
    const briefCount=getBriefEntries(user).length;

    const segBtn=(id,label,Icon,count)=>{
      const on=coachView===id;
      return(
        <button key={id} role="tab" aria-selected={on} onClick={()=>{setCoachView(id);play('click');}}
          style={{display:'inline-flex',alignItems:'center',gap:4,padding:'4px 12px',borderRadius:8,border:'none',cursor:'pointer',
            background:on?`${accent}22`:'transparent',color:on?C.t1:C.t3,fontSize:12,fontWeight:on?700:600,fontFamily:C.FB,transition: CONTROL_TRANSITION}}>
          <Icon size={13}/>{!isMobile&&label}
          {count>0&&<span style={{fontSize:9.5,fontFamily:C.FM,color:on?accent:C.t4}}>{count}</span>}
        </button>
      );
    };

    return(
      <div style={{display:'flex',height:`calc(var(--msp-vh) - ${COACH_CHROME_PX}px)`,minHeight:isMobile?420:480,position:'relative'}}>
        {/* ── Chat sidebar (desktop: fixed column · mobile: slide-over) ────── */}
        {!isMobile&&coachView==='chat'&&(
          <div style={{width:216,flexShrink:0,marginRight:16,borderRight:`1px solid ${C.b1}`,paddingRight:16,overflowY:'auto'}}>
            <ChatThreadList/>
          </div>
        )}
        <AnimatePresence>
          {isMobile&&coachSidebarOpen&&(
            <React.Fragment key="mb-sidebar">
              <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={motionT} onClick={()=>setCoachSidebarOpen(false)} style={{position:'fixed',inset:0,background:C.scrim,zIndex:40}}/>
              <motion.div initial={reducedMotion?false:{x:-280}} animate={{x:0}} exit={reducedMotion?{opacity:0}:{x:-280}} transition={reducedMotion?{duration:0}:{type:'spring',damping:30,stiffness:300}}
                role="dialog" aria-label="Your chats"
                style={{position:'fixed',top:0,left:0,bottom:0,width:260,background:C.s1,borderRight:`1px solid ${C.b1}`,padding:'16px 12px',zIndex:41,overflowY:'auto'}}>
                <ChatThreadList/>
              </motion.div>
            </React.Fragment>
          )}
        </AnimatePresence>

        <div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column'}}>

        {/* ── Header bar — one row, always 52px ──────────────────────────── */}
        <div data-tour="prep-deep-coach" style={{flexShrink:0,display:'flex',alignItems:'center',gap:8,padding:isMobile?'0 2px 12px':'0 2px 14px',borderBottom:`1px solid ${C.b1}`,marginBottom:12}}>
          {isMobile&&coachView==='chat'&&(
            <button onClick={()=>setCoachSidebarOpen(true)} aria-label="Your chats" style={{width:34,height:34,borderRadius:8,flexShrink:0,background:C.surfHi,border:`1px solid ${C.b1}`,display:'grid',placeItems:'center',color:C.t2,cursor:'pointer'}}>
              <Menu size={16}/>
            </button>
          )}
          <div style={{width:isMobile?32:36,height:isMobile?32:36,borderRadius:12,flexShrink:0,background:C.violetGrad,display:'grid',placeItems:'center',boxShadow:`0 6px 16px ${tint(C.violet,0.35)}`}}>
            <Brain size={isMobile?15:18} color="#fff"/>
          </div>
          <div style={{minWidth:0,flex:1}}>
            <div style={R({gap:4,marginBottom:0})}>
              <h2 style={{fontSize:isMobile?16:19,fontWeight:800,color:C.t1,fontFamily:C.FD,letterSpacing: 'calc(-0.03em + var(--msp-letter-spacing))',margin:0,whiteSpace:'nowrap'}}>Medabrain</h2>
              <Sparkles size={12} color={C.amberL}/>
            </div>
            {!isMobile&&<div style={{fontSize:11.5,color:C.t3,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
              {coachView==='chat'?'Ask anything — your prep, your applications, or the world beyond them':'What you tell it here outranks everything else it knows about you'}
            </div>}
          </div>

          {/* Chat / About you */}
          <div role="tablist" aria-label="Medabrain sections" style={{display:'flex',gap:4,padding:4,borderRadius:8,background:C.s2,border:`1px solid ${C.b1}`,flexShrink:0}}>
            {segBtn('chat','Chat',MessageCircle,0)}
            {segBtn('about','About you',UserCog,briefCount)}
          </div>

          {/* Everything that isn't the conversation lives behind this. */}
          {coachView==='chat'&&(
            <button onClick={()=>setCoachMetaOpen(o=>!o)} aria-expanded={coachMetaOpen} aria-controls="coach-meta"
              aria-label="Model and daily usage" title="Model and daily usage"
              style={{width:34,height:34,borderRadius:8,flexShrink:0,background:coachMetaOpen?`${accent}1e`:C.surfHi,border:`1px solid ${coachMetaOpen?accent+'40':C.b1}`,display:'grid',placeItems:'center',color:coachMetaOpen?accent:C.t3,cursor:'pointer'}}>
              <Wand2 size={15}/>
            </button>
          )}
        </div>

        {/* ── Model + usage disclosure ───────────────────────────────────── */}
        <AnimatePresence initial={false}>
          {coachView==='chat'&&coachMetaOpen&&(
            <motion.div id="coach-meta" key="meta"
              initial={reducedMotion?false:{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={reducedMotion?{opacity:0}:{height:0,opacity:0}}
              transition={motionT} style={{overflow:'hidden',flexShrink:0}}>
              <div style={{...glass2({padding:12}),marginBottom:12}}>
                <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:16}}>
                  <div>
                    <span style={lbl()}>Which model answers</span>
                    <div style={{display:'flex',gap:4,padding:4,borderRadius:8,background:C.s2,border:`1px solid ${C.b1}`,alignItems:'center',flexWrap:'wrap'}}>
                      <button onClick={()=>{setCoachModelPref('auto');play('click');}} title="Let Medabrain pick the best model for each message"
                        style={{display:'inline-flex',alignItems:'center',gap:4,padding:'4px 8px',borderRadius:8,border:'none',cursor:'pointer',background:coachModelPref==='auto'?tint(C.green,0.14):'transparent'}}>
                        {coachModelPref==='auto'&&<motion.span animate={reducedMotion?undefined:{opacity:[1,.4,1]}} transition={reducedMotion?undefined:{duration:1.8,repeat:Infinity,ease:'easeInOut'}} style={{width:5,height:5,borderRadius:'50%',background:C.greenL,boxShadow:`0 0 8px ${C.greenL}`}}/>}
                        <span style={{fontSize:10,fontWeight:800,letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', color:coachModelPref==='auto'?C.greenL:C.t4}}>Auto</span>
                      </button>
                      {COACH_TIERS.map(t=>{const on=coachModelPref===t.id;return(
                        <button key={t.id} onClick={()=>{setCoachModelPref(t.id);play('click');}} title={t.desc}
                          style={{padding:'4px 8px',borderRadius:8,border:'none',cursor:'pointer',background:on?tint(t.color,0.16):'transparent'}}>
                          <span style={{fontSize:10.5,fontWeight:700,fontFamily:C.FB,color:on?t.color:C.t4}}>{t.label}</span>
                        </button>
                      );})}
                    </div>
                    <div style={{marginTop:8,fontSize:10.5,color:C.t4,lineHeight:1.5}}>
                      {activePinned
                        ?<>Pinned to <span style={{color:COACH_TIERS.find(t=>t.id===coachModelPref)?.color,fontWeight:700}}>{COACH_TIERS.find(t=>t.id===coachModelPref)?.label}</span> for every message.</>
                        :<>Auto — Medabrain matched <span style={{color:accent,fontWeight:700}}>{COACH_TIERS.find(t=>t.id===coachTier)?.label}</span> to your last message. Factual questions always get the deepest model.</>}
                    </div>
                  </div>
                  <div>
                    <span style={lbl()}>Daily coaching usage</span>
                    <div style={R({justifyContent:'space-between',marginBottom:4})}>
                      <span style={{fontSize:11,color:C.t3}}>{coachRequestsUsedToday} of {coachDailyLimit} today</span>
                      <span style={{fontSize:10.5,color:C.t4,fontFamily:C.FM}}>{tierTotal} answer{tierTotal!==1?'s':''} total</span>
                    </div>
                    <Bar pct={usagePct} color={usageColor} h={4}/>
                    {tierTotal>0&&(
                      <>
                        <div style={{display:'flex',height:6,borderRadius:4,overflow:'hidden',background:C.s4,margin:'8px 0px 8px'}}>
                          {COACH_TIERS.map(t=>{const pct=tierTotal?((coachTierCounts[t.id]||0)/tierTotal*100):0;return pct>0?<div key={t.id} title={`${t.label}: ${coachTierCounts[t.id]||0}`} style={{width:`${pct}%`,background:t.color}}/>:null;})}
                        </div>
                        <div style={R({gap:12,flexWrap:'wrap'})}>
                          {rankedTiers.map(t=>(
                            <div key={t.id} style={R({gap:4})}>
                              <span style={{width:7,height:7,borderRadius: 4,background:t.color,flexShrink:0}}/>
                              <span style={{fontSize:10.5,color:C.t3}}>{t.label}</span>
                              <span style={{fontSize:10.5,color:C.t4,fontFamily:C.FM}}>{coachTierCounts[t.id]||0}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {coachRequestsRemaining<=0&&coachView==='chat'&&(
          <div role="alert" style={{...R({gap:8}),flexShrink:0,marginBottom:12,padding:'12px 16px',borderRadius:12,background:C.roseDim,border:`1px solid ${tint(C.rose,0.3)}`}}>
            <AlertTriangle size={15} color={C.roseL} style={{flexShrink:0}}/>
            <span style={{fontSize:13,color:C.t1}}>You've reached today's coaching limit. It resets tomorrow.</span>
          </div>
        )}

        {/* ══ ABOUT YOU ═══════════════════════════════════════════════════ */}
        {coachView==='about'&&(
          <div style={{flex:1,minHeight:0,overflowY:'auto',paddingRight:4}}>
            <AboutMePanel user={user} onSaveUser={saveUser} isMobile={isMobile} accent={C.violet}/>
          </div>
        )}

        {/* ══ CHAT ════════════════════════════════════════════════════════ */}
        {coachView==='chat'&&(
        <>
        {/* ── Empty state / suggestions ──────────────────────────────────── */}
        {msgs.length===0&&(
          <div style={{flex:1,minHeight:0,overflowY:'auto',paddingRight:4}}>
            <div style={{...glass2({padding:isMobile?15:18,background:`linear-gradient(120deg,${C.violetDim},transparent 60%)`,border:`1px solid ${tint(C.violet,0.22)}`}),marginBottom:16,display:'flex',gap:12,alignItems:'flex-start'}}>
              <div style={{width:34,height:34,borderRadius:8,flexShrink:0,background:C.violetGrad,display:'grid',placeItems:'center',boxShadow:`0 4px 12px ${tint(C.violet,0.35)}`}}>
                <MessageCircle size={15} color="#fff"/>
              </div>
              <div>
                <div style={{fontSize:14,fontWeight:700,color:C.t1,fontFamily:C.FD,marginBottom:4}}>Hey — I'm Medabrain.</div>
                <div style={{fontSize:12.5,color:C.t3,lineHeight:1.6}}>
                  Ask me anything. A concept you're stuck on, a deadline you need to know, what a college
                  actually looks for, or how to plan your week — I know where you stand in {curPath?.label||'your pathway'} and
                  I'm not limited to it.
                  {briefCount===0&&<> Want much better answers? <button onClick={()=>setCoachView('about')} style={{background:'none',border:'none',padding:0,color:C.violetL,fontWeight:700,fontFamily:C.FB,fontSize:12.5,cursor:'pointer',textDecoration:'underline'}}>Tell me about yourself</button> first.</>}
                </div>
              </div>
            </div>
            {/* The front door. An empty box is an exam question with no prompt
                for a fifteen-year-old — see src/lib/medabrainModes.js. */}
            <div style={{marginBottom:16}}>
              <div style={{...R({gap:8}),marginBottom:8}}>
                <Sparkles size={12} color={C.violetL}/><span style={lbl({marginBottom:0})}>What do you want help with?</span>
              </div>
              <ModePicker/>
              <div style={{fontSize:11.5,color:C.t4,lineHeight:1.5,marginTop:8}}>{modeById(coachMode).blurb}</div>
            </div>
            {personalizedQuickPrompts().map(group=>{const GIc=COACH_ICONS[group.icon]||Sparkles;const personal=group.label==='For you right now';const equity=group.icon==='KeyRound';return(
              <div key={group.label} style={{marginBottom:16}}>
                <div style={{...R({gap:4}),marginBottom:8}}>
                  <GIc size={12} color={personal?C.amberL:equity?C.tealL||C.teal:C.t3}/><span style={{...lbl({marginBottom:0}),color:personal?C.amberL:equity?C.tealL||C.teal:undefined}}>{group.label}</span>
                </div>
                {equity&&(
                  <div style={{fontSize:11.5,color:C.t4,lineHeight:1.5,marginBottom:8}}>
                    The questions students with a doctor in the family already know to ask. You should have them too.
                  </div>
                )}
                <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'repeat(auto-fill,minmax(240px,1fr))',gap:8}}>
                  {group.prompts.map((p,i)=>(
                    <motion.button key={i} whileHover={reducedMotion?undefined:{y:-2}} whileTap={{scale:.98}} onClick={()=>sendChat(p)}
                      style={{textAlign:'left',padding:'12px 12px',borderRadius:12,border:`1px solid ${personal?tint(C.amber,0.3):equity?tint(C.teal,0.3):C.b1}`,background:personal?C.amberDim:equity?tint(C.teal,0.07):C.surf2,color:C.t2,fontSize:12.5,lineHeight:1.5,fontFamily:C.FB,cursor:'pointer',transition:'background .15s,border-color .15s'}}>
                      {p}
                    </motion.button>
                  ))}
                </div>
              </div>
            );})}
          </div>
        )}

        {/* ── Message thread ─────────────────────────────────────────────── */}
        {msgs.length>0&&(
        <div role="log" aria-label="Conversation with Medabrain" aria-live="polite" style={{flex:1,minHeight:0,overflowY:'auto',display:'flex',flexDirection:'column',gap:12,paddingRight:4}}>
          <MoreRows win={msgWindow} label="messages" older/>
          <AnimatePresence initial={false}>
            {msgWindow.visible.map((m,vi)=>{
              // Keyed on the message's position in the FULL thread, not in the
              // window — see the note on keys in useWindowedList. Keying on the
              // slice index would re-key every bubble each time older messages
              // load and remount the entire transcript.
              const i=msgWindow.offset+vi;
              return(
              <motion.div key={i} layout={!reducedMotion} initial={reducedMotion?false:{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={motionT} style={{display:'flex',justifyContent:m.role==='user'?'flex-end':'flex-start',alignItems:'flex-end',gap:isMobile?6:10}}>
                {m.role!=='user'&&<div style={{width:isMobile?24:30,height:isMobile?24:30,borderRadius:'50%',background:m.role==='error'?C.roseDim:`linear-gradient(135deg,${tint(C.violet,0.28)},${tint(C.indigo,0.16)})`,border:`1px solid ${m.role==='error'?tint(C.rose,0.28):tint(C.violet,0.24)}`,display:'grid',placeItems:'center',flexShrink:0}}>
                  {m.role==='error'?<AlertTriangle size={isMobile?12:14} color={C.roseL}/>:<Brain size={isMobile?12:14} color={C.violetL}/>}
                </div>}
                <div className="mb-group" style={{maxWidth:isMobile?'85%':'78%',position:'relative'}}>
                  <div className={m.role==='assistant'?'msp-md':undefined} style={{padding:isMobile?'10px 14px':'13px 18px',borderRadius:m.role==='user'?'18px 18px 4px 18px':'18px 18px 18px 4px',background:m.role==='user'?`linear-gradient(135deg,${accent},${C.blueD})`:m.role==='error'?C.roseDim:C.s2,border:m.role==='user'?'none':m.role==='error'?`1px solid ${tint(C.rose,0.3)}`:`1px solid ${C.b1}`,fontSize:isMobile?13:14,lineHeight:1.75,color:m.role==='user'?C.onAccent:C.t1,fontFamily:C.FB,boxShadow:m.role==='user'?`0 4px 16px ${tint(accent,0.3)}`:C.shadowSm}}>
                    {m.role==='assistant'?<div dangerouslySetInnerHTML={{__html:renderMarkdown(m.content)}}/>:m.content}
                    {m.role==='error'&&(
                      <motion.button whileTap={{scale:.96}} onClick={retryChat} style={{...btnG({fontSize:11,padding:'4px 12px',marginTop:8,borderRadius:8,color:C.roseL}),border:`1px solid ${tint(C.rose,0.3)}`}}>
                        <RotateCcw size={11}/> Try again
                      </motion.button>
                    )}
                  </div>
                  {m.role==='assistant'&&(
                    <button className="mb-copy" onClick={()=>copyMsg(m.content,i)} title="Copy response" aria-label="Copy this response"
                      style={{position:'absolute',top:-10,right:-8,width:24,height:24,borderRadius:'50%',border:`1px solid ${C.b2}`,background:C.s3,color:C.t3,display:'grid',placeItems:'center',cursor:'pointer',transition:'opacity .15s'}}>
                      {copiedIdx===i?<Check size={11} color={C.greenL}/>:<Copy size={11}/>}
                    </button>
                  )}
                </div>
              </motion.div>
            );})}
          </AnimatePresence>
          {cLoad&&<motion.div initial={reducedMotion?false:{opacity:0}} animate={{opacity:1}} transition={motionT} style={{display:'flex',alignItems:'flex-end',gap:8}}>
            <div style={{width:30,height:30,borderRadius:'50%',background:`linear-gradient(135deg,${tint(C.violet,0.28)},${tint(C.indigo,0.16)})`,border:`1px solid ${tint(C.violet,0.24)}`,display:'grid',placeItems:'center'}}><Brain size={14} color={C.violetL}/></div>
            <div style={{padding:'12px 16px',background:C.s2,border:`1px solid ${C.b1}`,borderRadius:'18px 18px 18px 4px'}}><TypingDots/></div>
          </motion.div>}
          <div ref={chatEnd}/>
        </div>
        )}

        {/* ── Composer — pinned to the bottom of the panel ─────────────────── */}
        <div style={{flexShrink:0,paddingTop:12}}>
          {/* Support resources. Sits ABOVE the composer, not in the thread,
              because a message scrolls away and this must not — see
              src/components/safety/CrisisResourceCard.jsx. Renders nothing
              until something has armed it. */}
          <div style={{marginBottom:12}}><CrisisResourceCard isMobile={isMobile} compact/></div>
          {msgs.length>0&&<div style={{marginBottom:8}}><ModePicker compact/></div>}
          <div style={R({gap:isMobile?6:10,alignItems:'flex-end'})}>
            <label htmlFor="msp-coach-input" className="msp-sr-only">Ask Medabrain a question</label>
            <textarea id="msp-coach-input" style={{...inp({resize:'none',minHeight:isMobile?44:52,maxHeight:120,lineHeight:1.6,fontFamily:C.FB,borderRadius:12,padding:'8px 12px'}),flex:1,opacity:coachRequestsRemaining<=0?.5:1}} placeholder={isMobile?(coachMode==='free'?"Ask Medabrain anything…":modeById(coachMode).placeholder):modeById(coachMode).placeholder} value={ci} onChange={e=>setCi(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChat(ci);}}} disabled={coachRequestsRemaining<=0}/>
            <motion.button whileHover={reducedMotion?undefined:{scale:1.05}} whileTap={{scale:.95}} aria-label="Send message" style={{...btn(C.violetGrad,{padding:isMobile?'0 16px':'0 22px',height:isMobile?44:52,flexShrink:0,borderRadius:12,boxShadow:`0 4px 16px ${tint(C.violet,0.35)}`,opacity:cLoad||coachRequestsRemaining<=0?.6:1}),display:'inline-flex',alignItems:'center',justifyContent:'center'}} onClick={()=>sendChat(ci)} disabled={cLoad||coachRequestsRemaining<=0}>
              {cLoad?<RefreshCw size={isMobile?16:19} className="spin"/>:<ArrowUp size={isMobile?16:19}/>}
            </motion.button>
          </div>
          <div style={R({justifyContent:'space-between',marginTop:8})}>
            {activeThreadId?<button style={btnG({fontSize:11,padding:'4px 12px',borderRadius:16,color:C.roseL})} onClick={()=>deleteChatThread(activeThreadId)}><Trash2 size={11}/>Delete this chat</button>:<span/>}
            {!isMobile&&<span style={{fontSize:10.5,color:C.t4}}>Medabrain can make mistakes — double-check anything important.</span>}
          </div>
        </div>
        </>
        )}
        </div>
      </div>
    );
  }
  // ── FLASHCARDS ────────────────────────────────────────────────────────────────
  function tFlash(){
    if(planDeckPending&&!activeDeck){
      const pd=planDeckPending;
      const dueCount=pd.smartMix?dueCards:getDueCards(cardsForDeck(pd.name,pd.builtin)).length;
      const totalCount=pd.smartMix?allCards.length:cardsForDeck(pd.name,pd.builtin).length;
      return(
        <div style={CC({gap:16})}>
          <button style={{...btnG({alignSelf:'flex-start'}),display:'inline-flex',alignItems:'center',gap:4}} onClick={()=>setPlanDeckPending(null)}><ChevronLeft size={14}/>All decks</button>
          <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} style={{...glass({padding:isMobile?28:40,textAlign:'center'}),border:`1px solid ${C.amber}30`}}>
            <div style={{width:60,height:60,borderRadius:16,margin:'0 auto 18px',display:'grid',placeItems:'center',background:C.sunsetGrad,boxShadow:`0 10px 30px ${C.amber}40`}}>
              {pd.smartMix?<Sparkles size={26} color="#fff"/>:<Layers3 size={26} color="#fff"/>}
            </div>
            <div style={{fontSize:10,fontWeight:800,letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', color:C.amberL,marginBottom:8}}>Today's Plan Task</div>
            <div style={{fontSize:20,fontWeight:800,color:C.t1,fontFamily:C.FD,letterSpacing: 'calc(-0.28px + var(--msp-letter-spacing))',marginBottom:8}}>{pd.smartMix?'Smart Mix':pd.name}</div>
            <div style={{fontSize:13.5,color:C.t2,lineHeight: 1.55,maxWidth:420,margin:'0 auto 20px'}}>
              {pd.smartMix?`Every card in your library — all ${totalCount} of them, from all ${allDecksList.length} decks — shuffled into one fresh random order${dueCount>0?`, including the ${dueCount} due for review`:''}.`:`${dueCount>0?`${dueCount} card${dueCount===1?'':'s'} due for review`:`${totalCount} card${totalCount===1?'':'s'} in this deck`} — spaced-repetition scheduling picks up right where you left off.`}
            </div>
            <button style={{...btn(C.sunsetGrad,{fontSize:14,padding:'12px 28px'}),display:'inline-flex',alignItems:'center',gap:8,boxShadow:`0 6px 22px ${C.amber}40`}} onClick={startPlanDeck}>
              <Play size={16}/>Start studying
            </button>
          </motion.div>
        </div>
      );
    }
    if(activeDeck){
      const sessionTotal=sessionStats.reviewed;
      const sessionAcc=sessionTotal>0?Math.round(((sessionStats.good+sessionStats.easy)/sessionTotal)*100):null;
      if(!currentCard){
        return(
        <div style={CC({gap:16})}>
          <button style={{...btnG({alignSelf:'flex-start'}),display:'inline-flex',alignItems:'center',gap:4}} onClick={()=>{setAD(null);setCIdx(0);setFlip(false);}}><ChevronLeft size={14}/>All decks</button>
          <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} style={{...glass({padding:40,textAlign:'center'})}}>
            <motion.div initial={{scale:.6,rotate:-10}} animate={{scale:1,rotate:0}} transition={{type:'spring',stiffness:260,damping:14}} style={{marginBottom:16,display:'flex',justifyContent:'center'}}><PartyPopper size={44} color={C.green}/></motion.div>
            <div style={{fontSize:18, letterSpacing: 'calc(-0.17px + var(--msp-letter-spacing))',fontWeight:700,color:C.t1,fontFamily:C.FD,marginBottom:8}}>{activeDeck.smartMix?'Smart Mix complete!':studyMode==='due'?'All due cards reviewed!':'Deck complete!'}</div>
            <div style={{fontSize:14,color:C.t2,marginBottom:sessionTotal>0?20:24}}>{activeDeck.smartMix?`You went through all ${deckCards.length} cards in your library. Start it again and they'll come back in a completely different order.`:studyMode==='due'?'Check back later for more cards to review.':'You have reviewed all cards in this deck.'}</div>
            {sessionTotal>0&&(<>
              <div style={{...G(4,10,{},isMobile),marginBottom:12,maxWidth:460,marginLeft:'auto',marginRight:'auto'}}>
                <div style={glass2({textAlign:'center',padding:12})}><div style={{fontSize:18, letterSpacing: 'calc(-0.17px + var(--msp-letter-spacing))',fontWeight:800,color:C.t1,fontFamily:C.FD}}>{sessionTotal}</div><div style={{fontSize:9,color:C.t3, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))',marginTop:4}}>Reviewed</div></div>
                <div style={glass2({textAlign:'center',padding:12})}><div style={{fontSize:18, letterSpacing: 'calc(-0.17px + var(--msp-letter-spacing))',fontWeight:800,color:C.green,fontFamily:C.FD}}>{sessionAcc}%</div><div style={{fontSize:9,color:C.t3, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))',marginTop:4}}>Remembered</div></div>
                <div style={glass2({textAlign:'center',padding:12})}><div style={{fontSize:18, letterSpacing: 'calc(-0.17px + var(--msp-letter-spacing))',fontWeight:800,color:C.rose,fontFamily:C.FD}}>{sessionStats.again}</div><div style={{fontSize:9,color:C.t3, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))',marginTop:4}}>Again</div></div>
                <div style={glass2({textAlign:'center',padding:12})}><div style={{fontSize:18, letterSpacing: 'calc(-0.17px + var(--msp-letter-spacing))',fontWeight:800,color:C.blue,fontFamily:C.FD}}>{fmtT(Math.round((Date.now()-sessionStats.startedAt)/1000))}</div><div style={{fontSize:9,color:C.t3, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))',marginTop:4}}>Time</div></div>
              </div>
              <div style={{...G(2,10,{},isMobile),marginBottom:24,maxWidth:240,marginLeft:'auto',marginRight:'auto'}}>
                <div style={{...glass2({textAlign:'center',padding:12,background:C.amberDim,border:`1px solid ${C.amber}25`})}}><div style={{fontSize:16, letterSpacing: 'calc(-0.05px + var(--msp-letter-spacing))',fontWeight:800,color:C.amberL,fontFamily:C.FD,display:'flex',alignItems:'center',justifyContent:'center',gap:4}}><Flame size={14}/>{sessionStats.bestStreak}</div><div style={{fontSize:9,color:C.t3, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))',marginTop:4}}>Best streak</div></div>
                <div style={{...glass2({textAlign:'center',padding:12,background:C.violetDim,border:`1px solid ${C.violet}25`})}}><div style={{fontSize:16, letterSpacing: 'calc(-0.05px + var(--msp-letter-spacing))',fontWeight:800,color:C.violetL,fontFamily:C.FD,display:'flex',alignItems:'center',justifyContent:'center',gap:4}}><Zap size={14}/>{sessionStats.xp}</div><div style={{fontSize:9,color:C.t3, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))',marginTop:4}}>XP earned</div></div>
              </div>
            </>)}
            <div style={R({justifyContent:'center',gap:8})}>
              {!activeDeck.smartMix&&studyMode==='due'&&<button style={btn()} onClick={()=>setStudyMode('all')}>Browse all cards</button>}
              {activeDeck.smartMix&&<button style={btn(C.sunsetGrad)} onClick={startSmartMix}>Shuffle again</button>}
              {activeDeck.smartMix
                ?<button style={btnG()} onClick={()=>{setAD(null);setCIdx(0);setFlip(false);}}>Back to Decks</button>
                :<button style={btnG()} onClick={()=>{setCIdx(0);setFlip(false);setSessionStats({reviewed:0,again:0,hard:0,good:0,easy:0,startedAt:Date.now(),streak:0,bestStreak:0,xp:0});}}>Study Again</button>}
            </div>
          </motion.div>
        </div>
      );}
      const dueCount=activeDeck.smartMix?deckCards.length:getDueCards(cardsForDeck(activeDeck.name,activeDeck.builtin)).length;
      return(
        <div style={CC({gap:16})}>
          <div style={R()}>
            <button style={{...btnG({padding:'8px 16px',fontSize:12}),display:'inline-flex',alignItems:'center',gap:4}} onClick={()=>{setAD(null);setCIdx(0);setFlip(false);}}><ChevronLeft size={14}/>All decks</button>
            <div style={{flex:1,textAlign:'center'}}>
              <div style={R({justifyContent:'center',gap:8})}>
                {activeDeck.smartMix&&<Sparkles size={13} color={C.amberL}/>}
                <div style={{fontSize:14,fontWeight:700,color:C.t1,fontFamily:C.FD}}>{activeDeck.name}</div>
                <AnimatePresence>
                  {sessionStats.streak>=3&&(
                    <motion.div key={sessionStats.streak} initial={{scale:.4,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:.4,opacity:0}} transition={{type:'spring',stiffness:400,damping:12}}
                      style={{...pill(C.amberDim,C.amberL,{fontSize:10}),display:'inline-flex',alignItems:'center',gap:4}}>
                      <Flame size={11}/>{sessionStats.streak}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div style={{fontSize:11,color:C.t3,fontFamily:C.FM,marginTop:4}}>
                {cIdx+1} / {deckCards.length}{activeDeck.smartMix?` · shuffled${currentCard?._srcDeck?` · from ${currentCard._srcDeck}`:''}`:` · ${dueCount} due`}{sessionTotal>0?` · ${sessionTotal} reviewed · +${sessionStats.xp} XP`:''}
              </div>
            </div>
            <div style={R({gap:4})}>
              {/* Re-deals the whole library from card 1 without leaving the session — the escape
                  hatch for "I've seen this run, give me a different one". */}
              {activeDeck.smartMix&&<button title="Deal all cards again in a brand-new order" style={{...btnSm(C.s4,{color:C.t2,fontSize:11}),display:'inline-flex',alignItems:'center',gap:4}} onClick={()=>{rerollSmartMix();play('click');}}><Shuffle size={11}/>Reshuffle</button>}
              {!activeDeck.smartMix&&<button style={btnSm(studyMode==='due'?C.sunsetGrad:C.s4,{fontSize:11,color:studyMode==='due'?'#fff':C.t2,border:`1px solid ${studyMode==='due'?'transparent':C.b1}`,boxShadow:studyMode==='due'?`0 3px 10px ${C.amber}30`:'none'})} onClick={()=>{setStudyMode('due');setCIdx(0);setFlip(false);}}>Due ({dueCount})</button>}
              {!activeDeck.smartMix&&<button style={btnSm(studyMode==='all'?C.sunsetGrad:C.s4,{fontSize:11,color:studyMode==='all'?'#fff':C.t2,border:`1px solid ${studyMode==='all'?'transparent':C.b1}`,boxShadow:studyMode==='all'?`0 3px 10px ${C.amber}30`:'none'})} onClick={()=>{setStudyMode('all');setCIdx(0);setFlip(false);}}>All</button>}
              {!activeDeck.builtin&&<button style={btnSm(C.s4,{color:C.t2,fontSize:11})} onClick={()=>setManageDeck(activeDeck.name)}>Manage</button>}
              {!activeDeck.builtin&&<button style={btnSm(C.roseDim,{color:C.rose,border:`1px solid ${C.rose}30`,fontSize:11})} onClick={()=>{deleteDeck_(activeDeck.name);setAD(null);toast('Deck deleted');}}>Delete</button>}
            </div>
          </div>
          <Bar pct={((cIdx+1)/deckCards.length)*100} color={accent} h={3} glow/>
          <FlipCard card={currentCard} flipped={flip} onClick={()=>setFlip(f=>!f)} m={isMobile} streak={sessionStats.streak}/>
          <div style={{textAlign:'center',fontSize:10.5,color:C.t4,fontFamily:C.FM}}>{!isMobile&&(flip?'Press 1–4 to rate · ':'Press Space to flip · ')}Click card to flip</div>
          <div style={R({justifyContent:'space-between'})}>
            <motion.button whileHover={{scale:1.04}} style={{...btnG({padding:'8px 20px'}),display:'inline-flex',alignItems:'center',gap:4}} onClick={()=>{setCIdx(i=>Math.max(0,i-1));setFlip(false);}} disabled={cIdx===0}><ChevronLeft size={14}/>Prev</motion.button>
            {flip&&(
              <div style={R({gap:8})}>
                {[['Again',0,C.rose],['Hard',1,C.amber],['Good',2,C.blue],['Easy',3,C.green]].map(([label,q,col])=>(
                  <motion.button key={label} whileHover={{scale:1.06}} whileTap={{scale:.94}}
                    style={{...btnSm(`${col}20`,{color:col,border:`1px solid ${col}30`,fontSize:11}),display:'inline-flex',alignItems:'center',gap:4}}
                    onClick={()=>rateCard(label)}>
                    {label}<span style={{fontSize:9,color:`${col}99`,fontFamily:C.FM}}>{q+1}</span>
                  </motion.button>
                ))}
              </div>
            )}
            <motion.button whileHover={{scale:1.04}} style={{...btnG({padding:'8px 20px'}),display:'inline-flex',alignItems:'center',gap:4}} onClick={()=>{setCIdx(i=>Math.min(deckCards.length-1,i+1));setFlip(false);}} disabled={cIdx===deckCards.length-1}>Next<ChevronRight size={14}/></motion.button>
          </div>
          {/* Export deck */}
          <button style={{...btnG({alignSelf:'flex-start',fontSize:11,padding:'4px 12px'}),display:'inline-flex',alignItems:'center',gap:4}} onClick={()=>exportFlashDeck(activeDeck.name,deckCards)}><FileDown size={13}/>Export deck PDF</button>
          <AnimatePresence>
            {manageDeck&&<CardManagerModal
              deckName={manageDeck}
              cards={cDecks[manageDeck]||[]}
              onAdd={(f,b)=>addCardToDeck(manageDeck,f,b)}
              onUpdate={(idx,f,b)=>updateCardInDeck(manageDeck,idx,f,b)}
              onDelete={idx=>deleteCardFromDeck(manageDeck,idx)}
              onClose={()=>setManageDeck(null)}
              m={isMobile}
            />}
          </AnimatePresence>
        </div>
      );
    }

    const builtinCount=Object.keys(FLASH_DECKS).length, customCount=Object.keys(cDecks).filter(n=>!builtinDeckNames.has(n)).length;
    const searched=searchDecks(deckFuse,allDecksList,dSrch)||allDecksList;
    // Section decks into SAT / Science / Social Studies / Study Skills / My Decks (each with its
    // own subsections, e.g. SAT > Math vs. SAT > Reading & Writing) instead of one flat list —
    // see DECK_CATEGORIES in constants.js.
    const subcatsForCategory=deckCategory==='all'?[]:[...new Set(allDecksList.filter(d=>getDeckCategory(d.name,d.builtin).category===deckCategory).map(d=>getDeckCategory(d.name,d.builtin).subcategory))];
    const categorized=searched.filter(deck=>{
      if(deckCategory==='all')return true;
      const info=getDeckCategory(deck.name,deck.builtin);
      if(info.category!==deckCategory)return false;
      return deckSubcat==='all'||info.subcategory===deckSubcat;
    });
    const filteredDecks=categorized.filter(deck=>{
      if(deckFilter==='all')return true;
      if(deckFilter==='due')return getDueCards(deck.cards).length>0;
      if(deckFilter==='custom')return !deck.builtin;
      if(deckFilter==='builtin')return deck.builtin;
      return true;
    });
    // Per-subject mastery — retention % rolled up by DECK_CATEGORY_ORDER instead of just one
    // library-wide average, so a student can see e.g. "SAT Math 91% vs. Study Skills 54%"
    // rather than a single blended number that hides which subject actually needs more work.
    const categoryMastery=DECK_CATEGORY_ORDER.map(cat=>{
      const cardsInCat=allDecksList.filter(d=>getDeckCategory(d.name,d.builtin).category===cat).flatMap(d=>d.cards);
      if(!cardsInCat.length)return null;
      const rets=cardsInCat.map(c=>getRetainability(c)).filter(r=>r!==null);
      return{cat,total:cardsInCat.length,due:getDueCards(cardsInCat).length,avgRet:rets.length?Math.round(rets.reduce((s,r)=>s+r,0)/rets.length):null};
    }).filter(Boolean);

    return(
      <div style={CC({gap:20})}>
        <PanelHero tourTag="prep-deep-flashcards" icon={Layers3} color={C.amber} color2={C.rose} m={isMobile}
          eyebrow="Flashcards" title="Study decks"
          sub="Scheduled with FSRS. Study what's due, or build a deck from your notes."
          right={<button style={{...btn(C.sunsetGrad,{fontSize:12,padding:'8px 16px',boxShadow:`0 4px 14px ${C.amber}35`}),display:'inline-flex',alignItems:'center',gap:4}} onClick={()=>setNewDeckOpen(true)}><Plus size={14}/>New deck</button>}/>

        {/* Overview stats */}
        <div style={G(4,12,{},isMobile)}>
          <StatTile icon={Layers3} value={builtinCount+customCount} label="Total decks" color={C.sky}/>
          <StatTile icon={ScrollText} value={allCards.length} label="Total cards" color={C.teal}/>
          <StatTile icon={dueDeckCount>0?Clock:CheckCircle2} value={dueDeckCount} label="Decks due" sub={dueDeckCount>0?undefined:'all caught up'} color={dueDeckCount>0?C.amber:C.green}/>
          <StatTile icon={Brain} value={avgRetention!==null?`${avgRetention}%`:'—'} label="Avg. retention" color={C.violet}/>
        </div>

        {/* Smart Mix — one cross-category session over the ENTIRE library, reshuffled on every
            entry. It used to pool only the cards FSRS said were due, which meant a caught-up
            student got a two-card "mix" (or no banner at all), and two sessions in a row dealt
            the same cards in the same stability-sorted order. Interleaving the whole library in
            a genuinely fresh order is the thing this surface is actually for; the per-deck Due
            filter is still there for anyone who wants the scheduled subset. */}
        {allCards.length>0&&(
          <motion.div whileHover={{y:-2}} style={{...glass({padding:16}),display:'flex',alignItems:'center',gap:16,flexWrap:'wrap',background:`linear-gradient(135deg,${C.amber}14,transparent)`,border:`1px solid ${C.amber}30`,cursor:'pointer'}}
            onClick={startSmartMix}>
            <div style={{width:44,height:44,borderRadius:12,flexShrink:0,background:C.amberDim,border:`1px solid ${C.amber}35`,display:'flex',alignItems:'center',justifyContent:'center'}}><Shuffle size={20} color={C.amberL}/></div>
            <div style={{flex:1,minWidth:200}}>
              <div style={{fontSize:15, letterSpacing: 'calc(-0.02px + var(--msp-letter-spacing))',fontWeight:800,color:C.t1,fontFamily:C.FD}}>Smart Mix</div>
              <div style={{fontSize:12,color:C.t2,marginTop:4}}>All {allCards.length} cards from all {builtinCount+customCount} decks, shuffled into a brand-new order every single time you start it{dueCards>0?` — the ${dueCards} due for review are in there too`:''}.</div>
            </div>
            <span style={{...btn(accentGrad(C.amber),{fontSize:12,padding:'8px 16px'}),display:'inline-flex',alignItems:'center',gap:4}}>Shuffle & Start<ChevronRight size={13}/></span>
          </motion.div>
        )}

        {/* Mastery by subject — retention % rolled up per DECK_CATEGORY_ORDER group instead of
            one blended library-wide number, so it's obvious which subject needs more review. */}
        {categoryMastery.length>1&&(
          <div style={glass({padding:16})}>
            <SectionTitle icon={Brain} color={C.amberL} extra={{marginBottom:12}}>Mastery by Subject</SectionTitle>
            <div style={G(2,10,{},isMobile)}>
              {categoryMastery.map(({cat,total,due,avgRet})=>{const dm=deckCatMeta(cat);return(
                <div key={cat} style={{...glass2({padding:'12px 12px',background:`linear-gradient(120deg,${dm.color}0c,transparent 55%)`,border:`1px solid ${dm.color}22`,borderLeft:`3px solid ${dm.color}66`})}}>
                  <div style={R({justifyContent:'space-between',marginBottom:4})}>
                    <span style={{fontSize:12,fontWeight:700,color:C.t1,fontFamily:C.FD}}>{dm.emoji} {cat}</span>
                    <span style={{fontSize:11,fontWeight:700,color:avgRet!==null?(avgRet>=80?C.greenL:avgRet>=50?C.amberL:C.roseL):C.t3,fontFamily:C.FM}}>{avgRet!==null?`${avgRet}%`:'—'}</span>
                  </div>
                  {avgRet!==null
                    ?<Bar pct={avgRet} color={avgRet>=80?C.green:avgRet>=50?C.amber:C.rose} h={5} glow/>
                    :<div style={{fontSize:10.5,color:C.t4}}>Not studied yet — {total} card{total===1?'':'s'} waiting</div>}
                  {avgRet!==null&&due>0&&<div style={{fontSize:10,color:dm.light,marginTop:4,fontWeight:600}}>{due} due now</div>}
                </div>
              );})}
            </div>
          </div>
        )}

        {/* Category / subsection pills — SAT > Math vs. SAT > Reading & Writing, Science >
            Biology/Chemistry/Physics, etc. — instead of one flat list of every deck. */}
        <div style={CC({gap:8})}>
          <div style={R({gap:4,flexWrap:'wrap'})}>
            <motion.button whileHover={{y:-1}} whileTap={{scale:.96}} style={btnSm(deckCategory==='all'?C.sunsetGrad:C.s4,{fontSize:11.5,fontWeight:700,color:deckCategory==='all'?'#fff':C.t2,border:`1px solid ${deckCategory==='all'?'transparent':C.b1}`,boxShadow:deckCategory==='all'?`0 4px 12px ${C.amber}30`:'none'})} onClick={()=>{setDeckCategory('all');setDeckSubcat('all');}}>All subjects</motion.button>
            {DECK_CATEGORY_ORDER.map(cat=>{
              const active=deckCategory===cat;
              const count=allDecksList.filter(d=>getDeckCategory(d.name,d.builtin).category===cat).length;
              if(!count)return null;
              const dm=deckCatMeta(cat);
              return <motion.button key={cat} whileHover={{y:-1}} whileTap={{scale:.96}} style={btnSm(active?dm.color:dm.dim,{fontSize:11.5,fontWeight:700,color:active?'#fff':dm.light,border:`1px solid ${active?dm.color:'transparent'}`,boxShadow:active?`0 4px 12px ${dm.color}40`:'none'})} onClick={()=>{setDeckCategory(cat);setDeckSubcat('all');}}>{dm.emoji} {cat}<span style={{opacity:.75,marginLeft:4,fontFamily:C.FM}}>{count}</span></motion.button>;
            })}
          </div>
          {deckCategory!=='all'&&subcatsForCategory.length>1&&(()=>{const dm=deckCatMeta(deckCategory);return(
            <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} style={R({gap:4,flexWrap:'wrap',paddingLeft:12,borderLeft:`2px solid ${dm.color}44`})}>
              <button style={btnSm(deckSubcat==='all'?`${dm.color}30`:'transparent',{fontSize:10.5,color:deckSubcat==='all'?dm.light:C.t3,border:`1px solid ${deckSubcat==='all'?`${dm.color}50`:C.b1}`})} onClick={()=>setDeckSubcat('all')}>All {deckCategory}</button>
              {subcatsForCategory.map(sub=>(
                <button key={sub} style={btnSm(deckSubcat===sub?`${dm.color}30`:'transparent',{fontSize:10.5,color:deckSubcat===sub?dm.light:C.t3,border:`1px solid ${deckSubcat===sub?`${dm.color}50`:C.b1}`})} onClick={()=>setDeckSubcat(sub)}>{sub}</button>
              ))}
            </motion.div>
          );})()}
        </div>

        <div style={R({flexWrap:'wrap',gap:8})}>
          <div style={{flex:1,minWidth:200,position:'relative'}}>
            <span style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:C.t3,display:'flex',pointerEvents:'none',transition:'color .2s'}}><Search size={14}/></span>
            <input
              style={inp({paddingLeft:36,paddingRight:dSrchLive?32:14,transition:'box-shadow .2s, border-color .2s'})}
              placeholder="Search decks or cards…"
              value={dSrchLive}
              onChange={e=>setDSrchLive(e.target.value)}
            />
            <AnimatePresence>
              {dSrchLive&&(
                <motion.button
                  initial={{opacity:0,scale:.6}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:.6}} transition={{duration:.12}}
                  style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',color:C.t3,cursor:'pointer',padding:4,borderRadius:4,display:'flex'}}
                  onClick={()=>{setDSrchLive('');setDS2('');}}
                  aria-label="Clear search"
                ><X size={14}/></motion.button>
              )}
            </AnimatePresence>
          </div>
          <div style={R({gap:4})}>
            {[['all','All'],['due','Due'],['builtin','Built-in'],['custom','My Decks']].map(([key,label])=>(
              <button key={key} style={btnSm(deckFilter===key?C.sunsetGrad:C.s4,{fontSize:11,color:deckFilter===key?'#fff':C.t2,border:`1px solid ${deckFilter===key?'transparent':C.b1}`,boxShadow:deckFilter===key?`0 4px 12px ${C.amber}30`:'none'})} onClick={()=>setDeckFilter(key)}>{label}</button>
            ))}
          </div>
        </div>

        {/* AI Generator — offline NLP extraction, then a Medabrain (Scout) polish pass */}
        <motion.div animate={gShake?{x:[0,-7,7,-5,5,-2,2,0]}:{x:0}} transition={{duration:.42}}
          style={{...glass({background:`linear-gradient(135deg,${C.violetDim},${C.fuchsiaDim} 60%,${C.pinkDim})`,border:`1px solid rgba(139,92,246,0.3)`,position:'relative',overflow:'hidden'})}}>
          <div style={{position:'absolute',inset:0,background:C.auroraGrad,opacity:0.05,pointerEvents:'none'}}/>
          <div style={{...R({marginBottom:12}),position:'relative'}}>
            <motion.div animate={gLoad?{rotate:360}:{rotate:0}} transition={gLoad?{duration:1.6,repeat:Infinity,ease:'linear'}:{duration:.3}}
              style={{width:36,height:36,borderRadius:8,background:C.violetGrad,border:`1px solid ${C.violet}30`,display:'flex',alignItems:'center',justifyContent:'center',boxShadow:`0 4px 12px ${C.violet}40`}}><Brain size={17} color="#fff"/></motion.div>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:700,color:C.t1,fontFamily:C.FD}}>Generate Deck From Notes</div>
              <div style={{fontSize:11,color:C.t2,marginTop:4}}>Offline extraction, sized to your notes, then a Medabrain (Scout) pass to tighten wording — no account needed</div>
            </div>
          </div>
          <div style={{...R({gap:8,marginBottom:12,justifyContent:'flex-end',flexWrap:'wrap'}),position:'relative'}}>
            <button disabled={gLoad} onClick={()=>setGenCountMode('auto')}
              style={{...btnSm(genCountMode==='auto'?C.violetGrad:'rgba(255,255,255,0.05)',{color:genCountMode==='auto'?'#fff':C.t2,border:`1px solid ${genCountMode==='auto'?'transparent':C.b1}`,fontSize:11,fontWeight:700}),display:'inline-flex',alignItems:'center',gap:4}}>
              <Wand2 size={11}/>Auto
            </button>
            <span style={{fontSize:10,color:C.t3}}>{genCountMode==='auto'?'sizes to your notes':'Cards'}</span>
            <input
              type="number" min={GEN_COUNT_MIN} max={GEN_COUNT_MAX} step={1}
              disabled={gLoad}
              style={inp({width:70,padding:'4px 8px',fontSize:11,opacity:gLoad?.6:genCountMode==='auto'?.45:1})}
              value={genCountInput}
              onFocus={()=>setGenCountMode('manual')}
              onChange={e=>{setGenCountMode('manual');setGenCountInput(e.target.value);}}
              onBlur={e=>commitGenCount(e.target.value)}
            />
          </div>
          <div style={{position:'relative',marginBottom:12}}>
            <textarea disabled={gLoad} style={{...inp({minHeight:80,resize:'vertical',fontFamily:C.FB,lineHeight: 1.55,opacity:gLoad?.6:1})}} placeholder="Paste your class notes, study guides, or any text here…" value={notes} onChange={e=>setNotes(e.target.value)}/>
            <div style={{position:'absolute',right:10,bottom:8,fontSize:9.5,color:C.t4,fontFamily:C.FM,pointerEvents:'none'}}>{notes.length>0?`${notes.trim().split(/\s+/).filter(Boolean).length} words`:''}</div>
          </div>
          <motion.button whileHover={gLoad?{}:{scale:1.02}} whileTap={gLoad?{}:{scale:.98}} style={{...btn(`linear-gradient(135deg,${C.violet},${C.fuchsia})`,{fontSize:12,boxShadow:`0 4px 16px ${C.violet}40`,minWidth:220,justifyContent:'center',position:'relative'}),display:'inline-flex',alignItems:'center',gap:8,cursor:gLoad?'wait':'pointer'}} onClick={genDeck} disabled={gLoad||!notes.trim()}>
            {gLoad?(
              <>
                <motion.span animate={{rotate:360}} transition={{duration:.9,repeat:Infinity,ease:'linear'}} style={{display:'flex'}}><RefreshCw size={14}/></motion.span>
                <AnimatePresence mode="wait">
                  <motion.span key={gStage} initial={{opacity:0,y:4}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-4}} transition={{duration:.18}}>
                    {GEN_STAGES[gStage]}
                  </motion.span>
                </AnimatePresence>
              </>
            ):(<><Sparkles size={14}/>{genCountMode==='auto'?'Generate Flashcards (Auto)':`Generate ${genCount} Flashcards`}</>)}
          </motion.button>
          {!gLoad&&genPolishNote&&(
            <motion.div initial={{opacity:0,y:4}} animate={{opacity:1,y:0}} style={{position:'relative',marginTop:12,display:'flex',alignItems:'flex-start',gap:8,padding:'8px 12px',borderRadius:8,background:C.violetDim,border:`1px solid ${C.violet}25`}}>
              <Brain size={13} color={C.violetL} style={{flexShrink:0,marginTop:4}}/>
              <span style={{fontSize:11,color:C.t2,lineHeight:1.5}}><strong style={{color:C.violetL}}>Medabrain: </strong>{genPolishNote}</span>
            </motion.div>
          )}
          <AnimatePresence>
            {gLoad&&(
              <motion.div initial={{scaleX:0}} animate={{scaleX:1}} exit={{opacity:0}} transition={{duration:GEN_STAGES.length*0.55,ease:'linear'}}
                style={{position:'absolute',left:0,bottom:0,height:2,width:'100%',transformOrigin:'left',background:`linear-gradient(90deg,${C.violet},${C.fuchsia})`}}/>
            )}
          </AnimatePresence>
        </motion.div>

        <div style={G(3,12,{},isMobile)}>
          {filteredDecks.map((deck,i)=>{
            const dc=getDueCards(deck.cards).length;
            const deckRet=(()=>{const rets=deck.cards.map(c=>getRetainability(c)).filter(r=>r!==null);return rets.length?Math.round(rets.reduce((s,r)=>s+r,0)/rets.length):null;})();
            const isNewest=!deck.builtin&&deck.name===newestDeckName;
            const info=getDeckCategory(deck.name,deck.builtin);const dm=deckCatMeta(info.category);
            const onPlan=todayPlanTargets.deckNames.has(deck.name);
            return(
              <motion.div key={deck.name} initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{duration:.22,delay:Math.min(i,10)*0.025}}
                whileHover={{y:-2,borderColor:`${dm.color}40`,boxShadow:`0 8px 32px rgba(0,0,0,0.5),0 0 0 1px ${dm.color}25`}} style={{...glass({padding:20,cursor:'pointer',transition:'border-color .2s',position:'relative',borderLeft:`3px solid ${onPlan?C.violet:dm.color}55`}),background:`linear-gradient(120deg,${dm.color}0a,transparent 45%)`}}>
                <div onClick={()=>{setAD(deck);setCIdx(0);setFlip(false);setStudyMode(dc>0?'due':'all');setSessionStats({reviewed:0,again:0,hard:0,good:0,easy:0,startedAt:Date.now(),streak:0,bestStreak:0,xp:0});}}>
                  <div style={R({gap:8,marginBottom:12})}>
                    <div style={{width:36,height:36,borderRadius:8,background:`${dm.color}16`,border:`1px solid ${dm.color}30`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Layers3 size={17} color={dm.light}/></div>
                    <span style={{...pill(dm.dim,dm.light,{fontSize:9.5,fontWeight:700})}}>{dm.emoji} {info.subcategory!=='General'&&info.subcategory!==info.category?info.subcategory:info.category}</span>
                  </div>
                  <div style={{fontSize:13,fontWeight:700,color:C.t1,marginBottom:4,lineHeight:1.35,fontFamily:C.FD}}>{deck.name}</div>
                  <div style={{fontSize:11,color:C.t3,fontFamily:C.FM}}>{deck.cards.length} cards{deckRet!==null?` · ${deckRet}% retention`:''}</div>
                  {deckRet!==null&&<div style={{marginTop:8}}><Bar pct={deckRet} color={deckRet>=80?C.green:deckRet>=50?C.amber:C.rose} h={3}/></div>}
                  <div style={R({gap:4,marginTop:8,flexWrap:'wrap'})}>
                    {onPlan&&<div style={{...pill(C.violetDim,C.violetL,{fontSize:10,fontWeight:700})}}><CalendarClock size={9} style={{marginRight:4,verticalAlign:-1}}/>Today's plan</div>}
                    {isNewest&&<div style={{...pill(C.greenDim,C.greenL,{fontSize:10,fontWeight:700})}}>New</div>}
                    {dc>0&&<div style={{...pill(C.amberDim,C.amberL,{fontSize:10,fontFamily:C.FM,fontWeight:700})}}>{dc} due now</div>}
                    {!deck.builtin&&<div style={{...pill(C.violetDim,C.violetL,{fontSize:10})}}>My deck</div>}
                  </div>
                </div>
                {!deck.builtin&&(
                  <button style={{position:'absolute',top:14,right:14,background:'none',border:'none',color:C.t3,cursor:'pointer',padding:4,borderRadius:4}} onClick={e=>{e.stopPropagation();setManageDeck(deck.name);}} aria-label="Manage cards" title="Manage cards"><ScrollText size={13}/></button>
                )}
              </motion.div>
            );
          })}
        </div>
        {filteredDecks.length===0&&<div style={{textAlign:'center',color:C.t3,padding:60}}>No decks match this filter.</div>}

        <AnimatePresence>
          {manageDeck&&<CardManagerModal
            deckName={manageDeck}
            cards={cDecks[manageDeck]||[]}
            onAdd={(f,b)=>addCardToDeck(manageDeck,f,b)}
            onUpdate={(idx,f,b)=>updateCardInDeck(manageDeck,idx,f,b)}
            onDelete={idx=>deleteCardFromDeck(manageDeck,idx)}
            onClose={()=>setManageDeck(null)}
            m={isMobile}
          />}
          {newDeckOpen&&<NewDeckModal
            onCreate={async(name)=>{await createDeck(name);setNewDeckOpen(false);setManageDeck(name);toast.success(`"${name}" created — add your first cards`);}}
            onClose={()=>setNewDeckOpen(false)}
            m={isMobile}
          />}
        </AnimatePresence>
      </div>
    );
  }

  // ── E-LIBRARY ─────────────────────────────────────────────────────────────────
  function tLib(){
    // Rendered rows, not results. `ytWindow.total`/`regWindow.total` are the real
    // counts and are what the section headers report — a student filtering down to
    // "12 videos" must still be told there are 12, whether 12 or 24 are in the DOM.
    const yt=ytWindow.visible;const reg=regWindow.visible;
    const tc={Article:C.blue,Book:C.amber,Course:C.violet,App:C.green,Community:'#ec4899',Podcast:C.cyan};

    // Tracking actions
    function toggleBookmark(title) {
      if (!user) return;
      const bms = user.bookmarks || [];
      const updated = bms.includes(title) ? bms.filter(t => t !== title) : [...bms, title];
      saveUser({ ...user, bookmarks: updated });
      if (bms.includes(title)) {
        toast.success(`Removed "${title}" from saved resources`);
      } else {
        toast.success(`Saved "${title}" to library`, { icon: '⭐' });
      }
    }

    function toggleStudied(title) {
      if (!user) return;
      const studied = user.studied || [];
      const isDone = studied.includes(title);
      let updated;
      if (isDone) {
        updated = studied.filter(t => t !== title);
        saveUser({ ...user, studied: updated });
        toast.success(`Marked "${title}" as in progress`);
      } else {
        updated = [...studied, title];
        const xpGain = 15;
        const newXp = (user.xp || 0) + xpGain;
        saveUser({ ...user, xp: newXp, studied: updated });
        toast.success(`Completed! +15 XP earned`, { icon: '🎉' });
      }
    }

    function exportAllNotes() {
      if (!user?.resourceNotes) {
        toast.error("No study notes found to export.");
        return;
      }
      const noteKeys = Object.keys(user.resourceNotes).filter(k => user.resourceNotes[k]?.trim());
      if (noteKeys.length === 0) {
        toast.error("No study notes found to export.");
        return;
      }

      let md = `# MedSchoolPrep — My Study Notes Library\n`;
      md += `Generated on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}\n`;
      md += `Pre-Med Student: ${user.name || 'Aspiring Physician'}\n`;
      md += `Active Pathway: ${curPath?.label || 'General Pre-Health'}\n`;
      md += `Total Notes Logged: ${noteKeys.length} resources\n`;
      md += `========================================================================\n\n`;

      // Group by category
      const notesByCat = {};
      ELIB.forEach(r => {
        const note = user.resourceNotes[r.title];
        if (note && note.trim()) {
          if (!notesByCat[r.cat]) notesByCat[r.cat] = [];
          notesByCat[r.cat].push({ r, note });
        }
      });

      Object.keys(notesByCat).sort().forEach(cat => {
        md += `📂 CATEGORY: ${cat.toUpperCase()}\n`;
        md += `------------------------------------------------------------------------\n\n`;
        notesByCat[cat].forEach(({ r, note }) => {
          md += `### 📄 ${r.title}\n`;
          md += `- **Type**: ${r.type} (${r.difficulty})\n`;
          md += `- **Resource Link**: ${r.url}\n`;
          md += `- **Quick Description**: ${r.desc}\n\n`;
          md += `📝 **My Study Notes & Key Takeaways**:\n`;
          md += `${note.trim()}\n\n`;
          md += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        });
      });

      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${(user.name || 'my').toLowerCase().replace(/\s+/g, '-')}-study-notes.md`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Successfully exported study notes to Markdown file!", { icon: '📝' });
    }

    const savedCount = (user?.bookmarks || []).length;
    const completedCount = (user?.studied || []).length;
    const notesCount = Object.keys(user?.resourceNotes || {}).filter(k => user.resourceNotes[k]?.trim()).length;
    const pct = Math.round((completedCount / ELIB.length) * 100) || 0;

    return(
      <div style={CC({gap:20})}>
        {/* Progress Tracker Card Header */}
        <div data-tour="prep-deep-library" style={{...glass({padding:20, background: `linear-gradient(120deg, ${C.blueDim}, ${C.violetDim} 45%, ${C.pinkDim})`, border: `1px solid ${C.violet}22`, position:'relative', overflow:'hidden'}), display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap'}}>
          <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:C.auroraGrad}}/>
          <div style={{position:'absolute',inset:0,background:C.auroraGrad,opacity:0.06,pointerEvents:'none'}}/>
          <div style={{position: 'relative', width: 64, height: 64, borderRadius: '50%', background: C.auroraGrad, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow:`0 6px 20px ${C.violet}40`}}>
            <BookOpen size={24} color="#fff" />
            {pct > 0 && <span style={{position: 'absolute', bottom: -4, right: -4, ...pill(C.green, '#fff', {fontSize: 9, padding: '4px 4px', borderRadius: 4})}}>{pct}%</span>}
          </div>
          <div style={{flex: 1, minWidth: 200}}>
            <div style={{fontSize: 10, fontWeight: 700, color: C.t3, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))'}}>My Study Journey</div>
            <div style={{fontSize: 18, fontWeight: 800, color: C.t1, fontFamily: C.FD, marginTop: 4}}>E-Library Workspace</div>
            {/* Progress Bar */}
            <div style={{marginTop: 8, width: '100%', height: 6, borderRadius: 4, background: C.s4, overflow: 'hidden', position: 'relative'}}>
              <motion.div initial={{width: 0}} animate={{width: `${pct}%`}} transition={{duration: 0.6}} style={{position: 'absolute', left: 0, top: 0, height: '100%', background: C.auroraGrad, boxShadow: `0 0 10px ${C.violet}60`}} />
            </div>
          </div>
          <div style={{display: 'flex', gap: 16, flexWrap: 'wrap'}}>
            <div style={{textAlign: 'center', minWidth: 70}}>
              <div style={{fontSize: 18, fontWeight: 800, fontFamily: C.FM, color: C.t1}}>{ELIB.length}</div>
              <div style={{fontSize: 9, color: C.t3, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', marginTop: 4}}>Total</div>
            </div>
            <div style={{textAlign: 'center', minWidth: 70}}>
              <div style={{fontSize: 18, fontWeight: 800, fontFamily: C.FM, color: C.amberL}}>{savedCount}</div>
              <div style={{fontSize: 9, color: C.t3, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', marginTop: 4}}>Saved</div>
            </div>
            <div style={{textAlign: 'center', minWidth: 70}}>
              <div style={{fontSize: 18, fontWeight: 800, fontFamily: C.FM, color: C.greenL}}>{completedCount}</div>
              <div style={{fontSize: 9, color: C.t3, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', marginTop: 4}}>Studied</div>
            </div>
          </div>
        </div>

        {/* E-Library Inner Sub-Tabs */}
        <div style={R({borderBottom: `1px solid ${C.b1}`, paddingBottom: 8, gap: 8, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center'})}>
          <div style={R({gap: 8, flexWrap: 'wrap'})}>
            {[
              { id: 'all', label: 'All resources', icon: BookOpen, color: C.blue, light: C.blueL, dim: C.blueDim },
              { id: 'saved', label: `My saved (${savedCount})`, icon: Bookmark, color: C.amber, light: C.amberL, dim: C.amberDim },
              { id: 'completed', label: `Completed (${completedCount})`, icon: BadgeCheck, color: C.green, light: C.greenL, dim: C.greenDim },
              { id: 'notes', label: `My notes (${notesCount})`, icon: ScrollText, color: C.violet, light: C.violetL, dim: C.violetDim }
            ].map(tab => {
              const Icon = tab.icon;
              const active = lSubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setLSubTab(tab.id)}
                  style={{
                    ...btnSm(active ? tab.dim : 'transparent', {
                      color: active ? tab.light : C.t2,
                      border: active ? `1px solid ${tab.color}35` : '1px solid transparent',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '8px 16px',
                      fontSize: 12,
                      fontWeight: 600,
                      borderRadius: 8,
                      boxShadow: active ? `0 3px 10px ${tab.color}22` : 'none'
                    })
                  }}
                >
                  <Icon size={14} color={active ? tab.light : undefined} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {notesCount > 0 && (
            <button
              onClick={exportAllNotes}
              style={{
                ...btnSm(C.violetDim, {
                  color: C.violetL,
                  borderColor: `${C.violet}40`,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '8px 16px',
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 8
                })
              }}
              title="Download all your custom notes as a beautifully formatted Markdown file"
            >
              <FileDown size={14} />
              Export Notes (.md)
            </button>
          )}
        </div>

        {/* Row 1 Filter: Search and Category */}
        <div style={R({flexWrap:'wrap',gap:8})}>
          <div style={{flex:1,minWidth:200,position:'relative'}}>
            <span style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:C.t3,display:'flex',pointerEvents:'none'}}><Search size={14}/></span>
            <input style={inp({paddingLeft:36})} placeholder="Search videos, books, courses…" value={lSrch} onChange={e=>setLS(e.target.value)}/>
          </div>
          <select style={inp({width:'auto'})} value={lCat} onChange={e=>setLC(e.target.value)}>{LIB_CATS.map(c=><option key={c}>{c}</option>)}</select>
        </div>

        {/* Colorful category quick-filter chips */}
        <div style={R({gap:8,flexWrap:'wrap'})}>
          {LIB_CATS.map(c=>{
            const active=lCat===c;
            const cm=c==='All'?{color:C.blue,light:C.blueL,dim:C.blueDim,emoji:'✨'}:catMeta(c);
            return(
              <motion.button key={c} whileHover={{scale:1.05,y:-1}} whileTap={{scale:.96}} onClick={()=>setLC(c)}
                style={{...pill(active?cm.color:cm.dim, active?'#fff':cm.light, {fontSize:11,padding:'4px 12px',cursor:'pointer',border:`1px solid ${active?cm.color:'transparent'}`,boxShadow:active?`0 4px 14px ${cm.color}45`:'none',fontWeight:700})}}>
                {cm.emoji} {c==='Behavioral & Social Sciences'?'Behavioral Sci.':c}
              </motion.button>
            );
          })}
        </div>

        {/* Row 2 Filter: Resource Type, Cost, Sort Order */}
        <div style={R({flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', borderTop: `1px solid ${C.b0}`, paddingTop: 8})}>
          <div style={R({flexWrap: 'wrap', gap: 8})}>
            {/* Type filter */}
            <select style={inp({width: 'auto', padding: '4px 12px', fontSize: 11})} value={lType} onChange={e => setLType(e.target.value)}>
              <option value="All">All types</option>
              <option value="YouTube">YouTube videos</option>
              <option value="Article">Articles & guides</option>
              <option value="Book">Books</option>
              <option value="Course">Courses</option>
              <option value="App">Apps & tools</option>
              <option value="Podcast">Podcasts</option>
              <option value="Community">Communities</option>
            </select>

            {/* Prep Level / Difficulty filter */}
            <select style={inp({width: 'auto', padding: '4px 12px', fontSize: 11})} value={lDiff} onChange={e => setLDiff(e.target.value)}>
              <option value="All">All prep levels</option>
              <option value="Introductory">Introductory</option>
              <option value="AP / Intermediate">AP / intermediate</option>
              <option value="Undergrad / Advanced">Undergrad / advanced</option>
            </select>

            {/* Cost filter */}
            <select style={inp({width: 'auto', padding: '4px 12px', fontSize: 11})} value={lFreeOnly ? 'free' : 'all'} onChange={e => setLFreeOnly(e.target.value === 'free')}>
              <option value="all">All budgets</option>
              <option value="free">Free resources only</option>
            </select>

            {/* Sort order */}
            <select style={inp({width: 'auto', padding: '4px 12px', fontSize: 11})} value={lSort} onChange={e => setLSort(e.target.value)}>
              <option value="default">Sort: recommended</option>
              <option value="alpha">Sort: alphabetical (A-Z)</option>
              <option value="alpha-desc">Sort: alphabetical (Z-A)</option>
            </select>
          </div>

          {(lSrch || lCat !== 'All' || lType !== 'All' || lDiff !== 'All' || lFreeOnly || lSort !== 'default' || lSubTab !== 'all') && (
            <button
              onClick={() => {
                setLS('');
                setLC('All');
                setLType('All');
                setLDiff('All');
                setLFreeOnly(false);
                setLSort('default');
                setLSubTab('all');
              }}
              style={btnSm('transparent', {color: C.roseL, borderColor: `${C.rose}40`, fontSize: 11})}
            >
              Clear all filters
            </button>
          )}
        </div>

        {/* Dynamic Coaching Tip Banner */}
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          key={lCat}
          style={{
            ...glass({
              padding: '12px 16px',
              background: `linear-gradient(135deg, ${(lCat==='All'?{dim:C.blueDim}:catMeta(lCat)).dim}, transparent)`,
              border: `1px dashed ${(lCat==='All'?{color:C.blue}:catMeta(lCat)).color}40`
            }),
            display: 'flex',
            alignItems: 'center',
            gap: 12
          }}
        >
          <div style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: (lCat==='All'?{grad:C.auroraGrad}:catMeta(lCat)).grad,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow:`0 4px 12px ${(lCat==='All'?{color:C.blue}:catMeta(lCat)).color}40`
          }}>
            <Lightbulb size={16} color="#fff" />
          </div>
          <div>
            <div style={{fontSize: 10, fontWeight: 700, color: (lCat==='All'?{light:C.blueL}:catMeta(lCat)).light, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))'}}>Medabrain Coaching Insight</div>
            <div style={{fontSize: 12, color: C.t2, lineHeight: 1.5, marginTop: 4}}>
              {
                lCat === 'Life Sciences' ? "In Life Sciences, focus on active recall. Rather than re-reading chapters, use our Flashcards workspace or sketch pathways from memory. Use BioMan Biology or HHMI for interactive visual reinforcement." :
                lCat === 'Physical Sciences' ? "In Physical Sciences, problem-solving is king. After reading about laws or formulas, work through practice problems from MIT OCW or watch walkthroughs by The Organic Chemistry Tutor." :
                lCat === 'Behavioral & Social Sciences' ? "Behavioral sciences connect biology to society. Many medical colleges seek candidates with deep cultural competence. Yale's Science of Well-Being is a fantastic, stress-busting primer." :
                lCat === 'Research Methods' ? "Clinical and basic science research is a major pre-med differentiator. Explore Science Journal for Kids or the NIH archive to learn how real scientific hypotheses are formulated and tested." :
                lCat === 'Admissions & Planning' ? "Medical school admissions committee members look for holistic preparation. Study the AAMC Core Competencies to see how your activities, clinical hours, and volunteering align with entering student expectations." :
                lCat === 'Clinical Exposure' ? "Real exposure beats reading about medicine. Use MedlinePlus and the professional-association sites here to understand a field, then turn that into shadowing, volunteering, or a CPR certification you can actually log." :
                lCat === 'Wellness & Balance' ? "The best students protect their sleep, focus, and mental health on purpose. Try one study-skills technique (like the Pomodoro timer or spaced repetition) and one wellbeing habit this week — burnout helps no one." :
                lCat === 'Math & Data' ? "Math rewards reps, not cramming. Pair a concept video (Khan Academy, 3Blue1Brown) with 10-15 practice problems, and lean on Desmos or Wolfram Alpha to check your reasoning — not to skip it." :
                "Welcome to your resource library! High-achieving pre-health students build strong habits early. Try bookmarking 3-4 key resources and setting a personal weekly goal to study at least one."
              }
            </div>
          </div>
        </motion.div>

        {/* Video Resources Section */}
        {ytWindow.total>0&&<div>
          <SectionTitle icon={Play} color={C.redL}>Video Resources ({ytWindow.total})</SectionTitle>
          <div style={G(2,14,{},isMobile)}>
            {yt.map((r,i)=>{
              const hasNotes = !!user?.resourceNotes?.[r.title];
              return (
              <motion.div key={i} whileHover={{y:-2,boxShadow:`0 12px 40px rgba(0,0,0,0.6),0 0 0 1px ${catMeta(r.cat).color}25`}} style={glass({padding:0,overflow:'hidden',position:'relative',borderLeft:`3px solid ${catMeta(r.cat).color}55`})}>
                {/* Floating Bookmark Star Button */}
                <button
                  onClick={(e) => { e.stopPropagation(); toggleBookmark(r.title); }}
                  style={{
                    position: 'absolute',
                    top: 10,
                    left: 10,
                    zIndex: 10,
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: 'rgba(4,6,11,0.7)',
                    border: '1.5px solid rgba(255,255,255,0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: user?.bookmarks?.includes(r.title) ? C.amberL : '#fff',
                    transition: CONTROL_TRANSITION
                  }}
                  aria-label={user?.bookmarks?.includes(r.title) ? "Unsave resource" : "Save resource"} title={user?.bookmarks?.includes(r.title) ? "Unsave resource" : "Save resource"}
                >
                  <Star size={14} fill={user?.bookmarks?.includes(r.title) ? "currentColor" : "none"} />
                </button>

                <div style={{position:'relative',paddingBottom:'52%',background:C.s2,overflow:'hidden',cursor:'pointer'}} onClick={()=>setVM({ytId:r.ytId,title:r.title,url:r.url})}>
                  <img src={`https://img.youtube.com/vi/${r.ytId}/mqdefault.jpg`} alt={r.title} loading="lazy" style={{position:'absolute',top:0,left:0,width:'100%',height:'100%',objectFit:'cover',transition:'transform .4s'}} onError={e=>{e.target.style.display='none';}} onMouseEnter={e=>e.target.style.transform='scale(1.05)'} onMouseLeave={e=>e.target.style.transform='scale(1)'}/>
                  <div style={{position:'absolute',inset:0,background:'linear-gradient(to top,rgba(4,6,11,0.85) 0%,transparent 55%)'}}/>
                  <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
                    <motion.div whileHover={{scale:1.12,background:'rgba(255,255,255,0.22)'}} style={{width:52,height:52,borderRadius:'50%',background:'rgba(255,255,255,0.12)',backdropFilter:'blur(8px)',display:'flex',alignItems:'center',justifyContent:'center',border:'1.5px solid rgba(255,255,255,0.25)'}}><Play size={20} color="white" fill="white"/></motion.div>
                  </div>
                  <span style={pill('rgba(239,68,68,0.85)','white',{position:'absolute',top:10,right:10,fontSize:10,borderRadius:4})}>YouTube</span>
                </div>
                <div style={{padding:'12px 16px'}}>
                  <div style={R({gap: 4, flexWrap: 'wrap', alignItems: 'center', marginBottom: 4})}>
                    <div style={{fontSize:13,fontWeight:700,color:C.t1,lineHeight:1.4,fontFamily:C.FD}}>{r.title}</div>
                    {todayPlanTargets.articleTitles.has(r.title) && <span style={pill(C.violetDim, C.violetL, {fontSize: 9, fontWeight:700, display: 'inline-flex', alignItems: 'center', gap: 4})}><CalendarClock size={10}/>Today's plan</span>}
                    {hasNotes && <span style={pill(C.violetDim, C.violetL, {fontSize: 9, display: 'inline-flex', alignItems: 'center', gap: 4})}><ScrollText size={10}/>Has Notes</span>}
                  </div>
                  <div style={{fontSize:11,color:C.t3,lineHeight:1.55,marginBottom:12}}>{r.desc}</div>
                  <div style={R({justifyContent:'space-between', flexWrap: 'wrap', gap: 8})}>
                    <div style={R({gap:4})}>
                      <span style={pill(catMeta(r.cat).dim,catMeta(r.cat).light,{fontSize:10})}>{catMeta(r.cat).emoji} {r.cat}</span>
                      <span style={pill('rgba(255,255,255,0.06)',C.t3,{fontSize:10})}>{r.difficulty}</span>
                    </div>
                    <div style={R({gap:8})}>
                      {/* Studied checkbox / check pill */}
                      <button
                        onClick={() => toggleStudied(r.title)}
                        style={{
                          ...btnSm(user?.studied?.includes(r.title) ? `${C.green}18` : 'transparent', {
                            color: user?.studied?.includes(r.title) ? C.greenL : C.t3,
                            borderColor: user?.studied?.includes(r.title) ? `${C.green}40` : `${C.b2}`,
                            fontSize: 10,
                            padding: '4px 8px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4
                          })
                        }}
                      >
                        <BadgeCheck size={11} fill={user?.studied?.includes(r.title) ? "currentColor" : "none"} />
                        {user?.studied?.includes(r.title) ? 'Studied' : 'Mark Studied'}
                      </button>

                      {/* Notes Toggle Button */}
                      <button
                        onClick={() => setOpenNotes(prev => ({ ...prev, [r.title]: !prev[r.title] }))}
                        style={{
                          ...btnSm(openNotes[r.title] ? C.violetDim : 'transparent', {
                            color: openNotes[r.title] ? C.violetL : C.t3,
                            borderColor: openNotes[r.title] ? `${C.violet}40` : `${C.b2}`,
                            fontSize: 10,
                            padding: '4px 8px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4
                          })
                        }}
                      >
                        <ScrollText size={11} />
                        {openNotes[r.title] ? 'Hide Notes' : 'Notes'}
                      </button>

                      <button style={{...btnSm('rgba(239,68,68,0.15)',{color:'#f87171',border:'1px solid rgba(239,68,68,0.3)',fontSize:11}),display:'inline-flex',alignItems:'center',gap:4}} onClick={()=>setVM({ytId:r.ytId,title:r.title,url:r.url})}><Play size={11} fill="currentColor"/>Watch</button>
                    </div>
                  </div>
                  {openNotes[r.title] && (
                    <div style={{
                      marginTop: 12,
                      paddingTop: 12,
                      borderTop: `1px dashed ${C.b1}`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8
                    }}>
                      <div style={lbl({marginBottom:0})}>My Personal Study Notes</div>
                      <textarea
                        style={inp({
                          minHeight: 80,
                          resize: 'vertical',
                          fontSize: 12,
                          lineHeight: 1.5,
                          background: 'rgba(255,255,255,0.02)',
                          fontFamily: C.FB
                        })}
                        placeholder="Write your key takeaways, formulas, or concepts from this resource here..."
                        value={user?.resourceNotes?.[r.title] || ''}
                        onChange={e => {
                          const notesVal = e.target.value;
                          const nextNotes = { ...(user.resourceNotes || {}), [r.title]: notesVal };
                          saveUser({ ...user, resourceNotes: nextNotes });
                        }}
                      />
                      <div style={{fontSize: 10, color: C.t3, textAlign: 'right'}}>Auto-saved to your study profile</div>
                    </div>
                  )}
                </div>
              </motion.div>
            )})}
          </div>
          <MoreRows win={ytWindow} label="videos"/>
        </div>}

        {/* Text/Interactive Resources Section */}
        {regWindow.total>0&&<div>
          {ytWindow.total>0&&<SectionTitle icon={BookOpen} color={C.pinkL}>Articles, Books &amp; Courses ({regWindow.total})</SectionTitle>}
          <div style={G(2,12,{},isMobile)}>
            {reg.map((r,i)=>{
              const col=tc[r.type]||C.t2;
              const isSaved = user?.bookmarks?.includes(r.title);
              const isStudied = user?.studied?.includes(r.title);
              const hasNotes = !!user?.resourceNotes?.[r.title];
              const cm=catMeta(r.cat);
              return(
                <motion.div key={i} whileHover={{y:-2,borderColor:`${cm.color}45`,boxShadow:`0 10px 30px ${cm.color}18`}} style={glass({padding:16,transition: CONTROL_TRANSITION,position:'relative',borderLeft:`3px solid ${cm.color}`,overflow:'hidden'})}>
                  <div style={{position:'absolute',top:0,right:0,width:120,height:120,background:`radial-gradient(circle at top right, ${cm.dim}, transparent 70%)`,pointerEvents:'none'}}/>
                  <div style={R({justifyContent:'space-between',marginBottom:12,position:'relative'})}>
                    <span style={pill(`${col}18`,col,{fontSize:10})}>{r.type}</span>
                    <div style={R({gap:4})}>
                      {r.free?<span style={pill(C.greenDim,C.greenL,{fontSize:10})}>FREE</span>:<span style={pill(C.amberDim,C.amberL,{fontSize:10})}>Paid</span>}
                      <span style={pill(cm.dim,cm.light,{fontSize:10})}>{cm.emoji} {r.cat}</span>
                      <span style={pill('rgba(255,255,255,0.06)',C.t3,{fontSize:10})}>{r.difficulty}</span>

                      {/* Floating save bookmark */}
                      <button
                        onClick={() => toggleBookmark(r.title)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 4,
                          cursor: 'pointer',
                          color: isSaved ? C.amberL : C.t3,
                          transition: 'color 0.15s',
                          marginLeft: 4,
                          display: 'inline-flex',
                          alignItems: 'center'
                        }}
                        aria-label={isSaved ? "Unsave resource" : "Save resource"} title={isSaved ? "Unsave resource" : "Save resource"}
                      >
                        <Star size={14} fill={isSaved ? "currentColor" : "none"} />
                      </button>
                    </div>
                  </div>
                  <div style={R({gap: 4, flexWrap: 'wrap', alignItems: 'center', marginBottom: 4})}>
                    <div style={{fontSize:14,fontWeight:700,color:C.t1,fontFamily:C.FD}}>{r.title}</div>
                    {todayPlanTargets.articleTitles.has(r.title) && <span style={pill(C.violetDim, C.violetL, {fontSize: 9, fontWeight:700, display: 'inline-flex', alignItems: 'center', gap: 4})}><CalendarClock size={10}/>Today's plan</span>}
                    {hasNotes && <span style={pill(C.violetDim, C.violetL, {fontSize: 9, display: 'inline-flex', alignItems: 'center', gap: 4})}><ScrollText size={10}/>Has Notes</span>}
                  </div>
                  <div style={{fontSize:12,color:C.t2,lineHeight:1.65,marginBottom:12}}>{r.desc}</div>
                  <div style={R({justifyContent:'space-between', flexWrap: 'wrap', gap: 8})}>
                    <a href={r.url} target="_blank" rel="noreferrer" style={{...btnSm(C.blueDim,{color:C.blueL,border:`1px solid ${C.blue}30`,textDecoration:'none',fontSize:11}),display:'inline-flex',alignItems:'center',gap:4}}>Open<ExternalLink size={11}/></a>

                    <div style={R({gap:8})}>
                      {/* Studied checkbox / check pill */}
                      <button
                        onClick={() => toggleStudied(r.title)}
                        style={{
                          ...btnSm(isStudied ? `${C.green}18` : 'transparent', {
                            color: isStudied ? C.greenL : C.t3,
                            borderColor: isStudied ? `${C.green}40` : `${C.b2}`,
                            fontSize: 10,
                            padding: '4px 8px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4
                          })
                        }}
                      >
                        <BadgeCheck size={11} fill={isStudied ? "currentColor" : "none"} />
                        {isStudied ? 'Studied' : 'Mark Studied'}
                      </button>

                      {/* Notes Toggle Button */}
                      <button
                        onClick={() => setOpenNotes(prev => ({ ...prev, [r.title]: !prev[r.title] }))}
                        style={{
                          ...btnSm(openNotes[r.title] ? C.violetDim : 'transparent', {
                            color: openNotes[r.title] ? C.violetL : C.t3,
                            borderColor: openNotes[r.title] ? `${C.violet}40` : `${C.b2}`,
                            fontSize: 10,
                            padding: '4px 8px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4
                          })
                        }}
                      >
                        <ScrollText size={11} />
                        {openNotes[r.title] ? 'Hide Notes' : 'Notes'}
                      </button>
                    </div>
                  </div>
                  {openNotes[r.title] && (
                    <div style={{
                      marginTop: 12,
                      paddingTop: 12,
                      borderTop: `1px dashed ${C.b1}`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8
                    }}>
                      <div style={lbl({marginBottom:0})}>My Personal Study Notes</div>
                      <textarea
                        style={inp({
                          minHeight: 80,
                          resize: 'vertical',
                          fontSize: 12,
                          lineHeight: 1.5,
                          background: 'rgba(255,255,255,0.02)',
                          fontFamily: C.FB
                        })}
                        placeholder="Write your key takeaways, formulas, or concepts from this resource here..."
                        value={user?.resourceNotes?.[r.title] || ''}
                        onChange={e => {
                          const notesVal = e.target.value;
                          const nextNotes = { ...(user.resourceNotes || {}), [r.title]: notesVal };
                          saveUser({ ...user, resourceNotes: nextNotes });
                        }}
                      />
                      <div style={{fontSize: 10, color: C.t3, textAlign: 'right'}}>Auto-saved to your study profile</div>
                    </div>
                  )}
                </motion.div>
              );})}
          </div>
          <MoreRows win={regWindow} label="resources"/>
        </div>}
        {fLib.length===0&& (
          lSubTab === 'notes' ? (
            <EmptyState
              icon={ScrollText}
              accent={C.violet}
              title="No study notes yet"
              body="Hit 'Notes' on any resource card to start one."
              actionLabel="Browse all resources"
              onAction={() => setLSubTab('all')}
            />
          ) : (
            <EmptyState
              icon={BookOpen}
              accent={accent}
              kind="filtered"
              title="No resources match those filters"
              body="Try a different search term or category filter."
              actionLabel="Clear filters"
              onAction={()=>{setLS('');setLC('All');setLType('All');setLDiff('All');setLFreeOnly(false);setLSort('default');setLSubTab('all');}}
            />
          )
        )}
      </div>
    );
  }
  // ── PORTFOLIO ─────────────────────────────────────────────────────────────────
  function tPort(){
    // Portfolio's activities/awards/GPA history live in Supabase, not the local-first
    // Dexie store everything else on this tab reads from — so unlike every other tab,
    // the very first visit each session has a real network round trip to wait on. Until
    // it lands, show a clear loading state instead of the panel's real layout starting
    // life full of misleading zeros (0 activities, 0 awards, 0% strength) that then pop
    // to their real values a moment later.
    if(!portLoaded){
      return(
        <div style={{...glass({padding:40})}}>
          <BrandLoader
            size={186} minHeight={360}
            caption="Loading your Portfolio…"
            sub="Pulling in your activities, awards, and GPA history."
          />
        </div>
      );
    }
    const accent=portfolioAccent; // shadows the pathway accent — Portfolio has its own fixed color identity
    const annualH=a=>(parseFloat(a.hours_per_week)||0)*(parseFloat(a.weeks_per_year)||0);
    const totH=Math.round(portActivities.reduce((s,a)=>s+annualH(a),0));
    const leadH=Math.round(portActivities.filter(a=>a.activity_type==='Leadership').reduce((s,a)=>s+annualH(a),0));
    const resH=Math.round(portActivities.filter(a=>a.activity_type==='Research').reduce((s,a)=>s+annualH(a),0));
    const volH=Math.round(portActivities.filter(a=>a.activity_type==='Volunteering').reduce((s,a)=>s+annualH(a),0));
    const actColors={'Clinical/Shadowing':accent,'Patient Care (paid)':C.rose,'Health Club/HOSA':C.cyan,Leadership:C.blue,Volunteering:C.violet,Research:C.amber,Athletics:C.green,'Arts & Performance':C.cyan,'Work Experience':C.rose,'Clubs & Organizations':C.orange,Other:C.t3};
    const latestGpa=portGpa.length?portGpa[portGpa.length-1].gpa:null;
    const ongoingCount=portActivities.filter(a=>a.status==='ongoing').length;
    const PIcon=PATH_ICONS[eSpec]||Compass;
    const strength=computeApplicationStrength({
      mastery, avgQuizScore:avgSc, clinicalHours:clinicalHoursTotal, volunteerHours:volH, leadershipHours:leadH,
      recommendersConfirmed:recommendersCount, collegeCount:appCounts.colleges, essayCount:appCounts.essays, benchmarks,
    });
    const strengthColor=strength.score>=80?C.green:strength.score>=60?C.blue:strength.score>=35?C.amber:C.rose;

    // Each strength subscore carries its own color so the gauge breakdown reads
    // as four distinct dimensions, not four identical gray numbers.
    const subscoreMeta={academic:{col:C.blue,Ic:GraduationCap},clinical:{col:C.pink,Ic:Stethoscope},application:{col:C.violet,Ic:ScrollText},activities:{col:C.amber,Ic:Award}};
    const {items:trackedItems,report:trackReport,needsAction:trackNeeds}=trackedSummary;

    // The Portfolio section navigator. One row per real sub-view with its live count, so the
    // Overview is the map of the tab rather than a second dashboard that happens to sit above it.
    //
    // Split into "the six most students need" and "everything else", because twelve identical
    // tiles is a wall, not a map: a first-time student has no way to tell which of them they were
    // supposed to open. Nothing is removed — the rest is one tap away under "Show everything
    // else", and the tap is remembered, so a student who wants all twelve keeps all twelve.
    const primarySections=[
      // Activities & résumé is one tab with five sections; the Clinical/Research/Skills tiles are
      // doors into it, each landing on the section it names (see PORTFOLIO_GROUP_FOR_VIEW +
      // goPortfolio) — merging those tabs must not put clinical hours one extra click away.
      {view:'resume',ic:Award,label:'Activities & résumé',value:portActivities.length,sub:'what you’ve done',col:C.amber},
      {view:'clinical',ic:Stethoscope,label:'Clinical hours',value:clinicalHoursTotal,sub:'hours logged',col:C.pink},
      {view:'colleges',ic:GraduationCap,label:'College list',value:appCounts.colleges,sub:'schools saved',col:C.sky},
      {view:'milestones',ic:Milestone,label:'Deadlines',value:appTimeline?appTimeline.stats.upcoming:(upcomingDeadlines||[]).length,sub:appTimeline?.next?`next in ${appTimeline.next.days} days`:'coming up',col:C.indigo},
      {view:'essays',ic:ScrollText,label:'Essays',value:appCounts.essays,sub:'drafts',col:C.violetL},
      {view:'aid',ic:Handshake,label:'Financial aid',value:scholarshipCount,sub:'scholarships',col:C.green},
    ];
    const moreSections=[
      {view:'research',ic:FlaskConical,label:'Research',value:researchCount,sub:'projects',col:C.cyan},
      {view:'skills',ic:BadgeCheck,label:'Skills & certs',value:skillsCount,sub:'certifications',col:C.teal},
      {view:'recommenders',ic:UserCheck,label:'Recommenders',value:recommendersCount,sub:'people noted',col:C.fuchsia},
      {view:'interview',ic:Mic,label:'Interview prep',value:interviewCount,sub:'practice sessions',col:C.orange},
      {view:'tracked',ic:RadarIcon,label:'Tracked',value:trackedItems.length,sub:trackNeeds?`${trackNeeds} need you`:'all current',col:C.violet},
      {view:'opportunities',ic:Trophy,label:'Opportunities',value:opportunityPreview.matches.length,sub:'matched to you',col:C.gold},
    ];
    // The Overview's map has to obey the same ladder the sub-nav does, or it becomes a
    // back door around it: twelve tiles here would hand a day-one student the Financial
    // Aid comparison, the interview trainer and the clinical-hours log the SubNav was
    // careful not to. A tile whose destination is a résumé section ('clinical', 'research',
    // 'skills' — see PORTFOLIO_GROUP_FOR_VIEW) is judged on that section's own gate.
    const tileOpen=view=>{
      const mapped=PORTFOLIO_GROUP_FOR_VIEW[view];
      return mapped ? unlocks.isOpen('portfolio',mapped[0],mapped[1]) : unlocks.isOpen('portfolio',view);
    };
    const sectionTile=s=>(
      <button key={s.view} onClick={()=>{goPortfolio(s.view);play('click');}} aria-label={`Open ${s.label}`}
        style={{
          boxSizing:'border-box',textAlign:'left',font:'inherit',color:'inherit',cursor:'pointer',
          padding:12,borderRadius:12,background:C.surf2,border:`1px solid ${C.b1}`,
          borderLeft:`3px solid ${s.col}`,
        }}>
        <div style={R({gap:4,marginBottom:4})}>
          <s.ic size={13} color={s.col}/>
          <span style={{fontSize:10,fontWeight:700,color:C.t3, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))'}}>{s.label}</span>
        </div>
        <div style={{fontSize:18, letterSpacing: 'calc(-0.17px + var(--msp-letter-spacing))',fontWeight:800,fontFamily:C.FM,color:C.t1}}>{s.value==null?'—':s.value}</div>
        <div style={{fontSize:10,color:C.t3,marginTop:4}}>{s.sub}</div>
      </button>
    );
    const tileGrid={display:'grid',gridTemplateColumns:isMobile?'repeat(2,1fr)':'repeat(auto-fill,minmax(160px,1fr))',gap:8};

    // ── "What do I actually do next?" ────────────────────────────────────────
    // Derived from the same rows every dashboard on this page reads, so it can never suggest
    // something already done. See src/lib/portfolioNextSteps.js for the ordering rules.
    const weekGoalCount=Object.keys(goalsForWeek(user)||{}).length;
    const nextSteps=buildNextSteps({
      trackedCount:trackedItems.length, trackNeeds, trackFocus:trackReport.focus,
      goalsSet:weekGoalCount, activityCount:portActivities.length, clinicalHours:clinicalHoursTotal,
      collegeCount:appCounts.colleges, essayCount:appCounts.essays, recommenderCount:recommendersCount,
      matchCount:opportunityPreview.matches.length,
      hasInterests:!opportunityPreview.profile.usingInferredThemes&&opportunityPreview.profile.activeThemeIds.length>0,
      gradeStage:user?.gradeStage||user?.gradeLevel||null,
    });
    const scrollToWeek=()=>{
      document.getElementById('portfolio-weekly-goals')?.scrollIntoView({behavior:'smooth',block:'start'});
    };
    // Plain-English translation of the strength score. The number alone reads as a grade someone
    // handed you; this says what it's made of and what moves it.
    const strengthPlain=strength.score>=80?'Strong across the board — keep the weekly goals ticking and you’re in good shape.'
      :strength.score>=60?'Solid foundation. The lowest bar below is the one worth an hour this week.'
        :strength.score>=35?'Early days, which is normal. Logging what you’ve already done usually moves this more than anything new.'
          :'Just getting started. This number only measures what’s been entered — adding your real activities and hours is the fastest way to move it.';

    return(
      <div style={CC({gap:20})}>
        <PanelHero tourTag="portfolio-deep-overview" icon={Building2} color={C.blue} color2={C.green} m={isMobile}
          eyebrow="Portfolio" title="Your application"
          sub="Everything you’re building for college. Start with the card below."
          stats={[
            {value:portActivities.length,label:'activities',color:C.blueL},
            {value:trackedItems.length,label:'tracked',color:C.violetL},
            {value:clinicalHoursTotal,label:'clinical hrs',color:C.pinkL},
          ]}
          right={
            <motion.button whileHover={{scale:1.03}} whileTap={{scale:0.97}} onClick={()=>goPortfolio('tracked')}
              style={{...btnSm(tint(C.violet,0.18),{color:onTint(C.violet),fontSize:11.5,border:`1px solid ${tint(C.violet,0.3)}`})}}>
              <RadarIcon size={12}/>{trackNeeds?`${trackNeeds} need action`:'Live tracking'}
            </motion.button>
          }/>

        {/* ── The one decision on this page ──────────────────────────────────────────────────
            Everything below reports; this card decides. It's first because a student who reads
            only one block should read the one that tells them what to go do. */}
        <NextStepsCard steps={nextSteps} insights={insights} onOpen={goPortfolio} onOpenPrep={goPrep}
          onScrollTo={scrollToWeek} isMobile={isMobile} firstName={user?.name?.split(' ')[0]||null}/>

        {/* ── This week ── the mini dashboards. Every important part of the application gets a
            measured number, a bar, and a target the STUDENT set. Meta Brain recommends on every
            single one of them and sets none of them — see WeeklyGoalsBoard.jsx. */}
        <div id="portfolio-weekly-goals" style={{scrollMarginTop:80}}>
          <WeeklyGoalsBoard
            user={user} snapshot={portSnapshot} loading={portSnapLoading} onSaveUser={saveUser} onOpen={goPortfolio}
            askMedabrain={askPortfolioMedabrain} isMobile={isMobile}
            benchmarks={benchmarks} clinicalHoursTotal={clinicalHoursTotal} accent={accent}/>
        </div>

        {/* ── Today's tracking, bound to the Tracked tab ── */}
        <button onClick={()=>goPortfolio('tracked')} aria-label="Open the Tracked tab"
          style={{
            ...glass({padding:isMobile?14:16}), textAlign:'left', font:'inherit', color:'inherit', cursor:'pointer', width:'100%',
            display:'flex', alignItems:'center', gap:12, flexWrap:'wrap',
            background:`linear-gradient(120deg,${tint(trackNeeds?C.rose:C.violet,0.09)},rgba(255,255,255,0.02) 60%)`,
            border:`1px solid ${tint(trackNeeds?C.rose:C.violet,0.24)}`,
          }}>
          <div style={{width:34,height:34,borderRadius:8,background:`linear-gradient(135deg,${C.violet},${C.indigo})`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <Brain size={17} color="#fff"/>
          </div>
          <div style={{flex:1,minWidth:200}}>
            <div style={{fontSize:10,fontWeight:800,letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', color:accentText(C.violet)}}>Today’s check-in on what you’re tracking</div>
            <div style={{fontSize:13,fontWeight:700,color:C.t1,marginTop:4,fontFamily:C.FD}}>
              {portSnapshot?trackReport.headline:'Pulling in everything you\u2019re tracking\u2026'}
            </div>
            {portSnapshot&&trackReport.focus&&<div style={{fontSize:11.5,color:C.t3,marginTop:4}}>First up: {trackReport.focus.name} — {trackReport.focus.nextStep}</div>}
          </div>
          <span style={{...pill(tint(C.violet,0.14),accentText(C.violet),{fontSize:11,gap:4}),flexShrink:0}}>Open Tracked<ArrowRight size={11}/></span>
        </button>

        {/* ── Opportunities & Competitions, as a doorway ──────────────────────────────────────
            The catalog itself used to be rendered inline HERE, at the very bottom of this page.
            It is its own tab now; what stays is the part of it that belongs on a dashboard — the
            three programs the matcher currently ranks highest for this student, straight from
            src/lib/opportunityMatch.js so this card and the tab can never disagree. */}
        <button onClick={()=>{goPortfolio('opportunities');play('click');}} aria-label="Open Opportunities & Competitions"
          style={{
            ...glass({padding:isMobile?14:18}), textAlign:'left', font:'inherit', color:'inherit', cursor:'pointer', width:'100%',
            background:`linear-gradient(120deg,${tint(C.gold,0.11)},rgba(255,255,255,0.02) 62%)`,
            border:`1px solid ${tint(C.gold,0.26)}`, display:'flex', flexDirection:'column', gap:12,
          }}>
          <div style={R({gap:12,flexWrap:'wrap'})}>
            <div style={{width:34,height:34,borderRadius:8,background:`linear-gradient(135deg,${C.gold},${C.orange})`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <Trophy size={17} color="#fff"/>
            </div>
            <div style={{flex:1,minWidth:200}}>
              <div style={{fontSize:10,fontWeight:800,letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', color:accentText(C.gold)}}>Things to go do</div>
              <div style={{fontSize:13,fontWeight:700,color:C.t1,marginTop:4,fontFamily:C.FD}}>
                {opportunityPreview.matches.length
                  ?`Your top ${opportunityPreview.matches.length} picks out of ${OPPORTUNITIES.length} real programs`
                  :`${OPPORTUNITIES.length} real programs — competitions, research, volunteering and summer programs`}
              </div>
              <div style={{fontSize:11.5,color:C.t3,marginTop:4}}>
                {opportunityPreview.profile.activeThemeIds.length
                  ?`Picked for you because you’re into ${opportunityPreview.profile.activeThemeIds.slice(0,3).map(id=>THEME_BY_ID[id]?.label.toLowerCase()).filter(Boolean).join(', ')}${opportunityPreview.profile.usingInferredThemes?' — tap to confirm that’s right':''}`
                  :'Tell us what you care about and these change to match'}
              </div>
              {/* The two facts a dashboard is for. A deadline you are eligible
                  for is the only thing on this card that expires. */}
              {(opportunityPreview.next||opportunityPreview.inProgress>0)&&(
                <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:8}}>
                  {opportunityPreview.next&&(
                    <span style={pill(tint(C.rose,0.14),accentText(C.rose),{fontSize:10.5,gap:4})}>
                      <CalendarClock size={10}/>
                      {opportunityPreview.next.p.name.slice(0,34)} closes in {opportunityPreview.next.dl.daysOut} days
                    </span>
                  )}
                  {opportunityPreview.inProgress>0&&(
                    <span style={pill(tint(C.amber,0.14),accentText(C.amber),{fontSize:10.5})}>
                      {opportunityPreview.inProgress} application{opportunityPreview.inProgress===1?'':'s'} started, not sent
                    </span>
                  )}
                </div>
              )}
            </div>
            <span style={{...pill(tint(C.gold,0.16),accentText(C.gold),{fontSize:11,gap:4}),flexShrink:0}}>Open Opportunities<ArrowRight size={11}/></span>
          </div>
          {opportunityPreview.matches.length>0&&(
            <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'repeat(3,1fr)',gap:8}}>
              {opportunityPreview.matches.map(m=>{
                const mc=m.match>=80?C.green:m.match>=60?C.blue:C.amber;
                return(
                  <div key={m.item.id} style={{padding:'8px 12px',borderRadius:12,background:C.surf2,border:`1px solid ${C.b1}`,borderLeft:`3px solid ${mc}`}}>
                    <div style={R({gap:4,marginBottom:4})}>
                      <span style={{fontSize:12,fontWeight:800,fontFamily:C.FM,color:mc}}>{m.match}%</span>
                      <span style={{fontSize:9,color:C.t4,letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))'}}>MATCH</span>
                      <span style={{marginLeft:'auto',fontSize:9.5,color:C.t4}}>{m.item.type}</span>
                    </div>
                    <div style={{fontSize:11.5,fontWeight:700,color:C.t1,lineHeight:1.35}}>{m.item.name}</div>
                    <div style={{fontSize:10.5,color:C.t3,marginTop:4,lineHeight:1.45,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}}>{m.reason}</div>
                  </div>
                );
              })}
            </div>
          )}
        </button>

        {user.masterPlan&&<PortfolioPlanWeek user={user} accent={C.blue} onOpenTask={openPlanResource}/>}

        {/* ── Where to go ──────────────────────────────────────────────────────────────────────
            The map of the tab. Six doors up front — the ones nearly every student needs — and the
            remaining six behind one remembered tap, so this reads as a menu rather than a wall. */}
        <div style={glass({padding:16})}>
          <div style={R({justifyContent:'space-between',marginBottom:4,gap:8,flexWrap:'wrap'})}>
            <SL extra={{margin:0,display:'flex',alignItems:'center',gap:8}}><PIcon size={12}/>Where do you want to work?</SL>
            <span style={pill(C.s3,C.t3,{fontSize:10})}>Level {lvl} {levelInfo.tier} · {streak}-day streak</span>
          </div>
          <div style={{marginBottom:12}}>
            <HelpNote>Each box is one part of your application. The big number is how much you have in it so far — tap any of them to add to it.</HelpNote>
          </div>
          <div style={tileGrid}>{primarySections.filter(s=>tileOpen(s.view)).map(sectionTile)}</div>
          {moreSections.some(s=>tileOpen(s.view))&&(
            <div style={{marginTop:12}}>
              <Disclosure id="port-overview-more-sections" title="Show everything else"
                sub="Research, certifications, recommenders, interview practice, and your tracking boards." icon={Compass} color={accent} m={isMobile}>
                <div style={tileGrid}>{moreSections.filter(s=>tileOpen(s.view)).map(sectionTile)}</div>
              </Disclosure>
            </div>
          )}
        </div>

        {/* ── The numbers, one tap down ────────────────────────────────────────────────────────
            The strength gauge, the long-game benchmark bars and the summary stats are all reports
            on work that has already happened. They belong on this page — they do not belong ABOVE
            the thing the student is meant to do next, competing for the same attention. */}
        <Disclosure id="port-overview-detail" title="How your application is doing"
          sub={`Overall score ${strength.score}/100 · ${strength.label} — plus your hours against what ${curPath?.label||'this pathway'} usually looks for.`}
          icon={TrendingUp} color={strengthColor} m={isMobile}>
          <div style={CC({gap:16})}>
            {/* Application-strength readiness gauge — one score synthesizing academics, clinical exposure, application progress, and activities */}
            <div style={{...glass2({padding:16}),display:'flex',alignItems:'center',gap:16,flexWrap:'wrap',background:`linear-gradient(135deg,${strengthColor}10,transparent)`,border:`1px solid ${strengthColor}28`}}>
              <Arc pct={strength.score} size={68} stroke={6} color={strengthColor} label={`${strength.score}`} sub="/100"/>
              <div style={{flex:1,minWidth:210}}>
                <div style={{fontSize:11,fontWeight:700,color:C.t3,letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))'}}>Overall application strength</div>
                <div style={{fontSize:18, letterSpacing: 'calc(-0.17px + var(--msp-letter-spacing))',fontWeight:800,color:strengthColor,fontFamily:C.FD,marginTop:4}}>{strength.label}</div>
                <div style={{fontSize:11.5,color:C.t2,marginTop:4,lineHeight:1.55}}>{strengthPlain}</div>
                <div style={{fontSize:10.5,color:C.t4,marginTop:4,lineHeight:1.5}}>Made of four things: what you’ve studied, your clinical exposure, how far along the application itself is, and your activity hours.</div>
              </div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                {Object.entries(strength.subscores).map(([k,v])=>{
                  const m=subscoreMeta[k]||{col:C.blue,Ic:Circle};
                  return(
                    <div key={k} style={{textAlign:'center',minWidth:76,padding:'8px 12px',borderRadius:12,background:`${m.col}0f`,border:`1px solid ${m.col}28`}}>
                      <m.Ic size={13} color={m.col} style={{marginBottom:4}}/>
                      <div style={{fontSize:16, letterSpacing: 'calc(-0.05px + var(--msp-letter-spacing))',fontWeight:800,fontFamily:C.FM,color:m.col}}>{v}%</div>
                      <div style={{fontSize:9,color:C.t3, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))',marginTop:4}}>{k}</div>
                      <div style={{height:3,background:'rgba(255,255,255,0.06)',borderRadius: 4,overflow:'hidden',marginTop:4}}>
                        <div style={{height:'100%',width:`${Math.min(100,v)}%`,background:m.col,borderRadius: 4}}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Progress bars toward recommended hours — parameterized off the active pathway's benchmarks.
                These are the LONG game (a whole-application benchmark); the weekly goals at the top are
                how you actually move them. Both are shown so the week has a horizon behind it. */}
            <div>
              <SL extra={{marginBottom:4}}>Your hours vs. what {curPath?.label} usually looks for</SL>
              <div style={{marginBottom:12}}>
                <HelpNote>These are whole-high-school totals, not weekly ones — most students take years to fill them. Tap a label to go log more.</HelpNote>
              </div>
              {[
                {l:'Clinical / shadowing hours',val:clinicalHoursTotal,target:(benchmarks.clinicalHours||60)+(benchmarks.shadowingHours||20),col:accent,view:'clinical'},
                {l:'Leadership hours',val:leadH,target:benchmarks.leadershipHours||100,col:C.blue,view:'resume'},
                {l:'Research / independent project hours',val:resH,target:100,col:C.amber,view:'research'},
                {l:'Volunteer hours',val:volH,target:benchmarks.volunteerHours||150,col:C.violet,view:'resume'},
              ].map(({l,val,target,col,view})=>(
                <div key={l} style={{marginBottom:12}}>
                  <div style={R({justifyContent:'space-between',marginBottom:4})}>
                    <button onClick={()=>goPortfolio(view)} style={{all:'unset',cursor:'pointer',fontSize:12,color:C.t2,fontFamily:C.FB}}>{l}</button>
                    <span style={{fontSize:11,fontFamily:C.FM,color:val>=target?C.green:C.t3,display:'inline-flex',alignItems:'center',gap:4}}>{val} / {target}{val>=target&&<Check size={11}/>}</span>
                  </div>
                  <Bar pct={Math.min((val/target)*100,100)} color={val>=target?C.green:col} h={6} glow={val>=target}/>
                </div>
              ))}
            </div>

            {/* Summary stats — just the two numbers not already covered by the benchmark bars above
                (Leadership/Research/Volunteer hours used to be shown twice: as a bare number here
                AND as a val/target progress bar, trimmed to avoid the duplication). */}
            <div style={G(2,14,{},isMobile)}>
              <Stat label="Est. annual hours" value={totH} icon={<Clock size={16}/>} color={accent} m={isMobile}/>
              <Stat label="Current GPA" value={latestGpa!==null?latestGpa:'—'} icon={<TrendingUp size={16}/>} color={C.green} sub={ongoingCount?`${ongoingCount} ongoing activities`:'No GPA logged yet'} m={isMobile}/>
            </div>

            {/* The insight callouts Progress shows. The most urgent one or two already lead this
                page inside "Start here" — these are the remainder, kept rather than duplicated. */}
            {insights.length>1&&<div style={CC({gap:8})}>
              <SL extra={{marginBottom:0}}>Other things worth knowing</SL>
              {insights.slice(1,4).map((ins,i)=>{
                const sevColor={high:C.rose,medium:C.amber,low:C.t3,positive:C.green}[ins.severity];
                return(
                  <div key={i} style={{...glass2({padding:12,display:'flex',alignItems:'center',gap:12}),borderLeft:`3px solid ${sevColor}`}}>
                    <Lightbulb size={15} color={sevColor} style={{flexShrink:0}}/>
                    <span style={{flex:1,fontSize:12.5,color:C.t2,lineHeight:1.5}}>{ins.text}</span>
                    {ins.ctaLabel&&<button style={btnSm(`${sevColor}18`,{color:sevColor,border:`1px solid ${sevColor}30`,fontSize:11,flexShrink:0})} onClick={()=>ins.ctaTab==='prep'?goPrep(ins.ctaView):goPortfolio(ins.ctaView)}>{ins.ctaLabel}</button>}
                  </div>
                );
              })}
            </div>}
          </div>
        </Disclosure>

        {/* Activity list — a read-only recap of rows that are edited in Activities & résumé, so it
            is reference material, not a workspace. Behind a door for the same reason. */}
        {portActivities.length>0&&(
          <Disclosure id="port-overview-activities" title={`Everything you’ve logged (${portActivities.length})`}
            sub="Edit these in Activities & résumé." icon={Award} color={C.amber} m={isMobile}>
            <div style={CC({gap:8})}>
              <AnimatePresence>
                {portActivities.map((act)=>{const col=actColors[act.activity_type]||C.blue;return(
                  <motion.div key={act.id} initial={{opacity:0,x:-10}} animate={{opacity:1,x:0}} exit={{opacity:0,x:10}} style={{...glass2({display:'flex',alignItems:'center',gap:12,padding:'12px 16px'})}}>
                    <div style={{width:4,height:44,borderRadius: 4,background:`linear-gradient(180deg,${col},${col}60)`,flexShrink:0,boxShadow:`0 0 8px ${col}40`}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:700,color:C.t1,fontFamily:C.FD,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{act.position}{act.organization?` · ${act.organization}`:''}</div>
                      <div style={{fontSize:11,color:C.t3,marginTop:4,fontFamily:C.FM}}>{act.activity_type} · {Math.round(annualH(act))}h/yr · {act.status}</div>
                    </div>
                  </motion.div>
                );})}
              </AnimatePresence>
              <button onClick={()=>goPortfolio('resume')} style={{...btnSm(tint(C.amber,0.16),{color:accentText(C.amber),fontSize:11.5,alignSelf:'flex-start'})}}>
                Edit these in Activities & résumé<ArrowRight size={11}/>
              </button>
            </div>
          </Disclosure>
        )}

      </div>
    );
  }

  // ── ADMISSIONS CALC ───────────────────────────────────────────────────────────
  // The panel itself lives in src/components/portfolio/admissions/. What used to be
  // here was ~260 lines of JSX over a scoreSchool() that started every school at
  // 100 points and handed out bonuses — see the header of
  // AdmissionCalculatorPanel.jsx for why that had to be replaced rather than
  // retuned, and src/lib/admissions/ for the five-layer model that replaced it.
  // The MedEx Score's full breakdown. Reads the same medexState the Home card does, so the
  // headline number on the dashboard and the dial on this page are the same object — they cannot
  // drift apart by a render.
  function tMedex(){
    return (
      <MedExPanel
        state={medexState}
        onGoTo={goMedexDimension}
        onOpenCalculator={()=>goPortfolio('calc')}
        isMobile={isMobile}
        reducedMotion={reducedMotion}
      />
    );
  }

  function tCalc(){
    return (
      <AdmissionCalculatorPanel
        user={user}
        snapshot={portSnapshot}
        colleges={portSnapshot?.colleges||[]}
        isMobile={isMobile}
        onGoTo={goPortfolio}
        onReload={refreshPortSnapshot}
      />
    );
  }

  // ── THE NARRATIVE METHOD ENGINE ───────────────────────────────────────────────
  // Sits beside the calculator because they answer the same question at two
  // different altitudes and must not be confused for each other: the calculator
  // says what your odds are at these programs, this says what your file
  // currently reads as. It deliberately emits no probability of its own — see
  // the header of src/lib/ivy/engine.js.
  //
  // PREMIUM ROADMAP: this is the app's first screen designed from the start to
  // sit behind billing. The gate is inside the panel (`narrativeEngineTier`) and
  // is currently open for everyone; nothing here changes when it closes.
  function tNarrative(){
    return (
      <React.Suspense fallback={
        <div style={{...glass({padding:40}), display:'flex', justifyContent:'center'}}>
          <Loader2 size={20} style={{animation:'spin 1s linear infinite', color:C.t3}}/>
        </div>
      }>
      <NarrativeEnginePanel
        user={user}
        snapshot={portSnapshot}
        gradeLevel={user?.gradeLevel??user?.grade_level??null}
        isMobile={isMobile}
        onGoTo={goPortfolio}
      />
      </React.Suspense>
    );
  }


  // ── ANALYTICS ─────────────────────────────────────────────────────────────────
  function tAnalytics(){
    const accent=progressAccent; // shadows the pathway accent — Progress has its own fixed color identity
    void questTick; // re-render after claiming a quest (claim state lives in localStorage)
    const recentScores=qHistory.slice(-12);
    const weekKey=getIsoWeekKey();
    const weekStart=getStartOfWeek().getTime();
    const quizzesThisWeek=qHistory.filter(q=>q.completedAt>=weekStart).length;
    const quests=getWeeklyQuests({quizzesThisWeek,cardsThisWeek:weekCardReviews,coachOrInterviewThisWeek:getWeeklyCoachCount(weekKey)});
    const claimedQuests=getClaimedQuests(weekKey);
    function claimQuestReward(q){
      if(!q.done||claimedQuests.has(q.id))return;
      claimQuest(weekKey,q.id);
      setQuestTick(t=>t+1);
      // Quest XP stays deterministic and is granted immediately — only the *reveal* is a
      // variable, anticipation-building chest-open moment (kicked off now, reconciled by the
      // time the chest opens). `claimQuest` above marks this quest claimed only on THIS device
      // (localStorage) — without a server-side guard, the same quest could be claimed once per
      // device instead of once per account, so the actual XP is routed through the idempotent
      // reward-claim path, keyed by this exact quest+week, same pattern as checkin/achievements.
      const claimPromise = claimRewardXP(`quest:${weekKey}:${q.id}`,q.xp).then(async(r)=>{ await syncUserFromDb(); return r; });
      const wonCosmetic = Math.random()<0.25 ? rollCosmetic(cosmetics) : null;
      openChest({
        title: 'Quest complete',
        eyebrow: q.label,
        xp: q.xp,
        cosmetic: wonCosmetic,
        onOpen: async ()=>{
          if(wonCosmetic){ await DB.unlockCosmetic(wonCosmetic.key); setCosmetics(prev=>new Set([...prev,wonCosmetic.key])); }
          const { granted } = await claimPromise;
          if(granted===false){
            toast('That quest was already claimed on your other device — XP adjusted.',{icon:<Info size={14} color={C.t2}/>,duration:5000});
          }
        },
      });
    }
    // Chart configs
    const radarData={
      labels:cats3.map(c=>c.split('/')[0]),
      datasets:[{
        label:'Performance %',
        data:catStats.map(c=>c.avg||0),
        backgroundColor:'rgba(45,127,255,0.15)',
        borderColor:'rgba(45,127,255,0.8)',
        borderWidth:2,
        pointBackgroundColor:catStats.map(c=>scCol(c.avg||0)),
        pointBorderColor:'transparent',
        pointRadius:6,
      }]
    };
    const radarOpts={
      responsive:true,maintainAspectRatio:false,
      scales:{r:{min:0,max:100,ticks:{color:C.t3,backdropColor:'transparent',stepSize:20},grid:{color:C.b2},pointLabels:{color:C.t2,font:{size:12,family:C.FB}}}},
      plugins:{legend:{display:false},tooltip:{backgroundColor:C.s2,titleColor:C.t1,bodyColor:C.t2,borderColor:C.b2,borderWidth:1}},
    };

    const lineData={
      labels:recentScores.map((_,i)=>`Q${i+1}`),
      datasets:[{
        label:'Score %',
        data:recentScores.map(r=>r.score),
        borderColor:'rgba(45,127,255,0.9)',
        backgroundColor:'rgba(45,127,255,0.08)',
        borderWidth:2.5,
        pointBackgroundColor:recentScores.map(r=>scCol(r.score)),
        pointRadius:5,
        tension:0.4,fill:true,
      }]
    };
    const lineOpts={
      responsive:true,maintainAspectRatio:false,
      scales:{
        y:{min:0,max:100,grid:{color:C.b1},ticks:{color:C.t3,font:{size:11}}},
        x:{grid:{display:false},ticks:{color:C.t3,font:{size:11}}},
      },
      plugins:{legend:{display:false},tooltip:{backgroundColor:C.s2,titleColor:C.t1,bodyColor:C.t2,borderColor:C.b2,borderWidth:1}},
    };

    const doughnutData={
      labels:['Completed','Remaining'],
      datasets:[{data:[doneL,allL.length-doneL],backgroundColor:[accent,C.s4],borderWidth:0,hoverOffset:4}]
    };
    const doughnutOpts={responsive:true,maintainAspectRatio:false,cutout:'72%',plugins:{legend:{display:false},tooltip:{backgroundColor:C.s2,titleColor:C.t1,bodyColor:C.t2,borderColor:C.b2,borderWidth:1}}};

    const TierIcon=TIER_ICONS[levelInfo.tierIcon]||Sparkles;
    const annualH=a=>(parseFloat(a.hours_per_week)||0)*(parseFloat(a.weeks_per_year)||0);
    const leadH=Math.round(portActivities.filter(a=>a.activity_type==='Leadership').reduce((s,a)=>s+annualH(a),0));
    const volH=Math.round(portActivities.filter(a=>a.activity_type==='Volunteering').reduce((s,a)=>s+annualH(a),0));
    const strength=computeApplicationStrength({
      mastery, avgQuizScore:avgSc, clinicalHours:clinicalHoursTotal, volunteerHours:volH, leadershipHours:leadH,
      recommendersConfirmed:recommendersCount, collegeCount:appCounts.colleges, essayCount:appCounts.essays, benchmarks,
    });
    const strengthColor=strength.score>=80?C.green:strength.score>=60?C.blue:strength.score>=35?C.amber:C.rose;
    const diagPath=user?.diagnosticResult?PATHS[user.diagnosticResult]:null;
    // Clinical hour trend — cumulative by month
    const hoursByMonth={};
    [...clinicalHoursEntries].sort((a,b)=>a.entryDate.localeCompare(b.entryDate)).forEach(e=>{
      const m=e.entryDate.slice(0,7);
      hoursByMonth[m]=(hoursByMonth[m]||0)+(e.hours||0);
    });
    const monthKeys=Object.keys(hoursByMonth).sort();
    let running=0;
    const clinicalTrendData={
      labels:monthKeys.map(m=>new Date(m+'-01').toLocaleDateString(undefined,{month:'short',year:'2-digit'})),
      datasets:[{
        label:'Cumulative hours', data:monthKeys.map(m=>{running+=hoursByMonth[m];return running;}),
        borderColor:`${accent}e6`, backgroundColor:`${accent}14`, borderWidth:2.5, pointRadius:4, tension:0.3, fill:true,
      }],
    };

    // ── Verified Progress data (credibility view) ─────────────────────────────
    const unitMasteryList=(curPath?.units||[]).map(unit=>{
      const lessonStates=unit.lessons.map(l=>{
        const entry=pathway[l.id];
        const hasQuiz=l.quizIds?.length>0;
        let status='not_started';
        if(entry){
          if(hasQuiz) status=entry.verified?'verified':'studying';
          else status='legacy_done';
        }
        return{lesson:l,status,hasQuiz};
      });
      const anyQuizGated=lessonStates.some(l=>l.hasQuiz);
      const allVerified=lessonStates.every(l=>l.status==='verified'||l.status==='legacy_done');
      return{unit,lessonStates,anyQuizGated,allVerified};
    });
    const verifiedUnitCount=unitMasteryList.filter(u=>u.anyQuizGated&&u.allVerified).length;
    const quizGatedUnitCount=unitMasteryList.filter(u=>u.anyQuizGated).length;

    return(
      <div>
        <PageHeader icon={LineChart} color={accent} eyebrow="Progress" title="Your progress"
          sub="Readiness, credibility, and performance across your pathway." m={isMobile}
          right={!isMobile&&(
            <div style={R({gap:8})}>
              <div style={{...pill(`${levelInfo.tierColor}1e`,accentText(levelInfo.tierColor),{fontSize:12,fontWeight:700}),display:'inline-flex',alignItems:'center',gap:4}}><TierIcon size={12}/>Lv.{lvl} {levelInfo.tier}</div>
              {streak>0&&<div style={{...pill(C.amberDim,C.amberL,{fontSize:12,fontWeight:700}),display:'inline-flex',alignItems:'center',gap:4}}><Flame size={12}/>{streak}d</div>}
              <div style={{...pill(C.greenDim,C.greenL,{fontSize:12,fontWeight:700}),display:'inline-flex',alignItems:'center',gap:4}}><Trophy size={12}/>{achiev.size}</div>
            </div>
          )}/>
        <div style={{marginTop:16}}>
          <SubNav items={progressSubnav} active={progressView} onChange={setProgressView} accent={accent} m={isMobile} tourPrefix="progress-sub" hrefFor={progressHref} locked={unlocks.locked('progress')[0]}/>
        </div>
        <div style={{...CC({gap:20}),marginTop:16}}>
        {progressView==='overview'&&<>
        {/* Application-strength readiness gauge */}
        <div data-tour="progress-deep-overview" style={{...glass({padding:20}),display:'flex',alignItems:'center',gap:20,flexWrap:'wrap',background:`linear-gradient(135deg,${strengthColor}12,transparent)`,border:`1px solid ${strengthColor}30`}}>
          <Arc pct={strength.score} size={72} stroke={6} color={strengthColor} label={`${strength.score}`} sub="/100"/>
          <div style={{flex:1,minWidth:200}}>
            <div style={{fontSize:11,fontWeight:700,color:C.t3,letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))'}}>Application Strength</div>
            <div style={{fontSize:18, letterSpacing: 'calc(-0.17px + var(--msp-letter-spacing))',fontWeight:800,color:strengthColor,fontFamily:C.FD,marginTop:4}}>{strength.label}</div>
            <div style={{fontSize:11,color:C.t3,marginTop:4}}>Academic {strength.subscores.academic}% · Clinical {strength.subscores.clinical}% · Application {strength.subscores.application}% · Activities {strength.subscores.activities}%</div>
          </div>
          <button style={btnG({fontSize:12})} onClick={()=>goPortfolio('overview')}>View portfolio<ChevronRight size={13}/></button>
        </div>

        {/* Onboarding recap — surfaces what the ~30-screen onboarding flow actually collected
            (goal, obstacles, study method, what they want to accomplish) so it's visibly tying
            into the rest of the app instead of vanishing after the paywall screen. Same data
            feeds Medabrain's system prompt — see src/lib/studentProfile.js. */}
        <div style={{...glass2({padding:16}),display:'flex',alignItems:'flex-start',gap:12}}>
          <div style={{width:32,height:32,borderRadius:8,flexShrink:0,background:C.violetDim,border:`1px solid ${C.violet}30`,display:'flex',alignItems:'center',justifyContent:'center'}}><Target size={15} color={C.violetL}/></div>
          <div style={{flex:1,minWidth:0}}>
            <div style={R({justifyContent:'space-between',marginBottom:4})}>
              <div style={{fontSize:10,fontWeight:700,color:C.t3,letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))'}}>From your onboarding</div>
              {onboardingCompleteness.pct<100&&<span style={pill(C.amberDim,C.amberL,{fontSize:9.5})}>{onboardingCompleteness.pct}% complete</span>}
            </div>
            {onboardingRecap.length>0?(
              <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                {onboardingRecap.map(item=>(
                  <span key={item.label} style={pill(C.violetDim,C.violetL,{fontSize:11})}>{item.label}: {item.value}</span>
                ))}
              </div>
            ):(
              <div style={{fontSize:12.5,color:C.t3,lineHeight:1.5}}>You haven't set a goal yet — Medabrain coaches better when it knows what you're working toward.</div>
            )}
          </div>
          <button style={btnSm('rgba(255,255,255,0.06)',{fontSize:10.5,flexShrink:0})} onClick={()=>setTab('settings')}>Edit</button>
        </div>

        {/* Insight callouts */}
        {insights.length>0&&<div style={CC({gap:8})}>
          {insights.map((ins,i)=>{
            const sevColor={high:C.rose,medium:C.amber,low:C.t3,positive:C.green}[ins.severity];
            return(
              <div key={i} style={{...glass2({padding:12,display:'flex',alignItems:'center',gap:12}),borderLeft:`3px solid ${sevColor}`}}>
                <Lightbulb size={15} color={sevColor} style={{flexShrink:0}}/>
                <span style={{flex:1,fontSize:12.5,color:C.t2,lineHeight:1.5}}>{ins.text}</span>
                {ins.ctaLabel&&<button style={btnSm(`${sevColor}18`,{color:sevColor,border:`1px solid ${sevColor}30`,fontSize:11,flexShrink:0})} onClick={()=>ins.ctaTab==='prep'?goPrep(ins.ctaView):goPortfolio(ins.ctaView)}>{ins.ctaLabel}</button>}
              </div>
            );
          })}
        </div>}

        {/* Diagnostic result */}
        {diagPath&&<div style={{...glass2({padding:16,display:'flex',alignItems:'center',gap:12})}}>
          {(()=>{const DIc=PATH_ICONS[user.diagnosticResult]||Compass;return <div style={{width:38,height:38,borderRadius:12,background:`${diagPath.accent}18`,border:`1px solid ${diagPath.accent}35`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><DIc size={17} color={diagPath.accent}/></div>;})()}
          <div style={{flex:1}}>
            <div style={{fontSize:10,fontWeight:700,color:C.t3, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))'}}>Your Diagnostic Result</div>
            <div style={{fontSize:13,fontWeight:700,color:C.t1,fontFamily:C.FD,marginTop:4}}>{diagPath.label}{eSpec!==user.diagnosticResult?` — currently on ${curPath?.label}`:''}</div>
          </div>
          <button style={btnG({fontSize:11,padding:'4px 12px'})} onClick={()=>{setDIntro(false);setDD(false);setDS(0);setDA([]);goPrep('diagnostic');}}>Retake<RefreshCw size={12} style={{marginLeft:4}}/></button>
        </div>}

        {/* Identity / Level card */}
        <div style={{...glass({padding:20}),background:`linear-gradient(135deg,${levelInfo.tierColor}22,${accent}10)`,border:`1px solid ${levelInfo.tierColor}35`}}>
          <div style={R({gap:16,flexWrap:'wrap',justifyContent:'space-between'})}>
            <div style={R({gap:12})}>
              <div style={{width:52,height:52,borderRadius:16,background:`${levelInfo.tierColor}25`,border:`1.5px solid ${levelInfo.tierColor}55`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                <TierIcon size={24} color={accentText(levelInfo.tierColor)}/>
              </div>
              <div>
                <div style={{fontSize:20, letterSpacing: 'calc(-0.28px + var(--msp-letter-spacing))',fontWeight:800,color:C.t1,fontFamily:C.FD}}>Level {lvl} · {levelInfo.tier}</div>
                <div style={{fontSize:12,color:C.t3,marginTop:4,display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                  <span>{(user.xp||0).toLocaleString()} XP total{streak>0?` · ${streak}-day streak`:''}</span>
                  {streakFreezes>0&&<span style={{...pill(C.blueDim,C.blueL,{fontSize:10}),display:'inline-flex',alignItems:'center',gap:4}}><Snowflake size={10}/>{streakFreezes} freeze{streakFreezes>1?'s':''}</span>}
                </div>
              </div>
            </div>
            <div style={{textAlign:'right',minWidth:120}}>
              <div style={{fontSize:12,color:nearLevelUp?C.amberL:C.t2,fontFamily:C.FM,fontWeight:600}}>{nearLevelUp?`Almost there!`:`${xpIn} / ${xpForNext} XP`}</div>
              <div style={{fontSize:11,color:C.t3,marginTop:4}}>{xpForNext-xpIn} XP to Level {lvl+1}</div>
            </div>
          </div>
          <div style={{marginTop:16}}><Bar pct={levelInfo.pct} color={nearLevelUp?C.amber:levelInfo.tierColor} h={8} glow/></div>
        </div>

        {/* Weekly Quests */}
        <div style={glass({padding:16})}>
          <SL extra={{marginBottom:12}}>This Week's Quests</SL>
          <div style={CC({gap:8})}>
            {quests.map(q=>{const claimed=claimedQuests.has(q.id);const almostDone=!q.done&&q.pct>=80;return(
              <motion.div
                key={q.id}
                animate={almostDone?{scale:[1,1.015,1]}:{scale:1}}
                transition={almostDone?{duration:1.4,repeat:Infinity,ease:'easeInOut'}:{}}
                style={{...glass2({padding:12}),border:almostDone?`1px solid ${C.amber}45`:undefined,boxShadow:almostDone?`0 0 16px ${C.amber}22`:undefined}}
              >
                <div style={R({justifyContent:'space-between',marginBottom:8})}>
                  <span style={{fontSize:12,fontWeight:600,color:q.done?C.t1:C.t2}}>{q.label}</span>
                  <div style={R({gap:8})}>
                    <span style={{fontSize:11,fontFamily:C.FM,color:almostDone?C.amberL:C.t3}}>{q.progress}/{q.target}</span>
                    {claimed
                      ?<span style={pill(C.greenDim,C.greenL,{fontSize:10})}><Check size={10}/>+{q.xp}xp</span>
                      :q.done
                        ?<motion.button whileHover={{scale:1.05}} whileTap={{scale:.95}} style={{...pill(C.amberDim,C.amberL,{fontSize:10,cursor:'pointer',border:'none'})}} onClick={()=>claimQuestReward(q)}>Claim +{q.xp}xp</motion.button>
                        :<span style={pill(C.s3,C.t3,{fontSize:10})}>+{q.xp}xp</span>}
                  </div>
                </div>
                <Bar pct={q.pct} color={q.done?C.green:almostDone?C.amber:accent} h={5} glow={q.done||almostDone}/>
              </motion.div>
            );})}
          </div>
        </div>

        {/* Top stats */}
        <div style={G(4,14,{},isMobile)}>
          <Stat label="Total XP" value={(user.xp||0).toLocaleString()} icon={<Zap size={16}/>} color={C.amber} m={isMobile}/>
          <Stat label="Level" value={`${lvl} · ${levelInfo.tier}`} icon={<Trophy size={16}/>} color={C.violet} m={isMobile}/>
          <Stat label="Avg score" value={`${avgSc}%`} icon={<LineChart size={16}/>} color={scCol(avgSc)} m={isMobile}/>
          <Stat label="Study streak" value={`${streak}d`} icon={<Flame size={16}/>} color={C.orange} m={isMobile}/>
        </div>

        {/* Profiling roadmap — transparent about what's NOT tracked yet */}
        <details style={{...glass2({padding:12}),cursor:'pointer'}}>
          <summary style={{fontSize:12,fontWeight:700,color:C.t2,display:'flex',alignItems:'center',gap:8,listStyle:'none'}}>
            <Brain size={13} color={C.t3}/>Deeper profiling — coming soon
          </summary>
          <p style={{fontSize:11.5,color:C.t3,lineHeight: 1.55,marginTop:8,marginBottom:0}}>
            Right now, Progress only reflects what's stored on this device or account — quiz scores, verified lessons, and Portfolio entries. No behavioral tracking or analytics pipeline runs today. A phased profiling system is planned: first, richer local study-pattern insights (already seeding data via lesson study/verify events); later, optional opt-in sync for cross-device history; eventually, anonymized cohort benchmarking. See <code>docs/PROFILING_PLAN.md</code> in the repo for the full design.
          </p>
        </details>
        </>}

        {progressView==='streak'&&(
          <StreakPanel
            streak={streak}
            bestStreak={bestStreakEver}
            freezesHeld={streakFreezes}
            freezeHistory={freezeHistory}
            xp={user?.xp||0}
            day={todayStatus}
            week={weekInfo}
            month={monthInfo}
            boosts={boosts}
            repair={streakRepair}
            checkin={checkinState}
            targetInfo={streakTargetInfo}
            activity={dayActivityMap}
            bridged={bridgedDates}
            claimedRewards={claimedStreakRewards}
            goalId={user?.streakGoalId||DEFAULT_GOAL_ID}
            streakTarget={streakTarget}
            totalEarnedDays={metDates.size}
            onSetGoal={(id)=>{
              saveUser({...user,streakGoalId:id});
              play('select');
              toast.success(`Daily goal set to ${getGoal(id).label}. Days you already earned stay earned.`,{duration:3000});
            }}
            onSetTarget={(days)=>{
              saveUser({...user,streakTarget:days});
              play('select');
              toast.success(`Streak goal set to ${days} days.`,{duration:2400});
            }}
            onBuyFreeze={buyFreeze}
            onRepair={doStreakRepair}
            onClaimCheckin={()=>claimTodayCheckin()}
            busy={streakBusy}
            m={isMobile}
          />
        )}

        {progressView==='quests'&&(
          <QuestBoard
            quests={questRows}
            events={questEvents}
            available={questsAvailable}
            loading={questsLoading}
            onAssign={startQuest}
            onClaim={claimQuestXP}
            onDecline={declineQuest}
            onWithdraw={dropQuest}
            onGo={goQuestDestination}
            busyId={questBusyId}
            error={questError}
            day={dailyDay}
            tomorrow={dailyTomorrow}
            streakHint={dailyStreakHint}
            onClaimDaily={claimDailyQuest}
            onClaimDailySet={claimDailySetBonus}
            dailyBusyKey={dailyBusyKey}
            recommended={questRecommendations}
            m={isMobile}
          />
        )}

        {progressView==='verified'&&<>
        {/* Verified Progress — credibility view */}
        <div data-tour="progress-deep-verified" style={{...glass({padding:20}),background:`linear-gradient(135deg,${C.greenDim},transparent)`,border:`1px solid ${C.green}25`}}>
          <div style={R({gap:16,flexWrap:'wrap'})}>
            <div style={{width:52,height:52,borderRadius:16,background:C.greenDim,border:`1px solid ${C.green}35`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><ShieldCheck size={24} color={C.greenL}/></div>
            <div style={{flex:1,minWidth:200}}>
              <div style={{fontSize:11,fontWeight:700,color:C.t3,letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))'}}>Credibility Score</div>
              <div style={{fontSize:20,fontWeight:800,color:C.t1,fontFamily:C.FD,marginTop:4}}>{verifiedUnitCount} of {quizGatedUnitCount||unitMasteryList.length} units verified</div>
              <div style={{fontSize:11.5,color:C.t2,marginTop:4,lineHeight:1.5}}>{quizGatedUnitCount>0?'Verified units required passing a curated quiz for every lesson — not just opening a link.':'This pathway hasn\'t been migrated to quiz-verified lessons yet — progress below is self-reported.'}</div>
            </div>
          </div>
        </div>
        {unitMasteryList.map(({unit,lessonStates,anyQuizGated,allVerified})=>(
          <div key={unit.id} style={glass({padding:16})}>
            <div style={R({justifyContent:'space-between',marginBottom:12})}>
              <div style={{fontSize:14,fontWeight:700,color:C.t1,fontFamily:C.FD}}>{unit.title}</div>
              {anyQuizGated
                ?(allVerified?<span style={pill(C.greenDim,C.greenL,{fontSize:10})}><ShieldCheck size={10} style={{marginRight:4}}/>Verified</span>:<span style={pill(C.amberDim,C.amberL,{fontSize:10})}>In progress</span>)
                :<span style={pill('rgba(255,255,255,0.06)',C.t3,{fontSize:10})}>Legacy self-reported</span>}
            </div>
            <div style={CC({gap:8})}>
              {lessonStates.map(({lesson,status,hasQuiz})=>(
                <div key={lesson.id} style={{...glass2({padding:'8px 12px'}),display:'flex',alignItems:'center',gap:8}}>
                  {status==='verified'&&<ShieldCheck size={14} color={C.green}/>}
                  {status==='legacy_done'&&<Check size={14} color={C.green}/>}
                  {status==='studying'&&<BookOpen size={14} color={C.amberL}/>}
                  {status==='not_started'&&<Circle size={10} color={C.t4}/>}
                  <span style={{flex:1,fontSize:12.5,color:C.t2}}>{lesson.title}</span>
                  {hasQuiz
                    ?<span style={pill(status==='verified'?C.greenDim:'rgba(255,255,255,0.06)',status==='verified'?C.greenL:C.t3,{fontSize:9})}>{status==='verified'?'Quiz passed':'Not yet verified'}</span>
                    :<span style={pill('rgba(255,255,255,0.06)',C.t3,{fontSize:9})}>Self-reported</span>}
                </div>
              ))}
            </div>
          </div>
        ))}
        </>}

        {progressView==='performance'&&<>
        {/* Charts row */}
        <div data-tour="progress-deep-performance" style={G(2,14,{},isMobile)}>
          {/* Radar chart */}
          <div style={glass({padding:20})}>
            <SL>Section Performance</SL>
            <div style={{height:220,position:'relative'}}>
              <Radar data={radarData} options={radarOpts}/>
            </div>
            <div style={{marginTop:12,...CC({gap:8})}}>
              {catStats.map(({cat,avg,taken,total})=>(
                <div key={cat} style={R({gap:8})}>
                  <span style={{fontSize:11,color:C.t2,flex:1,fontFamily:C.FB}}>{cat.split('/')[0]}</span>
                  <span style={{fontSize:11,fontFamily:C.FM,color:C.t3}}>{taken}/{total}</span>
                  <span style={{fontSize:13,fontWeight:700,fontFamily:C.FM,color:avg!==null?scCol(avg):C.t3,minWidth:36,textAlign:'right'}}>{avg!==null?`${avg}%`:'—'}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Doughnut + course mastery */}
          <div style={glass({padding:20})}>
            <SL>Course Mastery</SL>
            <div style={{position:'relative',height:160,display:'flex',alignItems:'center',justifyContent:'center'}}>
              <Doughnut data={doughnutData} options={doughnutOpts}/>
              <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',pointerEvents:'none'}}>
                <span style={{fontSize:26, letterSpacing: 'calc(-0.53px + var(--msp-letter-spacing))', lineHeight: 'calc(1.28 * var(--msp-line-scale))',fontWeight:800,fontFamily:C.FM,color:accent}}>{mastery}%</span>
                <span style={{fontSize:10,color:C.t3}}>complete</span>
              </div>
            </div>
            <div style={{marginTop:16,...CC({gap:8})}}>
              {(curPath?.units||[]).map(unit=>{const p=unitM(unit);return(
                <div key={unit.id} style={{marginBottom:4}}>
                  <div style={R({justifyContent:'space-between',marginBottom:4})}>
                    <span style={{fontSize:11,color:C.t2,fontFamily:C.FB}}>{unit.title}</span>
                    <span style={{fontSize:11,fontFamily:C.FM,color:p===100?C.green:accent}}>{p}%</span>
                  </div>
                  <Bar pct={p} color={p===100?C.green:accent} h={4} glow={p===100}/>
                </div>
              );})}
            </div>
          </div>
        </div>

        {/* Score trend line chart */}
        {recentScores.length>=2&&<div style={glass({padding:20})}>
          <SL>Score Trend (last {recentScores.length} quizzes)</SL>
          <div style={{height:180,position:'relative'}}>
            <Line data={lineData} options={lineOpts}/>
          </div>
        </div>}

        {/* Clinical/shadowing hour trend */}
        {monthKeys.length>=2&&<div style={glass({padding:20})}>
          <SL>Clinical & Shadowing Hours — Cumulative</SL>
          <div style={{height:180,position:'relative'}}>
            <Line data={clinicalTrendData} options={lineOpts}/>
          </div>
        </div>}

        {/* Benchmark bars vs. active pathway targets */}
        <div style={glass({padding:16})}>
          <SL>Progress Toward {curPath?.label} Benchmarks</SL>
          {[
            {l:'Clinical / Shadowing Hours',val:clinicalHoursTotal,target:(benchmarks.clinicalHours||60)+(benchmarks.shadowingHours||20),col:accent},
            {l:'Leadership Hours',val:leadH,target:benchmarks.leadershipHours||100,col:C.blue},
            {l:'Volunteer Hours',val:volH,target:benchmarks.volunteerHours||150,col:C.violet},
          ].map(({l,val,target,col})=>(
            <div key={l} style={{marginBottom:12}}>
              <div style={R({justifyContent:'space-between',marginBottom:4})}>
                <span style={{fontSize:12,color:C.t2,fontFamily:C.FB}}>{l}</span>
                <span style={{fontSize:11,fontFamily:C.FM,color:val>=target?C.green:C.t3,display:'inline-flex',alignItems:'center',gap:4}}>{val} / {target}{val>=target&&<Check size={11}/>}</span>
              </div>
              <Bar pct={Math.min((val/target)*100,100)} color={val>=target?C.green:col} h={6} glow={val>=target}/>
            </div>
          ))}
        </div>

        {/* Recent quiz scores table */}
        {recentScores.length>0&&<div style={glass()}>
          <SL>Recent Quiz Scores</SL>
          <div style={CC({gap:8})}>
            {recentScores.slice().reverse().map((record,i)=>{
              const quiz=ALL_QUIZZES.find(q=>q.id===record.quizId);const sc=scCol(record.score);
              return(
                <div key={i} style={{...glass2({padding:'12px 16px'}),...R()}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,color:C.t1,fontFamily:C.FD,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{quiz?.title||record.quizId}</div>
                    <div style={{fontSize:11,color:C.t3,marginTop:4}}>{quiz?.cat} · {new Date(record.completedAt).toLocaleDateString()}</div>
                  </div>
                  <div style={R({gap:12})}>
                    <div style={{width:90,height:5,background:C.s4,borderRadius:4,overflow:'hidden',alignSelf:'center'}}>
                      <div style={{height:'100%',width:`${record.score}%`,background:sc,borderRadius:4,boxShadow:`0 0 6px ${sc}60`}}/>
                    </div>
                    <span style={{fontSize:15, letterSpacing: 'calc(-0.02px + var(--msp-letter-spacing))',fontWeight:800,fontFamily:C.FM,color:sc,minWidth:44,textAlign:'right'}}>{record.score}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>}

        {/* Study activity heatmap — proof-of-the-work belongs here, not on Home's daily snapshot */}
        <div style={glass({padding:16,overflowX:'auto'})}>
          <StreakHeatmap accent={accent}/>
        </div>

        {/* Card review stats */}
        <div style={G(3,14,{},isMobile)}>
          <Stat label="Cards reviewed" value={totalReviews} icon={<Layers3 size={16}/>} color={C.violet} sub="Total all-time" m={isMobile}/>
          <Stat label="Decks due" value={dueDeckCount} icon={<CalendarDays size={16}/>} color={dueDeckCount>0?C.amber:C.green} sub={dueDeckCount>0?'Review these today':'All caught up!'} m={isMobile}/>
          <Stat label="Coach messages" value={aiChatCount} icon={<MessageCircle size={16}/>} color={C.cyan} sub="Medabrain conversations" m={isMobile}/>
        </div>
        </>}

        {progressView==='achievements'&&<>
        {/* Achievements — every locked badge shows a live progress bar via the shared
            achievementProgress memo (kept in sync with the Home strip and with the actual
            unlock conditions in checkAchievements). */}
        <div data-tour="progress-deep-achievements" style={glass({padding:16})}>
          <SL>Achievements ({achiev.size}/{Object.keys(ACHIEVEMENTS).length})</SL>
          <div style={G(4,10,{},isMobile)}>
            {Object.values(ACHIEVEMENTS).map(a=>{
              const has=achiev.has(a.key);const AIc=ACH_ICONS[a.icon]||Award;
              const prog=achievementProgress[a.key];const pct=prog?Math.min(100,Math.round((prog[0]/prog[1])*100)):null;
              return(
              <div key={a.key} title={`${a.name}: ${a.desc}${has?` (+${a.xp} XP)`:''}`} style={{...glass2({padding:12,textAlign:'center',opacity:has?1:.55,border:has?`1px solid ${C.amber}30`:undefined,transition:'opacity .2s'})}}>
                <div style={{display:'flex',justifyContent:'center',marginBottom:4}}><AIc size={20} color={has?C.amberL:C.t3}/></div>
                <div style={{fontSize:10,fontWeight:600,color:has?C.amberL:C.t3,lineHeight:1.3,fontFamily:C.FD}}>{a.name}</div>
                {has&&<div style={{...pill(C.amberDim,C.amberL,{fontSize:9,marginTop:4,fontFamily:C.FM})}}>+{a.xp}xp</div>}
                {!has&&pct!==null&&<div style={{marginTop:8}}>
                  <Bar pct={pct} color={accent} h={3}/>
                  <div style={{fontSize:9,color:C.t3,marginTop:4,fontFamily:C.FM}}>{prog[0]}/{prog[1]}</div>
                </div>}
              </div>
            );})}
          </div>
        </div>
        </>}
        </div>
      </div>
    );
  }

  // ── SETTINGS ──────────────────────────────────────────────────────────────────
  function tSettings(){
    const accent=settingsAccent;
    const briefEntryCount=getBriefEntries(user).length; // shadows the pathway accent — Settings has its own fixed color identity
    // Small section-group label used to chunk the long list of cards below into scannable
    // groups (Profile & Goals / Study Setup / Preferences & Data / Account) instead of one
    // undifferentiated stack — the actual cards inside are unchanged.
    const Group=({icon:Icon,title,children})=>(
      <div style={CC({gap:12})}>
        <div style={R({gap:8})}>
          <div style={{width:22,height:22,borderRadius:4,background:`${accent}18`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Icon size={12} color={accent}/></div>
          <span style={{fontSize:11,fontWeight:800,color:accent,letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))'}}>{title}</span>
        </div>
        {children}
      </div>
    );
    // Relative-time label for the sync badge below — deliberately coarse
    // (no seconds-level ticking) since "just now" vs "2m ago" is all a
    // student needs to trust that cross-device sync is actually working.
    const syncTimeLabel=(ts)=>{
      if(!ts)return null;
      const s=Math.max(0,Math.round((Date.now()-ts)/1000));
      if(s<10)return'just now';
      if(s<60)return`${s}s ago`;
      const m=Math.round(s/60);
      if(m<60)return`${m}m ago`;
      const h=Math.round(m/60);
      if(h<24)return`${h}h ago`;
      return`${Math.round(h/24)}d ago`;
    };
    return(
      <div style={CC({gap:28})}>
        {/* Hero */}
        <div style={{...glass({padding:24}),background:`linear-gradient(135deg,${accent}14,transparent)`,border:`1px solid ${accent}26`,display:'flex',alignItems:'center',gap:16,flexWrap:'wrap'}}>
          <div style={{width:58,height:58,borderRadius:16,background:`linear-gradient(135deg,${accent}55,${accent}28)`,border:`2px solid ${accent}45`,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,fontSize:24, letterSpacing: 'calc(-0.47px + var(--msp-letter-spacing))', lineHeight: 'calc(1.32 * var(--msp-line-scale))',color:onTint(accent),boxShadow:`0 8px 24px ${accent}30`,flexShrink:0}}>
            {user.name[0].toUpperCase()}
          </div>
          <div style={{flex:1,minWidth:200}}>
            <div style={{fontSize:11,fontWeight:700,color:accent,letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', marginBottom:4}}>Settings</div>
            <div style={R({gap:12,alignItems:'baseline',flexWrap:'wrap'})}>
              <h2 style={{fontSize:24, lineHeight: 'calc(1.32 * var(--msp-line-scale))',fontWeight:800,color:C.t1,fontFamily:C.FD,letterSpacing: 'calc(-0.47px + var(--msp-letter-spacing))',margin:0}}>{user.name}</h2>
              {user.age && <span style={{fontSize:14,color:C.t3,fontFamily:C.FM}}>Age {user.age}</span>}
            </div>
            <div style={R({gap:8,marginTop:8,flexWrap:'wrap'})}>
              <span style={pill(`${accent}20`,accent,{fontFamily:C.FM})}>Level {lvl} · {(user.xp||0).toLocaleString()} XP</span>
              {streak>0&&<span style={{...pill(C.amberDim,C.amberL,{fontSize:11}),display:'inline-flex',alignItems:'center',gap:4}}><Flame size={11}/>{streak} day streak</span>}
              <span style={pill(C.greenDim,C.greenL,{fontSize:11})}>{achiev.size} achievements</span>
            </div>
          </div>
        </div>

        {/* The sub-nav. Settings is seven unrelated jobs — who you are, how you study, who
            can see you, how it looks, what the coach knows, what it plays, and what happens to
            the account — and presenting them as one scroll meant the two people are most often
            sent here for (family access, accessibility) were the furthest down it. Each is a
            sub-tab with a URL now, so /settings/family is a link an invitation email can carry
            and /settings/appearance is one a support reply can paste. */}
        <SubNav items={settingsSubnav} active={settingsView} onChange={setSettingsView} accent={SETTINGS_SUBNAV.find(n=>n.id===settingsView)?.color||accent} m={isMobile} tourPrefix="settings-sub" hrefFor={settingsHref}/>

        {/* ── Appearance & Accessibility ──────────────────────────────────────── */}
        {/* Deliberately the first group. A student who needs larger text or less
            motion needs it before they can comfortably read anything else on
            this page, and burying it under four groups of profile fields is a
            small cruelty. */}
        {settingsView==='appearance'&&<>
        <Group icon={Accessibility} title="Appearance & accessibility">
          <AppearanceSettings settings={a11y} onChange={updateA11y} isMobile={isMobile} accent={accent}/>
        </Group>

        {/* ── How much of the app to show ─────────────────────────────────────── */}
        {/* The escape hatch for progressive unlocking. The default hides parts of the
            app a student hasn't reached yet — which is right for the 95% who told us
            the full nav was overwhelming, and wrong for the student who has already
            mapped the product and wants all of it now. Rather than argue about which
            of them is the real user, this is one switch, in the obvious place, that
            settles it per account. Flipping it on is instant and total; flipping it
            back off keeps everything already earned (unlocks are one-way, see
            featureUnlock.js) and only re-hides what was never reached. */}
        <Group icon={Compass} title="Navigation">
          <div style={glass({padding:16})}>
            <div style={R({justifyContent:'space-between',gap:16,flexWrap:'wrap'})}>
              <div style={{flex:1,minWidth:240}}>
                <SL extra={{marginBottom:4}}>Show every feature</SL>
                <p style={{fontSize:12.5,color:C.t3,lineHeight: 1.55,margin:0}}>
                  {user.navMode===NAV_MODES.EVERYTHING
                    ? <>Every tab and sub-tab is visible, including ones you haven't used yet.</>
                    : <>We're showing you {navItems.length} main sections and unlocking the rest as you go, so you always know where to start. Turn this on to see all of it now.</>}
                </p>
                {user.navMode!==NAV_MODES.EVERYTHING&&unlocks.locked().length>0&&(
                  <div style={{fontSize:11.5,color:C.t4,marginTop:8,fontFamily:C.FM}}>
                    {unlocks.locked().length} section{unlocks.locked().length===1?'':'s'} still to unlock
                  </div>
                )}
              </div>
              <button
                role="switch"
                aria-checked={user.navMode===NAV_MODES.EVERYTHING}
                onClick={()=>{
                  const on=user.navMode!==NAV_MODES.EVERYTHING;
                  saveUser({...user,navMode:on?NAV_MODES.EVERYTHING:NAV_MODES.GUIDED});
                  play('select');
                  toast.success(on?'Showing every feature.':'Back to guided — everything you’ve unlocked stays unlocked.');
                }}
                style={{...(user.navMode===NAV_MODES.EVERYTHING?btn(accentGrad(accent),{fontSize:12,padding:'8px 16px'}):btnG({fontSize:12,padding:'8px 16px'})),flexShrink:0}}
              >
                {user.navMode===NAV_MODES.EVERYTHING?<><Check size={14}/>Showing everything</>:<><Layers size={14}/>Show everything</>}
              </button>
            </div>
          </div>

          {/* ── The same escape hatch, one level down ──────────────────────────
              The switch above decides which TABS exist; this one decides how much of the
              dashboard leads with progress readings. They are separate because they answer
              separate complaints: "I cannot find anything" and "the first thing I see is a
              page of zeros about me". A student can want either fix without the other.
              Both are reversible and neither ever hides data — every deferred module is on
              its own tab the whole time. See src/lib/dashboardStages.js. */}
          <div style={glass({padding:16,marginTop:12})}>
            <div style={R({justifyContent:'space-between',gap:16,flexWrap:'wrap'})}>
              <div style={{flex:1,minWidth:240}}>
                <SL extra={{marginBottom:4}}>Dashboard modules</SL>
                <p style={{fontSize:12.5,color:C.t3,lineHeight: 1.55,margin:0}}>
                  {user.homeDensity==='full'
                    ? <>Your dashboard shows every module, including ones with nothing in them yet.</>
                    : <>Your dashboard shows a module once there is something for it to measure — hours once you log an activity, deadlines once you have one. Nothing is hidden: all of it is on its own tab right now.</>}
                </p>
                {user.homeDensity!=='full'&&home.deferred.length>0&&(
                  <div style={{fontSize:11.5,color:C.t4,marginTop:8,fontFamily:C.FM}}>
                    {home.deferred.length} module{home.deferred.length===1?'':'s'} waiting on data
                  </div>
                )}
              </div>
              <button
                role="switch"
                aria-checked={user.homeDensity==='full'}
                onClick={()=>{
                  const on=user.homeDensity!=='full';
                  saveUser({...user,homeDensity:on?'full':'auto'});
                  play('select');
                  toast.success(on?'Showing every dashboard module.':'Back to a dashboard that grows with you — nothing you have earned goes away.');
                }}
                style={{...(user.homeDensity==='full'?btn(accentGrad(accent),{fontSize:12,padding:'8px 16px'}):btnG({fontSize:12,padding:'8px 16px'})),flexShrink:0}}
              >
                {user.homeDensity==='full'?<><Check size={14}/>Showing all modules</>:<><Layers size={14}/>Show all modules</>}
              </button>
            </div>
          </div>
        </Group>
        </>}

        {/* ── What Medabrain knows about you ─────────────────────────────────── */}
        {settingsView==='medabrain'&&
        <Group icon={Brain} title="What Medabrain knows about you">
          <div style={glass({padding:16})}>
            <SL>Your personal brief</SL>
            <p style={{fontSize:13,color:C.t2,marginBottom:12,lineHeight: 1.55}}>
              {briefEntryCount>0
                ? <>You've told Medabrain <strong style={{color:C.t1}}>{briefEntryCount} thing{briefEntryCount===1?'':'s'}</strong> about yourself in your own words. Every answer you get — in the coach, in Portfolio, in Prep and in the SAT tab — is shaped by this first, ahead of your sign-up answers and your tracked data.</>
                : <>Medabrain currently only knows the boxes you ticked when you signed up. Talk to it about your family, your school, what worries you and where you want to end up, and it will use that everywhere in the app — and treat it as more authoritative than anything else it has.</>}
            </p>
            <button style={{...btn(C.violetGrad,{fontSize:12,padding:'8px 16px'})}} onClick={()=>{setTab('prep');setPrepView('coach');setCoachView('about');}}>
              <Volume2 size={14}/>{briefEntryCount>0?'Add or edit what it knows':'Tell Medabrain about yourself'}
            </button>
          </div>
        </Group>}

        {/* ── Profile & Goals ─────────────────────────────────────────────────── */}
        {settingsView==='profile'&&
        <Group icon={UserCog} title="Profile & goals">
        <div data-tour="settings-deep-profile" style={glass()}>
          <SL>Display Name</SL>
          <div style={CC({gap:4,marginBottom:12})}><input style={inp()} placeholder={user.name} value={sName} onChange={e=>setSN(e.target.value)}/></div>
          <button style={btn(accentGrad(accent))} onClick={()=>{if(!sName.trim())return;const nextName=sName.trim();saveUser({...user,name:nextName});AuthAPI.updateMe({name:nextName}).then(({user:updated})=>onAccountChange?.(updated)).catch(()=>{});setSN('');toast.success('Name updated');}}>Save name</button>

          <div style={{marginTop:16}}>
            <SL>Age</SL>
            <div style={CC({gap:4,marginBottom:12})}><input style={inp({width:'auto'})} type="number" min="5" max="120" placeholder={user.age ? String(user.age) : 'Your age'} value={sAge} onChange={e=>setSAge(e.target.value)}/></div>
            <button style={btn(accentGrad(accent))} onClick={()=>{const age=Number(sAge);if(isNaN(age)||age<5||age>120)return;saveUser({...user,age});setSAge('');toast.success('Age updated');}}>Save age</button>
          </div>
        </div>

        {/* Streak goals live in Progress → Streak, next to the calendar and the reward ladder
            they steer — changing "how much is a day" only makes sense with the record of your
            days in front of you. This card exists so Settings, the tab everyone searches when
            they want to change something, still leads there instead of dead-ending. */}
        <div style={glass()}>
          <div style={R({justifyContent:'space-between',marginBottom:8,flexWrap:'wrap',gap:8})}>
            <SL extra={{marginBottom:0}}>Streak Goals</SL>
            <span style={{...pill(C.amberDim,C.amberL,{fontSize:11}),display:'inline-flex',alignItems:'center',gap:4}}>
              <Flame size={11}/>{streak} day{streak===1?'':'s'}
            </span>
          </div>
          <p style={{fontSize:13,color:C.t3,lineHeight:1.6,marginTop:0}}>
            You're on the <strong style={{color:C.t2}}>{getGoal(user?.streakGoalId).label}</strong> daily
            goal ({todayStatus.goalCredits} credits — {getGoal(user?.streakGoalId).examples[0]}), aiming
            for a <strong style={{color:C.t2}}>{streakTarget}-day</strong> streak. A day only counts once
            you've actually finished that much work; opening the app doesn't count.
          </p>
          <button style={{...btnG({fontSize:12}),display:'inline-flex',alignItems:'center',gap:4,marginTop:4}} onClick={()=>goProgress('streak')}>
            <Flame size={12}/>Change in Progress → Streak<ChevronRight size={12}/>
          </button>
        </div>

        {/* Your Goals — onboarding answers, editable after the fact so they don't stay locked in
            forever. Feeds Medabrain's system prompt (src/lib/studentProfile.js) and the Progress
            overview recap card, so updating this here actually changes those. */}
        <div data-tour="settings-deep-goals" style={glass()}>
          <div style={R({justifyContent:'space-between',marginBottom:8})}>
            <SL extra={{marginBottom:0}}>Your Goals</SL>
            {!sGoalsEditing&&<button style={{...btnG({fontSize:11,padding:'4px 12px'}),display:'inline-flex',alignItems:'center',gap:4}} onClick={()=>{setSGoal(user.goal||null);setSObstacles(user.obstacles||[]);setSStudyMethod(user.studyMethod||null);setSAccomplish(user.accomplish||[]);setSStudyHours(user.studyHours||null);setSGoalsEditing(true);}}><Pencil size={12}/>Edit</button>}
          </div>
          {!sGoalsEditing?(
            onboardingRecap.length>0?(
              <div style={CC({gap:8})}>
                {onboardingRecap.map(item=>(
                  <div key={item.label}>
                    <div style={{fontSize:10,fontWeight:700,color:C.t3,letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))'}}>{item.label}</div>
                    <div style={{fontSize:13,color:C.t1,marginTop:4}}>{item.value}</div>
                  </div>
                ))}
              </div>
            ):(
              <p style={{fontSize:13,color:C.t3,lineHeight: 1.55}}>You haven't set a goal yet — click Edit to tell Medabrain what you're working toward, what's slowing you down, and what you want to accomplish.</p>
            )
          ):(
            <div style={CC({gap:16})}>
              <div id="settings-field-goal" style={focusStyle('goal')}>
                <SL>Top goal</SL>
                <div style={CC({gap:4})}>
                  {GOAL_OPTIONS.map(o=>(
                    <div key={o.value} onClick={()=>setSGoal(o.value)} style={{...glass2({padding:'8px 12px',cursor:'pointer',border:sGoal===o.value?`1px solid ${accent}60`:undefined}),display:'flex',alignItems:'center',gap:8}}>
                      <div style={{width:16,height:16,borderRadius:'50%',border:`2px solid ${sGoal===o.value?accent:C.b2}`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{sGoal===o.value&&<div style={{width:8,height:8,borderRadius:'50%',background:accent}}/>}</div>
                      <span style={{fontSize:12.5,color:C.t2}}>{o.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div id="settings-field-obstacles" style={focusStyle('obstacles')}>
                <SL>What's in your way (select all that apply)</SL>
                <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'repeat(2,1fr)',gap:4}}>
                  {OBSTACLE_OPTIONS.map(o=>{const checked=sObstacles.includes(o.value);return(
                    <div key={o.value} onClick={()=>setSObstacles(list=>checked?list.filter(v=>v!==o.value):[...list,o.value])} style={{...glass2({padding:'8px 12px',cursor:'pointer',border:checked?`1px solid ${accent}60`:undefined}),display:'flex',alignItems:'center',gap:8}}>
                      <div style={{width:15,height:15,borderRadius:4,border:`2px solid ${checked?accent:C.b2}`,background:checked?accent:'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{checked&&<Check size={10} color="#fff"/>}</div>
                      <span style={{fontSize:12,color:C.t2}}>{o.label}</span>
                    </div>
                  );})}
                </div>
              </div>
              <div id="settings-field-accomplish" style={focusStyle('accomplish')}>
                <SL>What you want to accomplish (select all that apply)</SL>
                <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'repeat(2,1fr)',gap:4}}>
                  {ACCOMPLISH_OPTIONS.map(o=>{const checked=sAccomplish.includes(o.value);return(
                    <div key={o.value} onClick={()=>setSAccomplish(list=>checked?list.filter(v=>v!==o.value):[...list,o.value])} style={{...glass2({padding:'8px 12px',cursor:'pointer',border:checked?`1px solid ${accent}60`:undefined}),display:'flex',alignItems:'center',gap:8}}>
                      <div style={{width:15,height:15,borderRadius:4,border:`2px solid ${checked?accent:C.b2}`,background:checked?accent:'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{checked&&<Check size={10} color="#fff"/>}</div>
                      <span style={{fontSize:12,color:C.t2}}>{o.label}</span>
                    </div>
                  );})}
                </div>
              </div>
              <div id="settings-field-studyMethod" style={focusStyle('studyMethod')}>
                <SL>Current study method</SL>
                <div style={CC({gap:4})}>
                  {STUDY_METHOD_OPTIONS.map(o=>(
                    <div key={o.value} onClick={()=>setSStudyMethod(o.value)} style={{...glass2({padding:'8px 12px',cursor:'pointer',border:sStudyMethod===o.value?`1px solid ${accent}60`:undefined}),display:'flex',alignItems:'center',gap:8}}>
                      <div style={{width:16,height:16,borderRadius:'50%',border:`2px solid ${sStudyMethod===o.value?accent:C.b2}`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{sStudyMethod===o.value&&<div style={{width:8,height:8,borderRadius:'50%',background:accent}}/>}</div>
                      <span style={{fontSize:12.5,color:C.t2}}>{o.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div id="settings-field-studyHours" style={focusStyle('studyHours')}>
                <SL>Weekly study time</SL>
                <div style={CC({gap:4})}>
                  {STUDY_HOURS_OPTIONS.map(o=>(
                    <div key={o.value} onClick={()=>setSStudyHours(o.value)} style={{...glass2({padding:'8px 12px',cursor:'pointer',border:sStudyHours===o.value?`1px solid ${accent}60`:undefined}),display:'flex',alignItems:'center',gap:8}}>
                      <div style={{width:16,height:16,borderRadius:'50%',border:`2px solid ${sStudyHours===o.value?accent:C.b2}`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{sStudyHours===o.value&&<div style={{width:8,height:8,borderRadius:'50%',background:accent}}/>}</div>
                      <span style={{fontSize:12.5,color:C.t2}}>{o.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={R({gap:8})}>
                <button style={btn()} onClick={()=>{saveUser({...user,goal:sGoal,obstacles:sObstacles,studyMethod:sStudyMethod,accomplish:sAccomplish,studyHours:sStudyHours});setSGoalsEditing(false);toast.success('Goals updated — Medabrain will use this right away.');}}>Save goals</button>
                <button style={btnG()} onClick={()=>setSGoalsEditing(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
        </Group>}

        {/* ── Study Setup ──────────────────────────────────────────────────────── */}
        {settingsView==='study'&&
        <Group icon={Route} title="Study setup">
        {/* Graduation year — the core attribute the whole app sequences itself around.
            It is stored instead of the grade so it never goes stale: the grade is derived from
            today's date, which means it advances by itself every August 1 with nobody editing
            anything (see src/lib/gradeBand.js). This editor exists for the case the arithmetic
            cannot see — a student who skipped a grade, repeated one, or graduated early — and
            for the student who mis-tapped it on step two. Changing it changes EMPHASIS ONLY:
            what lands in the active task list and what opens in preview. Nothing anywhere in
            the app becomes unreachable at any class year. */}
        <div style={glass({padding:16})}>
          <SL>Graduation year</SL>
          <p style={{fontSize:12,color:C.t2,marginBottom:12,lineHeight: 1.55}}>The year you finish high school. It drives your timeline, your roadmap, which lessons come first, and how Medabrain paces its advice. We roll it forward every August, so you should never have to touch this — and changing it never hides anything: every feature stays open at every year.</p>
          <div style={R({gap:8,flexWrap:'wrap'})}>
            {(()=>{const cur=graduationYearFor_user(user);const list=graduationYearChoices();const years=cur&&!list.includes(cur)?[...list,cur].sort((a,b)=>a-b):list;return years.map(y=>{
              const on=cur===y;
              const info=graduationYearLabel(y);
              const b=bandOfGrade(info.gradeStage);
              return (
                <button key={y} onClick={()=>{if(on)return;const patch=confirmationStamp(y);saveUser({...user,...patch});AuthAPI.updateMe({gradeLevel:patch.gradeStage}).then(({user:updated})=>onAccountChange?.(updated)).catch(()=>{});toast.success(`Class of ${y} — ${info.sub}`);}} style={{
                  ...glass2({padding:'8px 12px',cursor:'pointer',border:on?`1px solid ${tint(accent,0.55)}`:undefined,background:on?tint(accent,0.12):undefined}),
                  textAlign:'left',
                }}>
                  <div style={{fontSize:12.5,fontWeight:700,color:on?accentText(accent):C.t2,fontFamily:C.FM}}>{y}</div>
                  <div style={{fontSize:10.5,color:C.t3,marginTop:4}}>{info.sub}{b?` · ${BAND_BY_ID[b].label}`:''}</div>
                </button>
              );
            });})()}
          </div>
        </div>

        {/* Grades & Test Timing. Both fields are plan-readiness gates (PLAN_READINESS_FIELDS in
            src/lib/studentProfile.js) and both were, until now, collected during onboarding and
            editable nowhere — so a legacy account missing either one was shown "A few things
            first" on the Plans tab with a button to Settings that led to no way of answering it.
            That is a dead end, not a gate. Saving here also feeds the Medabrain system prompt,
            the admissions calculator's comparable GPA, and the plan's pacing. */}
        <div style={{...glass({padding:16}),...focusStyle('gpaBand')}} id="settings-field-gpaBand">
          <SL>Your Grades</SL>
          <p style={{fontSize:12,color:C.t2,marginBottom:12,lineHeight: 1.55}}>The one academic fact Medabrain's Oracle needs before it will build your full plan — roughly where your grades sit. Rough is fine; it paces the plan, it isn't a transcript.</p>
          <div>
            <SL>Your grades right now</SL>
            <div style={R({gap:8,flexWrap:'wrap'})}>
              {GPA_OPTIONS.map(o=>{
                const on=(user?.gpaBand||null)===o.value;
                return(
                  <button key={o.value} onClick={()=>{saveUser({...user,gpaBand:o.value});toast.success('Grades updated');}} style={{
                    ...glass2({padding:'8px 12px',cursor:'pointer',border:on?`1px solid ${tint(accent,0.55)}`:undefined,background:on?tint(accent,0.12):undefined}),
                    fontSize:12.5,fontWeight:on?700:500,color:on?accentText(accent):C.t2,textAlign:'left',
                  }}>{o.label}</button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Science coursework and hands-on health experience. Not readiness gates, but both are
            read directly by the plan generator and the coach prompt, and both were onboarding-only
            — so the app's picture of a student froze on the day they signed up. */}
        <div style={glass({padding:16})}>
          <SL>Science Courses & Health Experience</SL>
          <p style={{fontSize:12,color:C.t2,marginBottom:12,lineHeight: 1.55}}>Keep these current as you take more classes and get more hours in — your plan and Medabrain's advice both change when they do.</p>
          <div style={{marginBottom:16}}>
            <SL>Science courses taken or in progress</SL>
            <div style={R({gap:8,flexWrap:'wrap'})}>
              {SCIENCE_OPTIONS.map(o=>{
                const on=(user?.sciences||[]).includes(o.value);
                return(
                  <button key={o.value} onClick={()=>{
                    const cur=user?.sciences||[];
                    saveUser({...user,sciences:on?cur.filter(v=>v!==o.value):[...cur,o.value]});
                  }} style={{
                    ...glass2({padding:'8px 12px',cursor:'pointer',border:on?`1px solid ${tint(accent,0.55)}`:undefined,background:on?tint(accent,0.12):undefined}),
                    fontSize:12,fontWeight:on?700:500,color:on?accentText(accent):C.t2,display:'inline-flex',alignItems:'center',gap:4,
                  }}>{on&&<Check size={11}/>}{o.label}</button>
                );
              })}
            </div>
          </div>
          <div>
            <SL>Hands-on health experience</SL>
            <div style={R({gap:8,flexWrap:'wrap'})}>
              {EXPERIENCE_OPTIONS.map(o=>{
                const on=(user?.healthExperience||[]).includes(o.value);
                return(
                  <button key={o.value} onClick={()=>{
                    const cur=user?.healthExperience||[];
                    saveUser({...user,healthExperience:on?cur.filter(v=>v!==o.value):[...cur,o.value]});
                  }} style={{
                    ...glass2({padding:'8px 12px',cursor:'pointer',border:on?`1px solid ${tint(accent,0.55)}`:undefined,background:on?tint(accent,0.12):undefined}),
                    fontSize:12,fontWeight:on?700:500,color:on?accentText(accent):C.t2,display:'inline-flex',alignItems:'center',gap:4,
                  }}>{on&&<Check size={11}/>}{o.label}</button>
                );
              })}
            </div>
          </div>
        </div>

        <div data-tour="settings-deep-studytrack" style={glass()}>
          <div style={R({justifyContent:'space-between',marginBottom:8})}>
            <SL extra={{marginBottom:0}}>Study Track</SL>
            <button style={{...btnG({fontSize:11,padding:'4px 12px'}),display:'inline-flex',alignItems:'center',gap:4}} onClick={()=>{setDIntro(true);goPrep('diagnostic');}}>Full pathway details<ChevronRight size={12}/></button>
          </div>
          <p style={{fontSize:13,color:C.t2,marginBottom:16}}>Current: <span style={{color:accentText(curPath?.accent||accent),fontWeight:700,fontFamily:C.FD}}>{curPath?.label}</span></p>
          <div style={G(2,10,{},isMobile)}>
            {Object.entries(PATHS).map(([key,p])=>(
              <motion.div key={key} whileHover={{borderColor:`${p.accent}40`}} onClick={()=>setSS(sSpec===key?'':key)} style={{...glass2({padding:16,cursor:'pointer',border:sSpec===key?`1px solid ${p.accent}60`:eSpec===key?`1px solid ${p.accent}30`:undefined,transition:'border-color .15s'})}}>
                <div style={{fontSize:13,fontWeight:700,color:sSpec===key?accentText(p.accent):eSpec===key?accentText(p.accent):C.t2,fontFamily:C.FD}}>{p.label}</div>
                {p.tagline&&<div style={{fontSize:10.5,color:C.t3,marginTop:4,lineHeight:1.5}}>{p.tagline}</div>}
                <div style={{fontSize:11,color:C.t4,marginTop:4,fontFamily:C.FM}}>{p.units.length} units · {p.units.reduce((s,u)=>s+u.lessons.length,0)} lessons</div>
                {eSpec===key&&<div style={{fontSize:10,color:accentText(p.accent),marginTop:4,fontWeight:700,display:'inline-flex',alignItems:'center',gap:4}}><Check size={10}/>Current</div>}
              </motion.div>
            ))}
          </div>
          {sSpec&&sSpec!==eSpec&&<motion.button whileHover={{scale:1.02}} whileTap={{scale:.98}} style={{...btn(),marginTop:16}} onClick={()=>{switchPath(sSpec);setSS('');}}>Switch to {PATHS[sSpec]?.label}</motion.button>}
        </div>

        <div data-tour="settings-deep-courseload" style={glass({padding:20})}>
          <div style={{...R({justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:8}),marginBottom:4}}>
            <SL extra={{marginBottom:0}}>Current Course Load</SL>
            <span style={pill(tint(accent,0.14),accent,{fontSize:10.5,fontWeight:800})}>
              {(user.courses||[]).length} selected
            </span>
          </div>
          <p style={{fontSize:13,color:C.t2,marginBottom:16,lineHeight:1.6}}>Tell us what you're taking so Medabrain and the Quiz Library can point you to relevant material — this feeds directly into your quiz recommendations and AI coaching.</p>
          {COURSE_GROUPS.map(g=>{
            const GroupIcon=COURSE_GROUP_ICONS[g.group]||BookOpen;
            const groupActiveCount=g.items.filter(c=>(user.courses||[]).includes(c)).length;
            return(
              <div key={g.group} style={{marginBottom:16}}>
                <div style={{...R({gap:8}),marginBottom:8}}>
                  <GroupIcon size={12} color={C.t3}/>
                  <span style={{fontSize:10,fontWeight:700,color:C.t3,letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))'}}>{g.group}</span>
                  {groupActiveCount>0&&<span style={{fontSize:10,fontWeight:700,color:accent,fontFamily:C.FM}}>· {groupActiveCount}</span>}
                </div>
                <div style={R({gap:8,flexWrap:'wrap'})}>
                  {g.items.map(course=>{
                    const active=(user.courses||[]).includes(course);
                    return(
                      <motion.button key={course} type="button" whileHover={{y:-1}} whileTap={{scale:0.96}}
                        onClick={()=>{
                          const next=active?(user.courses||[]).filter(c=>c!==course):[...(user.courses||[]),course];
                          saveUser({...user,courses:next});
                        }}
                        style={{
                          display:'inline-flex',alignItems:'center',gap:4,padding:'8px 12px',borderRadius:8,cursor:'pointer',
                          fontSize:12,fontWeight:600,fontFamily:C.FB,transition:'background .15s,border-color .15s,color .15s',
                          background:active?tint(accent,0.16):C.s3,
                          border:`1px solid ${active?`${accent}55`:C.b1}`,
                          color:active?accent:C.t2,
                        }}>
                        {active&&<Check size={11}/>}{course}
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div style={{...R({gap:8,marginTop:4,paddingTop:16,borderTop:`1px solid ${C.b1}`})}}>
            <button type="button" role="switch" aria-checked={!!user.apIb} onClick={()=>saveUser({...user,apIb:!user.apIb})} style={{width:40,height:22,borderRadius:12,background:user.apIb?accent:C.s4,cursor:'pointer',position:'relative',transition:'background .2s',flexShrink:0,border:`1px solid ${user.apIb?accent:C.b2}`,padding:0}}>
              <div style={{width:16,height:16,borderRadius:'50%',background:user.apIb?'#fff':C.s1,border:user.apIb?'none':`1px solid ${C.b2}`,position:'absolute',top:2,left:2,transform:`translateX(${user.apIb?18:0}px)`,transition:'transform 140ms cubic-bezier(.4,0,.2,1)',boxShadow:C.shadowSm}}/>
            </button>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:C.t1}}>I'm an AP/IB student</div>
              <div style={{fontSize:11,color:C.t3,marginTop:4}}>Unlocks AP/IB exam dates on your Milestones tab</div>
            </div>
          </div>
        </div>
        </Group>}

        {/* ── Preferences & Data ───────────────────────────────────────────────── */}
        {settingsView==='data'&&
        <Group icon={Volume2} title="Preferences & data">
        <div data-tour="settings-deep-preferences" style={glass({padding:16})}>
          <div style={R({justifyContent:'space-between'})}>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:C.t1,fontFamily:C.FD}}>Sound Effects</div>
              <div style={{fontSize:11,color:C.t3,marginTop:4}}>Audio feedback for correct answers, level-ups, and achievements</div>
            </div>
            <div onClick={()=>{const v=!sfxOn;setSfxOn(v);setSFX(v);}} style={{width:44,height:24,borderRadius:12,background:sfxOn?accent:C.s4,cursor:'pointer',position:'relative',transition:'background .2s',flexShrink:0,border:`1px solid ${sfxOn?accent:C.b2}`}}>
              <div style={{width:18,height:18,borderRadius:'50%',background:sfxOn?'#fff':C.s1,border:sfxOn?'none':`1px solid ${C.b2}`,position:'absolute',top:2,left:2,transform:`translateX(${sfxOn?20:0}px)`,transition:'transform 140ms cubic-bezier(.4,0,.2,1)',boxShadow:C.shadowSm}}/>
            </div>
          </div>
          <div style={{...R({justifyContent:'space-between'}),marginTop:16,paddingTop:16,borderTop:`1px solid ${C.b1}`}}>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:C.t1,fontFamily:C.FD}}>Celebration Effects</div>
              <div style={{fontSize:11,color:C.t3,marginTop:4}}>Confetti bursts for level-ups, streaks, and achievements</div>
            </div>
            <div onClick={()=>{const v=!confettiOn;setConfettiOn(v);setConfettiEnabled(v);}} style={{width:44,height:24,borderRadius:12,background:confettiOn?accent:C.s4,cursor:'pointer',position:'relative',transition:'background .2s',flexShrink:0,border:`1px solid ${confettiOn?accent:C.b2}`}}>
              <div style={{width:18,height:18,borderRadius:'50%',background:confettiOn?'#fff':C.s1,border:confettiOn?'none':`1px solid ${C.b2}`,position:'absolute',top:2,left:2,transform:`translateX(${confettiOn?20:0}px)`,transition:'transform 140ms cubic-bezier(.4,0,.2,1)',boxShadow:C.shadowSm}}/>
            </div>
          </div>
        </div>

        {/* Honors the "you can change this anytime in Settings" promise made during onboarding's
            toggleAddBack/toggleRollover steps — see applyRolloverPrefs/applyAddBackPrefs in
            masterPlanGenerator.js for how these actually shape the Plans tab's day-by-day plan. */}
        <div data-tour="settings-deep-planprefs" style={glass({padding:16})}>
          <div style={R({justifyContent:'space-between'})}>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:C.t1,fontFamily:C.FD}}>Add Extra Sessions Back</div>
              <div style={{fontSize:11,color:C.t3,marginTop:4}}>If you finish a day's plan early, tomorrow's load gets a little lighter.</div>
            </div>
            <div onClick={()=>saveUser({...user,addBack:!(user.addBack!==false)})} style={{width:44,height:24,borderRadius:12,background:user.addBack!==false?accent:C.s4,cursor:'pointer',position:'relative',transition:'background .2s',flexShrink:0,border:`1px solid ${user.addBack!==false?accent:C.b2}`}}>
              <div style={{width:18,height:18,borderRadius:'50%',background:user.addBack!==false?'#fff':C.s1,border:user.addBack!==false?'none':`1px solid ${C.b2}`,position:'absolute',top:2,left:2,transform:`translateX(${user.addBack!==false?20:0}px)`,transition:'transform 140ms cubic-bezier(.4,0,.2,1)',boxShadow:C.shadowSm}}/>
            </div>
          </div>
          <div style={{...R({justifyContent:'space-between'}),marginTop:16,paddingTop:16,borderTop:`1px solid ${C.b1}`}}>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:C.t1,fontFamily:C.FD}}>Rollover Missed Sessions</div>
              <div style={{fontSize:11,color:C.t3,marginTop:4}}>Missed tasks get folded into the next generated day instead of lost.</div>
            </div>
            <div onClick={()=>saveUser({...user,rollover:!(user.rollover!==false)})} style={{width:44,height:24,borderRadius:12,background:user.rollover!==false?accent:C.s4,cursor:'pointer',position:'relative',transition:'background .2s',flexShrink:0,border:`1px solid ${user.rollover!==false?accent:C.b2}`}}>
              <div style={{width:18,height:18,borderRadius:'50%',background:user.rollover!==false?'#fff':C.s1,border:user.rollover!==false?'none':`1px solid ${C.b2}`,position:'absolute',top:2,left:2,transform:`translateX(${user.rollover!==false?20:0}px)`,transition:'transform 140ms cubic-bezier(.4,0,.2,1)',boxShadow:C.shadowSm}}/>
            </div>
          </div>
        </div>

        <div data-tour="settings-deep-backup" style={glass({padding:16})}>
          <SL>Data & Backup</SL>
          <p style={{fontSize:13,color:C.t2,marginBottom:12,lineHeight:1.65}}>Export all your progress data as a JSON file. Useful for backup or transferring to a new device.</p>
          <button style={{...btnG({fontSize:12,padding:'8px 16px'}),display:'inline-flex',alignItems:'center',gap:4}} onClick={()=>{DB.exportAllData();toast.success('Export started — check your Downloads folder');}}><Package size={14}/>Export all data</button>
        </div>

        <div style={glass({padding:16})}>
          <SL>Medabrain Chat History</SL>
          <p style={{fontSize:13,color:C.t2,marginBottom:12,lineHeight:1.65}}>Clear every saved Medabrain conversation — a scoped reset that leaves your XP, streak, quiz scores, and pathway progress untouched.</p>
          <button style={{...btnSm(C.roseDim,{color:C.rose,border:`1px solid ${C.rose}30`,fontSize:12,padding:'8px 16px'}),display:'inline-flex',alignItems:'center',gap:4}} onClick={clearAllChats}><Trash2 size={13}/>Clear all chats{coachThreads.length>0?` (${coachThreads.length})`:''}</button>
        </div>

        <div style={glass({padding:16})}>
          <SL>Help</SL>
          <p style={{fontSize:13,color:C.t2,marginBottom:12,lineHeight:1.65}}>Not sure where everything lives? Replay the full guided tour — every tab, every sub-view inside Prep, Portfolio, and Progress, Settings, and the ⌘K quick-switcher.</p>
          <div style={R({gap:8,flexWrap:'wrap'})}>
            <button style={{...btnG({fontSize:12,padding:'8px 16px'}),display:'inline-flex',alignItems:'center',gap:4}} onClick={startTour}><Compass size={14}/>Replay app tour</button>
            {/* Dev-only: preview the first-run onboarding wizard without touching this account's
                saved profile. Kept as a minimal inline link (not a full card) so it doesn't
                compete for attention with real settings. Remove once onboarding is stable. */}
            <button style={{...btnG({fontSize:12,padding:'8px 16px',opacity:0.6}),display:'inline-flex',alignItems:'center',gap:4}} onClick={()=>setPreviewOnboarding(true)} title="Dev-only — doesn't touch your saved profile"><RotateCcw size={14}/>Replay onboarding</button>
          </div>
        </div>
        </Group>}

        {/* ── Family Access ────────────────────────────────────────────────────
            The student's side of the parent dashboard, and the reason the feature is a consent
            mechanism rather than a monitoring one: whoever can see this account is listed here,
            and one tap ends it — with no appeal to the parent and no delay, because
            getActiveLink is re-read on every single request rather than cached on the session
            (see api/_lib/session.js).

            It was a card at the bottom of the Account group, under sign-out, the data-export
            controls and the danger zone. Nothing about a shared-access control belongs below a
            delete-my-account button: this is the screen a student is sent to by a parent who is
            waiting on them, so it is a sub-tab with a URL (/settings/family) that the invitation
            email links to directly. */}
        {settingsView==='family'&&
        <Group icon={Users} title="Family access">
          <div style={glass({padding:16})}>
            <SL>Who can see your progress</SL>
            <p style={{fontSize:13,color:C.t2,marginBottom:12,lineHeight:1.65}}>
              Share your progress with a parent or guardian. They'd see your streak, XP, lessons passed and test scores — never your Medabrain chats, your lesson notes, or your essays. Nothing is shared until they accept, and you can cut it off here at any time.
            </p>
            {/* Said here because the student is the one who gets asked "how do I do this?" — and
                because the honest answer removes the objection. The old flow made inviting a
                parent feel like signing them up for something; it is now a link and half a
                minute. */}
            <p style={{fontSize:12.5,color:C.t3,marginBottom:12,lineHeight:1.65}}>
              It's quick for them: they open the link in the email, read what would be shared, and
              press confirm — no password, no code to wait for, and they never sign in as you. If
              you'd rather text them the link yourself, use "Just give me the link" below; that
              route asks them for a 6-digit code at the address you invited, because a link you
              sent through WhatsApp isn't proof of who opened it.
            </p>
            {/* Said on the student's screen because they are the one who decides to invite, and
                because "they can message me" is a fact about the deal they are agreeing to. */}
            <p style={{fontSize:12.5,color:C.t3,marginBottom:12,lineHeight:1.65}}>
              Once you're connected they can also send you a short note, a question, or a request
              to sit a quiz on a topic. It appears here, never as an email or a notification, and
              you can answer in a line, mark it done, or say not this week. None of it changes
              your plan.
            </p>
            <ConnectionsPanel role="student" />
          </div>

          {/* Exactly what crosses the line and what does not, side by side and always visible —
              not folded into a disclosure. A student deciding whether to invite a parent is
              making a privacy decision, and the answer to "what would they actually see" has to
              be on the screen where the decision is made rather than one tap away in a policy. */}
          <div style={glass({padding:16})}>
            <SL>What a parent would see</SL>
            <div style={G(2,14,{},isMobile)}>
              <div>
                <div style={{fontSize:11,fontWeight:800,color:C.greenL,letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', marginBottom:8}}>Shared</div>
                {['Study streak and days studied','XP, level and lessons passed','Quiz averages and practice-test scores','Achievements you have earned'].map(t=>(
                  <div key={t} style={{...R({gap:8,alignItems:'flex-start'}),marginBottom:8}}>
                    <Check size={13} color={C.greenL} style={{flexShrink:0,marginTop:4}}/>
                    <span style={{fontSize:12.5,color:C.t2,lineHeight:1.5}}>{t}</span>
                  </div>
                ))}
              </div>
              <div>
                <div style={{fontSize:11,fontWeight:800,color:C.t3,letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', marginBottom:8}}>Never shared</div>
                {['Medabrain conversations','Lesson notes and highlights','Essay drafts and application writing','Individual quiz answers'].map(t=>(
                  <div key={t} style={{...R({gap:8,alignItems:'flex-start'}),marginBottom:8}}>
                    <X size={13} color={C.t3} style={{flexShrink:0,marginTop:4}}/>
                    <span style={{fontSize:12.5,color:C.t2,lineHeight:1.5}}>{t}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* The other direction: a parent who does not have an account yet. Every other route
              into the parent dashboard assumes the parent found it themselves; this one lets the
              student hand it over, which is how most of these actually start. */}
          <div style={glass({padding:16})}>
            <SL>Your parent doesn't have an account yet?</SL>
            <p style={{fontSize:13,color:C.t2,marginBottom:12,lineHeight:1.65}}>
              Send them this link. It explains the parent dashboard, what it shows and what it
              never shows, and walks them through creating their own account — they never sign in
              as you, and they never see this side of the app.
            </p>
            <div style={R({gap:8,flexWrap:'wrap'})}>
              <a href={PARENT_HUB_PATH} target="_blank" rel="noopener noreferrer" style={{...btnG({fontSize:12,padding:'8px 16px'}),textDecoration:'none'}}>
                <ExternalLink size={14}/>Open the parent page
              </a>
              <button style={{...btnG({fontSize:12,padding:'8px 16px'})}} onClick={()=>{
                const url=`${window.location.origin}${PARENT_HUB_PATH}`;
                navigator.clipboard?.writeText(url).then(()=>toast.success('Link copied — send it to them.')).catch(()=>toast.error('Could not copy the link.'));
              }}><Copy size={14}/>Copy the link</button>
            </div>
          </div>
        </Group>}

        {/* ── Account ──────────────────────────────────────────────────────────── */}
        {settingsView==='account'&&
        <Group icon={ShieldCheck} title="Account">
        <div data-tour="settings-deep-account" style={glass({padding:16})}>
          <SL>Account</SL>
          <p style={{fontSize:13,color:C.t2,marginBottom:12,lineHeight:1.65}}>Signed in as <strong style={{color:C.t1}}>{account?.email}</strong>. Your whole profile — XP, streak, quiz scores, flashcards, pathway progress, achievements, Medabrain chats, and your Portfolio — syncs to this account, so signing in anywhere else picks up right where you left off.</p>
          {/* Makes the otherwise-invisible cross-device sync machinery (progressSync.js)
              visible and checkable, instead of the student just having to trust it works. */}
          <div style={{...R({gap:8}),marginBottom:12,padding:'8px 12px',borderRadius:8,background:C.s2,border:`1px solid ${C.b1}`,width:'fit-content'}}>
            {syncStatus.state==='syncing'&&<><RefreshCw size={13} color={C.blueL} style={{animation:'spin 1s linear infinite'}}/><span style={{fontSize:12,color:C.blueL,fontWeight:600}}>Syncing…</span></>}
            {syncStatus.state==='pending'&&<><Clock size={13} color={C.t3}/><span style={{fontSize:12,color:C.t3}}>Changes pending sync…</span></>}
            {syncStatus.state==='synced'&&<><Cloud size={13} color={C.greenL}/><span style={{fontSize:12,color:C.greenL,fontWeight:600}}>Synced{syncTimeLabel(syncStatus.lastSyncedAt)?` ${syncTimeLabel(syncStatus.lastSyncedAt)}`:''}</span></>}
            {syncStatus.state==='error'&&<><CloudOff size={13} color={C.amber}/><span style={{fontSize:12,color:C.amber}} title={syncStatus.error||''}>Offline — your progress is safe on this device and will sync automatically when you reconnect.</span><button onClick={()=>{ProgressSync.retrySyncNow().catch(()=>{});}} style={{marginLeft:4,fontSize:11,fontWeight:700,color:C.blueL,background:'none',border:'none',cursor:'pointer',padding:0,textDecoration:'underline'}}>Retry now</button></>}
            {syncStatus.state==='idle'&&<><Cloud size={13} color={C.t3}/><span style={{fontSize:12,color:C.t3}}>Not synced yet</span></>}
          </div>
          <button style={{...btnG({fontSize:12,padding:'8px 16px'})}} onClick={async()=>{try{await ProgressSync.flushNow();}catch(err){console.error('Pre-signout sync flush failed:',err);}await AuthAPI.logout();window.location.reload();}}>Sign out</button>
        </div>

        {/* ── Your data & your rights ──────────────────────────────────────
            Not a courtesy feature. The Privacy Policy tells every user they can
            export or delete their data from the app (src/legal/privacy.js § 12),
            and these two buttons are what make that sentence true rather than a
            promise the product cannot keep — which would be a deceptive
            statement to consumers quite apart from GDPR Art. 15/17/20, the
            CCPA's access and deletion rights, and the equivalents in the
            Colorado, Connecticut, Virginia, Texas and Oregon acts. */}
        <div style={glass({padding:16})}>
          <SL>Your Data & Your Rights</SL>
          <p style={{fontSize:13,color:C.t2,marginBottom:12,lineHeight:1.65}}>
            Your data is yours. Download everything we hold, or delete the account and all of it, whenever you want — no reason needed, and no penalty for asking. Read the <a href={LEGAL_VIEWS.privacy} onClick={openLegalLink(LEGAL_VIEWS.privacy)} style={{color:C.blueL,fontWeight:600}}>Privacy Policy</a> for exactly what we hold and who else ever sees it.
          </p>
          <div style={R({gap:8,flexWrap:'wrap'})}>
            <button style={{...btnG({fontSize:12,padding:'8px 16px'})}} onClick={async()=>{
              try{ await AuthAPI.exportMyData(); toast.success('Your data is downloading.'); }
              catch(err){ toast.error(err.message||'Could not export your data.'); }
            }}><Download size={14}/>Download my data</button>
            <button style={btnSm(C.roseDim,{color:C.rose,border:`1px solid ${C.rose}30`,fontSize:12})} onClick={async()=>{
              // Two gates, deliberately. The first explains what is about to
              // happen in plain words; the second makes the user type the
              // account's own email, which the server independently re-checks
              // (api/auth/account.js). Irreversible destruction of a student's
              // essays and application record should not be one stray tap away.
              if(!window.confirm('Delete your MedSchoolPrep account?\n\nThis permanently deletes your profile, essays, activities, colleges, deadlines, scores and everything else in your account. It cannot be undone.'))return;
              const typed=window.prompt(`Type ${account?.email} to confirm.`);
              if(!typed)return;
              if(typed.trim().toLowerCase()!==String(account?.email||'').toLowerCase()){toast.error("That doesn't match the email on this account.");return;}
              try{
                await AuthAPI.deleteMyAccount(account.email);
                await signOut();               // clear the local IndexedDB copy too
                toast.success('Your account and data have been deleted.');
                window.location.assign('/');
              }catch(err){ toast.error(err.message||'Could not delete the account.'); }
            }}><Trash2 size={14}/>Delete my account</button>
          </div>
        </div>

        <div data-tour="settings-deep-danger" style={{...glass({border:`1px solid rgba(244,63,94,0.2)`})}}>
          <SL extra={{color:C.rose}}>Danger Zone</SL>
          <p style={{fontSize:13,color:C.t2,marginBottom:16,lineHeight:1.65}}>These actions are permanent and cannot be undone.</p>
          <div style={R({gap:8,flexWrap:'wrap'})}>
            <button style={btnSm(C.roseDim,{color:C.rose,border:`1px solid ${C.rose}30`,fontSize:12})} onClick={()=>{if(window.confirm('Reset all quiz scores and lesson progress?')){DB.resetPathway();DB.resetQuizScores();DB.resetCatPerf();setPathway_({});setQScores_({});setQHistory([]);setCatPerf_({});toast.success('Progress reset successfully.');}}} >Reset progress</button>
            {/* Deleting the plan clears the server copy AND its version history, not just this
                device's — otherwise the next sign-in would helpfully restore the plan the
                student just asked to be rid of. */}
            {user?.masterPlan&&(
              <button style={btnSm(C.roseDim,{color:C.rose,border:`1px solid ${C.rose}30`,fontSize:12})} onClick={async()=>{
                if(!window.confirm('Delete your full study plan, including every saved earlier version? Your quiz scores, Portfolio and progress are untouched — you can build a new plan any time.'))return;
                await PlanStore.deleteStoredPlan();
                // Explicit null, not a deleted key: mergeUserRecord in db.js merges as
                // {...remote, ...local}, so an absent local key lets the remote snapshot's old
                // plan win on the next pull and the deletion silently undoes itself.
                saveUser({...user,masterPlan:null});
                toast.success('Your plan was deleted. Build a new one whenever you\'re ready.');
              }}>Delete my plan</button>
            )}
            <button style={btnSm(C.roseDim,{color:C.rose,border:`1px solid ${C.rose}30`,fontSize:12})} onClick={async()=>{if(window.confirm('Sign out and permanently delete all local device data? This cannot be undone.')){try{await ProgressSync.flushNow();}catch(err){console.error('Pre-signout sync flush failed:',err);}await AuthAPI.logout();await signOut();window.location.reload();}}}>Sign out & clear local data</button>
          </div>
        </div>
        </Group>}

        {settingsView==='account'&&<>
        {/* About */}
        <div style={glass({padding:16})}>
          <div style={{fontSize:11,color:C.t3,lineHeight: 1.55,fontFamily:C.FM}}>
            MedSchoolPrep v3.0 &nbsp;·&nbsp; {TOTAL_QUESTIONS} questions &nbsp;·&nbsp; {ELIB.length} resources &nbsp;·&nbsp; {Object.keys(FLASH_DECKS).length} decks<br/>
            Powered by: ts-fsrs (FSRS-4.5 spaced repetition) · compromise (offline NLP) · Medabrain on Groq · Fuse.js · Dexie.js · KaTeX · Chart.js · Framer Motion · react-hot-toast · canvas-confetti · jsPDF · marked<br/>
            Flashcard scheduling runs on FSRS, the open-source algorithm Anki uses by default · Flashcard generation runs fully offline on your device, extracting cards directly from your notes — no account, API key, or network call required · Medabrain is powered by large language model technology · Your progress is cached on this device via IndexedDB and synced to your account so it follows you to any browser you sign into
          </div>
        </div>

        {/* ── Legal ────────────────────────────────────────────────────────
            The in-app home for the documents and the standing disclaimers.
            Signed-in students never see the landing page again after their
            first visit, so without this the Terms, the Privacy Policy, the
            trademark attributions and the "this is not medical advice" notice
            would exist only on a surface their account has permanently left
            behind. */}
        <div style={glass({padding:16})}>
          <SL>Legal</SL>
          <div style={R({gap:12,flexWrap:'wrap',marginBottom:12})}>
            <a href={LEGAL_VIEWS.terms} onClick={openLegalLink(LEGAL_VIEWS.terms)} style={{fontSize:13,color:C.blueL,fontWeight:600}}>Terms of Service</a>
            <a href={LEGAL_VIEWS.privacy} onClick={openLegalLink(LEGAL_VIEWS.privacy)} style={{fontSize:13,color:C.blueL,fontWeight:600}}>Privacy Policy</a>
            <a href={`mailto:${LEGAL.contactEmail}`} style={{fontSize:13,color:C.blueL,fontWeight:600}}>Contact us</a>
          </div>
          <div style={{fontSize:11,color:C.t3,lineHeight: 1.55}}>
            MedSchoolPrep is an independent study tool. It is not a medical school, is not affiliated with or endorsed by any testing organization, university, or health system, and does not confer academic credit or any credential. All lessons, quizzes, career material and AI coach output are for general educational and career-exploration purposes only — they are not medical, legal, financial, or professional advice, and no clinical or health decision should be based on them. Score estimates are our own approximations, not official scores, and are not a prediction or guarantee of any result. Always confirm deadlines and requirements directly with the college, scholarship provider, or testing organization.<br/><br/>
            {TRADEMARK_NOTICE.map((line,i)=><React.Fragment key={i}>{line}{i<TRADEMARK_NOTICE.length-1?' ':''}</React.Fragment>)}
          </div>
        </div>
        </>}
      </div>
    );
  }

  // ═══ ONBOARDING ════════════════════════════════════════════════════════════════
  // Held on either count: the local store is still opening, or the journey has
  // not finished its first pass yet this session.
  if(!dbReady||!bootPlayed) return <LoadingScreen onFirstPass={markBootPlayed}/>;

  if(previewOnboarding){
    return(
      <ErrorBoundary>
        <Toaster position="bottom-right"/>
        <Onboarding account={account} preview onComplete={()=>setPreviewOnboarding(false)}/>
      </ErrorBoundary>
    );
  }

  if(!user){
    return(
      <ErrorBoundary>
        <Toaster position="bottom-right"/>
        <Onboarding account={account} onComplete={completeOnboarding}/>
      </ErrorBoundary>
    );
  }

  // ═══ THE ANNUAL CLASS-YEAR CHECK-IN ════════════════════════════════════════════
  // First login of a new academic year, once. The rollover itself already happened on August 1
  // — graduation year is stored, so the grade derives from today's date and needs nobody's
  // permission to advance. This asks anyway, in one tap, for the one case the arithmetic cannot
  // see: a student whose graduation year genuinely changed. See gradeBand.js.
  if(!gradYearHandled && !justOnboarded && needsGradYearConfirmation(user)){
    return(
      <ErrorBoundary>
        <Toaster position="bottom-right"/>
        <GradYearCheckIn user={user} onConfirm={(patch)=>{
          setGradYearHandled(true);
          saveUser({...user,...patch});
          AuthAPI.updateMe({ gradeLevel:patch.gradeStage }).then(({user:updated})=>onAccountChange?.(updated)).catch(()=>{});
          const b=bandFor({...user,...patch});
          toast.success(`Class of ${patch.graduationYear} — ${BAND_BY_ID[b]?.label||'your'} year. Everything's still where you left it.`);
        }}/>
      </ErrorBoundary>
    );
  }

  // ═══ COMING BACK AFTER A BREAK ═════════════════════════════════════════════════
  // Twenty-one days or more away. Usage here collapses during finals and again mid-summer, and
  // the student who comes back is not resuming — they are re-entering, usually because
  // something reminded them a deadline exists. Dropping them into the middle of the lesson
  // sequence they abandoned answers neither of the two questions they walked in with. See
  // ReturningBreakScreen.jsx.
  if(!breakScreenHandled && !justOnboarded && shouldShowReturnScreen(user)){
    const markSeen=()=>{ setBreakScreenHandled(true); saveUser({...user,welcomeBackShownFor:user.lastActive,lastActive:Date.now()}); };
    // The real, dated items from the same timeline engine the Milestones tab renders, so
    // "what's due" here is the exact list they can go look at rather than a second opinion.
    const dueRows=(appTimeline?.upcoming||[]).filter(e=>e.status==='overdue'||e.status==='soon').slice(0,4)
      .map(e=>({ id:e.id, title:e.title, detail:e.when||e.detail, onOpen:()=>{markSeen();goPortfolio('milestones');} }));
    const changedRows=(appTimeline?.upcoming||[]).filter(e=>e.status!=='overdue'&&e.status!=='soon').slice(0,3)
      .map(e=>({ id:e.id, title:e.title, detail:e.when||e.detail, onOpen:()=>{markSeen();goPortfolio('milestones');} }));
    return(
      <GradeBandProvider user={user}>
        <ErrorBoundary>
          <Toaster position="bottom-right"/>
          <ReturningBreakScreen user={user} due={dueRows} changed={changedRows}
            onDismiss={markSeen}
            onPrimary={()=>{markSeen();goPortfolio('milestones');}}/>
        </ErrorBoundary>
      </GradeBandProvider>
    );
  }

  // ═══ ACTIVE QUIZ FULLSCREEN ════════════════════════════════════════════════════
  if(aQuiz){
    // A verification quiz belongs to the lesson that launched it, so it wears that lesson's
    // pathway color — a Nursing lesson's quiz shouldn't turn Physician-blue mid-verification
    // just because Physician is the pathway in focus. A plain Quiz Library quiz has no pathway
    // of its own and keeps the focused accent.
    const qAccent=verifyCtx?.lesson?accentText(pathwayOf(verifyCtx.lesson)?.accent||C.blue):accent;
    return(
      <ErrorBoundary>
        <div style={{minHeight:'var(--msp-vh)',width:'100%',flex:1,background:`radial-gradient(ellipse 90% 55% at 50% -10%,${qAccent}18 0%,transparent 60%),${C.bg}`,color:C.t1,fontFamily:C.FB}}>
          <Toaster position="top-right"/>
          <div style={{maxWidth:780,margin:'0 auto',padding:'24px 24px 60px'}}>
            <div style={{...glass({padding:'12px 20px',marginBottom:16}),...R()}}>
              <span style={pill(C.blueDim,C.blueL,{fontSize:11})}>{aQuiz.cat}</span>
              <span style={{fontSize:14,fontWeight:700,color:C.t1,fontFamily:C.FD,marginLeft:4}}>{aQuiz.title}</span>
              <span style={{marginLeft:'auto',...pill(C.s3,C.t3,{fontSize:10})}}>{aQuiz.diff}</span>
            </div>
            <div style={glass({padding:isMobile?0:24})}>
              <QuizEngine quiz={aQuiz} onFinish={finishQuiz} onClose={()=>setAQ(null)} accent={qAccent} readonly={!!aQuiz.readonly} m={isMobile}/>
            </div>
          </div>
        </div>
      </ErrorBoundary>
    );
  }

  // ═══ ACTIVE LESSON FULLSCREEN (immersive Overview→Article→Video→Quiz→Complete) ═══
  if(activeLesson){
    const {lesson,unit}=activeLesson;
    const nextInfo=getNextLesson(lesson);
    const lessonContent=LESSON_CONTENT[lesson.id];
    // The pathway THIS lesson belongs to — see pathwayKeyOf/pathwayOf above. Everything below
    // reads from these instead of curPath/eSpec so a lesson opened from another enrolled
    // pathway is titled, colored, quizzed and tutored as itself.
    const lPathKey=pathwayKeyOf(lesson);
    const lPath=PATHS[lPathKey]||curPath;
    const lAccent=lPath?.accent||C.blue;
    return(
      <ErrorBoundary>
        <Toaster position="top-right"/>
        <LessonPlayer
          lesson={lesson} unit={unit} pathwayLabel={lPath?.label}
          pathwayEntry={pathway[lesson.id]}
          step={lessonStep} onStep={setLessonStep}
          articleRead={articleRead} onArticleRead={()=>setArticleRead(true)}
          videoWatched={videoWatched} onVideoWatched={()=>setVideoWatched(true)}
          initialScrollPct={articleScrollPct} onScrollProgress={setArticleScrollPct}
          onClose={closeLesson}
          onStartQuiz={()=>{ setReviewMode(false); openVerifyQuiz(lesson,unit); }}
          onNextLesson={()=>{ if(nextInfo)openLesson(nextInfo.lesson,nextInfo.unit); }}
          hasNextLesson={!!nextInfo}
          accent={lAccent} m={isMobile}
          highlights={lessonHighlights} onAddHighlight={addLessonHighlight} onRemoveHighlight={removeLessonHighlight}
          quizBlurb={describeVerificationQuiz(buildVerificationQuiz(lesson,ALL_QUIZZES,{user,pathwayKey:lPathKey,attempt:getAttemptCount(lesson.id)}))}
          confirms={lessonConfirms} onConfirmStep={confirmLessonStep} onContinueLater={continueLessonLater}
          reviewMode={reviewMode}
          feedbackSlot={
            <LessonDifficultyCheck
              lesson={lesson} unit={unit} content={lessonContent}
              pathwayKey={lPathKey} pathwayLabel={lPath?.label} gradeLabel={gradeLabel}
              user={user} lessonNote={lessonNote}
              feedbackSummary={feedbackSummary.promptText}
              existing={lessonFeedbackRow}
              onSubmit={submitLessonFeedback} onUpdate={updateLessonFeedbackRow}
              accent={lAccent} isMobile={isMobile}
            />
          }
        />
        {/* Fills the right-side gutter of the immersive lesson view with a click-away Prep Meta
            Brain (purpose:'prep'), grounded in this exact lesson's content — see PrepMetaBrain.jsx. */}
        <PrepMedabrain
          open={prepBrainOpen} onOpenChange={setPrepBrainOpen}
          messages={prepBrainMessages} onMessagesChange={setPrepBrainMessages}
          user={user} pathwayLabel={lPath?.label} gradeLabel={gradeLabel}
          accent={lAccent} isMobile={isMobile}
          lesson={lesson} unit={unit}
          articleSections={lessonContent?.article?.sections||[]}
          keyTakeaways={lessonContent?.article?.keyTakeaways||[]}
          objectives={lesson.objectives||[]}
          lessonNote={lessonNote}
          lessonHighlights={lessonHighlights}
          notesDigest={notesDigest} highlightsDigest={highlightsDigest}
          feedbackSummary={feedbackSummary.promptText} paceText={paceText}
          recentActivitySummary={recentActivitySummary}
          parallelPathwaysSummary={isParallel?parallelSummary:null}
        />
        {/* Left-side notes panel — per-lesson free-text notes, autosaved and fully readable by
            Meta Brain above (see buildPrepSystemPrompt's lessonNote block). */}
        <LessonNotesPanel
          open={notesOpen} onOpenChange={setNotesOpen}
          lessonTitle={lesson.title} value={lessonNote} onSave={saveLessonNoteText}
          accent={lAccent} isMobile={isMobile}
        />
      </ErrorBoundary>
    );
  }

  // ═══ MAIN LAYOUT ═══════════════════════════════════════════════════════════════
  // ── Prep: diagnostic/pathway/quizzes/flashcards/coach/library, switched via SubNav ──
  const prepRenders={ diagnostic:tDiag, pathway:tPath, quizzes:tQuizzes, flashcards:tFlash, coach:tCoach, library:tLib };
  /**
   * The quest line for a pillar tab.
   *
   * One helper rather than four copies, because the whole point of the strip is that it looks and
   * behaves identically on every surface — a student should learn it once. It picks the quest
   * earned on THIS screen (see featuredFor in src/lib/quests.js), so the SAT tab shows an SAT
   * quest and the Prep tab shows a lesson or card quest, and it renders nothing at all when there
   * is no quest for this surface. A strip that appears everywhere with nothing useful on it is
   * the thing people learn to scroll past.
   */
  function questStripFor(surface){
    // Two strips, at most, and usually one. The daily strip is the one that changes what
    // somebody does in the next twenty minutes, so it goes first; the long-quest strip is the
    // one that says what this month is about. Either renders nothing when it has nothing
    // useful for THIS screen, which is what keeps a strip from becoming furniture.
    const showDaily = dailyDay?.rows?.length>0;
    if(!questBoard.length && !showDaily) return null;
    return(
      <div style={{padding:isMobile?'12px 16px 0':'14px 24px 0',display:'flex',flexDirection:'column',gap:8}}>
        {showDaily&&(
          <DailyQuestRail
            compact day={dailyDay} surface={surface}
            onClaim={claimDailyQuest}
            onClaimSet={claimDailySetBonus}
            onGo={goQuestDestination}
            busyKey={dailyBusyKey}
            m={isMobile}
          />
        )}
        {questBoard.length>0&&(
          <QuestStrip
            rows={questBoard} surface={surface}
            onOpen={()=>goProgress('quests')}
            onClaim={claimQuestXP}
            busyId={questBusyId}
            m={isMobile}
          />
        )}
      </div>
    );
  }

  function tPrep(){
    // Prep's whole ambient backdrop shifts with the active pathway — switching pathways in the
    // Diagnostic/Pathway tab visibly re-themes every tab under Prep, not just the pathway page
    // itself, since this wash sits behind SubNav and every rendered sub-tab.
    const pA=curPath?.accent||C.blue, pA2=curPath?.accent2||C.blueL;
    return(
      <div style={{position:'relative'}}>
        <div style={{position:'fixed',inset:0,pointerEvents:'none',zIndex:0,transition:'background 360ms ease',background:`radial-gradient(ellipse 65% 42% at 88% -6%,${pA}1a 0%,transparent 58%),radial-gradient(ellipse 55% 38% at -5% 102%,${pA2}14 0%,transparent 58%),radial-gradient(ellipse 40% 30% at 50% 40%,${pA}08 0%,transparent 60%)`}}/>
        <div style={{position:'relative',zIndex:1}}>
          <SubNav items={prepSubnav.map(n=>n.id==='flashcards'&&dueDeckCount>0?{...n,badge:dueDeckCount}:n)} active={prepView} onChange={setPrepView} accent={pA} m={isMobile} tourPrefix="prep-sub" hrefFor={prepHref} locked={unlocks.locked('prep')[0]} bandsFor={id=>DESTINATION_BANDS[`prep/${id}`]}/>
          {user.masterPlan&&(
            <div style={{padding:isMobile?'12px 16px 0':'14px 24px 0'}}>
              <PlanTaskStrip user={user} pillar="prep" accent={pA} onOpenTask={openPlanResource} currentView={prepView} isMobile={isMobile}/>
            </div>
          )}
          {questStripFor('prep')}
          {(prepRenders[prepView]||tPath)()}
        </div>
        {/* Pathway-level Meta Brain (purpose:'prep') — present across every Prep sub-tab, exact
            parity with how PortfolioMetaBrain is mounted once for the whole Portfolio tab below.
            No specific lesson is open here, so it grounds in the pathway's real unit-by-unit
            completion (not just titles) plus weakest-category/due-cards/streak — so "what should
            I study next" answers reference this student's actual progress, matching what the head
            coach already knows via buildCoachSystemPrompt. */}
        <PrepMedabrain
          open={prepBrainOpen} onOpenChange={setPrepBrainOpen}
          messages={prepBrainMessages} onMessagesChange={setPrepBrainMessages}
          user={user} pathwayLabel={curPath?.label} gradeLabel={gradeLabel}
          accent={pA} isMobile={isMobile}
          units={(curPath?.units||[]).map(u=>({ title:u.title, done:(u.lessons||[]).filter(l=>isLessonComplete(l,pathway[l.id])).length, total:(u.lessons||[]).length }))}
          totalDone={curPathDoneL} totalLessons={curPathAllL.length}
          weakestCategory={(()=>{const w=secAvgs.map((v,i)=>({v,i})).filter(o=>o.v!==null).sort((a,b)=>a.v-b.v)[0];return w?cats3[w.i]:null;})()}
          weakestScore={(()=>{const w=secAvgs.map((v,i)=>({v,i})).filter(o=>o.v!==null).sort((a,b)=>a.v-b.v)[0];return w?w.v:null;})()}
          dueCards={dueCards} streak={streak}
          notesDigest={notesDigest} highlightsDigest={highlightsDigest}
          feedbackSummary={feedbackSummary.promptText} paceText={paceText}
          recentActivitySummary={recentActivitySummary}
          parallelPathwaysSummary={isParallel?parallelSummary:null}
        />
      </div>
    );
  }
  // ── Portfolio: overview + milestones/colleges/essays/aid/resume/interview/calc ──
  // Each sub-view inherits ITS OWN SubNav color as its accent so the whole
  // Portfolio reads as a spectrum of distinct, recognizable sections (matching
  // the pill it was opened from) rather than one flat green everywhere.
  const portC=Object.fromEntries(PORTFOLIO_SUBNAV.map(n=>[n.id,n.color]));
  const portfolioRenders={
    overview:tPort,
    milestones:()=><PortfolioMilestones accent={portC.milestones} user={user} apIb={!!user?.apIb} askMedabrain={askPortfolioMedabrain}
      onNavigate={goAnywhere} isMobile={isMobile}
      onAdded={()=>{logEvent('portfolio_item_added','deadline');saveUser(applyPlanAutoComplete(user,typeMatch('deadline')));}}/>,
    // Opportunities and Tracked are one page: "what should I go do" and "what did I say I
    // would do" are the two halves of one question, and Tracked was only ever the follow-through
    // for a Track button that lives on the Opportunities cards. Two sections, the finder open on
    // arrival and the tracker one jump away with its count on the chip — no sub-tabs.
    //
    // The panel reads the SAME shared snapshot the Overview dashboards do, so the matcher reasons
    // over exactly the activities/research/hours/awards the rest of Portfolio is showing — one
    // fetch, one truth (see src/lib/portfolioData.js). Its tuning panel writes back through
    // saveUser, so a student's interests live on their account, not on one device.
    opportunities:()=>(
      <SectionScroller accent={portC.opportunities} isMobile={isMobile}
        mirrorBadge={commonAppBadgeFor('opportunities')}
        focusId={sectionFor('opportunities')} focusNonce={sectionNonce}
        defaultOpenIds={['find']} printLabel="Print this page"
        sections={[
          { id:'find', ic:Trophy, label:'Find something', color:C.gold,
            blurb:'Matched to your interests, your grade and what you can afford',
            render:()=><OpportunitiesPanel accent={portC.opportunities} user={user} onSaveUser={saveUser}
              snapshot={portSnapshot} loading={portSnapLoading} pathwayKey={eSpec} pathwayLabel={curPath?.label}
              askMedabrain={askPortfolioMedabrain} isMobile={isMobile} onOpen={goPortfolio}
              onTrack={trackOpportunity}
              trackedKeys={{activities:trackedActivityKeys,scholarships:trackedScholarshipKeys}}
              pendingKeys={{activities:pendingTracks.byResource.activities,scholarships:pendingTracks.byResource.scholarships}}
              pendingEntries={pendingTracks.entries} trackStatus={pendingTracks.status}
              focus={focusFor('opportunity')}/> },
          { id:'tracked', ic:RadarIcon, label:'What you\u2019re tracking', color:C.violet,
            blurb:'Every program you saved, with its deadline, its status and a daily read',
            render:()=><TrackedPanel snapshot={portSnapshot} loading={portSnapLoading} accent={portC.opportunities}
              askMedabrain={askPortfolioMedabrain} onOpen={goPortfolio} onRefresh={refreshPortSnapshot}
              pendingEntries={pendingTracks.entries} trackStatus={pendingTracks.status} isMobile={isMobile} user={user}/> },
        ]}/>
    ),
    // ── Applying ─────────────────────────────────────────────────────────────
    // Six former tabs, one scrolling page (see ApplyingPanel.jsx). The panels are unchanged —
    // each is handed to the page as a section renderer with exactly the callbacks it had when it
    // was a tab, so adding a college still moves the counters, a finished interview still credits
    // the streak, and every old /portfolio/essays URL still lands on the essay workspace.
    applying:()=><ApplyingPanel accent={portC.applying} isMobile={isMobile}
      mirrorBadge={commonAppBadgeFor('applying')}
      focusId={sectionFor('applying')} focusNonce={sectionNonce}
      onSectionOpen={(id)=>focusPortfolioSection('applying',id)}
      sectionLocks={applyingSectionLocks}
      counts={{colleges:appCounts.colleges,essays:appCounts.essays,recommenders:recommendersCount,interviews:interviewCount}}
      renders={{
      colleges:()=><CollegeListPanel accent={C.sky} user={user} askMedabrain={askPortfolioMedabrain} isMobile={isMobile} onAdded={()=>{logEvent('portfolio_item_added','college');saveUser(applyPlanAutoComplete(user,typeMatch('college')));}}/>,
      // Reads the same shared Portfolio snapshot every other Applying panel does, so the
      // requirements-gap view reasons over exactly the GPA terms, test sittings and logged hours
      // the rest of Portfolio is showing — one fetch, one truth (src/lib/portfolioData.js).
      // onGoTo is goPortfolio, so a shortfall on a card ("you are 110 service hours short") is one
      // tap from the screen that fixes it, and a program that runs an MMI is one tap from the MMI
      // circuit with the mode already selected.
      combined:()=><CombinedDegreePanel accent={C.blue} user={user} snapshot={portSnapshot} loading={portSnapLoading}
        pathwayKey={eSpec} onGoTo={goPortfolio} isMobile={isMobile} focus={focusFor('combined')}/>,
      essays:()=><EssayWorkspacePanel accent={C.violet} user={user} gradeLabel={gradeLabel} askMedabrain={askPortfolioMedabrain} isMobile={isMobile} onCreated={()=>{logEvent('portfolio_item_added','essay');saveUser(applyPlanAutoComplete(user,typeMatch('essay')));}}/>,
      aid:()=><FinancialAidPanel accent={C.green} askMedabrain={askPortfolioMedabrain} pathwayKey={eSpec}
        focusScholarship={focusFor('scholarship')} focusHealthScholarship={focusFor('health-scholarship')}
        focusMedScholarship={focusFor('med-scholarship')}/>,
      recommenders:()=><RecommendersPanel accent={C.fuchsia} user={user} gradeLabel={gradeLabel} snapshot={portSnapshot} onChange={async()=>{const recs=await listItems('recommenders');setRecommendersCount(recs.length);logEvent('portfolio_item_added','recommender');checkAndUnlockAchievements(user,qTaken,qHistory.filter(q=>q.score===100).length,streak,totalReviews,mastery,aiChatCount,{recommenders:recs.length});saveUser(applyPlanAutoComplete(user,typeMatch('recommender')));}}/>,
      interview:()=><InterviewPrepPanel accent={C.orange} pathway={curPath} pathwayKey={eSpec} studentName={user?.name?.split(' ')[0]||user?.name||null} onSessionComplete={(mode)=>{const nc=interviewCount+1;setInterviewCount(nc);logEvent('interview_session_completed',mode);const ivWrite=saveUser(applyPlanAutoComplete({...user,interviewCount:nc},t=>t.type==='interview'));bumpWeeklyCoachCount(getIsoWeekKey());const mmiNc=(mode==='mmi'||mode==='casper')?mmiCasperCount+1:mmiCasperCount;if(mmiNc!==mmiCasperCount)setMmiCasperCount(mmiNc);checkAndUnlockAchievements(user,qTaken,qHistory.filter(q=>q.score===100).length,streak,totalReviews,mastery,aiChatCount,{interviewSessions:nc,mmiCasperSessions:mmiNc});ivWrite.then(()=>creditStreak('interview_session')).catch(console.error);}}/>,
      calc:tCalc,
      medex:tMedex,
      narrative:tNarrative,
      }}/>,
    // Activities & résumé reasons over the student's own academic history: it reads
    // gpa_entries/test_scores/colleges itself and matches U.S. schools against their real GPA,
    // score and the career they named at signup — so `user` and the grade label are load-bearing
    // here, not decoration. onCollegeAdded keeps App.jsx's counters honest when a matched school
    // is added straight from this panel.
    //
    // It is also the merge of the old Activities/Research/Skills/Clinical tabs. Every
    // callback the four separate panels had is still wired, one per section, so logging clinical
    // hours still moves the readiness gauge and the achievement counters exactly as it did when
    // it was its own tab.
    // The Common App mirror — the whole real form with this student's Portfolio in it, plus the
    // ledger that tracks which parts of it they have actually copied across. See
    // src/lib/commonApp/ for the model, the derivation and the sync.
    commonapp:()=>(
      <React.Suspense fallback={
        <div style={{...glass({padding:40}), display:'flex', justifyContent:'center'}}>
          <Loader2 size={20} style={{animation:'spin 1s linear infinite', color:C.t3}}/>
        </div>
      }>
      <CommonAppMirror
      application={commonApp.application} sync={commonApp.sync} actions={commonApp.actions}
      loading={!portLoaded||portSnapLoading} isMobile={isMobile}
      // Set the view and focus the section separately rather than pushing the section id through
      // goPortfolio. That helper resolves RETIRED tab ids ('essays' → applying:essays) and passes
      // anything it does not recognize straight to setPortfolioView — so a live section id that is
      // not also an old tab id, like the opportunities finder's 'find', would have been set as a
      // portfolio view that does not exist and quietly landed the student on Overview.
      onNavigate={(src)=>{
        if(!src?.tab) return;
        if(src.tab!=='portfolio') return goAnywhere(src.tab, src.view);
        setTab('portfolio');
        if(src.view) setPortfolioView(src.view);
        if(src.view&&src.section) focusPortfolioSection(src.view, src.section);
      }}/>
      </React.Suspense>
    ),
    resume:()=><ActivitiesResumePanel accent={portC.resume} user={user} gradeLabel={gradeLabel} isMobile={isMobile}
      mirrorBadge={commonAppBadgeFor('resume')}
      portfolioSnapshot={portSnapshot} pathwayLabel={PATHS[eSpec]?.label||null}
      section={sectionFor('resume')} sectionNonce={sectionNonce}
      onSectionChange={(id)=>focusPortfolioSection('resume',id)} sectionLocks={resumeSectionLocks}
      onCollegeAdded={()=>{logEvent('portfolio_item_added','college');saveUser(applyPlanAutoComplete(user,typeMatch('college')));}}
      onResumeExported={()=>{setAppCounts(c=>({...c,resume:true}));checkAndUnlockAchievements(user,qTaken,qHistory.filter(q=>q.score===100).length,streak,totalReviews,mastery,aiChatCount,{resumeBuilt:true});}}
      onActivityLogged={()=>{logEvent('portfolio_item_added','activity');saveUser(applyPlanAutoComplete(user,typeMatch('activity')));}}
      onClinicalLogged={async()=>{const hours=await listItems('clinical_hours');setClinicalHoursEntries(hours||[]);const total=(hours||[]).reduce((s,h)=>s+(h.hours||0),0);setClinicalHoursTotal(total);logEvent('portfolio_item_added','clinical');checkAndUnlockAchievements(user,qTaken,qHistory.filter(q=>q.score===100).length,streak,totalReviews,mastery,aiChatCount,{clinicalHours:total});saveUser(applyPlanAutoComplete(user,typeMatch('clinical')));}}
      onResearchLogged={()=>{setResearchCount(c=>c+1);logEvent('portfolio_item_added','research');saveUser(applyPlanAutoComplete(user,typeMatch('research')));}}
      onCredentialChanged={()=>{setSkillsCount(c=>c+1);}}/>,
  };
  function tPortWrap(){
    return(
      <div>
        <SubNav items={portfolioSubnav} active={portfolioView} onChange={setPortfolioView} accent={portfolioAccent} m={isMobile} tourPrefix="portfolio-sub" hrefFor={portfolioHref} locked={unlocks.locked('portfolio')[0]} bandsFor={id=>DESTINATION_BANDS[`portfolio/${id}`]}/>
        {user.masterPlan&&(
          <div style={{padding:isMobile?'12px 16px 0':'14px 24px 0'}}>
            <PlanTaskStrip user={user} pillar="portfolio" accent={portfolioAccent} onOpenTask={openPlanResource} currentView={portfolioView} isMobile={isMobile}/>
          </div>
        )}
        {questStripFor('portfolio')}
        {(portfolioRenders[portfolioView]||tPort)()}
        <PortfolioMedabrain
          user={user} pathwayLabel={curPath?.label||'college prep'}
          gradeLabel={gradeLabel}
          isMobile={isMobile}
          recentActivitySummary={recentActivitySummary}
          goDest={goDest}
        />
      </div>
    );
  }
  // ── Plans: the full day-by-day master plan (src/lib/masterPlanGenerator.js) ──
  // Same live-signal shape buildCoachSystemPrompt uses below (see requestAIResponse) — grounding
  // the plan in the exact same "where they stand right now" facts the chat coach reasons over is
  // what makes the Plans tab and Medabrain's chat feel like one brain instead of two features.
  // Opens the EXACT resource a plan task resolved to — not just the right tab.
  // A quiz task launches that quiz fullscreen, a lesson task opens the lesson
  // player (unless still locked), a deck task drops straight into that deck's
  // study session, an article task lands on the E-Library pre-searched to it.
  // Manual complete/snooze for plan tasks surfaced OUTSIDE the Plans tab itself
  // (TodayPlanNudge on Home) — same save-through-user pattern PlansTab's own
  // handleToggleTask uses, just placed here since TodayPlanNudge is mounted
  // directly by App.jsx rather than by PlansTab.
  function handlePlanToggleTask(date,taskId){
    if(!user?.masterPlan)return;
    const {plan:updated,justEarnedXP}=togglePlanTaskDone(user.masterPlan,date,taskId);
    if(!justEarnedXP){saveUser({...user,masterPlan:updated});return;}
    // Same early-start bonus as applyPlanAutoComplete — manually checking off a task dated
    // after today (working ahead in the WeekView) earns +25% XP on top of the base 6.
    const isEarly=date>planTodayStr();
    const {finalXP,tier}=awardBoostedXP(isEarly?6+Math.round(6*0.25):6);
    const planWrite=saveUser({...user,masterPlan:updated,xp:(user.xp||0)+finalXP});
    toast.success(`${BONUS_COPY[tier]?BONUS_COPY[tier](finalXP):`+${finalXP} XP`}${isEarly?' · +25% early-start bonus!':''}`,{duration:1800});
    if(tier==='jackpot')celebrateJackpot();else if(tier==='big'||tier==='bonus')celebrateBonusXP();else celebrateXP();
    // `justEarnedXP` is togglePlanTaskDone's own once-per-task guard, so re-checking
    // a task that was already done cannot re-credit the streak.
    planWrite.then(()=>creditStreak('plan_task')).catch(console.error);
  }
  function handlePlanSnoozeTask(date,taskId){
    if(!user?.masterPlan)return;
    const updated=moveTaskToDay(user.masterPlan,taskId,date,planAddDaysStr(planTodayStr(),1));
    if(updated===user.masterPlan)return;
    saveUser({...user,masterPlan:updated});
    toast('Moved to tomorrow.',{icon:'☀️'});
  }
  function openPlanResource(task){
    const {resourceTab:tab,resourceView:view,resourceKind:kind,resourceId:id}=task||{};
    if(!tab||!view)return;
    // Without the explicit `sat` branch, a SAT task would fall through to the
    // final else and land the student on Progress.
    if(tab==='prep')goPrep(view);else if(tab==='portfolio')goPortfolio(view);else if(tab==='sat')goSat(view);else goProgress(view);
    play('click');
    if(!kind||kind==='view'||!id)return;
    if(kind==='quiz'){
      const q=ALL_QUIZZES.find(x=>x.id===id);
      if(q)setAQ(qScores[q.id]!==undefined?{...q,readonly:true}:q);
    }else if(kind==='lesson'){
      const units=curPath?.units||[];
      const flat=units.flatMap((u,ui)=>u.lessons.map(l=>({l,u,ui})));
      const hit=flat.find(x=>x.l.id===id);
      if(!hit)return; // pathway switched since the plan was built — the pathway view we just navigated to is the right landing spot
      if(lessonState(hit.l,hit.ui,units)==='locked'){
        toast(`"${hit.l.title}" is still locked — finish the earlier unit first.`,{icon:<Lock size={15}/>});
      }else{
        openLesson(hit.l,hit.u);
      }
    }else if(kind==='deck'){
      const builtin=!!FLASH_DECKS[id];
      // Queue the deck on the Start-Studying screen instead of jumping straight into cards —
      // see planDeckPending above.
      if(id==='Smart Mix'){
        setPlanDeckPending({name:'Smart Mix',builtin:true,smartMix:true});
      }else if(builtin||cDecks[id]){
        setPlanDeckPending({name:id,builtin});
      } // else: deck no longer exists — flashcards home we navigated to is the fallback
    }else if(kind==='article'){
      // Land on the E-Library pre-searched to exactly this resource.
      setLS(id);setLC('All');setLType('All');setLDiff('All');setLFreeOnly(false);setLSort('default');setLSubTab('all');
    }
  }
  // Plans are built around a pathway (see masterPlanGenerator.js — every generator call reads
  // user.specialty), so a student who hasn't picked one yet — manually or via the diagnostic —
  // gets a requirement screen here instead of a plan silently defaulting to "Exploring Pre-Health."
  // (With parallel pathways, "which pathway" means the one currently IN FOCUS — the plan follows
  // focus, so switching pathways re-points the plan generator at the new one. The gate below is
  // therefore about having *any* pathway enrolled, not about having exactly one.)
  function tPlans(){
    if(activePathways.length===0){
      return(
        <div style={CC({gap:20})}>
          <PanelHero icon={Compass} color={C.fuchsia} color2={C.violet} m={isMobile}
            eyebrow="Plans" title="Pick your pathway first"
            sub="Your pathway shapes your whole roadmap. Take the diagnostic, or pick one — you can switch later."/>
          <motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} style={{...glass({padding:28,background:`linear-gradient(135deg,${C.cyanDim},${C.blueDim} 70%,transparent)`,border:`1px solid ${C.cyan}30`,position:'relative',overflow:'hidden'}),display:'flex',alignItems:'center',gap:20,flexWrap:'wrap'}}>
            <div style={{position:'absolute',inset:0,background:C.oceanGrad,opacity:0.05,pointerEvents:'none'}}/>
            <div style={{position:'relative',width:56,height:56,borderRadius:16,background:C.oceanGrad,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,boxShadow:`0 8px 22px ${C.cyan}40`}}><Compass size={26} color="#fff"/></div>
            <div style={{position:'relative',flex:1,minWidth:220}}>
              <div style={{fontSize:15, letterSpacing: 'calc(-0.02px + var(--msp-letter-spacing))',fontWeight:800,color:C.t1,fontFamily:C.FD}}>Not sure which fits? Take the diagnostic.</div>
              <div style={{fontSize:12,color:C.t2,marginTop:4}}>{DIAG_QS.length} questions about how you think, what actually interests you, and what these careers look like day to day — takes about 6 minutes.</div>
            </div>
            <motion.button whileHover={{scale:1.03}} whileTap={{scale:.97}} style={{...btn(C.oceanGrad,{fontSize:13,padding:'12px 24px',boxShadow:`0 6px 18px ${C.cyan}35,inset 0 1px 0 rgba(255,255,255,0.15)`}),display:'inline-flex',alignItems:'center',gap:8,flexShrink:0,position:'relative'}} onClick={()=>{setDD(false);setDS(0);setDA([]);setDIntro(false);goPrep('diagnostic');}}>Start diagnostic<ChevronRight size={15}/></motion.button>
          </motion.div>
          <div>
            <SectionTitle icon={Route} color={C.cyanL}>All Pathways — Choose Manually</SectionTitle>
            <div style={G(isMobile?1:2,16,{},false)}>
              {Object.entries(PATHS).map(([key,p])=>(
                <PathwayCard key={key} pathKey={key} p={p} m={isMobile}
                  current={focusedPathway===key} enrolled={activePathways.includes(key)} full={activePathways.length>=MAX_ACTIVE_PATHWAYS}
                  onSelect={(k)=>{enrollPath(k);}}/>
              ))}
            </div>
          </div>
        </div>
      );
    }
    return(
      <div>
        {/* Plans is where a student decides what today is for, which makes it the one place a
            month-long commitment most needs to be visible — a plan built without the quest in
            view is a plan that quietly competes with it. */}
        {questStripFor('plans')}
        <PlansTab user={user} saveUser={saveUser} accent={plansAccent} isMobile={isMobile} goPrep={goPrep} goPortfolio={goPortfolio} goProgress={goProgress} goSettings={goSettings} openResource={openPlanResource} liveSignals={planLiveSignals} initialExpandedDate={plansOpenDate} quizzesTaken={qTaken} reducedMotion={reducedMotion}/>
      </div>
    );
  }
  // ── SAT: the test-prep pillar (src/components/sat/), sealed for v1 ──
  //
  // The pillar renders in full, then SatBetaCover blurs it and makes it inert
  // (see src/lib/betaFlags.js for why it ships this way rather than deleted).
  // Everything that used to cross the boundary in either direction is gone
  // while the seal is on:
  //
  //   • no onSessionComplete — no SAT work can happen, so nothing to credit,
  //     and the streak/plan writes it used to make no longer exist.
  //   • no planStrip — the plan, daily-quest and quest rails are for surfaces a
  //     student can act on. Behind a seal they would just be XP shown through
  //     frosted glass.
  //   • the sub-nav is passed but unreachable, and its unlock gating is moot.
  function tSatWrap(){
    const pillar=(
      <SatTab
        view={satView}
        onViewChange={(v,p)=>{ setSatView(v); setSatParams(p||null); }}
        params={satParams}
        onConsumeParams={()=>setSatParams(null)}
        subnavItems={satSubnav}
        subnavHrefFor={satHref}
        accent={satAccent}
        user={user}
        gradeLabel={gradeLabel}
        isMobile={isMobile}
        medabrainOpen={false}
        medabrainMessages={[]}
        recentActivitySummary={recentActivitySummary}
      />
    );
    return SAT_ENABLED ? pillar : <SatBetaCover isMobile={isMobile}>{pillar}</SatBetaCover>;
  }
  // ── Roadmap: the twelve-month admissions plan ───────────────────────────────
  // Thin on purpose. The tab fetches its own Portfolio and builds its own digest (the same
  // fetchPortfolio + buildProfileFactsText the master plan uses), so all App.jsx owes it is the
  // live signals it already computes for Plans, the unlock-filtered sub-nav, and the two deep
  // links out. Everything else — generation, persistence, the intake — lives in the pillar.
  function tRoadmap(){
    return(
      <div>
        {questStripFor('roadmap')}
        <RoadmapTab
          user={user} saveUser={saveUser} liveSignals={planLiveSignals}
          accent={roadmapAccent} isMobile={isMobile} reducedMotion={reducedMotion}
          view={roadmapView} onViewChange={setRoadmapView}
          subnavItems={roadmapSubnav} hrefFor={roadmapHref} lockedItem={unlocks.locked('roadmap')[0]}
          goPortfolio={goPortfolio} goPlans={()=>setTab('plans')}
          // The readiness gate's rows carry their own destinations as data (see
          // ROADMAP_GATES in src/lib/roadmap/readiness.js), so the tab needs the
          // generic jump rather than a fixed pair of callbacks.
          onNavigate={goAnywhere}
        />
      </div>
    );
  }
  const tRenders={ home:tHome, sat:tSatWrap, prep:tPrep, portfolio:tPortWrap, roadmap:tRoadmap, plans:tPlans, progress:tAnalytics, settings:tSettings };

  return(
    // Every component under here can call useGradeBand() to branch on explore/build/apply
    // WITHOUT being handed the user — and, by construction, the only thing the hook lets it
    // decide is emphasis: 'active' or 'preview', never whether something renders at all.
    // See src/lib/useGradeBand.jsx and components/BandPreview.jsx.
    <GradeBandProvider user={user}>
    <ErrorBoundary resetKey={tab}>
      <Toaster position="bottom-right" toastOptions={{style:{background:C.s1,color:C.t1,border:`1px solid ${C.b2}`,fontFamily:C.FB,fontSize:13,boxShadow:`0 8px 32px rgba(0,0,0,0.6)`},success:{iconTheme:{primary:C.green,secondary:C.s1}},error:{iconTheme:{primary:C.rose,secondary:C.s1}}}}/>
      <AnimatePresence>
        {vidM&&<VideoModal key="vidmodal" ytId={vidM.ytId} title={vidM.title} url={vidM.url} onClose={()=>setVM(null)} m={isMobile}/>}
      </AnimatePresence>
      <RewardChest
        open={!!chest}
        title={chest?.title}
        eyebrow={chest?.eyebrow}
        xp={chest?.xp||0}
        cosmetic={chest?.cosmetic}
        onOpen={()=>{ chest?.onOpen?.(); }}
        onClose={closeChest}
      />
      {/* The milestone moment. Fires once, the instant a marquee gate opens (today: Plans),
          and its one button walks the student straight into what they just earned — an
          unlock nobody visits is the same as no unlock. */}
      <UnlockCelebration
        open={!!milestoneUnlock}
        label={milestoneUnlock?.label}
        earned={milestoneUnlock?.earned}
        reward={milestoneUnlock?.reward}
        cta={milestoneUnlock?.id==='plans'?'Build my plan':'Open it'}
        reducedMotion={reducedMotion}
        onGo={()=>{ const id=milestoneUnlock?.id; setMilestoneUnlock(null); if(id==='plans') goPlans(); else if(id) setTab(id.split('/')[0]); }}
        onClose={()=>setMilestoneUnlock(null)}
      />
      {/* ── The lesson-complete takeover ─────────────────────────────────────
          Full screen, two pages: what you just earned, then where that puts your
          streak, your goal and your Perfect Week. Rendered at the app root (not
          inside the pathway view) so it survives the lesson player unmounting
          underneath it and can hand the student straight into the next lesson. */}
      <LessonCompleteOverlay
        open={!!lessonCelebration}
        lessonTitle={lessonCelebration?.lessonTitle}
        unitTitle={lessonCelebration?.unitTitle}
        pathwayLabel={lessonCelebration?.pathwayLabel}
        quizScore={lessonCelebration?.quizScore}
        xpAwarded={lessonCelebration?.xpAwarded||0}
        xpTier={lessonCelebration?.xpTier||'none'}
        xpBefore={lessonCelebration?.xpBefore||0}
        streak={lessonCelebration?.streak||0}
        streakBefore={lessonCelebration?.streakBefore||0}
        dailyGoal={lessonCelebration?.dailyGoal}
        week={lessonCelebration?.week}
        targetInfo={lessonCelebration?.targetInfo}
        nextReward={lessonCelebration?.nextReward}
        milestoneHit={lessonCelebration?.milestoneHit}
        perfectWeekJustEarned={!!lessonCelebration?.perfectWeekJustEarned}
        freezesHeld={streakFreezes}
        nextLessonTitle={lessonCelebration?.nextLesson?.lesson?.title||null}
        accent={accent}
        reducedMotion={reducedMotion}
        onNextLesson={()=>{
          const next=lessonCelebration?.nextLesson;
          setLessonCelebration(null);
          if(next)openLesson(next.lesson,next.unit);
        }}
        onOpenStreak={()=>{setLessonCelebration(null);goProgress('streak');}}
        onClose={()=>setLessonCelebration(null)}
      />
      {/* The quest takeover. Mounted at the root, beside the lesson one and for the same reason:
          the last card of a three-week quest can land on any screen in the app, and a celebration
          that only fires inside one tab is a celebration most people never see. */}
      <AnimatePresence>
        {questCelebration&&(
          <QuestCompleteOverlay
            key={questCelebration.assignment.id}
            quest={questCelebration.assignment}
            ev={questCelebration.ev}
            busy={questBusyId===questCelebration.assignment.id}
            onClaim={()=>claimQuestXP(questCelebration.assignment)}
            onClose={()=>setQuestCelebration(null)}
            onTakeNext={async(questId)=>{
              // Claim first, then start the next rung. A student who taps "take it on" without
              // taking the reward they just earned has been robbed by the interface.
              await claimQuestXP(questCelebration.assignment);
              await startQuest(questId);
            }}
            reducedMotion={reducedMotion}
            m={isMobile}
          />
        )}
      </AnimatePresence>
      {/* The idle showcase — the loading journey played when nothing is loading.
          Sits above everything, leaves on the first tap or key. */}
      {showcase.showing && <BrandShowcase onDone={showcase.dismiss}/>}
      {/* First focusable thing on the page. Without it a keyboard or switch user
          has to tab through an eleven-item sidebar on every single navigation. */}
      <a href="#msp-main" className="msp-skip-link">Skip to main content</a>
      <div key={themeEpoch} style={{display:'flex',flexDirection:isMobile?'column':'row',width:'100%',minWidth:0,height:'var(--msp-vh)',overflow:'hidden',background:C.bg,color:C.t1,fontFamily:C.FB,position:'relative'}}>

        {/* ══ MOBILE HEADER ════════════════════════════════════════════════════ */}
        {isMobile && (
          <header style={{padding:'12px 16px',borderBottom:`1px solid ${C.b1}`,background:C.s0,display:'flex',alignItems:'center',justifyContent:'space-between',zIndex:100}}>
            <div style={R({gap:8,minWidth:0})}>
              <AnimatedLogo size={30} variant="hover" glow={false}/>
              {/* On a phone the wordmark gives way to the pathway switcher the moment there's
                  more than one pathway to switch between — knowing (and changing) which track
                  you're in matters more, on every screen, than seeing the app's name again. */}
              {pathwayRows.length>1?(
                <div style={{flex:'0 0 auto'}}>
                  <PathwayQuickSwitch
                    rows={pathwayRows} focused={focusedPathway}
                    onFocus={switchPath} onResume={resumePathwayRow}
                    onAdd={goManagePathways} onManage={goManagePathways}
                    compact reducedMotion={reducedMotion}
                  />
                </div>
              ):(
                <div style={{fontSize:14,fontWeight:800,color:C.t1,fontFamily:C.FD}}>MedSchoolPrep</div>
              )}
            </div>
            <div style={R({gap:8})}>
              {/* The ONLY route into search on a phone — there is no ⌘K there —
                  so it is 36px rather than 32, tinted with the accent rather
                  than another gray chip in a row of gray chips, and labeled for
                  a screen reader as what it does rather than as a mechanism. */}
              <button data-tour="cmdk" onClick={()=>setCmdOpen(true)} aria-label="Search the app"
                style={{width:36,height:36,borderRadius:12,background:tint(accent,0.14),border:`1px solid ${tint(accent,0.3)}`,display:'flex',alignItems:'center',justifyContent:'center',color:C.t1,cursor:'pointer',flexShrink:0}}><Search size={16}/></button>
              <ThemeToggle mode={a11y.themeMode} onChange={m=>updateA11y({themeMode:m})} size={32} align="right" accent={accent}/>
              {/* A live XP boost is genuinely counting down and ends sooner than today does —
                  a boost applied silently to a number the student was going to earn anyway
                  changes no behavior at all, so seeing it run is the entire mechanic.
                  The streak used to sit beside it and no longer does: a consecutive-day count
                  pinned to the header is on screen on every tab, all session, which makes it the
                  most persistent number in the product. It now appears once, small, at the bottom
                  of the student dashboard's achievements module and nowhere else. */}
              <BoostChip boosts={boosts} onClick={()=>goProgress('streak')} m />
              <div style={{textAlign:'right'}}>
                <div style={{fontSize:10,color:C.t3,fontFamily:C.FM}}>Lv.{lvl}</div>
                <div style={{fontSize:11,fontWeight:700,color:C.t1}}>{user.name}</div>
              </div>
              <div onClick={() => setTab('settings')} style={{width:32,height:32,borderRadius:8,background:`linear-gradient(135deg,${accent}55,${accent}28)`,border:`1.5px solid ${accent}45`,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,fontSize:12,color:onTint(accent),cursor:'pointer'}}>{user.name[0].toUpperCase()}</div>
            </div>
          </header>
        )}

        {/* ══ SIDEBAR (Desktop) ════════════════════════════════════════════════ */}
        {/* Width via a custom property, not a literal 236: index.css narrows the rail
            on a tablet-sized canvas, where 236 of ~890 usable pixels is a quarter of
            the screen spent on navigation. An inline number would outrank the
            stylesheet and there would be nothing the rule could do. */}
        {!isMobile && (
          <aside className="msp-nav-rail" style={{width:'var(--msp-rail-w, 236px)',flexShrink:0,display:'flex',flexDirection:'column',overflow:'hidden',borderRight:`1px solid ${C.b1}`,background:`linear-gradient(180deg,${C.s0} 0%,${C.bg} 100%)`,position:'relative',zIndex:10}}>
            <div style={{position:'absolute',top:0,left:0,right:0,height:1,background:`linear-gradient(90deg,transparent,${accent}60,transparent)`}}/>
            <div style={{padding:'20px 16px 16px',borderBottom:`1px solid ${C.b1}`}}>
              <div style={R({gap:12})}>
                <AnimatedLogo size={34} variant="breathe"/>
                <div>
                  <div style={{fontSize:14,fontWeight:800,color:C.t1,fontFamily:C.FD}}>MedSchoolPrep</div>
                  <div style={{fontSize:9,color:C.t3,letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))'}}>Your path into medicine</div>
                </div>
              </div>
            </div>
            <button data-tour="cmdk" onClick={()=>setCmdOpen(true)} style={{margin:'12px 16px 0px',padding:'8px 12px',borderRadius:8,background:C.s2,border:`1px solid ${C.b1}`,color:C.t3,fontSize:12,fontFamily:C.FB,display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}>
              {/* "Search everything", not "Jump to…": the palette stopped being a
                  screen switcher when it learned the library, and a student who
                  reads "jump to" has no reason to believe typing a scholarship's
                  name into it will work. */}
              <Search size={13}/><span style={{flex:1,textAlign:'left'}}>Search everything…</span><span style={{...pill(C.s3,C.t3,{fontSize:9,fontFamily:C.FM,padding:'4px 4px'})}}>{cmdKeyHint}</span>
            </button>
            <div onClick={()=>setTab('settings')} style={{padding:'12px 16px',borderBottom:`1px solid ${C.b1}`,cursor:'pointer',background:tab==='settings'?`${settingsAccent}12`:undefined}}>
              <div style={R({gap:12,marginBottom:12})}>
                <div style={{width:36,height:36,borderRadius:12,background:`linear-gradient(135deg,${accent}55,${accent}28)`,border:`1.5px solid ${accent}45`,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,fontSize:14,color:onTint(accent),flexShrink:0}}>
                  {user.name[0].toUpperCase()}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:700,color:C.t1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontFamily:C.FD}}>{user.name}</div>
                  <div style={{fontSize:11,color:C.t3}}>Lv.{lvl} {levelInfo.tier} · {curPath?.label}</div>
                </div>
                <Settings size={15} color={C.t3}/>
              </div>
              <Bar pct={levelInfo.pct} color={accent} h={3} glow/>
              {streak>0&&<div style={{...R({gap:4,marginTop:8})}}><span style={pill(C.amberDim,C.amberL,{fontSize:10})}><Flame size={10}/>{streak}d streak</span></div>}
            </div>
            {/* The switcher lives in the shell, not on the Pathways page, and that placement is
                the feature: a student writing an essay in Portfolio or grinding SAT questions can
                see which pathway is in focus and move to another one without navigating anywhere
                first. Parallel pathways are a property of the whole app, so the control for them
                belongs where the whole app can see it. */}
            {pathwayRows.length>0&&(
              <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.b1}`}}>
                <PathwayQuickSwitch
                  rows={pathwayRows} focused={focusedPathway}
                  onFocus={switchPath} onResume={resumePathwayRow}
                  onAdd={goManagePathways} onManage={goManagePathways}
                  reducedMotion={reducedMotion}
                />
              </div>
            )}
            <nav style={{flex:1,padding:'8px 8px',overflowY:'auto'}}>
              {navItems.map(n=>{
                const active=tab===n.id;
                const nc=navColor[n.id]||accent;
                // Gated on Flashcards actually being unlocked: a count badge advertising a
                // sub-tab the student can't open yet is worse than no badge at all — it
                // promises something behind the click that isn't there.
                // Progress carries a badge too, and only ever for a CLAIMABLE quest — XP sitting
                // on the table is the one quest state that is urgent in a way navigating there
                // resolves in a single tap. A badge that also counted running quests would be lit
                // permanently and therefore read as decoration.
                const badge=n.id==='prep'&&unlocks.isOpen('prep','flashcards')&&dueDeckCount>0?dueDeckCount
                  :n.id==='progress'&&questStats.claimable>0?questStats.claimable:null;
                const planDue=planPillarsDueToday.has(n.id);
                return(
                  // A real <a href>, not a div: ⌘-click opens the tab in a new browser tab,
                  // the destination shows in the status bar on hover, and screen readers get
                  // a link with aria-current instead of an unlabelled clickable box.
                  <motion.a key={n.id} href={tabHref(n.id)} aria-current={active?'page':undefined} data-tour={`nav-${n.id}`} whileHover={{background:active?`${nc}22`:'rgba(255,255,255,0.04)',x:2}} onClick={e=>onNavLinkClick(e,()=>{setTab(n.id);play('click');})} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',borderRadius:8,cursor:'pointer',marginBottom:4,background:active?`${nc}18`:undefined,color:active?onTint(nc):C.t2,fontWeight:active?700:500,fontSize:14,fontFamily:C.FB,borderLeft:active?`2px solid ${nc}`:'2px solid transparent',transition: CONTROL_TRANSITION,textDecoration:'none'}}>
                    <n.ic size={17} color={active?nc:undefined} style={{opacity:active?1:0.7}}/>
                    <span style={{flex:1, display:'inline-flex', alignItems:'center', gap:4}}>
                      <span>{n.label}</span>
                      {/* A pillar that is not this band's focus. The row is a completely normal
                          row — same link, same click, same URL — and simply says so. See
                          previewPillars in src/lib/onboardingFlow.js and BandPreview.jsx. */}
                      {previewPillars.includes(n.id) && <BandPreviewTag bands={bandsAwayFromPillar}/>}
                      {n.id==='sat' && (
                        <span className="pbeta" style={{
                          fontSize:9,
                          padding:'4px 4px',
                          borderRadius:4,
                          background: C.skyDim || tint(C.sky, 0.15),
                          color: isLight() ? C.sky : C.skyL,
                          border:`1px solid ${tint(C.sky, 0.35)}`,
                          fontWeight:800,
                          fontFamily:C.FM,
                          lineHeight: 1
                        }}>
                          BETA
                        </span>
                      )}
                    </span>
                    {badge&&<span style={pill(C.amberDim,C.amberL,{fontSize:9,padding:'4px 8px'})}>{badge}</span>}
                    {/* Medabrain: this pillar has an outstanding plan task due today — see
                        planPillarsDueToday above. Distinct violet dot (not the amber due-deck
                        count pill above) so the two signals never read as one thing. */}
                    {planDue&&<span title="A plan task is due here today" aria-label="Plan task due today" style={{width:7,height:7,borderRadius:'50%',background:C.violet,flexShrink:0,boxShadow:`0 0 0 2px ${C.violet}30`}}/>}
                  </motion.a>
                );
              })}
            </nav>
            {/* What opens next, and what opens it. Without this the sidebar would just be
                mysteriously short — a student who has heard about the AI coach from a friend
                would conclude the app is broken rather than that they haven't reached it yet.
                One item only: a list of six locked things here would rebuild the exact wall
                of options this whole change exists to tear down. */}
            <NextUnlockCard items={unlocks.locked('')} variant="rail" accent={accent}/>
            {/* ── Family access, in the rail ─────────────────────────────────
                The parent dashboard's discoverability problem was structural: it lived at the
                bottom of a settings page, so the only students who found it were the ones already
                looking for it, and the parents it was built for never found it at all. One line
                in the rail, pointing at /settings/family, is what turns "we have that feature"
                into "people use that feature". It states the direction too — invite a parent —
                because "Family" on its own reads as somewhere your family already is. */}
            <a
              href={settingsHref('family')} aria-current={tab==='settings'&&settingsView==='family'?'page':undefined}
              onClick={e=>onNavLinkClick(e,()=>{goFamily();play('click');})}
              style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',borderTop:`1px solid ${C.b1}`,textDecoration:'none',color:C.t2,fontSize:12.5,fontFamily:C.FB}}
            >
              <Users size={14} color={C.violet}/>
              <span style={{flex:1}}>{familyLinkCount>0?`Family access · ${familyLinkCount}`:'Invite a parent'}</span>
              {/* The badge is the whole notification system for family messages. It is deliberately
                  the only one — an email or a push for "your mother sent you a note" spends the
                  send quota the invitation itself runs on, and turns a line beside a study plan
                  into a thing that interrupts you. */}
              {familyUnread>0&&(
                <span aria-label={`${familyUnread} unread message${familyUnread===1?'':'s'}`} style={{
                  minWidth:17,height:17,padding:'0px 4px',borderRadius:8,display:'inline-flex',
                  alignItems:'center',justifyContent:'center',background:C.amber,color:onTint(C.amber),
                  fontSize:10.5,fontWeight:800,
                }}>{familyUnread>9?'9+':familyUnread}</span>
              )}
              <ChevronRight size={13} color={C.t3}/>
            </a>
            {/* Theme, one click from anywhere in the app. It used to live four
                levels deep in Settings → Appearance, which in practice meant the
                app picked the theme and the student lived with it. The full
                picker (previews, high contrast, type size) is still there — this
                is the switch itself, where a switch belongs. */}
            <div style={{padding:'8px 12px',borderTop:`1px solid ${C.b1}`,display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
              <span style={{fontSize:11,color:C.t3,fontWeight:600}}>Theme</span>
              <ThemeToggle mode={a11y.themeMode} onChange={m=>updateA11y({themeMode:m})} size={32} align="right" placement="above" accent={accent}/>
            </div>
          </aside>
        )}

        {/* ══ MAIN CONTENT ═════════════════════════════════════════════════════ */}
        {/* data-app-content: the SAT tool rail is position:fixed and measures this
            element's left edge to sit flush against the content column instead of
            hard-coding the sidebar width. See src/components/sat/SatToolsContext.jsx. */}
        {/* tabIndex={-1} so the skip link can move focus here; without it the
            anchor scrolls but the next Tab press starts from the top again. */}
        <main id="msp-main" tabIndex={-1} aria-label={`${NAV.find(n=>n.id===tab)?.label||'Main'} section`} data-app-content style={{flex:1,minWidth:0,overflowY:'auto',position:'relative',background:C.bg,paddingBottom:isMobile?84:0}}>
          {!isMobile && <div style={{position:'sticky',top:0,left:0,right:0,height:1,background:`linear-gradient(90deg,${navColor[tab]||accent}60,transparent)`,zIndex:5,transition:'background .3s'}}/>}
          {/* 1440px used to cap this well inside a typical 1920px laptop/monitor viewport (minus
              the 236px sidebar), leaving a large, unused gutter on both sides that only grew on
              bigger screens. Raised so ordinary desktop/laptop viewports use their full width;
              content that genuinely needs a narrower reading measure (lesson articles, essay
              editor, etc.) already caps itself internally rather than relying on this wrapper. */}
          {/* The measure and the gutters are custom properties now, not a
              two-way `isMobile ?`. index.css defines them per device class
              (phone / tablet / laptop / desktop / wide) and again for a short
              screen, which is what lets a 1024px iPad and a 1366×768 Chromebook
              each get gutters sized for the room they actually have instead of
              both taking the same "not mobile" branch. See the AUTO-FIT section
              in index.css and src/lib/viewportFit.js. */}
          <div style={{maxWidth:'var(--msp-content-max)',margin:'0 auto',padding:'var(--msp-content-pad)'}}>
            {/* The tab swap deliberately does NOT go through AnimatePresence — mounting the next
                tab must never be conditional on an exit animation reporting itself finished, which
                is precisely how this app's content column used to end up permanently black after a
                while on Portfolio. TabContentGuard carries the full explanation, keeps the fade-in,
                and watches the content area so a blank one can never again be the end of the story. */}
            <TabContentGuard tabKey={tab} reducedMotion={reducedMotion}>
              {/* Scoped to this tab's content only — a throw while rendering one tab (a piece of
                  async state that hasn't landed yet, an edge case in one panel) used to bubble to
                  the single boundary wrapping the ENTIRE shell below, replacing the sidebar and
                  nav along with it and leaving no way back except a full reload. This boundary
                  resets itself the moment `tab` changes (see ErrorBoundary's resetKey), so
                  switching to another section — which the student can still do, since the nav
                  survives outside this boundary — recovers on its own instead of staying stuck. */}
              <ErrorBoundary resetKey={tab} onEscapeToPrep={()=>setTab('prep')}>
                {(tRenders[tab]||tHome)()}
              </ErrorBoundary>
            </TabContentGuard>
          </div>
        </main>

        {/* ══ BOTTOM NAV (Mobile) ══════════════════════════════════════════════ */}
        {isMobile && (
          // Sized off the live item count, not the full seven. Progressive unlocking means a
          // new student sees four items here instead of seven, and a four-item bar can afford
          // what a seven-item bar could not: 22px icons and an 11px label with room around
          // them. That is the difference between a phone-native bottom bar and a row of tiny
          // gray glyphs — and "it looks like a 90s site, teenagers expect app-like nav" was
          // the exact complaint. The bar shrinks back toward the compact treatment as more
          // items unlock, by which point the student knows what each one is.
          // 68px at every item count, not 68/64: 64 minus the label line left
          // the icon's own touch area under 44px once seven items were showing,
          // which is exactly when the bar is hardest to hit. The bar is also the
          // one surface where height is cheap — it sits in the thumb arc at the
          // bottom of the screen, which is the easiest part of a phone to reach
          // and the part this app should be spending on navigation.
          <nav aria-label="Main" style={{position:'fixed',bottom:0,left:0,right:0,height:68,background:C.s0,borderTop:`1px solid ${C.b1}`,display:'flex',alignItems:'center',justifyContent:'space-around',gap:8,zIndex:300,paddingBottom:'env(safe-area-inset-bottom)'}}>
            {navItems.map(n=>{
              const nc=navColor[n.id]||accent;
              const badge=n.id==='prep'&&unlocks.isOpen('prep','flashcards')&&dueDeckCount>0?dueDeckCount
                :n.id==='progress'&&questStats.claimable>0?questStats.claimable:null;
              const planDue=planPillarsDueToday.has(n.id);
              return(
                // flex:1 (not a fixed width) so the bar stays balanced regardless of item count —
                // was width:70 back when there were only 5 tabs; fixed widths would overflow once
                // Plans made it 6.
                <a key={n.id} href={tabHref(n.id)} aria-current={tab===n.id?'page':undefined} data-tour={`nav-${n.id}`} onClick={e=>onNavLinkClick(e,()=>setTab(n.id))} style={{position:'relative',display:'flex',flexDirection:'column',alignItems:'center',gap:4,color:tab===n.id?nc:C.t3,cursor:'pointer',flex:'1 1 0',minWidth:0,padding:'0px 4px',textDecoration:'none'}}>
                  <div style={{position:'relative',display:'flex'}}>
                    <n.ic size={navItems.length<=5?22:20} color={tab===n.id?nc:C.t3}/>
                    {badge&&<span style={{position:'absolute',top:-4,right:-9,...pill(C.amberDim,C.amberL,{fontSize:9,padding:'0px 4px'})}}>{badge}</span>}
                    {/* Medabrain: this pillar has an outstanding plan task due today — offset to
                        the opposite corner from the due-deck badge above so both can show at once
                        without overlapping. */}
                    {planDue&&<span title="A plan task is due here today" aria-label="Plan task due today" style={{position:'absolute',bottom:-2,right:-3,width:7,height:7,borderRadius:'50%',background:C.violet,boxShadow:`0 0 0 2px ${C.s0}`}}/>}
                  </div>
                  {/* 11px at every count. 9.5px was the seven-item fallback, and
                      a 9.5px label is not a label — it is a smudge under an icon,
                      which puts the whole burden of "what is this tab" back on
                      the glyph. If seven items genuinely cannot carry a readable
                      label at this width, that is an argument for fewer
                      top-level destinations, not for smaller type. */}
                  <span style={{fontSize:11,fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:'100%',display:'inline-flex',alignItems:'center',gap:4}}>
                    <span>{n.label}</span>
                    {n.id==='sat' && (
                      <span className="pbeta" style={{
                        fontSize:8,
                        padding:'0px 4px',
                        borderRadius:4,
                        background: C.skyDim || tint(C.sky, 0.15),
                        color: isLight() ? C.sky : C.skyL,
                        border:`1px solid ${tint(C.sky, 0.35)}`,
                        fontWeight:800,
                        fontFamily:C.FM,
                        lineHeight: 1
                      }}>
                        BETA
                      </span>
                    )}
                  </span>
                </a>
              );
            })}
          </nav>
        )}

        {/* ══ QUICK-SWITCH COMMAND PALETTE (⌘K) ═══════════════════════════════════ */}
        <AnimatePresence>
          {cmdOpen && (
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={()=>setCmdOpen(false)}
              style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:500,display:'flex',alignItems:'flex-start',justifyContent:'center',paddingTop:isMobile?0:'12vh'}}>
              {/* On a phone this is a full-screen sheet, not a floating card, and
                  that is not a style choice. A centered dialog with a 64vh cap
                  loses its bottom half to the on-screen keyboard the instant the
                  input focuses — which is immediately, since the input
                  autofocuses — leaving about two visible results. Anchoring the
                  sheet to the top puts the search field above the keyboard and
                  spends every remaining pixel on results, which is the same
                  shape as the phone-native search surfaces a student already
                  uses (Spotlight, the Android app drawer). */}
              <motion.div initial={{opacity:0,y:-10,scale:isMobile?1:.98}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:-10,scale:isMobile?1:.98}} transition={{duration:.16}}
                role="dialog" aria-modal="true" aria-label="Search MedSchoolPrep"
                style={{
                  width:isMobile?'100%':'min(560px,92vw)',
                  height:isMobile?'100%':undefined, maxHeight:isMobile?undefined:'70vh',
                  display:'flex',flexDirection:'column',background:C.s1,
                  borderRadius:isMobile?0:16, border:isMobile?'none':`1px solid ${C.b2}`,
                  boxShadow:'0 24px 70px rgba(0,0,0,0.65)',overflow:'hidden',
                  paddingTop:isMobile?'env(safe-area-inset-top)':undefined,
                }}
                onClick={e=>e.stopPropagation()}>
                <div style={{display:'flex',alignItems:'center',gap:8,padding:isMobile?'14px 16px':'12px 16px',borderBottom:`1px solid ${C.b1}`}}>
                  <Search size={16} color={C.t3}/>
                  {/* 16px on a phone and never smaller: iOS Safari zooms the whole
                      page in on any focused input below 16px, and a palette that
                      zooms the app the moment you tap it is a palette people stop
                      tapping. */}
                  <input autoFocus value={cmdQ} onChange={e=>setCmdQ(e.target.value)} onKeyDown={onCmdInputKeyDown}
                    type="search" enterKeyHint="go" autoCorrect="off" autoCapitalize="none" spellCheck={false}
                    aria-label="Search screens, scholarships, programs and lessons"
                    placeholder={isMobile?'Search anything…':'Search screens, scholarships, programs, lessons…'}
                    style={{flex:1,minWidth:0,background:'none',border:'none',color:C.t1,fontSize:isMobile?16:14,fontFamily:C.FB}}/>
                  {/* A phone has no Escape key, so it gets a real, thumb-sized
                      way out instead of a keycap that means nothing to it. */}
                  {isMobile
                    ? <button type="button" onClick={()=>setCmdOpen(false)} aria-label="Close search"
                        style={{width:36,height:36,flexShrink:0,borderRadius:12,background:C.s3,border:`1px solid ${C.b1}`,display:'flex',alignItems:'center',justifyContent:'center',color:C.t2,cursor:'pointer'}}><X size={16}/></button>
                    : <span style={{...pill(C.s3,C.t3,{fontSize:9,fontFamily:C.FM})}}>ESC</span>}
                </div>
                <div ref={cmdListRef} style={{overflowY:'auto',WebkitOverflowScrolling:'touch',flex:1,padding:8,paddingBottom:isMobile?'max(20px, env(safe-area-inset-bottom))':8}}>
                  {/* The library is fetched on the first keystroke (see the note
                      beside contentIndex), so for a moment the screens are ranked
                      and the records are not. Saying so beats a list that quietly
                      grows under the student's finger while they are reading it. */}
                  {contentLoading&&cmdQ.trim().length>=2&&(
                    <div style={{...R({gap:8}),padding:'8px 8px',fontSize:11,color:C.t4}}>
                      <Loader2 size={12} className="spin"/>Searching scholarships, programs and lessons…
                    </div>
                  )}
                  {filteredCmds.length===0&&!contentLoading&&(
                    <div style={{padding:'24px 16px',textAlign:'center'}}>
                      <div style={{fontSize:12.5,color:C.t2,marginBottom:4}}>Nothing matched “{cmdQ.trim()}”.</div>
                      {/* Never a bare dead end. The honest reason a search fails
                          here is almost always that the thing is not in the
                          curated set — not that the student typed it wrong — and
                          telling them what IS searchable is the difference
                          between trying again and concluding the app hasn't got
                          it. */}
                      <div style={{fontSize:11,color:C.t4,lineHeight:1.6}}>
                        You can search every screen, plus scholarships, summer programs, competitions,
                        combined-degree programs, colleges, lessons and decks by name.
                      </div>
                    </div>
                  )}
                  {/* 'Pathways' leads: for a student running three tracks, "switch to Nursing"
                      is the single most-repeated action in the app. Screens come next, then the
                      library, then the screens the ladder has not opened yet — most specific
                      answer first, least certain answer last. */}
                  {/* One line, deliberately: scripts/verifyParallelPathways.mjs reads this literal
                      to prove 'Pathways' is rendered and rendered ahead of the destinations. */}
                  {['Recent','Pathways','Jump to','SAT','Prep','Portfolio','Roadmap','Progress','Settings','Scholarships','Opportunities','Combined degrees','Colleges','Lessons','Flashcards','Not shown yet'].map(group=>{
                    const items=filteredCmds.filter(c=>c.group===group);
                    if(!items.length)return null;
                    return(
                      <div key={group} style={{marginBottom:4}}>
                        <div style={{fontSize:9.5,fontWeight:700,color:C.t3,letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', padding:'8px 8px 4px'}}>{group}</div>
                        {items.map(cmd=>{
                          const idx=filteredCmds.indexOf(cmd);
                          const active=idx===cmdActiveIdx;
                          return(
                            // 44px minimum on a phone, which is the smallest
                            // target a thumb hits reliably — the old 8px padding
                            // made these about 33px, and a mis-tap in a list of
                            // near-identical rows navigates somewhere wrong.
                            <motion.div key={cmd.id} data-cmd-active={active?'true':undefined}
                              // onMouseMove, not onMouseEnter. A pointer that
                              // merely HAPPENS to be resting where the results
                              // will appear fires mouseenter as they render,
                              // which silently drags the keyboard selection off
                              // the best answer and onto whatever is under the
                              // cursor. Enter then opens the wrong thing, and by
                              // the time the student sees which one, they have
                              // already pressed it. mousemove fires only when the
                              // mouse actually moves, which is the only moment
                              // hover is evidence of intent.
                              onMouseMove={()=>setCmdActiveIdx(idx)} whileHover={{background:'rgba(255,255,255,0.05)'}} onClick={()=>runCommand(cmd)}
                              style={{display:'flex',alignItems:'center',gap:10,padding:isMobile?'10px 8px':'8px 8px',minHeight:isMobile?44:undefined,borderRadius:8,cursor:'pointer',color:C.t1,fontSize:13,background:active?`${accent}16`:undefined,border:active?`1px solid ${accent}30`:'1px solid transparent'}}>
                              <cmd.ic size={15} color={cmd.locked?C.t4:accent} style={{flexShrink:0}}/>
                              <span style={{flex:1,minWidth:0}}>
                                <span style={{display:'block',color:cmd.locked?C.t2:C.t1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{cmd.label}</span>
                                {/* A locked row says what opens it. "Not shown yet" with no
                                    "yet what?" is a closed door with no handle. A library row
                                    says what it is — the org, the state, the degree — because
                                    "Drexel University" alone does not distinguish the college
                                    from the BS/MD program at it. */}
                                {cmd.hint&&<span style={{display:'block',fontSize:10.5,color:C.t4,marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{cmd.hint}</span>}
                                {/* The breadcrumb. This is the part that teaches
                                    somebody where things live, and it is the only
                                    route by which a student eventually stops
                                    needing to search at all. */}
                                {cmd.where&&<span style={{display:'block',fontSize:9.5,color:C.t3,marginTop:3,fontFamily:C.FM,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{cmd.where}</span>}
                              </span>
                              {active&&!isMobile?<span style={{...pill(C.s3,C.t3,{fontSize:9,fontFamily:C.FM,padding:'4px 4px'})}}>↵</span>:<ChevronRight size={13} color={C.t4} style={{flexShrink:0}}/>}
                            </motion.div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
                {/* The keyboard legend, on the surface where the keyboard is the
                    point. "/" is here because it is the shortcut most students
                    already own from every other product they use, and nothing in
                    the app said it worked. */}
                {!isMobile&&(
                  <div style={{...R({gap:12}),padding:'8px 14px',borderTop:`1px solid ${C.b1}`,background:C.s0,fontSize:9.5,color:C.t4,fontFamily:C.FM,flexWrap:'wrap'}}>
                    <span>↑↓ move</span><span>↵ open</span><span>esc close</span>
                    <span style={{marginLeft:'auto'}}>{cmdKeyHint} or / to reopen</span>
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ══ POST-ONBOARDING PRODUCT TOUR ═════════════════════════════════════ */}
        {tourActive && <AppTour steps={TOUR_STEPS} onFinish={finishTour} onSkip={finishTour}/>}
      </div>
    </ErrorBoundary>
    </GradeBandProvider>
  );
}
