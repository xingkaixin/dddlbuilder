import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Y from 'yjs';
import {
  requireReadyWorkspaceStorage,
  useWorkspaceStorageTarget,
} from '@/hooks/workspacePersistence/useWorkspaceStorageTarget';

describe('useWorkspaceStorageTarget', () => {
  beforeEach(() => vi.clearAllMocks());

  it('显式表示用户工作区仍在加载', () => {
    const scope = { kind: 'user', userId: 'user-1', workspaceId: 'workspace-1' } as const;
    const { result } = renderHook(() =>
      useWorkspaceStorageTarget({ scope, yDoc: null, runInYDoc: vi.fn() }),
    );

    expect(result.current).toEqual({ kind: 'loading', scope });
    expect(() => requireReadyWorkspaceStorage(result.current)).toThrow('工作区未就绪');
  });

  it('匿名工作区选择本地分区', () => {
    const scope = { kind: 'anonymous' } as const;
    const runInYDoc = vi.fn();
    const { result } = renderHook(() =>
      useWorkspaceStorageTarget({ scope, yDoc: null, runInYDoc }),
    );

    expect(result.current).toEqual({ kind: 'indexeddb', scope });
    expect(runInYDoc).not.toHaveBeenCalled();
  });

  it('Y.Doc 就绪时暴露可返回结果的事务入口', () => {
    const scope = { kind: 'user', userId: 'user-1', workspaceId: 'workspace-1' } as const;
    const doc = {} as Y.Doc;
    const transactionSpy = vi.fn();
    const runInYDoc = <T>(mutate: (currentDoc: Y.Doc) => T): T => {
      transactionSpy();
      return mutate(doc);
    };
    const { result } = renderHook(() => useWorkspaceStorageTarget({ scope, yDoc: doc, runInYDoc }));
    const target = requireReadyWorkspaceStorage(result.current);
    if (target.kind !== 'ydoc') throw new Error('Y.Doc target missing');

    const outcome = target.transact((currentDoc) => (currentDoc === doc ? 'written' : 'invalid'));

    expect(outcome).toBe('written');
    expect(transactionSpy).toHaveBeenCalledOnce();
  });

  it('scope 缺失时保持加载态', () => {
    const { result } = renderHook(() =>
      useWorkspaceStorageTarget({ scope: null, yDoc: null, runInYDoc: vi.fn() }),
    );

    expect(result.current).toEqual({ kind: 'loading', scope: null });
  });
});
