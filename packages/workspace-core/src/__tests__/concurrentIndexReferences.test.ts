import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import type { IndexDefinition, SchemaDocumentState } from '@ddlbuilder/shared-types';
import { upsertWorkspaceDraft } from '../workspaceRecords';
import { getDraftRecordFromYDoc, getWorkspaceRoot } from '../workspaceYDoc';
import {
  exportWorkspaceYDocToSnapshot,
  importWorkspaceSnapshotToYDoc,
} from '../workspaceYDocCodec';
import { materializeTableDoc, tableDocToSchemaDocumentState } from '../workspaceTableDoc';
import { readOrderedMap, writeOrderedMap } from '../yMapJson';

const documents: Y.Doc[] = [];
const createDoc = () => {
  const doc = new Y.Doc();
  documents.push(doc);
  return doc;
};

afterEach(() => {
  documents.splice(0).forEach((doc) => doc.destroy());
});

const initialState = (): SchemaDocumentState => ({
  schemaName: '',
  tableName: 'users',
  tableComment: '',
  dbType: 'postgresql',
  rows: ['user_id', 'org_id'].map((fieldName, position) => ({
    id: `field-${position}`,
    fieldName,
    fieldType: 'int',
    fieldComment: '',
    nullable: false,
  })),
  indexes: [
    {
      id: 'index-composite',
      name: 'idx_user_org',
      kind: 'index',
      fields: [
        { name: 'user_id', direction: 'DESC' },
        { name: 'org_id', direction: 'ASC' },
      ],
    },
  ],
  authInput: '',
  authObjects: [],
});

const write = (doc: Y.Doc, state: SchemaDocumentState) =>
  upsertWorkspaceDraft(doc, 'draft', { state, updatedAt: 1 }, { compactSnapshotBase: true });

const read = (doc: Y.Doc) => {
  const record = getDraftRecordFromYDoc(doc, 'draft');
  if (!record) throw new Error('Missing test draft');
  return record.state;
};

const table = (doc: Y.Doc) => {
  const tableDoc = getWorkspaceRoot(doc).drafts.get('draft');
  if (!tableDoc) throw new Error('Missing test table document');
  return tableDoc;
};

const rename = (state: SchemaDocumentState, previous: string, next: string) => ({
  ...state,
  rows: state.rows.map((row) => (row.fieldName === previous ? { ...row, fieldName: next } : row)),
  indexes: state.indexes.map((index) => ({
    ...index,
    fields: index.fields.map((field) =>
      field.name === previous ? { ...field, name: next } : field,
    ),
  })),
});

const clone = (doc: Y.Doc) => {
  const peer = createDoc();
  Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc));
  return peer;
};

const merge = (left: Y.Doc, right: Y.Doc) => {
  const leftUpdate = Y.encodeStateAsUpdate(left);
  Y.applyUpdate(left, Y.encodeStateAsUpdate(right));
  Y.applyUpdate(right, leftUpdate);
  const state = read(left);
  expect(read(right)).toEqual(state);
  return state;
};

