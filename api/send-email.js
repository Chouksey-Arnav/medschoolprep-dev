// /api/send-email.js — Vercel serverless function
// Sends email via Resend API. Requires RESEND_API_KEY environment variable.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    return res.status(500).json({ error: 'Email not configured. Set RESEND_API_KEY in environment variables.' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body.' });
  }

  const { to, subject, html } = body || {};
  if (!to || !subject || !html) {
    return res.status(400).json({ error: 'Missing required fields: to, subject, html.' });
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from:    'MedSchoolPrep <noreply@yourverifieddomain.com>',
        to:      [String(to).slice(0, 200)],
        subject: String(subject).slice(0, 200),
        html:    String(html).slice(0, 50000),
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(502).json({ error: data?.message || 'Resend API error.' });
    }

    return res.status(200).json({ success: true, id: data.id });

  } catch (err) {
    console.error('Email handler error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
