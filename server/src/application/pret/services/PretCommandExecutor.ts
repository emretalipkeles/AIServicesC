import type { 
  IPretCommandRegistry, 
  IPretCommand, 
  IPretCommandResult, 
  IIntentClassifier, 
  CommandDescriptor,
  IResponseNarrator,
  PretCommandType
} from '../../../domain/pret';
import { ClassifiedIntent, PretInteractionSummary } from '../../../domain/pret';
import { ListModelsCommand } from '../commands/pret-commands/ListModelsCommand';
import { GetCubeDetailsCommand } from '../commands/pret-commands/GetCubeDetailsCommand';
import { ListDimensionsCommand } from '../commands/pret-commands/ListDimensionsCommand';
import { GetDimensionDetailsCommand } from '../commands/pret-commands/GetDimensionDetailsCommand';
import { CreateOtherDimensionCommand, DimensionKind } from '../commands/pret-commands/CreateOtherDimensionCommand';

export interface CommandExecutionContext {
  packageId: string;
  tenantId: string;
  userMessage: string;
}

export interface CommandExecutionResult {
  handled: boolean;
  result?: IPretCommandResult<unknown>;
  intent?: ClassifiedIntent;
  formattedResponse?: string;
  interactionSummary?: PretInteractionSummary;
}

export class PretCommandExecutor {
  constructor(
    private readonly commandRegistry: IPretCommandRegistry,
    private readonly intentClassifier: IIntentClassifier,
    private readonly commandDescriptors: CommandDescriptor[],
    private readonly responseNarrator?: IResponseNarrator
  ) {}

