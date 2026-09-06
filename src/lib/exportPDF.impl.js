// ─────────────────────────────────────────────────────────────────────────────
// jsPDF — PDF exports for quiz results, school lists, flashcard decks
// ─────────────────────────────────────────────────────────────────────────────
import { jsPDF } from 'jspdf';

const BLUE  = [45,  127, 255];
const GREEN = [16,  185, 129];
const AMBER = [245, 158,  11];
const RED   = [244,  63,  94];
const DARK  = [10,   16,  32];
const LIGHT = [148, 163, 192];
const WHITE = [238, 242, 255];

function header(doc, title, subtitle='') {
  // Dark header bar
  doc.setFillColor(...DARK);
  doc.rect(0, 0, 220, 30, 'F');
  doc.setFillColor(...BLUE);
  doc.rect(0, 0, 5, 30, 'F');
  doc.setTextColor(...WHITE);
  doc.setFontSize(16);
  doc.setFont('helvetica','bold');
  doc.text('MedSchoolPrep', 12, 12);
  doc.setFontSize(10);
  doc.setFont('helvetica','normal');
  doc.setTextColor(...LIGHT);
  doc.text(title, 12, 20);
  if (subtitle) doc.text(subtitle, 12, 26);
  doc.setTextColor(0,0,0);
  return 40;
}

function footer(doc, pageNum, total) {
  doc.setFontSize(8);
  doc.setTextColor(...LIGHT);
  doc.text(`MedSchoolPrep · Generated ${new Date().toLocaleDateString()} · Page ${pageNum} of ${total}`, 14, 290);
  doc.setDrawColor(...BLUE);
  doc.setLineWidth(0.3);
  doc.line(14, 286, 196, 286);
}

export function exportQuizResult(quiz, answers, score, total) {
  const doc  = new jsPDF({ unit:'mm', format:'a4' });
  const pct  = total > 0 ? Math.round((score/total)*100) : 0;
  const date = new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });

  let y = header(doc, `Quiz Result: ${quiz.title}`, date);

  // Score circle (simulated with rect)
  const sc = pct>=80?GREEN:pct>=60?BLUE:AMBER;
  doc.setFillColor(...sc);
  doc.roundedRect(14, y, 182, 28, 3, 3, 'F');
  doc.setTextColor(...WHITE);
  doc.setFontSize(28);
  doc.setFont('helvetica','bold');
  doc.text(`${pct}%`, 20, y+18);
  doc.setFontSize(12);
  doc.setFont('helvetica','normal');
  doc.text(`${score} / ${total} correct`, 60, y+14);
  doc.text(`Category: ${quiz.cat}`, 60, y+22);
  doc.text(`Difficulty: ${quiz.diff}`, 130, y+14);
  y += 36;

  // Questions
  doc.setTextColor(0,0,0);
  answers.forEach((a, i) => {
    if (y > 260) { footer(doc, 1, 1); doc.addPage(); y = header(doc, 'Quiz Results (continued)'); }

    const ok = a.ok || a.isCorrect;
    const col = ok ? GREEN : RED;

    // Question row
    doc.setFillColor(ok ? 240 : 255, ok ? 249 : 235, ok ? 244 : 235);
    doc.roundedRect(14, y, 182, 7, 1, 1, 'F');
    doc.setTextColor(...col);
    doc.setFontSize(9);
    doc.setFont('helvetica','bold');
    doc.text(`${ok?'✓':'✗'} Q${i+1}`, 17, y+5);
    doc.setTextColor(30,30,30);
    doc.setFont('helvetica','normal');
    const qText = doc.splitTextToSize(a.q || a.question || '', 165);
    doc.text(qText[0], 30, y+5);
    y += 10;

    // Explanation (only for wrong answers)
    if (!ok && a.exp) {
      doc.setFontSize(8);
      doc.setTextColor(...LIGHT);
      const expLines = doc.splitTextToSize(`Explanation: ${a.exp}`, 175);
      expLines.slice(0,2).forEach(line => { doc.text(line, 17, y); y += 4; });
      y += 2;
    }
  });

  footer(doc, 1, 1);
  doc.save(`quiz-${quiz.id}-${pct}pct-${Date.now()}.pdf`);
}

