import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';

type MockBootstrap = {
  globalDraft: unknown | null;
  drafts: Array<{ draftId: string; record: unknown }>;
  session: unknown | null;
  savedTable: unknown | null;
};

const createBootstrapMock = async (options?: {
  readImpl?: (scope?: WorkspaceScope) => Promise<MockBootstrap>;
  migrateImpl?: () => Promise<void>;
}) => {
  const readWorkspaceBootstrap = vi.fn(
    options?.readImpl ??
      (async () => ({ globalDraft: null, drafts: [], session: null, savedTable: null })),
  );
  const migrateLegacyWorkspaceFromLocalStorage = vi.fn(
    options?.migrateImpl ?? (async () => undefined),
  );

  vi.doMock('@/utils/workspaceStateDb', () => ({
    readWorkspaceBootstrap,
    migrateLegacyWorkspaceFromLocalStorage,
  }));

  const mod = await import('@/hooks/workspacePersistence/bootstrap');
  return {
    getWorkspaceBootstrap: mod.getWorkspaceBootstrap,
    readWorkspaceBootstrap,
    migrateLegacyWorkspaceFromLocalStorage,
  };
};

describe('workspacePersistence/bootstrap', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('首读命中时应直接返回并跳过迁移', async () => {
    const {
      getWorkspaceBootstrap,
      readWorkspaceBootstrap,
      migrateLegacyWorkspaceFromLocalStorage,
    } = await createBootstrapMock({
      readImpl: async () => ({
        globalDraft: { state: { tableName: 'users' }, updatedAt: 1 },
        drafts: [],
        session: null,
        savedTable: null,
      }),
    });

    const result = await getWorkspaceBootstrap();

    expect(result.globalDraft).toEqual({
      state: { tableName: 'users' },
      updatedAt: 1,
    });
    expect(readWorkspaceBootstrap).toHaveBeenCalledTimes(1);
    expect(migrateLegacyWorkspaceFromLocalStorage).not.toHaveBeenCalled();
  });

  it('首读为空时应迁移后重读', async () => {
    const {
      getWorkspaceBootstrap,
      readWorkspaceBootstrap,
      migrateLegacyWorkspaceFromLocalStorage,
    } = await createBootstrapMock({
      readImpl: vi
        .fn()
        .mockResolvedValueOnce({
          globalDraft: null,
          drafts: [],
          session: null,
          savedTable: null,
        })
        .mockResolvedValueOnce({
          globalDraft: null,
          drafts: [],
          session: {
            activeSource: { kind: 'draft', draftId: 'default' },
            activeState: null,
          },
          savedTable: null,
        }),
    });

    const result = await getWorkspaceBootstrap();

    expect(migrateLegacyWorkspaceFromLocalStorage).toHaveBeenCalledTimes(1);
    expect(readWorkspaceBootstrap).toHaveBeenCalledTimes(2);
    expect(result.session).toEqual({
      activeSource: { kind: 'draft', draftId: 'default' },
      activeState: null,
    });
  });

  it('读取失败时保留错误，重试可重新读取', async () => {
    const {
      getWorkspaceBootstrap,
      readWorkspaceBootstrap,
      migrateLegacyWorkspaceFromLocalStorage,
    } = await createBootstrapMock({
      readImpl: async () => {
        throw new Error('db fail');
      },
      migrateImpl: async () => {
        throw new Error('migrate fail');
      },
    });

    await expect(getWorkspaceBootstrap()).rejects.toThrow('db fail');
    await expect(getWorkspaceBootstrap()).rejects.toThrow('db fail');
    expect(readWorkspaceBootstrap).toHaveBeenCalledTimes(2);
    expect(migrateLegacyWorkspaceFromLocalStorage).not.toHaveBeenCalled();
  });

  it('并发调用应复用同一个 Promise', async () => {
    let resolveRead: (value: MockBootstrap) => void = () => undefined;
    const pendingRead = new Promise<MockBootstrap>((resolve) => {
      resolveRead = resolve;
    });

    const { getWorkspaceBootstrap, readWorkspaceBootstrap } = await createBootstrapMock({
      readImpl: () => pendingRead,
    });

    const p1 = getWorkspaceBootstrap();
    const p2 = getWorkspaceBootstrap();

    expect(p1).toBe(p2);
    expect(readWorkspaceBootstrap).toHaveBeenCalledTimes(1);

    resolveRead({ globalDraft: null, drafts: [], session: { id: 1 }, savedTable: null });
    await expect(p1).resolves.toEqual({
      globalDraft: null,
      drafts: [],
      session: { id: 1 },
      savedTable: null,
    });
  });

  it('completed reads are not cached even within the same millisecond', async () => {
    const { getWorkspaceBootstrap, readWorkspaceBootstrap } = await createBootstrapMock({
      readImpl: vi
        .fn()
        .mockResolvedValueOnce({
          globalDraft: { v: 1 },
          drafts: [],
          session: null,
          savedTable: null,
        })
        .mockResolvedValueOnce({
          globalDraft: { v: 2 },
          drafts: [],
          session: null,
          savedTable: null,
        }),
    });
    expect((await getWorkspaceBootstrap()).globalDraft).toEqual({ v: 1 });
    expect((await getWorkspaceBootstrap()).globalDraft).toEqual({ v: 2 });
    expect(readWorkspaceBootstrap).toHaveBeenCalledTimes(2);
  });

  it('不同 scope 并发调用应分别读取', async () => {
    const userScope: WorkspaceScope = {
      kind: 'user',
      userId: 'user-1',
      workspaceId: 'ws-1',
    };
    let resolveAnonymous: (value: MockBootstrap) => void = () => undefined;
    let resolveUser: (value: MockBootstrap) => void = () => undefined;
    const anonymousRead = new Promise<MockBootstrap>((resolve) => {
      resolveAnonymous = resolve;
    });
    const userRead = new Promise<MockBootstrap>((resolve) => {
      resolveUser = resolve;
    });

    const { getWorkspaceBootstrap, readWorkspaceBootstrap } = await createBootstrapMock({
      readImpl: (scope) => (scope?.kind === 'user' ? userRead : anonymousRead),
    });

    const anonymousPromise = getWorkspaceBootstrap();
    const userPromise = getWorkspaceBootstrap(userScope);

    expect(anonymousPromise).not.toBe(userPromise);
    expect(readWorkspaceBootstrap).toHaveBeenCalledTimes(2);

    resolveUser({
      globalDraft: { state: { tableName: 'user' }, updatedAt: 2 },
      drafts: [],
      session: null,
      savedTable: null,
    });
    resolveAnonymous({
      globalDraft: { state: { tableName: 'anonymous' }, updatedAt: 1 },
      drafts: [],
      session: null,
      savedTable: null,
    });

    await expect(anonymousPromise).resolves.toMatchObject({
      globalDraft: { state: { tableName: 'anonymous' }, updatedAt: 1 },
    });
    await expect(userPromise).resolves.toMatchObject({
      globalDraft: { state: { tableName: 'user' }, updatedAt: 2 },
    });
  });
});
