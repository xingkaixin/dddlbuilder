import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Y from 'yjs';
import { useWorkspaceStorageTarget } from '@/hooks/workspacePersistence/useWorkspaceStorageTarget';

describe('useWorkspaceStorageTarget', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects user writes while the authoritative YDoc is loading', async () => {
    const scope = { kind: 'user', userId: 'user-1', workspaceId: 'workspace-1' } as const;
    const writeLocal = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useWorkspaceStorageTarget({ scope, yDoc: null, runInYDoc: vi.fn() }),
    );
    const outcome = await result.current.write({ yDoc: vi.fn(), local: writeLocal }).then(
      () => 'written',
      () => 'rejected',
    );
    expect(outcome).toBe('rejected');
    expect(writeLocal).not.toHaveBeenCalled();
  });

  it('匿名工作区写入本地分区', async () => {
    const scope = { kind: 'anonymous' } as const;
    const runInYDoc = vi.fn();
    const writeYDoc = vi.fn();
    const writeLocal = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useWorkspaceStorageTarget({ scope, yDoc: null, runInYDoc }),
    );

    await act(() => result.current.write({ yDoc: writeYDoc, local: writeLocal }));

    expect(result.current.kind).toBe('indexeddb');
    expect(writeLocal).toHaveBeenCalledWith(scope);
    expect(runInYDoc).not.toHaveBeenCalled();
  });

  it('Y.Doc 就绪时在事务中写入，并按需清理旧本地副本', async () => {
    const scope = { kind: 'user', userId: 'user-1', workspaceId: 'workspace-1' } as const;
    const doc = {} as Y.Doc;
    const runInYDoc = vi.fn((mutate: (currentDoc: Y.Doc) => void) => mutate(doc));
    const writeYDoc = vi.fn();
    const writeLocal = vi.fn().mockResolvedValue(undefined);
    const cleanupLocal = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useWorkspaceStorageTarget({ scope, yDoc: doc, runInYDoc }));

    await act(() => result.current.write({ yDoc: writeYDoc, local: writeLocal }));
    await act(() => result.current.cleanupLocal(cleanupLocal));

    expect(result.current.kind).toBe('ydoc');
    expect(writeYDoc).toHaveBeenCalledWith(doc);
    expect(writeLocal).not.toHaveBeenCalled();
    expect(cleanupLocal).toHaveBeenCalledWith(scope);
  });

  it('永久删除会同时清理当前 Y.Doc 与旧本地副本', async () => {
    const scope = { kind: 'anonymous' } as const;
    const doc = {} as Y.Doc;
    const runInYDoc = vi.fn((mutate: (currentDoc: Y.Doc) => void) => mutate(doc));
    const removeYDoc = vi.fn();
    const removeLocal = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useWorkspaceStorageTarget({ scope, yDoc: doc, runInYDoc }));

    await act(() => result.current.removeEverywhere({ yDoc: removeYDoc, local: removeLocal }));

    expect(removeYDoc).toHaveBeenCalledWith(doc);
    expect(removeLocal).toHaveBeenCalledWith(scope);
  });
});
