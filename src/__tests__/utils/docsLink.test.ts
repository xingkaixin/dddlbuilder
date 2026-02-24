import { describe, expect, it } from 'vitest';
import { getDocsUrl } from '@/utils/docsLink';

describe('docsLink', () => {
  it('应将 zh-CN 解析到中文文档路径', () => {
    expect(getDocsUrl('zh-CN')).toBe('/docs/zh/');
  });

  it('应将 en-US 解析到英文文档路径', () => {
    expect(getDocsUrl('en-US')).toBe('/docs/en/');
  });

  it('应将未知语言回退到中文文档路径', () => {
    expect(getDocsUrl('fr-FR')).toBe('/docs/zh/');
  });

  it('应在空值时回退到中文文档路径', () => {
    expect(getDocsUrl()).toBe('/docs/zh/');
    expect(getDocsUrl(null)).toBe('/docs/zh/');
  });
});
