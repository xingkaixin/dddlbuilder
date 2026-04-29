import type { ComponentProps } from 'react';
import { PanelRightOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { DDLOutput } from '../DDLOutput';

interface OutputContainerProps {
  ddlOutputProps: ComponentProps<typeof DDLOutput>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OutputContainer({ ddlOutputProps, open, onOpenChange }: OutputContainerProps) {
  const { t } = useTranslation();

  if (!open) {
    return (
      <aside className="flex rounded-lg border bg-card/95 shadow-lg shadow-primary/5 transition-all duration-300 xl:w-12 xl:shrink-0">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-full rounded-lg text-muted-foreground hover:text-foreground xl:h-full xl:min-h-64"
          onClick={() => onOpenChange(true)}
          aria-label={t('ddlOutput.expandPanel')}
        >
          <PanelRightOpen className="h-4 w-4" />
        </Button>
      </aside>
    );
  }

  return (
    <div className="xl:w-[34rem] xl:shrink-0 2xl:w-[38rem]">
      <DDLOutput {...ddlOutputProps} onCollapsePanel={() => onOpenChange(false)} />
    </div>
  );
}
