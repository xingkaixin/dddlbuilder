import { describe, it, expect } from 'vitest';
import {
  buildIndexName,
  DEFAULT_IDENTIFIER_NAME_MAX_LENGTH as MAX_INDEX_NAME_LENGTH,
  truncateIdentifierName as truncateIndexName,
} from '@ddlbuilder/ddl-core';

describe('indexNameUtils', () => {
  describe('MAX_INDEX_NAME_LENGTH', () => {
    it('应该等于64', () => {
      expect(MAX_INDEX_NAME_LENGTH).toBe(64);
    });
  });

  describe('truncateIndexName', () => {
    it('名称不超过最大长度时，返回原始名称', () => {
      const shortName = 'idx_users_name';
      expect(truncateIndexName(shortName)).toBe(shortName);
    });

    it('名称刚好等于最大长度时，返回原始名称', () => {
      const exactName = 'a'.repeat(64);
      expect(truncateIndexName(exactName)).toBe(exactName);
    });

    it('名称超过最大长度时，应该截断并添加哈希后缀', () => {
      const longName = 'idx_very_long_table_name_with_many_fields_column1_column2_column3';
      const truncated = truncateIndexName(longName);

      expect(truncated.length).toBe(64);
      expect(truncated).toMatch(/^.{59}_[a-z0-9]{4}$/);
    });

    it('相同的长名称应该生成相同的截断结果', () => {
      const longName = 'idx_consistent_hash_test_with_very_long_name_that_exceeds_limit';
      const result1 = truncateIndexName(longName);
      const result2 = truncateIndexName(longName);

      expect(result1).toBe(result2);
    });

    it('不同的长名称应该生成不同的哈希后缀', () => {
      const longName1 = `idx_${'same_prefix_'.repeat(6)}different_end_part_one`;
      const longName2 = `idx_${'same_prefix_'.repeat(6)}different_end_part_two`;

      const result1 = truncateIndexName(longName1);
      const result2 = truncateIndexName(longName2);

      // 两个都应该被截断
      expect(result1.length).toBe(64);
      expect(result2.length).toBe(64);
      // 哈希后缀不同（因为原始名称不同）
      expect(result1.slice(-4)).not.toBe(result2.slice(-4));
    });

    it('支持自定义最大长度', () => {
      const name = 'idx_custom_length_test';
      const truncated = truncateIndexName(name, 20);

      expect(truncated.length).toBe(20);
      expect(truncated).toMatch(/_[a-z0-9]{4}$/);
    });

    it('自定义最大长度时，短名称不截断', () => {
      const name = 'idx_short';
      expect(truncateIndexName(name, 20)).toBe(name);
    });

    it('空字符串应该返回空字符串', () => {
      expect(truncateIndexName('')).toBe('');
    });
  });

  describe('buildIndexName', () => {
    it('单字段索引：生成 prefix_table_field 格式', () => {
      const result = buildIndexName('idx', 'users', ['name']);
      expect(result).toBe('idx_users_name');
    });

    it('多字段索引：生成 prefix_table_field1_field2 格式', () => {
      const result = buildIndexName('idx', 'orders', ['user_id', 'status']);
      expect(result).toBe('idx_orders_user_id_status');
    });

    it('唯一索引前缀 uk', () => {
      const result = buildIndexName('uk', 'users', ['email']);
      expect(result).toBe('uk_users_email');
    });

    it('主键前缀 pk', () => {
      const result = buildIndexName('pk', 'products', ['id']);
      expect(result).toBe('pk_products_id');
    });

    it('长索引名称应该被自动截断', () => {
      const result = buildIndexName('idx', 'very_long_table_name', [
        'very_long_column_name_1',
        'very_long_column_name_2',
        'very_long_column_name_3',
      ]);

      expect(result.length).toBeLessThanOrEqual(64);
      expect(result).toMatch(/_[a-z0-9]{4}$/);
    });

    it('支持自定义最大长度', () => {
      const result = buildIndexName(
        'idx',
        'very_long_table_name',
        ['column1', 'column2', 'column3'],
        30,
      );

      expect(result.length).toBeLessThanOrEqual(30);
      expect(result).toMatch(/_[a-z0-9]{4}$/);
    });

    it('组合多个长字段名时应该截断', () => {
      const result = buildIndexName('uk', 'transaction_history', [
        'account_number',
        'transaction_date',
        'reference_code',
      ]);

      expect(result.length).toBeLessThanOrEqual(64);
    });

    it('边界情况：刚好64字符不截断', () => {
      const result = buildIndexName('idx', 'tbl', ['f'.repeat(56)]);
      expect(result.length).toBe(64);
      expect(result).not.toMatch(/_[a-z0-9]{4}$/); // 不应该有哈希后缀
    });
  });

  describe('generateShortHash (测试通过 truncateIndexName)', () => {
    it('相同输入产生相同哈希', () => {
      const input = 'test_string_for_hash_verification_purpose';
      const result1 = truncateIndexName(input, 20);
      const result2 = truncateIndexName(input, 20);

      expect(result1).toBe(result2);
    });

    it('不同输入产生不同哈希', () => {
      const input1 = 'hash_test_string_one_for_verification';
      const input2 = 'hash_test_string_two_for_verification';

      const result1 = truncateIndexName(input1, 20);
      const result2 = truncateIndexName(input2, 20);

      expect(result1.slice(-4)).not.toBe(result2.slice(-4));
    });

    it('哈希后缀为4个字符的 base36', () => {
      const longName = 'this_is_a_very_long_index_name_that_needs_truncation';
      const result = truncateIndexName(longName);
      const hash = result.slice(-4);

      expect(hash).toMatch(/^[0-9a-z]{4}$/);
    });
  });
});
