import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { buildWorkspaceContentHash } from '../contentHash';
import { applyPersistedStateToTableDoc, tableDocToPersistedState } from '../workspaceTableDoc';
import { getWorkspaceRoot } from '../workspaceYDoc';
import {
  exportWorkspaceYDocToSnapshot,
  importWorkspaceSnapshotToYDoc,
} from '../workspaceYDocCodec';

// 复刻客户端 buildPersistedState 的形状：空集合以 undefined 表示，而不是省略键
const createClientState = (overrides: Partial<PersistedState> = {}): PersistedState => ({
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
      order: 1,
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
      order: 2,
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
  indexInput: '',
  currentIndexFields: [],
  indexes: [],
  authInput: '',
  authObjects: [],
  citusShardingConfig: undefined,
  mysqlPartitionConfig: undefined,
  tableMiscConfig: undefined,
  fieldTableViewConfig: { freezeEnabled: false, freezeColumns: 0 },
  foreignKeys: undefined,
  ...overrides,
});

const createTableDoc = (state: PersistedState) => {
  const doc = new Y.Doc();
  const tableDoc = new Y.Map<unknown>();
  doc.getMap<Y.Map<unknown>>('drafts').set('draft-1', tableDoc);
  applyPersistedStateToTableDoc(tableDoc, state);
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
  it('hashes decoded state identically to the client state it was written from', async () => {
    const clientState = createClientState();
    const decoded = tableDocToPersistedState(createTableDoc(clientState));

    expect(decoded).not.toHaveProperty('foreignKeys');
    expect(decoded).toEqual(clientState);
    await expect(buildWorkspaceContentHash({ state: decoded })).resolves.toBe(
      await buildWorkspaceContentHash({ state: clientState }),
    );
  });

  it('keeps non-empty foreign keys in the decoded state', () => {
    const foreignKeys = [
      {
        id: 'fk_user_org',
        name: 'fk_user_org',
        fields: ['org_id'],
        refTable: 'orgs',
        refFields: ['id'],
        onDelete: 'CASCADE' as const,
      },
    ];
    const decoded = tableDocToPersistedState(createTableDoc(createClientState({ foreignKeys })));

    expect(decoded.foreignKeys).toEqual(foreignKeys);
  });

  it('decodes without mutating the document', () => {
    const clientState = createClientState();
    for (const tableDoc of [createTableDoc(clientState), createLegacyTableDoc(clientState)]) {
      const doc = tableDoc.doc as Y.Doc;
      const before = Y.encodeStateAsUpdate(doc);
      tableDocToPersistedState(tableDoc);
      expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
    }
  });

  it('reads rows from a snapshot-only table doc', () => {
    const clientState = createClientState();
    const decoded = tableDocToPersistedState(createLegacyTableDoc(clientState));

    expect(decoded.rows).toEqual(clientState.rows);
  });

  it('falls back to the snapshot when fine-grained structures are partially missing', () => {
    const clientState = createClientState();
    const tableDoc = createLegacyTableDoc(clientState);
    const scalar = new Y.Map<unknown>();
    scalar.set('tableName', 'renamed');
    tableDoc.set('scalar', scalar);

    const decoded = tableDocToPersistedState(tableDoc);

    expect(decoded.tableName).toBe('renamed');
    expect(decoded.tableComment).toBe(clientState.tableComment);
    expect(decoded.rows).toEqual(clientState.rows);
  });

  it('normalizes legacy snapshot rows on both branches that bypass readFieldRow', () => {
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
    const expectedRows = [
      { ...legacyRows[0], nullable: false, defaultKind: 'auto_increment', onUpdate: 'none' },
      {
        ...legacyRows[1],
        nullable: false,
        defaultKind: 'current_timestamp',
        onUpdate: 'current_timestamp',
      },
    ];

    const snapshotOnly = createLegacyTableDoc(createClientState({ rows: legacyRows }));
    expect(tableDocToPersistedState(snapshotOnly).rows).toEqual(expectedRows);

    const withoutFieldDoc = createLegacyTableDoc(createClientState({ rows: legacyRows }));
    withoutFieldDoc.set('scalar', new Y.Map<unknown>());
    expect(tableDocToPersistedState(withoutFieldDoc).rows).toEqual(expectedRows);
  });

  it('fills missing field values from the matching snapshot row', () => {
    const enumMeta = [{ value: 'a', color: '#fff' }];
    const clientState = createClientState({
      rows: [{ ...createClientState().rows[0], enumMeta }],
    });
    const tableDoc = createLegacyTableDoc(clientState);
    const fields = new Y.Map<Y.Map<unknown>>();
    const field = new Y.Map<unknown>();
    field.set('fieldName', 'renamed_id');
    fields.set('field-1', field);
    tableDoc.set('fields', fields);
    const fieldOrder = new Y.Array<string>();
    fieldOrder.insert(0, ['field-1']);
    tableDoc.set('fieldOrder', fieldOrder);

    // fields 的键就是行身份，快照只补该键缺失的值
    expect(tableDocToPersistedState(tableDoc).rows).toEqual([
      { ...clientState.rows[0], id: 'field-1', fieldName: 'renamed_id' },
    ]);
  });

  it('normalizes malformed scalars and honours optional table configs', () => {
    const doc = new Y.Doc();
    const tableDoc = new Y.Map<unknown>();
    doc.getMap<Y.Map<unknown>>('drafts').set('draft-1', tableDoc);
    const scalar = new Y.Map<unknown>();
    scalar.set('objectType', 'view');
    scalar.set('sqlFormatMode', 'aligned');
    scalar.set('viewCreateOrReplace', false);
    scalar.set('schemaName', 1);
    scalar.set('addCount', 'many');
    scalar.set('currentIndexFields', 'nope');
    scalar.set('authObjects', 'nope');
    scalar.set('citusShardingConfig', { enabled: true });
    tableDoc.set('scalar', scalar);

    expect(tableDocToPersistedState(tableDoc)).toEqual({
      objectType: 'view',
      schemaName: '',
      tableName: '',
      tableComment: '',
      dbType: 'mysql',
      sqlFormatMode: 'aligned',
      viewDefinition: '',
      viewCreateOrReplace: false,
      rows: [],
      addCount: 12,
      indexInput: '',
      currentIndexFields: [],
      indexes: [],
      authInput: '',
      authObjects: [],
      citusShardingConfig: { enabled: true },
    });
  });

  it('round-trips a table doc through the workspace snapshot', () => {
    const clientState = createClientState();
    const doc = new Y.Doc();
    importWorkspaceSnapshotToYDoc(doc, snapshotOf(clientState));

    const restored = new Y.Doc();
    importWorkspaceSnapshotToYDoc(restored, exportWorkspaceYDocToSnapshot(doc));

    const source = getWorkspaceRoot(doc).drafts.get('draft-1') as Y.Map<unknown>;
    const target = getWorkspaceRoot(restored).drafts.get('draft-1') as Y.Map<unknown>;
    expect(tableDocToPersistedState(target)).toEqual(tableDocToPersistedState(source));
    expect(exportWorkspaceYDocToSnapshot(restored)).toEqual(exportWorkspaceYDocToSnapshot(doc));
  });
});

