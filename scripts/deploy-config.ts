import { InputConfigSchema } from '@cloudflare/config';
import { getWorkerConfig } from '../apps/worker/cloudflare.config';

const AI_USAGE_RECOVERY_CRON = '*/10 * * * *';

export const assertAIUsageCronConfigured = (worker: ReturnType<typeof getWorkerConfig>) => {
  if (!worker.triggers.some((trigger) => trigger.schedule === AI_USAGE_RECOVERY_CRON)) {
    throw new Error(`Worker must include "${AI_USAGE_RECOVERY_CRON}" for AI usage recovery`);
  }
};

export const readWorkerConfig = (mode: string) => {
  const worker = getWorkerConfig(mode);
  const result = InputConfigSchema.safeParse({ worker });

  if (!result.success) {
    throw new Error(`Invalid Worker configuration (${mode}): ${result.error.message}`);
  }

  if (mode !== 'e2e') assertAIUsageCronConfigured(worker);

  return worker;
};
