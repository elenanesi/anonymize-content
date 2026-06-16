import { elementsByTag, parseXml, serializeXml, PPT_NS } from "./xml-utils.js";
import { transformChartValue } from "./number-redactor.js";

export async function redactCharts(zip, numberGroups) {
  const chartPaths = zip.paths(/^ppt\/charts\/chart\d+\.xml$/);
  let count = 0;

  for (const path of chartPaths) {
    const xml = await zip.text(path);
    if (!xml) continue;
    const doc = parseXml(xml, path);

    for (const valueNode of elementsByTag(doc, PPT_NS.c, "v")) {
      const original = valueNode.textContent || "";
      const next = isNumeric(original) ? transformChartValue(original, numberGroups) : redactLabel(original);
      if (next !== original) {
        valueNode.textContent = next;
        count += 1;
      }
    }

    zip.writeText(path, serializeXml(doc));
  }

  return { count, embeddedWorkbookWarnings: countEmbeddedWorkbooks(zip) };
}

export function countCharts(zip) {
  return zip.paths(/^ppt\/charts\/chart\d+\.xml$/).length;
}

function isNumeric(value) {
  return Number.isFinite(Number(value));
}

function redactLabel(value) {
  if (!value || Number.isFinite(Number(value))) return value;
  return "[REDACTED]";
}

function countEmbeddedWorkbooks(zip) {
  const workbooks = zip.paths(/^ppt\/embeddings\/.*\.xlsx$/i);
  return workbooks.length
    ? [`${workbooks.length} embedded workbook(s) were detected. Chart cache XML was redacted; embedded workbook editing is queued for the next hardening pass.`]
    : [];
}
