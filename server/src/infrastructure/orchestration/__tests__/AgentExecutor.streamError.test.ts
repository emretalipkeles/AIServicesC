import { describe, it, expect, vi } from 'vitest';
import { AgentExecutor } from '../AgentExecutor';
import { Agent } from '../../../domain/entities/Agent';
import type { ExecutionStep } from '../../../domain/value-objects/ExecutionPlan';

function makeAgent(model: string): Agent {
  return new Agent({
    id: 'agent-1',
    tenantId: 'default',
    name: 'Test Agent',
    systemPrompt: 'You are a test agent.',
    model,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

const step: ExecutionStep = {
  agentId: 'agent-1',
  agentName: 'Test Agent',
  refinedPrompt: 'What happened?',
};

describe('AgentExecutor.executeStream truncation handling', () => {
  it('reports failure when the underlying stream emits an error chunk (e.g. truncation)', async () => {
    const agentRepository = { findById: vi.fn().mockResolvedValue(makeAgent('gpt-5.4')) } as any;
    const chunkRepository = { findByAgentId: vi.fn().mockResolvedValue([]) } as any;

    const fakeClient = {
      streamChat: vi.fn(async (_options: any, onChunk: (c: any) => void) => {
        onChunk({ type: 'content', content: 'partial answer' });
        onChunk({ type: 'error', error: 'AI response truncated (finish_reason=length)' });
      }),
    };
    const aiClientFactory = { getClientForModel: vi.fn().mockReturnValue(fakeClient) } as any;

    const executor = new AgentExecutor(agentRepository, chunkRepository, aiClientFactory);

    const chunks: string[] = [];
    const result = await executor.executeStream(step, 'default', (c) => chunks.push(c));

    expect(chunks.join('')).toBe('partial answer');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/truncat/i);
  });

  it('reports success when the stream completes without an error chunk', async () => {
    const agentRepository = { findById: vi.fn().mockResolvedValue(makeAgent('gpt-5.4')) } as any;
    const chunkRepository = { findByAgentId: vi.fn().mockResolvedValue([]) } as any;

    const fakeClient = {
      streamChat: vi.fn(async (_options: any, onChunk: (c: any) => void) => {
        onChunk({ type: 'content', content: 'full answer' });
        onChunk({ type: 'done', inputTokens: 5, outputTokens: 5 });
      }),
    };
    const aiClientFactory = { getClientForModel: vi.fn().mockReturnValue(fakeClient) } as any;

    const executor = new AgentExecutor(agentRepository, chunkRepository, aiClientFactory);

    const chunks: string[] = [];
    const result = await executor.executeStream(step, 'default', (c) => chunks.push(c));

    expect(result.success).toBe(true);
    expect(result.response).toBe('full answer');
  });

  it('omits temperature and raises maxTokens for an OpenAI-routed model', async () => {
    const agentRepository = { findById: vi.fn().mockResolvedValue(makeAgent('gpt-5.4-high')) } as any;
    const chunkRepository = { findByAgentId: vi.fn().mockResolvedValue([]) } as any;

    const fakeClient = {
      streamChat: vi.fn(async (_options: any, onChunk: (c: any) => void) => {
        onChunk({ type: 'done', inputTokens: 1, outputTokens: 1 });
      }),
    };
    const aiClientFactory = { getClientForModel: vi.fn().mockReturnValue(fakeClient) } as any;

    const executor = new AgentExecutor(agentRepository, chunkRepository, aiClientFactory);
    await executor.executeStream(step, 'default', () => {});

    const passedOptions = fakeClient.streamChat.mock.calls[0][0];
    expect(passedOptions.temperature).toBeUndefined();
    expect(passedOptions.maxTokens).toBeGreaterThanOrEqual(8000);
  });
});
