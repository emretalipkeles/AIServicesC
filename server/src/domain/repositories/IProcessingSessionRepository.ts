import type { ProcessingSession, ProcessingStage } from '../entities/ProcessingSession';
import type { ProcessingMessage } from '../entities/ProcessingMessage';

export interface IProcessingSessionRepository {
  findById(id: string, tenantId: string): Promise<ProcessingSession | null>;
  findByDocumentId(documentId: string, tenantId: string): Promise<ProcessingSession | null>;
  save(session: ProcessingSession): Promise<void>;
  updateStage(id: string, tenantId: string, stage: ProcessingStage, errorMessage?: string): Promise<void>;
  updateProgress(id: string, tenantId: string, processedChunks: number): Promise<void>;
  updateSummary(id: string, tenantId: string, summary: string): Promise<void>;
  delete(id: string, tenantId: string): Promise<void>;
  deleteCompleted(olderThanHours: number): Promise<number>;

  saveMessage(message: ProcessingMessage): Promise<void>;
  getMessages(sessionId: string): Promise<ProcessingMessage[]>;
  deleteMessages(sessionId: string): Promise<void>;
}
