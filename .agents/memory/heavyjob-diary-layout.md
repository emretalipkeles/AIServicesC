---
name: HeavyJob diary export text layout
description: The real per-row visual-order layout of HeavyJob Foreman Diary PDF exports, relevant to any parser/segmenter over this document type.
---

HeavyJob Foreman Diary PDF exports put each "Diary" row label **alone on its own line**, with the
author name (e.g. `Hansen, Justin (HANSEN,JUS)`) on the *next* line, not inline as `Diary <author>`
on the same line. An optional weather descriptor line (e.g. `Cool - (45 - 60); Partly Sunny / Cloudy`)
can appear between the author line and the `Note    Note Index` marker. "No notes found" placeholders
for adjacent empty entries can be visually merged onto one line by position-based text assembly
(e.g. `No notes found    No notes found    No notes found`) — treat any run of that phrase as one
empty note, not as a sign multiple entries collapsed into one.

**Why:** A parser/segmenter built only from the task spec's prose description (which reads like
"Diary <author>" is one line) fails silently on the real sample — it finds date headers but zero
attributable entries, because the assumed one-line-per-block shape never matches. This was only caught
by running the actual attached sample PDF through the full pipeline end-to-end, not by unit tests
written against hand-crafted fixtures that shared the wrong assumption.

**How to apply:** When building or modifying any parser/segmenter against a real sample document,
verify against the actual extracted text (dump it and grep for the structural markers) before trusting
hand-written fixtures — fixtures inherit the same wrong assumptions as the code they're meant to test.
