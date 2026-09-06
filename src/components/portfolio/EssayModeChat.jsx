import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MessagesSquare, ArrowUp, RefreshCw, ShieldCheck, AlertTriangle } from 'lucide-react';
import { C, glass2, btn, inp, R, CC, tint, pill } from '../../lib/theme';
import { renderMarkdown } from '../../lib/renderMarkdown';
import { buildEssayModePrompt, askEssayCoach, looksLikeGhostwritingRequest } from '../../lib/essayMode';
import { AI_POLICY } from '../../lib/aiPolicy';

// ─────────────────────────────────────────────────────────────────────────────
// Essay mode, in the workspace.
//
// The critique (EssayCritique.jsx) is a verdict on a finished draft. This is the
// other half of what a writing teacher does, and the half students need far more
// often: a conversation about a paragraph that is technically fine and says
// nothing.
//
// Two things about this surface are load-bearing rather than cosmetic:
//
//   • IT SAYS WHAT IT WILL NOT DO, BEFORE IT IS ASKED. The line under the header
//     is not a disclaimer — it is the product's most defensible claim, stated as
//     a value ("every word stays yours") rather than as a restriction ("we can't
//     write for you"). A student who learns the boundary from the product's
//     posture never has to learn it from a refusal, and a student who knows a
//     tool will not ghostwrite is a student who can show a teacher their whole
//     history without flinching.
//   • THE BOUNDARY IS ENFORCED SERVER-SIDE. purpose:'essaycoach' routes every
//     turn through the prose guard in api/groq.js. What is written here in the
//     header is what actually happens to the bytes, which is the difference
//     between a policy and a promise.
// ─────────────────────────────────────────────────────────────────────────────

// A conversation about one paragraph does not need forty turns of history, and
// the essay draft is already in the system prompt. Six keeps the thread coherent
// without spending the input budget twice on the same material.
const HISTORY_TURNS = 6;

