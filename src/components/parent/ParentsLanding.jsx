// /parents — the public page for parents.
//
// ── Why this page exists ────────────────────────────────────────────────────
// The parent dashboard was, until now, undiscoverable. It was real, it worked, and the only ways
// to reach it were: be sent an invitation by a student who already knew the feature existed, or
// notice a second option inside a role picker on the sign-up form. A parent who typed the site
// into their phone and looked for "how do I see how my daughter is doing" found a marketing page
// aimed at students and no answer.
//
// So there is a page now, at a URL a person can be told over the phone, and it is public in
// exactly the sense the legal documents are: it renders for someone signed out, someone signed
// in as a student, and a crawler. A parent deciding whether to make an account has to be able to
// read what the account does — including everything it deliberately cannot do — before making
// one, and a page you have to sign up to read cannot answer the question that decides whether to
// sign up.
//
// It states the limits as prominently as the features on purpose. "You will not see their essays
// or their coach conversations" is not fine print here; it is the product, and it is also the
// sentence that gets a skeptical sixteen-year-old to accept the request.
//
// ── The layout, and why it is not one column ────────────────────────────────
// This page used to render inside a 880px column, centered, on every screen. On the laptop it is
// actually read on that left about a third of the window painted in flat background on each side,
// and — worse than the waste — it pushed the one thing most visitors came here to do (redeem an
// invitation) about two and a half screens down, under three sections of explanation aimed at
// somebody who had not been invited yet.
//
// The two audiences are now side by side rather than stacked. The left of the hero is for the
// parent who has not heard of this; the right is a working invitation box for the parent holding
// a link, which is the majority. Below that, the two "how it works" tracks sit as two columns
// instead of two full-width stacks, because they are alternatives and reading them as a sequence
// is how a parent who had already been invited concluded this was going to be an ordeal.
import React, { useState } from 'react';
import {
  ShieldCheck, Eye, EyeOff, ArrowRight, Users, LineChart, Brain, CalendarDays, Mail, Lock, LogIn,
  KeyRound, Link2, MessageSquare, ClipboardList, Clock,
} from 'lucide-react';
import { C, glass, glass2, btn, btnG, inp, CC, R, tint, onTint } from '../../lib/theme';
import { parseInviteInput } from '../../lib/parentApi';
import { AUTH_VIEWS, LEGAL_VIEWS } from '../../lib/routes';
import { isPlainLeftClick } from '../../lib/useAppRouter';
import AnimatedLogo from '../AnimatedLogo';
import ThemeToggle from '../ThemeToggle';

const SHOWS = [
  { icon: CalendarDays, hue: () => C.green, title: 'Whether they are actually showing up', body: 'Study days across the last eight weeks, this week against the last four, and the current streak — the shape of the gaps, not just a number.' },
  { icon: LineChart, hue: () => C.blue, title: 'Whether it is working', body: 'Lessons passed, quiz averages and how the recent ones compare with the earlier ones, plus every practice-test score and the change since the last.' },
  { icon: Brain, hue: () => C.violet, title: 'What that means, in words', body: 'A plain-language read on the week — including when the honest version is "not much happened", which we say as a fact and never as a verdict about your child.' },
  { icon: MessageSquare, hue: () => C.cyan, title: 'A way to say something', body: 'Send a note, ask them to sit a quiz on a topic, or ask how something went. It lands in their app, not their inbox, and they can reply in a tap.' },
];

const NEVER = [
  'Their conversations with the AI coach',
  'Lesson notes and anything they highlighted',
  'Essay drafts and application writing',
  'Individual quiz answers or what they got wrong',
];

// Two genuinely different routes in, and which one a family is on is decided by who moved first.
// Splitting them out matters: the invited-parent route is the common one and takes half a minute,
// and describing only the other one — the account, the declaration, the attestation — is how a
// parent who had already been invited concluded that this was going to be an ordeal.
const STEPS_INVITED = [
  { n: '1', title: 'Open the link or enter your code', body: 'Whatever your student sent you — the email, a text, or eight characters read out over the phone. All three open the same invitation.' },
  { n: '2', title: 'Read what would be shared', body: 'Their effort and results, never their notes, essays or coach conversations. Stated in full before you agree to anything.' },
  { n: '3', title: 'Press confirm', body: 'If you came from the emailed link, that is the whole sign-up — the link was sent to you, so there is nothing else to prove. With a code you were texted, we email you six digits first.' },
];