  async execute(context: CommandExecutionContext): Promise<CommandExecutionResult> {
    const intent = await this.intentClassifier.classify(
      context.userMessage,
      this.commandDescriptors
    );

    if (!intent.isMatched()) {
      console.log('[PretCommandExecutor] No command matched or out-of-scope request');
      const outOfScopeResult = {
        success: true,
        data: {
          availableCommands: this.commandDescriptors.map(cmd => ({
            name: cmd.name,
            description: cmd.description
          })),
          reasoning: intent.reasoning,
          userRequest: context.userMessage
        }
      };
      
      const formattedResponse = await this.narrateOutOfScope(outOfScopeResult, context.userMessage, intent.reasoning);
      
      return { 
        handled: true, 
        intent,
        formattedResponse
      };
    }

    console.log('[PretCommandExecutor] Classified intent:', intent.commandType, 'with args:', intent.args);

    const handler = this.commandRegistry.getHandler(intent.commandType!);
    if (!handler) {
      console.log('[PretCommandExecutor] No handler found for:', intent.commandType);
      return { handled: false, intent };
    }

    const command = this.buildCommand(intent, context);
    if (!command) {
      console.log('[PretCommandExecutor] Could not build command for:', intent.commandType);
      return { 
        handled: true, 
        intent,
        result: {
          success: false,
          error: `Missing required arguments for command: ${intent.commandType}`
        },
        formattedResponse: `**Error:** Missing required arguments. Please specify the ${this.getMissingArgsHint(intent.commandType!)}.`
      };
    }

    try {
      const result = await handler.handle(command);
      const formattedResponse = await this.narrateResponse(
        intent.commandType!,
        result,
        context.userMessage
      );

      const interactionSummary = PretInteractionSummary.create({
        commandType: intent.commandType!,
        userMessage: context.userMessage,
        response: formattedResponse,
        dataSnapshot: this.extractDataSnapshot(result),
        timestamp: new Date()
      });

      return {
        handled: true,
        result,
        intent,
        formattedResponse,
        interactionSummary
      };
    } catch (error) {
      console.error('[PretCommandExecutor] Command execution failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Command execution failed';
      return {
        handled: true,
        result: {
          success: false,
          error: errorMessage
        },
        intent,
        formattedResponse: `There was an issue: ${errorMessage}`
      };
    }
  }

  private extractDataSnapshot(result: IPretCommandResult<unknown>): Record<string, unknown> {
    if (!result.success || !result.data) {
      return {};
    }
    
    const data = result.data as Record<string, unknown>;
    const snapshot: Record<string, unknown> = {};
    
    if ('totalCount' in data) {
      snapshot.totalCount = data.totalCount;
    }
    if ('models' in data && Array.isArray(data.models)) {
      snapshot.modelNames = (data.models as Array<{ name: string }>).map(m => m.name);
    }
    if ('dimensions' in data && Array.isArray(data.dimensions)) {
      snapshot.dimensionNames = (data.dimensions as Array<{ name: string }>).map(d => d.name);
    }
    if ('cube' in data && data.cube) {
      snapshot.cubeName = (data.cube as { name: string }).name;
    }
    if ('dimension' in data && data.dimension) {
      snapshot.dimensionName = (data.dimension as { name: string }).name;
      snapshot.memberCount = (data.dimension as { memberCount: number }).memberCount;
    }
    
    return snapshot;
  }

  private async narrateResponse(
    commandType: PretCommandType,
    result: IPretCommandResult<unknown>,
    userMessage: string
  ): Promise<string> {
    if (this.responseNarrator) {
      try {
        return await this.responseNarrator.narrate({
          commandType,
          result,
          userMessage,
          wasSuccessful: result.success
        });
      } catch (error) {
        console.error('[PretCommandExecutor] Narration failed, using fallback:', error);
      }
    }
    
    return this.formatResponse(commandType, result);
  }

  private getMissingArgsHint(commandType: string): string {
    switch (commandType) {
      case 'getCubeDetails':
        return 'cube/model name';
      case 'getDimensionDetails':
        return 'dimension name';
      case 'createOtherDimension':
        return 'required parameters: model name, dimension name, and dimension kind (OtherDimension, AccountDimension, or TimeDimension)';
      default:
        return 'required parameters';
    }
  }

  private buildCommand(intent: ClassifiedIntent, context: CommandExecutionContext): IPretCommand<unknown> | null {
    const { packageId, tenantId } = context;

    switch (intent.commandType) {
      case 'listModels':
        return ListModelsCommand.create(
          packageId,
          tenantId,
          intent.args.includeDetails as boolean | undefined
        );

      case 'listDimensions':
        return ListDimensionsCommand.create(
          packageId,
          tenantId,
          intent.args.modelName as string | undefined,
          intent.args.dimensionType as string | undefined
        );

      case 'getCubeDetails':
        if (!intent.args.cubeName) {
          return null;
        }
        return GetCubeDetailsCommand.create(
          packageId,
          tenantId,
          intent.args.cubeName as string
        );

      case 'getDimensionDetails':
        if (!intent.args.dimensionName) {
          return null;
        }
        return GetDimensionDetailsCommand.create(
          packageId,
          tenantId,
          intent.args.dimensionName as string,
          intent.args.modelName as string | undefined
        );

      case 'createOtherDimension':
        if (!intent.args.modelName || !intent.args.dimensionName || !intent.args.dimensionKind) {
          return null;
        }
        return CreateOtherDimensionCommand.create(
          packageId,
          tenantId,
          intent.args.modelName as string,
          intent.args.dimensionName as string,
          intent.args.dimensionKind as DimensionKind,
          intent.args.dimensionDescription as string | undefined
        );

      default:
        return null;
    }
  }

  private formatResponse(commandType: string, result: IPretCommandResult<unknown>): string {
    if (!result.success) {
      return `**Error:** ${result.error || 'Command execution failed'}`;
    }

    switch (commandType) {
      case 'listModels':
        return this.formatListModelsResponse(result);
      case 'listDimensions':
        return this.formatListDimensionsResponse(result);
      case 'getCubeDetails':
        return this.formatCubeDetailsResponse(result);
      case 'getDimensionDetails':
        return this.formatDimensionDetailsResponse(result);
      default:
        return result.message || 'Command completed successfully';
    }
  }

  private formatListModelsResponse(result: IPretCommandResult<unknown>): string {
    const data = result.data as { models: Array<{ name: string; type: string; dimensions: Array<{ name: string }> }>; totalCount: number };
    
    if (!data.models || data.models.length === 0) {
      return 'No models found in the package.';
    }

    const lines: string[] = [`**Found ${data.totalCount} model(s):**\n`];
    
    for (const model of data.models) {
      lines.push(`### ${model.name}`);
      lines.push(`- Type: ${model.type}`);
      if (model.dimensions.length > 0) {
        lines.push(`- Dimensions (${model.dimensions.length}): ${model.dimensions.map(d => d.name).join(', ')}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  private formatListDimensionsResponse(result: IPretCommandResult<unknown>): string {
    const data = result.data as { dimensions: Array<{ name: string; kind: string; modelName: string; memberCount: number }>; totalCount: number };
    
    if (!data.dimensions || data.dimensions.length === 0) {
      return 'No dimensions found matching your criteria.';
    }

    const lines: string[] = [`**Found ${data.totalCount} dimension(s):**\n`];
    
    for (const dim of data.dimensions) {
      lines.push(`- **${dim.name}** (${dim.kind}) - Model: ${dim.modelName}, ${dim.memberCount} members`);
    }

    return lines.join('\n');
  }

  private formatCubeDetailsResponse(result: IPretCommandResult<unknown>): string {
    const data = result.data as { cube: { name: string; type: string; dimensions: Array<{ name: string; kind: string }> }; dimensionDetails: Array<{ name: string; kind: string; memberCount: number }> };
    
    if (!data.cube) {
      return 'Cube not found.';
    }

    const lines: string[] = [
      `## Cube: ${data.cube.name}\n`,
      `**Type:** ${data.cube.type}\n`,
      `### Dimensions (${data.cube.dimensions.length})\n`
    ];

    for (const dim of data.dimensionDetails) {
      lines.push(`- **${dim.name}** (${dim.kind}) - ${dim.memberCount} members`);
    }

    return lines.join('\n');
  }

  private formatDimensionDetailsResponse(result: IPretCommandResult<unknown>): string {
    const data = result.data as { dimension: { name: string; kind: string; modelName: string; memberCount: number }; customProperties?: Array<{ name: string; valueType: string; description?: string }> };
    
    if (!data.dimension) {
      return 'Dimension not found.';
    }

    const lines: string[] = [
      `## Dimension: ${data.dimension.name}\n`,
      `- **Kind:** ${data.dimension.kind}`,
      `- **Model:** ${data.dimension.modelName}`,
      `- **Member Count:** ${data.dimension.memberCount}`,
      ''
    ];

    if (data.customProperties && data.customProperties.length > 0) {
      lines.push('### Properties\n');
      for (const prop of data.customProperties) {
        lines.push(`- **${prop.name}** (${prop.valueType})${prop.description ? `: ${prop.description}` : ''}`);
      }
    }

    return lines.join('\n');
  }

  getAvailableCommands(): string[] {
    return this.commandRegistry.getAvailableCommands();
  }

  private async narrateOutOfScope(
    result: { success: boolean; data: { availableCommands: Array<{ name: string; description: string }>; reasoning?: string; userRequest: string } },
    userMessage: string,
    reasoning?: string
  ): Promise<string> {
    if (this.responseNarrator) {
      try {
        return await this.responseNarrator.narrate({
          commandType: 'outOfScope',
          result,
          userMessage,
          wasSuccessful: true
        });
      } catch (error) {
        console.error('[PretCommandExecutor] Out-of-scope narration failed, using fallback:', error);
      }
    }
    
    return this.buildNotYetSupportedResponse(reasoning);
  }

  private buildNotYetSupportedResponse(reasoning?: string): string {
    const commandDescriptions = this.commandDescriptors.map(cmd => {
      return `- **${cmd.name}**: ${cmd.description}`;
    }).join('\n');

    const reasoningText = reasoning ? `\n\n*${reasoning}*` : '';

    return `That feature isn't available yet.${reasoningText}

Here's what I can help you with right now:

${commandDescriptions}

Feel free to ask about any of these!`;
  }
}
