# MedSchoolPrep — Ultra-Fast File Navigation & Repository Directory Index

Welcome to the **MedSchoolPrep File Navigation Ledger**. This document is specifically structured for AI agents (Claude, Jules, GPT) and developers to locate files instantly, minimize token consumption, and execute code modifications with zero guesswork.

---

## ⚡ Task-to-File Quick Lookup Matrix

When assigned a specific task, jump directly to the relevant files listed below:

| Task / Feature Domain | Primary UI Component | Core Logic / Engine | Data Catalog / Migration | Automated Audit Script |
| :--- | :--- | :--- | :--- | :--- |
| **SAT Desmos Calculator** | `src/components/sat/DesmosCalculator.jsx`, `DesmosSurface.jsx` | `src/lib/sat/desmos.js`, `desmosSeed.js` | `src/data/sat/reference.js` | `scripts/verifySatDesmos.mjs` |
| **SAT Adaptive Testing & Scoring** | `src/components/sat/SatFullTestPanel.jsx`, `SatScoreReport.jsx` | `src/lib/sat/adaptive.js`, `baseline.js` | `src/data/sat/forms.js`, `scoring.js` | `scripts/verifySatForms.mjs`, `verifySatScoring.mjs` |
| **SAT Question Bank & AI Practice** | `src/components/sat/SatLibraryPanel.jsx`, `SatPracticePanel.jsx` | `src/lib/sat/aiPractice.js`, `selector.js` | `src/data/sat/questions/index.js` | `scripts/auditSatBank.mjs`, `verifySatLibrary.mjs` |
| **Pathway Lessons & Audio** | `src/components/PrepMedabrain.jsx`, `HighlightableArticle.jsx` | `src/lib/lessonAudio.js`, `lessonFeedback.js` | `src/data/lessonContent/index.js` | `scripts/auditLessonsCompleteness.mjs` |
| **Verification Quizzes** | `src/components/QuizRecommendationsPanel.jsx` | `src/lib/quizPersonalization.js` | `src/data/quizzes/index.js` | `scripts/auditQuizBankBalance.mjs` |
| **Ivy Engine & Portfolio Strategy** | `src/components/portfolio/ivy/NarrativeEnginePanel.jsx` | `src/lib/ivy/engine.js`, `holistic.js` | `src/data/ivy/tierCatalog.js` | `scripts/verifyIvyEngine.mjs` |
| **Four-Year Course Strategy** | `src/components/prep/FourYearMap.jsx`, `CoursePlannerPanel.jsx` | `src/lib/fourYearMap.js`, `coursePlanner.js` | `src/data/lessonContent/courseStrategy.js` | `scripts/verifyFourYearMap.mjs` |
| **Common App Resume & Activities** | `src/components/ActivitiesResumePanel.jsx` | `src/lib/commonApp/activities.js`, `activityIntel.js` | `src/data/constants.js` | `scripts/verifyResumeBuilder.mjs` |
| **Common App Mirror & Portfolio Sync** | `src/components/portfolio/CommonAppMirror.jsx`, `CommonAppMirrorBadge.jsx` | `src/lib/commonApp/sections.js`, `derive.js`, `sync.js`, `useCommonApp.js` | — (ledger rides the user record) | `scripts/verifyCommonApp.mjs` |
| **Opportunity Intelligence** | `src/components/portfolio/OpportunityFeed.jsx`, `OpportunityCard.jsx` | `src/lib/opportunity/` (`ranking`, `schema`, `feedback`, `discovery`, `insights`) | `supabase/migrations/0028_opportunity_intelligence.sql` | `scripts/verifyOpportunityIntelligence.mjs` |
| **Portfolio Milestones & Roadmaps** | `src/components/PortfolioMilestones.jsx`, `PlansTab.jsx` | `src/lib/roadmap/generator.js`, `timeline.js` | `supabase/migrations/0015_roadmaps.sql` | `scripts/verifyTimeline.mjs`, `verifyRoadmap.mjs` |
| **College & Scholarship Database** | `src/components/CollegeListPanel.jsx`, `ScholarshipDatabase.jsx` | `src/lib/collegeRecommend.js`, `scholarshipResearch.js` | `src/data/scholarships.js`, `opportunities.js` | `scripts/verifyOpportunities.mjs`, `verifyMedicalScholarships.mjs` |
| **Mock Voice Interview Simulator** | `src/components/LiveVoiceInterview.jsx`, `InterviewPrepPanel.jsx` | `src/lib/speech.js`, `interviewScore.js` | `src/data/interviewQuestions.js`, `mmiCasperQuestions.js` | `scripts/verifyInterviewRealism.mjs` |
| **Parent Dashboard & Guarding** | `src/components/parent/ParentApp.jsx` | `src/lib/parentApi.js`, `parentDigest.js` | `supabase/migrations/0006_parent_dashboard.sql` | `scripts/verifyParentDashboard.mjs`, `verifyParentClaimFlow.mjs` |
| **Earned Streaks & Gamification** | `src/components/StreakHeatmap.jsx`, `RewardChest.jsx` | `src/lib/streak.js`, `gamification.js` | `supabase/migrations/0004_reward_and_counter_sync.sql` | `scripts/verifyStreak.mjs` |
| **Medabrain AI Coaching & Groq** | `src/components/MedabrainLauncher.jsx` | `api/groq.js`, `src/lib/studentProfile.js` | `GROQ_SETUP.md` | `scripts/verifyMedabrainModes.mjs` |
| **Offline DB & Flashcard Engine** | `src/lib/db.js` | `src/lib/fsrs.js`, `src/lib/flashcards/engine.js` | `src/lib/flashcards/extractors/facts.js` | `scripts/verifyTracking.mjs` |
| **URL Routing & Subnav Views** | `src/App.jsx` | `src/lib/routes.js`, `useAppRouter.js` | `src/lib/seoRoutes.js` | `scripts/verifyRouting.mjs` |
| **Design System & Theme Tokens** | `src/components/AppearanceSettings.jsx` | `src/lib/theme.js`, `src/lib/tokens/semantic.js` | `docs/DESIGN_TOKENS.md` | `scripts/verifyDesignTokens.mjs`, `verifyPaletteContrast.mjs` |
| **Legal, COPPA & Privacy** | `src/components/legal/LegalPage.jsx` | `src/lib/ageGate.js`, `src/legal/legalConfig.js` | `src/legal/terms.js`, `privacy.js` | `scripts/verifyLegal.mjs` |

---

## 📂 Master Directory & File Catalog

Below is the complete, itemized inventory of **every single file in the repository** (777 total files).


### 1. Root Configuration & System Infrastructure

- `.dockerignore` — Docker ignore rules for container image optimization.
- `.gitignore` — Git ignore rules for dependencies and build artifacts.
- `AGENTS.md` — Primary operational guide, rules, and navigation manual for AI agents.
- `DEVELOPMENT.md` — High-level workspace setup and local development guide.
- `Dockerfile` — Docker container build definition for VPS deployment.
- `FILE_NAVIGATION.md` — Master token-saving directory index and exhaustive file-by-file navigation map.
- `GROQ_SETUP.md` — Guide for configuring purpose-scoped Groq API keys across model tiers.
- `README.md` — Complete single source of truth for platform architecture, environment vars, and file mapping.
- `cspell.json` — CSpell dictionary configuration enforcing American English spelling standards.
- `index.html` — SPA entry HTML document. Loads Google AdSense and mounts React.
- `package-lock.json` — Npm lockfile locking exact dependency tree versions.
- `package.json` — Defines project metadata, dependencies, and npm run script mappings.
- `possible lawsuits.md` — Complete regulatory compliance, legal, privacy, and trademark risk audit.
- `server.js` — Express production backend for Coolify/VPS hosting. Serves static files and mounts API routes.
- `techstack.md` — Comprehensive technical stack specification, FSRS algorithms, and database schemas.
- `vercel.json` — Configures SPA rewrite rules and headers for Vercel serverless environment.
- `vite.config.js` — Vite bundler configuration and PWA/service worker fallback rules.


### 2. CI/CD Workflows (.github/workflows)

- `.github/workflows/indexnow.yml` — GitHub Actions CI workflow definition for indexnow.yml.
- `.github/workflows/verify.yml` — GitHub Actions CI workflow definition for verify.yml.


### 3. Backend Serverless API (api/...)

- `api/_lib/aiProviders.js` — Backend API route/helper for aiProviders.js handling serverless or Express API calls.
- `api/_lib/essayProseGuard.js` — Backend API route/helper for essayProseGuard.js handling serverless or Express API calls.
- `api/_lib/mailer.js` — Backend API route/helper for mailer.js handling serverless or Express API calls.
- `api/_lib/otp.js` — Backend API route/helper for otp.js handling serverless or Express API calls.
- `api/_lib/parentLinks.js` — Backend API route/helper for parentLinks.js handling serverless or Express API calls.
- `api/_lib/parentProfile.js` — Backend API route/helper for parentProfile.js handling serverless or Express API calls.
- `api/_lib/parentSummary.js` — Backend API route/helper for parentSummary.js handling serverless or Express API calls.
- `api/_lib/password.js` — Backend API route/helper for password.js handling serverless or Express API calls.
- `api/_lib/questCatalog.js` — Backend API route/helper for questCatalog.js handling serverless or Express API calls.
- `api/_lib/resources.js` — Backend API route/helper for resources.js handling serverless or Express API calls.
- `api/_lib/serializeUser.js` — Backend API route/helper for serializeUser.js handling serverless or Express API calls.
- `api/_lib/session.js` — Backend API route/helper for session.js handling serverless or Express API calls.
- `api/_lib/supabaseAdmin.js` — Backend API route/helper for supabaseAdmin.js handling serverless or Express API calls.
- `api/_lib/verificationToken.js` — Backend API route/helper for verificationToken.js handling serverless or Express API calls.
- `api/auth/account.js` — Backend API route/helper for account.js handling serverless or Express API calls.
- `api/auth/complete-signup.js` — Backend API route/helper for complete-signup.js handling serverless or Express API calls.
- `api/auth/google.js` — Backend API route/helper for google.js handling serverless or Express API calls.
- `api/auth/login.js` — Backend API route/helper for login.js handling serverless or Express API calls.
- `api/auth/logout.js` — Backend API route/helper for logout.js handling serverless or Express API calls.
- `api/auth/me.js` — Backend API route/helper for me.js handling serverless or Express API calls.
- `api/auth/reset-password.js` — Backend API route/helper for reset-password.js handling serverless or Express API calls.
- `api/auth/send-otp.js` — Backend API route/helper for send-otp.js handling serverless or Express API calls.
- `api/auth/verify-otp.js` — Backend API route/helper for verify-otp.js handling serverless or Express API calls.
- `api/data/[resource].js` — Backend API route/helper for [resource].js handling serverless or Express API calls.
- `api/groq.js` — Backend API route/helper for groq.js handling serverless or Express API calls.
- `api/lesson-feedback.js` — Backend API route/helper for lesson-feedback.js handling serverless or Express API calls.
- `api/master-plan.js` — Backend API route/helper for master-plan.js handling serverless or Express API calls.
- `api/parent/accept.js` — Backend API route/helper for accept.js handling serverless or Express API calls.
- `api/parent/claim.js` — Backend API route/helper for claim.js handling serverless or Express API calls.
- `api/parent/links.js` — Backend API route/helper for links.js handling serverless or Express API calls.
- `api/parent/messages.js` — Backend API route/helper for messages.js handling serverless or Express API calls.
- `api/parent/profile.js` — Backend API route/helper for profile.js handling serverless or Express API calls.
- `api/parent/quests.js` — Backend API route/helper for quests.js handling serverless or Express API calls.
- `api/parent/summary.js` — Backend API route/helper for summary.js handling serverless or Express API calls.
- `api/progress-sync.js` — Backend API route/helper for progress-sync.js handling serverless or Express API calls.
- `api/reward-claim.js` — Backend API route/helper for reward-claim.js handling serverless or Express API calls.
- `api/roadmap.js` — Backend API route/helper for roadmap.js handling serverless or Express API calls.
- `api/safety-event.js` — Backend API route/helper for safety-event.js handling serverless or Express API calls.
- `api/send-email.js` — Backend API route/helper for send-email.js handling serverless or Express API calls.


