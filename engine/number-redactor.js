import { redactNumbersInString } from "./redact-rules.js";
import { elementsByTag, PPT_NS } from "./xml-utils.js";
import { PPT_TEXT_OPTS, WORD_TEXT_OPTS } from "./text-redactor.js";

export { PPT_TEXT_OPTS, WORD_TEXT_OPTS };

export function redactNumbersInDocument(doc, groups, opts = PPT_TEXT_OPTS) {
  const activeGroups = groups.filter((group) => group.mode !== "skip");
  if (!activeGroups.length) return { count: 0, samples: [] };

  let count = 0;
  const samples = [];

  for (const paragraph of elementsByTag(doc, opts.ns, opts.paragraph)) {
    const textNodes = elementsByTag(paragraph, opts.ns, opts.text);
    if (!textNodes.length) continue;

    const original = textNodes.map((node) => node.textContent || "").join("");
    const result = redactNumbersInString(original, activeGroups);
    if (result.text === original) continue;

    count += result.count;
    textNodes[0].textContent = result.text;
    for (let index = 1; index < textNodes.length; index += 1) {
      textNodes[index].textContent = "";
    }
    for (const sample of result.samples) {
      if (samples.length >= 5) break;
      samples.push({ before: original, after: result.text });
    }
  }

  return { count, samples };
}

export function transformChartValue(value, groups) {
  const group = groups.find((candidate) => candidate.mode !== "skip");
  if (!group) return value;
  const result = redactNumbersInString(value, [group]);
  return group.mode === "scale" ? result.text.replace(/[$€£¥,%\s]/g, "") : "0";
}
