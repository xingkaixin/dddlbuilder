import { describe, expect, it, vi, beforeEach } from 'vitest';

const createAuthClientMock = vi.fn();

vi.mock('better-auth/client', () => ({
  createAuthClient: createAuthClientMock,
}));

describe('betterAuthClient', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    // Reset the module-level authClient cache by re-importing
    vi.doUnmock('@/auth/betterAuthClient');
    createAuthClientMock.mockReturnValue({
      signIn: { email: vi.fn() },
      signUp: { email: vi.fn() },
      signOut: vi.fn(),
      forgetPassword: vi.fn(),
      resetPassword: vi.fn(),
      sendVerificationEmail: vi.fn(),
      updateUser: vi.fn(),
      changePassword: vi.fn(),
    });
  });

  describe('isBetterAuthConfigured', () => {
    it('returns true when window is defined', async () => {
      const { isBetterAuthConfigured } = await import('@/auth/betterAuthClient');
      expect(isBetterAuthConfigured()).toBe(true);
    });

    it('returns false when window is undefined (SSR)', async () => {
      const originalWindow = globalThis.window;
      // @ts-expect-error - simulate SSR
      globalThis.window = undefined;

      const { isBetterAuthConfigured } = await import('@/auth/betterAuthClient');
      expect(isBetterAuthConfigured()).toBe(false);

      globalThis.window = originalWindow;
    });
  });

  describe('getBetterAuthClient', () => {
    it('creates client on first call with VITE_BETTER_AUTH_URL', async () => {
      const originalEnv = import.meta.env.VITE_BETTER_AUTH_URL;
      import.meta.env.VITE_BETTER_AUTH_URL = 'https://auth.example.com';

      const { getBetterAuthClient } = await import('@/auth/betterAuthClient');
      const client = getBetterAuthClient();

      expect(createAuthClientMock).toHaveBeenCalledTimes(1);
      expect(createAuthClientMock).toHaveBeenCalledWith({
        baseURL: 'https://auth.example.com',
        fetchOptions: {
          credentials: 'include',
        },
      });
      expect(client).not.toBeNull();

      import.meta.env.VITE_BETTER_AUTH_URL = originalEnv;
    });

    it('falls back to window.location.origin when VITE_BETTER_AUTH_URL is not set', async () => {
      const originalEnv = import.meta.env.VITE_BETTER_AUTH_URL;
      import.meta.env.VITE_BETTER_AUTH_URL = '';
      const originalOrigin = window.location.origin;
      Object.defineProperty(window, 'location', {
        value: { origin: 'https://app.example.com' },
        writable: true,
      });

      const { getBetterAuthClient } = await import('@/auth/betterAuthClient');
      const client = getBetterAuthClient();

      expect(createAuthClientMock).toHaveBeenCalledTimes(1);
      expect(createAuthClientMock).toHaveBeenCalledWith({
        baseURL: 'https://app.example.com',
        fetchOptions: {
          credentials: 'include',
        },
      });
      expect(client).not.toBeNull();

      import.meta.env.VITE_BETTER_AUTH_URL = originalEnv;
      Object.defineProperty(window, 'location', {
        value: { origin: originalOrigin },
        writable: true,
      });
    });

    it('returns cached client on subsequent calls', async () => {
      const { getBetterAuthClient } = await import('@/auth/betterAuthClient');
      const client1 = getBetterAuthClient();
      const client2 = getBetterAuthClient();

      expect(createAuthClientMock).toHaveBeenCalledTimes(1);
      expect(client1).toBe(client2);
    });

    it('returns null in SSR environment (window undefined)', async () => {
      const originalWindow = globalThis.window;
      // @ts-expect-error - simulate SSR
      globalThis.window = undefined;

      const { getBetterAuthClient } = await import('@/auth/betterAuthClient');
      const client = getBetterAuthClient();

      expect(client).toBeNull();
      expect(createAuthClientMock).not.toHaveBeenCalled();

      globalThis.window = originalWindow;
    });
  });
});
