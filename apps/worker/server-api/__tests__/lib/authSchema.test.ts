import type { ApiEnv } from '../../lib/context.js';
import { describe, expect, it, vi } from 'vitest';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { betterAuthSchema } from '@ddlbuilder/user-db';
import { createSqliteD1Database } from '../helpers/sqliteD1.js';

describe('auth schema migration parity', () => {
  it.each(Object.values(betterAuthSchema))('matches the migrated indexes for %#', (table) => {
    const { sqlite } = createSqliteD1Database();
    try {
      const config = getTableConfig(table);
      const expected = sqlite
        .prepare(`PRAGMA index_list("${config.name}")`)
        .all()
        .filter((index) => String(index.name).startsWith('idx_'))
        .map((index) => ({ name: index.name, unique: Boolean(index.unique) }))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
      const actual = config.indexes
        .map((index) => ({ name: index.config.name, unique: index.config.unique }))
        .sort((a, b) => a.name.localeCompare(b.name));
      expect(actual).toEqual(expected);
    } finally {
      sqlite.close();
    }
  });
  it('defaults local account issuers to an empty string', () => {
    expect(betterAuthSchema.account.issuer.default).toBe('');
  });
});

describe('better-auth session revocation integration', () => {
  it('deletes sessions through the adapter and fires socket revocation hooks', async () => {
    const { revokeUserSessions, readSessionAccess } = await import('../../lib/auth.js');
    const { database, sqlite } = createSqliteD1Database({ includeMeta: true });
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const env = {
      USER_DB: database,
      BETTER_AUTH_SECRET: 'a-long-enough-secret-for-auth-tests',
      BETTER_AUTH_URL: 'http://localhost:3000',
      RESEND_API_KEY: 'test',
      RESEND_FROM_EMAIL: 'noreply@example.com',
      TURNSTILE_SECRET_KEY: 'test',
      SIGNUP_BONUS_CREDITS: '1000',
      WORKSPACE_YDOC: { idFromName: (id: string) => id, get: () => ({ fetch }) },
    } as unknown as ApiEnv['Bindings'];
    try {
      sqlite.exec(
        "INSERT INTO user (id,name,email,created_at,updated_at) VALUES ('u','User','u@example.com',1,1); INSERT INTO workspaces (id,user_id,name,created_at,updated_at) VALUES ('w','u','Workspace',1,1)",
      );
      sqlite
        .prepare(
          'INSERT INTO session (id,token,user_id,expires_at,created_at,updated_at) VALUES (?,?,?, ?,1,1)',
        )
        .run('s', 'token', 'u', Date.now() + 60000);
      expect((await readSessionAccess(env, 'u', 'w')).sessionIds.has('s')).toBe(true);
      await revokeUserSessions(env, 'u');
      expect((await readSessionAccess(env, 'u', 'w')).sessionIds.size).toBe(0);
      expect(fetch).toHaveBeenCalledWith(
        'https://workspace-ydoc.internal/kick',
        expect.objectContaining({
          headers: { 'x-ddlbuilder-user-id': 'u', 'x-ddlbuilder-session-id': 's' },
        }),
      );
      expect(fetch).toHaveBeenCalledWith(
        'https://workspace-ydoc.internal/kick',
        expect.objectContaining({ headers: { 'x-ddlbuilder-user-id': 'u' } }),
      );
    } finally {
      sqlite.close();
    }
  });

  it('keeps bulk revocation retryable after session rows have been deleted', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { revokeUserSessions } = await import('../../lib/auth.js');
    const { database, sqlite } = createSqliteD1Database({ includeMeta: true });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValue(new Response(null, { status: 204 }));
    const env = {
      USER_DB: database,
      BETTER_AUTH_SECRET: 'a-long-enough-secret-for-auth-tests',
      BETTER_AUTH_URL: 'http://localhost:3000',
      RESEND_API_KEY: 'test',
      RESEND_FROM_EMAIL: 'noreply@example.com',
      TURNSTILE_SECRET_KEY: 'test',
      SIGNUP_BONUS_CREDITS: '1000',
      WORKSPACE_YDOC: { idFromName: (id: string) => id, get: () => ({ fetch }) },
    } as unknown as ApiEnv['Bindings'];
    try {
      sqlite.exec(
        "INSERT INTO user (id,name,email,created_at,updated_at) VALUES ('u-retry','User','retry@example.com',1,1); INSERT INTO workspaces (id,user_id,name,created_at,updated_at) VALUES ('w-retry','u-retry','Workspace',1,1); INSERT INTO session (id,token,user_id,expires_at,created_at,updated_at) VALUES ('s-retry','token-retry','u-retry',9999999999999,1,1)",
      );

      const firstAttempt = revokeUserSessions(env, 'u-retry').then(
        () => null,
        (error: unknown) => error,
      );
      await vi.runAllTimersAsync();
      await expect(firstAttempt).resolves.toMatchObject({
        message: expect.stringContaining('Workspace socket revocation failed'),
      });

      expect(
        sqlite.prepare("SELECT COUNT(*) AS count FROM session WHERE user_id = 'u-retry'").get(),
      ).toMatchObject({ count: 0 });
      await expect(revokeUserSessions(env, 'u-retry')).resolves.toBeUndefined();
      expect(fetch).toHaveBeenCalledTimes(5);
    } finally {
      vi.useRealTimers();
      vi.restoreAllMocks();
      sqlite.close();
    }
  });
});
