import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { act, render, screen, fireEvent, waitFor, within } from '@/__tests__/utils/test-utils';
import { withDefaultEditorSession, type PersistedState } from '@ddlbuilder/shared-types';
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

function Harness({
  initialState = state,
  alternateState = { ...state, tableName: 'orders' },
}: {
  initialState?: PersistedState;
  alternateState?: PersistedState;
}) {
  const [open, setOpen] = useState(true);
  const [currentState, setCurrentState] = useState(initialState);
  const [targetKey, setTargetKey] = useState('tab-a');
  const model = {
    saveObjectType: 'table',
    globalDialogs: { saveDialog: {} },
    userSettings: { open: false },
    importDialog: { visible: false },
    indexAdvisor: { open: false },
    aiPatch: {
      targetKey,
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
      <button
        onClick={() => {
          setTargetKey('tab-b');
          setCurrentState(alternateState);
        }}
      >
        Switch target
      </button>
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

  it('recomputes pending index changes after applying a field rename', async () => {
    const initialState = {
      ...state,
      rows: [
        {
          id: 'f1',
          order: 1,
          fieldName: 'old_name',
          fieldType: 'bigint',
          fieldComment: '',
          nullable: false,
        },
      ],
      indexes: [
        {
          id: 'i1',
          name: 'idx_old_name',
          fields: [{ name: 'old_name', direction: 'ASC' as const }],
          kind: 'index' as const,
        },
      ],
    };
    vi.mocked(requestGenerateTable).mockResolvedValue({
      fullText: '{}',
      result: {
        tableName: 'users',
        tableComment: '',
        fields: [
          {
            id: 'f1',
            fieldName: 'new_name',
            fieldType: 'bigint',
            fieldComment: '',
            nullable: false,
            defaultKind: 'none',
          },
        ],
        indexes: [
          {
            name: 'idx_new_name',
            fields: [{ name: 'new_name', direction: 'ASC' }],
            unique: false,
          },
        ],
      },
    });
    render(<Harness initialState={initialState} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '重命名字段' } });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));
    const renameTitle = await screen.findByRole('button', {
      name: '字段 old_name 改名为 new_name',
    });
    const renameCard = renameTitle.closest('[class~="transition-colors"]');
    expect(renameCard).not.toBeNull();
    expect(screen.getByText('新增索引 idx_new_name')).toBeInTheDocument();
    expect(screen.getByText('删除索引 idx_old_name')).toBeInTheDocument();
    fireEvent.click(within(renameCard as HTMLElement).getByRole('button', { name: '确认' }));
    fireEvent.click(screen.getByRole('button', { name: '应用 1 项变更' }));

    await waitFor(() => {
      expect(screen.getByText('字段 old_name 改名为 new_name')).toBeInTheDocument();
      expect(screen.queryByText('新增索引 idx_new_name')).toBeNull();
      expect(screen.queryByText('删除索引 idx_old_name')).toBeNull();
    });
    expect(applyChanges).toHaveBeenCalledTimes(1);
    expect(applyChanges.mock.calls[0][3].indexes).toEqual([
      expect.objectContaining({
        id: 'i1',
        name: 'idx_new_name',
        fields: [{ name: 'new_name', direction: 'ASC' }],
      }),
    ]);
  });

  it('does not show applied history when the current target changes', async () => {
    vi.mocked(requestGenerateTable).mockResolvedValue({
      fullText: '{}',
      result: {
        tableName: 'accounts',
        tableComment: '',
        fields: [],
        indexes: [],
      },
    });
    render(<Harness alternateState={{ ...state, tableName: 'accounts' }} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '重命名表' } });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));
    const title = await screen.findByText('调整表英文名');
    const card = title.closest('[class~="transition-colors"]');
    expect(card).not.toBeNull();
    fireEvent.click(within(card as HTMLElement).getByRole('button', { name: '确认' }));
    fireEvent.click(screen.getByRole('button', { name: '应用 1 项变更' }));
    await waitFor(() =>
      expect(screen.getByText('0 项待确认，0 项已选择，1 项已应用')).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Switch target' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));

    await screen.findByRole('textbox');
    expect(screen.queryByText('调整表英文名')).toBeNull();
  });

  it('discards an in-flight result after the current target changes', async () => {
    let resolveRequest!: (value: {
      fullText: string;
      result: {
        tableName: string;
        tableComment: string;
        fields: [];
        indexes: [];
      };
    }) => void;
    let signal: AbortSignal | undefined;
    vi.mocked(requestGenerateTable).mockImplementation((_payload, options) => {
      signal = options?.signal;
      return new Promise((resolve) => {
        resolveRequest = resolve;
      });
    });
    render(<Harness alternateState={state} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '重命名表' } });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));
    await waitFor(() => expect(signal).toBeDefined());
    fireEvent.click(screen.getByText('Switch target'));
    await waitFor(() => expect(signal?.aborted).toBe(true));
    await act(async () => {
      resolveRequest({
        fullText: '{}',
        result: {
          tableName: 'accounts',
          tableComment: '',
          fields: [],
          indexes: [],
        },
      });
    });

    await waitFor(() => expect(screen.queryByText('调整表英文名')).toBeNull());
  });
});
