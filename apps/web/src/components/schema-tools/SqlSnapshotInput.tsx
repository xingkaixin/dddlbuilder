import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { getImportCharacterLimit } from '@/utils/importLimits';

export function SqlSnapshotInput({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (sql: string) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [error, setError] = useState('');
  const limit = getImportCharacterLimit('sql') ?? 50_000;

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Textarea
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          setError('');
          onChange(event.target.value);
        }}
        className="min-h-44 rounded-lg bg-background font-mono text-xs leading-relaxed shadow-none md:text-xs"
        placeholder="CREATE TABLE …"
        spellCheck={false}
      />
      <Input
        type="file"
        accept=".sql,.txt"
        aria-label={t('schemaTools.upload', { label })}
        disabled={disabled}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';

          if (!file) return;
          setError('');
          onChange('');

          try {
            if (file.size > limit * 4) throw new Error(t('schemaTools.inputLimit', { limit }));
            const sql = await file.text();

            if (sql.length > limit) throw new Error(t('schemaTools.inputLimit', { limit }));
            onChange(sql);
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : t('schemaTools.failed'));
          }
        }}
      />
      <p className="text-xs text-muted-foreground">
        {t('schemaTools.characters', { count: value.length, limit })}
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
