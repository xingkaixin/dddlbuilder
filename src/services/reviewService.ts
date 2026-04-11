import { readTextStream } from '@/services/streamingText';
import { buildAuthenticatedJsonHeaders, readAIErrorMessage } from '@/services/aiApi';
import type { AppLocale } from '@/types/locale';
import i18n from '@/i18n';
import { normalizeReviewSuggestions } from '@/utils/normalizeAiEnumValue';

const REVIEW_API_ENDPOINT = '/api/review';

export interface ReviewRequestPayload {
  ddl: string;
  tableName: string;
  dbType: string;
  locale?: AppLocale;
}

export interface ReviewServiceResult {
  score: number;
  summary: string;
  suggestions: unknown[];
}

interface RequestDDLReviewOptions {
  signal: AbortSignal;
  onStreamingText?: (text: string) => void;
  accessToken?: string | null;
}

function normalizeReviewPayload(payload: unknown): ReviewServiceResult {
  if (!payload || typeof payload !== 'object') {
    return {
      score: 5,
      summary: i18n.t('services.reviewDone'),
      suggestions: [],
    };
  }

  const data = payload as Record<string, unknown>;
  return {
    score: Math.min(10, Math.max(1, Number(data.score) || 5)),
    summary: typeof data.summary === 'string' ? data.summary : i18n.t('services.reviewDone'),
    suggestions: Array.isArray(data.suggestions)
      ? normalizeReviewSuggestions(data.suggestions)
      : [],
  };
}

function extractJsonObject(text: string): string {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(i18n.t('services.parseReviewFailed'));
  }
  return jsonMatch[0];
}

export async function requestDDLReview(
  payload: ReviewRequestPayload,
  options: RequestDDLReviewOptions,
): Promise<ReviewServiceResult> {
  const response = await fetch(REVIEW_API_ENDPOINT, {
    method: 'POST',
    headers: buildAuthenticatedJsonHeaders(options.accessToken ?? null),
    body: JSON.stringify(payload),
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(await readAIErrorMessage(response, 'reviewFailed'));
  }

  if (!response.body) {
    throw new Error(i18n.t('services.noResponseBody'));
  }

  const fullText = await readTextStream(response.body, {
    onUpdate: options.onStreamingText,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonObject(fullText));
  } catch {
    throw new Error(i18n.t('services.parseReviewFailed'));
  }

  return normalizeReviewPayload(parsed);
}
