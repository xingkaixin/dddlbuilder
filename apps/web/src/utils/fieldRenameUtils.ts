function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function identifierTokenPattern(token: string) {
  const escapedToken = escapeRegExp(token);
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapedToken}(?=[^\\p{L}\\p{N}]|$)`, 'iu');
}

export function isSameIdentifierToken(a: string, b: string): boolean {
  return a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0;
}

export function containsSqlIdentifierToken(source: string, token: string): boolean {
  if (!source || !token) return false;
  const escapedToken = escapeRegExp(token);
  return new RegExp(`(^|[^\\p{L}\\p{N}_])${escapedToken}(?=[^\\p{L}\\p{N}_]|$)`, 'iu').test(source);
}

/**
 * 仅在“标识符边界”上替换字段名，避免误替换更长单词中的子串。
 */
export function replaceIdentifierToken(source: string, oldToken: string, newToken: string): string {
  if (!source || !oldToken || !newToken || oldToken === newToken) {
    return source;
  }

  const pattern = new RegExp(identifierTokenPattern(oldToken), 'giu');

  return source.replace(pattern, (_match, prefix: string) => {
    const safePrefix = typeof prefix === 'string' ? prefix : '';
    return `${safePrefix}${newToken}`;
  });
}