### 4. Application Shell, Core State & Shared Libraries (src/lib/...)

- `src/lib/a11y.js` — Shared application utility / service for a11y.
- `src/lib/academicIntel.js` — Shared application utility / service for academicIntel.
- `src/lib/achievements.js` — Shared application utility / service for achievements.
- `src/lib/activityIntel.js` — Shared application utility / service for activityIntel.
- `src/lib/admissions/academicFit.js` — Admissions intake and model processing logic for academicFit.
- `src/lib/admissions/gates.js` — Admissions intake and model processing logic for gates.
- `src/lib/admissions/index.js` — Admissions intake and model processing logic for index.
- `src/lib/admissions/intake.js` — Admissions intake and model processing logic for intake.
- `src/lib/admissions/interviewFormats.js` — Admissions intake and model processing logic for interviewFormats.
- `src/lib/admissions/model.js` — Admissions intake and model processing logic for model.
- `src/lib/admissions/portfolioFit.js` — Admissions intake and model processing logic for portfolioFit.
- `src/lib/admissions/round.js` — Admissions intake and model processing logic for round.
- `src/lib/admissions/store.js` — Admissions intake and model processing logic for store.
- `src/lib/ageGate.js` — Shared application utility / service for ageGate.
- `src/lib/aiCache.js` — Shared application utility / service for aiCache.
- `src/lib/aiLane.js` — Identifies the student to the AI rate-limit budgets, so one school's NAT does not share one allowance.
- `src/lib/aiFlashcards.js` — Shared application utility / service for aiFlashcards.
- `src/lib/aiPolicy.js` — Shared application utility / service for aiPolicy.
- `src/lib/applicationStrength.js` — Shared application utility / service for applicationStrength.
- `src/lib/authApi.js` — Shared application utility / service for authApi.
- `src/lib/autoDeadlines.js` — Shared application utility / service for autoDeadlines.
- `src/lib/betaFlags.js` — Shared application utility / service for betaFlags.
- `src/lib/casperScore.js` — Shared application utility / service for casperScore.
- `src/lib/celebrate.js` — Shared application utility / service for celebrate.
- `src/lib/certificationGuide.js` — Shared application utility / service for certificationGuide.
- `src/lib/coachContext.js` — Shared application utility / service for coachContext.
- `src/lib/collegeRecommend.js` — Shared application utility / service for collegeRecommend.
- `src/lib/combinedDegree.js` — Shared application utility / service for combinedDegree.
- `src/lib/commonApp/activities.js` — The Common App activities/honors export engine: category mapping, per-field limits, ranking.
- `src/lib/commonApp/sections.js` — The real Common Application modelled section by section, with its actual field limits.
- `src/lib/commonApp/derive.js` — Portfolio → Common App state. Derives what would go in each section; invents nothing.
- `src/lib/commonApp/sync.js` — The Portfolio ↔ Common App ledger: what was copied across, and what has drifted since.
- `src/lib/commonApp/useCommonApp.js` — The single React hook owning the derivation, the ledger and its debounced persistence.
- `src/lib/commonApp/index.js` — Re-exports the four modules above as one import.
- `src/lib/contentSearch.js` — Shared application utility / service for contentSearch.
- `src/lib/cosmetics.js` — Shared application utility / service for cosmetics.
- `src/lib/coursePlanner.js` — Shared application utility / service for coursePlanner.
- `src/lib/credentials.js` — Shared application utility / service for credentials.
- `src/lib/dailyCheckin.js` — Shared application utility / service for dailyCheckin.
- `src/lib/dashboardStages.js` — Decides which Home dashboard modules appear, based on whether the data they measure exists yet.
- `src/lib/geo/zip.js` — Offline ZIP-prefix → state/region resolver. No network, no key; a minor's ZIP never leaves the device.
- `src/lib/geo/majors.js` — The intended-major taxonomy and its affinity scoring. A lean on the roadmap, never a filter.
- `src/lib/dailyQuests.js` — Shared application utility / service for dailyQuests.
- `src/lib/dataApi.js` — Shared application utility / service for dataApi.
- `src/lib/dateUtils.js` — Shared application utility / service for dateUtils.
- `src/lib/db.js` — Shared application utility / service for db.
- `src/lib/diagnosticEngine.js` — Shared application utility / service for diagnosticEngine.
- `src/lib/entitlements.js` — Shared application utility / service for entitlements.
- `src/lib/essayCritique.js` — Shared application utility / service for essayCritique.
- `src/lib/essayCritiquePasses.js` — Shared application utility / service for essayCritiquePasses.
- `src/lib/essayMode.js` — Shared application utility / service for essayMode.
- `src/lib/essayVersions.js` — Shared application utility / service for essayVersions.
- `src/lib/eventLog.js` — Shared application utility / service for eventLog.
- `src/lib/exportPDF.impl.js` — Shared application utility / service for exportPDF.impl.
- `src/lib/exportPDF.js` — Shared application utility / service for exportPDF.
- `src/lib/featureUnlock.js` — Shared application utility / service for featureUnlock.
- `src/lib/flashcards/aiPolish.js` — Offline flashcard processing/extraction logic for aiPolish.
- `src/lib/flashcards/engine.js` — Offline flashcard processing/extraction logic for engine.
- `src/lib/flashcards/extractors/acronyms.js` — Offline flashcard processing/extraction logic for acronyms.
- `src/lib/flashcards/extractors/cloze.js` — Offline flashcard processing/extraction logic for cloze.
- `src/lib/flashcards/extractors/comparisons.js` — Offline flashcard processing/extraction logic for comparisons.
- `src/lib/flashcards/extractors/facts.js` — Offline flashcard processing/extraction logic for facts.
- `src/lib/flashcards/extractors/lists.js` — Offline flashcard processing/extraction logic for lists.
- `src/lib/flashcards/extractors/misconceptions.js` — Offline flashcard processing/extraction logic for misconceptions.
- `src/lib/flashcards/extractors/numeric.js` — Offline flashcard processing/extraction logic for numeric.
- `src/lib/flashcards/extractors/process.js` — Offline flashcard processing/extraction logic for process.
- `src/lib/flashcards/rank.js` — Offline flashcard processing/extraction logic for rank.
- `src/lib/flashcards/segment.js` — Offline flashcard processing/extraction logic for segment.
- `src/lib/flashcards/text.js` — Offline flashcard processing/extraction logic for text.
- `src/lib/fourYearMap.js` — Shared application utility / service for fourYearMap.
- `src/lib/fsrs.js` — Shared application utility / service for fsrs.
- `src/lib/gamification.js` — Shared application utility / service for gamification.
- `src/lib/gradeBand.js` — Shared application utility / service for gradeBand.
- `src/lib/healthEssays.js` — Shared application utility / service for healthEssays.
- `src/lib/http.js` — Shared application utility / service for http.
- `src/lib/icsExport.js` — Shared application utility / service for icsExport.
- `src/lib/insights.js` — Shared application utility / service for insights.
- `src/lib/interviewFeedback.js` — Shared application utility / service for interviewFeedback.
- `src/lib/interviewIntent.js` — Shared application utility / service for interviewIntent.
- `src/lib/interviewPanel.js` — Shared application utility / service for interviewPanel.
- `src/lib/interviewReply.js` — Shared application utility / service for interviewReply.
- `src/lib/interviewScore.js` — Shared application utility / service for interviewScore.
- `src/lib/lessonAudio.js` — Shared application utility / service for lessonAudio.
- `src/lib/lessonFeedback.js` — Shared application utility / service for lessonFeedback.
- `src/lib/lessonFeedbackApi.js` — Shared application utility / service for lessonFeedbackApi.
- `src/lib/lessonMemory.js` — Shared application utility / service for lessonMemory.
- `src/lib/lessonResources.js` — Shared application utility / service for lessonResources.
- `src/lib/masterPlanGenerator.js` — Shared application utility / service for masterPlanGenerator.
- `src/lib/masterPlanStore.js` — Shared application utility / service for masterPlanStore.
- `src/lib/medabrainActions.js` — Shared application utility / service for medabrainActions.
- `src/lib/medabrainComments.jsx` — Shared application utility / service for medabrainComments.
- `src/lib/medabrainModes.js` — Shared application utility / service for medabrainModes.
- `src/lib/medex/benchmark.js` — MedEx applicant competitive scoring engine module for benchmark.
- `src/lib/medex/index.js` — MedEx applicant competitive scoring engine module for index.
- `src/lib/medex/scale.js` — MedEx applicant competitive scoring engine module for scale.
- `src/lib/medex/score.js` — MedEx applicant competitive scoring engine module for score.
- `src/lib/medex/store.js` — MedEx applicant competitive scoring engine module for store.
- `src/lib/medex/week.js` — MedEx applicant competitive scoring engine module for week.
- `src/lib/milestoneSync.js` — Shared application utility / service for milestoneSync.
- `src/lib/milestoneUrgency.js` — Shared application utility / service for milestoneUrgency.
- `src/lib/mmiCircuit.js` — Shared application utility / service for mmiCircuit.
- `src/lib/mmiRubric.js` — Shared application utility / service for mmiRubric.
- `src/lib/navMap.js` — Shared application utility / service for navMap.
- `src/lib/nextThree.js` — Shared application utility / service for nextThree.
- `src/lib/noteFlashcardEngine.js` — Shared application utility / service for noteFlashcardEngine.
- `src/lib/nudges.js` — Shared application utility / service for nudges.
- `src/lib/onboardingFlow.js` — Shared application utility / service for onboardingFlow.
- `src/lib/opportunityEligibility.js` — Shared application utility / service for opportunityEligibility.
- `src/lib/opportunityMatch.js` — Shared application utility / service for opportunityMatch.
- `src/lib/opportunity/index.js` — Barrel for the opportunity-intelligence layer.
- `src/lib/opportunity/schema.js` — The unified opportunity record, its six data states (verified / AI-discovered / stale / incomplete / archived / next-cycle), and recurrence.
- `src/lib/opportunity/adapt.js` — Adapters turning the browsable catalog, the structured programs and discovered rows into one record shape.
- `src/lib/opportunity/context.js` — The student as the ranker sees them: profile, college list, school context, constraints, roadmap pressure, consent-gated location.
- `src/lib/opportunity/ranking.js` — The twelve-dimension ranking model and the adaptive list-size (capacity) model.
- `src/lib/opportunity/outcomes.js` — Realistic-success ladders per category; never targets first place.
- `src/lib/opportunity/feedback.js` — The sixteen student actions, decaying suppression, and the generalized lessons they teach the ranker.
- `src/lib/opportunity/discovery.js` — The AI opportunity-discovery workflow: prompt, sanitization, deduplication.
- `src/lib/opportunity/store.js` — Persistence for discovered records and feedback events; the internal verification path.
- `src/lib/opportunity/insights.js` — The card's answers, and every integration surface (roadmap, plans, dashboard, deadlines, Medabrain).
- `src/lib/paceGoal.js` — Shared application utility / service for paceGoal.
- `src/lib/parentApi.js` — Shared application utility / service for parentApi.
- `src/lib/parentDigest.js` — Shared application utility / service for parentDigest.
- `src/lib/pathwayCost.js` — Shared application utility / service for pathwayCost.
- `src/lib/pathwayEnrollment.js` — Shared application utility / service for pathwayEnrollment.
- `src/lib/personalBrief.js` — Shared application utility / service for personalBrief.
- `src/lib/planGenerator.js` — Shared application utility / service for planGenerator.
- `src/lib/portfolioCritique.js` — Shared application utility / service for portfolioCritique.
- `src/lib/portfolioData.js` — Shared application utility / service for portfolioData.
- `src/lib/portfolioDossier.js` — Shared application utility / service for portfolioDossier.
- `src/lib/portfolioNextSteps.js` — Shared application utility / service for portfolioNextSteps.
- `src/lib/programEssayPrompts.js` — Shared application utility / service for programEssayPrompts.
- `src/lib/progressSync.js` — Shared application utility / service for progressSync.
- `src/lib/questApi.js` — Shared application utility / service for questApi.
- `src/lib/quests.js` — Shared application utility / service for quests.
- `src/lib/quizPersonalization.js` — Shared application utility / service for quizPersonalization.
- `src/lib/recentActivity.js` — Shared application utility / service for recentActivity.
- `src/lib/recommend.js` — Shared application utility / service for recommend.
- `src/lib/recommenders.js` — Shared application utility / service for recommenders.
- `src/lib/renderMarkdown.js` — Shared application utility / service for renderMarkdown.
- `src/lib/rewardClaimQueue.js` — Shared application utility / service for rewardClaimQueue.
- `src/lib/rewards.js` — Shared application utility / service for rewards.
- `src/lib/roadmap/catalog.js` — Roadmap generator and intake logic for catalog.
- `src/lib/roadmap/dateAudit.js` — Roadmap generator and intake logic for dateAudit.
- `src/lib/roadmap/generator.js` — Roadmap generator and intake logic for generator.
- `src/lib/roadmap/intake.js` — Roadmap generator and intake logic for intake.
- `src/lib/roadmap/model.js` — Roadmap generator and intake logic for model.
- `src/lib/roadmap/projection.js` — Roadmap generator and intake logic for projection.
- `src/lib/roadmap/promptBudget.js` — Roadmap generator and intake logic for promptBudget.
- `src/lib/roadmap/readiness.js` — Roadmap generator and intake logic for readiness.
- `src/lib/roadmap/store.js` — Roadmap generator and intake logic for store.
- `src/lib/routes.js` — Shared application utility / service for routes.
- `src/lib/safety/cardState.js` — Safety classifier and crisis detection module for cardState.
- `src/lib/safety/classifier.js` — Safety classifier and crisis detection module for classifier.
- `src/lib/safety/log.js` — Safety classifier and crisis detection module for log.
- `src/lib/safety/pass.js` — Safety classifier and crisis detection module for pass.
- `src/lib/safety/prompts.js` — Safety classifier and crisis detection module for prompts.
- `src/lib/safety/resources.js` — Safety classifier and crisis detection module for resources.
- `src/lib/scholarshipFilters.js` — Shared application utility / service for scholarshipFilters.
- `src/lib/scholarshipNotes.js` — Shared application utility / service for scholarshipNotes.
- `src/lib/scholarshipResearch.js` — Shared application utility / service for scholarshipResearch.
- `src/lib/search.js` — Shared application utility / service for search.
- `src/lib/seo.js` — Shared application utility / service for seo.
- `src/lib/seoRoutes.js` — Shared application utility / service for seoRoutes.
- `src/lib/shuffle.js` — Shared application utility / service for shuffle.
- `src/lib/sounds.js` — Shared application utility / service for sounds.
- `src/lib/speech.js` — Shared application utility / service for speech.
- `src/lib/streak.js` — Shared application utility / service for streak.
- `src/lib/studentProfile.js` — Shared application utility / service for studentProfile.
- `src/lib/supabaseClient.js` — Shared application utility / service for supabaseClient.
- `src/lib/supplementalPrompts.js` — Shared application utility / service for supplementalPrompts.
- `src/lib/theme.js` — Shared application utility / service for theme.
- `src/lib/timeline.js` — Shared application utility / service for timeline.
- `src/lib/tokens/components.js` — Design system design token definitions for components.
- `src/lib/tokens/motion.js` — Design system design token definitions for motion.
- `src/lib/tokens/primitives.js` — Design system design token definitions for primitives.
- `src/lib/tokens/semantic.js` — Design system design token definitions for semantic.
- `src/lib/tokens/space.js` — Design system design token definitions for space.
- `src/lib/tokens/type.js` — Design system design token definitions for type.
- `src/lib/trackQueue.js` — Shared application utility / service for trackQueue.
- `src/lib/trackedItems.js` — Shared application utility / service for trackedItems.
- `src/lib/trackingCatalog.js` — Shared application utility / service for trackingCatalog.
- `src/lib/turnTaking.js` — Shared application utility / service for turnTaking.
- `src/lib/useAppRouter.js` — Shared application utility / service for useAppRouter.
- `src/lib/useGradeBand.jsx` — Shared application utility / service for useGradeBand.
- `src/lib/useSearchFocus.js` — Shared application utility / service for useSearchFocus.
- `src/lib/useTrackQueue.js` — Shared application utility / service for useTrackQueue.
- `src/lib/useViewport.js` — Shared application utility / service for useViewport.
- `src/lib/useWindowedList.js` — Shared application utility / service for useWindowedList.
- `src/lib/viewState.js` — Shared application utility / service for viewState.
- `src/lib/viewportFit.js` — Shared application utility / service for viewportFit.
- `src/lib/voicePipeline.js` — Shared application utility / service for voicePipeline.
- `src/lib/weeklyGoals.js` — Shared application utility / service for weeklyGoals.


