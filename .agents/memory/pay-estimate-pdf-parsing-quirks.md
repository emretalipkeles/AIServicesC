---
name: SDOT pay-estimate PDF parsing quirks
description: Non-obvious traps when bulk-parsing a multi-year series of SDOT "Progress Estimate" (pay estimate) PDFs with pdftotext -layout.
---

Applies to construction pay-estimate / progress-estimate documents exported from the same
template family over a multi-year contract (Adobe-Sign-encrypted PDFs, originally Excel exports,
line-based parsing via `pdftotext -layout`).

## Change Orders double-count trap
The cover-sheet "Contract Bid Item Work" total is Base Bid + Additive Bid only. A separate
"Change Orders" schedule further down the same document reuses the original items' numbers/codes
for quantity revisions. Summing every item row in the document (instead of stopping at the
`Change Orders` section header) silently double-counts those items against the cover total.

**Why:** discovered by validating summed item totals against each document's own printed cover
total — several documents were off by exactly the Change Orders subtotal.

**How to apply:** when parsing this template family, stop item collection at the first line
matching `^Change Orders`. When a document's final-estimate variant drops the cover-sheet summary
entirely, fall back to the item table's own "SUBTOTAL: Base Bid + Additive Bid" line.

## Wrapped-description line scrambling
`pdftotext -layout` can split a single data row's item+code onto its own short line (with a stray
unrelated token) while the description+numbers land on the next unprefixed line — fixable with a
narrow "stitch the next line" heuristic gated on the current line failing full parsing. A harder,
unfixed variant: two *consecutive* items' wrapped descriptions interleave across 3 output lines,
shuffling words between them. This second variant caused ~1-3.5%+ discrepancies in a meaningful
fraction of documents in this series and was not resolved — only detected and flagged per-period.

**Why:** column layout is fixed-width but multi-line item descriptions don't reliably preserve
row boundaries when extracted as plain text.

**How to apply:** always validate summed item totals against a document's own printed total before
trusting bulk output; don't assume 100% row recovery from `pdftotext -layout` on this kind of form.

## Template drift across a long document series
Early documents in a multi-year series may use a materially different table layout (fewer
columns, missing dollar figures on some rows) than the stabilized later template — not a bug to
patch, a distinct format needing its own parsing logic. Some individual documents may also be
fully rasterized/flattened with no text layer at all (worth checking `pdftotext`/`pdfjs-dist`
character count before assuming a parsing bug).

**Why:** found 4 early documents (out of 57) using an incompatible layout, and 1 fully
image-only document, in the same nominal "Progress Estimate Detail" series.

**How to apply:** when a document in a long series returns zero/near-zero parsed rows, check
whether it's a different template era before debugging the shared parser.

## Recovering an older quantity-only template via a catalog built from the rest of the series
The 4 early-era documents above turned out to use "Template C-20L": a wide, per-Field-Change-
-Request quantity matrix (Bid Item / Description / GRAND TOTAL / one column per FCR / PE #NN
Total) with no bid code, unit price, or dollar columns at all — only cumulative-to-date and
this-period *quantities*. `pdftotext -layout` mangles this because the FCR column count (and
therefore the right-hand column's x-position) varies page to page; pdfjs-dist coordinate
extraction with per-page anchor detection (locate that page's own "GRAND"/"TOTAL" and "PE #NN"/
"Total" header token x-positions, plus every "FCR #" header token as extra disambiguating anchors)
and nearest-anchor classification of each numeric token is required, same pattern as
`pdf-visual-order-extraction.md`. Since bid code/unit price/contract quantity are fixed contract
terms that don't vary by period, they can be recovered by building an itemNo -> catalog map from
this same project's *other*, standard-format, already-parsed periods (excluding any period known
to have its own parsing quirks) rather than needing to appear in the old template at all.

**Why:** this let 4 previously-"unrecoverable" periods reach the same "validate summed items
against printed cover total" pipeline as the rest of the series, with no schema or downstream
changes — they came out at 0.01%-2.6% discrepancy, within the series' existing minor-discrepancy
norm.

**How to apply:** when a long document series has one item-table era with no dollar/price columns,
don't treat it as unrecoverable — check whether the missing fields are fixed contract terms
obtainable from the *rest of the series* instead of the document itself.
