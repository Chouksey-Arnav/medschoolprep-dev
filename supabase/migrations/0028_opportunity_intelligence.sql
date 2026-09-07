-- 0028_opportunity_intelligence.sql
--
-- The opportunity-intelligence layer. Two changes, both additive:
--
--   1. `discovered_opportunities` — records Medabrain proposed for ONE student that our curated
--      catalogs (src/data/opportunities.js, src/data/opportunityPrograms.js) do not contain.
--   2. A widened `recommendation_feedback.status` vocabulary plus an `action` column, so every
--      button on an opportunity card is recorded as itself rather than squeezed into the seven
--      statuses 0026 defined for a narrower feature.
--
-- Conventions are 0026's, unchanged: one `user_id` per row, RLS enabled with NO policies
-- (defense-in-depth only — real scoping is `.eq('user_id', ...)` with the service-role key in
-- api/data/[resource].js), and a `source` provenance column with the same four-value check.
--
-- ── Why discovered records live in a per-user table and not a shared catalog ──────────────────
-- Because they are not verified, and an unverified record in a shared catalog is a rumor with a
-- distribution channel. A row here is visible to exactly the student it was found for, carries
-- `verification_state = 'needs_verification'` from birth, and can only become 'verified' through
-- an operator write (src/lib/opportunity/store.js's setVerificationState) that stamps
-- `verified_at`. There is no student-facing path to 'verified' — that is the whole design.
--
-- When a record IS verified, the intended operational path is to promote it into the curated
-- data files in the repository, not to flip a flag and leave a per-user row as the source of
-- truth. This table is a discovery inbox, not a second catalog.

-- ── 1. Discovered opportunities ────────────────────────────────────────────────────────────────
create table if not exists discovered_opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  -- The deterministic id src/lib/opportunity/discovery.js derives from name+org, so the same
  -- program found twice collides instead of duplicating. Unique per user, not globally: two
  -- students independently finding the same program is normal and is two rows.
  slug text not null,
  name text not null,
  org text,
  url text,
  category text,
  -- 'needs_verification' is the ONLY value the student-facing write path ever sets. See the
  -- WRITABLE column list in api/data/[resource].js, which excludes verified_at entirely.
  verification_state text not null default 'needs_verification'
    check (verification_state in ('needs_verification', 'in_review', 'verified', 'rejected')),
  -- The day a HUMAN checked this against the organization's own page. Null until then, and
  -- cleared again on any transition away from 'verified' — a stale check date left behind on a
  -- rejected row would read as freshness, which is the exact confusion this column exists to
  -- prevent.
  verified_at date,
  -- The model's own honest confidence that the program is real and running. Never rendered as a
  -- probability; used to order an operator's verification queue.
  confidence text check (confidence is null or confidence in ('high', 'medium', 'low')),
  source_label text,
  -- The full normalized record (src/lib/opportunity/schema.js's shape). Schemaless on purpose,
  -- exactly like school_context.rigor_available and admission_intake.answers: the columns above
  -- are the ones the app queries on, and the record shape belongs to the client, not to a
  -- migration.
  payload jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  -- Never 'external_verified' from the student-facing path: nothing this table stores has been
  -- externally verified at the moment it is written, by construction.
  source text not null default 'ai_summary' check (source in ('student_entered', 'student_reflection', 'ai_summary', 'external_verified')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists discovered_opportunities_user_slug_key on discovered_opportunities(user_id, slug);
create index if not exists discovered_opportunities_user_id_idx on discovered_opportunities(user_id);
create index if not exists discovered_opportunities_user_state_idx on discovered_opportunities(user_id, verification_state);
alter table discovered_opportunities enable row level security;

-- ── 2. Widen recommendation_feedback ───────────────────────────────────────────────────────────
-- 0026 defined ten statuses for a narrower feature. The opportunity cards add three real outcomes
-- that were previously unrepresentable and were being squeezed into 'in_progress', which made
-- them invisible to the ranker: saved-but-not-started, monitoring, and preparing for a cycle that
-- has already closed.
--
-- Dropping and re-adding the check is safe because every existing value is in the new list — the
-- new set is a strict superset. Written as a guarded drop so re-running the migration is a no-op.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'recommendation_feedback_status_check') then
    alter table recommendation_feedback drop constraint recommendation_feedback_status_check;
  end if;
  alter table recommendation_feedback
    add constraint recommendation_feedback_status_check
    check (status in (
      'completed', 'in_progress', 'paused', 'declined', 'not_interested',
      'too_difficult', 'too_expensive', 'too_far_away', 'no_longer_eligible', 'needs_help',
      'saved', 'monitoring', 'preparing_next_cycle'
    ));
end $$;

-- The exact button pressed, alongside the coarser `status` the ranker groups by. Nullable because
-- every row written before this migration has a status and no action, and
-- src/lib/opportunity/feedback.js's statusToAction() reads those rows correctly without it.
alter table recommendation_feedback add column if not exists action text;
-- The record's category at the time of the action, so a "not interested" can generalize to the
-- category rather than only to the one program. Denormalized on purpose: the catalogs a
-- recommendation came from do not share one id space (see 0026's note on item_ref), so there is
-- nothing to join to.
alter table recommendation_feedback add column if not exists item_category text;

create index if not exists recommendation_feedback_user_created_idx on recommendation_feedback(user_id, created_at desc);
