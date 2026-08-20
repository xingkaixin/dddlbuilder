import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import type { FieldRow, PersistedState } from '@ddlbuilder/shared-types';
import { buildWorkspaceContentHash } from '../contentHash';
import { applyPersistedStateToTableDoc, tableDocToPersistedState } from '../workspaceTableDoc';

const createRow = (index: number, overrides: Partial<FieldRow> = {}): FieldRow => ({
  order: index + 1,
  fieldName: `f${index}`,
  fieldType: 'varchar(64)',
  fieldComment: '',
  nullable: '是',
  defaultKind: '',
  defaultValue: '',
  onUpdate: '',
  ...overrides,
});

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
  rows: [createRow(0), createRow(1), createRow(2)],
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

const createTableDoc = () => {
  const doc = new Y.Doc();
  const tableDoc = new Y.Map<unknown>();
  doc.getMap<Y.Map<unknown>>('drafts').set('draft-1', tableDoc);
  return tableDoc;
};

const normalize = (state: PersistedState) => ({
  ...state,
  rows: state.rows.map((row, index) => ({ ...row, order: index + 1 })),
});

const runSequence = (states: PersistedState[], compactSnapshotBase: boolean) => {
  const tableDoc = createTableDoc();
  states.forEach((state, step) => {
    applyPersistedStateToTableDoc(tableDoc, state, { compactSnapshotBase });
    expect(tableDocToPersistedState(tableDoc), `step ${step + 1}`).toEqual(normalize(state));
  });
  return tableDoc;
};

const rowsOf = (tableDoc: Y.Map<unknown>) =>
  tableDocToPersistedState(tableDoc).rows.map((row) => row.fieldName);

describe.each([true, false])('table doc edit sequences (compactSnapshotBase=%s)', (compact) => {
  it('A: clears an optional field key again after it was set, cleared and set once more', () => {
    const withEnum = (value: string) => createRow(0, { enumMeta: [{ value }] });
    const tableDoc = runSequence(
      [
        createClientState({ rows: [withEnum('a')] }),
        createClientState({ rows: [createRow(0)] }),
        createClientState({ rows: [withEnum('b')] }),
        createClientState({ rows: [createRow(0)] }),
      ],
      compact,
    );

    expect(tableDocToPersistedState(tableDoc).rows[0]).not.toHaveProperty('enumMeta');
  });

  it('B: restores a field name that was renamed after an optional key was cleared', () => {
    const named = (fieldName: string, overrides: Partial<FieldRow> = {}) =>
      createRow(0, { fieldName, ...overrides });
    const tableDoc = runSequence(
      [
        createClientState({ rows: [named('user_id', { enumMeta: [{ value: 'a' }] })] }),
        createClientState({ rows: [named('user_id')] }),
        createClientState({ rows: [named('ZZZ')] }),
        createClientState({ rows: [named('user_id')] }),
      ],
      compact,
    );

    expect(tableDocToPersistedState(tableDoc).rows[0].fieldName).toBe('user_id');
  });

  it('C: drops a row again after it was added and removed', () => {
    const three = [createRow(0), createRow(1), createRow(2)];
    const four = [...three, createRow(3)];
    const tableDoc = runSequence(
      [
        createClientState({ rows: three }),
        createClientState({ rows: four }),
        createClientState({ rows: three }),
        createClientState({ rows: four }),
      ],
      compact,
    );

    expect(rowsOf(tableDoc)).toEqual(['f0', 'f1', 'f2', 'f3']);
  });

  it('D: keeps a row that was removed and added back', () => {
    const three = [createRow(0), createRow(1), createRow(2)];
    const two = [createRow(0), createRow(1)];
    const tableDoc = runSequence(
      [
        createClientState({ rows: three }),
        createClientState({ rows: two }),
        createClientState({ rows: three }),
        createClientState({ rows: two }),
      ],
      compact,
    );

    expect(rowsOf(tableDoc)).toEqual(['f0', 'f1']);
  });
});

describe('table doc snapshot base', () => {
  it('keeps the compacted snapshot frozen while no key is removed', () => {
    const tableDoc = createTableDoc();
    const sequence = [
      createClientState(),
      createClientState({ tableName: 'accounts' }),
      createClientState({ tableName: 'accounts', rows: [createRow(0), createRow(1)] }),
      createClientState({ tableName: 'accounts', tableMiscConfig: { engine: 'InnoDB' } }),
      createClientState({ tableName: 'people', rows: [createRow(0), createRow(1), createRow(2)] }),
    ];

    sequence.forEach((state) => {
      applyPersistedStateToTableDoc(tableDoc, state, { compactSnapshotBase: true });
      expect(tableDocToPersistedState(tableDoc)).toEqual(normalize(state));
    });

    expect(tableDoc.get('stateSnapshot')).toEqual(JSON.parse(JSON.stringify(sequence[0])));
  });
});

