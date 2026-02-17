/**
 * @deprecated Use ContractorDelayTrainingGuide and IDelayKnowledgeBase instead.
 * This file is retained for backward compatibility only.
 * The comprehensive training guide in ContractorDelayTrainingGuide.ts supersedes this config.
 */
export interface DelayDefinitionCriteria {
  definition: string;
  highConfidenceIndicators: string[];
  lowConfidenceIndicators: string[];
  minimumConfidenceThreshold: number;
}

export const DEFAULT_DELAY_DEFINITION: DelayDefinitionCriteria = {
  definition: `A construction delay is an event or condition that causes work to stop, slow down, or deviate from the planned schedule. For a delay to be classified with high confidence, it must meet these criteria:
1. There is a clear interruption or stoppage of planned work activities
2. The cause is identifiable and attributable to a specific party (typically the contractor)
3. There is a measurable or estimable time impact on the schedule
4. The event is distinct from normal construction variability or routine adjustments`,
  
  highConfidenceIndicators: [
    "Explicit CODE_CIE tag in the document",
    "Clear work stoppage with documented start and end times",
    "Equipment breakdown preventing work continuation",
    "Crew not showing up or arriving late with documented time gap",
    "Failed inspection requiring rework with documented scope",
    "Material delivery failure with documented impact on scheduled work",
    "Safety incident causing documented work stoppage",
    "Subcontractor no-show or coordination failure with schedule impact"
  ],
  
  lowConfidenceIndicators: [
    "General observation without specific time impact",
    "Routine progress note that could be normal workflow",
    "Weather mention without documented work stoppage",
    "Vague language like 'slow progress' without specifics",
    "Inspector opinion without supporting evidence",
    "Activity mentioned but no clear deviation from plan",
    "Potential future issue rather than actual delay event"
  ],
  
  minimumConfidenceThreshold: 0.3,
};
