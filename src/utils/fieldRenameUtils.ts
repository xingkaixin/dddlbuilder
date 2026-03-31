function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isSameIdentifierToken(a: string, b: string): boolean {
  return a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0;
}

/**
 * 仅在“标识符边界”上替换字段名，避免误替换更长单词中的子串。
 */
export function replaceIdentifierToken(source: string, oldToken: string, newToken: string): string {
  if (!source || !oldToken || !newToken || oldToken === newToken) {
    return source;
  }

  const escapedOldToken = escapeRegExp(oldToken);
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escapedOldToken}(?=[^\\p{L}\\p{N}]|$)`, 'giu');

  return source.replace(pattern, (match, prefix: string) => {
    const safePrefix = typeof prefix === 'string' ? prefix : '';
    return `${safePrefix}${newToken}`;
  });
}
