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
      // 如果没有找到映射，返回原始类型的大写形式
      return this.formatType(parsed.baseType.toUpperCase(), parsed.args);
    }

    // 如果有自定义转换函数，使用转换函数
    if (mapping.transform) {
      return mapping.transform(parsed);
    }

    // 使用配置的映射规则
    const targetType = mapping.mapping || parsed.baseType;
    const args = mapping.defaultArgs || parsed.args;
    const suffix = mapping.suffix || "";

    // 处理 unsigned 后缀（MySQL 特有）
    let finalSuffix = suffix;
    if (suffix === "UNSIGNED" && parsed.unsigned) {
      finalSuffix = "UNSIGNED";
    } else if (suffix === "UNSIGNED" && !parsed.unsigned) {
      finalSuffix = "";
    }

    return this.formatType(targetType, args, finalSuffix);
  }

  private formatType(base: string, args: string[] = [], suffix = ""): string {
    const formattedArgs = args.map(this.uppercaseArg);
    const joined = formattedArgs.join(", ");
    const typeCore = joined
      ? `${base.toUpperCase()}(${joined})`
      : base.toUpperCase();
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