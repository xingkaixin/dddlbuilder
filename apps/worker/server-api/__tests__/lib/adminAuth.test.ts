import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../../lib/context.js';

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
  RATE_LIMIT_KV: {} as KVNamespace,
  USER_DB: createAdminSessionDb(),
  BETTER_AUTH_SECRET: 'better-auth-secret',
  BETTER_AUTH_URL: 'http://localhost:3000',
  RESEND_API_KEY: 're_test_key',
  RESEND_FROM_EMAIL: 'noreply@example.com',
  RESEND_FROM_NAME: 'DDLBuilder',
  TURNSTILE_SECRET_KEY: 'turnstile-secret',
  SIGNUP_BONUS_CREDITS: '100000',
  ...overrides,
});

describe('adminAuth', () => {
  let originalCrypto: Crypto;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    // Save original crypto
    originalCrypto = globalThis.crypto;

    // Mock crypto.subtle
    const mockSubtle = {
      importKey: vi.fn().mockResolvedValue({} as CryptoKey),
      sign: vi
        .fn()
        .mockImplementation(async (_algorithm: string, _key: CryptoKey, _data: ArrayBuffer) => {
          // Return a deterministic "signature" based on data length
          return new Uint8Array(32).fill(0xab).buffer;
        }),
      timingSafeEqual: vi.fn().mockImplementation((a: Uint8Array, b: Uint8Array) => {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
          if (a[i] !== b[i]) return false;
        }
        return true;
      }),
    };

    // Mock crypto.randomUUID
    const mockRandomUUID = vi.fn().mockReturnValue('test-uuid-1234');

    Object.defineProperty(globalThis, 'crypto', {
      value: {
        subtle: mockSubtle,
        randomUUID: mockRandomUUID,
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

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.setCookie).toContain('ddlbuilder_admin_session=');
        expect(result.setCookie).toContain('Path=/api/admin');
        expect(result.setCookie).toContain('HttpOnly');
        expect(result.setCookie).toContain('SameSite=Lax');
        expect(result.setCookie).toContain('Max-Age=14400');
        expect(result.setCookie).toContain('Secure');
      }
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

    it('includes uuid and hmac in the cookie token', async () => {
      const { createAdminSession } = await import('../../lib/adminAuth.js');
      const result = await createAdminSession(
        createEnv({ ADMIN_CONSOLE_PASSWORD: 'secret' }),
        'secret',
      );

      expect(result.success).toBe(true);
      if (result.success) {
        // Token format: uuid.signature
        const match = result.setCookie.match(/ddlbuilder_admin_session=([^;]+)/);
        expect(match).toBeTruthy();
        const token = match?.[1] ?? '';
        expect(token).toContain('test-uuid-1234');
        expect(token).toContain('.');
      }
    });
  });

  describe('resolveAdminSession', () => {
    it('returns true for valid cookie', async () => {
      const { createAdminSession, resolveAdminSession } = await import('../../lib/adminAuth.js');
      const env = createEnv({ ADMIN_CONSOLE_PASSWORD: 'secret' });
      const session = await createAdminSession(env, 'secret');

      expect(session.success).toBe(true);
      if (session.success) {
        const cookie = session.setCookie;
        const isValid = await resolveAdminSession(env, cookie);
        expect(isValid).toBe(true);
      }
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
      await import('../../lib/adminAuth.js');

      // Override sign to return different values on subsequent calls
      const mockSign = vi
        .fn()
        .mockResolvedValueOnce(new Uint8Array(32).fill(0xab).buffer)
        .mockResolvedValueOnce(new Uint8Array(32).fill(0xcd).buffer);

      Object.defineProperty(globalThis, 'crypto', {
        value: {
          subtle: {
            importKey: vi.fn().mockResolvedValue({}),
            sign: mockSign,
            timingSafeEqual: vi.fn().mockImplementation((a: Uint8Array, b: Uint8Array) => {
              if (a.length !== b.length) return false;
              for (let i = 0; i < a.length; i++) {
                if (a[i] !== b[i]) return false;
              }
              return true;
            }),
          },
          randomUUID: vi.fn().mockReturnValue('test-uuid-1234'),
        },
        writable: true,
        configurable: true,
      });

      // First create a session with one HMAC
      const { createAdminSession } = await import('../../lib/adminAuth.js');
      const env = createEnv({ ADMIN_CONSOLE_PASSWORD: 'secret' });
      const session = await createAdminSession(env, 'secret');

      // Reset modules so resolveAdminSession gets the new mock
      vi.resetModules();

      // Now verify with different HMAC
      const { resolveAdminSession: resolveAdminSession2 } = await import('../../lib/adminAuth.js');
      expect(session.success).toBe(true);
      if (session.success) {
        const result = await resolveAdminSession2(env, session.setCookie);
        expect(result).toBe(false);
      }
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

      expect(session.success).toBe(true);
      if (session.success) {
        const multiCookie = `other_cookie=foo; ${session.setCookie}; another=bar`;
        const isValid = await resolveAdminSession(env, multiCookie);
        expect(isValid).toBe(true);
      }
    });

    it('rejects a session after its signed server expiry', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      const { createAdminSession, resolveAdminSession } = await import('../../lib/adminAuth.js');
      const env = createEnv({ ADMIN_CONSOLE_PASSWORD: 'secret' });
      const session = await createAdminSession(env, 'secret');
      expect(session.success).toBe(true);
      vi.setSystemTime(new Date('2026-01-01T05:00:00Z'));

      if (session.success) {
        await expect(resolveAdminSession(env, session.setCookie)).resolves.toBe(false);
      }
    });

    it('rejects a server-revoked session', async () => {
      const { createAdminSession, deleteAdminSession, resolveAdminSession } =
        await import('../../lib/adminAuth.js');
      const env = createEnv({ ADMIN_CONSOLE_PASSWORD: 'secret' });
      const session = await createAdminSession(env, 'secret');
      expect(session.success).toBe(true);

      if (session.success) {
        await deleteAdminSession(env, session.setCookie);
        await expect(resolveAdminSession(env, session.setCookie)).resolves.toBe(false);
      }
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
