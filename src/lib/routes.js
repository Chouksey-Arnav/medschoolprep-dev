// The single source of truth for "which screen is the student on" ⇄ "what is in
// the address bar".
//
// Until now the app kept its whole navigation state in React (`tab`, `prepView`,
// `satView`, …) mirrored into localStorage, and never touched the URL. Every
// screen was `medschoolprep.cloud/`, so the browser's back button had exactly
// one history entry to go back to: whatever the student was looking at *before
// the app*. Tapping back from Portfolio → Deadlines left the site entirely.
//
// This module makes the URL the thing history remembers. Nothing here touches
// React or the DOM — it is pure string ⇄ object translation, which is what makes
// it testable (scripts/verifyRouting.mjs) and what keeps the round-trip honest:
//
//     parsePath(formatPath(route)) deep-equals route     (for every valid route)
//     formatPath(parsePath(path))  === path              (for every canonical path)
//
// The hook that wires this to history lives in ./useAppRouter.js.

/** Top-level tabs, in nav order. Must match NAV in src/App.jsx. */
export const TABS = ['home', 'sat', 'prep', 'portfolio', 'roadmap', 'plans', 'progress', 'settings'];

/**
 * Tabs that own a SubNav, and the sub-view ids that bar can select.
 *
 * `state` names the React state setter's variable in App.jsx purely for
 * documentation; `ids` MUST stay in lockstep with the *_SUBNAV arrays there —
 * `npm run verify:routing` fails the build if they drift, so a new sub-tab can
 * never quietly end up without a URL.
 */
export const SUBVIEWS = {
  sat: {
    state: 'satView',
    default: 'overview',
    ids: ['overview', 'baseline', 'diagnostic', 'practice', 'tests', 'review', 'skills', 'library', 'toolkit', 'scores'],
  },
  prep: {
    state: 'prepView',
    default: 'pathways',
    ids: ['diagnostic', 'pathways', 'quizzes', 'flashcards', 'coach', 'library'],
    // The tab has always shown a *set* of health-career pathways and let the student switch
    // between them, so the singular id was describing one lesson list rather than the screen.
    // '/prep/pathway' stays parseable forever — it is in shared links, bookmarks, persisted view
    // state and every history entry a returning student has — and resolves forward to the plural.
    aliases: { pathway: 'pathways' },
  },
  portfolio: {
    state: 'portfolioView',
    default: 'overview',
    ids: ['overview', 'resume', 'opportunities', 'applying', 'commonapp', 'milestones'],
    // Eleven sub-tabs became five (see PORTFOLIO_SUBNAV in src/App.jsx for the
    // grouping and why). 'timeline' and 'deadlines' were two sibling tabs
    // showing two halves of the same calendar and are now 'milestones';
    // 'research', 'skills' and 'clinical' are sections of 'resume'; the six
    // application tabs — college list, essays, aid, recommenders, interview
    // prep and the admissions calculator — are sections of 'applying'; and
    // 'tracked' is a section of 'opportunities', which is where the Track
    // button that fills it lives. Every old id stays parseable forever: they are in
    // shared links, bookmarks, PWA start URLs, and every history entry a
    // returning student already has. They resolve to the merged view and the
    // router rewrites the address bar in place, so an old link works and stops
    // being an old link. Aliases never round-trip out of formatPath(), which is
    // what keeps exactly one canonical URL per screen.
    //
    // App.jsx additionally maps every one of these onto the SECTION it became
    // (see PORTFOLIO_GROUP_FOR_VIEW there), so an old link lands on the exact
    // form it used to open, not just the right tab.
    aliases: {
      timeline: 'milestones', deadlines: 'milestones',
      research: 'resume', skills: 'resume', clinical: 'resume', activities: 'resume', academics: 'resume',
      colleges: 'applying', essays: 'applying', aid: 'applying',
      recommenders: 'applying', interview: 'applying', calc: 'applying',
      // The Narrative Method Engine. /portfolio/narrative is the link a counselor
      // or a parent sends; it resolves to Applying with that section focused.
      narrative: 'applying',
      // Not a retired tab — a section that needs its own shareable URL. See the
      // note beside 'combined' in PORTFOLIO_GROUP_FOR_VIEW in src/App.jsx:
      // /portfolio/combined is the link a counselor or a parent sends, and it
      // resolves to Applying with the combined-degree section focused.
      combined: 'applying',
      tracked: 'opportunities',
    },
  },
  // The twelve-month admissions roadmap. Sits between Portfolio and Plans in
  // TABS for the same reason it does in the nav: Portfolio is the record of what
  // a student has done, Plans is what they are doing today, and the Roadmap is
  // the year that connects them.
  //
  // 'intake' is a real addressable view rather than a modal, and deliberately
  // so: it is the screen a student is sent back to whenever their answers go
  // stale, it is what a support reply or a parent's nudge needs to be able to
  // link to, and a thirteen-question flow that cannot be resumed from a URL is
  // one a student abandons and never finds again.
  roadmap: {
    state: 'roadmapView',
    default: 'overview',
    // 'climb' is the projection view — what finishing the year is worth,
    // measured against the app's own application-strength score. Addressable
    // like the rest because it is the screen a student sends to a parent.
    ids: ['overview', 'year', 'climb', 'seasons', 'list', 'intake'],
  },
  progress: {
    state: 'progressView',
    default: 'overview',
    ids: ['overview', 'streak', 'quests', 'verified', 'performance', 'achievements'],
  },
  // Settings was one seven-group scroll with no addressable parts, which made every instruction
  // that ended "…in Settings" a hunt: the Plans lock screen, the parent invitation email, the
  // support replies, and the app's own deep links could all name the tab and none of them could
  // name the screen. Each group is now a sub-tab with a URL, so /settings/family is a link a
  // parent can be sent and /settings/appearance is one a support reply can paste.
  settings: {
    state: 'settingsView',
    default: 'profile',
    ids: ['profile', 'study', 'family', 'appearance', 'medabrain', 'data', 'account'],
  },
};

