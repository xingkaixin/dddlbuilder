/* oxlint-disable anti-slop/no-runtime-typeof -- This serializer intentionally dispatches on the complete JavaScript value domain. */
/* oxlint-disable anti-slop/no-unknown-parameters -- Serialization accepts arbitrary JSON-like values by contract. */

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

  return `{${Object.entries(value)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .flatMap(([key, entryValue]) =>
      entryValue === undefined ? [] : [`${JSON.stringify(key)}:${stableStringify(entryValue)}`],
    )
    .join(',')}}`;
};
