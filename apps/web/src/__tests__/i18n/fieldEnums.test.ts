import i18next from 'i18next';
import { describe, expect, it } from 'vitest';
import { getDefaultKindLabel, getNullableLabel, getOnUpdateLabel } from '@/i18n/fieldEnums';

const testI18n = i18next.createInstance();

void testI18n.init({
  lng: 'test',
  returnNull: false,
  resources: {
    test: {
      translation: {
        fieldEnums: {
          nullable: {
            no: 'translated:fieldEnums.nullable.no',
            yes: 'translated:fieldEnums.nullable.yes',
          },
          defaultKind: {
            none: 'translated:fieldEnums.defaultKind.none',
            autoIncrement: 'translated:fieldEnums.defaultKind.autoIncrement',
            constant: 'translated:fieldEnums.defaultKind.constant',
            currentTimestamp: 'translated:fieldEnums.defaultKind.currentTimestamp',
            uuid: 'translated:fieldEnums.defaultKind.uuid',
          },
          onUpdate: {
            none: 'translated:fieldEnums.onUpdate.none',
            currentTimestamp: 'translated:fieldEnums.onUpdate.currentTimestamp',
          },
        },
      },
    },
  },
});

const t = testI18n.t;

describe('i18n/fieldEnums', () => {
  it('getNullableLabel 应映射是否为空文案', () => {
    expect(getNullableLabel(false, t)).toBe('translated:fieldEnums.nullable.no');
    expect(getNullableLabel(true, t)).toBe('translated:fieldEnums.nullable.yes');
  });

  it('getDefaultKindLabel 应映射默认值类型并在未知值回退 none', () => {
    expect(getDefaultKindLabel('none', t)).toBe('translated:fieldEnums.defaultKind.none');
    expect(getDefaultKindLabel('auto_increment', t)).toBe(
      'translated:fieldEnums.defaultKind.autoIncrement',
    );
    expect(getDefaultKindLabel('constant', t)).toBe('translated:fieldEnums.defaultKind.constant');
    expect(getDefaultKindLabel('current_timestamp', t)).toBe(
      'translated:fieldEnums.defaultKind.currentTimestamp',
    );
    expect(getDefaultKindLabel('uuid', t)).toBe('translated:fieldEnums.defaultKind.uuid');
    expect(getDefaultKindLabel(undefined, t)).toBe('translated:fieldEnums.defaultKind.none');
    // SAFETY: This deliberately sends an out-of-domain value to verify the runtime fallback.
    expect(getDefaultKindLabel('other' as never, t)).toBe('translated:fieldEnums.defaultKind.none');
  });

  it('getOnUpdateLabel 应映射更新策略并在未知值回退 none', () => {
    expect(getOnUpdateLabel('none', t)).toBe('translated:fieldEnums.onUpdate.none');
    expect(getOnUpdateLabel('current_timestamp', t)).toBe(
      'translated:fieldEnums.onUpdate.currentTimestamp',
    );
    expect(getOnUpdateLabel(undefined, t)).toBe('translated:fieldEnums.onUpdate.none');
    // SAFETY: This deliberately sends an out-of-domain value to verify the runtime fallback.
    expect(getOnUpdateLabel('other' as never, t)).toBe('translated:fieldEnums.onUpdate.none');
  });
});
