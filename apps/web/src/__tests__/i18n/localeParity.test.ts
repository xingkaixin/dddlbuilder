import { describe, expect, it } from 'vitest';
import { enUSCommon } from '@/i18n/locales/en-US/common';
import { zhCNCommon } from '@/i18n/locales/zh-CN/common';

const listLeafKeys = (value: unknown, prefix = ''): string[] => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    listLeafKeys(child, prefix ? `${prefix}.${key}` : key),
  );
};

describe('locale catalog parity', () => {
  it('keeps Chinese and English leaf keys aligned', () => {
    expect(listLeafKeys(enUSCommon).sort()).toEqual(listLeafKeys(zhCNCommon).sort());
  });
});
