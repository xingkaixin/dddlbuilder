import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Context } from 'hono';
import type { ApiEnv } from '../lib/context.js';
import { authenticateRequest, resolveAuthenticatedUser } from '../lib/auth.js';

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), grantSignupCredits: vi.fn() }));
vi.mock('../lib/betterAuth.js', () => ({
  createBetterAuth: () => ({ api: { getSession: mocks.getSession } }),
}));
vi.mock('../lib/credits.js', () => ({ grantSignupCredits: mocks.grantSignupCredits }));

const session = {
  session: { id: 'session-1', token: 'session-token' },
  user: { id: 'user-1', email: 'user@example.com', emailVerified: true, name: 'User One' },
};
const createEnv = (disabled = false) =>
  ({
    USER_DB: {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          all: vi.fn().mockResolvedValue({
            results: [{ id: 'session-1', disabled: disabled ? 'user-1' : null }],
          }),
        })),
      })),
    },
  }) as unknown as ApiEnv['Bindings'];

const createContext = (
  env = createEnv(),
  headers = new Headers(),
  log?: { error: (error: unknown) => void },
) => {
  const set = vi.fn();
  return {
    context: {
      env,
      req: { raw: { headers } },
      get: (key: string) => (key === 'log' ? log : undefined),
      set,
    } as unknown as Context<ApiEnv>,
    set,
  };
};

describe('authenticated session resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue(session);
  });
  it('reads the session API without refreshing it or granting credits', async () => {
    const { context } = createContext(
      createEnv(),
      new Headers({ cookie: 'session=test', authorization: 'ignored' }),
    );
    const user = await resolveAuthenticatedUser(context);
    expect(user).toEqual({
      userId: 'user-1',
      sessionId: 'session-1',
      email: 'user@example.com',
      emailVerified: true,
      name: 'User One',
    });
    const options = mocks.getSession.mock.calls[0][0];
    expect(options.query).toEqual({ disableRefresh: true });
    expect(options.headers.get('cookie')).toBe('session=test');
    expect(options.headers.has('authorization')).toBe(false);
    expect(mocks.grantSignupCredits).not.toHaveBeenCalled();
  });
  it.each([null, { session: { id: 'session-1' } }, { user: session.user }])(
    'returns null for an absent session %#',
    async (value) => {
      mocks.getSession.mockResolvedValue(value);
      const { context } = createContext();
      expect(await resolveAuthenticatedUser(context)).toBeNull();
    },
  );
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

  it('records the authenticated request user', async () => {
    const { context, set } = createContext();
    expect(await authenticateRequest(context)).toMatchObject({ userId: 'user-1' });
    expect(set).toHaveBeenCalledWith('currentUserId', 'user-1');
  });
});
