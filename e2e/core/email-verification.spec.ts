import { expect, test } from '@playwright/test';

test.describe('邮箱验证码', () => {
  let signedIn: boolean;
  let codesSent: number;
  const email = 'otp@example.com';

  test.beforeEach(async ({ page }) => {
    signedIn = false;
    codesSent = 0;
    await page.addInitScript(() => {
      Object.assign(window, {
        turnstile: {
          render: (_container: HTMLElement, options: { callback: (token: string) => void }) => {
            options.callback('test-token');

            return 'test-widget';
          },
          remove: () => {},
        },
      });
    });
    await page.route('**/api/me', (route) =>
      route.fulfill({
        json: signedIn
          ? {
              signedIn: true,
              user: { userId: 'otp-user', email, name: 'OTP Test', emailVerified: true },
            }
          : { signedIn: false, user: null },
      }),
    );
    await page.route('**/api/credits/balance', (route) =>
      route.fulfill({ json: { balance: 1000 } }),
    );
    await page.route('**/api/workspaces', (route) =>
      route.fulfill({ status: 503, json: { error: 'Unavailable' } }),
    );
    await page.route('**/api/auth/sign-up/email', (route) => {
      expect(route.request().postDataJSON()).toMatchObject({ email });
      expect(route.request().headers()['x-turnstile-token']).toBe('test-token');
      codesSent++;

      return route.fulfill({ json: { token: null, user: { email } } });
    });
    await page.route('**/api/auth/sign-in/email', (route) =>
      route.fulfill({
        status: 403,
        json: { code: 'EMAIL_NOT_VERIFIED', message: 'Email not verified' },
      }),
    );
    await page.route('**/api/auth/send-verification-email', (route) => {
      expect(route.request().postDataJSON()).toEqual({ email });
      codesSent++;

      return route.fulfill({ json: { success: true } });
    });
    await page.route('**/api/auth/email-otp/verify-email', (route) => {
      const body = route.request().postDataJSON();
      expect(body.email).toBe(email);

      if (body.otp !== '123456')
        return route.fulfill({
          status: 400,
          json: { code: 'INVALID_OTP', message: 'Invalid OTP' },
        });
      signedIn = true;

      return route.fulfill({ json: { status: true, token: 'test-session' } });
    });
    await page.goto('/');
    await page.getByRole('button', { name: '登录 / 注册', exact: true }).click();
  });

  test('注册后输入六位验证码，错误可重试，成功自动登录', async ({ page }) => {
    await page.getByRole('button', { name: '没有账号？去注册' }).click();
    await page.getByLabel('昵称', { exact: true }).fill('OTP Test');
    await page.getByLabel('邮箱', { exact: true }).fill(email);
    await page.getByLabel('密码', { exact: true }).fill('Password-test-123!');
    await page.getByRole('button', { name: '创建账号', exact: true }).click();
    await expect(page.getByRole('heading', { name: '验证你的邮箱' })).toBeVisible();
    await expect(page.getByText(`六位验证码已发送至 ${email}，请在下方输入。`)).toBeVisible();
    expect(codesSent).toBe(1);
    const otp = page.getByLabel('六位验证码', { exact: true });
    await expect(otp).toBeFocused();
    await expect(page.locator('[data-slot="input-otp-slot"]')).toHaveCount(6);
    const submit = page.getByRole('button', { name: '验证并登录' });
    await expect(submit).toBeDisabled();
    await otp.fill('000000');
    await otp.press('Enter');
    await expect(page.getByRole('alert')).toHaveText('验证码不正确，请重新输入');
    await expect(otp).toBeFocused();
    await otp.fill('123456');
    await submit.click();
    await expect(page.getByRole('heading', { name: '验证你的邮箱' })).not.toBeVisible();
    await expect(page.getByText('邮箱验证成功，已登录', { exact: true })).toBeVisible();
    expect(signedIn).toBe(true);
  });

  test('未验证账号可以继续验证、关闭后恢复，并在冷却结束后重发', async ({ page }) => {
    await page.clock.install();
    await page.getByLabel('邮箱', { exact: true }).fill(email);
    await page.getByLabel('密码', { exact: true }).fill('Password-test-123!');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: '登录 / 注册', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: '验证你的邮箱' })).toBeVisible();
    expect(codesSent).toBe(1);
    await expect(page.getByRole('button', { name: /秒后可重发/ })).toBeDisabled();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.clock.fastForward(30_000);
    await page.getByRole('button', { name: '登录 / 注册', exact: true }).click();
    await expect(page.getByRole('heading', { name: '验证你的邮箱' })).toBeVisible();
    expect(codesSent).toBe(1);
    await page.clock.fastForward(31_000);
    await page.getByRole('button', { name: '重新发送验证码', exact: true }).click();
    await expect.poll(() => codesSent).toBe(2);
    await expect(page.getByRole('button', { name: /秒后可重发/ })).toBeDisabled();
    await page.getByRole('button', { name: '返回登录', exact: true }).click();
    await expect(page.getByLabel('邮箱', { exact: true })).toHaveValue(email);
  });
});
