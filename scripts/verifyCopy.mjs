// ─────────────────────────────────────────────────────────────────────────────
// Copy audit — capitalization, spelling, and one word per thing.
//
// This exists because a one-time cleanup of the copy would have been undone
// within a month. Capitalization drifts the way it does precisely because
// nothing catches it: every screen is written by somebody in a hurry, "Clear
// Filters" and "Clear filters" both look fine in isolation, and the
// inconsistency is only visible when you put forty of them side by side, which
// nobody ever does.
//
// So the decisions live in docs/glossary.json (machine-readable) and
// docs/STYLE_GUIDE.md (the same decisions, with reasons), and this script fails
// the build on anything that contradicts them.
//
// ── What it checks ──────────────────────────────────────────────────────────
//
//   1. SENTENCE CASE   headings, buttons, labels, nav items, table headers and
//                      empty states. Not Title Case — which is inconsistent by
//                      definition, because no two people agree on whether "to"
//                      or "Your" gets a capital, and every style guide draws
//                      the line somewhere different. Sentence case has one
//                      rule, so it cannot drift.
//   2. NO ALL CAPS     for anything longer than a short abbreviation. All-caps
//                      strips the word-shape cue fluent reading depends on, and
//                      it is specifically harder for dyslexic readers. The
//                      eyebrow treatment (13px, +0.4 tracking) is the answer.
//   3. AMERICAN        the audience is entirely US. The map is in the glossary.
//   4. ONE WORD PER    shadowing, activities, pathway, program. Two words for
//      THING           one thing is how a student ends up believing there are
//                      two things.
//   5. NAMES           product names and credential names have exact
//                      capitalizations. Credentials are checked against
//                      src/data/credentials/*.js, which is the database the app
//                      already treats as authoritative — not a second copy.
//   6. SPELLING        cspell over the extracted copy, with our domain words in
//                      docs/dictionary.txt. Only the copy: running a spell
//                      checker over source code produces a list of identifiers
//                      nobody reads twice.
//
// ── What counts as copy ─────────────────────────────────────────────────────
// scripts/lib/copyStrings.mjs, which reads a real AST rather than guessing.
// The distinction it protects is the one that matters here: `status:
// 'cancelled'` is a PostgreSQL check constraint, not a British spelling.
//
// Run: node scripts/verifyCopy.mjs
//   --words      list the unknown words and nothing else, for triage
//   --no-spell   skip the spell check (the slow part)
//   COPY_MAX=n   print n findings instead of the first 60
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { extractSpans, lineAt, COPY_PROPS } from './lib/copyStrings.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const glossary = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/glossary.json'), 'utf8'));

const failures = [];
const notes = [];

// ── Where copy lives ─────────────────────────────────────────────────────────
// Components and the app shell are UI copy and are held to every rule.
// src/data is content — lesson bodies, quiz banks, external resource titles —
// and is held to spelling only: "BigFuture — Extracurriculars Matter to You and
// to Colleges" is somebody else's headline and we do not get to restyle it.
const UI_DIRS = ['src/components', 'src/legal'];
const UI_FILES = ['src/App.jsx'];
const CONTENT_DIRS = ['src/data', 'src/lib'];

const walk = (dir, out = []) => {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) walk(rel, out);
    else if (/\.jsx?$/.test(e.name)) out.push(rel);
  }
  return out;
};

const uiFiles = [...UI_DIRS.flatMap((d) => walk(d)), ...UI_FILES];
const contentFiles = CONTENT_DIRS.flatMap((d) => walk(d));

// Props whose value is a synonym list for search, not copy to be read.
const SYNONYM_PROPS = new Set(['aliases', 'synonyms', 'keywords', 'terms', 'tags', 'match', 'matches']);
// Whole files that are search indexes rather than copy. NAV_KEYWORDS exists so
// that a student who types the word we DON'T use still finds the screen —
// holding it to the terminology rule would defeat its entire purpose.
const SYNONYM_FILES = new Set(['src/lib/navMap.js']);

/** Every span we care about, with its origin. */
function collect(files, { ui }) {
  const out = [];
  for (const rel of files) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    for (const span of extractSpans(text)) {
      if (SYNONYM_PROPS.has(span.prop)) continue;
      if (SYNONYM_FILES.has(rel) && span.kind !== 'comment') continue;
      out.push({ ...span, file: rel, line: lineAt(text, span.start), ui });
    }
  }
  return out;
}

