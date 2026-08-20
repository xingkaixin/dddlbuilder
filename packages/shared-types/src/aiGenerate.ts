import type { FieldDefaultKind, FieldOnUpdate } from './fieldRow.js';

export interface GeneratedTableSchema {
  schemaName?: string;
  tableName: string;
  tableComment: string;
  fields: GeneratedField[];
  indexes?: GeneratedIndex[];
  designDecisions?: GeneratedDesignDecision[];
}

export interface GeneratedField {
  fieldName: string;
  fieldType: string;
  fieldComment: string;
  nullable: boolean;
  defaultKind: FieldDefaultKind;
  defaultValue?: string;
  onUpdate?: FieldOnUpdate;
  isPrimaryKey?: boolean;
}

export interface GeneratedIndex {
  name: string;
  fields: Array<{ name: string; direction: 'ASC' | 'DESC' }>;
  unique: boolean;
}

export interface GeneratedDesignDecision {
  title: string;
  rationale: string;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface PartialTableSchema {
  schemaName?: string;
  tableName?: string;
  tableComment?: string;
  fields?: GeneratedField[];
  indexes?: GeneratedIndex[];
  designDecisions?: GeneratedDesignDecision[];
}

export type AICommentMode = 'fill_missing' | 'translate';

export interface AICommentFieldInput {
  fieldName: string;
  fieldType: string;
  fieldComment: string;
}

export interface AICommentRequest {
  mode: AICommentMode;
  targetLocale: 'zh-CN' | 'en-US';
  schemaName?: string;
  tableName: string;
  tableComment: string;
  fields: AICommentFieldInput[];
}

export interface AICommentFieldResult {
  fieldName: string;
  fieldComment: string;
}

export interface AICommentResult {
  tableComment: string;
  fields: AICommentFieldResult[];
}

export interface AIIndexAdvisorFieldInput {
  fieldName: string;
  fieldType: string;
  fieldComment: string;
  nullable: boolean;
}

export interface AIIndexAdvisorIndexInput {
  name: string;
  fields: Array<{ name: string; direction: 'ASC' | 'DESC' }>;
  unique: boolean;
  isPrimary?: boolean;
}

export interface AIIndexAdvisorRequest {
  dbType: string;
  schemaName?: string;
  tableName: string;
  tableComment: string;
  fields: AIIndexAdvisorFieldInput[];
  indexes: AIIndexAdvisorIndexInput[];
  queryPatterns: string;
}

export type AIIndexAdvisorRecommendationCategory =
  | 'missing_index'
  | 'redundant_index'
  | 'order_optimization'
  | 'query_rewrite'
  | 'general';

export interface AIIndexAdvisorRecommendation {
  id: string;
  category: AIIndexAdvisorRecommendationCategory;
  title: string;
  rationale: string;
  confidence: 'high' | 'medium' | 'low';
  index?: AIIndexAdvisorIndexInput;
  targetIndexName?: string;
  affectedQueries?: string[];
}

export interface AIIndexAdvisorResult {
  summary: string;
  recommendations: AIIndexAdvisorRecommendation[];
}
