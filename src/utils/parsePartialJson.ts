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
      result.suggestions = extractArrayStrings(arrayContent);
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
 * Extract strings from a partial array content.
 * Handles both complete and incomplete string items.
 */
function extractArrayStrings(content: string): string[] {
  const items: string[] = [];
  let inString = false;
  let escaped = false;
  let current = '';

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];

    if (!inString) {
      if (char === '"') {
        inString = true;
        current = '';
      } else if (char === ']') {
        break;
      }
      continue;
    }

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      current += '\\';
      continue;
    }

    if (char === '"') {
      items.push(unescapeJsonString(current));
      current = '';
      inString = false;
      continue;
    }

    current += char;
  }

  if (inString && current.trim().length > 0) {
    items.push(unescapeJsonString(current));
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
