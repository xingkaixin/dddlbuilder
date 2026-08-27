import type { DatabaseType, NormalizedField } from '@ddlbuilder/shared-types';
import { getDatabaseFamily } from '../utils/databaseFamily';
import { getFieldTypeForDatabase, parseFieldType } from '../utils/databaseTypeMapping';
import { mapCanonicalToORMType } from '../utils/ormTypeResolver';

const lengthTypes = new Set([
  'char',
  'varchar',
  'nchar',
  'nvarchar',
  'binary',
  'varbinary',
  'varchar2',
  'nvarchar2',
  'raw',
]);
const numericTypes = new Set([
  'decimal',
  'numeric',
  'number',
  'float',
  'double',
  'double precision',
  'real',
]);
const temporalTypes = new Set([
  'time',
  'timetz',
  'time with time zone',
  'time without time zone',
  'datetime',
  'datetime2',
  'datetimeoffset',
  'timestamp',
  'timestamptz',
  'timestamp with time zone',
  'timestamp without time zone',
]);
const widthTypes = new Set(['tinyint', 'smallint', 'mediumint', 'int', 'integer', 'bigint', 'bit']);

export function resolveTypeORMColumn(field: NormalizedField, dbType: DatabaseType) {
  const family = getDatabaseFamily(dbType);
  const sqlType = getFieldTypeForDatabase(dbType, field.type).replace(
    /\s+(?:AUTO_INCREMENT|IDENTITY\b.*)$/i,
    '',
  );
  const parameters = sqlType.match(/\(([^()]*)\)/);
  const args = parameters ? parameters[1].split(',').map((arg) => arg.trim()) : [];
  const parsed = parseFieldType(sqlType.replace(/\([^()]*\)/, ''));
  const isSerial = /^(?:big)?serial$/.test(parseFieldType(field.type).baseType);
  const type =
    parsed.baseType === 'serial'
      ? 'integer'
      : parsed.baseType === 'bigserial'
        ? 'bigint'
        : parsed.baseType;
  const options: Record<string, string | number | boolean> = { type };

  if (parsed.unsigned) options.unsigned = true;
  if (args.length > 0) {
    const parameterName = lengthTypes.has(type)
      ? 'length'
      : numericTypes.has(type) || temporalTypes.has(type)
        ? 'precision'
        : family === 'mysql' && widthTypes.has(type)
          ? 'width'
          : null;
    if (
      !parameterName ||
      args.some((arg) => !arg) ||
      args.length > (numericTypes.has(type) ? 2 : 1)
    )
      return null;
    const value = Number(args[0]);
    if (parameterName === 'length' && args[0].toLowerCase() === 'max' && family === 'sqlserver') {
      options.length = 'MAX';
    } else {
      if (!Number.isSafeInteger(value) || value < 0) return null;
      options[parameterName] = value;
    }
    if (args.length === 2) {
      const scale = Number(args[1]);
      if (!Number.isSafeInteger(scale)) return null;
      options.scale = scale;
    }
  }

  let propertyType = mapCanonicalToORMType('typeorm', type);
  if (
    type === 'bigint' ||
    ((family === 'mysql' || family === 'postgresql') && (type === 'decimal' || type === 'numeric'))
  )
    propertyType = 'string';
  if (family === 'mysql' && type === 'bit') propertyType = 'Buffer';

  return {
    options,
    propertyType,
    autoIncrement: field.defaultKind === 'auto_increment' || isSerial,
  };
}
