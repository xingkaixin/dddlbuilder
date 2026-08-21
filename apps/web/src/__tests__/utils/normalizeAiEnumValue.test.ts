import { describe, expect, it } from 'vitest';
import { normalizeGeneratedTableSchema } from '@/utils/normalizeAiEnumValue';
import {
  normalizeFieldDefaultKind,
  normalizeFieldNullable,
  normalizeFieldOnUpdate,
} from '@ddlbuilder/shared-types';

describe('normalizeAiEnumValue', () => {
  it('normalizeFieldNullable 应识别中英文同义词与默认值', () => {
    expect(normalizeFieldNullable('否')).toBe(false);
    expect(normalizeFieldNullable(' no ')).toBe(false);
    expect(normalizeFieldNullable('not null')).toBe(false);
    expect(normalizeFieldNullable('not_null')).toBe(false);
    expect(normalizeFieldNullable('false')).toBe(false);
    expect(normalizeFieldNullable('0')).toBe(false);

    expect(normalizeFieldNullable('是')).toBe(true);
    expect(normalizeFieldNullable('yes')).toBe(true);

    // 模型没给或给出无法识别的表述时按可空处理，与迁移前的 normalizeAiNullable 一致
    expect(normalizeFieldNullable(undefined)).toBe(true);
    expect(normalizeFieldNullable('NULL')).toBe(true);
    expect(normalizeFieldNullable('可空')).toBe(true);
  });

  it('normalizeFieldDefaultKind 应识别默认类型并在未知值回退为 none', () => {
    expect(normalizeFieldDefaultKind('自增')).toBe('auto_increment');
    expect(normalizeFieldDefaultKind('auto increment')).toBe('auto_increment');
    expect(normalizeFieldDefaultKind('identity')).toBe('auto_increment');

    expect(normalizeFieldDefaultKind('const')).toBe('constant');
    expect(normalizeFieldDefaultKind('literal')).toBe('constant');

    expect(normalizeFieldDefaultKind('current timestamp')).toBe('current_timestamp');
    expect(normalizeFieldDefaultKind('now()')).toBe('current_timestamp');

    expect(normalizeFieldDefaultKind('uuid')).toBe('uuid');
    expect(normalizeFieldDefaultKind('anything else')).toBe('none');
    expect(normalizeFieldDefaultKind(null)).toBe('none');
  });

  it('normalizeFieldOnUpdate 应识别当前时间并在未知值回退为 none', () => {
    expect(normalizeFieldOnUpdate('当前时间')).toBe('current_timestamp');
    expect(normalizeFieldOnUpdate('current_time')).toBe('current_timestamp');
    expect(normalizeFieldOnUpdate('current timestamp')).toBe('current_timestamp');
    expect(normalizeFieldOnUpdate('later')).toBe('none');
    expect(normalizeFieldOnUpdate(undefined)).toBe('none');
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
      nullable: false,
      defaultKind: 'auto_increment',
      onUpdate: 'none',
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
});
