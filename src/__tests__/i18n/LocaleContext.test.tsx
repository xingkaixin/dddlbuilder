import { act, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import i18n from '@/i18n';
import { LocaleProvider, useLocale } from '@/i18n/LocaleContext';
import { LOCAL_STORAGE_KEY } from '@/i18n/types';
import * as localeTypes from '@/i18n/types';

function Wrapper({ children }: PropsWithChildren) {
  return <LocaleProvider>{children}</LocaleProvider>;
}

describe('i18n/LocaleContext', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(window.localStorage, 'getItem').mockReturnValue(null);
  });

  afterEach(() => {
    document.documentElement.lang = 'zh-CN';
  });

  it('应根据 localStorage 初始化语言', async () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation((key) =>
      key === LOCAL_STORAGE_KEY ? 'en-US' : null,
    );

    await i18n.changeLanguage('zh-CN');

    const { result } = renderHook(() => useLocale(), { wrapper: Wrapper });

    expect(result.current.locale).toBe('en-US');
    expect(result.current.resolvedLocale).toBe('en-US');
    await waitFor(() => {
      expect(document.documentElement.lang).toBe('en-US');
    });
  });

  it('setLocale 应更新状态并写入 localStorage', async () => {
    const setItemSpy = vi.spyOn(window.localStorage, 'setItem');
    const { result } = renderHook(() => useLocale(), { wrapper: Wrapper });

    act(() => {
      result.current.setLocale('en-US');
    });

    await waitFor(() => {
      expect(result.current.locale).toBe('en-US');
      expect(document.documentElement.lang).toBe('en-US');
    });

    expect(setItemSpy).toHaveBeenCalledWith(LOCAL_STORAGE_KEY, 'en-US');
  });

  it('切换语言后 resolvedLocale 应与当前 locale 保持一致', async () => {
    await i18n.changeLanguage('zh-CN');

    const { result } = renderHook(() => useLocale(), { wrapper: Wrapper });

    act(() => {
      result.current.setLocale('en-US');
    });

    await waitFor(() => {
      expect(result.current.locale).toBe('en-US');
      expect(result.current.resolvedLocale).toBe('en-US');
      expect(document.documentElement.lang).toBe('en-US');
    });
  });

  it('setLocale 在 localStorage 抛错时不应中断流程', () => {
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });

    const { result } = renderHook(() => useLocale(), { wrapper: Wrapper });

    expect(() => {
      act(() => {
        result.current.setLocale('en-US');
      });
    }).not.toThrow();

    expect(result.current.locale).toBe('en-US');
  });

  it('应响应 languageChanged 事件并同步 locale', async () => {
    const { result } = renderHook(() => useLocale(), { wrapper: Wrapper });

    act(() => {
      i18n.emit('languageChanged', 'en');
    });

    await waitFor(() => {
      expect(result.current.locale).toBe('en-US');
    });
  });

  it('resolvedLocale 在 i18n 返回未知语言时应回退到当前 locale', () => {
    const normalizeSpy = vi.spyOn(localeTypes, 'normalizeLocale');
    normalizeSpy.mockImplementation((value) => {
      if (value === i18n.resolvedLanguage) return null;
      return value === 'en-US' || value === 'zh-CN'
        ? (value as 'en-US' | 'zh-CN')
        : null;
    });

    const { result } = renderHook(() => useLocale(), { wrapper: Wrapper });

    expect(result.current.resolvedLocale).toBe(result.current.locale);
  });

  it('useLocale 脱离 Provider 时应抛错', () => {
    expect(() => renderHook(() => useLocale())).toThrow(
      'useLocale must be used within LocaleProvider',
    );
  });
});
