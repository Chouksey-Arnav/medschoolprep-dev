// ─────────────────────────────────────────────────────────────────────────────
// Crisis resources, as configuration rather than as code.
//
// The reason this is a config file and not a JSX literal is operational, not
// architectural. Hotline numbers change. The 988 Suicide and Crisis Lifeline
// replaced a ten-digit number in 2022 and the old one still routes today, but it
// will not forever; a text line's shortcode can move; an organization can be
// renamed or fold. Any of those turns a card that reads as help into a card that
// reads as help and is wrong — the single worst failure this feature has — and
// the fix must not be gated on a code review, a build, and a deploy window.
//
// So: public/safety-resources.json holds the real content, is fetched at runtime
// (see loadCrisisResources below), and can be corrected by editing one file.
// Everything in it is validated on arrival, and anything that fails validation
// falls back to the constants compiled in here. That fallback is the load-bearing
// half of the design: a student in distress must never see an empty card because
// somebody left a trailing comma in a JSON file, and must never be offline-blocked
// out of a phone number. The bundled copy is therefore kept accurate too, and
// scripts/verifySafety.mjs asserts the two agree on the numbers that matter.
//
// What is deliberately NOT here: any notion of "which resource fits this
// student". Routing a teenager to a specific hotline based on an inference about
// them is a clinical act and this app does not perform clinical acts. Every tier
// that surfaces resources surfaces the same ones, in the same order.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The two resources named in the product requirement, plus two the crisis-line
 * organizations themselves recommend alongside them. These are the shipped
 * defaults and the fallback for a bad or unreachable config file.
 */
export const DEFAULT_CRISIS_CONFIG = Object.freeze({
  version: 1,
  cardTitle: 'If things are heavy right now',
  cardBody: "You don't have to be in danger to use these. They are free, open 24 hours, and you can text instead of talking.",
  dismissLabel: 'Hide this',
  restoreLabel: 'Show support resources',
  resources: Object.freeze([
    Object.freeze({
      id: '988',
      name: '988 Suicide and Crisis Lifeline',
      description: 'Call or text 988. Free, confidential, 24/7, anywhere in the US.',
      tel: '988',
      sms: Object.freeze({ number: '988', body: '' }),
      url: 'https://988lifeline.org',
      primary: true,
    }),
    Object.freeze({
      id: 'crisis-text-line',
      name: 'Crisis Text Line',
      description: 'Text HOME to 741741 to reach a trained volunteer counselor, 24/7.',
      sms: Object.freeze({ number: '741741', body: 'HOME' }),
      url: 'https://www.crisistextline.org',
      primary: true,
    }),
    Object.freeze({
      id: 'trevor',
      name: 'The Trevor Project',
      description: 'Call 1-866-488-7386 or text START to 678-678 — for LGBTQ young people, 24/7.',
      tel: '18664887386',
      sms: Object.freeze({ number: '678678', body: 'START' }),
      url: 'https://www.thetrevorproject.org/get-help/',
      primary: false,
    }),
    Object.freeze({
      id: 'emergency',
      name: '911 or your nearest emergency room',
      description: 'If you or someone else is in immediate physical danger, this is the fastest help.',
      tel: '911',
      primary: false,
    }),
  ]),
});

/** Where the runtime-editable copy lives. Same-origin, static, cacheable-but-revalidated. */
export const CRISIS_CONFIG_URL = '/safety-resources.json';

const str = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
// Phone/shortcode: digits only, 3–15 of them (988 and 741741 are both valid;
// E.164 tops out at 15). Anything else is rejected rather than rendered, because
// a tel: link that dials nothing is worse than no button.
const DIAL_RE = /^[0-9]{3,15}$/;
const dial = (v) => {
  const cleaned = String(v ?? '').replace(/[\s()+.-]/g, '');
  return DIAL_RE.test(cleaned) ? cleaned : null;
};
const httpsUrl = (v) => {
  const s = str(v, 400);
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' ? u.toString() : null;
  } catch { return null; }
};

