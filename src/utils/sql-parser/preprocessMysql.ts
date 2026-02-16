export interface PreprocessMySqlResult {
  sql: string;
  indexes: string[];
  tableComment: string;
  columnComments: Record<string, string>;
}

export function preprocessMysql(sql: string): PreprocessMySqlResult {
  const result: PreprocessMySqlResult = {
    sql,
    indexes: [],
    tableComment: '',
    columnComments: {},
  };

  const hasPartition = /\bPARTITION\s+BY\b/i.test(sql);
  if (!hasPartition) {
    return result;
  }

  const lines = sql.split('\n');
  const cleanedLines: string[] = [];
  let parenthesesDepth = 0;
  let inTableDefinition = false;
  let foundCreateTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim().toUpperCase();

    if (trimmedLine.startsWith('CREATE TABLE')) {
      foundCreateTable = true;
      inTableDefinition = true;
      cleanedLines.push(line);
      continue;
    }

    if (foundCreateTable && inTableDefinition) {
      // 检查这一行是否包含闭合括号（表定义的结束）
      let lineToAdd = line;
      let hasClosingParen = false;

      for (const char of line) {
        if (char === '(') {
          parenthesesDepth++;
        } else if (char === ')') {
          parenthesesDepth--;
          if (parenthesesDepth === 0) {
            hasClosingParen = true;
          }
        }
      }

      if (hasClosingParen) {
        // 找到闭合括号，只保留到右括号为止的内容
        const parenIndex = line.lastIndexOf(')');
        if (parenIndex !== -1) {
          lineToAdd = line.substring(0, parenIndex + 1);
        }
        cleanedLines.push(lineToAdd);
        inTableDefinition = false;
      } else {
        cleanedLines.push(line);
      }
    }
  }

  let cleanedSql = cleanedLines.join('\n').trim();
  if (!cleanedSql) {
    return result;
  }

  // 确保 SQL 以分号结尾
  if (!cleanedSql.endsWith(';')) {
    cleanedSql += ';';
  }

  const tableCommentMatch = cleanedSql.match(/COMMENT\s*=\s*['"]([^'"]*)['"]/i);
  if (tableCommentMatch) {
    result.tableComment = tableCommentMatch[1];
  }

  const columnCommentRegex =
    /(\w+)\s+[\w()]+(?:\([^)]*\))?\s*(?:NULL|NOT NULL)?\s*(?:DEFAULT\s*[^,]*)?\s*(?:COMMENT\s*['"]([^'"]*)['"])?/gi;
  const columnMatches = [...cleanedSql.matchAll(columnCommentRegex)];
  for (const match of columnMatches) {
    if (match[2]) {
      result.columnComments[match[1]] = match[2];
    }
  }

  const standaloneIndexRegex =
    /CREATE\s+(UNIQUE\s+)?INDEX\s+(\w+)\s+ON\s+\w+\s*\(([^;]+)\);?/gi;
  const standaloneMatches = [...sql.matchAll(standaloneIndexRegex)];
  for (const match of standaloneMatches) {
    result.indexes.push(match[0]);
  }

  const alterIndexRegex =
    /ALTER\s+TABLE\s+\w+\s+ADD\s+(PRIMARY\s+KEY|UNIQUE\s+\w+|INDEX\s+\w+|CONSTRAINT\s+\w+\s+(PRIMARY\s+KEY|UNIQUE\s+\w+))?\s*\(([^;]+)\);?/gi;
  const alterMatches = [...sql.matchAll(alterIndexRegex)];
  for (const match of alterMatches) {
    result.indexes.push(match[0]);
  }

  result.sql = cleanedSql;
  return result;
}
