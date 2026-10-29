import { createFileProcessor } from "../engine/document-factory.js";
import { detectGoogleFormat, googleExportInfo, fileAcceptAttribute, getFormatMeta, sanitizedFileName } from "../engine/file-types.js";
import { caseVariants } from "../engine/name-detector.js";
import { isHighConfidenceSuggestion } from "../engine/suggestion-utils.js";
import { parseSlideRanges } from "../engine/slide-remover.js";
import { validateSlideRanges } from "../engine/slide-range-validator.js";
import { importProfiles, loadProfiles, saveProfile } from "../engine/profiles.js";

const LIKELY_VISIBLE_LIMIT = 5;

const state = {
  processor: null,
  analysis: null,
  file: null,
  source: null,
  googleTabId: null,
  lastBlobUrl: null,
  addedNames: new Set(),
  dismissedNames: new Set(),
  showLowConfidenceSuggestions: false,
  showAllLikelySuggestions: false,
  pendingConfig: null
};

const dom = {
  steps: Array.from(document.querySelectorAll(".step")),
  panels: Array.from(document.querySelectorAll(".panel")),
  resetButton: document.querySelector("#resetButton"),
  fileInput: document.querySelector("#fileInput"),
  dropZone: document.querySelector("#dropZone"),
  analysisCard: document.querySelector("#analysisCard"),
  deckContextBar: document.querySelector("#deckContextBar"),
  deckContextName: document.querySelector("#deckContextName"),
  deckContextMeta: document.querySelector("#deckContextMeta"),
  changeFileButton: document.querySelector("#changeFileButton"),
  changeFileInput: document.querySelector("#changeFileInput"),
  textRules: document.querySelector("#textRules"),
  textRulesHint: document.querySelector("#textRulesHint"),
  replacementText: document.querySelector("#replacementText"),
  slideRanges: document.querySelector("#slideRanges"),
  slideRangesError: document.querySelector("#slideRangesError"),
  slideRangesHint: document.querySelector("#slideRangesHint"),
  nameSuggestions: document.querySelector("#nameSuggestions"),
  nameSuggestionsList: document.querySelector("#nameSuggestionsList"),
  addAllNamesButton: document.querySelector("#addAllNamesButton"),
  deselectAllNamesButton: document.querySelector("#deselectAllNamesButton"),
  saveProfileEndButton: document.querySelector("#saveProfileEndButton"),
  toggleLowConfidenceButton: document.querySelector("#toggleLowConfidenceButton"),
  toggleMoreLikelyButton: document.querySelector("#toggleMoreLikelyButton"),
  redactPii: document.querySelector("#redactPii"),
  numberGroups: document.querySelector("#numberGroups"),
  addNumberGroupButton: document.querySelector("#addNumberGroupButton"),
  redactAllImages: document.querySelector("#redactAllImages"),
  imageGrid: document.querySelector("#imageGrid"),
  toPreviewButton: document.querySelector("#toPreviewButton"),
  backToRulesButton: document.querySelector("#backToRulesButton"),
  toDownloadButton: document.querySelector("#toDownloadButton"),
  previewSummary: document.querySelector("#previewSummary"),
  processingView: document.querySelector("#processingView"),
  successView: document.querySelector("#successView"),
  successMessage: document.querySelector("#successMessage"),
  progressBar: document.querySelector("#progressBar"),
  progressText: document.querySelector("#progressText"),
  downloadLink: document.querySelector("#downloadLink"),
  warningsDetails: document.querySelector("#warningsDetails"),
  warnings: document.querySelector("#warnings"),
  inlineError: document.querySelector("#inlineError"),
  sameRulesButton: document.querySelector("#sameRulesButton"),
  anotherDeckButton: document.querySelector("#anotherDeckButton"),
  profileSelect: document.querySelector("#profileSelect"),
  loadProfileButton: document.querySelector("#loadProfileButton"),
  saveProfileButton: document.querySelector("#saveProfileButton"),
  exportProfileButton: document.querySelector("#exportProfileButton"),
  importProfileButton: document.querySelector("#importProfileButton"),
  profileImportInput: document.querySelector("#profileImportInput"),
  googleWorkspaceCard: document.querySelector("#googleWorkspaceCard"),
  googleWorkspaceTitle: document.querySelector("#googleWorkspaceTitle"),
  googleWorkspaceHint: document.querySelector("#googleWorkspaceHint"),
  scanGoogleButton: document.querySelector("#scanGoogleButton"),
  uploadDivider: document.querySelector("#uploadDivider"),
  slidesRuleSection: document.querySelector("#slidesRuleSection"),
  imagesRuleSection: document.querySelector("#imagesRuleSection"),
  downloadStep: document.querySelector('[data-step="download"]')
};

boot();

