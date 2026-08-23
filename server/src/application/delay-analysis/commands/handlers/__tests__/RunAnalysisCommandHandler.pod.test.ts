import { describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { RunAnalysisCommandHandler } from '../RunAnalysisCommandHandler';
import { DelayAnalysisProject } from '../../../../../domain/delay-analysis/entities/DelayAnalysisProject';
import { ProjectDocument } from '../../../../../domain/delay-analysis/entities/ProjectDocument';
import { ScheduleActivity } from '../../../../../domain/delay-analysis/entities/ScheduleActivity';
import { ContractorDelayEvent } from '../../../../../domain/delay-analysis/entities/ContractorDelayEvent';
import { PodReport } from '../../../../../domain/delay-analysis/entities/PodReport';
import type { IDelayAnalysisProjectRepository } from '../../../../../domain/delay-analysis/repositories/IDelayAnalysisProjectRepository';
import type { IProjectDocumentRepository } from '../../../../../domain/delay-analysis/repositories/IProjectDocumentRepository';
import type { IScheduleActivityRepository } from '../../../../../domain/delay-analysis/repositories/IScheduleActivityRepository';
import type { IContractorDelayEventRepository } from '../../../../../domain/delay-analysis/repositories/IContractorDelayEventRepository';
import type { IDelayEventExtractor, ExtractionResult } from '../../../../../domain/delay-analysis/interfaces/IDelayEventExtractor';
import type { IActivityMatcher, MatchOptions, MatchResult } from '../../../../../domain/delay-analysis/interfaces/IActivityMatcher';
import type { IDelayEventDeduplicationService, ExtractedEventWithSource, DeduplicatedEvent } from '../../../../../domain/delay-analysis/interfaces/IDelayEventDeduplicationService';
import type { IPodEvidenceProvider } from '../../../../../domain/delay-analysis/interfaces/IPodEvidenceProvider';

const PROJECT_ID = 'proj-1';
const TENANT_ID = 'tenant-1';
const REPORT_DATE = new Date('2024-06-10');

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

function makePodReport(sourceDocumentId = 'pod-doc-1'): PodReport {
  return new PodReport({
    id: randomUUID(),
    sourceDocumentId,
    projectId: PROJECT_ID,
    tenantId: TENANT_ID,
    reportDate: REPORT_DATE,
    title: 'Play of the Day',
    sections: [
      {
        sequence: 1,
        crewNumber: '211',
        label: 'CIVIL #1',
        category: 'civil',
        trucking: null,
        traffic: null,
        notes: null,
        crewMembers: [],
        equipment: [],
        taskLines: [{ sequence: 1, description: 'Storm drain tie-in', costCode: '164.02' }],
      },
    ],
  });
}

/** Minimal fakes for the ports the handler depends on. */
function makeFakes(options: { podEvidenceProvider?: IPodEvidenceProvider } = {}) {
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

  const activityA = makeActivity('A100', 'Unrelated activity');
  const activityCorroborated = makeActivity('164.02', 'Storm drain tie-in work');
  const activities = [activityA, activityCorroborated];
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
        eventDescription: 'Storm drain work delayed due to utility conflict',
        eventCategory: 'utility_infrastructure',
        eventDate: REPORT_DATE,
        impactDurationHours: 4,
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

  // The matcher under test here IS the real ranking behavior's caller contract: given
  // podEvidence, prefer the POD-corroborated activity; without it, fall back to the first
  // candidate. This isolates handler orchestration (does it pass podEvidence through?) from
  // AIActivityMatcher's own prompt logic, which is covered separately.
  const matcher: IActivityMatcher = {
    matchEventToActivities: vi.fn().mockImplementation(async (_desc: string, _date: Date | null, candidateActivities: ScheduleActivity[], matchOptions?: MatchOptions): Promise<MatchResult | null> => {
      const hasPodEvidence = !!matchOptions?.podEvidence?.reports.length;
      const chosen = hasPodEvidence
        ? candidateActivities.find(a => a.activityId === '164.02') ?? candidateActivities[0]
        : candidateActivities[0];
      return {
        matchedActivityId: chosen.id,
        cpmActivityId: chosen.activityId,
        cpmActivityDescription: chosen.activityDescription,
        wbs: chosen.wbs,
        confidence: hasPodEvidence ? 92 : 60,
        reasoning: hasPodEvidence ? 'Corroborated by POD cost code 164.02' : 'Matched by description similarity only',
        podCorroborated: hasPodEvidence,
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
    options.podEvidenceProvider
  );

  return { handler, savedEvents: () => savedEvents, updatedEvents, extractor, matcher, activityCorroborated, activityA };
}

describe('RunAnalysisCommandHandler POD-aware matching', () => {
  it('selects the POD-corroborated activity and marks metadata when a POD report exists for the date', async () => {
    const podEvidenceProvider: IPodEvidenceProvider = {
      getEvidenceForDateRange: vi.fn().mockResolvedValue(new Map([['2024-06-10', [makePodReport()]]])),
    };
    const { handler, updatedEvents, matcher, activityCorroborated } = makeFakes({ podEvidenceProvider });

    const result = await handler.execute({
      type: 'RunAnalysisCommand',
      projectId: PROJECT_ID,
      tenantId: TENANT_ID,
    } as any);

    expect(result.eventsMatched).toBe(1);
    expect(matcher.matchEventToActivities).toHaveBeenCalled();
    const callArgs = (matcher.matchEventToActivities as any).mock.calls[0];
    const passedOptions: MatchOptions = callArgs[3];
    expect(passedOptions.podEvidence).toBeDefined();
    expect(passedOptions.podEvidence!.reports).toHaveLength(1);

    expect(updatedEvents).toHaveLength(1);
    expect(updatedEvents[0].matchedActivityId).toBe(activityCorroborated.id);
    // POD availability is recorded at extraction time and corroboration at match time, so a run's
    // POD influence is auditable from the event itself.
    expect(updatedEvents[0].metadata).toEqual({
      podEvidenceAvailable: true,
      podReportCount: 1,
      podCorroborated: true,
      podSourceDocumentId: 'pod-doc-1',
      podUsageNote: 'POD context was available for this date and supplied to extraction as crew/equipment context.',
    });
    expect(updatedEvents[0].matchReasoning).toContain('POD');
  });

  it('behaves exactly as before (no POD influence) when no POD report exists for the date', async () => {
    const podEvidenceProvider: IPodEvidenceProvider = {
      getEvidenceForDateRange: vi.fn().mockResolvedValue(new Map()),
    };
    const { handler, updatedEvents, matcher, activityA } = makeFakes({ podEvidenceProvider });

    const result = await handler.execute({
      type: 'RunAnalysisCommand',
      projectId: PROJECT_ID,
      tenantId: TENANT_ID,
    } as any);

    expect(result.eventsMatched).toBe(1);
    const callArgs = (matcher.matchEventToActivities as any).mock.calls[0];
    const passedOptions: MatchOptions = callArgs[3];
    expect(passedOptions.podEvidence).toBeUndefined();

    expect(updatedEvents).toHaveLength(1);
    expect(updatedEvents[0].matchedActivityId).toBe(activityA.id);
    // No POD data for the date: availability is recorded as false and nothing was corroborated.
    expect(updatedEvents[0].metadata).toEqual({
      podEvidenceAvailable: false,
      podReportCount: 0,
      podCorroborated: false,
      podSourceDocumentId: null,
      podUsageNote: null,
    });
  });

  it('completes analysis unchanged when there is no podEvidenceProvider wired at all', async () => {
    const { handler, updatedEvents, activityA } = makeFakes({});

    const result = await handler.execute({
      type: 'RunAnalysisCommand',
      projectId: PROJECT_ID,
      tenantId: TENANT_ID,
    } as any);

    expect(result.eventsMatched).toBe(1);
    expect(updatedEvents[0].matchedActivityId).toBe(activityA.id);
    expect(result.errors).toHaveLength(0);
  });

  it('does not attribute an arbitrary "first" POD document when multiple reports exist and the matcher found no specific corroborator', async () => {
    const podEvidenceProvider: IPodEvidenceProvider = {
      getEvidenceForDateRange: vi.fn().mockResolvedValue(
        new Map([['2024-06-10', [makePodReport('pod-doc-1'), makePodReport('pod-doc-2')]]])
      ),
    };
    const { handler, updatedEvents } = makeFakes({ podEvidenceProvider });

    await handler.execute({
      type: 'RunAnalysisCommand',
      projectId: PROJECT_ID,
      tenantId: TENANT_ID,
    } as any);

    expect(updatedEvents).toHaveLength(1);
    // Two reports exist for the date; the test's mock matcher marks the match as
    // podCorroborated but (like the pre-fix real matcher) does not report which of the two
    // supplied the evidence. In that ambiguous case, the event must not guess "the first" report
    // — it should stay null with a note explaining multiple reports were available.
    expect(updatedEvents[0].metadata).toMatchObject({
      podReportCount: 2,
      podSourceDocumentId: null,
      podUsageNote: '2 POD reports were available for this date and supplied to extraction as context; the specific corroborating report (if any) is determined at match time.',
    });
  });

  it('attributes the exact corroborating POD document when the matcher pinpoints it among multiple reports for the date', async () => {
    const podEvidenceProvider: IPodEvidenceProvider = {
      getEvidenceForDateRange: vi.fn().mockResolvedValue(
        new Map([['2024-06-10', [makePodReport('pod-doc-1'), makePodReport('pod-doc-2')]]])
      ),
    };
    const { handler, updatedEvents, matcher } = makeFakes({ podEvidenceProvider });
    // Override the default fake matcher to simulate AIActivityMatcher pinpointing exactly which
    // of the two same-date reports corroborated the match.
    (matcher.matchEventToActivities as any).mockImplementation(
      async (_desc: string, _date: Date | null, candidateActivities: ScheduleActivity[]): Promise<MatchResult> => {
        const chosen = candidateActivities.find(a => a.activityId === '164.02')!;
        return {
          matchedActivityId: chosen.id,
          cpmActivityId: chosen.activityId,
          cpmActivityDescription: chosen.activityDescription,
          wbs: chosen.wbs,
          confidence: 92,
          reasoning: 'Corroborated by POD cost code 164.02',
          podCorroborated: true,
          podUsageNote: 'POD corroboration: CIVIL #1 logged task "Storm drain tie-in" under cost code 164.02, matching this activity.',
          podSourceDocumentId: 'pod-doc-2',
        };
      }
    );

    await handler.execute({
      type: 'RunAnalysisCommand',
      projectId: PROJECT_ID,
      tenantId: TENANT_ID,
    } as any);

    expect(updatedEvents).toHaveLength(1);
    expect(updatedEvents[0].metadata).toMatchObject({
      podReportCount: 2,
      podCorroborated: true,
      podSourceDocumentId: 'pod-doc-2',
    });
  });

  it('degrades gracefully (still completes) when the POD evidence provider throws', async () => {
    const podEvidenceProvider: IPodEvidenceProvider = {
      getEvidenceForDateRange: vi.fn().mockRejectedValue(new Error('DB unavailable')),
    };
    const { handler, updatedEvents, activityA } = makeFakes({ podEvidenceProvider });

    const result = await handler.execute({
      type: 'RunAnalysisCommand',
      projectId: PROJECT_ID,
      tenantId: TENANT_ID,
    } as any);

    expect(result.eventsMatched).toBe(1);
    expect(updatedEvents[0].matchedActivityId).toBe(activityA.id);
  });
});
