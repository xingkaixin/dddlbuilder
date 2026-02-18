import { Laptop, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { memo } from 'react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type ThemeMode = 'system' | 'light' | 'dark';

interface ThemeSwitcherProps {
  triggerClassName?: string;
}

export const ThemeSwitcher = memo<ThemeSwitcherProps>(
  ({ triggerClassName }) => {
    const { t } = useTranslation();
    const { theme, setTheme } = useTheme();
    const selectedTheme: ThemeMode =
      theme === 'light' || theme === 'dark' || theme === 'system'
        ? theme
        : 'system';

    const themeLabels: Record<ThemeMode, string> = {
      system: t('theme.system'),
      light: t('theme.light'),
      dark: t('theme.dark'),
    };

    const triggerLabel = t('theme.triggerFixed', {
      theme: themeLabels[selectedTheme],
    });

    return (
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                data-testid="theme-switcher-trigger"
                aria-label={triggerLabel}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
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
            onValueChange={(value) => setTheme(value as ThemeMode)}
          >
            <DropdownMenuRadioItem
              value="system"
              data-testid="theme-option-system"
            >
              <Laptop className="h-4 w-4" aria-hidden />
              {t('theme.system')}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem
              value="light"
              data-testid="theme-option-light"
            >
              <Sun className="h-4 w-4" aria-hidden />
              {t('theme.light')}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark" data-testid="theme-option-dark">
              <Moon className="h-4 w-4" aria-hidden />
              {t('theme.dark')}
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  },
);

ThemeSwitcher.displayName = 'ThemeSwitcher';
