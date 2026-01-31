/**
 * Partial JSON Parser
 *
 * Parses incomplete JSON strings and returns whatever can be extracted.
 * This enables progressive rendering of streaming JSON responses.
 *
 * For a schema like { score, summary, suggestions[] }, it can extract
 * fields as they stream in, even if the JSON isn't complete yet.
 */

export interface PartialReviewResult {
  score?: number;
  summary?: string;
  suggestions?: (string | any)[];
}

/**
 * Attempts to parse a potentially incomplete JSON string.
 * Returns null if nothing can be parsed yet.
 */
export function parsePartialJson(text: string): PartialReviewResult | null {
  if (!text || text.trim().length === 0) {
    return null;
  }

  // Try to parse as complete JSON first
  try {
    const result = JSON.parse(text);
    return normalizeResult(result);
  } catch {
    // Continue with partial parsing
  }

  // Extract what we can from partial JSON
  const result: PartialReviewResult = {};

  // Extract score - look for "score": followed by a number
  const scoreMatch = text.match(/"score"\s*:\s*(\d+(?:\.\d+)?)/);
  if (scoreMatch) {
    result.score = Math.min(10, Math.max(1, Number(scoreMatch[1])));
  }

  // Extract summary - look for "summary": followed by a quoted string
  const summaryMatch = text.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (summaryMatch) {
    result.summary = unescapeJsonString(summaryMatch[1]);
  } else {
    // Try to get partial summary (string not yet closed)
    const partialSummaryMatch = text.match(
      /"summary"\s*:\s*"((?:[^"\\]|\\.)*)$/,
    );
    if (partialSummaryMatch) {
      result.summary = unescapeJsonString(partialSummaryMatch[1]);
    }
  }

  // Extract suggestions array
  const suggestionsStart = text.indexOf('"suggestions"');
  if (suggestionsStart !== -1) {
    const afterSuggestions = text.slice(suggestionsStart);
    const arrayStart = afterSuggestions.indexOf('[');

    if (arrayStart !== -1) {
      const arrayContent = afterSuggestions.slice(arrayStart + 1);
      result.suggestions = extractArrayItems(arrayContent);
    }
  }

  // Return null if nothing was extracted
  if (
    result.score === undefined &&
    result.summary === undefined &&
    result.suggestions === undefined
  ) {
    return null;
  }

  return result;
}

/**
 * Extract items from a partial array content.
 * Handles both strings and objects. 
 * For objects, only returns complete (parseable) items.
 * Incomplete objects are skipped to avoid rendering field names as text.
 */
function extractArrayItems(content: string): (string | Record<string, unknown>)[] {
  const items: (string | Record<string, unknown>)[] = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let currentItem = '';
  let itemType: 'string' | 'object' | null = null;

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
      if (!inString) {
        if (itemType === null) {
          itemType = 'string';
        }
        inString = true;
        if (itemType === 'string' && depth === 0) {
          currentItem = '';
        } else {
          currentItem += char;
        }
      } else {
        inString = false;
        if (itemType === 'string' && depth === 0) {
          // Complete string item
          items.push(unescapeJsonString(currentItem));
          currentItem = '';
          itemType = null;
        } else {
          currentItem += char;
        }
      }
      continue;
    }

    // Handle object start
    if (char === '{' && !inString) {
      if (itemType === null) {
        itemType = 'object';
        currentItem = char;
        depth = 1;
      } else if (itemType === 'object') {
        depth += 1;
        currentItem += char;
      }
      continue;
    }

    // Handle object end
    if (char === '}' && !inString && itemType === 'object') {
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
        itemType = null;
      }
      continue;
    }

    // Handle item separator
    if (char === ',' && !inString && depth === 0) {
      // Skip incomplete items
      currentItem = '';
      itemType = null;
      continue;
    }

    // Accumulate characters based on current item type
    if (itemType === 'string' || itemType === 'object') {
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
function normalizeResult(result: unknown): PartialReviewResult | null {
  if (!result || typeof result !== 'object') {
    return null;
  }

  const obj = result as Record<string, unknown>;
  const normalized: PartialReviewResult = {};

  if (typeof obj.score === 'number') {
    normalized.score = Math.min(10, Math.max(1, obj.score));
  }

  if (typeof obj.summary === 'string') {
    normalized.summary = obj.summary;
  }

  if (Array.isArray(obj.suggestions)) {
    normalized.suggestions = obj.suggestions
      .filter((s): s is string | any => typeof s === 'string' || (typeof s === 'object' && s !== null))
      .slice(0, 5);
  }

  return normalized;
}
