import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Mail, ArrowRight, GraduationCap, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { C, btn, inp, lbl, CC, tint, CONTROL_TRANSITION } from '../../lib/theme';
import { AUTH_VIEWS } from '../../lib/routes';
import * as AuthAPI from '../../lib/authApi';
import { OtpBoxes, ResendTimer, PasswordField, PasswordStrengthMeter, PasswordChecklist, passwordError, FieldError, BackButton, OrDivider, ConsentNotice } from './ui';
import GoogleButton from './GoogleButton';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_RE = /^\d{6}$/;

/**
 * The two kinds of account, chosen once and never again.
 *
 * Role is written at account creation and by no endpoint afterwards (see api/auth/complete-signup.js
 * and migration 0006's header) — a student who could flip themselves to 'parent' could then invite
 * anyone and read their progress. That makes this control the single moment the decision is made,
 * which is why it states the consequence rather than just naming the two options.
 */
const ROLES = [
  {
    id: 'student', icon: GraduationCap, hue: () => C.blue,
    title: "I'm the student",
    desc: 'Lessons, practice tests, essays, and your whole application in one place.',
  },
  {
    id: 'parent', icon: Users, hue: () => C.violet,
    title: "I'm a parent or guardian",
    desc: "Follow your student's progress once they accept. You won't have lessons of your own.",
  },
];

/**
 * The role, when the URL has already decided it.
 *
 * /parents/signup exists so a parent never has to find the right radio button — they followed a
 * link that says "for parents" and the form should simply be the parent form. Rendered as a
 * statement of what is being created rather than a disabled control, because a grayed-out picker
 * invites people to try to click it.
 */
function LockedRole({ role }) {
  const meta = ROLES.find((r) => r.id === role) || ROLES[0];
  const Icon = meta.icon;
  const c = meta.hue();
  return (
    <div style={{
      display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 12px', borderRadius: 8,
      background: tint(c, 0.10), border: `1px solid ${tint(c, 0.45)}`,
    }}>
      <div style={{
        width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: tint(c, 0.13), border: `1px solid ${tint(c, 0.28)}`,
      }}>
        <Icon size={15} color={c} />
      </div>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: C.t1 }}>{meta.title}</div>
        <div style={{ fontSize: 11.5, color: C.t3, marginTop: 4, lineHeight: 1.5 }}>{meta.desc}</div>
      </div>
    </div>
  );
}

