import {
  withDefaultEditorSession,
  type FieldRow,
  type PersistedState,
  type SchemaDocumentState,
} from '@ddlbuilder/shared-types';
import type { FolderTreeNode } from '@/utils/folderModel';
import type { SavedTableMetadata, TableFolder } from '@/utils/workspaceStorageTypes';

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

export const createSavedTableMetadata = (
  tableId: string,
  overrides: Partial<Omit<SavedTableMetadata, 'tableId'>> = {},
): SavedTableMetadata => ({
  tableId,
  normalizedName: 'users',
  name: 'Users',
  dbType: 'mysql',
  fieldCount: 0,
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

export const createTableFolder = (
  id: string,
  overrides: Partial<Omit<TableFolder, 'id'>> = {},
): TableFolder => ({
  id,
  name: id,
  order: 0,
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

export const createFolderTreeNode = (
  id: string,
  overrides: Partial<Omit<FolderTreeNode, 'id' | 'children'>> & {
    children?: FolderTreeNode[];
  } = {},
): FolderTreeNode => ({
  ...createTableFolder(id, overrides),
  children: overrides.children ?? [],
});
