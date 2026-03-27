import type { IFieldMemoContextProvider } from '../../domain/delay-analysis/interfaces/IFieldMemoContextProvider';
import type { IProjectDocumentRepository } from '../../domain/delay-analysis/repositories/IProjectDocumentRepository';
import type { IAIClient } from '../../domain/interfaces/IAIClient';
import { AIMessage } from '../../domain/value-objects/AIMessage';
import { ModelId } from '../../domain/value-objects/ModelId';

const MAX_FM_CONTENT_LENGTH = 30000;
const MAX_COMBINED_FM_LENGTH = 60000;

export class FieldMemoContextSummarizer implements IFieldMemoContextProvider {
  constructor(
    private readonly documentRepository: IProjectDocumentRepository,
    private readonly aiClient: IAIClient
  ) {}

  async getConsolidatedContext(
    projectId: string,
    tenantId: string,
    filterMonth?: number,
    filterYear?: number
  ): Promise<string | null> {
    const fieldMemos = await this.documentRepository.findByProjectIdAndType(
      projectId,
      tenantId,
      'field_memo'
    );

    const completedMemos = fieldMemos.filter(
      fm => fm.status === 'completed' && fm.rawContent
    );

    if (completedMemos.length === 0) {
      return null;
    }

    let filteredMemos = completedMemos;
    if (filterMonth !== undefined && filterYear !== undefined) {
      filteredMemos = completedMemos.filter(fm => {
        if (!fm.reportDate) return false;
        const d = new Date(fm.reportDate);
        return d.getMonth() + 1 === filterMonth && d.getFullYear() === filterYear;
      });
      if (filteredMemos.length === 0) {
        console.log(`[FieldMemoContextSummarizer] No field memos found for period ${filterMonth}/${filterYear}`);
        return null;
      }
    }

    let combinedContent = '';
    for (const memo of filteredMemos) {
      const truncated = memo.rawContent!.slice(0, MAX_FM_CONTENT_LENGTH);
      const header = `\n--- Field Memo: ${memo.filename} ---\n`;
      if (combinedContent.length + header.length + truncated.length > MAX_COMBINED_FM_LENGTH) {
        break;
      }
      combinedContent += header + truncated;
    }

    if (combinedContent.length === 0) {
      return null;
    }

    const prompt = `You are a construction project context summarizer. Below are Field Memos from a construction project. Summarize them into a concise briefing that a delay analyst can use as background context when analyzing Inspector Daily Reports (IDRs).

Focus on:
1. Active corrective actions, remediation work, or rework directives
2. Known site conditions, environmental constraints, or access restrictions
3. Ongoing quality issues or non-conformance patterns
4. Coordination directives between contractor and owner/inspector
5. Schedule-impacting decisions or directives

Keep the summary factual, structured, and under 800 words. Use bullet points grouped by topic. Omit routine administrative items that have no delay relevance.

Field Memos:
${combinedContent}`;

    try {
      console.log(`[FieldMemoContextSummarizer] Summarizing ${filteredMemos.length} field memos for project ${projectId}`);

      const response = await this.aiClient.chat({
        model: ModelId.gpt54(),
        messages: [AIMessage.user(prompt)],
        maxTokens: 1500,
        temperature: 0,
      });

      console.log(`[FieldMemoContextSummarizer] Summary generated (${response.outputTokens} tokens output)`);

      return response.content;
    } catch (error) {
      console.error('[FieldMemoContextSummarizer] Failed to summarize field memos:', error);
      return null;
    }
  }
}
