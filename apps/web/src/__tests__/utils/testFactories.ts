import {
  withDefaultEditorSession,
  type FieldRow,
  type PersistedState,
  type SchemaDocumentState,
} from '@ddlbuilder/shared-types';

export const createFieldRow = (
  id: string,
  overrides: Partial<Omit<FieldRow, 'id'>> = {},
): FieldRow => ({
  id,
  fieldName: 'id',
  fieldType: 'int',
  fieldComment: '',
  nullable: true,
  defaultKind: 'none',
  defaultValue: '',
  onUpdate: 'none',
  ...overrides,
});

export const createSchemaDocumentState = (
  overrides: Partial<SchemaDocumentState> = {},
): SchemaDocumentState => ({
  objectType: 'table',
  schemaName: '',
  tableName: 'users',
  tableComment: '',
  dbType: 'mysql',
  rows: [],
  indexes: [],
  authInput: '',
  authObjects: [],
  foreignKeys: [],
  ...overrides,
});

export const createPersistedState = (overrides: Partial<PersistedState> = {}): PersistedState => ({
  ...withDefaultEditorSession(createSchemaDocumentState()),
  ...overrides,
});