function boot() {
  addNumberGroup({ label: "", mode: "skip", factor: 0.8 });
  if (dom.fileInput) dom.fileInput.accept = fileAcceptAttribute();
  if (dom.changeFileInput) dom.changeFileInput.accept = fileAcceptAttribute();
  wireEvents();
  refreshProfiles();
  updateSlideRangeHint();
  updateTextRulesHint();
  refreshGoogleWorkspaceCard();
  renderDeckContext();
  chrome.tabs?.onActivated.addListener(refreshGoogleWorkspaceCard);
  chrome.tabs?.onUpdated.addListener((_id, change) => {
    if (change.url || change.title) refreshGoogleWorkspaceCard();
  });
}

function wireEvents() {
  dom.fileInput.addEventListener("change", () => {
    const file = dom.fileInput.files?.[0];
    if (file) loadFile(file);
  });

  dom.changeFileInput.addEventListener("change", () => {
    const file = dom.changeFileInput.files?.[0];
    if (file) loadFile(file);
    dom.changeFileInput.value = "";
  });

  dom.changeFileButton.addEventListener("click", requestChangeFile);

  dom.dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dom.dropZone.classList.add("is-dragging");
  });

  dom.dropZone.addEventListener("dragleave", () => {
    dom.dropZone.classList.remove("is-dragging");
  });

  dom.dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    dom.dropZone.classList.remove("is-dragging");
    const file = event.dataTransfer.files?.[0];
    if (file) loadFile(file);
  });

  dom.steps.forEach((step) => {
    step.addEventListener("click", () => {
      if (!step.disabled) showStep(step.dataset.step);
    });
  });

  dom.addNumberGroupButton.addEventListener("click", () => {
    addNumberGroup({ label: "", mode: "redact", factor: 0.8 });
  });

  dom.slideRanges.addEventListener("input", validateSlideRangesField);
  dom.textRules.addEventListener("input", syncAddedNamesFromRules);

  dom.toPreviewButton.addEventListener("click", buildPreview);
  dom.backToRulesButton.addEventListener("click", () => showStep("rules"));
  dom.toDownloadButton.addEventListener("click", processDeck);
  dom.resetButton.addEventListener("click", () => confirmReset("Start over? Current deck and rules will be cleared."));
  dom.sameRulesButton.addEventListener("click", resetForNewFile);
  dom.anotherDeckButton.addEventListener("click", () => confirmReset("Sanitize another deck? All rules will be cleared."));
  dom.saveProfileButton.addEventListener("click", saveCurrentProfile);
  dom.loadProfileButton.addEventListener("click", loadSelectedProfile);
  dom.exportProfileButton.addEventListener("click", exportSelectedProfile);
  dom.importProfileButton.addEventListener("click", () => dom.profileImportInput.click());
  dom.profileImportInput.addEventListener("change", importProfileFile);
  dom.addAllNamesButton?.addEventListener("click", addAllHighConfidenceNames);
  dom.deselectAllNamesButton?.addEventListener("click", deselectAllSuggestedNames);
  dom.saveProfileEndButton?.addEventListener("click", saveCurrentProfile);
  dom.toggleLowConfidenceButton?.addEventListener("click", toggleLowConfidenceSuggestions);
  dom.toggleMoreLikelyButton?.addEventListener("click", toggleMoreLikelySuggestions);
  dom.scanGoogleButton?.addEventListener("click", loadGoogleWorkspace);
}

async function loadFile(file) {
  try {
    ensureJsZip();
    setBusy("Reading document...");
    state.file = file;
    state.source = "file";
    state.googleTabId = null;
    state.processor = createFileProcessor(file, window.JSZip);
    state.analysis = await state.processor.load(file);
    await finishDocumentLoad();
  } catch (error) {
    showStepError(error, "upload");
  } finally {
    setBusy("");
  }
}

