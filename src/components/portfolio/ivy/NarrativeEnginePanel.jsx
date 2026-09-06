// ─────────────────────────────────────────────────────────────────────────────
// The Narrative Method Engine's interface.
//
// ── PREMIUM ROADMAP ─────────────────────────────────────────────────────────
// This is the app's first screen designed from the start to sit behind billing.
// It renders a full reading today for everyone, and the whole gate is one call:
// `narrativeEngineTier(user)`, passed to `runEngine`. When ENFORCE_PREMIUM in
// src/lib/ivy/constants.js flips, this component needs no change — the engine
// returns the free shape, `result.locked` is populated, and the upgrade block
// at the bottom of this file renders instead of the deep sections.
//
// Two rules this component must keep:
//   • The safeguards render on BOTH tiers, always, and are never inside a
//     collapsed disclosure that a student can miss.
//   • The free reading is a real finding about their own file, never a blur.
// ────────────────────────────────────────────────────────────────────────────
//
// ── What this screen is, next to the Admissions Calculator ─────────────────
// The calculator answers "what are my odds at these programs" against published
// base rates. This answers a different and earlier question: "what does my file
// currently SAY, and does it say one thing". They deliberately do not share a
// number, and this engine emits no admission probability at all — two chancing
// figures on two screens is how a product starts contradicting itself about the
// most consequential thing it shows.
//
// ── The ordering is the argument ───────────────────────────────────────────
// Headline, then theme, then the structural finding, then the essay work, then
// the roadmap, then the safeguards. A student who reads only the first screen
// gets the one thing that matters most; a student who reads to the bottom
// finishes on the honest expectations rather than starting on them and
// scrolling past.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  Compass, Loader2, Save, Target, Layers, Sparkles, ShieldCheck, CalendarDays,
  PenLine, Gauge, CheckCircle2, Info, ListChecks, Lock, TrendingUp,
} from 'lucide-react';
import { C, glass, glass2, btnSm, inp, lbl, CC, G, pill, tint, accentText, type } from '../../../lib/theme';
import PanelHero, { SectionTitle, StatTile } from '../../ui/PanelHero';
import Disclosure, { HelpNote, HowItWorks } from '../../ui/Disclosure';
import { narrativeEngineTier } from '../../../lib/entitlements';
import { runEngine } from '../../../lib/ivy/engine.js';
import { LABELS as RUBRIC_LABELS } from '../../../lib/ivy/holistic.js';
import { HOOK_ARCHETYPE_GUIDE } from '../../../lib/ivy/hooks.js';
import { DEPARTMENTS } from '../../../data/ivy/tierCatalog.js';
import {
  loadNarrativeProfile, saveNarrativeProfile, flushNarrativeProfile, saveRun,
} from '../../../lib/ivy/store.js';
import { buildIngestion } from '../../../lib/ivy/serialize.js';

const TONE = { high: C.red, medium: C.orange, low: C.t3, good: C.green };

export default function NarrativeEnginePanel({
  user = null, snapshot = null, isMobile = false, gradeLevel = null, onGoTo = null,
}) {
  const [profile, setProfile] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── Load the saved inputs, exactly once ──────────────────────────────────
  // Guarded for the same reason the Admissions Calculator's intake is: the
  // Portfolio snapshot lands asynchronously, and without the ref this effect
  // re-runs the moment it does and overwrites whatever the student has typed
  // since — silently, and only for the people who started answering quickly.
  const didLoad = useRef(false);
  useEffect(() => {
    if (didLoad.current) return;
    didLoad.current = true;
    let cancelled = false;
    loadNarrativeProfile(snapshot)
      .then(p => { if (!cancelled) setProfile(p); })
      .catch(() => { if (!cancelled) setProfile(emptyProfile()); })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [snapshot]);

  // Flush the debounced write on unmount, so a student who types an answer and
  // immediately navigates away does not lose it.
  useEffect(() => () => { flushNarrativeProfile().catch(() => {}); }, []);

  const persist = useCallback((next) => {
    setProfile(next);
    setSaving(true);
    saveNarrativeProfile(next);
    // The indicator is optimistic on purpose: the write is debounced by nearly a
    // second and a spinner that only clears on the response makes every
    // keystroke look like a failure.
    setTimeout(() => setSaving(false), 1100);
  }, []);

  const patch = useCallback((key, value) => {
    persist({ ...(profile || emptyProfile()), [key]: value });
  }, [profile, persist]);

  const patchProject = useCallback((key, value) => {
    const p = profile || emptyProfile();
    persist({ ...p, project: { ...(p.project || {}), [key]: value } });
  }, [profile, persist]);

  // ── The reading ─────────────────────────────────────────────────────────
  const tier = narrativeEngineTier(user);
  const result = useMemo(() => {
    if (!loaded) return null;
    const ingestion = buildIngestion({
      profile: profile || emptyProfile(),
      student: { ...(user || {}), grade_level: gradeLevel ?? user?.gradeLevel },
      activities: snapshot?.activities || [],
      essays: snapshot?.essays || [],
      gradeLevel: gradeLevel ?? user?.gradeLevel ?? 12,
    });
    try {
      return runEngine(ingestion, { tier, completed: profile?.completed || {} });
    } catch (err) {
      // A thrown module must not blank the screen. The student still gets the
      // intake and the safeguards, which is more than a stack trace gives them.
      console.error('narrative engine', err);
      return { error: true };
    }
  }, [loaded, profile, snapshot, user, gradeLevel, tier]);

  const keep = useCallback(async () => {
    if (!result || result.error) return;
    try {
      await flushNarrativeProfile().catch(() => {});
      await saveRun(result);
      toast.success('Reading saved. You can compare against it later.');
    } catch {
      toast.error('Could not save that reading. Nothing else was lost.');
    }
  }, [result]);

  if (!loaded) {
    return (
      <div style={{ ...glass({ padding: 40 }), display: 'flex', justifyContent: 'center' }}>
        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: C.t3 }} />
      </div>
    );
  }

  return (
    <div style={CC({ gap: 16 })}>
      <PanelHero
        icon={Compass} color={C.violet} color2={C.sky} m={isMobile}
        eyebrow="The narrative method"
        title="What your file actually says"
        sub="Thirteen models run against your real profile: the theme a reader would extract, where your story stops matching itself, and the specific rewrites that fix it. This is not a chances calculator — it never produces one."
      />

      <HowItWorks id="ivy-engine" color={C.violet} m={isMobile} steps={[
        { label: 'It reads what you already have', text: 'Your activities, your essay drafts and your logged record come from the Portfolio. The few things it cannot infer — your project\'s state, your intended field — are the short form below.' },
        { label: 'It extracts a theme from your words', text: 'Not from the major you typed. From what you actually wrote about, across every surface a reader sees.' },
        { label: 'It reports a range, not a verdict', text: 'Anything it cannot evaluate is named and widens the band rather than being quietly assumed.' },
      ]} />

      <IntakeCard
        profile={profile} onPatch={patch} onPatchProject={patchProject}
        completeness={result?.completeness} saving={saving} isMobile={isMobile}
      />

      {result?.error ? (
        <div style={{ ...glass({ padding: 16 }), border: `1px solid ${tint(C.orange, 0.4)}` }}>
          <div style={{ fontWeight: 700, color: C.orange, marginBottom: 8 }}>The reading did not complete</div>
          <div style={{ color: C.t2, fontSize: 13 }}>
            Something in your profile made a module fail. Your inputs are safe and nothing was changed. Adding or editing a draft usually clears it — and if it does not, tell us what is on this page.
          </div>
        </div>
      ) : result ? (
        <>
          <HeadlineCard result={result} isMobile={isMobile} onKeep={keep} />
          <ThemeSection result={result} isMobile={isMobile} />
          <StructureSection result={result} isMobile={isMobile} />

          {result.tier === 'premium' ? (
            <>
              <EssaySection result={result} isMobile={isMobile} />
              <ResonanceSection result={result} isMobile={isMobile} />
              <RoadmapSection result={result} isMobile={isMobile} />
              <ModulesSection result={result} isMobile={isMobile} />
            </>
          ) : (
            <UpgradeCard locked={result.locked} isMobile={isMobile} />
          )}

          {/* Never inside a collapsed disclosure, never gated. See the header. */}
          <SafeguardSection result={result} isMobile={isMobile} />
        </>
      ) : null}
    </div>
  );
}

