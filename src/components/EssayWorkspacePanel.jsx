import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  Plus, Trash2, FileText, ScrollText, PenLine, CheckCircle2, Sparkles, Loader2,
  NotebookPen, Compass, Lock,
} from 'lucide-react';
import { C, glass, glass2, btn, btnSm, inp, lbl, R, CC, G, pill, tint } from '../lib/theme';
import { listItems, createItem, updateItem, deleteItem } from '../lib/dataApi';
import PanelHero, { SectionTitle, StatTile } from './ui/PanelHero';
import Disclosure, { HelpNote, HowItWorks } from './ui/Disclosure';
import { showMedabrainToast } from '../lib/medabrainComments';
import { getCached, setCached, dailyKey } from '../lib/aiCache';
import { renderMarkdown } from '../lib/renderMarkdown';
import { getWhyMedicineLabel, getDreamRoleLabel } from '../lib/studentProfile';
import { buildEssayCriticPrompt, critiqueEssay } from '../lib/essayCritique';
// Critique passes are counted per essay: it is the metering point when this
// product has a paid tier, and — today — it is what lets essay mode notice a
// student on their fifth pass of a draft that has not moved. See
// src/lib/essayCritiquePasses.js.
import { recordCritiquePass, critiquePassCount } from '../lib/essayCritiquePasses';
import { effectiveGradeStage } from '../lib/timeline';
import { isEssayPreviewGrade, trackerUnlockLabel, WHY_PATHWAY } from '../lib/healthEssays';
import { collectProgramPrompts, summarizeProgramPrompts } from '../lib/programEssayPrompts';
import { buildVersionArc, summarizeArcForPrompt } from '../lib/essayVersions';
import EssayCritique from './EssayCritique';
import SupplementalEssaysCard from './SupplementalEssaysCard';
import AiPolicyNotice from './portfolio/AiPolicyNotice';
// The Socratic half of essay help — questions and structural feedback, routed
// through purpose:'essaycoach' so the server-side prose guard applies. See
// src/lib/essayMode.js and api/_lib/essayProseGuard.js.
import EssayModeChat from './portfolio/EssayModeChat';
import WhyPathwayDoc from './portfolio/WhyPathwayDoc';
import ReflectionJournal from './portfolio/ReflectionJournal';
import ProgramPromptsCard from './portfolio/ProgramPromptsCard';
import EssayVersionHistory, { VersionLabelFields } from './portfolio/EssayVersionHistory';

// ─────────────────────────────────────────────────────────────────────────────
// ESSAYS — the health-pathway workspace.
//
// ── What this used to be, and why that was wrong ────────────────────────────
// A generic essay tracker: a list of drafts, a status ladder, a word count, a
// critique pass. Everything in it was correct and none of it was specific to
// the students using it. Three things were missing, and each one is the kind of
// gap a general tool cannot close because it does not know what the student is
// applying to:
//
//  1. THE ESSAY THAT ACTUALLY DECIDES THESE ADMISSIONS was not modeled at all.
//     "Why this pathway" is not written in senior year; it is assembled over
//     four years out of moments a student cannot articulate at the time and
//     cannot reconstruct afterwards. It is now a persistent working document
//     with version history and a real question asked periodically — see
//     src/lib/healthEssays.js for the whole argument.
//  2. THE PROMPTS A TRACKED PROGRAM ACTUALLY ASKS were sitting in the combined-
//     degree catalog, three sections up the same page, unread by this one. A
//     student found out in October that their BS/MD program had its own
//     application with its own essays on an earlier deadline. Now the workspace
//     reads the program tracker (src/lib/programEssayPrompts.js).
//  3. NINTH AND TENTH GRADERS were handed an application-essay task list they
//     cannot act on for two or three years. The tracker is still visible and
//     still clickable for them — hiding it would mean arriving at junior year
//     never having seen it — but it is labeled as junior-year work and it is
//     out of their working set. Their surface is the journal.
//
// And the AI policy is enforced where the writing happens rather than in the
// terms of service (src/lib/aiPolicy.js), because a clause nobody reads at
// eleven at night is not a control.
// ─────────────────────────────────────────────────────────────────────────────

const STATUSES = [
  { id: 'not_started', label: 'Not started', color: C.t3 },
  { id: 'outlining', label: 'Outlining', color: C.violetL },
  { id: 'drafting', label: 'Drafting', color: C.blueL },
  { id: 'revising', label: 'Revising', color: C.amberL },
  { id: 'final', label: 'Final', color: C.greenL },
];

function wordCount(text) {
  return (text || '').trim().split(/\s+/).filter(Boolean).length;
}

