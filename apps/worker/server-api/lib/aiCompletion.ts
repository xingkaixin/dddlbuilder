import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { AIOutputError } from './aiErrors.js';

const decodeCompletion = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)),
);

export const readCompletedContent = (
  content: string,
  finishReason: string | null | undefined,
  jsonResponse: boolean,
) =>
  Effect.gen(function* () {
    if (finishReason === 'length') return yield* new AIOutputError({ reason: 'truncated' });
    if (finishReason !== 'stop') return yield* new AIOutputError({ reason: 'incomplete' });
    if (!content.trim()) return yield* new AIOutputError({ reason: 'empty' });
    if (!jsonResponse) return content;

    return yield* decodeCompletion(content).pipe(
      Effect.mapError((cause) => new AIOutputError({ reason: 'invalid-json', cause })),
    );
  });
