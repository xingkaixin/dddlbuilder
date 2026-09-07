import { useState } from 'react';
import { fireEvent, render, screen } from '@/__tests__/utils/test-utils';
import { EditorSurface, type EditorSurfaceModel } from '@/components/App/EditorSurface';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/App/containers/TableBuilderContainer', () => ({
  TableBuilderContainer: () => {
    const [draft, setDraft] = useState('');
    return (
      <input
        aria-label="index draft"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
    );
  },
}));

vi.mock('@/components/App/containers/OutputContainer', () => ({
  OutputContainer: () => <div>Generated SQL</div>,
}));
vi.mock('@/components/App/TableConfig', () => ({ TableConfig: () => null }));

const buildModel = (documentId: string): EditorSurfaceModel => ({
  documentId,
  isShareView: false,
  editorView: 'design',
  setEditorView: vi.fn(),
  tableBuilderProps: {} as EditorSurfaceModel['tableBuilderProps'],
  outputProps: {
    ddlOutputProps: { schemaLintIssues: [] },
  } as unknown as EditorSurfaceModel['outputProps'],
});

describe('EditorSurface', () => {
  it('preserves unfinished editor drafts across views', () => {
    const model = buildModel('orders-tab');
    const { rerender } = render(<EditorSurface model={model} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'index draft' }), {
      target: { value: 'orders_user_id' },
    });
    rerender(<EditorSurface model={{ ...model, editorView: 'output' }} />);
    expect(screen.getByText('Generated SQL')).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'index draft' })).not.toBeInTheDocument();
    rerender(<EditorSurface model={{ ...model, editorView: 'split' }} />);
    expect(screen.getByRole('textbox', { name: 'index draft' })).toHaveValue('orders_user_id');
    const separator = screen.getByRole('separator');
    fireEvent.keyDown(separator, { key: 'End' });
    expect(separator).toHaveAttribute('aria-valuenow', '75');
    fireEvent.keyDown(separator, { key: 'ArrowDown' });
    expect(separator).toHaveAttribute('aria-valuenow', '75');
  });

  it('clears local editor drafts when the active document changes', () => {
    const { rerender } = render(<EditorSurface model={buildModel('orders-tab')} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'index draft' }), {
      target: { value: 'orders_user_id' },
    });

    rerender(<EditorSurface model={buildModel('customers-tab')} />);

    expect(screen.getByRole('textbox', { name: 'index draft' })).toHaveValue('');
  });
});
