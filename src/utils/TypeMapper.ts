import type { DatabaseType, ParsedFieldType } from "../types";
import { TYPE_MAPPINGS } from "../configs/typeMappings";
import type { TypeMappingRule } from "../configs/typeMappings";
import { canonicalizeBaseType } from "./databaseTypeMapping";

export class TypeMapper {
  private constructor(private databaseType: DatabaseType) {}

  static create(databaseType: DatabaseType): TypeMapper {
    return new TypeMapper(databaseType);
  }

  mapType(parsed: ParsedFieldType): string {
    const canonical = canonicalizeBaseType(parsed.baseType);
    const mapping = TYPE_MAPPINGS[this.databaseType]?.[canonical];

    if (!mapping) {
      // 如果没有找到映射，返回原始类型
      let result = this.formatType(parsed.baseType, parsed.args, "", true);
      if (parsed.unsigned && this.databaseType === 'mysql') {
        result += " UNSIGNED";
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
    let suffix = mapping.suffix || "";

    // 处理 unsigned 后缀（MySQL 特有）
    if (parsed.unsigned && this.databaseType === 'mysql') {
      if (!suffix.includes("UNSIGNED")) {
        suffix = suffix ? `${suffix} UNSIGNED` : "UNSIGNED";
      }
    }

    return this.formatType(targetType, args, suffix);
  }

  private formatType(base: string, args: string[] = [], suffix = "", preserveCase = false): string {
    const formattedArgs = args.map(this.uppercaseArg);
    const joined = formattedArgs.join(", ");
    const typeCore = joined
      ? `${preserveCase ? base : base.toUpperCase()}(${joined})`
      : preserveCase ? base : base.toUpperCase();
    return suffix ? `${typeCore} ${suffix}` : typeCore;
  }

  private uppercaseArg = (value: string) =>
    value.toLowerCase() === "max" ? "MAX" : value;

  getSupportedTypes(): string[] {
    const mapping = TYPE_MAPPINGS[this.databaseType];
    return mapping ? Object.keys(mapping) : [];
  }

  hasMapping(type: string): boolean {
    const canonical = canonicalizeBaseType(type);
    return !!TYPE_MAPPINGS[this.databaseType]?.[canonical];
  }
}