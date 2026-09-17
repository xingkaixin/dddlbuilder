import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { decodeSeedScenario, type SeedRule, type SeedScenario } from '@ddlbuilder/shared-types/api';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { snapshotTableKey, snapshotTableLabel } from '@ddlbuilder/ddl-core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { readSeedScenarios, storeSeedScenario } from '@/utils/seedScenarios';
import { downloadFile } from '@/utils/mockDataGenerator';

const kinds = ['default', 'range', 'weighted', 'date', 'offset'] as const;

export function SeedScenarioPanel({
  tables,
  value,
  onChange,
}: {
  tables: PersistedState[];
  value: SeedScenario;
  onChange: (value: SeedScenario) => void;
}) {
  const { t } = useTranslation();
  const [tableKey, setTableKey] = useState('');
  const table = tables.find((entry) => snapshotTableKey(entry) === tableKey) ?? tables[0];
  const [field, setField] = useState('');

  const fields = table?.rows.filter((row) => row.fieldName.trim()) ?? [];

  const currentField =
    fields.find((entry) => entry.fieldName === field)?.fieldName ?? fields[0]?.fieldName ?? '';
  const [kind, setKind] = useState<SeedRule['kind']>('default');
  const [nullPercent, setNullPercent] = useState('0');
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<SeedScenario[]>([]);
  const [message, setMessage] = useState('');

  const run = (action: () => void) => {
    setError('');
    setMessage('');

    try {
      action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('schemaTools.failed'));
    }
  };

  return (
    <details className="space-y-3 rounded-md border p-3">
      <summary className="cursor-pointer text-sm font-medium">{t('scenario.title')}</summary>
      <p className="text-xs text-muted-foreground">{t('scenario.hint')}</p>
      <label className="block space-y-1 text-sm">
        <span>{t('scenario.name')}</span>
        <Input
          value={value.name}
          maxLength={120}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!value.name.trim()}
          onClick={() =>
            run(() => {
              const existing = readSeedScenarios();

              if (
                existing.some((item) => item.name === value.name) &&
                !window.confirm(t('scenario.overwrite'))
              )
                return;
              storeSeedScenario(value);
              setSaved(readSeedScenarios());
              setMessage(t('scenario.saved'));
            })
          }
        >
          {t('scenario.save')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => run(() => setSaved(readSeedScenarios()))}
        >
          {t('scenario.load')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            run(() =>
              downloadFile(
                JSON.stringify(decodeSeedScenario(value), null, 2),
                'seed-scenario.json',
                'application/json',
              ),
            )
          }
        >
          {t('scenario.export')}
        </Button>
      </div>
      {saved.length > 0 && (
        <label className="block space-y-1 text-sm">
          <span>{t('scenario.choose')}</span>
          <select
            className="h-10 w-full rounded-md border bg-background px-3"
            value=""
            onChange={(event) => {
              const next = saved.find((item) => item.name === event.target.value);

              if (next) onChange(next);
            }}
          >
            <option value="">{t('scenario.choose')}</option>
            {saved.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block space-y-1 text-sm">
        <span>{t('scenario.import')}</span>
        <Input
          type="file"
          accept=".json"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = '';

            if (!file) return;
            setError('');

            try {
              if (file.size > 512 * 1024) throw new Error(t('snapshot.limit'));
              onChange(decodeSeedScenario(JSON.parse(await file.text())));
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : t('schemaTools.failed'));
            }
          }}
        />
      </label>
      {table && (
        <fieldset className="space-y-3 border-t pt-3">
          <legend className="text-sm font-medium">{t('scenario.addRule')}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span>{t('scenario.table')}</span>
              <select
                className="h-10 w-full rounded-md border bg-background px-3"
                value={snapshotTableKey(table)}
                onChange={(event) => {
                  setTableKey(event.target.value);
                  setField('');
                }}
              >
                {tables.map((entry) => (
                  <option key={snapshotTableKey(entry)} value={snapshotTableKey(entry)}>
                    {snapshotTableLabel(entry)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span>{t('scenario.field')}</span>
              <select
                className="h-10 w-full rounded-md border bg-background px-3"
                value={currentField}
                onChange={(event) => setField(event.target.value)}
              >
                {fields.map((row) => (
                  <option key={row.id} value={row.fieldName}>
                    {row.fieldName}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span>{t('scenario.kind')}</span>
              <select
                className="h-10 w-full rounded-md border bg-background px-3"
                value={kind}
                onChange={(event) => {
                  const next = kinds.find((item) => item === event.target.value);

                  if (next) setKind(next);
                  setFirst('');
                  setSecond('');
                }}
              >
                {kinds.map((item) => (
                  <option key={item} value={item}>
                    {t(`scenario.${item}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span>{t('scenario.nullPercent')}</span>
              <Input
                type="number"
                min={0}
                max={100}
                value={nullPercent}
                onChange={(event) => setNullPercent(event.target.value)}
              />
            </label>
          </div>
          {kind === 'weighted' ? (
            <label className="block space-y-1 text-sm">
              <span>{t('scenario.weights')}</span>
              <Textarea
                value={first}
                onChange={(event) => setFirst(event.target.value)}
                placeholder={'PAID=70\nPENDING=30'}
              />
            </label>
          ) : (
            kind !== 'default' && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span>
                    {t(
                      `scenario.${kind === 'offset' ? 'source' : kind === 'date' ? 'start' : 'min'}`,
                    )}
                  </span>
                  <Input
                    value={first}
                    type={kind === 'date' ? 'date' : 'text'}
                    onChange={(event) => setFirst(event.target.value)}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span>
                    {t(`scenario.${kind === 'offset' ? 'days' : kind === 'date' ? 'end' : 'max'}`)}
                  </span>
                  <Input
                    value={second}
                    type={kind === 'date' ? 'date' : 'text'}
                    onChange={(event) => setSecond(event.target.value)}
                  />
                </label>
              </div>
            )
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={!currentField}
            onClick={() =>
              run(() => {
                const base = {
                  tableKey: snapshotTableKey(table),
                  field: currentField,
                  nullPercent: Number(nullPercent),
                };
                const rule: SeedRule =
                  kind === 'range'
                    ? { ...base, kind, min: first, max: second }
                    : kind === 'date'
                      ? { ...base, kind, start: first, end: second }
                      : kind === 'offset'
                        ? { ...base, kind, source: first, days: Number(second) }
                        : kind === 'weighted'
                          ? {
                              ...base,
                              kind,
                              values: first
                                .split('\n')
                                .filter(Boolean)
                                .map((line) => {
                                  const separator = line.lastIndexOf('=');

                                  if (separator < 0) throw new Error(t('scenario.weights'));

                                  return {
                                    value: line.slice(0, separator),
                                    weight: Number(line.slice(separator + 1)),
                                  };
                                }),
                            }
                          : { ...base, kind };
                onChange(
                  decodeSeedScenario({
                    ...value,
                    rules: [
                      ...value.rules.filter(
                        (item) => item.tableKey !== rule.tableKey || item.field !== rule.field,
                      ),
                      rule,
                    ],
                  }),
                );
              })
            }
          >
            {t('scenario.apply')}
          </Button>
        </fieldset>
      )}
      {value.rules.map((rule) => (
        <div
          key={`${rule.tableKey}:${rule.field}`}
          className="flex items-start justify-between gap-3 border-t pt-2 text-sm"
        >
          <span>
            {tables.find((entry) => snapshotTableKey(entry) === rule.tableKey)?.tableName ??
              t('scenario.missing')}{' '}
            · {rule.field} · {t(`scenario.${rule.kind}`)} · NULL {rule.nullPercent}%
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              onChange({ ...value, rules: value.rules.filter((entry) => entry !== rule) })
            }
          >
            {t('common.delete')}
          </Button>
        </div>
      ))}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </details>
  );
}