### 5. Ivy Engine & Narrative Framework (src/lib/ivy/...)

- `src/lib/ivy/authenticity.js` — Ivy Engine module providing holistic admissions logic for authenticity.
- `src/lib/ivy/commonApp.js` — Ivy Engine module providing holistic admissions logic for commonApp.
- `src/lib/ivy/competition.js` — Ivy Engine module providing holistic admissions logic for competition.
- `src/lib/ivy/constants.js` — Ivy Engine module providing holistic admissions logic for constants.
- `src/lib/ivy/differentiation.js` — Ivy Engine module providing holistic admissions logic for differentiation.
- `src/lib/ivy/domino.js` — Ivy Engine module providing holistic admissions logic for domino.
- `src/lib/ivy/engine.js` — Ivy Engine module providing holistic admissions logic for engine.
- `src/lib/ivy/holistic.js` — Ivy Engine module providing holistic admissions logic for holistic.
- `src/lib/ivy/hooks.js` — Ivy Engine module providing holistic admissions logic for hooks.
- `src/lib/ivy/index.js` — Ivy Engine module providing holistic admissions logic for index.
- `src/lib/ivy/interview.js` — Ivy Engine module providing holistic admissions logic for interview.
- `src/lib/ivy/portfolio.js` — Ivy Engine module providing holistic admissions logic for portfolio.
- `src/lib/ivy/retention.js` — Ivy Engine module providing holistic admissions logic for retention.
- `src/lib/ivy/roadmap.js` — Ivy Engine module providing holistic admissions logic for roadmap.
- `src/lib/ivy/safeguards.js` — Ivy Engine module providing holistic admissions logic for safeguards.
- `src/lib/ivy/satHeuristics.js` — Ivy Engine module providing holistic admissions logic for satHeuristics.
- `src/lib/ivy/serialize.js` — Ivy Engine module providing holistic admissions logic for serialize.
- `src/lib/ivy/sprint.js` — Ivy Engine module providing holistic admissions logic for sprint.
- `src/lib/ivy/store.js` — Ivy Engine module providing holistic admissions logic for store.
- `src/lib/ivy/storyboard.js` — Ivy Engine module providing holistic admissions logic for storyboard.
- `src/lib/ivy/syntax.js` — Ivy Engine module providing holistic admissions logic for syntax.
- `src/lib/ivy/text.js` — Ivy Engine module providing holistic admissions logic for text.
- `src/lib/ivy/theme.js` — Ivy Engine module providing holistic admissions logic for theme.


### 6. SAT Core Engine, Components & Practice Bank

