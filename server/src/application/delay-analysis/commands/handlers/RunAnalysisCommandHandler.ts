import { randomUUID } from 'crypto';
import type { RunAnalysisCommand } from '../RunAnalysisCommand';
import type { IDelayAnalysisProjectRepository } from '../../../../domain/delay-analysis/repositories/IDelayAnalysisProjectRepository';
import type { IProjectDocumentRepository } from '../../../../domain/delay-analysis/repositories/IProjectDocumentRepository';
import type { IScheduleActivityRepository } from '../../../../domain/delay-analysis/repositories/IScheduleActivityRepository';
import type { IContractorDelayEventRepository } from '../../../../domain/delay-analysis/repositories/IContractorDelayEventRepository';
import type { IDelayEventExtractor } from '../../../../domain/delay-analysis/interfaces/IDelayEventExtractor';
import type { IActivityMatcher } from '../../../../domain/delay-analysis/interfaces/IActivityMatcher';
import { ContractorDelayEvent } from '../../../../domain/delay-analysis/entities/ContractorDelayEvent';

export interface RunAnalysisResult {
  eventsExtracted: number;
  eventsMatched: number;
  documentsProcessed: number;
  errors: string[];
}

export class RunAnalysisCommandHandler {
  constructor(
    private readonly projectRepository: IDelayAnalysisProjectRepository,
    private readonly documentRepository: IProjectDocumentRepository,
    private readonly scheduleRepository: IScheduleActivityRepository,
    private readonly eventRepository: IContractorDelayEventRepository,
    private readonly extractor: IDelayEventExtractor,
    private readonly matcher: IActivityMatcher
  ) {}

  async execute(command: RunAnalysisCommand): Promise<RunAnalysisResult> {
    const project = await this.projectRepository.findById(command.projectId, command.tenantId);
    if (!project) {
      throw new Error(`Project ${command.projectId} not found`);
    }

    const result: RunAnalysisResult = {
      eventsExtracted: 0,
      eventsMatched: 0,
      documentsProcessed: 0,
      errors: [],
    };

    const shouldExtract = command.extractFromDocuments !== false;
    const shouldMatch = command.matchToActivities !== false;

    if (shouldExtract) {
      const documents = await this.documentRepository.findByProjectId(
        command.projectId,
        command.tenantId
      );

      const fieldReports = documents.filter(doc => 
        doc.status === 'completed' && 
        (doc.documentType === 'idr' || doc.documentType === 'ncr' || doc.documentType === 'field_memo') &&
        doc.rawContent
      );

      for (const doc of fieldReports) {
        try {
          const extractionResult = await this.extractor.extractDelayEvents(
            doc.rawContent!,
            doc.filename,
            doc.id
          );

          for (const extracted of extractionResult.events) {
            const now = new Date();
            const event = new ContractorDelayEvent({
              id: randomUUID(),
              projectId: command.projectId,
              tenantId: command.tenantId,
              sourceDocumentId: doc.id,
              matchedActivityId: null,
              wbs: null,
              cpmActivityId: null,
              cpmActivityDescription: null,
              eventDescription: extracted.eventDescription,
              eventCategory: extracted.eventCategory,
              eventStartDate: extracted.eventDate,
              eventFinishDate: null,
              impactDurationHours: extracted.impactDurationHours,
              sourceReference: extracted.sourceReference,
              extractedFromCode: extracted.extractedFromCode,
              matchConfidence: null,
              matchReasoning: null,
              verificationStatus: 'pending',
              verifiedBy: null,
              verifiedAt: null,
              metadata: null,
              createdAt: now,
              updatedAt: now,
            });

            await this.eventRepository.save(event);
            result.eventsExtracted++;
          }

          result.documentsProcessed++;
        } catch (error) {
          result.errors.push(`Failed to extract from ${doc.filename}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }

    if (shouldMatch) {
      const activities = await this.scheduleRepository.findByProjectId(
        command.projectId,
        command.tenantId
      );

      if (activities.length === 0) {
        result.errors.push('No schedule activities available for matching');
      } else {
        const unmatchedEvents = await this.eventRepository.findUnmatched(
          command.projectId,
          command.tenantId
        );

        for (const event of unmatchedEvents) {
          try {
            const matchResult = await this.matcher.matchEventToActivities(
              event.eventDescription,
              event.eventStartDate,
              activities
            );

            if (matchResult) {
              const matchedEvent = event.withActivityMatch(
                matchResult.matchedActivityId,
                matchResult.cpmActivityId,
                matchResult.cpmActivityDescription,
                matchResult.wbs,
                matchResult.confidence,
                matchResult.reasoning
              );

              await this.eventRepository.update(matchedEvent);
              result.eventsMatched++;
            }
          } catch (error) {
            result.errors.push(`Failed to match event ${event.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
      }
    }

    return result;
  }
}