function RolePicker({ value, onChange }) {
  return (
    <div style={CC({ gap: 8 })}>
      <label style={lbl({ marginBottom: 0 })}>What kind of account?</label>
      {ROLES.map(({ id, icon: Icon, hue, title, desc }) => {
        const c = hue();
        const on = value === id;
        return (
          <button
            key={id} type="button" onClick={() => onChange(id)}
            aria-pressed={on}
            style={{
              display: 'flex', gap: 12, alignItems: 'flex-start', textAlign: 'left', width: '100%',
              padding: '12px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: C.FB,
              background: on ? tint(c, 0.10) : C.surf2,
              border: `1px solid ${on ? tint(c, 0.45) : C.b1}`,
              transition: CONTROL_TRANSITION,
            }}
          >
            <div style={{
              width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              background: tint(c, 0.13), border: `1px solid ${tint(c, 0.28)}`,
            }}>
              <Icon size={15} color={c} />
            </div>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: C.t1 }}>{title}</div>
              <div style={{ fontSize: 11.5, color: C.t3, marginTop: 4, lineHeight: 1.5 }}>{desc}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default function SignupView({ initialEmail = '', initialRole = 'student', lockedRole = null, onBack, onGoLogin, onAuthed }) {
  const [step, setStep] = useState('email'); // email | code | password
  const [email, setEmail] = useState(initialEmail);
  const [role, setRole] = useState(lockedRole || (initialRole === 'parent' ? 'parent' : 'student'));
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [verificationToken, setVerificationToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [existingAccount, setExistingAccount] = useState(false);

  async function handleSendCode(e) {
    e.preventDefault();
    setError('');
    setExistingAccount(false);
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) return setError('Enter a valid email address.');

    setBusy(true);
    try {
      await AuthAPI.sendSignupCode(trimmed);
      setStep('code');
      toast.success('Code sent — check your inbox.');
    } catch (err) {
      setError(err.message);
      if (err.message.includes('already exists')) setExistingAccount(true);
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    try {
      await AuthAPI.sendSignupCode(email.trim());
      toast.success('New code sent.');
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleVerify(e) {
    e.preventDefault();
    setError('');
    if (!CODE_RE.test(code)) return setError('Enter the 6-digit code.');

    setBusy(true);
    try {
      const { verificationToken } = await AuthAPI.verifySignupCode(email.trim(), code);
      setVerificationToken(verificationToken);
      setStep('password');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCreatePassword(e) {
    e.preventDefault();
    setError('');
    const pwErr = passwordError(password);
    if (pwErr) return setError(pwErr);
    if (password !== confirm) return setError('Passwords do not match.');

    setBusy(true);
    try {
      const { token, user } = await AuthAPI.completeSignup(email.trim(), verificationToken, password, role);
      toast.success('Account created.');
      onAuthed(token, user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <BackButton
        onClick={step === 'email' ? onBack : () => { setStep('email'); setError(''); }}
        label={step === 'email' ? (lockedRole === 'parent' ? 'Back to the parent page' : 'Back to home') : 'Use a different email'}
      />
      <AnimatePresence mode="wait">
        {step === 'email' && (
          <motion.form key="email" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onSubmit={handleSendCode}>
            <div style={CC({ gap: 16 })}>
              <div>
                <div style={{ fontSize: 20, letterSpacing: 'calc(-0.28px + var(--msp-letter-spacing))', fontWeight: 800, color: C.t1, fontFamily: C.FD, marginBottom: 4 }}>
                  {lockedRole === 'parent' ? 'Create your parent account' : 'Create your account'}
                </div>
                <div style={{ fontSize: 13, color: C.t2 }}>
                  {lockedRole === 'parent'
                    ? "Your own account, with your own email — never your student's. We'll email you a 6-digit code to verify it."
                    : "We'll email you a 6-digit code to verify it's really you."}
                </div>
              </div>
              {lockedRole ? <LockedRole role={lockedRole} /> : <RolePicker value={role} onChange={setRole} />}
              {/*
                Stated at the top of the parent flow rather than sprung on them after the
                password screen. A parent who learns only at the end that there is a form to fill
                in and a student who has to approve them reads it as a bait and switch; a parent
                told up front reads it as the reason the thing is safe.
              */}
              {lockedRole === 'parent' && (
                <div style={{ fontSize: 12, color: C.t3, lineHeight: 1.55 }}>
                  After this you'll tell us who you are and who you're here for, then send your
                  student a request. Nothing about them is visible until they accept it.
                </div>
              )}
              <ConsentNotice />
              <GoogleButton label="Sign up with Google" role={role} />
              <OrDivider />
              <div>
                <label style={lbl()}>Email</label>
                <div style={{ position: 'relative' }}>
                  <Mail size={15} color={C.t3} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                  <input autoFocus type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" style={inp({ paddingLeft: 36 })} />
                </div>
              </div>
              <FieldError>{error}</FieldError>
              {existingAccount && (
                <button type="button" onClick={() => onGoLogin(email.trim())} style={{ ...btn(C.blueGrad, { width: '100%' }) }}>Log in instead <ArrowRight size={14} /></button>
              )}
              <button type="submit" disabled={busy} style={btn(C.blueGrad, { width: '100%', opacity: busy ? 0.7 : 1 })}>
                {busy ? 'Sending…' : <>Continue <ArrowRight size={14} /></>}
              </button>
              <div style={{ textAlign: 'center', fontSize: 12.5, color: C.t3 }}>
                Already have an account?{' '}
                <button type="button" onClick={() => onGoLogin(email.trim())} className="msp-auth-link" style={{ color: C.blueL, fontWeight: 600 }}>Log in</button>
              </div>
              {!lockedRole && (
                <div style={{ textAlign: 'center', fontSize: 12.5, color: C.t3 }}>
                  Setting this up for your child?{' '}
                  <a href={AUTH_VIEWS.parentSignup} className="msp-auth-link" style={{ color: C.violetL, fontWeight: 600 }}>Create a parent account</a>
                </div>
              )}
              {lockedRole === 'parent' && (
                <div style={{ textAlign: 'center', fontSize: 12.5, color: C.t3 }}>
                  Are you the student?{' '}
                  <a href={AUTH_VIEWS.signup} className="msp-auth-link" style={{ color: C.blueL, fontWeight: 600 }}>Create a student account</a>
                </div>
              )}
            </div>
          </motion.form>
        )}

        {step === 'code' && (
          <motion.form key="code" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onSubmit={handleVerify}>
            <div style={CC({ gap: 16 })}>
              <div>
                <div style={{ fontSize: 20, letterSpacing: 'calc(-0.28px + var(--msp-letter-spacing))', fontWeight: 800, color: C.t1, fontFamily: C.FD, marginBottom: 4 }}>Check your inbox</div>
                <div style={{ fontSize: 13, color: C.t2 }}>Enter the 6-digit code sent to <strong style={{ color: C.t1 }}>{email}</strong></div>
              </div>
              <OtpBoxes value={code} onChange={setCode} />
              <FieldError>{error}</FieldError>
              <button type="submit" disabled={busy} style={btn(C.blueGrad, { width: '100%', opacity: busy ? 0.7 : 1 })}>
                {busy ? 'Verifying…' : <>Verify code <ArrowRight size={14} /></>}
              </button>
              <div style={{ textAlign: 'center' }}>
                <ResendTimer onResend={resendCode} />
              </div>
            </div>
          </motion.form>
        )}

        {step === 'password' && (
          <motion.form key="password" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onSubmit={handleCreatePassword}>
            <div style={CC({ gap: 16 })}>
              <div>
                <div style={{ fontSize: 20, letterSpacing: 'calc(-0.28px + var(--msp-letter-spacing))', fontWeight: 800, color: C.t1, fontFamily: C.FD, marginBottom: 4 }}>Create a password</div>
                <div style={{ fontSize: 13, color: C.t2 }}>Email verified. Now set a password to finish creating your account.</div>
              </div>
              <div>
                <PasswordField label="Password" value={password} onChange={setPassword} autoComplete="new-password" placeholder="Create a password" autoFocus />
                <PasswordStrengthMeter password={password} />
                <PasswordChecklist password={password} />
              </div>
              <PasswordField label="Confirm password" value={confirm} onChange={setConfirm} autoComplete="new-password" placeholder="Re-enter your password" />
              <FieldError>{error}</FieldError>
              {/*
                Consent sits immediately above the button that forms the
                contract, not in a footer and not behind a "learn more". That
                placement is the whole ballgame for a clickwrap: courts ask
                whether a reasonable user had notice of the terms and
                manifested assent, and terms linked from somewhere else on the
                page routinely fail that test. The links open in a new tab so
                reading them cannot cost a half-finished signup.
              */}
              <ConsentNotice />
              <button type="submit" disabled={busy} style={btn(C.blueGrad, { width: '100%', opacity: busy ? 0.7 : 1 })}>
                {busy ? 'Creating account…' : <>Create account <ArrowRight size={14} /></>}
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </>
  );
}
