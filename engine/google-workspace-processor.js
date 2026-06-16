export class GoogleWorkspaceProcessor {
  constructor(tabId, format) {
    this.tabId = tabId;
    this.format = format;
    this.file = null;
    this.analysis = null;
  }

  async load() {
    await this.ensureReachable();
    const response = await chrome.tabs.sendMessage(this.tabId, { type: "decksafe-scan" });
    if (!response?.ok) {
      throw new Error(response?.error || "Could not scan this Google document.");
    }
    this.analysis = response.analysis;
    return this.analysis;
  }

  async preview(config) {
    const response = await chrome.tabs.sendMessage(this.tabId, {
      type: "decksafe-preview",
      config
    });
    if (!response?.ok) {
      throw new Error(response?.error || "Could not preview changes.");
    }
    return { stats: response.stats };
  }

  async process(config, onProgress, previewOnly = false) {
    if (previewOnly) return this.preview(config);

    onProgress?.(25);
    const response = await chrome.tabs.sendMessage(this.tabId, {
      type: "decksafe-apply",
      config
    });
    onProgress?.(100);
    if (!response?.ok) {
      throw new Error(response?.error || "Could not apply redactions.");
    }
    return { stats: response.stats };
  }

  async clone() {
    const processor = new GoogleWorkspaceProcessor(this.tabId, this.format);
    processor.analysis = this.analysis;
    return processor;
  }

  async ensureReachable() {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const ping = await chrome.tabs.sendMessage(this.tabId, { type: "decksafe-ping" });
        if (ping?.ok) return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    }
    throw new Error("DeckSafe could not connect to this Google tab. Refresh the page and try again.");
  }
}
