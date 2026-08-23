import { describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { RunAnalysisCommandHandler } from '../RunAnalysisCommandHandler';
import { DelayAnalysisProject } from '../../../../../domain/delay-analysis/entities/DelayAnalysisProject';
import { ProjectDocument } from '../../../../../domain/delay-analysis/entities/ProjectDocument';
import { ScheduleActivity } from '../../../../../domain/delay-analysis/entities/ScheduleActivity';
import { ContractorDelayEvent } from '../../../../../domain/delay-analysis/entities/ContractorDelayEvent';
import type { IDelayAnalysisProjectRepository } from '../../../../../domain/delay-analysis/repositories/IDelayAnalysisProjectRepository';
import type { IProjectDocumentRepository } from '../../../../../domain/delay-analysis/repositories/IProjectDocumentRepository';
import type { IScheduleActivityRepository } from '../../../../../domain/delay-analysis/repositories/IScheduleActivityRepository';
import type { IContractorDelayEventRepository } from '../../../../../domain/delay-analysis/repositories/IContractorDelayEventRepository';
import type { IDelayEventExtractor, ExtractionResult } from '../../../../../domain/delay-analysis/interfaces/IDelayEventExtractor';
import type { IActivityMatcher, MatchResult } from '../../../../../domain/delay-analysis/interfaces/IActivityMatcher';
import type { IDelayEventDeduplicationService, ExtractedEventWithSource, DeduplicatedEvent } from '../../../../../domain/delay-analysis/interfaces/IDelayEventDeduplicationService';

const PROJECT_ID = 'proj-1';
const TENANT_ID = 'tenant-1';
const DOC_ID = 'doc-1';

/**
 * Regression coverage for the period-scoped rerun retention guarantee: rerunning analysis for
 * one month/year must never delete or alter events belonging to a different month/year, even
 * when those events came from the very same source document that is being reprocessed.
 */
function makeEvent(overrides: Partial<ConstructorParameters<typeof ContractorDelayEvent>[0]> = {}): ContractorDelayEvent {
  return new ContractorDelayEvent({
    id: randomUUID(),
    projectId: PROJECT_ID,
    tenantId: TENANT_ID,
    sourceDocumentId: DOC_ID,
    matchedActivityId: null,
    wbs: null,
    cpmActivityId: null,
    cpmActivityDescription: null,
    eventDescription: 'Pre-existing event',
    eventCategory: null,
    eventStartDate: new Date('2024-03-15'),
    eventFinishDate: null,
    impactDurationHours: null,
    impactedWindowStart: null,
    impactedWindowEnd: null,
    durationBasis: null,
    sourceReference: null,
    extractedFromCode: null,
    matchConfidence: null,
    delayEventConfidence: null,
    matchReasoning: null,
    verificationStatus: 'pending',
    verifiedBy: null,
    verifiedAt: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

function makeFakes(
  seededEvents: ContractorDelayEvent[],
  options: { documentType?: 'idr' | 'ncr' | 'field_memo'; extractedEvents?: ExtractionResult['events'] } = {}
) {
  const projectRepository: IDelayAnalysisProjectRepository = {
    findById: vi.fn().mockResolvedValue(new DelayAnalysisProject({
      id: PROJECT_ID,
      tenantId: TENANT_ID,
      name: 'Test Project',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    findAll: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };

  const documentType = options.documentType ?? 'idr';
  const document = new ProjectDocument({
    id: DOC_ID,
    projectId: PROJECT_ID,
    tenantId: TENANT_ID,
    filename: documentType === 'field_memo' ? 'field-memo.pdf' : 'idr-june.pdf',
    contentType: 'application/pdf',
    documentType,
    rawContent: 'Document content',
    reportDate: new Date('2024-06-10'),
    status: 'completed',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
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

  const activity = new ScheduleActivity({
    id: randomUUID(),
    projectId: PROJECT_ID,
    tenantId: TENANT_ID,
    activityId: 'A100',
    activityDescription: 'Some activity',
    isCriticalPath: 'No',
    createdAt: new Date(),
  });
  const scheduleRepository: IScheduleActivityRepository = {
    findById: vi.fn(),
    findByIds: vi.fn(),
    findByProjectId: vi.fn().mockResolvedValue([activity]),
    findByActivityId: vi.fn(),
    findActiveOnDate: vi.fn().mockResolvedValue([activity]),
    save: vi.fn(),
    saveBatch: vi.fn(),
    deleteByProjectId: vi.fn(),
    deleteByDocumentId: vi.fn(),
  };

  // A tiny in-memory store used to catch a regression where a "period-scoped" rerun
  // accidentally touches another period's (or another document's) events, or deletes anything
  // before its replacement has actually been saved.
  let store: ContractorDelayEvent[] = [...seededEvents];
  const deleteByIdCalls: string[] = [];
  const deleteByDocumentIdCalls: string[] = [];
  // Snapshot of ids present in the store at the moment each `delete(id, ...)` call is made, so
  // tests can assert that every deleted id was already saved before this run started — i.e. the
  // deletion pass never targets an event this same run just inserted.
  const storeIdsAtEachDelete: Set<string>[] = [];

  const eventRepository: IContractorDelayEventRepository = {
    findById: vi.fn(),
    findByProjectId: vi.fn().mockImplementation(async () => store),
    findByDocumentId: vi.fn().mockImplementation(async (documentId: string) => store.filter(e => e.sourceDocumentId === documentId)),
    findByVerificationStatus: vi.fn(),
    findUnmatched: vi.fn().mockImplementation(async () => store.filter(e => !e.matchedActivityId)),
    save: vi.fn().mockImplementation(async (event: ContractorDelayEvent) => {
      store.push(event);
    }),
    saveBatch: vi.fn().mockImplementation(async (events: ContractorDelayEvent[]) => {
      store.push(...events);
    }),
    update: vi.fn().mockImplementation(async (event: ContractorDelayEvent) => {
      const index = store.findIndex(e => e.id === event.id);
      if (index >= 0) store[index] = event;
    }),
    delete: vi.fn().mockImplementation(async (id: string) => {
      deleteByIdCalls.push(id);
      storeIdsAtEachDelete.push(new Set(store.map(e => e.id)));
      store = store.filter(e => e.id !== id);
    }),
    deleteByDocumentId: vi.fn().mockImplementation(async (documentId: string) => {
      deleteByDocumentIdCalls.push(documentId);
      store = store.filter(e => e.sourceDocumentId !== documentId);
    }),
    deleteByProjectId: vi.fn(),
  };

  const defaultEvents: ExtractionResult['events'] = [
    {
      eventDescription: 'New June delay event',
      eventCategory: 'utility_infrastructure',
      eventDate: new Date('2024-06-10'),
      impactDurationHours: 3,
      sourceReference: 'IDR page 1',
      extractedFromCode: 'idr',
    },
  ];
  const extractionResult: ExtractionResult = {
    events: options.extractedEvents ?? defaultEvents,
    documentId: DOC_ID,
    totalEventsFound: (options.extractedEvents ?? defaultEvents).length,
  };
  const extractor: IDelayEventExtractor = {
    extractDelayEvents: vi.fn().mockResolvedValue(extractionResult),
  };

  const matcher: IActivityMatcher = {
    matchEventToActivities: vi.fn().mockImplementation(async (): Promise<MatchResult> => ({
      matchedActivityId: activity.id,
      cpmActivityId: activity.activityId,
      cpmActivityDescription: activity.activityDescription,
      wbs: activity.wbs,
      confidence: 70,
      reasoning: 'Matched by description similarity only',
      podCorroborated: false,
    })),
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
    deduplicationService
  );

  return {
    handler,
    getStore: () => store,
    extractor,
    deleteByIdCalls,
    deleteByDocumentIdCalls,
    storeIdsAtEachDelete,
  };
}

describe('RunAnalysisCommandHandler period-scoped rerun retention', () => {
  it('rerunning one period never deletes or touches the same document\'s events from another period', async () => {
    const marchEvent = makeEvent({ id: 'event-march', eventStartDate: new Date('2024-03-15'), eventDescription: 'March event, must survive' });
    const juneEvent = makeEvent({ id: 'event-june-old', eventStartDate: new Date('2024-06-05'), eventDescription: 'Stale June event, should be replaced' });

    const { handler, getStore, deleteByDocumentIdCalls, deleteByIdCalls } =
      makeFakes([marchEvent, juneEvent]);

    const result = await handler.execute({
      type: 'RunAnalysisCommand',
      projectId: PROJECT_ID,
      tenantId: TENANT_ID,
      extractFromDocuments: true,
      matchToActivities: true,
      filterMonth: 6,
      filterYear: 2024,
    } as any);

    expect(result.errors).toHaveLength(0);

    // The unscoped, document-wide clear must never fire for a period-scoped run: it would wipe
    // this document's events from every period, not just the one being rerun.
    expect(deleteByDocumentIdCalls).toHaveLength(0);

    // Only the stale June event (this document's event in the target period) was deleted by id
    // — never the March event from another period, and never anything the run just inserted.
    expect(deleteByIdCalls).toEqual(['event-june-old']);

    const finalStore = getStore();
    const newJuneEvent = finalStore.find(e => e.eventDescription === 'New June delay event');
    // The id deleted was captured before the new June event existed, so it can never be the
    // newly-inserted event's own id.
    expect(deleteByIdCalls).not.toContain(newJuneEvent?.id);
    const march = finalStore.find(e => e.id === 'event-march');
    const staleJune = finalStore.find(e => e.id === 'event-june-old');
    const newJune = finalStore.find(e => e.eventDescription === 'New June delay event');

    // The other period's event survives untouched...
    expect(march).toBeDefined();
    // ...while the stale June event from the same document is gone and replaced by the new one.
    expect(staleJune).toBeUndefined();
    expect(newJune).toBeDefined();
  });

  it('a failed extraction leaves the targeted period\'s prior results untouched instead of silently deleting them', async () => {
    const marchEvent = makeEvent({ id: 'event-march', eventStartDate: new Date('2024-03-15'), eventDescription: 'March event, must survive' });
    const juneEvent = makeEvent({ id: 'event-june-old', eventStartDate: new Date('2024-06-05'), eventDescription: 'Existing June event, must survive a failed rerun' });

    const { handler, getStore, extractor, deleteByDocumentIdCalls, deleteByIdCalls } =
      makeFakes([marchEvent, juneEvent]);

    // Simulate a transient extraction failure (e.g. AI/API error) for the only document in
    // the target period.
    (extractor.extractDelayEvents as any).mockRejectedValueOnce(new Error('Transient AI provider error'));

    const result = await handler.execute({
      type: 'RunAnalysisCommand',
      projectId: PROJECT_ID,
      tenantId: TENANT_ID,
      extractFromDocuments: true,
      matchToActivities: true,
      filterMonth: 6,
      filterYear: 2024,
    } as any);

    expect(result.errors.length).toBeGreaterThan(0);

    // No document succeeded, so nothing should have been cleared at all — deleting would
    // permanently lose the period's prior results with no new data to replace them.
    expect(deleteByDocumentIdCalls).toHaveLength(0);
    expect(deleteByIdCalls).toHaveLength(0);

    const finalStore = getStore();
    expect(finalStore.find(e => e.id === 'event-march')).toBeDefined();
    expect(finalStore.find(e => e.id === 'event-june-old')).toBeDefined();
  });

  it('a save failure after extraction leaves the targeted period\'s prior results untouched (deletion never precedes a successful replacement)', async () => {
    const marchEvent = makeEvent({ id: 'event-march', eventStartDate: new Date('2024-03-15'), eventDescription: 'March event, must survive' });
    const juneEvent = makeEvent({ id: 'event-june-old', eventStartDate: new Date('2024-06-05'), eventDescription: 'Existing June event, must survive a failed save' });

    const { handler, getStore, deleteByDocumentIdCalls, deleteByIdCalls } = makeFakes([marchEvent, juneEvent]);

    // Force the repository's save() to throw, simulating a DB error while persisting the
    // extracted replacement events, after extraction itself succeeded.
    const handlerAny = handler as any;
    const originalSave = handlerAny.eventRepository.save;
    handlerAny.eventRepository.save = vi.fn().mockRejectedValue(new Error('Simulated DB failure during save'));

    await expect(handler.execute({
      type: 'RunAnalysisCommand',
      projectId: PROJECT_ID,
      tenantId: TENANT_ID,
      extractFromDocuments: true,
      matchToActivities: true,
      filterMonth: 6,
      filterYear: 2024,
    } as any)).rejects.toThrow();

    handlerAny.eventRepository.save = originalSave;

    // The deletion pass runs only after every new event is saved successfully; since save()
    // threw, no deletion of any kind should have happened, so the prior June event (and the
    // March event from another period) both survive intact.
    expect(deleteByDocumentIdCalls).toHaveLength(0);
    expect(deleteByIdCalls).toHaveLength(0);

    const finalStore = getStore();
    expect(finalStore.find(e => e.id === 'event-march')).toBeDefined();
    expect(finalStore.find(e => e.id === 'event-june-old')).toBeDefined();
  });

  it('does not persist a duplicate when a reprocessed field memo re-extracts an event dated outside the target period', async () => {
    // Field memo/NCR documents are always reprocessed on every period-scoped run regardless of
    // their own date, and their extraction can legitimately surface events for other periods.
    // An earlier run already saved that out-of-period event; this rerun (for June) must not
    // persist a second copy of it just because the memo was re-extracted.
    const existingMarchEvent = makeEvent({
      id: 'event-march-existing',
      eventStartDate: new Date('2024-03-15'),
      eventDescription: 'March delay noted in field memo',
    });

    const { handler, getStore, deleteByIdCalls } = makeFakes([existingMarchEvent], {
      documentType: 'field_memo',
      extractedEvents: [
        {
          eventDescription: 'March delay noted in field memo',
          eventCategory: 'utility_infrastructure',
          eventDate: new Date('2024-03-15'),
          impactDurationHours: 2,
          sourceReference: 'Field memo, March entry',
          extractedFromCode: 'field_memo',
        },
        {
          eventDescription: 'June delay noted in field memo',
          eventCategory: 'utility_infrastructure',
          eventDate: new Date('2024-06-10'),
          impactDurationHours: 3,
          sourceReference: 'Field memo, June entry',
          extractedFromCode: 'field_memo',
        },
      ],
    });

    const result = await handler.execute({
      type: 'RunAnalysisCommand',
      projectId: PROJECT_ID,
      tenantId: TENANT_ID,
      extractFromDocuments: true,
      matchToActivities: true,
      filterMonth: 6,
      filterYear: 2024,
    } as any);

    expect(result.errors).toHaveLength(0);
    // Nothing was deleted: the existing March event isn't in the target period (June), so it's
    // never a deletion candidate — it must simply survive, untouched, exactly as before.
    expect(deleteByIdCalls).toHaveLength(0);

    const finalStore = getStore();
    const marchEvents = finalStore.filter(e => e.eventDescription === 'March delay noted in field memo');
    const juneEvents = finalStore.filter(e => e.eventDescription === 'June delay noted in field memo');

    // Exactly one March event survives (the original) — the re-extracted March duplicate from
    // this June-scoped rerun must have been dropped rather than saved.
    expect(marchEvents).toHaveLength(1);
    expect(marchEvents[0].id).toBe('event-march-existing');
    // The June-dated event from the same memo is saved as part of this June rerun.
    expect(juneEvents).toHaveLength(1);
  });
});
