# Shrinkora 

A fast, private, local in-browser tool that compresses images and PDFs to an exact desired target size.

Designed with a strict minimalist, black-and-white architectural aesthetic.

---

## Features

- **Exact Target Sizing**: Continuous slider and precision numerical input (KB/MB) per file for fluid target size adjustment. Perfect for job portals, government forms, email attachments, and web publishing.
- **Image & PDF Support**:
  - **Images**: JPEG, PNG, WebP, AVIF, GIF, BMP.
  - **PDFs**: Multi-page and single-page documents with intelligent per-page budget distribution and re-assembly.
- **100% In-Browser & Private**:
  - Runs completely in browser memory via HTML5 Canvas, PDF.js, and PDF-Lib.
  - Zero files uploaded to any external server. Complete data privacy.
- **Clean File-Centric Workflow**:
  - Drop files to begin immediately without clutter.
  - Set custom target size directly on each file row with its dedicated slider and unit selector.
  - One-click **"APPLY TO ALL"** to sync settings across multiple files.
- **Batch Processing & Zip Export**:
  - Process single files or multiple files in parallel.
  - One-click **"⚡ COMPRESS ALL"** and **"📦 DOWNLOAD ALL (.ZIP)"**.
- **Visual Inspection**:
  - Side-by-side before & after comparison modal to check visual quality before saving.
- **Minimalist Black & White Theme**:
  - High-contrast monochromatic UI with light and dark mode toggle (`◐`).
  - Monospace typography for sizes, metrics, and progress percentages.

---

## How to Run Locally

### Option 1: Direct Browser Launch (Simplest)
Simply double-click `index.html` in your file explorer, or run in your terminal:
```powershell
Start-Process index.html
```
The application will open immediately in your default web browser (Chrome, Edge, Firefox, Brave, Safari).

### Option 2: Local HTTP Server
If you prefer running via a local server:
```bash
# Using Python
python -m http.server 3000

# Or using Node.js
npx serve
```
Then navigate to `http://localhost:3000` in your browser.

---

## File Structure

```text
stickext/
├── index.html        # Semantic HTML layout and UI components
├── style.css         # Minimalist black & white stylesheet (Light & Dark mode)
├── app.js            # Client-side compression algorithms (Canvas, PDF.js, PDF-Lib, JSZip)
└── README.md         # Documentation
```

---

## Compression Architecture

1. **Images**:
   - Performs a binary search across JPEG/WebP quantization parameters ($q \in [0.05, 0.95]$).
   - If the lowest quality threshold is reached without meeting the target byte limit (e.g. ultra-high resolution inputs), the engine proportionally downscales dimensions using area-ratio scaling ($\sqrt{\text{target}/\text{size}}$) and optimizes again.
2. **PDF Documents**:
   - Deconstructs pages using `pdf.js`.
   - Allocates a per-page byte budget with structural overhead margin:
     $$\text{Budget}_{\text{page}} = \frac{\text{Target} \times 0.90}{N_{\text{pages}}}$$
   - Quantizes each page and re-embeds into a new PDF using `pdf-lib` at exact original physical dimensions (72 DPI point grid).