- `src/components/sat/DesmosCalculator.jsx` — SAT Hub React UI component for DesmosCalculator.
- `src/components/sat/DesmosSurface.jsx` — SAT Hub React UI component for DesmosSurface.
- `src/components/sat/SatAnnotatableText.jsx` — SAT Hub React UI component for SatAnnotatableText.
- `src/components/sat/SatBaselinePanel.jsx` — SAT Hub React UI component for SatBaselinePanel.
- `src/components/sat/SatBetaCover.jsx` — SAT Hub React UI component for SatBetaCover.
- `src/components/sat/SatDiagnosticPanel.jsx` — SAT Hub React UI component for SatDiagnosticPanel.
- `src/components/sat/SatFullTestPanel.jsx` — SAT Hub React UI component for SatFullTestPanel.
- `src/components/sat/SatLibraryPanel.jsx` — SAT Hub React UI component for SatLibraryPanel.
- `src/components/sat/SatMedabrain.jsx` — SAT Hub React UI component for SatMedabrain.
- `src/components/sat/SatOverviewPanel.jsx` — SAT Hub React UI component for SatOverviewPanel.
- `src/components/sat/SatPracticePanel.jsx` — SAT Hub React UI component for SatPracticePanel.
- `src/components/sat/SatQuestionPlayer.jsx` — SAT Hub React UI component for SatQuestionPlayer.
- `src/components/sat/SatReferenceSheet.jsx` — SAT Hub React UI component for SatReferenceSheet.
- `src/components/sat/SatReviewLogPanel.jsx` — SAT Hub React UI component for SatReviewLogPanel.
- `src/components/sat/SatScoreReport.jsx` — SAT Hub React UI component for SatScoreReport.
- `src/components/sat/SatSkillHeatmap.jsx` — SAT Hub React UI component for SatSkillHeatmap.
- `src/components/sat/SatSkillsPanel.jsx` — SAT Hub React UI component for SatSkillsPanel.
- `src/components/sat/SatStudyPlanCard.jsx` — SAT Hub React UI component for SatStudyPlanCard.
- `src/components/sat/SatTab.jsx` — SAT Hub React UI component for SatTab.
- `src/components/sat/SatTestPicker.jsx` — SAT Hub React UI component for SatTestPicker.
- `src/components/sat/SatToolkitPanel.jsx` — SAT Hub React UI component for SatToolkitPanel.
- `src/components/sat/SatToolsContext.jsx` — SAT Hub React UI component for SatToolsContext.
- `src/components/sat/SatVideoRecs.jsx` — SAT Hub React UI component for SatVideoRecs.
- `src/components/sat/satUi.jsx` — SAT Hub React UI component for satUi.
- `src/components/sat/useSatSession.js` — SAT Hub React UI component for useSatSession.
- `src/data/sat/forms.js` — SAT reference data/catalog for forms.
- `src/data/sat/questions/index.js` — Digital SAT question bank dataset for index.
- `src/data/sat/questions/mathAdvanced.js` — Digital SAT question bank dataset for mathAdvanced.
- `src/data/sat/questions/mathAdvancedB.js` — Digital SAT question bank dataset for mathAdvancedB.
- `src/data/sat/questions/mathAdvancedC.js` — Digital SAT question bank dataset for mathAdvancedC.
- `src/data/sat/questions/mathAdvancedD.js` — Digital SAT question bank dataset for mathAdvancedD.
- `src/data/sat/questions/mathAlgebra.js` — Digital SAT question bank dataset for mathAlgebra.
- `src/data/sat/questions/mathAlgebraB.js` — Digital SAT question bank dataset for mathAlgebraB.
- `src/data/sat/questions/mathAlgebraC.js` — Digital SAT question bank dataset for mathAlgebraC.
- `src/data/sat/questions/mathAlgebraD.js` — Digital SAT question bank dataset for mathAlgebraD.
- `src/data/sat/questions/mathGeoTrig.js` — Digital SAT question bank dataset for mathGeoTrig.
- `src/data/sat/questions/mathGeoTrigB.js` — Digital SAT question bank dataset for mathGeoTrigB.
- `src/data/sat/questions/mathGeoTrigC.js` — Digital SAT question bank dataset for mathGeoTrigC.
- `src/data/sat/questions/mathGeoTrigD.js` — Digital SAT question bank dataset for mathGeoTrigD.
- `src/data/sat/questions/mathPSDA.js` — Digital SAT question bank dataset for mathPSDA.
- `src/data/sat/questions/mathPSDAB.js` — Digital SAT question bank dataset for mathPSDAB.
- `src/data/sat/questions/mathPSDAC.js` — Digital SAT question bank dataset for mathPSDAC.
- `src/data/sat/questions/mathPSDAD.js` — Digital SAT question bank dataset for mathPSDAD.
- `src/data/sat/questions/rwConventions.js` — Digital SAT question bank dataset for rwConventions.
- `src/data/sat/questions/rwConventionsB.js` — Digital SAT question bank dataset for rwConventionsB.
- `src/data/sat/questions/rwConventionsC.js` — Digital SAT question bank dataset for rwConventionsC.
- `src/data/sat/questions/rwConventionsD.js` — Digital SAT question bank dataset for rwConventionsD.
- `src/data/sat/questions/rwCraftStructure.js` — Digital SAT question bank dataset for rwCraftStructure.
- `src/data/sat/questions/rwCraftStructureB.js` — Digital SAT question bank dataset for rwCraftStructureB.
- `src/data/sat/questions/rwCraftStructureC.js` — Digital SAT question bank dataset for rwCraftStructureC.
- `src/data/sat/questions/rwCraftStructureD.js` — Digital SAT question bank dataset for rwCraftStructureD.
- `src/data/sat/questions/rwExpression.js` — Digital SAT question bank dataset for rwExpression.
- `src/data/sat/questions/rwExpressionB.js` — Digital SAT question bank dataset for rwExpressionB.
- `src/data/sat/questions/rwExpressionC.js` — Digital SAT question bank dataset for rwExpressionC.
- `src/data/sat/questions/rwExpressionD.js` — Digital SAT question bank dataset for rwExpressionD.
- `src/data/sat/questions/rwInfoIdeas.js` — Digital SAT question bank dataset for rwInfoIdeas.
- `src/data/sat/questions/rwInfoIdeasB.js` — Digital SAT question bank dataset for rwInfoIdeasB.
- `src/data/sat/questions/rwInfoIdeasC.js` — Digital SAT question bank dataset for rwInfoIdeasC.
- `src/data/sat/questions/rwInfoIdeasD.js` — Digital SAT question bank dataset for rwInfoIdeasD.
- `src/data/sat/reference.js` — SAT reference data/catalog for reference.
- `src/data/sat/resources.js` — SAT reference data/catalog for resources.
- `src/data/sat/scoring.js` — SAT reference data/catalog for scoring.
- `src/data/sat/strategies.js` — SAT reference data/catalog for strategies.
- `src/data/sat/taxonomy.js` — SAT reference data/catalog for taxonomy.
- `src/data/sat/videos.js` — SAT reference data/catalog for videos.
- `src/lib/sat/activeTabStore.js` — SAT prep engine module managing activeTabStore.
- `src/lib/sat/adaptive.js` — SAT prep engine module managing adaptive.
- `src/lib/sat/aiPractice.js` — SAT prep engine module managing aiPractice.
- `src/lib/sat/aiQuestions.js` — SAT prep engine module managing aiQuestions.
- `src/lib/sat/aiStudyPlan.js` — SAT prep engine module managing aiStudyPlan.
- `src/lib/sat/answerBalance.js` — SAT prep engine module managing answerBalance.
- `src/lib/sat/baseline.js` — SAT prep engine module managing baseline.
- `src/lib/sat/desmos.js` — SAT prep engine module managing desmos.
- `src/lib/sat/desmosSeed.js` — SAT prep engine module managing desmosSeed.
- `src/lib/sat/errorPatterns.js` — SAT prep engine module managing errorPatterns.
- `src/lib/sat/forms.js` — SAT prep engine module managing forms.
- `src/lib/sat/learnerProfile.js` — SAT prep engine module managing learnerProfile.
- `src/lib/sat/mastery.js` — SAT prep engine module managing mastery.
- `src/lib/sat/nextAction.js` — SAT prep engine module managing nextAction.
- `src/lib/sat/projection.js` — SAT prep engine module managing projection.
- `src/lib/sat/selector.js` — SAT prep engine module managing selector.
- `src/lib/sat/shuffle.js` — SAT prep engine module managing shuffle.
- `src/lib/sat/useSatData.js` — SAT prep engine module managing useSatData.


### 7. Curricula, Quizzes, Opportunities & Data Catalogs (src/data/...)

