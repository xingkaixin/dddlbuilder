import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  normalizePersistedRows,
  type PersistedState,
  type SchemaDocumentState,
  toSchemaDocumentState,
} from '@ddlbuilder/shared-types';
import { buildWorkspaceContentHash } from '../contentHash';
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

const collaborativeState = (state: PersistedState): SchemaDocumentState =>
  toSchemaDocumentState(state);

describe('workspace table doc', () => {
  it('normalizes legacy defaults, field IDs and empty collections like the stored document', () => {
    const legacy = createClientState({
      objectType: undefined,
      viewDefinition: undefined,
      viewCreateOrReplace: undefined,
      foreignKeys: [],
    });
    legacy.rows = [{ fieldName: 'id', fieldType: 'bigint', nullable: false }];
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

  it('hashes decoded state identically to the client state it was written from', async () => {
    const clientState = createClientState();
    const decoded = tableDocToSchemaDocumentState(createTableDoc(clientState));

    expect(decoded).not.toHaveProperty('foreignKeys');
    expect(decoded).toEqual(collaborativeState(clientState));
    await expect(buildWorkspaceContentHash({ state: decoded })).resolves.toBe(
      await buildWorkspaceContentHash({ state: collaborativeState(clientState) }),
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
    const decoded = tableDocToSchemaDocumentState(
      createTableDoc(createClientState({ foreignKeys })),
    );

    expect(decoded.foreignKeys).toEqual(foreignKeys);
  });

  it('decodes without mutating the document', () => {
    const clientState = createClientState();
    for (const tableDoc of [createTableDoc(clientState), createLegacyTableDoc(clientState)]) {
      const doc = tableDoc.doc as Y.Doc;
      const before = Y.encodeStateAsUpdate(doc);
      tableDocToSchemaDocumentState(tableDoc);
      expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
    }
  });

  it('reads rows from a snapshot-only table doc', () => {
    const clientState = createClientState();
    const decoded = tableDocToSchemaDocumentState(createLegacyTableDoc(clientState));

    expect(decoded.rows).toEqual(clientState.rows);
  });

  it('falls back to the snapshot when fine-grained structures are partially missing', () => {
    const clientState = createClientState();
    const tableDoc = createLegacyTableDoc(clientState);
    const scalar = new Y.Map<unknown>();
    scalar.set('tableName', 'renamed');
    tableDoc.set('scalar', scalar);

    const decoded = tableDocToSchemaDocumentState(tableDoc);

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
    const expectedRows = normalizePersistedRows({ rows: legacyRows }).rows;

    const snapshotOnly = createLegacyTableDoc(createClientState({ rows: legacyRows }));
    expect(tableDocToSchemaDocumentState(snapshotOnly).rows).toEqual(expectedRows);

    const withoutFieldDoc = createLegacyTableDoc(createClientState({ rows: legacyRows }));
    withoutFieldDoc.set('scalar', new Y.Map<unknown>());
    expect(tableDocToSchemaDocumentState(withoutFieldDoc).rows).toEqual(expectedRows);
  });

  it('fills missing field values from the matching snapshot row', () => {
    const enumMeta = [{ value: 'a', color: '#fff' }];
    const clientState = createClientState({
      rows: [{ ...createClientState().rows[0], id: 'field-1', enumMeta }],
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
    expect(tableDocToSchemaDocumentState(tableDoc).rows).toEqual([
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

    expect(tableDocToSchemaDocumentState(tableDoc)).toEqual({
      objectType: 'view',
      schemaName: '',
      tableName: '',
      tableComment: '',
      dbType: 'mysql',
      viewDefinition: '',
      viewCreateOrReplace: false,
      rows: [],
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

  it('emits no update when the same state is applied twice', () => {
    const clientState = createClientState();
    const tableDoc = createTableDoc(clientState);
    const updates = collectUpdates(tableDoc.doc as Y.Doc);

    applySchemaDocumentStateToTableDoc(tableDoc, createClientState());

    expect(updates).toEqual([]);
  });

  it.each([
    [
      'fields',
      {
        rows: createClientState().rows.map((row) => ({ ...row, id: 'duplicate' })),
      },
    ],
    [
      'indexes',
      {
        indexes: [
          { id: 'duplicate', name: 'idx_id', fields: [], unique: false },
          { id: 'duplicate', name: 'idx_email', fields: [], unique: false },
        ],
      },
    ],
    [
      'foreignKeys',
      {
        foreignKeys: [
          { id: 'duplicate', name: 'fk_team', fields: [], refTable: 'teams', refFields: [] },
          {
            id: 'duplicate',
            name: 'fk_org',
            fields: [],
            refTable: 'organizations',
            refFields: [],
          },
        ],
      },
    ],
  ])('rejects duplicate %s identities before mutating the document', (subject, overrides) => {
    const doc = new Y.Doc();
    const tableDoc = new Y.Map<unknown>();
    doc.getMap<Y.Map<unknown>>('drafts').set('draft-1', tableDoc);

    expect(() =>
      applySchemaDocumentStateToTableDoc(tableDoc, createClientState(overrides)),
    ).toThrow(`${subject} must have unique non-empty ids`);
    expect(tableDoc.size).toBe(0);
  });

  it('does not store or emit updates for editor session changes', () => {
    const clientState = createClientState();
    const tableDoc = createTableDoc(clientState);
    const updates = collectUpdates(tableDoc.doc as Y.Doc);

    applySchemaDocumentStateToTableDoc(tableDoc, {
      ...clientState,
      sqlFormatMode: 'aligned',
      addCount: 99,
      indexInput: 'email',
      currentIndexFields: [{ name: 'email', direction: 'DESC' }],
      fieldTableViewConfig: { freezeEnabled: true, freezeColumns: 2 },
    });

    expect(updates).toEqual([]);
    expect(tableDoc.get('stateSnapshot')).toEqual(toSchemaDocumentState(clientState));
  });

  it('removes editor session fields from legacy collaborative storage', () => {
    const clientState = createClientState({
      sqlFormatMode: 'aligned',
      indexInput: 'email',
      fieldTableViewConfig: { freezeEnabled: true, freezeColumns: 2 },
    });
    const tableDoc = createLegacyTableDoc(clientState);

    applySchemaDocumentStateToTableDoc(tableDoc, clientState, { compactSnapshotBase: true });

    expect(tableDoc.get('stateSnapshot')).toEqual(toSchemaDocumentState(clientState));
    expect(tableDocToSchemaDocumentState(tableDoc)).toEqual(collaborativeState(clientState));
  });

  it('patches changed scalars and fields against the previous snapshot', () => {
    const clientState = createClientState();
    const tableDoc = createTableDoc(clientState);
    const nextRows = clientState.rows.map((row, index) =>
      index === 1 ? { ...row, fieldComment: '登录邮箱' } : row,
    );
    const nextState = createClientState({ tableName: 'accounts', rows: nextRows });

    applySchemaDocumentStateToTableDoc(tableDoc, nextState);

    expect(tableDocToSchemaDocumentState(tableDoc)).toEqual(collaborativeState(nextState));
  });

  it('keeps the previous snapshot as the base when compacting', () => {
    const clientState = createClientState();
    const tableDoc = createTableDoc(clientState);
    const nextState = createClientState({ tableName: 'accounts' });

    applySchemaDocumentStateToTableDoc(tableDoc, nextState, { compactSnapshotBase: true });

    expect((tableDoc.get('stateSnapshot') as PersistedState).tableName).toBe(clientState.tableName);
    expect(tableDocToSchemaDocumentState(tableDoc)).toEqual(collaborativeState(nextState));
  });

  it('reuses field identities when rows are reordered and removed', () => {
    const clientState = createClientState();
    const tableDoc = createTableDoc(clientState);
    const fieldIds = (tableDoc.get('fieldOrder') as Y.Array<string>).toArray();

    applySchemaDocumentStateToTableDoc(
      tableDoc,
      createClientState({ rows: [clientState.rows[1]] }),
    );

    expect((tableDoc.get('fieldOrder') as Y.Array<string>).toArray()).toEqual([fieldIds[1]]);
    expect(Array.from((tableDoc.get('fields') as Y.Map<unknown>).keys())).toEqual([fieldIds[1]]);
    expect(tableDocToSchemaDocumentState(tableDoc).rows).toEqual([clientState.rows[1]]);
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

    applySchemaDocumentStateToTableDoc(tableDoc, createClientState({ indexes }));

    expect(tableDocToSchemaDocumentState(tableDoc).indexes).toEqual(indexes);
  });
});

describe('workspace table doc key removals', () => {
  const createCompactedTableDoc = (state: PersistedState) => {
    const doc = new Y.Doc();
    const tableDoc = new Y.Map<unknown>();
    doc.getMap<Y.Map<unknown>>('drafts').set('draft-1', tableDoc);
    applySchemaDocumentStateToTableDoc(tableDoc, state, { compactSnapshotBase: true });
    return tableDoc;
  };

  const applyCompacted = (tableDoc: Y.Map<unknown>, state: PersistedState) =>
    applySchemaDocumentStateToTableDoc(tableDoc, state, { compactSnapshotBase: true });

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

    const decoded = tableDocToSchemaDocumentState(tableDoc);
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

    const decoded = tableDocToSchemaDocumentState(tableDoc);
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

    expect(tableDocToSchemaDocumentState(tableDoc)).toEqual(collaborativeState(restoredState));
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
      await expect(
        buildWorkspaceContentHash({ state: tableDocToSchemaDocumentState(tableDoc) }),
      ).resolves.toBe(await buildWorkspaceContentHash({ state: collaborativeState(state) }));
    }
  });
});