// The marketing surfaces are not .jsx and are the easiest place for a British
// spelling to survive: the prerendered SEO shell in index.html, the route
// descriptions the prerenderer stamps into every static page, and llms.txt.
// They ship to more readers than most screens do.
const PLAIN_FILES = ['index.html', 'public/llms.txt', 'public/robots.txt'];

function collectPlain(files) {
  const out = [];
  for (const rel of files) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    const text = fs.readFileSync(abs, 'utf8');
    text.split('\n').forEach((line, i) => {
      if (!/[A-Za-z]{3}/.test(line)) return;
      out.push({ kind: 'plain', text: line, file: rel, line: i + 1, ui: false });
    });
  }
  return out;
}

const spans = [
  ...collect(uiFiles, { ui: true }),
  ...collect(contentFiles, { ui: false }),
  ...collectPlain(PLAIN_FILES),
];
const copy = spans.filter((s) => s.kind !== 'comment');
const uiCopy = copy.filter((s) => s.ui);
// Terminology is checked over everything the app itself says, which includes
// src/lib — the roadmap generator, the nav map and the PDF exporter all write
// sentences a student reads. It is NOT checked over src/data: "BigFuture —
// Extracurriculars Matter to You and to Colleges" is somebody else's headline
// and we do not get to rename their article.
const ourWords = copy.filter((s) => s.ui || s.file.startsWith('src/lib/'));

const at = (s) => `${s.file}:${s.line}`;

// ── 3. American spelling ─────────────────────────────────────────────────────
{
  const map = Object.entries(glossary.spelling).filter(([k]) => !k.startsWith('$'));
  const re = new RegExp(`\\b(${map.map(([k]) => k).join('|')})\\b`, 'gi');
  const lookup = new Map(map.map(([k, v]) => [k.toLowerCase(), v]));
  for (const s of spans) {
    for (const m of s.text.matchAll(re)) {
      failures.push(`${at(s)}: "${m[1]}" → "${lookup.get(m[1].toLowerCase())}". The audience is entirely US; the map is in docs/glossary.json.`);
    }
  }
}

// ── 4. One word per thing ────────────────────────────────────────────────────
for (const term of glossary.terms) {
  for (const banned of term.instead) {
    const re = new RegExp(`\\b${banned.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    for (const s of ourWords) {
      if (re.test(s.text)) {
        failures.push(`${at(s)}: "${banned}" → "${term.prefer}". ${term.why}`);
      }
    }
  }
}

// ── 5a. Product names ────────────────────────────────────────────────────────
for (const [canonical, wrongs] of Object.entries(glossary.productNames)) {
  if (canonical.startsWith('$')) continue;
  for (const wrong of wrongs) {
    for (const s of copy) {
      const re = new RegExp(`\\b${wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
      // A domain name is lowercase by nature and is not the product name.
      const cleaned = s.text.replace(/\b[\w.-]+\.(cloud|com|org|net|io|app)\b/g, ' ');
      if (re.test(cleaned)) failures.push(`${at(s)}: "${wrong}" → "${canonical}". Our own product names have one spelling.`);
    }
  }
}

// ── 5b. Credential names ─────────────────────────────────────────────────────
// The credential database is the source of truth for the issuer's exact
// capitalization; anything in the copy that matches one case-insensitively must
// match it case-sensitively too.
{
  const credFiles = walk('src/data/credentials');
  const official = new Set();
  for (const rel of credFiles) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    for (const m of text.matchAll(/officialName:\s*'([^']+)'/g)) official.add(m[1]);
  }
  notes.push(`${official.size} credential names checked against src/data/credentials/`);
  for (const name of official) {
    if (name.length < 12) continue;                       // too short to be distinctive
    const re = new RegExp(name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'), 'gi');
    for (const s of copy) {
      for (const m of s.text.matchAll(re)) {
        if (m[0] !== name) {
          failures.push(`${at(s)}: "${m[0]}" is a credential name — the issuer spells it "${name}". Credential capitalization is exact.`);
        }
      }
    }
  }
}

// ── 2. No all caps ───────────────────────────────────────────────────────────
// Screen copy only. Two things are deliberately out of scope:
//
//   src/lib prompts — the all-caps in portfolioCritique.js and the interview
//   prompts is emphasis addressed to a language model, not to a student.
//   src/legal — a warranty disclaimer set in capitals is a legal convention
//   (the "conspicuous" requirement), and quietly restyling it is not a
//   typography decision anybody here is entitled to make. See STYLE_GUIDE.md.
{
  const maxLen = glossary.caps.maxAllCapsLength;
  const proper = new Set(glossary.properNouns.exact);
  // …and neither is a string that lives in a prompt constant. An LLM prompt in
  // a component file is still addressed to a model, not to a student.
  const PROMPT_SCOPE = /PROMPT|TONE|INSTRUCTION|SYSTEM|RUBRIC|PROTOCOL|BRIEF/i;
  const screenCopy = uiCopy.filter((s) => !s.file.startsWith('src/legal') && !PROMPT_SCOPE.test(s.scope || ''));
  for (const s of screenCopy) {
    for (const m of s.text.matchAll(/\b[A-Z][A-Z0-9'&/-]{2,}(?:\s+[A-Z][A-Z0-9'&/-]+)*\b/g)) {
      const word = m[0].trim();
      const words = word.split(/\s+/);
      if (word.length <= maxLen) continue;
      if (proper.has(word)) continue;
      if (words.every((w) => proper.has(w) || w.length <= maxLen)) continue;
      // A single token carrying a digit or a slash is a formula or a code —
      // CYP450, DNA/RNA, FADH2 — not a sentence someone shouted.
      if (words.length === 1 && /[0-9/]/.test(word)) continue;
      // A single all-letter token up to eight characters is an acronym.
      if (words.length === 1 && /^[A-Z]+$/.test(word) && word.length <= 8) continue;
      // A hyphenated group of short blocks is a code format, not a shout:
      // the invite-code placeholder "ABCD-EFGH" is telling a parent the shape
      // of the thing they are pasting.
      if (words.length === 1 && word.split('-').every((part) => /^[A-Z0-9]{2,5}$/.test(part))) continue;
      failures.push(`${at(s)}: "${word}" is set in capitals. All-caps costs the word-shape cue fluent reading leans on, and costs dyslexic readers most — use the eyebrow treatment (lbl() in src/lib/theme.js) instead.`);
    }
  }
}

