import { beforeEach, describe, expect, it, vi } from 'vitest';

type MockBootstrap = {
  globalDraft: unknown | null;
  session: unknown | null;
  savedTable: unknown | null;
};

const createBootstrapMock = async (options?: {
  readImpl?: () => Promise<MockBootstrap>;
  migrateImpl?: () => Promise<void>;
}) => {
  const readWorkspaceBootstrap = vi.fn(
    options?.readImpl ??
      (async () => ({ globalDraft: null, session: null, savedTable: null })),
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
          session: null,
          savedTable: null,
        })
        .mockResolvedValueOnce({
          globalDraft: null,
          session: {
            activeSource: { kind: 'global_draft' },
            activeState: null,
          },
          savedTable: null,
        }),
    });

    const result = await getWorkspaceBootstrap();

    expect(migrateLegacyWorkspaceFromLocalStorage).toHaveBeenCalledTimes(1);
    expect(readWorkspaceBootstrap).toHaveBeenCalledTimes(2);
    expect(result.session).toEqual({
      activeSource: { kind: 'global_draft' },
      activeState: null,
    });
  });

  it('读取或迁移失败时应回退为全 null，不抛错', async () => {
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

    const result = await getWorkspaceBootstrap();

    expect(result).toEqual({
      globalDraft: null,
      session: null,
      savedTable: null,
    });
    expect(readWorkspaceBootstrap).toHaveBeenCalledTimes(2);
    expect(migrateLegacyWorkspaceFromLocalStorage).toHaveBeenCalledTimes(1);
  });

  it('并发调用应复用同一个 Promise', async () => {
    let resolveRead: (value: MockBootstrap) => void = () => undefined;
    const pendingRead = new Promise<MockBootstrap>((resolve) => {
      resolveRead = resolve;
    });

    const { getWorkspaceBootstrap, readWorkspaceBootstrap } =
      await createBootstrapMock({
        readImpl: () => pendingRead,
      });

    const p1 = getWorkspaceBootstrap();
    const p2 = getWorkspaceBootstrap();

    expect(p1).toBe(p2);
    expect(readWorkspaceBootstrap).toHaveBeenCalledTimes(1);

    resolveRead({ globalDraft: null, session: { id: 1 }, savedTable: null });
    await expect(p1).resolves.toEqual({
      globalDraft: null,
      session: { id: 1 },
      savedTable: null,
    });
  });

  it('TTL 内应命中缓存，过期后应重新读取', async () => {
    let now = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);

    const { getWorkspaceBootstrap, readWorkspaceBootstrap } =
      await createBootstrapMock({
        readImpl: vi
          .fn()
          .mockResolvedValueOnce({
            globalDraft: { v: 1 },
            session: null,
            savedTable: null,
          })
          .mockResolvedValueOnce({
            globalDraft: { v: 2 },
            session: null,
            savedTable: null,
          }),
      });

    const first = await getWorkspaceBootstrap();
    const second = await getWorkspaceBootstrap();

    expect(first).toEqual({
      globalDraft: { v: 1 },
      session: null,
      savedTable: null,
    });
    expect(second).toEqual({
      globalDraft: { v: 1 },
      session: null,
      savedTable: null,
    });
    expect(readWorkspaceBootstrap).toHaveBeenCalledTimes(1);

    now += 60;
    const third = await getWorkspaceBootstrap();
    expect(third).toEqual({
      globalDraft: { v: 2 },
      session: null,
      savedTable: null,
    });
    expect(readWorkspaceBootstrap).toHaveBeenCalledTimes(2);
  });
});
