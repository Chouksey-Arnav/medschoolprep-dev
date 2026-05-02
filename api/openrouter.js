// /api/openrouter.js — Vercel serverless function
// Routes MetaBrain AI Coach through OpenRouter free tier
// Models verified free from user's OpenRouter account:
//   Gemma 3 27B, Gemma 3 12B, Gemma 3 4B, Gemma 4 31B,
//   Nemotron 3 Nano Omni, Owl Alpha, Poolside Laguna M.1
// Rate limit: 40 requests per IP per hour

const rateMap = new Map();
const RATE_LIMIT = 40;
const WINDOW_MS  = 60 * 60 * 1000;

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  if (entry.count >= RATE_LIMIT) return true;
  entry.count += 1;
  return false;
}

function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return null;
  return messages
    .filter(m => m && typeof m.role === 'string' && typeof m.content === 'string')
    .map(m => ({
      role:    ['user','assistant','system'].includes(m.role) ? m.role : 'user',
      content: String(m.content).slice(0, 4000),
    }))
    .slice(-24);
}

// Free models verified from your OpenRouter account.
// Ordered: largest/best first, smallest as last-resort fallback.
const MODELS = [
  'google/gemma-3-27b-it:free',                       // Gemma 3 27B — best verified free science model
  'google/gemma-4-31b:free',                          // Gemma 4 31B — newest, try after 27B
  'google/gemma-3-12b-it:free',                       // Gemma 3 12B — solid fallback
  'nvidia/llama-3.1-nemotron-nano-8b-instruct:free',  // Nemotron Nano — confirmed free in screenshot
  'google/gemma-3-4b-it:free',                        // Gemma 3 4B — last resort
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
    .split(',')[0].trim();
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Rate limit reached. Please wait before sending more messages.' });
  }

  const OR_KEY = process.env.OPENROUTER_KEY;
  if (!OR_KEY) {
    return res.status(500).json({ error: 'AI features not configured. Add OPENROUTER_KEY to Vercel environment variables.' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body.' });
  }

  const { system, message, messages: rawMessages, maxTokens = 900 } = body || {};
  if (!message && !rawMessages) return res.status(400).json({ error: 'No message provided.' });

  let openaiMessages = [];
  if (system) {
    openaiMessages.push({ role: 'system', content: String(system).slice(0, 2000) });
  }
  if (rawMessages) {
    const cleaned = sanitizeMessages(rawMessages);
    if (cleaned) openaiMessages.push(...cleaned);
  } else if (message) {
    openaiMessages.push({ role: 'user', content: String(message).slice(0, 4000) });
  }

  if (
    openaiMessages.length === 0 ||
    (openaiMessages.length === 1 && openaiMessages[0].role === 'system')
  ) {
    return res.status(400).json({ error: 'No valid messages to send.' });
  }

  const clampedTokens = Math.min(Math.max(50, parseInt(maxTokens) || 900), 2000);

  for (const model of MODELS) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${OR_KEY}`,
          'HTTP-Referer':  'https://medschoolprep.vercel.app',
          'X-Title':       'MedSchoolPrep MetaBrain Coach',
        },
        body: JSON.stringify({
          model,
          max_tokens:  clampedTokens,
          temperature: 0.65,
          messages:    openaiMessages,
        }),
      });

      // Try next model on rate limit or server errors
      if (response.status === 429 || response.status === 503 || response.status === 502) {
        console.warn(`[openrouter] Model ${model} returned ${response.status}, trying next…`);
        continue;
      }

      const data = await response.json();

      if (!response.ok) {
        console.error(`[openrouter] Error from ${model}:`, data?.error?.message);
        continue;
      }

      const content = data?.choices?.[0]?.message?.content;
      if (!content) {
        console.warn(`[openrouter] Empty content from ${model}, trying next…`);
        continue;
      }

      return res.status(200).json({ content, model_used: model });

    } catch (err) {
      console.error(`[openrouter] Exception with ${model}:`, err.message);
      continue;
    }
  }

  return res.status(502).json({
    error: 'All AI models are temporarily unavailable. Please try again in a moment.'
  });
}
