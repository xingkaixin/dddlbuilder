import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@/__tests__/utils/test-utils';
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

vi.mock('@/i18n/LocaleContext', () => ({ useLocale: () => ({ resolvedLocale: 'zh-CN' }) }));

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

  it('displays credit consumption as a debit', async () => {
    mocks.getUserCreditLedger.mockResolvedValue([
      {
        id: 'consume-1',
        kind: 'consume',
        source: 'ai_request',
        amount: 50,
        balanceAfter: 50,
        createdAt: '2026-08-28T00:00:00.000Z',
      },
    ]);
    render(<AdminUserDetailView userId="user-1" onBack={vi.fn()} />);
    await screen.findByRole('table');
    expect(screen.getByText('-50')).toBeInTheDocument();
  });

  it('localizes failed password reset notifications', async () => {
    mocks.resetUserPassword.mockRejectedValue(new Error('upstream failed'));
    render(<AdminUserDetailView userId="user-1" onBack={vi.fn()} />);
    await screen.findByText('user@example.com');
    fireEvent.click(screen.getByRole('button', { name: '发送重置邮件' }));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(mocks.toastError).toHaveBeenCalledWith('发送重置邮件失败');
  });

  it('输入额度后点击确认会提交增加额度请求', async () => {
    render(<AdminUserDetailView userId="user-1" onBack={vi.fn()} />);

    await screen.findByText('user@example.com');
    fireEvent.click(screen.getByRole('button', { name: '增加额度' }));
    fireEvent.change(screen.getByPlaceholderText('100'), {
      target: { value: '500' },
    });
    fireEvent.change(screen.getByPlaceholderText('可选备注'), {
      target: { value: 'manual bonus' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确认' }));

    await waitFor(() => {
      expect(mocks.grantUserCredits).toHaveBeenCalledWith('user-1', 500, 'manual bonus');
    });
    expect(mocks.getUserDetail).toHaveBeenCalledTimes(2);
    expect(mocks.getUserCreditLedger).toHaveBeenCalledTimes(2);
    expect(mocks.toastSuccess).toHaveBeenCalledWith('已成功增加 500 额度');
  });

  it('小数额度不能提交', async () => {
    render(<AdminUserDetailView userId="user-1" onBack={vi.fn()} />);

    await screen.findByText('user@example.com');
    fireEvent.click(screen.getByRole('button', { name: '增加额度' }));
    fireEvent.change(screen.getByPlaceholderText('100'), {
      target: { value: '1.5' },
    });

    expect(screen.getByRole('button', { name: '确认' })).toBeDisabled();
    expect(mocks.grantUserCredits).not.toHaveBeenCalled();
  });
});
