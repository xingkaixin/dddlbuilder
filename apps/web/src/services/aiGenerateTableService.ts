import { readTextStream } from '@/services/streamingText';
import { buildAuthenticatedJsonHeaders, readAIErrorMessage } from '@/services/aiApi';
import type {
  ConversationMessage,
  GeneratedTableSchema,
} from '@ddlbuilder/shared-types/ai-generate';
import type { DatabaseType, PersistedState } from '@ddlbuilder/shared-types';
import type { AppLocale } from '@ddlbuilder/shared-types/locale';
import i18n from '@/i18n';
import { normalizeGeneratedTableSchema } from '@/utils/normalizeAiEnumValue';

const AI_GENERATE_API_ENDPOINT = '/api/generate-table';

export interface GenerateTableRequestOptions {
  mode?: 'generate' | 'patch';
  templates?: unknown[];
  existingConfig?: Partial<PersistedState>;
  previousSchema?: GeneratedTableSchema;
  conversationHistory?: ConversationMessage[];
}

interface RequestGenerateTableOptions {
  signal: AbortSignal;
  onStreamingText?: (text: string) => void;
}

interface RequestGenerateTablePayload {
  description: string;
  dbType: DatabaseType;
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
  const previousSchema =
    payload.options?.mode === 'patch' ? undefined : payload.options?.previousSchema;
  const existingConfig = previousSchema ? undefined : payload.options?.existingConfig;
  const response = await fetch(AI_GENERATE_API_ENDPOINT, {
    method: 'POST',
    headers: buildAuthenticatedJsonHeaders(),
    credentials: 'include',
    body: JSON.stringify({
      description: payload.description,
      dbType: payload.dbType,
      locale: payload.locale,
      mode: payload.options?.mode,
      templates: payload.options?.templates,
      existingConfig,
      previousSchema,
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
      result: normalizeGeneratedTableSchema(
        JSON.parse(fullText) as GeneratedTableSchema,
        payload.dbType,
        previousSchema?.fields ?? existingConfig?.rows ?? [],
      ),
    };
  } catch (error) {
    console.warn('[ai-generate] Invalid generated schema', error);
    throw new Error(i18n.t('services.parseResponseFailed'));
  }
}
