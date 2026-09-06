// ─────────────────────────────────────────────────────────────────────────────
// Supplemental prompt resolution — curated first, Medabrain second.
//
// src/data/supplementalEssays.js covers the schools students on this platform
// most often have on their list, with prompts checked by hand. It cannot cover
// the whole country, and a student with a regional state school or a small
// liberal arts college on their list is exactly the student least likely to find
// this information anywhere else.
//
// So: curated data when we have it, and when we don't, Medabrain writes the set
// from what it knows about the school — under a hard requirement that it says
// which of the two it is doing. The `confidence` field on every returned prompt
// drives a visible badge in the UI, because "Duke asks this" and "a school like
// this typically asks something like this" are different claims and a student
// making a deadline decision needs to know which one they're looking at.
// ─────────────────────────────────────────────────────────────────────────────
import { getSupplementsFor, CYCLE_NOTE } from '../data/supplementalEssays';
import { aiLane } from './aiLane.js';

// confidence: 'curated' — from our hand-checked dataset, recent cycle
//             'recalled' — Medabrain recognizes the school and is reproducing
//                          the substance of its real recent prompts
//             'representative' — Medabrain does not know this school's prompts
//                          and has written the archetypes a school of this kind
//                          asks, purely as practice material
export const CONFIDENCE_LABELS = {
  curated: { label: 'Recent cycle', tone: 'good', note: CYCLE_NOTE },
  recalled: { label: 'From memory — verify', tone: 'warn', note: 'Medabrain recognized this school and reconstructed its recent prompts from memory. Treat the wording as close, not exact, and confirm on the school\'s site before you submit.' },
  representative: { label: 'Practice prompt — not official', tone: 'warn', note: 'Medabrain does not have this school\'s actual prompts. These are the kinds of questions a school like this asks, written so you have something real to practice against — do not treat them as this school\'s requirements.' },
};

const SYSTEM = `You are Medabrain, the supplemental-essay reference inside MedSchoolPrep, a college-prep app for U.S. high-school students. You are given the name of one U.S. college and you return that school's supplemental application essay prompts as JSON.

Two cases, and you must be honest about which one you are in — a student will plan their October around this answer.

CASE 1 — YOU RECOGNIZE THE SCHOOL and can recall the substance of its recent supplemental prompts. Reproduce them as faithfully as you can, with their real word limits and whether each is required. Set "confidence": "recalled" on each one.

CASE 2 — YOU DO NOT ACTUALLY KNOW this school's prompts, or you are unsure. Do NOT guess and present it as fact. Instead write 2-4 prompts of the archetypes this kind of school realistically asks (why this school, why this major, community/contribution, an activity elaboration), with plausible word limits, so the student has something genuine to practice on. Set "confidence": "representative" on each one. It is completely acceptable — and much better — to say you don't know by using this case. Never invent a named program, professor, tradition, or campus landmark you are not sure exists.

If the school genuinely requires no supplemental essays (many large public universities do not), return an empty "essays" array and say so in "summary".

Return ONLY valid JSON, no markdown fences, in exactly this shape:
{
  "school": "the school's full official name",
  "summary": "one plain sentence about this school's supplemental requirements",
  "essays": [
    {
      "prompt": "the full prompt text, written as the school words it",
      "wordLimit": 250,
      "required": true,
      "kind": "why_school | why_major | community | identity | activity | intellectual | creative | short",
      "confidence": "recalled | representative"
    }
  ]
}`;

function coerceEssays(parsed) {
  const rows = Array.isArray(parsed?.essays) ? parsed.essays : [];
  return rows
    .filter(e => e && typeof e.prompt === 'string' && e.prompt.trim().length > 15)
    .slice(0, 8)
    .map((e, i) => ({
      id: `ai_${i}`,
      prompt: e.prompt.trim(),
      wordLimit: Number.isFinite(Number(e.wordLimit)) ? Math.max(0, Math.min(1000, Number(e.wordLimit))) : 250,
      required: e.required !== false,
      kind: typeof e.kind === 'string' ? e.kind : 'why_school',
      // Anything the model didn't explicitly mark as recalled is treated as
      // representative. Defaulting the other way would turn a formatting slip
      // into a false claim about a real school's requirements.
      confidence: e.confidence === 'recalled' ? 'recalled' : 'representative',
    }));
}

// Returns { school, summary, essays: [...], source } or throws.
export async function fetchSupplementPrompts(collegeName, { signal = null } = {}) {
  const name = String(collegeName || '').trim();
  if (!name) throw new Error('No school name given.');

  const res = await fetch('/api/groq', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system: SYSTEM,
      message: `School: ${name}. Return its supplemental essay prompts as JSON, following the rules and shape you were given.`,
      purpose: 'essay',
      lane: aiLane(),
      tier: 'sage',
      maxTokens: 1200,
      jsonMode: true,
      temperature: 0.2, // this is a recall task; sampling variety here just invents prompts
    }),
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Medabrain couldn't look up those prompts (${res.status}).`);

  let parsed;
  try {
    parsed = JSON.parse(String(data?.content || '').replace(/^```(?:json)?/i, '').replace(/```$/, '').trim());
  } catch {
    throw new Error("Medabrain's answer wasn't readable. Try again.");
  }
  return {
    school: typeof parsed?.school === 'string' && parsed.school.trim() ? parsed.school.trim() : name,
    summary: typeof parsed?.summary === 'string' ? parsed.summary.trim() : '',
    essays: coerceEssays(parsed),
    source: 'ai',
  };
}

// The one function the UI calls. Curated data is synchronous and free, so it is
// always tried first — the network call only happens for schools we don't cover.
export async function resolveSupplements(collegeName, { signal = null } = {}) {
  const curated = getSupplementsFor(collegeName);
  if (curated) {
    return {
      school: curated.name,
      summary: curated.note || '',
      source: 'curated',
      essays: curated.essays.map(e => ({ ...e, confidence: 'curated' })),
    };
  }
  return fetchSupplementPrompts(collegeName, { signal });
}
