---
name: IDR extraction live-verification methodology
description: How to safely re-run real IDR delay-event extraction against live Azure OpenAI without touching persisted contractor_delay_events rows, and what run-to-run variance to expect.
---

`scripts/task57-verify-prompt-cleanup.ts` re-runs the production extraction path
(`AIDelayEventExtractorWithTools` + `ToolExtractionSystemPromptStrategyFactory`, same
wiring as `bootstrap.ts`) against a project/month's IDR documents, applies the same
dedup + period-filter pipeline `RunAnalysisCommandHandler` applies before saving, and
diffs the in-memory result against the existing (untouched) `contractor_delay_events`
rows for that project/month. It never writes to the database — reuse this pattern for
future "did a prompt/extraction change shift behavior" checks instead of re-deriving the
DI wiring from scratch.

**Why:** `RunAnalysisCommandHandler`'s period-scoped rerun deletes and replaces existing
rows for the reprocessed documents/period (see `period-scoped-rerun-deletion-safety.md`),
so calling it directly against a real project to "just check" would destroy the baseline
you're trying to compare against.

**How to apply:** Repeated identical runs of the same code/documents against the live
`gpt-5.4` Azure deployment (`temperature: 0`, tool-calling extraction) are **not fully
deterministic** — observed swings of ~±20% in total event count across back-to-back runs
on the same 53-document month. Never conclude a shift from a single run; run at least
3-4 times and look at whether one `duration_basis` category is *consistently* higher/lower
across all runs (a real signal) vs. just total count bouncing around (likely noise).
