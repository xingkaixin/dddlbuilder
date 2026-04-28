import type {
  NormalizedField,
  IndexDefinition,
  ForeignKeyDefinition,
} from '@ddlbuilder/shared-types';
import type { ORMGenerator } from '../interfaces/ORMGenerator.js';
import { getORMTypeWithArgs } from '../utils/ormTypeResolver.js';
import { isPrimaryKeyField, escapePythonString } from './shared.js';

export class SQLAlchemyGenerator implements ORMGenerator {
  generateModel(
    tableName: string,
    tableComment: string,
    fields: NormalizedField[],
    indexes: IndexDefinition[],
    foreignKeys: ForeignKeyDefinition[],
  ): string {
    if (!tableName.trim()) {
      return '# 请填写表名';
    }
    if (fields.length === 0) {
      return '# 请补充字段信息';
    }

    const lines: string[] = [];

    lines.push(
      'from sqlalchemy import Column, Integer, String, BigInteger, SmallInteger, Numeric, Float, Boolean, Date, DateTime, Time, Text, LargeBinary, JSON, Index, ForeignKey',
    );
    lines.push('from sqlalchemy.ext.declarative import declarative_base');
    lines.push('');
    lines.push('Base = declarative_base()');
    lines.push('');

    if (tableComment.trim()) {
      lines.push(`# ${tableComment.trim()}`);
    }

    const className = this.toClassName(tableName.trim());
    lines.push(`class ${className}(Base):`);
    lines.push(`    __tablename__ = '${tableName.trim()}'`);
    if (tableComment.trim()) {
      lines.push(`    __doc__ = '${escapePythonString(tableComment.trim())}'`);
    }
    lines.push('');

    const tableArgs: string[] = [];

    for (const field of fields) {
      const colType = getORMTypeWithArgs('sqlalchemy', field.type);
      const isPk = isPrimaryKeyField(field.name, indexes);
      const isAutoInc = field.defaultKind === 'auto_increment';
      const isNullable = field.nullable && !isPk;

      const args: string[] = [colType];
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
      if (field.defaultKind === 'constant' && field.defaultValue) {
        args.push(`default='${escapePythonString(field.defaultValue)}'`);
      } else if (field.defaultKind === 'current_timestamp') {
        args.push('default=func.now()');
      }
      if (field.comment.trim()) {
        args.push(`comment='${escapePythonString(field.comment.trim())}'`);
      }

      lines.push(`    ${field.name} = Column(${args.join(', ')})`);
    }

    // Indexes
    for (const idx of indexes) {
      if (idx.isPrimary) continue;
      const fieldNames = idx.fields.map((f) => `'${f.name}'`).join(', ');
      const uniqueStr = idx.unique ? ', unique=True' : '';
      tableArgs.push(`    Index('${idx.name}', ${fieldNames}${uniqueStr})`);
    }

    // Foreign keys
    for (const fk of foreignKeys) {
      const localField = fk.fields[0];
      const refTable = fk.refTable;
      const refField = fk.refFields[0];
      const onDelete = fk.onDelete ? `, ondelete='${fk.onDelete}'` : '';
      const onUpdate = fk.onUpdate ? `, onupdate='${fk.onUpdate}'` : '';
      tableArgs.push(
        `    ForeignKeyConstraint(['${localField}'], ['${refTable}.${refField}']${onDelete}${onUpdate})`,
      );
    }

    if (tableArgs.length > 0) {
      lines.push('');
      lines.push('    __table_args__ = (');
      for (const arg of tableArgs) {
        lines.push(arg);
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
