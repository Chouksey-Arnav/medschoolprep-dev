import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { NotebookPen, Sparkles, Loader2, Check, Trash2, Pencil } from 'lucide-react';
import { C, glass2, btn, btnSm, inp, R, CC, pill, tint } from '../../lib/theme';
import { listItems, createItem, updateItem, deleteItem } from '../../lib/dataApi';
import { SectionTitle } from '../ui/PanelHero';
import Disclosure, { HelpNote } from '../ui/Disclosure';
import useRemoteDataRefresh from '../../lib/useRemoteDataRefresh';
import { extractFromNote } from '../../lib/studentIntel/extract';

// ─────────────────────────────────────────────────────────────────────────────
// Quick capture — free-form notes, paste-a-list, dictated-style entries.
//
// Every note's `raw_text` is written once on create and never edited again by
// this component (the API layer independently refuses that PATCH — see
// IMMUTABLE_ON_PATCH in api/data/[resource].js). What a student CAN edit or
// delete is the lightweight structure a background AI pass pulls out of it —
// shown as a small "what we picked up from this" chip row they can correct or
// dismiss. A failed or skipped extraction is not an error state; the note is
// still fully saved and useful as-is.
// ─────────────────────────────────────────────────────────────────────────────
export default function QuickCapture({ accent = C.violet, isMobile = false, defaultOpen = false }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  // `quiet` keeps a refresh triggered by another device from swapping the visible notes for a
  // loading line, or from raising a toast about a fetch the student never initiated.
  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try { setNotes(await listItems('quick_notes')); }
    catch (err) { if (!quiet) toast.error(err.message); }
    finally { if (!quiet) setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useRemoteDataRefresh(useCallback(() => load({ quiet: true }), [load]));

  async function save() {
    const text = draft.trim();
    if (!text) return;
    setSaving(true);
    try {
      const row = await createItem('quick_notes', { raw_text: text });
      setNotes((prev) => [row, ...prev]);
      setDraft('');
      toast.success('Saved, in your own words.');
      // Fire-and-forget: a lightweight extraction pass runs after save so the note is never lost
      // to a slow or failed AI call. Updates the SAME row's `extracted`/`extraction_status`
      // columns only — raw_text is immutable from here on.
      extractFromNote(text).then((extracted) => {
        if (!extracted) return;
        updateItem('quick_notes', row.id, { extracted, extraction_status: 'applied' })
          .then((updated) => setNotes((prev) => prev.map((n) => (n.id === row.id ? updated : n))))
          .catch(() => {});
      });
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  }

  async function dismissExtraction(note) {
    try {
      const updated = await updateItem('quick_notes', note.id, { extraction_status: 'skipped' });
      setNotes((prev) => prev.map((n) => (n.id === note.id ? updated : n)));
    } catch (err) { toast.error(err.message); }
  }

  async function removeNote(id) {
    if (!window.confirm('Delete this note? This cannot be undone.')) return;
    const prev = notes;
    setNotes((ns) => ns.filter((n) => n.id !== id));
    try { await deleteItem('quick_notes', id); } catch (err) { toast.error(err.message); setNotes(prev); }
  }

  return (
    <Disclosure id="quick-capture" icon={NotebookPen} color={accent} m={isMobile} defaultOpen={defaultOpen}
      title="Quick capture — type or paste anything"
      sub="Grades, a new activity, an award, a change of plans, a dictated brain-dump — write it here in your own words and we'll try to tag it for you.">
      <div style={CC({ gap: 12 })}>
        <div style={glass2({ padding: isMobile ? 12 : 16 })}>
          <textarea style={{ ...inp(), minHeight: 100, resize: 'vertical', lineHeight: 1.55 }}
            value={draft} onChange={(e) => setDraft(e.target.value)}
            placeholder='e.g. "Volunteered at the county food bank again today, 3 hours, been going every other Saturday since March" or paste a whole list of activities at once.' />
          <div style={R({ gap: 8, marginTop: 8 })}>
            <button style={btn(accent, { opacity: draft.trim() && !saving ? 1 : 0.5 })}
              disabled={!draft.trim() || saving} onClick={save}>
              {saving ? <Loader2 size={14} className="spin" /> : <Check size={14} />}Save this
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ fontSize: 12, color: C.t3 }}>Loading your notes…</div>
        ) : notes.length > 0 && (
          <div style={CC({ gap: 8 })}>
            {notes.slice(0, 20).map((note) => (
              <div key={note.id} style={{ ...glass2({ padding: 12 }), borderLeft: `3px solid ${tint(accent, 0.5)}` }}>
                <div style={{ fontSize: 12.5, color: C.t2, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{note.raw_text}</div>
                {note.extracted && note.extraction_status !== 'skipped' && (
                  <div style={R({ gap: 8, marginTop: 8, flexWrap: 'wrap' })}>
                    <Sparkles size={11} color={accent} />
                    {Object.entries(note.extracted).filter(([k]) => k !== 'note_summary').map(([k, v]) => (
                      v ? <span key={k} style={pill(tint(accent, 0.14), accent, { fontSize: 9.5 })}>{k.replace(/_/g, ' ')}: {String(v).slice(0, 40)}</span> : null
                    ))}
                    <button style={btnSm(C.s3, { fontSize: 9.5, padding: '4px 8px' })} onClick={() => dismissExtraction(note)}>
                      <Pencil size={9} /> Not quite right — dismiss
                    </button>
                  </div>
                )}
                <div style={R({ gap: 8, marginTop: 8 })}>
                  <span style={{ fontSize: 10, color: C.t3, fontFamily: C.FM }}>
                    {new Date(note.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                  <span style={{ flex: 1 }} />
                  <button style={btnSm(C.roseDim, { color: C.rose, fontSize: 11, padding: '4px 8px' })}
                    onClick={() => removeNote(note.id)} aria-label="Delete note"><Trash2 size={11} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
        <HelpNote>What you actually typed is never edited or overwritten — only the little tags picked up from it can be dismissed. This feeds Medabrain's memory of you, in small relevant pieces, never as a full dump.</HelpNote>
      </div>
    </Disclosure>
  );
}
