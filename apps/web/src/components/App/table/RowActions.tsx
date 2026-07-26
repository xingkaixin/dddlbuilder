import { memo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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
import { Trash2 } from '@/components/icons';
import { useTranslation } from 'react-i18next';

interface RowActionsProps {
  hasContent: boolean;
  fieldName: string;
  fieldComment: string;
  onRemove: () => void;
}

export const RowActions = memo<RowActionsProps>(
  ({ hasContent, fieldName, fieldComment, onRemove }) => {
    const { t } = useTranslation();
    const [confirmOpen, setConfirmOpen] = useState(false);

    const handleDelete = () => {
      if (hasContent) {
        setConfirmOpen(true);
      } else {
        onRemove();
      }
    };

    return (
      <div className="flex h-8 items-center justify-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-destructive"
              onClick={handleDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('dataTable.rowActions.removeRow')}</p>
          </TooltipContent>
        </Tooltip>

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('dataTable.rowActions.removeFieldRow')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('dataTable.rowActions.removeFieldRowConfirm')}
                <br />
                <span className="mt-2 block text-foreground">
                  {t('dataTable.rowActions.fieldName', {
                    name: fieldName || t('dataTable.rowActions.empty'),
                  })}
                </span>
                <span className="block text-foreground">
                  {t('dataTable.rowActions.fieldComment', {
                    comment: fieldComment || t('dataTable.rowActions.empty'),
                  })}
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('dataTable.rowActions.cancel')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  onRemove();
                  setConfirmOpen(false);
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {t('dataTable.rowActions.confirmDelete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  },
);

RowActions.displayName = 'RowActions';