/**
 * Validates one entry. Returns null for anything that could not be rendered as a
 * usable action — a resource with a name and no way to reach it is decoration on
 * a screen where decoration is a liability.
 */
export function normalizeResource(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = str(raw.name, 120);
  if (!name) return null;
  const tel = dial(raw.tel);
  const smsNumber = dial(raw.sms?.number);
  const url = httpsUrl(raw.url);
  if (!tel && !smsNumber && !url) return null;
  return {
    id: str(raw.id, 60) || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60),
    name,
    description: str(raw.description, 400) || '',
    tel,
    sms: smsNumber ? { number: smsNumber, body: str(raw.sms?.body, 60) || '' } : null,
    url,
    primary: raw.primary === true,
  };
}

/**
 * Validates a whole config document. Returns null — not a partial config — when
 * the document yields no usable resource, so the caller falls back wholesale
 * rather than rendering a card with a title and an empty list.
 */
export function normalizeCrisisConfig(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const resources = Array.isArray(raw.resources)
    ? raw.resources.map(normalizeResource).filter(Boolean)
    : [];
  if (!resources.length) return null;
  return {
    version: Number.isFinite(Number(raw.version)) ? Number(raw.version) : DEFAULT_CRISIS_CONFIG.version,
    cardTitle: str(raw.cardTitle, 160) || DEFAULT_CRISIS_CONFIG.cardTitle,
    cardBody: str(raw.cardBody, 600) || DEFAULT_CRISIS_CONFIG.cardBody,
    dismissLabel: str(raw.dismissLabel, 60) || DEFAULT_CRISIS_CONFIG.dismissLabel,
    restoreLabel: str(raw.restoreLabel, 60) || DEFAULT_CRISIS_CONFIG.restoreLabel,
    resources,
  };
}

// One in-flight fetch shared by every caller, and one resolved value cached for
// the session. The card can mount from several surfaces at once and none of them
// should each cost a request.
let cached = null;
let inFlight = null;

/**
 * The config, with the bundled defaults as an unconditional floor. Never throws
 * and never returns null: every failure path — offline, 404, HTML error page,
 * malformed JSON, a document that validates to nothing — resolves to
 * DEFAULT_CRISIS_CONFIG. A caller may render its result synchronously without a
 * loading state by starting from `DEFAULT_CRISIS_CONFIG` and swapping when this
 * settles, which is what CrisisResourceCard does.
 */
export function loadCrisisResources({ force = false } = {}) {
  if (cached && !force) return Promise.resolve(cached);
  if (inFlight && !force) return inFlight;
  inFlight = (async () => {
    try {
      if (typeof fetch !== 'function') return DEFAULT_CRISIS_CONFIG;
      const res = await fetch(CRISIS_CONFIG_URL, { cache: 'no-cache' });
      if (!res.ok) return DEFAULT_CRISIS_CONFIG;
      const json = await res.json();
      return normalizeCrisisConfig(json) || DEFAULT_CRISIS_CONFIG;
    } catch {
      return DEFAULT_CRISIS_CONFIG;
    }
  })().then((cfg) => {
    cached = cfg;
    inFlight = null;
    return cfg;
  });
  return inFlight;
}

/** Test seam — resets the module cache so a suite can exercise several documents. */
export function __resetCrisisResourceCache() { cached = null; inFlight = null; }

/** `sms:` href in the form both iOS and Android accept (`?&body=` is the compatible spelling). */
export function smsHref(sms) {
  if (!sms?.number) return null;
  return sms.body ? `sms:${sms.number}?&body=${encodeURIComponent(sms.body)}` : `sms:${sms.number}`;
}

/**
 * The resources as plain sentences, for the one place they belong in text rather
 * than in UI: the model's own reply. Kept here so the card and the coach quote
 * the same numbers out of the same config, and a correction to the JSON reaches
 * both at once.
 */
export function resourceLinesForPrompt(config = DEFAULT_CRISIS_CONFIG) {
  return (config.resources || [])
    .filter(r => r.primary)
    .map(r => `- ${r.name}: ${r.description}`)
    .join('\n');
}
