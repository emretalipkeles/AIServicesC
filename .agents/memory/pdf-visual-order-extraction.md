---
name: PDF visual-order text extraction
description: Why pdf-parse's getText() scrambles layout-sensitive PDFs and how to read true visual order with pdfjs-dist instead.
---

`pdf-parse` (and `unpdf`'s wrapper around it) does not sort text items by page position before joining them into lines — it only inserts line breaks based on gaps between adjacent items in PDF content-stream order. For PDFs whose content stream doesn't match visual layout (common in form-like or multi-block documents), this produces text where headings land after the content they title and values detach from their labels.

**Why:** confirmed by reproducing the scrambling on real "Play of the Day" construction assignment sheets — section headings appeared after all their crew blocks, and cost codes detached from their tasks, using pdf-parse's default text extraction.

**How to apply:** when a document type's PDF layout matters (grids, forms, multi-block sheets), read text directly via `pdfjs-dist`'s legacy Node build (`pdfjs-dist/legacy/build/pdf.mjs`), call `page.getTextContent()` to get each item's `transform` (x/y position), and sort items yourself: by y descending (PDF y increases upward) then x ascending, grouping into lines within a small y-tolerance (~3 units) to tolerate baseline jitter within a row.

Refinement found in later end-to-end testing: a row-based (global y-then-x sort) approach that joins every same-row item with a uniform single space loses the visual distinction between ordinary word spacing and a genuine column/cell boundary (e.g. a row-label column next to a value column next to another header, all on one physical table row). Fix: use each text item's rendered width (pdf.js `TextItem.width`) to compute the horizontal gap to the next item on the line, and widen the separator (e.g. multiple spaces) whenever the gap exceeds a threshold tuned to normal word spacing. This preserves column boundaries in the extracted text without needing full column-clustering, and measurably improved downstream structured extraction (a previously-merged section was correctly split out once the boundary was visible in the text).
