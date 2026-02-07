import { useState, useCallback, useRef, useMemo } from 'react';
import type { FieldRow, IndexDefinition } from '@/types';

const STREAM_UPDATE_INTERVAL_MS = 33;

/**
 * AI 生成的表结构
 */
export interface GeneratedTableSchema {
  tableName: string;
  tableComment: string;
  fields: GeneratedField[];
  indexes?: GeneratedIndex[];
}

export interface GeneratedField {
  fieldName: string;
  fieldType: string;
  fieldComment: string;
  nullable: '是' | '否';
  defaultKind: '无' | '自增' | '常量' | '当前时间' | 'uuid';
  defaultValue?: string;
  onUpdate?: '无' | '当前时间';
  isPrimaryKey?: boolean;
}

export interface GeneratedIndex {
  name: string;
  fields: Array<{ name: string; direction: 'ASC' | 'DESC' }>;
  unique: boolean;
}

/**
 * 对话消息
 */
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * 部分解析的表结构
 */
export interface PartialTableSchema {
  tableName?: string;
  tableComment?: string;
  fields?: GeneratedField[];
  indexes?: GeneratedIndex[];
}

/**
 * Parse partial JSON for GeneratedTableSchema structure.
 * Extracts fields as they stream in, similar to parsePartialJson for ReviewResult.
 */
function parsePartialTableSchema(text: string): PartialTableSchema | null {
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

  // Extract tableComment
  const tableCommentMatch = text.match(
    /"tableComment"\s*:\s*"((?:[^"\\]|\\.)*)"/,
  );
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
      result.fields = extractArrayObjects(
        arrayContent,
      ) as unknown as GeneratedField[];
    }
  }

  // Extract indexes array
  const indexesStart = text.indexOf('"indexes"');
  if (indexesStart !== -1) {
    const afterIndexes = text.slice(indexesStart);
    const arrayStart = afterIndexes.indexOf('[');

    if (arrayStart !== -1) {
      const arrayContent = afterIndexes.slice(arrayStart + 1);
      result.indexes = extractArrayObjects(
        arrayContent,
      ) as unknown as GeneratedIndex[];
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

  if (typeof obj.tableComment === 'string') {
    normalized.tableComment = obj.tableComment;
  }

  if (Array.isArray(obj.fields)) {
    normalized.fields = obj.fields.filter(
      (f): f is GeneratedField =>
        typeof f === 'object' &&
        f !== null &&
        typeof (f as any).fieldName === 'string',
    );
  }

  if (Array.isArray(obj.indexes)) {
    normalized.indexes = obj.indexes.filter(
      (idx): idx is GeneratedIndex =>
        typeof idx === 'object' &&
        idx !== null &&
        typeof (idx as any).name === 'string',
    );
  }

  return normalized;
}

interface GenerateState {
  isLoading: boolean;
  streamingText: string;
  result: GeneratedTableSchema | null;
  error: string | null;
}

/**
 * AI 生成表结构的 Hook
 */
export function useAIGenerateTable() {
  const [state, setState] = useState<GenerateState>({
    isLoading: false,
    streamingText: '',
    result: null,
    error: null,
  });
  const [conversationHistory, setConversationHistory] = useState<
    ConversationMessage[]
  >([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Parse partial result from streaming text for progressive rendering
  const partialResult = useMemo<PartialTableSchema | null>(() => {
    if (!state.isLoading || !state.streamingText) {
      return null;
    }
    return parsePartialTableSchema(state.streamingText);
  }, [state.isLoading, state.streamingText]);

  const generateTable = useCallback(
    async (
      description: string,
      dbType: string,
      options?: {
        templates?: any[];
        existingConfig?: Partial<{
          tableName: string;
          rows: FieldRow[];
          indexes: IndexDefinition[];
        }>;
        continueConversation?: boolean;
      },
    ) => {
      if (!description.trim()) {
        setState((prev) => ({ ...prev, error: '请输入表结构描述' }));
        return;
      }

      // Abort previous request if exists
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      setState({
        isLoading: true,
        streamingText: '',
        result: null,
        error: null,
      });

      try {
        const response = await fetch('/api/generate-table', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            description,
            dbType,
            templates: options?.templates,
            existingConfig: options?.existingConfig,
            conversationHistory: options?.continueConversation
              ? conversationHistory
              : [],
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Generation failed');
        }

        if (!response.body) {
          throw new Error('No response body');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let lastEmittedText = '';
        let hasEmittedFirstChunk = false;
        let lastEmitAt = 0;

        const emitStreamingText = () => {
          lastEmittedText = fullText;
          setState((prev) => ({
            ...prev,
            streamingText: lastEmittedText,
          }));
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          fullText += chunk;

          if (!hasEmittedFirstChunk) {
            hasEmittedFirstChunk = true;
            lastEmitAt = Date.now();
            emitStreamingText();
            continue;
          }

          const now = Date.now();
          if (now - lastEmitAt >= STREAM_UPDATE_INTERVAL_MS) {
            lastEmitAt = now;
            emitStreamingText();
          }
        }

        // Emit any remaining text
        if (lastEmittedText !== fullText) {
          emitStreamingText();
        }

        // Parse final result
        try {
          const finalResult = JSON.parse(fullText) as GeneratedTableSchema;
          setState({
            isLoading: false,
            streamingText: '',
            result: finalResult,
            error: null,
          });

          // Update conversation history
          setConversationHistory((prev) => [
            ...(options?.continueConversation ? prev : []),
            { role: 'user', content: description },
            { role: 'assistant', content: fullText },
          ]);
        } catch {
          throw new Error('Failed to parse response');
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          // Request was aborted, ignore
          return;
        }
        setState({
          isLoading: false,
          streamingText: '',
          result: null,
          error: (err as Error).message || 'Generation failed',
        });
      } finally {
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
        }
      }
    },
    [conversationHistory],
  );

  const clearResult = useCallback(() => {
    setState({
      isLoading: false,
      streamingText: '',
      result: null,
      error: null,
    });
  }, []);

  const clearConversation = useCallback(() => {
    setConversationHistory([]);
  }, []);

  const cancelGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setState((prev) => ({
        ...prev,
        isLoading: false,
      }));
    }
  }, []);

  return {
    isLoading: state.isLoading,
    streamingText: state.streamingText,
    error: state.error,
    result: state.result,
    partialResult,
    conversationHistory,
    generateTable,
    clearResult,
    clearConversation,
    cancelGeneration,
  };
}
