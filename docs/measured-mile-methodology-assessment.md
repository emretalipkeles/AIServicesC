# Measured Mile Methodology Assessment

**Purpose.** This document cross-references the app's Measured Mile feature
(`server/src/domain/measured-mile/MeasuredMileCalculator.ts` and the
`measured-mile-tab` UI) against accepted construction-claims lost-productivity
methodology, so it can be used as reference/rubric material for an LLM judge
grading future Measured Mile reports or UI changes. It is a point-in-time
assessment (August 2026) — re-verify against the calculator source before
relying on any specific behavior claim below, since the code can change.

**Sources reviewed** (see `attached_assets/mm_material/`):
1. AACE International Recommended Practice **25R-03**, *Estimating Lost Labor
   Productivity in Construction Claims* — the primary methodology standard.
2. AACE Recommended Practice **130R-23**, *Demonstrating Entitlement to
   Cumulative Impact Claims in Construction* — entitlement framework;
   confirmed tangential to quantification mechanics, cited only where it adds
   an entitlement/causation point 25R-03 doesn't cover.
3. Conference slide deck, *Measured Mile Improvements in Pervasively
   Disrupted Projects* (35 slides) — covers the "broader measured mile":
   Thomas's non-contiguous baseline method, earned-value/efficiency-factor
   variants, and area/location-dependent productivity — the most directly
   relevant material for this app's edge cases (sparse, fragmented,
   pervasively-disrupted reporting).

**Overall verdict.** The app implements a legitimate, defensible variant of
the Measured Mile method — it is not a naive or non-standard approach. Its
core design choices (per-bid-item comparison, auto-selected best-rate window,
manual override, event-linked impact classification, proxy/estimate
labeling, evidence citations) map cleanly onto recognized practice. The
material below documents where the app's specific parameters (contiguous-run
requirement, unweighted means, "Unimpacted" labeling, no explicit similarity
checks) diverge from optional refinements the literature discusses — these
are judgment calls, not defects, and are flagged so a judge doesn't mistake
"different from one paper's method" for "wrong."

---

## 1. Method selection and hierarchy

