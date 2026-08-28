import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
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
import { useToast } from '@/hooks/useToast';
import type { AISchemaChange } from '@/utils/aiSchemaChanges';
import { AISchemaPatchPanel } from './AISchemaPatchPanel';
import {
  useAISchemaPatchSession,
  type AISchemaPatchSessionParams,
} from './hooks/useAISchemaPatchSession';

interface AISchemaPatchDialogProps extends AISchemaPatchSessionParams {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFocusChange?: (change: AISchemaChange) => void;
}

export function AISchemaPatchDialog({
  open,
  onOpenChange,
  onFocusChange,
  ...params
}: AISchemaPatchDialogProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const session = useAISchemaPatchSession(params);
  const [confirmReset, setConfirmReset] = useState(false);
  const handleOpenChange = (next: boolean) => {
    if (!next && session.isLoading) {
      showToast(t('aiPatch.closeWhileGenerating'));
      return;
    }
    onOpenChange(next);
  };
  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="flex max-h-[88vh] w-[min(1080px,calc(100vw-2rem))] max-w-none flex-col overflow-hidden p-0">
          <DialogTitle className="sr-only">{t('aiPatch.title')}</DialogTitle>
          <AISchemaPatchPanel
            session={session}
            currentState={params.currentState}
            onFocusChange={onFocusChange}
            onReset={() =>
              session.result || session.input ? setConfirmReset(true) : session.handleReset()
            }
          />
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('aiPatch.reset')}</AlertDialogTitle>
            <AlertDialogDescription>{t('aiPatch.resetConfirmation')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('aiPatch.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={session.handleReset}>
              {t('aiPatch.reset')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
