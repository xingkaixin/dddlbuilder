import { describe, it, expect } from 'vitest';
import { truncateIdentifierName as truncateIndexName } from '../utils/identifierNaming';

describe('indexNameUtils', () => {
  describe('truncateIndexName', () => {
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
  });
});
