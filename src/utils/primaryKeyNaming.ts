import { getSchemaAndTable } from './databaseTypeMapping';

export const buildPrimaryKeyName = (tableName: string) => {
  const { table } = getSchemaAndTable(tableName);
  const base = table || tableName.trim();
  return base ? `pk_${base}` : 'pk';
};
