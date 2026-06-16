export const FORMATS = {
  pptx: {
    id: "pptx",
    label: "PowerPoint",
    extension: ".pptx",
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    capabilities: { slides: true, charts: true, images: true, download: true }
  },
  docx: {
    id: "docx",
    label: "Word",
    extension: ".docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    capabilities: { slides: false, charts: false, images: true, download: true }
  },
  "google-docs": {
    id: "google-docs",
    label: "Google Doc",
    extension: "",
    capabilities: { slides: false, charts: false, images: false, download: false }
  },
  "google-slides": {
    id: "google-slides",
    label: "Google Slides",
    extension: "",
    capabilities: { slides: false, charts: false, images: false, download: false }
  }
};

const ACCEPTED_FILE_EXTENSIONS = [".pptx", ".docx"];

export function detectFileFormat(file) {
  const name = (file?.name || "").toLowerCase();
  if (name.endsWith(".pptx")) return "pptx";
  if (name.endsWith(".docx")) return "docx";
  throw new Error("Unsupported file type. Use .pptx or .docx.");
}

export function fileAcceptAttribute() {
  return [
    ".pptx,.docx",
    FORMATS.pptx.mime,
    FORMATS.docx.mime
  ].join(",");
}

export function detectGoogleFormat(url = "") {
  if (url.includes("docs.google.com/document/")) return "google-docs";
  if (url.includes("docs.google.com/presentation/")) return "google-slides";
  return null;
}

export function getFormatMeta(formatId) {
  return FORMATS[formatId] || FORMATS.pptx;
}

export function sanitizedFileName(name, formatId) {
  const meta = getFormatMeta(formatId);
  if (!meta.capabilities.download) return name;
  const base = name.replace(/\.(pptx|docx)$/i, "");
  return `${base}_SANITIZED${meta.extension}`;
}

export { ACCEPTED_FILE_EXTENSIONS };
