import { useReducer } from 'react';
import { useTranslation } from 'react-i18next';
import { decodeDeliverySnapshot, type DeliverySnapshot } from '@ddlbuilder/workspace-core';
import { Input } from '@/components/ui/input';
import { useLatestRequest } from '@/hooks/useLatestRequest';

type ReadErrorEvent = { type: 'readStarted' } | { type: 'readFailed'; message: string };

const readErrorReducer = (_error: string, event: ReadErrorEvent) =>
  event.type === 'readFailed' ? event.message : '';

export function SnapshotFileInput({
  label,
  onChange,
}: {
  label: string;
  onChange: (snapshot: DeliverySnapshot) => void;
}) {
  const { t } = useTranslation();
  const [error, dispatchError] = useReducer(readErrorReducer, '');
  const { run } = useLatestRequest();

  return (
    <div className="space-y-2">
      <label className="block space-y-2 text-sm">
        <span>{label}</span>
        <Input
          type="file"
          accept=".json"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = '';

            if (!file) return;
            dispatchError({ type: 'readStarted' });

            try {
              const snapshot = await run(async () => {
                if (file.size > 2 * 1024 * 1024) throw new Error(t('snapshot.limit'));

                return decodeDeliverySnapshot(JSON.parse(await file.text()));
              });

              if (snapshot) onChange(snapshot);
            } catch (cause) {
              dispatchError({
                type: 'readFailed',
                message: cause instanceof Error ? cause.message : t('schemaTools.failed'),
              });
            }
          }}
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
