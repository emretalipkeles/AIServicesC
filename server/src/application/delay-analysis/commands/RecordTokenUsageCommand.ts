export interface RecordTokenUsageCommand {
  type: 'RecordTokenUsageCommand';
  projectId: string;
  runId: string;
  operation: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  metadata?: Record<string, unknown>;
}

export function createRecordTokenUsageCommand(
  projectId: string,
  runId: string,
  operation: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  metadata?: Record<string, unknown>
): RecordTokenUsageCommand {
  return {
    type: 'RecordTokenUsageCommand',
    projectId,
    runId,
    operation,
    model,
    inputTokens,
    outputTokens,
    metadata,
  };
}
