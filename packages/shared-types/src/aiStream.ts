import type { ApiErrorPayload } from './api.js';

export type AIStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done' }
  | ({ type: 'error' } & ApiErrorPayload);

export const encodeAIStreamEvent = (event: AIStreamEvent): string => `${JSON.stringify(event)}\n`;
