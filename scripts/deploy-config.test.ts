import { describe, expect, it } from 'vitest';
import { assertAIUsageCronConfigured } from './deploy-config.js';

describe('deploy config', () => {
  it('accepts the AI usage recovery cron', () => {
    expect(() =>
      assertAIUsageCronConfigured(
        'name = "worker"\n\n[triggers]\ncrons = ["*/10 * * * *"]\n\n[vars]\nA = "1"\n',
        'wrangler.toml',
      ),
    ).not.toThrow();
  });

  it('accepts the AI usage recovery cron alongside other schedules', () => {
    expect(() =>
      assertAIUsageCronConfigured(
        '[triggers]\ncrons = ["0 0 * * *", "*/10 * * * *", "0 0 1 1 *"]\n',
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
    '[triggers]\ncrons = ["0 0 1 1 *"]\n',
    '[triggers]\ncrons = ["0 0 * * *"]\n',
    '[triggers]\ncrons = ["*/30 * * * *"]\n',
  ])('rejects a missing AI recovery cron', (config) => {
    expect(() => assertAIUsageCronConfigured(config, 'wrangler.toml')).toThrow(
      'wrangler.toml must include "*/10 * * * *" in [triggers].crons for AI usage recovery',
    );
  });
});
