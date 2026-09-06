-- 0027_live_sync_version.sql
--
-- One number per account that changes whenever anything that account owns changes.
--
-- ── The problem ────────────────────────────────────────────────────────────────────────────────
-- Two sync mechanisms already exist and neither one tells a *second* device that something moved:
--
--   1. progress_sync (0003/0024) carries study progress as a jsonb blob with a `rev` counter and
--      real optimistic concurrency. It is excellent at refusing a write that would clobber another
--      device — but a device only ever LEARNS about the other device by trying to push, or by
--      being backgrounded and foregrounded (src/lib/progressSync.js's reconcileNow). A phone and a
--      laptop both sitting open, both idle, stay silently divergent for as long as nobody touches
--      them.
--   2. Everything else — colleges, activities, service_logs, the whole 0026 student-intelligence
--      set — is written straight to Postgres through api/data/[resource].js. That path is
--      server-authoritative and so is never *wrong*, but the client caches it (the Portfolio
--      snapshot) and has no idea when it went stale.
--
-- ── Why a counter and not Supabase Realtime ────────────────────────────────────────────────────
-- Realtime from the browser would be the obvious answer and it is not available to us. Auth here
-- is custom (app_users/sessions, see the AUTH MODEL note in 0000_base_schema.sql): there is no
-- auth.uid(), every table in this schema is RLS-on-with-no-policy, and all scoping happens in
-- application code behind the service-role key. A browser subscription authenticates with the
-- anon key, so making one work would mean opening these tables to anon — i.e. exposing every
-- student's row to every other student. That trade is not on the table. The signal therefore has
-- to come back through our own authenticated API, and this counter is what that endpoint reads.
--
-- ── Why a trigger and not a bump in the API layer ──────────────────────────────────────────────
-- api/data/[resource].js is a single generic CRUD handler, so a bump there would cover today's
-- writes. It would not cover the write paths that bypass it (api/roadmap.js, api/master-plan.js,
-- api/lesson-feedback.js all write their own tables), a future handler whose author forgets, or a
-- correction made by hand in the SQL editor. A trigger cannot be forgotten. The cost is one
-- upsert of one narrow row per write, which is far cheaper than a client that trusts a stale
-- cache.
--
-- Deliberately NOT counted here:
--   * progress_sync — it has `rev` already, and it is written on every debounced push, so bumping
--     this counter from it would make every device refetch its whole Portfolio every few seconds
--     to learn about a change it already had.
--   * sessions, otp_codes, login_attempts, email_verifications — sign-in bookkeeping, not student
--     data. Signing in on a second device is not a change the first device needs to redraw for.
--   * safety_events — nothing client-facing reads it (see 0023), so a bump would be pure noise.

create table if not exists user_data_version (
  user_id uuid primary key references app_users(id) on delete cascade,
  version bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table user_data_version enable row level security;

-- security definer so the trigger can write user_data_version regardless of which role performed
-- the underlying write, and an empty search_path with fully-qualified names so the function cannot
-- be captured by a shadowing object — the same hardening 0008/0016 applied to this schema's other
-- functions.
create or replace function public.bump_user_data_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
begin
  uid := coalesce(
    case when TG_OP = 'DELETE' then null else (to_jsonb(NEW) ->> 'user_id')::uuid end,
    case when TG_OP = 'INSERT' then null else (to_jsonb(OLD) ->> 'user_id')::uuid end
  );

  if uid is not null then
    insert into public.user_data_version as v (user_id, version, updated_at)
    values (uid, 1, now())
    on conflict (user_id) do update
      set version = v.version + 1,
          updated_at = now();
  end if;

  return null;  -- AFTER trigger; the return value is discarded
end;
$$;

revoke all on function public.bump_user_data_version() from public, anon, authenticated;

-- Attach to every per-user table that a client actually reads back, discovered rather than listed
-- so a table added later is covered by re-running this block instead of being silently missed.
do $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'user_id' and a.attnum > 0 and not a.attisdropped
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname not in (
        'user_data_version', 'progress_sync', 'sessions', 'otp_codes',
        'login_attempts', 'email_verifications', 'safety_events', 'parent_link_events'
      )
  loop
    execute format(
      'drop trigger if exists %I on public.%I',
      't_bump_data_version_' || t.relname, t.relname
    );
    execute format(
      'create trigger %I after insert or update or delete on public.%I
         for each row execute function public.bump_user_data_version()',
      't_bump_data_version_' || t.relname, t.relname
    );
  end loop;
end $$;
