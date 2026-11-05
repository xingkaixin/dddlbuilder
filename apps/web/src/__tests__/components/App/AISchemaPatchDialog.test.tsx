import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render } from '@/__tests__/utils/test-utils';
import { act, screen, fireEvent, waitFor } from '@testing-library/react';
import { withDefaultEditorSession, type PersistedState } from '@ddlbuilder/shared-types';
import { AppDialogLayer } from '@/components/App/AppDialogLayer';
// 预先加载懒加载的对话框模块，避免首个用例把模块转换耗时算进查询超时。
import '@/components/App/AISchemaPatchDialog';
import type { AppDialogLayerModel } from '@/components/App/buildAppDialogLayerModel';
import { applyAISchemaChanges } from '@/components/App/aiSchemaPatchTransition';
import { requestGenerateTable } from '@/services/aiGenerateTableService';
import type { AISchemaChange } from '@/utils/aiSchemaChanges';

// oxlint-disable-next-line anti-slop/no-module-mocking -- The dialog test controls the AI stream and cancellation signal at the service boundary.
vi.mock('@/services/aiGenerateTableService', () => ({ requestGenerateTable: vi.fn() }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- The dialog layer is tested without unrelated global dialog UI.
vi.mock('@/components/App/containers/GlobalDialogs', () => ({ GlobalDialogs: () => null }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- The test isolates the schema patch flow from the WebMCP confirmation UI.
vi.mock('@/webmcp/WebMcpChangeDialog', () => ({ WebMcpChangeDialog: () => null }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- Authentication dialogs are outside this dialog flow.
vi.mock('@/auth/AuthDialogs', () => ({ AuthDialogs: () => null }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- Migration UI is unrelated to schema patch interaction.
vi.mock('@/components/App/WorkspaceMigrationDialog', () => ({
  WorkspaceMigrationDialog: () => null,
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- The dialog needs a deterministic locale without mounting the provider.
vi.mock('@/i18n/LocaleContext', () => ({ useLocale: () => ({ resolvedLocale: 'zh-CN' }) }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- Auth state is a fixed harness input for this dialog session test.
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

const asDialogLayerModel = <T extends { saveObjectType: 'table' }>(
  value: T,
): AppDialogLayerModel => {
  // SAFETY: The focused harness supplies every model branch read by AppDialogLayer; unrelated dialogs stay unmounted.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- The focused model intentionally omits unrelated dialog branches.
  return value as unknown as AppDialogLayerModel;
};

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

  const model = asDialogLayerModel({
    saveObjectType: 'table',
    globalDialogs: { saveDialog: {} },
    importDialog: { visible: false },
    indexAdvisor: { open: false },
    commandPalette: { open: false },
    fieldStandards: { open: false },
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
  });

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

    fireEvent.change(await screen.findByRole('textbox'), { target: { value: '补充表说明' } });
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

    fireEvent.change(await screen.findByRole('textbox'), { target: { value: '重命名表' } });
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
