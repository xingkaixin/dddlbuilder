import { create } from 'zustand';
import type {
  DDLReviewResult,
  DDLReviewStructuredSuggestion,
  DDLReviewSuggestion,
} from '@ddlbuilder/shared-types/ddl-review';

export function isStructuredSuggestion(
  suggestion: DDLReviewSuggestion,
): suggestion is DDLReviewStructuredSuggestion {
  return typeof suggestion !== 'string';
}

export interface ReviewSnapshot {
  documentKey: string | null;
  thinking: string;
  suggestions: readonly DDLReviewSuggestion[];
  streamingText: string;
  result: DDLReviewResult | null;
  error: string | null;
}

export interface ReviewStoreState extends ReviewSnapshot {
  startReview: (documentKey: string) => void;
  clearReview: (documentKey: string) => void;
  setThinking: (thinking: string) => void;
  setSuggestions: (suggestions: readonly DDLReviewSuggestion[]) => void;
  setStreamingText: (streamingText: string) => void;
  succeedReview: (documentKey: string, result: DDLReviewResult) => void;
  failReview: (documentKey: string, error: string) => void;
  markSuggestionApplied: (
    documentKey: string,
    nextDocumentKey: string,
    suggestionId: string,
  ) => boolean;
  resetReview: () => void;
}

const emptyReviewSnapshot: ReviewSnapshot = {
  documentKey: null,
  thinking: '',
  suggestions: [],
  streamingText: '',
  result: null,
  error: null,
};

export const useReviewStore = create<ReviewStoreState>((set, get) => ({
  ...emptyReviewSnapshot,
  startReview: (documentKey) => set({ ...emptyReviewSnapshot, documentKey }),
  clearReview: (documentKey) => set({ ...emptyReviewSnapshot, documentKey }),
  setThinking: (thinking) => set({ thinking }),
  setSuggestions: (suggestions) => set({ suggestions }),
  setStreamingText: (streamingText) => set({ streamingText }),
  succeedReview: (documentKey, result) =>
    set({
      documentKey,
      streamingText: '',
      result,
      error: null,
    }),
  failReview: (documentKey, error) => set({ ...emptyReviewSnapshot, documentKey, error }),
  markSuggestionApplied: (documentKey, nextDocumentKey, suggestionId) => {
    const state = get();

    if (state.documentKey !== documentKey || !state.result) return false;

    const nextReview: DDLReviewResult = {
      ...state.result,
      suggestions: state.result.suggestions.map((item) =>
        isStructuredSuggestion(item) && item.id === suggestionId
          ? { ...item, applied: true }
          : item,
      ),
    };

    set({ result: nextReview, documentKey: nextDocumentKey });

    return true;
  },
  resetReview: () => set(emptyReviewSnapshot),
}));
