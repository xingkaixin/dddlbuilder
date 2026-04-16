import { describe, expect, it } from 'vitest';
import { isSameIdentifierToken, replaceIdentifierToken } from '@/utils/fieldRenameUtils';

describe('fieldRenameUtils', () => {
  describe('replaceIdentifierToken', () => {
    it('应替换下划线分隔的索引名称字段片段', () => {
      const result = replaceIdentifierToken('idx_user_old_name', 'old_name', 'new_name');
      expect(result).toBe('idx_user_new_name');
    });

    it('不应误替换更长单词中的子串', () => {
      const result = replaceIdentifierToken('idx_video_id', 'id', 'uuid');
      expect(result).toBe('idx_video_uuid');
    });

    it('应替换分区表达式中的字段标识符', () => {
      const result = replaceIdentifierToken('YEAR(created_at)', 'created_at', 'created_on');
      expect(result).toBe('YEAR(created_on)');
    });

    it('不应替换带后缀数字的不同标识符', () => {
      const result = replaceIdentifierToken('idx_user_name1', 'name', 'nickname');
      expect(result).toBe('idx_user_name1');
    });

    it('应支持大小写不敏感替换', () => {
      const result = replaceIdentifierToken('DAYOFMONTH(CREATED_AT)', 'created_at', 'created_on');
      expect(result).toBe('DAYOFMONTH(created_on)');
    });
  });

  describe('isSameIdentifierToken', () => {
    it('应忽略大小写比较', () => {
      expect(isSameIdentifierToken('UserName', 'username')).toBe(true);
    });
  });
});
