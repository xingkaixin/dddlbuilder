import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

const FieldStandardsDialog = lazy(() =>
  import('./FieldStandardsDialog').then((module) => ({ default: module.FieldStandardsDialog })),
);

export function FieldStandardsButton() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={() => setOpen(true)}
      >
        {t('fieldStandards.title')}
      </Button>
      {open && (
        <Suspense
          fallback={
            <span role="status" className="text-xs">
              {t('fieldStandards.loading')}
            </span>
          }
        >
          <FieldStandardsDialog onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
