import { describe, expect, it } from 'vitest';
import { triggers } from '@cloudflare/config';
import { getWorkerConfig } from '../apps/worker/cloudflare.config';
import { assertAIUsageCronConfigured, readWorkerConfig } from './deploy-config';

describe('deploy config', () => {
  it('preserves the recovery cron and Durable Object namespace in production', () => {
    const worker = readWorkerConfig('example');
    expect(() => assertAIUsageCronConfigured(worker)).not.toThrow();
    expect(worker.env.WORKSPACE_YDOC).toMatchObject({
      worker: 'ddlbuilder',
      exportName: 'WorkspaceYDocDurableObject',
    });
    expect(worker.exports.WorkspaceYDocDurableObject).toMatchObject({ storage: 'sqlite' });
    expect(worker.workersDev).toBe(false);
    expect(worker.previewUrls).toBe(false);
  });

  it.each([{ schedules: [] }, { schedules: [triggers.scheduled({ schedule: '*/30 * * * *' })] }])(
    'rejects a missing AI recovery cron',
    ({ schedules }) => {
      expect(() =>
        assertAIUsageCronConfigured({
          ...getWorkerConfig(),
          triggers: schedules,
        }),
      ).toThrow('must include "*/10 * * * *"');
    },
  );

  it('rejects unknown deployment modes instead of using local bindings', () => {
    expect(() => getWorkerConfig('prod')).toThrow('Unknown Cloudflare mode');
  });
});
