import type {
  NormalizedField,
  IndexDefinition,
  ForeignKeyDefinition,
} from '@ddlbuilder/shared-types';
import type { ORMGenerator } from '../interfaces/ORMGenerator.js';
import { mapCanonicalToORMType } from '../utils/ormTypeResolver.js';
import { isPrimaryKeyField, toCamelCase, toPascalCase } from './shared.js';

export class TypeORMGenerator implements ORMGenerator {
  generateModel(
    tableName: string,
    tableComment: string,
    fields: NormalizedField[],
    indexes: IndexDefinition[],
    _foreignKeys: ForeignKeyDefinition[],
  ): string {
    if (!tableName.trim()) {
      return '-- 请填写表名';
    }
    if (fields.length === 0) {
      return '-- 请补充字段信息';
    }

    const lines: string[] = [];

    lines.push(
      `import { Entity, Column, Index, PrimaryGeneratedColumn, PrimaryColumn } from 'typeorm';`,
    );
    lines.push('');

    if (tableComment.trim()) {
      lines.push(`/**`);
      lines.push(` * ${tableComment.trim()}`);
      lines.push(` */`);
    }
    lines.push(`@Entity('${tableName.trim()}')`);

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

    lines.push(`export class ${toPascalCase(tableName.trim())} {`);

    for (const field of fields) {
      const propName = toCamelCase(field.name);
      const tsType = mapCanonicalToORMType('typeorm', field.type);
      const isPk = isPrimaryKeyField(field.name, indexes);
      const isAutoInc = field.defaultKind === 'auto_increment';
      const isNullable = field.nullable && !isPk;

      const optionsParts: string[] = [];

      if (isPk) {
        if (isAutoInc) {
          lines.push(`  @PrimaryGeneratedColumn()`);
        } else {
          lines.push(`  @PrimaryColumn()`);
        }
      } else {
        // Single-field unique
        const isSingleUnique = indexes.some(
          (i) =>
            i.unique && !i.isPrimary && i.fields.length === 1 && i.fields[0].name === field.name,
        );
        if (isSingleUnique) {
          optionsParts.push('unique: true');
        }
        if (isNullable) {
          optionsParts.push('nullable: true');
        }
        if (field.comment.trim()) {
          optionsParts.push(`comment: '${field.comment.trim().replace(/'/g, "\\'")}'`);
        }
        if (field.defaultKind === 'constant' && field.defaultValue) {
          optionsParts.push(`default: '${field.defaultValue.replace(/'/g, "\\'")}'`);
        } else if (field.defaultKind === 'current_timestamp') {
          optionsParts.push(`default: () => 'CURRENT_TIMESTAMP'`);
        } else if (field.defaultKind === 'uuid') {
          optionsParts.push(`default: () => 'uuid()'`);
        }

        const opts = optionsParts.length > 0 ? `{ ${optionsParts.join(', ')} }` : '';
        lines.push(`  @Column(${opts})`);
      }

      const typeStr = isNullable ? `${tsType} | null` : tsType;
      lines.push(`  ${propName}: ${typeStr};`);
    }

    lines.push('}');
    return lines.join('\n');
  }
}
