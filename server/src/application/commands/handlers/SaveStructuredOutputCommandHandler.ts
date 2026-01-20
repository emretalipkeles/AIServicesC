import type { ICommandHandler } from '../../interfaces/ICommandBus';
import type { SaveStructuredOutputCommand } from '../SaveStructuredOutputCommand';
import type { IAgentRepository } from '../../../domain/repositories/IAgentRepository';
import type { IStructuredOutputRepository } from '../../../domain/repositories/IStructuredOutputRepository';
import { SchemaRegistry } from '../../../infrastructure/persistence/SchemaRegistry';

export interface SaveStructuredOutputResult {
  success: boolean;
  savedIds: { tableName: string; id: string }[];
  errors: string[];
}

export class SaveStructuredOutputCommandHandler implements ICommandHandler<SaveStructuredOutputCommand, SaveStructuredOutputResult> {
  constructor(
    private readonly agentRepository: IAgentRepository,
    private readonly structuredOutputRepository: IStructuredOutputRepository
  ) {}

  async handle(command: SaveStructuredOutputCommand): Promise<SaveStructuredOutputResult> {
    const tenantId = command.tenantId ?? 'default';
    const errors: string[] = [];
    const savedIds: { tableName: string; id: string }[] = [];

    const agent = await this.agentRepository.findById(command.agentId, tenantId);
    if (!agent) {
      return {
        success: false,
        savedIds: [],
        errors: [`Agent not found: ${command.agentId}`],
      };
    }

    for (const block of command.blocks) {
      if (!agent.canWriteToTable(block.tableName)) {
        errors.push(`Agent '${agent.name}' is not allowed to write to table '${block.tableName}'`);
        continue;
      }

      if (!SchemaRegistry.isTableRegistered(block.tableName)) {
        errors.push(`Table '${block.tableName}' is not registered in the schema registry`);
        continue;
      }

      const validation = SchemaRegistry.validateData(block.tableName, block.data);
      if (!validation.success) {
        errors.push(`Validation failed for '${block.tableName}': ${validation.error}`);
        continue;
      }
    }

    if (errors.length > 0) {
      return { success: false, savedIds, errors };
    }

    try {
      const entries = command.blocks.map(block => ({
        tableName: block.tableName,
        data: block.data,
      }));

      const ids = await this.structuredOutputRepository.saveMultiple(entries);
      
      for (let i = 0; i < command.blocks.length; i++) {
        savedIds.push({
          tableName: command.blocks[i].tableName,
          id: ids[i],
        });
      }

      return { success: true, savedIds, errors: [] };
    } catch (error) {
      return {
        success: false,
        savedIds: [],
        errors: [error instanceof Error ? error.message : 'Unknown error during save'],
      };
    }
  }
}
