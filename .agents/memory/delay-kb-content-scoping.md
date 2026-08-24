---
name: Content-scoped knowledge-base injection
description: How DelayKnowledgePromptBuilder decides which knowledge-base sections to send per document, not just per document type.
---

`ContractorDelayTrainingGuide.getSectionsForDocumentType()` still returns a fixed list of sections
per `ProjectDocumentType` (idr/ncr/field_memo/etc). `DelayKnowledgePromptBuilder.buildPromptForDocumentType(documentType, documentContent?)`
adds a second, optional layer on top: when `documentContent` is passed, sections listed in
`CONDITIONAL_SECTION_TRIGGERS` (currently `gray_areas` and `worked_examples_gray`) are only kept if
the document text contains one of their trigger keywords (utility strike, DSC/differing site
condition, tree roots, weather, force majeure, dispute, etc. — drawn from the actual gray-area
scenario titles in the training guide). Sections with no trigger list are always kept.

**Why:** the borderline-case guidance in those two sections is real token cost (part of the ~7,440
IDR knowledge-base tokens) that only pays for itself when the document actually raises an ambiguous
topic; most IDRs don't.

**How to apply:** `documentContent` is optional and omitting it preserves the old always-include
behavior — used by the verification chat agent in `bootstrap.ts`, which has no single document in
view. All four extraction strategies (IDR/NCR/FieldMemo/Default) and their matching tool-based
system-prompt strategies now pass `context.documentContent` through. If you add a new
document-content-gated section, add it to `CONDITIONAL_SECTION_TRIGGERS` rather than writing a
separate pruning path.
