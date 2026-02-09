import { useCallback, useEffect } from 'react';

interface UseFireworksIntroParams {
  setShowFireworks: (show: boolean) => void;
}

export function useFireworksIntro({
  setShowFireworks,
}: UseFireworksIntroParams) {
  useEffect(() => {
    const hasShown = localStorage.getItem('fireworks_shown_2026');
    if (!hasShown) {
      setShowFireworks(true);
    }
  }, [setShowFireworks]);

  const handleFireworksComplete = useCallback(() => {
    setShowFireworks(false);
    localStorage.setItem('fireworks_shown_2026', 'true');
  }, [setShowFireworks]);

  return { handleFireworksComplete };
}
