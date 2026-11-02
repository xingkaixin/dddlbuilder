import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useAppUiStore } from '@/stores/appUiStore';

export function FieldStandardsButton() {
  const { t } = useTranslation();
  const open = useAppUiStore((state) => state.setIsFieldStandardsOpen);

  return (
    <Button variant="ghost" size="tool" onClick={() => open(true)}>
      {t('fieldStandards.title')}
    </Button>
  );
}
