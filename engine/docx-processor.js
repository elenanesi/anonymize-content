import { collectDocxImages, redactDocxImages } from "./docx-image-redactor.js";
import { detectSuggestions } from "./suggestion-utils.js";
import { redactNumbersInDocument } from "./number-redactor.js";
import { redactTextInDocument, WORD_TEXT_OPTS } from "./text-redactor.js";
import { parseXml, serializeXml } from "./xml-utils.js";
import { ZipHandler } from "./zip-handler.js";

const TEXT_PARTS = /^word\/(document|footnotes|endnotes|header\d+|footer\d+)\.xml$/;

export class DocxProcessor {
  constructor(jszip) {
    this.zip = new ZipHandler(jszip);
    this.file = null;
    this.analysis = null;
  }

  async load(file) {
    this.file = file;
    await this.zip.load(file);
    this.analysis = await this.analyze();
    return this.analysis;
  }

  async analyze() {
    const partPaths = this.zip.paths(TEXT_PARTS);
    const textPreview = [];
    const allText = [];
    let textNodeCount = 0;

    for (const path of partPaths) {
      const xml = await this.zip.text(path);
      if (!xml) continue;
      const doc = parseXml(xml, path);
      const text = Array.from(doc.getElementsByTagNameNS(WORD_TEXT_OPTS.ns, "t"))
        .map((node) => node.textContent?.trim())
        .filter(Boolean);
      textNodeCount += text.length;
      allText.push(...text);
      if (textPreview.length < 12) {
        textPreview.push(...text.slice(0, 4));
      }
    }

    return {
      format: "docx",
      name: this.file?.name || "document.docx",
      slideCount: 0,
      textNodeCount,
      textPreview: textPreview.slice(0, 12),
      suggestedNames: detectSuggestions(allText),
      images: await collectDocxImages(this.zip),
      chartCount: 0
    };
  }

  async preview(config) {
    const cloned = await this.clone();
    return cloned.process(config, null, true);
  }

  async process(config, onProgress, previewOnly = false) {
    const stats = {
      text: { count: 0, samples: [] },
      numbers: { count: 0, samples: [] },
      images: { count: 0 },
      charts: { count: 0, embeddedWorkbookWarnings: [] },
      slides: { count: 0 },
      warnings: []
    };

    const partPaths = this.zip.paths(TEXT_PARTS);
    let index = 0;
    for (const path of partPaths) {
      const xml = await this.zip.text(path);
      if (!xml) continue;
      const doc = parseXml(xml, path);
      mergeStats(stats.text, redactTextInDocument(doc, config.text, WORD_TEXT_OPTS));
      mergeStats(stats.numbers, redactNumbersInDocument(doc, config.numberGroups, WORD_TEXT_OPTS));
      this.zip.writeText(path, serializeXml(doc));
      index += 1;
      onProgress?.(Math.round((index / partPaths.length) * 90));
    }

    stats.images = await redactDocxImages(this.zip, config.imageIds);

    if (previewOnly) {
      return { stats };
    }

    const blob = await this.zip.generateBlob((metadata) => {
      onProgress?.(90 + Math.round(metadata.percent * 0.1));
    });
    return { stats, blob };
  }

  async clone() {
    if (!this.file) throw new Error("No DOCX loaded.");
    const processor = new DocxProcessor(this.zip.JSZip);
    await processor.load(this.file);
    return processor;
  }
}

function mergeStats(target, next) {
  target.count += next.count;
  target.samples.push(...next.samples);
  target.samples = target.samples.slice(0, 5);
}