const createRandom = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

type Random = () => number;

const pick = <T>(items: readonly T[], random: Random) => items[Math.floor(random() * items.length)];

const withRows = (state: PersistedState, rows: FieldRow[]): PersistedState => ({
  ...state,
  rows: rows.map((row, index) => ({ ...row, order: index + 1 })),
});

const replaceRow = (state: PersistedState, index: number, row: FieldRow) =>
  withRows(
    state,
    state.rows.map((current, position) => (position === index ? row : current)),
  );

const OPTIONAL_SCALAR_VALUES = {
  citusShardingConfig: { enabled: true, distributionColumn: 'id' },
  mysqlPartitionConfig: { enabled: true, type: 'RANGE', columns: ['id'] },
  tableMiscConfig: { engine: 'InnoDB' },
} as const;

// 取值池刻意很小且含各槽位的初始值，这样「改走再改回」会频繁出现——增量写的缺陷正藏在回退里
const FIELD_NAMES = ['f0', 'f1', 'f2', 'f3', 'col_a', 'col_b'] as const;
const DEFAULT_KINDS = ['', '自增', undefined] as const;
const TABLE_NAMES = ['users', 'accounts'] as const;

// 每个变异只改一处：若一步就重掷所有可选键，patch 恒非空，会绕开「跳过写入」的分支从而假绿
const MUTATIONS: readonly ((state: PersistedState, random: Random) => PersistedState)[] = [
  (state, random) => ({ ...state, tableName: pick(TABLE_NAMES, random) }),
  (state, random) => {
    const key = pick(
      Object.keys(OPTIONAL_SCALAR_VALUES) as (keyof typeof OPTIONAL_SCALAR_VALUES)[],
      random,
    );
    return { ...state, [key]: state[key] ? undefined : OPTIONAL_SCALAR_VALUES[key] };
  },
  (state, random) => {
    const index = Math.floor(random() * state.rows.length);
    return replaceRow(state, index, { ...state.rows[index], fieldName: pick(FIELD_NAMES, random) });
  },
  (state, random) => {
    const index = Math.floor(random() * state.rows.length);
    const { enumMeta, ...row } = state.rows[index];
    return replaceRow(state, index, enumMeta ? row : { ...row, enumMeta: [{ value: 'v0' }] });
  },
  (state, random) => {
    const index = Math.floor(random() * state.rows.length);
    const { defaultKind: _cleared, ...row } = state.rows[index];
    const next = pick(DEFAULT_KINDS, random);
    return replaceRow(state, index, next === undefined ? row : { ...row, defaultKind: next });
  },
  (state) => withRows(state, [...state.rows, createRow(state.rows.length)]),
  (state, random) => {
    if (state.rows.length < 2) return state;
    const index = Math.floor(random() * state.rows.length);
    return withRows(
      state,
      state.rows.filter((_, position) => position !== index),
    );
  },
  (state, random) => {
    if (state.rows.length < 2) return state;
    const index = Math.floor(random() * (state.rows.length - 1));
    const rows = [...state.rows];
    [rows[index], rows[index + 1]] = [rows[index + 1], rows[index]];
    return withRows(state, rows);
  },
];

describe.each([true, false])(
  'table doc randomized single-edit sequences (compactSnapshotBase=%s)',
  (compact) => {
    it('decodes to the same content hash after every edit', async () => {
      const mismatches: string[] = [];

      for (let round = 0; round < 300; round += 1) {
        const random = createRandom(round * 7919 + (compact ? 1 : 2));
        const tableDoc = createTableDoc();
        let state = createClientState({
          rows: Array.from({ length: (round % 3) + 1 }, (_, index) => createRow(index)),
        });
        applyPersistedStateToTableDoc(tableDoc, state, { compactSnapshotBase: compact });

        for (let step = 0; step < 6; step += 1) {
          state = pick(MUTATIONS, random)(state, random);
          applyPersistedStateToTableDoc(tableDoc, state, { compactSnapshotBase: compact });
          const decoded = await buildWorkspaceContentHash({
            state: tableDocToPersistedState(tableDoc),
          });
          const expected = await buildWorkspaceContentHash({ state: normalize(state) });
          if (decoded !== expected) {
            mismatches.push(`round ${round} step ${step + 1}`);
            break;
          }
        }
      }

      expect(mismatches).toEqual([]);
    });
  },
);
