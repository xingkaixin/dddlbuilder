import { useState, useCallback, useRef } from 'react';

interface ExplainState {
  isLoading: boolean;
  isStreaming: boolean;
  isComplete: boolean;
  explanation: string | null;
  error: string | null;
}

export function useDDLExplain() {
  const [state, setState] = useState<ExplainState>({
    isLoading: false,
    isStreaming: false,
    isComplete: false,
    explanation: null,
    error: null,
  });
  const abortControllerRef = useRef<AbortController | null>(null);

  const startExplain = useCallback(async (sql: string, context?: string) => {
    if (!sql || sql.trim().length === 0) {
      setState((prev) => ({ ...prev, error: '未选中有效的 SQL 内容' }));
      return;
    }

    // Abort any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setState({
      isLoading: true,
      isStreaming: false,
      isComplete: false,
      explanation: null,
      error: null,
    });

    try {
      const response = await fetch('/api/explain', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sql, context }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `请求失败: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('无法读取响应流');
      }

      setState({
        isLoading: false,
        isStreaming: true,
        isComplete: false,
        explanation: '',
        error: null,
      });

      const decoder = new TextDecoder();
      let done = false;

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        const chunkValue = decoder.decode(value, { stream: !done });

        setState((prev) => ({
          ...prev,
          explanation: (prev.explanation || '') + chunkValue,
        }));
      }

      setState((prev) => ({
        ...prev,
        isStreaming: false,
        isComplete: true,
      }));
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return; // Request was cancelled
      }
      setState({
        isLoading: false,
        isStreaming: false,
        isComplete: false,
        explanation: null,
        error: error instanceof Error ? error.message : '解释请求失败',
      });
    }
  }, []);

  const clearExplain = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setState({
      isLoading: false,
      isStreaming: false,
      isComplete: false,
      explanation: null,
      error: null,
    });
  }, []);

  return {
    ...state,
    startExplain,
    clearExplain,
  };
}
