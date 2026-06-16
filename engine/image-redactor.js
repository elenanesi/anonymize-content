import { attrNs, elementsByTag, parseRelationships, PPT_NS, relsPathFor, resolveTarget } from "./xml-utils.js";

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"]);

export async function collectImages(zip) {
  const images = [];
  const slidePaths = zip.paths(/^ppt\/slides\/slide\d+\.xml$/);

  for (const slidePath of slidePaths) {
    const relsXml = await zip.text(relsPathFor(slidePath));
    if (!relsXml) continue;
    const rels = parseRelationships(relsXml, relsPathFor(slidePath));
    for (const rel of rels) {
      if (!rel.type?.includes("/image")) continue;
      const path = resolveTarget(slidePath, rel.target);
      if (!zip.has(path) || images.some((image) => image.path === path)) continue;
      const blob = await zip.blob(path);
      images.push({
        id: path,
        path,
        slide: slideNumber(slidePath),
        type: blob?.type || mimeFromPath(path),
        url: blob && IMAGE_TYPES.has(blob.type || mimeFromPath(path)) ? URL.createObjectURL(blob) : ""
      });
    }
  }

  return images;
}

export async function redactImages(zip, imageIds) {
  let count = 0;
  for (const path of imageIds) {
    if (!zip.has(path)) continue;
    const placeholder = await createPlaceholderPng();
    zip.writeBinary(path, placeholder);
    count += 1;
  }
  return { count };
}

export function imageIdsInDocument(doc, relsXml, partPath) {
  if (!relsXml) return [];
  const rels = parseRelationships(relsXml, relsPathFor(partPath));
  return elementsByTag(doc, PPT_NS.a, "blip")
    .map((blip) => attrNs(blip, PPT_NS.r, "embed"))
    .filter(Boolean)
    .map((id) => rels.find((rel) => rel.id === id))
    .filter((rel) => rel?.type?.includes("/image"))
    .map((rel) => resolveTarget(partPath, rel.target));
}

async function createPlaceholderPng() {
  const canvas = new OffscreenCanvas(900, 520);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#17202a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#45c4b0";
  ctx.lineWidth = 12;
  ctx.strokeRect(30, 30, canvas.width - 60, canvas.height - 60);
  ctx.fillStyle = "#f6f8fb";
  ctx.font = "700 56px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Image Redacted", canvas.width / 2, canvas.height / 2);
  return canvas.convertToBlob({ type: "image/png" });
}

function slideNumber(path) {
  return Number(path.match(/slide(\d+)\.xml$/)?.[1] || 0);
}

function mimeFromPath(path) {
  if (/\.png$/i.test(path)) return "image/png";
  if (/\.jpe?g$/i.test(path)) return "image/jpeg";
  if (/\.gif$/i.test(path)) return "image/gif";
  if (/\.webp$/i.test(path)) return "image/webp";
  return "application/octet-stream";
}
