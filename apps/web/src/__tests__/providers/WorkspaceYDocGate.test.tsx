import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { setupMemoryLocalStorage } from '@/__tests__/utils/memoryLocalStorage';
import { TabBar } from '@/components/App/TabBar';
import { leaveShareRoute } from '@/hooks/workspacePersistence/shareRoute';
import { WorkspaceYDocProvider } from '@/providers/WorkspaceYDocProvider';

const SHARE_PATH = '/share/2f9c9a3e-1f2a-4c6d-8b7e-9a1c2d3e4f50';
const WORKSPACE_BOOTSTRAP_TIMEOUT_MS = 10_000;

const authSession = vi.hoisted(() => ({
  refreshSession: vi.fn(() => Promise.resolve()),
  current: {
    // SAFETY: these values model the provider's signed-in state before each test mutates it.
    status: 'signed_in' as 'loading' | 'signed_in' | 'signed_out',
    // SAFETY: the mocked provider uses a nullable user identity during signed-out transitions.
    userId: 'user-1' as string | null,
    // SAFETY: the mocked provider uses a nullable workspace identity during signed-out transitions.
    workspaceId: 'ws-1' as string | null,
    // SAFETY: the mocked action is intentionally absent until a test installs a refresh handler.
    refreshSession: null as (() => Promise<void>) | null,
  },
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- control auth transitions while testing the Y.Doc gate lifecycle.
vi.mock('@/auth/AuthSessionProvider', () => {
  const useAuthIdentity = () => ({
    ...authSession.current,
    workspaceScope:
      authSession.current.userId && authSession.current.workspaceId
        ? {
            kind: 'user',
            userId: authSession.current.userId,
            workspaceId: authSession.current.workspaceId,
          }
        : null,
  });

  return {
    useAuthIdentity,
    useAuthActions: () => ({ refreshSession: authSession.current.refreshSession }),
  };
});

// oxlint-disable-next-line anti-slop/no-module-mocking -- replace browser IndexedDB synchronization with a deterministic gate fixture.
vi.mock('y-indexeddb', () => ({
  IndexeddbPersistence: class {
    get = async () => true;
    // Never resolves, holding the gate in the window before the local update log loads.
    whenSynced = new Promise<void>(() => {});
    destroy() {
      return Promise.resolve();
    }
  },
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- suppress account cleanup side effects to isolate gate startup behavior.
vi.mock('@/services/workspaceAccountService', () => ({
  clearLegacyWorkspaceData: vi.fn().mockResolvedValue(undefined),
  retryPendingWorkspaceCleanup: vi.fn().mockResolvedValue(undefined),
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- control migration discovery while exercising the gate's legacy-data branch.
vi.mock('@/services/workspaceMigrationService', () => ({
  prepareLegacyWorkspaceSnapshot: vi.fn(() => Promise.resolve(null)),
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- provide a controllable sync client so gate readiness is tested without a network.
vi.mock('@/services/workspaceYDocSyncClient', () => ({
  WorkspaceYDocSyncClient: class {
    connect = () => Promise.resolve();
    destroy = () => {};
    retry = () => {};
  },
}));

const gateTree = () => (
  <WorkspaceYDocProvider>
    <TabBar
      // SAFETY: TabBar receives no tabs in this gate-only fixture; no tab value is consumed.
      tabs={[] as never[]}
      tabTitles={new Map()}
      dirtyTabIds={new Set()}
      activeTabId={null}
      onActivateTab={() => {}}
      onCloseTab={() => {}}
      onCreateTab={() => {}}
    />
  </WorkspaceYDocProvider>
);

const renderGate = () => render(gateTree());

const createDraftEntry = () => screen.queryByRole('button', { name: '新建草稿' });

describe('WorkspaceYDocProvider 加载门禁', () => {
  beforeEach(() => {
    authSession.refreshSession.mockClear();
    authSession.current = {
      status: 'signed_in',
      userId: 'user-1',
      workspaceId: 'ws-1',
      refreshSession: authSession.refreshSession,
    };
    window.history.pushState({}, '', '/');
    setupMemoryLocalStorage();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('本地 Y.Doc 未加载完时不渲染 children，写入入口不在 DOM 里', () => {
    renderGate();

    expect(screen.getByTestId('workspace-bootstrap-loading')).toBeInTheDocument();
    expect(createDraftEntry()).toBeNull();
  });

  it('whenSynced 永不 resolve 时超时进入错误态，重试后回到加载态而非永久卡住', async () => {
    vi.useFakeTimers();
    renderGate();
    expect(screen.getByTestId('workspace-bootstrap-loading')).toBeInTheDocument();

    await act(async () => vi.advanceTimersByTime(WORKSPACE_BOOTSTRAP_TIMEOUT_MS));

    expect(screen.getByTestId('workspace-bootstrap-error')).toBeInTheDocument();
    expect(createDraftEntry()).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '重试加载' }));

    expect(screen.getByTestId('workspace-bootstrap-loading')).toBeInTheDocument();
  });

  it('未登录时清理检查完成后不被门禁挡住', async () => {
    authSession.current = {
      status: 'signed_out',
      userId: null,
      workspaceId: null,
      refreshSession: authSession.refreshSession,
    };
    renderGate();

    await waitFor(() => expect(createDraftEntry()).toBeInTheDocument());
    expect(screen.queryByTestId('workspace-bootstrap-loading')).toBeNull();
  });

  it('已登录但 workspaceId 还没落地时必须挡住，避免写入匿名分区', () => {
    authSession.current = {
      status: 'signed_in',
      userId: 'user-1',
      workspaceId: null,
      refreshSession: authSession.refreshSession,
    };
    renderGate();

    expect(screen.getByTestId('workspace-bootstrap-loading')).toBeInTheDocument();
    expect(createDraftEntry()).toBeNull();
  });

  it('分享失效离开分享路径后，门禁立即生效而不是等到下一次重渲染', async () => {
    window.history.pushState({}, '', SHARE_PATH);
    renderGate();
    expect(createDraftEntry()).toBeInTheDocument();

    act(() => leaveShareRoute());

    await waitFor(() => expect(createDraftEntry()).toBeNull());
    expect(screen.getByTestId('workspace-bootstrap-loading')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
  });
});
