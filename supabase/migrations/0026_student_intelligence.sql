-- 0026_student_intelligence.sql
--
-- The durable "student-intelligence" layer: everything Medabrain needs to know about a student
-- that does not already have a home in the tables 0000-0025 built (colleges, essays, activities,
-- awards, gpa_entries, clinical_hours, recommenders, ...). Every table here follows the exact
-- conventions those migrations already established:
--
--   • one `user_id uuid references app_users(id) on delete cascade` per row, RLS enabled with NO
--     policies (defense-in-depth only — see the AUTH MODEL note in 0000_base_schema.sql; real
--     scoping happens in api/data/[resource].js with `.eq('user_id', ...)` and the service-role key)
--   • a `source` provenance column on every table added here, so a fact can always be traced back
--     to whether the STUDENT typed it, the student reflected on it, an AI summarized/inferred it,
--     or (never true of anything below) it was externally verified. Nothing in this migration is
--     ever externally verified — see the check constraint on service_logs in particular, which is
--     the one place a well-meaning future change could accidentally imply otherwise.
--   • singleton tables (one row per student) get a unique index on user_id, exactly like
--     admission_intake in 0017 — the client treats them as list -> first row, create if none.
--   • append-only-feeling logs (quick_notes, service_logs, competitions, ...) are still editable
--     (PATCH) because the product requirement is "students can correct details later," not
--     "history is immutable" — that distinction belongs to medex_scores and narrative_runs, not
--     to anything here.

-- ── Provenance vocabulary, reused as an inline check constraint per table ──────────────────────
-- Not a Postgres ENUM on purpose: enums require a migration to add a value, and a plain text
-- check constraint can be loosened by a later migration without a type-rewrite. Every provenance
-- column below uses the same four values:
--   'student_entered'   — the student typed or dictated this themselves, structured or free-form.
--   'student_reflection'— the student's own voluntary reflection (motivation, confidence, stress,
--                          barriers) rather than a fact about the world.
--   'ai_summary'        — MedSchoolPrep's AI extracted or summarized this FROM something the
--                          student wrote; the original text is always kept alongside it.
--   'external_verified' — confirmed by a source other than the student. Reserved for future use;
--                          nothing this migration creates is ever written with this value from the
--                          student-facing API (see the service_logs check constraint below, which
--                          hard-blocks it for the one table most likely to be misread as verified).

