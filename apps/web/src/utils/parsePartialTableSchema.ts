import {
  isGeneratedField,
  isGeneratedIndex,
  isGeneratedDesignDecision,
  type PartialTableSchema,
} from '@ddlbuilder/shared-types/ai-generate';

// oxlint-disable anti-slop/no-unsafe-dictionary-type, anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof

export function parsePartialTableSchema(text: string): PartialTableSchema | null {
  if (!text || text.trim().length === 0) {
    return null;
  }

  try {
    const result = JSON.parse(text);

    return normalizeTableSchema(result);
  } catch {}

  const result: PartialTableSchema = {};

  const tableNameMatch = text.match(/"tableName"\s*:\s*"((?:[^"\\]|\\.)*)"/);

  if (tableNameMatch) {
    result.tableName = unescapeJsonString(tableNameMatch[1]);
  }

  const schemaNameMatch = text.match(/"schemaName"\s*:\s*"((?:[^"\\]|\\.)*)"/);

  if (schemaNameMatch) {
    result.schemaName = unescapeJsonString(schemaNameMatch[1]);
  }

  const tableCommentMatch = text.match(/"tableComment"\s*:\s*"((?:[^"\\]|\\.)*)"/);

  if (tableCommentMatch) {
    result.tableComment = unescapeJsonString(tableCommentMatch[1]);
  }

  result.fields = extractValidatedArray(text, 'fields', isGeneratedField);
  result.indexes = extractValidatedArray(text, 'indexes', isGeneratedIndex);
  result.designDecisions = extractValidatedArray(
    text,
    'designDecisions',
    isGeneratedDesignDecision,
  );

  if (
    result.tableName === undefined &&
    result.tableComment === undefined &&
    result.fields === undefined &&
    result.indexes === undefined &&
    result.designDecisions === undefined
  ) {
    return null;
  }

  return result;
}

function extractArrayObjects(content: string): unknown[] {
  const items: unknown[] = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let currentItem = '';
  let inObject = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];

    if (char === ']' && !inString && depth === 0) {
      break;
    }

    if (escaped) {
      currentItem += char;
      escaped = false;
      continue;
    }

    if (char === '\\' && inString) {
      escaped = true;
      currentItem += char;
      continue;
    }

    if (char === '"') {
      inString = !inString;

      if (inObject) {
        currentItem += char;
      }

      continue;
    }

    if (char === '{' && !inString) {
      if (!inObject) {
        inObject = true;
        currentItem = char;
        depth = 1;
      } else {
        depth += 1;
        currentItem += char;
      }

      continue;
    }

    if (char === '}' && !inString && inObject) {
      currentItem += char;
      depth -= 1;

      if (depth === 0) {
        try {
          const parsed = JSON.parse(currentItem);
          items.push(parsed);
        } catch {}

        currentItem = '';
        inObject = false;
      }

      continue;
    }

    if (char === '[' && !inString && inObject) {
      depth += 1;
      currentItem += char;
      continue;
    }

    if (char === ']' && !inString && inObject) {
      depth -= 1;
      currentItem += char;
      continue;
    }

    if (char === ',' && !inString && depth === 0 && !inObject) {
      continue;
    }

    if (inObject) {
      currentItem += char;
    }
  }

  return items;
}

function extractValidatedArray<T>(
  text: string,
  key: string,
  isValid: (value: unknown) => value is T,
): T[] | undefined {
  const keyStart = text.indexOf(`"${key}"`);

  if (keyStart === -1) return undefined;

  const afterKey = text.slice(keyStart);
  const arrayStart = afterKey.indexOf('[');

  if (arrayStart === -1) return undefined;

  return extractArrayObjects(afterKey.slice(arrayStart + 1)).filter(isValid);
}

function unescapeJsonString(str: string): string {
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

function normalizeTableSchema(result: unknown): PartialTableSchema | null {
  if (!result || typeof result !== 'object') {
    return null;
  }

  // SAFETY: normalizeTableSchema only reads optional fields from the parsed JSON object before schema predicates validate arrays.
  const obj = result as Record<string, unknown>;
  const normalized: PartialTableSchema = {};

  if (typeof obj.tableName === 'string') {
    normalized.tableName = obj.tableName;
  }

  if (typeof obj.schemaName === 'string') {
    normalized.schemaName = obj.schemaName;
  }

  if (typeof obj.tableComment === 'string') {
    normalized.tableComment = obj.tableComment;
  }

  if (Array.isArray(obj.fields)) {
    normalized.fields = obj.fields.filter(isGeneratedField);
  }

  if (Array.isArray(obj.indexes)) {
    normalized.indexes = obj.indexes.filter(isGeneratedIndex);
  }

  if (Array.isArray(obj.designDecisions)) {
    normalized.designDecisions = obj.designDecisions.filter(isGeneratedDesignDecision);
  }

  return normalized;
}
