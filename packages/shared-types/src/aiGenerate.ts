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
  nullable: '是' | '否';
  defaultKind: '无' | '自增' | '常量' | '当前时间' | 'uuid';
  defaultValue?: string;
  onUpdate?: '无' | '当前时间';
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
