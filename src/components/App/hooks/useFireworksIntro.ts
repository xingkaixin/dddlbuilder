import { useCallback, useEffect } from 'react';

interface UseFireworksIntroParams {
  setShowFireworks: (show: boolean) => void;
}

const CNY_FIREWORKS_FLAG_KEY = 'ddlbuilder:fireworks:cny:shown:2026:v1';

export function useFireworksIntro({
  setShowFireworks,
}: UseFireworksIntroParams) {
  useEffect(() => {
    const hasShown = localStorage.getItem(CNY_FIREWORKS_FLAG_KEY);
    if (!hasShown) {
      setShowFireworks(true);
    }
  }, [setShowFireworks]);

  const handleFireworksComplete = useCallback(() => {
    setShowFireworks(false);
    localStorage.setItem(CNY_FIREWORKS_FLAG_KEY, 'true');
  }, [setShowFireworks]);

  return { handleFireworksComplete };
}
