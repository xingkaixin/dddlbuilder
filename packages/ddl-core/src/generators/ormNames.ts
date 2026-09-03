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
  input: Pick<
    ORMModelInput,
    'fields' | 'foreignKeys' | 'tableName' | 'schemaName' | 'referencedModels'
  >,
) {
  const { fields, foreignKeys = [], tableName, schemaName = '', referencedModels = [] } = input;
  const allocate = createPropertyAllocator(target);
  const fieldNames = new Map(fields.map((field) => [field.name, allocate(field.name)]));
  const relationSource = (foreignKey: ForeignKeyDefinition) =>
    foreignKey.name || `${foreignKey.refTable}_relation`;
  const relationNames = new Map(
    foreignKeys.map((foreignKey) => [foreignKey, allocate(relationSource(foreignKey))]),
  );
  const modelKey = (modelSchema: string | undefined, modelTable: string) =>
    JSON.stringify([(modelSchema ?? schemaName).trim(), modelTable.trim()]);
  const referenceKey = (foreignKey: ForeignKeyDefinition) =>
    modelKey(foreignKey.refSchema, foreignKey.refTable);
  const currentModelKey = modelKey(schemaName, tableName);
  const referencedFields = new Map<string, Map<string, string>>();

  for (const model of referencedModels) {
    const allocateReference = createPropertyAllocator(target);
    referencedFields.set(
      modelKey(model.schemaName, model.tableName),
      new Map(model.fields.map(({ name }) => [name, allocateReference(name)])),
    );
  }

  if (target === 'prisma' || target === 'typeorm' || target === 'gorm') {
    for (const foreignKey of foreignKeys) {
      if (referenceKey(foreignKey) === currentModelKey) continue;
      const qualifiedTarget = [foreignKey.refSchema, foreignKey.refTable].filter(Boolean).join('.');
      const names = referencedFields.get(referenceKey(foreignKey));
      if (!names) {
        return {
          ok: false as const,
          diagnostic: `// Manual mapping required: foreign key ${JSON.stringify(foreignKey.name)} references model ${JSON.stringify(qualifiedTarget)} without complete field metadata in referencedModels.`,
        };
      }
      const missingField = foreignKey.refFields.find((name) => !names.has(name));
      if (missingField) {
        return {
          ok: false as const,
          diagnostic: `// Manual mapping required: foreign key ${JSON.stringify(foreignKey.name)} references column ${JSON.stringify(missingField)}, which is missing from model ${JSON.stringify(qualifiedTarget)} in referencedModels.`,
        };
      }
    }
  }

  const field = (name: string) => fieldNames.get(name) ?? propertyIdentifier(target, name);
  const reference = (foreignKey: ForeignKeyDefinition, name: string) => {
    if (referenceKey(foreignKey) === currentModelKey) return field(name);
    const referencedName = referencedFields.get(referenceKey(foreignKey))?.get(name);
    if (!referencedName) throw new Error('Referenced model metadata was not resolved');
    return referencedName;
  };
  return {
    ok: true as const,
    names: {
      field,
      relation: (foreignKey: ForeignKeyDefinition) =>
        relationNames.get(foreignKey) ?? propertyIdentifier(target, relationSource(foreignKey)),
      reference,
    },
  };
}
