/**
 * Task #57 — one-off diagnostic to confirm the IDR prompt cleanup (duplicate rule removal,
 * emphasis-marker trimming, content-aware knowledge-base injection) didn't shift which delay
 * events get found or how their durations are classified.
 *
 * This script is READ-ONLY against the database and makes NO persistence calls: it re-runs
 * the real IDR extraction (same wiring as bootstrap.ts: AIDelayEventExtractorWithTools +
 * ToolExtractionSystemPromptStrategyFactory + live Azure OpenAI deployment) for a chosen
 * project/month's IDR documents, holds the extracted events in memory, and diffs the
 * resulting event count + duration_basis distribution against the existing
 * contractor_delay_events rows already in the database for that project/month (the
 * pre-cleanup baseline, since those rows have not been touched by this script).
 *
 * Usage:
 *   tsx scripts/task57-verify-prompt-cleanup.ts <projectId> <month> <year>
 *   e.g. tsx scripts/task57-verify-prompt-cleanup.ts 8449935b-6f09-48dc-9277-7f3c44ad63d2 11 2021
 */
import { db, closeDatabasePool } from '../server/src/infrastructure/database';
import { delayAnalysisProjects, contractorDelayEvents } from '@shared/schema';
import { and, eq, gte, lt } from 'drizzle-orm';
import { DrizzleProjectDocumentRepository } from '../server/src/infrastructure/database/repositories/delay-analysis/DrizzleProjectDocumentRepository';
import { DrizzleScheduleActivityRepository } from '../server/src/infrastructure/database/repositories/delay-analysis/DrizzleScheduleActivityRepository';
import { DrizzlePodEvidenceRepository } from '../server/src/infrastructure/database/repositories/delay-analysis/DrizzlePodEvidenceRepository';
import { DrizzleDiaryEvidenceRepository } from '../server/src/infrastructure/database/repositories/delay-analysis/DrizzleDiaryEvidenceRepository';
import { FieldMemoContextSummarizer } from '../server/src/infrastructure/delay-analysis/FieldMemoContextSummarizer';
import { toPodEvidenceDateKey } from '../server/src/domain/delay-analysis/interfaces/IPodEvidenceProvider';
import { toDiaryEvidenceDateKey } from '../server/src/domain/delay-analysis/interfaces/IDiaryEvidenceProvider';
import { renderPodDayContext } from '../server/src/infrastructure/delay-analysis/PodContextRenderer';
import { renderDiaryDayContext } from '../server/src/infrastructure/delay-analysis/DiaryContextRenderer';
import { GetActivitiesByIdsQueryHandler } from '../server/src/application/delay-analysis/queries/handlers/GetActivitiesByIdsQueryHandler';
import { GetScheduleActivitiesTool } from '../server/src/infrastructure/delay-analysis/tools/GetScheduleActivitiesTool';
import { ContractorDelayTrainingGuide } from '../server/src/domain/delay-analysis/config/ContractorDelayTrainingGuide';
import { DelayKnowledgePromptBuilder } from '../server/src/infrastructure/delay-analysis/DelayKnowledgePromptBuilder';
import { ToolExtractionSystemPromptStrategyFactory } from '../server/src/infrastructure/delay-analysis/tool-extraction-prompts/ToolExtractionSystemPromptStrategyFactory';
import { AIDelayEventExtractorWithTools } from '../server/src/infrastructure/delay-analysis/AIDelayEventExtractorWithTools';
import { getAzureOpenAISettings, createAzureOpenAIClient } from '../server/src/infrastructure/ai/AzureOpenAIConfig';
import { DelayEventDeduplicationService } from '../server/src/infrastructure/delay-analysis/DelayEventDeduplicationService';
import type { ExtractedEventWithSource } from '../server/src/domain/delay-analysis/interfaces/IDelayEventDeduplicationService';
import type { DurationBasis } from '../server/src/domain/delay-analysis/entities/ContractorDelayEvent';