/**
 * Exports the Admissions Calculator's estimates.
 *
 * Replaces an earlier exportSchoolList() that printed a Likely / Target / Reach
 * / Stretch tier per school. That export outlived the model behind it — the
 * calculator no longer produces tiers, because "Likely" at a school admitting
 * 3.4% of applicants was a word with nothing behind it. What goes on paper now
 * is what goes on screen: a range, a confidence label, and — for a program
 * the student is not eligible for — no number at all, only what would have to
 * change. A PDF that is more confident than the screen it came from is the
 * version of this document that gets shown to a parent and believed.
 */
export function exportAdmissionEstimates(results, meta = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const conf = { high: GREEN, moderate: BLUE, low: AMBER, 'very-low': RED };

  let y = header(doc, 'Admission Estimates',
    `${meta.completeness ? `${meta.completeness.have} of ${meta.completeness.total} intake fields answered · ` : ''}Generated ${new Date().toLocaleDateString()}`);
  let page = 1;

  const ensureRoom = (needed) => {
    if (y + needed > 268) { footer(doc, page, page); doc.addPage(); page++; y = header(doc, 'Admission Estimates (continued)'); }
  };

  // The standing caveat, first — before any number, so it is not a footnote
  // somebody scrolls past on the way to the encouraging part.
  doc.setFillColor(15, 24, 40);
  doc.roundedRect(14, y, 182, 20, 2, 2, 'F');
  doc.setTextColor(...LIGHT);
  doc.setFontSize(7.5);
  doc.text(doc.splitTextToSize(
    'Every figure below is a range, not a prediction. Estimates are benchmarked against the median admitted student rather than the 25th percentile, weighted by what each program publishes, and adjusted for the fact that published admit rates include recruited athletes, legacies and development admits. Where a program does not publish its admit rate, the estimate is built on a stated assumption and says so.',
    176), 18, y + 5);
  y += 26;

  (results || []).forEach((r) => {
    if (!r || r.error) return;
    ensureRoom(r.blocked ? 34 : 30);

    const color = r.blocked ? RED : (conf[r.confidence?.level] || BLUE);
    doc.setFillColor(248, 250, 252);
    doc.rect(14, y, 182, r.blocked ? 30 : 26, 'F');
    doc.setFillColor(...color);
    doc.rect(14, y, 1.6, r.blocked ? 30 : 26, 'F');

    doc.setTextColor(20, 30, 50);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(r.program.name, 19, y + 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...LIGHT);
    doc.text(r.program.institution, 19, y + 10.5);

    if (r.blocked) {
      doc.setTextColor(...RED);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text('Not eligible on published requirements — no estimate shown', 19, y + 16);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(60, 70, 90);
      doc.text(doc.splitTextToSize(
        r.whatWouldChange.map(w => `• ${w.label}`).join('   '), 172), 19, y + 21);
      y += 34;
      return;
    }

    doc.setTextColor(...color);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(r.display.range, 150, y + 8);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(r.confidence.label, 150, y + 13);

    doc.setTextColor(60, 70, 90);
    doc.setFontSize(7);
    const baseline = r.baseRate.published ?? r.baseRate.assumed;
    doc.text(`Everyone who applies: ${(baseline * 100).toFixed(1)}%${r.baseRate.isEstimate ? ' (estimated — not published by the program)' : ''}`, 19, y + 16);
    const top = (r.drivers || []).slice(0, 2).map(d => d.label).join(' · ');
    if (top) doc.text(doc.splitTextToSize(`Would move it most: ${top}`, 172), 19, y + 20.5);
    if (r.lottery) {
      doc.setTextColor(...AMBER);
      doc.text('Selection at this program is partly by random draw — preparation cannot remove that.', 19, y + 24);
    }
    y += 30;
  });

  footer(doc, page, page);
  doc.save(`admission-estimates-${Date.now()}.pdf`);
}

