import * as Result from 'effect/Result';
import * as Schema from 'effect/Schema';
import * as SchemaIssue from 'effect/SchemaIssue';
import type { ApiErrorCode } from './http.js';
import type { AIRequestRejection } from './aiRoute.js';

type RequestError = { code: ApiErrorCode; message: string };

const formatIssue = SchemaIssue.makeFormatterStandardSchemaV1();

export const decodeAIRequest = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  errors: Partial<Record<keyof S['Type'], RequestError>>,
  fallback: RequestError,
) => {
  const decode = Schema.decodeUnknownResult(schema);
  const isString = (value: unknown): value is string => typeof value === 'string';

  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- this adapter accepts raw JSON and immediately decodes it with the supplied schema.
  return (body: unknown): S['Type'] | AIRequestRejection => {
    const result = decode(body);

    if (Result.isSuccess(result)) return result.success;
    const field = formatIssue(result.failure.issue).issues[0]?.path?.[0];
    // SAFETY: Schema issue paths identify fields by string, and errors is keyed by the schema type.
    const error = isString(field) ? errors[field as keyof S['Type']] : undefined;

    return { status: 400, ...(error ?? fallback) };
  };
};
