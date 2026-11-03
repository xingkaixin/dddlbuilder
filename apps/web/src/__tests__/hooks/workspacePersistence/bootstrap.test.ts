import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';

type MockBootstrap = {
  globalDraft: unknown | null;
  drafts: Array<{ draftId: string; record: unknown }>;
  session: unknown | null;
  savedTable: unknown | null;
};

const createBootstrapMock = async (options?: {
  readImpl?: (scope?: WorkspaceScope) => Promise<MockBootstrap>;
}) => {
  const readWorkspaceBootstrap = vi.fn(
    options?.readImpl ??
      (async () => ({ globalDraft: null, drafts: [], session: null, savedTable: null })),
  );
  const migrateLegacyWorkspaceFromLocalStorage = vi.fn(async () => undefined);

  // oxlint-disable-next-line anti-slop/no-module-mocking -- replace bootstrap storage reads to control legacy migration side effects.
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
});
