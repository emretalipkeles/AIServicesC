---
name: Measured Mile axis & cumulative-figure rules
description: Conventions for the Measured Mile time view — how a period gets a chart date, and how cumulative totals must handle unreported periods.
---

## A period's chart date is resolved, never synthesized

Pay-estimate periods have inconsistent date coverage: most carry a start/end range, most of the rest carry only a cutoff date, and a few carry neither. Resolution order is period end → cutoff date → period start, and the resolved date always travels with the *source* it came from so an exported row can be reconciled against its plotted position.

A period that resolves to no date is reported (counted and named in the UI, exported with an empty chart date) and dropped from any to-scale timeline. It is never given a interpolated or neighbour-derived date.

**Why:** an expert reading a delay exhibit has to be able to challenge where a point sits on the timeline; a fabricated date is indefensible in a claim.

**How to apply:** any new date-positioned view of pay-estimate data uses the same resolution order and carries the date source through to export.

## Cumulative totals never treat "unreported" as zero

A *gap* period (unrecoverable source) contributes nothing to a running total and plots nothing — the curve resumes at the same height, since no work was un-installed.

A *non-gap* period whose own figure is null is different: the period is real and validated, but its amount could not be derived. It must not be added as zero. Its own point plots nothing, and every later cumulative figure is flagged as a lower bound carrying the count of omitted periods (shown as "≥" in the UI, as a completeness column in CSV). Completeness is tracked per metric — dollars can be complete while man-hours are not.

Lines through these series must not connect across nulls; bridging a gap draws progress the source documents never showed.

**Why:** a cumulative curve is the figure most likely to be quoted as a total. Silently absorbing unknowns into it converts missing evidence into an assertion.

**How to apply:** applies to any new cumulative/earned-value curve or export column derived from per-period figures.
