import { describe, expect, it } from 'vitest';
import { assertAIUsageCronConfigured } from './deploy-config.js';

describe('deploy config', () => {
  it('accepts a configured Worker cron', () => {
    expect(() =>
      assertAIUsageCronConfigured(
        'name = "worker"\n\n[triggers]\ncrons = ["*/10 * * * *"]\n\n[vars]\nA = "1"\n',
        'wrangler.toml',
      ),
    ).not.toThrow();
  });

  it.each([
    'name = "worker"\n',
    '[triggers]\ncrons = []\n',
    '[triggers]\n# crons = ["*/10 * * * *"]\n',
    '[triggers]\ncrons = [\n  # "*/10 * * * *"\n]\n',
    '[triggers]\ncrons = ["   "]\n',
  ])('rejects a missing AI recovery cron', (config) => {
    expect(() => assertAIUsageCronConfigured(config, 'wrangler.toml')).toThrow(
      'wrangler.toml must configure a non-empty [triggers].crons schedule',
    );
  });
});
