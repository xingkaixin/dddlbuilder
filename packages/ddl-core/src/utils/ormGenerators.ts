import type {
  NormalizedField,
  IndexDefinition,
  ForeignKeyDefinition,
} from '@ddlbuilder/shared-types';
import type { ORMTarget } from '../interfaces/ORMGenerator.js';
import { ORMGeneratorFactory } from '../factories/ORMGeneratorFactory.js';

export const buildORM = (
  target: ORMTarget,
  tableName: string,
  tableComment: string,
  fields: NormalizedField[],
  indexes: IndexDefinition[] = [],
  foreignKeys: ForeignKeyDefinition[] = [],
): string => {
  if (!tableName.trim()) {
    return '-- 请填写表名';
  }
  if (fields.length === 0) {
    return '-- 请补充字段信息';
  }

  const generator = ORMGeneratorFactory.create(target);
  return generator.generateModel(tableName.trim(), tableComment, fields, indexes, foreignKeys);
};
