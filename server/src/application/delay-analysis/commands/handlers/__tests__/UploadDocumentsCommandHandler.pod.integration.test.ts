import { describe, it, expect, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../../../../../infrastructure/database';
import { delayAnalysisProjects, podReports, podSections } from '@shared/schema';
import { UploadDocumentsCommandHandler } from '../UploadDocumentsCommandHandler';
import { UploadDocumentsCommand } from '../../UploadDocumentsCommand';
import { DrizzleDelayAnalysisProjectRepository } from '../../../../../infrastructure/database/repositories/delay-analysis/DrizzleDelayAnalysisProjectRepository';
import { DrizzleProjectDocumentRepository } from '../../../../../infrastructure/database/repositories/delay-analysis/DrizzleProjectDocumentRepository';
import { DrizzlePodReportRepository } from '../../../../../infrastructure/database/repositories/delay-analysis/DrizzlePodReportRepository';
import { SHA256DocumentHashService } from '../../../../../infrastructure/delay-analysis/SHA256DocumentHashService';
import { PODExtractionStrategy } from '../../../../../infrastructure/delay-analysis/extraction-strategies/PODExtractionStrategy';
import { PostParseDocumentHandlerFactory } from '../../../../../infrastructure/delay-analysis/PostParseDocumentHandlerFactory';
import { PodPostParseHandler } from '../PodPostParseHandler';
import { ProcessPodDocumentCommandHandler } from '../ProcessPodDocumentCommandHandler';
import type { IDocumentParser, ParsedDocumentResult } from '../../../../../domain/delay-analysis/interfaces/IDocumentParser';
import type { IDocumentParserFactory } from '../../../../../domain/delay-analysis/interfaces/IDocumentParserFactory';
import type { IAIClient, ChatOptions, ChatResponse, TestConnectionResult } from '../../../../../domain/interfaces/IAIClient';

/** A fixed "PDF" parser stand-in so this test exercises real dedup/date/post-parse wiring
 * without depending on pdfjs or a real PDF fixture - PdfPodDocumentParser itself is covered
 * by its own unit/regression tests. */
class FakePodParser implements IDocumentParser {
  canParse(contentType: string, documentType?: string): boolean {
    return contentType === 'application/pdf' && documentType === 'pod';
  }
  async parse(): Promise<ParsedDocumentResult> {
    return { rawContent: 'TUESDAY APRIL 29TH\nCIVIL #1\nJ. BRICKMAN\nR. CABUENA' };
  }
}

class FakePodParserFactory implements IDocumentParserFactory {
  private readonly parser = new FakePodParser();
  getParser(contentType: string, documentType?: string) {
    return this.parser.canParse(contentType, documentType) ? this.parser : null;
  }
  isSupported(contentType: string): boolean {
    return contentType === 'application/pdf';
  }
  getSupportedContentTypes(): string[] {
    return ['application/pdf'];
  }
}

/** Deterministic AI client double returning canned, schema-valid POD JSON so this test never
 * makes a real network call, per the testing pyramid guidance to keep this fast and isolated. */
class FakePodAIClient implements IAIClient {
  constructor(private readonly sectionLabel: string) {}

  async chat(_options: ChatOptions): Promise<ChatResponse> {
    const json = {
      reportDate: '2023-04-29',
      title: 'Play of the Day',
      sections: [
        {
          crewNumber: '211',
          label: this.sectionLabel,
          category: 'civil',
          crewMembers: ['J. BRICKMAN', 'R. CABUENA'],
          equipment: [],
          taskLines: [{ description: 'TIE IN', costCode: '113.01' }],
          trucking: '',
          traffic: '',
          notes: '',
        },
      ],
    };
    return {
      content: JSON.stringify(json),
      model: 'fake-model',
      inputTokens: 0,
      outputTokens: 0,
      stopReason: 'stop',
    };
  }
  async streamChat(): Promise<void> {}
  async testConnection(): Promise<TestConnectionResult> {
    return { success: true, authMethod: 'api-key', model: 'fake-model', latencyMs: 0 };
  }
  getAuthMethod(): 'api-key' | 'iam' {
    return 'api-key';
  }
}

function buildUploadHandler(sectionLabel: string) {
  const podReportRepository = new DrizzlePodReportRepository();
  const strategy = new PODExtractionStrategy();
  const aiClient = new FakePodAIClient(sectionLabel);
  const processPodDocumentHandler = new ProcessPodDocumentCommandHandler(podReportRepository, strategy, aiClient);
  const postParseHandlerFactory = new PostParseDocumentHandlerFactory([
    new PodPostParseHandler(processPodDocumentHandler),
  ]);

  return new UploadDocumentsCommandHandler(
    new DrizzleDelayAnalysisProjectRepository(),
    new DrizzleProjectDocumentRepository(),
    new FakePodParserFactory(),
    new SHA256DocumentHashService(),
    postParseHandlerFactory
  );
}

async function waitForReport(sourceDocumentId: string, timeoutMs = 5000): Promise<typeof podReports.$inferSelect | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await db.select().from(podReports).where(eq(podReports.sourceDocumentId, sourceDocumentId));
    if (rows.length > 0) return rows[0];
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return null;
}

