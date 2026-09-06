import React, { useMemo } from 'react';
import {
  GraduationCap, ScrollText, Handshake, UserCheck, Mic, Calculator, Plus, ArrowRight, Stethoscope,
  Activity, Compass,
} from 'lucide-react';
import { C, R, CC, G } from '../../lib/theme';
import PanelHero, { StatTile } from '../ui/PanelHero';
import SectionScroller from './SectionScroller';

// ─────────────────────────────────────────────────────────────────────────────
// Applying — the second merged Portfolio page.
//
// College List, Essays, Financial Aid, Recommenders, Interview Prep and the
// Admissions Calculator were six separate tabs. They are six parts of one
// question — where am I applying, and what does each of those places still
// need from me — and splitting them across six pills did two bad things: it
// pushed the Portfolio strip to eleven tabs (a horizontal carousel on a phone,
// which is not navigation), and it meant no screen in the app could answer
// "how far along is this application" without the student assembling the
// answer from six places themselves.
//
// Same shell as Activities & résumé (SectionScroller): a summary that says
// what is done and what is missing, every section's actions hoisted onto it,
// a sticky jumper, one scroll. Each section still renders the exact panel it
// always was — nothing was rewritten to fit, and every old URL still lands on
// the right one.
// ─────────────────────────────────────────────────────────────────────────────

export const APPLYING_SECTIONS = [
  // First on the page because it is the summary of everything below it: one
  // number for where this student currently stands against the class that gets
  // admitted at the most selective school on their list, with the route to each
  // thing that would move it. Every other section here answers a piece of the
  // question it answers whole.
  { id: 'medex', ic: Activity, label: 'MedEx Score', color: C.violet, blurb: 'Where you stand against the class that gets in — one number, sealed weekly' },
  { id: 'colleges', ic: GraduationCap, label: 'College list', color: C.sky, blurb: 'Where you are applying, and what each school wants' },
  // Sits directly under the college list because that is what it feeds: tracking
  // a combined-degree program puts a school ON that list, with its deadline. It
  // is second rather than last because it is the only thing on this page with a
  // timeline that starts in ninth grade — a senior finding it here has already
  // lost most of what it asks for, and a freshman finding it here has not.
  { id: 'combined', ic: Stethoscope, label: 'Combined degrees', color: C.blue, blurb: 'BS/MD, direct-admit BSN, 0-6 PharmD and the rest — applied to from high school' },
  { id: 'essays', ic: ScrollText, label: 'Essays', color: C.violet, blurb: 'Drafts, prompts and word counts, per school' },
  { id: 'aid', ic: Handshake, label: 'Financial aid', color: C.green, blurb: 'What it will actually cost, and who pays for it' },
  { id: 'recommenders', ic: UserCheck, label: 'Recommenders', color: C.fuchsia, blurb: 'Who is writing for you, and when you asked' },
  { id: 'interview', ic: Mic, label: 'Interviews', color: C.orange, blurb: 'MMI stations, CASPer, and a scored practice run' },
  { id: 'calc', ic: Calculator, label: 'Chances', color: C.gold, blurb: 'Your real odds at the programs on your list' },
  // Last, and deliberately beside Chances: the two answer the same question at
  // different altitudes. Chances says what your odds are at these programs;
  // this says what your file currently READS as, and what would change that.
  // It emits no probability of its own — see src/lib/ivy/engine.js.
  { id: 'narrative', ic: Compass, label: 'Narrative reading', color: C.violet, blurb: 'What a reader would take from your file — theme, spike, and the rewrites that fix it' },
];
export const DEFAULT_APPLYING_SECTION = 'colleges';

const status = (n, doneAt) => (!n ? { tone: 'empty', label: 'Nothing yet' }
  : n < doneAt ? { tone: 'partial', label: 'In progress' }
  : { tone: 'done', label: 'Looking good' });

/**
 * @param {object} renders  id → () => ReactNode, one per section (owned by App.jsx,
 *                          because every panel needs App's own callbacks and counters)
 * @param {object} counts   { colleges, essays, recommenders, interviews }
 */
