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
  doc.text('🧬 MedSchoolPrep', 12, 12);
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

export function exportSchoolList(schools, profile={}) {
  const doc   = new jsPDF({ unit:'mm', format:'a4' });
  const tiers = ['Likely','Target','Reach','Stretch'];
  const tc    = { Likely:GREEN, Target:BLUE, Reach:AMBER, Stretch:RED };

  let y = header(doc, 'Medical School List', `GPA ${profile.gpa||'—'} · MCAT ${profile.mcat||'—'} · Generated ${new Date().toLocaleDateString()}`);

  // Profile summary
  doc.setFillColor(15, 24, 40);
  doc.roundedRect(14, y, 182, 16, 2, 2, 'F');
  doc.setTextColor(...LIGHT);
  doc.setFontSize(8);
  ['Likely','Target','Reach','Stretch'].forEach((t,i) => {
    const n = schools.filter(s=>s.tier===t).length;
    const col = tc[t];
    doc.setTextColor(...col);
    doc.setFont('helvetica','bold');
    doc.text(`${t}: ${n}`, 20 + i*46, y+7);
  });
  doc.setTextColor(...LIGHT);
  doc.setFont('helvetica','normal');
  doc.text(`Total: ${schools.length} schools`, 20, y+13);
  y += 24;

  let page = 1;
  tiers.forEach(tier => {
    const list = schools.filter(s=>s.tier===tier);
    if (!list.length) return;

    // Tier header
    if (y > 260) { footer(doc, page, 1); doc.addPage(); page++; y = header(doc, 'School List (continued)'); }
    doc.setFillColor(...tc[tier]);
    doc.roundedRect(14, y, 182, 7, 1, 1, 'F');
    doc.setTextColor(...WHITE);
    doc.setFontSize(10);
    doc.setFont('helvetica','bold');
    doc.text(`${tier.toUpperCase()} (${list.length})`, 18, y+5);
    y += 11;

    list.forEach(s => {
      if (y > 270) { footer(doc, page, 1); doc.addPage(); page++; y = header(doc, 'School List (continued)'); }
      doc.setFillColor(248,250,252);
      doc.rect(14, y, 182, 9, 'F');
      doc.setDrawColor(230,234,240);
      doc.line(14, y+9, 196, y+9);
      doc.setTextColor(20,30,50);
      doc.setFontSize(9);
      doc.setFont('helvetica','bold');
      doc.text(s.name, 17, y+4);
      doc.setTextColor(...LIGHT);
      doc.setFont('helvetica','normal');
      doc.setFontSize(7);
      doc.text(`GPA ${s.gpa} · MCAT ${s.mcat} · ${s.accept}% acceptance · ${s.type} · ${s.state}`, 17, y+8);
      y += 11;
    });
    y += 4;
  });

  footer(doc, page, page);
  doc.save(`school-list-${Date.now()}.pdf`);
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
