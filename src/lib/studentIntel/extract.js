// ─────────────────────────────────────────────────────────────────────────────
// Lightweight structured extraction over a quick-capture note.
//
// Deliberately reuses the existing /api/groq endpoint (purpose: 'coach') rather
// than standing up a new AI code path — the whole point of this app's provider
// architecture (api/_lib/aiProviders.js, api/groq.js) is that every generation
// goes through the one hardened pipeline (key rotation, relief fallback, rate
// limits, safety). Adding a bespoke "extraction" purpose would fork that.
//
// The original text is NEVER touched by this — the caller (QuickCapture.jsx)
// always keeps `raw_text` exactly as typed and only ever writes the returned
// object into the `extracted` column, which the API layer (api/data/[resource]
// .js's IMMUTABLE_ON_PATCH) refuses to let overwrite raw_text on a later edit.
// A failed or low-confidence extraction is not an error the student needs to
// see — it just means the note stays as an unstructured entry until they
// (or a future pass) tag it.
// ─────────────────────────────────────────────────────────────────────────────
import { aiLane } from '../aiLane';

function parseLooseJSON(text) {
  if (!text) return null;
  const s = String(text).trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  const body = s.slice(first, last + 1);
  try { return JSON.parse(body); } catch { /* fall through */ }
  try { return JSON.parse(body.replace(/,\s*([}\]])/g, '$1')); } catch { return null; }
}

const EXTRACT_SYSTEM = `You extract structured facts from one short note a high-school student wrote about their own academics and activities. Read the note and return ONLY a JSON object (no prose, no markdown fence) with any of these keys you can confidently fill from what THEY wrote — omit any key you're not confident about, never guess or invent a value:
{
  "category": one of "activity" | "service" | "award" | "test_score" | "interest" | "reflection" | "school" | "other",
  "organization": string or null,
  "hours": number or null,
  "cause_area": string or null,
  "role": string or null,
  "interest": string or null,
  "note_summary": a neutral one-sentence paraphrase, never more confident or more detailed than the original text
}
Never fabricate a number, name, or date that isn't in the note. If the note doesn't clearly contain structured facts, return {"category":"other"}.`;

/**
 * @param {string} rawText
 * @returns {Promise<object|null>} the extracted object, or null if extraction failed/timed out —
 *   callers should treat null as "leave it unstructured", never as an error to surface.
 */
export async function extractFromNote(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return null;
  try {
    const res = await fetch('/api/groq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: EXTRACT_SYSTEM,
        messages: [{ role: 'user', content: text.slice(0, 1200) }],
        purpose: 'coach',
        maxTokens: 220,
        noCache: true,
        lane: aiLane(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.content) return null;
    return parseLooseJSON(data.content);
  } catch {
    return null;
  }
}
