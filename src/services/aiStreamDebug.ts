import { isAiStreamDebugEnabled } from '@/config/featureFlags';

const STORAGE_KEY = 'ddlbuilder:ai-stream-debug';
const LOG_PREFIX = '[AIStreamDebug]';

export type AiStreamDebugPayload = Record<string, unknown>;
type AiStreamDebugOptions = {
  force?: boolean;
};

const readLocalOverride = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

export const isAiStreamDebugActive = (force = false) =>
  force || isAiStreamDebugEnabled || readLocalOverride();

export const logAiStreamDebug = (
  event: string,
  payload: AiStreamDebugPayload = {},
  options: AiStreamDebugOptions = {},
) => {
  if (!isAiStreamDebugActive(options.force)) {
    return;
  }

  console.info(`${LOG_PREFIX} ${event}`, payload);
};
