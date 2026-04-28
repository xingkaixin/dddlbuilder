import { describe, expect, it } from 'vitest';
import {
  normalizeAiDefaultKind,
  normalizeAiNullable,
  normalizeAiOnUpdate,
  normalizeGeneratedTableSchema,
  normalizeReviewSuggestions,
} from '@/utils/normalizeAiEnumValue';

describe('normalizeAiEnumValue', () => {
  it('normalizeAiNullable 应识别中英文同义词与默认值', () => {
    expect(normalizeAiNullable('否')).toBe('否');
    expect(normalizeAiNullable(' no ')).toBe('否');
    expect(normalizeAiNullable('not null')).toBe('否');
    expect(normalizeAiNullable('not_null')).toBe('否');
    expect(normalizeAiNullable('false')).toBe('否');
    expect(normalizeAiNullable('0')).toBe('否');

    expect(normalizeAiNullable('是')).toBe('是');
    expect(normalizeAiNullable('yes')).toBe('是');
    expect(normalizeAiNullable(undefined)).toBe('是');
  });

  it('normalizeAiDefaultKind 应识别默认类型并在未知值回退为无', () => {
    expect(normalizeAiDefaultKind('自增')).toBe('自增');
    expect(normalizeAiDefaultKind('auto increment')).toBe('自增');
    expect(normalizeAiDefaultKind('identity')).toBe('自增');

    expect(normalizeAiDefaultKind('const')).toBe('常量');
    expect(normalizeAiDefaultKind('literal')).toBe('常量');

    expect(normalizeAiDefaultKind('current timestamp')).toBe('当前时间');
    expect(normalizeAiDefaultKind('now()')).toBe('当前时间');

    expect(normalizeAiDefaultKind('uuid')).toBe('uuid');
    expect(normalizeAiDefaultKind('anything else')).toBe('无');
    expect(normalizeAiDefaultKind(null)).toBe('无');
  });

  it('normalizeAiOnUpdate 应识别当前时间并在未知值回退为无', () => {
    expect(normalizeAiOnUpdate('当前时间')).toBe('当前时间');
    expect(normalizeAiOnUpdate('current_time')).toBe('当前时间');
    expect(normalizeAiOnUpdate('current timestamp')).toBe('当前时间');
    expect(normalizeAiOnUpdate('later')).toBe('无');
    expect(normalizeAiOnUpdate(undefined)).toBe('无');
  });

  it('normalizeGeneratedTableSchema 应处理 fields 数组与非数组输入', () => {
    const normalized = normalizeGeneratedTableSchema({
      tableName: 'users',
      tableComment: '',
      dbType: 'mysql',
      fields: [
        {
          fieldName: 'id',
          fieldType: 'bigint',
          fieldComment: '',
          nullable: 'false',
          defaultKind: 'auto_increment',
          defaultValue: '',
          onUpdate: 'none',
        },
      ],
      designDecisions: [{ title: '主键策略', rationale: '使用自增主键' }, { title: '无效项' }],
    } as any);

    expect(normalized.fields[0]).toMatchObject({
      nullable: '否',
      defaultKind: '自增',
      onUpdate: '无',
    });
    expect(normalized.designDecisions).toEqual([{ title: '主键策略', rationale: '使用自增主键' }]);

    const noFields = normalizeGeneratedTableSchema({
      tableName: 'users',
      tableComment: '',
      dbType: 'mysql',
      fields: 'not-array',
    } as any);

    expect(noFields.fields).toEqual([]);
  });

  it('normalizeReviewSuggestions 应跳过非对象或无 type 项', () => {
    const input = [
      null,
      1,
      'text',
      { foo: 'bar' },
      {
        type: 'add_field',
        field: {
          fieldName: 'created_at',
          nullable: 'n',
          defaultKind: 'current_timestamp',
          onUpdate: 'now()',
        },
      },
    ];

    const result = normalizeReviewSuggestions(input as any);

    expect(result[0]).toBeNull();
    expect(result[1]).toBe(1);
    expect(result[2]).toBe('text');
    expect(result[3]).toEqual({ foo: 'bar' });
    expect((result[4] as any).field).toMatchObject({
      nullable: '否',
      defaultKind: '当前时间',
      onUpdate: '当前时间',
    });
  });

  it('normalizeReviewSuggestions 应处理 fieldModification.changes 分支', () => {
    const input = [
      {
        type: 'modify_field',
        fieldModification: {
          from: 'status',
          to: 'status',
          changes: {
            nullable: 'yes',
            defaultKind: 'const',
            onUpdate: 'CURRENT_TIMESTAMP',
          },
        },
      },
    ];

    const result = normalizeReviewSuggestions(input as any);

    expect((result[0] as any).fieldModification.changes).toMatchObject({
      nullable: '是',
      defaultKind: '常量',
      onUpdate: '当前时间',
    });
  });
});
