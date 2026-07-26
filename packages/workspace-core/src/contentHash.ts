const serializeCanonicalValue = (value: unknown): string => {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }

  if (typeof value === 'bigint') return `bigint:${value.toString()}`;
  if (typeof value === 'symbol') return `symbol:${value.description ?? ''}`;
  if (typeof value === 'function') return 'function';

  if (Array.isArray(value)) {
    return `[${value.map((item) => serializeCanonicalValue(item)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${serializeCanonicalValue(record[key])}`)
    .join(',')}}`;
};

export const buildWorkspaceContentHash = async (payload: unknown) => {
  const bytes = new TextEncoder().encode(serializeCanonicalValue(payload));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')}`;
};
