import { create } from 'zustand';
import { isDatabaseType, type DatabaseType, type SqlFormatMode } from '@ddlbuilder/shared-types';

export type InterfaceFont = 'hand' | 'plain';

export type Density = 'comfortable' | 'compact';

export type EditorLayout = 'side' | 'split' | 'design' | 'output';

export const FIELD_COLUMNS = [
  'fieldComment',
  'fieldType',
  'nullable',
  'default',
  'onUpdate',
] as const;

export type FieldColumn = (typeof FIELD_COLUMNS)[number];

export interface Preferences {
  font: InterfaceFont;
  density: Density;
  defaultDatabase: DatabaseType;
  layout: EditorLayout;
  hiddenFieldColumns: FieldColumn[];
  sqlFormatMode: SqlFormatMode;
  addRowCount: number;
  pinnedTools: string[];
  checklistDismissed: boolean;
}

interface PreferencesState extends Preferences {
  setPreference: <Key extends keyof Preferences>(key: Key, value: Preferences[Key]) => void;
}

const preferencesKey = 'ddlbuilder:preferences:v1';
const legacyEditorViewKey = 'ddlbuilder:editor-view';

const defaultPreferences: Preferences = {
  font: 'hand',
  density: 'comfortable',
  defaultDatabase: 'mysql',
  layout: 'side',
  hiddenFieldColumns: ['onUpdate'],
  sqlFormatMode: 'compact',
  addRowCount: 10,
  pinnedTools: [],
  checklistDismissed: false,
};

const createDefaultPreferences = (): Preferences => ({
  ...defaultPreferences,
  hiddenFieldColumns: [...defaultPreferences.hiddenFieldColumns],
  pinnedTools: [...defaultPreferences.pinnedTools],
});

const FIELD_COLUMN_SET = new Set<string>(FIELD_COLUMNS);

interface StoredPreferencesRecord {
  font?: unknown;
  density?: unknown;
  defaultDatabase?: unknown;
  layout?: unknown;
  hiddenFieldColumns?: unknown;
  sqlFormatMode?: unknown;
  addRowCount?: unknown;
  pinnedTools?: unknown;
  checklistDismissed?: unknown;
}

const isFieldColumn = (value: unknown): value is FieldColumn =>
  typeof value === 'string' && FIELD_COLUMN_SET.has(value);

function parseStoredObject(raw: string): StoredPreferencesRecord | null {
  try {
    const parsed: unknown = JSON.parse(raw);

    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- localStorage JSON is parsed at the storage boundary.
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

    // SAFETY: the preceding check ensures parsed is a non-null, non-array JSON object.
    return parsed as StoredPreferencesRecord;
  } catch {
    return null;
  }
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function legacyLayout(): EditorLayout {
  const view = readStorage(legacyEditorViewKey);

  return view === 'output' || view === 'design' || view === 'split'
    ? view
    : defaultPreferences.layout;
}

function readPreferences(): Preferences {
  const stored = readStorage(preferencesKey);

  if (!stored) return { ...createDefaultPreferences(), layout: legacyLayout() };

  const record = parseStoredObject(stored);

  if (!record) return createDefaultPreferences();

  const font: InterfaceFont =
    record.font === 'hand' || record.font === 'plain' ? record.font : defaultPreferences.font;
  const density: Density =
    record.density === 'comfortable' || record.density === 'compact'
      ? record.density
      : defaultPreferences.density;
  const defaultDatabase: DatabaseType = isDatabaseType(record.defaultDatabase)
    ? record.defaultDatabase
    : defaultPreferences.defaultDatabase;
  const layout: EditorLayout =
    record.layout === 'side' ||
    record.layout === 'split' ||
    record.layout === 'design' ||
    record.layout === 'output'
      ? record.layout
      : defaultPreferences.layout;
  const hiddenFieldColumns: FieldColumn[] =
    Array.isArray(record.hiddenFieldColumns) && record.hiddenFieldColumns.every(isFieldColumn)
      ? [...record.hiddenFieldColumns]
      : [...defaultPreferences.hiddenFieldColumns];
  const sqlFormatMode: SqlFormatMode =
    record.sqlFormatMode === 'compact' || record.sqlFormatMode === 'aligned'
      ? record.sqlFormatMode
      : defaultPreferences.sqlFormatMode;
  const addRowCount: number =
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- localStorage field is validated at the storage boundary.
    typeof record.addRowCount === 'number' &&
    Number.isInteger(record.addRowCount) &&
    record.addRowCount >= 1 &&
    record.addRowCount <= 100
      ? record.addRowCount
      : defaultPreferences.addRowCount;
  const pinnedTools: string[] =
    Array.isArray(record.pinnedTools) &&
    record.pinnedTools.every((item): item is string => typeof item === 'string')
      ? [...record.pinnedTools]
      : [...defaultPreferences.pinnedTools];
  const checklistDismissed: boolean =
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- localStorage field is validated at the storage boundary.
    typeof record.checklistDismissed === 'boolean'
      ? record.checklistDismissed
      : defaultPreferences.checklistDismissed;

  return {
    font,
    density,
    defaultDatabase,
    layout,
    hiddenFieldColumns,
    sqlFormatMode,
    addRowCount,
    pinnedTools,
    checklistDismissed,
  };
}

function pickPreferences(state: PreferencesState): Preferences {
  const { setPreference: _setPreference, ...preferences } = state;

  return preferences;
}

function applyToDocument({ font, density }: Preferences) {
  const { dataset } = document.documentElement;

  dataset.font = font;
  dataset.density = density;
}

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  ...readPreferences(),
  setPreference: (key, value) => {
    set({ [key]: value });

    try {
      localStorage.setItem(preferencesKey, JSON.stringify(pickPreferences(get())));
    } catch {
      // The choice still applies for this session when storage is unavailable.
    }
  },
}));

export function syncPreferencesToDocument() {
  applyToDocument(usePreferencesStore.getState());

  return usePreferencesStore.subscribe(applyToDocument);
}
