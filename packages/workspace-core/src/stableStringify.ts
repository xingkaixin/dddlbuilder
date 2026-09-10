/* oxlint-disable anti-slop/no-runtime-typeof -- This serializer intentionally dispatches on the complete JavaScript value domain. */
/* oxlint-disable anti-slop/no-unknown-parameters -- Serialization accepts arbitrary JSON-like values by contract. */
/* oxlint-disable anti-slop/no-unsafe-dictionary-type -- The serializer's final record representation is intentionally open. */

export const stableStringify = (value: unknown): string => {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }

  if (typeof value === 'bigint') return `bigint:${value.toString()}`;
  if (typeof value === 'symbol') return `symbol:${value.description ?? ''}`;
  if (typeof value === 'function') return 'function';

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  // SAFETY: all remaining values are non-null non-array objects after primitive and array branches.
  const record = value as Record<string, unknown>;

  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
};