/**
 * The signed-out surfaces. These are real destinations (AuthGate renders a
 * different screen for each), so they get real URLs and real history entries —
 * back out of the login form and you land on the landing page, not on whatever
 * site you visited before ours.
 */
export const AUTH_VIEWS = {
  login: '/login',
  signup: '/signup',
  forgot: '/forgot-password',
  oauth: '/auth/callback',
  // The parent's own front door. Two screens rather than a checkbox on the existing ones,
  // because "where do I sign in to see my child's progress" was the question the product
  // could not answer: a parent who lands on /login has no way to know a parent account is
  // even a thing, and a parent who lands on /signup has to read a role picker to find out.
  // These are the URLs that go in the invitation email, on the landing page, in the footer,
  // and in every "for parents" link anywhere in the app.
  parentSignup: '/parents/signup',
  parentLogin: '/parents/login',
};
const AUTH_PATHS = Object.values(AUTH_VIEWS);

/** True for the two auth screens that are specifically the parent's. */
export const isParentAuthPath = (pathname) =>
  [AUTH_VIEWS.parentSignup, AUTH_VIEWS.parentLogin].includes(normalizePath(pathname));

/**
 * The legal documents. These are the odd ones out in this file: every other
 * route here is either an app tab (needs a session) or an auth screen (needs
 * the absence of one). These need neither — they must render identically to a
 * signed-out visitor, a signed-in student, a parent who was sent the link, and
 * a crawler, because a privacy policy you have to log in to read is not notice.
 *
 * So AuthGate intercepts them ahead of its own signed-in/signed-out branch, and
 * parsePath below deliberately does not claim them (`legal` is not in TABS, so
 * it already returns null) — the app router leaves them alone.
 */
export const LEGAL_VIEWS = { terms: '/legal/terms', privacy: '/legal/privacy' };
const LEGAL_PATHS = Object.values(LEGAL_VIEWS);

/** True when `pathname` addresses one of the public legal documents. */
export function isLegalPath(pathname) {
  return LEGAL_PATHS.includes(normalizePath(pathname));
}

/** The legal doc slug (`terms`/`privacy`) a path names, or null. */
export function parseLegalPath(pathname) {
  const p = normalizePath(pathname);
  return Object.keys(LEGAL_VIEWS).find((slug) => LEGAL_VIEWS[slug] === p) || null;
}

