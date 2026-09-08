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
  /** Existing fields keep their ID across renames; null explicitly denotes a new field. */
  id?: string | null;
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

export interface PartialTableSchema {
  schemaName?: string;
  tableName?: string;
  tableComment?: string;
  fields?: GeneratedField[];
  indexes?: GeneratedIndex[];
  designDecisions?: GeneratedDesignDecision[];
}

export * from './aiContracts.js';
