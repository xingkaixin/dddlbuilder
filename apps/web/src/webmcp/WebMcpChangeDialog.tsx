import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { WebMcpDialogModel } from './types';

interface WebMcpChangeDialogProps {
  model: WebMcpDialogModel;
}

export function WebMcpChangeDialog({ model }: WebMcpChangeDialogProps) {
  const { t } = useTranslation();
  const { request, mode, onCancel, onConfirm } = model;
  if (!request || !mode) return null;

  const { changeSet } = request;
  const summary = {
    table: Number(changeSet.diff.tableNameChanged) + Number(changeSet.diff.tableCommentChanged),
    fields: changeSet.diff.fields.length,
    indexes: changeSet.diff.indexes.length,
    foreignKeys: changeSet.diff.foreignKeys.length,
  };
  const selectedIds = request.operationIds ? new Set(request.operationIds) : null;
  const operations = changeSet.operations?.filter(
    (operation) => !selectedIds || selectedIds.has(operation.id),
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            {t(mode === 'confirm' ? 'webMcp.confirmTitle' : 'webMcp.previewTitle')}
          </DialogTitle>
          <DialogDescription>
            {t(mode === 'confirm' ? 'webMcp.confirmDescription' : 'webMcp.previewDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[58vh] flex-col gap-4 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Object.entries(summary).map(([key, count]) => (
              <div key={key} className="rounded-md border bg-muted/30 p-3">
                <div className="text-lg font-semibold">{count}</div>
                <div className="text-xs text-muted-foreground">{t(`webMcp.summary.${key}`)}</div>
              </div>
            ))}
          </div>

          {operations?.length ? (
            <section className="space-y-2">
              <h3 className="text-sm font-medium">{t('webMcp.operations')}</h3>
              <div className="space-y-1.5">
                {operations.map((operation) => (
                  <div key={operation.id} className="rounded-md border px-3 py-2 text-sm">
                    <div className="font-mono text-xs font-medium">{operation.kind}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{operation.id}</div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {changeSet.diff.fields.length > 0 ? (
            <section className="space-y-2">
              <h3 className="text-sm font-medium">{t('webMcp.fieldChanges')}</h3>
              <div className="space-y-1.5">
                {changeSet.diff.fields.map((field, index) => (
                  <div
                    key={`${field.type}:${field.fieldName}:${index}`}
                    className="rounded-md border px-3 py-2 text-sm"
                  >
                    <span className="mr-2 font-mono">{field.fieldName}</span>
                    <span className="text-xs text-muted-foreground">{field.type}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {changeSet.diff.indexes.length > 0 ? (
            <section className="space-y-2">
              <h3 className="text-sm font-medium">{t('webMcp.indexChanges')}</h3>
              <div className="space-y-1.5">
                {changeSet.diff.indexes.map((index, position) => (
                  <div
                    key={`${index.type}:${index.index.id}:${position}`}
                    className="rounded-md border px-3 py-2 text-sm"
                  >
                    <span className="mr-2 font-mono">{index.index.name}</span>
                    <span className="text-xs text-muted-foreground">{index.type}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {changeSet.issues.length > 0 ? (
            <section className="space-y-2">
              <h3 className="text-sm font-medium">{t('webMcp.lintIssues')}</h3>
              <div className="space-y-1.5">
                {changeSet.issues.slice(0, 12).map((issue) => (
                  <div key={issue.id} className="rounded-md border px-3 py-2 text-sm">
                    <span className="mr-2 font-medium">{issue.target}</span>
                    <span className="text-xs text-muted-foreground">
                      {issue.severity} · {issue.ruleId}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" onClick={onCancel}>
            {t(mode === 'confirm' ? 'webMcp.cancel' : 'webMcp.close')}
          </Button>
          {mode === 'confirm' ? <Button onClick={onConfirm}>{t('webMcp.apply')}</Button> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
