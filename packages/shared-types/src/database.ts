export const DATABASE_TYPES = [
  'mysql',
  'postgresql',
  'postgresql-citus',
  'sqlserver',
  'oracle',
  'mariadb',
  'tidb',
  'dm',
  'oceanbase',
  'oceanbase-oracle',
  'kingbase',
  'gbase',
  'polardb',
  'gaussdb',
  'hive',
] as const;

export type DatabaseType = (typeof DATABASE_TYPES)[number];

const DATABASE_TYPE_SET = new Set<string>(DATABASE_TYPES);

export const isDatabaseType = (value: unknown): value is DatabaseType =>
  typeof value === 'string' && DATABASE_TYPE_SET.has(value);

export type ParsedFieldType = {
  baseType: string;
  args: string[];
  unsigned: boolean;
  raw: string;
};
