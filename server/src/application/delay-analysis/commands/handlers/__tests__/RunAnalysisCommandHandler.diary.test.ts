import { describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { RunAnalysisCommandHandler } from '../RunAnalysisCommandHandler';
import { DelayAnalysisProject } from '../../../../../domain/delay-analysis/entities/DelayAnalysisProject';
import { ProjectDocument } from '../../../../../domain/delay-analysis/entities/ProjectDocument';
import { ScheduleActivity } from '../../../../../domain/delay-analysis/entities/ScheduleActivity';
import { ContractorDelayEvent } from '../../../../../domain/delay-analysis/entities/ContractorDelayEvent';
import { DiaryReport } from '../../../../../domain/delay-analysis/entities/DiaryReport';
import type { IDelayAnalysisProjectRepository } from '../../../../../domain/delay-analysis/repositories/IDelayAnalysisProjectRepository';
import type { IProjectDocumentRepository } from '../../../../../domain/delay-analysis/repositories/IProjectDocumentRepository';
import type { IScheduleActivityRepository } from '../../../../../domain/delay-analysis/repositories/IScheduleActivityRepository';
import type { IContractorDelayEventRepository } from '../../../../../domain/delay-analysis/repositories/IContractorDelayEventRepository';
import type { IDelayEventExtractor, ExtractionResult } from '../../../../../domain/delay-analysis/interfaces/IDelayEventExtractor';
import type { IActivityMatcher, MatchResult } from '../../../../../domain/delay-analysis/interfaces/IActivityMatcher';
import type { IDelayEventDeduplicationService, ExtractedEventWithSource, DeduplicatedEvent } from '../../../../../domain/delay-analysis/interfaces/IDelayEventDeduplicationService';
import type { IDiaryEvidenceProvider } from '../../../../../domain/delay-analysis/interfaces/IDiaryEvidenceProvider';

const PROJECT_ID = 'proj-1';
const TENANT_ID = 'tenant-1';
const REPORT_DATE = new Date('2021-09-23');

function makeProject(): DelayAnalysisProject {
  return new DelayAnalysisProject({
    id: PROJECT_ID,
    tenantId: TENANT_ID,
    name: 'Test Project',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function makeDocument(): ProjectDocument {
  return new ProjectDocument({
    id: 'doc-1',
    projectId: PROJECT_ID,
    tenantId: TENANT_ID,
    filename: 'idr-1.pdf',
    contentType: 'application/pdf',
    documentType: 'idr',
    rawContent: 'IDR content',
    reportDate: REPORT_DATE,
    status: 'completed',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function makeActivity(id: string, description: string): ScheduleActivity {
  return new ScheduleActivity({
    id: randomUUID(),
    projectId: PROJECT_ID,
    tenantId: TENANT_ID,
    activityId: id,
    activityDescription: description,
    isCriticalPath: 'No',
    createdAt: new Date(),
  });
}

function makeDiaryReport(sourceDocumentId = 'diary-doc-1', pageNumber: number | null = 12, pageRangeEnd: number | null = null): DiaryReport {
  return new DiaryReport({
    id: randomUUID(),
    sourceDocumentId,
    projectId: PROJECT_ID,
    tenantId: TENANT_ID,
    reportDate: REPORT_DATE,
    sequence: 0,
    extractionMethod: 'deterministic',
    entries: [
      { sequence: 0, authorName: 'J. Smith (jsmith)', weather: 'Clear, 72F', noteText: 'Crew waited on utility locates until noon.', pageNumber, pageRangeEnd },
    ],
  });
}

function makeFakes(options: { diaryEvidenceProvider?: IDiaryEvidenceProvider } = {}) {
  const projectRepository: IDelayAnalysisProjectRepository = {
    findById: vi.fn().mockResolvedValue(makeProject()),
    findAll: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };

  const document = makeDocument();
  const documentRepository: IProjectDocumentRepository = {
    findById: vi.fn().mockResolvedValue(document),
    findByProjectId: vi.fn().mockResolvedValue([document]),
    findByProjectIdAndType: vi.fn().mockResolvedValue([]),
    findByStatus: vi.fn().mockResolvedValue([]),
    findByContentHash: vi.fn(),
    findExistingContentHashes: vi.fn().mockResolvedValue([]),
    save: vi.fn(),
    saveBatch: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteByProjectId: vi.fn(),
    countByProjectId: vi.fn(),
    findByFilenamePattern: vi.fn().mockResolvedValue([]),
    setFileData: vi.fn(),
    getFileData: vi.fn(),
    clearFileData: vi.fn(),
    findAllStuckProcessing: vi.fn().mockResolvedValue([]),
    incrementProcessingAttempts: vi.fn(),
  };

  const activity = makeActivity('A100', 'Excavation for utility conflict');
  const activities = [activity];
  const scheduleRepository: IScheduleActivityRepository = {
    findById: vi.fn(),
    findByIds: vi.fn(),
    findByProjectId: vi.fn().mockResolvedValue(activities),
    findByActivityId: vi.fn(),
    findActiveOnDate: vi.fn().mockResolvedValue(activities),
    save: vi.fn(),
    saveBatch: vi.fn(),
    deleteByProjectId: vi.fn(),
    deleteByDocumentId: vi.fn(),
  };

  const savedEvents: ContractorDelayEvent[] = [];
  const updatedEvents: ContractorDelayEvent[] = [];
  const eventRepository: IContractorDelayEventRepository = {
    findById: vi.fn(),
    findByProjectId: vi.fn().mockImplementation(async () => savedEvents),
    findByDocumentId: vi.fn().mockImplementation(async () => savedEvents),
    findByVerificationStatus: vi.fn(),
    findUnmatched: vi.fn().mockImplementation(async () => savedEvents.filter(e => !e.matchedActivityId)),
    save: vi.fn().mockImplementation(async (event: ContractorDelayEvent) => {
      savedEvents.push(event);
    }),
    saveBatch: vi.fn().mockImplementation(async (events: ContractorDelayEvent[]) => {
      savedEvents.push(...events);
    }),
    update: vi.fn().mockImplementation(async (event: ContractorDelayEvent) => {
      updatedEvents.push(event);
      const index = savedEvents.findIndex(e => e.id === event.id);
      if (index >= 0) savedEvents[index] = event;
    }),
    delete: vi.fn(),
    deleteByDocumentId: vi.fn(),
    deleteByProjectId: vi.fn(),
  };

  const extractionResult: ExtractionResult = {
    events: [
      {
        eventDescription: 'Excavation delayed pending utility locates',
        eventCategory: 'utility_infrastructure',
        eventDate: REPORT_DATE,
        impactDurationHours: 3,
        sourceReference: 'IDR page 1',
        extractedFromCode: 'idr',
      },
    ],
    documentId: 'doc-1',
    totalEventsFound: 1,
  };
  const extractor: IDelayEventExtractor = {
    extractDelayEvents: vi.fn().mockResolvedValue(extractionResult),
  };

  const matcher: IActivityMatcher = {
    matchEventToActivities: vi.fn().mockImplementation(async (_desc, _date, candidateActivities: ScheduleActivity[]): Promise<MatchResult> => {
      const chosen = candidateActivities[0];
      return {
        matchedActivityId: chosen.id,
        cpmActivityId: chosen.activityId,
        cpmActivityDescription: chosen.activityDescription,
        wbs: chosen.wbs,
        confidence: 70,
        reasoning: 'Matched by description similarity',
      };
    }),
    matchBatch: vi.fn(),
  };

  const deduplicationService: IDelayEventDeduplicationService = {
    deduplicateWithSources: vi.fn().mockImplementation((events: ExtractedEventWithSource[]): DeduplicatedEvent[] =>
      events.map(e => ({ event: e.event, sourceDocumentIds: [e.sourceDocumentId], primarySourceDocumentId: e.sourceDocumentId }))
    ),
  };

  const handler = new RunAnalysisCommandHandler(
    projectRepository,
    documentRepository,
    scheduleRepository,
    eventRepository,
    extractor,
    matcher,
    deduplicationService,
    undefined,
    undefined,
    undefined,
    undefined,
    options.diaryEvidenceProvider
  );

  return { handler, extractor, updatedEvents };
}

describe('RunAnalysisCommandHandler diary-aware extraction context', () => {
  it('passes rendered diary notes as extraction context when a diary report exists for the date', async () => {
    const diaryEvidenceProvider: IDiaryEvidenceProvider = {
      getEvidenceForDateRange: vi.fn().mockResolvedValue(new Map([['2021-09-23', [makeDiaryReport()]]])),
    };
    const { handler, extractor, updatedEvents } = makeFakes({ diaryEvidenceProvider });

    const result = await handler.execute({
      type: 'RunAnalysisCommand',
      projectId: PROJECT_ID,
      tenantId: TENANT_ID,
    } as any);

    expect(result.eventsMatched).toBe(1);
    expect(diaryEvidenceProvider.getEvidenceForDateRange).toHaveBeenCalled();
    expect(extractor.extractDelayEvents).toHaveBeenCalled();
    const callArgs = (extractor.extractDelayEvents as any).mock.calls[0];
    const passedOptions = callArgs[3];
    expect(passedOptions.diaryContext).toBeDefined();
    expect(passedOptions.diaryContext).toContain('J. Smith (jsmith)');
    expect(passedOptions.diaryContext).toContain('Crew waited on utility locates until noon.');
    expect(updatedEvents).toHaveLength(1);
  });

  it('completes analysis unchanged (diaryContext undefined) when no diary covers the date', async () => {
    const diaryEvidenceProvider: IDiaryEvidenceProvider = {
      getEvidenceForDateRange: vi.fn().mockResolvedValue(new Map()),
    };
    const { handler, extractor } = makeFakes({ diaryEvidenceProvider });

    const result = await handler.execute({
      type: 'RunAnalysisCommand',
      projectId: PROJECT_ID,
      tenantId: TENANT_ID,
    } as any);

    expect(result.eventsMatched).toBe(1);
    const callArgs = (extractor.extractDelayEvents as any).mock.calls[0];
    const passedOptions = callArgs[3];
    expect(passedOptions.diaryContext).toBeUndefined();
  });

  it('completes analysis unchanged when there is no diaryEvidenceProvider wired at all', async () => {
    const { handler, extractor } = makeFakes({});

    const result = await handler.execute({
      type: 'RunAnalysisCommand',
      projectId: PROJECT_ID,
      tenantId: TENANT_ID,
    } as any);

    expect(result.eventsMatched).toBe(1);
    expect(result.errors).toHaveLength(0);
    const callArgs = (extractor.extractDelayEvents as any).mock.calls[0];
    const passedOptions = callArgs[3];
    expect(passedOptions.diaryContext).toBeUndefined();
  });

  it('records diary audit metadata on the event when a single diary report exists for the date', async () => {
    const diaryEvidenceProvider: IDiaryEvidenceProvider = {
      getEvidenceForDateRange: vi.fn().mockResolvedValue(new Map([['2021-09-23', [makeDiaryReport('diary-doc-1')]]])),
    };
    const { handler, updatedEvents } = makeFakes({ diaryEvidenceProvider });

    await handler.execute({
      type: 'RunAnalysisCommand',
      projectId: PROJECT_ID,
      tenantId: TENANT_ID,
    } as any);

    expect(updatedEvents).toHaveLength(1);
    // Diaries have no matcher step, so this creation-time attribution (unlike POD's
    // podCorroborated) is never overwritten by a later match-time patch.
    // The diary note ("...utility locates...") shares a keyword with the extracted event
    // description ("...utility locates..."), so the specific corroboration sentence (naming
    // the author and quoting the note) wins over the generic "notes were available" fallback.
    expect(updatedEvents[0].metadata).toMatchObject({
      diaryEvidenceAvailable: true,
      diaryReportCount: 1,
      diarySourceDocumentId: 'diary-doc-1',
      diaryUsageNote: 'Diary corroboration: J. Smith (jsmith) noted "Crew waited on utility locates until noon.", overlapping this event\'s description ("utility").',
      diaryPageReference: 'p. 12',
    });
  });

  it('records a page range reference when a diary entry spans a page break', async () => {
    const diaryEvidenceProvider: IDiaryEvidenceProvider = {
      getEvidenceForDateRange: vi.fn().mockResolvedValue(
        new Map([['2021-09-23', [makeDiaryReport('diary-doc-1', 12, 13)]]])
      ),
    };
    const { handler, updatedEvents } = makeFakes({ diaryEvidenceProvider });

    await handler.execute({
      type: 'RunAnalysisCommand',
      projectId: PROJECT_ID,
      tenantId: TENANT_ID,
    } as any);

    expect(updatedEvents[0].metadata).toMatchObject({
      diaryPageReference: 'pp. 12\u201313',
    });
  });

  it('leaves diaryPageReference null when the diary entry has no page attribution (AI fallback)', async () => {
    const diaryEvidenceProvider: IDiaryEvidenceProvider = {
      getEvidenceForDateRange: vi.fn().mockResolvedValue(
        new Map([['2021-09-23', [makeDiaryReport('diary-doc-1', null, null)]]])
      ),
    };
    const { handler, updatedEvents } = makeFakes({ diaryEvidenceProvider });

    await handler.execute({
      type: 'RunAnalysisCommand',
      projectId: PROJECT_ID,
      tenantId: TENANT_ID,
    } as any);

    expect(updatedEvents[0].metadata).toMatchObject({
      diaryPageReference: null,
    });
  });

  it('does not attribute a single diary document when multiple reports exist for the date', async () => {
    const diaryEvidenceProvider: IDiaryEvidenceProvider = {
      getEvidenceForDateRange: vi.fn().mockResolvedValue(
        new Map([['2021-09-23', [makeDiaryReport('diary-doc-1'), makeDiaryReport('diary-doc-2')]]])
      ),
    };
    const { handler, updatedEvents } = makeFakes({ diaryEvidenceProvider });

    await handler.execute({
      type: 'RunAnalysisCommand',
      projectId: PROJECT_ID,
      tenantId: TENANT_ID,
    } as any);

    expect(updatedEvents).toHaveLength(1);
    // Corroboration is keyword-overlap against the event description, not tied to how many
    // source documents contributed evidence, so it still fires here even though
    // diarySourceDocumentId stays null (ambiguous across the two reports).
    expect(updatedEvents[0].metadata).toMatchObject({
      diaryEvidenceAvailable: true,
      diaryReportCount: 2,
      diarySourceDocumentId: null,
      diaryUsageNote: 'Diary corroboration: J. Smith (jsmith) noted "Crew waited on utility locates until noon.", overlapping this event\'s description ("utility").',
    });
  });

  it('records diaryEvidenceAvailable false when no diary covers the date', async () => {
    const diaryEvidenceProvider: IDiaryEvidenceProvider = {
      getEvidenceForDateRange: vi.fn().mockResolvedValue(new Map()),
    };
    const { handler, updatedEvents } = makeFakes({ diaryEvidenceProvider });

    await handler.execute({
      type: 'RunAnalysisCommand',
      projectId: PROJECT_ID,
      tenantId: TENANT_ID,
    } as any);

    expect(updatedEvents).toHaveLength(1);
    expect(updatedEvents[0].metadata).toMatchObject({
      diaryEvidenceAvailable: false,
      diaryReportCount: 0,
      diarySourceDocumentId: null,
      diaryUsageNote: null,
    });
  });

  it('degrades gracefully (still completes) when the diary evidence provider throws', async () => {
    const diaryEvidenceProvider: IDiaryEvidenceProvider = {
      getEvidenceForDateRange: vi.fn().mockRejectedValue(new Error('DB unavailable')),
    };
    const { handler, updatedEvents } = makeFakes({ diaryEvidenceProvider });

    const result = await handler.execute({
      type: 'RunAnalysisCommand',
      projectId: PROJECT_ID,
      tenantId: TENANT_ID,
    } as any);

    expect(result.eventsMatched).toBe(1);
    expect(updatedEvents).toHaveLength(1);
  });
});
