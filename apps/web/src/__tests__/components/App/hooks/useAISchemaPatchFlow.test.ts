import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FieldRow, IndexDefinition } from '@ddlbuilder/shared-types';
import { useAISchemaPatchFlow } from '@/components/App/hooks/useAISchemaPatchFlow';

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

const createDependencies = () => ({
  rows: [row('id', 1)],
  indexes: [oldIndex],
  setRows: vi.fn((next: FieldRow[] | ((current: FieldRow[]) => FieldRow[])) => {
    if (typeof next === 'function') next([row('id', 1)]);
  }),
  setIndexes: vi.fn(),
  setSchemaName: vi.fn(),
  setTableName: vi.fn(),
  setTableComment: vi.fn(),
  setActiveTab: vi.fn(),
  highlightField: vi.fn(),
  animateIndex: vi.fn().mockResolvedValue(undefined),
});

describe('useAISchemaPatchFlow', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it.each([
    ['schema_name', 'next_schema', 'setSchemaName'],
    ['table_name', 'next_table', 'setTableName'],
    ['table_comment', 'next comment', 'setTableComment'],
  ] as const)('applies %s table changes', (type, newValue, setter) => {
    const dependencies = createDependencies();
    const { result } = renderHook(() => useAISchemaPatchFlow(dependencies));

    act(() =>
      result.current.applyChange(
        {
          id: `table:${type}`,
          kind: 'table',
          type,
          oldValue: '',
          newValue,
        },
        {
          schemaName: '',
          tableName: '',
          tableComment: '',
          dbType: 'mysql',
          sqlFormatMode: 'compact',
          rows: [],
          addCount: 12,
          indexInput: '',
          currentIndexFields: [],
          indexes: [],
          authInput: '',
          authObjects: [],
        },
      ),
    );

    expect(dependencies[setter]).toHaveBeenCalledWith(newValue);
  });

  it('applies and focuses a field transition', () => {
    const dependencies = createDependencies();
    const { result } = renderHook(() => useAISchemaPatchFlow(dependencies));
    const nextRow = row('email', 2);

    act(() =>
      result.current.applyChange(
        {
          id: 'field:add:email',
          kind: 'field',
          type: 'add',
          fieldName: 'email',
          newRow: nextRow,
        },
        {
          schemaName: '',
          tableName: '',
          tableComment: '',
          dbType: 'mysql',
          sqlFormatMode: 'compact',
          rows: [row('id', 1), nextRow],
          addCount: 12,
          indexInput: '',
          currentIndexFields: [],
          indexes: [],
          authInput: '',
          authObjects: [],
        },
      ),
    );

    const updater = dependencies.setRows.mock.calls[0]?.[0] as (current: FieldRow[]) => FieldRow[];
    expect(updater(dependencies.rows).map((item) => item.fieldName)).toEqual(['id', 'email']);
    expect(dependencies.setActiveTab).toHaveBeenCalledWith('fields');
    expect(dependencies.highlightField).toHaveBeenCalledWith(1);
  });

  it('adds, modifies, and removes indexes after their transitions', () => {
    const dependencies = createDependencies();
    const { result } = renderHook(() => useAISchemaPatchFlow(dependencies));
    const nextIndex = { ...oldIndex, id: 'next-index', unique: true };

    act(() => {
      result.current.applyChange(
        {
          id: 'index:add',
          kind: 'index',
          type: 'add',
          indexName: nextIndex.name,
          newIndex: nextIndex,
        },
        {} as never,
      );
      result.current.applyChange(
        {
          id: 'index:modify',
          kind: 'index',
          type: 'modify',
          indexName: oldIndex.name,
          newIndex: nextIndex,
        },
        {} as never,
      );
      result.current.applyChange(
        {
          id: 'index:remove',
          kind: 'index',
          type: 'remove',
          indexName: oldIndex.name,
          oldIndex,
        },
        {} as never,
      );
      vi.runAllTimers();
    });

    const add = dependencies.setIndexes.mock.calls[0]?.[0] as (
      current: IndexDefinition[],
    ) => IndexDefinition[];
    const modify = dependencies.setIndexes.mock.calls[1]?.[0] as (
      current: IndexDefinition[],
    ) => IndexDefinition[];
    const remove = dependencies.setIndexes.mock.calls[2]?.[0] as (
      current: IndexDefinition[],
    ) => IndexDefinition[];
    expect(add([])).toEqual([nextIndex]);
    expect(modify([oldIndex])[0]).toMatchObject({ id: oldIndex.id, unique: true });
    expect(remove([oldIndex])).toEqual([]);
    expect(dependencies.animateIndex).toHaveBeenCalledWith(nextIndex.id, 'add');
    expect(dependencies.animateIndex).toHaveBeenCalledWith(oldIndex.id, 'remove');
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
