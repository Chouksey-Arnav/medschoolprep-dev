# The Medabrain safety layer

This document is for whoever is on the hook for the safety review queue, and for
whoever has to change a phone number at short notice. The design reasoning lives
in the source files it points at; what is here is the operational half — what
runs, what to do when something needs changing, and the promises that cannot be
broken without a decision from a human being.

## The situation this exists for

Medabrain is an AI coach talking privately to students aged roughly thirteen to
seventeen, about a subject that is both academically and emotionally
high-pressure. Coach conversations are **architecturally hidden from parents** —
the parent surface (`api/parent/*`) reads progress and never chat, deliberately —
which is the right design and has one consequence that governs everything below:

> Some students will tell Medabrain things they will not tell anyone else, and
> no adult is downstream of that conversation by default.

A disclosure missed here is missed entirely. That is why detection is a dedicated
classification pass with a test suite rather than a paragraph of instructions to
the main model.

## What runs, in order

| Step | Where | What it does |
|---|---|---|
| 1 | `src/lib/safety/classifier.js` → `screenMessage` | A deterministic lexical screen. Synchronous, offline-safe, tuned for recall. Runs on **every** message. |
| 2 | `src/lib/safety/classifier.js` → `classifyWithModel` | A dedicated model call: `purpose:'safety'`, temperature 0, JSON out, no persona. Runs only on the ambiguous band. |
| 3 | `src/lib/safety/pass.js` → `runSafetyPass` | Combines the two (higher tier wins, always), arms the resource card, fires the review-queue event, returns the prompt block. |
| 4 | `src/lib/safety/prompts.js` | The block appended to the system prompt for this turn. |
| 5 | `api/groq.js` | Appends its own non-strippable copy of the crisis and medical-scope guardrails. |

Two combination rules, and they are not negotiable:

- **A stage-1 crisis hit is never downgraded by stage 2.** An explicit statement
  of intent is not something a classifier gets to talk us out of.
- **A stage-2 failure never clears a stage-1 hit.** Offline, rate-limited or
  malformed all mean "no second opinion", never "no problem".

## The tiers

| Tier | Severity | What the coach does |
|---|---|---|
| `crisis` | 3 | Acknowledge the person **first**, stay with them, then offer 988 and the Crisis Text Line without pressure. No hotline in the opening line, no risk assessment, no screening checklist, no diagnosis, no pivot back to schoolwork. |
| `distress` | 2 | The same response. Acute distress and crisis are not worth splitting in how warmly you respond; they are worth splitting in the review queue. |
| `academic_stress` | 1 | Acknowledge it, **offer to scale the weekly goal back** with a real number, help re-plan the week. Explicitly no hotlines and no crisis framing. |
| `none` | 0 | Nothing is added to the prompt. |

The low tier is the load-bearing one. A safety layer with a single threshold
fires on "I'm so behind in chem", hands a sixteen-year-old a suicide hotline, and
teaches them that this app panics — after which they stop typing honestly and the
layer has destroyed the only channel it had. Over-triggering is not a smaller
failure than under-triggering; it is a different one with the same ending.

## Changing the crisis resources without a deploy

The numbers live in **`public/safety-resources.json`**, served statically and read
at runtime by `src/lib/safety/resources.js`.

1. Edit that file. Every entry needs a `name` plus at least one of `tel`, `sms`
   or `url` (HTTPS only); anything else is dropped on load.
2. The card and the coach's own reply both read from it, so one edit fixes both.
3. A malformed file, a 404 or being offline all fall back to
   `DEFAULT_CRISIS_CONFIG` — the compiled-in copy — so a bad edit degrades to the
   shipped numbers rather than to an empty card. `scripts/verifySafety.mjs`
   asserts the two agree on 988 and 741741, so **update the fallback too** when a
   primary number changes.

## The review queue

`safety_events` (see `supabase/migrations/0023_safety_events.sql`), written by
`api/safety-event.js`. The open queue, highest tier first:

```sql
select occurred_at, tier, severity, surface, third_party, signals, user_id
from safety_events
where reviewed_at is null
order by severity desc, occurred_at desc;
```

`third_party` marks a student carrying somebody else's disclosure — a friend, a
sibling. Materially different for a reviewer, and often more urgent, because that
student may be the only person who knows.

Mark a row handled by setting `reviewed_at`, `reviewed_by` and `review_note`.

### The three prohibitions

These are properties of the code, not policies in a document, and each one has a
test in `scripts/verifySafety.mjs` that fails the build if it stops being true:

1. **No conversation content, ever.** There is no column for it, the handler
   never reads one, and `signals` carries category identifiers
   (`crisis.wish_to_die`) validated against a shape no sentence can satisfy.
2. **No parent notification.** `api/safety-event.js` imports no mailer and
   touches no parent table; nothing in `api/parent/*` may select from
   `safety_events`. If a student's words could reach their parents by any route,
   the honest thing would be to say so up front — at which point the disclosure
   never happens and there is nothing left to protect.
3. **No automated action against the student.** Nothing here locks an account,
   changes what a student sees, or alters their coaching. It is a queue for
   humans.

## The medical scope boundary

`MEDICAL_SCOPE_BOUNDARY` in `src/lib/safety/prompts.js`, appended to **every**
Medabrain system prompt (the head coach, Prep, Portfolio, SAT) plus a shorter
server-side copy in `api/groq.js` that a modified client cannot strip.

Teach physiology, pathophysiology, pharmacology and disease mechanism freely, in
depth, including for a condition somebody in the student's family has. Never
diagnose anyone, never interpret the student's own symptoms, never interpret
their labs or numbers, never advise on anyone's medications. When a question
crosses the line: answer the academic half properly, decline the personal half
plainly, and point at a clinician, a school nurse, a pharmacist, or a parent or
trusted adult who can get them to one.

The first half matters as much as the second. A health-careers app whose coach
hedges on physiology is a broken teaching product, and a refusal that leaves a
student with nothing is what teaches them to go and ask something with no
boundary at all.

## Testing

```
npm run verify:safety
```

Runs in `npm run build` and `npm run audit:all`. It covers four phrasing buckets
— crisis, ambiguous, ordinary academic stress, and clearly benign — because a
suite with fewer than all four can be passed by a classifier that matches
everything or one that matches nothing. It also asserts the response guidance
acknowledges before it redirects, the low tier carries no hotline, the resource
config validates, the privacy prohibitions hold at the source level, and every
chat surface actually calls the pass.

**When you add a chat surface, call `runSafetyPass` from it and add it to
`CHAT_SURFACES` in the test.** A student in trouble does not pick the tab we
thought of.
