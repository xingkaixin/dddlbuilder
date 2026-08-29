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
    status: 'signed_in' as 'loading' | 'signed_in' | 'signed_out',
    userId: 'user-1' as string | null,
    workspaceId: 'ws-1' as string | null,
    refreshSession: null as unknown as () => Promise<void>,
  },
}));

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

// whenSynced 的 resolve 由用例掌控，用来复现"本地 update log 还没加载完"的窗口期。
const localLoad = vi.hoisted(() => ({
  resolve: null as (() => void) | null,
}));

vi.mock('y-indexeddb', () => ({
  IndexeddbPersistence: class {
    get = async () => true;
    whenSynced = new Promise<void>((resolve) => {
      localLoad.resolve = () => resolve();
    });
    destroy() {
      return Promise.resolve();
    }
  },
}));

vi.mock('@/services/workspaceAccountService', () => ({
  clearLegacyWorkspaceData: vi.fn().mockResolvedValue(undefined),
  retryPendingWorkspaceCleanup: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/workspaceMigrationService', () => ({
  prepareLegacyWorkspaceSnapshot: vi.fn(() => Promise.resolve(null)),
}));

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
      tabs={[] as never[]}
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
    localLoad.resolve = null;
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

  it('本地 Y.Doc 加载完成后正常渲染 children', async () => {
    renderGate();
    await waitFor(() => expect(localLoad.resolve).toBeTypeOf('function'));
    act(() => localLoad.resolve?.());

    await waitFor(() => expect(createDraftEntry()).toBeInTheDocument());
    expect(screen.queryByTestId('workspace-bootstrap-loading')).toBeNull();
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

  it('身份未知时等待解析，避免闪出匿名空工作区', () => {
    authSession.current = {
      status: 'loading',
      userId: null,
      workspaceId: null,
      refreshSession: authSession.refreshSession,
    };
    renderGate();

    expect(createDraftEntry()).toBeNull();
    expect(screen.getByTestId('workspace-bootstrap-loading')).toBeInTheDocument();
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

  it('workspaceId 永远拿不到时不会永久卡在加载态，重试会重新解析会话', async () => {
    vi.useFakeTimers();
    authSession.current = {
      status: 'signed_in',
      userId: 'user-1',
      workspaceId: null,
      refreshSession: authSession.refreshSession,
    };
    renderGate();

    await act(async () => vi.advanceTimersByTime(WORKSPACE_BOOTSTRAP_TIMEOUT_MS));

    expect(screen.getByTestId('workspace-bootstrap-error')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重试加载' }));

    expect(authSession.refreshSession).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('workspace-bootstrap-loading')).toBeInTheDocument();

    await act(async () => vi.advanceTimersByTime(WORKSPACE_BOOTSTRAP_TIMEOUT_MS));
    expect(screen.getByTestId('workspace-bootstrap-error')).toBeInTheDocument();
  });

  // authSession.current 是普通对象，改它不会触发重渲染；必须显式 rerender，
  // 否则断言的是"什么都没发生"而不是 refreshSession 的效果。
  const enterRefreshSession = (rerender: ReturnType<typeof renderGate>['rerender']) => {
    authSession.current = {
      status: 'loading',
      userId: 'user-1',
      workspaceId: 'ws-1',
      refreshSession: authSession.refreshSession,
    };
    act(() => rerender(gateTree()));
  };

  it('本地尚未加载完时遇上 refreshSession，仍然不放行', () => {
    const { rerender } = renderGate();
    expect(createDraftEntry()).toBeNull();

    enterRefreshSession(rerender);

    expect(createDraftEntry()).toBeNull();
    expect(screen.getByTestId('workspace-bootstrap-loading')).toBeInTheDocument();
  });

  // 这一条守的是反向：refreshSession 只是刷新会话，身份没变，不该把一个已经加载好的
  // Y.Doc 拆掉——那会让用户在改个用户名的工夫里看着整个界面退回启动态。
  it('已加载完成后遇上 refreshSession，不应退回门禁', async () => {
    const { rerender } = renderGate();
    await waitFor(() => expect(localLoad.resolve).toBeTypeOf('function'));
    act(() => localLoad.resolve?.());
    await waitFor(() => expect(createDraftEntry()).toBeInTheDocument());

    enterRefreshSession(rerender);

    expect(createDraftEntry()).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-bootstrap-loading')).toBeNull();
  });

  it('分享页不被门禁挡住', () => {
    window.history.pushState({}, '', SHARE_PATH);
    renderGate();

    expect(createDraftEntry()).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-bootstrap-loading')).toBeNull();
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

describe('WorkspaceYDocProvider 门禁不改变已就绪时的行为', () => {
  beforeEach(() => {
    localLoad.resolve = null;
    authSession.current = {
      status: 'signed_in',
      userId: 'user-1',
      workspaceId: 'ws-1',
      refreshSession: authSession.refreshSession,
    };
    window.history.pushState({}, '', '/');
    setupMemoryLocalStorage();
  });

  it('迟到的本地加载会把超时留下的错误态复位', async () => {
    vi.useFakeTimers();
    renderGate();
    await act(async () => vi.advanceTimersByTime(WORKSPACE_BOOTSTRAP_TIMEOUT_MS));
    expect(screen.getByTestId('workspace-bootstrap-error')).toBeInTheDocument();

    await act(async () => {});
    const lateResolve = localLoad.resolve;
    vi.useRealTimers();
    act(() => lateResolve?.());

    await waitFor(() => expect(createDraftEntry()).toBeInTheDocument());
  });
});
