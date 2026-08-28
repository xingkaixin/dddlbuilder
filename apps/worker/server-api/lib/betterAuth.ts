import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/d1';
import { Resend } from 'resend';
import type { ApiEnv } from './context.js';
import { betterAuthSchema } from '@ddlbuilder/db';
import { getUserSystemConfig } from './userSystemConfig.js';
import { parseAllowedOrigins } from './env.js';

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const normalizeAuthActionUrl = (rawUrl: string, authBaseUrl: URL) => {
  const trimmed = rawUrl.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith('//')) {
    return `${authBaseUrl.protocol}${trimmed}`;
  }

  if (trimmed.startsWith('/')) {
    return new URL(trimmed, authBaseUrl.origin).toString();
  }

  if (/^[a-z0-9.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(trimmed)) {
    return `${authBaseUrl.protocol}//${trimmed}`;
  }

  return new URL(trimmed, authBaseUrl).toString();
};

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

  const { error } = await resend.emails.send({
    from: `${config.resendFromName} <${config.resendFromEmail}>`,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });
  if (error) {
    console.error('[auth] email delivery failed', {
      name: error.name,
      statusCode: error.statusCode,
    });
    throw new Error('Authentication email delivery failed');
  }
};

// Shared email layout matching the website's light theme
// Brand colors: primary #E07A5F, background #F8F6F0, text #3D3529
const renderEmailLayout = (bodyContent: string) => `
  <div style="max-width:480px;margin:0 auto;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;background-color:#F8F6F0;">
    <!-- Header -->
    <div style="text-align:center;margin-bottom:28px;">
      <svg width="40" height="40" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto 10px;">
        <defs>
          <linearGradient id="pg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#FF8E7A;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#E65D4F;stop-opacity:1" />
          </linearGradient>
        </defs>
        <path d="M 22 56 L 58 77 L 58 107 L 22 86 Z" fill="url(#pg)" opacity="0.95"/>
        <path d="M 62 77 L 98 56 L 98 64 L 62 85 Z" fill="#E65D4F" opacity="0.9"/>
        <path d="M 62 88 L 98 67 L 98 75 L 62 96 Z" fill="#E65D4F" opacity="0.65"/>
        <path d="M 62 99 L 98 78 L 98 86 L 62 107 Z" fill="#E65D4F" opacity="0.4"/>
        <path d="M 60 25 L 98 47 L 60 69 L 22 47 Z" fill="#FF8E7A" opacity="0.15"/>
        <g stroke="#E65D4F" stroke-width="1.5" stroke-linecap="round" opacity="0.4">
          <line x1="47.33" y1="32.33" x2="85.33" y2="54.33"/>
          <line x1="34.66" y1="39.66" x2="72.66" y2="61.66"/>
          <line x1="72.66" y1="32.33" x2="34.66" y2="54.33"/>
          <line x1="85.33" y1="39.66" x2="47.33" y2="61.66"/>
        </g>
        <path d="M 47.33 31 L 60 38.33 L 60 54.33 L 47.33 47 Z" fill="#E65D4F" opacity="0.9"/>
        <path d="M 60 38.33 L 72.66 31 L 72.66 47 L 60 54.33 Z" fill="#E65D4F" opacity="0.6"/>
        <path d="M 60 23.66 L 72.66 31 L 60 38.33 L 47.33 31 Z" fill="url(#pg)"/>
      </svg>
      <div style="font-size:20px;font-weight:600;color:#E07A5F;">筑表师</div>
    </div>

    <!-- Card -->
    <div style="background-color:#FFFFFF;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
      ${bodyContent}
    </div>

    <!-- Footer -->
    <div style="text-align:center;margin-top:24px;color:#9C9488;font-size:12px;line-height:1.5;">
      此邮件由 筑表师 (DDLBuilder) 自动发送，请勿直接回复。
    </div>
  </div>
`;

const renderVerificationEmail = (url: string, name: string) => {
  const escapedName = escapeHtml(name);
  const escapedUrl = escapeHtml(url);
  return {
    subject: '验证你的筑表师账号',
    html: renderEmailLayout(`
      <p style="margin:0 0 16px;color:#3D3529;font-size:15px;line-height:1.6;">
        ${escapedName}，你好：
      </p>
      <p style="margin:0 0 24px;color:#5C564E;font-size:15px;line-height:1.6;">
        感谢你注册筑表师！请点击下面的按钮完成邮箱验证。
      </p>
      <p style="margin:0 0 24px;">
        <a href="${escapedUrl}" style="display:inline-block;padding:12px 24px;border-radius:8px;background-color:#E07A5F;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;">
          验证邮箱
        </a>
      </p>
      <p style="margin:0 0 8px;color:#9C9488;font-size:13px;line-height:1.5;">
        如果按钮无法点击，请复制以下链接到浏览器：
      </p>
      <p style="margin:0;word-break:break-all;">
        <a href="${escapedUrl}" style="color:#E07A5F;text-decoration:none;font-size:13px;">${escapedUrl}</a>
      </p>
    `),
    text: `${name}，请打开这个链接完成邮箱验证：${url}`,
  };
};

const renderResetPasswordEmail = (url: string, name: string) => {
  const escapedName = escapeHtml(name);
  const escapedUrl = escapeHtml(url);
  return {
    subject: '重置你的筑表师密码',
    html: renderEmailLayout(`
      <p style="margin:0 0 16px;color:#3D3529;font-size:15px;line-height:1.6;">
        ${escapedName}，你好：
      </p>
      <p style="margin:0 0 24px;color:#5C564E;font-size:15px;line-height:1.6;">
        我们收到了你的密码重置请求。请点击下面的按钮设置新密码。
      </p>
      <p style="margin:0 0 24px;">
        <a href="${escapedUrl}" style="display:inline-block;padding:12px 24px;border-radius:8px;background-color:#E07A5F;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;">
          重置密码
        </a>
      </p>
      <p style="margin:0 0 8px;color:#9C9488;font-size:13px;line-height:1.5;">
        如果按钮无法点击，请复制以下链接到浏览器：
      </p>
      <p style="margin:0;word-break:break-all;">
        <a href="${escapedUrl}" style="color:#E07A5F;text-decoration:none;font-size:13px;">${escapedUrl}</a>
      </p>
      <p style="margin:16px 0 0;color:#9C9488;font-size:12px;line-height:1.5;">
        如果你没有发起此请求，请忽略此邮件，你的密码不会改变。
      </p>
    `),
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
      schema: betterAuthSchema,
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: config.authRequireEmailVerification,
      sendResetPassword: async ({ user, url }) => {
        const normalizedUrl = normalizeAuthActionUrl(url, authBaseUrl);
        const content = renderResetPasswordEmail(normalizedUrl, user.name || user.email);
        await sendEmail(env, {
          to: user.email,
          ...content,
        });
      },
      revokeSessionsOnPasswordReset: true,
    },
    emailVerification: {
      sendOnSignUp: config.authRequireEmailVerification,
      sendOnSignIn: false,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        const normalizedUrl = normalizeAuthActionUrl(url, authBaseUrl);
        const content = renderVerificationEmail(normalizedUrl, user.name || user.email);
        await sendEmail(env, {
          to: user.email,
          ...content,
        });
      },
    },
  });
};
