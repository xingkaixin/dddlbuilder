import { readTextStream } from '@/services/streamingText';
import { buildAuthenticatedJsonHeaders, readAIErrorMessage } from '@/services/aiApi';
import {
  normalizeDDLReviewResult,
  type DDLReviewResult,
} from '@ddlbuilder/shared-types/ddl-review';
import type { AppLocale } from '@ddlbuilder/shared-types/locale';
import i18n from '@/i18n';

const REVIEW_API_ENDPOINT = '/api/review';

type ReviewRequestPayload = {
  ddl: string;
  tableName: string;
  dbType: string;
  locale?: AppLocale;
};

type ReviewServiceResult = DDLReviewResult;

interface RequestDDLReviewOptions {
  signal: AbortSignal;
  onStreamingText?: (text: string) => void;
}

function normalizeReviewPayload(payload: unknown): ReviewServiceResult {
  return normalizeDDLReviewResult(payload, i18n.t('services.reviewDone'));
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
    headers: buildAuthenticatedJsonHeaders(),
    credentials: 'include',
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
