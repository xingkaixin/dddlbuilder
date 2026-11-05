import { createPortal } from 'react-dom';
import { useTheme } from 'next-themes';
import { useTranslation } from 'react-i18next';
import { useAuthIdentity } from '@/auth/AuthSessionProvider';
import { buttonVariants } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/select';
import { useLocale } from '@/i18n/LocaleContext';
import { LOCALES } from '@/i18n/types';
import { followAppLink } from '@/lib/appNavigation';
import { commandShortcutLabel } from '@/lib/commandShortcut';
import {
  FIELD_COLUMNS,
  usePreferencesStore,
  type Density,
  type EditorLayout,
  type InterfaceFont,
} from '@/stores/preferencesStore';
import { DATABASE_OPTIONS } from '../databaseOptions';
import { useThemeTransition } from '../hooks/useThemeTransition';
import { FIELD_COLUMN_LABELS } from '../table/fieldColumnLabels';
import { AccountSettings, WorkspaceSyncSettings } from './AccountSettings';
import { CreditSettings } from './CreditSettings';
import { Chip, ChoiceChips, SettingGroup, SettingRow } from './SettingRow';

const THEMES = ['system', 'light', 'dark'] as const;

const FONTS = ['hand', 'plain'] as const satisfies readonly InterfaceFont[];

const DENSITIES = ['comfortable', 'compact'] as const satisfies readonly Density[];

const LAYOUTS = ['side', 'split', 'design', 'output'] as const satisfies readonly EditorLayout[];

const ADD_ROW_COUNTS = [1, 5, 10];

function AppearanceSettings() {
  const { t } = useTranslation();
  const { locale, setLocale } = useLocale();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const font = usePreferencesStore((state) => state.font);
  const density = usePreferencesStore((state) => state.density);
  const setPreference = usePreferencesStore((state) => state.setPreference);

  const selectedTheme = theme === 'light' || theme === 'dark' ? theme : 'system';

  const { phase, isTransitioning, targetEffectiveTheme, runThemeTransition } = useThemeTransition({
    theme: selectedTheme,
    resolvedTheme,
    setTheme,
  });

  return (
    <SettingGroup id="appearance" title={t('settingsPage.appearance')}>
      <SettingRow title={t('theme.label')}>
        <ChoiceChips
          label={t('theme.label')}
          value={selectedTheme}
          disabled={isTransitioning}
          options={THEMES.map((value) => ({ value, label: t(`theme.${value}`) }))}
          onChange={runThemeTransition}
        />
      </SettingRow>
      <SettingRow title={t('locale.label')}>
        <ChoiceChips
          label={t('locale.label')}
          value={locale}
          options={LOCALES.map(({ value, label }) => ({ value, label: t(label) }))}
          onChange={setLocale}
        />
      </SettingRow>
      <SettingRow title={t('settingsPage.font')} hint={t('settingsPage.fontHint')}>
        <ChoiceChips
          label={t('settingsPage.font')}
          value={font}
          options={FONTS.map((value) => ({ value, label: t(`settingsPage.fonts.${value}`) }))}
          onChange={(value) => setPreference('font', value)}
        />
      </SettingRow>
      <SettingRow title={t('settingsPage.density')}>
        <ChoiceChips
          label={t('settingsPage.density')}
          value={density}
          options={DENSITIES.map((value) => ({
            value,
            label: t(`settingsPage.densities.${value}`),
          }))}
          onChange={(value) => setPreference('density', value)}
        />
      </SettingRow>
      {(phase === 'wipe' || phase === 'fade') &&
        createPortal(
          <div
            aria-hidden
            data-testid="theme-transition-overlay"
            className={`theme-transition-overlay ${
              phase === 'wipe' ? 'theme-transition-overlay--wipe' : 'theme-transition-overlay--fade'
            } ${
              targetEffectiveTheme === 'dark'
                ? 'theme-transition-overlay--to-dark'
                : 'theme-transition-overlay--to-light'
            }`}
          />,
          document.body,
        )}
    </SettingGroup>
  );
}