- `src/data/VIDEO_CORRECTIONS.md` — Data catalog / static repository dataset for VIDEO_CORRECTIONS.
- `src/data/admissions/programProfiles.js` — Data catalog / static repository dataset for programProfiles.
- `src/data/casperTest.js` — Data catalog / static repository dataset for casperTest.
- `src/data/checkinCalendar.js` — Data catalog / static repository dataset for checkinCalendar.
- `src/data/combinedDegreePrograms.js` — Data catalog / static repository dataset for combinedDegreePrograms.
- `src/data/constants.js` — Data catalog / static repository dataset for constants.
- `src/data/credentials/courseCompletions.js` — Data catalog / static repository dataset for courseCompletions.
- `src/data/credentials/index.js` — Data catalog / static repository dataset for index.
- `src/data/credentials/nationalCertifications.js` — Data catalog / static repository dataset for nationalCertifications.
- `src/data/credentials/portfolioSkills.js` — Data catalog / static repository dataset for portfolioSkills.
- `src/data/credentials/stateOccupational.js` — Data catalog / static repository dataset for stateOccupational.
- `src/data/credentials/types.js` — Data catalog / static repository dataset for types.
- `src/data/dailyQuestCatalog.js` — Data catalog / static repository dataset for dailyQuestCatalog.
- `src/data/elib.js` — Data catalog / static repository dataset for elib.
- `src/data/elibExpansionA.js` — Data catalog / static repository dataset for elibExpansionA.
- `src/data/elibExpansionB.js` — Data catalog / static repository dataset for elibExpansionB.
- `src/data/elibExpansionC.js` — Data catalog / static repository dataset for elibExpansionC.
- `src/data/elibExpansionD.js` — Data catalog / static repository dataset for elibExpansionD.
- `src/data/elibExpansionE.js` — Data catalog / static repository dataset for elibExpansionE.
- `src/data/elibExpansionF.js` — Data catalog / static repository dataset for elibExpansionF.
- `src/data/elibExpansionG.js` — Data catalog / static repository dataset for elibExpansionG.
- `src/data/elibExpansionH.js` — Data catalog / static repository dataset for elibExpansionH.
- `src/data/elibExpansionI.js` — Data catalog / static repository dataset for elibExpansionI.
- `src/data/elibExpansionJ.js` — Data catalog / static repository dataset for elibExpansionJ.
- `src/data/elibExpansionK.js` — Data catalog / static repository dataset for elibExpansionK.
- `src/data/elibExtra.js` — Data catalog / static repository dataset for elibExtra.
- `src/data/foundationUnits.js` — Data catalog / static repository dataset for foundationUnits.
- `src/data/healthCareerScholarships.js` — Data catalog / static repository dataset for healthCareerScholarships.
- `src/data/interviewQuestions.js` — Data catalog / static repository dataset for interviewQuestions.
- `src/data/ivy/benchmarks.js` — Ivy Engine static data catalog for benchmarks.
- `src/data/ivy/clicheBank.js` — Ivy Engine static data catalog for clicheBank.
- `src/data/ivy/commonAppRules.js` — Ivy Engine static data catalog for commonAppRules.
- `src/data/ivy/gradeTimelines.js` — Ivy Engine static data catalog for gradeTimelines.
- `src/data/ivy/overusedProjects.js` — Ivy Engine static data catalog for overusedProjects.
- `src/data/ivy/productivity.js` — Ivy Engine static data catalog for productivity.
- `src/data/ivy/tierCatalog.js` — Ivy Engine static data catalog for tierCatalog.
- `src/data/lessonContent/biomedResearch.js` — Curriculum lesson content module for biomedResearch.
- `src/data/lessonContent/certifications.js` — Curriculum lesson content module for certifications.
- `src/data/lessonContent/courseStrategy.js` — Curriculum lesson content module for courseStrategy.
- `src/data/lessonContent/dentistry.js` — Curriculum lesson content module for dentistry.
- `src/data/lessonContent/exploring.js` — Curriculum lesson content module for exploring.
- `src/data/lessonContent/healthAdmin.js` — Curriculum lesson content module for healthAdmin.
- `src/data/lessonContent/index.js` — Curriculum lesson content module for index.
- `src/data/lessonContent/nursing.js` — Curriculum lesson content module for nursing.
- `src/data/lessonContent/pharmacy.js` — Curriculum lesson content module for pharmacy.
- `src/data/lessonContent/physicalOccupTherapy.js` — Curriculum lesson content module for physicalOccupTherapy.
- `src/data/lessonContent/physician.js` — Curriculum lesson content module for physician.
- `src/data/lessonContent/physicianAssistant.js` — Curriculum lesson content module for physicianAssistant.
- `src/data/lessonContent/publicHealth.js` — Curriculum lesson content module for publicHealth.
- `src/data/medicalScholarships.js` — Data catalog / static repository dataset for medicalScholarships.
- `src/data/mmiCasperQuestions.js` — Data catalog / static repository dataset for mmiCasperQuestions.
- `src/data/mmiStations.js` — Data catalog / static repository dataset for mmiStations.
- `src/data/nudgeBank.js` — Data catalog / static repository dataset for nudgeBank.
- `src/data/opportunities.js` — Data catalog / static repository dataset for opportunities.
- `src/data/opportunitiesExpansion.js` — Data catalog / static repository dataset for opportunitiesExpansion.
- `src/data/opportunitiesCompetitions.js` — Browsable competition and regional-program entries added alongside the roadmap catalog expansion.
- `src/data/opportunityPrograms.js` — Data catalog / static repository dataset for opportunityPrograms.
- `src/data/opportunityProgramsExpansion.js` — Data catalog / static repository dataset for opportunityProgramsExpansion.
- `src/data/pathwayFinance.js` — Data catalog / static repository dataset for pathwayFinance.
- `src/data/questCatalog.js` — Data catalog / static repository dataset for questCatalog.
- `src/data/quizzes.js` — Data catalog / static repository dataset for quizzes.
- `src/data/quizzes/bioBiochem.js` — Verification quiz question bank for bioBiochem.
- `src/data/quizzes/chemPhys.js` — Verification quiz question bank for chemPhys.
- `src/data/quizzes/index.js` — Verification quiz question bank for index.
- `src/data/quizzes/lessonQuizzes.js` — Verification quiz question bank for lessonQuizzes.
- `src/data/quizzes/psychSoc.js` — Verification quiz question bank for psychSoc.
- `src/data/roadmap/anchors.js` — Roadmap schema and catalog dataset for anchors.
- `src/data/roadmap/awards.js` — Roadmap schema and catalog dataset for awards.
- `src/data/roadmap/competitions.js` — Roadmap schema and catalog dataset for competitions.
- `src/data/roadmap/competitionsExpansion.js` — 54 further competitions spanning research, writing, ethics, statistics, policy and robotics.
- `src/data/roadmap/regionalPrograms.js` — State-restricted programs, surfaced once a student gives a ZIP code.
- `src/data/roadmap/expansion.js` — Roadmap schema and catalog dataset for expansion.
- `src/data/roadmap/index.js` — Roadmap schema and catalog dataset for index.
- `src/data/roadmap/programs.js` — Roadmap schema and catalog dataset for programs.
- `src/data/roadmap/schema.js` — Roadmap schema and catalog dataset for schema.
- `src/data/scholarships.js` — Data catalog / static repository dataset for scholarships.
- `src/data/supplementalEssays.js` — Data catalog / static repository dataset for supplementalEssays.


### 8. React UI Components & Workspace Views (src/components/...)

