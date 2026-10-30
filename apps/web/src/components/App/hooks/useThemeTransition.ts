import { useCallback, useReducer } from 'react';
import { useTimers } from '@/hooks/useTimers';

type ThemeMode = 'system' | 'light' | 'dark';

type EffectiveTheme = 'light' | 'dark';

type TransitionPhase = 'idle' | 'view' | 'wipe' | 'fade';

type TransitionState = {
  phase: TransitionPhase;
  targetEffectiveTheme: EffectiveTheme;
};

type TransitionEvent =
  | { type: 'viewTransitionStarted' }
  | { type: 'wipeStarted'; targetEffectiveTheme: EffectiveTheme }
  | { type: 'fadeStarted' }
  | { type: 'finished' };

const initialTransitionState: TransitionState = { phase: 'idle', targetEffectiveTheme: 'dark' };

function transitionReducer(state: TransitionState, event: TransitionEvent): TransitionState {
  switch (event.type) {
    case 'viewTransitionStarted':
      return { ...state, phase: 'view' };
    case 'wipeStarted':
      return { phase: 'wipe', targetEffectiveTheme: event.targetEffectiveTheme };
    case 'fadeStarted':
      return { ...state, phase: 'fade' };
    case 'finished':
      return { ...state, phase: 'idle' };
  }
}

const SWITCH_THEME_AT_MS = 470;
const FADE_START_AT_MS = 520;
const TOTAL_DURATION_MS = 700;

function getSystemTheme(): EffectiveTheme | null {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- this boundary value requires a runtime representation check.
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return null;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function prefersReducedMotion(): boolean {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- this boundary value requires a runtime representation check.
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
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
    return resolvedTheme === 'dark' ? 'dark' : resolvedTheme === 'light' ? 'light' : null;
  }

  return null;
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
  const [{ phase, targetEffectiveTheme }, dispatch] = useReducer(
    transitionReducer,
    initialTransitionState,
  );
  const { schedule, clearAll: clearTimers } = useTimers();

  const runThemeTransition = useCallback(
    (nextTheme: ThemeMode) => {
      if (phase !== 'idle') {
        return;
      }

      const systemTheme = getSystemTheme();
      const currentEffectiveTheme = resolveCurrentEffectiveTheme(theme, resolvedTheme, systemTheme);

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

      const startViewTransition = document.startViewTransition?.bind(document);

      if (startViewTransition) {
        clearTimers();
        dispatch({ type: 'viewTransitionStarted' });
        const root = document.documentElement;
        root.classList.add('theme-view-transition-active');

        const transition = startViewTransition(() => {
          setTheme(nextTheme);
        });

        void transition.finished.finally(() => {
          root.classList.remove('theme-view-transition-active');
          dispatch({ type: 'finished' });
        });

        return;
      }

      clearTimers();
      dispatch({
        type: 'wipeStarted',
        targetEffectiveTheme: nextEffectiveTheme ?? currentEffectiveTheme ?? 'dark',
      });
      schedule(() => setTheme(nextTheme), SWITCH_THEME_AT_MS);
      schedule(() => dispatch({ type: 'fadeStarted' }), FADE_START_AT_MS);
      schedule(() => dispatch({ type: 'finished' }), TOTAL_DURATION_MS);
    },
    [phase, theme, resolvedTheme, setTheme, clearTimers, schedule],
  );

  return {
    phase,
    isTransitioning: phase !== 'idle',
    targetEffectiveTheme,
    showOverlay: phase === 'wipe' || phase === 'fade',
    runThemeTransition,
  };
}
