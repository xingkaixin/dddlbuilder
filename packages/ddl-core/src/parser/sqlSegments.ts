interface SqlScanOptions {
  backslashEscapes?: boolean;
}

function* sqlSegments(sql: string, { backslashEscapes = true }: SqlScanOptions = {}) {
  const tokens = /[eE]'|'|"|`|\[|--|\/\*|\$(?:[\p{L}_][\p{L}\p{N}_]*)?\$/gu;
  let offset = 0;
  for (let match = tokens.exec(sql); match; match = tokens.exec(sql)) {
    const token = match[0];
    let end = tokens.lastIndex;
    let closed = true;
    if (token === '--') {
      while (end < sql.length && !'\r\n'.includes(sql[end])) end++;
    } else if (token === '/*') {
      let depth = 1;
      while (end < sql.length && depth > 0) {
        const pair = sql.slice(end, end + 2);
        if (pair === '/*' || pair === '*/') {
          depth += pair === '/*' ? 1 : -1;
          end += 2;
        } else end++;
      }
    } else if (token.startsWith('$')) {
      const closing = sql.indexOf(token, end);
      end = closing < 0 ? sql.length : closing + token.length;
    } else {
      const quote = token === '[' ? ']' : token.at(-1);
      closed = false;
      while (end < sql.length) {
        const char = sql[end++];
        if (char === '\\' && (backslashEscapes || token.length === 2))
          end = Math.min(end + 1, sql.length);
        else if (char === quote) {
          if (sql[end] !== quote) {
            closed = true;
            break;
          }
          end++;
        }
      }
    }
    yield { text: sql.slice(offset, match.index), code: true, token: '', closed: true };
    yield { text: sql.slice(match.index, end), code: false, token, closed };
    offset = end;
    tokens.lastIndex = end;
  }
  yield { text: sql.slice(offset), code: true, token: '', closed: true };
}

export const mapSqlCode = (
  sql: string,
  transform: (code: string) => string,
  options?: SqlScanOptions,
) =>
  Array.from(sqlSegments(sql, options), ({ text, code }) => (code ? transform(text) : text)).join(
    '',
  );

export const mapDoubleQuotedSqlIdentifiers = (
  sql: string,
  transform: (identifier: string) => string,
) =>
  Array.from(sqlSegments(sql), ({ text, code, token, closed }) =>
    !code && token === '"' && closed ? transform(text) : text,
  ).join('');

export const splitSqlStatements = (sql: string, options?: SqlScanOptions): string[] => {
  const statements: string[] = [];
  let current = '';
  for (const segment of sqlSegments(sql, options)) {
    const parts = segment.code ? segment.text.split(';') : [segment.text];
    for (let index = 0; index < parts.length; index++) {
      current += parts[index];
      if (index < parts.length - 1) {
        statements.push(current + ';');
        current = '';
      }
    }
  }
  if (current.trim()) statements.push(current);
  return statements;
};
