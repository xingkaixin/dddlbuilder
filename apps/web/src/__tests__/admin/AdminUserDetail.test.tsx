import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/__tests__/utils/test-utils';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { AdminUserDetailView } from '@/admin/AdminUserDetail';

const mocks = vi.hoisted(() => ({
  getUserDetail: vi.fn(),
  getUserCreditLedger: vi.fn(),
  getUserUsageEvents: vi.fn(),
  resetUserPassword: vi.fn(),
  disableUser: vi.fn(),
  enableUser: vi.fn(),
  updateUserEmailVerification: vi.fn(),
  grantUserCredits: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- isolate the admin API network boundary while testing detail and ledger rendering.
vi.mock('@/admin/lib/adminApi', () => ({
  getUserDetail: mocks.getUserDetail,
  getUserCreditLedger: mocks.getUserCreditLedger,
  getUserUsageEvents: mocks.getUserUsageEvents,
  resetUserPassword: mocks.resetUserPassword,
  disableUser: mocks.disableUser,
  enableUser: mocks.enableUser,
  updateUserEmailVerification: mocks.updateUserEmailVerification,
  grantUserCredits: mocks.grantUserCredits,
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- fix the locale so this admin rendering test is deterministic.
vi.mock('@/i18n/LocaleContext', () => ({ useLocale: () => ({ resolvedLocale: 'zh-CN' }) }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- capture toast side effects without invoking the UI notification runtime.
vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

const userDetail = {
  id: 'user-1',
  name: 'User One',
  email: 'user@example.com',
  emailVerified: true,
  balance: 100,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  lastActiveAt: null,
  disabled: false,
};

describe('AdminUserDetailView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserDetail.mockResolvedValue(userDetail);
    mocks.getUserCreditLedger.mockResolvedValue([]);
    mocks.getUserUsageEvents.mockResolvedValue({ items: [], total: 0 });
    mocks.grantUserCredits.mockResolvedValue(600);
  });

  it('同一笔赠额重试沿用幂等键，修改金额后换新键', async () => {
    mocks.grantUserCredits
      .mockRejectedValueOnce(new Error('network'))
      .mockRejectedValueOnce(new Error('network'));
    render(<AdminUserDetailView userId="user-1" onBack={vi.fn()} />);

    await screen.findByText('user@example.com');
    fireEvent.click(screen.getByRole('button', { name: '增加额度' }));
    fireEvent.change(screen.getByPlaceholderText('100'), { target: { value: '500' } });
    const submit = screen.getByRole('button', { name: '确认' });
    fireEvent.click(submit);
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.change(screen.getByPlaceholderText('100'), { target: { value: '600' } });
    fireEvent.click(submit);
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());

    const keys = mocks.grantUserCredits.mock.calls.map((call) => call[2]);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
  });
});
