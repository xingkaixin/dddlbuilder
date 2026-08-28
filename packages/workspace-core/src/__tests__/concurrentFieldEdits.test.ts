import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import type { FieldRow, PersistedState } from '@ddlbuilder/shared-types';
import {
  applySchemaDocumentStateToTableDoc,
  tableDocToSchemaDocumentState,
} from '../workspaceTableDoc';

const row = (id: string, fieldName: string, overrides: Partial<FieldRow> = {}): FieldRow => ({
  id,
  order: 0,
  fieldName,
  fieldType: 'int',
  fieldComment: '',
  nullable: true,
  ...overrides,
});

const state = (rows: FieldRow[]): PersistedState =>
  ({
    objectType: 'table',
    schemaName: '',
    tableName: 't',
    tableComment: '',
    dbType: 'mysql',
    sqlFormatMode: 'compact',
    viewDefinition: '',
    viewCreateOrReplace: true,
    rows: rows.map((r, index) => ({ ...r, order: index + 1 })),
    addCount: 10,
    indexInput: '',
    currentIndexFields: [],
    indexes: [],
    authInput: '',
    authObjects: [],
  }) as PersistedState;

/** 建立两个已同步的副本，模拟两个客户端从同一份文档分叉。 */
const forkPeers = (initial: PersistedState) => {
  const docA = new Y.Doc();
  const tableA = docA.getMap<Y.Map<unknown>>('drafts').set('draft-1', new Y.Map());
  applySchemaDocumentStateToTableDoc(tableA, initial, { forceFineGrained: true });

  const docB = new Y.Doc();
  Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
  const tableB = docB.getMap<Y.Map<unknown>>('drafts').get('draft-1') as Y.Map<unknown>;

  const converge = () => {
    const updateA = Y.encodeStateAsUpdate(docA);
    Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB));
    Y.applyUpdate(docB, updateA);
    return [tableDocToSchemaDocumentState(tableA), tableDocToSchemaDocumentState(tableB)] as const;
  };

  return { tableA, tableB, converge };
};

describe('并发字段编辑', () => {
  it('keeps inserted field properties when a concurrent deletion changes its position', () => {
    const id = row('id', 'id', { fieldType: 'int', nullable: false });
    const name = row('name', 'name', { fieldType: 'varchar', nullable: true });
    const inserted = row('x', 'x', { fieldType: 'varchar', nullable: true });
    const { tableA, tableB, converge } = forkPeers(state([id, name]));
    applySchemaDocumentStateToTableDoc(tableA, state([id, inserted, name]), {
      compactSnapshotBase: true,
    });
    applySchemaDocumentStateToTableDoc(tableB, state([name]), { compactSnapshotBase: true });
    const [merged, peer] = converge();
    expect(merged.rows).toMatchObject([
      { id: 'x', fieldType: 'varchar', nullable: true },
      { id: 'name', fieldType: 'varchar', nullable: true },
    ]);
    expect(peer).toEqual(merged);
  });
  const ID = row('f-id', 'id');
  const NAME = row('f-name', 'name');
  const AGE = row('f-age', 'age');

  it('一端改字段类型，另一端在其之前插入行时改动留在原字段上', () => {
    const { tableA, tableB, converge } = forkPeers(state([ID, NAME]));

    applySchemaDocumentStateToTableDoc(tableA, state([ID, { ...NAME, fieldType: 'varchar(64)' }]));
    applySchemaDocumentStateToTableDoc(tableB, state([row('f-uuid', 'uuid'), ID, NAME]));

    const [merged, mergedPeer] = converge();
    expect(merged.rows.map((r) => [r.fieldName, r.fieldType])).toEqual([
      ['uuid', 'int'],
      ['id', 'int'],
      ['name', 'varchar(64)'],
    ]);
    expect(mergedPeer.rows).toEqual(merged.rows);
  });

  it('一端改名，另一端在其之前插入行时改名不丢失', () => {
    const { tableA, tableB, converge } = forkPeers(state([ID, NAME, AGE]));

    applySchemaDocumentStateToTableDoc(
      tableA,
      state([ID, { ...NAME, fieldName: 'user_name' }, AGE]),
    );
    applySchemaDocumentStateToTableDoc(tableB, state([row('f-uuid', 'uuid'), ID, NAME, AGE]));

    const [merged] = converge();
    expect(merged.rows.map((r) => r.fieldName)).toEqual(['uuid', 'id', 'user_name', 'age']);
  });

  it('两端各改不同字段的注释时都保留', () => {
    const { tableA, tableB, converge } = forkPeers(state([ID, NAME, AGE]));

    applySchemaDocumentStateToTableDoc(tableA, state([{ ...ID, fieldComment: '主键' }, NAME, AGE]));
    applySchemaDocumentStateToTableDoc(tableB, state([ID, NAME, { ...AGE, fieldComment: '岁数' }]));

    const [merged] = converge();
    expect(merged.rows.map((r) => r.fieldComment)).toEqual(['主键', '', '岁数']);
  });

  it('一端删行，另一端改另一行时两个意图都生效', () => {
    const { tableA, tableB, converge } = forkPeers(state([ID, NAME, AGE]));

    applySchemaDocumentStateToTableDoc(tableA, state([ID, AGE]));
    applySchemaDocumentStateToTableDoc(tableB, state([ID, NAME, { ...AGE, fieldComment: '岁数' }]));

    const [merged] = converge();
    expect(merged.rows.map((r) => [r.fieldName, r.fieldComment])).toEqual([
      ['id', ''],
      ['age', '岁数'],
    ]);
  });

  it('两端各追加一行时都保留', () => {
    const { tableA, tableB, converge } = forkPeers(state([ID]));

    applySchemaDocumentStateToTableDoc(tableA, state([ID, row('f-a', 'from_a')]));
    applySchemaDocumentStateToTableDoc(tableB, state([ID, row('f-b', 'from_b')]));

    const [merged] = converge();
    expect(merged.rows.map((r) => r.fieldName).sort()).toEqual(['from_a', 'from_b', 'id']);
  });

  it('两端在同一位置插入时都留在原来的相邻字段之间', () => {
    const { tableA, tableB, converge } = forkPeers(state([ID, NAME]));

    applySchemaDocumentStateToTableDoc(tableA, state([ID, row('f-a', 'from_a'), NAME]));
    applySchemaDocumentStateToTableDoc(tableB, state([ID, row('f-b', 'from_b'), NAME]));

    const [merged, peer] = converge();
    expect(merged.rows.map((r) => r.fieldName)).toEqual([
      'id',
      expect.stringMatching(/^from_[ab]$/),
      expect.stringMatching(/^from_[ab]$/),
      'name',
    ]);
    expect(new Set(merged.rows.map((r) => r.id)).size).toBe(4);
    expect(peer).toEqual(merged);
  });

  it('调整一个字段的位置不会改变其他字段间的并发插入位置', () => {
    const { tableA, tableB, converge } = forkPeers(state([ID, NAME, AGE]));

    applySchemaDocumentStateToTableDoc(tableA, state([NAME, AGE, ID]));
    applySchemaDocumentStateToTableDoc(tableB, state([ID, NAME, row('f-a', 'from_a'), AGE]));

    const [merged, peer] = converge();
    expect(merged.rows.map((r) => r.fieldName)).toEqual(['name', 'from_a', 'age', 'id']);
    expect(peer).toEqual(merged);
  });
});
