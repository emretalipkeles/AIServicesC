---
name: XER fixture version semantics
description: Distinguishes contractor schedule-update sequence numbers from the P6 application version recorded in ERMHDR.
---

Treat update numbers attached to genuine schedule files as contractor sequence identifiers, not as the XER's detected application/export version. The detected version is always the exact ERMHDR value.

**Why:** Genuine files from different contractor update sequences can legitimately report the same ERMHDR application version. The user confirmed that such files still satisfy real multi-file fixture coverage; manufacturing or relabeling a header to create artificial version diversity would violate forensic fidelity.

**How to apply:** Keep every fixture byte-for-byte unchanged and assert its real ERMHDR value. If a future genuine file reports a different ERMHDR version, add it as additional coverage; do not block current null-test work or synthesize one.