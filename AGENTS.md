# AGENTS.md — Operational Guide & AI Agent Directives for MedSchoolPrep

Welcome to **MedSchoolPrep**! This document provides mandatory operational directives, architectural guidelines, safety boundaries, testing protocols, and token-saving navigation strategies for AI agents (Claude, Jules, GPT, Copilot, etc.) working on this repository.

---

## 🚀 Low-Token Agent Navigation Strategy

To minimize token usage and navigate the codebase efficiently:

1. **Primary Navigation File:** Refer directly to **`FILE_NAVIGATION.md`**.
   - `FILE_NAVIGATION.md` contains an exhaustive, 100%-verified file-by-file directory map of all repository files.
   - Use the **Task-to-File Quick Lookup Matrix** in `FILE_NAVIGATION.md` to identify exact file paths for your task before performing broad directory searches or reading unnecessary files.
2. **Architecture & Technical Depth:** For deep architectural specifications, offline FSRS algorithms, and Supabase database schemas, refer to `techstack.md`.
3. **Legal & Compliance:** For COPPA, FERPA, GDPR, and regulatory compliance rules, refer to `possible lawsuits.md` and `src/legal/legalConfig.js`.

---

## 🎯 Platform Purpose & Architectural Constraints

MedSchoolPrep is a high school to undergraduate preparation platform engineered with React 18, Vite, Tailwind CSS, Framer Motion, Dexie IndexedDB, ts-fsrs, and Express (`server.js`).

### 1. Target Audience & Scope
- Scope is strictly **secondary-to-undergraduate pathways** (SAT/ACT test prep, pre-health exploration, college application portfolios, financial aid, and admissions planning).
- **No Graduate/Medical Depth:** Legacy MCAT/medical-school prep content has been removed or reframed. Do NOT reintroduce graduate-level or clinical diagnostic depth.

### 2. Dual Deployment & API Mounting Constraint
The application operates in a monorepo supporting two deployment models:
- **Vercel (Serverless):** Endpoints under `api/**/*.js` are exposed automatically.
- **Coolify / VPS (Production Express Backend in `server.js`):**
  > ⚠️ **Mandatory Rule:** Any new endpoint added under `api/` **MUST be manually imported and mounted in `server.js`**. Failing to do so will cause `404 Not Found` errors in production.

### 3. Spelling Standard — American English
- The codebase standardizes strictly on **American English** spelling conventions (*practice*, *behavior*, *color*, *defense*, *license*, *kilometer*).
- **Exceptions:** Official university names (e.g. in `src/data/worldColleges.js`), proper nouns, and original external URLs must preserve real-world spellings.
- Verify spelling using:
  ```bash
  python3 /home/jules/self_created_tools/check_spelling.py
  ```

### 4. Safety & Academic Integrity Boundaries
- **No Ghostwriting:** AI coaching prompts (e.g. `src/lib/studentProfile.js`, `essayCritique.js`, `safety/classifier.js`) assist, critique, and provide feedback, but **NEVER draft, write, or generate complete graded assignments or college essays**.
- **No Clinical Advice:** AI agents must not deliver medical diagnostic advice or pretend to be licensed medical professionals.

### 5. Offline-First & Durable Tracking
- **Flashcards & FSRS:** Runs entirely client-side using `ts-fsrs` and `compromise` NLP in IndexedDB (`db.flashcards`).
- **Track Outbox:** Offline user actions (saving colleges, scholarships) queue in `db.trackQueue` via `src/lib/trackQueue.js` and sync automatically when online.

### 6. Earned Streak Engine
- A streak represents **completed work** (credits), NOT app opens (`src/lib/streak.js`).
- Default goal is 4 credits (cleared by 1 verified pathway lesson or 2 quizzes).
- Guarded by `npm run verify:streak`.

### 7. COPPA & Legal Compliance Invariants
- Minimum user age is **13** (`src/lib/ageGate.js`). Failed age checks immediately purge the account (`AgeBlockedStep.jsx`).
- AdSense tag ordering: `tagForChildDirectedTreatment` is set *before* loading AdSense script in `index.html`.
- YouTube embeds use `youtube-nocookie.com` across all lesson modules.
- Guarded by `npm run verify:legal`.

