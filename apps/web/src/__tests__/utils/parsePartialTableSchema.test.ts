import { describe, expect, it } from 'vitest';
import { parsePartialTableSchema } from '@/utils/parsePartialTableSchema';

const generatedField = {
  fieldName: 'id',
  fieldType: 'BIGINT',
  fieldComment: '主键',
  nullable: false,
  defaultKind: 'none',
};

const generatedIndex = {
  name: 'idx_id',
  fields: [{ name: 'id', direction: 'ASC' }],
  unique: false,
};

describe('parsePartialTableSchema', () => {
  it('should return null for blank input', () => {
    expect(parsePartialTableSchema('   ')).toBeNull();
  });

  it('should parse full json payload', () => {
    const text = JSON.stringify({
      tableName: 'users',
      tableComment: '用户表',
      fields: [generatedField],
      indexes: [generatedIndex],
      designDecisions: [{ title: '主键策略', rationale: '使用 id 作为稳定主键' }],
    });

    const result = parsePartialTableSchema(text);
    expect(result?.tableName).toBe('users');
    expect(result?.fields?.[0]?.fieldName).toBe('id');
    expect(result?.indexes?.[0]?.name).toBe('idx_id');
    expect(result?.designDecisions?.[0]?.title).toBe('主键策略');
  });

  it('should parse partial text and keep complete array objects only', () => {
    const text = `{"tableName":"users","fields":[${JSON.stringify(generatedField)},{"field`;

    const result = parsePartialTableSchema(text);
    expect(result?.tableName).toBe('users');
    expect(result?.fields).toHaveLength(1);
    expect(result?.fields?.[0]?.fieldName).toBe('id');
  });

  it('should parse partial tableComment and indexes', () => {
    const text = `{"tableComment":"测试表","indexes":[${JSON.stringify(generatedIndex)},{"name":"idx_b"`;

    const result = parsePartialTableSchema(text);
    expect(result?.tableComment).toBe('测试表');
    expect(result?.indexes).toHaveLength(1);
    expect(result?.indexes?.[0]?.name).toBe('idx_id');
  });

  it('should parse partial design decisions', () => {
    const text =
      '{"designDecisions":[{"title":"状态字段","rationale":"集中表达订单流转"},{"title":"尾部"';

    const result = parsePartialTableSchema(text);
    expect(result?.designDecisions).toHaveLength(1);
    expect(result?.designDecisions?.[0]).toEqual({
      title: '状态字段',
      rationale: '集中表达订单流转',
    });
  });

  it('should return null for invalid unrelated text', () => {
    const result = parsePartialTableSchema('not-a-json-stream');
    expect(result).toBeNull();
  });

  it('should parse partial fields with nested arrays and skip incomplete tail', () => {
    const field = {
      ...generatedField,
      fieldName: 'status',
      enumValues: ['enabled', 'disabled'],
    };
    const text = `{"fields":[${JSON.stringify(field)},{"fieldName":"tail"`;

    const result = parsePartialTableSchema(text);
    expect(result?.fields).toHaveLength(1);
    expect(result?.fields?.[0]?.fieldName).toBe('status');
  });

  it('should return null when full json parses to non-object value', () => {
    expect(parsePartialTableSchema('123')).toBeNull();
    expect(parsePartialTableSchema('null')).toBeNull();
  });

  it('should handle escaped strings and nested objects in streamed field objects', () => {
    const field = {
      ...generatedField,
      fieldName: 'na"me',
      extra: { level: 1 },
    };
    const text = `{"fields":[${JSON.stringify(field)},{"fieldName":"unfinished"`;

    const result = parsePartialTableSchema(text);
    expect(result?.fields).toHaveLength(1);
    expect(result?.fields?.[0]?.fieldName).toBe('na"me');
  });

  it('filters malformed array items consistently for complete and streaming payloads', () => {
    const malformedArrays = {
      fields: [{ fieldType: 'BIGINT' }],
      indexes: [{ name: 'idx_invalid' }],
      designDecisions: [{ title: 'missing rationale' }],
    };
    const complete = parsePartialTableSchema(JSON.stringify(malformedArrays));
    const streaming = parsePartialTableSchema(`${JSON.stringify(malformedArrays).slice(0, -1)},`);

    expect(complete?.fields).toEqual([]);
    expect(complete?.indexes).toEqual([]);
    expect(complete?.designDecisions).toEqual([]);
    expect(streaming).toEqual(complete);
  });
});
