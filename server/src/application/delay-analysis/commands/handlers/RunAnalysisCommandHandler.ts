import { randomUUID } from 'crypto';
import type { RunAnalysisCommand } from '../RunAnalysisCommand';
import type { IDelayAnalysisProjectRepository } from '../../../../domain/delay-analysis/repositories/IDelayAnalysisProjectRepository';
import type { IProjectDocumentRepository } from '../../../../domain/delay-analysis/repositories/IProjectDocumentRepository';
import type { IScheduleActivityRepository } from '../../../../domain/delay-analysis/repositories/IScheduleActivityRepository';
import type { IContractorDelayEventRepository } from '../../../../domain/delay-analysis/repositories/IContractorDelayEventRepository';
import type { IDelayEventExtractor } from '../../../../domain/delay-analysis/interfaces/IDelayEventExtractor';
import type { IActivityMatcher } from '../../../../domain/delay-analysis/interfaces/IActivityMatcher';
import type { IProgressReporter } from '../../../../domain/delay-analysis/interfaces/IProgressReporter';
import type { TokenUsageCallback } from '../../../../domain/delay-analysis/interfaces/ITokenUsageRecorder';
import { NoOpProgressReporter } from '../../../../domain/delay-analysis/interfaces/IProgressReporter';
import { ContractorDelayEvent } from '../../../../domain/delay-analysis/entities/ContractorDelayEvent';

export interface RunAnalysisResult {
  eventsExtracted: number;
  eventsMatched: number;
  documentsProcessed: number;
  errors: string[];
}

export interface RunAnalysisOptions {
  progressReporter?: IProgressReporter;
  onTokenUsage?: TokenUsageCallback;
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

  async execute(command: RunAnalysisCommand, options?: RunAnalysisOptions): Promise<RunAnalysisResult> {
    const progress = options?.progressReporter || new NoOpProgressReporter();

    progress.report({
      stage: 'loading_documents',
      message: 'Starting analysis...',
      percentage: 0,
    });

    const project = await this.projectRepository.findById(command.projectId, command.tenantId);
    if (!project) {
      progress.error(`Project ${command.projectId} not found`);
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
      progress.report({
        stage: 'loading_documents',
        message: 'Loading parsed documents...',
        percentage: 5,
      });

      const documents = await this.documentRepository.findByProjectId(
        command.projectId,
        command.tenantId
      );

      const fieldReports = documents.filter(doc => 
        doc.status === 'completed' && 
        (doc.documentType === 'idr' || doc.documentType === 'ncr' || doc.documentType === 'field_memo') &&
        doc.rawContent
      );

      if (fieldReports.length === 0) {
        progress.report({
          stage: 'loading_documents',
          message: 'No parsed documents found. Please upload and parse IDRs first.',
          percentage: 10,
        });
      } else {
        progress.report({
          stage: 'extracting_events',
          message: `Found ${fieldReports.length} documents to analyze`,
          percentage: 10,
          details: { total: fieldReports.length },
        });

        for (let i = 0; i < fieldReports.length; i++) {
          const doc = fieldReports[i];
          const docProgress = 10 + Math.floor((i / fieldReports.length) * 40);

          progress.report({
            stage: 'extracting_events',
            message: `Extracting delay events from ${doc.filename}...`,
            percentage: docProgress,
            details: { current: i + 1, total: fieldReports.length },
          });

          try {
            const extractionResult = await this.extractor.extractDelayEvents(
              doc.rawContent!,
              doc.filename,
              doc.id,
              { onTokenUsage: options?.onTokenUsage }
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

            if (extractionResult.events.length > 0) {
              progress.report({
                stage: 'extracting_events',
                message: `Found ${extractionResult.events.length} delay events in ${doc.filename}`,
                percentage: docProgress,
                details: { current: i + 1, total: fieldReports.length },
              });
            }
          } catch (error) {
            result.errors.push(`Failed to extract from ${doc.filename}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
      }
    }

    if (shouldMatch) {
      progress.report({
        stage: 'loading_activities',
        message: 'Loading schedule activities...',
        percentage: 50,
      });

      const activities = await this.scheduleRepository.findByProjectId(
        command.projectId,
        command.tenantId
      );

      if (activities.length === 0) {
        result.errors.push('No schedule activities available for matching');
        progress.report({
          stage: 'loading_activities',
          message: 'No schedule activities found. Please upload a schedule first.',
          percentage: 55,
        });
      } else {
        progress.report({
          stage: 'matching_events',
          message: `Loaded ${activities.length} schedule activities`,
          percentage: 55,
        });

        const unmatchedEvents = await this.eventRepository.findUnmatched(
          command.projectId,
          command.tenantId
        );

        if (unmatchedEvents.length === 0) {
          progress.report({
            stage: 'matching_events',
            message: 'No unmatched events to process',
            percentage: 90,
          });
        } else {
          progress.report({
            stage: 'matching_events',
            message: `Matching ${unmatchedEvents.length} events to schedule activities...`,
            percentage: 60,
            details: { total: unmatchedEvents.length },
          });

          for (let i = 0; i < unmatchedEvents.length; i++) {
            const event = unmatchedEvents[i];
            const matchProgress = 60 + Math.floor((i / unmatchedEvents.length) * 30);

            progress.report({
              stage: 'matching_events',
              message: `Matching event ${i + 1} of ${unmatchedEvents.length}...`,
              percentage: matchProgress,
              details: { current: i + 1, total: unmatchedEvents.length },
            });

            try {
              const matchResult = await this.matcher.matchEventToActivities(
                event.eventDescription,
                event.eventStartDate,
                activities,
                { onTokenUsage: options?.onTokenUsage }
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
    }

    progress.report({
      stage: 'saving_events',
      message: 'Finalizing results...',
      percentage: 95,
    });

    progress.complete(
      `Analysis complete: ${result.eventsExtracted} events extracted, ${result.eventsMatched} matched`,
      result
    );

    return result;
  }
}
