const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

function toBooleanFlag(value: string | boolean | undefined): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    return false;
  }

  return TRUE_VALUES.has(value.trim().toLowerCase());
}

export const isCnyFireworksEnabled = toBooleanFlag(
  import.meta.env.VITE_ENABLE_CNY_FIREWORKS,
);

export { toBooleanFlag };
