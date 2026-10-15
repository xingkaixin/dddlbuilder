// oxlint-disable anti-slop/no-runtime-typeof -- The validated suggestion contract is a string/object union.
import { JSONParser } from '@streamparser/json';
import * as Schema from 'effect/Schema';
import * as Result from 'effect/Result';
import {
  DDLReviewSuggestionSchema,
  type DDLReviewSuggestion,
} from '@ddlbuilder/shared-types/ddl-review';

export const mergeReviewSuggestions = (previous: readonly DDLReviewSuggestion[], text: string) => {
  const suggestions = new Map(
    previous.map((item) => [typeof item === 'string' ? item : item.id, item]),
  );
  const parser = new JSONParser({ paths: ['$.suggestions.*'], keepStack: false });
  parser.onValue = ({ value }) => {
    const decoded = Schema.decodeUnknownResult(DDLReviewSuggestionSchema)(value);

    if (Result.isFailure(decoded)) return;
    const item = decoded.success;
    const key = typeof item === 'string' ? item : item.id;

    if (suggestions.size >= 100 && !suggestions.has(key)) return;
    suggestions.set(key, item);
  };

  try {
    if (text) parser.write(text);
  } catch {
    /* Complete, validated items remain usable when the trailing model JSON is incomplete. */
  }

  return [...suggestions.values()];
};
