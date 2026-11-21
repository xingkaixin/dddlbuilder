import type { DatabaseType, ParsedFieldType } from '@ddlbuilder/shared-types';
import { TYPE_MAPPINGS } from '../configs/typeMappings.js';
import { getDatabaseFamily } from './databaseFamily.js';
import { canonicalizeBaseType } from './typeAliases.js';

export class TypeMapper {
  private readonly databaseType: DatabaseType;

  private constructor(databaseType: DatabaseType) {
    this.databaseType = databaseType;
  }

  private static readonly instances = new Map<DatabaseType, TypeMapper>();

  static create(databaseType: DatabaseType): TypeMapper {
    const cached = TypeMapper.instances.get(databaseType);

    if (cached) return cached;
    const mapper = new TypeMapper(databaseType);
    TypeMapper.instances.set(databaseType, mapper);

    return mapper;
  }

  mapType(parsed: ParsedFieldType): string {
    const canonical = canonicalizeBaseType(parsed.baseType);
    const mapping = TYPE_MAPPINGS[this.databaseType]?.[canonical];

    const supportsUnsigned = getDatabaseFamily(this.databaseType) === 'mysql';

    if (!mapping) {
      let result = this.formatType(parsed.baseType, parsed.args, '', true);

      if (parsed.unsigned && supportsUnsigned) {
        result += ' UNSIGNED';
      }

      return result;
    }

    if ('transform' in mapping) {
      return mapping.transform(parsed);
    }

    const targetType = mapping.mapping || parsed.baseType;
    const limit = mapping.maxArgs ?? mapping.defaultArgs?.length ?? 0;

    const args = (parsed.args.length > 0 ? parsed.args : (mapping.defaultArgs ?? [])).slice(
      0,
      limit,
    );
    let suffix = mapping.suffix || '';

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
}
