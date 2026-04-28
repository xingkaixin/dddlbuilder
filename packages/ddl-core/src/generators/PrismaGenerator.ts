import type {
  NormalizedField,
  IndexDefinition,
  ForeignKeyDefinition,
} from '@ddlbuilder/shared-types';
import type { ORMGenerator } from '../interfaces/ORMGenerator.js';
import { mapCanonicalToORMType } from '../utils/ormTypeResolver.js';
import { isPrimaryKeyField, toCamelCase, escapePrismaDefault } from './shared.js';

export class PrismaGenerator implements ORMGenerator {
  generateModel(
    tableName: string,
    tableComment: string,
    fields: NormalizedField[],
    indexes: IndexDefinition[],
    foreignKeys: ForeignKeyDefinition[],
  ): string {
    if (!tableName.trim()) {
      return '-- 请填写表名';
    }
    if (fields.length === 0) {
      return '-- 请补充字段信息';
    }

    const lines: string[] = [];

    if (tableComment.trim()) {
      lines.push(`/// ${tableComment.trim()}`);
    }
    lines.push(`model ${toPascalCase(tableName.trim())} {`);

    for (const field of fields) {
      const fieldName = toCamelCase(field.name);
      const prismaType = mapCanonicalToORMType('prisma', field.type);
      const isPk = isPrimaryKeyField(field.name, indexes);
      const isAutoInc = field.defaultKind === 'auto_increment';
      const isNullable = field.nullable && !isPk;

      const decorations: string[] = [];

      if (isPk) {
        decorations.push('@id');
        if (isAutoInc) {
          decorations.push('@default(autoincrement())');
        }
      } else if (field.defaultKind === 'uuid') {
        decorations.push('@default(uuid())');
      } else if (field.defaultKind === 'current_timestamp') {
        decorations.push('@default(now())');
      } else if (field.defaultKind === 'constant' && field.defaultValue) {
        decorations.push(`@default(${escapePrismaDefault(field.defaultValue)})`);
      }

      if (field.comment.trim()) {
        lines.push(`  /// ${field.comment.trim()}`);
      }

      const typeStr = isNullable ? `${prismaType}?` : prismaType;
      const decoStr = decorations.length > 0 ? ` ${decorations.join(' ')}` : '';
      lines.push(`  ${fieldName.padEnd(14)} ${typeStr.padEnd(10)}${decoStr}`);
    }

    // Composite unique indexes
    const compositeUniques = indexes.filter((i) => i.unique && i.fields.length > 1 && !i.isPrimary);
    for (const idx of compositeUniques) {
      const fieldNames = idx.fields.map((f) => toCamelCase(f.name)).join(', ');
      lines.push(`  @@unique([${fieldNames}])`);
    }

    // Normal and unique indexes (skip primary key)
    const nonPrimaryIndexes = indexes.filter((i) => !i.isPrimary && !i.unique);
    const singleUniques = indexes.filter((i) => i.unique && i.fields.length === 1 && !i.isPrimary);

    for (const idx of nonPrimaryIndexes) {
      const fieldNames = idx.fields.map((f) => toCamelCase(f.name)).join(', ');
      lines.push(`  @@index([${fieldNames}])`);
    }

    for (const idx of singleUniques) {
      const fieldNames = idx.fields.map((f) => toCamelCase(f.name)).join(', ');
      lines.push(`  @@unique([${fieldNames}])`);
    }

    // Foreign keys
    for (const fk of foreignKeys) {
      const localFields = fk.fields.map((f) => toCamelCase(f)).join(', ');
      const refFields = fk.refFields.map((f) => toCamelCase(f)).join(', ');
      lines.push(`  @@foreignKey([${localFields}])`);
      lines.push(`  // references ${fk.refTable}(${refFields})`);
    }

    lines.push('}');
    return lines.join('\n');
  }
}

function toPascalCase(str: string): string {
  const camel = str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}
