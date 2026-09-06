// Server-side half of reCAPTCHA v3 — see src/lib/recaptcha.js for the client half and for why
// the two envs (RECAPTCHA_SECRET_KEY here, VITE_RECAPTCHA_SITE_KEY on the client) turn on
// together rather than one enforcing against the other's absence.
//
// v3 has no challenge to fail — it returns a 0..1 score for how human the request looked, and
// callers decide the bar. A low score is treated the same as a wrong password: reported as
// generic verification failure, never as "you looked like a bot", which would just teach an
// attacker what to tune.
const VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';
const MIN_SCORE = 0.5;

/**
 * @param {string} token   the client-supplied recaptchaToken, or ''/undefined.
 * @param {string} ip      the requester's IP, passed through to Google for its own scoring.
 * @param {string} action  must match the `action` the client requested the token for.
 * @returns {Promise<boolean>} true when the request should proceed.
 *
 * Resolves true (skips verification) whenever RECAPTCHA_SECRET_KEY isn't configured, so
 * environments that haven't been given the key yet keep working rather than locking everyone
 * out of signup and login.
 */
export async function verifyRecaptcha({ token, ip, action }) {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;

  try {
    const params = new URLSearchParams({ secret, response: token });
    if (ip && ip !== 'unknown') params.set('remoteip', ip);

    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    const data = await res.json();

    if (!data.success) return false;
    if (action && data.action && data.action !== action) return false;
    return typeof data.score === 'number' ? data.score >= MIN_SCORE : true;
  } catch (err) {
    console.error('recaptcha verify error:', err);
    // A Google outage should not be indistinguishable from a real bot — fail open rather than
    // taking signup and login down with it.
    return true;
  }
}
