import type { ORMGenerator, ORMModelInput } from '../interfaces/ORMGenerator.js';
import { buildORMPropertyNames } from './ormNames.js';
import { buildDialectDefaultClause } from '../strategies/dialectColumn.js';
import { getORMTypeWithArgs } from '../utils/ormTypeResolver.js';
import { buildIndexFieldLookup, escapePythonString, formatLineComment } from './shared.js';

export class SQLAlchemyGenerator implements ORMGenerator {
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
      return '# 请填写表名';
    }
    if (fields.length === 0) {
      return '# 请补充字段信息';
    }

    const names = buildORMPropertyNames('sqlalchemy', {
      tableName,
      schemaName,
      fields,
      foreignKeys,
    });
    const lines: string[] = [];
    const { primaryFields } = buildIndexFieldLookup(indexes);

    const imports = [
      'Column',
      'Integer',
      'String',
      'BigInteger',
      'SmallInteger',
      'Numeric',
      'Float',
      'Boolean',
      'Date',
      'DateTime',
      'Time',
      'Text',
      'LargeBinary',
      'JSON',
      'Index',
      ...(fields.some((field) => field.defaultKind === 'current_timestamp') ? ['func'] : []),
      ...(fields.some((field) => field.defaultKind === 'constant') ? ['literal_column'] : []),
      ...(fields.some((field) => field.defaultKind === 'expression') ? ['text'] : []),
      ...(foreignKeys.length > 0 ? ['ForeignKeyConstraint'] : []),
    ];
    lines.push(`from sqlalchemy import ${imports.join(', ')}`);
    lines.push('from sqlalchemy.ext.declarative import declarative_base');
    lines.push('');
    lines.push('Base = declarative_base()');
    lines.push('');

    if (tableComment.trim()) {
      lines.push(formatLineComment(tableComment, '# '));
    }

    const className = this.toClassName(tableName.trim());
    lines.push(`class ${className}(Base):`);
    lines.push(`    __tablename__ = '${escapePythonString(tableName.trim())}'`);
    if (tableComment.trim()) {
      lines.push(`    __doc__ = '${escapePythonString(tableComment.trim())}'`);
    }
    lines.push('');

    const tableArgs: string[] = [];

    for (const field of fields) {
      const colType = getORMTypeWithArgs('sqlalchemy', field.type);
      const isPk = primaryFields.has(field.name);
      const isAutoInc = field.defaultKind === 'auto_increment';
      const isNullable = field.nullable && !isPk;

      const propertyName = names.field(field.name);
      const args: string[] = [
        ...(propertyName !== field.name ? [`'${escapePythonString(field.name)}'`] : []),
        colType,
      ];
      if (isPk) {
        args.push('primary_key=True');
        if (isAutoInc) {
          args.push('autoincrement=True');
        }
      }
      if (isNullable) {
        args.push('nullable=True');
      } else if (!isPk) {
        args.push('nullable=False');
      }
      if (field.defaultKind === 'constant') {
        const defaultClause = buildDialectDefaultClause(field, dbType);
        if (defaultClause) {
          const literal = defaultClause.slice('DEFAULT '.length);
          args.push(`server_default=literal_column('${escapePythonString(literal)}')`);
        }
      } else if (field.defaultKind === 'expression' && field.defaultValue.trim()) {
        args.push(`server_default=text('${escapePythonString(field.defaultValue)}')`);
      } else if (field.defaultKind === 'current_timestamp') {
        args.push('default=func.now()');
      }
      if (field.comment.trim()) {
        args.push(`comment='${escapePythonString(field.comment.trim())}'`);
      }

      lines.push(`    ${propertyName} = Column(${args.join(', ')})`);
    }

    // Indexes
    for (const idx of indexes) {
      if (idx.kind === 'primary') continue;
      const fieldNames = idx.fields.map((f) => `'${escapePythonString(f.name)}'`).join(', ');
      const uniqueStr = idx.kind !== 'index' ? ', unique=True' : '';
      tableArgs.push(`    Index('${escapePythonString(idx.name)}', ${fieldNames}${uniqueStr})`);
    }

    for (const fk of foreignKeys) {
      const localFields = fk.fields.map((field) => `'${escapePythonString(field)}'`).join(', ');
      const referencedTable = [fk.refSchema, fk.refTable].filter(Boolean).join('.');
      const referencedFields = fk.refFields
        .map((field) => `'${escapePythonString(`${referencedTable}.${field}`)}'`)
        .join(', ');
      const onDelete = fk.onDelete ? `, ondelete='${fk.onDelete}'` : '';
      const onUpdate = fk.onUpdate ? `, onupdate='${fk.onUpdate}'` : '';
      tableArgs.push(
        `    ForeignKeyConstraint([${localFields}], [${referencedFields}]${onDelete}${onUpdate})`,
      );
    }

    if (schemaName) {
      tableArgs.push(`    {"schema": ${JSON.stringify(schemaName)}}`);
    }

    if (tableArgs.length > 0) {
      lines.push('');
      lines.push('    __table_args__ = (');
      for (const arg of tableArgs) {
        lines.push(`${arg},`);
      }
      lines.push('    )');
    }

    return lines.join('\n');
  }

  private toClassName(tableName: string): string {
    return tableName
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join('');
  }
}
