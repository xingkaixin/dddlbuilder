import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { downloadFile } from '@/utils/mockDataGenerator';
import {
  DATA_IMPORT_PROFILE_BYTES,
  decodeDataImportProfile,
  deleteDataImportProfile,
  readDataImportProfiles,
  saveDataImportProfile,
  type DataImportProfile,
} from '@/utils/business-data/profiles';

export function DataImportProfiles({
  current,
  onApply,
  onError,
}: {
  current: Omit<DataImportProfile, 'name'> | null;
  onApply: (profile: DataImportProfile) => void;
  onError: (cause: unknown) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');

  const [storage, setStorage] = useState(() => {
    try {
      return { profiles: readDataImportProfiles(), error: '' };
    } catch {
      const profiles: DataImportProfile[] = [];

      return { profiles, error: 'dataImport.errors.storage' };
    }
  });
  const { profiles: saved, error } = storage;
  const [selected, setSelected] = useState('');

  const perform = (action: () => void) => {
    try {
      action();
    } catch (cause) {
      onError(cause);
    }
  };
  const profile = () => {
    if (!current) throw new Error('dataImport.errors.empty');

    return decodeDataImportProfile(JSON.stringify({ ...current, name: name.trim() }));
  };

  return (
    <details className="rounded-md border p-4">
      <summary className="cursor-pointer text-sm font-medium">{t('dataImport.profiles')}</summary>
      <div className="mt-4 space-y-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t('dataImport.profilesHint')}
        </p>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {t(error)}
          </p>
        )}
        <label className="block space-y-2 text-sm">
          <span>{t('dataImport.profileName')}</span>
          <Input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!current || !name.trim()}
            onClick={() =>
              perform(() => {
                saveDataImportProfile(profile());
                setStorage({ profiles: readDataImportProfiles(), error: '' });
              })
            }
          >
            {t('dataImport.saveProfile')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!current || !name.trim()}
            onClick={() =>
              perform(() =>
                downloadFile(
                  JSON.stringify(profile(), null, 2),
                  'data-import-profile.json',
                  'application/json;charset=utf-8',
                ),
              )
            }
          >
            {t('dataImport.exportProfile')}
          </Button>
        </div>
        <label className="block space-y-2 text-sm">
          <span>{t('dataImport.savedProfiles')}</span>
          <select
            className="h-9 w-full rounded-md border bg-background px-3"
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
          >
            <option value="">{t('dataImport.chooseProfile')}</option>
            {saved.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!selected || !current}
            onClick={() =>
              perform(() => {
                const item = saved.find((candidate) => candidate.name === selected);

                if (item) {
                  onApply(item);
                  setName(item.name);
                }
              })
            }
          >
            {t('dataImport.loadProfile')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!selected}
            onClick={() =>
              perform(() => {
                deleteDataImportProfile(selected);
                setStorage({ profiles: readDataImportProfiles(), error: '' });
                setSelected('');
              })
            }
          >
            {t('dataImport.deleteProfile')}
          </Button>
        </div>
        <label className="block space-y-2 text-sm">
          <span>{t('dataImport.importProfile')}</span>
          <Input
            type="file"
            accept=".json"
            disabled={!current}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = '';

              if (!file) return;

              try {
                if (file.size > DATA_IMPORT_PROFILE_BYTES)
                  throw new Error('dataImport.errors.profile');
                const imported = decodeDataImportProfile(await file.text());
                onApply(imported);
                setName(imported.name);
              } catch (cause) {
                onError(cause);
              }
            }}
          />
        </label>
      </div>
    </details>
  );
}
