import type { ORMGenerator, ORMModelInput } from '../interfaces/ORMGenerator.js';
import { mapCanonicalToORMType } from '../utils/ormTypeResolver.js';
import { getDatabaseFamily } from '../utils/databaseFamily.js';
import { buildIndexFieldLookup, toCamelCase, toPascalCase } from './shared.js';

export class TypeORMGenerator implements ORMGenerator {
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
    const { primaryFields, singleUniqueFields } = buildIndexFieldLookup(indexes);

    const decorators = [
      'Entity',
      'Column',
      'Index',
      'PrimaryGeneratedColumn',
      'PrimaryColumn',
      ...(foreignKeys.length > 0 ? ['ManyToOne', 'JoinColumn'] : []),
    ];
    lines.push(`import { ${decorators.join(', ')} } from 'typeorm';`);
    const className = toPascalCase(tableName.trim());
    const referencedEntities = new Map(
      foreignKeys
        .filter((foreignKey) => toPascalCase(foreignKey.refTable) !== className)
        .map((foreignKey) => [toPascalCase(foreignKey.refTable), foreignKey.refTable] as const),
    );
    for (const [referencedClass, referencedTable] of referencedEntities) {
      lines.push(`import { ${referencedClass} } from './${referencedTable}';`);
    }
    lines.push('');

    if (tableComment.trim()) {
      lines.push(`/**`);
      lines.push(` * ${tableComment.trim()}`);
      lines.push(` */`);
    }
    const namespaceOption = getDatabaseFamily(dbType) === 'mysql' ? 'database' : 'schema';
    lines.push(
      schemaName
        ? `@Entity({ name: ${JSON.stringify(tableName.trim())}, ${namespaceOption}: ${JSON.stringify(schemaName)} })`
        : `@Entity('${tableName.trim()}')`,
    );

    const classIndexes: string[] = [];

    // Collect composite unique and normal indexes
    for (const idx of indexes) {
      if (idx.isPrimary) continue;
      const fieldNames = idx.fields.map((f) => toCamelCase(f.name)).join(', ');
      if (idx.unique && idx.fields.length > 1) {
        classIndexes.push(`@Index(['${fieldNames.replace(/, /g, "', '")}'], { unique: true })`);
      } else if (!idx.unique) {
        classIndexes.push(`@Index(['${fieldNames.replace(/, /g, "', '")}'])`);
      }
    }

    for (const idx of classIndexes) {
      lines.push(idx);
    }

    lines.push(`export class ${className} {`);

    for (const field of fields) {
      const propName = toCamelCase(field.name);
      const tsType = mapCanonicalToORMType('typeorm', field.type);
      const isPk = primaryFields.has(field.name);
      const isAutoInc = field.defaultKind === 'auto_increment';
      const isNullable = field.nullable && !isPk;

      const optionsParts: string[] = [];
      if (propName !== field.name) {
        optionsParts.push(`name: ${JSON.stringify(field.name)}`);
      }

      if (!isPk) {
        if (singleUniqueFields.has(field.name)) {
          optionsParts.push('unique: true');
        }
        if (isNullable) {
          optionsParts.push('nullable: true');
        }
        if (field.comment.trim()) {
          optionsParts.push(`comment: '${field.comment.trim().replace(/'/g, "\\'")}'`);
        }
        if (field.defaultKind === 'constant') {
          optionsParts.push(`default: '${field.defaultValue.replace(/'/g, "\\'")}'`);
        } else if (field.defaultKind === 'expression' && field.defaultValue.trim()) {
          optionsParts.push(`default: () => ${JSON.stringify(field.defaultValue)}`);
        } else if (field.defaultKind === 'current_timestamp') {
          optionsParts.push(`default: () => 'CURRENT_TIMESTAMP'`);
        } else if (field.defaultKind === 'uuid') {
          optionsParts.push(`default: () => 'uuid()'`);
        }
      }
      const decorator = isPk ? (isAutoInc ? 'PrimaryGeneratedColumn' : 'PrimaryColumn') : 'Column';
      const opts = optionsParts.length > 0 ? `{ ${optionsParts.join(', ')} }` : '';
      lines.push(`  @${decorator}(${opts})`);

      const typeStr = isNullable ? `${tsType} | null` : tsType;
      lines.push(`  ${propName}: ${typeStr};`);
    }

    for (const foreignKey of foreignKeys) {
      const referencedClass = toPascalCase(foreignKey.refTable);
      const propertyName = toCamelCase(foreignKey.name || `${foreignKey.refTable}_relation`);
      const isNullable = foreignKey.fields.some(
        (fieldName) => fields.find((field) => field.name === fieldName)?.nullable,
      );
      const relationOptions = [
        ...(isNullable ? ['nullable: true'] : []),
        ...(foreignKey.onDelete ? [`onDelete: '${foreignKey.onDelete}'`] : []),
        ...(foreignKey.onUpdate ? [`onUpdate: '${foreignKey.onUpdate}'`] : []),
      ];
      const options = relationOptions.length > 0 ? `, { ${relationOptions.join(', ')} }` : '';
      lines.push('');
      lines.push(`  @ManyToOne(() => ${referencedClass}${options})`);
      const joinColumns = foreignKey.fields.map((fieldName, index) => {
        const parts = [
          `name: '${fieldName}'`,
          `referencedColumnName: '${toCamelCase(foreignKey.refFields[index] ?? '')}'`,
          ...(index === 0 && foreignKey.name
            ? [`foreignKeyConstraintName: '${foreignKey.name}'`]
            : []),
        ];
        return `{ ${parts.join(', ')} }`;
      });
      lines.push(
        joinColumns.length === 1
          ? `  @JoinColumn(${joinColumns[0]})`
          : `  @JoinColumn([${joinColumns.join(', ')}])`,
      );
      lines.push(`  ${propertyName}: ${referencedClass}${isNullable ? ' | null' : ''};`);
    }

    lines.push('}');
    return lines.join('\n');
  }
}
