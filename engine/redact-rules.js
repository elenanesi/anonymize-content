import { PII_PATTERNS } from "./pii-detector.js";

const NUMBER_RE = /(?<![\w-])([$€£¥])?\s*(?:\d{1,3}(?:[,\s]\d{3})+|\d+)(?:\.\d+)?%?(?![\w.])/g;

export function redactPiiInString(text, replacement = "[REDACTED]") {
  if (!text) return { text, count: 0, samples: [] };

  let redacted = text;
  let count = 0;
  const samples = [];

  for (const { regex } of PII_PATTERNS) {
    const pattern = new RegExp(regex.source, regex.flags);
    redacted = redacted.replace(pattern, (match) => {
      count += 1;
      if (samples.length < 5) samples.push({ before: match, after: replacement });
      return replacement;
    });
  }

  return { text: redacted, count, samples };
}

export function redactTextInString(text, rules) {
  const terms = dedupeTerms(rules?.terms);
  if (!terms.length || !text) return { text, count: 0, samples: [] };

  let redacted = text;
  let count = 0;
  const samples = [];
  for (const term of terms) {
    const regex = new RegExp(`\\b${escapeRegExp(term)}\\b`, "gi");
    redacted = redacted.replace(regex, (match) => {
      count += 1;
      if (samples.length < 5) samples.push({ before: match, after: rules.replacement || "[REDACTED]" });
      return rules.replacement || "[REDACTED]";
    });
  }
  return { text: redacted, count, samples };
}

export function redactNumbersInString(text, groups) {
  const activeGroups = (groups || []).filter((group) => group.mode !== "skip");
  if (!activeGroups.length || !text) return { text, count: 0, samples: [] };

  let count = 0;
  const samples = [];
  const redacted = text.replace(NUMBER_RE, (match, _currency, offset, fullText) => {
    if (shouldSkipNumber(match, offset, fullText)) return match;
    const group = activeGroups.find((candidate) => groupMatches(candidate, fullText)) || activeGroups[0];
    count += 1;
    const replacement = group.mode === "scale" ? scaleNumber(match, group.factor) : (group.replacement || "[NUMBER]");
    if (samples.length < 5) samples.push({ before: match, after: replacement });
    return replacement;
  });

  return { text: redacted, count, samples };
}

export function previewStringRedaction(text, config) {
  return applyConfigToString(text, config);
}

export function applyConfigToString(text, config) {
  const piiResult = config.text?.redactPii === false
    ? { text, count: 0, samples: [] }
    : redactPiiInString(text, config.text?.replacement || "[REDACTED]");
  const textResult = redactTextInString(piiResult.text, config.text);
  const numberResult = redactNumbersInString(textResult.text, config.numberGroups);
  const textStats = {
    count: piiResult.count + textResult.count,
    samples: [...piiResult.samples, ...textResult.samples].slice(0, 5)
  };
  return {
    text: numberResult.text,
    textStats,
    numberStats: { count: numberResult.count, samples: numberResult.samples }
  };
}

function dedupeTerms(terms) {
  const seen = new Set();
  const expanded = [];
  for (const term of (terms || []).map((value) => value.trim()).filter(Boolean)) {
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    expanded.push(term);
  }
  return expanded;
}

function groupMatches(group, text) {
  return !group.label || text.toLowerCase().includes(group.label.toLowerCase());
}

function shouldSkipNumber(value, offset, fullText) {
  const trimmed = value.trim();
  const normalized = Number(trimmed.replace(/[$€£¥,%\s,]/g, ""));
  if (!Number.isFinite(normalized)) return true;
  if (Number.isInteger(normalized) && normalized >= 2020 && normalized <= 2030) return true;
  if (/^\d+(st|nd|rd|th)$/i.test(trimmed)) return true;
  const before = fullText.slice(Math.max(0, offset - 8), offset).toLowerCase();
  return /\b(page|slide)\s*$/.test(before);
}

function scaleNumber(value, factor) {
  const numeric = Number(value.replace(/[$€£¥,%\s,]/g, ""));
  if (!Number.isFinite(numeric)) return value;
  const scaled = numeric * factor;
  const decimals = decimalPlaces(value);
  const formatted = scaled.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
  const prefix = value.match(/^([$€£¥])\s*/)?.[0] || "";
  const suffix = value.trim().endsWith("%") ? "%" : "";
  return `${prefix}${formatted}${suffix}`;
}

function decimalPlaces(value) {
  const match = value.match(/\.(\d+)/);
  return match ? match[1].length : 0;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
