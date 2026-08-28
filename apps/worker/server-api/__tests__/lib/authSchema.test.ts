import { describe, expect, it, vi } from 'vitest';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { betterAuthSchema } from '@ddlbuilder/db';
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
    } as unknown as import('../../lib/context.js').ApiEnv['Bindings'];
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
    } finally {
      sqlite.close();
    }
  });
});
