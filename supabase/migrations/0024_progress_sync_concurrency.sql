-- 0024_progress_sync_concurrency.sql
--
-- Three defects in cross-device progress sync, all in the same write path, all
-- with the same shape: the server treats one device's snapshot as the truth about
-- the whole account instead of as one participant's report.
--
-- This is the "it shows something different on my phone than on my computer" bug,
-- and it is not one bug.
--
--
-- ── 1. The snapshot write is a blind overwrite, so devices clobber each other ──
--
-- bump_progress_counters (0004) upserts with `data = excluded.data`. There is no
-- version check of any kind: whichever PUT lands last wins the entire account,
-- wholesale, including every table it was not carrying news about.
--
-- The client only pulls at mount (src/App.jsx's loadFromDb), so a tab that has
-- been open since this morning holds this morning's snapshot all day. Worse,
-- src/lib/progressSync.js's installLifecycleFlush pushes on `visibilitychange`
-- and `pagehide` unconditionally — no local change required. So:
--
--     09:00  phone opens the app, pulls snapshot S0
--     10:00  laptop opens the app, pulls snapshot S0
--     10:30  laptop finishes five lessons, pushes S1. Server = S1.
--     18:00  student picks the phone up, and the act of the phone's tab
--            going to the background pushes S0. Server = S0.
--
-- The five lessons are gone, and nothing anywhere reported an error — from the
-- phone's point of view the sync succeeded, because it did.
--
-- Fixed here with ordinary optimistic concurrency. progress_sync gains a `rev`
-- that increments on every accepted write; a client sends the rev it last saw as
-- p_base_rev; a mismatch means somebody else wrote in the meantime and the write
-- is REFUSED rather than applied. The refusal hands the caller the current server
-- snapshot so it can merge and retry — src/lib/db.js's applyRemoteSnapshot is
-- already a real two-sided merge written for exactly this, it simply was never
-- being given the chance to run.
--
--
-- ── 2. Counter deltas are added on top of the delta's own source ──────────────
--
-- This one silently doubles XP.
--
-- 0004's design is sound and its header describes it correctly: counters are
-- server-accumulated, each device reports only its increment since its own last
-- confirmed sync (db.js's claimSyncDelta), and the server ADDS. But the
-- implementation reads the value it adds to AFTER the overwrite above:
--
--     insert ... on conflict do update set data = excluded.data;   -- user.xp := 120
--     select data into current_data ...;                           -- current_data.user.xp = 120
--     current_data := jsonb_set(..., current_data.user.xp + delta); -- 120 + 20 = 140
--
-- The snapshot's own `user.xp` is this device's absolute total, which ALREADY
-- contains the increment being reported alongside it. Server at 100, student
-- earns 20, server stores 140. Then absorbAuthoritativeCounters pulls 140 back
-- down as authoritative and re-anchors the baseline to it, so the error is
-- banked rather than corrected, and the next gain doubles from there.
--
-- The same overwrite loses counters in the other direction whenever a device has
-- no delta to report: a stale snapshot's `user.xp` of 100 flatly replaces a
-- server total of 500.
--
-- Fixed by making the counter fields mean what 0004 says they mean. The four of
-- them are never taken from the incoming snapshot at all. They are carried
-- forward from the row's own pre-write value and the delta is added to that,
-- which is the only base that is actually authoritative.
--
-- The one exception is a row that does not exist yet: with no server history,
-- the client's absolute IS the account's history, so it is taken as the base and
-- the delta (which is a subset of it — delta = local − baseline, and baseline is
-- never negative) is not added again.
--
-- No attempt is made to repair already-inflated totals. There is no record of
-- which portion of a stored total is real, so any correction would be a guess,
-- and guessing downward on a student's XP is worse than carrying the error. This
-- stops the inflation; it does not rewrite history.
--
--
-- ── 3. The RPC returns the entire snapshot on every push ──────────────────────
--
-- bump_progress_counters returns `current_data` — the whole account snapshot —
-- and api/progress-sync.js then reads exactly one field off it (`.user`). Every
-- push therefore pays for the snapshot twice, once up and once back down, for a
-- few counters. The success path here returns just the counters.
--
-- The conflict path is the deliberate exception: there the caller genuinely needs
-- the server's snapshot, because it is about to merge against it.

-- ── rev ──────────────────────────────────────────────────────────────────────
-- Existing rows start at 1 rather than 0 so that 0 keeps a single unambiguous
-- meaning inside the function below: "no row has ever been written for this
-- user". A client that has not pulled since this migration sends no base rev at
-- all and is handled as the legacy case (see p_base_rev's contract).
alter table progress_sync add column if not exists rev bigint not null default 0;
update progress_sync set rev = 1 where rev = 0;

-- ── The write path ───────────────────────────────────────────────────────────
-- Replaces bump_progress_counters as the endpoint api/progress-sync.js calls.
--
-- p_base_rev contract:
--   a value  — "I last saw rev N". Refused with status='conflict' if the row has
--              moved on since. This is what every current client sends.
--   null     — "I have no base". Accepted unconditionally, which is what a first
--              push and any client older than this migration needs. Such a push
--              can still clobber a concurrent write; that is strictly the old
--              behaviour, preserved only so a deploy does not break tabs that are
--              already open, and it stops applying to any tab that reloads.
create or replace function merge_progress_snapshot(
  p_user_id  uuid,
  p_data     jsonb,
  p_deltas   jsonb,
  p_base_rev bigint
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  -- The four counters db.js accumulates via claim/commit deltas. Kept as a list
  -- rather than as columns so adding a fifth needs no migration, matching the
  -- reason 0004 made p_deltas a map.
  counter_keys constant text[] := array['xp', 'aiChatCount', 'interviewCount', 'cardReviewCount'];
  row_existed  boolean;
  cur_rev      bigint;
  cur_data     jsonb;
  next_data    jsonb;
  next_rev     bigint;
  k            text;
  base         numeric;
begin
  -- FOR UPDATE holds the row for the rest of this transaction, so two concurrent
  -- pushes for one user serialize here instead of racing read-then-write. This is
  -- also what makes the rev check below sound rather than advisory.
  select rev, data into cur_rev, cur_data
    from progress_sync
   where user_id = p_user_id
     for update;
  row_existed := found;

  if not row_existed then
    cur_rev  := 0;
    cur_data := '{}'::jsonb;
  elsif p_base_rev is not null and p_base_rev <> cur_rev then
    -- Somebody else wrote since this caller last looked. Refuse, and hand back
    -- what is actually there so the caller can merge against it and come again.
    return jsonb_build_object('status', 'conflict', 'rev', cur_rev, 'data', cur_data);
  end if;

  next_data := coalesce(p_data, cur_data);

  -- jsonb_set cannot create an intermediate level, so a snapshot whose `user` is
  -- absent or JSON null (buildSyncSnapshot emits null when the device has no
  -- local profile) would silently swallow every counter write below.
  if jsonb_typeof(next_data -> 'user') is distinct from 'object' then
    next_data := jsonb_set(next_data, '{user}', '{}'::jsonb, true);
  end if;

  foreach k in array counter_keys loop
    if row_existed then
      -- Authoritative base: the row's own value BEFORE this write, never the
      -- absolute the incoming snapshot happens to be carrying. Defect 2.
      base := coalesce((cur_data #>> array['user', k])::numeric, 0)
            + coalesce((p_deltas ->> k)::numeric, 0);
    else
      -- First ever row: the client's absolute is the whole history, and the
      -- delta is already inside it.
      base := coalesce((next_data #>> array['user', k])::numeric, 0);
    end if;
    next_data := jsonb_set(next_data, array['user', k], to_jsonb(base), true);
  end loop;

  next_rev := cur_rev + 1;

  insert into progress_sync (user_id, data, rev, updated_at)
  values (p_user_id, next_data, next_rev, now())
  on conflict (user_id) do update
    set data = excluded.data, rev = excluded.rev, updated_at = excluded.updated_at;

  -- Counters only. The caller already has everything else — it is what it just
  -- sent. Defect 3.
  return jsonb_build_object('status', 'ok', 'rev', next_rev, 'user', next_data -> 'user');
end;
$$;

-- ── EXECUTE grants ───────────────────────────────────────────────────────────
-- The same lockdown 0008 applied to every other function that trusts a user id in
-- its arguments, and for the same reason: this one upserts an arbitrary account's
-- entire progress snapshot, Postgres grants EXECUTE to PUBLIC by default, and
-- Supabase publishes every public-schema function at /rest/v1/rpc/<name> — where
-- the anon key that ships inside the browser bundle would reach it.
--
-- Written as 0008 writes it, rather than as three bare REVOKE lines, for two
-- reasons that a plain version of this got wrong:
--
--   • `anon` and `authenticated` are Supabase inventions. This chain is also
--     applied to a bare PostgreSQL by scripts/verifyMigrations.mjs (and by the
--     "Migrations apply, re-apply, and serialize" CI job), where revoking from a
--     role that does not exist is a hard error and fails the whole migration.
--
--   • REVOKE FROM PUBLIC is the load-bearing line — revoking from anon and
--     authenticated individually would leave the default PUBLIC grant sitting
--     behind them — but it also takes the grant away from service_role, which is
--     the one role that must keep it: every /api/* handler runs as service_role
--     (api/_lib/supabaseAdmin.js). Supabase's default privileges happen to grant
--     it back on newly created functions, but relying on that is relying on a
--     setting this migration does not control. State it.
do $$
declare
  fn   constant text := 'public.merge_progress_snapshot(uuid,jsonb,jsonb,bigint)';
  role text;
begin
  if to_regprocedure(fn) is null then return; end if;

  execute format('revoke all on function %s from public', fn);

  foreach role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = role) then
      execute format('revoke all on function %s from %I', fn, role);
    end if;
  end loop;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute format('grant execute on function %s to service_role', fn);
  end if;
end $$;

-- bump_progress_counters is deliberately left in place rather than dropped: a
-- deploy is not instantaneous, and a serverless instance still running the old
-- api/progress-sync.js must keep working until it drains. Nothing calls it after
-- that. It should be dropped in a later migration, once no running code refers to
-- it — do not call it from new code, it carries defects 1–3 above by construction.
