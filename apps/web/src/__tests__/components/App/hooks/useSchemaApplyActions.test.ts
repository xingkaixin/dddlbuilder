import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParsedResult } from '@ddlbuilder/ddl-core/parser';
import type { FieldRow, PersistedState } from '@ddlbuilder/shared-types';
import { useSchemaApplyActions } from '@/components/App/hooks/useSchemaApplyActions';
import { diffPersistedState } from '@ddlbuilder/ddl-core';

const createState = (overrides: Partial<PersistedState> = {}): PersistedState => ({
  schemaName: '',
  tableName: '',
  tableComment: '',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  rows: [],
  addCount: 10,
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
      actionable: false,
      field: { fieldName: 'fixture', fieldType: 'INT' },
    })),
  },
) => {
  const actions = {
    setReviewResult: vi.fn(),
    replaceCurrentState: vi.fn<(state: PersistedState) => void>(),
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

  it('导入当前表时保留已有字段身份', () => {
    const state = createState({ tableName: 'users', rows: [createRow('id', 'INT')] });
    const { hook, actions } = createHook(state);

    const parsed: ParsedResult = {
      tableName: 'users',
      tableComment: '',
      indexes: [],
      authObjects: [],
      fields: [
        {
          name: 'id',
          type: 'INT',
          comment: '',
          nullable: true,
          defaultKind: 'none',
          defaultValue: '',
          onUpdate: 'none',
        },
      ],
      foreignKeys: [],
    };
    act(() => hook.result.current.handleImport(parsed, 'mysql'));
    const imported = actions.replaceCurrentState.mock.calls[0][0];
    expect(imported.rows[0].id).toBe(state.rows[0].id);
    expect(diffPersistedState(state, imported).fields).toEqual([]);
  });

  it('延迟删除期间修改文档后不再应用旧建议', () => {
    const initialState = createState({ rows: [createRow('obsolete'), createRow('kept')] });
    const { hook, actions } = createHook(initialState);

    act(() => {
      hook.result.current.handleApplySuggestion({
        id: 's3',
        type: 'remove_field',
        description: 'Remove field',
        actionable: true,
        fieldName: 'obsolete',
      });
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
            kind: 'index',
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

  it('AI 生成结果始终交给新草稿入口', () => {
    const { hook, actions } = createHook(
      createState({ dbType: 'postgresql', sqlFormatMode: 'aligned' }),
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
        sqlFormatMode: 'aligned',
        rows: [expect.objectContaining({ fieldName: 'id' })],
      }),
    );
    expect(actions.replaceCurrentState).not.toHaveBeenCalled();
  });
});
