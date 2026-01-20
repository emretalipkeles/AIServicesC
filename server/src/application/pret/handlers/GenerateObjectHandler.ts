import type { GenerateObjectCommand } from '../commands/GenerateObjectCommand';
import type { IPretToolRegistry } from '../../../domain/pret/interfaces/IPretToolRegistry';
import type { IBuildContextRepository } from '../../../domain/pret/interfaces/IBuildContextRepository';
import type { ToolExecutionResult } from '../../../domain/pret/entities/PretTool';
import { BuildContext } from '../../../domain/pret/entities/BuildContext';
import { ObjectType } from '../../../domain/pret/value-objects/ObjectType';
import type { PretOutputDto } from '../dto/PretOutputDto';

export class GenerateObjectHandler {
  constructor(
    private readonly toolRegistry: IPretToolRegistry,
    private readonly contextRepository: IBuildContextRepository
  ) {}

  async handle(
    command: GenerateObjectCommand,
    onChunk?: (chunk: string) => void
  ): Promise<PretOutputDto> {
    const tool = this.toolRegistry.getTool(command.objectType);
    
    if (!tool) {
      return {
        success: false,
        error: `No tool available for object type: ${command.objectType}`,
      };
    }

    let buildContext = await this.contextRepository.findByConversation(
      command.tenantId,
      command.conversationId
    );

    if (!buildContext) {
      buildContext = BuildContext.create(command.tenantId, command.conversationId);
    }

    const objectType = ObjectType.fromName(command.objectType);
    const missingDependencies = this.checkDependencies(objectType, buildContext);
    
    if (missingDependencies.length > 0) {
      const dependencyMessage = `Before creating a ${command.objectType}, you need to create the following: ${missingDependencies.join(', ')}. Would you like me to help you create these first?`;
      return {
        success: false,
        clarificationNeeded: dependencyMessage,
        missingDependencies,
      };
    }

    const result: ToolExecutionResult = await tool.execute({
      tenantId: command.tenantId,
      conversationId: command.conversationId,
      userMessage: command.userMessage,
      buildContext,
      onChunk,
    });

    if (result.success && result.output) {
      buildContext.addObject(result.output);
      await this.contextRepository.save(buildContext);
    }

    return this.toDto(result);
  }

  private checkDependencies(objectType: ObjectType, context: BuildContext): string[] {
    const missing: string[] = [];
    
    for (const dep of objectType.getRequiredDependencies()) {
      const existing = context.getObjectsByType(dep);
      if (existing.length === 0) {
        missing.push(dep);
      }
    }

    return missing;
  }

  private toDto(result: ToolExecutionResult): PretOutputDto {
    return {
      success: result.success,
      yaml: result.output?.content,
      objectType: result.output?.objectType,
      objectName: result.output?.objectName,
      isValid: result.output?.isValid,
      errors: result.output?.errors ? [...result.output.errors] : undefined,
      clarificationNeeded: result.clarificationNeeded,
      error: result.error,
    };
  }
}
