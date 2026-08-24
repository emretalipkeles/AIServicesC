---
name: gpt-5.4 reasoning model constraints on the OpenAI (Azure) client path
description: Non-obvious Azure behavior for reasoning-effort deployments — read before touching the OpenAI client path or any call site using ModelId.gpt54()/gpt54High().
---

Azure rejects any non-default `temperature` once `reasoning_effort` is set in the request body, on this reasoning-model deployment. The two parameters are mutually exclusive here — not just redundant. This only affects the OpenAI-routed path; Bedrock is unaffected and continues to honor `temperature` normally.

Reasoning tokens are drawn from the same completion-token budget as visible output, so a budget sized for a plain reply can be silently exhausted by reasoning overhead before any output is produced — this looks identical to "the model found nothing" unless truncation (`finish_reason === 'length'`) is checked explicitly and raised as an error rather than treated as a valid short/empty result.

**Reasoning effort vs. determinism is a real product trade-off, not just an API quirk.** Since `reasoning_effort` and `temperature` can't coexist, giving every OpenAI call `reasoning_effort` means losing the `temperature: 0` determinism those calls may have relied on — and reasoning effort is not a drop-in replacement for it: on this deployment, higher effort made compliance-style event extraction *more* conservative (fewer events, higher self-reported confidence) rather than more thorough, and medium effort introduced meaningful run-to-run variance in event counts. For extraction/matching paths where compliance-grade, repeatable output matters more than reasoning depth, prefer passing an explicit `temperature` (which opts out of `reasoning_effort` for that call) over defaulting to reasoning effort everywhere.
