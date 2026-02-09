import { readTextStream } from '@/services/streamingText';

const REVIEW_API_ENDPOINT = '/api/review';

export interface ReviewRequestPayload {
  ddl: string;
  tableName: string;
  dbType: string;
}

export interface ReviewServiceResult {
  score: number;
  summary: string;
  suggestions: unknown[];
}

interface RequestDDLReviewOptions {
  signal: AbortSignal;
  onStreamingText?: (text: string) => void;
}

function normalizeReviewPayload(payload: unknown): ReviewServiceResult {
  if (!payload || typeof payload !== 'object') {
    return {
      score: 5,
      summary: '评审完成',
      suggestions: [],
    };
  }

  const data = payload as Record<string, unknown>;
  return {
    score: Math.min(10, Math.max(1, Number(data.score) || 5)),
    summary: typeof data.summary === 'string' ? data.summary : '评审完成',
    suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
  };
}

function extractJsonObject(text: string): string {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('无法解析评审结果');
  }
  return jsonMatch[0];
}

export async function requestDDLReview(
  payload: ReviewRequestPayload,
  options: RequestDDLReviewOptions,
): Promise<ReviewServiceResult> {
  const response = await fetch(REVIEW_API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: options.signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      typeof errorData.error === 'string'
        ? errorData.error
        : `请求失败: ${response.status}`,
    );
  }

  if (!response.body) {
    throw new Error('无法读取响应流');
  }

  const fullText = await readTextStream(response.body, {
    onUpdate: options.onStreamingText,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonObject(fullText));
  } catch {
    throw new Error('无法解析评审结果');
  }

  return normalizeReviewPayload(parsed);
}
