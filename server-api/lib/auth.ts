import { createRemoteJWKSet, jwtVerify, errors, type JWTPayload } from 'jose';
import type { Context } from 'hono';
import type { ApiEnv } from './context.js';
import { getUserSystemConfig } from './userSystemConfig.js';

export type SupabaseJwtClaims = JWTPayload & {
  sub: string;
  email?: string;
};

export type AuthenticatedAppUser = {
  appUserId: string;
  externalUserId: string;
  email: string;
  status: string;
};

type VerifyTokenFn = (token: string, env: ApiEnv['Bindings']) => Promise<SupabaseJwtClaims>;

type AppUserRow = {
  userId: string;
  status: string;
  primaryEmail: string;
};

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

const getRemoteJwks = (jwksUrl: string) => {
  let cached = jwksCache.get(jwksUrl);
  if (!cached) {
    cached = createRemoteJWKSet(new URL(jwksUrl));
    jwksCache.set(jwksUrl, cached);
  }
  return cached;
};

export const buildAppUserId = (provider: string, externalUserId: string) =>
  `${provider}_${externalUserId}`;

export const readBearerToken = (c: Context<ApiEnv>): string | null => {
  const authorization = c.req.header('authorization');
  if (!authorization) return null;
  const [scheme, token] = authorization.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== 'bearer' || !token?.trim()) {
    return null;
  }
  return token.trim();
};

export const verifySupabaseJwt: VerifyTokenFn = async (token, env) => {
  const config = getUserSystemConfig(env);
  const { payload } = await jwtVerify(token, getRemoteJwks(config.supabaseJwksUrl), {
    issuer: `${config.supabaseUrl}/auth/v1`,
    audience: 'authenticated',
  });

  if (typeof payload.sub !== 'string' || payload.sub.trim().length === 0) {
    throw new Error('JWT subject missing');
  }

  return payload as SupabaseJwtClaims;
};

const findUserByIdentity = async (
  env: ApiEnv['Bindings'],
  provider: string,
  externalUserId: string,
): Promise<AppUserRow | null> => {
  const row = await env.USER_DB.prepare(
    `
      SELECT
        users.id AS userId,
        users.status AS status,
        users.primary_email AS primaryEmail
      FROM user_identities
      INNER JOIN users ON users.id = user_identities.user_id
      WHERE user_identities.provider = ?
        AND user_identities.provider_user_id = ?
      LIMIT 1
    `,
  )
    .bind(provider, externalUserId)
    .first<AppUserRow>();

  return row ?? null;
};

const ensureUserExists = async (
  env: ApiEnv['Bindings'],
  claims: SupabaseJwtClaims,
): Promise<AuthenticatedAppUser> => {
  const provider = 'supabase';
  const externalUserId = claims.sub;
  const existing = await findUserByIdentity(env, provider, externalUserId);
  if (existing) {
    return {
      appUserId: existing.userId,
      externalUserId,
      email: existing.primaryEmail,
      status: existing.status,
    };
  }

  const config = getUserSystemConfig(env);
  const appUserId = buildAppUserId(provider, externalUserId);
  const email = typeof claims.email === 'string' && claims.email.trim() ? claims.email.trim() : '';

  await env.USER_DB.batch([
    env.USER_DB.prepare(
      `
        INSERT OR IGNORE INTO users (id, status, primary_email)
        VALUES (?, 'active', ?)
      `,
    ).bind(appUserId, email || `${externalUserId}@supabase.local`),
    env.USER_DB.prepare(
      `
        INSERT OR IGNORE INTO user_identities (
          id,
          user_id,
          provider,
          provider_user_id,
          provider_email
        )
        VALUES (?, ?, ?, ?, ?)
      `,
    ).bind(`${provider}:${externalUserId}`, appUserId, provider, externalUserId, email || null),
    env.USER_DB.prepare(
      `
        INSERT OR IGNORE INTO credit_accounts (user_id, balance, version)
        VALUES (?, ?, 1)
      `,
    ).bind(appUserId, config.signupBonusCredits),
    env.USER_DB.prepare(
      `
        INSERT OR IGNORE INTO credit_ledger (
          id,
          user_id,
          kind,
          source,
          amount,
          balance_after,
          idempotency_key,
          metadata_json
        )
        VALUES (?, ?, 'grant', 'signup_bonus', ?, ?, ?, ?)
      `,
    ).bind(
      `signup_bonus:${appUserId}`,
      appUserId,
      config.signupBonusCredits,
      config.signupBonusCredits,
      `signup_bonus:${appUserId}`,
      JSON.stringify({ provider }),
    ),
  ]);

  const created = await findUserByIdentity(env, provider, externalUserId);
  if (!created) {
    throw new Error('Failed to resolve app user');
  }

  return {
    appUserId: created.userId,
    externalUserId,
    email: created.primaryEmail,
    status: created.status,
  };
};

export const authenticateAccessToken = async (
  env: ApiEnv['Bindings'],
  token: string,
  verifyToken: VerifyTokenFn = verifySupabaseJwt,
): Promise<AuthenticatedAppUser> => {
  const claims = await verifyToken(token, env);
  const user = await ensureUserExists(env, claims);
  if (user.status !== 'active') {
    throw new Error('USER_DISABLED');
  }
  return user;
};

export const isInvalidJwtError = (error: unknown) =>
  error instanceof errors.JWTInvalid ||
  error instanceof errors.JWTExpired ||
  error instanceof errors.JWSSignatureVerificationFailed ||
  error instanceof errors.JOSEError;
