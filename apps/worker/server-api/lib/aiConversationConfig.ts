import * as Schema from 'effect/Schema';
import * as Config from 'effect/Config';
import * as ConfigProvider from 'effect/ConfigProvider';
import * as Effect from 'effect/Effect';
import type { ApiEnv } from './context.js';

const settings = Config.all({
  provider: Config.String('AI_PROVIDER').pipe(Config.withDefault('anthropic')),
  model: Config.String('AI_MODEL').pipe(Config.withDefault('claude-haiku-5-5')),
  thinking: Config.Boolean('AI_THINKING_ENABLED').pipe(Config.withDefault(false)),
  thinkingLevel: Config.String('AI_THINKING_LEVEL').pipe(Config.withDefault('low')),
});

export const loadAIConversationConfig = (env: ApiEnv['Bindings']) =>
  settings.pipe(
    Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromUnknown(env)),
    Effect.map((value) => {
      if (value.provider !== 'anthropic') throw new Error('Unsupported AI provider');

      if (
        value.thinkingLevel !== 'low' &&
        value.thinkingLevel !== 'medium' &&
        value.thinkingLevel !== 'high'
      ) {
        throw new Error('Invalid AI_THINKING_LEVEL');
      }

      return {
        ...value,
        thinkingLevel: Schema.decodeUnknownSync(Schema.Literals(['low', 'medium', 'high']))(
          value.thinkingLevel,
        ),
      };
    }),
  );

export const AI_OPERATION_TIMEOUT_MS = 5 * 60_000;
export const AI_MAX_CALLS = 2;
export const AI_RETENTION_MS = 30 * 24 * 60 * 60_000;
