---
name: Duration provenance validation helper
description: Where clock-time/basis normalization for delay-event durations lives and the convention for its outputs.
---

Clock-time/basis normalization for delay-event durations lives in one shared domain helper, used
by both extractors and both analysis command handlers, rather than each implementing its own
parsing.

**Why:** the values originate as free-form AI JSON output; a single source of truth keeps the
single-document and batch analysis paths from silently diverging on what counts as valid.

**How to apply:** finish-date derivation from a start/end window is only safe when the end is
known to be later than the start (never assume same-day when a window could cross midnight) —
otherwise persist the raw window strings but leave the derived finish date null.
