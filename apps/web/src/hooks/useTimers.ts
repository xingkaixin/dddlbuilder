import { useCallback, useEffect, useRef } from 'react';

export function useTimers() {
  const timersRef = useRef(new Set<number>());

  useEffect(() => {
    const timers = timersRef.current;

    return () => {
      for (const timer of timers) window.clearTimeout(timer);
      timers.clear();
    };
  }, []);

  const schedule = useCallback((callback: () => void, delayMs: number) => {
    const timer = window.setTimeout(() => {
      timersRef.current.delete(timer);
      callback();
    }, delayMs);

    timersRef.current.add(timer);
  }, []);

  const clearAll = useCallback(() => {
    for (const timer of timersRef.current) window.clearTimeout(timer);
    timersRef.current.clear();
  }, []);

  return { schedule, clearAll };
}
