import { betterAuth } from 'better-auth';
import { emailOTP } from 'better-auth/plugins/email-otp';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/d1';
import { Resend } from 'resend';
import type { ApiEnv } from './context.js';
import { betterAuthSchema } from '@ddlbuilder/user-db';
import { getUserSystemConfig } from './userSystemConfig.js';
import { parseAllowedOrigins } from './env.js';
import { grantSignupCredits } from './credits.js';
import { revokeSessionActivity } from './sessionRevocation.js';

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
// Light theme tokens from packages/design: --blue, --paper, --ink, --ink-muted, --ink-subtle.
const renderEmailLayout = (origin: string, bodyContent: string) => `
  <div style="max-width:480px;margin:0 auto;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;background-color:#f5f6f8;">
    <!-- Header -->
    <div style="text-align:center;margin-bottom:28px;">
      <img src="${origin}/logo.png" width="40" height="40" alt="" style="display:block;margin:0 auto 10px;border-radius:8px;" />
      <div style="font-size:20px;font-weight:600;color:#1c2840;">筑表师</div>
    </div>

    <!-- Card -->
    <div style="background-color:#FFFFFF;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
      ${bodyContent}
    </div>

    <!-- Footer -->
    <div style="text-align:center;margin-top:24px;color:#5a6680;font-size:12px;line-height:1.5;">
      此邮件由 筑表师 (DDLBuilder) 自动发送，请勿直接回复。
    </div>
  </div>
`;

const renderVerificationEmail = (origin: string, otp: string) => {
  return {
    subject: '验证你的筑表师账号',
    html: renderEmailLayout(
      origin,
      `
      <p style="margin:0 0 24px;color:#3f4c66;font-size:15px;line-height:1.6;">
        请在筑表师中输入以下六位验证码，完成邮箱验证。
      </p>
      <p style="margin:0 0 24px;text-align:center;font-family:monospace;font-size:32px;font-weight:600;letter-spacing:8px;color:#1c2840;">
        ${escapeHtml(otp)}
      </p>
      <p style="margin:0;color:#5a6680;font-size:13px;line-height:1.5;">
        验证码 10 分钟内有效，请勿分享给他人。如果你没有发起此请求，请忽略此邮件。
      </p>
    `,
    ),
    text: `你的筑表师邮箱验证码是：${otp}。请在网站中输入，10 分钟内有效。请勿分享给他人。如果你没有发起此请求，请忽略此邮件。`,
  };
};

const renderResetPasswordEmail = (origin: string, url: string, name: string) => {
  const escapedName = escapeHtml(name);
  const escapedUrl = escapeHtml(url);

  return {
    subject: '重置你的筑表师密码',
    html: renderEmailLayout(
      origin,
      `
      <p style="margin:0 0 16px;color:#1c2840;font-size:15px;line-height:1.6;">
        ${escapedName}，你好：
      </p>
      <p style="margin:0 0 24px;color:#3f4c66;font-size:15px;line-height:1.6;">
        我们收到了你的密码重置请求。请点击下面的按钮设置新密码。
      </p>
      <p style="margin:0 0 24px;">
        <a href="${escapedUrl}" style="display:inline-block;padding:12px 24px;border-radius:8px;background-color:#2f5bb7;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;">
          重置密码
        </a>
      </p>
      <p style="margin:0 0 8px;color:#5a6680;font-size:13px;line-height:1.5;">
        如果按钮无法点击，请复制以下链接到浏览器：
      </p>
      <p style="margin:0;word-break:break-all;">
        <a href="${escapedUrl}" style="color:#2f5bb7;text-decoration:none;font-size:13px;">${escapedUrl}</a>
      </p>
      <p style="margin:16px 0 0;color:#5a6680;font-size:12px;line-height:1.5;">
        如果你没有发起此请求，请忽略此邮件，你的密码不会改变。
      </p>
    `,
    ),
    text: `${name}，请打开这个链接重置密码：${url}`,
  };
};

// Endpoints that delete every session of the user through deleteUserSessions.
const USER_SESSION_SWEEP_PATHS = new Set([
  '/reset-password',
  '/change-password',
  '/revoke-sessions',
  '/delete-user',
  '/delete-user/callback',
]);
const sweptContexts = new WeakSet<object>();

const buildBetterAuth = (env: ApiEnv['Bindings']) => {
  const config = getUserSystemConfig(env);
  const db = drizzle(env.USER_DB);
  const authBaseUrl = new URL(config.betterAuthUrl);

  const trustedOrigins = new Set([
    authBaseUrl.origin,
    ...parseAllowedOrigins(env.CORS_ALLOWED_ORIGINS),
  ]);

  return betterAuth({
    rateLimit: { enabled: false },
    disabledPaths: [
      // The native send-verification-email endpoint retains verified-account checks.
      '/email-otp/send-verification-otp',
      '/sign-in/email-otp',
      '/email-otp/check-verification-otp',
      '/email-otp/request-password-reset',
      '/email-otp/reset-password',
      '/forget-password/email-otp',
      '/email-otp/request-email-change',
      '/email-otp/change-email',
    ],
    plugins: [
      emailOTP({
        overrideDefaultEmailVerification: true,
        otpLength: 6,
        expiresIn: 600,
        allowedAttempts: 3,
        storeOTP: 'hashed',
        sendVerificationOTP: async ({ email, otp }) => {
          await sendEmail(env, { to: email, ...renderVerificationEmail(authBaseUrl.origin, otp) });
        },
      }),
    ],
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

        const content = renderResetPasswordEmail(
          authBaseUrl.origin,
          normalizedUrl,
          user.name || user.email,
        );

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
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            try {
              await grantSignupCredits(env, { userId: user.id, email: user.email });
            } catch (error) {
              console.error('[credits] signup grant deferred', { userId: user.id, error });
            }
          },
        },
      },
      session: {
        delete: {
          after: async (session, context) => {
            // Direct adapter calls (revokeUserSessions) kick the whole user themselves.
            if (!context) return;

            const sweepsUserSessions = USER_SESSION_SWEEP_PATHS.has(context.path);

            if (sweepsUserSessions) {
              if (sweptContexts.has(context)) return;
              sweptContexts.add(context);
            }

            try {
              await revokeSessionActivity(env, {
                userId: session.userId,
                ...(sweepsUserSessions ? {} : { sessionId: session.id }),
              });
            } catch (error) {
              console.error('[auth] session socket revocation failed', {
                userId: session.userId,
                error,
              });
            }
          },
        },
      },
    },
  });
};

// Request handlers receive a per-request copy of env (it carries the request logger), so the
// isolate-stable D1 binding is the cache key; buildBetterAuth must not read request-scoped fields.
const authInstances = new WeakMap<D1Database, ReturnType<typeof buildBetterAuth>>();

export const createBetterAuth = (env: ApiEnv['Bindings']) => {
  let auth = authInstances.get(env.USER_DB);

  if (!auth) {
    auth = buildBetterAuth(env);
    authInstances.set(env.USER_DB, auth);
  }

  return auth;
};
