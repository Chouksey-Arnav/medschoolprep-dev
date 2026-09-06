import React, { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { HeartHandshake, Plus, Trash2, Loader2, TrendingUp, Award } from 'lucide-react';
import { C, glass, glass2, btn, btnSm, inp, R, CC, pill, tint } from '../../lib/theme';
import { listItems, createItem, updateItem, deleteItem } from '../../lib/dataApi';
import { SectionTitle, StatTile } from '../ui/PanelHero';
import Disclosure, { HelpNote } from '../ui/Disclosure';
import { serviceSummary } from '../../lib/studentIntel/serviceAnalytics';
import { SERVICE_HOUR_BENCHMARKS, FRAME_NOTE } from '../../lib/studentIntel/benchmarks';

// ─────────────────────────────────────────────────────────────────────────────
// Self-reported service/volunteer log — deliberately separate from Clinical &
// Shadowing Hours (which carries a supervisor-verification workflow). Every
// entry here is, and is always described as, self-reported: the `service_logs`
// table's own check constraint (supabase/migrations/0026_student_intelligence
// .sql) makes it structurally impossible to write one as externally verified,
// and this component never implies otherwise anywhere in its copy.
// ─────────────────────────────────────────────────────────────────────────────
const emptyForm = { entryDate: '', organization: '', causeArea: '', hours: '', role: '', description: '', impactNote: '', reflection: '' };

export default function ServiceLogPanel({ accent = C.rose, isMobile = false, benchmarkId = 'top20_30', targetDate = null }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setEntries(await listItems('service_logs')); }
    catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const summary = useMemo(() => serviceSummary(entries, { benchmarkId, targetDate }), [entries, benchmarkId, targetDate]);
  const sorted = useMemo(() => [...entries].sort((a, b) => String(b.entry_date).localeCompare(String(a.entry_date))), [entries]);

  function set(field) { return (e) => setForm((f) => ({ ...f, [field]: e.target.value })); }

  async function submit(e) {
    e?.preventDefault();
    const hours = parseFloat(form.hours);
    if (!hours || hours <= 0 || !form.entryDate) { toast.error('Hours and a date are required.'); return; }
    setSaving(true);
    try {
      const row = {
        entry_date: form.entryDate, organization: form.organization.trim() || null,
        cause_area: form.causeArea.trim() || null, hours,
        role: form.role.trim() || null, description: form.description.trim() || null,
        impact_note: form.impactNote.trim() || null, reflection: form.reflection.trim() || null,
      };
      if (editingId) {
        const updated = await updateItem('service_logs', editingId, row);
        setEntries((prev) => prev.map((e2) => (e2.id === editingId ? updated : e2)));
        toast.success('Entry updated.');
      } else {
        const created = await createItem('service_logs', row);
        setEntries((prev) => [...prev, created]);
        toast.success('Logged — self-reported, kept in your own record.');
      }
      setForm(emptyForm);
      setEditingId(null);
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  }

  function startEdit(entry) {
    setEditingId(entry.id);
    setForm({
      entryDate: entry.entry_date || '', organization: entry.organization || '', causeArea: entry.cause_area || '',
      hours: String(entry.hours ?? ''), role: entry.role || '', description: entry.description || '',
      impactNote: entry.impact_note || '', reflection: entry.reflection || '',
    });
  }

  async function removeEntry(id) {
    if (!window.confirm('Delete this service log entry? This cannot be undone.')) return;
    const prev = entries;
    setEntries((es) => es.filter((e) => e.id !== id));
    try { await deleteItem('service_logs', id); } catch (err) { toast.error(err.message); setEntries(prev); }
  }

  const benchmark = summary.benchmark || SERVICE_HOUR_BENCHMARKS[0];
  const targetHours = benchmark?.targetHours || benchmark?.targetHoursMin;

  return (
    <Disclosure id="opportunities-service-log" icon={HeartHandshake} color={accent} m={isMobile}
      title={`Service & volunteer hours (self-reported)${entries.length ? ` — ${Math.round(summary.total)}h logged` : ''}`}
      sub="Your own record of service and volunteer work — never externally verified, always in your own words.">
      <div style={CC({ gap: 12 })}>
        <HelpNote>Every entry here is self-reported by you. This log is never marked as verified by anyone else, and it never will be — it exists so YOU have a complete, honest record.</HelpNote>

        {entries.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: 8 }}>
            <StatTile icon={HeartHandshake} value={`${Math.round(summary.total)}h`} label="total logged" color={accent} />
            <StatTile icon={TrendingUp} value={`${Math.round(summary.consistency.ratio * 100)}%`} label="weeks active" color={C.blue} />
            <StatTile icon={Award} value={summary.causeConcentration.topArea || '—'} label="top cause area" color={C.teal} />
            <StatTile icon={TrendingUp}
              value={summary.pace.monthlyRate ? `~${summary.pace.projectedTotal}h` : '—'}
              label={targetHours ? `projected vs ~${targetHours}h goal` : 'projected pace'} color={C.amber} />
          </div>
        )}
        {entries.length > 0 && <HelpNote>{FRAME_NOTE} {benchmark?.note}</HelpNote>}

        <form onSubmit={submit} style={{ ...glass2({ padding: isMobile ? 12 : 16 }) }}>
          <SectionTitle icon={Plus} color={accent}>{editingId ? 'Edit entry' : 'Log an entry'}</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8 }}>
            <input type="date" style={inp()} value={form.entryDate} onChange={set('entryDate')} required />
            <input style={inp()} placeholder="Hours" type="number" min="0.25" step="0.25" value={form.hours} onChange={set('hours')} required />
            <input style={inp()} placeholder="Organization / initiative" value={form.organization} onChange={set('organization')} />
            <input style={inp()} placeholder="Cause area (e.g. food insecurity, elder care)" value={form.causeArea} onChange={set('causeArea')} />
            <input style={inp()} placeholder="Your role" value={form.role} onChange={set('role')} />
            <input style={inp()} placeholder="People/impact served, if known" value={form.impactNote} onChange={set('impactNote')} />
          </div>
          <textarea style={{ ...inp(), minHeight: 60, resize: 'vertical', marginTop: 8 }}
            placeholder="What did you actually do?" value={form.description} onChange={set('description')} />
          <textarea style={{ ...inp(), minHeight: 60, resize: 'vertical', marginTop: 8 }}
            placeholder="Reflection — what did this mean to you? (optional)" value={form.reflection} onChange={set('reflection')} />
          <div style={R({ gap: 8, marginTop: 8 })}>
            <button type="submit" style={btn(accent, { opacity: saving ? 0.6 : 1 })} disabled={saving}>
              {saving ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}{editingId ? 'Save changes' : 'Add entry'}
            </button>
            {editingId && (
              <button type="button" style={btnSm(C.s3)} onClick={() => { setEditingId(null); setForm(emptyForm); }}>Cancel</button>
            )}
          </div>
        </form>

        {loading ? (
          <div style={{ fontSize: 12, color: C.t3 }}>Loading your log…</div>
        ) : sorted.length > 0 ? (
          <div style={CC({ gap: 8 })}>
            {sorted.map((entry) => (
              <div key={entry.id} style={{ ...glass2({ padding: 12 }), borderLeft: `3px solid ${tint(accent, 0.5)}` }}>
                <div style={R({ gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' })}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: C.t1 }}>
                    {entry.organization || 'Unspecified organization'} — {entry.hours}h
                  </span>
                  <span style={{ fontSize: 10.5, color: C.t3, fontFamily: C.FM }}>{entry.entry_date}</span>
                </div>
                <div style={R({ gap: 8, flexWrap: 'wrap', marginTop: 4 })}>
                  {entry.cause_area && <span style={pill(tint(C.teal, 0.14), C.teal, { fontSize: 10 })}>{entry.cause_area}</span>}
                  {entry.role && <span style={pill(C.s3, C.t3, { fontSize: 10 })}>{entry.role}</span>}
                </div>
                {entry.description && <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.5, marginTop: 8 }}>{entry.description}</div>}
                {entry.reflection && <div style={{ fontSize: 11.5, color: C.t3, lineHeight: 1.5, marginTop: 4, fontStyle: 'italic' }}>"{entry.reflection}"</div>}
                <div style={R({ gap: 8, marginTop: 8 })}>
                  <button style={btnSm(C.s3, { fontSize: 11 })} onClick={() => startEdit(entry)}>Edit</button>
                  <span style={{ flex: 1 }} />
                  <button style={btnSm(C.roseDim, { color: C.rose, fontSize: 11, padding: '4px 8px' })}
                    onClick={() => removeEntry(entry.id)} aria-label="Delete entry"><Trash2 size={11} /></button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: C.t3 }}>No service hours logged yet — add your first entry above.</div>
        )}
      </div>
    </Disclosure>
  );
}
