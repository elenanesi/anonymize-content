import { redactCharts, countCharts } from "./chart-redactor.js";
import { collectImages, redactImages } from "./image-redactor.js";
import { detectSuggestions } from "./suggestion-utils.js";
import { redactNumbersInDocument } from "./number-redactor.js";
import { removeSlides } from "./slide-remover.js";
import { redactTextInDocument } from "./text-redactor.js";
import { parseXml, serializeXml } from "./xml-utils.js";
import { ZipHandler } from "./zip-handler.js";

const TEXT_PARTS = /^(ppt\/slides\/slide\d+|ppt\/slideMasters\/slideMaster\d+|ppt\/slideLayouts\/slideLayout\d+|ppt\/notesSlides\/notesSlide\d+)\.xml$/;

export class PptxProcessor {
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
    const slidePaths = this.zip.paths(/^ppt\/slides\/slide\d+\.xml$/);
    const textPreview = [];
    const allText = [];
    let textNodeCount = 0;

    for (const path of slidePaths) {
      const xml = await this.zip.text(path);
      if (!xml) continue;
      const doc = parseXml(xml, path);
      const text = Array.from(doc.getElementsByTagNameNS("http://schemas.openxmlformats.org/drawingml/2006/main", "t"))
        .map((node) => node.textContent?.trim())
        .filter(Boolean);
      textNodeCount += text.length;
      allText.push(...text);
      if (textPreview.length < 12) {
        textPreview.push(...text.slice(0, 4));
      }
    }

    return {
      format: "pptx",
      name: this.file?.name || "deck.pptx",
      slideCount: slidePaths.length,
      textNodeCount,
      textPreview: textPreview.slice(0, 12),
      suggestedNames: detectSuggestions(allText),
      images: await collectImages(this.zip),
      chartCount: countCharts(this.zip)
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
    for (const path of partPaths) {
      const xml = await this.zip.text(path);
      if (!xml) continue;
      const doc = parseXml(xml, path);
      const textStats = redactTextInDocument(doc, config.text);
      const numberStats = redactNumbersInDocument(doc, config.numberGroups);
      mergeStats(stats.text, textStats);
      mergeStats(stats.numbers, numberStats);
      this.zip.writeText(path, serializeXml(doc));
    }

    stats.charts = await redactCharts(this.zip, config.numberGroups);
    stats.images = await redactImages(this.zip, config.imageIds);
    stats.slides = await removeSlides(this.zip, config.slideNumbers);
    stats.warnings.push(...stats.charts.embeddedWorkbookWarnings);

    if (previewOnly) {
      return { stats };
    }

    const blob = await this.zip.generateBlob((metadata) => {
      onProgress?.(Math.round(metadata.percent));
    });
    return { stats, blob };
  }

  async clone() {
    if (!this.file) throw new Error("No PPTX loaded.");
    const processor = new PptxProcessor(this.zip.JSZip);
    await processor.load(this.file);
    return processor;
  }
}

function mergeStats(target, next) {
  target.count += next.count;
  target.samples.push(...next.samples);
  target.samples = target.samples.slice(0, 5);
}