---

## ⚡ Task-to-File Quick Routing Table

For instant file navigation, consult this quick index or `FILE_NAVIGATION.md`:

| Subsystem / Task | Primary Component | Core Logic | Data Catalog / Migration | Test / Audit Script |
| :--- | :--- | :--- | :--- | :--- |
| **SAT Desmos Calculator** | `src/components/sat/DesmosCalculator.jsx` | `src/lib/sat/desmos.js` | `src/data/sat/reference.js` | `scripts/verifySatDesmos.mjs` |
| **SAT Adaptive Tests** | `src/components/sat/SatFullTestPanel.jsx` | `src/lib/sat/adaptive.js` | `src/data/sat/forms.js` | `scripts/verifySatForms.mjs` |
| **SAT Question Bank** | `src/components/sat/SatLibraryPanel.jsx` | `src/lib/sat/aiPractice.js` | `src/data/sat/questions/index.js` | `scripts/auditSatBank.mjs` |
| **Pathway Lessons** | `src/components/PrepMedabrain.jsx` | `src/lib/lessonAudio.js` | `src/data/lessonContent/index.js` | `scripts/auditLessonsCompleteness.mjs` |
| **Verification Quizzes** | `src/components/QuizRecommendationsPanel.jsx` | `src/lib/quizPersonalization.js` | `src/data/quizzes/index.js` | `scripts/auditQuizBankBalance.mjs` |
| **Common App Resume** | `src/components/ActivitiesResumePanel.jsx` | `src/lib/commonApp/activities.js` | `src/data/constants.js` | `scripts/verifyResumeBuilder.mjs` |
| **Common App Mirror & Sync** | `src/components/portfolio/CommonAppMirror.jsx`, `CommonAppMirrorBadge.jsx` | `src/lib/commonApp/` (`sections`, `derive`, `sync`) | — (ledger rides the user record) | `scripts/verifyCommonApp.mjs` |
| **Milestones & Roadmaps** | `src/components/PortfolioMilestones.jsx` | `src/lib/roadmap/generator.js` | `supabase/migrations/0015_roadmaps.sql` | `scripts/verifyRoadmap.mjs` |
| **Parent Dashboard** | `src/components/parent/ParentApp.jsx` | `src/lib/parentApi.js` | `supabase/migrations/0006_parent_dashboard.sql` | `scripts/verifyParentDashboard.mjs` |
| **AI Routing & Groq** | `src/components/MedabrainLauncher.jsx` | `api/groq.js` | `GROQ_SETUP.md` | `scripts/verifyMedabrainModes.mjs` |
| **URL Routing Table** | `src/App.jsx` | `src/lib/routes.js` | `src/lib/seoRoutes.js` | `scripts/verifyRouting.mjs` |

---

## 🧪 Verification & Health Audit Workflows

Before submitting changes, run the relevant automated audit scripts:

```bash
# Core Routing & Navigation Audit
npm run verify:routing

# Pathway & Curriculum Audits
npm run audit:lessons
npm run audit:videos

# SAT Engine & Question Bank Audits
npm run audit:sat
npm run verify:sat-forms
npm run verify:sat-scoring

# Legal, COPPA & Parent Dashboard Audits
npm run verify:legal
npm run verify:parent

# Earned Streak Audit
npm run verify:streak

# File Navigation Map Audit (Ensure 100% file coverage)
python3 /home/jules/self_created_tools/verify_md_navigation.py

# Full Audit Suite
npm run audit:all
```

---

## 📋 Agent Checklist Before Completion

1. [ ] **Source Modification:** Ensure changes were made to original source files (not build artifacts in `dist/` or `build/`).
2. [ ] **API Handler Mounting:** If a new file was added in `api/`, confirm it is imported and mounted in `server.js`.
3. [ ] **Spelling Check:** Confirm American English spelling standards.
4. [ ] **Navigation Coverage:** If new files were created, run `python3 /home/jules/self_created_tools/verify_md_navigation.py` to ensure `FILE_NAVIGATION.md` stays synchronized.
5. [ ] **Automated Testing:** Run relevant `npm run verify:*` scripts and ensure all assertions pass.
