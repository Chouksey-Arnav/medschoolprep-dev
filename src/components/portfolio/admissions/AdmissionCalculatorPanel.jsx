// ─────────────────────────────────────────────────────────────────────────────
// The Admissions Calculator.
//
// ── What this replaced, and why it had to be replaced rather than tuned ─────
// The previous version scored 153 schools with one additive function that
// started every school at 100 points and handed out bonuses (+15 GPA, +12
// clinical hours, +10 rigor, +5 for a pre-med committee), then labeled the
// result Likely / Target / Reach / Stretch. Three things were wrong with that,
// and none of them are fixable by changing the numbers:
//
//   • The scale had no relationship to probability, so "Likely" at a school
//     admitting 3.4% of applicants was a word with no meaning attached to it —
//     and it was the most consequential word on the screen.
//   • Requirements were weights. An internationally-domiciled student who is
//     categorically ineligible for UMKC's six-year program lost a few points
//     and still got a tier.
//   • Every school got the same weights, so a physician-scientist track that
//     says in its own admissions copy that it wants high-school research, and a
//     six-year clinical program that never mentions research at all, read a
//     student's portfolio identically.
//
// The rebuild is five layers (src/lib/admissions/), and this panel is their
// interface. What it owes the student, in order: an intake that never guesses,
// a range instead of a number, the 25th AND 50th AND 75th percentile, the three
// or four things that would actually move it, which of their activities this
// specific program weights, and an honest word about what is randomness.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Calculator, Plus, Search, ListChecks, Loader2, RefreshCw, Info, GraduationCap, FileDown } from 'lucide-react';
import { exportAdmissionEstimates } from '../../../lib/exportPDF';
import { C, glass, glass2, btn, btnSm, btnG, inp, lbl, R, CC, pill, tint, accentText } from '../../../lib/theme';
import PanelHero, { SectionTitle } from '../../ui/PanelHero';
import Disclosure, { HelpNote, HowItWorks } from '../../ui/Disclosure';
import IntakeForm, { CompletenessMeter, AlreadyKnown } from './IntakeForm';
import ProgramResultCard from './ProgramResultCard';
import {
  PROGRAM_PROFILES, resolveProfile, allProfiles, CATALOG_READ_ON,
  derivePortfolioSignals, deriveApplicantFromPortfolio, buildApplicant,
  assessCompleteness, nextQuestions, estimateAdmission,
  loadIntake, saveIntake, flushIntake,
} from '../../../lib/admissions';

/**
 * @param snapshot   the shared Portfolio snapshot (src/lib/portfolioData.js)
 * @param colleges   the student's own college list rows, so their real list is
 *                   what gets scored rather than a generic slate
 */
