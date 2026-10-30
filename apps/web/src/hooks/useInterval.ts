import { useEffect, useEffectEvent } from 'react';

export function useInterval(callback: () => void, delayMs: number | null) {
  const onTick = useEffectEvent(callback);

  useEffect(() => {
    if (delayMs === null) return;

    const timer = window.setInterval(() => onTick(), delayMs);

    return () => window.clearInterval(timer);
  }, [delayMs]);
}