export default function EssayModeChat({
  essay, draft = '', user = null, gradeLabel = null, collegeName = null,
  portfolioSummary = null, arcSummary = null, critiquePasses = 0, isMobile = false,
}) {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

  // A different essay is a different conversation. Carrying the thread across
  // would have the coach asking sharpening questions about the wrong draft.
  useEffect(() => { setMsgs([]); setInput(''); }, [essay?.id]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [msgs, loading]);

  const send = useCallback(async (text) => {
    const message = String(text || '').trim();
    if (!message || loading) return;
    const next = [...msgs, { role: 'user', content: message }];
    setMsgs(next);
    setInput('');
    setLoading(true);
    try {
      const system = buildEssayModePrompt({
        user, gradeLabel,
        title: essay?.title || null,
        prompt: essay?.prompt || '',
        wordLimit: essay?.word_limit || null,
        collegeName,
        draftWordCount: (draft.trim().match(/\S+/g) || []).length,
        // The draft travels as data inside clearly marked boundaries, and the
        // prompt says so explicitly — a student who pastes "ignore previous
        // instructions" into their essay is writing an essay, not issuing one.
        draftExcerpt: draft.trim() ? draft.trim().slice(0, 9000) : null,
        critiquePasses,
        portfolioSummary,
        arcSummary,
      });
      const reply = await askEssayCoach({
        message,
        history: next.slice(-HISTORY_TURNS).map(m => ({ role: m.role, content: m.content })),
        system,
      });
      setMsgs(m => [...m, { role: 'assistant', content: reply }]);
    } catch (err) {
      setMsgs(m => [...m, { role: 'error', content: err.message }]);
    }
    setLoading(false);
  }, [msgs, loading, user, gradeLabel, essay, draft, collegeName, portfolioSummary, arcSummary, critiquePasses]);

  // Shown only as a heads-up as they type, never as a block: the request is
  // reasonable, the answer is a good conversation, and telling them what will
  // happen before they hit send is kinder than a refusal after.
  const asking = looksLikeGhostwritingRequest(input);

  const STARTERS = [
    'What is this essay actually about? I cannot tell anymore.',
    'Which paragraph in here is doing no work?',
    'Is my opening earning attention or am I clearing my throat?',
  ];

  return (
    <div style={{ ...glass2({ padding: isMobile ? 12 : 16 }), border: `1px solid ${tint(C.violet, 0.25)}` }}>
      <div style={R({ gap: 8, marginBottom: 4, flexWrap: 'wrap' })}>
        <MessagesSquare size={14} color={C.violetL} />
        <span style={{ fontSize: 13, fontWeight: 700, color: C.t1 }}>Talk it through</span>
        <span style={pill(tint(C.teal, 0.12), C.tealL || C.teal, { fontSize: 9 })}>your words only</span>
      </div>
      {/* Stated as a value, prominently, where the writing is — not apologized
          for in a footnote and not buried in the terms. */}
      <div style={R({ gap: 8, alignItems: 'flex-start', marginBottom: 12 })}>
        <ShieldCheck size={12} color={C.tealL || C.teal} style={{ marginTop: 4, flexShrink: 0 }} />
        <div style={{ fontSize: 11.5, color: C.t3, lineHeight: 1.55 }}>
          <b style={{ color: C.t2 }}>{AI_POLICY.headline}.</b>{' '}
          This asks the questions that get you to what you are trying to say. It will not write a
          sentence of it — that is the point, and it is what makes your draft defensible to any
          reader who asks.
        </div>
      </div>

      {msgs.length === 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill,minmax(220px,1fr))', gap: 8, marginBottom: 12 }}>
          {STARTERS.map((s, i) => (
            <button key={i} onClick={() => send(s)} disabled={loading}
              style={{ textAlign: 'left', padding: '12px 12px', borderRadius: 12, border: `1px solid ${C.b1}`, background: C.surf2, color: C.t2, fontSize: 12, lineHeight: 1.5, fontFamily: C.FB, cursor: 'pointer' }}>
              {s}
            </button>
          ))}
        </div>
      )}

      {msgs.length > 0 && (
        <div role="log" aria-live="polite" style={{ ...CC({ gap: 12 }), maxHeight: 380, overflowY: 'auto', marginBottom: 12, paddingRight: 4 }}>
          {msgs.map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div className={m.role === 'assistant' ? 'msp-md' : undefined}
                style={{
                  maxWidth: '86%', padding: '12px 12px', fontSize: 12.5, lineHeight: 1.7, fontFamily: C.FB,
                  borderRadius: m.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                  background: m.role === 'user' ? tint(C.violet, 0.16) : m.role === 'error' ? C.roseDim : C.s2,
                  border: `1px solid ${m.role === 'error' ? tint(C.rose, 0.3) : C.b1}`,
                  color: m.role === 'error' ? C.t2 : C.t1,
                }}>
                {m.role === 'assistant'
                  ? <div dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
                  : m.content}
              </div>
            </div>
          ))}
          {loading && <div style={R({ gap: 8, color: C.t3, fontSize: 12 })}><RefreshCw size={12} className="spin" />Reading your draft…</div>}
          <div ref={endRef} />
        </div>
      )}

      {asking && (
        <div style={R({ gap: 8, marginBottom: 8, alignItems: 'flex-start' })}>
          <AlertTriangle size={12} color={C.amberL} style={{ marginTop: 4, flexShrink: 0 }} />
          <div style={{ fontSize: 11.5, color: C.t3, lineHeight: 1.55 }}>
            It will not write that. Ask it what is missing from the paragraph instead — you will get further, faster.
          </div>
        </div>
      )}

      <div style={R({ gap: 8, alignItems: 'flex-end' })}>
        <label htmlFor="essay-mode-input" className="msp-sr-only">Ask about this essay</label>
        <textarea id="essay-mode-input" value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
          placeholder="Paste the paragraph you are unsure about, or tell me what it is meant to do."
          disabled={loading}
          style={{ ...inp({ resize: 'none', minHeight: 44, maxHeight: 112, fontSize: 12.5, lineHeight: 1.6, fontFamily: C.FB, borderRadius: 12, padding: '12px 12px' }), flex: 1 }} />
        <button onClick={() => send(input)} disabled={loading || !input.trim()} aria-label="Send"
          style={{ ...btn(C.violetGrad, { padding: '0 16px', height: 44, borderRadius: 12, opacity: loading || !input.trim() ? 0.55 : 1 }), display: 'inline-flex', alignItems: 'center' }}>
          {loading ? <RefreshCw size={15} className="spin" /> : <ArrowUp size={15} />}
        </button>
      </div>
    </div>
  );
}
