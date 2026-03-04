import { useCallback, useEffect } from 'react';

interface UseFireworksIntroParams {
  enabled: boolean;
  setShowFireworks: (show: boolean) => void;
}

const CNY_FIREWORKS_FLAG_KEY = 'ddlbuilder:fireworks:cny:shown:2026:v1';

export function useFireworksIntro({
  enabled,
  setShowFireworks,
}: UseFireworksIntroParams) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const hasShown = localStorage.getItem(CNY_FIREWORKS_FLAG_KEY);
    if (!hasShown) {
      setShowFireworks(true);
    }
  }, [enabled, setShowFireworks]);

  const handleFireworksComplete = useCallback(() => {
    setShowFireworks(false);
    if (!enabled) {
      return;
    }

    localStorage.setItem(CNY_FIREWORKS_FLAG_KEY, 'true');
  }, [enabled, setShowFireworks]);

  return { handleFireworksComplete };
}
