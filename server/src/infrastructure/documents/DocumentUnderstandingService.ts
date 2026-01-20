import type { 
  IDocumentUnderstandingService, 
  UnderstandingResult, 
  UnderstandingChunk 
} from '../../application/services/IDocumentUnderstandingService';
import type { IAIClientProvider } from '../ai/AIClientProvider';
import type { IProcessingSessionRepository } from '../../domain/repositories/IProcessingSessionRepository';
import { ProcessingMessage } from '../../domain/entities/ProcessingMessage';
import { ModelId } from '../../domain/value-objects/ModelId';
import { AIMessage } from '../../domain/value-objects/AIMessage';
import { randomUUID } from 'crypto';

interface TextChunk {
  content: string;
  index: number;
  startOffset: number;
  endOffset: number;
}

export class DocumentUnderstandingService implements IDocumentUnderstandingService {
  private readonly CHUNK_SIZE = 2000;
  private readonly CHUNK_OVERLAP = 200;
  private readonly MAX_CONVERSATION_CONTEXT = 10;
  private readonly AI_CALL_TIMEOUT_MS = 30000; // 30 seconds per AI call
  private readonly MAX_RETRIES = 2;

  constructor(
    private readonly aiClientProvider: IAIClientProvider,
    private readonly sessionRepository: IProcessingSessionRepository
  ) {}

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`${operation} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private async retryWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    operation: string,
    maxRetries: number = this.MAX_RETRIES
  ): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.withTimeout(fn(), timeoutMs, operation);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(`[DocumentUnderstanding] ${operation} attempt ${attempt + 1} failed:`, lastError.message);
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }
    
    throw lastError || new Error(`${operation} failed after ${maxRetries + 1} attempts`);
  }

  async processDocument(
    sessionId: string,
    documentId: string,
    agentId: string,
    tenantId: string,
    rawContent: string
  ): Promise<UnderstandingResult> {
    const aiClient = this.aiClientProvider.getClient(tenantId);
    if (!aiClient) {
      return {
        success: false,
        chunks: [],
        error: 'AI client not configured',
      };
    }

    try {
      const textChunks = this.splitIntoChunks(rawContent);
      
      if (textChunks.length === 0) {
        return {
          success: false,
          chunks: [],
          error: 'No content to process',
        };
      }

      await this.sessionRepository.updateProgress(sessionId, tenantId, 0);

      for (let i = 0; i < textChunks.length; i++) {
        const chunk = textChunks[i];
        await this.processChunk(sessionId, tenantId, chunk, i, textChunks.length, aiClient);
        await this.sessionRepository.updateProgress(sessionId, tenantId, i + 1);
      }

      const optimizedChunks = await this.generateOptimizedChunks(
        sessionId,
        tenantId,
        rawContent,
        aiClient
      );

      const summary = await this.generateSummary(sessionId, tenantId, aiClient);
      await this.sessionRepository.updateSummary(sessionId, tenantId, summary);

      return {
        success: true,
        chunks: optimizedChunks,
        summary,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Document processing failed';
      await this.sessionRepository.updateStage(sessionId, tenantId, 'failed', errorMessage);
      return {
        success: false,
        chunks: [],
        error: errorMessage,
      };
    }
  }

  private splitIntoChunks(content: string): TextChunk[] {
    const chunks: TextChunk[] = [];
    const paragraphs = content.split(/\n\s*\n/);
    
    let currentChunk = '';
    let currentStart = 0;
    let chunkIndex = 0;
    let position = 0;

    for (const para of paragraphs) {
      const paraWithBreak = para + '\n\n';
      
      if (currentChunk.length + paraWithBreak.length > this.CHUNK_SIZE && currentChunk.length > 0) {
        chunks.push({
          content: currentChunk.trim(),
          index: chunkIndex,
          startOffset: currentStart,
          endOffset: position,
        });
        chunkIndex++;
        
        const overlap = currentChunk.slice(-this.CHUNK_OVERLAP);
        currentChunk = overlap + paraWithBreak;
        currentStart = position - this.CHUNK_OVERLAP;
      } else {
        currentChunk += paraWithBreak;
      }
      
      position += paraWithBreak.length;
    }

    if (currentChunk.trim().length > 0) {
      chunks.push({
        content: currentChunk.trim(),
        index: chunkIndex,
        startOffset: currentStart,
        endOffset: position,
      });
    }

    return chunks;
  }

  private async processChunk(
    sessionId: string,
    tenantId: string,
    chunk: TextChunk,
    currentIndex: number,
    totalChunks: number,
    aiClient: any
  ): Promise<void> {
    const previousMessages = await this.sessionRepository.getMessages(sessionId);
    const recentMessages = previousMessages.slice(-this.MAX_CONVERSATION_CONTEXT * 2);

    const userContent = `[Reading chunk ${currentIndex + 1} of ${totalChunks}]

${chunk.content}

---
Acknowledge you've read and understood this section. Note any key concepts, entities, or important information for later reference. Be brief.`;

    const userMessage = ProcessingMessage.createChunkMessage(
      randomUUID(),
      sessionId,
      chunk.index,
      userContent
    );
    await this.sessionRepository.saveMessage(userMessage);

    const conversationHistory = recentMessages.map(msg => 
      msg.role === 'user' ? AIMessage.user(msg.content) : AIMessage.assistant(msg.content)
    );
    conversationHistory.push(AIMessage.user(userContent));

