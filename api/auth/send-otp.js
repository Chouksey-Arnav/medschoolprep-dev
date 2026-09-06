// /api/auth/send-otp — generates a 6-digit code, stores its hash in Supabase,
// and emails it via Nodemailer. The minting, the rate limit and the code check all live in
// api/_lib/otp.js so that this handler, api/auth/verify-otp.js and api/parent/claim.js cannot
// drift into three subtly different answers to "is this code correct".
//
// `purpose` scopes what the code is for and is carried through to verify-otp:
//   - 'signup'         proves inbox ownership before api/auth/complete-signup lets
//                       someone set a password. Blocked if the email already has one.
//   - 'password_reset' proves inbox ownership before api/auth/reset-password. Always
//                       reports success even for unknown emails, to avoid leaking
//                       which addresses have accounts.
//   - 'signin'         proves inbox ownership before api/auth/login mints a session with no
//                       password at all. This is what a parent account uses to get back in:
//                       the claim flow (api/parent/claim.js) creates it WITHOUT a password on
//                       purpose, and without this it would be a one-shot account, usable on the
//                       day their child invited them and never again.
//
//                       It is not a new trust assumption. api/auth/reset-password already turns
//                       control of an inbox into control of the account, and has since the day
//                       passwords were added — this only stops requiring the person to invent a
//                       password on the way through. Like 'password_reset', it reports success
//                       for unknown addresses so the endpoint cannot be used to test which
//                       emails have accounts.
import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';
import { issueOtp, overRequestLimit, ipOf } from '../_lib/otp.js';
import { verifyRecaptcha } from '../_lib/recaptcha.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PURPOSES = ['signup', 'password_reset', 'signin'];

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
  const purpose = PURPOSES.includes(body?.purpose) ? body.purpose : 'signup';
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }

  const ip = ipOf(req);

  const recaptchaOk = await verifyRecaptcha({ token: body?.recaptchaToken, ip, action: 'send_otp' });
  if (!recaptchaOk) {
    return res.status(400).json({ error: 'Could not verify you\'re not a robot. Please try again.', reason: 'recaptcha_failed' });
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: existing } = await supabase
      .from('app_users')
      .select('id, password_hash')
      .eq('email', email)
      .maybeSingle();

    if (purpose === 'signup' && existing?.password_hash) {
      return res.status(409).json({ error: 'An account already exists for this email. Log in instead.' });
    }
    // Don't reveal whether the address has an account — report success without sending.
    if ((purpose === 'password_reset' || purpose === 'signin') && !existing) {
      return res.status(200).json({ success: true });
    }

    if (await overRequestLimit(supabase, { email, ip })) {
      return res.status(429).json({ error: 'Too many code requests. Try again in a few minutes.', reason: 'rate_limited' });
    }

    // `sent: false` means a code issued less than a minute ago is still live and was reused rather
    // than replaced — see RESEND_FLOOR_MS. Still a success from here: a valid code IS in that
    // inbox. Reported so the client can say "already sent — check your inbox" instead of implying
    // a second mail is on its way that never arrives.
    const { sent, waitMs } = await issueOtp(supabase, { email, ip, purpose });
    return res.status(200).json({ success: true, sent, retryAfterMs: waitMs });
  } catch (err) {
    console.error('send-otp error:', err);
    return res.status(500).json({ error: 'Could not send verification code. Please try again.' });
  }
}
