import type { ORMModelInput, ORMTarget } from '../interfaces/ORMGenerator.js';
import { ORMGeneratorFactory } from '../factories/ORMGeneratorFactory.js';
import { mapCanonicalToORMType } from './ormTypeResolver.js';
import { getForeignKeyIssue } from './foreignKeys.js';

export const buildORM = (target: ORMTarget, input: ORMModelInput): string => {
  const { tableName, fields } = input;
  if (!tableName.trim()) {
    return '-- 请填写表名';
  }
  if (fields.length === 0) {
    return '-- 请补充字段信息';
  }
  const generator = ORMGeneratorFactory.create(target);
  for (const field of fields) {
    try {
      mapCanonicalToORMType(target, field.type);
    } catch {
      const comment = target === 'sqlalchemy' ? '#' : '//';
      return `${comment} Manual mapping required: column ${JSON.stringify(field.name)} has unsupported ${target} type ${JSON.stringify(field.type)}.`;
    }
  }
  for (const foreignKey of input.foreignKeys ?? []) {
    const issue = getForeignKeyIssue(foreignKey, input.dbType);
    if (issue) {
      const comment = target === 'sqlalchemy' ? '#' : '//';
      return `${comment} Manual mapping required: foreign key ${JSON.stringify(foreignKey.name)}. ${issue.message}.`;
    }
  }

  return generator.generateModel({
    ...input,
    tableName: tableName.trim(),
    schemaName: input.schemaName?.trim(),
  });
};
