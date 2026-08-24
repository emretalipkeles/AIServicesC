---
name: Evidence audit metadata pattern
description: How POD/diary supporting-context evidence gets surfaced on delay events in the Results tab.
---

Results-tab "evidence" columns (POD Evidence, Daily Report Evidence) are not a live join against
an evidence repository at read time. They are a metadata snapshot written onto
`ContractorDelayEvent.metadata` at extraction time by the analysis command handlers
(`RunAnalysisCommandHandler`, `RunSingleDocumentAnalysisCommandHandler`), then read back by
`ListDelayEventsQueryHandler`, which resolves the referenced source-document id to a filename via
the project-document repository.

**Why:** the analysis handlers already resolve day-scoped evidence to build the extraction prompt
context; persisting what was actually available at that moment is far cheaper than re-deriving it
later, and it survives even if the underlying evidence document is later deleted (the id-to-name
lookup degrades to null instead of crashing).

**How to apply:** a new supporting-context evidence type (fed into the prompt but never handed to
the activity matcher) needs its own `<type>EvidenceAvailable` / `<type>ReportCount` /
`<type>SourceDocumentId` / `<type>UsageNote` metadata fields, mirrored in the DTO and the
per-column cell renderer. Only attribute a single source document id when exactly one report
covers the date — with multiple reports, name the count in the usage note instead of guessing.
A type with no matcher step (nothing corroborates a specific match) has no `<type>Corroborated`
field and no post-match metadata patch — the creation-time value is final, unlike POD's
`podCorroborated`/`podUsageNote` which a later matcher pass can overwrite.
