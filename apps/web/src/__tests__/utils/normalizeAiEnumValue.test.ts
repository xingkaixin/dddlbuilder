import { describe, expect, it } from 'vitest';
import { normalizeGeneratedTableSchema } from '@/utils/normalizeAiEnumValue';
import {
  normalizeFieldDefaultKind,
  normalizeFieldNullable,
  normalizeFieldOnUpdate,
} from '@ddlbuilder/shared-types';
import type { GeneratedField, GeneratedTableSchema } from '@ddlbuilder/shared-types/ai-generate';

const field = (fieldName: string, id?: string | null): GeneratedField => ({
  id,
  fieldName,
  fieldType: 'int',
  fieldComment: '',
  nullable: true,
  defaultKind: 'none',
});
const schema = (fields: GeneratedField[]): GeneratedTableSchema => ({
  tableName: 'users',
  tableComment: '',
  fields,
});

describe('normalizeAiEnumValue', () => {
  it('preserves renamed identities and assigns new identities once for later conversation turns', () => {
    const first = normalizeGeneratedTableSchema(
      schema([field('phone', 'contact'), field('email', null)]),
      [field('mobile', 'contact')],
    );
    expect(first.fields[0].id).toBe('contact');
    expect(first.fields[1].id).toBeTruthy();
    const second = normalizeGeneratedTableSchema(
      schema([first.fields[0], { ...first.fields[1], fieldName: 'address' }]),
      first.fields,
    );
    expect(second.fields.map((row) => row.id)).toEqual(first.fields.map((row) => row.id));
  });

  it('accepts name-matched legacy fields with an incremental addition or a deletion', () => {
    const base = [field('phone', 'contact'), field('', 'empty-row')];
    expect(
      normalizeGeneratedTableSchema(schema([field('phone'), field('email')]), base).fields[0].id,
    ).toBe('contact');
    expect(normalizeGeneratedTableSchema(schema([]), base).fields).toEqual([]);
  });

  it('requires explicit new-field intent when replacing an existing field', () => {
    const base = [field('phone', 'contact')];
    expect(() => normalizeGeneratedTableSchema(schema([field('email')]), base)).toThrow(
      'explicit identity',
    );
    const replacement = normalizeGeneratedTableSchema(schema([field('email', null)]), base);
    expect(replacement.fields[0].id).not.toBe('contact');
  });

  it('rejects unknown or duplicated field identities', () => {
    const base = [field('phone', 'contact')];
    expect(() => normalizeGeneratedTableSchema(schema([field('email', 'invented')]), base)).toThrow(
      'Unknown',
    );
    expect(() =>
      normalizeGeneratedTableSchema(
        schema([field('phone', 'contact'), field('email', 'contact')]),
        base,
      ),
    ).toThrow('Duplicate');
  });

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
