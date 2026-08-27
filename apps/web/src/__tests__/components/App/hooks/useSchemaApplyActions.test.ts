import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParsedResult } from '@ddlbuilder/ddl-core/parser';
import type { FieldRow, PersistedState } from '@ddlbuilder/shared-types';
import { useSchemaApplyActions } from '@/components/App/hooks/useSchemaApplyActions';

const createState = (overrides: Partial<PersistedState> = {}): PersistedState => ({
  schemaName: '',
  tableName: '',
  tableComment: '',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  rows: [],
  addCount: 10,
  indexInput: '',
  currentIndexFields: [],
  indexes: [],
  authInput: '',
  authObjects: [],
  ...overrides,
});

const createRow = (fieldName: string, fieldType = 'VARCHAR'): FieldRow => ({
  id: fieldName,
  fieldName,
  fieldType,
  fieldComment: '',
  nullable: true,
  defaultKind: 'none',
  defaultValue: '',
  onUpdate: 'none',
});

const createHook = (
  currentState = createState(),
  reviewResult: Parameters<typeof useSchemaApplyActions>[0]['reviewResult'] = {
    score: 8,
    summary: 'review',
    suggestions: ['s1', 's2', 's3', 's4', 's5'].map((id) => ({
      id,
      type: 'general',
      description: id,
    })),
  } as never,
) => {
  const actions = {
    setReviewResult: vi.fn(),
    replaceCurrentState: vi.fn(),
    openGeneratedState: vi.fn(),
    setActiveTab: vi.fn(),
    triggerIndexAnimation: vi.fn(),
    triggerFieldTableHighlight: vi.fn(),
    showToast: vi.fn(),
  };
  const hook = renderHook(
    ({ state, review }) =>
      useSchemaApplyActions({
        currentState: state,
        reviewResult: review,
        ...actions,
      }),
    { initialProps: { state: currentState, review: reviewResult } },
  );
  return { hook, actions };
};

