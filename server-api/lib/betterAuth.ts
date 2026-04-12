import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/d1';
import { Resend } from 'resend';
import type { ApiEnv } from './context.js';
import { getUserSystemConfig } from './userSystemConfig.js';

const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

const parseAllowedOrigins = (raw: string | undefined) => {
  const normalized = raw?.trim();
  if (!normalized) {
    return DEFAULT_ALLOWED_ORIGINS;
  }

  const origins = normalized
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return origins.length > 0 ? origins : DEFAULT_ALLOWED_ORIGINS;
};

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const sendEmail = async (
  env: ApiEnv['Bindings'],
  input: {
    to: string;
    subject: string;
    html: string;
    text: string;
  },
) => {
  const config = getUserSystemConfig(env);
  const resend = new Resend(config.resendApiKey);

  await resend.emails.send({
    from: `${config.resendFromName} <${config.resendFromEmail}>`,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });
};

const renderVerificationEmail = (url: string, name: string) => {
  const escapedName = escapeHtml(name);
  const escapedUrl = escapeHtml(url);
  return {
    subject: '验证你的筑表师账号',
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.6;color:#111827">
        <p>${escapedName}，你好：</p>
        <p>请点击下面的按钮完成邮箱验证。</p>
        <p>
          <a href="${escapedUrl}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#111827;color:#ffffff;text-decoration:none">
            验证邮箱
          </a>
        </p>
        <p>如果按钮无法打开，请复制这个链接到浏览器：</p>
        <p><a href="${escapedUrl}">${escapedUrl}</a></p>
      </div>
    `,
    text: `${name}，请打开这个链接完成邮箱验证：${url}`,
  };
};

const renderResetPasswordEmail = (url: string, name: string) => {
  const escapedName = escapeHtml(name);
  const escapedUrl = escapeHtml(url);
  return {
    subject: '重置你的筑表师密码',
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.6;color:#111827">
        <p>${escapedName}，你好：</p>
        <p>请点击下面的按钮重置密码。</p>
        <p>
          <a href="${escapedUrl}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#111827;color:#ffffff;text-decoration:none">
            重置密码
          </a>
        </p>
        <p>如果按钮无法打开，请复制这个链接到浏览器：</p>
        <p><a href="${escapedUrl}">${escapedUrl}</a></p>
      </div>
    `,
    text: `${name}，请打开这个链接重置密码：${url}`,
  };
};

export const createBetterAuth = (env: ApiEnv['Bindings']) => {
  const config = getUserSystemConfig(env);
  const db = drizzle(env.USER_DB);
  const authBaseUrl = new URL(config.betterAuthUrl);
  const trustedOrigins = new Set([
    authBaseUrl.origin,
    ...parseAllowedOrigins(env.CORS_ALLOWED_ORIGINS),
  ]);

  return betterAuth({
    secret: config.betterAuthSecret,
    baseURL: authBaseUrl.origin,
    trustedOrigins: [...trustedOrigins],
    database: drizzleAdapter(db, {
      provider: 'sqlite',
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendResetPassword: async ({ user, url }) => {
        const content = renderResetPasswordEmail(url, user.name || user.email);
        await sendEmail(env, {
          to: user.email,
          ...content,
        });
      },
      revokeSessionsOnPasswordReset: true,
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        const content = renderVerificationEmail(url, user.name || user.email);
        await sendEmail(env, {
          to: user.email,
          ...content,
        });
      },
    },
  });
};
