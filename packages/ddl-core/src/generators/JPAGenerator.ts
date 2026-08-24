import type {
  NormalizedField,
  IndexDefinition,
  ForeignKeyDefinition,
} from '@ddlbuilder/shared-types';
import type { ORMGenerator } from '../interfaces/ORMGenerator.js';
import { mapCanonicalToORMType } from '../utils/ormTypeResolver.js';
import { buildIndexFieldLookup, toCamelCase, toPascalCase } from './shared.js';

export class JPAGenerator implements ORMGenerator {
  generateModel(
    tableName: string,
    tableComment: string,
    fields: NormalizedField[],
    indexes: IndexDefinition[],
    foreignKeys: ForeignKeyDefinition[],
  ): string {
    if (!tableName.trim()) {
      return '// 请填写表名';
    }
    if (fields.length === 0) {
      return '// 请补充字段信息';
    }

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
      lines.push(` * ${tableComment.trim()}`);
      lines.push(` */`);
    }
    lines.push(`@Entity`);
    lines.push(`@Table(name = "${tableName.trim()}")`);

    const className = toPascalCase(tableName.trim());
    lines.push(`public class ${className} {`);
    lines.push('');

    for (const field of fields) {
      const propName = toCamelCase(field.name);
      const javaType = mapCanonicalToORMType('jpa', field.type);
      const isPk = primaryFields.has(field.name);
      const isAutoInc = field.defaultKind === 'auto_increment';
      const isNullable = field.nullable && !isPk;

      if (field.comment.trim()) {
        lines.push(`    /** ${field.comment.trim()} */`);
      }

      if (isPk) {
        lines.push(`    @Id`);
        if (isAutoInc) {
          lines.push(`    @GeneratedValue(strategy = GenerationType.IDENTITY)`);
        }
      }

      const colParts: string[] = [`name = "${field.name}"`];
      if (!isNullable) {
        colParts.push('nullable = false');
      }
      lines.push(`    @Column(${colParts.join(', ')})`);
      lines.push(`    private ${javaType} ${propName};`);
      lines.push('');
    }

    for (const foreignKey of foreignKeys) {
      const referencedType = toPascalCase(foreignKey.refTable);
      const propertyName = toCamelCase(foreignKey.name || `${foreignKey.refTable}_relation`);
      const isNullable = foreignKey.fields.some(
        (fieldName) => fields.find((field) => field.name === fieldName)?.nullable,
      );
      lines.push(`    @ManyToOne${isNullable ? '' : '(optional = false)'}`);
      const joinColumns = foreignKey.fields.map(
        (fieldName, index) =>
          `name = "${fieldName}", referencedColumnName = "${foreignKey.refFields[index]}", insertable = false, updatable = false`,
      );
      if (joinColumns.length === 1) {
        const foreignKeyAttribute = foreignKey.name
          ? `, foreignKey = @ForeignKey(name = "${foreignKey.name}")`
          : '';
        lines.push(`    @JoinColumn(${joinColumns[0]}${foreignKeyAttribute})`);
      } else {
        lines.push(`    @JoinColumns(value = {`);
        for (const joinColumn of joinColumns) lines.push(`        @JoinColumn(${joinColumn}),`);
        const foreignKeyAttribute = foreignKey.name
          ? `, foreignKey = @ForeignKey(name = "${foreignKey.name}")`
          : '';
        lines.push(`    }${foreignKeyAttribute})`);
      }
      lines.push(`    private ${referencedType} ${propertyName};`);
      lines.push('');
    }

    for (const field of fields) {
      const propName = toCamelCase(field.name);
      const javaType = mapCanonicalToORMType('jpa', field.type);
      const getterName = `get${toPascalCase(field.name)}`;
      const setterName = `set${toPascalCase(field.name)}`;

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
      const propertyName = toCamelCase(foreignKey.name || `${foreignKey.refTable}_relation`);
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
