import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { BusinessDataSource, BusinessSeparator } from '@/utils/business-data/readBusinessData';
import type { BusinessDataTask } from '@/utils/business-data/tasks';

export function BusinessDataSourceInput({
  source,
  separator,
  busy,
  onSeparator,
  onReset,
  onRead,
}: {
  source: BusinessDataSource | null;
  separator: BusinessSeparator;
  busy: boolean;
  onSeparator: (value: BusinessSeparator) => void;
  onReset: () => void;
  onRead: (task: BusinessDataTask) => void;
}) {
  const { t } = useTranslation();
  const [input, setInput] = useState('file');
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">{t('dataImport.sourceTitle')}</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {t('dataImport.sourceHint')}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm">
          <span>{t('dataImport.input')}</span>
          <select
            className="h-9 w-full rounded-md border bg-background px-3"
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              onReset();
            }}
          >
            <option value="file">{t('dataImport.fileInput')}</option>
            <option value="text">{t('dataImport.pasteInput')}</option>
          </select>
        </label>
        <label className="space-y-2 text-sm">
          <span>{t('dataImport.separator')}</span>
          <select
            className="h-9 w-full rounded-md border bg-background px-3"
            value={separator}
            onChange={(event) => {
              const value = event.target.value;

              if (value === ',' || value === '\t' || value === ';') onSeparator(value);
            }}
          >
            <option value=",">{t('dataImport.comma')}</option>
            <option value={'\t'}>Tab</option>
            <option value=";">{t('dataImport.semicolon')}</option>
          </select>
        </label>
      </div>
      {input === 'file' ? (
        <label className="block space-y-2 text-sm">
          <span>{t('dataImport.file')}</span>
          <Input
            type="file"
            accept=".csv,.tsv,.txt,.xlsx"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              onReset();
            }}
          />
        </label>
      ) : (
        <label className="block space-y-2 text-sm">
          <span>{t('dataImport.text')}</span>
          <Textarea
            className="min-h-32 font-mono text-xs"
            value={text}
            placeholder={'order_code,amount\n00123,19.90\n00124,29.50'}
            onChange={(event) => {
              setText(event.target.value);
              onReset();
            }}
          />
        </label>
      )}
      {file && source && source.sheets.length > 0 && (
        <label className="block space-y-2 text-sm">
          <span>{t('dataImport.sheet')}</span>
          <select
            className="h-9 w-full rounded-md border bg-background px-3"
            value={source.sheet}
            disabled={busy}
            onChange={(event) =>
              onRead({ kind: 'file', file, sheet: event.target.value, separator })
            }
          >
            <option value="">{t('dataImport.chooseSheet')}</option>
            {source.sheets.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      )}
      <Button
        variant="outline"
        disabled={busy || (input === 'file' ? !file : !text.trim())}
        onClick={() => {
          if (input === 'file' && file)
            onRead({ kind: 'file', file, sheet: source?.sheet ?? '', separator });
          else if (input === 'text') onRead({ kind: 'text', text, separator });
        }}
      >
        {t('dataImport.read')}
      </Button>
      {source?.data && (
        <p className="text-sm" role="status">
          {t('dataImport.loaded', {
            rows: source.data.rows.length,
            columns: source.data.headers.length,
          })}
        </p>
      )}
    </section>
  );
}
