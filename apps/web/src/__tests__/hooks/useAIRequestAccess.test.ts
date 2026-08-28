import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAIRequestAccess } from '@/hooks/useAIRequestAccess';
import i18n from '@/i18n';

const mocks = vi.hoisted(() => ({
  useAuthSession: vi.fn(),
  openAuthDialog: vi.fn(),
  refreshCredits: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/auth/AuthSessionProvider', () => ({
  useAuthSession: mocks.useAuthSession,
}));

describe('useAIRequestAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAuthSession.mockReturnValue({
      status: 'signed_in',
      userId: 'user-1',
      creditsStatus: 'ready',
      creditBalance: 10,
      openAuthDialog: mocks.openAuthDialog,
      refreshCredits: mocks.refreshCredits,
    });
  });

  it('未登录时阻止请求并打开登录框', () => {
    mocks.useAuthSession.mockReturnValue({
      status: 'signed_out',
      userId: null,
      creditsStatus: 'idle',
      creditBalance: null,
      openAuthDialog: mocks.openAuthDialog,
      refreshCredits: mocks.refreshCredits,
    });
    const { result } = renderHook(() => useAIRequestAccess());

    expect(result.current.accessError).toBe(i18n.t('services.authRequired'));
    expect(mocks.openAuthDialog).not.toHaveBeenCalled();
    expect(result.current.getAccessError()).toBe(i18n.t('services.authRequired'));
    expect(mocks.openAuthDialog).toHaveBeenCalledTimes(1);
  });

  it('额度耗尽时阻止请求但不改变登录状态', () => {
    mocks.useAuthSession.mockReturnValue({
      status: 'signed_in',
      userId: 'user-1',
      creditsStatus: 'ready',
      creditBalance: 0,
      openAuthDialog: mocks.openAuthDialog,
      refreshCredits: mocks.refreshCredits,
    });
    const { result } = renderHook(() => useAIRequestAccess());

    expect(result.current.getAccessError()).toBe(i18n.t('services.creditExhausted'));
    expect(mocks.openAuthDialog).not.toHaveBeenCalled();
  });

  it('统一处理服务端鉴权失败和成功后的额度刷新', () => {
    const { result } = renderHook(() => useAIRequestAccess());

    expect(
      result.current.resolveRequestError(new Error(i18n.t('services.authRequired')), 'fallback'),
    ).toBe(i18n.t('services.authRequired'));
    act(() => result.current.refreshCreditsAfterSuccess());

    expect(mocks.openAuthDialog).toHaveBeenCalledTimes(1);
    expect(mocks.refreshCredits).toHaveBeenCalledTimes(1);
  });
});
