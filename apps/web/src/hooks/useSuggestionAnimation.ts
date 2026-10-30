import { useCallback, useReducer, useRef } from 'react';

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

type AnimationEvent =
  | {
      type: 'indexAnimationStarted' | 'indexAnimationEnded';
      indexId: string;
      kind: IndexAnimationType;
    }
  | { type: 'fieldTableHighlighted'; rowIndex: number | null }
  | { type: 'fieldTableHighlightEnded' };

const initialAnimationState: AnimationState = {
  animatingIndexIds: new Set(),
  removingIndexIds: new Set(),
  isFieldTableHighlighted: false,
  highlightedRowIndex: null,
};

function animationReducer(state: AnimationState, event: AnimationEvent): AnimationState {
  switch (event.type) {
    case 'indexAnimationStarted': {
      const stateKey = INDEX_ANIMATION_KEYS[event.kind];

      return { ...state, [stateKey]: new Set(state[stateKey]).add(event.indexId) };
    }

    case 'indexAnimationEnded': {
      const stateKey = INDEX_ANIMATION_KEYS[event.kind];
      const next = new Set(state[stateKey]);
      next.delete(event.indexId);

      return { ...state, [stateKey]: next };
    }

    case 'fieldTableHighlighted':
      return { ...state, isFieldTableHighlighted: true, highlightedRowIndex: event.rowIndex };
    case 'fieldTableHighlightEnded':
      return { ...state, isFieldTableHighlighted: false, highlightedRowIndex: null };
  }
}

/**
 * Hook for managing suggestion application animations.
 * Provides state and methods to animate indexes and highlight the field table
 * when applying review suggestions.
 */
export function useSuggestionAnimation() {
  const [state, dispatch] = useReducer(animationReducer, initialAnimationState);

  // Use refs to track pending timeouts for cleanup
  const timeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const triggerIndexAnimation = useCallback((indexId: string, kind: IndexAnimationType) => {
    const timeoutKey = `index-${indexId}`;
    clearTimeout(timeoutsRef.current.get(timeoutKey));

    dispatch({ type: 'indexAnimationStarted', indexId, kind });

    const timeout = setTimeout(() => {
      dispatch({ type: 'indexAnimationEnded', indexId, kind });
      timeoutsRef.current.delete(timeoutKey);
    }, ANIMATION_DURATIONS[kind]);

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
    dispatch({ type: 'fieldTableHighlighted', rowIndex: rowIndex ?? null });

    // Schedule cleanup after animation duration
    const timeout = setTimeout(() => {
      dispatch({ type: 'fieldTableHighlightEnded' });
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
