import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, act } from '@/__tests__/utils/test-utils';
import { UserSettingsDialog } from '@/components/App/UserSettingsDialog';
import { fetchCreditLedger } from '@/services/creditService';
const auth = vi.hoisted(() => ({ userId: 'ledger-user', name: 'Tester' }));

vi.mock('@/i18n/LocaleContext', () => ({ useLocale: () => ({ locale: 'zh-CN' }) }));
vi.mock('@/auth/AuthSessionProvider', () => {
  const useAuthIdentity = () => ({
    status: 'signed_in',
    userId: auth.userId,
    name: auth.name,
    email: 'user@example.com',
  });
  const useAuthActions = () => ({ updateUserName: vi.fn(), changePassword: vi.fn() });
  const useAuthCredits = () => ({ creditBalance: 100 });
  return {
    useAuthIdentity,
    useAuthActions,
    useAuthCredits,
  };
});
vi.mock('@/providers/WorkspaceYDocProvider', () => ({
  useWorkspaceYDoc: () => ({
    connectionState: 'synced',
    synced: true,
  }),
}));

const item = {
  id: 'first',
  kind: 'grant',
  source: 'signup_bonus',
  amount: 12345,
  balanceAfter: 12345,
  createdAt: '2026-08-28T00:00:00.000Z',
};

describe('credit ledger rendering', () => {
  beforeEach(() => {
    auth.userId = 'ledger-user';
    auth.name = 'Tester';
  });
  afterEach(() => vi.unstubAllGlobals());
  it('shows the latest account name and resets unsaved edits on reopening', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ items: [], total: 0 })));
    const onOpenChange = vi.fn();
    const { rerender } = render(<UserSettingsDialog open onOpenChange={onOpenChange} />);
    auth.name = 'Updated';
    rerender(<UserSettingsDialog open onOpenChange={onOpenChange} />);
    const input = screen.getByDisplayValue('Updated');
    fireEvent.change(input, { target: { value: 'Unsaved' } });
    rerender(<UserSettingsDialog open onOpenChange={onOpenChange} />);
    expect(screen.getByDisplayValue('Unsaved')).toBeInTheDocument();
    rerender(<UserSettingsDialog open={false} onOpenChange={onOpenChange} />);
    rerender(<UserSettingsDialog open onOpenChange={onOpenChange} />);
    expect(screen.getByDisplayValue('Updated')).toBeInTheDocument();
  });

  it('keeps the current page visible while fetching the next page', async () => {
    let resolvePage: (response: Response) => void = () => {};
    const pendingPage = new Promise<Response>((resolve) => {
      resolvePage = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ items: [item], total: 21 }))
      .mockReturnValueOnce(pendingPage);
    vi.stubGlobal('fetch', fetchMock);
    render(<UserSettingsDialog open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: /点数中心/ }));
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled();
    await act(async () =>
      resolvePage(Response.json({ items: [{ ...item, id: 'second', amount: 9876 }], total: 21 })),
    );
    await screen.findByText('+9876');
  });

  it('normalizes wire timestamps to epoch milliseconds at the service boundary', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ items: [item], total: 1 })));
    const result = await fetchCreditLedger({ limit: 20, offset: 0 });
    expect(result.items[0].createdAt).toBe(Date.parse(item.createdAt));
  });

  it('does not retain another account ledger while the account changes', async () => {
    let resolvePage: (response: Response) => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ items: [item], total: 1 }))
        .mockReturnValueOnce(
          new Promise<Response>((resolve) => {
            resolvePage = resolve;
          }),
        ),
    );
    const onOpenChange = vi.fn();
    const { rerender } = render(<UserSettingsDialog open onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole('tab', { name: /点数中心/ }));
    await screen.findByRole('table');
    auth.userId = 'another-user';
    rerender(<UserSettingsDialog open onOpenChange={onOpenChange} />);
    expect(screen.queryByRole('table')).toBeNull();
    await act(async () => resolvePage(Response.json({ items: [], total: 0 })));
  });
});
