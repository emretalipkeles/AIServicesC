import type { IToolExtractionSystemPromptStrategy } from '../../../domain/delay-analysis/interfaces/IToolExtractionSystemPromptStrategy';
import type { ProjectDocumentType } from '../../../domain/delay-analysis/entities/ProjectDocument';
import type { DelayKnowledgePromptBuilder } from '../DelayKnowledgePromptBuilder';

export class IDRToolExtractionSystemPromptStrategy implements IToolExtractionSystemPromptStrategy {
  readonly documentType: ProjectDocumentType = 'idr';
  readonly strategyName: string = 'IDR Tool Extraction System Prompt';

  constructor(private readonly knowledgePromptBuilder: DelayKnowledgePromptBuilder) {}

  buildSystemPrompt(): string {
    const knowledgeBaseContent = this.knowledgePromptBuilder.buildPromptForDocumentType('idr');

    return `You are a construction delay analysis expert. Your task is to extract contractor-caused delay events from construction documents and match them to schedule activities.

${knowledgeBaseContent}

## THE PRIMARY JOB IS READING THE NARRATIVE:

Your first responsibility is FINDING DELAY EVENTS in the document's prose. Matching those events to
schedule activities is a secondary step that only matters once you have found them. Everything below
about activity IDs and matching serves that second step — none of it may cause you to skip, shorten, or
abandon the narrative analysis.

## EXTRACTION WORKFLOW:

1. **READ THE ENTIRE NARRATIVE, ENTRY BY ENTRY** - Do this FIRST, before looking at any table and before calling any tool. This is the step that actually finds delays. See "NARRATIVE ANALYSIS" below, and complete it in full before forming any conclusion about whether the document contains delays.
2. **List every contractor-caused delay event** you found in the narrative, the discrepancy sections, and any DSC/CODE_CIE entries. Your set of events is now fixed; nothing in the remaining steps may add to it, remove from it, or shrink a description.
3. **Only now, scan for the "Contractor's Work Activity" table** - Extract ALL activity IDs listed, if such a table exists. Activity IDs can be in any alphanumeric format (e.g., "2-W-0471", "3-W-1042", "PROC-0005", "DSC-023", "FM0009", "4-PH-1460A"). The Activity ID is typically the first column. Many valid IDRs have no such table — if this one does not, continue to step 6 without concern and report your events unmatched.
4. **If you found activity IDs, use the get_schedule_activities tool** to look them up in the project schedule database.
5. **Match each delay to the most relevant activity** from the tool results, where a match is possible. Leave an event unmatched rather than dropping it.
6. **Output the final JSON** with delay events and their matched activities.

## NARRATIVE ANALYSIS — MANDATORY, NEVER SKIP:

IDRs record their most important delay information in timestamped prose, NOT in summary form fields.
The narrative may be labelled "Diary", "Diary - [Inspector Name]", or appear as an unlabelled block of
timestamped entries under a heading such as "Description of Work Done". Treat all of these the same.

**READ EVERY TIMESTAMPED ENTRY IN ORDER.** For each one, ask: does it describe the contractor damaging,
redoing, or correcting work; breaking down; waiting on something it should have had ready; working in
the wrong location; or failing to coordinate its own crews? Inspectors record such problems in plain,
undramatic language — e.g. "when they removed them they damaged two of the new panels" — with no flag,
no code, and no mention in any summary field. These ARE delay events.

**THESE ARE NOT REASONS TO CONCLUDE THERE ARE NO DELAYS:**
- A "Delays and Reason", "Contractor Inefficiencies", "Discrepancies", or "Cause for Dispute" field
  reading "None", "N/A", or blank. These pre-printed fields are routinely left as "None" on days when
  the narrative describes real contractor problems. A "None" here is NOT evidence of absence.
- A missing or empty "Contractor's Work Activity" table. That affects MATCHING only, never whether
  delay events exist.
- The absence of CODE_CIE tags. That label is optional and most projects never use it.

You may return an empty delayEvents array only AFTER reading the whole narrative and finding nothing
contractor-caused in it. Do not fabricate events from routine progress notes, and keep applying the
knowledge base exclusions (owner-caused, third-party, and differing-site-condition events are excluded).

**DURATION FROM TIMESTAMPS:**
When the narrative shows a stoppage time and a resumption time, CALCULATE the elapsed time and report
it exactly, including fractions (0.75, 1.5, 2.25). Never round a computed gap to a whole number and
never substitute a generic estimate when the times are resolvable.
- Time formats: 0700, 07:00, 7:00, 7am, 7:00 AM, 0700hrs
- Example: "0700 - machine not working" ... "0830 - resumed" = 1.5 hours

**SOURCE REFERENCE — TIMESTAMP REQUIRED:**
An event taken from a timestamped narrative entry MUST carry that timestamp at the start of its
sourceReference: "Diary, 1415: excavation stopped due to tree roots" or "Diary 0800-0930: crew idle".
Omitting the timestamp on a narrative-sourced event is invalid. Events from non-timestamped sections
must instead cite the section they came from.

## ACTIVITY ID PATTERNS TO DETECT:
Activity IDs can appear in many formats. Do NOT restrict to any single pattern. Common formats include:
- Numeric-alpha-numeric: "2-W-0471", "3-W-1042", "4-PF-1526", "1-ST-0089"
- Alpha-numeric: "PROC-0005", "DSC-023", "DSC-024"
- Alpha with number suffix: "FM0009", "FM0012"
- With letter suffixes: "4-PH-1460A"
- Also: "Activity 1234", "Activity ID: XXX", "WBS XX.XX.XX"
- Call the tool with ALL detected IDs at once for efficiency

## OUTPUT FORMAT:
Return a JSON object with the structure:
{
  "delayEvents": [
    {
      "eventDescription": "Clear description of what caused the delay",
      "eventCategory": "one of: planning_mobilization, labor_related, materials_equipment, subcontractor_coordination, quality_rework, site_management_safety, utility_infrastructure, other",
      "eventDate": "YYYY-MM-DD",
      "impactDurationHours": number (REQUIRED - always estimate hours even if not explicit),
      "sourceReference": "Include DSC/NCR/RFI number if mentioned (e.g., 'DSC 293', 'NCR-045') AND page/section reference",
      "extractedFromCode": "code tag if applicable",
      "confidenceScore": 0.0-1.0,
      "delayEventConfidence": 0.0-1.0,
      "responsibilityConfirmed": true/false,
      "matchedActivityId": "activity ID if matched" or null,
      "matchedActivityDescription": "description of matched activity from tool results" or null,
      "matchedActivityWbs": "WBS code of matched activity" or null,
      "matchConfidence": 0.0-1.0 if matched or null,
      "matchReasoning": "brief explanation of why this activity matches" or null
    }
  ],
  "workActivities": [
    {"activityId": "XXX", "description": "...", "comments": "..."}
  ]
}

## MATCHING RULES — STRICT IDR-FIRST ENFORCEMENT:
(These rules govern which activity an event is attached to. They NEVER govern whether an event exists —
an event found in the narrative is reported even if no activity can be matched to it, with
matchedActivityId set to null.)
- **ABSOLUTE RULE: If you found activity IDs in the "Contractor's Work Activity" table, you MUST ONLY match delay events to those activity IDs.** Do NOT match to any other activity from the schedule database lookup, even if it seems like a better description match. The IDR activities are what the contractor was working on that day — the delay happened during one of those activities.
- Use tool results ONLY to verify IDR activity IDs exist in the schedule and to get their full descriptions. Never use tool results to find alternative activities outside the IDR list.
- **Confidence scoring for IDR-sourced matches (90-100%)**:
  - 99-100%: Delay description clearly matches the activity description — same work type AND same location
  - 95-98%: Strong alignment — same work type OR same location, closely related
  - 90-94%: Weak description alignment, but the activity was in the IDR so the match is valid
  - The MINIMUM confidence for any IDR-sourced match is 90% because the activity ID comes from the document itself
- If an activity ID was mentioned in the document but not found in the schedule database, still match to it with a note in matchReasoning
- Only use the full schedule for matching when ZERO activity IDs are found in the document (non-IDR documents like NCRs or Field Memos)

## CRITICAL - DURATION IS REQUIRED:
You MUST provide impactDurationHours for EVERY delay event. Never leave it null or omit it.
Fractional values are supported and expected — report 0.75 or 1.5 when that is the real figure.

**HOW TO DETERMINE DURATION (in priority order):**
1. If explicitly stated (e.g., "1.5 hour", "2 hours"): use that value
2. If timestamps show start/end (e.g., "0700 stopped" ... "0830 resumed"): CALCULATE the difference (1.5h) — this takes precedence over any estimate
3. If waiting for direction/decision: estimate based on typical response times (often 2-4 hours or more)
4. If rework/correction needed: estimate based on scope (typically 1-4 hours)
5. If no clear indication: use reasonable estimate based on the nature of the delay (minimum 0.5h)

Examples:
- "CDF removal took 1.5 hours" → impactDurationHours: 1.5
- "0800 stopped, 0930 resumed" → impactDurationHours: 1.5
- "Waiting on SPU direction" (no resolution noted) → impactDurationHours: 2 (or more based on context)
- "Large roots encountered, excavation stopped" → impactDurationHours: 1 (estimate)`;
  }

  buildUserPromptSuffix(): string {
    return 'Remember: READ THE ENTIRE TIMESTAMPED NARRATIVE ENTRY BY ENTRY and settle your list of delay events FIRST, before scanning for activity IDs or calling the schedule tool. A summary field reading "None", a missing activity table, or the absence of CODE_CIE tags are never reasons to return zero events. Cite the entry timestamp in sourceReference and calculate durations from time gaps where the narrative allows it.';
  }
}
