import type { GeneratedField, GeneratedIndex, PartialTableSchema } from '@ddlbuilder/shared-types/ai-generate';

/**
 * Parse partial JSON for GeneratedTableSchema structure.
 * Extracts fields as they stream in, similar to parsePartialJson for ReviewResult.
 */
export function parsePartialTableSchema(text: string): PartialTableSchema | null {
  if (!text || text.trim().length === 0) {
    return null;
  }

  // Try to parse as complete JSON first
  try {
    const result = JSON.parse(text);
    return normalizeTableSchema(result);
  } catch {
    // Continue with partial parsing
  }

  const result: PartialTableSchema = {};

  // Extract tableName
  const tableNameMatch = text.match(/"tableName"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (tableNameMatch) {
    result.tableName = unescapeJsonString(tableNameMatch[1]);
  }

  const schemaNameMatch = text.match(/"schemaName"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (schemaNameMatch) {
    result.schemaName = unescapeJsonString(schemaNameMatch[1]);
  }

  // Extract tableComment
  const tableCommentMatch = text.match(/"tableComment"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (tableCommentMatch) {
    result.tableComment = unescapeJsonString(tableCommentMatch[1]);
  }

  // Extract fields array
  const fieldsStart = text.indexOf('"fields"');
  if (fieldsStart !== -1) {
    const afterFields = text.slice(fieldsStart);
    const arrayStart = afterFields.indexOf('[');

    if (arrayStart !== -1) {
      const arrayContent = afterFields.slice(arrayStart + 1);
      result.fields = extractArrayObjects(arrayContent) as unknown as GeneratedField[];
    }
  }

  // Extract indexes array
  const indexesStart = text.indexOf('"indexes"');
  if (indexesStart !== -1) {
    const afterIndexes = text.slice(indexesStart);
    const arrayStart = afterIndexes.indexOf('[');

    if (arrayStart !== -1) {
      const arrayContent = afterIndexes.slice(arrayStart + 1);
      result.indexes = extractArrayObjects(arrayContent) as unknown as GeneratedIndex[];
    }
  }

  // Return null if nothing was extracted
  if (
    result.tableName === undefined &&
    result.tableComment === undefined &&
    result.fields === undefined &&
    result.indexes === undefined
  ) {
    return null;
  }

  return result;
}

/**
 * Extract complete objects from a partial array content.
 * Only returns fully parseable objects - incomplete objects are skipped.
 */
function extractArrayObjects(content: string): Record<string, unknown>[] {
  const items: Record<string, unknown>[] = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let currentItem = '';
  let inObject = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];

    // Handle end of array
    if (char === ']' && !inString && depth === 0) {
      break;
    }

    // Handle string escaping
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

    // Handle string start/end
    if (char === '"') {
      inString = !inString;
      if (inObject) {
        currentItem += char;
      }
      continue;
    }

    // Handle object start
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

    // Handle object end
    if (char === '}' && !inString && inObject) {
      currentItem += char;
      depth -= 1;
      if (depth === 0) {
        // Try to parse the complete object
        try {
          const parsed = JSON.parse(currentItem);
          items.push(parsed);
        } catch {
          // Incomplete object, skip it
        }
        currentItem = '';
        inObject = false;
      }
      continue;
    }

    // Handle nested arrays
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

    // Handle item separator at depth 0
    if (char === ',' && !inString && depth === 0 && !inObject) {
      // Skip, ready for next item
      continue;
    }

    // Accumulate characters for current object
    if (inObject) {
      currentItem += char;
    }
  }

  return items;
}

/**
 * Unescape JSON string escape sequences.
 */
function unescapeJsonString(str: string): string {
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

/**
 * Normalize parsed result to ensure correct types.
 */
function normalizeTableSchema(result: unknown): PartialTableSchema | null {
  if (!result || typeof result !== 'object') {
    return null;
  }

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
    normalized.fields = obj.fields.filter(
      (f): f is GeneratedField =>
        typeof f === 'object' &&
        f !== null &&
        typeof (f as Record<string, unknown>).fieldName === 'string',
    );
  }

  if (Array.isArray(obj.indexes)) {
    normalized.indexes = obj.indexes.filter(
      (idx): idx is GeneratedIndex =>
        typeof idx === 'object' &&
        idx !== null &&
        typeof (idx as Record<string, unknown>).name === 'string',
    );
  }

  return normalized;
}
