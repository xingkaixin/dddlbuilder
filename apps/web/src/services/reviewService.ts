import type { DDLReviewSuggestion } from '@ddlbuilder/shared-types/ddl-review';
import { fetchAIConversation, resumeAIConversation } from './aiConversationService';
import { readTextStream } from '@/services/streamingText';
import { buildAuthenticatedJsonHeaders, readAIErrorMessage } from '@/services/aiApi';
import {
  normalizeDDLReviewResult,
  type DDLReviewResult,
} from '@ddlbuilder/shared-types/ddl-review';
import type { AppLocale } from '@ddlbuilder/shared-types/locale';
import type { DatabaseType } from '@ddlbuilder/shared-types';
import i18n from '@/i18n';

type ReviewRequestPayload = {
  ddl: string;
  tableName: string;
  dbType: DatabaseType;
  locale?: AppLocale;
};

type ReviewServiceResult = DDLReviewResult;

interface RequestDDLReviewOptions {
  signal: AbortSignal;
  onStreamingText?: (text: string) => void;
  onThinking?: (text: string) => void;
  onSuggestions?: (items: readonly DDLReviewSuggestion[]) => void;
}

// The review response is normalized by the shared decoder before service use.
// oxlint-disable-next-line anti-slop/no-unknown-parameters
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

async function readReviewResponse(
  response: Response,
  options: RequestDDLReviewOptions,
): Promise<ReviewServiceResult> {
  if (!response.ok) {
    throw new Error(await readAIErrorMessage(response, 'reviewFailed'));
  }

  if (!response.body) {
    throw new Error(i18n.t('services.noResponseBody'));
  }

  const fullText = await readTextStream(response.body, {
    onUpdate: options.onStreamingText,
    onThinking: options.onThinking,
    onSuggestions: options.onSuggestions,
  });

  let parsed: unknown;

  try {
    parsed = JSON.parse(extractJsonObject(fullText));
  } catch {
    throw new Error(i18n.t('services.parseReviewFailed'));
  }

  return normalizeReviewPayload(parsed);
}

export async function requestDDLReview(
  payload: ReviewRequestPayload,
  options: RequestDDLReviewOptions & { resumeKey?: string },
): Promise<ReviewServiceResult> {
  const response = await fetchAIConversation(
    'review',
    {
      method: 'POST',
      headers: buildAuthenticatedJsonHeaders(),
      credentials: 'include',
      body: JSON.stringify(payload),
      signal: options.signal,
    },
    { resumeKey: options.resumeKey },
  );

  return readReviewResponse(response, options);
}

export async function resumeDDLReview(
  resumeKey: string,
  options: RequestDDLReviewOptions,
): Promise<ReviewServiceResult | null> {
  const response = resumeAIConversation(resumeKey, options.signal);

  return response ? readReviewResponse(response, options) : null;
}
