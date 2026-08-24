import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Y from 'yjs';
import { useWorkspaceStorageTarget } from '@/hooks/workspacePersistence/useWorkspaceStorageTarget';

const mocks = vi.hoisted(() => ({
  invalidateLegacyWorkspaceMigration: vi.fn(),
}));

vi.mock('@/services/workspaceLegacyMigrationMarker', () => ({
  invalidateLegacyWorkspaceMigration: mocks.invalidateLegacyWorkspaceMigration,
}));

describe('useWorkspaceStorageTarget', () => {
  beforeEach(() => vi.clearAllMocks());

  it('Y.Doc 未就绪时只写本地并重开用户迁移', async () => {
    const scope = { kind: 'user', userId: 'user-1', workspaceId: 'workspace-1' } as const;
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
    expect(mocks.invalidateLegacyWorkspaceMigration).toHaveBeenCalledWith(scope);
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
    expect(mocks.invalidateLegacyWorkspaceMigration).not.toHaveBeenCalled();
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
