import { Laptop, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { memo } from 'react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type ThemeMode = 'system' | 'light' | 'dark';

interface ThemeSwitcherProps {
  triggerClassName?: string;
}

const THEME_LABELS: Record<ThemeMode, string> = {
  system: '跟随系统',
  light: '亮色',
  dark: '暗色',
};

const RESOLVED_THEME_LABELS = {
  light: '亮色',
  dark: '暗色',
} as const;

export const ThemeSwitcher = memo<ThemeSwitcherProps>(
  ({ triggerClassName }) => {
    const { theme, setTheme, resolvedTheme } = useTheme();
    const selectedTheme: ThemeMode =
      theme === 'light' || theme === 'dark' || theme === 'system'
        ? theme
        : 'system';

    const currentResolvedTheme =
      resolvedTheme === 'dark'
        ? RESOLVED_THEME_LABELS.dark
        : RESOLVED_THEME_LABELS.light;

    const triggerLabel =
      selectedTheme === 'system'
        ? `主题：系统（当前${currentResolvedTheme}）`
        : `主题：${THEME_LABELS[selectedTheme]}`;

    return (
      <DropdownMenu>
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
              跟随系统
              <span className="ml-auto text-xs text-muted-foreground">
                当前{currentResolvedTheme}
              </span>
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem
              value="light"
              data-testid="theme-option-light"
            >
              <Sun className="h-4 w-4" aria-hidden />
              亮色
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark" data-testid="theme-option-dark">
              <Moon className="h-4 w-4" aria-hidden />
              暗色
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  },
);

ThemeSwitcher.displayName = 'ThemeSwitcher';
