import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/switch';

export function WorkspaceSplitToggle({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <div className="flex h-7 items-center gap-2 px-2">
      <label htmlFor={id} className="cursor-pointer text-xs text-muted-foreground">
        {t('editorLayout.split')}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
