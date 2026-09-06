// /api/sync-state — "has anything changed?", and nothing else.
//
// Two devices signed into the same account and both left open used to stay divergent
// indefinitely: progress_sync only learns about the other device by pushing (or by a
// backgrounded tab being foregrounded), and the Portfolio snapshot — colleges, activities,
// service_logs, the whole 0026 student-intelligence set — is fetched once and cached with
// nothing to invalidate it. See supabase/migrations/0027_live_sync_version.sql for why the
// signal has to come back through our own authenticated API rather than a browser Realtime
// subscription (custom auth, no auth.uid(), RLS-on-with-no-policy).
//
// This endpoint is polled every few seconds by every open tab, so it carries no payload at
// all — two primary-key lookups returning three scalars. The client compares them against
// what it last saw and decides for itself whether to do the expensive thing
// (progressSync.reconcileNow, or a Portfolio refetch). See src/lib/liveSync.js.
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js';
import { requireStudent } from './_lib/session.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await requireStudent(req, res);
  if (!user) return;

  const supabase = getSupabaseAdmin();

  try {
    // Both reads are issued together rather than awaited in sequence: this handler runs on
    // every poll from every open tab, so its latency is the floor on how live sync can feel.
    const [progress, version] = await Promise.all([
      supabase.from('progress_sync').select('rev, updated_at').eq('user_id', user.id).maybeSingle(),
      supabase.from('user_data_version').select('version').eq('user_id', user.id).maybeSingle(),
    ]);
    if (progress.error) throw progress.error;
    if (version.error) throw version.error;

    return res.status(200).json({
      // null, not 0, when this account has never pushed: the client treats null as "no
      // baseline yet" exactly as api/progress-sync.js's GET does, and a 0 would read as a
      // real revision that every later rev appears to advance past.
      rev: progress.data?.rev ?? null,
      // 0 is right here, though. The row is created lazily by the trigger on the account's
      // first write, so its absence means "nothing has ever changed" rather than "unknown".
      dataVersion: version.data?.version ?? 0,
      updatedAt: progress.data?.updated_at || null,
    });
  } catch (err) {
    console.error('sync-state error:', err);
    return res.status(500).json({ error: 'Request failed.' });
  }
}