export default function ApplyingPanel({
  accent = C.sky, isMobile = false, renders = {}, counts = {},
  sectionLocks = [], focusId = null, focusNonce = 0, onSectionOpen = null,
  // (sectionId) => node — the Common App mirror strip. See SectionScroller's own prop.
  mirrorBadge = null,
}) {
  const lockFor = (id) => sectionLocks.find(l => l.id.split(':').pop() === id) || null;
  const colleges = counts.colleges || 0;
  const essays = counts.essays || 0;
  const recommenders = counts.recommenders || 0;
  const interviews = counts.interviews || 0;

  const nextSteps = useMemo(() => {
    const out = [];
    if (!colleges) out.push({ tone: 'warn', text: 'No colleges on your list yet. Everything else on this page hangs off that list — essays come from their prompts, aid is a comparison between them, and your chances are calculated against them.', actionLabel: 'Add a school', onAction: () => onSectionOpen?.('colleges') });
    else if (colleges < 4) out.push({ tone: 'info', text: `${colleges} school${colleges === 1 ? '' : 's'} on your list. A finished list is usually six to ten, spread across reach, target and likely.`, actionLabel: 'Add more', onAction: () => onSectionOpen?.('colleges') });
    if (colleges && !essays) out.push({ tone: 'warn', text: 'No essays started. Every school on your list has prompts, and the personal statement is reused across all of them — starting it early is the single highest-leverage thing on this page.', actionLabel: 'Start one', onAction: () => onSectionOpen?.('essays') });
    if (colleges && !recommenders) out.push({ tone: 'info', text: 'No recommenders logged. Teachers write these in the order they were asked, and the good ones fill up in the spring.', actionLabel: 'Add one', onAction: () => onSectionOpen?.('recommenders') });
    if (colleges && !interviews) out.push({ tone: 'info', text: 'You have not run a practice interview. One scored MMI station tells you more than reading about them for an hour.', actionLabel: 'Practice', onAction: () => onSectionOpen?.('interview') });
    if (colleges >= 2) out.push({ tone: 'good', text: 'Your chances are calculated against the real admitted profiles of the schools on your list — not a generic score.', actionLabel: 'See the odds', onAction: () => onSectionOpen?.('calc') });
    // Offered whether or not there is a list, because the question it answers —
    // does my file say one thing — is answerable from the essays and activities
    // alone, and is most useful before the list is finished rather than after.
    if (essays) out.push({ tone: 'info', text: 'Your drafts and your activities can be read the way an admissions officer reads them: one theme or several, a spike or a list, and the specific sentences that are doing the least work.', actionLabel: 'Run the reading', onAction: () => onSectionOpen?.('narrative') });
    // Always offered, and never gated on having a list, because this is the one
    // thing on the page whose deadlines a ninth-grader still has time to meet.
    out.push({ tone: 'info', text: 'Combined-degree and direct-admit programs — BS/MD, direct-admit nursing, six-year pharmacy — are applied to from high school, and most of them close in November of senior year. Their requirements start counting in ninth grade.', actionLabel: 'See the programs', onAction: () => onSectionOpen?.('combined') });
    return out;
  }, [colleges, essays, recommenders, interviews, onSectionOpen]);

  const sections = APPLYING_SECTIONS.map(s => {
    const render = renders[s.id];
    const count = { colleges, essays, recommenders, interview: interviews }[s.id] || null;
    const st = {
      colleges: status(colleges, 4), essays: status(essays, 2),
      aid: null, recommenders: status(recommenders, 2), interview: status(interviews, 1),
      calc: null, combined: null, medex: null, narrative: null,
    }[s.id];
    return {
      ...s,
      count: count || null,
      status: st,
      locked: lockFor(s.id),
      actions: ACTIONS[s.id]?.(onSectionOpen) || [],
      render: render || (() => null),
    };
  }).filter(s => renders[s.id]);

  return (
    <div style={CC({ gap: 20 })}>
      <PanelHero tourTag="portfolio-deep-applying" icon={GraduationCap} color={accent} color2={C.violet} m={isMobile}
        eyebrow="Applications" title="Applying"
        sub="Your program list and everything each program still needs from you — combined-degree programs, essays, aid, recommenders, interviews, and your real odds. One page, in the order you work through it." />

      <SectionScroller
        accent={accent} isMobile={isMobile} mirrorBadge={mirrorBadge}
        focusId={focusId} focusNonce={focusNonce} onSectionOpen={onSectionOpen}
        printLabel="Print this page"
        summary={{
          eyebrow: 'Where you stand',
          title: colleges ? 'Your applications, end to end' : 'Start with one school',
          sub: 'Everything one application needs, on one page, because it is one question — and everything you can do inside a section can be done from here.',
          tiles: (
            <div style={G(4, 12, {}, isMobile)}>
              <StatTile icon={GraduationCap} value={colleges} label="Schools on your list" sub={colleges ? undefined : 'nothing else works without this'} color={C.sky} />
              <StatTile icon={ScrollText} value={essays} label="Essays started" sub={essays ? undefined : 'the personal statement is reused everywhere'} color={C.violet} />
              <StatTile icon={UserCheck} value={recommenders} label="Recommenders" sub={recommenders ? undefined : 'ask early — teachers fill up'} color={C.fuchsia} />
              <StatTile icon={Mic} value={interviews} label="Practice interviews" sub={interviews ? undefined : 'one station beats an hour of reading'} color={C.orange} />
            </div>
          ),
          nextSteps,
        }}
        sections={sections}
      />
    </div>
  );
}

// Each section's primary action, hoisted onto the summary. They open the
// section rather than opening a form directly: the forms live inside panels
// this file deliberately does not reach into.
const ACTIONS = {
  colleges: (go) => [{ label: 'Add a school', icon: Plus, primary: true, onClick: () => go?.('colleges') }],
  combined: (go) => [{ label: 'Browse the programs', icon: ArrowRight, onClick: () => go?.('combined') }],
  essays: (go) => [{ label: 'Start an essay', icon: Plus, primary: true, onClick: () => go?.('essays') }],
  aid: (go) => [{ label: 'Open aid', icon: ArrowRight, onClick: () => go?.('aid') }],
  recommenders: (go) => [{ label: 'Add a recommender', icon: Plus, primary: true, onClick: () => go?.('recommenders') }],
  interview: (go) => [{ label: 'Run a station', icon: Mic, primary: true, onClick: () => go?.('interview') }],
  calc: (go) => [{ label: 'See my odds', icon: Calculator, onClick: () => go?.('calc') }],
  medex: (go) => [{ label: 'See my score', icon: Activity, primary: true, onClick: () => go?.('medex') }],
};
