import { lazy, Suspense, useReducer } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

const FieldStandardsDialog = lazy(() =>
  import('./FieldStandardsDialog').then((module) => ({ default: module.FieldStandardsDialog })),
);

const dialogOpenReducer = (_open: boolean, event: 'opened' | 'closed') => event === 'opened';

export function FieldStandardsButton() {
  const { t } = useTranslation();
  const [open, dispatchDialog] = useReducer(dialogOpenReducer, false);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={() => dispatchDialog('opened')}
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
          <FieldStandardsDialog onClose={() => dispatchDialog('closed')} />
        </Suspense>
      )}
    </>
  );
}
