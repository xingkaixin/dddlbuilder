import type { ORMGenerator, ORMModelInput } from '../interfaces/ORMGenerator.js';
import { mapCanonicalToORMType } from '../utils/ormTypeResolver.js';
import { escapeSqlString, getDatabaseFamily } from '../utils/databaseFamily.js';
import {
  buildIndexFieldLookup,
  toCamelCase,
  toPascalCase,
  escapePrismaDefault,
  formatLineComment,
} from './shared.js';

const toReferentialAction = (action: string) =>
  action
    .toLowerCase()
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

export class PrismaGenerator implements ORMGenerator {
  generateModel({
    dbType,
    schemaName = '',
    tableName,
    tableComment,
    fields,
    indexes = [],
    foreignKeys = [],
  }: ORMModelInput): string {
    if (!tableName.trim()) {
      return '-- 请填写表名';
    }
    if (fields.length === 0) {
      return '-- 请补充字段信息';
    }

    const lines: string[] = [];
    const { primaryFields } = buildIndexFieldLookup(indexes);
    const modelName = toPascalCase(tableName.trim());
    const family = getDatabaseFamily(dbType);
    const supportsSchema = family === 'postgresql' || family === 'sqlserver';

    if (schemaName) {
      lines.push(
        supportsSchema
          ? `// Add ${JSON.stringify(schemaName)} to datasource.schemas.`
          : `// Select database ${JSON.stringify(schemaName)} in the datasource connection configuration.`,
      );
    }

    if (tableComment.trim()) {
      lines.push(formatLineComment(tableComment, '/// '));
    }
    lines.push(`model ${modelName} {`);

    for (const field of fields) {
      const fieldName = toCamelCase(field.name);
      const prismaType = mapCanonicalToORMType('prisma', field.type);
      const isPk = primaryFields.has(field.name);
      const isAutoInc = field.defaultKind === 'auto_increment';
      const isNullable = field.nullable && !isPk;

      const decorations: string[] = [];

      if (isPk) {
        if (primaryFields.size === 1) decorations.push('@id');
        if (isAutoInc) {
          decorations.push('@default(autoincrement())');
        }
      } else if (field.defaultKind === 'uuid') {
        decorations.push('@default(uuid())');
      } else if (field.defaultKind === 'current_timestamp') {
        decorations.push('@default(now())');
      } else if (field.defaultKind === 'constant') {
        const value =
          prismaType === 'DateTime'
            ? `dbgenerated(${JSON.stringify("'" + escapeSqlString(field.defaultValue, dbType) + "'")})`
            : prismaType === 'String'
              ? JSON.stringify(field.defaultValue)
              : escapePrismaDefault(field.defaultValue);
        decorations.push(`@default(${value})`);
      }
      if (field.defaultKind === 'expression' && field.defaultValue.trim()) {
        decorations.push(`@default(dbgenerated(${JSON.stringify(field.defaultValue)}))`);
      }
      if (fieldName !== field.name) {
        decorations.push(`@map(${JSON.stringify(field.name)})`);
      }

      if (field.comment.trim()) {
        lines.push(formatLineComment(field.comment, '  /// '));
      }

      const typeStr = isNullable ? `${prismaType}?` : prismaType;
      const decoStr = decorations.length > 0 ? ` ${decorations.join(' ')}` : '';
      lines.push(`  ${fieldName.padEnd(14)} ${typeStr.padEnd(10)}${decoStr}`);
    }

    if (primaryFields.size > 1) {
      lines.push(`  @@id([${[...primaryFields].map(toCamelCase).join(', ')}])`);
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

    for (const fk of foreignKeys) {
      const localFields = fk.fields.map((f) => toCamelCase(f)).join(', ');
      const refFields = fk.refFields.map((f) => toCamelCase(f)).join(', ');
      const relationName = toCamelCase(fk.name || `${fk.refTable}_relation`);
      const relationType = toPascalCase(fk.refTable);
      const isNullable = fk.fields.some(
        (fieldName) => fields.find((field) => field.name === fieldName)?.nullable,
      );
      const options = [
        `fields: [${localFields}]`,
        `references: [${refFields}]`,
        ...(fk.onDelete ? [`onDelete: ${toReferentialAction(fk.onDelete)}`] : []),
        ...(fk.onUpdate ? [`onUpdate: ${toReferentialAction(fk.onUpdate)}`] : []),
        ...(fk.name ? [`map: ${JSON.stringify(fk.name)}`] : []),
      ];
      lines.push(
        `  ${relationName} ${relationType}${isNullable ? '?' : ''} @relation(${options.join(', ')})`,
      );
    }

    if (modelName !== tableName.trim()) {
      lines.push(`  @@map(${JSON.stringify(tableName.trim())})`);
    }
    if (schemaName && supportsSchema) {
      lines.push(`  @@schema(${JSON.stringify(schemaName)})`);
    }
    lines.push('}');
    return lines.join('\n');
  }
}
