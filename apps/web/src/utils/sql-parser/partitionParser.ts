import type { MysqlPartitionConfig, MysqlPartitionType } from '@ddlbuilder/shared-types';

export const PARTITION_BY_REGEX = /\bPARTITION\s+BY\b/i;

const MYSQL_PARTITION_TYPES: MysqlPartitionType[] = [
  'RANGE COLUMNS',
  'LIST COLUMNS',
  'RANGE',
  'LIST',
  'HASH',
  'KEY',
];
const DEFAULT_PARTITION_COUNT = 4;

function normalizePartitionType(rawType: string): MysqlPartitionType | null {
  const normalized = rawType.toUpperCase().replace(/\s+/g, ' ').trim();
  return MYSQL_PARTITION_TYPES.find((type) => type === normalized) ?? null;
}

function parseBalancedSegment(
  text: string,
  openParenIndex: number,
): { content: string; closeParenIndex: number } | null {
  if (openParenIndex < 0 || text[openParenIndex] !== '(') {
    return null;
  }

  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;

  for (let i = openParenIndex; i < text.length; i++) {
    const char = text[i];
    const prevChar = i > 0 ? text[i - 1] : '';
    const escaped = prevChar === '\\';

    if (!escaped) {
      if (!inDoubleQuote && !inBacktick && char === "'") {
        inSingleQuote = !inSingleQuote;
      } else if (!inSingleQuote && !inBacktick && char === '"') {
        inDoubleQuote = !inDoubleQuote;
      } else if (!inSingleQuote && !inDoubleQuote && char === '`') {
        inBacktick = !inBacktick;
      }
    }

    if (inSingleQuote || inDoubleQuote || inBacktick) {
      continue;
    }

    if (char === '(') {
      depth++;
    } else if (char === ')') {
      depth--;
      if (depth === 0) {
        return {
          content: text.slice(openParenIndex + 1, i).trim(),
          closeParenIndex: i,
        };
      }
    }
  }

  return null;
}

function splitTopLevelByComma(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;
  let current = '';

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    const prevChar = i > 0 ? input[i - 1] : '';
    const escaped = prevChar === '\\';

    if (!escaped) {
      if (!inDoubleQuote && !inBacktick && char === "'") {
        inSingleQuote = !inSingleQuote;
      } else if (!inSingleQuote && !inBacktick && char === '"') {
        inDoubleQuote = !inDoubleQuote;
      } else if (!inSingleQuote && !inDoubleQuote && char === '`') {
        inBacktick = !inBacktick;
      }
    }

    if (!inSingleQuote && !inDoubleQuote && !inBacktick) {
      if (char === '(') {
        depth++;
      } else if (char === ')' && depth > 0) {
        depth--;
      }

      if (char === ',' && depth === 0) {
        const token = current.trim();
        if (token) {
          parts.push(token);
        }
        current = '';
        continue;
      }
    }

    current += char;
  }

  const tail = current.trim();
  if (tail) {
    parts.push(tail);
  }

  return parts;
}

function unwrapIdentifier(token: string): string {
  const trimmed = token.trim();
  return trimmed.replace(/^`([^`]+)`$/, '$1').replace(/^"([^"]+)"$/, '$1');
}

function resolvePartitionKey(partitionKey: string): {
  columns: string[];
  expression?: string;
} {
  const keyText = partitionKey.trim();
  if (!keyText) {
    return { columns: [] };
  }

  const parts = splitTopLevelByComma(keyText);
  const isSimpleIdentifierList =
    parts.length > 0 && parts.every((part) => /^`?[\w.$]+`?$/i.test(part.trim()));

  if (!isSimpleIdentifierList) {
    return { columns: [], expression: keyText };
  }

  return {
    columns: parts.map(unwrapIdentifier).filter(Boolean),
  };
}

function parsePartitionDefinitions(definitionsText: string, partitionType: MysqlPartitionType) {
  if (!definitionsText.trim()) return [];

  const partitions: Array<{ name: string; value: string }> = [];
  const valuePattern =
    partitionType === 'RANGE' || partitionType === 'RANGE COLUMNS'
      ? /PARTITION\s+([`"\w]+)\s+VALUES\s+LESS\s+THAN\s*\(([^)]*)\)/gi
      : /PARTITION\s+([`"\w]+)\s+VALUES\s+IN\s*\(([^)]*)\)/gi;

  let match = valuePattern.exec(definitionsText);
  while (match !== null) {
    partitions.push({
      name: unwrapIdentifier(match[1]),
      value: match[2].trim(),
    });
    match = valuePattern.exec(definitionsText);
  }

  return partitions;
}

function extractPartitionClause(sql: string): string {
  const partitionMatch = PARTITION_BY_REGEX.exec(sql);
  if (!partitionMatch) return '';

  const start = partitionMatch.index;
  const fromPartition = sql.slice(start);
  const semicolonIndex = fromPartition.indexOf(';');
  if (semicolonIndex === -1) return fromPartition.trim();
  return fromPartition.slice(0, semicolonIndex).trim();
}

export function extractPartitionConfig(sql: string): MysqlPartitionConfig | undefined {
  const partitionClause = extractPartitionClause(sql);
  if (!partitionClause) return undefined;

  const typeMatch = partitionClause.match(
    /^PARTITION\s+BY\s+(RANGE\s+COLUMNS|LIST\s+COLUMNS|RANGE|LIST|HASH|KEY)\b/i,
  );
  if (!typeMatch) return undefined;

  const type = normalizePartitionType(typeMatch[1]);
  if (!type) return undefined;

  const keyOpenParenIndex = partitionClause.indexOf('(', typeMatch[0].length);
  const keySegment = parseBalancedSegment(partitionClause, keyOpenParenIndex);
  if (!keySegment) return undefined;

  const key = resolvePartitionKey(keySegment.content);
  const config: MysqlPartitionConfig = {
    enabled: true,
    type,
    columns: key.columns,
    partitionCount: DEFAULT_PARTITION_COUNT,
    partitions: [],
    expression: key.expression,
  };

  const tail = partitionClause.slice(keySegment.closeParenIndex + 1).trim();

  if (type === 'HASH' || type === 'KEY') {
    const partitionCountMatch = tail.match(/\bPARTITIONS\s+(\d+)\b/i);
    if (partitionCountMatch) {
      config.partitionCount = Math.max(1, Number(partitionCountMatch[1]));
    }
    return config;
  }

  const definitionOpenParenIndex = tail.indexOf('(');
  if (definitionOpenParenIndex === -1) {
    return config;
  }

  const definitions = parseBalancedSegment(tail, definitionOpenParenIndex);
  if (!definitions) {
    return config;
  }

  config.partitions = parsePartitionDefinitions(definitions.content, type);
  return config;
}
