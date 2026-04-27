import { parseFieldType } from '@ddlbuilder/ddl-core';

export type FieldTypeRiskKind = 'type_change' | 'length_shrink';

export type FieldTypeRisk = {
  kind: FieldTypeRiskKind;
  fromType: string;
  toType: string;
};

// Map base type names to semantic categories
const TYPE_CATEGORY: Record<string, string> = {
  // String
  varchar: 'string',
  varchar2: 'string',
  nvarchar: 'string',
  nvarchar2: 'string',
  char: 'string',
  nchar: 'string',
  text: 'string',
  mediumtext: 'string',
  longtext: 'string',
  clob: 'string',
  // Integer
  tinyint: 'integer',
  smallint: 'integer',
  int: 'integer',
  integer: 'integer',
  bigint: 'integer',
  // Decimal / floating point
  decimal: 'decimal',
  numeric: 'decimal',
  number: 'decimal',
  float: 'decimal',
  double: 'decimal',
  real: 'decimal',
  // Date / time
  date: 'datetime',
  datetime: 'datetime',
  datetime2: 'datetime',
  timestamp: 'datetime',
  timestamptz: 'datetime',
  time: 'datetime',
  timetz: 'datetime',
  // Boolean / bit
  boolean: 'boolean',
  bool: 'boolean',
  bit: 'boolean',
  // Binary
  blob: 'binary',
  varbinary: 'binary',
  binary: 'binary',
  bytea: 'binary',
  // JSON
  json: 'json',
  jsonb: 'json',
  // UUID
  uuid: 'uuid',
};

// Storage width in bytes for integer narrowing detection
const INTEGER_BYTES: Record<string, number> = {
  tinyint: 1,
  smallint: 2,
  int: 4,
  integer: 4,
  bigint: 8,
};

/**
 * Returns a FieldTypeRisk if changing from oldType to newType is dangerous
 * (cross-category change, length reduction, or integer narrowing), or null otherwise.
 */
export function detectFieldTypeRisk(oldType: string, newType: string): FieldTypeRisk | null {
  if (!oldType || !newType) return null;

  const oldParsed = parseFieldType(oldType);
  const newParsed = parseFieldType(newType);

  if (!oldParsed.baseType || !newParsed.baseType) return null;

  const oldBase = oldParsed.baseType.toLowerCase();
  const newBase = newParsed.baseType.toLowerCase();

  if (oldBase === newBase) {
    // Same base type: detect length / precision reduction via first arg
    if (oldParsed.args.length > 0 && newParsed.args.length > 0) {
      const oldLen = Number(oldParsed.args[0]);
      const newLen = Number(newParsed.args[0]);
      if (!isNaN(oldLen) && !isNaN(newLen) && newLen < oldLen) {
        return { kind: 'length_shrink', fromType: oldType, toType: newType };
      }
    }
    return null;
  }

  const oldCategory = TYPE_CATEGORY[oldBase];
  const newCategory = TYPE_CATEGORY[newBase];

  // Cross-category change always carries data conversion risk
  if (oldCategory && newCategory && oldCategory !== newCategory) {
    return { kind: 'type_change', fromType: oldType, toType: newType };
  }

  // Same integer category but narrower storage
  if (oldCategory === 'integer') {
    const oldBytes = INTEGER_BYTES[oldBase] ?? 0;
    const newBytes = INTEGER_BYTES[newBase] ?? 0;
    if (newBytes > 0 && newBytes < oldBytes) {
      return { kind: 'length_shrink', fromType: oldType, toType: newType };
    }
  }

  return null;
}
