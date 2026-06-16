import { DocxProcessor } from "./docx-processor.js";
import { detectFileFormat } from "./file-types.js";
import { GoogleWorkspaceProcessor } from "./google-workspace-processor.js";
import { PptxProcessor } from "./pptx-processor.js";

export function createFileProcessor(file, jszip) {
  const format = detectFileFormat(file);
  if (format === "docx") return new DocxProcessor(jszip);
  return new PptxProcessor(jszip);
}

export function createGoogleProcessor(tabId, format) {
  return new GoogleWorkspaceProcessor(tabId, format);
}
