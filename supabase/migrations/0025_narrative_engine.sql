-- 0025_narrative_engine.sql
--
-- Storage for the Narrative Method Engine (src/lib/ivy/).
--
-- ── PREMIUM ROADMAP ────────────────────────────────────────────────────────────────────────────
-- This feature is planned as the app's first purpose-built paid tier. NOTHING IN THIS SCHEMA
-- ENFORCES THAT, deliberately: entitlement is an application-layer question (see
-- canUseNarrativeEngine in src/lib/entitlements.js and ENFORCE_PREMIUM in
-- src/lib/ivy/constants.js), and a plan check baked into a table constraint would be a paywall
-- that a student's own data export has to fight its way past. A student always owns their inputs
-- and their history, on every plan, including one they have stopped paying for.
--
-- ── Two tables, because they have genuinely different lifecycles ────────────────────────────────
--
--   narrative_profile — one row per user. The INPUTS: the passion project's state, the practice
--                       results, the brag sheets, the roadmap items ticked off. Edited constantly,
--                       read on every run, and the only thing here a student would be upset to
--                       lose.
--   narrative_runs    — append-only. One row per engine run the student chose to keep. The whole
--                       point of the engine is that a profile CHANGES, and a September reading
--                       next to a June one is the most motivating screen the feature has. Keeping
--                       these as history rather than overwriting a "latest result" column is what
--                       makes that possible.
--
-- ── Why the payloads are jsonb ─────────────────────────────────────────────────────────────────
-- Same reasoning as admission_intake in 0017: the field set is owned by the code
-- (ENGINE_INPUTS in src/lib/ivy/engine.js) and will move as modules are added. A migration per
-- new question guarantees the questions stop being added.
--
-- ── PRIVACY: essay drafts ──────────────────────────────────────────────────────────────────────
-- Drafts are the most private thing in this app. They are NOT copied into either table here: the
-- engine reads them from `essays` at run time and stores only its findings. A stored run therefore
-- contains scores, flags and the short quoted fragments the audit points at — never a full draft.
-- That is enforced in src/lib/ivy/store.js (see `stripDrafts`), not here, because it is a shape
-- rule rather than a schema one; the verify script asserts it.

-- ── The inputs ─────────────────────────────────────────────────────────────────────────────────
create table if not exists narrative_profile (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,

  -- Promoted out of the blob because other features want them without parsing a payload:
  -- the Domino framework, the grade roadmap and the theme extractor all key off these.
  intended_major text,
  value_theme text,

  -- The passion project's state: description, engagement count, mentor/partner/media flags,
  -- whether a durable asset exists. Shape owned by scoreDomino() in src/lib/ivy/domino.js.
  project jsonb not null default '{}'::jsonb,

  -- SAT technique attempts, study sessions and recalls, brag-sheet answers, roadmap completions.
  practice jsonb not null default '{}'::jsonb,
  study_log jsonb not null default '{}'::jsonb,
  brag_sheets jsonb not null default '{}'::jsonb,
  completed_items jsonb not null default '{}'::jsonb,

  -- The Additional Information draft. Short, factual, and audited by
  -- auditAdditionalInfo() — it is not an essay and deliberately does not live in `essays`.
  additional_info text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One profile per account. The client treats this as a singleton (list → first row, create if
-- none); without this a double-submit on a slow connection leaves two rows and the engine reads a
-- different answer depending on insertion order. Same failure the intake table had.
create unique index if not exists narrative_profile_user_id_key on narrative_profile(user_id);

-- ── The history ────────────────────────────────────────────────────────────────────────────────
create table if not exists narrative_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,

  ran_at timestamptz not null default now(),
  grade_level text,

  -- The tier the run was produced under, so a reading is always interpretable later: a free-tier
  -- run holds fewer modules, and a history chart that silently mixes the two would show a cliff
  -- where a plan changed and read as a change in the student.
  tier text not null default 'premium',

  -- The headline figures, promoted so a trend can be charted without loading every payload.
  spike_index numeric,
  coherence numeric,
  portfolio_balance numeric,
  project_viability numeric,

  -- The full result, minus drafts. See the privacy note above.
  result jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

create index if not exists narrative_runs_user_ran_at_idx on narrative_runs(user_id, ran_at desc);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'narrative_runs_tier_check') then
    alter table narrative_runs
      add constraint narrative_runs_tier_check check (tier in ('free', 'premium'));
  end if;
end $$;

-- ── Row-level security ─────────────────────────────────────────────────────────────────────────
-- Enabled with no policies, exactly as every other table in this schema: auth is custom
-- (api/auth/*), there is no auth.uid(), and all per-user scoping happens in application code with
-- the service-role key. See the AUTH MODEL note at the top of 0000_base_schema.sql.
alter table narrative_profile enable row level security;
alter table narrative_runs enable row level security;
