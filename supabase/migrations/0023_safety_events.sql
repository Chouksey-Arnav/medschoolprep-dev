-- 0023_safety_events.sql
--
-- The internal safety review queue.
--
-- ── What this table is for ──────────────────────────────────────────────────
-- Medabrain talks privately to students aged roughly 13-17 about an
-- academically and emotionally high-pressure subject, and coach conversations
-- are architecturally invisible to parents (see 0006_parent_dashboard.sql and
-- api/_lib/parentSummary.js — the parent surface reads progress, never chat).
-- That privacy is a deliberate product guarantee and it is the reason some
-- students will say things here they will not say anywhere else.
--
-- It is also the reason a detection has to leave a trace SOMEWHERE. Without
-- this table, a safety classifier's output would exist for the length of one
-- HTTP response and then be gone: nobody could answer "did that fire", "how
-- often does it fire", "is it over-firing on ordinary stress", or "has this
-- account tripped the high tier four times this week". This is the record that
-- makes the safety layer reviewable instead of merely present.
--
-- ── What this table must never become ───────────────────────────────────────
-- Three prohibitions, and they are the whole design:
--
--   1. NO CONVERSATION CONTENT. There is no column for the student's message,
--      the coach's reply, or any excerpt of either — not truncated, not hashed,
--      not "just the matched phrase". `signals` carries pattern IDENTIFIERS
--      ('crisis.self_harm_intent'), which name a CATEGORY and reproduce no
--      words the student typed. The moment a row can be read back as something
--      a student said, this table has broken the promise that made the
--      disclosure possible in the first place.
--   2. NO PARENT PATH. Nothing in api/parent/* selects from this table and
--      nothing may. A safety event is not a progress signal, is not part of any
--      digest, and is not disclosed to a linked parent account. If a student's
--      words could reach their parents by any route, the honest thing to do
--      would be to tell them so up front — at which point the disclosure never
--      happens and there is nothing to protect.
--   3. NO AUTOMATED ACTION AGAINST THE STUDENT. This is a review queue for
--      humans. Nothing here locks an account, changes what a student sees, or
--      alters their coaching.
--
-- Row-level security is enabled with no policy, which is this schema's standard
-- shape (see 0012_lesson_feedback.sql and every table around it): every read and
-- write goes through a serverless handler holding the service-role key, which
-- bypasses RLS, and RLS-on-with-no-policy means the anon key can reach nothing
-- at all. On a table whose rows are a record of teenagers' worst nights, "denied
-- by default" is the only correct starting position.

create table if not exists safety_events (
  id          uuid primary key default gen_random_uuid(),
  -- WHO and WHEN — the two facts the queue exists to hold, alongside severity.
  -- on delete cascade: a deleted account takes its safety events with it. A
  -- record of a disclosure by somebody who has left is not ours to keep.
  user_id     uuid not null references app_users(id) on delete cascade,
  occurred_at timestamptz not null default now(),

  -- SEVERITY. Constrained at the database rather than trusted from the client,
  -- for the same reason lesson_feedback.rating is: this column's entire value is
  -- that it can be grouped and filtered, and one stray free-text tier makes
  -- every count wrong.
  tier        text not null check (tier in ('academic_stress', 'distress', 'crisis')),
  severity    smallint not null check (severity between 1 and 3),

  -- WHICH categories matched, as identifiers only — never text the student
  -- wrote. Capped by the handler at a small number of short strings.
  signals     text[] not null default '{}',

  -- Whether the tier came from the deterministic screen or was escalated by the
  -- dedicated model pass (see src/lib/safety/classifier.js). This is how you
  -- find out that one of the two stages has started behaving differently.
  source      text check (source in ('screen', 'model')),

  -- Which surface the message was typed into ('coach', 'prep', 'portfolio',
  -- 'essay', 'sat'). Tells a reviewer where a student was when it happened
  -- without telling them anything about what was said.
  surface     text,

  -- Set when the subject of the disclosure was somebody else (a friend, a
  -- sibling). Materially different for a reviewer and cheap to record.
  third_party boolean not null default false,

  -- Review workflow. Deliberately minimal: a queue nobody can mark as handled
  -- is a queue that gets read once.
  reviewed_at timestamptz,
  reviewed_by uuid references app_users(id) on delete set null,
  review_note text,

  created_at  timestamptz not null default now()
);

-- The queue's own read pattern: highest tier first, newest first, unreviewed
-- only. This is the index that makes "what came in overnight" instant.
create index if not exists safety_events_open_idx
  on safety_events (severity desc, occurred_at desc)
  where reviewed_at is null;

-- The other question a reviewer asks: everything for one account, in order.
create index if not exists safety_events_user_idx
  on safety_events (user_id, occurred_at desc);

alter table safety_events enable row level security;
