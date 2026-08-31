import { ORM_TYPE_MAPPINGS } from '../configs/ormTypeMappings.js';
import type { ORMTarget } from '../interfaces/ORMGenerator.js';
import { parseFieldType } from './databaseTypeMapping.js';
import { canonicalizeBaseType } from './typeAliases.js';

export function mapCanonicalToORMType(ormTarget: ORMTarget, fieldType: string): string {
  const parsed = parseFieldType(fieldType);
  const canonical = canonicalizeBaseType(parsed.baseType);
  const mappings = ORM_TYPE_MAPPINGS[ormTarget];
  if (!mappings || !Object.hasOwn(mappings, canonical)) {
    throw new Error(`Unsupported ${ormTarget} field type: ${fieldType}`);
  }
  return mappings[canonical];
}

export function getORMTypeWithArgs(ormTarget: ORMTarget, fieldType: string): string {
  const parsed = parseFieldType(fieldType);
  const baseMapped = mapCanonicalToORMType(ormTarget, fieldType);

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
