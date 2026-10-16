import { expect, it } from 'vitest';
import { mergeReviewSuggestions } from '../../lib/aiReviewProjection.js';

it('retains complete review cards through truncated replacement JSON and updates matching IDs', () => {
  const first = { id: 's1', type: 'general', description: 'Original advice', actionable: false };
  const retained = mergeReviewSuggestions([], `{"suggestions":[${JSON.stringify(first)},{"id":`);
  expect(retained).toEqual([first]);
  expect(mergeReviewSuggestions(retained, '{"suggestions":[')).toEqual([first]);
  const changed = { ...first, description: 'Updated advice' };
  expect(mergeReviewSuggestions(retained, JSON.stringify({ suggestions: [changed] }))).toEqual([
    changed,
  ]);
});
