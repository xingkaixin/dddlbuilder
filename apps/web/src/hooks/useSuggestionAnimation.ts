import { useState, useCallback, useRef } from 'react';

export type IndexAnimationType = 'add' | 'remove';

interface AnimationState {
  animatingIndexIds: Set<string>;
  removingIndexIds: Set<string>;
  isFieldTableHighlighted: boolean;
  highlightedRowIndex: number | null;
}

const ANIMATION_DURATIONS = {
  add: 600,
  remove: 500,
  fieldTableHighlight: 1200,
} as const;

const INDEX_ANIMATION_KEYS = {
  add: 'animatingIndexIds',
  remove: 'removingIndexIds',
} as const;

/**
 * Hook for managing suggestion application animations.
 * Provides state and methods to animate indexes and highlight the field table
 * when applying review suggestions.
 */
export function useSuggestionAnimation() {
  const [state, setState] = useState<AnimationState>({
    animatingIndexIds: new Set(),
    removingIndexIds: new Set(),
    isFieldTableHighlighted: false,
    highlightedRowIndex: null,
  });

  // Use refs to track pending timeouts for cleanup
  const timeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const triggerIndexAnimation = useCallback((indexId: string, type: IndexAnimationType) => {
    const timeoutKey = `index-${indexId}`;
    const stateKey = INDEX_ANIMATION_KEYS[type];
    clearTimeout(timeoutsRef.current.get(timeoutKey));

    setState((prev) => ({ ...prev, [stateKey]: new Set(prev[stateKey]).add(indexId) }));

    const timeout = setTimeout(() => {
      setState((prev) => {
        const next = new Set(prev[stateKey]);
        next.delete(indexId);

        return { ...prev, [stateKey]: next };
      });
      timeoutsRef.current.delete(timeoutKey);
    }, ANIMATION_DURATIONS[type]);

    timeoutsRef.current.set(timeoutKey, timeout);
  }, []);

  /**
   * Trigger a highlight animation on the entire field table or a specific row.
   * @param rowIndex - Optional row index to highlight. If not provided, highlights the entire table.
   */
  const triggerFieldTableHighlight = useCallback((rowIndex?: number) => {
    // Clear any existing highlight timeout
    const existingTimeout = timeoutsRef.current.get('field-table-highlight');

    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set highlight state
    setState((prev) => ({
      ...prev,
      isFieldTableHighlighted: true,
      highlightedRowIndex: rowIndex ?? null,
    }));

    // Schedule cleanup after animation duration
    const timeout = setTimeout(() => {
      setState((prev) => ({
        ...prev,
        isFieldTableHighlighted: false,
        highlightedRowIndex: null,
      }));
      timeoutsRef.current.delete('field-table-highlight');
    }, ANIMATION_DURATIONS.fieldTableHighlight);

    timeoutsRef.current.set('field-table-highlight', timeout);
  }, []);

  return {
    animatingIndexIds: state.animatingIndexIds,
    removingIndexIds: state.removingIndexIds,
    isFieldTableHighlighted: state.isFieldTableHighlighted,
    highlightedRowIndex: state.highlightedRowIndex,
    triggerIndexAnimation,
    triggerFieldTableHighlight,
  };
}
