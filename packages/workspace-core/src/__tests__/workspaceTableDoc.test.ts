import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  normalizePersistedRows,
  type PersistedState,
  toSchemaDocumentState,
} from '@ddlbuilder/shared-types';
import {
  applySchemaDocumentStateToTableDoc,
  normalizeSchemaDocumentState,
  tableDocToSchemaDocumentState,
} from '../workspaceTableDoc';
import { getWorkspaceRoot } from '../workspaceYDoc';
import {
  exportWorkspaceYDocToSnapshot,
  importWorkspaceSnapshotToYDoc,
} from '../workspaceYDocCodec';

// 复刻客户端 buildPersistedState 的形状：空集合以 undefined 表示，而不是省略键
const createClientState = (overrides: Partial<PersistedState> = {}): PersistedState =>
  // SAFETY: the serialized fixture below has the complete client state shape.
  JSON.parse(
    JSON.stringify({
      objectType: 'table',
      schemaName: 'public',
      tableName: 'users',
      tableComment: '用户表',
      dbType: 'mysql',
      sqlFormatMode: 'compact',
      viewDefinition: '',
      viewCreateOrReplace: true,
      rows: [
        {
          id: 'field-id',
          fieldName: 'id',
          fieldType: 'bigint',
          fieldComment: '主键',
          nullable: false,
          defaultKind: 'auto_increment',
          defaultValue: '',
          onUpdate: 'none',
        },
        {
          id: 'field-email',
          fieldName: 'email',
          fieldType: 'varchar(255)',
          fieldComment: '邮箱',
          nullable: true,
          defaultKind: 'none',
          defaultValue: '',
          onUpdate: 'none',
        },
      ],
      addCount: 12,
      indexes: [],
      authInput: '',
      authObjects: [],
      citusShardingConfig: undefined,
      mysqlPartitionConfig: undefined,
      tableMiscConfig: undefined,
      fieldTableViewConfig: { freezeEnabled: false, freezeColumns: 0 },
      foreignKeys: undefined,
      ...overrides,
    }),
  ) as PersistedState;

const createTableDoc = (state: PersistedState) => {
  const doc = new Y.Doc();
  const tableDoc = new Y.Map<unknown>();
  doc.getMap<Y.Map<unknown>>('drafts').set('draft-1', tableDoc);
  applySchemaDocumentStateToTableDoc(tableDoc, state);

  return tableDoc;
};

const createLegacyTableDoc = (state: PersistedState) => {
  const doc = new Y.Doc();
  const tableDoc = new Y.Map<unknown>();
  doc.getMap<Y.Map<unknown>>('drafts').set('draft-1', tableDoc);
  tableDoc.set('stateSnapshot', JSON.parse(JSON.stringify(state)));

  return tableDoc;
};

