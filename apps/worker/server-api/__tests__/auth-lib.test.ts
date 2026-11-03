import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Context } from 'hono';
import type { ApiEnv } from '../lib/context.js';
import { authenticateRequest, resolveAuthenticatedUser } from '../lib/auth.js';

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- auth behavior is tested independently of the Better Auth adapter.
vi.mock('../lib/betterAuth.js', () => ({
  createBetterAuth: () => ({ api: { getSession: mocks.getSession } }),
}));

const session = {
  session: { id: 'session-1', token: 'session-token' },
  user: { id: 'user-1', email: 'user@example.com', emailVerified: true, name: 'User One' },
};
const createEnv = (disabled = false) =>
  // SAFETY: the auth tests provide the only USER_DB operation exercised by the implementation.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- the fixture implements only the database calls used by auth.
  ({
    USER_DB: {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          first: vi.fn().mockResolvedValue({ active: 1, disabled: disabled ? 1 : 0 }),
        })),
      })),
    },
  }) as unknown as ApiEnv['Bindings'];

const createContext = (
  env = createEnv(),
  headers = new Headers(),
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the test logger accepts any auth failure value emitted by the boundary.
  log?: { error: (error: unknown) => void },
) => {
  const set = vi.fn();

  // SAFETY: this context supplies the env, request headers, logger lookup, and setter used by auth.
  // oxlint-disable anti-slop/no-chained-type-assertions -- the context fixture implements only auth's accessed fields.
  return {
    context: {
      env,
      req: { raw: { headers } },
      get: (key: string) => (key === 'log' ? log : undefined),
      set,
    } as unknown as Context<ApiEnv>,
    set,
  };
  // oxlint-enable anti-slop/no-chained-type-assertions
};

describe('authenticated session resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue(session);
  });
  it('distinguishes auth service failure from an anonymous user', async () => {
    mocks.getSession.mockRejectedValue(new Error('database unavailable'));
    const error = vi.fn();
    const { context } = createContext(createEnv(), new Headers(), { error });
    await expect(resolveAuthenticatedUser(context)).rejects.toMatchObject({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'Authentication service unavailable',
    });
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'database unavailable' }),
    );
  });
  it('rejects disabled users', async () => {
    const { context } = createContext(createEnv(true));
    await expect(resolveAuthenticatedUser(context)).rejects.toMatchObject({
      status: 403,
      code: 'USER_DISABLED',
    });
  });
  it('rejects anonymous requests', async () => {
    mocks.getSession.mockResolvedValue(null);
    const { context, set } = createContext();
    await expect(authenticateRequest(context)).rejects.toMatchObject({
      status: 401,
      code: 'AUTH_REQUIRED',
    });
    expect(set).not.toHaveBeenCalled();
  });
});