function EditorSettings() {
  const { t } = useTranslation();
  const defaultDatabase = usePreferencesStore((state) => state.defaultDatabase);
  const layout = usePreferencesStore((state) => state.layout);
  const hiddenFieldColumns = usePreferencesStore((state) => state.hiddenFieldColumns);
  const sqlFormatMode = usePreferencesStore((state) => state.sqlFormatMode);
  const addRowCount = usePreferencesStore((state) => state.addRowCount);
  const pinnedTools = usePreferencesStore((state) => state.pinnedTools);
  const setPreference = usePreferencesStore((state) => state.setPreference);

  return (
    <SettingGroup id="editor" title={t('settingsPage.editor')}>
      <SettingRow title={t('settingsPage.defaultDatabase')}>
        <SearchableSelect
          value={defaultDatabase}
          onValueChange={(value) => {
            const option = DATABASE_OPTIONS.find((candidate) => candidate.value === value);

            if (option) setPreference('defaultDatabase', option.value);
          }}
          options={DATABASE_OPTIONS.map(({ value, label }) => ({ value, label }))}
          aria-label={t('settingsPage.defaultDatabase')}
          triggerClassName="h-10 w-full rounded-md px-3 text-sm sm:w-56"
          emptyMessage={t('searchableSelect.empty')}
        />
      </SettingRow>
      <SettingRow title={t('settingsPage.layout')}>
        <ChoiceChips
          label={t('settingsPage.layout')}
          value={layout}
          options={LAYOUTS.map((value) => ({ value, label: t(`editorLayout.${value}`) }))}
          onChange={(value) => setPreference('layout', value)}
        />
      </SettingRow>
      <SettingRow title={t('settingsPage.fieldColumns')} hint={t('settingsPage.fieldColumnsHint')}>
        <div
          role="group"
          aria-label={t('settingsPage.fieldColumns')}
          className="flex flex-wrap gap-1 sm:justify-end"
        >
          {FIELD_COLUMNS.map((column) => {
            const hidden = hiddenFieldColumns.includes(column);

            return (
              <Chip
                key={column}
                active={!hidden}
                onClick={() =>
                  setPreference(
                    'hiddenFieldColumns',
                    hidden
                      ? hiddenFieldColumns.filter((item) => item !== column)
                      : [...hiddenFieldColumns, column],
                  )
                }
              >
                {t(`dataTable.headers.${FIELD_COLUMN_LABELS[column]}`)}
              </Chip>
            );
          })}
        </div>
      </SettingRow>
      <SettingRow title={t('settingsPage.sqlFormat')}>
        <ChoiceChips
          label={t('settingsPage.sqlFormat')}
          value={sqlFormatMode}
          options={[
            { value: 'compact', label: t('settingsPage.sqlFormats.compact') },
            { value: 'aligned', label: t('settingsPage.sqlFormats.aligned') },
          ]}
          onChange={(value) => setPreference('sqlFormatMode', value)}
        />
      </SettingRow>
      <SettingRow title={t('settingsPage.addRowCount')}>
        <ChoiceChips
          label={t('settingsPage.addRowCount')}
          value={addRowCount}
          options={ADD_ROW_COUNTS.map((value) => ({ value, label: String(value) }))}
          onChange={(value) => setPreference('addRowCount', value)}
        />
      </SettingRow>
      <SettingRow
        title={t('settingsPage.pinnedTools', { count: pinnedTools.length })}
        hint={t('settingsPage.pinnedToolsHint', { shortcut: commandShortcutLabel() })}
      >
        <a
          href="/tools"
          className={buttonVariants({ variant: 'ghost', size: 'tool' })}
          onClick={(event) => followAppLink(event, '/tools')}
        >
          {t('settingsPage.goToTools')}
        </a>
      </SettingRow>
    </SettingGroup>
  );
}

export function SettingsPage() {
  const { t } = useTranslation();
  const { status } = useAuthIdentity();
  const signedIn = status === 'signed_in';

  const sections = [
    { id: 'appearance', label: t('settingsPage.appearance') },
    { id: 'editor', label: t('settingsPage.editor') },
    ...(signedIn ? [{ id: 'account', label: t('settings.accountTab') }] : []),
    { id: 'workspace', label: t('settings.workspaceTab') },
    ...(signedIn ? [{ id: 'credits', label: t('settings.creditTab') }] : []),
  ];

  return (
    <div className="mx-auto flex w-full max-w-[960px] flex-col gap-8 px-6 pb-14 pt-8">
      <h1 className="text-[28px] font-normal leading-9">{t('settings.title')}</h1>
      <div className="grid items-start gap-10 md:grid-cols-[200px_minmax(0,1fr)]">
        <nav
          aria-label={t('settings.title')}
          className="flex flex-wrap gap-0.5 md:sticky md:top-6 md:flex-col"
        >
          {sections.map(({ id, label }) => (
            <a
              key={id}
              href={`#${id}`}
              className="rounded-md px-3 py-1.5 text-[15px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="flex min-w-0 flex-col gap-10">
          <AppearanceSettings />
          <EditorSettings />
          {signedIn && <AccountSettings />}
          <WorkspaceSyncSettings />
          {signedIn && <CreditSettings />}
        </div>
      </div>
    </div>
  );
}
