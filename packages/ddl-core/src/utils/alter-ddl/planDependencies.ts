import type { DatabaseType, IndexDefinition } from '@ddlbuilder/shared-types';
import type { IndexDiff, TableDiff } from '../tableDiff';
import { getDatabaseFamily } from '../databaseFamily';
import { getSchemaAndTable } from '../databaseTypeMapping';
import { getSqlIdentifierKey } from '../sqlIdentifiers';

export function planDependencies(tableName: string, diff: TableDiff, dbType: DatabaseType) {
  const family = getDatabaseFamily(dbType);
  const key = (name: string) => getSqlIdentifierKey(name, dbType);
  const indexRenames: { oldIndex: IndexDefinition; newIndex: IndexDefinition }[] = [];
  const consumed = new Set<IndexDiff>();
  const removedIndexes = diff.indexes.filter((change) => change.type === 'remove');
  const removedNames = new Set(removedIndexes.map((change) => key(change.index.name)));
  const fieldRenames = new Map(
    diff.fields.flatMap((field) =>
      field.type === 'rename' && field.oldFieldName && field.newFieldName
        ? [[key(field.oldFieldName), key(field.newFieldName)] as const]
        : [],
    ),
  );

  if (family === 'postgresql') {
    for (const removal of removedIndexes) {
      const oldIndex = removal.index;
      const addition = diff.indexes.find(
        (change) =>
          change.type === 'add' &&
          !consumed.has(change) &&
          change.index.kind === oldIndex.kind &&
          (!removedNames.has(key(change.index.name)) ||
            key(change.index.name) === key(oldIndex.name)) &&
          change.index.fields.length === oldIndex.fields.length &&
          oldIndex.fields.every((field, position) => {
            const next = change.index.fields[position];
            return (
              (fieldRenames.get(key(field.name)) ?? key(field.name)) === key(next.name) &&
              field.direction === next.direction
            );
          }),
      );
      if (!addition) continue;
      consumed.add(removal);
      consumed.add(addition);
      if (key(oldIndex.name) !== key(addition.index.name)) {
        indexRenames.push({ oldIndex, newIndex: addition.index });
      }
    }
  }

  const indexes = diff.indexes.filter((change) => !consumed.has(change));
  const removedFields = new Set(
    diff.fields.filter((field) => field.type === 'remove').map((field) => key(field.fieldName)),
  );
  const changedTypes = new Set(
    diff.fields
      .filter((field) => field.changes?.includes('type'))
      .map((field) => key(field.oldField?.name ?? field.oldFieldName ?? field.fieldName)),
  );
  const droppedKeys = indexes.filter(
    (change) => change.type === 'remove' && (family === 'mysql' || change.index.kind !== 'index'),
  );
  const oldTable = getSchemaAndTable(tableName);
  const foreignKeys = [...(diff.foreignKeys ?? [])];
  const targetIndexes = [
    ...(diff.unchangedIndexes ?? []),
    ...diff.indexes.filter((change) => change.type === 'add').map((change) => change.index),
  ];
  const matchesPrefix = (index: IndexDefinition, names: string[]) =>
    names.every((name, position) => key(index.fields[position]?.name ?? '') === key(name));
  const matchesReferencedKey = (index: IndexDefinition, names: string[]) =>
    family === 'postgresql'
      ? index.fields.length === names.length &&
        names.every((name) => index.fields.some((field) => key(field.name) === key(name)))
      : matchesPrefix(index, names);

  for (const foreignKey of diff.unchangedForeignKeys ?? []) {
    const selfReference =
      key(foreignKey.refTable) === key(oldTable.table) &&
      key(foreignKey.refSchema ?? '') === key(oldTable.schema);
    const fields = [...foreignKey.fields, ...(selfReference ? foreignKey.refFields : [])];
    if (fields.some((field) => removedFields.has(key(field)))) {
      return {
        error: `unchanged foreign key ${foreignKey.name} still references a removed column`,
      };
    }
    const replacesReferencedKey =
      selfReference &&
      droppedKeys.some(({ index }) => matchesReferencedKey(index, foreignKey.refFields));
    if (
      replacesReferencedKey &&
      !targetIndexes.some(
        (index) =>
          index.kind !== 'index' &&
          index.fields.length === foreignKey.refFields.length &&
          matchesReferencedKey(index, foreignKey.refFields),
      )
    ) {
      return {
        error: `cannot verify a supported unique referenced key for unchanged foreign key ${foreignKey.name}`,
      };
    }
    const replacesLocalIndex =
      family === 'mysql' &&
      droppedKeys.some(({ index }) => matchesPrefix(index, foreignKey.fields));
    if (
      !replacesReferencedKey &&
      !replacesLocalIndex &&
      !fields.some((field) => changedTypes.has(key(field)))
    )
      continue;
    foreignKeys.push({ type: 'remove', foreignKey }, { type: 'add', foreignKey });
  }

  return {
    indexes,
    indexRenames,
    foreignKeys,
    needsExternalDependencyReview:
      changedTypes.size > 0 || removedFields.size > 0 || droppedKeys.length > 0,
  };
}
