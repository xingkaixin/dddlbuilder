import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { decodeDeliverySnapshot, type DeliverySnapshot } from '@ddlbuilder/workspace-core';
import { Input } from '@/components/ui/input';

export function SnapshotFileInput({
  label,
  onChange,
}: {
  label: string;
  onChange: (snapshot: DeliverySnapshot) => void;
}) {
  const { t } = useTranslation();
  const [error, setError] = useState('');
  const readVersion = useRef(0);
  useEffect(
    () => () => {
      readVersion.current += 1;
    },
    [],
  );

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
            const version = ++readVersion.current;
            setError('');

            try {
              if (file.size > 2 * 1024 * 1024) throw new Error(t('snapshot.limit'));
              const snapshot = decodeDeliverySnapshot(JSON.parse(await file.text()));

              if (version === readVersion.current) onChange(snapshot);
            } catch (cause) {
              if (version === readVersion.current)
                setError(cause instanceof Error ? cause.message : t('schemaTools.failed'));
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
