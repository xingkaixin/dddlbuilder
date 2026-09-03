import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../../lib/context.js';

const TEST_ADMIN_SESSION_SECRET = '0123456789abcdef0123456789abcdef';

const createAdminSessionDb = () => {
  const sessions = new Map<
    string,
    { expiresAt: number; createdAt: number; revokedAt: number | null }
  >();
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
  SHARE_KV: {} as KVNamespace,
  USER_DB: createAdminSessionDb(),
  BETTER_AUTH_SECRET: 'better-auth-secret',
  BETTER_AUTH_URL: 'http://localhost:3000',
  RESEND_API_KEY: 're_test_key',
  RESEND_FROM_EMAIL: 'noreply@example.com',
  RESEND_FROM_NAME: 'DDLBuilder',
  TURNSTILE_SECRET_KEY: 'turnstile-secret',
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

const hmacHex = async (key: BufferSource, data: string): Promise<string> => {
  const { subtle } = crypto;
  const cryptoKey = await subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const signature = await subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

describe('adminAuth', () => {
  let originalCrypto: Crypto;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    // Save original crypto
    originalCrypto = crypto;

    // Keep real signing behavior while making the generated session ID deterministic.
    Object.defineProperty(globalThis, 'crypto', {
      value: {
        subtle: originalCrypto.subtle,
        randomUUID: vi.fn().mockReturnValue('test-uuid-1234'),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(globalThis, 'crypto', {
      value: originalCrypto,
      writable: true,
      configurable: true,
    });
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

    it('returns failure when password is longer but different', async () => {
      const { createAdminSession } = await import('../../lib/adminAuth.js');
      const result = await createAdminSession(
        createEnv({ ADMIN_CONSOLE_PASSWORD: 'short' }),
        'longer-password',
      );

      expect(result.success).toBe(false);
    });

    it('returns failure when ADMIN_CONSOLE_PASSWORD is not set', async () => {
      const { createAdminSession } = await import('../../lib/adminAuth.js');
      const result = await createAdminSession(
        createEnv({ ADMIN_CONSOLE_PASSWORD: undefined }),
        'any-password',
      );

      expect(result.success).toBe(false);
    });

    it('returns failure when ADMIN_CONSOLE_PASSWORD is empty string', async () => {
      const { createAdminSession } = await import('../../lib/adminAuth.js');
      const result = await createAdminSession(createEnv({ ADMIN_CONSOLE_PASSWORD: '' }), '');

      expect(result.success).toBe(false);
    });

    it('returns failure when ADMIN_SESSION_SECRET is not set', async () => {
      const { createAdminSession } = await import('../../lib/adminAuth.js');
      const result = await createAdminSession(
        createEnv({
          ADMIN_CONSOLE_PASSWORD: 'secret',
          ADMIN_SESSION_SECRET: undefined,
        }),
        'secret',
      );

      expect(result.success).toBe(false);
    });

    it('returns failure when ADMIN_SESSION_SECRET is shorter than 32 bytes', async () => {
      const { createAdminSession } = await import('../../lib/adminAuth.js');
      const result = await createAdminSession(
        createEnv({
          ADMIN_CONSOLE_PASSWORD: 'secret',
          ADMIN_SESSION_SECRET: 'short-session-secret',
        }),
        'secret',
      );

      expect(result.success).toBe(false);
    });

    it('returns failure when ADMIN_SESSION_SECRET equals the admin password', async () => {
      const { createAdminSession } = await import('../../lib/adminAuth.js');
      const sharedSecret = '0123456789abcdef0123456789abcdef';
      const result = await createAdminSession(
        createEnv({
          ADMIN_CONSOLE_PASSWORD: sharedSecret,
          ADMIN_SESSION_SECRET: sharedSecret,
        }),
        sharedSecret,
      );

      expect(result.success).toBe(false);
    });

    it('includes uuid and hmac in the cookie token', async () => {
      const { createAdminSession } = await import('../../lib/adminAuth.js');
      const result = await createAdminSession(
        createEnv({ ADMIN_CONSOLE_PASSWORD: 'secret' }),
        'secret',
      );

      const setCookie = requireSetCookie(result);
      const match = setCookie.match(/ddlbuilder_admin_session=([^;]+)/);
      expect(match).toBeTruthy();
      const token = match?.[1] ?? '';
      expect(token).toContain('test-uuid-1234');
      expect(token).toContain('.');
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

    it('returns false when cookie header is null', async () => {
      const { resolveAdminSession } = await import('../../lib/adminAuth.js');
      const result = await resolveAdminSession(
        createEnv({ ADMIN_CONSOLE_PASSWORD: 'secret' }),
        null,
      );

      expect(result).toBe(false);
    });

    it('returns false when cookie header is undefined', async () => {
      const { resolveAdminSession } = await import('../../lib/adminAuth.js');
      const result = await resolveAdminSession(
        createEnv({ ADMIN_CONSOLE_PASSWORD: 'secret' }),
        undefined,
      );

      expect(result).toBe(false);
    });

    it('returns false when cookie header is empty string', async () => {
      const { resolveAdminSession } = await import('../../lib/adminAuth.js');
      const result = await resolveAdminSession(createEnv({ ADMIN_CONSOLE_PASSWORD: 'secret' }), '');

      expect(result).toBe(false);
    });

    it('returns false when cookie name does not match', async () => {
      const { resolveAdminSession } = await import('../../lib/adminAuth.js');
      const result = await resolveAdminSession(
        createEnv({ ADMIN_CONSOLE_PASSWORD: 'secret' }),
        'other_cookie=value',
      );

      expect(result).toBe(false);
    });

    it('returns false when token format is invalid (no separator)', async () => {
      const { resolveAdminSession } = await import('../../lib/adminAuth.js');
      const result = await resolveAdminSession(
        createEnv({ ADMIN_CONSOLE_PASSWORD: 'secret' }),
        'ddlbuilder_admin_session=invalidtoken',
      );

      expect(result).toBe(false);
    });

    it('returns false when HMAC does not match', async () => {
      const { createAdminSession, resolveAdminSession } = await import('../../lib/adminAuth.js');
      const env = createEnv({ ADMIN_CONSOLE_PASSWORD: 'secret' });
      const setCookie = requireSetCookie(await createAdminSession(env, 'secret'));
      const [payload, mac] = readToken(setCookie);
      const forged = `ddlbuilder_admin_session=${payload}.${'0'.repeat(mac.length)}`;

      await expect(resolveAdminSession(env, forged)).resolves.toBe(false);
    });

    it('signs with ADMIN_SESSION_SECRET when configured', async () => {
      const { createAdminSession, resolveAdminSession } = await import('../../lib/adminAuth.js');
      const env = createEnv({
        ADMIN_CONSOLE_PASSWORD: 'secret',
        ADMIN_SESSION_SECRET: TEST_ADMIN_SESSION_SECRET,
      });
      const setCookie = requireSetCookie(await createAdminSession(env, 'secret'));
      const [payload, mac] = readToken(setCookie);

      expect(mac).toBe(await hmacHex(new TextEncoder().encode(TEST_ADMIN_SESSION_SECRET), payload));
      await expect(resolveAdminSession(env, setCookie)).resolves.toBe(true);
      await expect(
        resolveAdminSession(
          { ...env, ADMIN_SESSION_SECRET: 'fedcba9876543210fedcba9876543210' },
          setCookie,
        ),
      ).resolves.toBe(false);
    });

    it('returns false when ADMIN_SESSION_SECRET is absent', async () => {
      const { createAdminSession, resolveAdminSession } = await import('../../lib/adminAuth.js');
      const env = createEnv({ ADMIN_CONSOLE_PASSWORD: 'secret' });
      const setCookie = requireSetCookie(await createAdminSession(env, 'secret'));

      await expect(
        resolveAdminSession({ ...env, ADMIN_SESSION_SECRET: undefined }, setCookie),
      ).resolves.toBe(false);
    });

    it('returns false when ADMIN_CONSOLE_PASSWORD is not set', async () => {
      const { resolveAdminSession } = await import('../../lib/adminAuth.js');
      const result = await resolveAdminSession(
        createEnv({ ADMIN_CONSOLE_PASSWORD: undefined }),
        'ddlbuilder_admin_session=uuid.signature',
      );

      expect(result).toBe(false);
    });

    it('handles multiple cookies and finds the correct one', async () => {
      const { createAdminSession, resolveAdminSession } = await import('../../lib/adminAuth.js');
      const env = createEnv({ ADMIN_CONSOLE_PASSWORD: 'secret' });
      const session = await createAdminSession(env, 'secret');

      const setCookie = requireSetCookie(session);
      const multiCookie = `other_cookie=foo; ${setCookie}; another=bar`;
      const isValid = await resolveAdminSession(env, multiCookie);
      expect(isValid).toBe(true);
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

  describe('deleteAdminSession', () => {
    it('returns a cookie that clears the session', async () => {
      const { deleteAdminSession } = await import('../../lib/adminAuth.js');
      const cookie = await deleteAdminSession(createEnv(), null);

      expect(cookie).toContain('ddlbuilder_admin_session=');
      expect(cookie).toContain('Path=/api/admin');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain('Max-Age=0');
      expect(cookie).toContain('Secure');
    });

    it('has empty value for the cookie', async () => {
      const { deleteAdminSession } = await import('../../lib/adminAuth.js');
      const cookie = await deleteAdminSession(createEnv(), null);

      const match = cookie.match(/ddlbuilder_admin_session=([^;]*)/);
      expect(match).toBeTruthy();
      expect(match?.[1]).toBe('');
    });
  });
});
