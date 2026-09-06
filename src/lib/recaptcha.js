// reCAPTCHA v3 client. Invisible — no checkbox, no puzzle — it scores each request in the
// background and the score is what api/_lib/recaptcha.js checks server-side.
//
// Off by default: with no VITE_RECAPTCHA_SITE_KEY configured (local dev, a preview deploy that
// hasn't been given one), getRecaptchaToken resolves to null and every caller sends the auth
// request without a token. The server treats a missing token as accepted whenever
// RECAPTCHA_SECRET_KEY itself isn't set, so the two envs turn on together — set one without the
// other and verification simply doesn't run rather than 500ing on every login.
// Guarded like src/lib/sat/desmos.js's VITE_DESMOS_API_KEY read: this module is reachable from
// scripts/verifyParentDashboard.mjs's plain-Node import of src/lib/parentApi.js (via authApi.js),
// where there is no Vite and `import.meta.env` itself is undefined rather than merely missing the
// key.
const SITE_KEY = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_RECAPTCHA_SITE_KEY) || '';

let scriptPromise = null;

function loadScript() {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if (window.grecaptcha) return resolve(window.grecaptcha);
    const script = document.createElement('script');
    script.src = `https://www.google.com/recaptcha/api.js?render=${SITE_KEY}`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.grecaptcha);
    script.onerror = () => reject(new Error('Could not load reCAPTCHA.'));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * Resolves to a fresh reCAPTCHA v3 token for `action`, or null when reCAPTCHA isn't configured
 * or fails to load. Never rejects — a reCAPTCHA outage or an ad-blocked script must not be able
 * to lock anyone out of signing in.
 */
export async function getRecaptchaToken(action) {
  if (!SITE_KEY) return null;
  try {
    const grecaptcha = await loadScript();
    return await new Promise((resolve) => {
      grecaptcha.ready(() => {
        grecaptcha.execute(SITE_KEY, { action }).then(resolve).catch(() => resolve(null));
      });
    });
  } catch {
    return null;
  }
}
