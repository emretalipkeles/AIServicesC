import type { RecordTokenUsageCommand } from '../RecordTokenUsageCommand';
import type { IAITokenUsageRepository } from '../../../../domain/delay-analysis/repositories/IAITokenUsageRepository';
import { AITokenUsage } from '../../../../domain/delay-analysis/entities/AITokenUsage';

export class RecordTokenUsageCommandHandler {
  constructor(private readonly repository: IAITokenUsageRepository) {}

  async handle(command: RecordTokenUsageCommand): Promise<void> {
    const totalTokens = command.inputTokens + command.outputTokens;
    const estimatedCostUsd = AITokenUsage.calculateCost(
      command.model,
      command.inputTokens,
      command.outputTokens
    );

    const usage = AITokenUsage.create({
      projectId: command.projectId,
      operation: command.operation,
      model: command.model,
      inputTokens: command.inputTokens,
      outputTokens: command.outputTokens,
      totalTokens,
      estimatedCostUsd,
      metadata: command.metadata,
    });

    await this.repository.save(usage);
    
    console.log(`[TokenUsage] Recorded: ${command.operation} | ${command.model} | ${command.inputTokens} in / ${command.outputTokens} out | $${estimatedCostUsd.toFixed(6)}`);
  }
}