const STEPS_INVITING = [
  { n: '1', title: 'Create a parent account', body: 'Your own account with your own email — never your student’s login. It takes a minute and asks who you are, how you are related, and a number we can reach you on.' },
  { n: '2', title: 'Send a request to your student', body: 'Addressed to the email they use to sign in. It names you and states exactly what would be shared and what would not.' },
  { n: '3', title: 'They accept — or they don’t', body: 'Nothing about them reaches you until they say yes from their own inbox. Either of you can end it afterwards, in one tap, and it takes effect immediately.' },
];

/**
 * The way in for a parent holding anything at all — a link, a code, or a forwarded email.
 *
 * ── Why it takes a whole URL and not just eight characters ──────────────────
 * It used to take exactly eight characters, and told anybody who pasted something longer that
 * "that should be 8 characters". The thing a parent is actually holding is almost never eight
 * characters: it is the line their child forwarded, which is a link. So the box was rejecting
 * people who had the correct invitation in their clipboard and telling them they had made a
 * mistake — and the eight-character code, the one thing it did accept, is the form of the
 * invitation that fewest of them ever see.
 *
 * Everything resolves through parseInviteInput now (see src/lib/parentApi.js), which recognises
 * the emailed link, the shared link, a bare code, a raw token, and any of those with the
 * surrounding text still attached — and names each failure specifically, because "that is a link
 * to a different page" and "you are one character short" need different things from the reader.
 *
 * Full page navigation rather than in-app routing on purpose: the invitation screen resolves the
 * invitation from the URL at mount, so arriving there by a real navigation is the simplest correct
 * thing and works identically from a bookmark, a retype, or a share sheet.
 */
function InviteEntry() {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  const submit = (e) => {
    e.preventDefault();
    const parsed = parseInviteInput(value);
    if (!parsed.ok) { setError(parsed.error); return; }
    const query = parsed.token
      ? `token=${encodeURIComponent(parsed.token)}`
      : `code=${encodeURIComponent(parsed.code)}`;
    window.location.href = `/parent-invite?${query}`;
  };

  return (
    <form onSubmit={submit} style={CC({ gap: 8 })}>
      <label htmlFor="msp-invite-input" style={{ fontSize: 12.5, fontWeight: 600, color: C.t2 }}>
        Paste the link they sent you — or type the 8-character code
      </label>
      <div style={R({ gap: 8, flexWrap: 'wrap', alignItems: 'stretch' })}>
        <input
          id="msp-invite-input"
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(''); }}
          placeholder="https://medschoolprep.cloud/parent-invite?…  or  ABCD-EFGH"
          aria-label="Invitation link or code"
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? 'msp-invite-error' : undefined}
          autoComplete="off"
          spellCheck={false}
          style={inp({
            flex: '1 1 260px', minWidth: 0,
            borderColor: error ? C.rose : C.inputBorder,
          })}
        />
        <button type="submit" style={btn(C.blueGrad, { padding: '8px 20px', whiteSpace: 'nowrap' })}>
          <KeyRound size={14} /> Continue
        </button>
      </div>
      {error && (
        <div id="msp-invite-error" role="alert" style={{ fontSize: 12.5, color: C.roseL, lineHeight: 1.55 }}>
          {error}
        </div>
      )}
    </form>
  );
}

/** Cards that reflow by available width rather than by a breakpoint guess. */
const autoGrid = (min = 240, gap = 14) => ({
  display: 'grid', gap, gridTemplateColumns: `repeat(auto-fit,minmax(min(100%,${min}px),1fr))`,
});

