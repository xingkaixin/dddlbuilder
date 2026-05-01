import { buildAuthenticatedJsonHeaders, readAIErrorMessage } from '@/services/aiApi';
import type {
  AIIndexAdvisorRecommendation,
  AIIndexAdvisorRequest,
  AIIndexAdvisorResult,
} from '@ddlbuilder/shared-types/ai-generate';
import i18n from '@/i18n';

const AI_INDEX_ADVISOR_API_ENDPOINT = '/api/index-advisor';

function normalizeRecommendation(
  item: unknown,
  index: number,
): AIIndexAdvisorRecommendation | null {
  if (!item || typeof item !== 'object') return null;
  const data = item as Partial<AIIndexAdvisorRecommendation>;
  if (typeof data.title !== 'string' || typeof data.rationale !== 'string') return null;
  if (
    data.category !== 'missing_index' &&
    data.category !== 'redundant_index' &&
    data.category !== 'order_optimization' &&
    data.category !== 'query_rewrite' &&
    data.category !== 'general'
  ) {
    return null;
  }

  return {
    id: typeof data.id === 'string' && data.id ? data.id : `rec_${index + 1}`,
    category: data.category,
    title: data.title,
    rationale: data.rationale,
    confidence:
      data.confidence === 'high' || data.confidence === 'low' ? data.confidence : 'medium',
    ...(data.index ? { index: data.index } : {}),
    ...(data.targetIndexName ? { targetIndexName: data.targetIndexName } : {}),
    ...(Array.isArray(data.affectedQueries) ? { affectedQueries: data.affectedQueries } : {}),
  };
}

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

  const data = (await response.json()) as Partial<AIIndexAdvisorResult>;
  return {
    summary: typeof data.summary === 'string' ? data.summary : '',
    recommendations: Array.isArray(data.recommendations)
      ? data.recommendations
          .map((item, index) => normalizeRecommendation(item, index))
          .filter((item): item is AIIndexAdvisorRecommendation => item !== null)
      : [],
  };
}

export function assertAIIndexAdvisorTarget(payload: AIIndexAdvisorRequest) {
  if (!payload.tableName.trim() || payload.fields.length === 0) {
    throw new Error(i18n.t('aiIndexAdvisor.schemaRequired'));
  }
  if (!payload.queryPatterns.trim()) {
    throw new Error(i18n.t('aiIndexAdvisor.queryRequired'));
  }
}
