# Test coverage analysis

_Snapshot taken against `main` at f25b824 (post-#241). Numbers are line counts and module counts,
not statement coverage — see "Why there are no coverage percentages" below._

## 1. What the suite is today

There is no test runner and no `npm test`. Testing is 78 hand-written Node scripts in
`scripts/` (~20,200 lines of assertions), each one a self-contained `assert`/`check` harness
that exits non-zero on failure. They fall into three kinds:

| Kind | Example | How it verifies |
| --- | --- | --- |
| Behavioural | `verifySatScoring.mjs`, `verifyStreak.mjs`, `verifyRoadmap.mjs` | Imports the real module and asserts on its output |
| Structural / source-grep | `verifyParentDashboard.mjs`, `verifyLegal.mjs`, `verifyCopy.mjs` | `readFileSync` the source and assert a pattern is present |
| Browser E2E | `verify*E2E.mjs`, `verifyViewportFit.mjs` | Builds, serves, drives headless Chromium |

This is a genuinely good suite for what it covers — `verifyStreak`, `verifyRoadmap` and
`verifySatScoring` encode real invariants with pinned fixtures, and the practice of gating
`npm run build` on them has kept routing, legal copy and lesson delivery honest. The gaps below
are about *reach*, not rigour.

**What runs where**

- `npm run build` chains 44 verify scripts, and CI (`.github/workflows/verify.yml`) runs the
  build, plus `verify:migrations` (real Postgres service) and `verify:parent` as separate jobs.
- `audit:all` adds the content audits, and is manual-only.

## 2. Coverage, measured by module reach

| Surface | Size | Reached by a script |
| --- | --- | --- |
| `src/lib/**` (174 modules, 46k LOC) | 46,000 LOC | 81 modules imported; **93 modules / ~15,300 LOC never imported by anything** |
| `src/**/*.jsx` (211 components, 75k LOC) | 75,000 LOC | **0 components unit-tested**; a handful reached indirectly by 6 E2E flows |
| `api/**` (37 handlers, 6.3k LOC) | 6,300 LOC | 4 scripts import API modules (parent/mailer); the rest are source-grep audits only |
| SQL migrations | — | `verify:migrations` — apply, re-apply, serialize. The strongest check in the repo. |

## 3. The gaps worth closing, in priority order

### P0 — `src/lib/db.js` (2,008 lines, zero tests)

The IndexedDB layer, and the largest untested file in the repo. It owns the cross-device merge
(`applyRemoteSnapshot`, `claimSyncDelta`, the dirty-listener that drives `progressSync`). A bug
here does not throw — it silently loses or double-counts a student's study history, and the
symptom surfaces days later on a second device. Nothing anywhere asserts on it.

Concretely worth testing (all pure enough to run under `fake-indexeddb`):
- `applyRemoteSnapshot` merge: remote-newer, local-newer, both-changed, empty-remote.
- `claimSyncDelta` is exactly-once — a claim that is never acknowledged must be replayable
  without double-adding XP; an acknowledged one must never be replayed.
- Schema/version upgrade from each shipped Dexie version to current, with data present.

### P0 — the outboxes: `rewardClaimQueue.js`, `trackQueue.js`, `progressSync.js` (655 lines, zero tests)

All three exist specifically to be correct under failure — offline, expired session, cold
serverless function, two devices racing. Their own headers state the invariants ("makes 'once'
mean once", "makes 'I tracked this' mean it"), and none of those invariants is asserted anywhere.
This is the highest bug-cost-per-test-line in the codebase, and it is all testable with a stubbed
`fetch`: enqueue → fail → retry → confirm → dequeue; duplicate claim key rejected; push debounce
coalesces; a 401 mid-flight does not drop the queued intent.

### P1 — auth and session handling (`api/_lib/{password,otp,session,verificationToken}.js`, `src/lib/authApi.js`)

`password.js` and `verificationToken.js` have no test of any kind, and login / signup / OTP have
no behavioural test — `verifyParentDashboard.mjs` audits the *shape* of endpoints (does a guard
appear in the source) but never executes one. The parent-authorization audit is exactly the right
instinct; it should be extended into request-level tests that call the handler with a forged,
expired, and cross-tenant token and assert on the status code. Token expiry, OTP rate-limit and
single-use, and password hash/verify round-trip are the four cases.

### P1 — the SAT engine's untested half

`verify:sat-scoring`, `sat-forms` and `sat-baseline` are solid, but `sat/selector.js` (294),
`sat/mastery.js` (255), `sat/projection.js` (213), `sat/nextAction.js` (205),
`sat/errorPatterns.js` (193), `sat/learnerProfile.js` (492) and `sat/aiPractice.js` (720) —
2,300 lines that decide *what question a student sees next and what score we predict* — are
imported by nothing. `mastery.js`'s own header promises "never let a number look more certain
than it is"; that promise (confidence falls with sample size, recency weighting, no division by
zero on an unattempted skill) is a five-assertion test.

### P1 — nothing guards the site-wide maintenance switch

`src/main.jsx` has a hand-flipped `MAINTENANCE_MODE` boolean that swaps the entire application for
`MaintenanceNotice`. Nothing in the 78-script suite mentions it. Worse, nothing in the suite *can*
catch it: the two build-gated checks that touch a browser do not boot the app —
`verifyViewportFit` renders a synthetic shell built from extracted CSS rules, and `prerenderSeo`
writes static HTML from the SEO shell. So a full `npm run build`, and every CI job, passes green
with the app replaced by a maintenance page.

The check that *would* catch it exists and does not run: `verifyRoutingE2E` loads `/` and waits for
the "Portfolio" nav link, which `MaintenanceNotice` never renders. That is the concrete cost of the
next item.

Cheapest fix, worth doing before anything else on this list: a one-line assertion in a build-gated
script that `MAINTENANCE_MODE` is `false`, with an explicit env escape hatch for when it is
deliberately on.

### P1 — the SAT E2E chain never runs in CI

`verify:sat-e2e` (`sat-tab`, `sat-library`, `sat-tools`, `sat-generation`) is reachable from
neither `build` nor `audit:all`, and neither are `verify:routing-e2e`, `portfolio-e2e`,
`search-e2e`, `tab-switch-e2e`, `roadmap-e2e`, `parallel-pathways-e2e` or `next-three`. Roughly
2,000 lines of already-written tests are dead weight — including the only check in the repo that
notices the app is not booting at all (see above). Add a nightly (or PR-label) CI job that
builds once and runs the E2E chain against that build — the marginal cost is one `npx playwright
install`, which the build job already pays.

### P2 — components have no unit-level tests at all

211 components, 75k LOC, and `App.jsx` alone is 10,793 lines. Full component-test coverage is not
a realistic goal here, but three areas earn tests because they gate everything downstream:
`featureUnlock.js` (503 lines, untested — decides which tabs a student can even see),
`useAppRouter.js` (241, untested), and the onboarding step machine. A rendering test runner
(Vitest + Testing Library) would also make `verifyA11y`/`verifyCopy`'s source-grep assertions
into real ones.

### P2 — brittleness in the existing suite

- **Wall-clock dependence.** `verifyStreak`, `verifyQuests`, `verifyCombinedDegree`,
  `verifyMasterPlan`, `verifyFamilyMessages`, `verifyOpportunityPrograms` and
  `verifyParentClaimFlow` call bare `new Date()`. `verifyRoadmap` pins a clock (`NOW`) and is the
  model to follow — the others can break on a date rollover, or rot as catalog deadlines pass.
- **Source-grep assertions.** ~330 `.includes(...)` assertions run against file text. They catch
  deletions but not behaviour changes, and they break on an innocent rename. Convert the
  highest-value ones (the parent authorization audit especially) to executed assertions.
- **Orphans.** `auditQuizBankBalance.mjs`, `auditQuizBias.mjs` and `_appResolve.mjs` are run by no
  npm script — wire them up or delete them.

## 4. Why there are no coverage percentages

Nothing in the repo is instrumented, so "coverage" above is module reachability, which overstates
the real figure (a module imported for one constant counts as reached). A cheap first step:

```
node --experimental-test-coverage   # or c8
```

Wrap the verify scripts in `c8` once to get a real baseline and a per-file report. That will
likely show the executed-line coverage of `src/lib` is well under the 65%-of-modules figure above.

## 5. Suggested sequence

1. Add a real test runner (Vitest — it reuses `vite.config.js`) alongside the verify scripts;
   do not rewrite what works. `npm test` runs the new specs; `npm run build` keeps its gates.
2. Baseline coverage with `c8`, commit the number, and gate it from ratcheting downward.
3. Write the P0 specs: `db.js` merge, and the three outboxes.
4. Write the P1 specs: auth/session request-level tests, and the SAT selection/mastery engines.
5. Put the existing E2E chain in a nightly CI job.
6. Pin the clock in the seven wall-clock-dependent scripts.

Item 0, ahead of all of these because it is one line: gate `MAINTENANCE_MODE` in the build.
