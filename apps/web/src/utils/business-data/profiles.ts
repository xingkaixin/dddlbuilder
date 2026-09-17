import * as Schema from 'effect/Schema';
import type { BusinessData, DataImportColumn, DataImportTarget } from '@ddlbuilder/ddl-core';

const text = Schema.String.check(Schema.isMaxLength(200));
export const DataImportProfileSchema = Schema.Struct({
  version: Schema.Literal(1),
  name: text.check(Schema.isMinLength(1)),
  mode: Schema.Literals(['new', 'existing']),
  dbType: Schema.Literals(['mysql', 'postgresql']),
  tableName: text,
  schemaName: text,
  separator: Schema.Literals([',', '\t', ';']),
  options: Schema.Struct({
    dateFormat: Schema.Literals(['iso', 'dmy', 'mdy']),
    trim: Schema.Boolean,
    emptyAsNull: Schema.Boolean,
  }),
  columns: Schema.Array(
    Schema.Struct({
      source: Schema.NullOr(Schema.String.check(Schema.isMaxLength(10000))),
      name: text,
      type: text,
      nullable: Schema.Boolean,
    }),
  ).check(Schema.isMinLength(1), Schema.isMaxLength(100)),
});

export type DataImportProfile = typeof DataImportProfileSchema.Type;

export const DATA_IMPORT_PROFILE_BYTES = 256 * 1024;
const storageKey = 'ddlbuilder:business-data-profiles:v1';

export function decodeDataImportProfile(text: string): DataImportProfile {
  try {
    if (new TextEncoder().encode(text).length > DATA_IMPORT_PROFILE_BYTES) throw new Error();
    const input: unknown = JSON.parse(text);

    const profile = Schema.decodeUnknownSync(DataImportProfileSchema)(input, {
      onExcessProperty: 'error',
    });

    if (
      !profile.name.trim() ||
      new Set(profile.columns.map((column) => column.name)).size !== profile.columns.length
    )
      throw new Error();

    return profile;
  } catch {
    throw new Error('dataImport.errors.profile');
  }
}

export function readDataImportProfiles(): DataImportProfile[] {
  const stored = localStorage.getItem(storageKey);

  if (!stored) return [];

  const profiles = Schema.decodeUnknownSync(
    Schema.Array(DataImportProfileSchema).check(Schema.isMaxLength(50)),
  )(JSON.parse(stored), { onExcessProperty: 'error' });

  return [...profiles];
}

export function saveDataImportProfile(profile: DataImportProfile): void {
  const checked = decodeDataImportProfile(JSON.stringify(profile));
  const saved = readDataImportProfiles();

  if (saved.some((item) => item.name === checked.name))
    throw new Error('dataImport.errors.profileName');

  if (saved.length >= 50) throw new Error('dataImport.errors.profileLimit');
  localStorage.setItem(storageKey, JSON.stringify([...saved, checked]));
}

export function deleteDataImportProfile(name: string): void {
  localStorage.setItem(
    storageKey,
    JSON.stringify(readDataImportProfiles().filter((item) => item.name !== name)),
  );
}

export function applyDataImportProfile(
  profile: DataImportProfile,
  data: BusinessData,
  target: DataImportTarget | null,
): DataImportColumn[] {
  if (
    profile.columns.some(
      (column) => column.source !== null && !data.headers.includes(column.source),
    )
  )
    throw new Error('dataImport.errors.profileSource');

  if (profile.mode === 'new') return profile.columns.map((column) => ({ ...column }));

  if (
    !target ||
    target.dbType !== profile.dbType ||
    target.tableName !== profile.tableName ||
    target.schemaName !== profile.schemaName ||
    profile.columns.some((column) => !target.fields.some((field) => field.name === column.name))
  )
    throw new Error('dataImport.errors.profileTarget');

  return target.fields.map((field) => ({
    source: profile.columns.find((column) => column.name === field.name)?.source ?? null,
    name: field.name,
    type: field.type,
    nullable: field.nullable,
  }));
}
