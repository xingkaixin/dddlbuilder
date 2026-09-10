import { describe, expect, it } from 'vitest';
import { enUSCommon } from '@/i18n/locales/en-US/common';
import { jaJPCommon } from '@/i18n/locales/ja-JP/common';
import { zhCNCommon } from '@/i18n/locales/zh-CN/common';

type LocaleNode = string | { [key: string]: LocaleNode };

type InterpolationMap = Record<string, string[]>;

const isLocaleString = (value: LocaleNode): value is string => typeof value === 'string';

const listLeafKeys = (value: LocaleNode, prefix = ''): string[] => {
  if (isLocaleString(value)) return [prefix];

  return Object.entries(value).flatMap(([key, child]) =>
    listLeafKeys(child, prefix ? `${prefix}.${key}` : key),
  );
};

// oxlint-disable anti-slop/no-known-value-widening -- this recursive parity helper intentionally builds an open path-to-interpolations map.
const listInterpolations = (value: LocaleNode, prefix = ''): InterpolationMap => {
  if (isLocaleString(value)) {
    return { [prefix]: value.match(/\{\{[^}]+\}\}/g)?.sort() ?? [] };
  }

  return Object.assign(
    {},
    ...Object.entries(value).map(([key, child]) =>
      listInterpolations(child, prefix ? `${prefix}.${key}` : key),
    ),
  );
};
// oxlint-enable anti-slop/no-known-value-widening

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
