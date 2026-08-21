---
name: POD report date resolution
description: How "Play of the Day" report dates must be resolved, and why the printed date alone is not trustworthy.
---

POD ("Play of the Day") sheets often print their date in words with no year
("TUESDAY MARCH 25TH"), and frequently show **more than one date**: the sheets are produced by
copying the previous day's file, so a stale date survives in the page header while the correct
date appears in a row/column heading further down. The filename carries a reliable
`YYYY.MM.DD - ...` prefix.

Resolution policy (implemented inside the extraction prompt, not as deterministic code):
the model receives both the filename and the document body and decides. Body date wins when the
document shows a single date; when the document shows several conflicting dates, the one
agreeing with the filename wins; filename is the fallback when the body has no usable date.

**Why:** the user explicitly wants the AI — not a regex — to make this judgment, because only a
reader of the full page can tell a stale copied header from the real date. A deterministic
filename parser was tried and rejected. A body-first rule without the multi-date tie-break was
also tried and mis-dated a sheet whose header had not been updated.

**How to apply:** keep date resolution in the POD extraction prompt. Do not reintroduce a
filename fallback in the handler layer — the upload-time generic date heuristic is deliberately
not passed through for POD, or it would silently override the model's decision.
