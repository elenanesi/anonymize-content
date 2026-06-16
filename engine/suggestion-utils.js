import { detectNames } from "./name-detector.js";
import { detectPii } from "./pii-detector.js";

export function detectSuggestions(textSnippets) {
  const names = detectNames(textSnippets);
  const pii = detectPii(textSnippets);
  return [...names, ...pii];
}

export function isHighConfidenceSuggestion(entry) {
  return entry?.confidence === "high";
}
