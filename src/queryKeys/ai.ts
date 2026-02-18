import type { ConversationMessage } from '@/types/aiGenerate';
import type { FieldRow, IndexDefinition } from '@/types';

interface DDLReviewKeyParams {
  ddl: string;
  tableName: string;
  dbType: string;
  locale?: string;
}

interface AIGenerateKeyParams {
  description: string;
  dbType: string;
  locale?: string;
  templates?: unknown[];
  existingConfig?: Partial<{
    tableName: string;
    rows: FieldRow[];
    indexes: IndexDefinition[];
  }>;
  conversationHistory?: ConversationMessage[];
}

function serializeKeyPayload(payload: unknown): string {
  return JSON.stringify(payload ?? null);
}

export function buildDDLReviewQueryKey({
  ddl,
  tableName,
  dbType,
  locale,
}: DDLReviewKeyParams) {
  return ['ddl-review', locale ?? 'zh-CN', dbType, tableName, ddl] as const;
}

export function buildAIGenerateQueryKey({
  description,
  dbType,
  locale,
  templates,
  existingConfig,
  conversationHistory,
}: AIGenerateKeyParams) {
  return [
    'ai-generate-table',
    locale ?? 'zh-CN',
    dbType,
    description,
    serializeKeyPayload({
      templates: templates ?? [],
      existingConfig: existingConfig ?? null,
      conversationHistory: conversationHistory ?? [],
    }),
  ] as const;
}
