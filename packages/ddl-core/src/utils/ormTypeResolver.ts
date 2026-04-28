import { ORM_TYPE_MAPPINGS } from '../configs/ormTypeMappings.js';
import type { ORMTarget } from '../interfaces/ORMGenerator.js';
import { canonicalizeBaseType, parseFieldType } from './databaseTypeMapping.js';

export function mapCanonicalToORMType(ormTarget: ORMTarget, fieldType: string): string {
  const parsed = parseFieldType(fieldType);
  const canonical = canonicalizeBaseType(parsed.baseType);
  return ORM_TYPE_MAPPINGS[ormTarget]?.[canonical] ?? 'String';
}

export function getORMTypeWithArgs(ormTarget: ORMTarget, fieldType: string): string {
  const parsed = parseFieldType(fieldType);
  const canonical = canonicalizeBaseType(parsed.baseType);
  const baseMapped = ORM_TYPE_MAPPINGS[ormTarget]?.[canonical] ?? 'String';

  if (ormTarget === 'sqlalchemy') {
    // SQLAlchemy needs args for String, Numeric, etc.
    if (['String', 'LargeBinary'].includes(baseMapped) && parsed.args.length > 0) {
      return `${baseMapped}(${parsed.args.join(', ')})`;
    }
    if (baseMapped === 'Numeric' && parsed.args.length > 0) {
      return `${baseMapped}(${parsed.args.join(', ')})`;
    }
    return baseMapped;
  }

  return baseMapped;
}
