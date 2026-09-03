import type { ORMGenerator, ORMModelInput } from '../interfaces/ORMGenerator.js';
import { buildORMPropertyNames } from './ormNames.js';
import { mapCanonicalToORMType } from '../utils/ormTypeResolver.js';
import { getDatabaseFamily } from '../utils/databaseFamily.js';
import { resolveFieldDefault } from '../utils/fieldDefault.js';
import {
  buildIndexFieldLookup,
  toPascalCase,
  escapeJavaString,
  formatLineComment,
} from './shared.js';

export class JPAGenerator implements ORMGenerator {
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
      return '// 请填写表名';
    }
    if (fields.length === 0) {
      return '// 请补充字段信息';
    }

    const propertyNames = buildORMPropertyNames('jpa', input);
    if (!propertyNames.ok) return propertyNames.diagnostic;
    const names = propertyNames.names;
    const lines: string[] = [];
    const { primaryFields } = buildIndexFieldLookup(indexes);

    const imports = new Set<string>(['jakarta.persistence.*']);
    const needsDate = fields.some((f) =>
      ['date', 'datetime', 'timestamp', 'time', 'datetime2', 'timestamptz', 'timetz'].includes(
        f.type.toLowerCase().split('(')[0].trim(),
      ),
    );
    const needsBigDecimal = fields.some((f) =>
      ['decimal', 'numeric', 'number'].includes(f.type.toLowerCase().split('(')[0].trim()),
    );
    const needsUUID = fields.some((f) => f.type.toLowerCase().split('(')[0].trim() === 'uuid');

    if (needsDate) imports.add('java.util.Date');
    if (needsBigDecimal) imports.add('java.math.BigDecimal');
    if (needsUUID) imports.add('java.util.UUID');

    for (const imp of imports) {
      lines.push(`import ${imp};`);
    }
    lines.push('');

    if (tableComment.trim()) {
      lines.push(`/**`);
      lines.push(formatLineComment(tableComment.replaceAll('*/', '* /'), ' * '));
      lines.push(` */`);
    }
    lines.push(`@Entity`);
    const namespaceOption = getDatabaseFamily(dbType) === 'mysql' ? 'catalog' : 'schema';
    const namespace = schemaName ? `, ${namespaceOption} = ${JSON.stringify(schemaName)}` : '';
    lines.push(`@Table(name = ${JSON.stringify(tableName.trim())}${namespace})`);

    const className = toPascalCase(tableName.trim());
    lines.push(`public class ${className} {`);
    lines.push('');

    for (const field of fields) {
      const propName = names.field(field.name);
      const javaType = mapCanonicalToORMType('jpa', field.type);
      const isPk = primaryFields.has(field.name);
      const defaultValue = resolveFieldDefault(field, dbType);
      const isNullable = field.nullable && !isPk;

      if (field.comment.trim()) {
        lines.push(formatLineComment(field.comment, '    // '));
      }

      if (isPk) {
        lines.push(`    @Id`);
        if (defaultValue.kind === 'auto_increment') {
          lines.push(`    @GeneratedValue(strategy = GenerationType.IDENTITY)`);
        }
      }

      const colParts: string[] = [`name = "${escapeJavaString(field.name)}"`];
      if (!isNullable) {
        colParts.push('nullable = false');
      }
      lines.push(`    @Column(${colParts.join(', ')})`);
      lines.push(`    private ${javaType} ${propName};`);
      lines.push('');
    }

    for (const foreignKey of foreignKeys) {
      const referencedType = toPascalCase(foreignKey.refTable);
      const propertyName = names.relation(foreignKey);
      const isNullable = foreignKey.fields.some(
        (fieldName) => fields.find((field) => field.name === fieldName)?.nullable,
      );
      lines.push(`    @ManyToOne${isNullable ? '' : '(optional = false)'}`);
      const joinColumns = foreignKey.fields.map(
        (fieldName, index) =>
          `name = "${escapeJavaString(fieldName)}", referencedColumnName = "${escapeJavaString(foreignKey.refFields[index])}", insertable = false, updatable = false`,
      );
      if (joinColumns.length === 1) {
        const foreignKeyAttribute = foreignKey.name
          ? `, foreignKey = @ForeignKey(name = "${escapeJavaString(foreignKey.name)}")`
          : '';
        lines.push(`    @JoinColumn(${joinColumns[0]}${foreignKeyAttribute})`);
      } else {
        lines.push(`    @JoinColumns(value = {`);
        for (const joinColumn of joinColumns) lines.push(`        @JoinColumn(${joinColumn}),`);
        const foreignKeyAttribute = foreignKey.name
          ? `, foreignKey = @ForeignKey(name = "${escapeJavaString(foreignKey.name)}")`
          : '';
        lines.push(`    }${foreignKeyAttribute})`);
      }
      lines.push(`    private ${referencedType} ${propertyName};`);
      lines.push('');
    }

    for (const field of fields) {
      const propName = names.field(field.name);
      const javaType = mapCanonicalToORMType('jpa', field.type);
      const getterName = `get${toPascalCase(propName)}`;
      const setterName = `set${toPascalCase(propName)}`;

      lines.push(`    public ${javaType} ${getterName}() {`);
      lines.push(`        return this.${propName};`);
      lines.push(`    }`);
      lines.push('');
      lines.push(`    public void ${setterName}(${javaType} ${propName}) {`);
      lines.push(`        this.${propName} = ${propName};`);
      lines.push(`    }`);
      lines.push('');
    }

    for (const foreignKey of foreignKeys) {
      const referencedType = toPascalCase(foreignKey.refTable);
      const propertyName = names.relation(foreignKey);
      const accessorName = toPascalCase(propertyName);
      lines.push(`    public ${referencedType} get${accessorName}() {`);
      lines.push(`        return this.${propertyName};`);
      lines.push(`    }`);
      lines.push('');
      lines.push(`    public void set${accessorName}(${referencedType} ${propertyName}) {`);
      lines.push(`        this.${propertyName} = ${propertyName};`);
      lines.push(`    }`);
      lines.push('');
    }

    lines.push('}');
    return lines.join('\n');
  }
}
