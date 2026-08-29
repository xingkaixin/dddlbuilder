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
  OutputContainer: () => null,
}));

const buildModel = (documentId: string): EditorSurfaceModel => ({
  documentId,
  isShareView: false,
  outputPanelOpen: false,
  tableBuilderProps: {} as EditorSurfaceModel['tableBuilderProps'],
  outputProps: {} as EditorSurfaceModel['outputProps'],
});

describe('EditorSurface', () => {
  it('clears local editor drafts when the active document changes', () => {
    const { rerender } = render(<EditorSurface model={buildModel('orders-tab')} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'index draft' }), {
      target: { value: 'orders_user_id' },
    });

    rerender(<EditorSurface model={buildModel('customers-tab')} />);

    expect(screen.getByRole('textbox', { name: 'index draft' })).toHaveValue('');
  });
});
