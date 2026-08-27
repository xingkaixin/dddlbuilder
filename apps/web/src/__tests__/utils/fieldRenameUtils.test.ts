import { describe, expect, it } from 'vitest';
import { renameIndexNameTokens } from '@/utils/fieldRenameUtils';

const replaceIdentifierToken = (source: string, oldName: string, newName: string) =>
  renameIndexNameTokens(source, new Map([[oldName.toLowerCase(), newName]]), 'mysql');

describe('fieldRenameUtils', () => {
  it('同时替换交换的索引名称片段', () => {
    const renames = new Map([
      ['a', 'b'],
      ['b', 'a'],
    ]);
    expect(renameIndexNameTokens('idx_a_b', renames, 'mysql')).toBe('idx_b_a');
  });

  describe('replaceIdentifierToken', () => {
    it('应替换下划线分隔的索引名称字段片段', () => {
      const result = replaceIdentifierToken('idx_user_old_name', 'old_name', 'new_name');
      expect(result).toBe('idx_user_new_name');
    });

    it('不应误替换更长单词中的子串', () => {
      const result = replaceIdentifierToken('idx_video_id', 'id', 'uuid');
      expect(result).toBe('idx_video_uuid');
    });

    it('不应替换带后缀数字的不同标识符', () => {
      const result = replaceIdentifierToken('idx_user_name1', 'name', 'nickname');
      expect(result).toBe('idx_user_name1');
    });

    it('应支持大小写不敏感替换', () => {
      const result = replaceIdentifierToken('idx_CREATED_AT', 'created_at', 'created_on');
      expect(result).toBe('idx_created_on');
    });
  });

  it('PostgreSQL 应区分大小写替换和匹配', () => {
    const renames = new Map([['UserID', 'account_id']]);
    expect(renameIndexNameTokens('idx_UserID_userid', renames, 'postgresql')).toBe(
      'idx_account_id_userid',
    );
  });
});
