---
name: Payroll Employee Job Detail Report parsing
description: Durable decisions for parsing the "Employee Job Detail Report by Earn Code & Pay Date" payroll PDF in the Azure claims database.
---

- A marker character can mean different things depending on its position in a fragmented,
  one-value-per-line PDF export. This document's `*` means "female employee" right after the
  Employee field but "non-hourly quantity" right before Amount. Position, not content, decides
  which meaning applies, and only the latter belongs in a persisted marker column — the former is
  a sensitive attribute and must be discarded, not folded into a raw text field either.
- The document has two structurally unrelated sections (a per-record detail body, then a separate
  rollup summary with a different, incompatible shape). Detect the section boundary once and
  exclude the incompatible section entirely rather than trying to generalize one parser over both.
- Only reconcile parsed totals at the granularity the source actually prints subtotals for; don't
  assume a finer requested granularity (e.g. per-employee-per-month) exists in the document just
  because it would be more useful — check first, and document computed-but-unvalidated rollups as
  such.
- For a one-off authoritative staging load, gate the destructive delete+insert on the load's own
  built-in accuracy check (e.g. a grand-total reconciliation) failing outright, not just on
  recording its status — otherwise a badly broken parse can silently overwrite good prior data.
- A pay-date-only report should not be silently treated as a work-date; store the estimated
  work-date assumption as explicit queryable columns, not just a code comment.
