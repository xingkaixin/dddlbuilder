import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAIRequestAccess } from '@/hooks/useAIRequestAccess';
import i18n from '@/i18n';

const mocks = vi.hoisted(() => ({
  useAuthIdentity: vi.fn(),
  useAuthCredits: vi.fn(),
  useAuthDialog: vi.fn(),
  openAuthDialog: vi.fn(),
  refreshCredits: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/auth/AuthSessionProvider', () => ({
  useAuthIdentity: mocks.useAuthIdentity,
  useAuthCredits: mocks.useAuthCredits,
  useAuthDialog: mocks.useAuthDialog,
}));

describe('useAIRequestAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAuthIdentity.mockReturnValue({ status: 'signed_in', userId: 'user-1' });
    mocks.useAuthCredits.mockReturnValue({
      creditsStatus: 'ready',
      creditBalance: 10,
      refreshCredits: mocks.refreshCredits,
    });
    mocks.useAuthDialog.mockReturnValue({ openAuthDialog: mocks.openAuthDialog });
  });

  it('未登录时阻止请求并打开登录框', () => {
    mocks.useAuthIdentity.mockReturnValue({ status: 'signed_out', userId: null });
    mocks.useAuthCredits.mockReturnValue({
      creditsStatus: 'idle',
      creditBalance: null,
      refreshCredits: mocks.refreshCredits,
    });
    const { result } = renderHook(() => useAIRequestAccess());

    expect(result.current.accessError).toBe(i18n.t('services.authRequired'));
    expect(mocks.openAuthDialog).not.toHaveBeenCalled();
    expect(result.current.getAccessError()).toBe(i18n.t('services.authRequired'));
    expect(mocks.openAuthDialog).toHaveBeenCalledTimes(1);
  });

  it('额度耗尽时阻止请求但不改变登录状态', () => {
    mocks.useAuthCredits.mockReturnValue({
      creditsStatus: 'ready',
      creditBalance: 0,
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
