import type {
  NormalizedField,
  IndexDefinition,
  ForeignKeyDefinition,
} from '@ddlbuilder/shared-types';
import type { ORMGenerator } from '../interfaces/ORMGenerator.js';
import { mapCanonicalToORMType } from '../utils/ormTypeResolver.js';
import { buildIndexFieldLookup, toPascalCase } from './shared.js';

export class GORMGenerator implements ORMGenerator {
  generateModel(
    tableName: string,
    tableComment: string,
    fields: NormalizedField[],
    indexes: IndexDefinition[],
    _foreignKeys: ForeignKeyDefinition[],
  ): string {
    if (!tableName.trim()) {
      return '// 请填写表名';
    }
    if (fields.length === 0) {
      return '// 请补充字段信息';
    }

    const lines: string[] = [];
    const { primaryFields, singleUniqueFields } = buildIndexFieldLookup(indexes);
    const needsTime = fields.some((f) =>
      mapCanonicalToORMType('gorm', f.type).includes('time.Time'),
    );

    lines.push('package models');
    lines.push('');
    if (needsTime) {
      lines.push('import "time"');
      lines.push('');
    }

    if (tableComment.trim()) {
      lines.push(`// ${tableComment.trim()}`);
    }

    const structName = toPascalCase(tableName.trim());
    lines.push(`type ${structName} struct {`);

    for (const field of fields) {
      const fieldName = toPascalCase(field.name);
      const goType = mapCanonicalToORMType('gorm', field.type);
      const isPk = primaryFields.has(field.name);
      const isAutoInc = field.defaultKind === 'auto_increment';
      const isNullable = field.nullable && !isPk;

      const tagParts: string[] = [`column:${field.name}`];

      if (isPk) {
        tagParts.push('primaryKey');
        if (isAutoInc) {
          tagParts.push('autoIncrement');
        }
      }

      if (singleUniqueFields.has(field.name)) {
        tagParts.push('uniqueIndex');
      }

      if (field.comment.trim()) {
        tagParts.push(`comment:${field.comment.trim()}`);
      }

      const tag = `gorm:"${tagParts.join(';')}"`;
      const typeStr = isNullable ? `*${goType}` : goType;
      lines.push(`\t${fieldName.padEnd(14)} ${typeStr.padEnd(14)} \`${tag}\``);
    }

    lines.push('}');
    lines.push('');
    lines.push(`func (${structName}) TableName() string {`);
    lines.push(`\treturn "${tableName.trim()}"`);
    lines.push('}');

    return lines.join('\n');
  }
}
