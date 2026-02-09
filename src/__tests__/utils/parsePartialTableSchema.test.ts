import { describe, expect, it } from 'vitest';
import { parsePartialTableSchema } from '@/utils/parsePartialTableSchema';

describe('parsePartialTableSchema', () => {
  it('should parse full json payload', () => {
    const text = JSON.stringify({
      tableName: 'users',
      tableComment: '用户表',
      fields: [{ fieldName: 'id', fieldType: 'BIGINT' }],
      indexes: [{ name: 'idx_id', fields: [{ name: 'id', direction: 'ASC' }] }],
    });

    const result = parsePartialTableSchema(text);
    expect(result?.tableName).toBe('users');
    expect(result?.fields?.[0]?.fieldName).toBe('id');
    expect(result?.indexes?.[0]?.name).toBe('idx_id');
  });

  it('should parse partial text and keep complete array objects only', () => {
    const text = '{"tableName":"users","fields":[{"fieldName":"id"},{"field';

    const result = parsePartialTableSchema(text);
    expect(result?.tableName).toBe('users');
    expect(result?.fields).toHaveLength(1);
    expect(result?.fields?.[0]?.fieldName).toBe('id');
  });

  it('should return null for invalid unrelated text', () => {
    const result = parsePartialTableSchema('not-a-json-stream');
    expect(result).toBeNull();
  });
});
