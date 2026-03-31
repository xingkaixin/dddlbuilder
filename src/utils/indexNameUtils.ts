/**
 * Utility functions for index name handling
 */

const MAX_INDEX_NAME_LENGTH = 40;
const ORACLE_INDEX_NAME_LENGTH = 30;

/**
 * Generate a short hash from a string
 * Uses djb2 algorithm for simplicity and speed
 */
function generateShortHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  // Convert to base36 and take last 4 characters for uniqueness
  return Math.abs(hash).toString(36).slice(-4);
}

/**
 * Truncate index name if it exceeds the maximum length
 * Adds a short hash suffix to ensure uniqueness
 *
 * @param name - The original index name
 * @param maxLength - Maximum allowed length (default: 40)
 * @returns Truncated name with hash suffix if needed, otherwise original name
 */
export function truncateIndexName(name: string, maxLength: number = MAX_INDEX_NAME_LENGTH): string {
  if (name.length <= maxLength) {
    return name;
  }

  const hash = generateShortHash(name);
  // Reserve space for underscore and hash (5 characters: _xxxx)
  const truncateLength = maxLength - 5;
  const truncatedName = name.slice(0, truncateLength);

  return `${truncatedName}_${hash}`;
}

/**
 * Build an index name from components with automatic truncation
 *
 * @param prefix - Index prefix ('idx', 'uk', or 'pk')
 * @param tableName - The table name
 * @param fieldNames - Array of field names
 * @returns A properly formatted and truncated index name
 */
export function buildIndexName(
  prefix: 'idx' | 'uk' | 'pk',
  tableName: string,
  fieldNames: string[],
  maxLength: number = MAX_INDEX_NAME_LENGTH,
): string {
  const fullName =
    fieldNames.length === 1
      ? `${prefix}_${tableName}_${fieldNames[0]}`
      : `${prefix}_${tableName}_${fieldNames.join('_')}`;

  return truncateIndexName(fullName, maxLength);
}

export { MAX_INDEX_NAME_LENGTH, ORACLE_INDEX_NAME_LENGTH };
