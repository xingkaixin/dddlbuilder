import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParsedResult } from '@ddlbuilder/ddl-core/parser';
import type { FieldRow, PersistedState } from '@ddlbuilder/shared-types';
import type { DDLReviewResult } from '@ddlbuilder/shared-types/ddl-review';
import { diffPersistedState } from '@ddlbuilder/ddl-core';
import { buildSchemaStateSignature } from '@ddlbuilder/workspace-core';
import { applySavedState } from '@/components/App/applySavedState';
import { useSchemaApplyActions } from '@/components/App/hooks/useSchemaApplyActions';
import { toPersistedState } from '@/stores/editorDocumentCodec';
import { useEditorStore } from '@/stores/editorStore';
import { isStructuredSuggestion, useReviewStore } from '@/stores/reviewStore';

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

const getDocumentKey = () => buildSchemaStateSignature(toPersistedState(useEditorStore.getState()));

const defaultReviewResult = (): DDLReviewResult => ({
  score: 8,
  summary: 'review',
  suggestions: ['s1', 's2', 's3', 's4', 's5'].map((id) => ({
    id,
    type: 'general',
    description: id,
    actionable: false,
  })),
});

const createHook = (
  initialState = createState(),
  reviewResult: DDLReviewResult | null = defaultReviewResult(),
) => {
  applySavedState(initialState);

  if (reviewResult) {
    useReviewStore.getState().succeedReview(getDocumentKey(), reviewResult);
  } else {
    useReviewStore.getState().resetReview();
  }

  const actions = {
    replaceCurrentState: vi.fn((state: PersistedState) => applySavedState(state)),
    openGeneratedState: vi.fn(),
    setActiveTab: vi.fn(),
    triggerIndexAnimation: vi.fn(),
    triggerFieldTableHighlight: vi.fn(),
    showToast: vi.fn(),
  };

  const hook = renderHook(() =>
    useSchemaApplyActions({
      getCurrentDocumentKey: getDocumentKey,
      ...actions,
    }),
  );

  return { hook, actions };
};

describe('useSchemaApplyActions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useEditorStore.getState().resetDocument();
    useReviewStore.getState().resetReview();
  });

  afterEach(() => {
    vi.useRealTimers();
    useEditorStore.getState().resetDocument();
    useReviewStore.getState().resetReview();
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

  it('连续应用多条建议时读取最新状态并防止重复应用', () => {
    const initialState = createState({ rows: [createRow('id', 'BIGINT')] });

    const addSuggestion = {
      id: 's-add',
      type: 'add_field' as const,
      description: 'Add email column',
      actionable: true,
      field: { fieldName: 'email', fieldType: 'VARCHAR(255)', nullable: false },
    };
    const modifySuggestion = {
      id: 's-mod',
      type: 'modify_field' as const,
      description: 'Add email comment',
      actionable: true,
      fieldModification: {
        fieldName: 'email',
        changes: { fieldComment: 'User email' },
      },
    };
    const { hook } = createHook(initialState, {
      score: 7,
      summary: 'review',
      suggestions: ['legacy text suggestion', addSuggestion, modifySuggestion],
    });

    act(() => {
      const apply = hook.result.current.handleApplySuggestion;
      apply(addSuggestion);
      apply(addSuggestion);
      apply(modifySuggestion);
    });

    const rows = useEditorStore.getState().rows;
    expect(rows.map((row) => row.fieldName)).toEqual(['id', 'email']);
    expect(rows[1].fieldComment).toBe('User email');

    const reviewState = useReviewStore.getState();
    expect(reviewState.documentKey).toBe(getDocumentKey());
    const structured = reviewState.result?.suggestions.filter(isStructuredSuggestion) ?? [];
    expect(structured.map((item) => [item.id, item.applied])).toEqual([
      ['s-add', true],
      ['s-mod', true],
    ]);
  });

  it('延迟删除期间未变更文档和评审时完成删除并更新评审状态', () => {
    const initialState = createState({ rows: [createRow('obsolete'), createRow('kept')] });

    const removeSuggestion = {
      id: 's3',
      type: 'remove_field' as const,
      description: 'Remove field',
      actionable: true,
      fieldName: 'obsolete',
    };
    const { hook } = createHook(initialState, {
      score: 8,
      summary: 'review',
      suggestions: [removeSuggestion],
    });

    act(() => hook.result.current.handleApplySuggestion(removeSuggestion));
    act(() => vi.advanceTimersByTime(500));

    expect(useEditorStore.getState().rows.map((row) => row.fieldName)).toEqual(['kept']);
    expect(useReviewStore.getState().documentKey).toBe(getDocumentKey());

    const applied = useReviewStore
      .getState()
      .result?.suggestions.find(
        (item) => isStructuredSuggestion(item) && item.id === removeSuggestion.id,
      );
    expect(applied && isStructuredSuggestion(applied) ? applied.applied : false).toBe(true);
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

    act(() => {
      applySavedState(
        createState({
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
      );
    });
    act(() => vi.advanceTimersByTime(500));

    expect(actions.replaceCurrentState).not.toHaveBeenCalled();
    expect(useEditorStore.getState().rows.map((row) => row.fieldName)).toEqual([
      'obsolete',
      'kept',
      'added_later',
    ]);
  });

  it('延迟删除期间清空评审后不再应用旧建议', () => {
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

    act(() => useReviewStore.getState().clearReview(getDocumentKey()));
    act(() => vi.advanceTimersByTime(500));

    expect(actions.replaceCurrentState).not.toHaveBeenCalled();
    expect(useEditorStore.getState().rows.map((row) => row.fieldName)).toEqual([
      'obsolete',
      'kept',
    ]);
  });

  it('添加索引建议在状态提交后仍触发索引新增动画', () => {
    const initialState = createState({ rows: [createRow('email', 'VARCHAR(255)')] });

    const addIndexSuggestion = {
      id: 's-idx',
      type: 'add_index' as const,
      description: 'Add email index',
      actionable: true,
      index: {
        name: 'idx_email',
        fields: [{ name: 'email', direction: 'ASC' as const }],
        unique: true,
      },
    };
    const { hook, actions } = createHook(initialState, {
      score: 7,
      summary: 'review',
      suggestions: [addIndexSuggestion],
    });

    act(() => hook.result.current.handleApplySuggestion(addIndexSuggestion));
    act(() => vi.advanceTimersByTime(50));

    const addedIndex = useEditorStore.getState().indexes[0];
    expect(addedIndex).toMatchObject({ name: 'idx_email', kind: 'unique_index' });
    expect(actions.triggerIndexAnimation).toHaveBeenCalledExactlyOnceWith(addedIndex.id, 'add');
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
