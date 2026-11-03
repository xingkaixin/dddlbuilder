import { describe, it, expect } from 'vitest';
import { sanitizeIndexesForPersist } from '@/utils/indexUtils';
import type { IndexDefinition } from '@ddlbuilder/shared-types';
import {
  getUiDefaultKindOptions,
  getUiOnUpdateOptions,
  isReservedKeyword,
  normalizeFields,
} from '@/utils/helpers';

describe('Utils', () => {
  describe('sanitizeIndexesForPersist function', () => {
    it('retains unique constraints when preparing editor state for persistence', () => {
      const constraint = {
        id: 'uq',
        name: 'uq_email',
        fields: [{ name: 'email', direction: 'ASC' as const }],
        kind: 'unique_constraint',
      } satisfies IndexDefinition;
      expect(sanitizeIndexesForPersist([constraint])).toEqual([constraint]);
    });
  });

  describe('getUiDefaultKindOptions function', () => {
    it('应该为不支持的类型只返回基本选项', () => {
      const result = getUiDefaultKindOptions('mysql', 'float');
      expect(result).toEqual(['none', 'constant', 'expression']);
    });
  });

  describe('getUiOnUpdateOptions function', () => {
    it('应该为 MySQL timestamp 类型返回当前时间选项', () => {
      const result = getUiOnUpdateOptions('mysql', 'timestamp');
      expect(result).toEqual(['none', 'current_timestamp']);
    });

    it('应该为非 MySQL 数据库只返回无选项', () => {
      const result = getUiOnUpdateOptions('postgresql', 'timestamp');
      expect(result).toEqual(['none']);
    });
  });

  describe('isReservedKeyword', () => {
    it('returns true for MySQL reserved keywords', () => {
      expect(isReservedKeyword('mysql', 'select')).toBe(true);
      expect(isReservedKeyword('mysql', 'INSERT')).toBe(true);
      expect(isReservedKeyword('mysql', 'from')).toBe(true);
    });
  });

  describe('normalizeFields', () => {
    it('preserves whitespace in string defaults', () => {
      expect(
        normalizeFields([
          {
            id: 'literal',
            fieldName: 'label',
            fieldType: 'text',
            fieldComment: '',
            nullable: true,
            defaultKind: 'constant',
            defaultValue: ' padded ',
          },
        ])[0].defaultValue,
      ).toBe(' padded ');
    });
  });
});