- `src/components/AboutMePanel.jsx` — React UI component / panel for AboutMePanel.
- `src/components/ActivitiesResumePanel.jsx` — React UI component / panel for ActivitiesResumePanel.
- `src/components/AnimatedLogo.jsx` — React UI component / panel for AnimatedLogo.
- `src/components/AppTour.jsx` — React UI component / panel for AppTour.
- `src/components/AppearanceSettings.jsx` — React UI component / panel for AppearanceSettings.
- `src/components/AuthGate.jsx` — React UI component / panel for AuthGate.
- `src/components/BandPreview.jsx` — React UI component / panel for BandPreview.
- `src/components/BrandJourney.jsx` — React UI component / panel for BrandJourney.
- `src/components/CollegeAutocomplete.jsx` — React UI component / panel for CollegeAutocomplete.
- `src/components/CollegeListPanel.jsx` — React UI component / panel for CollegeListPanel.
- `src/components/EssayCritique.jsx` — React UI component / panel for EssayCritique.
- `src/components/EssayWorkspacePanel.jsx` — React UI component / panel for EssayWorkspacePanel.
- `src/components/FinancialAidHomeCard.jsx` — React UI component / panel for FinancialAidHomeCard.
- `src/components/FinancialAidPanel.jsx` — React UI component / panel for FinancialAidPanel.
- `src/components/GlobalCrashGuard.jsx` — React UI component / panel for GlobalCrashGuard.
- `src/components/GradYearCheckIn.jsx` — React UI component / panel for GradYearCheckIn.
- `src/components/HighlightableArticle.jsx` — React UI component / panel for HighlightableArticle.
- `src/components/InterviewHistoryPanel.jsx` — React UI component / panel for InterviewHistoryPanel.
- `src/components/InterviewPrepPanel.jsx` — React UI component / panel for InterviewPrepPanel.
- `src/components/LandingPage.jsx` — React UI component / panel for LandingPage.
- `src/components/LessonAudioPlayer.jsx` — React UI component / panel for LessonAudioPlayer.
- `src/components/LessonDifficultyCheck.jsx` — React UI component / panel for LessonDifficultyCheck.
- `src/components/LessonNotesPanel.jsx` — React UI component / panel for LessonNotesPanel.
- `src/components/LiveVoiceInterview.jsx` — React UI component / panel for LiveVoiceInterview.
- `src/components/MaintenanceNotice.jsx` — React UI component / panel for MaintenanceNotice.
- `src/components/MedabrainLauncher.jsx` — React UI component / panel for MedabrainLauncher.
- `src/components/MyPlanCard.jsx` — React UI component / panel for MyPlanCard.
- `src/components/NextUnlockCard.jsx` — React UI component / panel for NextUnlockCard.
- `src/components/OpportunitiesDatabase.jsx` — React UI component / panel for OpportunitiesDatabase.
- `src/components/PaceGoalCard.jsx` — React UI component / panel for PaceGoalCard.
- `src/components/PathwaySwitcher.jsx` — React UI component / panel for PathwaySwitcher.
- `src/components/PlansTab.jsx` — React UI component / panel for PlansTab.
- `src/components/PortfolioMedabrain.jsx` — React UI component / panel for PortfolioMedabrain.
- `src/components/PortfolioMilestones.jsx` — React UI component / panel for PortfolioMilestones.
- `src/components/PortfolioPlanWeek.jsx` — React UI component / panel for PortfolioPlanWeek.
- `src/components/PrepMedabrain.jsx` — React UI component / panel for PrepMedabrain.
- `src/components/PwaUpdatePrompt.jsx` — React UI component / panel for PwaUpdatePrompt.
- `src/components/QuizPlanToday.jsx` — React UI component / panel for QuizPlanToday.
- `src/components/QuizRecommendationsPanel.jsx` — React UI component / panel for QuizRecommendationsPanel.
- `src/components/RecommendersPanel.jsx` — React UI component / panel for RecommendersPanel.
- `src/components/ReturningBreakScreen.jsx` — React UI component / panel for ReturningBreakScreen.
- `src/components/RewardChest.jsx` — React UI component / panel for RewardChest.
- `src/components/RootErrorBoundary.jsx` — React UI component / panel for RootErrorBoundary.
- `src/components/ScholarshipDatabase.jsx` — React UI component / panel for ScholarshipDatabase.
- `src/components/ScholarshipResearchAdd.jsx` — React UI component / panel for ScholarshipResearchAdd.
- `src/components/ScoreTrackerPanel.jsx` — React UI component / panel for ScoreTrackerPanel.
- `src/components/StreakHeatmap.jsx` — React UI component / panel for StreakHeatmap.
- `src/components/SupplementalEssaysCard.jsx` — React UI component / panel for SupplementalEssaysCard.
- `src/components/TabContentGuard.jsx` — React UI component / panel for TabContentGuard.
- `src/components/ThemeToggle.jsx` — React UI component / panel for ThemeToggle.
- `src/components/TodayPlanNudge.jsx` — React UI component / panel for TodayPlanNudge.
- `src/components/UnlockCelebration.jsx` — React UI component / panel for UnlockCelebration.
- `src/components/VoiceConsentGate.jsx` — React UI component / panel for VoiceConsentGate.
- `src/components/VoiceSelector.jsx` — React UI component / panel for VoiceSelector.
- `src/components/auth/AuthShell.jsx` — Authentication React UI view/component for AuthShell.
- `src/components/auth/ForgotPasswordView.jsx` — Authentication React UI view/component for ForgotPasswordView.
- `src/components/auth/GoogleButton.jsx` — Authentication React UI view/component for GoogleButton.
- `src/components/auth/LoginView.jsx` — Authentication React UI view/component for LoginView.
- `src/components/auth/OAuthCallbackView.jsx` — Authentication React UI view/component for OAuthCallbackView.
- `src/components/auth/SignupView.jsx` — Authentication React UI view/component for SignupView.
- `src/components/auth/ui.jsx` — Authentication React UI view/component for ui.
- `src/components/dashboard/DeadlineHorizon.jsx` — React UI component / panel for DeadlineHorizon.
- `src/components/dashboard/FourYearArc.jsx` — React UI component / panel for FourYearArc.
- `src/components/dashboard/HoursRings.jsx` — React UI component / panel for HoursRings.
- `src/components/dashboard/MilestoneFlash.jsx` — React UI component / panel for MilestoneFlash.
- `src/components/dashboard/NextThreeCard.jsx` — React UI component / panel for NextThreeCard.
- `src/components/dashboard/ProgressDetail.jsx` — React UI component / panel for ProgressDetail.
- `src/components/dashboard/SubstanceAchievements.jsx` — React UI component / panel for SubstanceAchievements.
- `src/components/finance/DebtTrajectoryTable.jsx` — React UI component / panel for DebtTrajectoryTable.
- `src/components/finance/HealthCareerScholarships.jsx` — React UI component / panel for HealthCareerScholarships.
- `src/components/finance/MedicalScholarshipPipeline.jsx` — React UI component / panel for MedicalScholarshipPipeline.
- `src/components/finance/PathwayCostCalculator.jsx` — React UI component / panel for PathwayCostCalculator.
- `src/components/finance/ServiceCommitmentPrograms.jsx` — React UI component / panel for ServiceCommitmentPrograms.
- `src/components/interview/CasperTypedTest.jsx` — React UI component / panel for CasperTypedTest.
- `src/components/interview/DebriefCard.jsx` — React UI component / panel for DebriefCard.
- `src/components/interview/MmiCircuitRunner.jsx` — React UI component / panel for MmiCircuitRunner.
- `src/components/interview/StationBrief.jsx` — React UI component / panel for StationBrief.
- `src/components/interview/StationClock.jsx` — React UI component / panel for StationClock.
- `src/components/landing/landingVersions.js` — React UI component / panel for landingVersions.
- `src/components/landing/v2/LandingPageV2.jsx` — React UI component / panel for LandingPageV2.
- `src/components/landing/v2/dcRuntime.js` — React UI component / panel for dcRuntime.
- `src/components/legal/LegalPage.jsx` — Legal and compliance rendering component for LegalPage.
- `src/components/medex/MedExChip.jsx` — React UI component / panel for MedExChip.
- `src/components/medex/MedExHistoryChart.jsx` — React UI component / panel for MedExHistoryChart.
- `src/components/medex/MedExHomeCard.jsx` — React UI component / panel for MedExHomeCard.
- `src/components/medex/MedExPanel.jsx` — React UI component / panel for MedExPanel.
- `src/components/medex/MedExRing.jsx` — React UI component / panel for MedExRing.
- `src/components/medex/SealCountdown.jsx` — React UI component / panel for SealCountdown.
- `src/components/onboarding/Onboarding.jsx` — Onboarding flow React UI component for Onboarding.
- `src/components/onboarding/OnboardingShell.jsx` — Onboarding flow React UI component for OnboardingShell.
- `src/components/onboarding/brand.jsx` — Onboarding flow React UI component for brand.
- `src/components/onboarding/chapters.js` — Onboarding flow React UI component for chapters.
- `src/components/onboarding/chart.js` — Onboarding flow React UI component for chart.
- `src/components/onboarding/design.js` — Onboarding flow React UI component for design.
- `src/components/onboarding/icons.jsx` — Onboarding flow React UI component for icons.
- `src/components/onboarding/options.js` — Onboarding flow React UI component for options.
- `src/components/onboarding/personalize.js` — Onboarding flow React UI component for personalize.
- `src/components/onboarding/primitives.jsx` — Onboarding flow React UI component for primitives.
- `src/components/onboarding/scenes.jsx` — Onboarding flow React UI component for scenes.
- `src/components/onboarding/steps/AgeBlockedStep.jsx` — Onboarding flow React UI component for AgeBlockedStep.
- `src/components/onboarding/steps/BirthdateStep.jsx` — Onboarding flow React UI component for BirthdateStep.
- `src/components/onboarding/steps/DiagnosticOfferStep.jsx` — Onboarding flow React UI component for DiagnosticOfferStep.
- `src/components/onboarding/steps/FamilyStep.jsx` — Onboarding flow React UI component for FamilyStep.
- `src/components/onboarding/steps/FeatureShowcaseStep.jsx` — Onboarding flow React UI component for FeatureShowcaseStep.
- `src/components/onboarding/steps/GeneratingStep.jsx` — Onboarding flow React UI component for GeneratingStep.
- `src/components/onboarding/steps/GoalStep.jsx` — Onboarding flow React UI component for GoalStep.
- `src/components/onboarding/steps/GraduationYearStep.jsx` — Onboarding flow React UI component for GraduationYearStep.
- `src/components/onboarding/steps/Intro.jsx` — Onboarding flow React UI component for Intro.
- `src/components/onboarding/steps/PlanReadyStep.jsx` — Onboarding flow React UI component for PlanReadyStep.
- `src/components/onboarding/steps/PlanSummaryStep.jsx` — Onboarding flow React UI component for PlanSummaryStep.
- `src/components/onboarding/steps/SaveProgressStep.jsx` — Onboarding flow React UI component for SaveProgressStep.
- `src/components/onboarding/steps/SourceStep.jsx` — Onboarding flow React UI component for SourceStep.
- `src/components/onboarding/steps/SpeedStep.jsx` — Onboarding flow React UI component for SpeedStep.
- `src/components/onboarding/steps/emotional.jsx` — Onboarding flow React UI component for emotional.
- `src/components/onboarding/steps/generic.jsx` — Onboarding flow React UI component for generic.
- `src/components/onboarding/steps/grouped.jsx` — Onboarding flow React UI component for grouped.
- `src/components/parent/ConnectionsPanel.jsx` — Parent Dashboard React UI component for ConnectionsPanel.
- `src/components/parent/FamilyThread.jsx` — Parent Dashboard React UI component for FamilyThread.
- `src/components/parent/InviteScreen.jsx` — Parent Dashboard React UI component for InviteScreen.
- `src/components/parent/ParentApp.jsx` — Parent Dashboard React UI component for ParentApp.
- `src/components/parent/ParentSetup.jsx` — Parent Dashboard React UI component for ParentSetup.
- `src/components/parent/ParentsLanding.jsx` — Parent Dashboard React UI component for ParentsLanding.
- `src/components/parent/PathwayCostsPanel.jsx` — Parent Dashboard React UI component for PathwayCostsPanel.
- `src/components/parent/ProgressSummary.jsx` — Parent Dashboard React UI component for ProgressSummary.
- `src/components/parent/QuestAssignPanel.jsx` — Parent Dashboard React UI component for QuestAssignPanel.
- `src/components/portfolio/AiPolicyNotice.jsx` — Portfolio Hub React UI component for AiPolicyNotice.
- `src/components/portfolio/ApplyingPanel.jsx` — Portfolio Hub React UI component for ApplyingPanel.
- `src/components/portfolio/ClinicalHoursSection.jsx` — Portfolio Hub React UI component for ClinicalHoursSection.
- `src/components/portfolio/CombinedDegreePanel.jsx` — Portfolio Hub React UI component for CombinedDegreePanel.
- `src/components/portfolio/CommonAppExport.jsx` — Portfolio Hub React UI component for CommonAppExport.
- `src/components/portfolio/CommonAppMirror.jsx` — The whole real Common Application, section by section, with this student's Portfolio in it.
- `src/components/portfolio/CommonAppMirrorBadge.jsx` — The strip on each Portfolio page naming which Common App section it feeds.
- `src/components/portfolio/CredentialsSection.jsx` — Portfolio Hub React UI component for CredentialsSection.
- `src/components/portfolio/EssayModeChat.jsx` — Portfolio Hub React UI component for EssayModeChat.
- `src/components/portfolio/EssayVersionHistory.jsx` — Portfolio Hub React UI component for EssayVersionHistory.
- `src/components/portfolio/FourYearExport.jsx` — Portfolio Hub React UI component for FourYearExport.
- `src/components/portfolio/MedabrainRead.jsx` — Portfolio Hub React UI component for MedabrainRead.
- `src/components/portfolio/NextStepsCard.jsx` — Portfolio Hub React UI component for NextStepsCard.
- `src/components/portfolio/OpportunitiesPanel.jsx` — Portfolio Hub React UI component for OpportunitiesPanel.
- `src/components/portfolio/OpportunityFeed.jsx` — The adaptive opportunity feed: ranked matches, next-cycle, stretches, blocked, discovery and passed-on records.
- `src/components/portfolio/OpportunityCard.jsx` — One opportunity as a card, answering all eleven required questions with its data state first.
- `src/components/portfolio/ProgramExplorer.jsx` — Portfolio Hub React UI component for ProgramExplorer.
- `src/components/portfolio/ProgramPromptsCard.jsx` — Portfolio Hub React UI component for ProgramPromptsCard.
- `src/components/portfolio/ProgramTiers.jsx` — Portfolio Hub React UI component for ProgramTiers.
- `src/components/portfolio/ReflectionJournal.jsx` — Portfolio Hub React UI component for ReflectionJournal.
- `src/components/portfolio/ResearchSection.jsx` — Portfolio Hub React UI component for ResearchSection.
- `src/components/portfolio/SectionIntro.jsx` — Portfolio Hub React UI component for SectionIntro.
- `src/components/portfolio/SectionScroller.jsx` — Portfolio Hub React UI component for SectionScroller.
- `src/components/portfolio/TrackedPanel.jsx` — Portfolio Hub React UI component for TrackedPanel.
- `src/components/portfolio/WeeklyGoalTile.jsx` — Portfolio Hub React UI component for WeeklyGoalTile.
- `src/components/portfolio/WeeklyGoalsBoard.jsx` — Portfolio Hub React UI component for WeeklyGoalsBoard.
- `src/components/portfolio/WhyPathwayDoc.jsx` — Portfolio Hub React UI component for WhyPathwayDoc.
- `src/components/portfolio/admissions/AdmissionCalculatorPanel.jsx` — Portfolio Hub React UI component for AdmissionCalculatorPanel.
- `src/components/portfolio/admissions/IntakeForm.jsx` — Portfolio Hub React UI component for IntakeForm.
- `src/components/portfolio/admissions/ProgramResultCard.jsx` — Portfolio Hub React UI component for ProgramResultCard.
- `src/components/portfolio/ivy/NarrativeEnginePanel.jsx` — Portfolio Hub React UI component for NarrativeEnginePanel.
- `src/components/prep/CertificationExplorer.jsx` — Prep Hub React UI component for CertificationExplorer.
- `src/components/prep/CoursePlannerPanel.jsx` — Prep Hub React UI component for CoursePlannerPanel.
- `src/components/prep/FourYearMap.jsx` — Prep Hub React UI component for FourYearMap.
- `src/components/quests/DailyQuestRail.jsx` — React UI component / panel for DailyQuestRail.
- `src/components/quests/QuestBoard.jsx` — React UI component / panel for QuestBoard.
- `src/components/quests/QuestCard.jsx` — React UI component / panel for QuestCard.
- `src/components/quests/QuestChainMap.jsx` — React UI component / panel for QuestChainMap.
- `src/components/quests/QuestCompleteOverlay.jsx` — React UI component / panel for QuestCompleteOverlay.
- `src/components/quests/QuestHomeCard.jsx` — React UI component / panel for QuestHomeCard.
- `src/components/quests/QuestPicker.jsx` — React UI component / panel for QuestPicker.
- `src/components/quests/QuestStrip.jsx` — React UI component / panel for QuestStrip.
- `src/components/quests/questIcons.js` — React UI component / panel for questIcons.
- `src/components/roadmap/RoadmapAscent.jsx` — React UI component / panel for RoadmapAscent.
- `src/components/roadmap/RoadmapHomeCard.jsx` — React UI component / panel for RoadmapHomeCard.
- `src/components/roadmap/RoadmapIntake.jsx` — React UI component / panel for RoadmapIntake.
- `src/components/roadmap/RoadmapItem.jsx` — React UI component / panel for RoadmapItem.
- `src/components/roadmap/RoadmapPath.jsx` — React UI component / panel for RoadmapPath.
- `src/components/roadmap/RoadmapSpine.jsx` — React UI component / panel for RoadmapSpine.
- `src/components/roadmap/RoadmapTab.jsx` — React UI component / panel for RoadmapTab.
- `src/components/roadmap/RoadmapTimeline.jsx` — React UI component / panel for RoadmapTimeline.
- `src/components/roadmap/roadmapUi.jsx` — React UI component / panel for roadmapUi.
- `src/components/roadmap/useDragScroll.js` — React UI component / panel for useDragScroll.
- `src/components/safety/CrisisResourceCard.jsx` — React UI component / panel for CrisisResourceCard.
- `src/components/streak/BoostChip.jsx` — Earned streak UI overlay component for BoostChip.
- `src/components/streak/CheckInCalendar.jsx` — Earned streak UI overlay component for CheckInCalendar.
- `src/components/streak/FreezeCard.jsx` — Earned streak UI overlay component for FreezeCard.
- `src/components/streak/LessonCompleteOverlay.jsx` — Earned streak UI overlay component for LessonCompleteOverlay.
- `src/components/streak/PathwayStreakStrip.jsx` — Earned streak UI overlay component for PathwayStreakStrip.
- `src/components/streak/StreakCalendar.jsx` — Earned streak UI overlay component for StreakCalendar.
- `src/components/streak/StreakHomeCard.jsx` — Earned streak UI overlay component for StreakHomeCard.
- `src/components/streak/StreakLeague.jsx` — Earned streak UI overlay component for StreakLeague.
- `src/components/streak/StreakPanel.jsx` — Earned streak UI overlay component for StreakPanel.
- `src/components/streak/StreakRepairCard.jsx` — Earned streak UI overlay component for StreakRepairCard.
- `src/components/ui/Disclosure.jsx` — Shared reusable UI primitive component for Disclosure.
- `src/components/ui/EmptyState.jsx` — Shared reusable UI primitive component for EmptyState.
- `src/components/ui/Loading.jsx` — Shared reusable UI primitive component for Loading.
- `src/components/ui/MathText.jsx` — Shared reusable UI primitive component for MathText.
- `src/components/ui/PanelHero.jsx` — Shared reusable UI primitive component for PanelHero.
- `src/components/ui/PlanTaskStrip.jsx` — Shared reusable UI primitive component for PlanTaskStrip.
- `src/components/ui/Portal.jsx` — Shared reusable UI primitive component for Portal.
- `src/components/ui/SubNav.jsx` — Shared reusable UI primitive component for SubNav.
- `src/components/ui/SuggestInput.jsx` — Shared reusable UI primitive component for SuggestInput.
- `src/components/ui/Tooltip.jsx` — Shared reusable UI primitive component for Tooltip.
- `src/components/ui/TrackButton.jsx` — Shared reusable UI primitive component for TrackButton.
- `src/components/ui/TrackQueueNotice.jsx` — Shared reusable UI primitive component for TrackQueueNotice.
- `src/components/ui/primitives.jsx` — Shared reusable UI primitive component for primitives.


