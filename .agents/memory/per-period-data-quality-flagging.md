---
name: Per-period data-quality flagging pattern
description: How to bulk-stage a long document series (e.g. dozens of periodic reports) whose extraction fidelity varies per document, without silently loading bad data or all-or-nothing rejecting.
---

When staging a long series of similarly-templated source documents (e.g. 57 monthly pay
estimates) where automated extraction can't be made 100% accurate for every document, don't
choose between "load everything silently" and "reject anything imperfect." Instead:

1. Validate each period's extracted data against a ground truth already present in that document
   (e.g. its own printed cover-sheet total), computing a delta and delta percentage.
2. Classify each period into a small status enum (e.g. `exact`, `minor_discrepancy`,
   `significant_discrepancy`, `unvalidated`, `unrecoverable`) rather than a boolean pass/fail.
3. Give every period a row in a dedicated tracking table — including periods with zero usable
   data — with the status, numeric delta, and a human-readable note explaining *why* (not just
   *that*) it diverges. This makes gaps visible in a timeline instead of silently absent.
4. Load all data that has at least some real extracted content (even with a known discrepancy);
   only exclude periods that produced effectively zero usable rows.
5. Surface the status/notes in whatever downstream feature consumes the data (e.g. a trend chart)
   so users see which figures are exact vs. approximate vs. missing, rather than presenting
   everything with equal confidence.

**Why:** for this project (SDOT pay-estimate staging), the user's explicit call was "load
everything except the completely unusable documents, but flag discrepancies for later" rather
than blocking on perfect accuracy — a per-period status+notes table was the mechanism chosen to
satisfy that without hand-waving away real data-quality gaps.

**How to apply:** reach for this pattern whenever bulk-importing a periodic/serial document set
into a database table for trend analysis, when the source documents are known to have imperfect
or drifting formats.
