import { Code2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';

interface ViewDefinitionPanelProps {
  definition: string;
  createOrReplace: boolean;
  onDefinitionChange: (value: string) => void;
  onCreateOrReplaceChange: (value: boolean) => void;
}

export function ViewDefinitionPanel({
  definition,
  createOrReplace,
  onDefinitionChange,
  onCreateOrReplaceChange,
}: ViewDefinitionPanelProps) {
  const { t } = useTranslation();

  return (
    <div className="relative overflow-hidden rounded-lg border bg-card shadow-sm">
      <div className="pointer-events-none absolute inset-0 rounded-lg bg-gradient-to-br from-primary/5 via-transparent to-transparent" />

      <div className="relative flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Code2 className="h-4 w-4 text-primary" />
          {t('viewDefinition.title')}
        </div>
        <Label className="flex items-center gap-2 text-sm font-normal text-muted-foreground">
          <Checkbox
            checked={createOrReplace}
            onCheckedChange={(checked) => onCreateOrReplaceChange(checked === true)}
          />
          {t('viewDefinition.createOrReplace')}
        </Label>
      </div>
      <div className="relative space-y-3 p-4">
        <Label htmlFor="view-definition">{t('viewDefinition.sql')}</Label>
        <Textarea
          id="view-definition"
          value={definition}
          onChange={(event) => onDefinitionChange(event.target.value)}
          placeholder={t('viewDefinition.placeholder')}
          className="min-h-[360px] resize-y font-mono text-sm"
        />
      </div>
    </div>
  );
}
