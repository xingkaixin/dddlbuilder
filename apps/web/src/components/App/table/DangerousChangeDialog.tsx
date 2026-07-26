import { memo } from 'react';
import { AlertTriangle } from '@/components/icons';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useTranslation } from 'react-i18next';
import type { FieldTypeRisk } from '@/utils/fieldTypeRisk';

interface DangerousChangeDialogProps {
  open: boolean;
  risk: FieldTypeRisk | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DangerousChangeDialog = memo<DangerousChangeDialogProps>(
  ({ open, risk, onConfirm, onCancel }) => {
    const { t } = useTranslation();

    if (!risk) return null;

    const isTypeChange = risk.kind === 'type_change';
    const titleKey = isTypeChange
      ? 'dataTable.dangerousChange.typeChangeTitle'
      : 'dataTable.dangerousChange.lengthShrinkTitle';
    const descKey = isTypeChange
      ? 'dataTable.dangerousChange.typeChangeDesc'
      : 'dataTable.dangerousChange.lengthShrinkDesc';

    return (
      <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              {t(titleKey)}
            </AlertDialogTitle>
            <AlertDialogDescription>
              <span className="block">{t(descKey, { from: risk.fromType, to: risk.toType })}</span>
              <span className="mt-3 block font-medium text-foreground">
                {t('dataTable.dangerousChange.migrationTip')}
              </span>
              <span className="mt-1 block pl-4 text-sm">
                {'• '}
                {t('dataTable.dangerousChange.tip1')}
              </span>
              <span className="block pl-4 text-sm">
                {'• '}
                {t('dataTable.dangerousChange.tip2')}
              </span>
              <span className="block pl-4 text-sm">
                {'• '}
                {t('dataTable.dangerousChange.tip3')}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onCancel}>
              {t('dataTable.dangerousChange.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('dataTable.dangerousChange.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  },
);

DangerousChangeDialog.displayName = 'DangerousChangeDialog';
