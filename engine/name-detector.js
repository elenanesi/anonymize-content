import { COMMON_WORDS } from "./common-words.js";

const STOP_WORDS = new Set([
  "A", "AN", "THE", "AND", "OR", "BUT", "FOR", "NOR", "SO", "YET",
  "TO", "OF", "IN", "ON", "AT", "BY", "AS", "IS", "IT", "BE", "AM",
  "ARE", "WAS", "WERE", "BEEN", "BEING", "HAVE", "HAS", "HAD",
  "DO", "DOES", "DID", "WILL", "WOULD", "SHALL", "SHOULD", "MAY",
  "MIGHT", "MUST", "CAN", "COULD", "NOT", "NO", "YES", "IF", "THEN",
  "ELSE", "WHEN", "WHERE", "WHY", "HOW", "ALL", "ANY", "BOTH", "EACH",
  "FEW", "MORE", "MOST", "OTHER", "SOME", "SUCH", "THAN", "TOO", "VERY",
  "WITH", "FROM", "INTO", "OVER", "AFTER", "BEFORE", "BETWEEN", "UNDER",
  "AGAIN", "FURTHER", "ONCE", "HERE", "THERE", "WHO", "WHOM", "THIS",
  "THAT", "THESE", "THOSE", "WHAT", "WHICH", "WHILE", "DURING", "THROUGH",
  "ABOUT", "ABOVE", "BELOW", "UP", "DOWN", "OUT", "OFF", "OWN", "SAME",
  "NEW", "OLD", "VS", "ET", "AL", "EG", "IE", "UK", "US", "EU", "FY",
  "QOQ", "YOY", "MOM", "KPI", "ROI", "CEO", "CFO", "CTO", "COO", "VP",
  "HR", "IT", "AI", "ML", "API", "PDF", "PPT", "PPTX", "URL", "HTML",
  "CSS", "JS", "SQL", "CSV", "JSON", "XML", "HTTP", "HTTPS", "WWW",
  "PM", "AM", "EST", "PST", "GMT", "UTC", "Q1", "Q2", "Q3", "Q4",
  "H1", "H2", "H3", "FY", "YTD", "MTD", "LTM", "TTM", "EBITDA", "GAAP",
  "IFRS", "USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF", "CNY",
  "INC", "LLC", "LTD", "PLC", "CORP", "CO", "NA", "EMEA", "APAC", "LATAM"
]);

const TITLE_STOP_WORDS = new Set([
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
  "January", "February", "March", "April", "June", "July", "August",
  "September", "October", "November", "December"
]);