describe('index field references', () => {
  it.each([true, false])(
    'resolves both concurrent renames through field IDs (left wins=%s)',
    (leftWins) => {
      const left = createDoc();
      left.clientID = leftWins ? 20 : 10;
      write(left, initialState());
      const right = clone(left);
      right.clientID = leftWins ? 10 : 20;
      write(left, rename(read(left), 'user_id', 'account_id'));
      write(right, rename(read(right), 'org_id', 'organization_id'));

      const merged = merge(left, right);
      expect(merged.rows.map((row) => row.fieldName)).toEqual(['account_id', 'organization_id']);
      expect(merged.indexes[0].fields).toEqual([
        { name: 'account_id', direction: 'DESC' },
        { name: 'organization_id', direction: 'ASC' },
      ]);
    },
  );

  it.each([true, false])(
    'resolves an index added concurrently with a field rename (existing index=%s)',
    (existingIndex) => {
      const left = createDoc();
      const state = initialState();
      write(left, { ...state, indexes: existingIndex ? state.indexes : [] });
      const right = clone(left);
      write(left, rename(read(left), 'org_id', 'organization_id'));
      const rightState = read(right);
      write(right, {
        ...rightState,
        indexes: [
          ...rightState.indexes,
          {
            id: 'index-added',
            name: 'idx_added',
            kind: 'unique_index',
            fields: [{ name: 'org_id', direction: 'DESC' }],
          },
        ],
      });

      expect(merge(left, right).indexes.find((index) => index.id === 'index-added')).toEqual({
        id: 'index-added',
        name: 'idx_added',
        kind: 'unique_index',
        fields: [{ name: 'organization_id', direction: 'DESC' }],
      });
    },
  );

  it('keeps the legacy index names current for readers without field ID support', () => {
    const doc = createDoc();
    write(doc, initialState());
    write(doc, rename(read(doc), 'user_id', 'account_id'));
    const legacyIndexes = readOrderedMap<IndexDefinition>(table(doc), 'indexes', 'indexOrder');

    expect(legacyIndexes[0].fields.map((field) => field.name)).toEqual(['account_id', 'org_id']);
    const legacyEdit = [
      { ...legacyIndexes[0], fields: [{ name: 'org_id', direction: 'DESC' as const }] },
    ];
    writeOrderedMap(table(doc), 'indexes', 'indexOrder', legacyEdit);
    expect(read(doc).indexes).toEqual(legacyEdit);
  });

  it.each(['snapshot', 'fine-grained'])(
    'migrates legacy %s indexes without changing the exported state',
    (format) => {
      const doc = createDoc();
      write(doc, initialState());
      const tableDoc = table(doc);
      if (format === 'snapshot') {
        for (const key of [
          'scalar',
          'fields',
          'fieldOrder',
          'indexes',
          'indexOrder',
          'foreignKeys',
          'foreignKeyOrder',
        ]) {
          tableDoc.delete(key);
        }
      } else {
        writeOrderedMap(tableDoc, 'indexes', 'indexOrder', initialState().indexes);
      }
      const before = read(doc);
      const beforeRead = Y.encodeStateAsUpdate(doc);
      expect(tableDocToSchemaDocumentState(tableDoc)).toEqual(before);
      expect(Y.encodeStateAsUpdate(doc)).toEqual(beforeRead);

      expect(materializeTableDoc(tableDoc)).toBe(true);
      expect(materializeTableDoc(tableDoc)).toBe(false);
      expect(read(doc)).toEqual(before);
      const peer = clone(doc);
      write(doc, rename(read(doc), 'user_id', 'account_id'));
      write(peer, rename(read(peer), 'org_id', 'organization_id'));
      expect(merge(doc, peer).indexes[0].fields.map((field) => field.name)).toEqual([
        'account_id',
        'organization_id',
      ]);
    },
  );

  it('migrates legacy fine-grained indexes on the next ordinary edit', () => {
    const doc = createDoc();
    write(doc, initialState());
    writeOrderedMap(table(doc), 'indexes', 'indexOrder', initialState().indexes);
    const peer = clone(doc);
    write(doc, rename(read(doc), 'user_id', 'account_id'));
    write(peer, rename(read(peer), 'org_id', 'organization_id'));

    expect(merge(doc, peer).indexes[0].fields.map((field) => field.name)).toEqual([
      'account_id',
      'organization_id',
    ]);
  });

  it('preserves index order and direction across edits and snapshot round trips', () => {
    const doc = createDoc();
    write(doc, initialState());
    const state = read(doc);
    state.indexes[0].fields = [
      { name: 'org_id', direction: 'DESC' },
      { name: 'user_id', direction: 'ASC' },
    ];
    state.indexes.unshift({
      id: 'primary',
      name: 'pk_users',
      kind: 'primary',
      fields: [{ name: 'user_id', direction: 'ASC' }],
    });
    write(doc, rename(state, 'org_id', 'organization_id'));
    const snapshot = exportWorkspaceYDocToSnapshot(doc);
    const restored = createDoc();
    importWorkspaceSnapshotToYDoc(restored, snapshot);

    expect(read(restored)).toEqual(read(doc));
    expect(snapshot.drafts[0].state.indexes[1].fields).toEqual([
      { name: 'organization_id', direction: 'DESC' },
      { name: 'user_id', direction: 'ASC' },
    ]);
    expect(JSON.stringify(snapshot)).not.toContain('fieldId');
  });

  it('distinguishes case-sensitive names and preserves unresolved references', () => {
    const doc = createDoc();
    const state = initialState();
    state.rows[0].fieldName = 'Email';
    state.rows[1].fieldName = 'email';
    state.indexes[0].fields = [
      { name: 'Email', direction: 'ASC' },
      { name: 'email', direction: 'DESC' },
      { name: 'missing', direction: 'ASC' },
    ];
    write(doc, state);
    const peer = clone(doc);
    write(doc, rename(read(doc), 'Email', 'PrimaryEmail'));
    write(peer, rename(read(peer), 'email', 'secondary_email'));

    expect(merge(doc, peer).indexes[0].fields.map((field) => field.name)).toEqual([
      'PrimaryEmail',
      'secondary_email',
      'missing',
    ]);
  });
});