describe('useSchemaApplyActions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('导入 SQL 时一次替换完整文档并补齐默认配置', () => {
    const { hook, actions } = createHook();
    const result: ParsedResult = {
      tableName: 'COO_SC_RAT',
      tableComment: '证券公司评级1',
      fields: [],
      indexes: [],
      authObjects: [],
      tableMiscConfig: {
        enabled: true,
        engine: 'InnoDB',
        charset: 'utf8mb4',
        collation: 'utf8mb4_bin',
        tablespace: '',
      },
    };

    act(() => hook.result.current.handleImport(result, 'mysql'));

    expect(actions.replaceCurrentState).toHaveBeenCalledOnce();
    expect(actions.replaceCurrentState).toHaveBeenCalledWith(
      expect.objectContaining({
        tableName: 'COO_SC_RAT',
        tableMiscConfig: result.tableMiscConfig,
        mysqlPartitionConfig: expect.objectContaining({
          enabled: false,
          type: 'RANGE',
          partitionCount: 4,
        }),
        rows: expect.any(Array),
        indexes: [],
        foreignKeys: [],
      }),
    );
  });

  it('添加字段建议时一次替换文档并保留其他状态', () => {
    const state = createState({ tableName: 'users' });
    const { hook, actions } = createHook(state, {
      suggestions: [{ id: 's1', type: 'add_field', description: 'Add field' }],
    } as never);

    act(() => {
      hook.result.current.handleApplySuggestion({
        id: 's1',
        type: 'add_field',
        description: 'Add field',
        field: { fieldName: 'new_col', fieldType: 'INT' },
      } as never);
    });

    expect(actions.replaceCurrentState).toHaveBeenCalledWith(
      expect.objectContaining({
        tableName: 'users',
        rows: [
          expect.objectContaining({
            fieldName: 'new_col',
            fieldType: 'INT',
            nullable: true,
            defaultKind: 'none',
          }),
        ],
      }),
    );
    expect(actions.setActiveTab).toHaveBeenCalledWith('fields');
    expect(actions.triggerFieldTableHighlight).toHaveBeenCalledWith(0);
    expect(actions.setReviewResult).toHaveBeenCalledWith(
      {
        suggestions: [
          {
            id: 's1',
            type: 'add_field',
            description: 'Add field',
            applied: true,
          },
        ],
      },
      actions.replaceCurrentState.mock.calls[0][0],
    );
  });

  it('修改不存在的字段时不替换文档', () => {
    const { hook, actions } = createHook(createState({ rows: [createRow('existing')] }));

    act(() => {
      hook.result.current.handleApplySuggestion({
        id: 's2',
        type: 'modify_field',
        description: 'Modify field',
        fieldModification: {
          fieldName: 'missing',
          changes: { fieldType: 'INT' },
        },
      } as never);
    });

    expect(actions.replaceCurrentState).not.toHaveBeenCalled();
    expect(actions.showToast).toHaveBeenCalledWith('未找到字段 "missing"，无法应用修改');
  });

  it('延迟删除期间修改文档后不再应用旧建议', () => {
    const initialState = createState({ rows: [createRow('obsolete'), createRow('kept')] });
    const { hook, actions } = createHook(initialState);

    act(() => {
      hook.result.current.handleApplySuggestion({
        id: 's3',
        type: 'remove_field',
        description: 'Remove field',
        fieldName: 'obsolete',
      } as never);
    });

    hook.rerender({
      review: null,
      state: createState({
        tableComment: 'edited during animation',
        rows: [...initialState.rows, createRow('added_later')],
        indexes: [
          {
            id: 'obsolete-index',
            name: 'idx_obsolete',
            fields: [{ name: 'obsolete', direction: 'ASC' }],
            unique: false,
          },
        ],
        foreignKeys: [
          {
            id: 'obsolete-fk',
            name: 'fk_obsolete',
            fields: ['obsolete'],
            refTable: 'other',
            refFields: ['id'],
          },
        ],
      }),
    });
    act(() => vi.advanceTimersByTime(500));

    expect(actions.replaceCurrentState).not.toHaveBeenCalled();
    expect(actions.setReviewResult).not.toHaveBeenCalled();
  });

  it('过期结果即使使用旧事件处理函数也不能修改文档', () => {
    const { hook, actions } = createHook();
    const apply = hook.result.current.handleApplySuggestion;
    hook.rerender({ state: createState({ tableName: 'other' }), review: null });
    act(() =>
      apply({
        id: 's1',
        type: 'add_field',
        field: { fieldName: 'wrong', fieldType: 'INT' },
      } as never),
    );
    expect(actions.replaceCurrentState).not.toHaveBeenCalled();
  });

  it('延迟删除完成后才标记建议，并清理字段关联', () => {
    const { hook, actions } = createHook(
      createState({
        rows: [createRow('obsolete'), createRow('kept')],
        indexes: [
          {
            id: 'idx',
            name: 'idx_obsolete',
            fields: [{ name: 'obsolete', direction: 'ASC' }],
            unique: false,
          },
        ],
        foreignKeys: [
          {
            id: 'fk',
            name: 'fk_obsolete',
            fields: ['obsolete'],
            refTable: 'other',
            refFields: ['id'],
          },
        ],
      }),
    );
    act(() =>
      hook.result.current.handleApplySuggestion({
        id: 's3',
        type: 'remove_field',
        fieldName: 'obsolete',
      } as never),
    );
    expect(actions.setReviewResult).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(500));
    expect(actions.replaceCurrentState).toHaveBeenCalledWith(
      expect.objectContaining({ rows: [createRow('kept')], indexes: [], foreignKeys: [] }),
    );
    expect(actions.setReviewResult).toHaveBeenCalledOnce();
  });

  it('卸载后取消延迟操作', () => {
    const { hook, actions } = createHook(createState({ rows: [createRow('obsolete')] }));
    act(() =>
      hook.result.current.handleApplySuggestion({
        id: 's3',
        type: 'remove_field',
        fieldName: 'obsolete',
      } as never),
    );
    hook.unmount();
    act(() => vi.advanceTimersByTime(500));
    expect(actions.replaceCurrentState).not.toHaveBeenCalled();
  });

  it('添加索引建议时原子替换并触发动画', () => {
    const { hook, actions } = createHook(createState());

    act(() => {
      hook.result.current.handleApplySuggestion({
        id: 's4',
        type: 'add_index',
        description: 'Add index',
        index: {
          name: 'idx_name',
          fields: [{ name: 'name', direction: 'ASC' }],
          unique: true,
        },
      } as never);
    });

    const nextState = actions.replaceCurrentState.mock.calls[0][0] as PersistedState;
    expect(nextState.indexes).toEqual([
      expect.objectContaining({ name: 'idx_name', unique: true }),
    ]);
    act(() => vi.advanceTimersByTime(50));
    expect(actions.triggerIndexAnimation).toHaveBeenCalledWith(nextState.indexes[0].id, 'add');
  });

  it('不支持自动应用的建议只提示用户', () => {
    const { hook, actions } = createHook();

    act(() => {
      hook.result.current.handleApplySuggestion({
        id: 's5',
        type: 'general',
        description: 'General suggestion',
      } as never);
    });

    expect(actions.replaceCurrentState).not.toHaveBeenCalled();
    expect(actions.showToast).toHaveBeenCalledWith('该类型建议不支持自动应用，请手动调整');
  });

  it('AI 生成结果始终交给新草稿入口', () => {
    const { hook, actions } = createHook(
      createState({ dbType: 'postgresql', sqlFormatMode: 'pretty' }),
    );

    act(() => {
      hook.result.current.handleApplyAIGeneratedSchema({
        tableName: 'ai_table',
        tableComment: 'AI Generated',
        fields: [
          {
            fieldName: 'id',
            fieldType: 'BIGINT',
            fieldComment: '',
            nullable: false,
            defaultKind: 'none',
            isPrimaryKey: true,
          },
        ],
        indexes: [],
      });
    });

    expect(actions.openGeneratedState).toHaveBeenCalledWith(
      expect.objectContaining({
        tableName: 'ai_table',
        dbType: 'postgresql',
        sqlFormatMode: 'pretty',
        rows: [expect.objectContaining({ fieldName: 'id' })],
      }),
    );
    expect(actions.replaceCurrentState).not.toHaveBeenCalled();
  });
});
