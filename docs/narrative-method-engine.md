# The Narrative Method Engine

A deterministic, multi-archetype admissions modelling engine. It reads a student's
file the way a selective-admissions reader does — theme first, then structure,
then prose — and returns findings a student can act on tonight.

**It is planned as this app's first purpose-built premium tier.** The gate is
built, wired, and currently open. See [Premium roadmap](#premium-roadmap).

---

## What it is, and what it deliberately is not

| It answers | It does not answer |
| --- | --- |
| What does my file currently say? | What are my odds of admission? |
| Does every part of it say the same thing? | Which schools should I apply to? |
| Which sentence is doing the least work? | Was this written by AI? |

The second column is not an oversight in any of the three cases:

* **No admission probability.** The app already has a calibrated chancing model
  in `src/lib/admissions/`, built in log-odds against published base rates with
  an explicit selectivity ceiling. Two differently-derived probabilities on two
  screens is how a product starts contradicting itself about the most
  consequential number it shows. `SAFEGUARDS.emitsAdmissionProbability` is
  `false` and the build asserts it.
* **No school list.** That is the college list and the calculator.
* **No AI detection.** Detectors misfire in a specific and vicious direction —
  on formal writing, on careful writing, on writers whose first language is not
  English. Building a suspicion score on that would do the most damage to
  exactly the students this product exists for. The authenticity module reports
  *craft*, always phrased as a question about a specific sentence, and it says
  so on every reading it produces.

---

## Layout

```
src/data/ivy/          corpora — cliché bank, overused projects, tier catalog,
                       grade timelines, productivity methods, Common App rules,
                       the five benchmark profiles
src/lib/ivy/           the engine — 13 modules, theme extraction, roadmap,
                       safeguards, orchestrator, persistence
src/components/portfolio/ivy/   the panel
scripts/verifyIvyEngine.mjs     the build gate (163 assertions)
supabase/migrations/0023_narrative_engine.sql
```

Panels import from `src/lib/ivy/index.js`. Everything else is implementation
detail.

## The thirteen modules

| # | Module | File | Produces |
| --- | --- | --- | --- |
| 1 | Holistic rubric | `holistic.js` | Four 1–6 category scores, `S_applicant`, the Spike Index |
| 2 | Domino framework | `domino.js` | `V_project` across five milestones |
| 3 | Portfolio tiering | `portfolio.js` | Tier 1/2/3 counts, `B_portfolio` |
| 4 | SAT heuristics | `satHeuristics.js` | `M_SAT` across five named techniques |
| 5 | Retention | `retention.js` | `R(t)`, the deep-focus/active-recall cycle |
| 6 | Supplemental storyboard | `storyboard.js` | `S_supplemental`, plus "why us" / "why major" validators |
| 7 | Authenticity | `authenticity.js` | `A_essay`, and the Section 2 resonance sorter |
| 8 | Sprint | `sprint.js` | The 90-day sprint and the dated senior calendar |
| 9 | Hook classification | `hooks.js` | The archetype vector `H⃗` and its per-archetype test |
| 10 | Syntax | `syntax.js` | `V_syntax` and the three editing sweeps |
| 11 | Competition selectivity | `competition.js` | `I_competition` |
| 12 | Differentiation | `differentiation.js` | `D_project` against the overused-project corpus |
| 13 | Interview alignment | `interview.js` | `C_interview` against the written narrative |

Plus `theme.js` (the Value-Based Theme and the Echo Coherence Score),
`roadmap.js` (grade-by-grade plans and the execution layer),
`commonApp.js` (activities list, Additional Information, brag sheets),
and `safeguards.js`.

---

## Three places the specification was corrected, and why

Each of these is documented in the module header as well. They are recorded
here because someone comparing this implementation against the source document
will otherwise read them as bugs.

**1. `S_applicant` uses `max()` on an inverted scale.** The formula is
`λ·max(Sᵢ) + (1−λ)·Σwᵢ Sᵢ`, described as rewarding "the applicant's single
strongest category". On a 1–6 scale where 1 is strongest, `max()` selects the
*weakest* category — so with λ = 0.7 the literal formula makes a student's worst
category 70% of their score. That is a well-roundedness model wearing a spike
model's name. The engine computes **both** readings (`literal` and
`spikeFirst`), reports the discrepancy in its own output rather than in a
comment, and leads with the Spike Index, which is written on an inverted scale
where `max()` is unambiguous.

**2. `B_portfolio` compares shares against counts.** `Nₖ` is defined as
normalised to the total (summing to 1) and `Tₖ` as counts `[1, 3, 4]` (summing
to 8). Subtracting one from the other is dimensionally incoherent and pins the
score near −2 for every student who ever uses it. The comparison is done in
count space — the only reading under which the specification's own triggers
(`N₁ < 1`, `N₃ > 6`) are expressible — with deviation scaled by each target's
magnitude, surplus discounted against shortfall, and the result clamped to
[0,1]. Both the residual and the raw shares are returned for audit.

