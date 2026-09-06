import React, { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { CalendarCheck2, Check, Loader2, X } from 'lucide-react';
import { C, glass, glass2, btn, btnSm, inp, R, CC, tint } from '../../lib/theme';
import { listItems, createItem } from '../../lib/dataApi';
import Disclosure, { HelpNote } from '../ui/Disclosure';
import { isCheckinDue, currentWeekKey } from '../../lib/studentIntel/checkins';
import useRemoteDataRefresh from '../../lib/useRemoteDataRefresh';

// ─────────────────────────────────────────────────────────────────────────────
// Weekly check-in — brief, in-app only (no email/push, ever), and always
// skippable. "Due" is a nudge computed from how long it's been since the last
// submitted check-in (see src/lib/studentIntel/checkins.js); skipping just
// means the banner returns next time the student opens this tab, never a
// notification chasing them elsewhere.
// ─────────────────────────────────────────────────────────────────────────────
const PROMPTS = [
  'New grades, activities, awards, or applications since last time?',
  'Any changes to your goals, workload, or how you\'re feeling about things?',
  'Anything you want Medabrain to know before it suggests what to work on next?',
];

export default function WeeklyCheckin({ accent = C.blue, isMobile = false }) {
  const [checkins, setCheckins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  // `quiet` matters more here than elsewhere: this component renders nothing at all while
  // `loading` is true, so a background refresh that raised the flag would make the whole nudge
  // vanish and reappear.
  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try { setCheckins(await listItems('checkins')); }
    catch { /* silent — a missed load just means the nudge doesn't show this visit */ }
    finally { if (!quiet) setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  // A check-in written on another device should retire this week's nudge everywhere, not just
  // where it was written.
  useRemoteDataRefresh(useCallback(() => load({ quiet: true }), [load]));

  const due = useMemo(() => !loading && isCheckinDue(checkins), [loading, checkins]);

  async function submit() {
    const text = draft.trim();
    if (!text) return;
    setSaving(true);
    try {
      const row = await createItem('checkins', { week_key: currentWeekKey(), raw_text: text });
      setCheckins((prev) => [row, ...prev]);
      setDraft('');
      setOpen(false);
      toast.success('Thanks — noted for this week.');
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  }

  if (loading || dismissed) return null;

  if (!open) {
    return due ? (
      <div style={{
        ...glass({ padding: isMobile ? 12 : 16 }),
        background: `linear-gradient(120deg,${tint(accent, 0.1)},transparent 60%)`,
        border: `1px solid ${tint(accent, 0.28)}`,
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <CalendarCheck2 size={17} color={accent} style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.t1 }}>Quick weekly check-in?</div>
          <div style={{ fontSize: 11.5, color: C.t2, marginTop: 4 }}>Thirty seconds — anything changed since last time. In-app only, never emailed or pushed.</div>
        </div>
        <button style={btn(accent, { fontSize: 12, padding: '8px 16px' })} onClick={() => setOpen(true)}>Answer now</button>
        <button style={btnSm(C.s3, { fontSize: 11 })} onClick={() => setDismissed(true)}>Not now</button>
      </div>
    ) : null;
  }

  return (
    <div style={glass2({ padding: isMobile ? 12 : 16 })}>
      <div style={R({ gap: 8, justifyContent: 'space-between', marginBottom: 8 })}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.t1 }}>This week's check-in</div>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.t3 }} onClick={() => setOpen(false)} aria-label="Close"><X size={14} /></button>
      </div>
      <ul style={{ margin: '0 0 8px', paddingLeft: 16, fontSize: 11.5, color: C.t3, lineHeight: 1.6 }}>
        {PROMPTS.map((p) => <li key={p}>{p}</li>)}
      </ul>
      <textarea style={{ ...inp(), minHeight: 100, resize: 'vertical', lineHeight: 1.55 }}
        value={draft} onChange={(e) => setDraft(e.target.value)}
        placeholder="Bullet points, a paragraph, or a dictated-style ramble — whatever's fastest for you." />
      <div style={R({ gap: 8, marginTop: 8 })}>
        <button style={btn(accent, { opacity: draft.trim() && !saving ? 1 : 0.5 })} disabled={!draft.trim() || saving} onClick={submit}>
          {saving ? <Loader2 size={14} className="spin" /> : <Check size={14} />}Submit
        </button>
        <button style={btnSm(C.s3, { fontSize: 12 })} onClick={() => setOpen(false)}>Skip this week</button>
      </div>
    </div>
  );
}

/** Past check-ins, as a small collapsible history — separate export so a page can opt in. */
export function WeeklyCheckinHistory({ accent = C.blue, isMobile = false }) {
  const [checkins, setCheckins] = useState([]);
  const load = useCallback(() => { listItems('checkins').then(setCheckins).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);
  useRemoteDataRefresh(load);
  if (!checkins.length) return null;
  const sorted = [...checkins].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return (
    <Disclosure id="checkin-history" icon={CalendarCheck2} color={accent} m={isMobile}
      title={`Past check-ins (${sorted.length})`} sub="Nobody but you and Medabrain sees these.">
      <div style={CC({ gap: 8 })}>
        {sorted.slice(0, 20).map((c) => (
          <div key={c.id} style={{ ...glass2({ padding: 12 }), fontSize: 12, color: C.t2, lineHeight: 1.5 }}>
            <div style={{ fontSize: 10, color: C.t3, fontFamily: C.FM, marginBottom: 4 }}>
              {new Date(c.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{c.raw_text}</div>
          </div>
        ))}
        <HelpNote>Medabrain reads your most recent check-in as current — nothing from an older one overrides what you just said.</HelpNote>
      </div>
    </Disclosure>
  );
}
