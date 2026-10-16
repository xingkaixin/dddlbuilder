import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AIConversationSnapshot } from '@ddlbuilder/shared-types';
import { useAuthIdentity } from '@/auth/AuthSessionProvider';
import {
  readAIOperations,
  readAIOperationSnapshot,
  observeAIOperation,
  stopAIOperation,
  forgetAIOperation,
} from '@/services/aiConversationService';
import { Button } from '@/components/ui/button';
import { getAIOperationErrorMessage } from '@/services/aiApi';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function AIOperations() {
  const { userId } = useAuthIdentity();

  return userId ? <UserAIOperations key={userId} userId={userId} /> : null;
}

function UserAIOperations({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const [items, setItems] = useState(readAIOperations);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<AIConversationSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const refresh = () => setItems(readAIOperations());
    window.addEventListener('ai-operations-changed', refresh);

    return () => window.removeEventListener('ai-operations-changed', refresh);
  }, []);
  useEffect(() => {
    if (!selected || !open) return;
    const controller = new AbortController();
    readAIOperationSnapshot(selected, controller.signal)
      .then(async (value) => {
        if (controller.signal.aborted) return;
        setSnapshot(value);

        if (value.status === 'running')
          await observeAIOperation(selected, controller.signal, setSnapshot);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(error instanceof Error ? error.message : t('aiOperations.failed'));
      });

    return () => controller.abort();
  }, [selected, open, t]);
  const owned = items.filter((item) => item.userId === userId);

  if (!userId || !owned.length) return null;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="fixed bottom-4 left-4 z-40 shadow-sm"
        onClick={() => setOpen(true)}
      >
        {t('aiOperations.title')} ({owned.length})
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('aiOperations.title')}</DialogTitle>
            <DialogDescription>{t('aiOperations.description')}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            {owned.map((item) => (
              <Button
                key={item.operationId}
                variant={selected === item.operationId ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setSnapshot(null);
                  setError(null);
                  setSelected(item.operationId);
                }}
              >
                {t(`aiOperations.routes.${item.route}`)}
              </Button>
            ))}
          </div>
          {error && (
            <div className="space-y-2">
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
              {selected && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    forgetAIOperation(selected);
                    setSelected(null);
                    setSnapshot(null);
                    setError(null);
                  }}
                >
                  {t('aiOperations.dismiss')}
                </Button>
              )}
            </div>
          )}

          {snapshot && (
            <div className="space-y-3">
              <p role="status" className="text-sm font-medium">
                {t(`aiOperations.states.${snapshot.status}`)}
                {snapshot.accountingPending && snapshot.status !== 'running'
                  ? ` · ${t('aiOperations.accounting')}`
                  : ''}
              </p>
              {snapshot.thinking && (
                <details open>
                  <summary className="text-sm text-muted-foreground">
                    {t('aiOperations.thinking')}
                  </summary>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                    {snapshot.thinking}
                  </p>
                </details>
              )}
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
                {snapshot.text}
              </pre>
              {snapshot.error && (
                <p role="alert" className="text-sm text-destructive">
                  {getAIOperationErrorMessage(snapshot.error)}
                </p>
              )}
              <div className="flex gap-2">
                {snapshot.status === 'running' ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() =>
                      stopAIOperation(snapshot.operationId).catch((error) =>
                        setError(String(error)),
                      )
                    }
                  >
                    {t('aiOperations.stop')}
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      forgetAIOperation(snapshot.operationId);
                      setSelected(null);
                      setSnapshot(null);
                    }}
                  >
                    {t('aiOperations.dismiss')}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!snapshot.text}
                  onClick={() =>
                    navigator.clipboard
                      .writeText(snapshot.text)
                      .catch((error) => setError(String(error)))
                  }
                >
                  {t('aiOperations.copy')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
