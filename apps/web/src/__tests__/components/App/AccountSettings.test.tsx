import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/__tests__/utils/test-utils';
import { screen, act } from '@testing-library/react';
import { CreditSettings } from '@/components/App/settings/CreditSettings';
import { fetchCreditLedger } from '@/services/creditService';

const auth = vi.hoisted(() => ({ userId: 'ledger-user', name: 'Tester' }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- Fix the locale so this account-focused test is independent of global i18n setup.
vi.mock('@/i18n/LocaleContext', () => ({ useLocale: () => ({ locale: 'zh-CN' }) }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- Supply a signed-in identity and isolated action spies for the dialog boundary.
vi.mock('@/auth/AuthSessionProvider', () => {
  const useAuthIdentity = () => ({
    status: 'signed_in',
    userId: auth.userId,
    name: auth.name,
    email: 'user@example.com',
  });
  const useAuthActions = () => ({
    updateUserName: vi.fn(),
    changePassword: vi.fn(),
    signOut: vi.fn(),
  });
  const useAuthCredits = () => ({ creditBalance: 100 });

  return {
    useAuthIdentity,
    useAuthActions,
    useAuthCredits,
  };
});

// oxlint-disable-next-line anti-slop/no-module-mocking -- Keep workspace synchronization out of the credit ledger rendering test.
vi.mock('@/providers/WorkspaceYDocProvider', () => ({
  useWorkspaceYDoc: () => ({
    connectionState: 'synced',
    synced: true,
  }),
}));

const item = {
  id: 'first',
  userId: 'ledger-user',
  idempotencyKey: 'signup:ledger-user',
  relatedUsageId: null,
  metadataJson: null,
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

  it('normalizes wire timestamps to epoch milliseconds at the service boundary', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ limit: 20, offset: 0, items: [item], total: 1 })),
    );
    const result = await fetchCreditLedger({ limit: 20, offset: 0 });
    expect(result.items[0].createdAt).toBe(Date.parse(item.createdAt));
  });

  it('does not retain another account ledger while the account changes', async () => {
    let resolvePage: (response: Response) => void = () => {};

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ limit: 20, offset: 0, items: [item], total: 1 }))
        .mockReturnValueOnce(
          new Promise<Response>((resolve) => {
            resolvePage = resolve;
          }),
        ),
    );
    const { rerender } = render(<CreditSettings />);
    await screen.findByRole('table');
    auth.userId = 'another-user';
    rerender(<CreditSettings />);
    expect(screen.queryByRole('table')).toBeNull();
    await act(async () =>
      resolvePage(Response.json({ limit: 20, offset: 0, items: [], total: 0 })),
    );
  });
});
