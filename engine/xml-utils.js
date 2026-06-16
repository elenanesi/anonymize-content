export const PPT_NS = {
  a: "http://schemas.openxmlformats.org/drawingml/2006/main",
  c: "http://schemas.openxmlformats.org/drawingml/2006/chart",
  p: "http://schemas.openxmlformats.org/presentationml/2006/main",
  r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  rel: "http://schemas.openxmlformats.org/package/2006/relationships",
  ct: "http://schemas.openxmlformats.org/package/2006/content-types"
};

export const WORD_NS = {
  w: "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
  r: PPT_NS.r,
  a: PPT_NS.a,
  wp: "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
  pic: "http://schemas.openxmlformats.org/drawingml/2006/picture",
  rel: PPT_NS.rel
};

const parser = new DOMParser();
const serializer = new XMLSerializer();

export function parseXml(source, path = "document.xml") {
  const doc = parser.parseFromString(source, "application/xml");
  const error = doc.querySelector("parsererror");
  if (error) {
    throw new Error(`Unable to parse ${path}`);
  }
  return doc;
}

export function serializeXml(doc) {
  return serializer.serializeToString(doc);
}

export function elementsByTag(doc, ns, localName) {
  return Array.from(doc.getElementsByTagNameNS(ns, localName));
}

export function attrNs(node, ns, localName) {
  return node.getAttributeNS(ns, localName) || node.getAttribute(`${prefixFor(ns)}:${localName}`);
}

export function setAttrNs(node, ns, localName, value) {
  node.setAttributeNS(ns, `${prefixFor(ns)}:${localName}`, value);
}

export function removeAttrNs(node, ns, localName) {
  node.removeAttributeNS(ns, localName);
  node.removeAttribute(`${prefixFor(ns)}:${localName}`);
}

export function prefixFor(ns) {
  return Object.entries(PPT_NS).find(([, value]) => value === ns)?.[0] || "";
}

export function relsPathFor(partPath) {
  const slash = partPath.lastIndexOf("/");
  const dir = slash >= 0 ? partPath.slice(0, slash + 1) : "";
  const file = slash >= 0 ? partPath.slice(slash + 1) : partPath;
  return `${dir}_rels/${file}.rels`;
}

export function resolveTarget(basePartPath, target) {
  if (target.startsWith("/")) {
    return target.slice(1);
  }
  const baseDir = basePartPath.includes("/") ? basePartPath.slice(0, basePartPath.lastIndexOf("/") + 1) : "";
  const parts = `${baseDir}${target}`.split("/");
  const resolved = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") resolved.pop();
    else resolved.push(part);
  }
  return resolved.join("/");
}

export function parseRelationships(xml, path) {
  const doc = parseXml(xml, path);
  return elementsByTag(doc, PPT_NS.rel, "Relationship").map((rel) => ({
    id: rel.getAttribute("Id"),
    target: rel.getAttribute("Target"),
    type: rel.getAttribute("Type"),
    targetMode: rel.getAttribute("TargetMode"),
    node: rel
  }));
}

export function unique(values) {
  return Array.from(new Set(values));
}
