import type { ConversationMessage } from '@/types/aiGenerate';
import type { FieldRow, IndexDefinition } from '@/types';

interface DDLReviewKeyParams {
  ddl: string;
  tableName: string;
  dbType: string;
}

interface AIGenerateKeyParams {
  description: string;
  dbType: string;
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
}: DDLReviewKeyParams) {
  return ['ddl-review', dbType, tableName, ddl] as const;
}

export function buildAIGenerateQueryKey({
  description,
  dbType,
  templates,
  existingConfig,
  conversationHistory,
}: AIGenerateKeyParams) {
  return [
    'ai-generate-table',
    dbType,
    description,
    serializeKeyPayload({
      templates: templates ?? [],
      existingConfig: existingConfig ?? null,
      conversationHistory: conversationHistory ?? [],
    }),
  ] as const;
}
