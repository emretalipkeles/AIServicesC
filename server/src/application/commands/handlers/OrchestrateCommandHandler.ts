import type { OrchestrateCommand } from '../OrchestrateCommand';
import type { IAgentDiscoveryService, AgentSummary } from '../../../domain/interfaces/IAgentDiscoveryService';
import type { IOrchestrationPlanner } from '../../../domain/interfaces/IOrchestrationPlanner';
import type { IAgentExecutor, AgentExecutionResult } from '../../../domain/interfaces/IAgentExecutor';
import type { IResponseSynthesizer } from '../../../domain/interfaces/IResponseSynthesizer';
import type { IFallbackResponseGenerator } from '../../../domain/interfaces/IFallbackResponseGenerator';
import type { ExecutionPlan } from '../../../domain/value-objects/ExecutionPlan';

export interface OrchestrationProgress {
  type: 'discovery' | 'planning' | 'agent-start' | 'agent-chunk' | 'agent-done' | 'synthesis-start' | 'synthesis-chunk' | 'synthesis-done' | 'fallback' | 'error' | 'memory-optimizing' | 'memory-optimized' | 'package-updated';
  agentId?: string;
  agentName?: string;
  content?: string;
  plan?: ExecutionPlan;
  availableAgents?: AgentSummary[];
  packageId?: string;
}

export class OrchestrateCommandHandler {
  constructor(
    private discoveryService: IAgentDiscoveryService,
    private planner: IOrchestrationPlanner,
    private executor: IAgentExecutor,
    private synthesizer: IResponseSynthesizer,
    private fallbackGenerator: IFallbackResponseGenerator
  ) {}

  async handleStream(
    command: OrchestrateCommand,
    onProgress: (progress: OrchestrationProgress) => void
  ): Promise<void> {
    try {
      onProgress({ type: 'discovery' });
      const availableAgents = await this.discoveryService.discoverAgents(command.tenantId);

      if (availableAgents.length === 0) {
        onProgress({ type: 'synthesis-start' });
        onProgress({
          type: 'synthesis-chunk',
          content: "I'm AI Assistant, but no specialized agents have been configured yet. Please create an agent with relevant knowledge to help answer your questions.",
        });
        onProgress({ type: 'synthesis-done' });
        return;
      }

      onProgress({ type: 'planning' });
      const plan = await this.planner.createPlan({
        userMessage: command.message,
        conversationHistory: command.conversationHistory,
        availableAgents,
      });

      if (!plan) {
        onProgress({ type: 'synthesis-start' });
        await this.fallbackGenerator.generateStream(
          {
            userMessage: command.message,
            availableAgents,
            conversationHistory: command.conversationHistory,
          },
          (chunk) => {
            onProgress({ type: 'synthesis-chunk', content: chunk });
          }
        );
        onProgress({ type: 'synthesis-done' });
        return;
      }

      const results = new Map<string, AgentExecutionResult>();

      const executionContext = command.context ? {
        activeDelayAnalysisProjectId: command.context.activeDelayAnalysisProjectId
      } : undefined;

      if (plan.strategy === 'parallel') {
        await this.executeParallel(command.tenantId, plan, results, onProgress, command.conversationId, executionContext);
      } else {
        await this.executeSequential(command.tenantId, plan, results, onProgress, command.conversationId, executionContext);
      }

      const successfulResults = Array.from(results.values()).filter(r => r.success);

      if (successfulResults.length === 0) {
        onProgress({
          type: 'error',
          content: "I apologize, but I encountered errors while consulting the specialized agents. Please try again.",
        });
        return;
      }

      if (successfulResults.length === 1) {
        onProgress({ type: 'synthesis-done' });
        return;
      }

      onProgress({ type: 'synthesis-start' });
      await this.synthesizer.synthesizeStream(
        {
          originalQuestion: command.message,
          agentResults: successfulResults,
          conversationHistory: command.conversationHistory,
        },
        (chunk) => {
          onProgress({ type: 'synthesis-chunk', content: chunk });
        }
      );
      onProgress({ type: 'synthesis-done' });

    } catch (error) {
      onProgress({
        type: 'error',
        content: error instanceof Error ? error.message : 'An unexpected error occurred',
      });
    }
  }

  private async executeParallel(
    tenantId: string,
    plan: ExecutionPlan,
    results: Map<string, AgentExecutionResult>,
    onProgress: (progress: OrchestrationProgress) => void,
    conversationId?: string,
    context?: { activeDelayAnalysisProjectId?: string }
  ): Promise<void> {
    const promises = plan.steps.map(async (step) => {
      onProgress({ type: 'agent-start', agentId: step.agentId, agentName: step.agentName });

      const result = await this.executor.executeStream(
        step,
        tenantId,
        (chunk) => {
          onProgress({ type: 'agent-chunk', agentId: step.agentId, agentName: step.agentName, content: chunk });
        },
        undefined,
        conversationId,
        context
      );

      results.set(step.agentId, result);
      onProgress({ 
        type: 'agent-done', 
        agentId: step.agentId, 
        agentName: step.agentName, 
        content: result.success ? undefined : result.error 
      });

      if (result.metadata?.packageUpdated && result.metadata?.packageId) {
        onProgress({
          type: 'package-updated',
          packageId: result.metadata.packageId,
        });
      }
    });

    await Promise.all(promises);
  }

  private async executeSequential(
    tenantId: string,
    plan: ExecutionPlan,
    results: Map<string, AgentExecutionResult>,
    onProgress: (progress: OrchestrationProgress) => void,
    conversationId?: string,
    context?: { activeDelayAnalysisProjectId?: string }
  ): Promise<void> {
    for (const step of plan.steps) {
      onProgress({ type: 'agent-start', agentId: step.agentId, agentName: step.agentName });

      const result = await this.executor.executeStream(
        step,
        tenantId,
        (chunk) => {
          onProgress({ type: 'agent-chunk', agentId: step.agentId, agentName: step.agentName, content: chunk });
        },
        results,
        conversationId,
        context
      );

      results.set(step.agentId, result);
      onProgress({ 
        type: 'agent-done', 
        agentId: step.agentId, 
        agentName: step.agentName, 
        content: result.success ? undefined : result.error 
      });

      if (result.metadata?.packageUpdated && result.metadata?.packageId) {
        onProgress({
          type: 'package-updated',
          packageId: result.metadata.packageId,
        });
      }

      if (!result.success && step.dependsOn && step.dependsOn.length > 0) {
        break;
      }
    }
  }
}
