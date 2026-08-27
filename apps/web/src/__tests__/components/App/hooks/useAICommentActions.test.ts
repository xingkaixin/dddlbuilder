import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AICommentResult } from '@ddlbuilder/shared-types';
import { useAICommentActions } from '@/components/App/hooks/useAICommentActions';
import { useEditorStore } from '@/stores/editorStore';
import { toPersistedState } from '@/stores/editorDocumentCodec';
import { serializePersistedStateForComparison } from '@/utils/persistedStateSignature';
import { createQueryClientWrapper } from '@/__tests__/utils/queryClient';

const mocks = vi.hoisted(() => ({
  requestComments: vi.fn(),
  showToast: vi.fn(),
  getAccessError: () => null,
  resolveRequestError: (error: Error) => error.message,
  refreshCreditsAfterSuccess: vi.fn(),
}));

vi.mock('@/services/aiCommentService', async (importOriginal) => ({
  ...(await importOriginal()),
  requestAIComments: mocks.requestComments,
}));
vi.mock('@/hooks/useAIRequestAccess', () => ({ useAIRequestAccess: () => mocks }));
vi.mock('@/hooks/useToast', () => ({ useToast: () => ({ showToast: mocks.showToast }) }));

const commentResult: AICommentResult = {
  tableComment: '用户表',
  fields: [
    { fieldName: 'id', fieldComment: '主键' },
    { fieldName: 'name', fieldComment: '模型生成名称' },
  ],
};

const renderComments = () => {
  const { wrapper } = createQueryClientWrapper();
  return renderHook(
    ({ documentId }) => {
      const editor = useEditorStore();
      return useAICommentActions({
        ...editor,
        getCurrentDocumentKey: () =>
          JSON.stringify([
            documentId,
            serializePersistedStateForComparison(toPersistedState(useEditorStore.getState())),
          ]),
        documentKey: JSON.stringify([
          documentId,
          serializePersistedStateForComparison(toPersistedState(editor)),
        ]),
      });
    },
    { wrapper, initialProps: { documentId: 'draft-a' } },
  );
};

const delayComments = () => {
  let resolve!: (value: AICommentResult) => void;
  mocks.requestComments.mockReturnValueOnce(
    new Promise<AICommentResult>((done) => {
      resolve = done;
    }),
  );
  return (value = commentResult) => resolve(value);
};

const startComments = async (hook: ReturnType<typeof renderComments>) => {
  act(() => hook.result.current.handleGenerateComments('fill_missing'));
  await waitFor(() => expect(mocks.requestComments).toHaveBeenCalled());
  return mocks.requestComments.mock.lastCall?.[1] as AbortSignal;
};

describe('useAICommentActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useEditorStore.getState().replaceDocument({
      ...toPersistedState(useEditorStore.getInitialState()),
      schemaName: 'public',
      tableName: 'users',
      rows: [
        { id: 'id', fieldName: 'id', fieldType: 'bigint', fieldComment: '', nullable: false },
        {
          id: 'name',
          fieldName: 'name',
          fieldType: 'varchar(100)',
          fieldComment: '已有名称',
          nullable: false,
        },
      ],
    });
  });
  afterEach(() => useEditorStore.getState().resetDocument());

  it('只填充缺失注释，并保留已有字段注释', async () => {
    mocks.requestComments.mockResolvedValueOnce(commentResult);
    const hook = renderComments();
    await startComments(hook);
    await waitFor(() => expect(useEditorStore.getState().tableComment).toBe('用户表'));
    expect(useEditorStore.getState().rows.map((row) => row.fieldComment)).toEqual([
      '主键',
      '已有名称',
    ]);
    expect(mocks.refreshCreditsAfterSuccess).toHaveBeenCalledOnce();
  });

  it('翻译模式可以更新当前文档的已有注释', async () => {
    mocks.requestComments.mockResolvedValueOnce(commentResult);
    const hook = renderComments();
    act(() => hook.result.current.handleGenerateComments('translate', 'en-US'));
    await waitFor(() =>
      expect(useEditorStore.getState().rows[1].fieldComment).toBe('模型生成名称'),
    );
  });

  it('切换到内容相同的另一文档也会取消请求并丢弃迟到结果', async () => {
    const finish = delayComments();
    const hook = renderComments();
    const signal = await startComments(hook);
    hook.rerender({ documentId: 'draft-b' });
    expect(signal.aborted).toBe(true);
    expect(hook.result.current.isGeneratingComments).toBe(false);
    await act(async () => finish());
    expect(useEditorStore.getState().tableComment).toBe('');
    expect(useEditorStore.getState().rows[0].fieldComment).toBe('');
    expect(mocks.showToast).not.toHaveBeenCalled();
  });

  it('等待期间手工修改注释后不会被旧结果覆盖', async () => {
    const finish = delayComments();
    const hook = renderComments();
    const signal = await startComments(hook);
    act(() => useEditorStore.getState().setTableComment('用户刚输入的注释'));
    expect(signal.aborted).toBe(true);
    await act(async () => finish());
    expect(useEditorStore.getState().tableComment).toBe('用户刚输入的注释');
    expect(useEditorStore.getState().rows[0].fieldComment).toBe('');
  });

  it('响应已返回但尚未写回时，仍保护最新编辑', async () => {
    const finish = delayComments();
    mocks.refreshCreditsAfterSuccess.mockImplementationOnce(() => {
      useEditorStore.getState().setTableComment('最新编辑');
    });
    const hook = renderComments();
    await startComments(hook);
    await act(async () => finish());
    expect(useEditorStore.getState().tableComment).toBe('最新编辑');
  });

  it('卸载后取消请求，迟到结果不能写入全局编辑器', async () => {
    const finish = delayComments();
    const hook = renderComments();
    const signal = await startComments(hook);
    hook.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => finish());
    expect(useEditorStore.getState().tableComment).toBe('');
    expect(useEditorStore.getState().rows[0].fieldComment).toBe('');
  });

  it('新请求开始后丢弃旧请求结果，新请求仍可正常应用', async () => {
    const finishOld = delayComments();
    const finishNew = delayComments();
    const hook = renderComments();
    const signal = await startComments(hook);
    act(() => hook.result.current.handleGenerateComments('translate', 'en-US'));
    await waitFor(() => expect(mocks.requestComments).toHaveBeenCalledTimes(2));
    expect(signal.aborted).toBe(true);
    await act(async () => finishOld());
    expect(useEditorStore.getState().tableComment).toBe('');
    await act(async () => finishNew({ ...commentResult, tableComment: 'Users' }));
    expect(useEditorStore.getState().tableComment).toBe('Users');
  });
});