| Criterion | Reference standard | App behavior | Verdict |
|---|---|---|---|
| Is Measured Mile the right primary method? | 25R-03 and the slide deck both rank Measured Mile Study as the single most-preferred, most court-accepted method for project-specific lost-productivity quantification (ahead of Earned Value, Work Sampling, Project Comparison, industry/cost-basis methods). | The app's entire Measured Mile tab implements exactly this comparison: same bid item, same project, impacted vs. baseline periods. | **Aligned.** Correct default choice of method. |
| Fallback when no clean unimpacted period exists | Both 25R-03 and the slide deck acknowledge some projects have no fully unimpacted period, and describe fallbacks (Comparable Work/Project Studies; Thomas's "lightly impacted" baseline; earned-value/efficiency-factor variants). | The app's `selectMeasuredMileWindow` relaxes its *minimum run length* down to 1 period if no run of the target length qualifies, but never relaxes the *eligibility test itself* (still requires zero overlapping impact events) and has no comparable-project fallback. | **Partial gap.** For a truly pervasively-disrupted item, the window can degenerate to a single low-confidence period rather than switching to a different method or a "lightly impacted" comparator. Worth flagging in UI copy when `periodCount` in the selected window is very small. |

## 2. Baseline ("measured mile") window selection

| Criterion | Reference standard | App behavior | Verdict |
|---|---|---|---|
| Must the baseline be a single contiguous run of periods? | **No.** The classic (Zink) definition compares contiguous unimpacted vs. impacted *sections*, but Thomas's baseline procedure (slide 6, and echoed in 25R-03's discussion of "least impacted" periods) explicitly does **not** require contiguity — it takes the top ~10% of periods by output (min. 5), wherever they fall in the timeline. | `selectMeasuredMileWindow` only considers **consecutive runs** of eligible periods (a run breaks at any gap, impact, or acceleration-tagged period) and picks the run with the highest average rate, subject to a minimum length (default 3, relaxed downward only as a last resort). | **Documented deviation.** This is the single most consequential difference from the literature. For sparse/fragmented per-item reporting (a known issue on this project — see `deriveInstalledQuantity` returning 0 for absent items), the contiguous-run constraint can force selection of a shorter or less-representative window than a Thomas-style non-contiguous top-N selection would. Not wrong per se (contiguous-run is itself a recognized formulation), but a judge should not penalize a report for *using* the app's contiguous window — only for failing to disclose that a non-contiguous top-N baseline was materially available and not surfaced. |
| Can baseline periods include "lightly impacted" work, not just fully clean work? | 25R-03 (Section C.3) and the slide deck ("Further Relaxation — the Baseline Concept") both endorse lightly-impacted periods as a conservative baseline when a fully unimpacted one doesn't exist, citing Thomas 1999 and noting this *understates* the loss (conservative, not exaggerating). | `isEligible` requires **zero** overlapping delay-event hours (`p.impactEventIds.length === 0`) — an all-or-nothing test. There's no "lightly impacted" tier. | **Documented deviation, defensible in either direction.** The app's stricter zero-impact rule is *more* conservative than what the literature requires, not less — so it doesn't create an entitlement risk. But it means the app may report "no measured-mile window found" in cases where a relaxed literature-consistent method would still produce a usable, if imperfect, baseline. |
| Selection criterion among eligible candidates | Neither source mandates a specific tie-breaking rule; 25R-03 requires the choice to be defensible and free of extraneous variables (weather, mismanagement, voluntary acceleration) that happened to coincide with the window. | App picks the run with the **highest average `productionRatePerDay`** (ties broken by longer run). This is a reasonable proxy for "best/least-disrupted" performance, consistent with the spirit of "best productivity" in Thomas's method. | **Aligned in spirit**, but see the confound gap below. |
| Exclusion of confounding variables (weather, mismanagement, voluntary acceleration) from the baseline | 25R-03 explicitly calls this out as a required step — a baseline period must be normalized for unrelated causes of low/high productivity, not just free of the delay events being claimed. | The app's eligibility test only excludes periods with an overlapping **delay-event** or a **manual acceleration tag** — it has no signal for weather, unrelated mismanagement, or other confounds. A period could be selected into the baseline (or excluded from being classified "impact") purely because no delay event happens to be linked to it, even if its productivity was independently depressed or inflated by an unrelated cause. | **Real gap.** This is the most actionable finding: the app cannot detect or flag confound risk in the auto-selected window. A judge assessing a specific report should treat "the auto-selected window/impacted-period average is dragged by an unrelated, undocumented cause" as a legitimate criticism the app's data model cannot currently rule out — analysts should be expected to sanity-check the auto-selected window and use the manual override when they know of such a confound. |
| Manual override capability | 25R-03 and the slide-deck's "Conclusions" (slide 35) both stress that Measured Mile selection can be "elusive" and requires **analyst judgment and creative thinking** to identify or improve. | The app exposes an explicit PE-range override (`measuredMileOverride`) that always wins over auto-selection, and the UI clearly flags `isAutoSelected: false` with a "Reset to auto" affordance. | **Aligned.** This is the app's main structural answer to the "requires judgment" theme in the literature — a judge should treat override usage as expected/healthy practice, not a red flag, as long as the resulting window is documented (see evidence-panel/citation notes below). |

## 3. "Similar work" / comparability requirement

