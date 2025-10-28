import { useState, useCallback } from "react";

export interface UseCollapseStateReturn {
  isIndexCollapsed: boolean;
  isAuthCollapsed: boolean;
  toggleIndexCollapse: () => void;
  toggleAuthCollapse: () => void;
}

export function useCollapseState(): UseCollapseStateReturn {
  const [isIndexCollapsed, setIsIndexCollapsed] = useState(false);
  const [isAuthCollapsed, setIsAuthCollapsed] = useState(false);

  const toggleIndexCollapse = useCallback(() => {
    setIsIndexCollapsed((prev) => !prev);
  }, []);

  const toggleAuthCollapse = useCallback(() => {
    setIsAuthCollapsed((prev) => !prev);
  }, []);

  return {
    isIndexCollapsed,
    isAuthCollapsed,
    toggleIndexCollapse,
    toggleAuthCollapse,
  };
}