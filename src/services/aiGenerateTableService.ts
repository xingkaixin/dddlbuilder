import { readTextStream } from '@/services/streamingText';
import { buildAuthenticatedJsonHeaders, readAIErrorMessage } from '@/services/aiApi';
import type { ConversationMessage, GeneratedTableSchema } from '@/types/aiGenerate';
import type { FieldRow, IndexDefinition } from '@/types';
import type { AppLocale } from '@/types/locale';
import i18n from '@/i18n';
import { normalizeGeneratedTableSchema } from '@/utils/normalizeAiEnumValue';

const AI_GENERATE_API_ENDPOINT = '/api/generate-table';

export interface GenerateTableRequestOptions {
  templates?: unknown[];
  existingConfig?: Partial<{
    schemaName: string;
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
  locale?: AppLocale;
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
    headers: buildAuthenticatedJsonHeaders(),
    credentials: 'include',
    body: JSON.stringify({
      description: payload.description,
      dbType: payload.dbType,
      locale: payload.locale,
      templates: payload.options?.templates,
      existingConfig: payload.options?.existingConfig,
      conversationHistory: payload.options?.conversationHistory ?? [],
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(await readAIErrorMessage(response, 'generationFailed'));
  }

  if (!response.body) {
    throw new Error(i18n.t('services.noResponseBody'));
  }

  const fullText = await readTextStream(response.body, {
    onUpdate: options.onStreamingText,
  });

  try {
    return {
      fullText,
      result: normalizeGeneratedTableSchema(JSON.parse(fullText) as GeneratedTableSchema),
    };
  } catch {
    throw new Error(i18n.t('services.parseResponseFailed'));
  }
}