function emptyProfile() {
  return { intendedMajor: null, valueTheme: null, project: {}, practice: {}, studyLog: {}, bragSheets: {}, completed: {}, additionalInfo: '' };
}

// ─────────────────────────────────────────────────────────────────────────────
// The intake. Deliberately short: everything else is read from the Portfolio.
// ─────────────────────────────────────────────────────────────────────────────
function IntakeCard({ profile, onPatch, onPatchProject, completeness, saving, isMobile }) {
  const p = profile || emptyProfile();
  const proj = p.project || {};

  return (
    <Disclosure
      id="ivy-intake" title="What the engine still needs from you" icon={ListChecks} color={C.sky}
      m={isMobile}
      defaultOpen={!p.intendedMajor || !proj.description}
      sub={completeness ? `${Math.round((completeness.share || 0) * 100)}% of the inputs are in. Everything missing widens the band rather than being assumed.` : undefined}
    >
      <div style={CC({ gap: 16 })}>
        <HelpNote>
          Your activities, essays and logged hours are read straight from the Portfolio — nothing here duplicates them. These are the few things no other part of the app knows.
        </HelpNote>

        <div style={G(2, 12, {}, isMobile)}>
          <div>
            <label style={lbl}>The field your application claims</label>
            <select style={inp} value={p.intendedMajor || ''} onChange={e => onPatch('intendedMajor', e.target.value || null)}>
              <option value="">Not decided yet</option>
              {DEPARTMENTS.map(d => <option key={d} value={d}>{d.replace(/-/g, ' ')}</option>)}
            </select>
            <div style={{ fontSize: 11, color: C.t3, marginTop: 4 }}>
              It does not have to be your final answer. It has to be the one your application makes.
            </div>
          </div>
          <div>
            <label style={lbl}>People your project has actually reached</label>
            <input style={inp} type="number" min="0" placeholder="e.g. 50"
              value={proj.engagement ?? ''}
              onChange={e => onPatchProject('engagement', e.target.value === '' ? null : Number(e.target.value))} />
            <div style={{ fontSize: 11, color: C.t3, marginTop: 4 }}>
              Attendees, subscribers, members — people who turned up, not people you could reach.
            </div>
          </div>
        </div>

        <div>
          <label style={lbl}>What your project is, in two or three sentences</label>
          <textarea style={{ ...inp, minHeight: 84, resize: 'vertical' }}
            placeholder='The problem is [X], and the people affected are [Y]. Then: what you built, and for whom.'
            value={proj.description || ''}
            onChange={e => onPatchProject('description', e.target.value)} />
        </div>

        <div style={CC({ gap: 8 })}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.t2 }}>Which of these are true today?</div>
          <div style={G(2, 8, {}, isMobile)}>
            {[
              ['hasMentorAgreement', 'A named mentor has agreed, in writing'],
              ['hasPartner', 'An organization outside school is involved'],
              ['hasMediaMention', 'It has been written about somewhere'],
              ['hasLiveSite', 'There is a live site or repository'],
              ['hasPublishedArtifact', 'Something is published — a handbook, a paper, a dataset'],
            ].map(([key, label]) => (
              <label key={key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: C.t2, cursor: 'pointer' }}>
                <input type="checkbox" checked={!!proj[key]} onChange={e => onPatchProject(key, e.target.checked)} style={{ marginTop: 4 }} />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label style={lbl}>Additional Information draft (optional)</label>
          <textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }}
            placeholder="Facts a reader needs and cannot get anywhere else. Brief, factual, and never a second essay."
            value={p.additionalInfo || ''}
            onChange={e => onPatch('additionalInfo', e.target.value)} />
        </div>

        <div style={{ fontSize: 11, color: saving ? C.sky : C.t3, display: 'flex', gap: 8, alignItems: 'center' }}>
          {saving ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</> : <><CheckCircle2 size={12} /> Saved automatically</>}
        </div>

        {completeness?.next ? (
          <div style={{ ...glass2({ padding: 12 }), borderLeft: `3px solid ${C.sky}` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.t1 }}>Next most useful thing to add: {completeness.next.label}</div>
            <div style={{ fontSize: 12, color: C.t3, marginTop: 4 }}>Unlocks {completeness.next.unlocks.join(', ').toLowerCase()}.</div>
          </div>
        ) : null}
      </div>
    </Disclosure>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The headline. One finding, and the four rubric numbers behind it.