const snapshotOf = (state: PersistedState) => ({
  globalDraft: null,
  drafts: [{ draftId: 'draft-1', state, updatedAt: 1 }],
  savedTables: [],
  savedDrafts: [],
  folders: [],
});
describe('workspace table doc', () => {
  it('normalizes legacy defaults, field IDs and empty collections like the stored document', () => {
    const legacy = createClientState({
      objectType: undefined,
      viewDefinition: undefined,
      viewCreateOrReplace: undefined,
      foreignKeys: [],
    });
    // SAFETY: this is an intentionally legacy row shape used to test normalization.
    // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- The fixture deliberately crosses from legacy raw data to the current row type.
    legacy.rows = [
      { fieldName: 'id', fieldType: 'bigint', nullable: false },
    ] as unknown as PersistedState['rows'];
    const normalized = normalizeSchemaDocumentState(legacy);
    expect(normalized).toMatchObject({
      objectType: 'table',
      viewDefinition: '',
      viewCreateOrReplace: true,
      rows: [{ id: 'legacy-field-0', fieldComment: '' }],
    });
    expect(normalized).not.toHaveProperty('foreignKeys');
    expect(normalized).not.toHaveProperty('sqlFormatMode');
    expect(normalized).toEqual(tableDocToSchemaDocumentState(createTableDoc(legacy)));
    expect(normalizeSchemaDocumentState(normalized)).toEqual(normalized);
    expect(legacy.rows[0]).not.toHaveProperty('id');
  });

  it('reads rows from a snapshot-only table doc', () => {
    const clientState = createClientState();
    const decoded = tableDocToSchemaDocumentState(createLegacyTableDoc(clientState));

    expect(decoded.rows).toEqual(clientState.rows);
  });

  it('normalizes legacy snapshot rows on both branches that bypass readFieldRow', () => {
    // SAFETY: these rows intentionally contain legacy enum strings to test compatibility normalization.
    // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- The fixture deliberately crosses from legacy raw data to the current row type.
    const legacyRows = [
      {
        id: 'field-id',
        order: 1,
        fieldName: 'id',
        fieldType: 'bigint',
        fieldComment: '主键',
        nullable: '否',
        defaultKind: '自增',
        defaultValue: '',
        onUpdate: '无',
      },
      {
        id: 'field-created_at',
        order: 2,
        fieldName: 'created_at',
        fieldType: 'timestamp',
        fieldComment: '创建时间',
        nullable: '否',
        defaultKind: '当前时间',
        defaultValue: '',
        onUpdate: '当前时间',
      },
    ] as unknown as PersistedState['rows'];
    const expectedRows = normalizePersistedRows({ rows: legacyRows }).rows;

    const snapshotOnly = createLegacyTableDoc(createClientState({ rows: legacyRows }));
    expect(tableDocToSchemaDocumentState(snapshotOnly).rows).toEqual(expectedRows);

    const withoutFieldDoc = createLegacyTableDoc(createClientState({ rows: legacyRows }));
    withoutFieldDoc.set('scalar', new Y.Map<unknown>());
    expect(tableDocToSchemaDocumentState(withoutFieldDoc).rows).toEqual(expectedRows);
  });

  it('round-trips a table doc through the workspace snapshot', () => {
    const clientState = createClientState();
    const doc = new Y.Doc();
    importWorkspaceSnapshotToYDoc(doc, snapshotOf(clientState));

    const restored = new Y.Doc();
    importWorkspaceSnapshotToYDoc(restored, exportWorkspaceYDocToSnapshot(doc));

    // SAFETY: both docs were created by the workspace codec with draft-1 table maps.
    const source = getWorkspaceRoot(doc).drafts.get('draft-1') as Y.Map<unknown>;
    // SAFETY: both docs were created by the workspace codec with draft-1 table maps.
    const target = getWorkspaceRoot(restored).drafts.get('draft-1') as Y.Map<unknown>;
    expect(tableDocToSchemaDocumentState(target)).toEqual(tableDocToSchemaDocumentState(source));
    expect(exportWorkspaceYDocToSnapshot(restored)).toEqual(exportWorkspaceYDocToSnapshot(doc));
  });
});

describe('workspace table doc writes', () => {
  const collectUpdates = (doc: Y.Doc) => {
    const updates: Uint8Array[] = [];
    doc.on('update', (update: Uint8Array) => updates.push(update));

    return updates;
  };

  it.each([
    [
      'fields',
      {
        rows: createClientState().rows.map((row) => ({ ...row, id: 'duplicate' })),
      },
    ],
  ] satisfies Array<[string, Partial<PersistedState>]>)(
    'rejects duplicate %s identities before mutating the document',
    (subject, overrides) => {
      const doc = new Y.Doc();
      const tableDoc = new Y.Map<unknown>();
      doc.getMap<Y.Map<unknown>>('drafts').set('draft-1', tableDoc);

      expect(() =>
        applySchemaDocumentStateToTableDoc(tableDoc, createClientState(overrides)),
      ).toThrow(`${subject} must have unique non-empty ids`);
      expect(tableDoc.size).toBe(0);
    },
  );

  it('does not store or emit updates for editor session changes', () => {
    const clientState = createClientState();
    const tableDoc = createTableDoc(clientState);
    // SAFETY: createTableDoc attaches its table map to a Y.Doc.
    const updates = collectUpdates(tableDoc.doc as Y.Doc);

    const nextState = createClientState({
      sqlFormatMode: 'aligned',
      addCount: 99,
      fieldTableViewConfig: { freezeEnabled: true, freezeColumns: 2 },
    });
    applySchemaDocumentStateToTableDoc(tableDoc, nextState);

    expect(updates).toEqual([]);
    expect(tableDoc.get('stateSnapshot')).toEqual(toSchemaDocumentState(clientState));
  });
});

it('removes standard references without reviving snapshot values during later edits', () => {
  const doc = new Y.Doc();
  const table = doc.getMap('table');
  const state = createClientState();
  state.rows[0].standardId = 'user-id';
  applySchemaDocumentStateToTableDoc(table, state, { forceFineGrained: true });
  expect(tableDocToSchemaDocumentState(table).rows[0].standardId).toBe('user-id');
  const { standardId: _standardId, ...unlinked } = state.rows[0];
  const next = { ...state, rows: [unlinked, ...state.rows.slice(1)] };
  applySchemaDocumentStateToTableDoc(table, next);
  applySchemaDocumentStateToTableDoc(table, { ...next, tableComment: 'Another edit' });
  expect(tableDocToSchemaDocumentState(table).rows[0].standardId).toBeUndefined();
  doc.destroy();
});
