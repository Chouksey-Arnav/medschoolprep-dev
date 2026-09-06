// /api/progress-sync — one JSON snapshot per user of everything that used to live only in the
// browser's local IndexedDB (XP, streak, quiz scores, flashcard/FSRS state, achievements,
// pathway progress, unit mastery, coach chat threads, etc). GET pulls the latest snapshot down
// (e.g. on sign-in from a new browser); PUT upserts it (the client debounces this after local
// writes — see src/lib/progressSync.js). Never includes the local-only studyEvents log.
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js';
import { requireStudent } from './_lib/session.js';

// Generous but bounded — a pathological payload (e.g. a corrupted client loop) shouldn't be
// able to blow up storage or the response size indefinitely.
const MAX_BYTES = 2 * 1024 * 1024;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await requireStudent(req, res);
  if (!user) return;

  const supabase = getSupabaseAdmin();

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('progress_sync')
        .select('data, rev, updated_at')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      // `rev` is what makes the next PUT safe: the client holds onto it and sends
      // it back as its base, so the server can tell "this device has seen the
      // current state" apart from "this device is about to overwrite work it has
      // never seen". See supabase/migrations/0024_progress_sync_concurrency.sql.
      return res.status(200).json({
        data: data?.data || null,
        rev: data?.rev ?? null,
        updatedAt: data?.updated_at || null,
      });
    }

    if (req.method === 'PUT') {
      let body;
      try {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      } catch {
        return res.status(400).json({ error: 'Invalid JSON body.' });
      }
      const payload = body?.data;
      if (!payload || typeof payload !== 'object') return res.status(400).json({ error: 'Missing data.' });
      if (JSON.stringify(payload).length > MAX_BYTES) return res.status(413).json({ error: 'Snapshot too large.' });

      // xp/aiChatCount/interviewCount/cardReviewCount travel as an additive delta
      // (`counterDeltas`), not as part of the plain overwrite the rest of this payload gets — see
      // src/lib/db.js's mergeUserRecord/claimSyncDelta for why a blind overwrite (or a
      // client-computed Math.max merge) silently lost cross-device progress on these fields.
      // Stripped off before storing: it's a transport-only instruction, not part of the snapshot.
      const counterDeltas = payload.user?.counterDeltas || null;
      if (payload.user && 'counterDeltas' in payload.user) {
        const { counterDeltas: _drop, ...restUser } = payload.user;
        payload.user = restUser;
      }

      // The rev this client last saw. Absent means "no base" — a first push, or a
      // tab still running a build from before this shipped — which the function
      // accepts unconditionally, exactly as the old endpoint always did.
      const baseRev = Number.isFinite(Number(body?.baseRev)) ? Number(body.baseRev) : null;

      // merge_progress_snapshot is a single atomic Postgres function call (see
      // supabase/migrations/0024_progress_sync_concurrency.sql). Within one row-locked
      // transaction it checks the caller's base rev, upserts the snapshot, and additively
      // applies counterDeltas on top of the row's OWN pre-write counters — so two concurrent
      // pushes for the same user can neither race a read-then-write from this handler nor
      // silently overwrite each other's work.
      //
      // It replaces bump_progress_counters, which did the upsert with no version check at all
      // (last writer took the whole account) and added each delta on top of the absolute total
      // the same snapshot was carrying (doubling every XP gain). That migration's header has
      // the full account of both.
      const { data: result, error } = await supabase.rpc('merge_progress_snapshot', {
        p_user_id: user.id,
        p_data: payload,
        p_deltas: counterDeltas,
        p_base_rev: baseRev,
      });
      if (error) throw error;

      // Refused, not failed. Another device wrote since this one last looked, so this snapshot
      // would have erased whatever that was. 409 with the server's current state and rev; the
      // client merges it into local Dexie (applyRemoteSnapshot) and pushes again from the new
      // base. See src/lib/progressSync.js.
      if (result?.status === 'conflict') {
        return res.status(409).json({
          error: 'Another device has newer progress.',
          reason: 'stale_rev',
          rev: result.rev ?? null,
          data: result.data || null,
        });
      }

      return res.status(200).json({
        updatedAt: new Date().toISOString(),
        rev: result?.rev ?? null,
        counters: result?.user || null,
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('progress-sync error:', err);
    return res.status(500).json({ error: 'Request failed.' });
  }
}
