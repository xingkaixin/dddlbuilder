import type {
  GeneratedDesignDecision,
  GeneratedField,
  GeneratedIndex,
  PartialTableSchema,
} from '@ddlbuilder/shared-types/ai-generate';
import { FIELD_DEFAULT_KINDS, FIELD_ON_UPDATES } from '@ddlbuilder/shared-types';

const DEFAULT_KINDS = new Set<string>(FIELD_DEFAULT_KINDS);
const ON_UPDATE_VALUES = new Set<string>(FIELD_ON_UPDATES);

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

  result.fields = extractValidatedArray(text, 'fields', isGeneratedField);
  result.indexes = extractValidatedArray(text, 'indexes', isGeneratedIndex);
  result.designDecisions = extractValidatedArray(
    text,
    'designDecisions',
    isGeneratedDesignDecision,
  );

  // Return null if nothing was extracted
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

/**
 * Extract complete objects from a partial array content.
 * Only returns fully parseable objects - incomplete objects are skipped.
 */
function extractArrayObjects(content: string): unknown[] {
  const items: unknown[] = [];
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isGeneratedField(value: unknown): value is GeneratedField {
  if (!isRecord(value)) return false;

  return (
    typeof value.fieldName === 'string' &&
    typeof value.fieldType === 'string' &&
    typeof value.fieldComment === 'string' &&
    typeof value.nullable === 'boolean' &&
    typeof value.defaultKind === 'string' &&
    DEFAULT_KINDS.has(value.defaultKind) &&
    (value.defaultValue === undefined || typeof value.defaultValue === 'string') &&
    (value.onUpdate === undefined ||
      (typeof value.onUpdate === 'string' && ON_UPDATE_VALUES.has(value.onUpdate))) &&
    (value.isPrimaryKey === undefined || typeof value.isPrimaryKey === 'boolean')
  );
}

function isGeneratedIndex(value: unknown): value is GeneratedIndex {
  if (!isRecord(value) || !Array.isArray(value.fields)) return false;

  return (
    typeof value.name === 'string' &&
    typeof value.unique === 'boolean' &&
    value.fields.every(
      (field) =>
        isRecord(field) &&
        typeof field.name === 'string' &&
        (field.direction === 'ASC' || field.direction === 'DESC'),
    )
  );
}

function isGeneratedDesignDecision(value: unknown): value is GeneratedDesignDecision {
  return isRecord(value) && typeof value.title === 'string' && typeof value.rationale === 'string';
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