// ─────────────────────────────────────────────────────────────────────────────
function HeadlineCard({ result, isMobile, onKeep }) {
  const h = result.modules.holistic;
  const interval = result.safeguards.interval;

  return (
    <div style={{ ...glass({ padding: isMobile ? 16 : 20 }), border: `1px solid ${tint(C.violet, 0.35)}` }}>
      <div style={{ ...pill(C.violet), marginBottom: 8 }}>The finding</div>
      <div style={{ ...type(isMobile ? 17 : 20, { weight: 800 }), color: C.t1 }}>
        {result.headline.lead}
      </div>
      {result.headline.supporting?.map((s, i) => (
        <div key={i} style={{ fontSize: 13, color: C.t2, marginTop: 8, lineHeight: 1.5 }}>{s}</div>
      ))}

      <div style={{ ...G(4, 10, { marginTop: 16 }, isMobile) }}>
        {Object.entries(h.scores || {}).map(([key, score]) => {
          const assumed = (h.assumptions || []).some(a => a.key === key);
          return (
            <div key={key} style={{ ...glass2({ padding: 12 }), opacity: assumed ? 0.6 : 1 }}>
              <div style={{ fontSize: 11, color: C.t3 }}>{RUBRIC_LABELS[key]}</div>
              <div style={{ ...type(22, { weight: 800 }), color: assumed ? C.t3 : accentText(C.violet) }}>
                {Number(score).toFixed(1)}
              </div>
              <div style={{ fontSize: 10, color: C.t3 }}>{assumed ? 'not evaluable yet' : '1 is strongest'}</div>
            </div>
          );
        })}
      </div>

      {interval ? (
        <div style={{ fontSize: 12, color: C.t3, marginTop: 12, lineHeight: 1.55 }}>
          At 95% confidence your overall reading is <strong style={{ color: C.t2 }}>{interval.low} – {interval.high}</strong> on the 1–6 scale, centered on {interval.centre}. {interval.reasons?.[0]?.label}
        </div>
      ) : null}

      {result.tier === 'premium' ? (
        <button style={{ ...btnSm(C.violet), marginTop: 16 }} onClick={onKeep}>
          <Save size={13} /> Keep this reading
        </button>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 1 — theme and echo coherence.
// ─────────────────────────────────────────────────────────────────────────────
function ThemeSection({ result, isMobile }) {
  const { theme, coherence } = result.thematic;
  if (!theme?.available) {
    return (
      <div style={glass({ padding: 16 })}>
        <SectionTitle icon={Target} color={C.sky}>Your theme</SectionTitle>
        <div style={{ color: C.t3, fontSize: 13 }}>{theme?.note}</div>
      </div>
    );
  }

  return (
    <div style={glass({ padding: isMobile ? 16 : 20 })}>
      <SectionTitle icon={Target} color={C.sky}>Your Value-Based Theme</SectionTitle>
      <div style={{ ...type(16, { weight: 700 }), color: C.t1, marginTop: 8 }}>{theme.headline}</div>
      <div style={{ fontSize: 13, color: C.t2, marginTop: 8, lineHeight: 1.55 }}>{theme.statement}</div>
      <div style={{ fontSize: 11, color: C.t3, marginTop: 8, lineHeight: 1.5, fontStyle: 'italic' }}>{theme.caveat}</div>

      {coherence?.available ? (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.t2, marginBottom: 8 }}>
            How well each surface echoes it — {Math.round(coherence.score * 100)}%, {coherence.band}
          </div>
          <div style={CC({ gap: 8 })}>
            {coherence.echoes.map(e => (
              <div key={e.id} style={{ ...glass2({ padding: 12 }), display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ width: 8, height: 8, borderRadius: 4, marginTop: 4, flexShrink: 0,
                  background: !e.present ? C.t3 : e.state === 'strong' ? C.green : e.state === 'present' ? C.sky : e.state === 'faint' ? C.orange : C.red }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.t1 }}>
                    {e.label}{e.present ? ` — ${Math.round(e.score * 100)}%` : ''}
                  </div>
                  <div style={{ fontSize: 12, color: C.t3, marginTop: 4, lineHeight: 1.5 }}>{e.note}</div>
                </div>
              </div>
            ))}
          </div>

          {coherence.disconnects?.length ? (
            <div style={{ marginTop: 12 }}>
              {coherence.disconnects.map(d => (
                <div key={d.surface} style={{ ...glass2({ padding: 12 }), borderLeft: `3px solid ${C.orange}`, marginTop: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.t1 }}>{d.label}</div>
                  <div style={{ fontSize: 12, color: C.t2, marginTop: 4, lineHeight: 1.55 }}>{d.detail}</div>
                </div>
              ))}
            </div>
          ) : null}

          {coherence.redundancy?.note ? (
            <div style={{ ...glass2({ padding: 12, marginTop: 8 }), borderLeft: `3px solid ${C.gold}` }}>
              <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.55 }}>{coherence.redundancy.note}</div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Portfolio shape and the Domino state — the structural half.
// ─────────────────────────────────────────────────────────────────────────────
function StructureSection({ result, isMobile }) {
  const pf = result.modules.portfolio;
  const domino = result.modules.domino;

  return (
    <div style={glass({ padding: isMobile ? 16 : 20 })}>
      <SectionTitle icon={Layers} color={C.gold}>The shape of your portfolio</SectionTitle>

      <div style={{ ...G(4, 10, { marginTop: 8 }, isMobile) }}>
        <StatTile icon={Layers} value={pf.counts.tier1} label="Tier 1" sub="target 1" color={C.gold} />
        <StatTile icon={Layers} value={pf.counts.tier2} label="Tier 2" sub="target 3" color={C.sky} />
        <StatTile icon={Layers} value={pf.counts.tier3} label="Tier 3" sub="target 4" color={C.t3} />
        <StatTile icon={Gauge} value={`${Math.round(pf.balance * 100)}%`} label="Balance" sub={pf.shape} color={C.violet} />
      </div>

      <div style={{ fontSize: 13, color: C.t2, marginTop: 12, lineHeight: 1.55 }}>{pf.shapeNote}</div>

      {pf.triggers?.map(t => (
        <div key={t.id} style={{ ...glass2({ padding: 12, marginTop: 8 }), borderLeft: `3px solid ${TONE[t.severity] || C.t3}` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.t1 }}>{t.label}</div>
          <div style={{ fontSize: 12, color: C.t2, marginTop: 4, lineHeight: 1.55 }}>{t.detail}</div>
          {t.protectedFromConsolidation?.length ? (
            <div style={{ fontSize: 11, color: C.green, marginTop: 8 }}>
              Staying exactly where they are: {t.protectedFromConsolidation.join(', ')}.
            </div>
          ) : null}
        </div>
      ))}

      {result.tier === 'premium' ? (
        <Disclosure id="ivy-tiers" title="How each activity was read" icon={Info} color={C.gold} m={isMobile}>
          <div style={CC({ gap: 8 })}>
            {pf.activities.map((a, i) => (
              <div key={i} style={{ ...glass2({ padding: 12 }) }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.t1 }}>{a.name}</span>
                  <span style={pill(a.tier === 1 ? C.gold : a.tier === 2 ? C.sky : C.t3)}>Tier {a.tier}</span>
                  {a.protected ? <span style={pill(C.green)}>protected</span> : null}
                </div>
                <div style={{ fontSize: 12, color: C.t2, marginTop: 4, lineHeight: 1.5 }}>{a.because}</div>
                {a.promotion ? <div style={{ fontSize: 11, color: C.t3, marginTop: 4, lineHeight: 1.5 }}>{a.promotion}</div> : null}
              </div>
            ))}
          </div>
        </Disclosure>
      ) : null}

      {result.tier === 'premium' && domino ? (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.t2, marginBottom: 8 }}>
            The Domino framework — project viability {Math.round(domino.viability * 100)}%, {domino.stage.replace(/-/g, ' ')}
          </div>
          <div style={{ fontSize: 12, color: C.t3, marginBottom: 8, lineHeight: 1.55 }}>{domino.stageNote}</div>
          <div style={CC({ gap: 8 })}>
            {domino.milestones.map(m => (
              <div key={m.key} style={{ ...glass2({ padding: 12 }), display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ width: 8, height: 8, borderRadius: 4, marginTop: 4, flexShrink: 0,
                  background: m.status === 'met' ? C.green : m.status === 'partial' ? C.orange : m.status === 'unknown' ? C.t3 : C.red }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.t1 }}>{m.key} · {m.short}</div>
                  <div style={{ fontSize: 12, color: C.t2, marginTop: 4, lineHeight: 1.5 }}>{m.note}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 5 — the written audit.
// ─────────────────────────────────────────────────────────────────────────────
function EssaySection({ result, isMobile }) {
  const ps = result.essays?.personalStatement;
  if (!ps) {
    return (
      <div style={glass({ padding: 16 })}>
        <SectionTitle icon={PenLine} color={C.fuchsia}>The written audit</SectionTitle>
        <div style={{ color: C.t3, fontSize: 13 }}>
          No personal statement found in your essays. This section is the largest part of the engine and it needs a draft — even a bad complete one.
        </div>
      </div>
    );
  }

  const a = ps.authenticity;
  return (
    <div style={glass({ padding: isMobile ? 16 : 20 })}>
      <SectionTitle icon={PenLine} color={C.fuchsia}>The written audit</SectionTitle>

      <div style={{ ...G(3, 10, { marginTop: 8 }, isMobile) }}>
        <StatTile icon={Sparkles} value={a?.perplexity?.value ?? '—'} label="Voice index" sub="target above 120" color={C.fuchsia} />
        <StatTile icon={Gauge} value={ps.syntax?.available ? `${Math.round(ps.syntax.score * 100)}%` : '—'} label="Syntax" sub="last pass, not the first" color={C.sky} />
        <StatTile icon={Target} value={ps.hook?.available ? (ps.hook.passes ? 'Passes' : 'Needs work') : '—'} label="Opening" sub={ps.hook?.archetypeLabel} color={C.gold} />
      </div>

      {a?.disclaimer ? (
        <div style={{ fontSize: 11, color: C.t3, marginTop: 12, lineHeight: 1.55, fontStyle: 'italic' }}>{a.disclaimer}</div>
      ) : null}

      {ps.hook?.available ? (
        <div style={{ ...glass2({ padding: 12, marginTop: 12 }) }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.t1 }}>Your opening</div>
          <div style={{ fontSize: 13, color: C.t2, marginTop: 8, lineHeight: 1.55, fontStyle: 'italic' }}>“{ps.hook.firstSentence}”</div>
          <div style={{ fontSize: 12, color: C.t2, marginTop: 8, lineHeight: 1.55 }}>{ps.hook.verdict}</div>
        </div>
      ) : null}

      {a?.flags?.map(f => (
        <div key={f.id} style={{ ...glass2({ padding: 12, marginTop: 8 }), borderLeft: `3px solid ${TONE[f.severity] || C.t3}` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.t1 }}>{f.label}</div>
          <div style={{ fontSize: 12, color: C.t2, marginTop: 4, lineHeight: 1.55 }}>{f.detail}</div>
        </div>
      ))}

      <Disclosure id="ivy-sweeps" title="The three editing sweeps" icon={PenLine} color={C.sky} m={isMobile}>
        <div style={CC({ gap: 8 })}>
          {[
            ['Read aloud', ps.syntax?.sweeps?.readAloud],
            ['Transitions', ps.syntax?.sweeps?.transition],
            ['Passive voice', ps.syntax?.sweeps?.passive],
            ['Clutter', ps.syntax?.sweeps?.clutter],
          ].map(([label, sweep]) => (
            <div key={label} style={glass2({ padding: 12 })}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.t1 }}>{label}</div>
              <div style={{ fontSize: 12, color: C.t2, marginTop: 4, lineHeight: 1.5 }}>{sweep?.note || '—'}</div>
              {(sweep?.findings || []).slice(0, 3).map((f, i) => (
                <div key={i} style={{ fontSize: 12, color: C.t3, marginTop: 8, paddingLeft: 8, borderLeft: `2px solid ${tint(C.sky, 0.4)}`, lineHeight: 1.5 }}>
                  {f.fix || f.ask}
                </div>
              ))}
            </div>
          ))}
          {ps.syntax?.sweeps?.adjective ? (
            <div style={glass2({ padding: 12 })}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.t1 }}>Adjectives against objects</div>
              <div style={{ fontSize: 12, color: C.t2, marginTop: 4, lineHeight: 1.5 }}>{ps.syntax.sweeps.adjective.note}</div>
            </div>
          ) : null}
        </div>
      </Disclosure>

      {result.essays.supplements?.length ? (
        <Disclosure id="ivy-supplements" title={`Supplements (${result.essays.supplements.length})`} icon={PenLine} color={C.violet} m={isMobile}>
          <div style={CC({ gap: 12 })}>
            {result.essays.supplements.map((s, i) => (
              <div key={i} style={glass2({ padding: 12 })}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.t1 }}>
                  {s.promptType.replace(/_/g, ' ')} · {s.words} words
                </div>
                {s.storyboard?.available ? (
                  <div style={{ fontSize: 12, color: C.t2, marginTop: 4, lineHeight: 1.55 }}>
                    {s.storyboard.resolutionNote || s.storyboard.note}
                  </div>
                ) : null}
                {(s.storyboard?.findings || []).filter(f => f.severity !== 'good').map((f, j) => (
                  <div key={j} style={{ fontSize: 12, color: C.t2, marginTop: 8, paddingLeft: 8, borderLeft: `2px solid ${TONE[f.severity] || C.t3}`, lineHeight: 1.5 }}>
                    <strong>{f.label}.</strong> {f.detail}
                  </div>
                ))}
                {s.whyUs?.available ? (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.55 }}>{s.whyUs.swapTest.note}</div>
                    {s.whyUs.blocked?.length ? (
                      <div style={{ fontSize: 12, color: C.orange, marginTop: 4 }}>
                        Marketing phrases to cut: {s.whyUs.blocked.map(b => `“${b.match}”`).join(', ')}
                      </div>
                    ) : null}
                    <div style={{ marginTop: 8 }}>
                      {s.whyUs.requirements.map(r => (
                        <div key={r.id} style={{ fontSize: 12, color: r.met ? C.green : C.t3, marginTop: 4 }}>
                          {r.met ? '✓' : '○'} {r.label}{r.met ? '' : ` — ${r.fix}`}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {s.whyMajor?.available ? (
                  <div style={{ fontSize: 12, color: C.t2, marginTop: 8, lineHeight: 1.55 }}>{s.whyMajor.note}</div>
                ) : null}
              </div>
            ))}
          </div>
        </Disclosure>
      ) : null}

      <Disclosure id="ivy-hooks" title="The three openings that work" icon={Sparkles} color={C.gold} m={isMobile}>
        <div style={CC({ gap: 8 })}>
          {HOOK_ARCHETYPE_GUIDE.map(h => (
            <div key={h.id} style={glass2({ padding: 12 })}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.t1 }}>{h.label}</div>
              <div style={{ fontSize: 12, color: C.t2, marginTop: 4, lineHeight: 1.5 }}>{h.move}</div>
              <div style={{ fontSize: 12, color: C.t3, marginTop: 4, fontStyle: 'italic' }}>{h.example}</div>
              <div style={{ fontSize: 11, color: C.orange, marginTop: 4, lineHeight: 1.45 }}>Fails when: {h.fails}</div>
            </div>
          ))}
        </div>
      </Disclosure>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 3 — the authenticity sorter.
// ─────────────────────────────────────────────────────────────────────────────
function ResonanceSection({ result, isMobile }) {
  const r = result.resonance;
  if (!r || r.insufficient) return null;

  return (
    <div style={glass({ padding: isMobile ? 16 : 20 })}>
      <SectionTitle icon={Sparkles} color={C.fuchsia}>The authenticity sorter</SectionTitle>
      <div style={{ fontSize: 13, color: C.t2, marginTop: 8, lineHeight: 1.55 }}>
        Two columns. On the left, the edits a clinical tool would make on this draft — the ones this engine refuses to make. On the right, the ones a reader actually responds to.
      </div>

      <div style={{ ...G(2, 12, { marginTop: 16 }, isMobile) }}>
        <div>
          <div style={{ ...pill(C.red), marginBottom: 8 }}>Refused</div>
          {r.rejected.map(e => (
            <div key={e.id} style={{ ...glass2({ padding: 12, marginBottom: 8 }) }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.t2, textDecoration: 'line-through', opacity: 0.8 }}>{e.clinical}</div>
              <div style={{ fontSize: 12, color: C.t3, marginTop: 4, lineHeight: 1.5 }}>{e.why}</div>
            </div>
          ))}
        </div>
        <div>
          <div style={{ ...pill(C.green), marginBottom: 8 }}>What to do instead</div>
          {r.approved.length ? r.approved.map(e => (
            <div key={e.id} style={{ ...glass2({ padding: 12, marginBottom: 8 }) }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.t1 }}>{e.label}</div>
              {e.note ? <div style={{ fontSize: 12, color: C.t2, marginTop: 4, lineHeight: 1.5 }}>{e.note}</div> : null}
              {(e.targets || []).slice(0, 3).map((t, i) => (
                <div key={i} style={{ fontSize: 12, color: C.t3, marginTop: 8, paddingLeft: 8, borderLeft: `2px solid ${tint(C.green, 0.4)}`, lineHeight: 1.5 }}>
                  {t.sentence ? <div style={{ fontStyle: 'italic', marginBottom: 4 }}>“{t.sentence}”</div> : null}
                  {t.match ? <div style={{ fontStyle: 'italic', marginBottom: 4 }}>“{t.match}”</div> : null}
                  {t.ask || t.redirect}
                </div>
              ))}
            </div>
          )) : (
            <div style={{ ...glass2({ padding: 12 }), fontSize: 12, color: C.t2 }}>
              Nothing to amplify — this draft already shows rather than tells, and it has a cost in it. That is the hard half.
            </div>
          )}
        </div>
      </div>

      {r.stakes?.findings?.length ? (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.t2, marginBottom: 8 }}>Narrative stakes</div>
          {r.stakes.findings.map(f => (
            <div key={f.id} style={{ ...glass2({ padding: 12, marginTop: 8 }), borderLeft: `3px solid ${TONE[f.severity] || C.t3}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.t1 }}>{f.label}</div>
              <div style={{ fontSize: 12, color: C.t2, marginTop: 4, lineHeight: 1.55 }}>{f.detail}</div>
            </div>
          ))}
        </div>
      ) : null}

      <div style={{ ...glass2({ padding: 12, marginTop: 16 }), borderLeft: `3px solid ${C.green}` }}>
        <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.6 }}>{r.safeguard}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 4 — the roadmap.
// ─────────────────────────────────────────────────────────────────────────────
function RoadmapSection({ result, isMobile }) {
  const rm = result.roadmap;
  if (!rm) return null;

  return (
    <div style={glass({ padding: isMobile ? 16 : 20 })}>
      <SectionTitle icon={CalendarDays} color={C.green}>{rm.title}</SectionTitle>
      <div style={{ fontSize: 13, color: C.t2, marginTop: 8, lineHeight: 1.55 }}>{rm.premise}</div>

      {rm.kind === 'senior' ? (
        <SeniorCalendar calendar={rm.calendar} priorities={rm.priorities} isMobile={isMobile} />
      ) : (
        <div style={{ marginTop: 12 }}>
          {rm.items.map(item => (
            <div key={item.id} style={{ ...glass2({ padding: 12, marginTop: 8 }), opacity: item.done ? 0.55 : 1,
              borderLeft: `3px solid ${item.promoted ? C.violet : item.weight === 'high' ? C.gold : C.t3}` }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.t1 }}>{item.label}</span>
                {item.promoted ? <span style={pill(C.violet)}>from your reading</span> : null}
                {item.done ? <span style={pill(C.green)}>done</span> : null}
              </div>
              <div style={{ fontSize: 12, color: C.t2, marginTop: 4, lineHeight: 1.55 }}>{item.detail}</div>
              {item.metric ? <div style={{ fontSize: 11, color: C.t3, marginTop: 4 }}>Done when: {item.metric}</div> : null}
              {item.costNote ? <div style={{ fontSize: 11, color: C.green, marginTop: 4 }}>{item.costNote}</div> : null}
              {item.stillWorth ? <div style={{ fontSize: 11, color: C.sky, marginTop: 4, lineHeight: 1.45 }}>Arriving late: {item.stillWorth}</div> : null}
            </div>
          ))}
        </div>
      )}

      {rm.execution ? (
        <Disclosure id="ivy-execution" title="How to actually get through it" icon={ListChecks} color={C.sky} m={isMobile}>
          <div style={CC({ gap: 12 })}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.t1 }}>{rm.execution.method.title}</div>
              {rm.execution.method.rules.map(r => (
                <div key={r.id} style={{ fontSize: 12, color: C.t2, marginTop: 4, lineHeight: 1.5 }}>
                  <strong>{r.label}.</strong> {r.detail}
                </div>
              ))}
            </div>
            {rm.execution.suggestedSix?.length ? (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.t1, marginBottom: 4 }}>Your six, from this reading</div>
                {rm.execution.suggestedSix.map((t, i) => (
                  <div key={i} style={{ fontSize: 12, color: C.t2, marginTop: 4 }}>{i + 1}. {t.label}</div>
                ))}
              </div>
            ) : null}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.t1, marginBottom: 4 }}>This week's burners</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {rm.execution.burners.map(b => (
                  <span key={b.id} style={pill(b.level === 'high' ? C.gold : b.level === 'medium' ? C.sky : C.t3)}>
                    {b.label}: {b.level}
                  </span>
                ))}
              </div>
              <div style={{ fontSize: 11, color: C.t3, marginTop: 8, lineHeight: 1.5 }}>{rm.execution.healthFloor.note}</div>
            </div>
          </div>
        </Disclosure>
      ) : null}
    </div>
  );
}

function SeniorCalendar({ calendar, priorities, isMobile }) {
  if (!calendar) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: calendar.behind ? C.orange : C.t1, lineHeight: 1.5 }}>
        {calendar.headline}
      </div>

      {calendar.triage ? (
        <div style={{ ...G(2, 12, { marginTop: 12 }, isMobile) }}>
          <div>
            <div style={{ ...pill(C.green), marginBottom: 8 }}>Keeps its deadline</div>
            {calendar.triage.keep.map(k => (
              <div key={k.id} style={{ ...glass2({ padding: 12, marginBottom: 8 }) }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.t1 }}>{k.label}</div>
                <div style={{ fontSize: 11, color: C.t3, marginTop: 4 }}>{fmtDate(k.due)} · {k.why}</div>
              </div>
            ))}
          </div>
          <div>
            <div style={{ ...pill(C.t3), marginBottom: 8 }}>Cut, and what it costs</div>
            {calendar.triage.cut.map(c => (
              <div key={c.id} style={{ ...glass2({ padding: 12, marginBottom: 8 }) }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.t2 }}>{c.label}</div>
                <div style={{ fontSize: 11, color: C.t3, marginTop: 4, lineHeight: 1.45 }}>{c.cost}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {calendar.triage ? (
        <div style={{ fontSize: 12, color: C.t2, marginTop: 8, lineHeight: 1.55, fontWeight: 600 }}>{calendar.triage.rule}</div>
      ) : null}

      <Disclosure id="ivy-senior-months" title="The month-by-month pipeline" icon={CalendarDays} color={C.green} m={isMobile}>
        <div style={CC({ gap: 8 })}>
          {calendar.months.map(m => (
            <div key={m.key} style={{ ...glass2({ padding: 12 }), opacity: m.state === 'past' ? 0.6 : 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: m.state === 'current' ? accentText(C.green) : C.t1 }}>
                {m.title} · {m.done}/{m.total}
              </div>
              {m.items.map(i => (
                <div key={i.id} style={{ fontSize: 12, marginTop: 8, color: i.done ? C.t3 : i.overdue ? C.orange : C.t2, lineHeight: 1.5 }}>
                  {i.done ? '✓' : i.overdue ? '!' : '○'} <strong>{i.label}</strong> — {fmtDate(i.due)}. {i.detail}
                  {i.costNote ? <span style={{ color: C.green }}> {i.costNote}</span> : null}
                </div>
              ))}
            </div>
          ))}
        </div>
      </Disclosure>

      {priorities?.map(p => (
        <div key={p.id} style={{ ...glass2({ padding: 12, marginTop: 8 }), borderLeft: `3px solid ${TONE[p.severity] || C.t3}` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.t1 }}>{p.label}</div>
          <div style={{ fontSize: 12, color: C.t2, marginTop: 4, lineHeight: 1.55 }}>{p.detail}</div>
        </div>
      ))}
    </div>
  );
}

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '');

// ─────────────────────────────────────────────────────────────────────────────
// The remaining modules, itemized. Deliberately last and collapsed: the numbers
// are the evidence for the findings above, not the product.
// ─────────────────────────────────────────────────────────────────────────────
function ModulesSection({ result, isMobile }) {
  const m = result.modules;
  return (
    <Disclosure id="ivy-modules" title="Every module, with its arithmetic" icon={Gauge} color={C.t3} m={isMobile}
      sub="The numbers behind the findings above. Useful when you disagree with one.">
      <div style={CC({ gap: 8 })}>
        <ModuleRow label="Holistic score" value={m.holistic.reported} note={m.holistic.readingNote} />
        <ModuleRow label="Spike index" value={`${m.holistic.spikeIndex} of ${m.holistic.spikeIndexRange[1]}`} note={m.holistic.headline} />
        <ModuleRow label="Project viability" value={m.domino.viability} note={m.domino.stageNote} />
        <ModuleRow label="Portfolio balance" value={m.portfolio.balance} note={m.portfolio.shapeNote} />
        <ModuleRow label="SAT heuristics" value={m.satHeuristics.index ?? '—'} note={m.satHeuristics.note} />
        <ModuleRow label="Retention" value={m.retention.available ? m.retention.sample?.percent + '%' : '—'} note={m.retention.note || m.retention.sample?.note} />
        <ModuleRow label="Storyboard" value={m.storyboard?.score ?? '—'} note={m.storyboard?.resolutionNote || m.storyboard?.note} />
        <ModuleRow label="Authenticity" value={m.authenticity?.index ?? '—'} note={m.authenticity?.disclaimer} />
        <ModuleRow label="Syntax" value={m.syntax?.score ?? '—'} note={m.syntax?.note} />
        <ModuleRow label="Interview alignment" value={m.interview?.available ? m.interview.alignment : '—'} note={m.interview?.headline || m.interview?.note} />
        {m.competitions?.map((c, i) => (
          <ModuleRow key={i} label={`Competition · ${c.label || 'result'}`} value={c.index} note={`${c.ratioLabel}, ${c.bandLabel} scale. ${c.reading} ${c.estimateNote || ''}`} />
        ))}
        {m.differentiation?.map((d, i) => (
          <ModuleRow key={`d${i}`} label={`Differentiation · ${d.label}`} value={d.index} note={`${d.headline} ${d.redirect || ''}`} />
        ))}
      </div>
    </Disclosure>
  );
}

function ModuleRow({ label, value, note }) {
  return (
    <div style={{ ...glass2({ padding: 12 }) }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.t1 }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: accentText(C.violet) }}>{value}</span>
      </div>
      {note ? <div style={{ fontSize: 11, color: C.t3, marginTop: 4, lineHeight: 1.5 }}>{note}</div> : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 6 — never gated, never collapsed.
// ─────────────────────────────────────────────────────────────────────────────
function SafeguardSection({ result, isMobile }) {
  const s = result.safeguards;
  if (!s) return null;

  return (
    <div style={{ ...glass({ padding: isMobile ? 16 : 20 }), border: `1px solid ${tint(C.green, 0.3)}` }}>
      <SectionTitle icon={ShieldCheck} color={C.green}>What this reading is, and is not</SectionTitle>

      <div style={{ marginTop: 8 }}>
        {s.expectations.points.map((p, i) => (
          <div key={i} style={{ fontSize: 12, color: C.t2, marginTop: 8, lineHeight: 1.6, paddingLeft: 12, borderLeft: `2px solid ${tint(C.green, 0.35)}` }}>{p}</div>
        ))}
      </div>

      {s.homogeneity?.warnings?.length ? (
        <div style={{ marginTop: 16 }}>
          {s.homogeneity.warnings.map(w => (
            <div key={w.id} style={{ ...glass2({ padding: 12, marginTop: 8 }), borderLeft: `3px solid ${C.gold}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.t1 }}>{w.label}</div>
              <div style={{ fontSize: 12, color: C.t2, marginTop: 4, lineHeight: 1.55 }}>{w.detail}</div>
            </div>
          ))}
        </div>
      ) : null}

      <div style={{ fontSize: 12, color: C.t2, marginTop: 16, lineHeight: 1.6, fontStyle: 'italic' }}>
        {s.homogeneity?.principle}
      </div>

      <Disclosure id="ivy-ai-policy" title={s.aiPolicy.title} icon={Info} color={C.sky} m={isMobile} defaultOpen>
        <div>
          {s.aiPolicy.points.map((p, i) => (
            <div key={i} style={{ fontSize: 12, color: C.t2, marginTop: 8, lineHeight: 1.6 }}>{p}</div>
          ))}

          {/* Rendered from src/lib/aiPolicy.js — the same source the essay
              workspace and the server-side guard read, so a student sees
              identical wording wherever they meet this promise. */}
          {s.aiPolicy.hardRules?.length ? (
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${tint(C.sky, 0.25)}` }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.t1 }}>{s.aiPolicy.policyHeadline}</div>
              <div style={{ fontSize: 12, color: C.t2, marginTop: 4, lineHeight: 1.6 }}>{s.aiPolicy.policyShort}</div>
              {s.aiPolicy.hardRules.map(r => (
                <div key={r.id} style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.t1 }}>{r.title}</div>
                  <div style={{ fontSize: 12, color: C.t3, marginTop: 4, lineHeight: 1.55 }}>{r.body}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </Disclosure>

      <Disclosure id="ivy-definitions" title="What these labels actually mean" icon={Info} color={C.t3} m={isMobile}>
        <div style={CC({ gap: 8 })}>
          {s.definitions.map(d => (
            <div key={d.id} style={glass2({ padding: 12 })}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.t1 }}>{d.label}</div>
              <div style={{ fontSize: 12, color: C.t2, marginTop: 4, lineHeight: 1.55 }}>{d.institutional}</div>
              <div style={{ fontSize: 11, color: C.orange, marginTop: 4, lineHeight: 1.5 }}>Commonly got wrong: {d.commonError}</div>
              <div style={{ fontSize: 11, color: C.green, marginTop: 4, lineHeight: 1.5 }}>{d.action}</div>
            </div>
          ))}
        </div>
      </Disclosure>

      {s.interval?.reasons?.length ? (
        <Disclosure id="ivy-interval" title="Why the band is as wide as it is" icon={Gauge} color={C.violet} m={isMobile}>
          <div style={CC({ gap: 8 })}>
            <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.6 }}>{s.interval.note}</div>
            {s.interval.reasons.map(r => (
              <div key={r.id} style={{ fontSize: 12, color: C.t3, lineHeight: 1.55, paddingLeft: 8, borderLeft: `2px solid ${tint(C.violet, 0.35)}` }}>
                {r.label} {r.fixable ? <span style={{ color: C.green }}>— you can close this one.</span> : ''}
              </div>
            ))}
          </div>
        </Disclosure>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The upgrade block. Renders only when the engine returned the free shape,
// which today it never does — see the header. Built now so that flipping
// ENFORCE_PREMIUM ships a finished screen rather than a first draft.
// ─────────────────────────────────────────────────────────────────────────────
function UpgradeCard({ locked, isMobile }) {
  if (!locked) return null;
  return (
    <div style={{ ...glass({ padding: isMobile ? 16 : 20 }), border: `1px solid ${tint(C.gold, 0.4)}` }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Lock size={15} style={{ color: C.gold }} />
        <div style={{ ...type(15, { weight: 800 }), color: C.t1 }}>{locked.label}</div>
      </div>
      <div style={{ fontSize: 13, color: C.t2, marginTop: 8, lineHeight: 1.55 }}>{locked.pitch}</div>
      <div style={{ marginTop: 12 }}>
        {locked.included.map((x, i) => (
          <div key={i} style={{ fontSize: 12, color: C.t2, marginTop: 8, display: 'flex', gap: 8 }}>
            <TrendingUp size={13} style={{ color: C.gold, flexShrink: 0, marginTop: 4 }} />{x}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: C.green, marginTop: 12, lineHeight: 1.55 }}>{locked.neverLocked}</div>
    </div>
  );
}
