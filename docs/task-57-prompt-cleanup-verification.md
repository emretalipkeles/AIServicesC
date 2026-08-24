# Task #57 — Prompt cleanup verification: does it shift extraction results?

## Method

Built `scripts/task57-verify-prompt-cleanup.ts`, a read-only diagnostic that:

1. Loads a project/month's completed IDR documents from the database (no writes).
2. Re-runs the *current* (post prompt-cleanup) extraction path — the exact production
   wiring from `bootstrap.ts` (`AIDelayEventExtractorWithTools` +
   `ToolExtractionSystemPromptStrategyFactory` + live Azure OpenAI deployment), including
   POD/diary context — against those documents, holding results only in memory.
3. Applies the same post-extraction pipeline `RunAnalysisCommandHandler` applies before
   persisting: cross-document deduplication (`DelayEventDeduplicationService`) and the
   period filter that drops newly-extracted events dated outside the target month/year.
4. Compares the resulting event count and `duration_basis` distribution
   (`document_stated` / `timestamp_derived` / `bounded_by_next_entry` / `estimated`)
   against the existing `contractor_delay_events` rows already in the database for that
   project/month — i.e. the pre-cleanup baseline, since this script never writes to the
   database.

No `contractor_delay_events` rows were created, updated, or deleted by this
investigation; the comparison is entirely between DB reads and in-memory extraction
output.

## Results

Project `8449935b-6f09-48dc-9277-7f3c44ad63d2`, run against the live Azure deployment on
2026-08-24.

### November 2021 (baseline: 28 events — 1 document_stated, 1 timestamp_derived, 9 bounded_by_next_entry, 17 estimated)

4 repeated runs of the identical post-cleanup code against the identical 53 documents:

| Run | Total | document_stated | timestamp_derived | bounded_by_next_entry | estimated |
|-----|-------|------------------|--------------------|------------------------|-----------|
| baseline (DB) | 28 | 1 | 1 | 9 | 17 |
| 1 | 37 | 1 | 1 | 15 | 20 |
| 2 | 27 | 1 | 1 | 10 | 15 |
| 3 | 32 | 1 | 3 | 11 | 17 |
| 4 | 33 | 1 | 1 | 13 | 18 |

### December 2021 (baseline: 24 events — 3 document_stated, 4 timestamp_derived, 11 bounded_by_next_entry, 6 estimated)

1 run against the identical 32 documents:

| Run | Total | document_stated | timestamp_derived | bounded_by_next_entry | estimated |
|-----|-------|------------------|--------------------|------------------------|-----------|
| baseline (DB) | 24 | 3 | 4 | 11 | 6 |
| 1 | 25 | 4 | 2 | 16 | 3 |

## Findings

**Total event count**: within the model's own run-to-run variance. Four identical Nov 2021
runs produced 27–37 events (baseline 28); the December run produced 25 (baseline 24). No
run exceeded a "more than a couple of events" shift on its own once you account for the
~10-event spread the model shows between runs of the exact same code and documents (the
extraction call uses `temperature: 0`, but Azure's `gpt-5.4` reasoning deployment is not
observed to be fully deterministic at that setting for tool-calling extraction). This is
consistent with normal model stochasticity, not a cleanup-induced change in *which* delays
get found.

**duration_basis classification**: a real, consistent shift. `bounded_by_next_entry`
counts were higher than baseline in **all 5 runs across both months**
(Nov: 9 baseline → 10/11/13/15; Dec: 11 baseline → 16), while `estimated` dropped
materially in December (6 → 3) and was flat-to-slightly-higher in November. This is the
"estimated/bounded_by_next_entry split shifts materially" condition the task called out to
flag: the model is now classifying more borderline-duration events as
"bounded by the next diary/IDR entry" rather than as a pure estimate, in both tested
months, more consistently than pure run-to-run noise would suggest for that one category.

**Conclusion**: the prompt cleanup does **not** appear to have changed which delays are
found (event counts are within natural variance), but it plausibly nudged the
`duration_basis` classifier toward `bounded_by_next_entry` over `estimated` for
borderline-duration events. This is a real, reportable behavior shift — not merely a
prose change — and warrants engineering follow-up to confirm it's an accepted
consequence of the cleanup (e.g. the KB section trimming or de-duplicated instructions
changed which classification the model reaches for) rather than a regression.

## Re-running this check

```
npx tsx scripts/task57-verify-prompt-cleanup.ts <projectId> <month> <year>
```

Requires `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT`, and
`AWS_DATABASE_URL` to be configured. Never writes to `contractor_delay_events` or any
other table.