    const systemPrompt = `You are a document analysis assistant. You are reading a document in chunks to build understanding.

Your job is to:
1. Read each chunk carefully
2. Identify key concepts, entities, facts, and relationships
3. Build a mental model of the document's structure and content
4. Note important terms, definitions, and their contexts

Keep your responses brief but informative. Focus on what's important for later retrieval.`;

    try {
      const response = await this.retryWithTimeout(
        () => aiClient.chat({
          model: ModelId.gpt52(),
          messages: conversationHistory,
          systemPrompt,
          maxTokens: 500,
          temperature: 0.3,
        }),
        this.AI_CALL_TIMEOUT_MS,
        `Chunk ${currentIndex + 1}/${totalChunks} processing`
      ) as { content: string };

      const assistantMessage = ProcessingMessage.createAssistantResponse(
        randomUUID(),
        sessionId,
        response.content,
        chunk.index
      );
      await this.sessionRepository.saveMessage(assistantMessage);
    } catch (error) {
      console.error(`[DocumentUnderstanding] Error processing chunk ${currentIndex}:`, error);
      const fallbackMessage = ProcessingMessage.createAssistantResponse(
        randomUUID(),
        sessionId,
        `[Chunk ${currentIndex + 1} processing failed - content noted for fallback chunking]`,
        chunk.index
      );
      await this.sessionRepository.saveMessage(fallbackMessage);
    }
  }

  private async generateOptimizedChunks(
    sessionId: string,
    tenantId: string,
    rawContent: string,
    aiClient: any
  ): Promise<UnderstandingChunk[]> {
    const messages = await this.sessionRepository.getMessages(sessionId);
    
    const understandingSummary = messages
      .filter(m => m.role === 'assistant')
      .map(m => m.content)
      .join('\n\n---\n\n');

    const chunkingPrompt = `Based on your understanding of this document, create optimized chunks for vector search retrieval.

Your understanding notes:
${understandingSummary.slice(0, 4000)}

Original document length: ${rawContent.length} characters

Now generate 5-15 semantic chunks that:
1. Group related concepts together
2. Are self-contained (can be understood without other chunks)
3. Include relevant context for each topic
4. Are optimized for retrieval when users ask questions

Respond in JSON format:
{
  "chunks": [
    {
      "content": "The actual chunk content...",
      "section": "Section name or topic",
      "keywords": ["key", "terms", "for", "this", "chunk"]
    }
  ]
}

If the document is short, create fewer but complete chunks. Focus on semantic meaning over arbitrary size limits.`;

    try {
      const response = await this.retryWithTimeout(
        () => aiClient.chat({
          model: ModelId.gpt52(),
          messages: [AIMessage.user(chunkingPrompt)],
          systemPrompt: 'You are a document chunking specialist. Output valid JSON only.',
          maxTokens: 8000,
          temperature: 0.2,
        }),
        60000, // 60 seconds for chunk generation (larger output)
        'Optimized chunk generation'
      ) as { content: string };

      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn('[DocumentUnderstanding] No JSON found in chunk generation response, using fallback');
        return this.fallbackChunking(rawContent);
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      if (!Array.isArray(parsed.chunks)) {
        console.warn('[DocumentUnderstanding] Invalid chunks array, using fallback');
        return this.fallbackChunking(rawContent);
      }

      return parsed.chunks.map((chunk: any, index: number) => ({
        content: String(chunk.content || ''),
        metadata: {
          chunkIndex: index,
          sourceSection: String(chunk.section || ''),
          keywords: Array.isArray(chunk.keywords) ? chunk.keywords.map(String) : [],
        },
      }));
    } catch (error) {
      console.error('[DocumentUnderstanding] Error generating optimized chunks:', error);
      return this.fallbackChunking(rawContent);
    }
  }

  private fallbackChunking(content: string): UnderstandingChunk[] {
    const textChunks = this.splitIntoChunks(content);
    return textChunks.map((chunk, index) => ({
      content: chunk.content,
      metadata: {
        chunkIndex: index,
        sourceSection: `Chunk ${index + 1}`,
        keywords: [],
      },
    }));
  }

  private async generateSummary(
    sessionId: string,
    tenantId: string,
    aiClient: any
  ): Promise<string> {
    const messages = await this.sessionRepository.getMessages(sessionId);
    
    const assistantNotes = messages
      .filter(m => m.role === 'assistant')
      .map(m => m.content)
      .join('\n\n');

    const summaryPrompt = `Based on your reading of this document, provide a concise summary (2-3 sentences) that captures:
1. What the document is about
2. Key topics or themes
3. Any important conclusions or takeaways

Your notes from reading:
${assistantNotes.slice(0, 3000)}

Summary:`;

    try {
      const response = await this.retryWithTimeout(
        () => aiClient.chat({
          model: ModelId.gpt52(),
          messages: [AIMessage.user(summaryPrompt)],
          systemPrompt: 'Provide a brief, informative summary.',
          maxTokens: 200,
          temperature: 0.3,
        }),
        this.AI_CALL_TIMEOUT_MS,
        'Summary generation'
      ) as { content: string };

      return response.content.trim();
    } catch (error) {
      console.error('[DocumentUnderstanding] Error generating summary:', error);
      return 'Document processed successfully.';
    }
  }
}