| Criterion | Reference standard | App behavior | Verdict |
|---|---|---|---|
| Work compared must be the same or "reasonably alike" (Clark Concrete: need not be identical, just reasonably alike such that the comparison is meaningful; Thomas 2007's four-part test: similar type/nature/complexity, comparable crew composition/skill, baseline attainable, similar work environment). | All comparisons happen **within one bid item** across pay-estimate periods on the **same project** — automatically satisfying "same work" far more strictly than the case-law bar of "reasonably alike" across different work types. | Because the app never compares across different bid items or projects, the "similar work" question the case law wrestles with is structurally moot here — same item number by definition means same scope/unit of measure. | **Aligned by construction.** No action needed; this is actually a *stronger* comparability guarantee than the standard requires. |
| Crew composition / skill level comparability across baseline vs. impacted periods | Thomas 2007's second prong requires comparable crew skill/composition. | Not tracked. `MetricPoint` has no crew-composition or skill-level field; productivity is purely quantity/day. | **Gap, but likely out of scope.** The project's source documents (pay estimates, PODs, diaries) don't appear to carry structured crew-composition data at this granularity — this is a data-availability limit, not a design flaw the calculator can fix by itself. Worth noting as a known limitation rather than a defect. |
| Work environment comparability (e.g., weather, site conditions) | Thomas 2007's fourth prong. | Same as the confound gap above — no weather/environment signal feeds the eligibility test. | **Same gap as Section 2's confound finding** — not duplicated as a separate defect. |

## 4. Baseline vs. impacted rate calculation (the "quantum" math)

| Criterion | Reference standard | App behavior | Verdict |
|---|---|---|---|
| Basis of comparison | 25R-03 explicitly warns against computing % change on a **cost** basis rather than **labor hours**, and against comparing as-bid to actual rather than actual-to-actual. | The app's core loss stat (`productionRateLossPct`) compares **actual installed quantity per working day** (baseline vs. impacted), an actual-to-actual physical-production comparison — not cost, not as-bid. `estimatedLostManHours` uses **actual proxy hours per unit** (baseline vs. impacted), again actual-to-actual. | **Aligned.** Avoids both errors 25R-03 flags as the most common analyst mistakes. |
| Averaging method (simple mean vs. weighted) | Neither source mandates a specific averaging rule; the earned-value slides (James Corp., Bell BCI) compute a single ratio from *total* hours over *total* % complete for a period-group (equivalent to a **quantity/day-weighted** mean, not a period-count mean), while 25R-03's own worked examples use straightforward period averages. | The app's `average()` helper is an **unweighted arithmetic mean across periods** (`measuredMileBaselineRatePerDay`, `impactedAverageRatePerDay`, and the unit-rate averages) — a short 2-day period counts the same as a long 30-day period. | **Documented deviation, moderate.** Where period lengths vary substantially (this project has periods of very different duration), an unweighted per-period mean can differ meaningfully from a quantity/day-weighted mean. Not "wrong" — 25R-03's own examples do simple averaging too — but a judge should recognize this as a known design choice, not assume the app is silently doing (or should be assumed to be doing) day- or quantity-weighting. |
| Scope of the % loss / cost-basis errors 25R-03 warns about (project-wide application, ignoring learning curve, double-counting change-order hours) | 25R-03 Section on common errors. | The app scopes its loss calculation **only to periods actually classified `impact`** (never project-wide), does not apply any generic industry loss-factor, and computes lost hours from measured actual data rather than a table lookup — so double-counting and project-wide-application errors are structurally avoided. Learning-curve effects are not explicitly modeled (no distinct treatment for periods immediately following an impact vs. later in a long impacted run). | **Mostly aligned**; learning-curve non-modeling is a minor, literature-acknowledged gap common to Measured Mile implementations generally (not unique to this app). |

## 5. Terminology: "Unimpacted" / "Neutral"

| Criterion | Reference standard | App behavior | Verdict |
|---|---|---|---|
| What does "unimpacted" mean in a report? | 25R-03: an unimpacted/baseline period must be free of the claimed disruption *and* free of independently-confounding causes (see Section 2). | The UI's "Unimpacted" label (renamed from "Neutral" in earlier work this session) is assigned by `applyClassification` to any non-gap, non-acceleration, non-measured-mile-window period with **zero overlapping delay-event hours** — i.e., "not linked to a tracked delay event," not "verified free of all confounds." | **Terminology risk, not a math error.** The label is accurate as far as the app's own data model can attest, but a reader could over-read "Unimpacted" as "confirmed clean" per the stricter literature sense. Recommend the tooltip/legend copy state the label means "no linked delay event in this period" rather than implying a fuller confound-free guarantee — a documentation fix, not a calculation fix. |

## 6. Area/location dimension ("broader measured mile")

| Criterion | Reference standard | App behavior | Verdict |
|---|---|---|---|
| Productivity can vary by **location/area**, not just by time — the slide deck's Middle East multi-building case study and "Two Step Approach" (search by time then area, or area then time) address this directly. | The app has a distinct **location/corridor axis** (`xAxisMode: "location"`, `MeasuredMileLocationChart`, `CorridorLocationManager`) letting users view productivity by street/distance in addition to by pay-estimate period, and flags periods with unresolvable location evidence as explicitly unallocated rather than guessing. | This is a genuine, non-trivial alignment with an advanced technique the base 25R-03 standard doesn't even cover — the app already implements the "search by area" half of the Two-Step Approach. | **Strong alignment / distinguishing strength.** Worth highlighting positively in any judge rubric: this feature exceeds the baseline standard, not just meets it. |
| Recursive drill-down into sub-areas of an imperfect comparator to find a cleaner baseline (Middle East case study: use best sub-floors of the "best" building, not just the best building). | The location chart lets a user visually identify better/worse sub-corridors, but there's no automated "drill into the best comparator's own best sub-area" logic — a human has to do this by eye using the location chart. | **Not automated, but tool-supported.** Reasonable; full automation of this specific technique isn't a standard expectation. |

## 7. Cause-and-effect / entitlement linkage

| Criterion | Reference standard | App behavior | Verdict |
|---|---|---|---|
| "A cause and effect analysis is needed to establish the causal link between the disruption and declined productivity, and verify that the measured mile determined... is reasonable." (slide 34, echoed by 130R-23's causation element of the 7-part entitlement test). | Every `impact`-classified period carries `impactEventIds` traced back to specific delay events, and the UI's evidence panel/citations expose this linkage; `estimatedLostManHours` is only computed when actual proxy data ties both baseline and impacted periods to real evidence (`hasProxyData`). | **Aligned.** The event-ID linkage is exactly the kind of explicit causal tie the standard calls for, and the "proxy-only, flagged in the UI" language in the calculator's own comments shows the deviation between budgeted and measured hours is treated honestly rather than presented as certain. |

---

## Summary for judge use

**Do not flag as defects** (these are correct or literature-consistent choices):
- Using Measured Mile as the primary method.
- Comparing actual-to-actual production/unit-rate, never cost-basis or as-bid.
- Scoping loss calculations to impact-classified periods only, never project-wide.
- Structural same-bid-item comparison (satisfies "same/reasonably alike work" more strongly than case law requires).
- Manual override of the baseline window (expected professional judgment, per 25R-03/slide-deck conclusions).
- The location/corridor axis (exceeds the base standard).
- Event-ID-linked causal tracing for impact periods.

**Flag as known, documented deviations — judge future reports for whether the analyst/report *discloses* these, not for whether the app avoids them entirely:**
- Baseline window requires a **contiguous run**; does not implement Thomas's non-contiguous top-N-periods method. Most relevant when an item's reporting is sparse/fragmented.
- Baseline eligibility is **all-or-nothing** on delay-event overlap; no "lightly impacted" tier, no weather/mismanagement/environment confound screening. A judge should treat an auto-selected window with a plausible unflagged confound as a real quality issue to raise, not something the tool already prevents.
- Baseline/impacted averages are **unweighted per-period means**, not quantity- or duration-weighted — relevant when compared periods differ significantly in length.
- "Unimpacted" labeling means "no linked delay event," not "confirmed free of all confounds" — a report should not overstate this label's guarantee.
- No crew-composition or work-environment comparability signal (Thomas's 2nd/4th prongs) — a data-availability limit, not something to expect the calculator to fix unilaterally.
- Directed-acceleration UI is currently parked/disabled server-side — a report period showing likely acceleration but no matching UI tag should not be treated as the app failing to detect it; the feature is intentionally off, not broken.

No code changes are proposed as part of this assessment. The contiguous-run vs. Thomas non-contiguous baseline question and the unweighted-vs-weighted averaging question are both judgment calls with support in the literature either way — implementing either would be a deliberate scope decision for the user, not a bug fix.