// `extras` carries the three sections that used to be their own Portfolio tabs and were, until
// the tabs were merged into Activities & résumé, exported nowhere: clinical/shadowing hours,
// research experience, and dated certifications. A student handing this PDF to a program
// director was leaving out the part of their record that is hardest to argue with.
export function exportPortfolioResume(studentName, activities, awards, gpaEntries=[], extras={}) {
  const { clinical=[], research=[], certifications=[] } = extras || {};
  const doc = new jsPDF({ unit:'mm', format:'a4' });
  let y = header(doc, `Student Profile: ${studentName || 'Student'}`, `Activities, honors, hours & academic history · ${new Date().toLocaleDateString()}`);
  let page = 1;

  function ensureRoom(needed) {
    if (y + needed > 270) { footer(doc, page, page); doc.addPage(); page++; y = header(doc, `Student Profile (continued)`); }
  }

  // GPA snapshot
  if (gpaEntries.length) {
    ensureRoom(20);
    const latest = gpaEntries[gpaEntries.length - 1];
    doc.setFillColor(15, 24, 40);
    doc.roundedRect(14, y, 182, 14, 2, 2, 'F');
    doc.setTextColor(...WHITE);
    doc.setFontSize(9);
    doc.setFont('helvetica','bold');
    doc.text(`Current GPA: ${latest.gpa}`, 20, y+9);
    doc.setTextColor(...LIGHT);
    doc.setFont('helvetica','normal');
    doc.text(`${gpaEntries.length} term${gpaEntries.length===1?'':'s'} tracked · Latest: ${latest.term}`, 90, y+9);
    y += 20;
  }

  // Activities section
  if (activities.length) {
    ensureRoom(12);
    doc.setFillColor(...BLUE);
    doc.roundedRect(14, y, 182, 7, 1, 1, 'F');
    doc.setTextColor(...WHITE);
    doc.setFontSize(10);
    doc.setFont('helvetica','bold');
    doc.text(`ACTIVITIES (${activities.length})`, 18, y+5);
    y += 11;

    activities.forEach((a) => {
      ensureRoom(22);
      doc.setFillColor(248,250,252);
      doc.rect(14, y, 182, 18, 'F');
      doc.setDrawColor(230,234,240);
      doc.line(14, y+18, 196, y+18);
      doc.setTextColor(20,30,50);
      doc.setFontSize(9);
      doc.setFont('helvetica','bold');
      doc.text(`${a.position || a.name || 'Activity'}${a.organization?` — ${a.organization}`:''}`, 17, y+5);
      doc.setTextColor(...LIGHT);
      doc.setFont('helvetica','normal');
      doc.setFontSize(7.5);
      doc.text(`${a.activity_type || a.type || ''}${a.status?` · ${a.status}`:''}${(a.hours_per_week||a.hours)?` · ${a.hours_per_week||a.hours} hrs`:''}`, 17, y+10);
      if (a.description) {
        const descLines = doc.splitTextToSize(a.description, 175);
        doc.setTextColor(60,70,90);
        doc.text(descLines[0] || '', 17, y+15);
      }
      y += 21;
    });
    y += 3;
  }

  // Honors & Awards section
  if (awards.length) {
    ensureRoom(12);
    doc.setFillColor(...AMBER);
    doc.roundedRect(14, y, 182, 7, 1, 1, 'F');
    doc.setTextColor(...WHITE);
    doc.setFontSize(10);
    doc.setFont('helvetica','bold');
    doc.text(`HONORS & AWARDS (${awards.length})`, 18, y+5);
    y += 11;

    awards.forEach((a) => {
      ensureRoom(10);
      doc.setFillColor(248,250,252);
      doc.rect(14, y, 182, 9, 'F');
      doc.setDrawColor(230,234,240);
      doc.line(14, y+9, 196, y+9);
      doc.setTextColor(20,30,50);
      doc.setFontSize(9);
      doc.setFont('helvetica','bold');
      doc.text(a.title, 17, y+4);
      doc.setTextColor(...LIGHT);
      doc.setFont('helvetica','normal');
      doc.setFontSize(7.5);
      doc.text([a.level, a.grade_level && `Grade ${a.grade_level}`].filter(Boolean).join(' · '), 17, y+8);
      y += 11;
    });
  }

  // ── The three sections merged in from the retired Clinical Hours / Research / Skills &
  //    Certs tabs. Same two-line row shape as Honors, so the whole document reads as one
  //    résumé rather than three appendices bolted on.
  function listSection(title, color, rows) {
    if (!rows.length) return;
    ensureRoom(12);
    doc.setFillColor(...color);
    doc.roundedRect(14, y, 182, 7, 1, 1, 'F');
    doc.setTextColor(...WHITE);
    doc.setFontSize(10);
    doc.setFont('helvetica','bold');
    doc.text(title, 18, y+5);
    y += 11;
    rows.forEach(({ head, sub }) => {
      ensureRoom(10);
      doc.setFillColor(248,250,252);
      doc.rect(14, y, 182, 9, 'F');
      doc.setDrawColor(230,234,240);
      doc.line(14, y+9, 196, y+9);
      doc.setTextColor(20,30,50);
      doc.setFontSize(9);
      doc.setFont('helvetica','bold');
      doc.text(doc.splitTextToSize(head, 175)[0] || '', 17, y+4);
      doc.setTextColor(...LIGHT);
      doc.setFont('helvetica','normal');
      doc.setFontSize(7.5);
      doc.text(doc.splitTextToSize(sub, 175)[0] || '', 17, y+8);
      y += 11;
    });
  }

  const clinicalHours = clinical.reduce((s, e) => s + (Number(e.hours) || 0), 0);
  listSection(
    `CLINICAL & SHADOWING HOURS (${clinicalHours} total across ${clinical.length} ${clinical.length === 1 ? 'entry' : 'entries'})`,
    GREEN,
    clinical.map((e) => ({
      head: `${e.site_name || 'Site'} — ${e.hours || 0} hrs`,
      sub: [e.site_type, e.entry_date, e.supervisor_name && `Supervisor: ${e.supervisor_name}`,
        e.verification_status === 'verified' ? 'Verified' : 'Self-reported', e.notes].filter(Boolean).join(' · '),
    })),
  );

  listSection(
    `RESEARCH EXPERIENCE (${research.length})`,
    BLUE,
    research.map((e) => ({
      head: `${e.title || 'Project'}${e.institution ? ` — ${e.institution}` : ''}`,
      sub: [e.status, e.mentor_name && `Mentor: ${e.mentor_name}`, e.hours && `${e.hours} hrs`,
        e.publication_url && 'Publication linked', e.description].filter(Boolean).join(' · '),
    })),
  );

  listSection(
    `SKILLS & CERTIFICATIONS (${certifications.length})`,
    AMBER,
    certifications.map((e) => ({
      head: e.name || 'Certification',
      sub: [e.issuing_body, e.earned_date && `Earned ${e.earned_date}`,
        e.expiry_date && `Expires ${e.expiry_date}`].filter(Boolean).join(' · ') || 'No issuing body recorded',
    })),
  );

  footer(doc, page, page);
  doc.save(`portfolio-resume-${Date.now()}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
// The four-year record.
//
// ── What this renders ───────────────────────────────────────────────────────
// The document model built by src/lib/portfolioDossier.js — profile, activities
// grouped with totals and date ranges, the shadowing log by site with
// supervisors and dates, research, awards, certifications, coursework, the
// recommender list, and a chronological four-year timeline. In archive mode it
// also renders the student's private reflections, which the builder only ever
// includes for the student's own account.
//
// This function knows nothing about the database. It walks `doc.sections` by
// `kind` — 'grouped' | 'rows' | 'timeline' | 'longform' — which is why a new
// section can be added to the builder without touching the renderer.
//
// ── The free preview is a real page, not a mock ─────────────────────────────
// With `preview: true` the renderer produces page one of the genuine document,
// with the student's real name, real hours and real dates, diagonally
// watermarked, ending in a line that says what the rest contains. That is
// deliberate and it is the whole conversion argument: a seventeen-year-old
// seeing their own four years formatted properly for the first time is a
// different experience from reading a feature list, and a blurred placeholder
// throws that away to protect content the student themselves entered.
//
// The watermark is drawn UNDER the text (before each page's content) rather
// than over it, so the preview stays fully readable while being unmistakably
// not the final document. A watermark that obscures the thing it is advertising
// is an advert against itself.
// ─────────────────────────────────────────────────────────────────────────────
const PAGE_H = 297;
const MARGIN_X = 14;
const CONTENT_W = 182;
const PAGE_BOTTOM = 272;

function watermark(doc, label) {
  doc.saveGraphicsState?.();
  doc.setTextColor(232, 236, 244);
  doc.setFontSize(46);
  doc.setFont('helvetica', 'bold');
  // Three passes down the page so no section of a full page reads as unmarked.
  [90, 165, 240].forEach((y) => {
    doc.text(label, 105, y, { align: 'center', angle: 32 });
  });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.restoreGraphicsState?.();
}

export function exportPortfolioDossier(dossier, opts = {}) {
  const { preview = false, watermarkLabel = 'PREVIEW', fileName = null, save = true } = opts;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const meta = dossier?.meta || {};
  const stats = dossier?.stats || {};
  let page = 1;
  let stopped = false;   // preview truncation — set once and never rendered past

  const startPage = (title) => {
    if (preview) watermark(doc, watermarkLabel);
    return header(doc, title, [meta.studentName, meta.gradeLabel, meta.pathwayLabel]
      .filter(Boolean).join(' · ') || meta.generatedLabel);
  };

  let y = startPage(meta.modeLabel === 'Personal archive'
    ? 'Personal Archive — Four-Year Record'
    : 'Four-Year Record');

  /**
   * Page break, or — in preview mode — the point where the document stops.
   * Returns false when the caller must not draw anything more.
   */
  const room = (needed) => {
    if (stopped) return false;
    if (y + needed <= PAGE_BOTTOM) return true;
    if (preview) { stopped = true; return false; }
    footer(doc, page, page);
    doc.addPage();
    page += 1;
    y = startPage(`${meta.modeLabel === 'Personal archive' ? 'Personal Archive' : 'Four-Year Record'} (continued)`);
    return true;
  };

  const sectionBar = (title, color) => {
    if (!room(14)) return false;
    doc.setFillColor(...color);
    doc.roundedRect(MARGIN_X, y, CONTENT_W, 7, 1, 1, 'F');
    doc.setTextColor(...WHITE);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(String(title).toUpperCase(), MARGIN_X + 4, y + 5);
    y += 11;
    return true;
  };

  const noteLine = (text) => {
    if (!text || !room(8)) return;
    doc.setTextColor(...LIGHT);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'italic');
    const lines = doc.splitTextToSize(text, CONTENT_W - 4);
    lines.forEach((l) => { doc.text(l, MARGIN_X + 2, y); y += 3.4; });
    doc.setFont('helvetica', 'normal');
    y += 2.5;
  };

  const entryRow = ({ title, meta: sub, description, impact, flag, verified }) => {
    const descLines = description ? doc.splitTextToSize(description, CONTENT_W - 8).slice(0, 3) : [];
    const impactLines = impact ? doc.splitTextToSize(`Impact: ${impact}`, CONTENT_W - 8).slice(0, 2) : [];
    const h = 9 + descLines.length * 3.4 + impactLines.length * 3.4;
    if (!room(h + 3)) return;
    doc.setFillColor(248, 250, 252);
    doc.rect(MARGIN_X, y, CONTENT_W, h, 'F');
    doc.setDrawColor(230, 234, 240);
    doc.line(MARGIN_X, y + h, MARGIN_X + CONTENT_W, y + h);

    doc.setTextColor(...(flag === 'expired' ? RED : [20, 30, 50]));
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.text(doc.splitTextToSize(title, CONTENT_W - 22)[0] || '', MARGIN_X + 3, y + 4);
    if (verified) {
      doc.setTextColor(...GREEN);
      doc.setFontSize(6.5);
      doc.text('VERIFIED', MARGIN_X + CONTENT_W - 16, y + 4);
    }

    doc.setTextColor(...LIGHT);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(doc.splitTextToSize(sub || '', CONTENT_W - 8)[0] || '', MARGIN_X + 3, y + 8);

    let ly = y + 11.5;
    doc.setTextColor(60, 70, 90);
    doc.setFontSize(7);
    descLines.forEach((l) => { doc.text(l, MARGIN_X + 3, ly); ly += 3.4; });
    impactLines.forEach((l) => { doc.text(l, MARGIN_X + 3, ly); ly += 3.4; });
    y += h + 2;
  };

  // ── Cover block: who this is and what is in it ──────────────────────────
  doc.setFillColor(15, 24, 40);
  doc.roundedRect(MARGIN_X, y, CONTENT_W, 30, 2, 2, 'F');
  doc.setTextColor(...WHITE);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(meta.studentName || 'Student', MARGIN_X + 6, y + 9);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...LIGHT);
  doc.text([meta.gradeLabel, meta.pathwayLabel, meta.schoolName].filter(Boolean).join(' · ')
    || 'Health pathway record', MARGIN_X + 6, y + 14);
  doc.text(`Record spans ${meta.recordSpan || 'no dated entries yet'} · Generated ${meta.generatedLabel}`, MARGIN_X + 6, y + 18.5);

  const tiles = [
    [`${Math.round(stats.totalHours || 0).toLocaleString()}`, 'total hours'],
    [`${stats.clinicalEntries || 0}`, 'dated entries'],
    [`${stats.activities || 0}`, 'activities'],
    [`${stats.sites || 0}`, 'sites'],
    [`${stats.certifications || 0}`, 'credentials'],
  ];
  tiles.forEach(([v, l], i) => {
    const x = MARGIN_X + 6 + i * 35;
    doc.setTextColor(...WHITE);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(v, x, y + 26);
    doc.setTextColor(...LIGHT);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.text(l, x + 12, y + 26);
  });
  y += 36;

  if (meta.containsPrivate) {
    doc.setFillColor(255, 240, 240);
    doc.setDrawColor(...RED);
    doc.roundedRect(MARGIN_X, y, CONTENT_W, 12, 1.5, 1.5, 'FD');
    doc.setTextColor(...RED);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text('PERSONAL ARCHIVE — CONTAINS YOUR PRIVATE REFLECTIONS', MARGIN_X + 4, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 40, 50);
    doc.text('This version is for you. Use the application-ready export for anything you send to a program, a counselor or a parent.', MARGIN_X + 4, y + 9);
    y += 17;
  }

  const COLORS = {
    activities: BLUE, clinical: GREEN, research: BLUE, awards: AMBER,
    certifications: AMBER, coursework: GREEN, recommenders: BLUE,
    timeline: DARK, reflections: RED,
  };

  for (const section of dossier?.sections || []) {
    if (stopped) break;
    const color = COLORS[section.id] || BLUE;
    const heading = section.kind === 'grouped' && section.id === 'activities'
      ? `${section.title} (${(section.groups || []).reduce((s, g) => s + g.count, 0)})`
      : section.title;
    if (!sectionBar(heading, color)) break;
    noteLine(section.note);

    if (section.kind === 'grouped') {
      for (const group of section.groups || []) {
        if (stopped) break;
        if (!room(10)) break;
        doc.setTextColor(...color);
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'bold');
        doc.text(group.label, MARGIN_X + 2, y + 3);
        doc.setTextColor(...LIGHT);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.text([
          `${group.count} ${group.count === 1 ? 'entry' : 'entries'}`,
          group.totalHours ? `${Math.round(group.totalHours).toLocaleString()} hrs` : null,
          group.gradeSpan,
        ].filter(Boolean).join(' · '), MARGIN_X + CONTENT_W - 2, y + 3, { align: 'right' });
        y += 6.5;
        for (const row of group.rows || []) { if (stopped) break; entryRow(row); }
        y += 2;
      }
    } else if (section.kind === 'rows') {
      for (const row of section.rows || []) { if (stopped) break; entryRow(row); }
      y += 2;
    } else if (section.kind === 'timeline') {
      for (const year of section.years || []) {
        if (stopped) break;
        if (!room(9)) break;
        doc.setFillColor(238, 242, 248);
        doc.rect(MARGIN_X, y, CONTENT_W, 6, 'F');
        doc.setTextColor(...DARK);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text(year.label, MARGIN_X + 3, y + 4.2);
        y += 8.5;
        doc.setFont('helvetica', 'normal');
        for (const ev of year.events || []) {
          if (!room(5)) break;
          doc.setTextColor(...LIGHT);
          doc.setFontSize(6.8);
          doc.text(ev.dateLabel || '', MARGIN_X + 4, y);
          doc.setTextColor(30, 40, 60);
          doc.setFontSize(7.4);
          doc.text(doc.splitTextToSize(ev.label || '', 100)[0] || '', MARGIN_X + 34, y);
          if (ev.detail) {
            doc.setTextColor(...LIGHT);
            doc.setFontSize(6.8);
            doc.text(doc.splitTextToSize(ev.detail, 45)[0] || '', MARGIN_X + 136, y);
          }
          y += 4.4;
        }
        y += 3;
      }
    } else if (section.kind === 'longform') {
      for (const entry of section.entries || []) {
        if (stopped) break;
        if (!room(14)) break;
        doc.setTextColor(20, 30, 50);
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'bold');
        doc.splitTextToSize(entry.heading || '', CONTENT_W - 6).slice(0, 2)
          .forEach((l) => { doc.text(l, MARGIN_X + 2, y); y += 4; });
        if (entry.dateLabel) {
          doc.setTextColor(...LIGHT);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.text(entry.dateLabel, MARGIN_X + 2, y); y += 4;
        }
        doc.setTextColor(50, 60, 80);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        const body = doc.splitTextToSize(entry.body || '', CONTENT_W - 6);
        for (const line of body) {
          if (!room(5)) break;
          doc.text(line, MARGIN_X + 2, y);
          y += 4;
        }
        y += 5;
      }
    }
  }

  // ── The preview's closing line ──────────────────────────────────────────
  // Says what the rest of the document contains, in the student's own numbers,
  // and nothing about pricing — the pitch is the page they are holding.
  if (preview) {
    const boxY = Math.min(y + 2, PAGE_BOTTOM - 2);
    doc.setFillColor(15, 24, 40);
    doc.roundedRect(MARGIN_X, boxY, CONTENT_W, 18, 2, 2, 'F');
    doc.setTextColor(...WHITE);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.text('This is page one of your real record.', MARGIN_X + 5, boxY + 6.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...LIGHT);
    doc.text(doc.splitTextToSize(
      `The complete document continues with every one of your ${stats.sectionCount || 0} sections — `
      + `${stats.activities || 0} activities grouped with totals, ${stats.clinicalEntries || 0} dated `
      + `shadowing entries across ${stats.sites || 0} sites and ${stats.supervisors || 0} supervisors, `
      + `${stats.certifications || 0} credentials, ${stats.recommenders || 0} recommenders, and the full `
      + 'four-year timeline.', CONTENT_W - 10), MARGIN_X + 5, boxY + 11);
  }

  footer(doc, page, page);
  if (!save) return doc;
  const name = fileName
    || `${(meta.studentName || 'student').replace(/\s+/g, '-').toLowerCase()}-${meta.mode === 'archive' ? 'archive' : 'record'}${preview ? '-preview' : ''}-${Date.now()}.pdf`;
  doc.save(name);
  return doc;
}

export function exportPathwayCertificate(pathwayLabel, stats={}) {
  const { studentName='Student', totalLessons=0, completedLessons=0, avgScore=null, completedAt=Date.now() } = stats;
  const doc  = new jsPDF({ unit:'mm', format:'a4', orientation:'landscape' });
  const W = 297, H = 210;
  const date = new Date(completedAt).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });

  // Background + decorative border
  doc.setFillColor(...DARK);
  doc.rect(0, 0, W, H, 'F');
  doc.setDrawColor(...BLUE);
  doc.setLineWidth(1.2);
  doc.rect(8, 8, W-16, H-16);
  doc.setDrawColor(...GREEN);
  doc.setLineWidth(0.4);
  doc.rect(12, 12, W-24, H-24);

  doc.setTextColor(...LIGHT);
  doc.setFontSize(11);
  doc.setFont('helvetica','normal');
  doc.text('MedSchoolPrep', W/2, 28, { align:'center' });

  doc.setTextColor(...WHITE);
  doc.setFontSize(13);
  doc.setFont('helvetica','normal');
  doc.text('CERTIFICATE OF COMPLETION', W/2, 42, { align:'center' });

  doc.setDrawColor(...BLUE);
  doc.setLineWidth(0.4);
  doc.line(W/2-40, 47, W/2+40, 47);

  doc.setFontSize(10);
  doc.setTextColor(...LIGHT);
  doc.text('This certifies that', W/2, 62, { align:'center' });

  doc.setFontSize(26);
  doc.setFont('helvetica','bold');
  doc.setTextColor(...WHITE);
  doc.text(studentName, W/2, 76, { align:'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica','normal');
  doc.setTextColor(...LIGHT);
  doc.text('has completed every verified lesson in the', W/2, 90, { align:'center' });

  doc.setFontSize(18);
  doc.setFont('helvetica','bold');
  doc.setTextColor(...GREEN);
  doc.text(`${pathwayLabel} Pathway`, W/2, 102, { align:'center' });

  // Stats row
  const statY = 122;
  doc.setFillColor(15, 24, 40);
  doc.roundedRect(W/2-90, statY, 180, 20, 2, 2, 'F');
  doc.setFontSize(9);
  doc.setTextColor(...LIGHT);
  doc.setFont('helvetica','normal');
  doc.text('LESSONS VERIFIED', W/2-60, statY+8, { align:'center' });
  doc.text('AVERAGE QUIZ SCORE', W/2, statY+8, { align:'center' });
  doc.text('DATE COMPLETED', W/2+60, statY+8, { align:'center' });
  doc.setFontSize(13);
  doc.setFont('helvetica','bold');
  doc.setTextColor(...WHITE);
  doc.text(`${completedLessons}/${totalLessons}`, W/2-60, statY+16, { align:'center' });
  doc.text(avgScore!=null?`${avgScore}%`:'—', W/2, statY+16, { align:'center' });
  doc.setFontSize(10);
  doc.text(date, W/2+60, statY+16, { align:'center' });

  doc.setFontSize(8);
  doc.setTextColor(...LIGHT);
  doc.setFont('helvetica','normal');
  doc.text('Based on locally verified lesson quizzes · Not an accredited academic credential', W/2, 168, { align:'center' });
  doc.text(`Generated ${new Date().toLocaleDateString()}`, W/2, 174, { align:'center' });

  doc.save(`${pathwayLabel.replace(/\s+/g,'-')}-certificate-${Date.now()}.pdf`);
}

export function exportFlashDeck(deckName, cards) {
  const doc = new jsPDF({ unit:'mm', format:'a4' });
  let y = header(doc, `Flashcard Deck: ${deckName}`, `${cards.length} cards · ${new Date().toLocaleDateString()}`);

  cards.forEach((card, i) => {
    if (y > 255) { doc.addPage(); y = header(doc, `${deckName} (continued)`); }

    // Card number + stability indicator
    const stability = card.stability ? Math.round(card.stability) : 0;
    doc.setFillColor(15,24,40);
    doc.roundedRect(14, y, 182, 28, 2, 2, 'F');

    // Card indicator bar
    doc.setFillColor(...BLUE);
    doc.roundedRect(14, y, 2, 28, 1, 1, 'F');

    doc.setTextColor(...LIGHT);
    doc.setFontSize(8);
    doc.text(`CARD ${i+1}${stability?` · Stability: ${stability}d`:''}`, 20, y+5);

    doc.setTextColor(...WHITE);
    doc.setFontSize(9);
    doc.setFont('helvetica','bold');
    doc.text('Q:', 20, y+11);
    doc.setFont('helvetica','normal');
    const qLines = doc.splitTextToSize(card.front, 165);
    qLines.slice(0,1).forEach((l,li) => doc.text(l, 28, y+11+li*4));

    doc.setTextColor(...LIGHT);
    doc.setFont('helvetica','bold');
    doc.text('A:', 20, y+20);
    doc.setFont('helvetica','normal');
    const aLines = doc.splitTextToSize(card.back, 165);
    aLines.slice(0,2).forEach((l,li) => { doc.setTextColor(148,163,192); doc.text(l, 28, y+20+li*4); });

    y += 32;
  });

  doc.save(`deck-${deckName.replace(/\s+/g,'-')}-${Date.now()}.pdf`);
}
