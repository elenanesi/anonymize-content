# DeckSafe

DeckSafe is a Chrome extension that anonymizes presentations and documents **entirely on your machine**. Nothing is uploaded to a server.

Supported sources:

| Format | How it works | Download sanitized copy |
|--------|----------------|-------------------------|
| **PowerPoint (.pptx)** | Upload a file | Yes — `_SANITIZED.pptx` |
| **Word (.docx)** | Upload a file | Yes — `_SANITIZED.docx` |
| **Google Docs** | Open a doc in Chrome, scan the tab | Sanitized `.docx` copy |
| **Google Slides** | Open a deck in Chrome, scan the tab | Sanitized `.pptx` copy |

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

1. Open the document or presentation in a Chrome tab.
2. Open the DeckSafe side panel — you should see **“Google Doc detected”** or **“Google Slides detected”**.
3. Click **Scan this tab**. DeckSafe exports the file as `.docx`/`.pptx` using your signed-in Google session, then processes it locally like an uploaded file.
4. Configure rules, preview, and download the `_SANITIZED` copy. The original Google file is never modified.

> Google's editors render to canvas/SVG, so reading or editing their DOM is not reliable; export-and-redact is. Google Sheets is not supported yet (download as `.xlsx` is not handled either).

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
├── engine/
│   ├── pptx-processor.js     # PowerPoint OOXML pipeline
│   ├── docx-processor.js     # Word OOXML pipeline
│   ├── redact-rules.js       # Shared text/number redaction logic
│   └── ...
└── sidepanel/                # Side panel UI
```

## Permissions

- **sidePanel** — DeckSafe UI
- **storage** — saved rule profiles
- **tabs** — detect and scan the active Google Docs/Slides tab
- **host_permissions: docs.google.com** — download an export of the Google Doc/Slides deck you click Scan on

## Limitations

- Google Sheets is not supported. Export fidelity for Docs/Slides follows Google's own `.docx`/`.pptx` export.
- Embedded Excel charts in PowerPoint may produce warnings; embedded workbooks are not fully rewritten.
- Very large files may be slow — processing is single-threaded in the browser.

## Version

0.2.0 — adds Word (.docx), Google Docs, and Google Slides support.