### 9. Legal & Compliance Data (src/legal/...)

- `src/legal/legalConfig.js` — Legal document structured data for legalConfig.
- `src/legal/privacy.js` — Legal document structured data for privacy.
- `src/legal/terms.js` — Legal document structured data for terms.


### 10. Database Migrations (supabase/migrations/...)

- `supabase/migrations/0000_base_schema.sql` — Supabase database SQL migration file `0000_base_schema.sql`.
- `supabase/migrations/0001_portfolio_credibility_expansion.sql` — Supabase database SQL migration file `0001_portfolio_credibility_expansion.sql`.
- `supabase/migrations/0002_password_auth.sql` — Supabase database SQL migration file `0002_password_auth.sql`.
- `supabase/migrations/0003_progress_sync.sql` — Supabase database SQL migration file `0003_progress_sync.sql`.
- `supabase/migrations/0004_reward_and_counter_sync.sql` — Supabase database SQL migration file `0004_reward_and_counter_sync.sql`.
- `supabase/migrations/0005_master_plans.sql` — Supabase database SQL migration file `0005_master_plans.sql`.
- `supabase/migrations/0006_parent_dashboard.sql` — Supabase database SQL migration file `0006_parent_dashboard.sql`.
- `supabase/migrations/0007_backfill_activities_constraint.sql` — Supabase database SQL migration file `0007_backfill_activities_constraint.sql`.
- `supabase/migrations/0008_lock_down_rpc_functions.sql` — Supabase database SQL migration file `0008_lock_down_rpc_functions.sql`.
- `supabase/migrations/0009_parent_profiles.sql` — Supabase database SQL migration file `0009_parent_profiles.sql`.
- `supabase/migrations/0010_parent_access.sql` — Supabase database SQL migration file `0010_parent_access.sql`.
- `supabase/migrations/0011_family_messages.sql` — Supabase database SQL migration file `0011_family_messages.sql`.
- `supabase/migrations/0012_lesson_feedback.sql` — Supabase database SQL migration file `0012_lesson_feedback.sql`.
- `supabase/migrations/0013_master_plan_save_lock.sql` — Supabase database SQL migration file `0013_master_plan_save_lock.sql`.
- `supabase/migrations/0014_quests.sql` — Supabase database SQL migration file `0014_quests.sql`.
- `supabase/migrations/0015_roadmaps.sql` — Supabase database SQL migration file `0015_roadmaps.sql`.
- `supabase/migrations/0016_roadmap_function_hardening.sql` — Supabase database SQL migration file `0016_roadmap_function_hardening.sql`.
- `supabase/migrations/0017_admission_intake.sql` — Supabase database SQL migration file `0017_admission_intake.sql`.
- `supabase/migrations/0018_credential_catalog.sql` — Supabase database SQL migration file `0018_credential_catalog.sql`.
- `supabase/migrations/0019_health_pathway_portfolio.sql` — Supabase database SQL migration file `0019_health_pathway_portfolio.sql`.
- `supabase/migrations/0020_recommender_asks.sql` — Supabase database SQL migration file `0020_recommender_asks.sql`.
- `supabase/migrations/0021_medex_score.sql` — Supabase database SQL migration file `0021_medex_score.sql`.
- `supabase/migrations/0022_write_path_repair.sql` — Supabase database SQL migration file `0022_write_path_repair.sql`.
- `supabase/migrations/0023_safety_events.sql` — Supabase database SQL migration file `0023_safety_events.sql`.
- `supabase/migrations/0024_progress_sync_concurrency.sql` — Supabase database SQL migration file `0024_progress_sync_concurrency.sql`.
- `supabase/migrations/0025_narrative_engine.sql` — Supabase database SQL migration file `0025_narrative_engine.sql`.
- `supabase/migrations/0026_student_intelligence.sql` — Supabase database SQL migration file `0026_student_intelligence.sql`.
- `supabase/migrations/0027_live_sync_version.sql` — Supabase database SQL migration file `0027_live_sync_version.sql`.
- `supabase/migrations/0028_opportunity_intelligence.sql` — Discovered-opportunity inbox plus the widened recommendation-feedback vocabulary.


### 11. Automated Audit & Verification Scripts (scripts/...)