describe('workspace table doc writes', () => {
  const collectUpdates = (doc: Y.Doc) => {
    const updates: Uint8Array[] = [];
    doc.on('update', (update: Uint8Array) => updates.push(update));
    return updates;
  };

  it('emits no update when the same state is applied twice', () => {
    const clientState = createClientState();
    const tableDoc = createTableDoc(clientState);
    const updates = collectUpdates(tableDoc.doc as Y.Doc);

    applyPersistedStateToTableDoc(tableDoc, createClientState());

    expect(updates).toEqual([]);
  });

  it('patches changed scalars and fields against the previous snapshot', () => {
    const clientState = createClientState();
    const tableDoc = createTableDoc(clientState);
    const nextRows = clientState.rows.map((row, index) =>
      index === 1 ? { ...row, fieldComment: '登录邮箱' } : row,
    );
    const nextState = createClientState({ tableName: 'accounts', rows: nextRows });

    applyPersistedStateToTableDoc(tableDoc, nextState);

    expect(tableDocToPersistedState(tableDoc)).toEqual(nextState);
  });

  it('keeps the previous snapshot as the base when compacting', () => {
    const clientState = createClientState();
    const tableDoc = createTableDoc(clientState);
    const nextState = createClientState({ tableName: 'accounts' });

    applyPersistedStateToTableDoc(tableDoc, nextState, { compactSnapshotBase: true });

    expect((tableDoc.get('stateSnapshot') as PersistedState).tableName).toBe(clientState.tableName);
    expect(tableDocToPersistedState(tableDoc)).toEqual(nextState);
  });

  it('reuses field identities when rows are reordered and removed', () => {
    const clientState = createClientState();
    const tableDoc = createTableDoc(clientState);
    const fieldIds = (tableDoc.get('fieldOrder') as Y.Array<string>).toArray();

    applyPersistedStateToTableDoc(
      tableDoc,
      createClientState({ rows: [{ ...clientState.rows[1], order: 1 }] }),
    );

    expect((tableDoc.get('fieldOrder') as Y.Array<string>).toArray()).toEqual([fieldIds[1]]);
    expect(Array.from((tableDoc.get('fields') as Y.Map<unknown>).keys())).toEqual([fieldIds[1]]);
    expect(tableDocToPersistedState(tableDoc).rows).toEqual([{ ...clientState.rows[1], order: 1 }]);
  });

  it('rewrites indexes and foreign keys when they change', () => {
    const clientState = createClientState();
    const tableDoc = createTableDoc(clientState);
    const indexes = [
      {
        id: 'idx_email',
        name: 'idx_email',
        fields: [{ name: 'email', direction: 'ASC' as const }],
      },
    ];

    applyPersistedStateToTableDoc(tableDoc, createClientState({ indexes }));

    expect(tableDocToPersistedState(tableDoc).indexes).toEqual(indexes);
  });
});

