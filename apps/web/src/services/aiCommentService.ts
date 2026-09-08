import { buildAuthenticatedJsonHeaders, readAIErrorMessage } from '@/services/aiApi';
import {
  decodeAICommentResult,
  type AICommentRequest,
  type AICommentResult,
} from '@ddlbuilder/shared-types/ai-generate';
import i18n from '@/i18n';

const AI_COMMENT_API_ENDPOINT = '/api/generate-comments';

export async function requestAIComments(
  payload: AICommentRequest,
  signal: AbortSignal,
): Promise<AICommentResult> {
  const response = await fetch(AI_COMMENT_API_ENDPOINT, {
    method: 'POST',
    headers: buildAuthenticatedJsonHeaders(),
    credentials: 'include',
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    throw new Error(await readAIErrorMessage(response, 'generationFailed'));
  }

  return decodeAICommentResult(await response.json());
}

export function assertAICommentTarget(payload: AICommentRequest) {
  if (!payload.tableName.trim() || payload.fields.length === 0) {
    throw new Error(i18n.t('aiComments.schemaRequired'));
  }
}
