import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FieldRow, IndexDefinition, PersistedState } from '@ddlbuilder/shared-types';
import { useAISchemaPatchFlow } from '@/components/App/hooks/useAISchemaPatchFlow';
import { buildAISchemaChanges } from '@/utils/aiSchemaChanges';

const row = (fieldName: string, order: number): FieldRow => ({
  order,
  fieldName,
  fieldType: 'bigint',
  fieldComment: '',
  nullable: false,
});

const oldIndex: IndexDefinition = {
  id: 'old-index',
  name: 'idx_users_email',
  fields: [{ name: 'email', direction: 'ASC' }],
  unique: false,
};

const createState = (): PersistedState => ({
  objectType: 'table',
  schemaName: '',
  tableName: 'users',
  tableComment: '',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  rows: [row('id', 1)],
  addCount: 10,
  indexInput: '',
  currentIndexFields: [],
  indexes: [oldIndex],
  authInput: '',
  authObjects: [],
});

const createDependencies = () => ({
  currentState: createState(),
  applyState: vi.fn(),
  setActiveTab: vi.fn(),
  highlightField: vi.fn(),
  animateIndex: vi.fn().mockResolvedValue(undefined),
});

describe('useAISchemaPatchFlow', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('rejects accepted changes after a concurrent edit without overwriting it', () => {
    const base = { ...createState(), indexes: [] };
    const candidate = { ...base, rows: base.rows.map((field) => ({ ...field, fieldType: 'int' })) };
    const current = {
      ...base,
      rows: base.rows.map((field) => ({
        ...field,
        nullable: true,
        fieldComment: 'remote comment',
      })),
    };
    const dependencies = { ...createDependencies(), currentState: current };
    const { result } = renderHook(() => useAISchemaPatchFlow(dependencies));
    expect(() =>
      result.current.applyChanges(buildAISchemaChanges(base, candidate), candidate, base),
    ).toThrow('表结构已发生变化，请基于当前内容重新生成建议。');
    expect(dependencies.applyState).not.toHaveBeenCalled();
  });

  it('computes and applies a selected batch once', () => {
    const dependencies = createDependencies();
    const nextRow = row('email', 2);
    const nextIndex = { ...oldIndex, unique: true };
    const candidate = {
      ...dependencies.currentState,
      tableComment: 'Accounts',
      rows: [...dependencies.currentState.rows, nextRow],
      indexes: [nextIndex],
    };
    const { result } = renderHook(() => useAISchemaPatchFlow(dependencies));

    act(() => {
      result.current.applyChanges(
        [
          {
            id: 'table:table_comment',
            kind: 'table',
            type: 'table_comment',
            oldValue: '',
            newValue: 'Accounts',
          },
          {
            id: 'field:add:email',
            kind: 'field',
            type: 'add',
            fieldName: 'email',
            newRow: nextRow,
          },
          {
            id: 'index:modify:idx_users_email',
            kind: 'index',
            type: 'modify',
            indexName: oldIndex.name,
            newIndex: nextIndex,
          },
        ],
        candidate,
        dependencies.currentState,
      );
      vi.runAllTimers();
    });

    expect(dependencies.applyState).toHaveBeenCalledTimes(1);
    expect(dependencies.applyState).toHaveBeenCalledWith(
      expect.objectContaining({
        tableComment: 'Accounts',
        rows: [expect.objectContaining({ fieldName: 'id' }), nextRow],
        indexes: [expect.objectContaining({ id: oldIndex.id, unique: true })],
      }),
    );
    expect(dependencies.setActiveTab).toHaveBeenCalledWith('indexes');
    expect(dependencies.animateIndex).toHaveBeenCalledWith(oldIndex.id, 'add');
  });

  it('does not commit or animate a batch with missing index fields', () => {
    const dependencies = createDependencies();
    dependencies.currentState.indexes = [];
    const { result } = renderHook(() => useAISchemaPatchFlow(dependencies));
    expect(() =>
      result.current.applyChanges(
        [
          {
            id: 'index:add',
            kind: 'index',
            type: 'add',
            indexName: oldIndex.name,
            newIndex: oldIndex,
          },
        ],
        dependencies.currentState,
        dependencies.currentState,
      ),
    ).toThrow('Unknown index field: email');
    expect(dependencies.applyState).not.toHaveBeenCalled();
    expect(dependencies.animateIndex).not.toHaveBeenCalled();
  });

  it('focuses existing field and index changes', () => {
    const dependencies = createDependencies();
    const { result } = renderHook(() => useAISchemaPatchFlow(dependencies));

    act(() => {
      result.current.focusChange({
        id: 'field:modify:id',
        kind: 'field',
        type: 'modify',
        fieldName: 'id',
      });
      result.current.focusChange({
        id: 'index:modify',
        kind: 'index',
        type: 'modify',
        indexName: oldIndex.name,
      });
    });

    expect(dependencies.highlightField).toHaveBeenCalledWith(0);
    expect(dependencies.animateIndex).toHaveBeenCalledWith(oldIndex.id, 'add');
  });
});
