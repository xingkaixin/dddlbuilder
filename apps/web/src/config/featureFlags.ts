const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

function toBooleanFlag(value: string | boolean | undefined): boolean {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- this boundary value requires a runtime representation check.
  if (typeof value === 'boolean') {
    return value;
  }

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- this boundary value requires a runtime representation check.
  if (typeof value !== 'string') {
    return false;
  }

  return TRUE_VALUES.has(value.trim().toLowerCase());
}

export const isCnyFireworksEnabled = toBooleanFlag(import.meta.env.VITE_ENABLE_CNY_FIREWORKS);

export const isAiStreamDebugEnabled = toBooleanFlag(
  // SAFETY: the environment flag is checked against the known boolean feature flag shape.
  (import.meta.env as Record<string, string | boolean | undefined>).VITE_ENABLE_AI_STREAM_DEBUG,
);

export { toBooleanFlag };
