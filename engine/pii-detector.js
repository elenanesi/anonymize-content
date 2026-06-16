export const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
export const URL_RE = /\bhttps?:\/\/[^\s<>"')\]]+/gi;
export const PHONE_RE = /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}\b/g;

export const PII_PATTERNS = [
  { kind: "email", regex: EMAIL_RE },
  { kind: "url", regex: URL_RE },
  { kind: "phone", regex: PHONE_RE }
];

const MAX_CONTEXTS = 3;
const CONTEXT_RADIUS = 28;

export function detectPii(textSnippets) {
  const groups = new Map();
  const snippets = normalizeSnippets(textSnippets);

  for (const snippet of snippets) {
    collectMatches(snippet, EMAIL_RE, "email", groups);
    collectMatches(snippet, URL_RE, "url", groups);
    collectMatches(snippet, PHONE_RE, "phone", groups, shouldSkipPhone);
  }

  return Array.from(groups.values())
    .map((group) => ({
      token: group.token,
      canonical: group.canonical,
      count: group.count,
      kind: group.kind,
      confidence: "high",
      variants: [group.token],
      contexts: group.contexts
    }))
    .sort((a, b) => b.count - a.count || a.token.localeCompare(b.token));
}

function normalizeSnippets(textSnippets) {
  const out = [];
  const seen = new Set();
  for (const snippet of textSnippets) {
    if (!snippet) continue;
    const cleaned = snippet.replace(/\s+/g, " ").trim();
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
  }
  return out;
}

function collectMatches(text, pattern, kind, groups, skip = () => false) {
  for (const match of text.matchAll(pattern)) {
    const token = match[0];
    if (skip(token, match.index ?? 0, text)) continue;
    const canonical = token.toLowerCase();
    let group = groups.get(`${kind}:${canonical}`);
    if (!group) {
      group = { token, canonical, kind, count: 0, contexts: [] };
      groups.set(`${kind}:${canonical}`, group);
    }
    group.count += 1;
    recordContext(group, text, match.index ?? 0, token.length);
  }
}

function shouldSkipPhone(token, offset, text) {
  const digits = token.replace(/\D/g, "");
  if (digits.length < 7) return true;
  const before = text.slice(Math.max(0, offset - 12), offset).toLowerCase();
  if (/\b(page|slide|version|v|q|h)\s*$/.test(before)) return true;
  const year = Number(digits);
  if (digits.length === 4 && year >= 1900 && year <= 2099) return true;
  return false;
}

function recordContext(group, text, index, length) {
  if (group.contexts.length >= MAX_CONTEXTS) return;
  const start = Math.max(0, index - CONTEXT_RADIUS);
  const end = Math.min(text.length, index + length + CONTEXT_RADIUS);
  let snippet = text.slice(start, end).trim();
  if (start > 0) snippet = `…${snippet}`;
  if (end < text.length) snippet = `${snippet}…`;
  if (!group.contexts.includes(snippet)) group.contexts.push(snippet);
}
