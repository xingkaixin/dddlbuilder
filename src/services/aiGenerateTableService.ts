import { readTextStream } from '@/services/streamingText';
import type {
  ConversationMessage,
  GeneratedTableSchema,
} from '@/types/aiGenerate';
import type { FieldRow, IndexDefinition } from '@/types';

const AI_GENERATE_API_ENDPOINT = '/api/generate-table';

export interface GenerateTableRequestOptions {
  templates?: unknown[];
  existingConfig?: Partial<{
    tableName: string;
    rows: FieldRow[];
    indexes: IndexDefinition[];
  }>;
  conversationHistory?: ConversationMessage[];
}

interface RequestGenerateTableOptions {
  signal: AbortSignal;
  onStreamingText?: (text: string) => void;
}

interface RequestGenerateTablePayload {
  description: string;
  dbType: string;
  options?: GenerateTableRequestOptions;
}

export interface GenerateTableServiceResult {
  fullText: string;
  result: GeneratedTableSchema;
}

export async function requestGenerateTable(
  payload: RequestGenerateTablePayload,
  options: RequestGenerateTableOptions,
): Promise<GenerateTableServiceResult> {
  const response = await fetch(AI_GENERATE_API_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: payload.description,
      dbType: payload.dbType,
      templates: payload.options?.templates,
      existingConfig: payload.options?.existingConfig,
      conversationHistory: payload.options?.conversationHistory ?? [],
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Generation failed');
  }

  if (!response.body) {
    throw new Error('No response body');
  }

  const fullText = await readTextStream(response.body, {
    onUpdate: options.onStreamingText,
  });

  try {
    return {
      fullText,
      result: JSON.parse(fullText) as GeneratedTableSchema,
    };
  } catch {
    throw new Error('Failed to parse response');
  }
}