-- ── 1. School context — one row per student ─────────────────────────────────────────────────────
-- Grade/graduation year already live on app_users (grade_level) and are kept there; this table is
-- the rest of "what school looks like for this student" that nothing else captures: what rigor is
-- even offered (a school with no AP program makes "why no APs" an unfair question), and current
-- workload in their own words.
create table if not exists school_context (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  graduation_year integer,
  school_name text,
  school_type text check (school_type is null or school_type in ('public', 'private', 'charter', 'homeschool', 'online', 'other')),
  -- { ap: bool, ib: bool, dual_enrollment: bool, honors: bool } — schemaless on purpose, same
  -- reasoning as admission_intake.answers: which rigor options exist varies by school and the UI
  -- owns the exact key set, not a migration.
  rigor_available jsonb not null default '{}'::jsonb,
  current_courses text[] default '{}',
  workload_notes text,
  source text not null default 'student_entered' check (source in ('student_entered', 'student_reflection', 'ai_summary', 'external_verified')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists school_context_user_id_key on school_context(user_id);
alter table school_context enable row level security;

-- ── 2. Constraints & consent — one row per student ──────────────────────────────────────────────
-- Time/transportation/cost/accessibility constraints, ALL voluntary, plus the one place ZIP/state
-- consent for local-opportunity matching lives. `location_consent` defaults false and nothing else
-- in the app may use `zip_code`/`state_code` for matching while it is false — see
-- src/lib/studentIntel/context.js and src/components/portfolio/OpportunitiesPanel.jsx. Revoking
-- consent does not have to delete the stored ZIP/state (a student may want to flip it back on
-- later); it has to make every consumer stop reading them, which is what the boolean gates.
create table if not exists constraints_profile (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  time_availability text,
  transportation_limits text,
  cost_sensitivity text,
  accessibility_notes text,
  family_constraints text,
  zip_code text,
  state_code text,
  location_consent boolean not null default false,
  location_consent_at timestamptz,
  location_consent_revoked_at timestamptz,
  source text not null default 'student_reflection' check (source in ('student_entered', 'student_reflection', 'ai_summary', 'external_verified')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists constraints_profile_user_id_key on constraints_profile(user_id);
alter table constraints_profile enable row level security;

-- ── 3. Quick capture — free-form notes, structured extraction ridden alongside them ─────────────
-- The raw text a student typed or pasted is the permanent record; `extracted` is what a
-- lightweight AI pass pulled out of it (see src/lib/studentIntel/extract.js), and
-- `extraction_status` says whether that pass has run and whether the student has reviewed it. The
-- API layer (api/data/[resource].js's IMMUTABLE_ON_PATCH) refuses to let a PATCH change
-- `raw_text` once written — the wording a student actually used must never be silently rewritten
-- by a later "correction" of the structured side.
create table if not exists quick_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  raw_text text not null,
  category text,
  extracted jsonb,
  extraction_status text not null default 'pending' check (extraction_status in ('pending', 'applied', 'edited', 'skipped', 'failed')),
  source text not null default 'student_entered' check (source in ('student_entered', 'student_reflection', 'ai_summary', 'external_verified')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists quick_notes_user_id_idx on quick_notes(user_id);
create index if not exists quick_notes_user_created_idx on quick_notes(user_id, created_at desc);
alter table quick_notes enable row level security;

-- ── 4. Interest history — majors/healthcare focus/personal interests, over time ─────────────────
-- A change of direction is signal, not noise: a student who moves from "surgeon" to "public
-- health" between 10th and 11th grade is telling a coach something real, and overwriting the old
-- value loses it. Each row is a point-in-time statement; `status` marks whether it is still current.
create table if not exists interest_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  interest text not null,
  category text check (category is null or category in ('major', 'healthcare_focus', 'personal_interest')),
  status text not null default 'current' check (status in ('current', 'past')),
  note text,
  occurred_at date not null default current_date,
  source text not null default 'student_entered' check (source in ('student_entered', 'student_reflection', 'ai_summary', 'external_verified')),
  created_at timestamptz not null default now()
);
create index if not exists interest_history_user_id_idx on interest_history(user_id);

alter table interest_history enable row level security;

-- ── 5. Service / volunteer log — ALWAYS self-reported ───────────────────────────────────────────
-- Deliberately separate from clinical_hours (0018/0019/0021), which carries a supervisor-facing
-- verification workflow. This table is the opposite: general community service and volunteering
-- across any cause area, entered by the student, and the check constraint on `source` makes it
-- structurally impossible for the student-facing write path to ever mark a row 'external_verified'
-- — analytics and copy built on this table must always describe it as self-reported.
create table if not exists service_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  entry_date date not null default current_date,
  organization text,
  cause_area text,
  hours numeric not null check (hours > 0),
  role text,
  description text,
  impact_note text,
  reflection text,
  supporting_details text,
  source text not null default 'student_entered' check (source in ('student_entered', 'student_reflection', 'ai_summary')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists service_logs_user_id_idx on service_logs(user_id);
create index if not exists service_logs_user_date_idx on service_logs(user_id, entry_date);
alter table service_logs enable row level security;

-- ── 6. Competitions — submissions, placements, results ──────────────────────────────────────────
create table if not exists competitions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  title text not null,
  level text,
  category text,
  result text,
  placement text,
  occurred_on date,
  description text,
  source text not null default 'student_entered' check (source in ('student_entered', 'student_reflection', 'ai_summary', 'external_verified')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists competitions_user_id_idx on competitions(user_id);
alter table competitions enable row level security;

-- ── 7. Reflections — motivation, confidence, stress, work style, barriers ───────────────────────
-- Entirely voluntary and never inferred: `raw_text` covers the general dictated-note case, and
-- the four labeled columns exist so a check-in that DOES answer one of them (e.g. a stress rating)
-- can be read as structured data without parsing prose. All optional.
create table if not exists reflections_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  entry_date date not null default current_date,
  motivation text,
  confidence text,
  stress text,
  work_style text,
  barriers text,
  raw_text text,
  source text not null default 'student_reflection' check (source in ('student_entered', 'student_reflection', 'ai_summary', 'external_verified')),
  created_at timestamptz not null default now()
);
create index if not exists reflections_log_user_id_idx on reflections_log(user_id);
alter table reflections_log enable row level security;

-- ── 8. Weekly check-ins ──────────────────────────────────────────────────────────────────────────
-- One row per submitted check-in (a student can submit more than once in a week if something
-- changes; the dashboard banner reads the most recent row's `created_at` against
-- src/lib/studentIntel/checkins.js's cadence to decide whether one is due — there is no unique
-- constraint on week_key because "due" is a UI nudge, never an enforced quota).
create table if not exists checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  week_key text not null,
  raw_text text,
  -- Optional structured deltas the check-in UI may have captured (mood/energy rating, a flag like
  -- {"newActivity":true}) alongside the free text. Schemaless for the same reason admission_intake
  -- and school_context are.
  changes jsonb not null default '{}'::jsonb,
  source text not null default 'student_entered' check (source in ('student_entered', 'student_reflection', 'ai_summary', 'external_verified')),
  created_at timestamptz not null default now()
);
create index if not exists checkins_user_id_idx on checkins(user_id);
create index if not exists checkins_user_created_idx on checkins(user_id, created_at desc);
alter table checkins enable row level security;

-- ── 9. Recommendation / opportunity feedback ────────────────────────────────────────────────────
-- Status a student gives on a recommended activity, program, or opportunity — deliberately wider
-- than the existing pipeline `stages` in opportunityMatch.js's saved prefs, which only tracks
-- programs a student is actively pursuing. This captures the negative and stalled outcomes a
-- recommender needs to stop repeating a suggestion: declined, not interested, too difficult, too
-- expensive, too far away, no longer eligible, needs help, alongside the positive ones.
create table if not exists recommendation_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  item_label text not null,
  -- Free-text pointer back at whatever was recommended (an opportunity catalog id, a program id,
  -- a roadmap action id) — deliberately not a foreign key, because recommendations come from
  -- several different catalogs (src/data/opportunities.js, src/data/opportunityPrograms.js, the
  -- roadmap generator) that do not share one id space.
  item_ref text,
  status text not null check (status in (
    'completed', 'in_progress', 'paused', 'declined', 'not_interested',
    'too_difficult', 'too_expensive', 'too_far_away', 'no_longer_eligible', 'needs_help'
  )),
  note text,
  source text not null default 'student_entered' check (source in ('student_entered', 'student_reflection', 'ai_summary', 'external_verified')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists recommendation_feedback_user_id_idx on recommendation_feedback(user_id);
create index if not exists recommendation_feedback_user_ref_idx on recommendation_feedback(user_id, item_ref);
alter table recommendation_feedback enable row level security;

-- ── 10. Activity role history — leadership progression within an activity ──────────────────────
-- `activities` (0000_base_schema.sql) has always had one `position`/`leadership_role` per row,
-- which cannot represent "started as a member, became section leader junior year, ran the whole
-- club senior year" — three real facts about growth collapsed into whatever the row currently
-- says. Each row here is one role held, with when it started/ended, so progression and outcomes
-- can be read as a timeline instead of inferred from a single label.
create table if not exists activity_role_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  activity_id uuid references activities(id) on delete cascade,
  role text not null,
  started_at date,
  ended_at date,
  outcome text,
  source text not null default 'student_entered' check (source in ('student_entered', 'student_reflection', 'ai_summary', 'external_verified')),
  created_at timestamptz not null default now()
);
create index if not exists activity_role_history_user_id_idx on activity_role_history(user_id);
create index if not exists activity_role_history_activity_id_idx on activity_role_history(activity_id);
alter table activity_role_history enable row level security;
