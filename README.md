# MedSchoolPrep (medschoolprep-dev)

Welcome to **MedSchoolPrep** (internally configured as `medschoolprep`), a comprehensive, production-grade, React-based preparation platform built using Vite, Tailwind CSS, and Framer Motion.

This workspace is specifically engineered for high school and undergraduate students preparing for college admissions, exams, and future career pathways. All legacy graduate-level/medical depth has been removed or reframed, keeping focus strictly on secondary-to-undergraduate pathways (e.g. SAT/ACT prep, college application portfolios, financial aid, admissions planning, and undergraduate pre-professional tracking).

This README acts as the primary source of truth for the entire application, containing its core architecture, system mechanisms, API routes, testing/verification engines, environment variables, and platform guidelines.

> 🤖 **For AI Agents (Claude, Jules, GPT):**
> Refer to **`AGENTS.md`** for operational rules, guidelines, dual-deployment rules, and testing workflows, and **`FILE_NAVIGATION.md`** for an exhaustive, 100%-verified file-by-file directory map and Task-to-File Quick Lookup Matrix designed for low-token navigation.

---

## 📖 Table of Contents
1. [Platform Core & Workspace Architecture](#platform-core--workspace-architecture)
2. [Platform-Wide Systems & Engines](#platform-wide-systems--engines)
3. [Deployments & Environment Routing](#deployments--environment-routing)
4. [Complete Environment Variables Reference](#complete-environment-variables-reference)
5. [URLs, History Routing & SEO](#urls-history-routing--seo)
6. [The Parent Dashboard](#the-parent-dashboard)
7. [Offline Capabilities & Local Storage](#offline-capabilities--local-storage)
8. [Testing, Audits & Quality Control Suites](#testing-audits--quality-control-suites)
9. [Spelling Standards & Verification](#spelling-standards--verification)
10. [Onboarding & Test Bypassing Mechanisms](#onboarding--test-bypassing-mechanisms)
11. [Local Development Setup](#local-development-setup)
12. [Branding & Legal Guidelines](#branding--legal-guidelines)
13. [Comprehensive File Directory Mapping](#comprehensive-file-directory-mapping)

---

## 🛠 Platform Core & Workspace Architecture

MedSchoolPrep consists of seven top-level tabs (`NAV` in `App.jsx` and `TABS` in `routes.js`):

### 1. Home Tab (`/`)
An interactive daily workspace and overview hub. Shows the daily streak, personalized nudges, study milestones, today's schedule, and the **RewardChest** overlay (daily check-in gamification component).

### 2. SAT Hub (`/sat/...`)
A state-of-the-art prep suite mirroring the Digital SAT framework. Features:
- **Desmos Graphing Calculator:** A genuine, embedded Desmos API integration for real-time math graphing (`DesmosSurface.jsx` and `desmos.js`).
- **Baseline Diagnostic:** A fast, adaptive baseline engine to measure current student performance using score curves (`SatBaselinePanel.jsx`).
- **Adaptive Full-Length Tests:** 5 full length practice tests dynamically choosing Module 2 difficulty based on Module 1 performance (`SatFullTestPanel.jsx` and `adaptive.js`).
- **Score Reports & Diagnostics:** Direct, domain-by-domain analytics including Reading/Writing and Math scores ranging from 400 to 1600 (`SatScoreReport.jsx`).
- **Practice & Skills Panels:** Deep skill-by-skill drilling across Math and RW domains, mapped to real College Board difficulty tiers.

### 3. Prep Hub (`/prep/...`)
The core academic and tutoring gateway. Includes:
- **Pathway Lessons:** Interactive learning pathways with 141 lessons across 10 units (e.g., Physician, Physician Assistant, Dentistry, Pharmacy, Nursing, Biomed Research, Public Health, Health Administration, etc.) adapted for high school to undergraduate exploration.
- **Listen to any lesson:** Every in-house lesson article can be played as audio (`lib/lessonAudio.js` + `LessonAudioPlayer`) — paragraph-level skip, adjustable speed, a choice of narrator, and a follow-along highlight that scrolls the article with the voice. Finishing the narration satisfies the same "read it" gate scrolling does, so a lesson can be completed entirely on the bus.
- **Verification Quizzes:** Per-student quizzes (`lib/quizPersonalization.js`) — which bank, which questions, and what order are all derived from the student's onboarding profile, pathway and attempt number, so two students don't share a first attempt and a retry never re-serves the paper that just failed. The 70% pass bar is deliberately identical for everyone.
- **E-Library (`elib.js`):** A massive database of 623 verified real-world high-quality resources spanning six core categories (Life Sciences, Physical Sciences, Behavioral Sciences, Research Methods, Test Prep, Admissions & Planning). Includes a **Coaching Insights Banner** that updates dynamically depending on the active resource filter.
- **Spaced-Repetition Flashcards:** Offline-first flashcards utilizing an Anki-grade FSRS scheduling algorithm with NLP-based automatic factual card extraction.

### 4. Portfolio Hub (`/portfolio/...`)
Admissions milestones, resumes, activities, and college selection dashboard. Features:
- **Milestones (Timeline):** Date engine mapping grades and timelines (Freshman through Senior/Gap) to correct admissions phases.
- **Common App Activity Builder & Honors Log:** Exports directly to standard formats.
- **Financial Aid & Scholarship Databases:** Comprehensive tools to catalog, filter, and track scholarship deadlines.
- **Essays Workspace:** An interactive editor to draft, review, and evaluate college admissions and supplemental essays with Medabrain AI.
- **Clinical & Research Loggers:** Tracks pre-professional hours, milestones, and supervisor signatures.
- **Interview Simulator:** Spoken back-and-forth mock interview training with real-time scoring.

### 5. Plans Tab (`/plans`)
Generates structured day-by-day and week-by-week study master roadmaps utilizing the high-reasoning **Oracle** model. Supports manual adjustments and accessibility-friendly animations (supporting `reducedMotion` state forwarding).

### 6. Progress Tab (`/progress/...`)
The analytics and gamification reporting dashboard. Visualizes lesson completion percentages, quiz histories, achievements earned, daily activity heatmaps, and total acquired XP. Also home to **Streak** (`/progress/streak`) — the streak calendar, the student's two streak goals, and the reward ladder (see below).

### 7. Settings Tab (`/settings`)
Customizes UI configuration, account profile settings, dark/light theme options, accessibility controls (reduced motion, high-contrast ratios), speech synthesis voices, and reviews user subscription statuses.

---

## 🤖 Platform-Wide Systems & Engines

### Medabrain AI Coaching & Intelligence Pool
Medabrain operates on a purpose-scoped API key pool to maximize rate limit headroom on the free tier. When a call to `/api/groq.js` is triggered, it specifies a `purpose` and falls back gracefully to a shared key pool if no dedicated API key is configured.
- **Scout** (`openai/gpt-oss-20b`, low reasoning effort): Ultralight, blisteringly fast for simple conversational turns.
- **Guide** (`openai/gpt-oss-20b`, medium reasoning effort): Balanced default model tier, powering primary conversations.
- **Sage** (`openai/gpt-oss-20b`, medium reasoning effort): Highly capable tier for complex reasoning, essay critiques, and deep SAT tutor guidance. (Migrated off Groq's deprecated `llama-3.3-70b-versatile` in August 2026 — see `GROQ_SETUP.md`.)
- **Oracle** (`openai/gpt-oss-120b`): Server-side model with 131K context window, 32k completion window, and `high` reasoning effort. Powering `masterplan` generation.

### Gamification Engine (`src/lib/gamification.js` & `rewards.js`)
Calculates and awards XP, tracks streaks, issues achievements, and logs study events. Completing an E-Library study notes milestone awards +15 XP. Unlocking a milestone, verifying a unit, or logging daily check-ins is managed via a transactional, server-synchronized reward queue (`rewardClaimQueue.js`) to prevent double-claiming or progress loss.

### The Earned Streak (`src/lib/streak.js`)
A streak here is a record of **work done**, not of app opens. Nothing on the app-load path records a study day; a day is earned only once finished work clears the student's own daily goal, measured in *credits*:

| Action | Credits | Per |
| :--- | :--- | :--- |
| Verify a pathway lesson | 4 | lesson |
| Complete a quiz | 2 | quiz |
| Finish a full-length SAT test | 6 | test |
| Answer 10 SAT questions | 2 | 10 questions |
| Practice a mock interview | 2 | session |
| Read + watch a lesson · 10 flashcards · plan task · portfolio entry | 1 | each |

The default **Steady** goal is 4 credits, tuned so the two most common honest sessions clear it exactly: *one verified lesson*, or *two quizzes*. Students can pick Light (2), Steady (4), Serious (8) or Intense (12), and separately set a **streak target** (7 → 365 days) that every streak progress bar in the app measures against. Raising the daily goal never un-earns a day already finished.

- **Rewards** — eight milestone rungs (3, 7, 14, 30, 50, 100, 180, 365 days) paying deterministic XP plus streak-freeze tokens, and a weekly **Perfect Week** (all seven days of one Monday–Sunday week earned; a freeze does not buy one). Claims live in a permanent, once-ever ledger (`streakRewards`), so a rebuilt streak passing a rung again pays nothing and a late-syncing second device cannot double-claim.
- **Where it shows up** — a Home card (today's status, the week strip, next reward), a one-line encouragement strip inside the pathway, the streak calendar and settings in Progress → Streak, a pointer from Settings → Profile & Goals, and Medabrain's system prompt (which is told whether *today* is cleared, not just how long the streak is).
- **The lesson-complete takeover** (`src/components/streak/LessonCompleteOverlay.jsx`) — verifying a lesson opens a full-screen, two-page moment: page one fills the XP bar from the old level position to the new one; page two shows the streak, the week, the streak goal and how close the Perfect Week reward is, and hands the student straight into the next lesson.
- Guarded by `npm run verify:streak`, which fails the build if anything on the load path starts stamping study days again, if the credit weights drift out of line with the copy printed on the goal picker, or if the ledger stops travelling between devices.

### Responsive Grid ('RG') and Media Layout Framework
MedSchoolPrep utilizes a custom grid layout architecture ('G' and 'RG' components) supporting automated column-stacking flags (`m` flags) on mobile screens. Video overlays utilize a specific mobile-responsive `VideoModal` capping max width at 1000px while defaulting to 95% width on small viewports.

---

## 🌐 Deployments & Environment Routing

The application operates in a unified monorepo supporting two distinct hosting models:

```
                  ┌─────────────────────────────────────┐
                  │          MedSchoolPrep Monorepo        │
                  └──────────────────┬──────────────────┘
                                     │
              ┌──────────────────────┴──────────────────────┐
              ▼                                             ▼
┌───────────────────────────┐                 ┌───────────────────────────┐
│ Vercel (Test Environment) │                 │  Coolify/VPS (Production)  │
├───────────────────────────┤                 ├───────────────────────────┤
│ Serverless Function       │                 │ Node/Express Server       │
│ File-system API Routing   │                 │ `server.js`               │
│ (`api/**/*.js`)           │                 │ SPA Falling-back + Static │
└───────────────────────────┘                 └───────────────────────────┘
```

> ⚠️ **Developer Constraint:**
> If you create a new endpoint under `api/`, Vercel exposes it automatically as a serverless route. However, under Coolify/VPS, you **must manually import and mount it in `server.js`**. Otherwise, requests will return `404 Not Found` in production.

### Browser-dependent checks and the image build

`npm run build` chains ~50 `verify:*` scripts, and exactly one of them —
`verify:viewport-fit` — needs a real headless Chromium. That is a hard dependency to
carry into a production image build: Playwright ships no musl browser, so the Alpine
build stage installs Alpine's own Chromium (best-effort — a mirror outage or a full
disk must not stop a release).

If no usable browser is there, the check **skips with a warning instead of failing the
build**. The assertions themselves are not lost: `.github/workflows/verify.yml` installs
Playwright's Chromium and runs the whole build with `REQUIRE_BROWSER_CHECKS=1` on every
push and pull request, where a browser that will not start *is* a failure. So the layout
bug is still caught before it can be merged — it just no longer decides whether a deploy
ships.

Set `REQUIRE_BROWSER_CHECKS=1` locally to get the same strictness as CI, or point
`CHROMIUM_EXECUTABLE_PATH` at a Chromium you already have.

### The production bundle is not the bundle CI builds

Coolify passes every configured environment variable into the image build as a Docker
`ARG`, which Docker exposes to `RUN` — so `vite build` there sees `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY`, and CI and a plain local build never do. That is not cosmetic:
`src/lib/supabaseClient.js` resolves to `null` when either is missing, so without them
Rollup tree-shakes `@supabase/supabase-js` out of the entry graph entirely — **56 KB
gzipped that only the production bundle carries**.

`verify:payload` therefore keeps one baseline per build shape, in
`scripts/payloadBaseline.json`, and prints which one it used:

| profile | when | baseline |
|---|---|---|
| `oauth-configured` | `VITE_SUPABASE_*` set — every Coolify deploy | 3052 KB gzipped |
| `oauth-unconfigured` | CI, and `npm run build` locally | 2996 KB gzipped |

`node scripts/verifyPayload.mjs --update` re-baselines **only the profile of the build in
front of it**, so re-baseline in the same shape of build the number came from. If you ever
see the two numbers converge or the gap change a lot, something moved in or out of the
entry graph and is worth a look.

> ⚠️ **Before you set `NODE_ENV=production` as a Coolify *build* variable:**
> `verify:legal` turns its placeholder-postal-address warning into a hard build failure
> when `NODE_ENV=production` or `VERCEL_ENV=production` is set. That is deliberate — a
> notice without a physical address is defective under COPPA § 312.4(d) and GDPR Art.
> 13(1)(a) — so fix it by putting the real address in `src/legal/legalConfig.js`, not by
> unsetting the variable. Coolify's *runtime* `NODE_ENV=production` (set in the
> Dockerfile's second stage) does not reach the build and is unaffected.

---

## ✉️ Diagnosing "the email never arrived"

`npm run check:mailer -- you@example.com` sends one real OTP-style email through whatever
`BREVO_SMTP_*`/`SMTP_*` env vars are set in the current shell and prints Brevo's actual accept
response (from-address, message ID). A `250 OK` here only proves Brevo accepted the message for
relay, not that it reached the inbox — DMARC/sender-alignment failures and spam-foldering happen
silently after that point. If the script succeeds but the mail still doesn't show up, check the
Brevo dashboard (Transactional → Logs) for that message's real delivery status, and confirm
`BREVO_SMTP_FROM` is a sender verified in Brevo, ideally on the `medschoolprep.cloud` domain
with SPF/DKIM set up there.

---

## 🔐 Complete Environment Variables Reference

| Variable Name | Type | Purpose |
| :--- | :--- | :--- |
| `SUPABASE_URL` | String | Full URL of the Supabase project. Used by Server API endpoints. |
| `SUPABASE_SERVICE_ROLE_KEY` | String | Server-side high-privilege key used for DB writes and sync operations. |
| `VITE_SUPABASE_URL` | String | Same as `SUPABASE_URL`, exposed to client build for Google sign-in. |
| `VITE_SUPABASE_ANON_KEY` | String | Public anon key, used solely for OAuth callbacks on client side. |
| `RECAPTCHA_SECRET_KEY` | String | Server half of reCAPTCHA v3, checked by signup, password reset, email-code sign-in and password login. **Set it only together with `VITE_RECAPTCHA_SITE_KEY` below.** Alone, it locks every real student out: the server starts requiring a token that a bundle without the site key never sends, and every one of those flows answers `400 Could not verify you're not a robot`. Leaving both unset is a supported state — verification simply does not run. |
| `VITE_RECAPTCHA_SITE_KEY` | String | Client half, and a **build-time** variable — Vite inlines it into the bundle, so it must be an `ARG` in the Dockerfile (it is) and set at build time. Setting it only as a runtime variable has no effect whatsoever: the bundle was already written. |
| `BREVO_SMTP_HOST` / `BREVO_SMTP_PORT` | String/Num | SMTP relay host (default: `smtp-relay.brevo.com`) and TLS port (default: `587`). |
| `BREVO_SMTP_USER` / `BREVO_SMTP_PASS` | String | SMTP login/password for the single Brevo account used for all OTP email (300 emails/day on the free plan). |
| `BREVO_SMTP_FROM` | String | **Required** — the sender address verified in Brevo (Senders, Domains & Dedicated IPs → Senders). Must not be left unset: an unverified/misaligned "from" is accepted by Brevo's relay (so the app sees success) but can then be silently dropped or spam-foldered by the recipient, which looks identical to "the app never sent it." |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | String/Num | Legacy single-account SMTP config. Used only if no `BREVO_SMTP_USER` is set. `SMTP_FROM` is required for the same reason as `BREVO_SMTP_FROM` above. |
| `GROQ_API_KEY` | String | **Required.** Primary Groq API key for conversational AI. |
| `GROQ_API_KEY_2` / `_3` | String | Optional failover/pooling keys from alternative Groq accounts. |
| `GROQ_API_KEY_INTERVIEW` | String | Dedicated key for the spoken interview simulator. |
| `GROQ_API_KEY_PORTFOLIO` | String | Dedicated key for resume, essay review, and milestones coaching. |
| `GROQ_API_KEY_PREP` | String | Dedicated key for lesson and library content help. |
| `GROQ_API_KEY_PLAN` | String | Dedicated key for `masterplan` day-by-day generating. |
| `GROQ_API_KEY_SAT` | String | Dedicated key for SAT math and rw explanations. |
| `VITE_DESMOS_API_KEY` | String | Desmos Client API key. Falls back to a demo key if not configured. |
| `SITE_ORIGIN` | String | Canonical site domain used to generate sitemap.xml. |
| `PORT` | Number | Port binding for the production Express server (`server.js`, default: 3000). |
| `SAT_CHECK_URL` | String | Target URL examined by SAT automated verification scripts (default: http://localhost:5173). |
| `SAT_DESMOS_LIVE` | String/Num | Set to `1` during verification tests to run live external Desmos assertions. |
| `E2E_PORT` | Number | Dynamic port used during E2E verification tests (default: 4319). |
| `E2E_DEBUG` | String/Num | Set to `1` or `true` to enable verbose standard-error and stack-trace logs. |

---

## 🗺 URLs, History Routing & SEO

### URL Schema
- **Home:** `/home` — a bare `/` is its alias and is rewritten in place, costing no history entry.
- **Root Tabs:** `/plans`
- **Nested Subtabs:** `/sat/practice`, `/prep/pathways`, `/portfolio/milestones`, `/progress/achievements`, `/settings/family`
- **Interactive Modals:**
  - Pathway Lesson: `/prep/pathways/lesson/<unitId>/<lessonId>`
  - Practice Quiz: `/prep/quizzes/quiz/<quizId>`
- **Auth Views:** `/login`, `/signup`, `/forgot-password`, `/auth/callback`
- **Parent Views:** `/parents` (public), `/parents/signup`, `/parents/login`, and the parent app at `/family`, `/family/students`, `/family/student/<studentId>`, `/family/digest`, `/family/activity`, `/family/connections`, `/family/settings`, `/family/setup`
- **Legal:** `/legal/terms`, `/legal/privacy`

Every top-level tab and every sub-tab is addressable, including Settings — `/settings/family` is
the link an invitation email points a student at. Retired ids alias forward forever
(`/prep/pathway` → `/prep/pathways`, `/portfolio/deadlines` → `/portfolio/milestones`) and never
round-trip back out of `formatPath()`, so there is exactly one canonical URL per screen.

### Three address spaces, one bar
`/family/*` belongs to `ParentApp`, `/parents*` and `/legal/*` to `AuthGate`, everything else to
the student router in `useAppRouter`. `parsePath()` returns `null` for the first two, which is
what stops two navigation systems fighting over the address bar; `npm run verify:routing`
asserts that refusal rather than trusting it.

### History Sync Invariant
Every render computes the canonical path for the current state. Push a history entry **only** when that path differs from `location.pathname`. This ensures flawless hardware back-button navigation with no double-entry states.

### Crawler Fallback Guard
URLs ending in standard file extensions (e.g., `/sitemap.xml`, `/favicon.png`) are handled strictly as static files. If missing, the server returns a proper `404 Not Found` response instead of serving the SPA default layout to prevent search crawlers from indexing duplicate content.

---

## 👪 The Parent Dashboard

A parent is a row in `app_users` with `role='parent'` and an entirely separate application
(`src/components/parent/ParentApp.jsx`) — it owns no progress, holds no local database, and talks
to four endpoints under `/api/parent/*`.

### Consent is the authorization boundary
Nothing about a student reaches a parent until that student clicks a link sent to **their own**
mailbox. `getActiveLink()` re-reads that consent on **every request** rather than caching it on
the 30-day session, so revoking takes effect on the next screen refresh. What a parent can see is
built by an allowlist (`api/_lib/parentSummary.js`) — effort and outcomes, never coach
transcripts, lesson notes, essay text, or individual answers.

### The declaration is what makes a request checkable
Knowing a student's name has never been enough to see anything about them. But an invitation that
said only "a parent would like to follow your progress" over an unfamiliar email address gave the
student nothing to judge. So a parent account must be **built** before it can ask for anything
(`supabase/migrations/0009_parent_profiles.sql`, `api/_lib/parentProfile.js`): full name,
relationship, a reachable phone number, the student's name, and an explicit attestation — stored
verbatim, timestamped, and copied onto the invitation row so a later profile edit cannot rewrite
what was agreed to. `/api/parent/links` (POST) and `/api/parent/summary` both refuse a parent
account that has not finished it.

None of that is identity verification and the code says so plainly. Its job is to put a name and
a claimed relationship in front of the one party who can actually catch an impersonator — the
student reading the request. The gate fails **open** on a database without migration 0009, because
it is an accountability layer on top of consent rather than the thing keeping a stranger out;
locking out guardians whose children already consented would be the worse failure.

### Where parents find it
`/parents` (public, crawlable, in the sitemap), a "For parents" entry in the landing nav and
footer, a card on the sign-in screen, a link on the sign-up form, `/settings/family` inside the
student app plus a permanent item in the sidebar rail, an optional step in onboarding, and ⌘K.

### Audited by
`npm run verify:parent` — 107 structural assertions: every API handler is classified and calls
exactly one guard, the summary is an allowlist (proved against a snapshot stuffed with private
markers), the digest never infers motive or hands out enforcement instructions, and the
declaration gate is applied where it should be and fails open where it must.

---

## 💾 Offline Capabilities & Local Storage

To maximize reliability and ensure network-independent functionality, three key systems run completely inside the student's browser:
1. **FSRS Scheduling Engine:** Powered natively by `ts-fsrs` and stored within IndexedDB under `db.flashcards`.
2. **Local Flashcard Extraction:** Built using a client-side NLP parsing pipeline via `compromise` (MIT). This parses raw student notes locally and extracts facts without server dependencies or AI hallucination risks.
3. **Durable Track Outbox (`trackQueue`):** Tracks and buffers user actions (tracking colleges, scholarships, activities) when offline or on unstable networks. Queued items are stored in `db.trackQueue` and are synchronized automatically once a connection is re-established.

---

## 🧪 Testing, Audits & Quality Control Suites

The application features ten distinct automated checks. You can execute them individually or launch the full suite via:
```bash
npm run audit:all
```

| NPM Command | Target Area | Checked Constraints |
| :--- | :--- | :--- |
| `npm run audit:lessons` | Learning Pathways | Verifies objectives, formatting, and youtube ID fields across all 141 lessons. |
| `npm run audit:videos` | YouTube Embeds | Checks lesson video IDs against YouTube's oEmbed endpoint to prevent broken links. |
| `npm run audit:sat` | SAT Practice Bank | Verifies answer balance, question lengths, and student-produced math string layouts. |
| `npm run audit:sat-videos` | SAT Video Recs | Resolves all 130 assigned videos in the SAT skill catalog. |
| `npm run audit:sat-resources`| SAT Study Resources| Validates link references between external documentation and the study catalog. |
| `npm run verify:sat-scoring` | SAT Score Matrices | Validates scaled score matrices for Reading/Writing and Math domains (400-1600). |
| `npm run verify:sat-forms` | SAT Test Forms | Audits Form A through E question maps to ensure they share zero questions and contain exactly 147 questions. |
| `npm run verify:sat-baseline` | Adaptive Baseline | Asserts baseline diagnostic calibration scores and difficulty banding curves. |
| `npm run verify:tracking` | Event Tracking | Asserts that data tracking (saving opportunities, colleges, essays) is completely lossless, deduped, and idempotent. |
| `npm run verify:timeline` | Milestones Engine | Validates date calculations and academic-year rollovers for freshman-to-senior grade-gated milestones. |
| `npm run verify:routing` | Router Integrity | Confirms that routes round-trip perfectly and align with App subnav views. |
| `npm run verify:streak` | Earned Streak | Asserts the streak is earned rather than attended, that one lesson or two quizzes clears the default day, that a freeze bridges a streak but never buys a Perfect Week, and that reward rungs pay once and only what they advertised. |
| `npm run verify:routing-e2e`| Playwright Browser | Launches Playwright to perform end-to-end clicks, back/forward history actions, and sitemap exclusions in a headless browser. |

---

## 🔠 Spelling Standards & Verification

MedSchoolPrep standardizes strictly on **American English** spelling conventions (e.g., *practice*, *behavior*, *color*, *defense*, *license*, *kilometer*).

To enforce this, a spelling verification script is available:
```bash
python3 /home/jules/self_created_tools/check_spelling.py
```
> ⚠️ **Exceptions to the Rule:**
> Proper nouns, official names of universities/colleges (e.g. in `src/data/worldColleges.js`), and original external URLs (such as the International Baccalaureate URL in `src/data/elibExpansionD.js`) must preserve their original spellings to maintain factual correctness and avoid broken links.

---

## 🛡 Onboarding & Test Bypassing Mechanisms

During automated browser testing or manual verification, initial page load triggers a Name Onboarding prompt (requires submitting a name, e.g. "Alex") followed by a daily check-in chest overlay (`RewardChest`) that must be cleared before navigating further.

To bypass these gates during Playwright end-to-end tests:
1. Write a session token (`msp_session_token`) to `localStorage`.
2. Mock the GET `/api/auth/me` endpoint to return a valid JSON user profile:
   ```json
   {
     "user": {
       "name": "Test Student",
       "onboardingComplete": true
     }
   }
   ```

---

## 🚀 Local Development Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment variables
Create a `.env.local` file at the project root directory using the fields documented in [Complete Environment Variables Reference](#complete-environment-variables-reference).

### 3. Start Development Server
```bash
npm run dev
```

### 4. Compile & Run Production Build
```bash
# Compile and output optimized assets to dist/
npm run build

# Start production Express server (server.js) on port 3000
npm run start
```

---

## 📜 Branding & Legal Guidelines

- **Product Identity:** The consumer-facing system is branded as **"MedSchoolPrep"** or **"MedSchoolPrep AI Coaching."** The tutoring agent is called **"Medabrain."**
- **LLM Disclosures:** Do not claim that the application owns, trained, or built the underlying foundational models. Standard footers disclosing secure third-party vendor technology are required on Settings panels.
- **Offline Integrity:** Features running in the client's browser (FSRS flashcards, NLP compromise fact extraction) must be described as *"local client-side extraction technology"* rather than cloud AI, ensuring transparency regarding data privacy and offline capability.

### The legal documents

The Terms of Service and Privacy Policy live in `src/legal/` as **structured data, not markup**, and render through one component (`src/components/legal/LegalPage.jsx`) at the public URLs `/legal/terms` and `/legal/privacy`. Those two routes are the odd ones out in `src/lib/routes.js`: `AuthGate` renders them *ahead of* its signed-in/signed-out branch, so they resolve identically for a student, a parent following a link, and a crawler with no session — a policy you must log in to read is not notice.

| File | What it holds |
| :--- | :--- |
| `src/legal/legalConfig.js` | Every fact the documents assert about *us*: operator identity, contact and postal address, governing law, the age thresholds, document versions, the sub-processor table, and the trademark attributions. Change a value here and both documents, the landing-page colophon, and Settings → Legal all move together. |
| `src/legal/terms.js` | 24 sections. Structured so the **parent or guardian is the contracting party for any user under 18** — the decision that gives the liability cap, the disclaimers, and the arbitration clause any force, since a contract with a minor is voidable. |
| `src/legal/privacy.js` | 16 sections covering COPPA (amended Rule), FERPA, CCPA/CPRA, GDPR/UK GDPR, and the state minor-privacy laws. Every data category maps to real columns in `supabase/migrations/*.sql` or real keys in `src/lib/db.js`. |

### `npm run verify:legal` — why the build can fail on a policy

The danger with a privacy policy is not that it goes missing; it is that it quietly becomes **false**. Add an analytics SDK, change the ad tag, widen the birthdate wheel, or drop the deletion endpoint in a refactor, and the policy still tells users none of that happened — which is a deceptive practice in its own right, independent of any privacy statute, and trivially provable because the evidence is the source tree.

`scripts/verifyLegal.mjs` runs on every build and pairs each written claim with the code that has to stay true for it. It fails the build if the documents become unreachable or unindexable, if the signup consent notice disappears, if AdSense loads untagged or the tag moves below the script, if any UI reintroduces a "no ads" claim while ads are served, if a YouTube embed reverts to the tracking domain, if export/deletion stop being reachable, if an undisclosed analytics SDK or sub-processor appears, or if the age gate's arithmetic regresses — that last one by importing `src/lib/ageGate.js` and **executing** it against fixed edge cases (leap-day birthdays, a birthday later this year) rather than grepping for it.

### Compliance behaviour the code is required to have

- **Minimum age 13**, enforced in onboarding via `src/lib/ageGate.js`. The birthdate wheel deliberately reaches down to age 5: it previously started at 12, which meant no user could enter a disqualifying birth year, so the gate screened out nobody and merely relabelled under-13s as 12. A failed check is persisted, is not retryable with a different date, and **deletes the already-created account** (`AgeBlockedStep.jsx`), because by that point an `app_users` row already holds a child's email.
- **Non-personalised advertising for everyone.** `index.html` sets `tagForChildDirectedTreatment` *before* the AdSense script loads. Ordering matters — an ad request built before the flag is set is not retroactively de-personalised.
- **`youtube-nocookie.com` for every embed**, so opening a lesson does not hand Google a tracked impression before the student presses play.
- **Data export and account deletion** at `api/auth/account.js`, surfaced in Settings → Your Data & Your Rights. Deletion is one `app_users` row because every per-user table declares `on delete cascade`; `api/_lib/resources.js` is the shared table list so a new resource becomes readable, exportable and deletable at once.

---

## 📂 Comprehensive File Directory Mapping

This index provides a complete, itemized mapping of **every file in the entire repository** and its exact purpose in the MedSchoolPrep ecosystem.

### Root Configuration and Infrastructure Files
- `package.json` — Defines project metadata, dependencies (React, Framer Motion, Dexie, ts-fsrs, Nodemailer, Express, compromise, Fuse.js, etc.), and script mappings for building, auditing, and executing the app.
- `vite.config.js` — Vite bundler configuration. Customizes build outputs, handles fast module reloading, and defines the Service Worker navigation fallback exclusions list.
- `vercel.json` — Configures rewrite routes, headers, and SPA routing fallback for the Vercel serverless environment.
- `server.js` — Core Express production backend. Exposes static files, handles fallbacks, and manually imports/mounts Vercel serverless functions in the Coolify/VPS production environment.
- `Dockerfile` — Configures the containerized build steps and runtime execution for production deployments on VPS.
- `index.html` — The core SPA entry document. Integrates the asynchronous Google AdSense script inside the `<head>` and mounts the `#root` React component.
- `possible lawsuits.md` — Documents a complete regulatory compliance, legal, privacy, and trademark risk audit of the repository.
- `DEVELOPMENT.md` — High-level developer documentation outlining system setup.
- `GROQ_SETUP.md` — Comprehensive guide to setting up purpose-scoped Groq keys.
- `.gitignore` — Instructs Git on which local files (e.g., node_modules, dist, .env files) to omit from version control.
- `.dockerignore` — Excludes local artifacts and caches from Docker image builds.

---

### Backend API Layer (`api/...`)
These backend endpoints serve both Vercel Serverless and local Express routes.

#### Auxiliary Library Modules (`api/_lib/...`)
- `api/_lib/mailer.js` — Configures the Nodemailer SMTP mail transporter using Brevo settings for OTP emails.
- `api/_lib/password.js` — Implements secure, server-side PBKDF2-based password hashing and verification algorithms.
- `api/_lib/serializeUser.js` — Utility that filters out sensitive database fields (like password hashes) before sending user records to the client.
- `api/_lib/session.js` — Manages server-side session tokens, validation routines, and security checks.
- `api/_lib/supabaseAdmin.js` — Initializes the high-privilege administrative Supabase Client using the server-side service role key.
- `api/_lib/verificationToken.js` — Generates and validates transient secure OTP tokens for user signup and password reset.

#### Auth Endpoints (`api/auth/...`)
- `api/auth/complete-signup.js` — Handles the final step of student registration, saving onboarding profiles after verification.
- `api/auth/google.js` — Trades a Google OAuth token client-side for an MedSchoolPrep session token, completing Google login.
- `api/auth/login.js` — Authenticates email/password credentials, issuing secure user session cookies.
- `api/auth/logout.js` — Revokes active user session tokens from the backend database.
- `api/auth/me.js` — Retrieves and validates the current logged-in user's profile and onboarding states.
- `api/auth/reset-password.js` — Verifies recovery OTP codes and updates user password hashes.
- `api/auth/send-otp.js` — Generates and dispatches an authentication OTP code via email to a registering or recovering student.
- `api/auth/verify-otp.js` — Validates email-entered OTP codes to activate or recover accounts.

#### Content & Intelligent Routes (`api/...` root)
- `api/data/[resource].js` — High-fidelity RESTful endpoint managing generic CRUD operations (colleges, activities, scholarships) against Supabase tables with per-user safety validation.
- `api/groq.js` — Core router for Medabrain AI. Receives prompts, classifies model tiers, scopes keys, and queries Groq.
- `api/progress-sync.js` — Synchronizes client-side Dexie states (XP, studied logs, milestones) with Supabase storage.
- `api/reward-claim.js` — Handles server-side claims of gamification rewards to prevent double-claiming of XP.
- `api/send-email.js` — Generic transactional endpoint supporting custom email dispatches (e.g., sharing plans or portfolios).

---

### Shared Frontend Libraries and Core State (`src/lib/...`)
This layer handles background algorithms, client database management, tracking outboxes, and helper utilities.

#### Core Flashcard Framework (`src/lib/flashcards/...`)
- `src/lib/flashcards/aiPolish.js` — Calls the AI to format, refine, and improve flashcards generated by the local extractor.
- `src/lib/flashcards/engine.js` — Schedules and filters cards queued for review.
- `src/lib/flashcards/rank.js` — Ranks extracted factual blocks by student significance and clarity.
- `src/lib/flashcards/segment.js` — Divides raw text inputs into logical academic paragraph blocks.
- `src/lib/flashcards/text.js` — Performs clean, regular-expression-based string formatting on flashcard outputs.

#### Local Fact Extractors (`src/lib/flashcards/extractors/...`)
- `src/lib/flashcards/extractors/acronyms.js` — Extracts acronym definitions (e.g. "SAT - Scholastic Assessment Test").
- `src/lib/flashcards/extractors/cloze.js` — Generates fill-in-the-blank style flashcards from raw study notes.
- `src/lib/flashcards/extractors/comparisons.js` — Generates cards comparing distinct concepts (e.g., ACT vs. SAT).
- `src/lib/flashcards/extractors/facts.js` — Extracts simple, high-impact factual assertions.
- `src/lib/flashcards/extractors/lists.js` — Parses lists and ordered sequences into bulleted flashcard items.
- `src/lib/flashcards/extractors/misconceptions.js` — Isolates and highlights frequent student errors or common pitfalls.
- `src/lib/flashcards/extractors/numeric.js` — Identifies and extracts crucial statistical dates, scores, and values.
- `src/lib/flashcards/extractors/process.js` — Parses logical multi-step academic processes.

#### SAT Core Engines (`src/lib/sat/...`)
- `src/lib/sat/activeTabStore.js` — Synchronous store making the current active tab available to non-component providers.
- `src/lib/sat/adaptive.js` — Assembles adaptive SAT test modules, dynamically choosing Module 2 based on Module 1 scoring.
- `src/lib/sat/aiPractice.js` — Generates high-fidelity SAT practice drills using structured Groq LLM pipelines.
- `src/lib/sat/aiQuestions.js` — Parses in-context math or rw question strings into standard schemas.
- `src/lib/sat/aiStudyPlan.js` — AI generator translating diagnostic weak points into specific study milestones.
- `src/lib/sat/answerBalance.js` — Enforces length and distraction balance algorithms to eliminate answer-length bias.
- `src/lib/sat/baseline.js` — Calibrates baseline scores and estimated ranges based on a student's diagnostic test answers.
- `src/lib/sat/desmos.js` — Handles remote loading, sizing, states, and coordinates persistence for the Desmos graphing calculator.
- `src/lib/sat/desmosSeed.js` — Converts SAT math variables and systems into equations ready for Desmos plotting.
- `src/lib/sat/errorPatterns.js` — Classifies student mistakes into actionable cognitive patterns (e.g. calculation mistakes).
- `src/lib/sat/forms.js` — Manages five distinct, curated SAT test forms (A, B, C, D, E) ensuring they share zero questions.
- `src/lib/sat/learnerProfile.js` — Computes skill strengths, heatmaps, and diagnostic recommendations per student.
- `src/lib/sat/mastery.js` — Calculates skill mastery points based on a running history of student drills.
- `src/lib/sat/nextAction.js` — Offers diagnostic-driven "next-best actions" (e.g., take a math drill) based on weak points.
- `src/lib/sat/projection.js` — Projects score trajectories based on current test progress and historical improvements.
- `src/lib/sat/selector.js` — Selects balanced questions from the local database matching a specific skill and difficulty.
- `src/lib/sat/shuffle.js` — Shuffles uniform answer options of SAT practice questions.
- `src/lib/sat/useSatData.js` — React hook exposing user SAT progress, scores, and review logs.

#### Shared Application Utilities (`src/lib/...` root)
- `src/lib/a11y.js` — Accessibility helper supporting screen readers and custom themes.
- `src/lib/academicIntel.js` — Aggregates GPA, test scores, and courses to evaluate a student's high school academic strength.
- `src/lib/achievements.js` — Tracks and unlocks gamified student accomplishments.
- `src/lib/activityIntel.js` — Categorizes and scores extracurricular activities for Common App readiness.
- `src/lib/aiCache.js` — Local storage cache utility that speeds up recurring LLM requests.
- `src/lib/aiFlashcards.js` — Connects the offline compromise engine and the Groq API to optimize card quality.
- `src/lib/applicationStrength.js` — Aggregates academic and extracurricular intelligence into a cohesive application readiness index.
- `src/lib/authApi.js` — Interface for interacting with email/password authentication endpoints.
- `src/lib/autoDeadlines.js` — Automatically projects college, scholarship, and financial aid deadlines based on student grade levels.
- `src/lib/celebrate.js` — Triggers fullscreen canvas confetti bursts upon major milestones or daily streak gains.
- `src/lib/collegeRecommend.js` — Recommends colleges matching a student's GPA, Region, BSMD goals, and SAT/ACT midpoints.
- `src/lib/commonApp.js` — Maps tracked milestones and extracurricular logs into Common App format structures.
- `src/lib/cosmetics.js` — Manages visual accent styling across elements.
- `src/lib/dailyCheckin.js` — Tracks checking states and updates user streak parameters.
- `src/lib/dataApi.js` — Brokered API interface fetching and saving tracked list resources against `/api/data`.
- `src/lib/dateUtils.js` — Formats, parses, and counts absolute or relative dates.
- `src/lib/db.js` — Defines the IndexedDB schema via Dexie, declaring keys (notes, flashcards, events, track outboxes).
- `src/lib/diagnosticEngine.js` — Tailors onboarding plans based on student grade, pacing, and diagnostic responses.
- `src/lib/essayCritique.js` — Evaluates college admissions and supplemental essays with constructive Medabrain critiques.
- `src/lib/eventLog.js` — Tracks student engagement events (lesson completed, video watched, streak logged) on-device.
- `src/lib/exportPDF.js` — Compiles admissions portfolios, activities list, and achievements into print-ready PDFs.
- `src/lib/fsrs.js` — Implements the full Free Spaced-Repetition Scheduler algorithm in JavaScript.
- `src/lib/gamification.js` — Houses the calculation math behind user levels, ranks, and XP rewards.
- `src/lib/icsExport.js` — Compiles tracked deadlines into standard `.ics` iCalendar calendar formats.
- `src/lib/insights.js` — Contextual study recommendations matching filtered resource categories in E-Library.
- `src/lib/interviewScore.js` — Evaluates simulated mock-interview texts and spoken feedback transcripts.
- `src/lib/masterPlanGenerator.js` — Structures and parses detailed Oracle-grade day-by-day JSON plans.
- `src/lib/medabrainComments.jsx` — Formats inline comments and speech-bubble dialogues for the Medabrain coaching UI.
- `src/lib/noteFlashcardEngine.js` — Feeds local lesson notes directly into the flashcard system.
- `src/lib/nudges.js` — Triggers relevant, contextual nudges based on recent student milestones.
- `src/lib/personalBrief.js` — Summarizes custom student bios for personalized AI feedback.
- `src/lib/planGenerator.js` — Drafts high school academic and test preparation plans.
- `src/lib/portfolioCritique.js` — Offers comprehensive feedback on tracked portfolio extracurricular activities.
- `src/lib/portfolioData.js` — Coordinates state synchronizations for the portfolio tracking engine.
- `src/lib/progressSync.js` — Manages the synchronization cycle between Dexie local storage and Supabase remote databases.
- `src/lib/recentActivity.js` — Formulates recent activity listings visualized in the Progress hub.
- `src/lib/recommend.js` — Recommends resources matching a student's weaknesses or current units.
- `src/lib/recommendOpportunities.js` — Recommends competitions, summer programs, and organizations matching student interests.
- `src/lib/renderMarkdown.js` — Safe Markdown compiler transforming lesson text and AI insights into HTML.
- `src/lib/rewardClaimQueue.js` — Prevents double-claiming of XP and coordinates syncing with backend claimed logs.
- `src/lib/rewards.js` — Declares rewards, XP structures, and gamified achievement keys.
- `src/lib/routes.js` — **SOT routing table.** Translates canonical paths to state objects and handles retired alias resolution.
- `src/lib/scholarshipNotes.js` — Local note persistence manager for scholarship research records.
- `src/lib/scholarshipResearch.js` — Manages research tracking logic for federal and institutional aid search.
- `src/lib/search.js` — Implements fuzzy search across E-Library resources and personal notes.
- `src/lib/seo.js` — Updates HTML head canonical URLs, robots directions, and meta tags dynamically based on the active path.
- `src/lib/sounds.js` — Coordinates audible feedback sounds for clicks, milestones, achievements, and mistakes.
- `src/lib/speech.js` — Manages Web Speech API components for spoken mock interviews and reading text aloud.
- `src/lib/studentProfile.js` — Generates systems prompts, limits academic integrity bounds, and blocks medical/clinical advice.
- `src/lib/supabaseClient.js` — Instantiates the client-side public Supabase module for Google OAuth callbacks.
- `src/lib/supplementalPrompts.js` — Provides custom prompt variables for supplemental college essays review.
- `src/lib/theme.js` — Declares Tailwind CSS color maps, dark/light variations, glass panels, and button styles.
- `src/lib/timeline.js` — Date utility filtering milestones based on academic grade levels.
- `src/lib/trackQueue.js` — Implements the durable, device-local tracking outbox. Runs retry loops and flushes saved lists.
- `src/lib/trackedItems.js` — Evaluates active tracked opportunities and populates milestones calendars.
- `src/lib/trackingCatalog.js` — Maps opportunities and scholarship entries into clean Supabase schema columns.
- `src/lib/useAppRouter.js` — **History routing hook.** Listens to history pops, updates React state, and restores scroll offsets.
- `src/lib/useTrackQueue.js` — React hooks surfacing pending queue states and manual outbox sync actions.
- `src/lib/viewState.js` — Persists core subtab indexes and active overlay parameters to localStorage.
- `src/lib/weeklyGoals.js` — Recommends weekly micro-actions (e.g. log 3 hours) and tracks completion rates.

---

### Static Databases and Structured Catalogs (`src/data/...`)
- `src/data/VIDEO_CORRECTIONS.md` — Logs correct metadata corrections for pathway and SAT study videos.
- `src/data/constants.js` — Declares school matrices (Region, mid-GPA, SAT/ACT scales, acceptance rates).
- `src/data/elib.js` — The core E-Library catalog. 623 real-world high school and college prep resources.
- `src/data/elibExpansionA.js` through `src/data/elibExpansionK.js` — Expansion datasets forming the E-Library catalog.
- `src/data/elibExtra.js` — Extra curated resources for admissions and planning.
- `src/data/interviewQuestions.js` — Library of mock interview questions across pathways.
- `src/data/mmiCasperQuestions.js` — Multiple Mini Interview (MMI) and Casper situational response training scenarios.
- `src/data/nudgeBank.js` — Repository of personalized prompts for the daily student coach.
- `src/data/opportunities.js` — Curated list of 220 student competitions, summer programs, and internships.
- `src/data/quizzes.js` — Maps unit lessons to corresponding concept quizzes.
- `src/data/scholarships.js` — Database of verified high school and college scholarships.
- `src/data/supplementalEssays.js` — Compilation of supplemental essay prompts from top-tier universities.

#### Pathway Lessons Catalog (`src/data/lessonContent/...`)
- `src/data/lessonContent/index.js` — Compiles and exports the 141 learning pathway lessons.
- `src/data/lessonContent/biomedResearch.js` — Lessons on laboratory pipelines, journals, and pre-med research.
- `src/data/lessonContent/dentistry.js` — Lessons covering dental careers, manual dexterity, and pre-dental routes.
- `src/data/lessonContent/exploring.js` — Basic career exploration guidance for young students.
- `src/data/lessonContent/healthAdmin.js` — Lessons on healthcare systems, policies, and health informatics.
- `src/data/lessonContent/nursing.js` — Covers nursing specialties (RN, NP, CRNA) and pre-licensure academics.
- `src/data/lessonContent/pharmacy.js` — Explores pharmaceutical roles, compounding, and PharmD pathways.
- `src/data/lessonContent/physicalOccupTherapy.js` — Explores rehabilitation, occupational therapy, and DPT preparation.
- `src/data/lessonContent/physician.js` — Pre-medical requirements, MCAT timelines, and medical specialty overviews.
- `src/data/lessonContent/physicianAssistant.js` — Guides students on patient care hours and PA school admission requirements.
- `src/data/lessonContent/publicHealth.js` — Public health systems, disease tracking, epidemiology, and biostatistics.

#### Verification Quiz Bank (`src/data/quizzes/...`)
- `src/data/quizzes/index.js` — Bundles and exports all concepts quizzes.
- `src/data/quizzes/bioBiochem.js` — Biology and biochemistry verification questions.
- `src/data/quizzes/chemPhys.js` — General chemistry and physical science quiz questions.
- `src/data/quizzes/lessonQuizzes.js` — Individual lesson concept check quizzes.
- `src/data/quizzes/psychSoc.js` — Behavioral science and sociology check questions.

#### SAT Practice Bank & Catalogs (`src/data/sat/...`)
- `src/data/sat/forms.js` — Curated questions mappings for Forms A through E.
- `src/data/sat/reference.js` — Reference formulas (geometry, algebra) matching Digital SAT testing software.
- `src/data/sat/resources.js` — SAT-specific external study materials and resource directories.
- `src/data/sat/scoring.js` — Scale conversion matrix (raw correct answers to 400-1600 scaled ranges).
- `src/data/sat/strategies.js` — Study and test-taking tips (e.g. process of elimination, backsolving).
- `src/data/sat/taxonomy.js` — Hierarchical classification mapping 28 academic skills to Math/RW content domains.
- `src/data/sat/videos.js` — Assigned video explanations for individual SAT skill competencies.

#### SAT Question Databases (`src/data/sat/questions/...`)
- `src/data/sat/questions/index.js` — Compiles and exports the complete 1,038 Digital SAT practice bank.
- `src/data/sat/questions/mathAdvanced.js` through `mathAdvancedD.js` — Advanced math items (quadratic equations, non-linear systems).
- `src/data/sat/questions/mathAlgebra.js` through `mathAlgebraD.js` — Algebra questions (linear equations, inequalities, graphs).
- `src/data/sat/questions/mathGeoTrig.js` through `mathGeoTrigD.js` — Geometry and Trigonometry questions (theorems, circles, sine/cosine).
- `src/data/sat/questions/mathPSDA.js` through `mathPSDAD.js` — Problem Solving and Data Analysis items (statistics, probability, models).
- `src/data/sat/questions/rwConventions.js` through `rwConventionsD.js` — Conventions of Standard English (punctuation, grammar, syntax).
- `src/data/sat/questions/rwCraftStructure.js` through `rwCraftStructureD.js` — Craft and Structure (vocabulary, cross-text, purpose).
- `src/data/sat/questions/rwExpression.js` through `rwExpressionD.js` — Expression of Ideas (rhetorical synthesis, transitions).
- `src/data/sat/questions/rwInfoIdeas.js` through `rwInfoIdeasD.js` — Information and Ideas (central ideas, command of evidence).

---

### React Components & UI Layouts (`src/components/...`)

#### Tab Panels & Core Views (`src/components/...` root)
- `src/App.jsx` — **Application shell and entry router.** Mounts desktop/mobile shells, synchronizes overlays, and manages IndexedDB initialization.
- `src/components/AboutMePanel.jsx` — Personal bio workspace that saves profiles used to contextualize AI responses.
- `src/components/ActivitiesResumePanel.jsx` — Activities & Résumé: the merged tab holding activities/honors, academics, clinical hours, research, and certifications as five switchable sections.
- `src/components/AnimatedLogo.jsx` — Violet-to-cyan visual logo utilizing smooth Framer Motion paths.
- `src/components/AppTour.jsx` — Step-by-step guidance overlays that familiarize new students with workspaces.
- `src/components/AppearanceSettings.jsx` — Adjusts color contrast tokens and toggles motion-reduction features.
- `src/components/AuthGate.jsx` — Protects internal tabs, prompting signed-out students to log in.
- `src/components/CollegeAutocomplete.jsx` — Search dropdown matching real-time user keystrokes against university records.
- `src/components/CollegeListPanel.jsx` — Customizable application list classifying schools into Safety, Target, and Reach tiers.
- `src/components/EssayCritique.jsx` — UI bubble delivering structured paragraph critiques and spelling feedback.
- `src/components/EssayWorkspacePanel.jsx` — Full essay editing suite with revisions history and character counts.
- `src/components/FinancialAidHomeCard.jsx` — Visual card summarizing tracked financial metrics.
- `src/components/FinancialAidPanel.jsx` — Financial aid tracker detailing scholarship counts and pending requirements.
- `src/components/HighlightableArticle.jsx` — Lesson reader with click/drag highlight triggers.
- `src/components/InterviewHistoryPanel.jsx` — History explorer reviewing transcripts and scoring of spoken interview rounds.
- `src/components/InterviewPrepPanel.jsx` — Selection board for launching simulated interviews.
- `src/components/LandingPage.jsx` — Public marketing page showcasing features, core curricula, and pricing.
- `src/components/LessonNotesPanel.jsx` — Sidebar notes editor that saves debounced drafts directly to IndexedDB.
- `src/components/LiveVoiceInterview.jsx` — Conversational interface using browser microphones for voice mock-interviews.
- `src/components/MedabrainLauncher.jsx` — Chat widget initiating the Medabrain coaching panel.
- `src/components/MyPlanCard.jsx` — Visualization panel highlighting active daily roadmap targets.
- `src/components/OpportunitiesDatabase.jsx` — Searchable catalog listing summer programs, competitions, and internships.
- `src/components/PlansTab.jsx` — Roadmap visualizer with reduced-motion support.
- `src/components/PortfolioMedabrain.jsx` — Sidebar AI coach delivering resume and portfolio reviews.
- `src/components/PortfolioMilestones.jsx` — Calendar and timeline planner displaying upcoming deadlines.
- `src/components/PortfolioPlanWeek.jsx` — Weekly target card showcasing milestones.
- `src/components/PrepMedabrain.jsx` — Chat console helping students research pathways lessons.
- `src/components/QuizPlanToday.jsx` — Inline component prompting daily verification checks.
- `src/components/QuizRecommendationsPanel.jsx` — Suggests custom review quizzes based on weak performance fields.
- `src/components/RecommendersPanel.jsx` — Recommender logs tracking recommendation letter requests and letters written.
- `src/components/RewardChest.jsx` — Daily check-in overlay offering streaks validation and XP gains.
- `src/components/ScholarshipDatabase.jsx` — Catalog of scholarships with custom deadline filters.
- `src/components/ScholarshipResearchAdd.jsx` — Dialog allowing students to track custom scholarships.
- `src/components/ScoreTrackerPanel.jsx` — SAT/ACT milestone trend tracker that calculates automatic superscores.
- `src/components/StreakHeatmap.jsx` — Activity matrix detailing daily check-ins over a running calendar.
- `src/components/SupplementalEssaysCard.jsx` — Lists supplemental prompt requirements per college.
- `src/components/TodayPlanNudge.jsx` — Top header offering actionable suggestions based on active plans.
- `src/components/VoiceSelector.jsx` — Settings dropdown for browser-supported TTS options.

#### Authentication Forms (`src/components/auth/...`)
- `src/components/auth/AuthShell.jsx` — Visually cohesive frame handling credential card dimensions and background effects.
- `src/components/auth/ForgotPasswordView.jsx` — Form initiating password-recovery OTP emails and resetting hashes.
- `src/components/auth/GoogleButton.jsx` — Interface triggering client-side Google OAuth redirects.
- `src/components/auth/LoginView.jsx` — Form collecting email and password to open user sessions.
- `src/components/auth/OAuthCallbackView.jsx` — Captures Google redirected logins and trades them for session cookies.
- `src/components/auth/SignupView.jsx` — Multi-step registration form managing verification email dispatches.
- `src/components/auth/ui.jsx` — Common styling presets, input layouts, and validation alerts for auth pages.

#### Onboarding Curricula (`src/components/onboarding/...`)
- `src/components/onboarding/Onboarding.jsx` — Main wizard coordinating onboarding transitions.
- `src/components/onboarding/OnboardingShell.jsx` — Full-page frame featuring brand background animations.
- `src/components/onboarding/brand.jsx` — Renders animated branding logotypes for the intro screen.
- `src/components/onboarding/options.js` — Static arrays defining prep velocities, grades, and targets.
- `src/components/onboarding/personalize.js` — Translates questionnaire answers into baseline profile targets.
- `src/components/onboarding/primitives.jsx` — Button models and choice chips used during questionnaires.

#### Onboarding Steps (`src/components/onboarding/steps/...`)
- `src/components/onboarding/steps/BirthdateStep.jsx` — Collects user birth dates to calculate milestones ages.
- `src/components/onboarding/steps/FeatureShowcaseStep.jsx` — Displays high-value components (SAT Desmos, Milestones) to students.
- `src/components/onboarding/steps/GeneratingStep.jsx` — Renders loading sequences while the Oracle model crafts roadmaps.
- `src/components/onboarding/steps/GradeScoreStep.jsx` — Questionnaire section logging high school graduation years.
- `src/components/onboarding/steps/Intro.jsx` — Initial landing screen for onboarding.
- `src/components/onboarding/steps/PlanReadyStep.jsx` — Confirms roadmap outputs are complete and ready for browsing.
- `src/components/onboarding/steps/PlanSummaryStep.jsx` — Outlines key weekly milestones generated for the student.
- `src/components/onboarding/steps/RealisticTargetStep.jsx` — Evaluates target SAT scores against current GPA realities.
- `src/components/onboarding/steps/SaveProgressStep.jsx` — Encourages guests to register accounts to sync progress.
- `src/components/onboarding/steps/SourceStep.jsx` — Questionnaire asking students how they discovered the platform.
- `src/components/onboarding/steps/SpeedStep.jsx` — Captures target prep speeds (e.g. casual, intensive, sprint).
- `src/components/onboarding/steps/TargetScoreStep.jsx` — Questionnaire registering target SAT or ACT scores.
- `src/components/onboarding/steps/ThankYouStep.jsx` — Concludes guest onboarding questionnaires.
- `src/components/onboarding/steps/emotional.jsx` — Collects student feelings about admissions to tailor coaching vibes.
- `src/components/onboarding/steps/generic.jsx` — Catch-all form module for custom onboarding questions.

#### Portfolio Auxiliary Panels (`src/components/portfolio/...`)
- `src/components/portfolio/ClinicalHoursSection.jsx` — Clinical Hours section of Activities & Résumé: log sheet for clinical volunteering, shadowing, and patient-care hours.
- `src/components/portfolio/ResearchSection.jsx` — Research section of Activities & Résumé: log sheet for independent studies and mentored research.
- `src/components/portfolio/CredentialsSection.jsx` — Skills & Certs section of Activities & Résumé: tracker for certifications, licenses, and technical credentials with expiry dates.
- `src/components/portfolio/SectionIntro.jsx` — Section header band shared by the sections inside Activities & Résumé.
- `src/components/portfolio/CommonAppExport.jsx` — Modal detailing instructions for moving Extracurricular activities to Common App.
- `src/components/portfolio/MedabrainRead.jsx` — Conversational advice interface specifically scoped to portfolio assets.
- `src/components/portfolio/TrackedPanel.jsx` — Overview card displaying count tallies for colleges, scholarships, and active programs.
- `src/components/portfolio/WeeklyGoalTile.jsx` — Interactive check list elements for weekly roadmap micro-actions.
- `src/components/portfolio/WeeklyGoalsBoard.jsx` — Progress tracking interface showing weekly completions.

#### SAT Interactive Hub (`src/components/sat/...`)
- `src/components/sat/DesmosCalculator.jsx` — Wraps the Desmos API in a responsive graph component.
- `src/components/sat/DesmosSurface.jsx` — Handles container mounts and window resize triggers for Desmos.
- `src/components/sat/SatAnnotatableText.jsx` — Renders passage texts with click-to-highlight/annotate features.
- `src/components/sat/SatBaselinePanel.jsx` — Handles launch mechanisms for adaptive baseline tests.
- `src/components/sat/SatDiagnosticPanel.jsx` — Tracks diagnostic scores and details question breakdowns.
- `src/components/sat/SatFullTestPanel.jsx` — Interactive framework conducting full length modular adaptive SAT exams.
- `src/components/sat/SatLibraryPanel.jsx` — Browser panel accessing the full 1,038 practice question bank.
- `src/components/sat/SatMedabrain.jsx` — Chat side-panel offering help on active test-day questions.
- `src/components/sat/SatOverviewPanel.jsx` — Central SAT dashboard showing scores, review log count, and skills mastered.
- `src/components/sat/SatPracticePanel.jsx` — Interactive practice framework conducting targeted SAT drills.
- `src/components/sat/SatQuestionPlayer.jsx` — Renders question passages, options, feedback, and SPR input boxes.
- `src/components/sat/SatReferenceSheet.jsx` — Floating dialog displaying SAT geometry formulas.
- `src/components/sat/SatReviewLogPanel.jsx` — Database compiling incorrect student responses for active review.
- `src/components/sat/SatScoreReport.jsx` — Elaborate diagnostic dashboard explaining score conversions.
- `src/components/sat/SatSkillHeatmap.jsx` — Color grid visualizing skill mastery across domains.
- `src/components/sat/SatSkillsPanel.jsx` — Directory listing SAT content domains and skills.
- `src/components/sat/SatStudyPlanCard.jsx` — Displays current study recommendation milestones.
- `src/components/sat/SatTab.jsx` — Mounts sub-nav views and provides the SAT toolkit context.
- `src/components/sat/SatTestPicker.jsx` — Selection modal for Form-based tests and Diagnostics.
- `src/components/sat/SatToolkitPanel.jsx` — Collapsible sidebar hosting Desmos, reference formulas, and AI coach.
- `src/components/sat/SatToolsContext.jsx` — React state context coordinating Desmos, annotations, and modal states.
- `src/components/sat/SatVideoRecs.jsx` — Lists recommended video explanations matching incorrect skills.
- `src/components/sat/satUi.jsx` — Form presets and style rules for SAT layouts.
- `src/components/sat/useSatSession.js` — Custom hook conducting session state management for active exams.

#### Generic Component Library (`src/components/ui/...`)
- `src/components/ui/EmptyState.jsx` — Fallback panel displayed when listings are empty.
- `src/components/ui/MathText.jsx` — Renders LaTeX equations safely using standard formatting.
- `src/components/ui/PanelHero.jsx` — Standard header layout featuring gradient titles.
- `src/components/ui/PlanTaskStrip.jsx` — Micro-action item row visualizing scheduled tasks.
- `src/components/ui/Portal.jsx` — React portal that mounts overlay nodes (modals, toasts) to body.
- `src/components/ui/SubNav.jsx` — Tab bar for navigating sub-views.
- `src/components/ui/TrackButton.jsx` — Adaptive track button (Idle, Saving, Tracked, Queued).
- `src/components/ui/TrackQueueNotice.jsx` — Indicator panel showing the status of offline pending sync entries.
- `src/components/ui/primitives.jsx` — Common buttons, badges, input controls, and structural grid components (`RG`, `G`).

---

### Database Migration Layer (`supabase/...`)
These migrations define and shape the secure Supabase storage engine.
- `supabase/migrations/0000_base_schema.sql` — Establishes core user tables, profiles, sync tables, and authentication tables.
- `supabase/migrations/0001_portfolio_credibility_expansion.sql` — Expands activities, college application lists, and essay drafts tables.
- `supabase/migrations/0002_password_auth.sql` — Configures secure password hashes and salt storage for custom logins.
- `supabase/migrations/0003_progress_sync.sql` — Installs synchronizations for verified units, flashcards, and XP parameters.
- `supabase/migrations/0004_reward_and_counter_sync.sql` — Tracks claims, check-in history records, and gamification counters.

---

### Automated Auditing & Maintenance (`scripts/...`)
These scripts are run during builds, pre-commit pipelines, and health reviews.
- `scripts/auditLessonsCompleteness.mjs` — Scans 141 lessons across 10 pathways to verify structure, requirements, and video links.
- `scripts/auditQuizBankBalance.mjs` — Audits the hand-written quiz bank to check answer-length bias.
- `scripts/auditQuizBias.mjs` — Examines correct choices to flag if strict-longest patterns violate balance ratios.
- `scripts/auditSatBank.mjs` — Performs comprehensive quality audits across the 1,038 SAT practice questions.
- `scripts/auditSatResources.mjs` — Cross-checks reference resources linked inside SAT modules.
- `scripts/auditSatVideos.mjs` — Ensures all SAT skill video links are live.
- `scripts/auditVideoIds.mjs` — Resolves pathway video embeds against YouTube API endpoints to identify dead links.
- `scripts/fixQuizLengthBias.mjs` — Auto-corrects answer length bias on marked hand-written quiz questions.
- `scripts/generateSitemap.mjs` — Re-compiles `public/sitemap.xml` and `public/robots.txt` upon production builds.
- `scripts/renderIcons.mjs` — Pre-renders Lucide vector assets into static assets.
- `scripts/verifyOpportunities.mjs` — Unit tests catalog mapping properties and data structures for opportunities.
- `scripts/verifyPaletteContrast.mjs` — Audits text-on-background color ratios across dark/light and high-contrast palettes.
- `scripts/verifyResumeBuilder.mjs` — Validates state calculations and academic GPA matches in the Resume module.
- `scripts/verifyRouting.mjs` — Validates sitemaps and confirms route tables map perfectly with actual React views.
- `scripts/verifyRoutingE2E.mjs` — Runs headless Playwright browsers to verify deep link loading and history popped state.
- `scripts/verifySatBaseline.mjs` — Simulates and unit tests the math and verbal adaptive baseline engines.
- `scripts/verifySatDesmos.mjs` — Verifies Desmos API loading sequences and graph-state persistence.
- `scripts/verifySatForms.mjs` — Tests full-length SAT Form matrices to guarantee perfect question-omission limits.
- `scripts/verifySatGeneration.mjs` — Asserts correctness and formats of AI practice drills.
- `scripts/verifySatLibrary.mjs` — Tests navigation flows through the SAT whole-bank library.
- `scripts/verifySatScoring.mjs` — Asserts correctness of Reading/Writing and Math scaled score calculations.
- `scripts/verifySatTab.mjs` — Runs comprehensive end-to-end clicks and workflows across the SAT Prep Hub.
- `scripts/verifyTimeline.mjs` — Asserts freshman-to-senior gated milestones mapping logic.
- `scripts/verifyTracking.mjs` — Verifies lossless outbox queue behavior and deduplication keys.
- `scripts/verifyWeeklyGoals.mjs` — Asserts performance of weekly study goals recommended by Medabrain.
