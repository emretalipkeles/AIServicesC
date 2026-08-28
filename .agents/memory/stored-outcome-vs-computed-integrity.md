---
name: Stored pass/fail vs. computed integrity status
description: Why a persisted "clean"/pass outcome must never drive a pass badge alone once a feature adds separate corroborating evidence (hashes, byte counts, etc.) after the fact.
---

When a feature's original pass/fail verdict (e.g. a diff engine's `outcome`) is stored once and a later phase adds independent corroborating evidence (SHA-256 hashes, structural summaries, output blobs) as *additive, nullable* columns, existing rows end up with a stored "pass" but null evidence. If the UI/API trusts the stored verdict directly, those legacy rows render as a full pass even though nothing can currently confirm it — which is exactly the contradiction a "verify independently" feature exists to prevent.

**Why:** Migrations that add verification fields are deliberately additive/nullable (no backfill) since backfilling requires re-running work that may not be safe or cheap to redo automatically. That leaves a real, expected gap between "outcome says clean" and "evidence exists to prove clean" for any row created before the migration — not a hypothetical edge case.

**How to apply:** Add a pure function that recomputes an integrity/verification status from currently-stored fields on every read (list, get, verification-record endpoints) — never store or trust a cached verification status. Define it as: the original outcome stays authoritative and untouched, but a separate `integrityStatus` (e.g. `verified` / `incomplete_record` / `hash_mismatch` / `not_applicable`) gates whether the UI is allowed to show a pass badge. Log server-side when a stored "pass" outcome lacks or contradicts its evidence, so the gap is visible in server logs, not just quietly downgraded in the UI. Apply the same computed check to every endpoint that returns the record (list, single-get, and any exported/downloadable record), not just the primary detail view.