const ALL_CAPS_RE = /\b[A-Z]{2,}(?:[A-Z0-9]+)?\b/g;
const PROPER_NAME_RE = /\b[A-Z][a-z]+(?:'s)?\b/g;

const MAX_CONTEXTS = 3;
const CONTEXT_RADIUS = 24;

/**
 * Split long blobs (e.g. a full slide's innerText) so names after "." are still found
 * while sentence-start names after "." stay excluded.
 */
export function snippetsForNameScan(textSnippets) {
  const out = [];
  const seen = new Set();
  for (const snippet of textSnippets) {
    if (!snippet) continue;
    const parts = snippet.split(/(?<=[.!?])\s+|\n+/);
    for (const part of [snippet, ...parts]) {
      const cleaned = part.replace(/\s+/g, " ").trim();
      if (cleaned.length < 2 || seen.has(cleaned)) continue;
      seen.add(cleaned);
      out.push(cleaned);
    }
  }
  return out;
}

export function detectNames(textSnippets) {
  const groups = new Map();
  const snippets = snippetsForNameScan(textSnippets);
  for (const snippet of snippets) {
    collectCapsMatches(snippet, groups);
    collectProperNameMatches(snippet, groups);
  }

  return Array.from(groups.values())
    .map((group) => buildSuggestion(group))
    .filter((entry) => entry.confidence !== "hidden")
    .sort((a, b) => {
      const confidenceDiff = confidenceRank(b.confidence) - confidenceRank(a.confidence);
      return confidenceDiff || b.count - a.count || a.token.localeCompare(b.token);
    });
}

function buildSuggestion(group) {
  const variants = Array.from(group.variants.keys()).sort((a, b) => {
    const countDiff = group.variants.get(b) - group.variants.get(a);
    return countDiff || a.localeCompare(b);
  });
  const token = variants[0] || "";
  const count = variants.reduce((sum, variant) => sum + group.variants.get(variant), 0);
  const kind = group.kinds.has("caps") && token === token.toUpperCase() ? "caps" : "proper";
  const confidence = scoreConfidence(group, token);

  return {
    token,
    canonical: group.canonical,
    count,
    kind,
    variants,
    confidence,
    contexts: group.contexts.slice(0, MAX_CONTEXTS)
  };
}

function scoreConfidence(group, token) {
  const canonical = group.canonical;
  const inDictionary = isDictionaryWord(canonical);
  const hasProper = group.kinds.has("proper");
  const hasCaps = group.kinds.has("caps");

  if (inDictionary && hasProper && hasCaps) return "hidden";
  if (inDictionary && hasProper) return "hidden";
  if (inDictionary && hasCaps && token.length >= 4) return "hidden";

  let score = 0;
  if (group.midSentence) score += 2;
  if (group.possessive) score += 2;
  if (group.lineStart && token.length >= 4) score += 2;
  if (hasCaps && !hasProper && !inDictionary && token.length >= 3) score += 2;
  if (hasProper && !hasCaps && token.length >= 4) score += 1;
  if (hasCaps && token.length <= 3 && !inDictionary) score += 1;

  return score >= 2 ? "high" : "low";
}

function confidenceRank(confidence) {
  if (confidence === "high") return 2;
  if (confidence === "low") return 1;
  return 0;
}

function collectCapsMatches(text, groups) {
  for (const match of text.matchAll(ALL_CAPS_RE)) {
    const token = match[0];
    if (shouldSkipCaps(token)) continue;
    addVariant(groups, token, "caps", text, match.index ?? 0);
  }
}

function collectProperNameMatches(text, groups) {
  for (const match of text.matchAll(PROPER_NAME_RE)) {
    const raw = match[0];
    const token = raw.replace(/'s$/i, "");
    const index = match.index ?? 0;
    const possessive = /'s$/i.test(raw);
    const midSentence = isMidSentenceName(text, index);
    if (!midSentence && !isLineStartNameCandidate(token)) continue;
    if (shouldSkipProperName(token)) continue;
    addVariant(groups, token, "proper", text, index, {
      midSentence,
      possessive,
      lineStart: !midSentence
    });
  }
}

function addVariant(groups, token, kind, text, index, flags = {}) {
  const canonical = token.toLowerCase();
  let group = groups.get(canonical);
  if (!group) {
    group = {
      canonical,
      variants: new Map(),
      kinds: new Set(),
      contexts: [],
      midSentence: false,
      possessive: false,
      lineStart: false
    };
    groups.set(canonical, group);
  }
  group.kinds.add(kind);
  group.variants.set(token, (group.variants.get(token) || 0) + 1);
  if (flags.midSentence) group.midSentence = true;
  if (flags.possessive) group.possessive = true;
  if (flags.lineStart) group.lineStart = true;
  recordContext(group, text, index, token.length);
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

/**
 * True when the token follows lowercase prose (e.g. "met Elena") rather than
 * line-start headings or bullets.
 */
function isMidSentenceName(text, index) {
  if (index === 0) return false;
  const before = text.slice(0, index);
  if (/[.!?]\s*$/.test(before)) return false;
  return /[a-z]'?$/.test(before);
}

function isLineStartNameCandidate(token) {
  return token.length >= 4 && !isDictionaryWord(token.toLowerCase());
}

function isDictionaryWord(word) {
  const lower = word.toLowerCase();
  return COMMON_WORDS.has(lower)
    || STOP_WORDS.has(word.toUpperCase())
    || TITLE_STOP_WORDS.has(word);
}

function shouldSkipCaps(token) {
  if (STOP_WORDS.has(token)) return true;
  if (isDictionaryWord(token)) return true;
  if (/^\d+$/.test(token)) return true;
  if (token.length < 2) return true;
  if (token.length <= 3 && isDictionaryWord(token)) return true;
  return false;
}

function shouldSkipProperName(token) {
  if (token.length < 2) return true;
  if (TITLE_STOP_WORDS.has(token)) return true;
  if (isDictionaryWord(token)) return true;
  return false;
}

/**
 * Expand a user-accepted term into explicit search variants for display.
 * Redaction uses case-insensitive matching; this helps the UI show coverage.
 */
export function caseVariants(term) {
  if (!term) return [];
  const base = term.trim();
  if (!base) return [];
  const variants = new Set([base, base.toUpperCase(), base.toLowerCase()]);
  if (base.length > 1) {
    variants.add(base[0].toUpperCase() + base.slice(1).toLowerCase());
  }
  return Array.from(variants);
}
