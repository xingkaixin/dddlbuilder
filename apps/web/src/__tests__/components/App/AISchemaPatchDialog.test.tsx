import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor, within } from '@/__tests__/utils/test-utils';
import { withDefaultEditorSession } from '@ddlbuilder/shared-types';
import { AppDialogLayer } from '@/components/App/AppDialogLayer';
import type { AppDialogLayerModel } from '@/components/App/buildAppDialogLayerModel';
import { requestGenerateTable } from '@/services/aiGenerateTableService';

vi.mock('@/services/aiGenerateTableService', () => ({ requestGenerateTable: vi.fn() }));

vi.mock('@/components/App/containers/GlobalDialogs', () => ({ GlobalDialogs: () => null }));
vi.mock('@/webmcp/WebMcpChangeDialog', () => ({ WebMcpChangeDialog: () => null }));
vi.mock('@/auth/AuthDialogs', () => ({ AuthDialogs: () => null }));
vi.mock('@/components/App/WorkspaceMigrationDialog', () => ({
  WorkspaceMigrationDialog: () => null,
}));
vi.mock('@/i18n/LocaleContext', () => ({ useLocale: () => ({ resolvedLocale: 'zh-CN' }) }));
vi.mock('@/auth/AuthSessionProvider', () => ({
  useAuthSession: () => ({
    status: 'signed_in',
    userId: 'user',
    workspaceId: 'workspace',
    workspaceScope: { kind: 'user', userId: 'user', workspaceId: 'workspace' },
    creditsStatus: 'ready',
    creditBalance: 1000,
    refreshCredits: vi.fn(),
  }),
}));

const state = withDefaultEditorSession({
  schemaName: '',
  tableName: 'users',
  tableComment: '',
  dbType: 'mysql',
  rows: [],
  indexes: [],
  authInput: '',
  authObjects: [],
});

function Harness() {
  const [open, setOpen] = useState(true);
  const model = {
    saveObjectType: 'table',
    globalDialogs: { saveDialog: {} },
    userSettings: { open: false },
    importDialog: { visible: false },
    indexAdvisor: { open: false },
    aiPatch: {
      open,
      onOpenChange: setOpen,
      dbType: 'mysql',
      currentState: state,
      templates: [],
      onApplyChanges: vi.fn(),
      onFocusChange: vi.fn(),
    },
  } as unknown as AppDialogLayerModel;
  return (
    <>
      <button onClick={() => setOpen(true)}>Reopen</button>
      <AppDialogLayer model={model} />
    </>
  );
}

describe('AI patch dialog session', () => {
  it('keeps the conversation input across closing and reopening the view', async () => {
    render(<Harness />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '保留这次结构修改' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    const reopened = await screen.findByRole('textbox');
    expect(reopened).toHaveValue('保留这次结构修改');
  });

  it('requires explicit cancellation to stop an active generation', async () => {
    let signal: AbortSignal | undefined;
    vi.mocked(requestGenerateTable).mockImplementation((_payload, options) => {
      signal = options?.signal;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    });
    render(<Harness />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '添加状态列' } });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));
    await waitFor(() => expect(signal).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.getByRole('textbox')).toHaveValue('添加状态列');
    expect(signal?.aborted).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    await waitFor(() => expect(signal?.aborted).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
  });

  it('only clears the session after confirming restart', async () => {
    render(<Harness />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '尚未提交的修改' } });
    fireEvent.click(screen.getByRole('button', { name: '重新开始' }));
    const confirmation = screen.getByRole('alertdialog');
    fireEvent.click(within(confirmation).getByRole('button', { name: '取消' }));
    expect(screen.getByRole('textbox')).toHaveValue('尚未提交的修改');
    fireEvent.click(screen.getByRole('button', { name: '重新开始' }));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: '重新开始' }),
    );
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(''));
  });
});