export default function EssayWorkspacePanel({ accent = C.blue, user = null, gradeLabel = null, askMedabrain = null, onCreated = null, isMobile = false }) {
  const [allEssays, setAllEssays] = useState([]);
  const [colleges, setColleges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const [suppHidden, setSuppHidden] = useState(false);
  const [versions, setVersions] = useState([]);
  const [draft, setDraft] = useState('');
  const [versionLabel, setVersionLabel] = useState('');
  const [versionNote, setVersionNote] = useState('');
  const [portfolioCtx, setPortfolioCtx] = useState(null);
  const [brainTake, setBrainTake] = useState(null);
  const [critiques, setCritiques] = useState({});
  const [journalEntries, setJournalEntries] = useState([]);
  const docRef = useRef(null);

  // The grade the student is in NOW, advanced for elapsed academic years — never the one they
  // typed at signup, which is how a rising junior would still be shown the freshman framing.
  const gradeStage = useMemo(() => effectiveGradeStage(user), [user]);
  const preview = isEssayPreviewGrade(gradeStage);

  // The working document is an `essays` row so it inherits autosave, version history and the data
  // export — but it is not an essay, and every count, list and AI prompt in this file has to
  // exclude it or a student who opens the notebook is told they have started an application essay.
  const essays = useMemo(() => allEssays.filter(e => e.essay_kind !== WHY_PATHWAY.kind), [allEssays]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [e, c] = await Promise.all([listItems('essays'), listItems('colleges')]);
      setAllEssays(e);
      setColleges(c);
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Fetched once, separately from the essay/college state above — this is only ever read by the
  // ambient Meta Brain recommendation and the critique engine, never rendered directly, so a
  // failed fetch degrades to "no extra context" rather than breaking the workspace.
  useEffect(() => {
    Promise.all([
      listItems('activities').catch(() => []),
      listItems('research_experience').catch(() => []),
      listItems('clinical_hours').catch(() => []),
      listItems('awards').catch(() => []),
    ]).then(([activities, research, clinicalHours, awards]) => setPortfolioCtx({ activities, research, clinicalHours, awards }))
      .catch(() => setPortfolioCtx({ activities: [], research: [], clinicalHours: [], awards: [] }));
  }, []);

  useEffect(() => {
    if (!selected) { setVersions([]); return; }
    setDraft(selected.content || '');
    setVersionLabel(''); setVersionNote('');
    listItems('essay_versions').then(all => {
      setVersions(all.filter(v => v.essay_id === selected.id).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))));
    }).catch(() => {});
  }, [selected?.id]);

  // Everything else in this panel autosaves on blur — the Draft textarea shouldn't be the one
  // field that silently discards work if the student switches essays or navigates away before
  // saving a version. This is a plain autosave of the current content, not a history checkpoint.
  useEffect(() => {
    if (!selected || draft === (selected.content || '')) return;
    const id = selected.id;
    const t = setTimeout(() => {
      updateItem('essays', id, { content: draft })
        .then(() => setEssayLocal(id, { content: draft }))
        .catch(err => toast.error(err.message));
    }, 1200);
    return () => clearTimeout(t);
  }, [draft, selected]);

  async function flushDraft() {
    if (!selected || draft === (selected.content || '')) return;
    try {
      await updateItem('essays', selected.id, { content: draft });
      setEssayLocal(selected.id, { content: draft });
    } catch (err) { toast.error(err.message); }
  }

  async function selectEssay(essay) {
    await flushDraft();
    setSelected(essay);
  }

  async function addEssay() {
    if (!newTitle.trim()) return;
    try {
      await flushDraft();
      const essay = await createItem('essays', { title: newTitle.trim(), word_limit: 650, status: 'not_started', content: '', essay_kind: 'supplemental' });
      setAllEssays(prev => [...prev, essay]);
      setNewTitle('');
      setSelected(essay);
      showMedabrainToast('essay_started', { title: essay.title });
      onCreated?.();
    } catch (err) { toast.error(err.message); }
  }

  async function removeEssay(id) {
    if (!window.confirm('Delete this essay and its draft? This cannot be undone.')) return;
    setAllEssays(prev => prev.filter(e => e.id !== id));
    if (selected?.id === id) setSelected(null);
    try { await deleteItem('essays', id); } catch (err) { toast.error(err.message); }
  }

  function setEssayLocal(id, patch) {
    setAllEssays(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
    setSelected(prev => prev && prev.id === id ? { ...prev, ...patch } : prev);
  }

  async function patchEssay(id, patch) {
    const prevEssay = essays.find(e => e.id === id);
    setEssayLocal(id, patch);
    try {
      await updateItem('essays', id, patch);
      if (patch.status === 'final' && prevEssay && prevEssay.status !== 'final') {
        showMedabrainToast('essay_completed', { title: prevEssay.title });
      }
    } catch (err) { toast.error(err.message); }
  }

  async function saveVersion() {
    if (!selected) return;
    try {
      await updateItem('essays', selected.id, { content: draft });
      const version = await createItem('essay_versions', {
        essay_id: selected.id, content: draft, word_count: wordCount(draft),
        label: versionLabel.trim() || null, note: versionNote.trim() || null,
      });
      setVersions(prev => [...prev, version]);
      setAllEssays(prev => prev.map(e => e.id === selected.id ? { ...e, content: draft } : e));
      setVersionLabel(''); setVersionNote('');
      toast.success('Draft saved as a new version');
    } catch (err) { toast.error(err.message); }
  }

  // ── The critique pass ──────────────────────────────────────────────────────
  // Goes through purpose:'essay' (see api/groq.js) so the full draft, its prompt, the school it
  // is for and the student's real logged experiences all arrive intact: a critique of a truncated
  // essay is a confident verdict about writing the model never saw. It now also carries the shape
  // of the revision history, so "you have revised this four times and it has not moved" is
  // sayable — which is a more useful thing to hear than a fifth line-by-line pass.
  async function runCritique() {
    if (!selected) return;
    const text = draft.trim();
    const words = wordCount(text);
    if (words < 20) { toast.error("Write a few real sentences first — there's nothing to critique yet."); return; }
    const id = selected.id;
    setCritiques(prev => ({ ...prev, [id]: { loading: true, error: null, critique: null, ofWords: words } }));
    try {
      const linkedCollege = colleges.find(c => c.id === selected.college_id);
      const system = buildEssayCriticPrompt({
        user, gradeLabel,
        title: selected.title || 'Untitled essay',
        prompt: selected.prompt || '',
        wordLimit: selected.word_limit || null,
        collegeName: linkedCollege?.name || selected.source_label || null,
        mode: 'draft',
        portfolio: portfolioCtx,
        draftWordCount: words,
        arcSummary: summarizeArcForPrompt(buildVersionArc(versions, draft)),
      });
      const critique = await critiqueEssay({ draft: text, system });
      // Counted only on success. A pass that errored cost the student nothing
      // and must not count against them — the distinction a metering point has
      // to get right from the first day it exists rather than the day it bills.
      const passes = recordCritiquePass(id, { mode: 'draft' });
      setCritiques(prev => ({ ...prev, [id]: { loading: false, error: null, critique, ofWords: words, passes } }));
    } catch (err) {
      setCritiques(prev => ({ ...prev, [id]: { loading: false, error: err.message, critique: null, ofWords: words } }));
    }
  }

  /** Used by the supplemental trainer and by the program-prompt cards. */
  const createEssayFromRow = useCallback(async (row) => {
    const essay = await createItem('essays', {
      essay_kind: 'supplemental', status: row.content ? 'drafting' : 'not_started', content: '', word_limit: 250,
      ...row,
    });
    setAllEssays(prev => [...prev, essay]);
    onCreated?.();
    return essay;
  }, [onCreated]);

  const createEssayFromSupplement = useCallback(
    ({ title, prompt, word_limit, college_id, content }) => createEssayFromRow({
      title, prompt, word_limit: word_limit || 250, college_id: college_id || null, content: content || '',
    }),
    [createEssayFromRow],
  );

  // ── The programs the student actually tracked ─────────────────────────────
  // A tracked combined-degree program is a college-list row (see collegeRowFor in
  // src/lib/combinedDegree.js), so the college list is the join key and no second store exists.
  // One line of what this student has actually done, for essay mode to point at
  // when the draft is vague exactly where their record is concrete. Deliberately
  // the same rows the critique already reads, so the two cannot disagree about
  // what the student has done.
  const essayPortfolioSummary = useMemo(() => {
    if (!portfolioCtx) return null;
    const parts = [];
    const acts = (portfolioCtx.activities || []).slice(0, 8)
      .map(a => `${a.position || a.activity_type}${a.organization ? ` at ${a.organization}` : ''}`).filter(Boolean);
    if (acts.length) parts.push(`Activities: ${acts.join('; ')}.`);
    const res = (portfolioCtx.research || []).slice(0, 4).map(r => r.title).filter(Boolean);
    if (res.length) parts.push(`Research: ${res.join('; ')}.`);
    const hrs = (portfolioCtx.clinicalHours || []).reduce((s, h) => s + (Number(h.hours) || 0), 0);
    if (hrs > 0) parts.push(`${hrs} clinical/shadowing hours logged.`);
    const awards = (portfolioCtx.awards || []).slice(0, 5).map(a => a.title).filter(Boolean);
    if (awards.length) parts.push(`Awards: ${awards.join('; ')}.`);
    return parts.length ? parts.join(' ') : null;
  }, [portfolioCtx]);

  const programCards = useMemo(() => collectProgramPrompts({ colleges }), [colleges]);
  const programSummary = useMemo(() => summarizeProgramPrompts(programCards), [programCards]);

  const wc = wordCount(draft);
  const over = selected && selected.word_limit > 0 && wc > selected.word_limit;
  const activeCritique = selected ? critiques[selected.id] : null;
  const critiqueStale = !!(activeCritique?.critique && Math.abs(wc - (activeCritique.ofWords || 0)) >= 15);

  const totalWords = essays.reduce((s, e) => s + wordCount(e.content), 0);
  const finals = essays.filter(e => e.status === 'final').length;
  const inFlight = essays.filter(e => ['outlining', 'drafting', 'revising'].includes(e.status)).length;

  // ── Meta Brain's take ──────────────────────────────────────────────────────
  const brainCacheKey = useMemo(
    () => dailyKey('essayTake', essays.map(e => `${e.title}:${e.status}:${wordCount(e.content)}`).join('|')),
    [essays]
  );
  const brainFetchedKeyRef = useRef(null);
  useEffect(() => {
    if (!askMedabrain || essays.length === 0 || !portfolioCtx) { setBrainTake(null); return; }
    const cached = getCached(brainCacheKey);
    if (cached) { setBrainTake({ loading: false, content: cached, error: null }); brainFetchedKeyRef.current = brainCacheKey; return; }
    if (brainFetchedKeyRef.current === brainCacheKey) return;
    brainFetchedKeyRef.current = brainCacheKey;
    let cancelled = false;
    setBrainTake({ loading: true, content: null, error: null });

    const essayList = essays.map(e => `"${e.title}" (${e.status}, ${wordCount(e.content)}/${e.word_limit} words${e.college_id ? `, linked to ${colleges.find(c => c.id === e.college_id)?.name || 'a school'}` : ''})`).join('; ');
    const notStarted = essays.filter(e => e.status === 'not_started' || !wordCount(e.content));
    const whyMed = getWhyMedicineLabel(user?.whyMedicine);
    const dreamRole = getDreamRoleLabel(user?.dreamRole);
    const activityList = (portfolioCtx.activities || []).slice(0, 8).map(a => `${a.position || a.activity_type}${a.organization ? ` at ${a.organization}` : ''}`).join(', ');
    const researchList = (portfolioCtx.research || []).slice(0, 4).map(r => r.title).join(', ');
    const clinicalTotal = (portfolioCtx.clinicalHours || []).reduce((s, h) => s + (h.hours || 0), 0);
    const awardList = (portfolioCtx.awards || []).slice(0, 5).map(a => a.title).join(', ');

    const contextParts = [
      `Essays tracked: ${essayList}.`,
      notStarted.length ? `Not yet started or empty: ${notStarted.map(e => `"${e.title}"`).join(', ')}.` : `Every tracked essay has some draft content.`,
      // The program supplements are the ones a student most often does not know about, so the
      // coach has to be able to see them or its read of the workload is short by an application.
      programSummary ? `Combined-degree/direct-admit programs they have tracked also require: ${programSummary}. These rounds usually close EARLIER than the general application deadlines.` : '',
      whyMed ? `Why they're drawn to medicine (from onboarding): "${whyMed}."` : '',
      dreamRole && dreamRole !== 'Undecided' ? `Their dream role: ${dreamRole}.` : '',
      activityList ? `Activities: ${activityList}.` : 'No activities logged yet.',
      researchList ? `Research: ${researchList}.` : '',
      clinicalTotal > 0 ? `${clinicalTotal} clinical/shadowing hours logged.` : '',
      awardList ? `Awards: ${awardList}.` : '',
    ].filter(Boolean).join(' ');

    askMedabrain(`Here is this student's real essay workspace and portfolio: ${contextParts} In 2-4 concise sentences, as a demanding mentor rather than a cheerleader: name the single biggest problem with the state of their essay work right now — the essay that is furthest behind, the one whose word count says it has stalled, a program supplement they have not started whose round closes before everything else, or the fact that nothing is started — say it plainly without opening with praise, and then give one concrete angle or story beat drawn from their OWN logged activities/research/why-medicine answer above that would fix it. No "great start", no "you're on the right track", no encouragement they haven't earned. Only reference essays, programs, activities or experiences from this exact data — never invent one. Do not write any sentence of their essay for them.`)
      .then(content => { if (!cancelled) { setCached(brainCacheKey, content); setBrainTake({ loading: false, content, error: null }); } })
      .catch(err => { if (!cancelled) { brainFetchedKeyRef.current = null; setBrainTake({ loading: false, content: null, error: err.message }); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- askMedabrain intentionally excluded, it's a fresh closure every render (see DeadlinesPanel.jsx for the same pattern)
  }, [brainCacheKey, portfolioCtx, programSummary]);

  const appendToDoc = useCallback((text) => docRef.current?.append(text), []);

  // ── The three surfaces, in the order that matches the student's year ────────
  const journal = (
    <ReflectionJournal
      accent={C.teal} gradeStage={gradeStage} isMobile={isMobile}
      primary={preview} onAppendToDoc={appendToDoc} onEntriesChange={setJournalEntries} />
  );
  const workingDoc = (
    <WhyPathwayDoc ref={docRef} accent={C.cyan} user={user} gradeLabel={gradeLabel}
      portfolioCtx={portfolioCtx} isMobile={isMobile} />
  );

  const tracker = (
    <div style={CC({ gap: 20 })}>
      {programCards.length > 0 && (
        <ProgramPromptsCard cards={programCards} essays={essays} accent={C.blue} isMobile={isMobile}
          onCreateEssay={createEssayFromRow} />
      )}

      {/* Medabrain offering the supplements for a school that's actually on their list — the
          "you have Duke on your list, here's what Duke asks" loop. Open by default while there
          are no essays, because a student who doesn't know which essays they owe cannot title
          one, and this is the surface that tells them. */}
      {colleges.length > 0 && !suppHidden && (
        <Disclosure id="essays-supplements" icon={Sparkles} color={C.fuchsia} m={isMobile}
          defaultOpen={!loading && essays.length === 0 && !preview}
          title="The prompts your schools actually ask"
          sub={`Real supplemental questions from the ${colleges.length === 1 ? 'school' : `${colleges.length} schools`} on your college list — start one as a tracked essay in a tap.`}>
          <SupplementalEssaysCard
            colleges={colleges} user={user} gradeLabel={gradeLabel} portfolioCtx={portfolioCtx}
            accent={accent} existingEssays={essays} onCreateEssay={createEssayFromSupplement}
            onDismiss={() => setSuppHidden(true)}
          />
        </Disclosure>
      )}

      <div style={{ ...glass({ padding: isMobile ? 15 : 18 }), background: `linear-gradient(120deg,${tint(accent, 0.06)},rgba(255,255,255,0.02) 55%)`, border: `1px solid ${tint(accent, 0.2)}` }}>
        <SectionTitle icon={Plus} color={accent}>Start a new essay</SectionTitle>
        <div style={R({ gap: 8, flexWrap: 'wrap' })}>
          <input style={inp({ flex: 1, minWidth: 180 })} placeholder="e.g. Common App Personal Statement" value={newTitle} onChange={e => setNewTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && addEssay()} />
          <button style={btn(accent !== C.blue ? accent : C.blueGrad)} onClick={addEssay}><Plus size={14} />New essay</button>
        </div>
        <div style={{ marginTop: 12 }}>
          <HelpNote>You can rename it later, and nothing here is submitted anywhere — this is your own workspace.</HelpNote>
        </div>
      </div>

      {!loading && essays.length === 0 && (
        <div style={glass({ padding: 28, textAlign: 'center' })}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: tint(accent, 0.12), border: `1px solid ${tint(accent, 0.28)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <FileText size={22} color={accent} />
          </div>
          <div style={{ fontSize: 14, color: C.t2 }}>
            {preview
              ? "Nothing here yet, and nothing should be. Juniors start with the Common App personal statement — you can look around, but this is not your work this year."
              : "No essays yet. Most people start with the Common App personal statement — it's the one nearly every school reads."}
          </div>
        </div>
      )}

      {essays.length > 0 && !selected && (
        <HelpNote>Tap an essay below to open it and start writing.</HelpNote>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: selected && !isMobile ? '260px 1fr' : '1fr', gap: 16 }}>
        <div style={CC({ gap: 8 })}>
          {essays.map(essay => {
            const st = STATUSES.find(s => s.id === essay.status) || STATUSES[0];
            const ewc = wordCount(essay.content);
            const wpct = essay.word_limit ? Math.min(100, Math.round((ewc / essay.word_limit) * 100)) : 0;
            return (
              <div key={essay.id} onClick={() => selectEssay(essay)} style={{ ...glass2({ padding: 12, cursor: 'pointer', border: selected?.id === essay.id ? `1px solid ${accent}60` : `1px solid ${C.b1}` }), borderLeft: `3px solid ${st.color}`, background: selected?.id === essay.id ? `linear-gradient(120deg,${tint(accent, 0.08)},rgba(255,255,255,0.02))` : undefined }}>
                <div style={R({ gap: 8, justifyContent: 'space-between' })}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.t1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{essay.title}</span>
                  <button style={btnSm(C.roseDim, { color: C.rose, padding: '4px 8px' })} onClick={e => { e.stopPropagation(); removeEssay(essay.id); }}><Trash2 size={11} /></button>
                </div>
                <div style={R({ gap: 4, marginTop: 4 })}>
                  <span style={pill(`${st.color}18`, st.color, { fontSize: 9 })}>{st.label}</span>
                  <span style={{ fontSize: 10, color: C.t3 }}>{ewc}/{essay.word_limit} words</span>
                </div>
                {essay.source_label && (
                  <div style={{ fontSize: 9.5, color: C.t4, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    from {essay.source_label}
                  </div>
                )}
                <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden', marginTop: 8 }}>
                  <div style={{ height: '100%', width: '100%', transform: `scaleX(${(wpct) / 100})`, transformOrigin: 'left', background: ewc > essay.word_limit ? C.rose : st.color, borderRadius: 4, transition: 'transform 200ms cubic-bezier(0.4, 0, 0.2, 1)' }} />
                </div>
              </div>
            );
          })}
        </div>

        {selected && (
          <div style={glass({ padding: 16 })}>
            <div style={R({ gap: 8, flexWrap: 'wrap', marginBottom: 12, justifyContent: 'space-between' })}>
              <input style={{ ...inp({ fontSize: 15, letterSpacing: 'calc(-0.02px + var(--msp-letter-spacing))', fontWeight: 700, width: 'auto', flex: 1, minWidth: 160 }) }} value={selected.title}
                onChange={e => setEssayLocal(selected.id, { title: e.target.value })}
                onBlur={e => updateItem('essays', selected.id, { title: e.target.value }).catch(err => toast.error(err.message))} />
              <select style={inp({ width: 'auto' })} value={selected.status} onChange={e => patchEssay(selected.id, { status: e.target.value })}>
                {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            {selected.source_label && (
              <div style={{ ...glass2({ padding: '8px 12px' }), marginBottom: 12, fontSize: 11.5, color: C.t3, lineHeight: 1.55 }}>
                This prompt came from <b style={{ color: C.t2 }}>{selected.source_label}</b>'s own supplemental application.
                Confirm the wording and the word limit on the program's page before you submit — program prompts change year to year.
              </div>
            )}
            <div style={G(2, 10, {}, true)}>
              <div>
                <label style={lbl()}>Linked school (optional)</label>
                <select style={inp()} value={selected.college_id || ''} onChange={e => patchEssay(selected.id, { college_id: e.target.value || null })}>
                  <option value="">— Not linked —</option>
                  {colleges.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl()}>Word limit</label>
                <input type="number" min="1" style={inp()} value={selected.word_limit}
                  onChange={e => setEssayLocal(selected.id, { word_limit: Math.max(1, Number(e.target.value) || 650) })}
                  onBlur={e => updateItem('essays', selected.id, { word_limit: Math.max(1, Number(e.target.value) || 650) }).catch(err => toast.error(err.message))} />
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={lbl()}>Prompt</label>
              <input style={inp()} value={selected.prompt || ''}
                onChange={e => setEssayLocal(selected.id, { prompt: e.target.value })}
                onBlur={e => updateItem('essays', selected.id, { prompt: e.target.value }).catch(err => toast.error(err.message))}
                placeholder="Paste the essay prompt here…" />
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={R({ justifyContent: 'space-between', marginBottom: 8 })}>
                <label style={lbl({ marginBottom: 0 })}>Draft</label>
                <span style={{ fontSize: 11, color: over ? C.roseL : C.t3 }}>{wc} / {selected.word_limit} words</span>
              </div>
              <textarea style={{ ...inp(), minHeight: 260, resize: 'vertical', lineHeight: 1.55 }} value={draft} onChange={e => setDraft(e.target.value)} placeholder="Write your essay here…" />
              <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden', marginTop: 8 }}>
                <div style={{ height: '100%', width: '100%', transform: `scaleX(${(selected.word_limit ? Math.min(100, Math.round((wc / selected.word_limit) * 100)) : 0) / 100})`, transformOrigin: 'left', background: over ? C.rose : wc >= selected.word_limit * 0.85 ? C.amber : accent, borderRadius: 4, transition: 'transform 200ms cubic-bezier(0.4, 0, 0.2, 1)' }} />
              </div>
            </div>

            {/* Naming a version is optional and stays optional — but an unnamed history is a pile
                of timestamps, and the whole reason to keep one is so that later a person can see
                which read prompted which change. */}
            <VersionLabelFields label={versionLabel} note={versionNote} onLabel={setVersionLabel} onNote={setVersionNote} />

            <div style={R({ gap: 8, marginTop: 12, flexWrap: 'wrap' })}>
              <button style={btn(accent !== C.blue ? accent : C.blueGrad)} onClick={saveVersion}>Save a copy of this draft</button>
              {!activeCritique && (
                <button
                  style={btn(`linear-gradient(135deg,${C.violet},${C.indigo})`, { opacity: wc < 20 ? 0.5 : 1 })}
                  disabled={wc < 20}
                  onClick={runCritique}
                >Get a critique</button>
              )}
            </div>
            <div style={{ marginTop: 8 }}>
              <HelpNote>
                {wc < 20
                  ? 'Your draft saves by itself as you type. Write a few real sentences and the critique button switches on.'
                  : 'Your draft saves by itself as you type — “Save a copy” keeps this exact version so you can see later how the essay changed.'}
              </HelpNote>
            </div>

            {activeCritique && (
              <div style={{ marginTop: 12 }}>
                {critiqueStale && (
                  <div style={{ fontSize: 11, color: C.amberL, marginBottom: 8, lineHeight: 1.5 }}>
                    You've changed the draft since this critique — it's judging {activeCritique.ofWords} words, you now have {wc}. Re-run it when you're ready for a fresh read.
                  </div>
                )}
                <EssayCritique state={activeCritique} onRun={runCritique} disabled={wc < 20} />
              </div>
            )}

            {/* Questions, not prose. Sits under the critique because the two are
                the same job at two speeds: a verdict on a finished draft, and a
                conversation about the paragraph in front of them right now. */}
            <div style={{ marginTop: 12 }}>
              <EssayModeChat
                essay={selected} draft={draft} user={user} gradeLabel={gradeLabel}
                collegeName={colleges.find(c => c.id === selected.college_id)?.name || selected.source_label || null}
                portfolioSummary={essayPortfolioSummary}
                arcSummary={summarizeArcForPrompt(buildVersionArc(versions, draft))}
                critiquePasses={critiquePassCount(selected.id)}
                isMobile={isMobile} />
            </div>

            {versions.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <EssayVersionHistory versions={versions} currentContent={draft} accent={C.violet} isMobile={isMobile}
                  onRestore={(v) => {
                    if (!window.confirm('Bring this version back into the editor? Save a copy of what you have now first if you want to keep it.')) return;
                    setDraft(v.content || '');
                    toast('Older version loaded into the editor.', { icon: '↩️' });
                  }} />
              </div>
            )}
          </div>
        )}
      </div>

      {essays.length > 0 && (
        <Disclosure id="essays-progress" icon={PenLine} color={C.violet} m={isMobile}
          title="How your essays are going"
          sub={`${inFlight} on the go · ${finals} finished · ${totalWords.toLocaleString()} words written so far`}>
          <div style={CC({ gap: 12 })}>
            <div style={G(3, 12, {}, true)}>
              <StatTile icon={PenLine} value={inFlight} label="In progress" color={C.blue} />
              <StatTile icon={CheckCircle2} value={finals} label="Finished" color={C.green} />
              <StatTile icon={FileText} value={totalWords.toLocaleString()} label="Words written" color={accent} />
            </div>

            {brainTake && (
              <div style={{ ...glass2({ padding: 16 }), background: `linear-gradient(120deg,${tint(C.violet, 0.08)},rgba(255,255,255,0.02) 55%)`, border: `1px solid ${tint(C.violet, 0.25)}` }}>
                <div style={R({ gap: 8, marginBottom: brainTake.loading ? 0 : 8 })}>
                  <Sparkles size={13} color={C.violetL} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.violetL, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))' }}>Meta Brain's honest read</span>
                </div>
                {brainTake.loading && <div style={R({ gap: 8, color: C.t3, fontSize: 12 })}><Loader2 size={13} className="spin" />Reading your essays and portfolio…</div>}
                {brainTake.error && <div style={{ fontSize: 12, color: C.t3 }}>Couldn't reach Meta Brain right now.</div>}
                {brainTake.content && !brainTake.loading && <div style={{ fontSize: 12.5, color: C.t2, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: renderMarkdown(brainTake.content) }} />}
              </div>
            )}

            <HelpNote>This is deliberately blunt — it names whichever essay is furthest behind rather than telling you what you want to hear.</HelpNote>
          </div>
        </Disclosure>
      )}
    </div>
  );

  return (
    <div style={CC({ gap: 20 })}>
      <PanelHero tourTag="portfolio-deep-essays" icon={preview ? NotebookPen : ScrollText} color={accent} color2={C.fuchsia} m={isMobile}
        eyebrow="Essays"
        title={preview ? 'Where your essays start' : 'Write your essays here'}
        sub={preview
          ? 'Not applications — not yet. This is where you keep the raw material: a question every few weeks, and one working document about why this pathway that you will still be adding to in twelfth grade.'
          : 'Your working document, the prompts your schools and programs actually ask, and a straight critique of every draft.'}
        stats={preview
          ? (journalEntries.length ? [{ value: journalEntries.length, label: journalEntries.length === 1 ? 'entry kept' : 'entries kept', color: C.tealL }] : [])
          : (essays.length > 0
            ? [{ value: essays.length, label: essays.length === 1 ? 'essay' : 'essays' }, { value: finals, label: 'finished', color: C.greenL }]
            : [])} />

      {/* The policy, in the workspace, above the writing. Not a Disclosure and not a gate —
          see src/components/portfolio/AiPolicyNotice.jsx for why it is neither. */}
      <AiPolicyNotice isMobile={isMobile} />

      <HowItWorks
        id={preview ? 'essays-preview' : 'essays'} color={accent} m={isMobile}
        steps={preview
          ? [
            { title: 'Answer the question', body: 'One real question every few weeks, about something you actually saw. Nothing is due and nothing goes on a list.' },
            { title: 'Feed the working document', body: 'Any answer can be poured into your “why this pathway” document — the one you will still be writing in senior year.' },
            { title: 'The essay tracker waits', body: 'It is down the page and you can open it any time. You start using it in junior year, not now.' },
          ]
          : [
            { title: 'Keep the working document going', body: 'Four years of “why this pathway” is what every essay below gets quarried out of.' },
            { title: 'Take the prompts your programs ask', body: 'Combined-degree supplements and school prompts, pulled from what you have tracked — before October, not during it.' },
            { title: 'Get it torn apart', body: 'Meta Brain reads the real draft and tells you what is weak. It will not write a word of it for you.' },
          ]}
      />

      {preview ? (
        <>
          {/* ── Ninth and tenth grade ──────────────────────────────────────────
              Journal first, working document second, tracker last and clearly
              labeled. The tracker is one tap away and never taken from them —
              a student who has never seen it arrives at junior year blind — but
              it is not in their working set, so nothing about it can read as
              something they are behind on. */}
          {journal}
          {workingDoc}

          <Disclosure id="essays-tracker-preview" icon={Lock} color={C.t3} m={isMobile}
            title="The essay tracker — you'll use this in junior year"
            sub={trackerUnlockLabel(gradeStage) || 'Have a look around. Nothing in here is yours to do yet.'}>
            <div style={CC({ gap: 16 })}>
              <div style={{ ...glass2({ padding: 12 }), display: 'flex', gap: 8, alignItems: 'flex-start', border: `1px solid ${tint(C.sky, 0.22)}` }}>
                <Compass size={14} color={C.skyL} style={{ marginTop: 4, flexShrink: 0 }} />
                <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.65 }}>
                  This is what application season looks like: one essay per prompt, a word limit, a draft that saves
                  itself and a critique that tells you the truth. It is genuinely usable right now if you want to try
                  it — start anything you like. It is just not the work of a {gradeLabel ? gradeLabel.toLowerCase() : 'ninth or tenth grader'},
                  and putting it in your task list two years early would only mean two years of feeling behind on
                  something that has not started.
                </div>
              </div>
              {tracker}
            </div>
          </Disclosure>
        </>
      ) : (
        <>
          {/* ── Junior year and after ──────────────────────────────────────────
              The working document still leads, because it is the source the
              essays below are cut out of and a junior who skips it writes the
              generic version. The journal stays available as a door. */}
          {workingDoc}

          <Disclosure id="essays-journal" icon={NotebookPen} color={C.teal} m={isMobile}
            defaultOpen={false}
            title="Your reflection journal"
            sub="The periodic question, and everything you've answered so far. Any answer can be poured into the working document above.">
            {journal}
          </Disclosure>

          {tracker}

          {programCards.length === 0 && (
            <HelpNote>
              Tracking a combined-degree or direct-admit program in Combined Degrees pulls its own supplemental prompts
              into this page — including the ones whose round closes before the general application deadline.
            </HelpNote>
          )}
        </>
      )}
    </div>
  );
}
