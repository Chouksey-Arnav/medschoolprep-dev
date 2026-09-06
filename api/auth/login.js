// /api/auth/login — mints a session. Rate-limited per email and per IP via the login_attempts
// table (same reasoning as send-otp's DB-backed rate limit: an in-memory counter doesn't survive
// across ephemeral serverless instances).
//
// Two credentials are accepted, and exactly one of them has to be present:
//
//   { email, password }           the ordinary sign-in.
//   { email, verificationToken }  a spent 'signin' code from the send-otp → verify-otp chain.
//
// ── Why the second one exists, and why it is not a weakening ────────────────
// A parent who joins through api/parent/claim.js has no password — that is the whole point of
// that flow, and it is what makes "invite a parent" a thirty-second job instead of a four-screen
// one. Without a code-based way back in, their account would work on the day their child invited
// them and never again.
//
// This does not hand anyone access they did not already have. api/auth/reset-password has always
// turned control of an inbox into control of the account: anyone who can read the mail can set a
// new password and sign in with it. Emailed-code sign-in reaches the same place through the same
// proof, without making the person invent and remember a password on the way. It is strictly less
// state — no new password hash written, nothing for the account owner to have changed under them.
import { getSupabaseAdmin, withRetry } from '../_lib/supabaseAdmin.js';
import { verifyPassword } from '../_lib/password.js';
import { consumeVerificationToken } from '../_lib/verificationToken.js';
import { serializeUser } from '../_lib/serializeUser.js';
import { verifyRecaptcha } from '../_lib/recaptcha.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_EMAIL = 8;
const MAX_PER_IP = 25;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body.' });
  }

  const email = String(body?.email || '').trim().toLowerCase();
  const password = String(body?.password || '');
  const verificationToken = String(body?.verificationToken || '').trim();
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();

  if (!EMAIL_RE.test(email) || (!password && !verificationToken)) {
    return res.status(400).json({ error: 'Enter your email and password.' });
  }

  // Only the password path is gated — the code path already proved inbox ownership through
  // send-otp's own reCAPTCHA check, and gating it a second time would just add friction.
  if (password) {
    const recaptchaOk = await verifyRecaptcha({ token: body?.recaptchaToken, ip, action: 'login' });
    if (!recaptchaOk) {
      return res.status(400).json({ error: 'Could not verify you\'re not a robot. Please try again.', reason: 'recaptcha_failed' });
    }
  }

  try {
    const supabase = getSupabaseAdmin();

    const windowStart = new Date(Date.now() - WINDOW_MS).toISOString();
    const [{ count: emailFails }, { count: ipFails }] = await Promise.all([
      supabase.from('login_attempts').select('id', { count: 'exact', head: true }).eq('email', email).eq('success', false).gte('created_at', windowStart),
      supabase.from('login_attempts').select('id', { count: 'exact', head: true }).eq('ip', ip).eq('success', false).gte('created_at', windowStart),
    ]);
    if ((emailFails ?? 0) >= MAX_PER_EMAIL || (ipFails ?? 0) >= MAX_PER_IP) {
      return res.status(429).json({ error: 'Too many failed attempts. Please wait a few minutes and try again, or reset your password.', reason: 'rate_limited' });
    }

    const record = (success) => supabase.from('login_attempts').insert({ email, ip, success }).then(() => {}, () => {});

    const { data: user, error: userErr } = await withRetry(() => supabase.from('app_users').select('*').eq('email', email).maybeSingle());
    if (userErr) throw userErr;

    if (!user) {
      await record(false);
      return res.status(401).json({ error: 'No account found with that email. Try signing up instead.', reason: 'no_account' });
    }

    // The code path first, because an account with no password legitimately has no other way in.
    // Consuming the token is atomic and scoped to (id, email, purpose, unconsumed) — see
    // api/_lib/verificationToken.js — so a code cannot be replayed into a second session, and one
    // issued for a signup or a password reset cannot be spent here.
    if (verificationToken) {
      const ok = await consumeVerificationToken(supabase, { token: verificationToken, email, purpose: 'signin' });
      if (!ok) {
        await record(false);
        return res.status(401).json({ error: 'That sign-in code has expired. Ask for a new one.', reason: 'verification_expired' });
      }
    } else {
      if (!user.password_hash) {
        await record(false);
        return res.status(401).json({
          error: "This account doesn't have a password. Use “Email me a sign-in code” instead.",
          noPassword: true,
          reason: 'no_password',
        });
      }

      const ok = await verifyPassword(password, user.password_hash);
      if (!ok) {
        await record(false);
        return res.status(401).json({ error: 'Incorrect email or password.', reason: 'bad_password' });
      }
    }

    await record(true);

    const { data: session, error: sessErr } = await withRetry(() => supabase
      .from('sessions')
      .insert({ user_id: user.id, expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString() })
      .select('*')
      .single());
    if (sessErr) throw sessErr;

    return res.status(200).json({ token: session.id, user: serializeUser(user) });
  } catch (err) {
    console.error('login error:', err);
    return res.status(500).json({ error: 'Could not sign in. Please try again.' });
  }
}