- `scripts/_appResolve.mjs` — Automated audit / verification script for _appResolve.
- `scripts/auditLessonsCompleteness.mjs` — Automated audit / verification script for auditLessonsCompleteness.
- `scripts/auditQuizBankBalance.mjs` — Automated audit / verification script for auditQuizBankBalance.
- `scripts/auditQuizBias.mjs` — Automated audit / verification script for auditQuizBias.
- `scripts/auditSatBank.mjs` — Automated audit / verification script for auditSatBank.
- `scripts/auditSatResources.mjs` — Automated audit / verification script for auditSatResources.
- `scripts/auditSatVideos.mjs` — Automated audit / verification script for auditSatVideos.
- `scripts/auditVideoIds.mjs` — Automated audit / verification script for auditVideoIds.
- `scripts/checkMailerConfig.mjs` — Automated audit / verification script for checkMailerConfig.
- `scripts/checkParentSchema.mjs` — Automated audit / verification script for checkParentSchema.
- `scripts/designTokenBaseline.json` — Automated audit / verification script for designTokenBaseline.
- `scripts/extractBrandLayers.mjs` — Automated audit / verification script for extractBrandLayers.
- `scripts/fixQuizLengthBias.mjs` — Automated audit / verification script for fixQuizLengthBias.
- `scripts/generateSitemap.mjs` — Automated audit / verification script for generateSitemap.
- `scripts/indexNow.mjs` — Automated audit / verification script for indexNow.
- `scripts/lib/copyStrings.mjs` — Automated audit / verification script for copyStrings.
- `scripts/memoryBaseline.json` — Automated audit / verification script for memoryBaseline.
- `scripts/motionBaseline.json` — Automated audit / verification script for motionBaseline.
- `scripts/payloadBaseline.json` — Automated audit / verification script for payloadBaseline.
- `scripts/portLandingCanvas.mjs` — Automated audit / verification script for portLandingCanvas.
- `scripts/prerenderSeo.mjs` — Automated audit / verification script for prerenderSeo.
- `scripts/renderIcons.mjs` — Automated audit / verification script for renderIcons.
- `scripts/spacingBaseline.json` — Automated audit / verification script for spacingBaseline.
- `scripts/verifyA11y.mjs` — Automated audit / verification script for verifyA11y.
- `scripts/verifyAdmissionModel.mjs` — Automated audit / verification script for verifyAdmissionModel.
- `scripts/verifyApiBoot.mjs` — Automated audit / verification script for verifyApiBoot.
- `scripts/verifyBootRecovery.mjs` — Automated audit / verification script for verifyBootRecovery.
- `scripts/verifyBrandLayers.mjs` — Automated audit / verification script for verifyBrandLayers.
- `scripts/verifyCombinedDegree.mjs` — Automated audit / verification script for verifyCombinedDegree.
- `scripts/verifyContentSearch.mjs` — Automated audit / verification script for verifyContentSearch.
- `scripts/verifyCopy.mjs` — Automated audit / verification script for verifyCopy.
- `scripts/verifyCredentialDatabase.mjs` — Automated audit / verification script for verifyCredentialDatabase.
- `scripts/verifyDesignTokens.mjs` — Automated audit / verification script for verifyDesignTokens.
- `scripts/verifyEssayIntegrity.mjs` — Automated audit / verification script for verifyEssayIntegrity.
- `scripts/verifyFamilyMessages.mjs` — Automated audit / verification script for verifyFamilyMessages.
- `scripts/verifyFourYearMap.mjs` — Automated audit / verification script for verifyFourYearMap.
- `scripts/verifyGradeBand.mjs` — Automated audit / verification script for verifyGradeBand.
- `scripts/verifyHealthPortfolio.mjs` — Automated audit / verification script for verifyHealthPortfolio.
- `scripts/verifyInterviewRealism.mjs` — Automated audit / verification script for verifyInterviewRealism.
- `scripts/verifyIvyEngine.mjs` — Automated audit / verification script for verifyIvyEngine.
- `scripts/verifyLanding.mjs` — Automated audit / verification script for verifyLanding.
- `scripts/verifyLegal.mjs` — Automated audit / verification script for verifyLegal.
- `scripts/verifyLessonDelivery.mjs` — Automated audit / verification script for verifyLessonDelivery.
- `scripts/verifyMasterPlan.mjs` — Automated audit / verification script for verifyMasterPlan.
- `scripts/verifyMedabrainModes.mjs` — Automated audit / verification script for verifyMedabrainModes.
- `scripts/verifyMedex.mjs` — Automated audit / verification script for verifyMedex.
- `scripts/verifyMedicalScholarships.mjs` — Automated audit / verification script for verifyMedicalScholarships.
- `scripts/verifyMemory.mjs` — Automated audit / verification script for verifyMemory.
- `scripts/verifyMigrations.mjs` — Automated audit / verification script for verifyMigrations.
- `scripts/verifyMotion.mjs` — Automated audit / verification script for verifyMotion.
- `scripts/verifyNavSearch.mjs` — Automated audit / verification script for verifyNavSearch.
- `scripts/verifyNavUnlocks.mjs` — Automated audit / verification script for verifyNavUnlocks.
- `scripts/verifyNextThree.mjs` — Automated audit / verification script for verifyNextThree.
- `scripts/verifyOpportunities.mjs` — Automated audit / verification script for verifyOpportunities.
- `scripts/verifyOpportunityIntelligence.mjs` — Assertions for the opportunity-intelligence layer: data states, eligibility gates, adaptive sizing, feedback learning, discovery honesty.
- `scripts/verifyOpportunityPrograms.mjs` — Automated audit / verification script for verifyOpportunityPrograms.
- `scripts/verifyPaletteContrast.mjs` — Automated audit / verification script for verifyPaletteContrast.
- `scripts/verifyParallelPathways.mjs` — Automated audit / verification script for verifyParallelPathways.
- `scripts/verifyParallelPathwaysE2E.mjs` — Automated audit / verification script for verifyParallelPathwaysE2E.
- `scripts/verifyParentClaimFlow.mjs` — Automated audit / verification script for verifyParentClaimFlow.
- `scripts/verifyParentDashboard.mjs` — Automated audit / verification script for verifyParentDashboard.
- `scripts/verifyPathwayEngagement.mjs` — Automated audit / verification script for verifyPathwayEngagement.
- `scripts/verifyPathwayFinance.mjs` — Automated audit / verification script for verifyPathwayFinance.
- `scripts/verifyPayload.mjs` — Automated audit / verification script for verifyPayload.
- `scripts/verifyPortfolioE2E.mjs` — Automated audit / verification script for verifyPortfolioE2E.
- `scripts/verifyPortfolioExport.mjs` — Automated audit / verification script for verifyPortfolioExport.
- `scripts/verifyQuests.mjs` — Automated audit / verification script for verifyQuests.
- `scripts/verifyRecommenders.mjs` — Automated audit / verification script for verifyRecommenders.
- `scripts/verifyResumeBuilder.mjs` — Automated audit / verification script for verifyResumeBuilder.
- `scripts/verifyRoadmap.mjs` — Automated audit / verification script for verifyRoadmap.
- `scripts/verifyRoadmapDates.mjs` — Automated audit / verification script for verifyRoadmapDates.
- `scripts/verifyRoadmapE2E.mjs` — Automated audit / verification script for verifyRoadmapE2E.
- `scripts/verifyRouting.mjs` — Automated audit / verification script for verifyRouting.
- `scripts/verifyRoutingE2E.mjs` — Automated audit / verification script for verifyRoutingE2E.
- `scripts/verifySafety.mjs` — Automated audit / verification script for verifySafety.
- `scripts/verifySatBaseline.mjs` — Automated audit / verification script for verifySatBaseline.
- `scripts/verifySatDesmos.mjs` — Automated audit / verification script for verifySatDesmos.
- `scripts/verifySatForms.mjs` — Automated audit / verification script for verifySatForms.
- `scripts/verifySatGeneration.mjs` — Automated audit / verification script for verifySatGeneration.
- `scripts/verifySatLibrary.mjs` — Automated audit / verification script for verifySatLibrary.
- `scripts/verifySatScoring.mjs` — Automated audit / verification script for verifySatScoring.
- `scripts/verifySatTab.mjs` — Automated audit / verification script for verifySatTab.
- `scripts/verifySeo.mjs` — Automated audit / verification script for verifySeo.
- `scripts/verifySmartSearchE2E.mjs` — Automated audit / verification script for verifySmartSearchE2E.
- `scripts/verifySpacing.mjs` — Automated audit / verification script for verifySpacing.
- `scripts/verifyStreak.mjs` — Automated audit / verification script for verifyStreak.
- `scripts/verifyTabSwitch.mjs` — Automated audit / verification script for verifyTabSwitch.
- `scripts/verifyTabSwitchE2E.mjs` — Automated audit / verification script for verifyTabSwitchE2E.
- `scripts/verifyTimeline.mjs` — Automated audit / verification script for verifyTimeline.
- `scripts/verifyTracking.mjs` — Automated audit / verification script for verifyTracking.
- `scripts/verifyTypography.mjs` — Automated audit / verification script for verifyTypography.
- `scripts/verifyViewportFit.mjs` — Automated audit / verification script for verifyViewportFit.
- `scripts/verifyWeeklyGoals.mjs` — Automated audit / verification script for verifyWeeklyGoals.


### 12. Documentation & Specifications (docs/, design/)

- `design/landing-v2/MedSchoolPrep Landing.dc.html` — Documentation or design specification asset for MedSchoolPrep Landing.dc.html.
- `docs/DESIGN_TOKENS.md` — Documentation or design specification asset for DESIGN_TOKENS.md.
- `docs/INTERVIEW_VOICE_PRIVACY.md` — Documentation or design specification asset for INTERVIEW_VOICE_PRIVACY.md.
- `docs/LANDING_VERSIONS.md` — Documentation or design specification asset for LANDING_VERSIONS.md.
- `docs/PROFILING_PLAN.md` — Documentation or design specification asset for PROFILING_PLAN.md.
- `docs/QUIZ_ANSWER_BALANCE_PROGRESS.md` — Documentation or design specification asset for QUIZ_ANSWER_BALANCE_PROGRESS.md.
- `docs/ROADMAP.md` — Documentation or design specification asset for ROADMAP.md.
- `docs/ROUTING.md` — Documentation or design specification asset for ROUTING.md.
- `docs/SAFETY_LAYER.md` — Documentation or design specification asset for SAFETY_LAYER.md.
- `docs/SAT_BLUEPRINT_SOURCES.md` — Documentation or design specification asset for SAT_BLUEPRINT_SOURCES.md.
- `docs/SAT_TESTS.md` — Documentation or design specification asset for SAT_TESTS.md.
- `docs/SAT_TOOLS.md` — Documentation or design specification asset for SAT_TOOLS.md.
- `docs/STYLE_GUIDE.md` — Documentation or design specification asset for STYLE_GUIDE.md.
- `docs/TEST_COVERAGE_ANALYSIS.md` — Documentation or design specification asset for TEST_COVERAGE_ANALYSIS.md.
- `docs/TRACKING.md` — Documentation or design specification asset for TRACKING.md.
- `docs/dictionary.txt` — Documentation or design specification asset for dictionary.txt.
- `docs/glossary.json` — Documentation or design specification asset for glossary.json.
- `docs/narrative-method-engine.md` — Documentation or design specification asset for narrative-method-engine.md.
- `docs/portfolio-merge-inventory.md` — Documentation or design specification asset for portfolio-merge-inventory.md.


### 13. Public Web Assets & Static Files (public/)

- `public/00d297fcab004d5db3c72b90fe977416.txt` — Static web asset / public resource `00d297fcab004d5db3c72b90fe977416.txt`.
- `public/ads.txt` — Static web asset / public resource `ads.txt`.
- `public/apple-touch-icon.png` — Static web asset / public resource `apple-touch-icon.png`.
- `public/brand/book-left.png` — Static web asset / public resource `book-left.png`.
- `public/brand/book-right.png` — Static web asset / public resource `book-right.png`.
- `public/brand/figure.png` — Static web asset / public resource `figure.png`.
- `public/brand/head.png` — Static web asset / public resource `head.png`.
- `public/brand/mark.png` — Static web asset / public resource `mark.png`.
- `public/brand/star.png` — Static web asset / public resource `star.png`.
- `public/brand/trail-1.png` — Static web asset / public resource `trail-1.png`.
- `public/brand/trail-2.png` — Static web asset / public resource `trail-2.png`.
- `public/brand/trail-3.png` — Static web asset / public resource `trail-3.png`.
- `public/brand/trail-4.png` — Static web asset / public resource `trail-4.png`.
- `public/favicon.png` — Static web asset / public resource `favicon.png`.
- `public/icon-16.png` — Static web asset / public resource `icon-16.png`.
- `public/icon-192.png` — Static web asset / public resource `icon-192.png`.
- `public/icon-32.png` — Static web asset / public resource `icon-32.png`.
- `public/icon-512.png` — Static web asset / public resource `icon-512.png`.
- `public/icon.svg` — Static web asset / public resource `icon.svg`.
- `public/llms.txt` — Static web asset / public resource `llms.txt`.
- `public/logo-mark.png` — Static web asset / public resource `logo-mark.png`.
- `public/logo.png` — Static web asset / public resource `logo.png`.
- `public/robots.txt` — Static web asset / public resource `robots.txt`.
- `public/safety-resources.json` — Static web asset / public resource `safety-resources.json`.
- `public/sitemap.xml` — Static web asset / public resource `sitemap.xml`.


### 14. Misc & Test Assets

- `src/App.jsx` — Repository asset `src/App.jsx`.
- `src/index.css` — Repository asset `src/index.css`.
- `src/main.jsx` — Repository asset `src/main.jsx`.
- `test-results/.last-run.json` — Repository asset `test-results/.last-run.json`.
