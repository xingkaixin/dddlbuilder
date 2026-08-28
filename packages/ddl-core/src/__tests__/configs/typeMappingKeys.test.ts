import { describe, expect, it } from 'vitest';
import { ORM_TYPE_MAPPINGS } from '../../configs/ormTypeMappings.js';
import { TYPE_MAPPINGS } from '../../configs/typeMappings.js';
import { TYPE_ALIASES, canonicalizeBaseType } from '../../utils/typeAliases.js';

// 查找前会先做 canonicalizeBaseType，因此映射表的键若本身是会被归一化的别名，
// 该条目永远无法命中。此不变量保证映射表只含 canonical 键。
describe('type mapping keys stay canonical', () => {
  it('TYPE_MAPPINGS contains no keys that canonicalize to another name', () => {
    for (const [databaseType, mapping] of Object.entries(TYPE_MAPPINGS)) {
      for (const key of Object.keys(mapping)) {
        expect(canonicalizeBaseType(key), `${databaseType}.${key}`).toBe(key);
      }
    }
  });

  it('ORM_TYPE_MAPPINGS contains no keys that canonicalize to another name', () => {
    for (const [target, mapping] of Object.entries(ORM_TYPE_MAPPINGS)) {
      for (const key of Object.keys(mapping)) {
        expect(canonicalizeBaseType(key), `${target}.${key}`).toBe(key);
      }
    }
  });

  it('TYPE_ALIASES stays idempotent for canonical keys', () => {
    for (const [key, target] of Object.entries(TYPE_ALIASES)) {
      expect(canonicalizeBaseType(target), `${key} -> ${target}`).toBe(target);
    }
  });
});