**3. `R(t)`'s reinforcement product is unbounded.** `e^(−t/τ) · Π(1 + γΔⱼ)` with
ten successful recalls gives R ≈ 41 — a retention of four thousand percent. The
reinforcement is applied to τ, the decay constant, instead: each retrieval
multiplies the time constant by `(1 + γ)`, which is both the empirically correct
shape and identical to the specification in the one-review case its examples
describe. The literal product is still returned, flagged, for audit.

## Calibration constants

The specification's thresholds (cosine ≥ 0.85, `C_interview` ≥ 0.80) are defined
against dense 1536-dimensional embeddings. This engine computes deterministic
**lexical** similarity locally — no network call, no model version drift, no
essay draft leaving the device — and a lexical measure is systematically lower.
Three named constants map one onto the other:

| Constant | Value | Where |
| --- | --- | --- |
| `SELF_SIMILARITY` | 0.58 | `differentiation.js` — what a description that *is* the archetype scores against it |
| `THEME_CALIBRATION` | 0.40 | `theme.js` — what a surface squarely about one theme reaches |
| `INTERVIEW_CALIBRATION` | 0.32 | `interview.js` — what a transcript that restates the file reaches |

Each was measured against the benchmark profiles rather than guessed, and each
is pinned by an assertion in the verify script. Uncalibrated, every student is
told their project is unique and their interview is disconnected — which is a
metric that has stopped distinguishing anything.

The cost of the lexical approach is stated plainly in `text.js`: two paragraphs
meaning the same thing in different words score lower here than under a real
embedding. Every module that consumes these numbers uses them as bands, never as
cliffs, and no output anywhere is a pass/fail decision made by a similarity
score alone.

---

## The rules the build enforces

`npm run verify:ivy` — 163 assertions, wired into `npm run build` and
`npm run audit:all`. The ones that matter most:

1. **The safeguards are never gated.** Section 6 renders identically on both
   tiers. A student cannot buy their way into honest expectations.
2. **No admission probability**, on any surface.
3. **Care work and paid work are protected.** Tier 3 by how the line *scans*,
   never promoted by a leadership heuristic reading the word "Head" in "Head of
   Household Operations", and unreachable by any consolidation suggestion.
4. **No accusations.** Nothing in the authenticity module's output mentions
   authorship, and every reading carries the craft disclaimer.
5. **Nothing is silently assumed.** Unevaluable inputs are named, contribute the
   scale midpoint, and widen the confidence interval.
6. **The voice index works**: deliberately generic prose lands under 50, the
   vivid benchmark essays clear 120, and the résumé-in-prose draft does not.
7. **The five archetypes get five different findings.**
8. **Free-path guidance**: nothing recommended to a low-income profile costs
   money, and the health burner can never be scheduled cold.
9. **Drafts are never persisted.** A stored run holds findings; `stripDrafts`
   truncates every string past 180 characters and drops the keys that carry
   whole sentences.
10. **The data is honest about itself**: weights sum to 1, ids are unique, every
    trope carries a redirect that never says "stop doing this".

---

## Premium roadmap

This engine is the app's first feature designed from the start to sit behind
billing, and it is built complete before the paywall exists — because
retro-fitting a paywall means finding every entry point, and the ones you miss
are the ones that matter.

**One switch:** `ENFORCE_PREMIUM` in `src/lib/ivy/constants.js`. It is `false`.

**One entry point:** `runEngine()`, which takes a tier. The tier comes from
`narrativeEngineTier(user)` in `src/lib/entitlements.js`, which consults
`canUseNarrativeEngine(user)`. No component makes an entitlement decision.

**What free gets when the gate closes** — not a blur, and not a feature list.
The engine runs on their real profile and returns their real theme, their four
rubric scores, their portfolio shape, the headline finding and the single
highest-value action. Seeing a true finding about your own file is the argument
for the paid tier; a locked screen makes the same argument and makes it far
worse. Same principle as the four-year dossier preview above it in
`entitlements.js`.

**What is never gated, on any plan:** everything in `safeguards.js` — the
confidence interval, the honest expectations, the AI-policy note, the
demographic definitions. Asserted by the build, in two directions: that free
receives them, and that they are byte-identical to what premium receives.

**What is never gated in the database either:** `narrative_profile` and
`narrative_runs` are ordinary exportable, deletable resources. A student owns
their inputs and their history on every plan, including one they have cancelled.

Every file in `src/lib/ivy/` and `src/data/ivy/` carries a `PREMIUM ROADMAP`
header block so this is discoverable from any entry point, not only from here.
