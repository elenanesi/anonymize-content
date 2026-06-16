import { applyConfigToString } from "./redact-rules.js";
import { elementsByTag, PPT_NS } from "./xml-utils.js";

export const PPT_TEXT_OPTS = {
  ns: PPT_NS.a,
  paragraph: "p",
  text: "t"
};

export const WORD_TEXT_OPTS = {
  ns: "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
  paragraph: "p",
  text: "t"
};

export function redactTextInDocument(doc, rules, opts = PPT_TEXT_OPTS) {
  const terms = (rules?.terms || []).map((term) => term.trim()).filter(Boolean);
  const redactPii = rules?.redactPii !== false;
  if (!terms.length && !redactPii) return { count: 0, samples: [] };

  let count = 0;
  const samples = [];

  for (const paragraph of elementsByTag(doc, opts.ns, opts.paragraph)) {
    const textNodes = elementsByTag(paragraph, opts.ns, opts.text);
    if (!textNodes.length) continue;

    const original = textNodes.map((node) => node.textContent || "").join("");
    const result = applyConfigToString(original, {
      text: { ...rules, terms },
      numberGroups: []
    });
    if (result.text === original) continue;

    count += result.textStats.count;
    textNodes[0].textContent = result.text;
    for (let index = 1; index < textNodes.length; index += 1) {
      textNodes[index].textContent = "";
    }
    for (const sample of result.textStats.samples) {
      if (samples.length >= 5) break;
      samples.push(sample);
    }
  }

  return { count, samples };
}
