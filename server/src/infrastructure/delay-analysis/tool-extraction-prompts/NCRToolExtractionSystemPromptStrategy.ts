import type { IToolExtractionSystemPromptStrategy } from '../../../domain/delay-analysis/interfaces/IToolExtractionSystemPromptStrategy';
import type { ProjectDocumentType } from '../../../domain/delay-analysis/entities/ProjectDocument';
import type { DelayKnowledgePromptBuilder } from '../DelayKnowledgePromptBuilder';

export class NCRToolExtractionSystemPromptStrategy implements IToolExtractionSystemPromptStrategy {
  readonly documentType: ProjectDocumentType = 'ncr';
  readonly strategyName: string = 'NCR Tool Extraction System Prompt';

  constructor(private readonly knowledgePromptBuilder: DelayKnowledgePromptBuilder) {}

  buildSystemPrompt(): string {
    const knowledgeBaseContent = this.knowledgePromptBuilder.buildPromptForDocumentType('ncr');

    return `You are a construction delay analysis expert specializing in Non-Conformance Reports (NCRs). Your task is to extract contractor-caused delay events from NCR documents and match them to CPM schedule activities.

${knowledgeBaseContent}

## DOCUMENT TYPE: NON-CONFORMANCE REPORT (NCR)

NCRs are formal documentation of quality failures where work does not meet contract specifications. An NCR = work failed inspection = rework required = DEFINITE delay.

**CRITICAL: NCRs are the HIGHEST-CONFIDENCE delay indicators.** Every NCR documents a quality failure that requires corrective action — this is always a delay event unless the failure is caused by a design defect or owner-directed change.

## EXTRACTION WORKFLOW FOR NCRs:

1. **Read the entire NCR** — Identify the non-conformance, what failed, and the corrective action
2. **Extract the delay event** — The NCR itself is the delay event
3. **Scan the NCR for any activity IDs or WBS codes** — Activity IDs can be in any alphanumeric format (e.g., "2-W-0471", "PROC-0005", "DSC-023", "FM0009", "4-PH-1460A", "Activity XXXX", "WBS XX.XX.XX"). If found, use the get_schedule_activities tool to look them up.
4. **If no activity IDs found** — Leave matchedActivityId as null. Do NOT fabricate activity IDs or pass descriptive text to the tool.
5. **Output the final JSON**

## WHAT TO EXTRACT FROM NCRs:

- **NCR number and date**: The formal identifier and when it was issued
- **What failed**: The specific deficiency or non-conformance
- **Corrective action**: What rework is required
- **Specification reference**: What contract requirement was violated
- **Location/area**: Where the failure occurred
- **Any referenced activity IDs or WBS codes**

## OUTPUT FORMAT:
Return a JSON object with the structure:
{
  "delayEvents": [
    {
      "eventDescription": "Clear description: what failed inspection AND what corrective action is required",
      "eventCategory": "one of: planning_mobilization, labor_related, materials_equipment, subcontractor_coordination, quality_rework, site_management_safety, utility_infrastructure, other (most NCRs = quality_rework)",
      "eventDate": "YYYY-MM-DD (the NCR date)",
      "impactDurationHours": null (only include if explicitly stated in the NCR — DO NOT estimate for NCRs),
      "sourceReference": "NCR-XXX or DSC XXX AND section reference",
      "extractedFromCode": "NCR_XXX (the NCR number)",
      "confidenceScore": 0.85-1.0 (NCRs are high confidence),
      "delayEventConfidence": 0.85-1.0 (NCRs document definite failures),
      "responsibilityConfirmed": true/false,
      "reworkDescription": "specific corrective action required",
      "matchedActivityId": "activity ID if matched via tool" or null,
      "matchedActivityDescription": "description of matched activity" or null,
      "matchedActivityWbs": "WBS code of matched activity" or null,
      "matchConfidence": 0.0-1.0 if matched or null,
      "matchReasoning": "why this activity matches the NCR" or null
    }
  ],
  "workActivities": []
}

## MATCHING RULES FOR NCRs:
- NCRs rarely contain activity IDs — if you find any activity IDs or WBS codes, use the get_schedule_activities tool to look them up
- The tool only accepts activity IDs (e.g., "2-W-0471", "Activity 1234", "WBS 05.02.01") — do NOT pass descriptive text like "concrete" or "backfill"
- If no activity IDs are found in the NCR, leave matchedActivityId as null — do not force a match
- Match confidence should reflect alignment between the NCR's work area and the schedule activity

## DURATION RULES FOR NCRs:
- DO NOT estimate duration for NCRs
- Only extract duration if explicitly stated in the NCR document (e.g., "rework estimated at 3 days")
- If no duration is mentioned, set impactDurationHours to null
- Duration will be determined separately during schedule impact analysis

## RESPONSIBILITY:
- NCR = contractor quality failure = contractor responsibility by default
- Only mark as NOT contractor-caused if the NCR explicitly indicates:
  * Design defect (plans were wrong)
  * Owner-directed change (owner changed requirements after work started)
  * Third-party damage (someone else damaged the work)`;
  }

  buildUserPromptSuffix(): string {
    return 'Extract all delay events from this NCR. If you find any activity IDs or WBS codes in the NCR, use the tool to look them up. Otherwise, leave matchedActivityId as null.';
  }
}
