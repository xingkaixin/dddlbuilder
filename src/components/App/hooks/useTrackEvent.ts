import { useCallback } from 'react';

type AnalyticsValue = string | number | boolean | null | undefined;

export function useTrackEvent() {
  return useCallback(
    async (event: string, data?: Record<string, AnalyticsValue>) => {
      const { track } = await import('@vercel/analytics');
      track(event, data);
    },
    [],
  );
}
