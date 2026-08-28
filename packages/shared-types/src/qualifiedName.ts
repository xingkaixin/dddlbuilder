export const splitQualifiedName = (raw: string) =>
  (raw.match(/(?:"(?:[^"]|"")*"|`(?:[^`]|``)*`|\[(?:[^\]]|\]\])*\]|[^.])+/g) ?? [])
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

export const getSchemaAndTable = (raw: string) => {
  const parts = splitQualifiedName(raw);
  if (parts.length <= 1) {
    const table = parts[0] ?? raw.trim();
    return { schema: '', table };
  }
  return {
    schema: parts.slice(0, -1).join('.'),
    table: parts[parts.length - 1],
  };
};
