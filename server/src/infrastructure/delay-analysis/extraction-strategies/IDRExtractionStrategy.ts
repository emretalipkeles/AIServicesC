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
  * If explicitly stated (e.g., "1.5 hour"): use that value
  * If timestamps show start/end: calculate the difference
  * If waiting on direction: estimate 2-4 hours minimum
  * If unclear: provide your best estimate (minimum 0.5h) - NEVER leave duration null
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
When diary entries show work stoppage and resumption, CALCULATE the delay duration:
- Example: "0700 - crew stopped work, machine not running" ... "0830 - crew resumed after repair"
  → Delay duration = 1.5 hours (from 07:00 to 08:30)
- Example: "1415 - excavation stopped due to tree roots (DSC 295)" ... "1500 - work resumed"
  → Delay duration = 0.75 hours (45 minutes)

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
When the narrative gives you a stoppage time and a resumption time, you MUST compute the elapsed time
and report it exactly — including fractions such as 0.75, 1.5, or 2.25. Do NOT round a computed gap to
a whole number, and do NOT fall back to a generic estimate when the timestamps let you calculate the
real figure. Only use estimation when the narrative provides no resolvable times.

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
