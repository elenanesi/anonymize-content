const ENGINE = {
  detectSuggestions: null,
  previewStringRedaction: null
};

async function loadEngine() {
  if (ENGINE.detectSuggestions) return;
  const base = chrome.runtime.getURL("engine/");
  const suggestionUtils = await import(`${base}suggestion-utils.js`);
  const redactRules = await import(`${base}redact-rules.js`);
  ENGINE.detectSuggestions = suggestionUtils.detectSuggestions;
  ENGINE.previewStringRedaction = redactRules.previewStringRedaction;
}

function detectDocType() {
  if (location.pathname.includes("/presentation/")) return "google-slides";
  if (location.pathname.includes("/document/")) return "google-docs";
  return null;
}

function getEditorRoot() {
  const docType = detectDocType();
  if (docType === "google-docs") {
    return document.querySelector(".kix-appview-editor")
      || document.querySelector("#docs-editor-container")
      || document.querySelector("[role='textbox']");
  }
  return document.querySelector("#pages")
    || document.querySelector(".punch-viewer-content")
    || document.querySelector(".punch-viewer-page")
    || document.body;
}

function getDocumentTitle() {
  const title = document.title.replace(/\s+-\s+Google\s+(Docs|Slides).*$/i, "").trim();
  return title || (detectDocType() === "google-slides" ? "Google Slides deck" : "Google Doc");
}

function findBlockContainer(textNode) {
  let element = textNode.parentElement;
  while (element && element !== document.body) {
    if (element.matches?.(
      ".kix-lineview, .kix-paragraphrenderer, .kix-page, [data-page-id], "
      + ".punch-viewer-page, .punch-viewer-slide-content, g-text, text"
    )) {
      return element;
    }
    element = element.parentElement;
  }
  return textNode.parentElement;
}

function collectTextGroups(root) {
  const groups = new Map();
  if (!root) return groups;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const value = node.textContent || "";
      if (!value.trim()) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (["SCRIPT", "STYLE", "NOSCRIPT"].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
      if (parent.closest("[aria-hidden='true']")) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  let node = walker.nextNode();
  while (node) {
    const block = findBlockContainer(node);
    if (!groups.has(block)) groups.set(block, []);
    groups.get(block).push(node);
    node = walker.nextNode();
  }

  return groups;
}

function collectAllText(root) {
  const snippets = [];
  const seen = new Set();

  function add(text) {
    const cleaned = (text || "").replace(/\s+/g, " ").trim();
    if (cleaned.length < 2 || seen.has(cleaned)) return;
    seen.add(cleaned);
    snippets.push(cleaned);
  }

  if (detectDocType() === "google-slides") {
    const slideSelectors = [
      ".punch-viewer-page",
      ".punch-viewer-slide-content",
      "[data-page-id]",
      ".punch-viewer-svg-page-shape"
    ];
    for (const selector of slideSelectors) {
      for (const page of document.querySelectorAll(selector)) {
        if (page.innerText) add(page.innerText);
      }
    }
    for (const node of document.querySelectorAll("svg text, svg tspan")) {
      add(node.textContent);
    }
    for (const node of document.querySelectorAll("[aria-label]")) {
      const label = node.getAttribute("aria-label");
      if (label && label.length > 2 && !/^(slide|page|image|shape)\b/i.test(label)) {
        add(label);
      }
    }
  }

  for (const nodes of collectTextGroups(root).values()) {
    add(nodes.map((node) => node.textContent || "").join(""));
  }

  if (root?.innerText && detectDocType() === "google-slides") {
    add(root.innerText);
  }

  return snippets;
}

function countSlides() {
  if (detectDocType() !== "google-slides") return 0;
  return document.querySelectorAll(".punch-viewer-page, [data-page-id]").length
    || document.querySelectorAll("#pages > *").length
    || 0;
}

async function scanDocument() {
  await loadEngine();
  const root = getEditorRoot();
  if (!root) throw new Error("Could not find the Google editor on this page.");
  const snippets = collectAllText(root);
  const docType = detectDocType();
  return {
    format: docType,
    name: getDocumentTitle(),
    slideCount: countSlides(),
    textNodeCount: snippets.length,
    textPreview: snippets.slice(0, 12),
    suggestedNames: ENGINE.detectSuggestions(snippets),
    images: [],
    chartCount: 0
  };
}

function mergeSamples(target, next) {
  for (const sample of next) {
    if (target.length >= 5) break;
    target.push(sample);
  }
}

async function runRedaction(config, dryRun) {
  await loadEngine();
  const root = getEditorRoot();
  if (!root) throw new Error("Could not find the Google editor on this page.");

  const stats = {
    text: { count: 0, samples: [] },
    numbers: { count: 0, samples: [] },
    images: { count: 0 },
    charts: { count: 0, embeddedWorkbookWarnings: [] },
    slides: { count: 0 },
    warnings: []
  };

  for (const nodes of collectTextGroups(root).values()) {
    const original = nodes.map((node) => node.textContent || "").join("");
    if (!original.trim()) continue;

    const preview = ENGINE.previewStringRedaction(original, config);
    const changed = preview.text !== original;
    if (!changed) continue;

    stats.text.count += preview.textStats.count;
    stats.numbers.count += preview.numberStats.count;
    mergeSamples(stats.text.samples, preview.textStats.samples.map(() => ({
      before: original,
      after: preview.text
    })));
    mergeSamples(stats.numbers.samples, preview.numberStats.samples.map(() => ({
      before: original,
      after: preview.text
    })));

    if (!dryRun) {
      nodes[0].textContent = preview.text;
      for (let index = 1; index < nodes.length; index += 1) {
        nodes[index].textContent = "";
      }
    }
  }

  if (!dryRun) {
    stats.warnings.push("Changes were applied directly in Google. Use File → Download to export a copy.");
  }

  return { stats };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      if (message.type === "decksafe-ping") {
        sendResponse({ ok: true, docType: detectDocType() });
        return;
      }
      if (message.type === "decksafe-scan") {
        sendResponse({ ok: true, analysis: await scanDocument() });
        return;
      }
      if (message.type === "decksafe-preview") {
        sendResponse({ ok: true, ...(await runRedaction(message.config, true)) });
        return;
      }
      if (message.type === "decksafe-apply") {
        sendResponse({ ok: true, ...(await runRedaction(message.config, false)) });
        return;
      }
      sendResponse({ ok: false, error: "Unknown DeckSafe message." });
    } catch (error) {
      sendResponse({ ok: false, error: error.message || String(error) });
    }
  })();
  return true;
});
