import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuthIdentity } from '@/auth/AuthSessionProvider';
import { useToast } from '@/hooks/useToast';
import { useWorkspaceMigration } from '@/hooks/useWorkspaceMigration';

export function WorkspaceMigrationDialog() {
  const { t } = useTranslation();
  const { success, error } = useToast();
  const authSession = useAuthIdentity();
  const workspaceMigration = useWorkspaceMigration(authSession);

  const handleRunWorkspaceMigration = async () => {
    try {
      const result = await workspaceMigration.runMigration();
      if (!result) return;
      success(
        t('header.workspaceMigration.completed', {
          created: result.createdCount,
          copied: result.copiedCount,
          skipped: result.skippedCount,
        }),
      );
    } catch (err) {
      error(err instanceof Error ? err.message : t('header.workspaceMigration.failed'));
    }
  };

  return (
    <Dialog
      open={workspaceMigration.open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          workspaceMigration.dismiss();
          return;
        }
        workspaceMigration.setOpen(nextOpen);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('header.workspaceMigration.title')}</DialogTitle>
          <DialogDescription>
            {workspaceMigration.pending?.result.conflictCount
              ? t('header.workspaceMigration.descriptionWithConflicts', {
                  conflicts: workspaceMigration.pending.result.conflictCount,
                })
              : t('header.workspaceMigration.description')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            {t('header.workspaceMigration.summary', {
              savedTables: workspaceMigration.pending?.payload.snapshot.savedTables.length ?? 0,
              savedDrafts: workspaceMigration.pending?.payload.snapshot.savedDrafts.length ?? 0,
              hasGlobalDraft:
                workspaceMigration.pending?.payload.snapshot.globalDraft ||
                workspaceMigration.pending?.payload.snapshot.activeSession?.activeState
                  ? t('header.workspaceMigration.yes')
                  : t('header.workspaceMigration.no'),
            })}
          </p>
          {workspaceMigration.pending?.result.conflicts.length ? (
            <p>
              {t('header.workspaceMigration.conflicts', {
                names: workspaceMigration.pending.result.conflicts
                  .map((item) => item.displayName)
                  .slice(0, 3)
                  .join('、'),
              })}
            </p>
          ) : null}
          {workspaceMigration.error ? (
            <p className="text-destructive">{workspaceMigration.error}</p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={workspaceMigration.dismiss}
            disabled={workspaceMigration.running}
          >
            {t('header.workspaceMigration.later')}
          </Button>
          <Button
            type="button"
            onClick={handleRunWorkspaceMigration}
            disabled={workspaceMigration.running || workspaceMigration.checking}
          >
            {workspaceMigration.running
              ? t('header.workspaceMigration.running')
              : workspaceMigration.pending?.result.conflictCount
                ? t('header.workspaceMigration.runWithCopies')
                : t('header.workspaceMigration.run')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
