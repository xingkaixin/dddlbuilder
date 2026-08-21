import type { DatabaseType, ParsedFieldType } from '@ddlbuilder/shared-types';
import { TYPE_MAPPINGS } from '../configs/typeMappings.js';
import { canonicalizeBaseType } from './databaseTypeMapping.js';
import { getDatabaseFamily } from './databaseFamily.js';

export class TypeMapper {
  private readonly databaseType: DatabaseType;

  private constructor(databaseType: DatabaseType) {
    this.databaseType = databaseType;
  }

  static create(databaseType: DatabaseType): TypeMapper {
    return new TypeMapper(databaseType);
  }

  mapType(parsed: ParsedFieldType): string {
    const canonical = canonicalizeBaseType(parsed.baseType);
    const mapping = TYPE_MAPPINGS[this.databaseType]?.[canonical];

    // 检查当前数据库是否支持 UNSIGNED（MySQL 兼容的数据库）
    const supportsUnsigned = getDatabaseFamily(this.databaseType) === 'mysql';

    if (!mapping) {
      // 如果没有找到映射，返回原始类型
      let result = this.formatType(parsed.baseType, parsed.args, '', true);
      if (parsed.unsigned && supportsUnsigned) {
        result += ' UNSIGNED';
      }
      return result;
    }

    // 如果有自定义转换函数，使用转换函数
    if (mapping.transform) {
      return mapping.transform(parsed);
    }

    // 使用配置的映射规则
    const targetType = mapping.mapping || parsed.baseType;
    // 如果原始字段有参数，优先使用原始参数，否则使用默认参数
    const args = parsed.args.length > 0 ? parsed.args : mapping.defaultArgs;
    let suffix = mapping.suffix || '';

    // 处理 unsigned 后缀（MySQL 兼容数据库）
    if (parsed.unsigned && supportsUnsigned) {
      if (!suffix.includes('UNSIGNED')) {
        suffix = suffix ? `${suffix} UNSIGNED` : 'UNSIGNED';
      }
    }

    return this.formatType(targetType, args, suffix);
  }

  private formatType(base: string, args: string[] = [], suffix = '', preserveCase = false): string {
    const formattedArgs = args.map(this.uppercaseArg);
    const joined = formattedArgs.join(', ');
    const typeCore = joined
      ? `${preserveCase ? base : base.toUpperCase()}(${joined})`
      : preserveCase
        ? base
        : base.toUpperCase();
    return suffix ? `${typeCore} ${suffix}` : typeCore;
  }

  private uppercaseArg = (value: string) => (value.toLowerCase() === 'max' ? 'MAX' : value);

  getSupportedTypes(): string[] {
    const mapping = TYPE_MAPPINGS[this.databaseType];
    return mapping ? Object.keys(mapping) : [];
  }

  hasMapping(type: string): boolean {
    const canonical = canonicalizeBaseType(type);
    return !!TYPE_MAPPINGS[this.databaseType]?.[canonical];
  }
}
