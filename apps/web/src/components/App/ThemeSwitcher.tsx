import { Laptop, Moon, Sun } from '@/components/icons';
import { useTheme } from 'next-themes';
import { memo } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { useThemeTransition } from './hooks/useThemeTransition';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type ThemeMode = 'system' | 'light' | 'dark';

interface ThemeSwitcherProps {
  triggerClassName?: string;
}

export const ThemeSwitcher = memo<ThemeSwitcherProps>(({ triggerClassName }) => {
  const { t } = useTranslation();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const selectedTheme: ThemeMode =
    theme === 'light' || theme === 'dark' || theme === 'system' ? theme : 'system';
  const { phase, isTransitioning, targetEffectiveTheme, runThemeTransition } = useThemeTransition({
    theme: selectedTheme,
    resolvedTheme,
    setTheme,
  });

  const themeLabels: Record<ThemeMode, string> = {
    system: t('theme.system'),
    light: t('theme.light'),
    dark: t('theme.dark'),
  };

  const triggerLabel = t('theme.triggerFixed', {
    theme: themeLabels[selectedTheme],
  });
  const overlay =
    phase === 'wipe' || phase === 'fade' ? (
      <div
        aria-hidden
        data-testid="theme-transition-overlay"
        className={cn(
          'theme-transition-overlay',
          phase === 'wipe' ? 'theme-transition-overlay--wipe' : 'theme-transition-overlay--fade',
          targetEffectiveTheme === 'dark'
            ? 'theme-transition-overlay--to-dark'
            : 'theme-transition-overlay--to-light',
        )}
      />
    ) : null;

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-testid="theme-switcher-trigger"
              aria-label={triggerLabel}
              disabled={isTransitioning}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-70',
                triggerClassName,
              )}
            >
              {selectedTheme === 'dark' ? (
                <Moon className="h-4 w-4" aria-hidden />
              ) : selectedTheme === 'light' ? (
                <Sun className="h-4 w-4" aria-hidden />
              ) : (
                <Laptop className="h-4 w-4" aria-hidden />
              )}
              <span>{triggerLabel}</span>
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <p>{t('header.changeTheme')}</p>
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuRadioGroup
          value={selectedTheme}
          onValueChange={(value) => runThemeTransition(value as ThemeMode)}
        >
          <DropdownMenuRadioItem value="system" data-testid="theme-option-system">
            <Laptop className="h-4 w-4" aria-hidden />
            {t('theme.system')}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="light" data-testid="theme-option-light">
            <Sun className="h-4 w-4" aria-hidden />
            {t('theme.light')}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark" data-testid="theme-option-dark">
            <Moon className="h-4 w-4" aria-hidden />
            {t('theme.dark')}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
      {overlay && typeof document !== 'undefined' ? createPortal(overlay, document.body) : null}
    </DropdownMenu>
  );
});

ThemeSwitcher.displayName = 'ThemeSwitcher';
