import { memo } from 'react';
import { Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ThemeToggleProps {
  isDark: boolean;
  onToggle: () => void;
}

export const ThemeToggle = memo<ThemeToggleProps>(({ isDark, onToggle }) => {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 rounded-full transition-colors hover:bg-accent"
      onClick={onToggle}
      title={isDark ? '切换到浅色模式' : '切换到深色模式'}
    >
      {isDark ? (
        <Sun className="h-4 w-4 transition-all" />
      ) : (
        <Moon className="h-4 w-4 transition-all" />
      )}
    </Button>
  );
});
