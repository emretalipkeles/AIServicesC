---
name: System-prompt vs user-message prompt duplication
description: How to avoid the same rule being stated twice, in different wording, to a tool-based extraction model.
---

`AIDelayEventExtractorWithTools` (the production delay-event extractor) sends a **system message**
built by a `*ToolExtractionSystemPromptStrategy` and a **user message** that embeds the output of
the matching `*ExtractionStrategy.buildExtractionPrompt()`. Both existed independently and had grown
near-identical (but not identical) statements of the same rule — e.g. the IDR narrative-bounding and
duration-priority rules were spelled out in full in both places.

**Why:** a reasoning model handed two non-identical statements of one contract tends to comply with
neither reliably — it has no signal for which wording is authoritative.

**How to apply:** `DocumentExtractionContext` carries an optional `toolBasedExtraction: boolean` flag.
`AIDelayEventExtractorWithTools` sets it to `true` when calling `strategy.buildExtractionPrompt()`.
Inside a strategy, branch on that flag: when `true`, replace a rule's full text with a one-line
pointer back to "the system instructions above" instead of restating it; when `false`/absent (the
legacy, non-tool `AIDelayEventExtractor` path, and standalone unit tests), keep the full
self-contained text since no system prompt exists to carry it. The document content itself follows
the same pattern — the user prompt should not re-embed a duplicate/truncated copy of content the
system+user message pair already delivered once.

This is the same pattern as the pre-existing `context.skipKnowledgeBase` flag (which omits a
strategy's own knowledge-base text when the system prompt already carries it) — extend that
convention rather than inventing a new one when adding future de-duplication.