/**
 * Integration test exercising the real upload flow (UploadDocumentsCommandHandler ->
 * dedup -> parse -> post-parse seam -> ProcessPodDocumentCommandHandler -> validator ->
 * DrizzlePodReportRepository) end to end, proving the required delete-then-reupload
 * replace behavior through the flow the app actually uses, not just at the repository layer.
 */
describe('UploadDocumentsCommandHandler POD flow (integration)', () => {
  const projectId = randomUUID();
  const tenantId = `test-tenant-${randomUUID()}`;
  const createdDocumentIds: string[] = [];

  afterAll(async () => {
    for (const id of createdDocumentIds) {
      await db.delete(podReports).where(eq(podReports.sourceDocumentId, id));
    }
    const { projectDocuments } = await import('@shared/schema');
    for (const id of createdDocumentIds) {
      await db.delete(projectDocuments).where(eq(projectDocuments.id, id));
    }
    await db.delete(delayAnalysisProjects).where(eq(delayAnalysisProjects.id, projectId));
  });

  // Two full upload+extraction round trips against the real database within one test.
  it('populates a POD report on upload, and a delete-then-reupload replaces it without duplicates', async () => {
    await db.insert(delayAnalysisProjects).values({
      id: projectId,
      tenantId,
      name: 'POD Upload Flow Integration Test',
      status: 'active',
    });

    const fileA = Buffer.from('pod-file-content-v1');
    const uploadHandlerA = buildUploadHandler('CIVIL #1');

    const firstResult = await uploadHandlerA.execute(new UploadDocumentsCommand(
      projectId,
      tenantId,
      [{ filename: 'pod-a.pdf', contentType: 'application/pdf', documentType: 'pod', buffer: fileA }]
    ));

    expect(firstResult.uploaded).toHaveLength(1);
    const firstDocumentId = firstResult.uploaded[0].id;
    createdDocumentIds.push(firstDocumentId);

    const firstReport = await waitForReport(firstDocumentId);
    expect(firstReport).not.toBeNull();
    const firstSections = await db.select().from(podSections).where(eq(podSections.reportId, firstReport!.id));
    expect(firstSections).toHaveLength(1);
    expect(firstSections[0].label).toBe('CIVIL #1');

    // Re-uploading the identical bytes without deleting is skipped by content-hash dedup
    // before it ever reaches extraction - this is the explicitly specified behavior, not
    // a reprocess path.
    const duplicateResult = await uploadHandlerA.execute(new UploadDocumentsCommand(
      projectId,
      tenantId,
      [{ filename: 'pod-a.pdf', contentType: 'application/pdf', documentType: 'pod', buffer: fileA }]
    ));
    expect(duplicateResult.uploaded).toHaveLength(0);
    expect(duplicateResult.skipped).toHaveLength(1);

    // Delete the document (cascades its POD report/sections), then re-upload the same
    // bytes: this is the actual supported "reprocess" route per spec, and must produce a
    // single fresh report tree with no leftover rows from the deleted one.
    const { projectDocuments } = await import('@shared/schema');
    await db.delete(projectDocuments).where(eq(projectDocuments.id, firstDocumentId));

    const uploadHandlerB = buildUploadHandler('CIVIL #1 (reprocessed)');
    const secondResult = await uploadHandlerB.execute(new UploadDocumentsCommand(
      projectId,
      tenantId,
      [{ filename: 'pod-a.pdf', contentType: 'application/pdf', documentType: 'pod', buffer: fileA }]
    ));

    expect(secondResult.uploaded).toHaveLength(1);
    const secondDocumentId = secondResult.uploaded[0].id;
    createdDocumentIds.push(secondDocumentId);
    expect(secondDocumentId).not.toBe(firstDocumentId);

    const secondReport = await waitForReport(secondDocumentId);
    expect(secondReport).not.toBeNull();

    // Exactly one POD report exists for this project - the deleted document's report and
    // sections were removed by cascade, and no duplicate accumulated.
    const allReportsForProject = await db.select().from(podReports).where(eq(podReports.projectId, projectId));
    expect(allReportsForProject).toHaveLength(1);
    expect(allReportsForProject[0].id).toBe(secondReport!.id);

    const secondSections = await db.select().from(podSections).where(eq(podSections.reportId, secondReport!.id));
    expect(secondSections).toHaveLength(1);
    expect(secondSections[0].label).toBe('CIVIL #1 (reprocessed)');

    // The original section row (belonging to the deleted document's report) must be gone.
    const orphanSections = await db.select().from(podSections).where(eq(podSections.reportId, firstReport!.id));
    expect(orphanSections).toHaveLength(0);
  }, 20000);
});
