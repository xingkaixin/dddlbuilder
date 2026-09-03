import type { ORMGenerator, ORMModelInput } from '../interfaces/ORMGenerator.js';
import { buildORMPropertyNames } from './ormNames.js';
import { getDatabaseFamily } from '../utils/databaseFamily.js';
import { resolveFieldDefault } from '../utils/fieldDefault.js';
import {
  buildIndexFieldLookup,
  toPascalCase,
  tsStringLiteral,
  formatLineComment,
} from './shared.js';
import { resolveTypeORMColumn } from './typeormColumn.js';

export class TypeORMGenerator implements ORMGenerator {
  generateModel(input: ORMModelInput): string {
    const {
      dbType,
      schemaName = '',
      tableName,
      tableComment,
      fields,
      indexes = [],
      foreignKeys = [],
    } = input;
    if (!tableName.trim()) {
      return '-- 请填写表名';
    }
    if (fields.length === 0) {
      return '-- 请补充字段信息';
    }

    const propertyNames = buildORMPropertyNames('typeorm', input);
    if (!propertyNames.ok) return propertyNames.diagnostic;
    const names = propertyNames.names;
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
      lines.push(`import { ${referencedClass} } from ${tsStringLiteral(`./${referencedTable}`)};`);
    }
    lines.push('');

    if (tableComment.trim()) {
      lines.push(`/**`);
      lines.push(formatLineComment(tableComment.replaceAll('*/', '* /'), ' * '));
      lines.push(` */`);
    }
    const namespaceOption = getDatabaseFamily(dbType) === 'mysql' ? 'database' : 'schema';
    lines.push(
      schemaName
        ? `@Entity({ name: ${JSON.stringify(tableName.trim())}, ${namespaceOption}: ${JSON.stringify(schemaName)} })`
        : `@Entity(${tsStringLiteral(tableName.trim())})`,
    );

    const classIndexes: string[] = [];

    // Collect composite unique and normal indexes
    for (const idx of indexes) {
      if (idx.kind === 'primary') continue;
      const fieldNames = idx.fields.map((f) => tsStringLiteral(names.field(f.name))).join(', ');
      if (idx.kind !== 'index' && idx.fields.length > 1) {
        classIndexes.push(`@Index([${fieldNames}], { unique: true })`);
      } else if (idx.kind === 'index') {
        classIndexes.push(`@Index([${fieldNames}])`);
      }
    }

    for (const idx of classIndexes) {
      lines.push(idx);
    }

    lines.push(`export class ${className} {`);

    for (const field of fields) {
      const column = resolveTypeORMColumn(field, dbType);
      if (!column) {
        return `// Manual mapping required: column ${JSON.stringify(field.name)} has unsupported type parameters in ${JSON.stringify(field.type)}.`;
      }
      const propName = names.field(field.name);
      const tsType = column.propertyType;
      const isPk = primaryFields.has(field.name);
      const defaultValue = resolveFieldDefault(field, dbType);
      const isAutoInc = defaultValue.kind === 'auto_increment' || column.serial;
      const isNullable = field.nullable && !isPk;

      const optionsParts = Object.entries(column.options).map(
        ([key, value]) => `${key}: ${JSON.stringify(value)}`,
      );
      if (propName !== field.name) {
        optionsParts.push(`name: ${JSON.stringify(field.name)}`);
      }

      if (!isPk) {
        if (isAutoInc) optionsParts.push("generated: 'increment'");
        if (singleUniqueFields.has(field.name)) {
          optionsParts.push('unique: true');
        }
        if (isNullable) {
          optionsParts.push('nullable: true');
        }
        if (field.comment.trim()) {
          optionsParts.push(`comment: ${tsStringLiteral(field.comment.trim())}`);
        }
      }
      if (defaultValue.kind === 'constant') {
        optionsParts.push(`default: ${tsStringLiteral(defaultValue.value)}`);
      } else if (defaultValue.kind === 'expression') {
        optionsParts.push(`default: () => ${JSON.stringify(defaultValue.sqlExpression)}`);
      } else if (defaultValue.kind === 'current_timestamp') {
        optionsParts.push(`default: () => ${tsStringLiteral(defaultValue.sqlExpression)}`);
      } else if (defaultValue.kind === 'uuid') {
        optionsParts.push(`default: () => ${tsStringLiteral(defaultValue.sqlExpression)}`);
      }
      const decorator = isPk ? (isAutoInc ? 'PrimaryGeneratedColumn' : 'PrimaryColumn') : 'Column';
      const opts = optionsParts.length > 0 ? `{ ${optionsParts.join(', ')} }` : '';
      lines.push(`  @${decorator}(${opts})`);

      const typeStr = isNullable ? `${tsType} | null` : tsType;
      lines.push(`  ${propName}: ${typeStr};`);
    }

    for (const foreignKey of foreignKeys) {
      const referencedClass = toPascalCase(foreignKey.refTable);
      const propertyName = names.relation(foreignKey);
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
          `name: ${tsStringLiteral(fieldName)}`,
          `referencedColumnName: ${tsStringLiteral(names.reference(foreignKey, foreignKey.refFields[index] ?? ''))}`,
          ...(index === 0 && foreignKey.name
            ? [`foreignKeyConstraintName: ${tsStringLiteral(foreignKey.name)}`]
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
