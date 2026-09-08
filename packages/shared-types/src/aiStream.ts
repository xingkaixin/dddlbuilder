import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Result from 'effect/Result';
import * as Schema from 'effect/Schema';
import { API_ERROR_CODES } from './api.js';

// Unknown codes from newer servers fall back to the error message.
const errorCode = Schema.Literals(API_ERROR_CODES).pipe(
  Schema.catchDecoding(() => Effect.succeed(Option.none())),
  Schema.optional,
);

export const AIStreamEventSchema = Schema.Union([
  Schema.Struct({ type: Schema.Literal('delta'), text: Schema.String }),
  Schema.Struct({ type: Schema.Literal('done') }),
  Schema.Struct({
    type: Schema.Literal('error'),
    error: Schema.String,
    code: errorCode,
    requestId: Schema.optional(Schema.String),
  }),
]);
export type AIStreamEvent = typeof AIStreamEventSchema.Type;

const jsonEvent = Schema.fromJsonString(AIStreamEventSchema);
const decode = Schema.decodeUnknownResult(jsonEvent);
const encode = Schema.encodeSync(jsonEvent);

export const decodeAIStreamEvent = (line: string): AIStreamEvent | undefined => {
  const result = decode(line);
  return Result.isSuccess(result) ? result.success : undefined;
};
export const encodeAIStreamEvent = (event: AIStreamEvent): string => `${encode(event)}\n`;