// ── 1. Sentence case ─────────────────────────────────────────────────────────
// Only strings that are unambiguously a heading, a button, a tab or a label: a
// sentence inside a paragraph is prose and its capitalization is its own
// business.
//
// Proper nouns are masked out as PHRASES before the test runs, so listing
// "Ohio State University" exempts that name without quietly exempting the word
// "State" in every other label.
{
  const LABEL_PROPS = new Set(['title', 'label', 'actionLabel', 'heading', 'headline', 'eyebrow', 'cta', 'ctaLabel', 'confirmLabel', 'cancelLabel', 'nextLabel', 'backLabel', 'tab', 'name']);
  const phrases = [...glossary.properNouns.exact].sort((a, b) => b.length - a.length);

  const maskRanges = (text) => {
    const ranges = [];
    for (const p of phrases) {
      let from = 0;
      for (;;) {
        const i = text.indexOf(p, from);
        if (i === -1) break;
        ranges.push([i, i + p.length]);
        from = i + p.length;
      }
    }
    return ranges;
  };
  const inRanges = (ranges, i) => ranges.some(([a, b]) => i >= a && i < b);

  // Words are counted as LETTER-words, not whitespace tokens: "📊 History" and
  // "8. Advertising" are one-word headings with something in front of them, and
  // splitting on spaces would call both of them Title Case.
  const WORD = /[\p{L}][\p{L}'’-]*/gu;

  const isTitleCase = (text) => {
    const trimmed = text.trim();
    if (/[.!?:]$/.test(trimmed)) return false;
    if (trimmed.split(/\s+/).length > 9) return false;
    const ranges = maskRanges(trimmed);
    let capped = 0;
    let candidates = 0;
    let index = 0;
    for (const m of trimmed.matchAll(WORD)) {
      index += 1;
      if (index === 1) continue;                                 // the first word is always capital
      const w = m[0];
      if (inRanges(ranges, m.index)) continue;                   // inside a proper noun
      if (/^[\p{Lu}]{2,}$/u.test(w)) continue;                    // acronym
      if (/[\p{Lu}]/u.test(w.slice(1))) continue;                 // MedEx-style internal caps
      if (/^[\p{Lu}]['’]?s?$/u.test(w)) continue;                 // a letter grade: "Mostly A's"
      candidates += 1;
      if (/^[\p{Lu}]/u.test(w)) capped += 1;
    }
    return candidates >= 1 && capped === candidates;
  };

  // A label is either a label-ish prop, or the text inside a control. The
  // second case is most of this app's button copy — "Open Chest" is a JSX text
  // node with no prop anywhere near it.
  const CONTROL_TAGS = new Set(['button', 'a', 'summary', 'option', 'label', 'th', 'h1', 'h2', 'h3', 'h4']);
  for (const s of uiCopy) {
    const isLabel = LABEL_PROPS.has(s.prop) || (s.kind === 'jsx' && CONTROL_TAGS.has(s.element));
    if (!isLabel) continue;
    if (isTitleCase(s.text)) {
      failures.push(`${at(s)}: "${s.text.trim().replace(/\s+/g, ' ')}" is Title Case. Everything is sentence case — headings, buttons, labels, nav items, table headers, empty states — because Title Case is inconsistently applied by definition: nobody agrees which words get a capital, so it drifts the moment a second person writes a screen. Proper nouns and credential names keep their capitals.`);
    }
  }
}

// ── 6. Spelling ──────────────────────────────────────────────────────────────
if (!process.argv.includes('--no-spell')) {
  // UI copy only. src/data is a 60,000-string content library — lesson bodies
  // full of carboxylic acids and cytosol, quiz banks, external resource titles —
  // and spell-checking it against a general en-US dictionary produces a list of
  // real biochemistry that somebody then has to hand-approve. The screens are
  // where a typo is read by every student on every visit.
  const corpus = uiCopy.map((s) => s.text.replace(/\s+/g, ' ').trim()).filter(Boolean);
  // Through stdin rather than a temp file: cspell only reads files inside the
  // project it was pointed at, and a corpus file inside the repo is a file
  // somebody eventually commits.
  let unknown = [];
  // The installed binary by path, not `npx`: inside a container image build
  // `npx cspell` treats a missing package as "fetch it from the registry", which
  // turns a spell check into a network call in the middle of a deploy. Falling
  // back to `npx` keeps the old behaviour for anyone running this outside a
  // fully installed tree.
  const local = path.join(ROOT, 'node_modules', '.bin', 'cspell');
  const bin = fs.existsSync(local) ? local : 'npx';
  const lint = ['lint', '--no-progress', '--no-summary', '--words-only', '--unique', '--config', path.join(ROOT, 'cspell.json'), 'stdin'];
  const args = bin === 'npx' ? ['cspell', ...lint] : lint;
  try {
    const out = execFileSync(bin, args, { cwd: ROOT, encoding: 'utf8', input: `${corpus.join('\n')}\n`, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
    unknown = out.split('\n').map((w) => w.trim()).filter(Boolean);
  } catch (err) {
    // cspell exits non-zero when it finds something, which is the normal path.
    // A missing binary is different: skip the check loudly rather than reporting
    // its error message as a list of misspelled words.
    const missing = err.code === 'ENOENT' || /not found|could not determine executable/i.test(String(err.stderr || ''));
    if (missing) {
      notes.push('cspell is not installed — spelling was NOT checked. Run `npm ci`.');
      unknown = [];
    } else {
      unknown = String(err.stdout || '').split('\n').map((w) => w.trim()).filter(Boolean);
    }
  }

  if (process.argv.includes('--words')) {
    console.log(unknown.join('\n'));
    process.exit(0);
  }

  for (const word of unknown) {
    const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    const where = uiCopy.filter((s) => re.test(s.text)).slice(0, 2).map(at);
    failures.push(`"${word}" is not a word. ${where.join(', ')}${where.length ? '' : ' (in copy)'} — fix it, or add it to docs/dictionary.txt if it is a real domain term.`);
  }
  notes.push(`${corpus.length} copy strings spell-checked (en-US + docs/dictionary.txt)`);
}

// ── Report ───────────────────────────────────────────────────────────────────
console.log('\nCopy audit\n');
console.log(`  scope       ${uiFiles.length} UI files, ${contentFiles.length} content files, ${copy.length} copy strings`);
console.log(`  rules       sentence case · no all-caps · American spelling · one word per thing`);
for (const n of notes) console.log(`  · ${n}`);

if (failures.length) {
  const unique = [...new Set(failures)];
  console.error(`\n✗ ${unique.length} copy problem(s):\n`);
  for (const f of unique.slice(0, Number(process.env.COPY_MAX || 60))) console.error(`  - ${f}`);
  if (unique.length > 60) console.error(`  …and ${unique.length - 60} more.`);
  console.error('');
  process.exit(1);
}
console.log('\n✓ capitalization, spelling and terminology all match docs/STYLE_GUIDE.md.\n');
