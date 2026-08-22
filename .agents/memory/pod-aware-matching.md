---
name: POD-aware delay activity matching
description: How POD (Play of the Day) evidence is wired into delay-activity matching — exclusion markers, truncation ordering, and metadata traceability.
---

- POD other-project (`@L<number>`) and `OFF` markers have no dedicated schema column — they show up as free text anywhere in a section (label, crew, equipment, trucking/traffic/notes, task-line description/cost code). Exclusion detection must scan all of these text fields, not just task lines.
- The activity matcher truncates candidates to the first 100 before the model ever sees them. Any evidence-based reordering (POD corroboration, or similar future signals) must run *before* that truncation, or a correct-but-late activity gets cut off regardless of how good the ranking logic is.
- `ContractorDelayEvent.metadata` is a JSON blob with no dedicated columns per feature. `withActivityMatch` accepts an optional `metadataPatch` that is *merged* into existing metadata (not replaced) — any future traceability flag on a match should reuse that merge parameter rather than adding a new entity field, to avoid clobbering fields like `allSourceDocumentIds` set elsewhere.
- Read-side vs write-side POD repositories are intentionally separate classes (CQRS): `DrizzlePodReportRepository` (upload/extract, save/delete) vs `DrizzlePodEvidenceRepository` (analysis read, date-range + tenant scoped). Don't widen one to serve the other's use case.
