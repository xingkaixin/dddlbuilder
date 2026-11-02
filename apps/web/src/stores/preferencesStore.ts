import { create } from 'zustand';
import type { DatabaseType, SqlFormatMode } from '@ddlbuilder/shared-types';

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
};

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

  if (!stored) return { ...defaultPreferences, layout: legacyLayout() };

  try {
    // SAFETY: only this store writes the key, and every field keeps a default for older versions.
    return { ...defaultPreferences, ...(JSON.parse(stored) as Partial<Preferences>) };
  } catch {
    return defaultPreferences;
  }
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
