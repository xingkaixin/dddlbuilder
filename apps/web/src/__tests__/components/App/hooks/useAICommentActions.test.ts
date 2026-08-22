import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FieldRow } from '@ddlbuilder/shared-types';
import { useAICommentActions } from '@/components/App/hooks/useAICommentActions';

const mocks = vi.hoisted(() => ({
  generateComments: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('@/hooks/useAIComments', () => ({
  useAIComments: () => ({ isLoading: false, generateComments: mocks.generateComments }),
}));

vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));

describe('useAICommentActions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('只填充缺失注释，并保留已有字段注释', async () => {
    mocks.generateComments.mockResolvedValue({
      tableComment: '用户表',
      fields: [
        { fieldName: 'id', fieldComment: '主键' },
        { fieldName: 'name', fieldComment: '模型生成名称' },
      ],
    });
    let rows: FieldRow[] = [
      {
        id: 'id',
        fieldName: 'id',
        fieldType: 'bigint',
        fieldComment: '',
        nullable: false,
      },
      {
        id: 'name',
        fieldName: 'name',
        fieldType: 'varchar(100)',
        fieldComment: '已有名称',
        nullable: false,
      },
    ];
    const setRows = vi.fn((next: FieldRow[] | ((previous: FieldRow[]) => FieldRow[])) => {
      rows = typeof next === 'function' ? next(rows) : next;
    });
    const setTableComment = vi.fn();
    const { result } = renderHook(() =>
      useAICommentActions({
        schemaName: 'public',
        tableName: 'users',
        tableComment: '',
        rows,
        setRows,
        setTableComment,
      }),
    );

    act(() => result.current.handleGenerateComments('fill_missing'));

    await waitFor(() => expect(setRows).toHaveBeenCalledOnce());
    expect(rows.map((row) => row.fieldComment)).toEqual(['主键', '已有名称']);
    expect(setTableComment).toHaveBeenCalledWith('用户表');
  });
});
