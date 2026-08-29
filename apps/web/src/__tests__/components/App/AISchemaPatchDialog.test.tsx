import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor, within } from '@/__tests__/utils/test-utils';
import { withDefaultEditorSession } from '@ddlbuilder/shared-types';
import { AppDialogLayer } from '@/components/App/AppDialogLayer';
import type { AppDialogLayerModel } from '@/components/App/buildAppDialogLayerModel';
import { applyAISchemaChanges } from '@/components/App/aiSchemaPatchTransition';
import { requestGenerateTable } from '@/services/aiGenerateTableService';
import type { AISchemaChange } from '@/utils/aiSchemaChanges';

vi.mock('@/services/aiGenerateTableService', () => ({ requestGenerateTable: vi.fn() }));

vi.mock('@/components/App/containers/GlobalDialogs', () => ({ GlobalDialogs: () => null }));
vi.mock('@/webmcp/WebMcpChangeDialog', () => ({ WebMcpChangeDialog: () => null }));
vi.mock('@/auth/AuthDialogs', () => ({ AuthDialogs: () => null }));
vi.mock('@/components/App/WorkspaceMigrationDialog', () => ({
  WorkspaceMigrationDialog: () => null,
}));
vi.mock('@/i18n/LocaleContext', () => ({ useLocale: () => ({ resolvedLocale: 'zh-CN' }) }));
vi.mock('@/auth/AuthSessionProvider', () => {
  const useAuthIdentity = () => ({
    status: 'signed_in',
    userId: 'user',
    workspaceId: 'workspace',
    workspaceScope: { kind: 'user', userId: 'user', workspaceId: 'workspace' },
  });
  const useAuthCredits = () => ({
    creditsStatus: 'ready',
    creditBalance: 1000,
    refreshCredits: vi.fn(),
  });
  const useAuthDialog = () => ({ openAuthDialog: vi.fn() });
  return { useAuthIdentity, useAuthCredits, useAuthDialog };
});

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
const applyChanges = vi.fn();

function Harness() {
  const [open, setOpen] = useState(true);
  const [currentState, setCurrentState] = useState(state);
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
      currentState,
      templates: [],
      onApplyChanges: (
        changes: AISchemaChange[],
        candidateState: typeof state,
        expectedState: typeof state,
      ): typeof state => {
        const nextState = applyAISchemaChanges(currentState, candidateState, changes);
        applyChanges(changes, candidateState, expectedState, nextState);
        setCurrentState(nextState);
        return nextState;
      },
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
  beforeEach(() => {
    vi.mocked(requestGenerateTable).mockReset();
    applyChanges.mockReset();
  });

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

  it('keeps applied changes visible and advances the expected state between batches', async () => {
    vi.mocked(requestGenerateTable).mockResolvedValue({
      fullText: '{"tableName":"accounts","tableComment":"账号表","fields":[]}',
      result: {
        tableName: 'accounts',
        tableComment: '账号表',
        fields: [],
        indexes: [],
      },
    });
    render(<Harness />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '补充表说明' } });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));
    await screen.findByText('调整表英文名');
    fireEvent.click(screen.getAllByRole('button', { name: '确认' })[0]);
    fireEvent.click(screen.getByRole('button', { name: '应用 1 项变更' }));

    await waitFor(() => {
      expect(screen.getByText('调整表英文名')).toBeInTheDocument();
      expect(screen.getByText('1 项待确认，0 项已选择，1 项已应用')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    fireEvent.click(screen.getByRole('button', { name: '应用 1 项变更' }));

    await waitFor(() =>
      expect(screen.getByText('0 项待确认，0 项已选择，2 项已应用')).toBeInTheDocument(),
    );
    expect(applyChanges).toHaveBeenCalledTimes(2);
    expect(applyChanges.mock.calls[0][2]).toEqual(state);
    expect(applyChanges.mock.calls[1][2]).toBe(applyChanges.mock.calls[0][3]);
    expect(applyChanges.mock.calls[1][2]).toEqual(
      expect.objectContaining({ tableName: 'accounts', tableComment: '' }),
    );
  });
});
