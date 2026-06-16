import { elementsByTag, parseRelationships, parseXml, PPT_NS, relsPathFor, resolveTarget, serializeXml } from "./xml-utils.js";

export async function removeSlides(zip, slideNumbers) {
  const ordered = Array.from(new Set(slideNumbers)).filter((value) => value > 0).sort((a, b) => b - a);
  if (!ordered.length) return { count: 0 };

  const presentationXml = await zip.text("ppt/presentation.xml");
  const presentationRelsXml = await zip.text("ppt/_rels/presentation.xml.rels");
  const contentTypesXml = await zip.text("[Content_Types].xml");
  if (!presentationXml || !presentationRelsXml || !contentTypesXml) {
    return { count: 0 };
  }

  const presentation = parseXml(presentationXml, "ppt/presentation.xml");
  const presentationRels = parseXml(presentationRelsXml, "ppt/_rels/presentation.xml.rels");
  const contentTypes = parseXml(contentTypesXml, "[Content_Types].xml");
  const rels = parseRelationships(presentationRelsXml, "ppt/_rels/presentation.xml.rels");
  const relatedCandidates = new Set();
  let removed = 0;

  for (const number of ordered) {
    const slidePath = `ppt/slides/slide${number}.xml`;
    if (!zip.has(slidePath)) continue;
    await collectRelatedCandidates(zip, slidePath, relatedCandidates);
    const rel = rels.find((candidate) => candidate.target === `slides/slide${number}.xml`);
    if (rel) {
      const slideId = elementsByTag(presentation, PPT_NS.p, "sldId").find(
        (node) => node.getAttributeNS(PPT_NS.r, "id") === rel.id || node.getAttribute("r:id") === rel.id
      );
      slideId?.parentNode?.removeChild(slideId);
      rel.node?.parentNode?.removeChild(rel.node);
    }
    removeContentType(contentTypes, `/ppt/slides/slide${number}.xml`);
    zip.remove(slidePath);
    zip.remove(relsPathFor(slidePath));
    removed += 1;
  }

  await removeOrphanedCandidates(zip, relatedCandidates);
  zip.writeText("ppt/presentation.xml", serializeXml(presentation));
  zip.writeText("ppt/_rels/presentation.xml.rels", serializeXml(presentationRels));
  zip.writeText("[Content_Types].xml", serializeXml(contentTypes));

  return { count: removed };
}

export function parseSlideRanges(input, maxSlides) {
  const result = new Set();
  for (const token of input.split(",").map((part) => part.trim()).filter(Boolean)) {
    const range = token.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      for (let value = Math.min(start, end); value <= Math.max(start, end); value += 1) {
        if (value <= maxSlides) result.add(value);
      }
      continue;
    }
    const single = Number(token);
    if (Number.isInteger(single) && single > 0 && single <= maxSlides) result.add(single);
  }
  return Array.from(result).sort((a, b) => a - b);
}

function removeContentType(doc, partName) {
  const override = elementsByTag(doc, PPT_NS.ct, "Override").find((node) => node.getAttribute("PartName") === partName);
  override?.parentNode?.removeChild(override);
}

async function collectRelatedCandidates(zip, slidePath, candidates) {
  const relsXml = await zip.text(relsPathFor(slidePath));
  if (!relsXml) return;
  const rels = parseRelationships(relsXml, relsPathFor(slidePath));
  for (const rel of rels) {
    if (rel.targetMode === "External") continue;
    if (!rel.type?.includes("/image") && !rel.type?.includes("/chart") && !rel.type?.includes("/notesSlide")) continue;
    const target = resolveTarget(slidePath, rel.target);
    candidates.add(target);
    candidates.add(relsPathFor(target));
  }
}

async function removeOrphanedCandidates(zip, candidates) {
  const remainingRels = zip.paths(/\.rels$/);
  const referenced = new Set();
  for (const relsPath of remainingRels) {
    const xml = await zip.text(relsPath);
    if (!xml) continue;
    const ownerPath = ownerPathForRels(relsPath);
    for (const rel of parseRelationships(xml, relsPath)) {
      if (rel.targetMode === "External") continue;
      referenced.add(resolveTarget(ownerPath, rel.target));
    }
  }
  for (const candidate of candidates) {
    if (!referenced.has(candidate)) zip.remove(candidate);
  }
}

function ownerPathForRels(path) {
  return path.replace("/_rels/", "/").replace(/\.rels$/, "");
}
