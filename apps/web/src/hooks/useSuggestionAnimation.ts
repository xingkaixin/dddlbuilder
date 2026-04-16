import { useState, useCallback, useRef } from 'react';

export type AnimationType = 'add' | 'remove' | 'modify';

interface AnimationState {
  animatingIndexIds: Set<string>;
  removingIndexIds: Set<string>;
  animatingFieldNames: Set<string>;
  removingFieldNames: Set<string>;
  modifyingFieldNames: Set<string>;
  isFieldTableHighlighted: boolean;
  highlightedRowIndex: number | null;
}

const ANIMATION_DURATIONS = {
  add: 600,
  remove: 500,
  modify: 800,
  fieldTableHighlight: 1200,
} as const;

/**
 * Hook for managing suggestion application animations.
 * Provides state and methods to trigger animations on indexes and fields
 * when applying review suggestions.
 */
export function useSuggestionAnimation() {
  const [state, setState] = useState<AnimationState>({
    animatingIndexIds: new Set(),
    removingIndexIds: new Set(),
    animatingFieldNames: new Set(),
    removingFieldNames: new Set(),
    modifyingFieldNames: new Set(),
    isFieldTableHighlighted: false,
    highlightedRowIndex: null,
  });

  // Use refs to track pending timeouts for cleanup
  const timeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  /**
   * Trigger an animation on an index.
   * @param indexId - The ID of the index to animate
   * @param type - The type of animation ('add' | 'remove' | 'modify')
   * @returns A promise that resolves when the animation completes
   */
  const triggerIndexAnimation = useCallback(
    (indexId: string, type: AnimationType): Promise<void> => {
      return new Promise((resolve) => {
        // Clear any existing timeout for this index
        const existingTimeout = timeoutsRef.current.get(`index-${indexId}`);
        if (existingTimeout) {
          clearTimeout(existingTimeout);
        }

        // Add to appropriate set based on type
        setState((prev) => {
          const newState = { ...prev };
          if (type === 'add') {
            newState.animatingIndexIds = new Set(prev.animatingIndexIds).add(indexId);
          } else if (type === 'remove') {
            newState.removingIndexIds = new Set(prev.removingIndexIds).add(indexId);
          }
          return newState;
        });

        // Schedule cleanup after animation duration
        const timeout = setTimeout(() => {
          setState((prev) => {
            const newState = { ...prev };
            if (type === 'add') {
              const newSet = new Set(prev.animatingIndexIds);
              newSet.delete(indexId);
              newState.animatingIndexIds = newSet;
            } else if (type === 'remove') {
              const newSet = new Set(prev.removingIndexIds);
              newSet.delete(indexId);
              newState.removingIndexIds = newSet;
            }
            return newState;
          });
          timeoutsRef.current.delete(`index-${indexId}`);
          resolve();
        }, ANIMATION_DURATIONS[type]);

        timeoutsRef.current.set(`index-${indexId}`, timeout);
      });
    },
    [],
  );

  /**
   * Trigger an animation on a field.
   * @param fieldName - The name of the field to animate
   * @param type - The type of animation ('add' | 'remove' | 'modify')
   * @returns A promise that resolves when the animation completes
   */
  const triggerFieldAnimation = useCallback(
    (fieldName: string, type: AnimationType): Promise<void> => {
      return new Promise((resolve) => {
        // Clear any existing timeout for this field
        const existingTimeout = timeoutsRef.current.get(`field-${fieldName}`);
        if (existingTimeout) {
          clearTimeout(existingTimeout);
        }

        // Add to appropriate set based on type
        setState((prev) => {
          const newState = { ...prev };
          if (type === 'add') {
            newState.animatingFieldNames = new Set(prev.animatingFieldNames).add(fieldName);
          } else if (type === 'remove') {
            newState.removingFieldNames = new Set(prev.removingFieldNames).add(fieldName);
          } else if (type === 'modify') {
            newState.modifyingFieldNames = new Set(prev.modifyingFieldNames).add(fieldName);
          }
          return newState;
        });

        // Schedule cleanup after animation duration
        const timeout = setTimeout(() => {
          setState((prev) => {
            const newState = { ...prev };
            if (type === 'add') {
              const newSet = new Set(prev.animatingFieldNames);
              newSet.delete(fieldName);
              newState.animatingFieldNames = newSet;
            } else if (type === 'remove') {
              const newSet = new Set(prev.removingFieldNames);
              newSet.delete(fieldName);
              newState.removingFieldNames = newSet;
            } else if (type === 'modify') {
              const newSet = new Set(prev.modifyingFieldNames);
              newSet.delete(fieldName);
              newState.modifyingFieldNames = newSet;
            }
            return newState;
          });
          timeoutsRef.current.delete(`field-${fieldName}`);
          resolve();
        }, ANIMATION_DURATIONS[type]);

        timeoutsRef.current.set(`field-${fieldName}`, timeout);
      });
    },
    [],
  );

  /**
   * Clear all pending animations and timeouts.
   */
  const clearAllAnimations = useCallback(() => {
    // Clear all timeouts
    for (const timeout of timeoutsRef.current.values()) {
      clearTimeout(timeout);
    }
    timeoutsRef.current.clear();

    // Reset state
    setState({
      animatingIndexIds: new Set(),
      removingIndexIds: new Set(),
      animatingFieldNames: new Set(),
      removingFieldNames: new Set(),
      modifyingFieldNames: new Set(),
      isFieldTableHighlighted: false,
      highlightedRowIndex: null,
    });
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
    // Index animation states
    animatingIndexIds: state.animatingIndexIds,
    removingIndexIds: state.removingIndexIds,
    // Field animation states
    animatingFieldNames: state.animatingFieldNames,
    removingFieldNames: state.removingFieldNames,
    modifyingFieldNames: state.modifyingFieldNames,
    isFieldTableHighlighted: state.isFieldTableHighlighted,
    highlightedRowIndex: state.highlightedRowIndex,
    // Methods
    triggerIndexAnimation,
    triggerFieldAnimation,
    triggerFieldTableHighlight,
    clearAllAnimations,
  };
}
