export interface RecordTokenUsageCommand {
  type: 'RecordTokenUsageCommand';
  projectId: string;
  operation: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  metadata?: Record<string, unknown>;
}

export function createRecordTokenUsageCommand(
  projectId: string,
  operation: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  metadata?: Record<string, unknown>
): RecordTokenUsageCommand {
  return {
    type: 'RecordTokenUsageCommand',
    projectId,
    operation,
    model,
    inputTokens,
    outputTokens,
    metadata,
  };
}
