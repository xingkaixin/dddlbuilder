import type { ForeignKeyDefinition } from '@ddlbuilder/shared-types';
import type { ORMModelInput, ORMTarget } from '../interfaces/ORMGenerator.js';
import { toCamelCase, toPascalCase } from './shared.js';

const reservedProperties: Record<ORMTarget, Set<string>> = {
  typeorm: new Set(['constructor']),
  prisma: new Set(),
  gorm: new Set(['TableName']),
  sqlalchemy: new Set(
    `False None True and as assert async await break class continue def del elif else except
    finally for from global if import in is lambda nonlocal not or pass raise return try while
    with yield metadata Column Integer String BigInteger SmallInteger Numeric Float Boolean
    Date DateTime Time Text LargeBinary JSON Index ForeignKeyConstraint func text literal_column`.split(
      /\s+/,
    ),
  ),
  jpa: new Set(
    `abstract assert boolean break byte case catch char class const continue default do double
    else enum extends final finally float for goto if implements import instanceof int interface
    long native new package private protected public return short static strictfp super switch
    synchronized this throw throws transient try void volatile while true false null _`.split(
      /\s+/,
    ),
  ),
};

function propertyIdentifier(target: ORMTarget, name: string): string {
  const sanitized = name.replace(/[^A-Za-z0-9_]/g, '_');
  let candidate =
    target === 'sqlalchemy'
      ? sanitized
      : target === 'gorm'
        ? toPascalCase(sanitized)
        : toCamelCase(sanitized);
  const validStart = target === 'prisma' || target === 'gorm' ? /^[A-Za-z]/ : /^[A-Za-z_]/;
  if (!validStart.test(candidate) || (target === 'sqlalchemy' && /^(__|_sa_)/.test(candidate))) {
    candidate = `${target === 'gorm' ? 'Field' : 'field'}_${candidate}`;
  }
  if (
    reservedProperties[target].has(candidate) ||
    (target === 'jpa' && toPascalCase(candidate) === 'Class')
  ) {
    candidate += '_';
  }
  return candidate;
}

function createPropertyAllocator(target: ORMTarget) {
  const used = new Set<string>();
  const nextSuffix = new Map<string, number>();
  const identity = target === 'jpa' ? toPascalCase : (name: string) => name;

  return (name: string): string => {
    const base = propertyIdentifier(target, name);
    let candidate = base;
    let suffix = nextSuffix.get(identity(base)) ?? 2;
    while (used.has(identity(candidate))) {
      candidate = `${base}_${suffix++}`;
    }
    nextSuffix.set(identity(base), suffix);
    used.add(identity(candidate));
    return candidate;
  };
}

export function buildORMPropertyNames(
  target: ORMTarget,
  {
    fields,
    foreignKeys = [],
    tableName,
    schemaName = '',
  }: Pick<ORMModelInput, 'fields' | 'foreignKeys' | 'tableName' | 'schemaName'>,
) {
  const allocate = createPropertyAllocator(target);
  const fieldNames = new Map(fields.map((field) => [field.name, allocate(field.name)]));
  const relationSource = (foreignKey: ForeignKeyDefinition) =>
    foreignKey.name || `${foreignKey.refTable}_relation`;
  const relationNames = new Map(
    foreignKeys.map((foreignKey) => [foreignKey, allocate(relationSource(foreignKey))]),
  );
  const referencedFields = new Map<string, Map<string, string>>();
  const referenceKey = (foreignKey: ForeignKeyDefinition) =>
    JSON.stringify([foreignKey.refSchema || schemaName, foreignKey.refTable]);

  for (const foreignKey of foreignKeys) {
    const key = referenceKey(foreignKey);
    const names = referencedFields.get(key) ?? new Map<string, string>();
    for (const name of foreignKey.refFields) names.set(name, '');
    referencedFields.set(key, names);
  }
  for (const names of referencedFields.values()) {
    const allocateReference = createPropertyAllocator(target);
    for (const name of names.keys()) names.set(name, allocateReference(name));
  }

  const field = (name: string) => fieldNames.get(name) ?? propertyIdentifier(target, name);
  return {
    field,
    relation: (foreignKey: ForeignKeyDefinition) =>
      relationNames.get(foreignKey) ?? propertyIdentifier(target, relationSource(foreignKey)),
    reference: (foreignKey: ForeignKeyDefinition, name: string) =>
      foreignKey.refTable === tableName &&
      (!foreignKey.refSchema || foreignKey.refSchema === schemaName)
        ? field(name)
        : (referencedFields.get(referenceKey(foreignKey))?.get(name) ??
          propertyIdentifier(target, name)),
  };
}
