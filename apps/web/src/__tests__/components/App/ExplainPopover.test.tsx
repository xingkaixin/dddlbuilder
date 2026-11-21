import { useRef } from 'react';
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/__tests__/utils/test-utils';
import { AuthSessionProvider } from '@/auth/AuthSessionProvider';
import { ExplainPopover } from '@/components/App/ExplainPopover';
import { i18n } from '@/i18n';
import { LocaleProvider } from '@/i18n/LocaleContext';

function ExplainPopoverHarness({ text }: { text: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <LocaleProvider>
      <AuthSessionProvider>
        <div ref={containerRef}>
          <ExplainPopover containerRef={containerRef}>
            <pre>{text}</pre>
          </ExplainPopover>
        </div>
      </AuthSessionProvider>
    </LocaleProvider>
  );
}

function selectNodeText(node: Node) {
  const selection = window.getSelection();

  if (!selection) {
    throw new Error('Expected window.getSelection() to be available');
  }

  const range = document.createRange();
  range.selectNodeContents(node);
  range.getBoundingClientRect = () => new DOMRect(100, 500, 120, 20);
  selection.removeAllRanges();
  selection.addRange(range);

  act(() => {
    document.dispatchEvent(new Event('selectionchange'));
  });
}

describe('ExplainPopover', () => {
  afterEach(() => {
    window.getSelection()?.removeAllRanges();
    vi.restoreAllMocks();
  });

  it('ignores selectionchange when selection has no ranges without throwing', () => {
    render(<ExplainPopoverHarness text="CREATE TABLE users (id INT);" />);

    const selection = window.getSelection();

    if (!selection) {
      throw new Error('Expected window.getSelection() to be available');
    }

    const errors: unknown[] = [];

    const onError = (event: ErrorEvent) => {
      errors.push(event.error);
    };

    window.addEventListener('error', onError);

    try {
      selection.removeAllRanges();
      vi.spyOn(selection, 'isCollapsed', 'get').mockReturnValue(false);

      act(() => {
        document.dispatchEvent(new Event('selectionchange'));
      });
    } finally {
      window.removeEventListener('error', onError);
    }

    expect(errors).toEqual([]);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('prevents mousedown from clearing selection and dismisses immediately when selection clears', () => {
    render(<ExplainPopoverHarness text="CREATE TABLE users (id INT);" />);

    const codeElement = screen.getByText('CREATE TABLE users (id INT);');
    selectNodeText(codeElement);

    const triggerButton = screen.getByRole('button');
    const mouseDownEvent = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    fireEvent(triggerButton, mouseDownEvent);
    expect(mouseDownEvent.defaultPrevented).toBe(true);

    fireEvent.mouseUp(document);
    window.getSelection()?.removeAllRanges();
    act(() => {
      document.dispatchEvent(new Event('selectionchange'));
    });

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('opens the explain result popover with the selected snippet when clicking the trigger button', () => {
    const sql = 'CREATE TABLE users (id INT);';
    render(<ExplainPopoverHarness text={sql} />);

    selectNodeText(screen.getByText(sql));

    const triggerButton = screen.getByRole('button');
    fireEvent.mouseDown(triggerButton);
    fireEvent.click(triggerButton);

    expect(screen.getByText(i18n.t('explain.title'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('explain.selectedSnippet', { text: sql }))).toBeInTheDocument();
  });
});
