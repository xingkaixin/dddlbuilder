import { useCallback, useEffect, useRef, useState } from 'react';

type ThemeMode = 'system' | 'light' | 'dark';
type EffectiveTheme = 'light' | 'dark';
type TransitionPhase = 'idle' | 'view' | 'wipe' | 'fade';

const SWITCH_THEME_AT_MS = 470;
const FADE_START_AT_MS = 520;
const TOTAL_DURATION_MS = 700;

function getSystemTheme(): EffectiveTheme | null {
  if (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function'
  ) {
    return null;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function prefersReducedMotion(): boolean {
  if (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function'
  ) {
    return true;
  }

  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function resolveCurrentEffectiveTheme(
  theme: ThemeMode,
  resolvedTheme: string | undefined,
  systemTheme: EffectiveTheme | null,
): EffectiveTheme | null {
  if (theme === 'light' || theme === 'dark') {
    return theme;
  }

  if (resolvedTheme === 'light' || resolvedTheme === 'dark') {
    return resolvedTheme;
  }

  return systemTheme;
}

function resolveTargetEffectiveTheme(
  targetTheme: ThemeMode,
  currentTheme: ThemeMode,
  resolvedTheme: string | undefined,
  systemTheme: EffectiveTheme | null,
): EffectiveTheme | null {
  if (targetTheme === 'light' || targetTheme === 'dark') {
    return targetTheme;
  }

  if (systemTheme) {
    return systemTheme;
  }

  if (currentTheme === 'system') {
    return resolvedTheme === 'dark'
      ? 'dark'
      : resolvedTheme === 'light'
        ? 'light'
        : null;
  }

  return null;
}

interface ViewTransitionLike {
  finished: Promise<void>;
}

interface DocumentWithViewTransition extends Document {
  startViewTransition?: (
    callback: () => void | Promise<void>,
  ) => ViewTransitionLike;
}

export function useThemeTransition({
  theme,
  resolvedTheme,
  setTheme,
}: {
  theme: ThemeMode;
  resolvedTheme?: string;
  setTheme: (theme: ThemeMode) => void;
}) {
  const [phase, setPhase] = useState<TransitionPhase>('idle');
  const [targetEffectiveTheme, setTargetEffectiveTheme] =
    useState<EffectiveTheme>('dark');
  const timersRef = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    for (const timer of timersRef.current) {
      window.clearTimeout(timer);
    }
    timersRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  const runThemeTransition = useCallback(
    (nextTheme: ThemeMode) => {
      if (phase !== 'idle') {
        return;
      }

      const systemTheme = getSystemTheme();
      const currentEffectiveTheme = resolveCurrentEffectiveTheme(
        theme,
        resolvedTheme,
        systemTheme,
      );
      const nextEffectiveTheme = resolveTargetEffectiveTheme(
        nextTheme,
        theme,
        resolvedTheme,
        systemTheme,
      );

      if (
        currentEffectiveTheme &&
        nextEffectiveTheme &&
        currentEffectiveTheme === nextEffectiveTheme
      ) {
        setTheme(nextTheme);
        return;
      }

      if (prefersReducedMotion()) {
        setTheme(nextTheme);
        return;
      }

      const doc = document as DocumentWithViewTransition;
      if (typeof doc.startViewTransition === 'function') {
        clearTimers();
        setPhase('view');
        const root = document.documentElement;
        root.classList.add('theme-view-transition-active');

        const transition = doc.startViewTransition(() => {
          setTheme(nextTheme);
        });

        void transition.finished.finally(() => {
          root.classList.remove('theme-view-transition-active');
          setPhase('idle');
        });
        return;
      }

      clearTimers();
      setTargetEffectiveTheme(
        nextEffectiveTheme ?? currentEffectiveTheme ?? 'dark',
      );
      setPhase('wipe');

      const switchTimer = window.setTimeout(() => {
        setTheme(nextTheme);
      }, SWITCH_THEME_AT_MS);

      const fadeTimer = window.setTimeout(() => {
        setPhase('fade');
      }, FADE_START_AT_MS);

      const finishTimer = window.setTimeout(() => {
        setPhase('idle');
      }, TOTAL_DURATION_MS);

      timersRef.current = [switchTimer, fadeTimer, finishTimer];
    },
    [phase, theme, resolvedTheme, setTheme, clearTimers],
  );

  return {
    phase,
    isTransitioning: phase !== 'idle',
    targetEffectiveTheme,
    showOverlay: phase === 'wipe' || phase === 'fade',
    runThemeTransition,
  };
}
