# DeckSafe

DeckSafe is a Chrome extension that anonymizes presentations and documents **entirely on your machine**. Nothing is uploaded to a server.

Supported sources:

| Format | How it works | Download sanitized copy |
|--------|----------------|-------------------------|
| **PowerPoint (.pptx)** | Upload a file | Yes — `_SANITIZED.pptx` |
| **Word (.docx)** | Upload a file | Yes — `_SANITIZED.docx` |
| **Google Docs** | Open a doc in Chrome, scan the tab | In-place edit; export via Google File → Download |
| **Google Slides** | Open a deck in Chrome, scan the tab | In-place edit; export via Google File → Download |

## Install (developer mode)

1. Clone this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the project folder.
5. Pin DeckSafe and open the side panel from the toolbar icon.

## Quick start

### Local files (.pptx / .docx)

1. Open the DeckSafe side panel.
2. Drop a `.pptx` or `.docx` file (or click to browse).
3. Review **suggested names** detected from the document text.
4. Set rules — names, numbers, images, and (PowerPoint only) slides to remove.
5. **Preview impact**, then **sanitize** and download the cleaned file.

### Google Docs or Google Slides

1. Open the document or presentation in a Chrome tab (`docs.google.com/document/...` or `docs.google.com/presentation/...`).
2. Open the DeckSafe side panel — you should see **“Google Doc detected”** or **“Google Slides detected”**.
3. Click **Scan this tab**.
4. Configure rules the same way as for local files.
5. Preview, then **Apply** — changes are written directly into the open Google document.
6. Use **File → Download** in Google to save a copy (e.g. as PDF, `.docx`, or `.pptx`).

> **Note:** Google Workspace redaction covers **text and numbers** in the editor. Image redaction, chart editing, and slide removal are only available for uploaded PowerPoint files. Word uploads support text, numbers, and images.

## Features

- **Name detection** — finds likely client/brand tokens (ALL CAPS acronyms and capitalized words mid-sentence, e.g. “Elena” in “met Elena at”) with occurrence counts and case-insensitive redaction.
- **Number rules** — scale or redact numeric values in body text (and charts in PowerPoint).
- **Image redaction** — replace selected images with a placeholder (PowerPoint and Word).
- **Slide removal** — remove slide ranges (PowerPoint only).
- **Saved setups** — save, load, import, and export rule profiles as JSON.
- **Privacy** — all processing runs locally in the browser; Google tabs are only accessed when you click **Scan this tab**.

## Project layout

```
anonymize-content/
├── manifest.json
├── content/
│   └── google-workspace.js   # In-browser redaction for Google Docs/Slides
├── engine/
│   ├── pptx-processor.js     # PowerPoint OOXML pipeline
│   ├── docx-processor.js     # Word OOXML pipeline
│   ├── google-workspace-processor.js
│   ├── redact-rules.js       # Shared text/number redaction logic
│   └── ...
└── sidepanel/                # Side panel UI
```

## Permissions

- **sidePanel** — DeckSafe UI
- **storage** — saved rule profiles
- **tabs** — detect and scan the active Google Docs/Slides tab
- **host_permissions: docs.google.com** — read and update text in Google editors you have open

## Limitations

- Google Docs/Slides use a live editor DOM; complex layouts or canvas-rendered regions may not scan perfectly. Refresh the tab if **Scan this tab** fails.
- Embedded Excel charts in PowerPoint may produce warnings; embedded workbooks are not fully rewritten.
- Very large files may be slow — processing is single-threaded in the browser.

## Version

0.2.0 — adds Word (.docx), Google Docs, and Google Slides support.