/**
 * The page's one horizontal rhythm.
 *
 * `msp-parents-wrap` (src/index.css) is a 1440px container with viewport-proportional gutters
 * rather than the fixed 880px column this page used to live in — see the header note. Vertical
 * padding stays a prop because the sections genuinely want different amounts of it.
 */
function Section({ children, style, id }) {
  return (
    <section id={id} className="msp-parents-wrap" style={style}>
      {children}
    </section>
  );
}

function SectionHead({ eyebrow, title, body, hue = C.blue }) {
  return (
    <div style={{ ...CC({ gap: 8 }), marginBottom: 20, maxWidth: 720 }}>
      {eyebrow && (
        <div style={{ fontSize: 11, fontWeight: 700, color: hue, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))'}}>
          {eyebrow}
        </div>
      )}
      <h2 style={{ fontSize: 'clamp(21px,2.4vw,28px)', fontFamily: C.FD, fontWeight: 800, color: C.t1, margin: 0, letterSpacing: 'calc(-0.02em + var(--msp-letter-spacing))' }}>
        {title}
      </h2>
      {body && <p style={{ fontSize: 14, color: C.t2, lineHeight: 1.55, margin: 0 }}>{body}</p>}
    </div>
  );
}

/** One of the two "how it works" tracks — a numbered list inside its own card. */
function Track({ steps, accent, title, sub, badge }) {
  return (
    <div style={glass({ padding: 'clamp(20px,2.4vw,28px)', ...CC({ gap: 16 }), height: '100%' })}>
      <div style={CC({ gap: 8 })}>
        <span style={{
          ...R({ gap: 4 }), width: 'fit-content', padding: '4px 12px', borderRadius: 999,
          background: tint(accent, 0.12), border: `1px solid ${tint(accent, 0.3)}`,
          fontSize: 11, fontWeight: 700, color: onTint(accent), letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))',
        }}>
          <Clock size={12} /> {badge}
        </span>
        <div style={{ fontSize: 18, letterSpacing: 'calc(-0.17px + var(--msp-letter-spacing))', fontWeight: 800, color: C.t1, fontFamily: C.FD }}>{title}</div>
        <div style={{ fontSize: 13, color: C.t2, lineHeight: 1.55 }}>{sub}</div>
      </div>
      <div style={CC({ gap: 12 })}>
        {steps.map(({ n, title: t, body }) => (
          <div key={n} style={R({ gap: 12, alignItems: 'flex-start' })}>
            <div style={{
              width: 27, height: 27, borderRadius: 8, flexShrink: 0, display: 'flex',
              alignItems: 'center', justifyContent: 'center', fontFamily: C.FD, fontWeight: 800, fontSize: 13,
              background: tint(accent, 0.14), border: `1px solid ${tint(accent, 0.32)}`, color: onTint(accent),
            }}>{n}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.t1 }}>{t}</div>
              <div style={{ fontSize: 12.5, color: C.t2, lineHeight: 1.55, marginTop: 4 }}>{body}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * @param {object}   props
 * @param {Function} props.onSignUp    open the parent sign-up screen
 * @param {Function} props.onLogin     open the parent sign-in screen
 * @param {Function} props.onHome      back to the main landing page
 * @param {Function} props.onOpenLegal in-app navigation to a legal document
 * @param {string}   props.themeMode
 * @param {Function} props.onThemeChange
 */
export default function ParentsLanding({ onSignUp, onLogin, onHome, onOpenLegal, themeMode, onThemeChange }) {
  const legalLink = (path) => (e) => { if (!isPlainLeftClick(e)) return; e.preventDefault(); onOpenLegal?.(path); };
  const nav = (fn) => (e) => { if (!isPlainLeftClick(e)) return; e.preventDefault(); fn?.(); };

  return (
    // flex:1 + its own scroller, because #root is a flex row with overflow:hidden (see
    // src/index.css): a plain block child sizes to its content — leaving the page pinned to a
    // 900px column with the rest of the window painted in the app's background — and anything
    // taller than the viewport simply cannot be scrolled to.
    <div style={{
      flex: 1, minWidth: 0, height: 'var(--msp-vh)', overflowY: 'auto',
      // The wash is what stops a 1440px page reading as a document dropped on a flat rectangle.
      // Two soft ellipses anchored to the top corners, both derived from theme tokens so they
      // repaint with the palette rather than assuming a dark page.
      background: `radial-gradient(ellipse 80% 55% at 12% -8%, ${tint(C.violet, 0.11)} 0%, transparent 62%),`
        + `radial-gradient(ellipse 70% 50% at 92% 0%, ${tint(C.blue, 0.1)} 0%, transparent 58%),`
        + `${C.bg}`,
    }}>
      {/*
        `tint(C.bg, .85)` rather than the C.surf the app shell uses, matching the marketing
        landing page (see LandingPage's nav). C.surf is rgba(255,255,255,.035) — a wash that only
        becomes a surface once backdrop-filter frosts what is behind it, which is fine over a
        static page and not fine over a sticky bar with cards scrolling underneath it: on any
        browser that skips the filter, and on the ones that composite it late, the header's own
        text collides with the text passing behind it.
      */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 10, background: tint(C.bg, 0.85), borderBottom: `1px solid ${C.b1}`,
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      }}>
        <div className="msp-parents-wrap" style={{ padding: '12px clamp(20px, 4vw, 56px)', ...R({ gap: 12 }) }}>
          <a href="/" onClick={nav(onHome)} style={{ ...R({ gap: 8 }), textDecoration: 'none', marginRight: 'auto' }}>
            <AnimatedLogo size={28} variant="pop" />
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: C.t1, fontFamily: C.FD }}>MedSchoolPrep</div>
              <div style={{ fontSize: 10, color: C.t3, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))'}}>For parents</div>
            </div>
          </a>
          <ThemeToggle mode={themeMode} onChange={onThemeChange} align="right" />
          {/* The mirror of the "For parents" button on the student landing page — a parent
              who arrived here first (or a student showing this page to a parent) gets a
              way back to the student sign-up without hunting for the logo. */}
          <a href="/" onClick={nav(onHome)} style={{ ...btnG({ fontSize: 12.5, padding: '8px 12px' }), textDecoration: 'none' }}>
            For students
          </a>
          <a href={AUTH_VIEWS.parentLogin} onClick={nav(onLogin)} style={{ ...btnG({ fontSize: 12.5, padding: '8px 12px' }), textDecoration: 'none' }}>
            <LogIn size={13} /> Parent sign-in
          </a>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <Section style={{ paddingTop: 'clamp(36px,5vw,68px)', paddingBottom: 'clamp(32px,4vw,52px)' }}>
        <div className="msp-parents-hero">
          <div style={CC({ gap: 20 })}>
            <span style={{
              ...R({ gap: 8 }), width: 'fit-content', padding: '4px 12px', borderRadius: 999,
              background: tint(C.violet, 0.11), border: `1px solid ${tint(C.violet, 0.3)}`,
              fontSize: 12, fontWeight: 700, color: C.violetL,
            }}>
              <Users size={13} /> Parent dashboard
            </span>
            <h1 style={{
              fontSize: 'clamp(32px,4.6vw,58px)', lineHeight: 1.05, letterSpacing: 'calc(-0.035em + var(--msp-letter-spacing))',
              fontFamily: C.FD, fontWeight: 800, color: C.t1, margin: 0,
            }}>
              See how they're doing.<br />
              <span style={{
                backgroundImage: `linear-gradient(120deg,${C.violetL} 0%,${C.blueL} 60%,${C.cyanL} 100%)`,
                WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
              }}>Without reading over their shoulder.</span>
            </h1>
            <p style={{ fontSize: 'clamp(15px,1.3vw,17px)', color: C.t2, lineHeight: 1.65, maxWidth: 620, margin: 0 }}>
              A parent account of your own, showing effort and results for the student who invites
              you — study days, lessons passed, quiz averages, practice-test scores, and a plain
              read on the week. You can send them a note or ask for a quiz. Their own notes, essays
              and coach conversations stay theirs.
            </p>
            <div style={R({ gap: 8, flexWrap: 'wrap', marginTop: 4 })}>
              <a href={AUTH_VIEWS.parentSignup} onClick={nav(onSignUp)} style={{ ...btn(C.blueGrad, { fontSize: 14.5, padding: '12px 24px' }), textDecoration: 'none' }}>
                Create a parent account <ArrowRight size={15} />
              </a>
              <a href={AUTH_VIEWS.parentLogin} onClick={nav(onLogin)} style={{ ...btnG({ fontSize: 14.5, padding: '12px 24px' }), textDecoration: 'none' }}>
                I already have one
              </a>
            </div>
            <div style={{ ...R({ gap: 8 }), fontSize: 12.5, color: C.t3 }}>
              <Lock size={13} /> Free. You never sign in as your student, and you never see their password.
            </div>
          </div>

          {/*
            The invitation box, at the top of the page rather than three sections down.

            Most people who reach /parents were sent here by their child and are holding something
            — a link, a forwarded email, eight characters on a scrap of paper. Everything else on
            this page is written for the minority who are deciding, and burying the working control
            underneath their reading material was the single biggest usability problem here.
          */}
          <div style={glass({
            padding: 'clamp(22px,2.6vw,30px)', ...CC({ gap: 16 }),
            background: `linear-gradient(150deg,${tint(C.blue, 0.09)},transparent 70%), ${C.surf}`,
            borderColor: tint(C.blue, 0.3),
          })}>
            <div style={CC({ gap: 8 })}>
              <div style={R({ gap: 8 })}>
                <Link2 size={17} color={C.blueL} />
                <div style={{ fontSize: 18, fontFamily: C.FD, fontWeight: 800, color: C.t1 }}>
                  Already been invited?
                </div>
              </div>
              <div style={{ fontSize: 13, color: C.t2, lineHeight: 1.6 }}>
                Paste whatever your student sent you. The whole line from the email is fine — we
                will find the invitation in it.
              </div>
            </div>

            <InviteEntry />

            <div style={{ height: 1, background: C.b1 }} />

            <div style={CC({ gap: 8 })}>
              {[
                [Mail, 'Opened the emailed link? One press and you are connected — no password, and no second code to wait for.'],
                [KeyRound, 'Typed a code they texted you? We email six digits to the address they invited, because a code that gets forwarded is not proof of who you are.'],
                [ShieldCheck, 'Nothing is shared until you confirm, and either of you can end it in one tap.'],
              ].map(([Icon, text]) => (
                <div key={text} style={R({ gap: 8, alignItems: 'flex-start' })}>
                  <Icon size={13} color={C.t3} style={{ flexShrink: 0, marginTop: 4 }} />
                  <span style={{ fontSize: 12, color: C.t3, lineHeight: 1.55 }}>{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* ── What you see ───────────────────────────────────────────────────── */}
      <Section style={{ paddingBottom: 'clamp(32px,4vw,52px)' }}>
        <SectionHead
          eyebrow="What you get"
          title="What the dashboard shows you"
          body="Four things, updated as they work. No feed to scroll, no notifications to keep up with — you open it when you want to know, and it answers."
        />
        <div style={autoGrid(260, 16)}>
          {SHOWS.map(({ icon: Icon, hue, title, body }) => {
            const c = hue();
            return (
              <div key={title} style={glass({ padding: 20, ...CC({ gap: 12 }), height: '100%' })}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: tint(c, 0.13), border: `1px solid ${tint(c, 0.3)}`,
                }}>
                  <Icon size={17} color={c} />
                </div>
                <div style={{ fontSize: 15.5, fontWeight: 800, color: C.t1, fontFamily: C.FD, lineHeight: 1.3 }}>{title}</div>
                <div style={{ fontSize: 13, color: C.t2, lineHeight: 1.6 }}>{body}</div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* ── What you don't ─────────────────────────────────────────────────── */}
      <Section style={{ paddingBottom: 'clamp(32px,4vw,52px)' }}>
        <div style={glass({ padding: 'clamp(22px,2.8vw,34px)', ...CC({ gap: 16 }) })}>
          <div className="msp-parents-split" style={{ alignItems: 'center' }}>
            <div style={CC({ gap: 12 })}>
              <div style={R({ gap: 8 })}>
                <EyeOff size={17} color={C.t3} />
                <h2 style={{ fontSize: 'clamp(19px,2vw,24px)', fontFamily: C.FD, fontWeight: 800, color: C.t1, margin: 0, letterSpacing: 'calc(-0.02em + var(--msp-letter-spacing))' }}>
                  What you will never see
                </h2>
              </div>
              <p style={{ fontSize: 13.5, color: C.t2, lineHeight: 1.55, margin: 0 }}>
                Not a setting, and not something we ask you to promise — the parent view is built
                from an allowlist of progress fields, so these are not sent to your browser at all.
                That boundary is why students agree to share the rest of it, and why the app stays
                somewhere they will think out loud.
              </p>
            </div>
            <div style={autoGrid(230, 10)}>
              {NEVER.map((item) => (
                <div key={item} style={glass2({ ...R({ gap: 8, alignItems: 'flex-start' }), height: '100%' })}>
                  <EyeOff size={14} color={C.t3} style={{ flexShrink: 0, marginTop: 4 }} />
                  <span style={{ fontSize: 13, color: C.t2, lineHeight: 1.5 }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* ── How it works: the two tracks, side by side ─────────────────────── */}
      <Section style={{ paddingBottom: 'clamp(32px,4vw,52px)' }}>
        <SectionHead
          eyebrow="Getting connected"
          title="Two ways in, depending on who moved first"
          body="They are not two halves of one process — you will only ever do one of them."
          hue={C.greenL}
        />
        <div className="msp-parents-split" style={{ alignItems: 'stretch' }}>
          <Track
            steps={STEPS_INVITED}
            accent={C.green}
            badge="About 30 seconds"
            title="Your student invited you"
            sub="The common one, and there is no password anywhere in it."
          />
          <Track
            steps={STEPS_INVITING}
            accent={C.blue}
            badge="About a minute"
            title="You're the one starting"
            sub="Longer, on purpose. A request arriving at a student's inbox has to say who is asking, and that means we have to ask you first."
          />
        </div>
        <div style={glass2({ ...R({ gap: 12, alignItems: 'flex-start' }), marginTop: 16 })}>
          <ShieldCheck size={16} color={C.greenL} style={{ flexShrink: 0, marginTop: 4 }} />
          <div style={{ fontSize: 12.5, color: C.t2, lineHeight: 1.55 }}>
            Because access depends on the student accepting from their own mailbox, knowing a
            student's name or email is never enough to see anything about them — and the details
            you give us are shown to them, so a request from someone they don't know is obvious at
            a glance.
          </div>
        </div>
      </Section>

      {/* ── Staying involved ───────────────────────────────────────────────── */}
      <Section style={{ paddingBottom: 'clamp(36px,4vw,60px)' }}>
        <div style={glass({
          padding: 'clamp(24px,3vw,40px)',
          background: `linear-gradient(135deg,${tint(C.violet, 0.09)},transparent 65%), ${C.surf}`,
          borderColor: tint(C.violet, 0.26),
        })}>
          <div className="msp-parents-split" style={{ alignItems: 'center', gap: 'clamp(20px,3vw,40px)' }}>
            <div style={CC({ gap: 12 })}>
              <div style={R({ gap: 8 })}>
                <MessageSquare size={17} color={C.violetL} />
                <h2 style={{ fontSize: 'clamp(19px,2vw,24px)', fontFamily: C.FD, fontWeight: 800, color: C.t1, margin: 0, letterSpacing: 'calc(-0.02em + var(--msp-letter-spacing))' }}>
                  You can say something, not just watch
                </h2>
              </div>
              <p style={{ fontSize: 13.5, color: C.t2, lineHeight: 1.55, margin: 0 }}>
                A dashboard that only shows numbers turns every conversation into an interrogation
                at dinner. From the parent view you can send a short note, ask them to sit a quiz on
                a specific topic, or ask a question about the week — and see whether they picked it
                up. It arrives in their app rather than their inbox, so it is one line in the place
                they are already working instead of another email to ignore.
              </p>
              <div style={{ ...R({ gap: 8 }), fontSize: 12.5, color: C.t3 }}>
                <ShieldCheck size={13} /> They can mark it done or say no. Nothing you send changes their plan on its own.
              </div>
            </div>
            <div style={autoGrid(200, 10)}>
              {[
                { icon: MessageSquare, hue: C.violet, label: 'A note', body: '“Proud of you for the four days this week.”' },
                { icon: ClipboardList, hue: C.blue, label: 'A quiz request', body: 'Pick a topic; it shows up on their plan as a suggestion.' },
                { icon: Eye, hue: C.cyan, label: 'A question', body: '“How did the practice test feel?” — answered in a tap.' },
              ].map(({ icon: Icon, hue, label, body }) => (
                <div key={label} style={glass2({ ...CC({ gap: 8 }), height: '100%' })}>
                  <Icon size={15} color={hue} />
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.t1 }}>{label}</div>
                  <div style={{ fontSize: 12, color: C.t3, lineHeight: 1.55 }}>{body}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* ── Closing call to action ─────────────────────────────────────────── */}
      <Section style={{ paddingBottom: 'clamp(40px,5vw,64px)' }}>
        <div style={glass({
          padding: 'clamp(24px,3vw,40px)', ...CC({ gap: 16, alignItems: 'center' }),
          textAlign: 'center',
          background: `linear-gradient(135deg,${tint(C.blue, 0.08)},transparent 65%), ${C.surf}`,
          borderColor: tint(C.blue, 0.26),
        })}>
          <h2 style={{ fontSize: 'clamp(20px,2.4vw,28px)', fontFamily: C.FD, fontWeight: 800, color: C.t1, margin: 0, letterSpacing: 'calc(-0.02em + var(--msp-letter-spacing))' }}>
            Start where you actually are
          </h2>
          <p style={{ fontSize: 14, color: C.t2, lineHeight: 1.55, margin: 0, maxWidth: 620 }}>
            Holding an invitation? Paste it at the top of this page. Nobody has invited you yet?
            Create an account and send your student a request — they decide, from their own inbox.
          </p>
          <div style={R({ gap: 8, flexWrap: 'wrap', justifyContent: 'center' })}>
            <a href={AUTH_VIEWS.parentSignup} onClick={nav(onSignUp)} style={{ ...btn(C.blueGrad, { fontSize: 14, padding: '12px 20px' }), textDecoration: 'none' }}>
              Create a parent account <ArrowRight size={14} />
            </a>
            <a href={AUTH_VIEWS.parentLogin} onClick={nav(onLogin)} style={{ ...btnG({ fontSize: 14, padding: '12px 20px' }), textDecoration: 'none' }}>
              <Eye size={13} /> Sign in to your dashboard
            </a>
          </div>
        </div>
      </Section>

      <footer style={{ borderTop: `1px solid ${C.b1}`, padding: '20px 0px 44px' }}>
        <Section>
          <div style={R({ gap: 16, flexWrap: 'wrap' })}>
            <a href="/" onClick={nav(onHome)} style={{ fontSize: 12.5, color: C.t3, textDecoration: 'none' }}>MedSchoolPrep home</a>
            <a href={LEGAL_VIEWS.privacy} onClick={legalLink(LEGAL_VIEWS.privacy)} style={{ fontSize: 12.5, color: C.blueL, fontWeight: 600 }}>Privacy Policy</a>
            <a href={LEGAL_VIEWS.terms} onClick={legalLink(LEGAL_VIEWS.terms)} style={{ fontSize: 12.5, color: C.blueL, fontWeight: 600 }}>Terms of Service</a>
          </div>
        </Section>
      </footer>
    </div>
  );
}
