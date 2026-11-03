import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCurrentUser } from '@/services/authService';
import { fetchCreditBalance } from '@/services/creditService';
import { checkAdminSession, grantUserCredits } from '@/admin/lib/adminApi';

afterEach(() => vi.restoreAllMocks());

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Response fixtures intentionally pass malformed external payloads.
const reply = (data: unknown, status = 200) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(data, { status }));

describe('account response boundaries', () => {
  it.each([
    { signedIn: true, user: null },
    { signedIn: false, user: { userId: 'u1' } },
  ])('rejects inconsistent identity: %j', async (data) => {
    reply(data);
    await expect(fetchCurrentUser()).rejects.toThrow('Invalid user response');
  });
  it.each([{}, { balance: -1, version: 0, userId: 'u1' }])(
    'does not interpret malformed balance as zero: %j',
    async (data) => {
      reply(data);
      await expect(fetchCreditBalance()).rejects.toThrow('Invalid credit balance response');
    },
  );
});

describe('admin response boundaries', () => {
  it('does not authenticate on a non-success response', async () => {
    reply({ authenticated: true }, 503);
    await expect(checkAdminSession()).resolves.toBe(false);
  });
  it('requires an explicit success result when granting credits', async () => {
    reply({ ok: false, newBalance: 100 });
    await expect(grantUserCredits('u1', 100, 'grant-1')).rejects.toThrow('Invalid admin response');
  });
});
