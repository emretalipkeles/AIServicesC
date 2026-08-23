---
name: IDR narrative extraction fidelity
description: Why inspector-diary IDRs silently produced zero delay events, and the rules that keep them from doing so again.
---

# Inspector-diary IDRs and the "no delays" escape rule

Anti-fabrication escape rules in the IDR extraction prompts must never key off a report's
*summary form fields* ("Delays and Reason: None", "Contractor Inefficiencies: N/A") or off the
absence of a "Contractor's Work Activity" activity-ID table.

**Why:** on inspector-diary style reports both conditions are true by default — the inspector
narrates the day as timestamped entries and leaves the summary fields as "None". A rule phrased
that way makes the model exit before it ever reads the narrative, so real contractor delays
(damaged work, rework, unpreparedness) come back as zero events with no error anywhere. The
correlation was exact: every report whose form field read "None" produced no events at all.

The escape rule still has to exist — a meaningful fraction of these reports genuinely contain no
contractor delay, and deleting the rule invites fabrication. Narrow it instead: enumerate what is
explicitly *not* grounds for zero events, and require a narrative walk-through before concluding.

**How to apply:** when editing any extraction prompt, keep narrative analysis ordered *before*
activity-ID/matching instructions, and state that matching rules never determine whether an event
exists. Matching governs what an event links to, nothing more.

## Provenance auditing beats prompt guessing

Prompt regressions of this kind are invisible in run stats — the run "succeeds" with fewer events.
A log-only provenance audit (does a timestamped document yield zero events? do its events cite a
timestamp in their source reference?) surfaces them without touching results. Keep such audits
strictly non-mutating: they must never drop or rewrite events.

Detecting "a timestamp" in this document family is harder than it looks. A bare four-digit time
collides with years, and a four-digit *span* collides with year ranges, quantities, station values,
and elevations ("Project No. 2023-2024", "Qty: 1200-1400 LF"). Require context: bounds below 1900
for a bare time, and a preceding time cue (diary/at/from/shift/#7) or a closing colon for a span.
Inspectors write shift windows both ways — "Diary, 0730:" and "Diary 0730-1400:" — and capitalize
freely, so the pattern must be case-insensitive or half the citations read as unsourced.

## Durations

Durations calculated from diary timestamp gaps are naturally fractional. Any rounding to whole
hours (in the DB column type or in normalization) destroys the evidence that a duration was
calculated rather than guessed, and hides whether timestamp reasoning happened at all.
