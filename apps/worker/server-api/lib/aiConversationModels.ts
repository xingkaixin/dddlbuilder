import {
  InMemoryCredentialStore,
  type AssistantMessage,
  type JsonValue,
} from '@earendil-works/pi-ai';
import { createModels, hasApi } from '@earendil-works/pi-ai/models';
import { anthropicProvider } from '@earendil-works/pi-ai/providers/anthropic';
import { AssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream';
import * as Schema from 'effect/Schema';
import { AI_CONTEXT_LIMIT_ERROR } from '@ddlbuilder/shared-types';
import type { ApiEnv } from './context.js';
import type { AIRouteKey } from './aiRouteKey.js';
import { admitAICall } from './aiConversationUsage.js';
import type { AIScenario } from './aiScenarios.js';

export type AIModelRequest = {
  operationId: string;
  route: AIRouteKey;
  scenario: AIScenario;
  thinking: boolean;
};

export const createAIConversationModels = async (
  env: ApiEnv['Bindings'],
  request: () => Promise<AIModelRequest>,
  saveUsage: (
    id: string,
    response: AssistantMessage,
    receipt: 'complete' | 'partial' | 'rejected',
  ) => Promise<void>,
  waitUntil: (promise: Promise<unknown>) => void,
) => {
  const credentials = new InMemoryCredentialStore();
  await credentials.modify('anthropic', async () => ({
    type: 'api_key',
    key: env.ANTHROPIC_API_KEY,
  }));
  const models = createModels({ credentials });
  const provider = anthropicProvider();
  models.setProvider({
    ...provider,
    streamSimple(model, context, options) {
      const output = new AssistantMessageEventStream();

      const task = async () => {
        try {
          if (!hasApi(model, 'anthropic-messages')) throw new Error('Unsupported model API');
          const current = await request();
          const inputSize = JSON.stringify(context.messages).length;

          if (inputSize > 120_000) throw new Error(AI_CONTEXT_LIMIT_ERROR);

          const schema = current.scenario.outputSchema
            ? Schema.toJsonSchemaDocument(Schema.toType(current.scenario.outputSchema), {
                onExcessProperty: 'error',
              })
            : undefined;
          let call: string | undefined;
          let rejected = false;
          let admissionFailed = false;

          const upstream = provider.streamSimple(model, context, {
            ...options,
            maxRetries: 0,
            fetch: async (input, init) => {
              options?.signal?.throwIfAborted();

              try {
                call = await admitAICall(env, current.operationId, current.route, model.id, {
                  inputTokens: inputSize,
                  maxOutputTokens: current.scenario.maxTokens,
                });
              } catch (error) {
                admissionFailed = true;
                throw error;
              }

              const response = await (options?.fetch ?? globalThis.fetch)(input, init);
              rejected = response.status >= 400 && response.status < 500 && response.status !== 408;

              return response;
            },
            maxTokens: current.scenario.maxTokens,
            onPayload(payload) {
              // SAFETY: the registered Anthropic provider constructs a JSON object payload.
              const body = payload as Record<string, JsonValue>;

              return {
                ...body,
                ...(current.thinking ? {} : { thinking: { type: 'disabled' } }),
                ...(schema
                  ? {
                      output_config: {
                        ...(current.thinking ? { effort: options?.reasoning } : {}),
                        format: {
                          type: 'json_schema',
                          schema: { ...schema.schema, $defs: schema.definitions },
                        },
                      },
                    }
                  : {}),
              };
            },
          });

          for await (const event of upstream) {
            if (event.type !== 'done' && event.type !== 'error') output.push(event);
          }

          const result = await upstream.result();

          if (admissionFailed) result.errorMessage = 'AI application admission unavailable';

          if (call)
            await saveUsage(
              call,
              result,
              rejected
                ? 'rejected'
                : result.stopReason === 'error' || result.stopReason === 'aborted'
                  ? 'partial'
                  : 'complete',
            );

          if (
            result.stopReason === 'stop' ||
            result.stopReason === 'length' ||
            result.stopReason === 'toolUse'
          ) {
            output.push({ type: 'done', reason: result.stopReason, message: result });
          } else
            output.push({
              type: 'error',
              reason: result.stopReason === 'aborted' ? 'aborted' : 'error',
              error: result,
            });
        } catch (error) {
          const message: AssistantMessage = {
            role: 'assistant',
            content: [],
            api: 'anthropic-messages',
            provider: model.provider,
            model: model.id,
            timestamp: Date.now(),
            stopReason: 'error',
            errorMessage:
              error instanceof Error && error.message === AI_CONTEXT_LIMIT_ERROR
                ? AI_CONTEXT_LIMIT_ERROR
                : 'AI application admission or accounting unavailable',
            usage: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 0,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
          };
          output.push({ type: 'error', reason: 'error', error: message });
        }
      };
      waitUntil(task());

      return output;
    },
  });

  return models;
};
