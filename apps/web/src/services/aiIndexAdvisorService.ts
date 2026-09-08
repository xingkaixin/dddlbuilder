import { buildAuthenticatedJsonHeaders, readAIErrorMessage } from '@/services/aiApi';
import {
  decodeAIIndexAdvisorResult,
  type AIIndexAdvisorRequest,
  type AIIndexAdvisorResult,
} from '@ddlbuilder/shared-types/ai-generate';
import i18n from '@/i18n';

const AI_INDEX_ADVISOR_API_ENDPOINT = '/api/index-advisor';

export async function requestAIIndexAdvice(
  payload: AIIndexAdvisorRequest,
  signal: AbortSignal,
): Promise<AIIndexAdvisorResult> {
  const response = await fetch(AI_INDEX_ADVISOR_API_ENDPOINT, {
    method: 'POST',
    headers: buildAuthenticatedJsonHeaders(),
    credentials: 'include',
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    throw new Error(await readAIErrorMessage(response, 'generationFailed'));
  }

  return decodeAIIndexAdvisorResult(await response.json());
}

export function assertAIIndexAdvisorTarget(payload: AIIndexAdvisorRequest) {
  if (!payload.tableName.trim() || payload.fields.length === 0) {
    throw new Error(i18n.t('aiIndexAdvisor.schemaRequired'));
  }
  if (!payload.queryPatterns.trim()) {
    throw new Error(i18n.t('aiIndexAdvisor.queryRequired'));
  }
}
