---
name: Period-scoped rerun deletion safety
description: How to safely delete-and-replace a subset of records (e.g. one month/year's delay events) when a rerun can partially fail, without losing or duplicating data.
---

When a rerun replaces only a slice of existing records (a period, a document's output, etc.), naive
"delete matching rows, then save new ones" is unsafe in two independent ways discovered while
building period-scoped delay-event reruns:

1. **Delete-before-save loses data on partial failure.** If extraction/save can fail per-item
   (network/AI/API errors) while other items succeed, deleting the target scope up front — even
   scoped correctly to just the items being reprocessed — permanently destroys existing results
   whenever the replacement fails to complete, with no way to know that in advance.
2. **A broad predicate re-applied *after* saving will delete the rows you just inserted**, if the
   new rows satisfy the same predicate (same document + same target period). Reordering to
   save-then-delete only fixes problem 1 if the deletion targets *specific pre-existing ids*
   captured before any new row was saved — not the same query re-run afterward.

**Fix that satisfied review:** capture the exact ids of pre-existing rows to be replaced (via a
query filtered by document + target-period-or-null-date) *before* extraction/save begins. Only
after every replacement row has been saved successfully, delete those captured ids one by one. A
save failure anywhere in the batch means execution never reaches the deletion step, so failure
produces transient duplicates at worst, never data loss.

**Why treat undated rows specially:** rows with no determinable period can't be matched to "this
rerun's target period" by date, so if a source (e.g. a field memo/NCR) that's reprocessed on every
period rerun keeps producing the same undated row, excluding undated rows from the scoped clear
lets them accumulate a duplicate on every rerun. Undated rows belonging to the document being
reprocessed should be included in what gets cleared/replaced.

**Why filter newly extracted rows by target period before saving:** if a source document is
included in every period's rerun regardless of its own date (e.g. field_memo/NCR bypass), its
extraction can produce rows for periods other than the one being rerun. Those out-of-period rows
already exist from whichever earlier run scoped to their actual period — saving them again on an
unrelated period's rerun creates a duplicate that multiplies with every subsequent rerun. Drop
newly extracted rows whose date resolves outside the current run's target period rather than
saving them.
