import type { ORMModelInput, ORMTarget } from '../interfaces/ORMGenerator.js';
import { ORMGeneratorFactory } from '../factories/ORMGeneratorFactory.js';
import { getForeignKeyIssue } from './foreignKeys.js';

export const buildORM = (target: ORMTarget, input: ORMModelInput): string => {
  const { tableName, fields } = input;
  if (!tableName.trim()) {
    return '-- 请填写表名';
  }
  if (fields.length === 0) {
    return '-- 请补充字段信息';
  }
  for (const foreignKey of input.foreignKeys ?? []) {
    const issue = getForeignKeyIssue(foreignKey, input.dbType);
    if (issue) {
      const comment = target === 'sqlalchemy' ? '#' : '//';
      return `${comment} Manual mapping required: foreign key ${JSON.stringify(foreignKey.name)}. ${issue.message}.`;
    }
  }

  const generator = ORMGeneratorFactory.create(target);
  return generator.generateModel({
    ...input,
    tableName: tableName.trim(),
    schemaName: input.schemaName?.trim(),
  });
};
