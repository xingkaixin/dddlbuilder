import { describe, expect, it } from 'vitest';
import { getDefaultKindLabel, getNullableLabel, getOnUpdateLabel } from '@/i18n/fieldEnums';

const t = ((key: string) => `translated:${key}`) as any;

describe('i18n/fieldEnums', () => {
  it('getNullableLabel 应映射是否为空文案', () => {
    expect(getNullableLabel('否', t)).toBe('translated:fieldEnums.nullable.no');
    expect(getNullableLabel('是', t)).toBe('translated:fieldEnums.nullable.yes');
    expect(getNullableLabel('unknown', t)).toBe('translated:fieldEnums.nullable.yes');
  });

  it('getDefaultKindLabel 应映射默认值类型并在未知值回退 none', () => {
    expect(getDefaultKindLabel('无', t)).toBe('translated:fieldEnums.defaultKind.none');
    expect(getDefaultKindLabel('自增', t)).toBe('translated:fieldEnums.defaultKind.autoIncrement');
    expect(getDefaultKindLabel('常量', t)).toBe('translated:fieldEnums.defaultKind.constant');
    expect(getDefaultKindLabel('当前时间', t)).toBe(
      'translated:fieldEnums.defaultKind.currentTimestamp',
    );
    expect(getDefaultKindLabel('uuid', t)).toBe('translated:fieldEnums.defaultKind.uuid');
    expect(getDefaultKindLabel('other', t)).toBe('translated:fieldEnums.defaultKind.none');
  });

  it('getOnUpdateLabel 应映射更新策略并在未知值回退 none', () => {
    expect(getOnUpdateLabel('无', t)).toBe('translated:fieldEnums.onUpdate.none');
    expect(getOnUpdateLabel('当前时间', t)).toBe('translated:fieldEnums.onUpdate.currentTimestamp');
    expect(getOnUpdateLabel('other', t)).toBe('translated:fieldEnums.onUpdate.none');
  });
});
