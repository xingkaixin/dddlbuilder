import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';
import { create } from 'zustand';
import { DATABASE_TYPES, type DatabaseType, type SqlFormatMode } from '@ddlbuilder/shared-types';

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

const decodeStoredPreferencesObject = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.JsonObject),
);
const decodeFont = Schema.decodeUnknownOption(Schema.Literals(['hand', 'plain']));
const decodeDensity = Schema.decodeUnknownOption(Schema.Literals(['comfortable', 'compact']));
const decodeDefaultDatabase = Schema.decodeUnknownOption(Schema.Literals(DATABASE_TYPES));
const decodeLayout = Schema.decodeUnknownOption(
  Schema.Literals(['side', 'split', 'design', 'output']),
);
const decodeHiddenFieldColumns = Schema.decodeUnknownOption(
  Schema.Array(Schema.Literals(FIELD_COLUMNS)).pipe(Schema.mutable),
);
const decodeSqlFormatMode = Schema.decodeUnknownOption(Schema.Literals(['compact', 'aligned']));
const decodeAddRowCount = Schema.decodeUnknownOption(
  Schema.Int.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(100)),
);
const decodePinnedTools = Schema.decodeUnknownOption(
  Schema.Array(Schema.String).pipe(Schema.mutable),
);
const decodeChecklistDismissed = Schema.decodeUnknownOption(Schema.Boolean);

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

  const parsed = decodeStoredPreferencesObject(stored);

  if (Option.isNone(parsed)) return createDefaultPreferences();

  const record = parsed.value;

  return {
    font: Option.getOrElse(decodeFont(record.font), () => defaultPreferences.font),
    density: Option.getOrElse(decodeDensity(record.density), () => defaultPreferences.density),
    defaultDatabase: Option.getOrElse(
      decodeDefaultDatabase(record.defaultDatabase),
      () => defaultPreferences.defaultDatabase,
    ),
    layout: Option.getOrElse(decodeLayout(record.layout), () => defaultPreferences.layout),
    hiddenFieldColumns: Option.getOrElse(
      decodeHiddenFieldColumns(record.hiddenFieldColumns),
      () => [...defaultPreferences.hiddenFieldColumns],
    ),
    sqlFormatMode: Option.getOrElse(
      decodeSqlFormatMode(record.sqlFormatMode),
      () => defaultPreferences.sqlFormatMode,
    ),
    addRowCount: Option.getOrElse(
      decodeAddRowCount(record.addRowCount),
      () => defaultPreferences.addRowCount,
    ),
    pinnedTools: Option.getOrElse(decodePinnedTools(record.pinnedTools), () => [
      ...defaultPreferences.pinnedTools,
    ]),
    checklistDismissed: Option.getOrElse(
      decodeChecklistDismissed(record.checklistDismissed),
      () => defaultPreferences.checklistDismissed,
    ),
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
