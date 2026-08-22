import { describe, expect, it } from 'vitest';
import { enUSCommon } from '@/i18n/locales/en-US/common';
import { jaJPCommon } from '@/i18n/locales/ja-JP/common';
import { zhCNCommon } from '@/i18n/locales/zh-CN/common';

const listLeafKeys = (value: unknown, prefix = ''): string[] => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    listLeafKeys(child, prefix ? `${prefix}.${key}` : key),
  );
};

const listInterpolations = (value: unknown, prefix = ''): Record<string, string[]> => {
  if (typeof value === 'string') {
    return { [prefix]: value.match(/\{\{[^}]+\}\}/g)?.sort() ?? [] };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.assign(
    {},
    ...Object.entries(value).map(([key, child]) =>
      listInterpolations(child, prefix ? `${prefix}.${key}` : key),
    ),
  );
};

describe('locale catalog parity', () => {
  it('keeps all locale leaf keys aligned', () => {
    expect(listLeafKeys(enUSCommon).sort()).toEqual(listLeafKeys(zhCNCommon).sort());
    expect(listLeafKeys(jaJPCommon).sort()).toEqual(listLeafKeys(zhCNCommon).sort());
  });

  it('keeps interpolation variables aligned', () => {
    const expected = listInterpolations(zhCNCommon);

    expect(listInterpolations(enUSCommon)).toEqual(expected);
    expect(listInterpolations(jaJPCommon)).toEqual(expected);
  });
});