/**
 * The parent application.
 *
 * A parent account renders an entirely different app (see ParentApp), so these paths deliberately
 * do NOT go through TABS/SUBVIEWS: `parsePath` returns null for them, the student router never
 * claims them, and the two navigation systems cannot fight over the address bar. Same arrangement
 * as the legal documents above, for the same reason.
 */
export const PARENT_VIEWS = {
  // The tab bar of the parent application, in nav order. `dashboard` is the root because a
  // parent with one student — nearly all of them — should never have to choose a screen before
  // seeing an answer to "how is she doing".
  dashboard: '/family',
  students: '/family/students',
  digest: '/family/digest',
  activity: '/family/activity',
  // Where a parent says something rather than only reads. Its own screen rather than a box on the
  // dashboard because it is the one part of this app that is a conversation with a person, and a
  // conversation wedged under a row of statistics gets read as another statistic.
  messages: '/family/messages',
  // The only screen in this app where a parent asks for something specific rather than reads or
  // comments. Its own tab because an assignment is a commitment with a deadline on it, and one
  // wedged into the messages thread would be read as another message — which is exactly the
  // status a quest must not have.
  quests: '/family/quests',
  // What each health pathway costs and how long it takes. Its own screen because it is the one
  // thing on this dashboard that is not about last week — it is about a decision their child is
  // making now, that nobody has ever shown them the finances of, and that a parent will want to
  // read slowly and send to the other parent. Wedged under the weekly numbers it would be scrolled
  // past.
  costs: '/family/costs',
  connections: '/family/connections',
  // What this dashboard is, what each number means, where the privacy line is drawn, and what to
  // do when something is not working. Addressable because it is the page a support reply wants to
  // link to, and because a parent who has to hunt for the explanation reads the numbers without
  // one.
  guide: '/family/guide',
  settings: '/family/settings',
  // The intake a parent account must finish before it can ask for anything (see
  // ParentSetup.jsx and api/parent/profile.js). Addressable so a half-finished one can be
  // resumed from an email link rather than only from wherever the app happened to leave off.
  setup: '/family/setup',
};
const PARENT_PATHS = Object.values(PARENT_VIEWS);

/** A single student's own page inside the parent app: /family/student/<uuid>. */
export const PARENT_STUDENT_PREFIX = '/family/student';
export const parentStudentPath = (studentId) => `${PARENT_STUDENT_PREFIX}/${seg(studentId)}`;

/** The student id a /family/student/<id> path names, or null. */
export function parseParentStudentPath(pathname) {
  const parts = normalizePath(pathname).split('/').filter(Boolean);
  if (parts.length !== 3 || parts[0] !== 'family' || parts[1] !== 'student') return null;
  return unseg(parts[2]) || null;
}

/**
 * The public "for parents" page: what the dashboard is, what it shows, what it never shows,
 * and the two buttons. Public in the same sense the legal documents are — a parent deciding
 * whether to make an account must be able to read it *before* making one, and it is the page
 * every "For parents" link in the marketing site and the app points at.
 */
export const PARENT_HUB_PATH = '/parents';
export const isParentHubPath = (pathname) => normalizePath(pathname) === PARENT_HUB_PATH;

/**
 * The invitation landing page. Public in the same sense the legal documents are: it must render
 * for someone who is signed out, signed in as the wrong role, or has no account at all — a
 * consent screen you have to already be the right kind of user to read cannot do its job.
 */
export const PARENT_INVITE_PATH = '/parent-invite';

/** True when `pathname` addresses a screen inside the parent application. */
export function isParentPath(pathname) {
  return PARENT_PATHS.includes(normalizePath(pathname)) || !!parseParentStudentPath(pathname);
}

/** The parent view (`dashboard`/`settings`) a path names, or null. */
export function parseParentPath(pathname) {
  const p = normalizePath(pathname);
  return Object.keys(PARENT_VIEWS).find((view) => PARENT_VIEWS[view] === p) || null;
}

/** True when this page load came from an invitation email. */
export function isParentInvitePath(pathname) {
  return normalizePath(pathname) === PARENT_INVITE_PATH;
}

/**
 * Full-screen surfaces that sit *on top of* a tab: the lesson player and the
 * quiz runner. They replace the entire app shell, so without a URL of their own
 * the back button would swap the tab underneath while leaving the overlay
 * covering the screen — the single worst thing a back button can do.
 */
