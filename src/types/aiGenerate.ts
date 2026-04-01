export interface GeneratedTableSchema {
  schemaName?: string;
  tableName: string;
  tableComment: string;
  fields: GeneratedField[];
  indexes?: GeneratedIndex[];
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
}
