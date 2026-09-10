import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '../../lib/context.js';
import { createBetterAuth } from '../../lib/betterAuth.js';
import { createSqliteD1Database } from '../helpers/sqliteD1.js';

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn() }));

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendEmail };
  },
}));

describe('email OTP verification', () => {
  let fixture: ReturnType<typeof createSqliteD1Database>;
  let env: ApiEnv['Bindings'];
  const email = 'otp@example.com';
  const password = 'Password-test-123!';

  const post = (path: string, body: unknown) =>
    createBetterAuth(env).handler(
      new Request(`http://localhost:3000/api/auth${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
        body: JSON.stringify(body),
      }),
    );
  const signup = () => post('/sign-up/email', { email, password, name: 'OTP Test' });
  const resend = () => post('/send-verification-email', { email });
  const verify = (otp: string) => post('/email-otp/verify-email', { email, otp });

  const latestCode = () => {
    const text = sendEmail.mock.lastCall?.[0].text as string;
    const code = text.match(/验证码是：(\d{6})/)?.[1];

    if (!code) throw new Error('Verification email has no six-digit OTP');

    return code;
  };

  beforeEach(() => {
    sendEmail.mockReset().mockResolvedValue({ data: { id: 'email-1' }, error: null });
    fixture = createSqliteD1Database({ includeMeta: true });
    env = {
      USER_DB: fixture.database,
      BETTER_AUTH_SECRET: 'a-long-enough-secret-for-auth-tests',
      BETTER_AUTH_URL: 'http://localhost:3000',
      RESEND_API_KEY: 'test',
      RESEND_FROM_EMAIL: 'noreply@example.com',
      TURNSTILE_SECRET_KEY: 'test',
      SIGNUP_BONUS_CREDITS: '1000',
    } as ApiEnv['Bindings'];
  });

  afterEach(() => fixture.sqlite.close());

  it('sends one code on signup, stores a hash, and verifies into a session exactly once', async () => {
    const response = await signup();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ token: null });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const otp = latestCode();
    const sent = sendEmail.mock.lastCall?.[0];
    expect(sent.html).toContain(otp);
    expect(sent.html).toContain('10 分钟');
    expect(sent.html).not.toContain('href=');
    const stored = fixture.sqlite.prepare('SELECT value, expires_at FROM verification').get();
    expect(stored?.value).not.toContain(otp);
    expect(Number(stored?.expires_at) - Date.now()).toBeGreaterThan(590_000);
    expect((await post('/sign-in/email', { email, password })).status).toBe(403);

    const verified = await verify(otp);
    expect(verified.status).toBe(200);
    expect(await verified.json()).toMatchObject({ user: { emailVerified: true } });
    const cookie = verified.headers.get('set-cookie');
    expect(cookie).toContain('session_token=');

    const session = await createBetterAuth(env).api.getSession({
      headers: new Headers({ cookie: cookie ?? '' }),
    });
    expect(session?.user.emailVerified).toBe(true);
    expect((await verify(otp)).status).toBe(400);
    expect(fixture.sqlite.prepare('SELECT COUNT(*) AS count FROM session').get()?.count).toBe(1);
    expect((await resend()).status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('invalidates the previous code on resend and locks out exhausted attempts', async () => {
    await signup();
    const previous = latestCode();
    expect((await resend()).status).toBe(200);
    const current = latestCode();
    expect(current).not.toBe(previous);
    expect(await (await verify(previous)).json()).toMatchObject({ code: 'INVALID_OTP' });
    expect(await (await verify('not-a-code')).json()).toMatchObject({ code: 'INVALID_OTP' });
    expect(await (await verify('not-a-code')).json()).toMatchObject({ code: 'INVALID_OTP' });
    expect(await (await verify(current)).json()).toMatchObject({ code: 'TOO_MANY_ATTEMPTS' });
    expect(fixture.sqlite.prepare('SELECT email_verified FROM user').get()?.email_verified).toBe(0);
    expect((await resend()).status).toBe(200);
    expect((await verify(latestCode())).status).toBe(200);
  });

  it('rejects expired codes without verifying the user', async () => {
    await signup();
    const otp = latestCode();
    fixture.sqlite.prepare('UPDATE verification SET expires_at = ?').run(Date.now() - 1000);
    expect(await (await verify(otp)).json()).toMatchObject({ code: 'OTP_EXPIRED' });
    expect(fixture.sqlite.prepare('SELECT email_verified FROM user').get()?.email_verified).toBe(0);
  });

  it('keeps OTP sign-in and password reset endpoints disabled', async () => {
    for (const path of [
      '/email-otp/send-verification-otp',
      '/sign-in/email-otp',
      '/email-otp/request-password-reset',
      '/email-otp/reset-password',
      '/forget-password/email-otp',
      '/email-otp/check-verification-otp',
    ]) {
      expect((await post(path, { email, otp: '123456', password })).status).toBe(404);
    }

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('does not send an OTP when email verification is disabled', async () => {
    env.AUTH_REQUIRE_EMAIL_VERIFICATION = 'false';
    const response = await signup();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ token: expect.any(String) });
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
