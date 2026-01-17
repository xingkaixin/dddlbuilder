import { useState, useCallback, useRef } from 'react';

export interface ReviewResult {
  score: number;
  summary: string;
  suggestions: string[];
}

interface ReviewState {
  isLoading: boolean;
  streamingText: string;
  result: ReviewResult | null;
  error: string | null;
}

export function useDDLReview() {
  const [state, setState] = useState<ReviewState>({
    isLoading: false,
    streamingText: '',
    result: null,
    error: null,
  });
  const abortControllerRef = useRef<AbortController | null>(null);

  const startReview = useCallback(
    async (ddl: string, tableName: string, dbType: string) => {
      if (!ddl || ddl.trim().length === 0) {
        setState((prev) => ({ ...prev, error: '请先生成DDL语句' }));
        return;
      }

      // Abort any existing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      setState({
        isLoading: true,
        streamingText: '',
        result: null,
        error: null,
      });

      try {
        const response = await fetch('/api/review', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ddl, tableName, dbType }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `请求失败: ${response.status}`);
        }

        // Handle streaming response
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('无法读取响应流');
        }

        const decoder = new TextDecoder();
        let fullText = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          fullText += chunk;

          // Update streaming text for real-time display
          setState((prev) => ({
            ...prev,
            streamingText: fullText,
          }));
        }

        console.log('[Review] Full response:', fullText);

        // Parse the complete JSON response
        const jsonMatch = fullText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('无法解析评审结果');
        }

        const result = JSON.parse(jsonMatch[0]);
        setState({
          isLoading: false,
          streamingText: '',
          result: {
            score: Math.min(10, Math.max(1, Number(result.score) || 5)),
            summary: result.summary || '评审完成',
            suggestions: Array.isArray(result.suggestions)
              ? result.suggestions.slice(0, 5)
              : [],
          },
          error: null,
        });
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return; // Request was cancelled, don't update state
        }
        setState({
          isLoading: false,
          streamingText: '',
          result: null,
          error: error instanceof Error ? error.message : '评审请求失败',
        });
      }
    },
    [],
  );

  const clearReview = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setState({
      isLoading: false,
      streamingText: '',
      result: null,
      error: null,
    });
  }, []);

  return {
    isLoading: state.isLoading,
    streamingText: state.streamingText,
    result: state.result,
    error: state.error,
    startReview,
    clearReview,
  };
}
