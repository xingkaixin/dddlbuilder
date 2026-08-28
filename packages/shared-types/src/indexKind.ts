export type IndexKind = 'index' | 'unique_index' | 'unique_constraint' | 'primary';

export const isIndexKind = (value: unknown): value is IndexKind =>
  value === 'index' ||
  value === 'unique_index' ||
  value === 'unique_constraint' ||
  value === 'primary';

export const indexKindOf = (value: {
  kind?: unknown;
  unique?: unknown;
  isPrimary?: unknown;
  isUniqueConstraint?: unknown;
}): IndexKind => {
  if (isIndexKind(value.kind)) return value.kind;
  if (value.isPrimary === true) return 'primary';
  if (value.unique !== true) return 'index';
  return value.isUniqueConstraint === true ? 'unique_constraint' : 'unique_index';
};

export const toLegacyIndexFlags = (kind: IndexKind) => ({
  unique: kind !== 'index',
  isPrimary: kind === 'primary',
  ...(kind === 'unique_constraint' ? { isUniqueConstraint: true } : {}),
});
