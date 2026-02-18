import type { IDRWorkActivity } from '../interfaces/IDocumentExtractionStrategy';
import type { IIDRMatchEnforcementPolicy, IDRMatchValidationResult } from '../interfaces/IIDRMatchEnforcementPolicy';

const IDR_CONFIDENCE_FLOOR = 90;

function normalizeActivityId(id: string): string {
  return id.replace(/\b0+(\d)/g, '$1').trim();
}

export class IDRMatchEnforcementPolicy implements IIDRMatchEnforcementPolicy {
  validatePreMatch(
    preMatchedActivityId: string,
    preMatchedConfidence: number,
    idrWorkActivities: IDRWorkActivity[]
  ): IDRMatchValidationResult {
    if (idrWorkActivities.length === 0) {
      return { isValid: true, reason: 'No IDR work activities — no enforcement needed' };
    }

    const normalizedPreMatch = normalizeActivityId(preMatchedActivityId);
    const idrIds = idrWorkActivities.map(wa => normalizeActivityId(wa.activityId));

    const matchIndex = idrIds.findIndex(id => id === normalizedPreMatch);

    if (matchIndex >= 0) {
      const enforced = this.enforceConfidenceFloor(preMatchedConfidence);
      return {
        isValid: true,
        reason: `Pre-matched activity ${preMatchedActivityId} is in the IDR work activities list`,
        correctedConfidence: enforced !== preMatchedConfidence ? enforced : undefined,
      };
    }

    return {
      isValid: false,
      reason: `Pre-matched activity ${preMatchedActivityId} is NOT in the IDR work activities list [${idrWorkActivities.map(wa => wa.activityId).join(', ')}]. ` +
        `IDR-first rule requires matching only to document-sourced activities. Pre-match will be stripped so the strict IDR matcher handles it.`,
      correctedActivityId: idrWorkActivities[0].activityId,
    };
  }

  enforceConfidenceFloor(confidence: number): number {
    return Math.max(confidence, IDR_CONFIDENCE_FLOOR);
  }
}
