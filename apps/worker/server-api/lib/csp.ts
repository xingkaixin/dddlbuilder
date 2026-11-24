import type { Context } from 'hono';
import type { ApiEnv } from './context.js';
import { readEnvBool } from './env.js';

export type CspMode = 'off' | 'report-only' | 'enforce' | 'both';

export const DEFAULT_CSP_POLICY =
  "default-src 'self'; script-src 'self' https://umami.xingkaixin.me; style-src 'self' 'unsafe-inline' https://cdn-font.hyperos.mi.com https://fonts.googleapis.cn; font-src 'self' data: https://cdn-file.hyperos.mi.com https://fonts.gstatic.cn; img-src 'self' data: blob: https:; connect-src 'self' https://umami.xingkaixin.me; frame-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'";

export const API_CSP_POLICY = "default-src 'none'; connect-src 'self'; frame-ancestors 'none'";

const normalizeMode = (raw: string | undefined): CspMode => {
  const value = raw?.trim().toLowerCase();

  if (value === 'off') return 'off';
  if (value === 'report-only') return 'report-only';
  if (value === 'enforce') return 'enforce';
  if (value === 'both') return 'both';

  return 'both';
};

export type ResolvedCspConfig = {
  enabled: boolean;
  mode: CspMode;
  policy: string;
};

export const resolveCspConfig = (env: ApiEnv['Bindings']): ResolvedCspConfig => {
  const enabled = readEnvBool(env.CSP_ENABLE, true);
  const mode = normalizeMode(env.CSP_MODE);
  const policyRaw = env.CSP_POLICY?.trim();
  const policy = policyRaw && policyRaw.length > 0 ? policyRaw : DEFAULT_CSP_POLICY;

  if (!enabled || mode === 'off') {
    return {
      enabled: false,
      mode: 'off',
      policy,
    };
  }

  return {
    enabled: true,
    mode,
    policy,
  };
};

export const applyCspHeaders = (c: Context<ApiEnv>) => {
  const config = resolveCspConfig(c.env);

  if (!config.enabled) {
    return;
  }

  const policy =
    c.req.path.startsWith('/api/') && !c.env.CSP_POLICY?.trim() ? API_CSP_POLICY : config.policy;

  if (config.mode === 'report-only' || config.mode === 'both') {
    c.header('Content-Security-Policy-Report-Only', policy);
  }

  if (config.mode === 'enforce' || config.mode === 'both') {
    c.header('Content-Security-Policy', policy);
  }
};
