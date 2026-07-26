import { useEffect, type DependencyList, type EffectCallback } from 'react';

export function useDebouncedEffect(effect: EffectCallback, deps: DependencyList, delay: number) {
  useEffect(() => {
    let cleanup: undefined | (() => void);
    const timer = window.setTimeout(() => {
      cleanup = effect() || undefined;
    }, delay);

    return () => {
      window.clearTimeout(timer);
      if (typeof cleanup === 'function') {
        cleanup();
      }
    };
    // This custom hook intentionally expands caller-provided deps.
    // oxlint's exhaustive-deps rule cannot model variadic dependency lists here.
    // oxlint-disable-next-line react/exhaustive-deps
  }, [effect, delay, ...deps]);
}
