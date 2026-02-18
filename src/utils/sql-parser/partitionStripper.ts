const CREATE_TABLE_REGEX = /^\s*CREATE\s+TABLE\b/i;
const STATEMENT_START_REGEX =
  /^\s*(CREATE|ALTER|DROP|TRUNCATE|RENAME|GRANT|COMMENT)\b/i;

function updateParenthesesDepth(line: string, initialDepth: number): number {
  let depth = initialDepth;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const prevChar = i > 0 ? line[i - 1] : '';
    const escaped = prevChar === '\\';

    if (!escaped) {
      if (!inDoubleQuote && !inBacktick && char === "'") {
        inSingleQuote = !inSingleQuote;
        continue;
      }
      if (!inSingleQuote && !inBacktick && char === '"') {
        inDoubleQuote = !inDoubleQuote;
        continue;
      }
      if (!inSingleQuote && !inDoubleQuote && char === '`') {
        inBacktick = !inBacktick;
        continue;
      }
    }

    if (inSingleQuote || inDoubleQuote || inBacktick) {
      continue;
    }

    if (char === '(') {
      depth++;
    } else if (char === ')' && depth > 0) {
      depth--;
    }
  }

  return depth;
}

export function stripPartitionClauses(sql: string): string {
  const lines = sql.split('\n');
  const cleanedLines: string[] = [];

  let inCreateTable = false;
  let tableDefinitionClosed = false;
  let skippingPartitionClause = false;
  let parenthesesDepth = 0;

  const resetCreateTableState = () => {
    inCreateTable = false;
    tableDefinitionClosed = false;
    skippingPartitionClause = false;
    parenthesesDepth = 0;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (skippingPartitionClause) {
      const semicolonIndex = line.indexOf(';');
      if (semicolonIndex !== -1) {
        cleanedLines.push(';');
        const tail = line.slice(semicolonIndex + 1).trim();
        resetCreateTableState();
        if (tail) {
          cleanedLines.push(tail);
        }
        continue;
      }

      if (STATEMENT_START_REGEX.test(line)) {
        resetCreateTableState();
      } else {
        continue;
      }
    }

    if (!inCreateTable && CREATE_TABLE_REGEX.test(line)) {
      inCreateTable = true;
    }

    let lineToKeep = line;
    let skipCurrentLine = false;

    if (inCreateTable) {
      const previousDepth = parenthesesDepth;
      parenthesesDepth = updateParenthesesDepth(line, parenthesesDepth);
      if (previousDepth > 0 && parenthesesDepth === 0) {
        tableDefinitionClosed = true;
      }

      if (tableDefinitionClosed) {
        const partitionMatch = /\bPARTITION\s+BY\b/i.exec(line);
        if (partitionMatch) {
          const beforePartition = line.slice(0, partitionMatch.index).trimEnd();
          const afterPartition = line.slice(partitionMatch.index);
          const semicolonIndex = afterPartition.indexOf(';');

          if (semicolonIndex !== -1) {
            lineToKeep = beforePartition ? `${beforePartition};` : ';';
            const tail = afterPartition.slice(semicolonIndex + 1).trim();
            if (tail) {
              cleanedLines.push(lineToKeep);
              cleanedLines.push(tail);
              resetCreateTableState();
              continue;
            }
            resetCreateTableState();
          } else {
            lineToKeep = beforePartition;
            if (!lineToKeep) {
              skipCurrentLine = true;
            }
            skippingPartitionClause = true;
          }
        }
      }

      if (
        tableDefinitionClosed &&
        !skippingPartitionClause &&
        /;\s*$/.test(lineToKeep)
      ) {
        resetCreateTableState();
      }
    }

    if (!skipCurrentLine) {
      cleanedLines.push(lineToKeep);
    }
  }

  return cleanedLines.join('\n');
}
