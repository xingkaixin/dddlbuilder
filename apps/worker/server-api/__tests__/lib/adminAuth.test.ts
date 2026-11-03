import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../../lib/context.js';

const TEST_ADMIN_SESSION_SECRET = '0123456789abcdef0123456789abcdef';

const createAdminSessionDb = () => {
  const sessions = new Map<
    string,
    { expiresAt: number; createdAt: number; revokedAt: number | null }
  >();

  // SAFETY: this in-memory double implements every D1 method used by adminAuth tests.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- a platform test double cannot implement the full D1 surface.
  return {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async run() {
              if (sql.startsWith('DELETE FROM admin_sessions')) {
                const [now] = args;

                for (const [id, session] of sessions) {
                  if (session.expiresAt <= Number(now)) sessions.delete(id);
                }
              } else if (sql.startsWith('INSERT INTO admin_sessions')) {
                const [id, expiresAt, createdAt] = args;
                sessions.set(String(id), {
                  expiresAt: Number(expiresAt),
                  createdAt: Number(createdAt),
                  revokedAt: null,
                });
              } else if (sql.startsWith('UPDATE admin_sessions')) {
                const [revokedAt, id] = args;
                const session = sessions.get(String(id));

                if (session && session.revokedAt === null) {
                  session.revokedAt = Number(revokedAt);
                }
              }

              return { success: true };
            },
            async first() {
              const [id, expiresAt, now] = args;
              const session = sessions.get(String(id));

              return session &&
                session.expiresAt === Number(expiresAt) &&
                session.expiresAt > Number(now) &&
                session.revokedAt === null
                ? { id }
                : null;
            },
          };
        },
      };
    },
    async batch(statements: D1PreparedStatement[]) {
      return Promise.all(statements.map((statement) => statement.run()));
    },
  } as unknown as D1Database;
};

const createEnv = (overrides: Partial<ApiEnv['Bindings']> = {}): ApiEnv['Bindings'] => ({
  ASSETS: { fetch: globalThis.fetch },
  // SAFETY: admin auth does not use the KV binding in these tests.
  SHARE_KV: {} as KVNamespace,
  USER_DB: createAdminSessionDb(),
  BETTER_AUTH_SECRET: 'better-auth-secret',
  BETTER_AUTH_URL: 'http://localhost:3000',
  RESEND_API_KEY: 're_test_key',
  RESEND_FROM_EMAIL: 'noreply@example.com',
  RESEND_FROM_NAME: 'DDLBuilder',
  SIGNUP_BONUS_CREDITS: '100000',
  ADMIN_SESSION_SECRET: TEST_ADMIN_SESSION_SECRET,
  ...overrides,
});

type AdminSessionResult = { success: true; setCookie: string } | { success: false };

const requireSetCookie = (result: AdminSessionResult): string => {
  expect(result).toMatchObject({ success: true });

  if (!result.success) throw new Error('Expected admin session creation to succeed');

  return result.setCookie;
};

const readToken = (setCookie: string): [payload: string, mac: string] => {
  const token = setCookie.match(/ddlbuilder_admin_session=([^;]+)/)?.[1] ?? '';
  const [uuid, expiresAt, mac] = token.split('.');

  return [`${uuid}.${expiresAt}`, mac ?? ''];
};

describe('adminAuth', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createAdminSession', () => {
    it('returns success with set-cookie when password matches', async () => {
      const { createAdminSession } = await import('../../lib/adminAuth.js');

      const result = await createAdminSession(
        createEnv({ ADMIN_CONSOLE_PASSWORD: 'correct-password' }),
        'correct-password',
      );

      const setCookie = requireSetCookie(result);
      expect(setCookie).toContain('ddlbuilder_admin_session=');
      expect(setCookie).toContain('Path=/api/admin');
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=Lax');
      expect(setCookie).toContain('Max-Age=14400');
      expect(setCookie).toContain('Secure');
    });

    it('returns failure when password does not match', async () => {
      const { createAdminSession } = await import('../../lib/adminAuth.js');

      const result = await createAdminSession(
        createEnv({ ADMIN_CONSOLE_PASSWORD: 'correct-password' }),
        'wrong-password',
      );

      expect(result.success).toBe(false);
    });

    it('returns failure when ADMIN_CONSOLE_PASSWORD is empty string', async () => {
      const { createAdminSession } = await import('../../lib/adminAuth.js');
      const result = await createAdminSession(createEnv({ ADMIN_CONSOLE_PASSWORD: '' }), '');

      expect(result.success).toBe(false);
    });
  });

  describe('resolveAdminSession', () => {
    it('returns true for valid cookie', async () => {
      const { createAdminSession, resolveAdminSession } = await import('../../lib/adminAuth.js');
      const env = createEnv({ ADMIN_CONSOLE_PASSWORD: 'secret' });
      const session = await createAdminSession(env, 'secret');

      const setCookie = requireSetCookie(session);
      const isValid = await resolveAdminSession(env, setCookie);
      expect(isValid).toBe(true);
    });

    it('returns false when HMAC does not match', async () => {
      const { createAdminSession, resolveAdminSession } = await import('../../lib/adminAuth.js');
      const env = createEnv({ ADMIN_CONSOLE_PASSWORD: 'secret' });
      const setCookie = requireSetCookie(await createAdminSession(env, 'secret'));
      const [payload, mac] = readToken(setCookie);
      const forged = `ddlbuilder_admin_session=${payload}.${'0'.repeat(mac.length)}`;

      await expect(resolveAdminSession(env, forged)).resolves.toBe(false);
    });

    it('rejects a session after its signed server expiry', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      const { createAdminSession, resolveAdminSession } = await import('../../lib/adminAuth.js');
      const env = createEnv({ ADMIN_CONSOLE_PASSWORD: 'secret' });
      const session = await createAdminSession(env, 'secret');
      const setCookie = requireSetCookie(session);
      vi.setSystemTime(new Date('2026-01-01T05:00:00Z'));

      await expect(resolveAdminSession(env, setCookie)).resolves.toBe(false);
    });

    it('rejects a server-revoked session', async () => {
      const { createAdminSession, deleteAdminSession, resolveAdminSession } =
        await import('../../lib/adminAuth.js');
      const env = createEnv({ ADMIN_CONSOLE_PASSWORD: 'secret' });
      const session = await createAdminSession(env, 'secret');
      const setCookie = requireSetCookie(session);
      await deleteAdminSession(env, setCookie);
      await expect(resolveAdminSession(env, setCookie)).resolves.toBe(false);
    });
  });
});