describe('workspace table doc key removals', () => {
  const createCompactedTableDoc = (state: PersistedState) => {
    const doc = new Y.Doc();
    const tableDoc = new Y.Map<unknown>();
    doc.getMap<Y.Map<unknown>>('drafts').set('draft-1', tableDoc);
    applyPersistedStateToTableDoc(tableDoc, state, { compactSnapshotBase: true });
    return tableDoc;
  };

  const applyCompacted = (tableDoc: Y.Map<unknown>, state: PersistedState) =>
    applyPersistedStateToTableDoc(tableDoc, state, { compactSnapshotBase: true });

  const enumMeta = [{ value: 'a', color: '#fff' }];
  const configuredState = createClientState({
    citusShardingConfig: { enabled: true, distributionColumn: 'id' },
    mysqlPartitionConfig: { enabled: true, type: 'RANGE', columns: ['id'] },
    tableMiscConfig: { engine: 'InnoDB' },
  });
  const rowsWithOptionalKeys = [
    {
      ...createClientState().rows[0],
      defaultKind: 'auto_increment',
      onUpdate: 'current_timestamp',
      enumMeta,
    },
    createClientState().rows[1],
  ];

  it('drops cleared scalar configs from the decoded state', () => {
    const tableDoc = createCompactedTableDoc(configuredState);

    applyCompacted(tableDoc, createClientState({ dbType: 'postgresql' }));

    const decoded = tableDocToPersistedState(tableDoc);
    expect(decoded).not.toHaveProperty('citusShardingConfig');
    expect(decoded).not.toHaveProperty('mysqlPartitionConfig');
    expect(decoded).not.toHaveProperty('tableMiscConfig');
    expect(decoded.dbType).toBe('postgresql');
  });

  it('drops cleared field values from the decoded state', () => {
    const tableDoc = createCompactedTableDoc(createClientState({ rows: rowsWithOptionalKeys }));
    const {
      defaultKind: _kind,
      onUpdate: _onUpdate,
      enumMeta: _meta,
      ...clearedRow
    } = rowsWithOptionalKeys[0];

    applyCompacted(tableDoc, createClientState({ rows: [clearedRow, rowsWithOptionalKeys[1]] }));

    const decoded = tableDocToPersistedState(tableDoc);
    expect(decoded.rows[0]).not.toHaveProperty('enumMeta');
    expect(decoded.rows[0]).not.toHaveProperty('defaultKind');
    expect(decoded.rows[0]).not.toHaveProperty('onUpdate');
    expect(decoded.rows[0].fieldName).toBe(rowsWithOptionalKeys[0].fieldName);
  });

  it('reads the new value written after a key was cleared', () => {
    const tableDoc = createCompactedTableDoc(
      createClientState({
        mysqlPartitionConfig: { enabled: true, type: 'RANGE', columns: ['id'] },
        rows: rowsWithOptionalKeys,
      }),
    );
    const { enumMeta: _meta, ...clearedRow } = rowsWithOptionalKeys[0];

    applyCompacted(tableDoc, createClientState({ rows: [clearedRow, rowsWithOptionalKeys[1]] }));
    const restoredEnumMeta = [{ value: 'b', color: '#000' }];
    const restoredState = createClientState({
      mysqlPartitionConfig: { enabled: true, type: 'LIST', columns: ['tenant_id'] },
      rows: [{ ...clearedRow, enumMeta: restoredEnumMeta }, rowsWithOptionalKeys[1]],
    });
    applyCompacted(tableDoc, restoredState);

    expect(tableDocToPersistedState(tableDoc)).toEqual(restoredState);
  });

  it('keeps the decoded content hash aligned across an incremental edit sequence', async () => {
    const [first, second] = rowsWithOptionalKeys;
    const sequence: PersistedState[] = [
      configuredState,
      createClientState({ rows: rowsWithOptionalKeys }),
      createClientState({ rows: [second, first] }),
      createClientState({ rows: [second] }),
      createClientState({ rows: [second], tableMiscConfig: { engine: 'InnoDB' } }),
      createClientState({ rows: rowsWithOptionalKeys, dbType: 'postgresql' }),
      createClientState(),
    ];

    const tableDoc = createCompactedTableDoc(sequence[0]);
    for (const state of sequence) {
      applyCompacted(tableDoc, state);
      const normalized = {
        ...state,
        rows: state.rows.map((row, index) => ({ ...row, order: index + 1 })),
      };
      await expect(
        buildWorkspaceContentHash({ state: tableDocToPersistedState(tableDoc) }),
      ).resolves.toBe(await buildWorkspaceContentHash({ state: normalized }));
    }
  });
});
