import type { 
  IDocumentExtractionStrategy, 
  DocumentExtractionContext, 
  ExtractionStrategyResult 
} from '../../../domain/delay-analysis/interfaces/IDocumentExtractionStrategy';
import type { ProjectDocumentType } from '../../../domain/delay-analysis/entities/ProjectDocument';
import type { DelayKnowledgePromptBuilder } from '../DelayKnowledgePromptBuilder';

export class IDRExtractionStrategy implements IDocumentExtractionStrategy {
  readonly documentType: ProjectDocumentType = 'idr';
  readonly strategyName: string = 'IDR Extraction Strategy';

  constructor(private readonly knowledgePromptBuilder: DelayKnowledgePromptBuilder) {}

  buildExtractionPrompt(context: DocumentExtractionContext): ExtractionStrategyResult {
    const truncatedContent = context.documentContent.slice(0, 30000);
    const knowledgeBasePrompt = context.skipKnowledgeBase
      ? ''
      : this.knowledgePromptBuilder.buildPromptForDocumentType('idr');

    const knowledgeBaseSection = knowledgeBasePrompt
      ? `\n${knowledgeBasePrompt}\n`
      : '\n(Knowledge base provided in system prompt - refer to it for delay definitions, categories, exclusions, decision framework, worked examples, and gray areas.)\n';

    const fieldMemoSection = context.fieldMemoContext
      ? `\n=============================================================================
FIELD MEMO CONTEXT (Background Information)
=============================================================================
The following is a summary of Field Memos from this project. Use this context to better understand ongoing site conditions, corrective actions, and known issues when evaluating potential delay events. This context may help you:
- Identify delays related to known corrective actions or rework directives
- Understand site constraints that affect contractor performance
- Distinguish between new delays and previously documented issues
- Assess whether observed issues are part of an ongoing pattern

${context.fieldMemoContext}
=============================================================================
\n`
      : '';

    const prompt = `You are an expert construction delay analyst specializing in Inspector Daily Reports (IDRs).

DOCUMENT TYPE: Inspector Daily Report (IDR)
CONTEXT: IDRs are daily field observations written by inspectors. They capture what's happening on site day-to-day. Inspectors flag potential contractor delays with code "CODE_CIE" (Contractor Initiated Events).
${knowledgeBaseSection}${fieldMemoSection}
=============================================================================
YOUR TASK: Analyze this IDR and extract TWO things:
1. **Contractor's Work Activity** - The schedule activities listed in the "Contractor's Work Activity" table (if present)
2. **Delay Events** - Contractor-caused delay events from the document
=============================================================================

PART 1: EXTRACT CONTRACTOR'S WORK ACTIVITY TABLE

Many IDRs contain a "Contractor's Work Activity" section/table that lists the schedule activities being worked on that day. This table typically has columns like:
- Schedule Activity # (e.g., "2-W-0471", "3-W-1042")
- Description (e.g., "Stage 1 WM: Excavate Services")
- Comments (e.g., "WM STA 7+00 to 21+50")

**IMPORTANT**: If you find this table, extract ALL entries. This information is critical for matching delay events to schedule activities efficiently.

=============================================================================
PART 2: EXTRACT DELAY EVENTS
=============================================================================

EXTRACTION PRIORITIES (in order):
1. CODE_CIE tagged entries - These are explicitly flagged contractor delays (HIGHEST PRIORITY)
2. Delays caused by contractor actions or inaction
3. Work stoppages due to contractor issues (equipment breakdown, crew problems)
4. Material or equipment delays from contractor
5. Subcontractor coordination failures
6. Quality issues observed that may require rework

**CRITICAL: extractedFromCode FIELD RULES**
1. If the delay was identified from a CODE_CIE entry in the document:
   - Set extractedFromCode to EXACTLY "CODE_CIE"
2. If the delay was identified from general narrative observation (NOT tagged with CODE_CIE):
   - Set extractedFromCode to "IDR_OBSERVATION"

EXAMPLES:
- Document says "CODE_CIE: Crew arrived 2 hours late" → extractedFromCode: "CODE_CIE"
- Document has section labeled "CIE" or "Contractor Issues" with CODE_CIE tag → extractedFromCode: "CODE_CIE"
- Document mentions "equipment breakdown noted" without CODE_CIE tag → extractedFromCode: "IDR_OBSERVATION"

CRITICAL ANALYSIS REQUIREMENTS:
- CONFIDENCE SCORING: Since IDR observations are subjective, you must assess:
  * Is this really a delay event or routine observation? Apply the knowledge base decision framework.
  * Is the contractor clearly responsible, or is it ambiguous? Check the exclusions list.
  * Can delay duration be determined from the narrative?
- DURATION ESTIMATION (REQUIRED): You MUST provide impactDurationHours for EVERY delay event.
  Determine it in this priority order (highest first):
  1. Explicitly stated (e.g., "1.5 hour"): use that value → durationBasis: "document_stated"
  2. Timestamps show start/end of the SAME event: calculate the difference → durationBasis: "timestamp_derived"
  3. Event starts at a timestamp with no resumption, but the NEXT distinct entry's timestamp is a
     plausible gap (a few hours at most): calculate the gap → durationBasis: "bounded_by_next_entry"
  4. Waiting on direction with nothing to bound against: estimate 2-4 hours minimum → durationBasis: "estimated"
  5. Unclear: provide your best estimate (minimum 0.5h) - NEVER leave duration null → durationBasis: "estimated"
  See the DIARY / NARRATIVE ANALYSIS section below for the full rules and worked examples for #2 and #3.
- RESPONSIBILITY VERIFICATION: Analyze the narrative to confirm contractor responsibility
  * Some CODE_CIE entries might be false positives
  * Look for clear contractor-caused issues vs. external factors
  * Apply the exclusions from the knowledge base - DSCs, owner-directed suspensions, etc.

=============================================================================
DIARY / NARRATIVE ANALYSIS — MANDATORY, DO THIS BEFORE ANY CONCLUSION
=============================================================================

IDRs carry their most important delay information in timestamped narrative prose, NOT in the summary
form fields. You MUST walk this narrative entry by entry before deciding whether any delays exist.

**WHERE THE NARRATIVE LIVES:**
The timestamped narrative may be labelled "Diary", "Diary - [Inspector Name]", or it may be an
unlabelled block of timestamped prose under a heading such as "Description of Work Done". Treat ALL of
these identically — a heading of "Description of Work Done" does not make the content routine.

**MANDATORY WALK-THROUGH:**
Read each timestamped entry in order and ask of each one: does this entry describe the contractor
damaging, redoing, or correcting work; breaking down; waiting on something it should have had ready;
working in the wrong place; or failing to coordinate its own crews? Narrative entries frequently record
contractor-caused problems in plain, undramatic language, e.g. "when they removed them they damaged two
of the new panels" or "crew waited for the correct fitting to arrive". These ARE delay events even
though no form field flags them and no code tags them.

**TIME FORMATS TO RECOGNIZE:**
Inspectors use various formats: 0700, 07:00, 7:00, 7am, 7:00 AM, 7 AM, 0700hrs

**DURATION CALCULATION FROM TIMESTAMPS:**
When diary entries show work stoppage and resumption OF THE SAME EVENT, CALCULATE the delay duration:
- Example: "0700 - crew stopped work, machine not running" ... "0830 - crew resumed after repair"
  → Delay duration = 1.5 hours (from 07:00 to 08:30), durationBasis: "timestamp_derived"
- Example: "1415 - excavation stopped due to tree roots (DSC 295)" ... "1500 - work resumed"
  → Delay duration = 0.75 hours (45 minutes), durationBasis: "timestamp_derived"

**WHEN THE NARRATIVE NEVER RETURNS TO THE EVENT — BOUND BY THE NEXT ENTRY:**
Often the diary never says the stopped work resumed; it simply moves on to the next timestamped
entry, which describes something else entirely. When that next entry is a plausible amount of time
later (a few hours at most), treat its timestamp as the point the delay ended and CALCULATE the gap:
- Example: "1300 - slip-form curb machine broke, stopped work" ... "1530 - exposed water main found
  (unrelated)" → the curb delay is bounded by the 15:30 entry → Delay duration = 2.5 hours,
  impactedWindowStart: "13:00", impactedWindowEnd: "15:30", durationBasis: "bounded_by_next_entry"
Do NOT bound against an entry many hours later or on the next day — that gap is not evidence the delay
itself lasted that long. When the next entry is too far away (or there is no next entry), fall back to
an estimate instead: durationBasis: "estimated".

**MANDATORY CHECK BEFORE WRITING durationBasis: "estimated":** If the event's own diary entry has a
timestamp, look at the very next timestamped entry anywhere in the document — it does not need to be
about the same topic (e.g. "12:00 PM pipe delivered" can close a delay that started at "11:00 AM").
If that next entry is within a few hours, you MUST use "bounded_by_next_entry" instead of "estimated",
with impactedWindowStart/End set to those two timestamps. Only skip this and use "estimated" when there
is no next timestamped entry, it is too many hours later, or the event is the day's last diary entry.

**WHAT TO EXTRACT FROM DIARY:**
1. Work stoppages with timestamps (calculate duration from time gaps)
2. DSC references mentioned in diary (e.g., "DSC 293", "DSC 295")
3. Equipment breakdowns, crew delays, material issues
4. Coordination problems noted by inspector
5. Quality issues that halted work

**SOURCE REFERENCE FORMAT FOR DIARY ENTRIES — REQUIRED:**
If an event comes from a timestamped narrative entry, its sourceReference MUST begin with the timestamp
of the entry it came from, in one of these forms:
- Single entry: "Diary, 1415: [brief description]"
- Spanning a stoppage and resumption: "Diary 0800-0930: [description]"
A sourceReference for a narrative-sourced event that omits the timestamp is INVALID. Only events taken
from non-timestamped sections (form fields, discrepancy blocks, attached memos) may omit it, and those
must instead cite the section they came from.

**DURATION FROM TIMESTAMPS TAKES PRECEDENCE OVER ESTIMATION:**
When the narrative gives you a stoppage time and a resumption time (timestamp_derived), or a start time
that is bounded by the next distinct entry's timestamp (bounded_by_next_entry), you MUST compute the
elapsed time and report it exactly — including fractions such as 0.75, 1.5, or 2.25. Do NOT round a
computed gap to a whole number, and do NOT fall back to a generic estimate when a timestamp lets you
calculate the real figure. Only use estimation when the narrative provides no resolvable times, or when
the next entry is too far away (more than a few hours) to plausibly bound the same delay.

=============================================================================
DELAY EVENT CONFIDENCE ASSESSMENT
=============================================================================

For each delay event you extract, assess your confidence that this is truly a delay event (not a routine observation or normal progress note). Use the knowledge base above including:
- The core test: Was the Contractor doing everything within its power to diligently prosecute the Work?
- The delay categories and what to look for
- The exclusions list (what is NOT a contractor delay)
- The decision framework (if-yes/if-no logic)
- The worked examples for reference
- The gray area scenarios for borderline cases

Set "delayEventConfidence" as a number between 0.0 and 1.0 for each event.

=============================================================================
RESPONSE FORMAT
=============================================================================

Return a JSON object with TWO arrays:

{
  "workActivities": [
    {
      "activityId": "2-W-0471",
      "description": "Stage 1 WM: Excavate Services",
      "comments": "WM STA 7+00 to 21+50"
    }
  ],
  "delayEvents": [
    {
      "eventDescription": "Clear description of the delay event",
      "eventCategory": "One of: planning_mobilization, labor_related, materials_equipment, subcontractor_coordination, quality_rework, site_management_safety, utility_infrastructure, other",
      "eventDate": "YYYY-MM-DD",
      "impactDurationHours": 2.0 (REQUIRED - always provide a number, never null),
      "impactedWindowStart": "HH:MM clock time the impact began, ONLY when the narrative gives a real time" or null,
      "impactedWindowEnd": "HH:MM clock time the impact ended, ONLY when the narrative gives a real time" or null,
      "durationBasis": "one of: timestamp_derived (start/resume times for THIS SAME event), document_stated (explicit duration written), bounded_by_next_entry (event's start time bounded by the NEXT, different narrative entry's timestamp), estimated (inferred with no times/explicit duration)",
      "sourceReference": "MUST include DSC/NCR number if mentioned (e.g., 'DSC 293: Page 2'). Format: 'DSC XXX' + location",
      "extractedFromCode": "CODE_CIE or IDR_OBSERVATION",
      "confidenceScore": 0.85,
      "delayEventConfidence": 0.85,
      "responsibilityConfirmed": true
    }
  ]
}

CRITICAL RULE — WHEN TO RETURN ZERO DELAY EVENTS:

Return an EMPTY delayEvents array ("delayEvents": []) ONLY after you have read the full narrative and
found no contractor-caused delay in it. Returning zero events is a conclusion you reach at the END of
your analysis, never a shortcut you take at the start.

**THESE ARE NOT GROUNDS FOR RETURNING ZERO EVENTS — DO NOT STOP ON THEM:**
- A summary form field such as "Delays and Reason", "Contractor Inefficiencies", "Discrepancies", or
  "Any Cause for Dispute or Change Order" reads "None", "N/A", or is blank. These are pre-printed
  checkbox-style fields that inspectors routinely leave as "None" while describing real contractor
  problems in the narrative on the very same page. A "None" in these fields is NOT evidence of absence.
- The "Contractor's Work Activity" table is missing, empty, or the document has no activity IDs at all.
  Many valid IDRs have no such table. Its absence affects MATCHING only — it has no bearing whatsoever
  on whether delay events exist.
- There are no CODE_CIE tags in the document. CODE_CIE is an optional convenience label. Most projects
  never use it. Its absence means you must read the narrative more carefully, not less.

**BEFORE you may conclude "no delays", you MUST have:**
1. Read every timestamped narrative entry from first to last.
2. Read the "Discussion with Contractor or Others", "Discrepancies", and "Extra Work" sections.
3. Confirmed that no entry describes contractor-caused damage, rework, redoing of completed work,
   equipment breakdown, crew or material shortfall, waiting caused by the contractor's own
   unpreparedness, work in the wrong location, or a coordination failure attributable to the contractor.

**STILL DO NOT FABRICATE.** If the narrative genuinely shows only normal productive work, return zero
events. A clean report is a legitimate outcome. The goal is to stop exiting before reading — not to
manufacture events from routine progress notes. Routine descriptions of planned work proceeding
normally are NOT delays, and owner-caused, third-party, and differing-site-condition events remain
excluded per the knowledge base.

NOTES:
- workActivities: Extract from "Contractor's Work Activity" table. Return empty array [] if no such table exists.
- delayEvents: Extract delay events as described above. Return empty array [] if no delays are found.

Document content:
${truncatedContent}`;

    return {
      prompt,
      baseConfidence: 0.6,
      requiresNarrativeVerification: true,
      delayIsCertain: false,
      extractWorkActivities: true,
    };
  }
}