export default function AdmissionCalculatorPanel({
  user = null, snapshot = null, colleges = [], onGoTo = null, isMobile = false, onReload = null,
}) {
  const [answers, setAnswers] = useState({});
  const [programRounds, setProgramRounds] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState([]);      // program ids the student has added
  const [saving, setSaving] = useState(false);

  // ── Load the saved intake, exactly once ──────────────────────────────────
  // The guard is not a nicety. The Portfolio snapshot arrives asynchronously,
  // and without it this effect would re-run the moment it landed and overwrite
  // whatever the student had typed in the meantime with the row from the
  // server — silently, and only for the people who started answering quickly.
  const intakeLoaded = React.useRef(false);
  useEffect(() => {
    if (intakeLoaded.current) return;
    intakeLoaded.current = true;
    let cancelled = false;
    loadIntake(snapshot)
      .then(intake => { if (!cancelled) { setAnswers(intake.answers || {}); setProgramRounds(intake.programRounds || {}); } })
      .catch(() => { /* the form still works; it just will not survive a reload */ })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [snapshot]);

  // Flush any debounced write when the panel unmounts, so a student who answers
  // a question and immediately navigates away does not lose it.
  useEffect(() => () => { flushIntake().catch(() => {}); }, []);

  const persist = useCallback((nextAnswers, nextRounds) => {
    setSaving(true);
    saveIntake({ answers: nextAnswers, programRounds: nextRounds });
    // The debounce in the store is 900ms; this is only the spinner.
    setTimeout(() => setSaving(false), 1200);
  }, []);

  const onAnswer = useCallback((id, value) => {
    setAnswers(prev => {
      const next = { ...prev };
      if (value === null || value === undefined || value === '') delete next[id];
      else next[id] = value;
      persist(next, programRounds);
      return next;
    });
  }, [persist, programRounds]);

  const onRoundChange = useCallback((programId, roundId) => {
    setProgramRounds(prev => {
      const next = { ...prev, [programId]: roundId };
      persist(answers, next);
      return next;
    });
  }, [answers, persist]);

  // ── Everything the Portfolio already knows ───────────────────────────────
  const portfolio = useMemo(() => derivePortfolioSignals(snapshot || {}), [snapshot]);
  const derived = useMemo(() => deriveApplicantFromPortfolio({ snapshot: snapshot || {}, user }), [snapshot, user]);
  const applicant = useMemo(() => buildApplicant({ derived, answers, portfolio }), [derived, answers, portfolio]);
  const completeness = useMemo(() => assessCompleteness({ applicant, answers }), [applicant, answers]);

  // ── Which programs to score ────────────────────────────────────────────
  // The student's own college list first — a calculator that scores a generic
  // slate instead of the schools they are actually applying to is a toy.
  const listedProfiles = useMemo(() => (
    (colleges || []).map(c => resolveProfile(c.name)).filter(Boolean)
  ), [colleges]);

  // Schools on their list we hold nothing about — usually a school typed by hand
  // rather than picked from the autocomplete. Named rather than silently
  // dropped: a student who added six schools and sees five scored should be
  // told which one is missing and why, not left to count.
  const unresolvedColleges = useMemo(() => (
    (colleges || []).filter(c => !resolveProfile(c.name)).map(c => c.name)
  ), [colleges]);

  const selectedProfiles = useMemo(() => selected.map(id => resolveProfile(id)).filter(Boolean), [selected]);

  const scoredProfiles = useMemo(() => {
    const seen = new Set();
    return [...selectedProfiles, ...listedProfiles].filter(p => {
      if (seen.has(p.id)) return false;
      seen.add(p.id); return true;
    });
  }, [selectedProfiles, listedProfiles]);

  const priorityFields = useMemo(
    () => nextQuestions({ applicant, answers, profiles: scoredProfiles, limit: 5 }),
    [applicant, answers, scoredProfiles],
  );

  const results = useMemo(() => scoredProfiles.map(profile => estimateAdmission({
    program: profile, applicant, portfolio, completeness, roundId: programRounds[profile.id] || null,
  })), [scoredProfiles, applicant, portfolio, completeness, programRounds]);

  // ── Program search ─────────────────────────────────────────────────────
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    const chosen = new Set(scoredProfiles.map(p => p.id));
    return allProfiles()
      .filter(p => !chosen.has(p.id) && (p.name.toLowerCase().includes(q) || p.institution.toLowerCase().includes(q)))
      .slice(0, 8);
  }, [search, scoredProfiles]);

  const jumpToField = (id) => {
    const el = document.getElementById(`intake-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const blockedCount = results.filter(r => r.blocked).length;

  return (
    <div style={CC({ gap: 20 })}>
      <PanelHero tourTag="portfolio-deep-calc" icon={Calculator} color={C.gold} color2={C.orange} m={isMobile}
        eyebrow="Admissions calculator"
        title="What your real chances look like"
        sub="Built to be right rather than encouraging. Every estimate is a range, benchmarked against the median admitted student rather than the twenty-fifth percentile, weighted by what each program actually publishes, and honest about what is randomness."
        right={saving ? <span style={pill(C.s3, C.t3, { fontSize: 10.5, gap: 4 })}><Loader2 size={10} className="spin" /> saving</span> : null}
        stats={[
          { value: completeness.have, label: `of ${completeness.total} answered`, color: completeness.ratio >= 0.85 ? C.green : C.amber },
          { value: scoredProfiles.length, label: 'programs scored', color: C.blue },
        ]} />

      <HowItWorks id="admissions-calc-v2" color={C.gold} m={isMobile} title="How this one is different"
        steps={[
          { title: 'Requirements are gates, not points', body: 'A published requirement you do not meet means no percentage at all — just what would have to change. UMKC and RPI are closed to international applicants; Drexel needs 200 documented service hours. Those are yeses and noes, and a weighted score cannot say no.' },
          { title: 'We benchmark against the median, not the 25th', body: 'Every chancing tool compares you to the 25th percentile of admitted students, so clearing a low bar reads as "qualified" and qualified quietly becomes "likely". You see all three — 25th, median, 75th — every time.' },
          { title: 'At the most selective programs, your scores barely separate you', body: 'Below about 15% admitted, the pool is already pre-filtered on academics: almost everyone applying clears the bar. A model that keeps leaning on GPA there tells a strong student they have a real shot when they do not.' },
          { title: 'Hooks and rounds are in the data whether we model them or not', body: 'Published admit rates include recruited athletes, legacies and development admits, and early rounds are where they are concentrated. We strip that out rather than letting it flatter everyone else.' },
          { title: 'Where it is a lottery, we say so', body: 'ASU\'s nursing program resolves an oversubscribed cohort by random selection, in its own words. No amount of preparation removes that, and pretending otherwise is not encouragement.' },
        ]} />

      {/* ── Completeness ──────────────────────────────────────────────────── */}
      <CompletenessMeter completeness={completeness} onJump={jumpToField} isMobile={isMobile} />

      {/* ── What we already have ──────────────────────────────────────────── */}
      <AlreadyKnown portfolio={portfolio} applicant={applicant} onGoTo={onGoTo} isMobile={isMobile} />

      {/* ── The questions ─────────────────────────────────────────────────── */}
      <Disclosure id="admissions-intake" title="What we still need to ask you"
        sub={completeness.missing.length ? `${completeness.missing.length} unanswered. Each is one line, each explains why, each is skippable.` : 'All answered — edit any of them here.'}
        icon={ListChecks} color={C.blue} m={isMobile} defaultOpen={completeness.missing.length > 0}>
        {loaded
          ? <IntakeForm answers={answers} onAnswer={onAnswer} derived={derived}
              completeness={completeness} priorityFields={priorityFields} isMobile={isMobile} />
          : <div style={{ textAlign: 'center', padding: 28, color: C.t3, fontSize: 12.5 }}><Loader2 size={16} className="spin" /> Loading what you told us last time…</div>}
      </Disclosure>

      {/* ── Choosing programs ───────────────────────────────────────────── */}
      <div style={glass({ padding: isMobile ? 16 : 18 })}>
        <SectionTitle icon={GraduationCap} color={C.violet}>Programs to score</SectionTitle>
        <div style={{ marginTop: -6, marginBottom: 12 }}>
          <HelpNote>
            Your college list is scored automatically. {PROGRAM_PROFILES.length} combined-degree and direct-entry programs have their real published requirements on file (read {CATALOG_READ_ON}); every other U.S. school we track gets a profile derived from admitted-student midpoints and labeled as derived.
          </HelpNote>
        </div>

        <div style={{ position: 'relative' }}>
          <Search size={14} color={C.t3} style={{ position: 'absolute', left: 12, top: 12 }} />
          <input style={inp({ paddingLeft: 32 })} placeholder="Search a school or program — e.g. UMKC, RPI, Drexel, nursing…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {searchResults.length > 0 && (
          <div style={{ ...CC({ gap: 4 }), marginTop: 8 }}>
            {searchResults.map(p => (
              <button key={p.id} onClick={() => { setSelected(s => [...s, p.id]); setSearch(''); }}
                style={{ ...glass2({ padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', textAlign: 'left' }), width: '100%' }}>
                <Plus size={13} color={C.violet} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: C.t1 }}>{p.name}</span>
                  <span style={{ display: 'block', fontSize: 10.5, color: C.t3, marginTop: 4 }}>{p.institution}</span>
                </span>
                {!p.derived && <span style={pill(tint(C.green, 0.14), accentText(C.green), { fontSize: 9 })}>published criteria on file</span>}
              </button>
            ))}
          </div>
        )}

        {PROGRAM_PROFILES.some(p => !scoredProfiles.find(s => s.id === p.id)) && (
          <div style={{ marginTop: 12 }}>
            <span style={lbl()}>Programs whose real requirements we hold</span>
            <div style={R({ gap: 4, flexWrap: 'wrap' })}>
              {PROGRAM_PROFILES.filter(p => !scoredProfiles.find(s => s.id === p.id)).map(p => (
                <button key={p.id} onClick={() => setSelected(s => [...s, p.id])}
                  style={btnSm(C.s3, { fontSize: 11 })}><Plus size={10} />{p.institution.split(' — ')[0].replace('University of ', '')} · {p.name.split('(')[0].trim()}</button>
              ))}
            </div>
          </div>
        )}

        {unresolvedColleges.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <HelpNote color={C.amber} icon={Info}>
              {unresolvedColleges.length} school{unresolvedColleges.length === 1 ? '' : 's'} on your college list {unresolvedColleges.length === 1 ? 'is' : 'are'} not scored below, because we hold no admitted-student data for {unresolvedColleges.length === 1 ? 'it' : 'them'}: {unresolvedColleges.join(', ')}. We would rather say so than invent a profile and hand you a number built on it.
            </HelpNote>
          </div>
        )}

        {scoredProfiles.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <span style={lbl()}>Being scored now ({scoredProfiles.length})</span>
            <div style={R({ gap: 4, flexWrap: 'wrap' })}>
              {scoredProfiles.map(p => (
                <span key={p.id} style={pill(tint(C.violet, 0.13), accentText(C.violet), { fontSize: 10.5, gap: 4 })}>
                  {p.name}
                  {selected.includes(p.id) && (
                    <button onClick={() => setSelected(s => s.filter(x => x !== p.id))}
                      style={{ all: 'unset', cursor: 'pointer', opacity: 0.6 }}>×</button>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Results ───────────────────────────────────────────────────────── */}
      {scoredProfiles.length === 0 ? (
        <div style={{ ...glass({ padding: 40 }), textAlign: 'center' }}>
          <div style={{ fontSize: 13.5, color: C.t2, lineHeight: 1.55, maxWidth: 520, margin: '0 auto' }}>
            Nothing to score yet. Add a program above, or build your college list and every school on it appears here automatically.
          </div>
          {onGoTo && (
            <button style={{ ...btn(C.blueGrad, { fontSize: 12.5, marginTop: 16 }) }} onClick={() => onGoTo('colleges')}>
              Go to my college list
            </button>
          )}
        </div>
      ) : (
        <>
          {blockedCount > 0 && (
            <div style={{ ...glass2({ padding: 12 }), borderLeft: `3px solid ${C.rose}` }}>
              <HelpNote color={C.rose} icon={Info}>
                {blockedCount} of the {results.length} programs below show no percentage at all, because you do not currently meet a published requirement. That is deliberate: an eight percent chance at a program you are not eligible for is worse than nothing.
              </HelpNote>
            </div>
          )}

          <div style={R({ gap: 8, flexWrap: 'wrap' })}>
            <button style={btnG({ fontSize: 12 })}
              // Awaited so the confirmation follows the document rather than racing it:
              // exportAdmissionEstimates now fetches the PDF renderer on first use
              // (see src/lib/exportPDF.js), so on a slow connection the un-awaited
              // version would have claimed success before anything was rendered.
              onClick={async () => { await exportAdmissionEstimates(results, { completeness }); toast.success('Exported — the PDF carries the same ranges and the same caveats as the screen.'); }}>
              <FileDown size={13} /> Export these estimates as PDF
            </button>
          </div>

          <div style={CC({ gap: 16 })}>
            {results.map((r, i) => (
              <ProgramResultCard key={scoredProfiles[i].id} result={r} portfolio={portfolio} isMobile={isMobile}
                roundId={programRounds[scoredProfiles[i].id] || null}
                onGoTo={onGoTo}
                onRoundChange={(roundId) => onRoundChange(scoredProfiles[i].id, roundId)} />
            ))}
          </div>
        </>
      )}

      {/* ── The standing disclosure ───────────────────────────────────────── */}
      <Disclosure id="admissions-honesty" title="What this model can and cannot know"
        sub="Worth reading once." icon={Info} color={C.t3} m={isMobile}>
        <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.55, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ margin: 0 }}>
            This is an estimate, and the range around it is the honest part. No model has access to your essays, your letters, the reader who picked up your file, what that program needed the year you applied, or who else applied. At the most selective programs those things decide more of the outcome than everything we can measure put together — which is exactly why the ranges get wider, not narrower, as the programs get harder.
          </p>
          <p style={{ margin: 0 }}>
            Where a program does not publish its admit rate we say so and we widen the range rather than borrowing a number from a school that looks similar. Where our percentile bands are derived from a single midpoint rather than published, every card says so. Where selection is genuinely random, we say that too.
          </p>
          <p style={{ margin: 0 }}>
            The one thing this model will not do is flatter you. If it tells you a program is a long shot, that is not a verdict on you and it is not a reason not to apply — it is the information you need in order to decide how many other applications to send.
          </p>
        </div>
      </Disclosure>

      {onReload && (
        <button style={btnG({ fontSize: 12, alignSelf: 'flex-start' })} onClick={onReload}>
          <RefreshCw size={13} /> Re-read my Portfolio
        </button>
      )}
    </div>
  );
}
