import { useMemo } from 'react';
import { toast } from 'sonner';
import i18n from '@/i18n';

interface PersistenceTask {
  key: string;
  operation: string;
  // oxlint-disable-next-line anti-slop/no-unknown-returns -- queue stores completion-only producer promises without exposing their values.
  run: () => Promise<unknown>;
}

interface PendingTask {
  task: PersistenceTask;
  completion: Promise<unknown>;
}

const PERSISTENCE_FAILURE_TOAST_ID = 'workspace-persistence-failure';

function createPersistenceQueue() {
  const chains = new Map<string, Promise<unknown>>();
  const pending = new Map<string, PendingTask>();
  const versions = new Map<string, number>();
  const failedTasks = new Map<string, PersistenceTask>();

  function retryFailed() {
    for (const task of failedTasks.values()) {
      void enqueue(task.key, task.operation, task.run);
    }
  }

  function enqueue(
    key: string,
    operation: string,
    // oxlint-disable-next-line anti-slop/no-unknown-returns -- enqueue accepts completion-only producer promises.
    run: () => Promise<unknown>,
    { replaceable = false }: { replaceable?: boolean } = {},
  ) {
    const pendingTask = pending.get(key);

    // 尚未开始的整条写入会被同 key 的新整条写入完全覆盖，只需执行最新的一次。
    if (replaceable && pendingTask) {
      pendingTask.task.operation = operation;
      pendingTask.task.run = run;

      return pendingTask.completion;
    }

    const version = (versions.get(key) ?? 0) + 1;
    versions.set(key, version);
    failedTasks.delete(key);

    const task: PersistenceTask = { key, operation, run };
    const previous = chains.get(key) ?? Promise.resolve();

    const current = previous
      .catch(() => undefined)
      .then(() => {
        if (pending.get(key)?.task === task) pending.delete(key);

        return task.run();
      });
    chains.set(key, current);

    if (replaceable) pending.set(key, { task, completion: current });
    else pending.delete(key);

    void current.then(
      () => {
        if (chains.get(key) === current) chains.delete(key);

        if (versions.get(key) !== version) return;
        failedTasks.delete(key);
      },
      // oxlint-disable-next-line anti-slop/no-unknown-parameters -- queued work can reject with any JavaScript value.
      (error: unknown) => {
        console.error(`[workspace-persistence] ${task.operation} failed`, error);

        if (chains.get(key) === current) chains.delete(key);

        if (versions.get(key) !== version) return;
        failedTasks.set(key, { ...task });
        toast.error(i18n.t('app.persistenceFailed'), {
          id: PERSISTENCE_FAILURE_TOAST_ID,
          action: { label: i18n.t('app.retryPersistence'), onClick: retryFailed },
        });
      },
    );

    return current;
  }

  return { enqueue, retryFailed };
}

export function usePersistenceQueue() {
  return useMemo(() => createPersistenceQueue(), []);
}
