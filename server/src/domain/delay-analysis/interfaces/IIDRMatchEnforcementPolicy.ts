import type { IDRWorkActivity } from './IDocumentExtractionStrategy';

export interface IDRMatchValidationResult {
  isValid: boolean;
  reason: string;
  correctedActivityId?: string;
  correctedConfidence?: number;
}

export interface IIDRMatchEnforcementPolicy {
  validatePreMatch(
    preMatchedActivityId: string,
    preMatchedConfidence: number,
    idrWorkActivities: IDRWorkActivity[]
  ): IDRMatchValidationResult;

  enforceConfidenceFloor(confidence: number): number;
}
