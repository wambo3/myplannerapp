# PDF Rendering Fix (EmbedPDF + local PDF.js fallback) — 2026-06-16

## Status
- Primary Library view (`#pdf-view-container`) now uses **local @embedpdf/snippet v2 + PDFium WASM** (fully offline, no CDN).
- PDF.js 3.11.174 (local) kept for:
  - Floating library preview
  - Automatic fallback if EmbedPDF fails to initialize
- All assets served from `lib/` (same-origin only).
- Multipage navigation, per-page highlights (best-effort overlay), fullscreen, IndexedDB ArrayBuffer storage all preserved.
- `currentPage` respected on initial load (via `documentManager.startPage`).

## Files that must be present in `lib/`
- `pdf.min.js` + `pdf.worker.min.js` (PDF.js fallback)
- `embedpdf.js` (tiny re-export)
- `embedpdf-7TNsu-EA.js` (main ESM bundle)
- `worker-engine-BkD2-rJn.js`
- `direct-engine-BA2WfEti.js`
- `browser-BKLM0ThC-CkSOgtCM.js`
- `pdfium.wasm` (4.6 MB – the actual engine)

All of the above are now copied correctly.

## How to run / test (CRITICAL)
You **must** serve the `uploads/` folder with a real HTTP server (file:// will break ESM + WASM fetches).

```bash
cd /home/user/uploads
python3 -m http.server 8000
# then open http://localhost:8000/ (or :8000/index.html)
```

In the browser:
1. Go to **Library** (sidebar).
2. Upload a multi-page .pdf (or use an existing one).
3. The reader area should show a professional EmbedPDF viewer (dark theme) instead of the old canvas or "Rendering page..." stuck message.
4. Page navigation (◀ ▶ and the internal EmbedPDF controls) should change pages and keep `currentPage` + highlights in sync.
5. Text selection inside the viewer should still trigger the yellow/blue/pink highlight tooltip (the overlay may be partial because EmbedPDF uses its own internal text layer; the saved highlights are stored the same way as before).
6. ⛶ fullscreen button on the reader header should work on the container.
7. Floating library preview (if you open it) still uses the PDF.js canvas path (intentional).
8. Reload the page – current page + highlights should survive.

## What changed in this final pass
- Fixed `lib/embedpdf.js` + copied all sibling bundles the ESM bundle dynamically imports.
- Added `waitForEmbedPDF()` + async handling in `loadAndRenderSelectedDoc()` so the async `<script type="module">` + dynamic import in `index.html` has time to populate `window.EmbedPDF`.
- `triggerEmbedPdfRender` now passes `documentManager: { initialDocuments: [...], startPage }` so the viewer opens on the saved `currentPage`.
- `_pdfRenderFn` for EmbedPDF path now re-calls `triggerEmbedPdfRender(selectedDoc)` (instead of full `renderPage()`) to avoid destroying the whole Library UI on prev/next.
- Removed the stray extra `}` that was breaking `node --check`.
- Highlight re-application left in place (best-effort overlay on the EmbedPDF root; native selection still works inside the viewer).

## If it still shows nothing / errors
Open DevTools Console and look for:
- `[EmbedPDF] Loaded locally from lib/embedpdf.js`
- Any "Failed to fetch" on the .wasm or the engine .js files (means you are using `file://` instead of http server).
- "window.EmbedPDF is not a function" after the wait timeout → the module load failed (check the lib/ copies).
- Any error from inside EmbedPDF.init (usually wasmUrl or blobUrl issues).

Fallback should still render a usable PDF.js version if EmbedPDF completely fails.

## Original constraints still met
- 100% local (no cdnjs, no external fetches after first load).
- Preserves all previous features (highlights storage format, multipage, fullscreen, IndexedDB, nav buttons wired to _pdfRenderFn, etc.).
- Old PDF.js code paths untouched for the floating preview and as safety net.

Test with a real multi-page PDF and report any remaining console errors or visual issues.