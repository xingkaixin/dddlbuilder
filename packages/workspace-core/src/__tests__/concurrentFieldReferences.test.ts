import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import type { SchemaDocumentState } from '@ddlbuilder/shared-types';
import { upsertWorkspaceDraft } from '../workspaceRecords';
import {
  assertWorkspaceYDocStructure,
  ensureWorkspaceYDocMeta,
  getDraftRecordFromYDoc,
  getWorkspaceRoot,
} from '../workspaceYDoc';
import { exportWorkspaceYDocToSnapshot } from '../workspaceYDocCodec';
import type { StoredForeignKeyDefinition } from '../workspaceFieldReferences';
import { materializeTableDoc } from '../workspaceTableDoc';
import { readMap, readOrderedMap, writeOrderedMap } from '../yMapJson';

const documents: Y.Doc[] = [];

const createDoc = () => {
  const doc = new Y.Doc();
  ensureWorkspaceYDocMeta(doc);
  documents.push(doc);
  return doc;
};

afterEach(() => {
  documents.splice(0).forEach((doc) => doc.destroy());
});

const initialState = (): SchemaDocumentState => ({
  schemaName: '',
  tableName: 'events',
  tableComment: '',
  dbType: 'postgresql-citus',
  rows: ['id', 'tenant_id'].map((fieldName, index) => ({
    id: `field-${index}`,
    fieldName,
    fieldType: 'bigint',
    fieldComment: '',
    nullable: false,
  })),
  indexes: [],
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

const clone = (doc: Y.Doc) => {
  const peer = createDoc();
  Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc));
  return peer;
};

const merge = (left: Y.Doc, right: Y.Doc) => {
  const leftUpdate = Y.encodeStateAsUpdate(left);
  Y.applyUpdate(left, Y.encodeStateAsUpdate(right));
  Y.applyUpdate(right, leftUpdate);
  expect(() => assertWorkspaceYDocStructure(left)).not.toThrow();
  expect(() => assertWorkspaceYDocStructure(right)).not.toThrow();
  expect(read(right)).toEqual(read(left));
  return read(left);
};

const referencedState = (state: SchemaDocumentState): SchemaDocumentState => ({
  ...state,
  foreignKeys: [
    {
      id: 'foreign-key-tenant',
      name: 'fk_events_tenant',
      fields: ['tenant_id'],
      refTable: 'tenants',
      refFields: ['id'],
    },
  ],
  citusShardingConfig: { mode: 'distributed', distributionColumn: 'tenant_id' },
  mysqlPartitionConfig: {
    enabled: true,
    type: 'KEY',
    columns: ['tenant_id'],
  },
  tableMiscConfig: {
    enabled: true,
    partitions: {
      enabled: true,
      columns: [],
      clustering: { enabled: true, columns: ['tenant_id'], bucketCount: 4 },
    },
  },
});

describe('local field references', () => {
  it('resolves references added concurrently with a field rename through the field ID', () => {
    const left = createDoc();
    write(left, initialState());
    const right = clone(left);

    write(left, {
      ...read(left),
      rows: read(left).rows.map((row) =>
        row.fieldName === 'tenant_id' ? { ...row, fieldName: 'account_id' } : row,
      ),
    });
    write(right, referencedState(read(right)));

    const state = merge(left, right);
    expect(state.foreignKeys?.[0].fields).toEqual(['account_id']);
    expect(state.foreignKeys?.[0].refFields).toEqual(['id']);
    expect(state.citusShardingConfig?.distributionColumn).toBe('account_id');
    expect(state.mysqlPartitionConfig?.columns).toEqual(['account_id']);
    expect(state.tableMiscConfig?.partitions?.clustering?.columns).toEqual(['account_id']);
    expect(JSON.stringify(exportWorkspaceYDocToSnapshot(left))).not.toMatch(
      /localFieldIds|distributionColumnFieldId|columnFieldIds/,
    );
  });

  it('materializes legacy name-only references without changing exported state', () => {
    const doc = createDoc();
    const state = referencedState(initialState());
    write(doc, state);
    const tableDoc = table(doc);
    const foreignKeys = readOrderedMap<StoredForeignKeyDefinition>(
      tableDoc,
      'foreignKeys',
      'foreignKeyOrder',
    ).map(({ localFieldIds: _ids, ...foreignKey }) => foreignKey);
    writeOrderedMap(tableDoc, 'foreignKeys', 'foreignKeyOrder', foreignKeys);
    const scalar = readMap(tableDoc, 'scalar');
    if (!scalar) throw new Error('Missing scalar map');
    const mysql = scalar.get('mysqlPartitionConfig') as Record<string, unknown>;
    const misc = scalar.get('tableMiscConfig') as Record<string, unknown>;
    const { distributionColumnFieldId: _distributionId, ...legacyCitus } = scalar.get(
      'citusShardingConfig',
    ) as Record<string, unknown>;
    const { columnFieldIds: _mysqlIds, ...legacyMysql } = mysql;
    const partitions = misc.partitions as Record<string, unknown>;
    const clustering = partitions.clustering as Record<string, unknown>;
    const { columnFieldIds: _clusterIds, ...legacyClustering } = clustering;
    scalar.set('citusShardingConfig', legacyCitus);
    scalar.set('mysqlPartitionConfig', legacyMysql);
    scalar.set('tableMiscConfig', {
      ...misc,
      partitions: { ...partitions, clustering: legacyClustering },
    });
    const before = exportWorkspaceYDocToSnapshot(doc);

    expect(materializeTableDoc(tableDoc)).toBe(true);
    expect(materializeTableDoc(tableDoc)).toBe(false);
    expect(exportWorkspaceYDocToSnapshot(doc)).toEqual(before);
  });
});
