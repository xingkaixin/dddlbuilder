import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCurrentUser } from '@/services/authService';
import { fetchCreditBalance, fetchCreditLedger } from '@/services/creditService';
import {
  adminLogout,
  checkAdminSession,
  getUserUsageEvents,
  grantUserCredits,
  listUsers,
} from '@/admin/lib/adminApi';

afterEach(() => vi.restoreAllMocks());
const reply = (data: unknown, status = 200) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(data, { status }));

describe('account response boundaries', () => {
  it.each([
    { signedIn: true, user: null },
    { signedIn: false, user: { userId: 'u1' } },
    { signedIn: true, user: { userId: 'u1', email: 'a@b.com', name: 'A', emailVerified: 'true' } },
  ])('rejects inconsistent identity: %j', async (data) => {
    reply(data);
    await expect(fetchCurrentUser()).rejects.toThrow('Invalid user response');
  });
  it.each([null, {}, { balance: 0 }, { balance: -1, version: 0, userId: 'u1' }])(
    'does not interpret malformed balance as zero: %j',
    async (data) => {
      reply(data);
      await expect(fetchCreditBalance()).rejects.toThrow('Invalid credit balance response');
    },
  );
  it('rejects a malformed ledger item instead of showing an empty ledger', async () => {
    reply({ items: [null], total: 1, limit: 20, offset: 0 });
    await expect(fetchCreditLedger({ limit: 20, offset: 0 })).rejects.toThrow(
      'Invalid credit ledger response',
    );
  });
  it('preserves error status and code even if the message is invalid', async () => {
    reply({ error: 123, code: 'SERVICE_UNAVAILABLE' }, 503);
    await expect(fetchCreditBalance()).rejects.toMatchObject({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'Failed to load credit balance',
    });
  });
});

describe('admin response boundaries', () => {
  it('does not authenticate on a non-success response', async () => {
    reply({ authenticated: true }, 503);
    await expect(checkAdminSession()).resolves.toBe(false);
  });
  it('does not report a failed logout as success', async () => {
    reply(null, 503);
    await expect(adminLogout()).rejects.toMatchObject({ status: 503 });
  });
  it('requires an explicit success result when granting credits', async () => {
    reply({ ok: false, newBalance: 100 });
    await expect(grantUserCredits('u1', 100)).rejects.toThrow('Invalid admin response');
  });
  it('rejects incomplete user records', async () => {
    reply({ users: [{ id: 'u1' }] });
    await expect(listUsers()).rejects.toThrow('Invalid admin response');
  });
  it('rejects corrupt usage accounting facts', async () => {
    reply({
      items: [
        {
          id: 'e1',
          routeKey: 'explain',
          requestId: 'r1',
          estimatedTokens: 0,
          actualTotalTokens: -1,
          chargedTokens: null,
          providerBudgetTokens: null,
          attemptCount: null,
          usageEstimated: null,
          status: 'failed',
          errorCode: null,
          createdAt: '2026-09-08T00:00:00Z',
        },
      ],
      total: 1,
    });
    await expect(getUserUsageEvents('u1')).rejects.toThrow('Invalid admin response');
  });
});
