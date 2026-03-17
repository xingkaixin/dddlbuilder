import type { Context } from 'hono';
import type { ApiEnv } from './context.js';

export type CspMode = 'off' | 'report-only' | 'enforce' | 'both';

const DEFAULT_CSP_POLICY =
  "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.cn https://cdn-font.hyperos.mi.com; font-src 'self' data: https://fonts.gstatic.cn https://cdn-font.hyperos.mi.com; img-src 'self' data: blob: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

const readEnvBool = (value: string | undefined, fallback: boolean): boolean => {
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
};

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
  const policy =
    policyRaw && policyRaw.length > 0 ? policyRaw : DEFAULT_CSP_POLICY;

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

  if (config.mode === 'report-only' || config.mode === 'both') {
    c.header('Content-Security-Policy-Report-Only', config.policy);
  }

  if (config.mode === 'enforce' || config.mode === 'both') {
    c.header('Content-Security-Policy', config.policy);
  }
};
