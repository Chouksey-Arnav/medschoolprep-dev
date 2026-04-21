// ─────────────────────────────────────────────────────────────────────────────
// marked + DOMPurify — Render AI responses as beautiful markdown
// ─────────────────────────────────────────────────────────────────────────────
import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Configure renderer for dark-theme code blocks
const renderer = new marked.Renderer();

renderer.code = (code, lang) => {
  const escaped = String(code).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return `<pre style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:12px 16px;overflow-x:auto;margin:8px 0;font-family:'JetBrains Mono',monospace;font-size:12px;line-height:1.6"><code>${escaped}</code></pre>`;
};

renderer.codespan = (code) => {
  return `<code style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:4px;padding:2px 6px;font-family:'JetBrains Mono',monospace;font-size:12px">${code}</code>`;
};

renderer.blockquote = (quote) => {
  return `<blockquote style="border-left:3px solid rgba(45,127,255,0.6);margin:8px 0;padding:4px 16px;color:rgba(148,163,192,0.9)">${quote}</blockquote>`;
};

renderer.strong = (text) => `<strong style="color:#eef2ff;font-weight:700">${text}</strong>`;
renderer.em = (text) => `<em style="color:#94a3c0">${text}</em>`;

renderer.heading = (text, level) => {
  const sizes = { 1:'16px', 2:'15px', 3:'14px' };
  return `<div style="font-size:${sizes[level]||'14px'};font-weight:700;color:#eef2ff;font-family:'Bricolage Grotesque',sans-serif;margin:12px 0 6px">${text}</div>`;
};

renderer.list = (body, ordered) => {
  const tag = ordered ? 'ol' : 'ul';
  return `<${tag} style="padding-left:20px;margin:6px 0;display:flex;flex-direction:column;gap:4px">${body}</${tag}>`;
};

renderer.listitem = (text) => `<li style="color:#94a3c0;line-height:1.6;font-size:13px">${text}</li>`;

renderer.paragraph = (text) => `<p style="margin:6px 0;line-height:1.75;color:#94a3c0;font-size:13px">${text}</p>`;

renderer.hr = () => `<hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:12px 0"/>`;

marked.setOptions({ renderer, gfm: true, breaks: true });

export function renderMarkdown(text) {
  if (!text) return '';
  const html = marked.parse(String(text));
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p','strong','em','ul','ol','li','code','pre','blockquote','h1','h2','h3','hr','br','div','span'],
    ALLOWED_ATTR: ['style','class'],
    FORBID_ATTR: ['onerror','onclick','onload'],
  });
}