const OVERLAY_SEGMENTS = { lesson: 'lesson', quiz: 'quiz' };

/** The route the app falls back to when a URL means nothing to us. */
export const HOME_ROUTE = { tab: 'home', view: null, overlay: null };

/**
 * Home has a name now.
 *
 * It used to be the one tab with no URL of its own: every other screen was `/sat/practice` or
 * `/portfolio/essays`, and the dashboard was bare `/`. That made it the only destination in the
 * app you could not link to, could not tell apart from the marketing page in an address bar or a
 * browser-history list, and could not describe in a support reply without saying "just the slash".
 *
 * So `/home` is canonical and `/` is its alias: a bare `/` still resolves (it is what every PWA
 * cold start, every typed domain and every old bookmark arrives on) and the router rewrites it in
 * place — same entry, no extra history step — the moment the app decides which screen it is.
 */
const HOME_PATH = '/home';

function seg(value) {
  return encodeURIComponent(String(value));
}

function unseg(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

/**
 * The live sub-view id for `view` on `tab`: itself if it still exists, whatever
 * replaced it if it is a retired alias, otherwise null.
 *
 * Used for persisted state as well as URLs — a student whose last screen was
 * `/portfolio/deadlines` has that id sitting in localStorage, and without this
 * they would be silently dumped on the Portfolio overview on their next visit.
 */
export function resolveView(tab, view) {
  const sub = SUBVIEWS[tab];
  if (!sub || !view) return null;
  if (sub.ids.includes(view)) return view;
  return sub.aliases?.[view] || null;
}

/** Normalizes a pathname for comparison: no trailing slash, always leading one. */
export function normalizePath(pathname) {
  const p = String(pathname || '/').split('?')[0].split('#')[0];
  const trimmed = p.replace(/\/+$/, '');
  return trimmed.startsWith('/') ? (trimmed || '/') : `/${trimmed}`;
}

/** True when `pathname` addresses one of the signed-out auth screens. */
export function isAuthPath(pathname) {
  return AUTH_PATHS.includes(normalizePath(pathname));
}

/** The auth view (`login`/`signup`/`forgot`) a path names, or null. */
export function parseAuthPath(pathname) {
  const p = normalizePath(pathname);
  return Object.keys(AUTH_VIEWS).find((view) => AUTH_VIEWS[view] === p) || null;
}

/**
 * Route → canonical path. Total: it never throws and never returns something
 * parsePath can't read back, so a malformed route degrades to a sane URL rather
 * than corrupting history.
 *
 * @param {{tab?:string, view?:string|null, overlay?:{kind:string,unitId?:string,lessonId?:string,quizId?:string}|null}} route
 * @returns {string}
 */
export function formatPath(route) {
  const tab = TABS.includes(route?.tab) ? route.tab : 'home';
  const parts = [tab];

  const sub = SUBVIEWS[tab];
  if (sub) parts.push(resolveView(tab, route?.view) || sub.default);

  const overlay = route?.overlay;
  if (overlay?.kind === 'lesson' && overlay.unitId && overlay.lessonId) {
    parts.push(OVERLAY_SEGMENTS.lesson, seg(overlay.unitId), seg(overlay.lessonId));
  } else if (overlay?.kind === 'quiz' && overlay.quizId) {
    parts.push(OVERLAY_SEGMENTS.quiz, seg(overlay.quizId));
  }

  return `/${parts.join('/')}`.replace(/\/+$/, '') || HOME_PATH;
}

/**
 * Path → route, or null when the path isn't an app route (an auth screen, a
 * typo, a stale link, /sitemap.xml). Callers treat null as "keep whatever the
 * app already had and rewrite the URL in place" — see useAppRouter.
 *
 * @param {string} pathname
 * @returns {{tab:string, view:string|null, overlay:object|null}|null}
 */
export function parsePath(pathname) {
  const path = normalizePath(pathname);
  if (isAuthPath(path)) return null;

  const parts = path.split('/').filter(Boolean).map(unseg);
  // A bare "/" is Home's alias, not a route of its own — see HOME_PATH above.
  if (!parts.length) return { ...HOME_ROUTE };

  const tab = parts[0];
  if (!TABS.includes(tab)) return null;

  let i = 1;
  let view = null;
  const sub = SUBVIEWS[tab];
  if (sub) {
    // `/sat` (no sub-view) is a legitimate hand-typed URL: accept it and let the
    // caller's replaceState normalize it to /sat/overview.
    if (parts[1] && sub.ids.includes(parts[1])) { view = parts[1]; i = 2; }
    // A retired sub-view id (see `aliases` above) resolves to whatever replaced
    // it. The route it produces is canonical, so useAppRouter's state→URL sync
    // finds the address bar disagreeing and replaces it — the student lands on
    // the right screen with the right URL and no extra history entry.
    else if (parts[1] && sub.aliases?.[parts[1]]) { view = sub.aliases[parts[1]]; i = 2; }
    else if (!parts[1]) { view = sub.default; i = 1; }
    else if (parts[1] === OVERLAY_SEGMENTS.lesson || parts[1] === OVERLAY_SEGMENTS.quiz) { view = sub.default; i = 1; }
    else return null; // /portfolio/nonsense — unknown, don't guess
  }

  let overlay = null;
  if (parts[i] === OVERLAY_SEGMENTS.lesson && parts[i + 1] && parts[i + 2]) {
    overlay = { kind: 'lesson', unitId: parts[i + 1], lessonId: parts[i + 2] };
    i += 3;
  } else if (parts[i] === OVERLAY_SEGMENTS.quiz && parts[i + 1]) {
    overlay = { kind: 'quiz', quizId: parts[i + 1] };
    i += 2;
  }
  if (parts.length > i) return null; // trailing junk — not a route we made

  return { tab, view, overlay };
}

/**
 * The route the app should boot into: the URL wins when it names a real screen
 * (so a shared/bookmarked link, a PWA cold start, or a reload after the back
 * button all land exactly where they should), and the last-persisted view state
 * is the fallback for a bare `/`.
 *
 * @param {object} persisted result of loadViewState()
 * @param {string} [pathname]
 */
export function bootRoute(persisted = {}, pathname = typeof window !== 'undefined' ? window.location.pathname : '/') {
  const fromUrl = parsePath(pathname);
  const base = {
    tab: TABS.includes(persisted.tab) ? persisted.tab : 'home',
    satView: SUBVIEWS.sat.ids.includes(persisted.satView) ? persisted.satView : SUBVIEWS.sat.default,
    prepView: SUBVIEWS.prep.ids.includes(persisted.prepView) ? persisted.prepView : SUBVIEWS.prep.default,
    portfolioView: resolveView('portfolio', persisted.portfolioView) || SUBVIEWS.portfolio.default,
    roadmapView: SUBVIEWS.roadmap.ids.includes(persisted.roadmapView) ? persisted.roadmapView : SUBVIEWS.roadmap.default,
    progressView: SUBVIEWS.progress.ids.includes(persisted.progressView) ? persisted.progressView : SUBVIEWS.progress.default,
    settingsView: SUBVIEWS.settings.ids.includes(persisted.settingsView) ? persisted.settingsView : SUBVIEWS.settings.default,
    overlay: null,
  };

  // A bare "/" is ambiguous — it's both the Home tab and the URL every PWA cold
  // start opens on. Treat it as "no opinion" so `start_url: '/'` resumes the
  // student's last screen exactly like a reload always has, and only an explicit
  // deep link overrides the persisted state.
  if (!fromUrl || (fromUrl.tab === 'home' && normalizePath(pathname) === '/')) return base;

  const next = { ...base, tab: fromUrl.tab, overlay: fromUrl.overlay };
  const sub = SUBVIEWS[fromUrl.tab];
  if (sub && fromUrl.view) next[sub.state] = fromUrl.view;
  return next;
}

/**
 * The route object for a set of App state values — the inverse of bootRoute,
 * used every render to decide whether the address bar is still telling the
 * truth.
 */
export function routeFromState({ tab, satView, prepView, portfolioView, roadmapView, progressView, settingsView, overlay = null }) {
  const views = { sat: satView, prep: prepView, portfolio: portfolioView, roadmap: roadmapView, progress: progressView, settings: settingsView };
  return { tab, view: SUBVIEWS[tab] ? views[tab] : null, overlay };
}
