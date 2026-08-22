---
name: Upload resumability pattern
description: Durable lesson for recovering in-memory upload/processing pipelines from a mid-process server restart.
---

Long-lived upload/processing pipelines that run entirely in memory (parse + AI extraction) with
no durable job queue lose all progress silently if the server restarts mid-flight - the row is
left in a "pending"/"processing" state forever with no error and no retry.

**Why this matters:** happened twice in this project in production before being addressed, with
the only recovery being manual DB inspection and a full re-upload by a human.

**How to apply going forward:**
- Persist enough state at the start of processing (not after) to retry from scratch without
  re-asking the user for input.
- Recover at process startup, not via a live in-process timer - a single-process app cannot
  otherwise distinguish "still working" from "died and got restarted"; anything found in a
  non-terminal processing state at boot is a leftover by definition.
- Any retry path added for recovery MUST go through the same concurrency/rate-limit guard as
  the original processing path. A recovery path that bypasses it (e.g. fire-and-forget retries
  with no shared limiter) can resurrect the exact overload it's meant to fix when a large batch
  gets stuck together.
- This only catches restarts. A pipeline that hangs without crashing needs a separate,
  time-based staleness check - don't assume restart-triggered recovery covers that case too.
