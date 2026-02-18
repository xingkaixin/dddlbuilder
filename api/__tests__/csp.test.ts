import { afterEach, describe, expect, it } from 'vitest';
import app from '../index';

const ORIGINAL_ENV = {
  CSP_ENABLE: process.env.CSP_ENABLE,
  CSP_MODE: process.env.CSP_MODE,
  CSP_POLICY: process.env.CSP_POLICY,
};

afterEach(() => {
  process.env.CSP_ENABLE = ORIGINAL_ENV.CSP_ENABLE;
  process.env.CSP_MODE = ORIGINAL_ENV.CSP_MODE;
  process.env.CSP_POLICY = ORIGINAL_ENV.CSP_POLICY;
});

describe('csp headers', () => {
  it('CSP_MODE=report-only 时仅返回 Report-Only 头', async () => {
    process.env.CSP_ENABLE = 'true';
    process.env.CSP_MODE = 'report-only';

    const response = await app.request('/api/health');
    expect(
      response.headers.get('content-security-policy-report-only'),
    ).toBeTruthy();
    expect(response.headers.get('content-security-policy')).toBeNull();
  });

  it('CSP_MODE=enforce 时仅返回 enforce 头', async () => {
    process.env.CSP_ENABLE = 'true';
    process.env.CSP_MODE = 'enforce';

    const response = await app.request('/api/health');
    expect(response.headers.get('content-security-policy')).toBeTruthy();
    expect(
      response.headers.get('content-security-policy-report-only'),
    ).toBeNull();
  });

  it('CSP_MODE=both 时返回两种头', async () => {
    process.env.CSP_ENABLE = 'true';
    process.env.CSP_MODE = 'both';

    const response = await app.request('/api/health');
    expect(response.headers.get('content-security-policy')).toBeTruthy();
    expect(
      response.headers.get('content-security-policy-report-only'),
    ).toBeTruthy();
  });

  it('CSP_ENABLE=false 时不返回 CSP 头', async () => {
    process.env.CSP_ENABLE = 'false';
    process.env.CSP_MODE = 'both';

    const response = await app.request('/api/health');
    expect(response.headers.get('content-security-policy')).toBeNull();
    expect(
      response.headers.get('content-security-policy-report-only'),
    ).toBeNull();
  });
});