async function main() {
  const [projectId, monthStr, yearStr] = process.argv.slice(2);
  if (!projectId || !monthStr || !yearStr) {
    console.error('Usage: tsx scripts/task57-verify-prompt-cleanup.ts <projectId> <month> <year>');
    process.exit(1);
  }
  const filterMonth = parseInt(monthStr, 10);
  const filterYear = parseInt(yearStr, 10);

  // --- Resolve tenant for the project (read-only) ---
  const projectRow = await db
    .select({ id: delayAnalysisProjects.id, tenantId: delayAnalysisProjects.tenantId, name: delayAnalysisProjects.name })
    .from(delayAnalysisProjects)
    .where(eq(delayAnalysisProjects.id, projectId))
    .limit(1);
  if (projectRow.length === 0) {
    console.error(`Project ${projectId} not found`);
    process.exit(1);
  }
  const tenantId = projectRow[0].tenantId;
  console.log(`Project: ${projectRow[0].name} (tenant=${tenantId})`);

  const azureSettings = getAzureOpenAISettings();
  if (!azureSettings) {
    console.error('Azure OpenAI is not configured (AZURE_OPENAI_ENDPOINT/API_KEY/DEPLOYMENT). Cannot run live extraction comparison.');
    process.exit(1);
  }

  // --- BASELINE: existing contractor_delay_events for this project/month (read-only) ---
  const monthStart = new Date(Date.UTC(filterYear, filterMonth - 1, 1));
  const monthEnd = new Date(Date.UTC(filterYear, filterMonth, 1));
  const baselineRows = await db
    .select({
      id: contractorDelayEvents.id,
      durationBasis: contractorDelayEvents.durationBasis,
      eventStartDate: contractorDelayEvents.eventStartDate,
      sourceDocumentId: contractorDelayEvents.sourceDocumentId,
    })
    .from(contractorDelayEvents)
    .where(and(
      eq(contractorDelayEvents.projectId, projectId),
      eq(contractorDelayEvents.tenantId, tenantId),
      gte(contractorDelayEvents.eventStartDate, monthStart),
      lt(contractorDelayEvents.eventStartDate, monthEnd),
    ));

  const baselineDist = tally(baselineRows.map(r => r.durationBasis));
  console.log(`\n=== BASELINE (existing DB rows for ${filterMonth}/${filterYear}) ===`);
  console.log(`Total events: ${baselineRows.length}`);
  console.log(baselineDist);

  // --- Fetch this month's completed IDR documents (read-only), same eligibility as
  //     RunAnalysisCommandHandler ---
  const documentRepository = new DrizzleProjectDocumentRepository();
  const allDocs = await documentRepository.findByProjectId(projectId, tenantId);
  const idrDocs = allDocs.filter(doc =>
    doc.status === 'completed' &&
    doc.documentType === 'idr' &&
    doc.rawContent &&
    doc.reportDate &&
    new Date(doc.reportDate).getUTCMonth() + 1 === filterMonth &&
    new Date(doc.reportDate).getUTCFullYear() === filterYear
  );
  console.log(`\nFound ${idrDocs.length} completed IDR documents for ${filterMonth}/${filterYear}`);
  if (idrDocs.length === 0) {
    console.log('Nothing to extract; exiting.');
    await closeDatabasePool();
    return;
  }

  // --- Build the exact same context providers/extractor bootstrap.ts wires in production ---
  const scheduleActivityRepository = new DrizzleScheduleActivityRepository();
  const getActivitiesByIdsHandler = new GetActivitiesByIdsQueryHandler(scheduleActivityRepository);
  const scheduleActivitiesTool = new GetScheduleActivitiesTool(getActivitiesByIdsHandler);

  const extractionKnowledgeBase = new ContractorDelayTrainingGuide();
  const extractionPromptBuilder = new DelayKnowledgePromptBuilder(extractionKnowledgeBase);
  const systemPromptStrategyFactory = new ToolExtractionSystemPromptStrategyFactory(extractionPromptBuilder);
  const azureClient = createAzureOpenAIClient(azureSettings);
  const extractor = new AIDelayEventExtractorWithTools(scheduleActivitiesTool, systemPromptStrategyFactory, azureClient);

  const aiClient = null; // FieldMemoContextSummarizer needs an IAIClient; skip field-memo context for this
                          // read-only comparison since it would require the full IAIClient wiring from
                          // AIClientFactory. Field memo context only feeds IDR documents as background,
                          // and task 53's changes are prompt-structure/KB-injection, not field-memo logic.
  let fieldMemoContext: string | null = null;

  const podEvidenceProvider = new DrizzlePodEvidenceRepository();
  const diaryEvidenceProvider = new DrizzleDiaryEvidenceRepository();
  const dates = idrDocs.map(d => d.reportDate!).filter(Boolean);
  const rangeStart = new Date(Math.min(...dates.map(d => d.getTime())));
  const rangeEnd = new Date(Math.max(...dates.map(d => d.getTime())));
  const podEvidenceByDate = await podEvidenceProvider.getEvidenceForDateRange(projectId, tenantId, rangeStart, rangeEnd);
  const diaryEvidenceByDate = await diaryEvidenceProvider.getEvidenceForDateRange(projectId, tenantId, rangeStart, rangeEnd);

  const allExtractedEvents: ExtractedEventWithSource[] = [];
  const errors: { doc: string; error: string }[] = [];

  for (const doc of idrDocs) {
    const podReports = podEvidenceByDate.get(toPodEvidenceDateKey(doc.reportDate!)) ?? [];
    const podContext = podReports.length > 0 ? (renderPodDayContext(podReports) ?? undefined) : undefined;
    const diaryReports = diaryEvidenceByDate.get(toDiaryEvidenceDateKey(doc.reportDate!)) ?? [];
    const diaryContext = diaryReports.length > 0 ? (renderDiaryDayContext(diaryReports) ?? undefined) : undefined;

    console.log(`\n--- Extracting: ${doc.filename} (${doc.reportDate?.toISOString().split('T')[0]}) ---`);
    try {
      const result = await extractor.extractDelayEvents(doc.rawContent!, doc.filename, doc.id, {
        documentType: 'idr',
        tenantId,
        projectId,
        enableToolBasedMatching: true,
        fieldMemoContext: fieldMemoContext ?? undefined,
        podContext,
        diaryContext,
      });
      console.log(`  -> ${result.events.length} events extracted`);
      for (const ev of result.events) {
        allExtractedEvents.push({ event: ev, sourceDocumentId: doc.id });
      }
    } catch (error) {
      console.error(`  -> ERROR: ${error instanceof Error ? error.message : error}`);
      errors.push({ doc: doc.filename, error: error instanceof Error ? error.message : String(error) });
    }
  }

  // Mirror RunAnalysisCommandHandler's post-extraction pipeline exactly: cross-document
  // deduplication (same delay mentioned in multiple IDRs collapses to one event), then the
  // period filter that drops any newly-extracted event whose own date falls outside the
  // target month/year. Comparing raw per-document extraction counts against already-deduped,
  // period-filtered baseline rows would overstate any behavior shift.
  const deduplicationService = new DelayEventDeduplicationService();
  let deduplicatedEvents = deduplicationService.deduplicateWithSources(allExtractedEvents);
  const duplicatesRemoved = allExtractedEvents.length - deduplicatedEvents.length;

  const beforePeriodFilterCount = deduplicatedEvents.length;
  deduplicatedEvents = deduplicatedEvents.filter(deduped => {
    if (!deduped.event.eventDate) return true;
    const d = new Date(deduped.event.eventDate);
    if (isNaN(d.getTime())) return true;
    return d.getMonth() + 1 === filterMonth && d.getFullYear() === filterYear;
  });
  const outOfPeriodDropped = beforePeriodFilterCount - deduplicatedEvents.length;

  const newDist = tally(deduplicatedEvents.map(e => e.event.durationBasis));
  console.log(`\n=== FRESH EXTRACTION (post-cleanup code, in-memory only, NOT persisted) ===`);
  console.log(`Documents processed: ${idrDocs.length - errors.length}/${idrDocs.length}`);
  console.log(`Raw events extracted (pre-dedup): ${allExtractedEvents.length}`);
  console.log(`Duplicates removed (same delay across documents): ${duplicatesRemoved}`);
  console.log(`Dropped as out-of-period (date outside ${filterMonth}/${filterYear}): ${outOfPeriodDropped}`);
  console.log(`Final unique in-period events: ${deduplicatedEvents.length}`);
  console.log(newDist);
  if (errors.length > 0) {
    console.log(`\nExtraction errors (${errors.length}):`);
    errors.forEach(e => console.log(`  - ${e.doc}: ${e.error}`));
  }

  console.log(`\n=== DIFF (baseline DB rows vs fresh deduped/period-filtered extraction) ===`);
  console.log(`Event count: baseline=${baselineRows.length} fresh=${deduplicatedEvents.length} delta=${deduplicatedEvents.length - baselineRows.length}`);
  const bases: DurationBasis[] = ['document_stated', 'timestamp_derived', 'bounded_by_next_entry', 'estimated'];
  for (const b of bases) {
    const before = baselineDist[b] ?? 0;
    const after = newDist[b] ?? 0;
    console.log(`  ${b}: baseline=${before} fresh=${after} delta=${after - before}`);
  }

  await closeDatabasePool();
}

function tally(values: (string | null | undefined)[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) {
    const key = v ?? 'null';
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

main().catch(async (error) => {
  console.error('Fatal error:', error);
  await closeDatabasePool();
  process.exit(1);
});
