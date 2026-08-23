import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { type PersistedState, toSchemaDocumentState } from '@ddlbuilder/shared-types';
import { tableDocToSchemaDocumentState } from '../workspaceTableDoc';
import {
  ensureWorkspaceYDocMeta,
  getDraftRecordFromYDoc,
  getWorkspaceRoot,
  isWorkspaceYDocEmpty,
  materializeWorkspaceYDoc,
  readFolderRecords,
  upsertTableRecord,
  WORKSPACE_YDOC_SCHEMA_VERSION,
  writeFolderRecord,
} from '../workspaceYDoc';

const createState = (tableName: string): PersistedState => ({
  objectType: 'table',
  schemaName: 'public',
  tableName,
  tableComment: '',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  viewDefinition: '',
  viewCreateOrReplace: true,
  rows: [
    {
      id: 'field-id',
      fieldName: 'id',
      fieldType: 'bigint',
      fieldComment: '',
      nullable: false,
      defaultKind: 'none',
      defaultValue: '',
      onUpdate: 'none',
    },
  ],
  addCount: 12,
  indexInput: '',
  currentIndexFields: [],
  indexes: [],
  authInput: '',
  authObjects: [],
});

const setLegacyTableDoc = (collection: Y.Map<Y.Map<unknown>>, key: string, tableName: string) => {
  const tableDoc = new Y.Map<unknown>();
  collection.set(key, tableDoc);
  tableDoc.set('stateSnapshot', createState(tableName));
  return tableDoc;
};

describe('workspace YDoc roots', () => {
  it('writes the schema version only once', () => {
    const doc = new Y.Doc();
    ensureWorkspaceYDocMeta(doc);
    const updates: Uint8Array[] = [];
    doc.on('update', (update: Uint8Array) => updates.push(update));

    ensureWorkspaceYDocMeta(doc);

    expect(getWorkspaceRoot(doc).meta.get('schemaVersion')).toBe(WORKSPACE_YDOC_SCHEMA_VERSION);
    expect(updates).toEqual([]);
  });

  it('reports emptiness across every collection', () => {
    const doc = new Y.Doc();
    expect(isWorkspaceYDocEmpty(doc)).toBe(true);

    writeFolderRecord(doc, { id: 'folder-1', name: 'Core', order: 1, createdAt: 5 });

    expect(isWorkspaceYDocEmpty(doc)).toBe(false);
  });

  it('materializes snapshot-only table docs once', () => {
    const doc = new Y.Doc();
    const { drafts, savedTables, savedDrafts } = getWorkspaceRoot(doc);
    setLegacyTableDoc(drafts, 'draft-1', 'draft');
    setLegacyTableDoc(savedTables, 'users', 'users');
    const savedDraft = setLegacyTableDoc(savedDrafts, 'users', 'users_draft');

    expect(materializeWorkspaceYDoc(doc)).toBe(true);
    expect(savedDraft.get('fieldOrder')).toBeInstanceOf(Y.Array);
    expect(materializeWorkspaceYDoc(doc)).toBe(false);
    expect(tableDocToSchemaDocumentState(savedDraft)).toEqual(
      toSchemaDocumentState(createState('users_draft')),
    );
  });

  it('reads draft metadata with fallbacks and reports missing drafts', () => {
    const doc = new Y.Doc();
    const { drafts } = getWorkspaceRoot(doc);
    upsertTableRecord(drafts, 'draft-1', createState('draft'), { folderId: 'folder-1' });
    upsertTableRecord(drafts, 'draft-2', createState('draft'), {
      createdAt: 1,
      updatedAt: 2,
      folderId: 3,
    });

    expect(getDraftRecordFromYDoc(doc, 'missing')).toBeNull();
    expect(getDraftRecordFromYDoc(doc, 'draft-1')).toMatchObject({
      createdAt: undefined,
      folderId: 'folder-1',
    });
    expect(getDraftRecordFromYDoc(doc, 'draft-1')?.updatedAt).toBe(0);
    expect(getDraftRecordFromYDoc(doc, 'draft-2')).toMatchObject({ createdAt: 1, updatedAt: 2 });
    expect(getDraftRecordFromYDoc(doc, 'draft-2')).not.toHaveProperty('folderId');
  });

  it('normalizes folder records and skips malformed ones', () => {
    const doc = new Y.Doc();
    const { folders } = getWorkspaceRoot(doc);
    writeFolderRecord(doc, {
      id: 'child',
      name: 'Child',
      parentId: 'root',
      order: 2,
      createdAt: 7,
    });
    writeFolderRecord(doc, { id: 'root', name: 'Root', order: 1, createdAt: 6 });
    const malformed = new Y.Map<unknown>();
    malformed.set('name', 1);
    folders.set('broken', malformed);
    const partial = new Y.Map<unknown>();
    partial.set('name', 'Partial');
    folders.set('partial', partial);

    const records = readFolderRecords(doc);

    expect(records.map((folder) => folder.id)).toEqual(['partial', 'root', 'child']);
    expect(records[1]).toEqual({ id: 'root', name: 'Root', order: 1, createdAt: 6 });
    expect(Object.keys(records[1]).sort()).toEqual([
      'createdAt',
      'id',
      'name',
      'order',
      'parentId',
    ]);
    expect(records[2].parentId).toBe('root');
    expect(records[0]).toMatchObject({ id: 'partial', name: 'Partial', order: 0 });
    expect(records[0].createdAt).toBe(0);
  });
});
