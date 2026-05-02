// /api/openrouter.js — Vercel serverless function
// Routes MetaBrain AI Coach through OpenRouter — Gemma 4 31B (free tier)
// Fallback chain: Gemma 4 31B → Gemma 3 27B → Nemotron 3 Nano
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

// Model priority list — Gemma 4 31B first, fallbacks if rate-limited or unavailable
const MODELS = [
  'google/gemma-4-31b:free',
  'google/gemma-3-27b-it:free',
  'google/gemma-3-12b-it:free',
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
    return res.status(429).json({ error: 'Rate limit reached. Please wait a moment before sending more messages.' });
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
  if (system) openaiMessages.push({ role: 'system', content: String(system).slice(0, 2000) });
  if (rawMessages) {
    const cleaned = sanitizeMessages(rawMessages);
    if (cleaned) openaiMessages.push(...cleaned);
  } else if (message) {
    openaiMessages.push({ role: 'user', content: String(message).slice(0, 4000) });
  }

  if (openaiMessages.length === 0 || (openaiMessages.length === 1 && openaiMessages[0].role === 'system')) {
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
          'X-Title':       'MedSchoolPrep — MetaBrain Coach',
        },
        body: JSON.stringify({
          model,
          max_tokens:  clampedTokens,
          temperature: 0.65,
          messages:    openaiMessages,
        }),
      });

      // If rate-limited or service unavailable, try next model
      if (response.status === 429 || response.status === 503 || response.status === 502) {
        console.warn(`Model ${model} returned ${response.status}, trying fallback…`);
        continue;
      }

      const data = await response.json();

      if (!response.ok) {
        const errMsg = data?.error?.message || `OpenRouter error (${response.status})`;
        console.error('OpenRouter API error:', errMsg, 'model:', model);
        continue;
      }

      const content = data?.choices?.[0]?.message?.content;
      if (!content) {
        console.warn(`Empty response from model ${model}, trying fallback…`);
        continue;
      }

      return res.status(200).json({ content, model_used: model });

    } catch (err) {
      console.error(`Error with model ${model}:`, err.message);
      continue;
    }
  }

  return res.status(502).json({
    error: 'All AI models are temporarily unavailable. Please try again in a moment.'
  });
}
