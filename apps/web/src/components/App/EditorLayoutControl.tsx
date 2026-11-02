import { useTranslation } from 'react-i18next';
import { Code2, LayoutTwoColumn, LayoutTwoRow, Table } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { EditorLayout } from '@/stores/preferencesStore';

const LAYOUTS = [
  { layout: 'side', Icon: LayoutTwoColumn },
  { layout: 'split', Icon: LayoutTwoRow },
  { layout: 'design', Icon: Table },
  { layout: 'output', Icon: Code2 },
] as const;

export function EditorLayoutControl({
  value,
  onChange,
}: {
  value: EditorLayout;
  onChange: (layout: EditorLayout) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex shrink-0 gap-0.5" role="group" aria-label={t('editorLayout.label')}>
      {LAYOUTS.map(({ layout, Icon }) => (
        <Button
          key={layout}
          variant="ghost"
          size="icon"
          aria-label={t(`editorLayout.${layout}`)}
          title={t(`editorLayout.${layout}`)}
          aria-pressed={value === layout}
          onClick={() => onChange(layout)}
          className={cn(
            'h-8 w-8 text-muted-foreground',
            value === layout && 'lm-hatch text-foreground',
          )}
        >
          <Icon className="h-4 w-4" />
        </Button>
      ))}
    </div>
  );
}
