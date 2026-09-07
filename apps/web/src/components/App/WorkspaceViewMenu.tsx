import { useTranslation } from 'react-i18next';
import { ChevronDown, Code, LayoutTemplate, Table2 } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { EditorView } from '@/stores/appUiStore';

const viewIcons = { design: Table2, output: Code, split: LayoutTemplate };

export function WorkspaceViewMenu({
  view,
  onViewChange,
}: {
  view: EditorView;
  onViewChange: (view: EditorView) => void;
}) {
  const { t } = useTranslation();
  const Icon = viewIcons[view];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-2 px-2 text-xs"
          aria-label={t('editorLayout.label')}
        >
          <Icon className="h-3.5 w-3.5" />
          {t(`editorLayout.${view}`)}
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={view}
          onValueChange={(value) => onViewChange(value as EditorView)}
        >
          {(['design', 'output', 'split'] as const).map((mode) => {
            const ModeIcon = viewIcons[mode];
            return (
              <DropdownMenuRadioItem key={mode} value={mode} className="gap-2">
                <ModeIcon className="h-4 w-4" />
                {t(`editorLayout.${mode}`)}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