// Google editors render to canvas/SVG, so their DOM can't be read or edited reliably.
// Instead, export the doc with the user's own Google session, redact it locally,
// and download the sanitized copy. Nothing leaves the browser except the export request to Google.
async function loadGoogleWorkspace() {
  try {
    const tab = await getActiveGoogleTab();
    if (!tab) {
      throw new Error("Open a Google Doc or Google Slides deck in this tab, then try again.");
    }
    if (tab.format === "google-sheets") {
      throw new Error("Google Sheets isn't supported yet. Download it as .xlsx, or use Docs/Slides.");
    }
    setBusy("Exporting Google document...");
    const response = await fetch(tab.export.url, { credentials: "include" });
    const type = response.headers.get("content-type") || "";
    if (!response.ok || type.includes("text/html")) {
      throw new Error("Google refused the export. Make sure you're signed in and the file allows downloading.");
    }
    const name = (tab.title.replace(/\s+-\s+Google\s+(Docs|Slides).*$/i, "").trim() || "Google document")
      .replace(/[\\/:*?"<>|]/g, "_");
    const file = new File([await response.blob()], `${name}${tab.export.extension}`);
    await loadFile(file);
  } catch (error) {
    showStepError(error, "upload");
  } finally {
    setBusy("");
  }
}

async function finishDocumentLoad() {
  state.addedNames = new Set(readTermsFromRules());
  state.dismissedNames = new Set();
  state.showLowConfidenceSuggestions = false;
  state.showAllLikelySuggestions = false;
  renderDeckContext();
  renderAnalysis();
  renderNameSuggestions();
  renderImages();
  updateFormatUi();
  if (state.pendingConfig) {
    applyConfig(state.pendingConfig);
    state.pendingConfig = null;
  }
  validateSlideRangesField();
  enableSteps(["upload", "rules"]);
  hideInlineError();
  showProcessingView();
  showStep("rules");
}

async function getActiveGoogleTab() {
  if (!chrome.tabs?.query) return null;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const format = detectGoogleFormat(tab?.url || "");
  if (!format || !tab?.id) return null;
  return { id: tab.id, format, title: tab.title || "", export: googleExportInfo(tab.url) };
}

async function refreshGoogleWorkspaceCard() {
  const tab = await getActiveGoogleTab();
  if (!tab || state.analysis) {
    dom.googleWorkspaceCard.hidden = true;
    dom.uploadDivider.hidden = true;
    return;
  }
  const meta = getFormatMeta(tab.format);
  dom.googleWorkspaceCard.hidden = false;
  dom.uploadDivider.hidden = false;
  dom.googleWorkspaceTitle.textContent = `${meta.label} detected`;
  dom.googleWorkspaceHint.textContent = tab.title
    ? `“${tab.title}” — export, redact locally, then download a sanitized copy.`
    : "Export, redact locally, then download a sanitized copy.";
}

function requestChangeFile() {
  if (state.source === "google") {
    loadGoogleWorkspace();
    return;
  }
  if (hasConfiguredRules() && !window.confirm("Change file? Your current rules will stay, but preview results will reset.")) {
    return;
  }
  dom.changeFileInput.click();
}

function hasConfiguredRules() {
  if (readTermsFromRules().length) return true;
  if (dom.slideRanges.value.trim()) return true;
  if (dom.redactAllImages.checked) return true;
  if (dom.imageGrid.querySelector("input:checked")) return true;
  const groups = Array.from(dom.numberGroups.querySelectorAll(".number-group"));
  if (groups.length > 1) return true;
  const first = groups[0];
  if (first) {
    const mode = first.querySelector(".number-mode")?.value;
    const label = first.querySelector(".number-label")?.value?.trim();
    if (mode && mode !== "skip") return true;
    if (label) return true;
  }
  return false;
}

async function buildPreview() {
  const validation = validateAllRules();
  if (!validation.valid) {
    showValidationErrors(validation);
    return;
  }

  try {
    hideInlineError();
    setBusy("Building preview...");
    const result = await state.processor.preview(readConfig());
    renderPreview(result.stats);
    enableSteps(["upload", "rules", "preview"]);
    showStep("preview");
  } catch (error) {
    showStepError(error, "rules");
  } finally {
    setBusy("");
  }
}

async function processDeck() {
  const validation = validateAllRules();
  if (!validation.valid) {
    showValidationErrors(validation);
    showStep("rules");
    return;
  }

  const caps = getCurrentCapabilities();

  try {
    showStep("download");
    enableSteps(["upload", "rules", "preview", "download"]);
    showProcessingView();
    hideInlineError();
    dom.downloadLink.hidden = true;
    dom.progressBar.style.width = "0%";
    dom.progressText.textContent = caps.download ? "Processing document..." : "Applying redactions...";

    const processor = await state.processor.clone();
    const result = await processor.process(readConfig(), (percent) => {
      dom.progressBar.style.width = `${percent}%`;
      dom.progressText.textContent = caps.download
        ? `Packaging sanitized file... ${percent}%`
        : `Applying redactions... ${percent}%`;
    });

    if (result.blob) {
      if (state.lastBlobUrl) URL.revokeObjectURL(state.lastBlobUrl);
      state.lastBlobUrl = URL.createObjectURL(result.blob);
      dom.downloadLink.href = state.lastBlobUrl;
      dom.downloadLink.download = sanitizedFileName(state.analysis.name, state.analysis.format);
      dom.downloadLink.hidden = false;
    }

    dom.progressBar.style.width = "100%";
    showSuccessView(result.stats.warnings, Boolean(result.blob));
  } catch (error) {
    showStepError(error, "download");
  }
}

function getCurrentCapabilities() {
  return getFormatMeta(state.analysis?.format || "pptx").capabilities;
}

function updateFormatUi() {
  const caps = getCurrentCapabilities();
  dom.slidesRuleSection.hidden = !caps.slides;
  dom.imagesRuleSection.hidden = !caps.images;
  if (dom.downloadStep) {
    dom.downloadStep.textContent = caps.download ? "4 Download" : "4 Apply";
  }
  dom.googleWorkspaceCard.hidden = true;
  dom.uploadDivider.hidden = true;
}

function renderDeckContext() {
  if (!state.analysis) {
    dom.deckContextBar.hidden = false;
    dom.deckContextName.textContent = "No file uploaded yet";
    dom.deckContextMeta.hidden = true;
    dom.deckContextMeta.textContent = "";
    dom.changeFileButton.hidden = true;
    return;
  }
  const meta = getFormatMeta(state.analysis.format);
  const caps = meta.capabilities;
  dom.deckContextBar.hidden = false;
  dom.deckContextName.textContent = state.analysis.name;
  const parts = [meta.label];
  if (caps.slides && state.analysis.slideCount) {
    parts.push(`${state.analysis.slideCount} slides`);
  }
  if (caps.images) {
    parts.push(`${state.analysis.images.length} images`);
  } else if (state.analysis.textNodeCount) {
    parts.push(`${state.analysis.textNodeCount} text blocks`);
  }
  dom.deckContextMeta.textContent = parts.join(" · ");
  dom.deckContextMeta.hidden = false;
  dom.changeFileButton.hidden = false;
  dom.changeFileButton.textContent = state.source === "google" ? "Rescan tab" : "Change file";
  updateSlideRangeHint();
}

function renderAnalysis() {
  const { name, format, slideCount, textNodeCount, chartCount, images, textPreview } = state.analysis;
  const meta = getFormatMeta(format);
  const caps = meta.capabilities;
  dom.analysisCard.hidden = false;

  const rows = [
    `<div><dt>Format</dt><dd>${escapeHtml(meta.label)}</dd></div>`,
    `<div><dt>Text items</dt><dd>${textNodeCount}</dd></div>`
  ];
  if (caps.slides) rows.splice(1, 0, `<div><dt>Slides</dt><dd>${slideCount}</dd></div>`);
  if (caps.images) rows.push(`<div><dt>Images</dt><dd>${images.length}</dd></div>`);
  if (caps.charts) rows.push(`<div><dt>Charts</dt><dd>${chartCount}</dd></div>`);

  dom.analysisCard.innerHTML = `
    <strong>${escapeHtml(name)}</strong>
    <dl>${rows.join("")}</dl>
    <p>${textPreview.map(escapeHtml).join(" · ") || "No text preview found."}</p>
  `;
}

function getPendingSuggestions() {
  return (state.analysis?.suggestedNames || []).filter((entry) => {
    const canonical = entry.canonical || entry.token.toLowerCase();
    if (state.addedNames.has(canonical) || state.dismissedNames.has(canonical)) return false;
    return entry.confidence !== "hidden";
  });
}

function getLikelySuggestions() {
  return getPendingSuggestions().filter(isHighConfidenceSuggestion);
}

function getReviewSuggestions() {
  return getPendingSuggestions().filter((entry) => entry.confidence === "low");
}

function getVisibleNameSuggestions() {
  const likely = getLikelySuggestions();
  const visibleLikely = state.showAllLikelySuggestions
    ? likely
    : likely.slice(0, LIKELY_VISIBLE_LIMIT);
  const review = state.showLowConfidenceSuggestions ? getReviewSuggestions() : [];
  return [...visibleLikely, ...review];
}

function renderNameSuggestions() {
  const hasAdded = getAddedSuggestionCanonicals().length > 0;
  if (dom.deselectAllNamesButton) dom.deselectAllNamesButton.hidden = !hasAdded;
  const likely = getLikelySuggestions();
  const review = getReviewSuggestions();
  const visibleLikely = state.showAllLikelySuggestions
    ? likely
    : likely.slice(0, LIKELY_VISIBLE_LIMIT);
  const hiddenLikelyCount = likely.length - visibleLikely.length;
  const suggestions = getVisibleNameSuggestions();

  if (dom.toggleMoreLikelyButton) {
    dom.toggleMoreLikelyButton.hidden = likely.length <= LIKELY_VISIBLE_LIMIT;
    dom.toggleMoreLikelyButton.textContent = state.showAllLikelySuggestions
      ? "Show fewer likely"
      : `Show ${hiddenLikelyCount} more likely`;
  }

  if (dom.toggleLowConfidenceButton) {
    dom.toggleLowConfidenceButton.hidden = review.length === 0;
    dom.toggleLowConfidenceButton.textContent = state.showLowConfidenceSuggestions
      ? "Hide review items"
      : `Show review items (${review.length})`;
  }

  if (!suggestions.length && likely.length === 0 && review.length === 0 && !hasAdded) {
    dom.nameSuggestions.hidden = true;
    dom.nameSuggestionsList.textContent = "";
    return;
  }

  dom.nameSuggestions.hidden = false;
  dom.nameSuggestionsList.textContent = "";
  for (const entry of suggestions) {
    appendSuggestionRow(entry);
  }
}

function appendSuggestionRow(entry) {
  const row = document.createElement("div");
  row.className = `name-suggestion${entry.confidence === "low" ? " is-low-confidence" : ""}`;
  const variantNote = formatVariantNote(entry);
  const contextNote = formatContextNote(entry);
  row.innerHTML = `
    <div class="name-suggestion-meta">
      <div class="name-suggestion-title">
        <code>${escapeHtml(entry.token)}</code>
        <span class="confidence-badge confidence-${entry.confidence}">${formatConfidenceLabel(entry)}</span>
      </div>
      <span>${entry.count} occurrence${entry.count === 1 ? "" : "s"} · ${formatKindLabel(entry)}${variantNote}</span>
      ${contextNote}
    </div>
    <div class="name-suggestion-actions">
      <button type="button" class="add-name">Add</button>
      <button type="button" class="dismiss-name">Dismiss</button>
    </div>
  `;
  row.querySelector(".add-name").addEventListener("click", () => addSuggestedName(entry));
  row.querySelector(".dismiss-name").addEventListener("click", () => dismissSuggestedName(entry));
  dom.nameSuggestionsList.append(row);
}

function formatKindLabel(entry) {
  if (entry.kind === "caps") return "ALL CAPS";
  if (entry.kind === "email") return "Email";
  if (entry.kind === "url") return "URL";
  if (entry.kind === "phone") return "Phone";
  return "Name in text";
}

function formatConfidenceLabel(entry) {
  if (entry.kind === "email" || entry.kind === "url" || entry.kind === "phone") return "Likely";
  return entry.confidence === "high" ? "Likely" : "Review";
}

function formatContextNote(entry) {
  const contexts = entry.contexts || [];
  if (!contexts.length) return "";
  return `<ul class="name-suggestion-context">${contexts.slice(0, 2).map((context) => `<li>${escapeHtml(context)}</li>`).join("")}</ul>`;
}

function toggleLowConfidenceSuggestions() {
  state.showLowConfidenceSuggestions = !state.showLowConfidenceSuggestions;
  renderNameSuggestions();
}

function toggleMoreLikelySuggestions() {
  state.showAllLikelySuggestions = !state.showAllLikelySuggestions;
  renderNameSuggestions();
}

function formatVariantNote(entry) {
  const others = (entry.variants || []).filter((variant) => variant !== entry.token);
  if (!others.length) return "";
  const preview = others.slice(0, 3).map(escapeHtml).join(", ");
  const suffix = others.length > 3 ? ` +${others.length - 3} more` : "";
  return ` · also ${preview}${suffix}`;
}

function addSuggestedName(entry) {
  const token = typeof entry === "string" ? entry : entry.token;
  const canonical = typeof entry === "string" ? token.toLowerCase() : (entry.canonical || token.toLowerCase());
  const terms = readTermsFromRules();
  if (!terms.some((term) => term.toLowerCase() === canonical)) {
    terms.push(token);
    dom.textRules.value = terms.join("\n");
  }
  state.addedNames.add(canonical);
  renderNameSuggestions();
  updateTextRulesHint();
}

function addAllHighConfidenceNames() {
  for (const entry of getLikelySuggestions()) {
    addSuggestedName(entry);
  }
}

function getAddedSuggestionCanonicals() {
  return (state.analysis?.suggestedNames || [])
    .map((entry) => entry.canonical || entry.token.toLowerCase())
    .filter((canonical) => state.addedNames.has(canonical));
}

// Removes every suggestion-derived term from the rules; manually typed terms stay.
function deselectAllSuggestedNames() {
  const remove = new Set(getAddedSuggestionCanonicals());
  dom.textRules.value = readTermsFromRules()
    .filter((term) => !remove.has(term.toLowerCase()))
    .join("\n");
  syncAddedNamesFromRules();
}

function dismissSuggestedName(entry) {
  const canonical = typeof entry === "string" ? entry.toLowerCase() : (entry.canonical || entry.token.toLowerCase());
  state.dismissedNames.add(canonical);
  renderNameSuggestions();
}

function syncAddedNamesFromRules() {
  state.addedNames = new Set(readTermsFromRules().map((term) => term.toLowerCase()));
  renderNameSuggestions();
  updateTextRulesHint();
}

function updateTextRulesHint() {
  const terms = readTermsFromRules();
  if (!terms.length) {
    dom.textRulesHint.textContent = "One name per line. Matches any capitalization.";
    return;
  }
  const sample = terms[0];
  const variants = caseVariants(sample).join(", ");
  dom.textRulesHint.textContent = `${terms.length} name${terms.length === 1 ? "" : "s"} — e.g. "${sample}" also matches ${variants}.`;
}

function renderImages() {
  dom.imageGrid.textContent = "";
  const caps = getCurrentCapabilities();
  if (!caps.images) {
    dom.imageGrid.textContent = "Image redaction is not available for this format.";
    return;
  }
  if (!state.analysis.images.length) {
    dom.imageGrid.textContent = "No images detected.";
    return;
  }

  for (const image of state.analysis.images) {
    const label = document.createElement("label");
    label.className = "thumb";
    const location = image.slide ? `Slide ${image.slide}` : (image.label || "Image");
    label.innerHTML = `
      ${image.url ? `<img src="${image.url}" alt="">` : ""}
      <span><input type="checkbox" value="${escapeHtml(image.id)}"> ${escapeHtml(location)}</span>
    `;
    dom.imageGrid.append(label);
  }
}

function renderPreview(stats) {
  const caps = getCurrentCapabilities();
  const lines = buildImpactLines(stats, caps);
  const impactRows = [
    renderImpactItem("Names & text", stats.text.count, stats.text.count ? "replacements" : "none"),
    renderImpactItem("Numbers", stats.numbers.count, stats.numbers.count ? "replacements" : "none")
  ];
  if (caps.images) {
    impactRows.push(renderImpactItem("Images", stats.images.count, stats.images.count ? "redacted" : "unchanged"));
  }
  if (caps.charts) {
    impactRows.push(renderImpactItem("Charts", stats.charts.count, stats.charts.count ? "values touched" : "unchanged"));
  }
  if (caps.slides) {
    impactRows.push(renderImpactItem("Slides", stats.slides.count, stats.slides.count ? "removed" : "kept"));
  }

  dom.previewSummary.innerHTML = `
    <h2>Review changes</h2>
    <p class="preview-lead">${lines.length ? lines.join(" ") : "No changes detected with current rules."}</p>
    <dl class="impact-grid">${impactRows.join("")}</dl>
    ${renderSampleBlock("Text", stats.text.samples)}
    ${renderSampleBlock("Numbers", stats.numbers.samples)}
  `;
}

function buildImpactLines(stats, caps = getCurrentCapabilities()) {
  const parts = [];
  if (stats.text.count) parts.push(`We'll replace ${stats.text.count} name/text match${stats.text.count === 1 ? "" : "es"}.`);
  if (stats.numbers.count) parts.push(`${stats.numbers.count} number${stats.numbers.count === 1 ? "" : "s"} will change.`);
  if (caps.images && stats.images.count) {
    parts.push(`${stats.images.count} image${stats.images.count === 1 ? "" : "s"} will be redacted.`);
  }
  if (caps.slides && stats.slides.count) {
    parts.push(`${stats.slides.count} slide${stats.slides.count === 1 ? "" : "s"} will be removed.`);
  }
  if (caps.charts && stats.charts.count) {
    parts.push(`Chart data will be updated in ${stats.charts.count} place${stats.charts.count === 1 ? "" : "s"}.`);
  }
  return parts;
}

function renderImpactItem(label, count, suffix) {
  return `<div><dt>${label}</dt><dd>${count} <span class="impact-suffix">${suffix}</span></dd></div>`;
}

function renderSampleBlock(title, samples) {
  if (!samples.length) return "";
  return `
    <div class="sample-block">
      <h3>${title} — before → after</h3>
      <ul class="sample-list">
        ${samples.map((sample) => `
          <li>
            <span class="sample-before">${escapeHtml(sample.before)}</span>
            <span class="sample-arrow">→</span>
            <span class="sample-after">${escapeHtml(sample.after)}</span>
          </li>
        `).join("")}
      </ul>
    </div>
  `;
}

function renderWarnings(warnings) {
  if (!warnings.length) {
    dom.warningsDetails.hidden = true;
    dom.warnings.textContent = "";
    return;
  }
  dom.warningsDetails.hidden = false;
  dom.warnings.innerHTML = warnings.map((warning) => `<p>${escapeHtml(warning)}</p>`).join("");
}

function addNumberGroup(group) {
  const row = document.createElement("div");
  row.className = "number-group";
  row.innerHTML = `
    <label class="number-field">
      <span class="number-field-label">Nearby word</span>
      <input class="number-label" type="text" value="${escapeHtml(group.label)}" placeholder="e.g. Revenue" title="Match numbers in text that contains this word. Leave blank for all numbers.">
    </label>
    <label class="number-field">
      <span class="number-field-label">Action</span>
      <select class="number-mode" title="Scale multiplies; Redact replaces with [NUMBER]; Skip ignores this row.">
        <option value="scale">Scale</option>
        <option value="redact">Redact</option>
        <option value="skip">Skip</option>
      </select>
    </label>
    <label class="number-field number-factor-wrap">
      <span class="number-field-label">× value</span>
      <input class="number-factor" type="number" min="0" max="5" step="0.01" value="${group.factor}" title="Multiplier when Action is Scale (e.g. 0.8 = 80% of original).">
    </label>
    <button class="number-delete" type="button" aria-label="Delete rule" title="Delete rule">✕</button>
  `;
  row.querySelector(".number-delete").addEventListener("click", () => row.remove());
  const modeSelect = row.querySelector(".number-mode");
  modeSelect.value = group.mode;
  modeSelect.addEventListener("change", () => syncNumberFactorField(row));
  syncNumberFactorField(row);
  dom.numberGroups.append(row);
}

function syncNumberFactorField(row) {
  const mode = row.querySelector(".number-mode")?.value;
  const factorWrap = row.querySelector(".number-factor-wrap");
  const factorInput = row.querySelector(".number-factor");
  const isScale = mode === "scale";
  if (factorWrap) factorWrap.classList.toggle("is-disabled", !isScale);
  if (factorInput) factorInput.disabled = !isScale;
}

function readTermsFromRules() {
  return dom.textRules.value.split(/\n/).map((term) => term.trim()).filter(Boolean);
}

function readConfig() {
  const caps = getCurrentCapabilities();
  const slideValidation = caps.slides
    ? validateSlideRanges(dom.slideRanges.value, state.analysis?.slideCount || 0)
    : { slideNumbers: [], valid: true, errors: [] };
  const imageIds = caps.images && dom.redactAllImages.checked
    ? state.analysis.images.map((image) => image.id)
    : caps.images
      ? Array.from(dom.imageGrid.querySelectorAll("input:checked")).map((input) => input.value)
      : [];

  return {
    text: {
      terms: readTermsFromRules(),
      replacement: dom.replacementText.value || "[REDACTED]",
      redactPii: dom.redactPii?.checked !== false
    },
    numberGroups: Array.from(dom.numberGroups.querySelectorAll(".number-group")).map((row) => ({
      label: row.querySelector(".number-label").value.trim(),
      mode: row.querySelector(".number-mode").value,
      factor: Number(row.querySelector(".number-factor").value) || 1,
      replacement: "[NUMBER]"
    })),
    imageIds,
    slideNumbers: slideValidation.slideNumbers.length
      ? slideValidation.slideNumbers
      : caps.slides
        ? parseSlideRanges(dom.slideRanges.value, state.analysis?.slideCount || 0)
        : []
  };
}

function validateAllRules() {
  const caps = getCurrentCapabilities();
  if (!caps.slides) return { valid: true, slideErrors: [] };
  const slideValidation = validateSlideRanges(dom.slideRanges.value, state.analysis?.slideCount || 0);
  return {
    valid: slideValidation.valid,
    slideErrors: slideValidation.errors
  };
}

function validateSlideRangesField() {
  if (!state.analysis || !getCurrentCapabilities().slides) {
    dom.slideRangesError.hidden = true;
    dom.slideRangesError.textContent = "";
    dom.slideRanges.classList.remove("is-invalid");
    return;
  }
  const validation = validateSlideRanges(dom.slideRanges.value, state.analysis?.slideCount || 0);
  if (validation.errors.length) {
    dom.slideRangesError.hidden = false;
    dom.slideRangesError.textContent = validation.errors[0];
    dom.slideRanges.classList.add("is-invalid");
  } else {
    dom.slideRangesError.hidden = true;
    dom.slideRangesError.textContent = "";
    dom.slideRanges.classList.remove("is-invalid");
  }
  updateSlideRangeHint();
}

function updateSlideRangeHint() {
  const caps = getCurrentCapabilities();
  if (!caps.slides) return;
  const max = state.analysis?.slideCount;
  dom.slideRangesHint.textContent = max
    ? `This deck has ${max} slide${max === 1 ? "" : "s"}. Use commas and ranges, e.g. 2, 5-7.`
    : "Upload a deck to validate slide numbers.";
}

function showValidationErrors(validation) {
  if (validation.slideErrors?.length) {
    validateSlideRangesField();
    document.querySelector('[data-step="rules"]')?.click();
    const slidesSection = dom.slideRanges.closest(".rule-section");
    if (slidesSection) slidesSection.open = true;
    dom.slideRanges.focus();
  }
}

async function saveCurrentProfile() {
  const validation = validateAllRules();
  if (!validation.valid) {
    showValidationErrors(validation);
    return;
  }
  const name = prompt("Profile name", "DeckSafe profile");
  if (!name) return;
  await saveProfile(name, readConfig());
  await refreshProfiles(name);
}

async function refreshProfiles(selectedName = "") {
  if (!globalThis.chrome?.storage?.local) return;
  const profiles = await loadProfiles();
  dom.profileSelect.textContent = "";
  const names = Object.keys(profiles).sort();
  dom.profileSelect.append(new Option(names.length ? "Choose profile" : "No profiles", ""));
  for (const name of names) {
    dom.profileSelect.append(new Option(name, name, false, name === selectedName));
  }
}

async function loadSelectedProfile() {
  const name = dom.profileSelect.value;
  if (!name) return;
  const profiles = await loadProfiles();
  applyConfig(profiles[name]);
}

async function exportSelectedProfile() {
  const name = dom.profileSelect.value || "DeckSafe profile";
  const profiles = await loadProfiles();
  const data = dom.profileSelect.value ? { [name]: profiles[name] } : { [name]: readConfig() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name.replace(/[^a-z0-9-_]+/gi, "-")}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function importProfileFile() {
  const file = dom.profileImportInput.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    await importProfiles(normalizeImportedProfiles(parsed));
    await refreshProfiles();
  } catch (error) {
    showStepError(error, "rules");
  } finally {
    dom.profileImportInput.value = "";
  }
}

function normalizeImportedProfiles(parsed) {
  if (parsed?.text && parsed?.numberGroups) return { "Imported profile": parsed };
  if (parsed && typeof parsed === "object") return parsed;
  throw new Error("Profile JSON must contain a profile object.");
}

function applyConfig(config) {
  if (!config) return;
  dom.textRules.value = config.text?.terms?.join("\n") || "";
  dom.replacementText.value = config.text?.replacement || "[REDACTED]";
  if (dom.redactPii) dom.redactPii.checked = config.text?.redactPii !== false;
  dom.slideRanges.value = config.slideNumbers?.join(", ") || "";
  dom.redactAllImages.checked = false;
  dom.imageGrid.querySelectorAll("input[type='checkbox']").forEach((input) => {
    input.checked = config.imageIds?.includes(input.value) || false;
  });
  dom.numberGroups.textContent = "";
  for (const group of config.numberGroups || []) {
    addNumberGroup(group);
  }
  syncAddedNamesFromRules();
  validateSlideRangesField();
}

function showStep(id) {
  dom.panels.forEach((panel) => panel.classList.toggle("is-active", panel.id === id));
  dom.steps.forEach((step) => step.classList.toggle("is-active", step.dataset.step === id));
}

function enableSteps(ids) {
  dom.steps.forEach((step) => {
    step.disabled = !ids.includes(step.dataset.step);
  });
}

function showProcessingView() {
  dom.processingView.hidden = false;
  dom.successView.hidden = true;
}

function showSuccessView(warnings, hasDownload = true) {
  dom.processingView.hidden = true;
  dom.successView.hidden = false;
  const caps = getCurrentCapabilities();
  if (hasDownload && caps.download) {
    dom.successMessage.textContent = `${sanitizedFileName(state.analysis.name, state.analysis.format)} is ready.`;
    dom.downloadLink.hidden = false;
  } else {
    dom.successMessage.textContent = `Redactions applied to “${state.analysis.name}”. Use File → Download in Google to export a copy.`;
    dom.downloadLink.hidden = true;
  }
  renderWarnings(warnings);
}

function setBusy(message) {
  if (message) dom.progressText.textContent = message;
}

function showStepError(error, step) {
  const message = error.message || String(error);
  if (step === "download") {
    showProcessingView();
    dom.inlineError.hidden = false;
    dom.inlineError.textContent = message;
    showStep("download");
    enableSteps(["upload", "rules", "preview", "download"]);
    return;
  }
  if (step === "rules") {
    showStep("rules");
    enableSteps(state.analysis ? ["upload", "rules"] : ["upload"]);
    dom.inlineError.hidden = false;
    dom.inlineError.textContent = message;
    return;
  }
  showStep("upload");
  enableSteps(["upload"]);
  dom.analysisCard.hidden = false;
  dom.analysisCard.innerHTML = `<p class="inline-error">${escapeHtml(message)}</p>`;
}

function hideInlineError() {
  dom.inlineError.hidden = true;
  dom.inlineError.textContent = "";
}

function confirmReset(message) {
  if (!window.confirm(message)) return;
  hardReset();
}

function resetForNewFile() {
  const message = state.source === "google"
    ? "Keep current rules and rescan a Google tab?"
    : "Keep current rules and pick a new file?";
  if (!window.confirm(message)) return;
  state.pendingConfig = readConfig();
  if (state.lastBlobUrl) {
    URL.revokeObjectURL(state.lastBlobUrl);
    state.lastBlobUrl = null;
  }
  state.processor = null;
  state.analysis = null;
  state.file = null;
  state.source = null;
  state.googleTabId = null;
  state.addedNames = new Set();
  state.dismissedNames = new Set();
  state.showLowConfidenceSuggestions = false;
  state.showAllLikelySuggestions = false;
  dom.analysisCard.hidden = true;
  dom.fileInput.value = "";
  showProcessingView();
  hideInlineError();
  enableSteps(["upload"]);
  showStep("upload");
  refreshGoogleWorkspaceCard();
  renderDeckContext();
}

function hardReset() {
  if (state.lastBlobUrl) URL.revokeObjectURL(state.lastBlobUrl);
  location.reload();
}

function ensureJsZip() {
  if (!window.JSZip) {
    throw new Error("JSZip is missing. Place JSZip v3.10.1 at lib/jszip.min.js, then reload the extension.");
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
