import { afterEach, expect, it, vi } from 'vitest';
import { copyText } from '@/utils/clipboard';

const commandDescriptor = Object.getOwnPropertyDescriptor(document, 'execCommand');

afterEach(() => {
  vi.restoreAllMocks();
  if (commandDescriptor) Object.defineProperty(document, 'execCommand', commandDescriptor);
  else Reflect.deleteProperty(document, 'execCommand');
});

it.each(['success', 'denied', 'throws'] as const)(
  'reports fallback %s and removes its temporary element',
  async (outcome) => {
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('Unavailable'));
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => {
        expect(document.querySelector('textarea')?.value).toBe('SELECT 1');
        if (outcome === 'throws') throw new Error('Copy failed');
        return outcome === 'success';
      }),
    });

    expect(await copyText('SELECT 1')).toBe(outcome === 'success');
    expect(document.querySelector('textarea')).toBeNull();
  },
);
