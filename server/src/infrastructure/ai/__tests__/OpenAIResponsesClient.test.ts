import { describe, it, expect, vi } from 'vitest';
import { OpenAIResponsesClient } from '../OpenAIResponsesClient';
import { ModelId } from '../../../domain/value-objects/ModelId';
import { AIMessage } from '../../../domain/value-objects/AIMessage';
import { AIResponseTruncatedError } from '../../../domain/errors/DomainError';

function makeFakeAzureClient(createImpl: (params: any) => any) {
  return {
    chat: {
      completions: {
        create: vi.fn(createImpl),
      },
    },
  } as any;
}

describe('OpenAIResponsesClient.chat', () => {
  it('sends reasoning_effort derived from the model when no temperature is given', async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });
    const client = new OpenAIResponsesClient(makeFakeAzureClient(create) as any);
    client['client'].chat.completions.create = create;

    await client.chat({ model: ModelId.gpt54High(), messages: [AIMessage.user('hi')] });

    expect(create).toHaveBeenCalledTimes(1);
    const requestBody = create.mock.calls[0][0];
    expect(requestBody.reasoning_effort).toBe('high');
    expect(requestBody).not.toHaveProperty('temperature');
  });

  it('translates an explicit temperature into reasoning_effort: none instead of forwarding it, since the deployment rejects any non-default temperature outright', async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });
    const client = new OpenAIResponsesClient(makeFakeAzureClient(create) as any);
    client['client'].chat.completions.create = create;

    await client.chat({
      model: ModelId.gpt54High(),
      messages: [AIMessage.user('hi')],
      temperature: 0,
    });

    const requestBody = create.mock.calls[0][0];
    expect(requestBody.reasoning_effort).toBe('none');
    expect(requestBody).not.toHaveProperty('temperature');
  });

  it('uses medium reasoning effort for the base gpt-5.4 model', async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });
    const client = new OpenAIResponsesClient(makeFakeAzureClient(create) as any);
    client['client'].chat.completions.create = create;

    await client.chat({ model: ModelId.gpt54(), messages: [AIMessage.user('hi')] });

    expect(create.mock.calls[0][0].reasoning_effort).toBe('medium');
  });

  it('throws AIResponseTruncatedError when finish_reason is length', async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: '{"partial":' }, finish_reason: 'length' }],
      usage: { prompt_tokens: 10, completion_tokens: 16000 },
    });
    const client = new OpenAIResponsesClient(makeFakeAzureClient(create) as any);
    client['client'].chat.completions.create = create;

    await expect(
      client.chat({ model: ModelId.gpt54(), messages: [AIMessage.user('hi')] })
    ).rejects.toBeInstanceOf(AIResponseTruncatedError);
  });
});

describe('OpenAIResponsesClient.streamChat', () => {
  async function* fakeStream(chunks: any[]) {
    for (const chunk of chunks) {
      yield chunk;
    }
  }

  it('emits an error chunk instead of done when the stream is truncated', async () => {
    const create = vi.fn().mockResolvedValue(
      fakeStream([
        { choices: [{ delta: { content: 'partial' } }] },
        { choices: [{ finish_reason: 'length' }] },
        { choices: [{}], usage: { prompt_tokens: 5, completion_tokens: 16000 } },
      ])
    );
    const client = new OpenAIResponsesClient(makeFakeAzureClient(create) as any);
    client['client'].chat.completions.create = create;

    const received: any[] = [];
    await client.streamChat(
      { model: ModelId.gpt54(), messages: [AIMessage.user('hi')] },
      (chunk) => received.push(chunk)
    );

    const requestBody = create.mock.calls[0][0];
    expect(requestBody.reasoning_effort).toBe('medium');
    expect(requestBody).not.toHaveProperty('temperature');

    expect(received.some(c => c.type === 'content')).toBe(true);
    expect(received.some(c => c.type === 'done')).toBe(false);
    const errorChunk = received.find(c => c.type === 'error');
    expect(errorChunk).toBeDefined();
    expect(errorChunk.error).toMatch(/truncat/i);
  });

  it('emits a done chunk on a normal completion', async () => {
    const create = vi.fn().mockResolvedValue(
      fakeStream([
        { choices: [{ delta: { content: 'hello' } }] },
        { choices: [{ finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 5 } },
      ])
    );
    const client = new OpenAIResponsesClient(makeFakeAzureClient(create) as any);
    client['client'].chat.completions.create = create;

    const received: any[] = [];
    await client.streamChat(
      { model: ModelId.gpt54(), messages: [AIMessage.user('hi')] },
      (chunk) => received.push(chunk)
    );

    expect(received.some(c => c.type === 'done')).toBe(true);
    expect(received.some(c => c.type === 'error')).toBe(false);
  });
});
