---
name: Delay-event extraction schema contract
description: Keep delay-event JSON contract (enums, conditional rules, prompt text) centralized in one module rather than restated per prompt.
---

The delay-event extraction JSON contract (categories, duration-basis enum, the
`fallbackEstimateHours`-required-when-`bounded_by_next_entry` rule, and the output-format
prose every extraction prompt embeds) is centralized in one module rather than hand-restated
per document type or per extractor.

**Why:** it had drifted before — some document types didn't even know about newer enum
values, and malformed AI output silently became "zero events found" instead of a visible
failure.

**How to apply:** when adding a new document type's extraction prompt or a new field to the
delay-event shape, extend the shared contract module (enum, runtime validator, API-level
schema, default prompt guidance) rather than writing a new prose JSON block by hand. Keep
runtime validation strict — reject unknown enum values and non-numeric strings rather than
coercing them to a plausible default; a lenient validator defeats the whole guarantee.
