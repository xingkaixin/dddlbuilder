import { useCallback } from 'react';
import { markCnyFireworksShown } from '@/stores/appUiStore';

interface UseFireworksIntroParams {
  enabled: boolean;
  setShowFireworks: (show: boolean) => void;
}

export function useFireworksIntro({ enabled, setShowFireworks }: UseFireworksIntroParams) {
  const handleFireworksComplete = useCallback(() => {
    setShowFireworks(false);

    if (!enabled) {
      return;
    }

    markCnyFireworksShown();
  }, [enabled, setShowFireworks]);

  return { handleFireworksComplete };
}
