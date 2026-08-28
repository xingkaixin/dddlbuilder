import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@/__tests__/utils/test-utils';
import { AIGenerateDialog } from '@/components/App/AIGenerateDialog';
import { useAIGenerateTable } from '@/hooks/useAIGenerateTable';

vi.mock('@/hooks/useAIGenerateTable', () => ({
  useAIGenerateTable: vi.fn(),
}));

vi.mock('@/auth/AuthSessionProvider', () => ({
  useAuthSession: () => ({
    status: 'signed_in',
    configured: true,
    userId: 'user-1',
    email: 'user@example.com',
    name: 'User One',
    emailVerified: true,
    creditBalance: 1000,
    creditsStatus: 'ready',
    authDialogOpen: false,
    signInWithEmail: vi.fn(),
    signUpWithEmail: vi.fn(),
    requestPasswordReset: vi.fn(),
    resetPassword: vi.fn(),
    sendVerificationEmail: vi.fn(),
    signOut: vi.fn(),
    refreshSession: vi.fn(),
    refreshCredits: vi.fn(),
    openAuthDialog: vi.fn(),
    closeAuthDialog: vi.fn(),
  }),
}));

const mockedUseAIGenerateTable = vi.mocked(useAIGenerateTable);

function createHookState(overrides: Partial<ReturnType<typeof useAIGenerateTable>>) {
  return {
    isLoading: false,
    streamingText: '',
    error: null,
    result: null,
    previousResult: null,
    partialResult: null,
    conversationHistory: [],
    generateTable: vi.fn().mockResolvedValue(false),
    clearResult: vi.fn(),
    clearConversation: vi.fn(),
    cancelGeneration: vi.fn(),
    ...overrides,
  } as ReturnType<typeof useAIGenerateTable>;
}

describe('AIGenerateDialog a11y', () => {
  it('does not clear text typed while a request is pending', async () => {
    let complete: (success: boolean) => void = () => {};
    const generateTable = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          complete = resolve;
        }),
    );
    mockedUseAIGenerateTable.mockReturnValue(createHookState({ generateTable }));
    render(<AIGenerateDialog open onOpenChange={vi.fn()} dbType="mysql" onApply={vi.fn()} />);
    const input = screen.getByPlaceholderText(/描述你需要的表结构/);
    fireEvent.change(input, { target: { value: 'first request' } });
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
    fireEvent.change(input, { target: { value: 'unsent revision' } });
    await act(async () => complete(true));
    expect(input).toHaveValue('unsent revision');
  });

  it.each([true, false])('clears only a successful submission: %s', async (success) => {
    const generateTable = vi.fn().mockResolvedValue(success);
    mockedUseAIGenerateTable.mockReturnValue(createHookState({ generateTable }));
    render(<AIGenerateDialog open onOpenChange={vi.fn()} dbType="mysql" onApply={vi.fn()} />);
    const input = screen.getByPlaceholderText(/描述你需要的表结构/);
    fireEvent.change(input, { target: { value: '请生成订单表，保留这段需求' } });
    await act(async () => fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true }));
    expect(generateTable).toHaveBeenCalledOnce();
    expect(input).toHaveValue(success ? '' : '请生成订单表，保留这段需求');
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('加载中应提供 status 语义与忙碌状态', () => {
    mockedUseAIGenerateTable.mockReturnValue(
      createHookState({
        isLoading: true,
      }),
    );

    render(
      <AIGenerateDialog open={true} onOpenChange={vi.fn()} dbType="mysql" onApply={vi.fn()} />,
    );

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-busy', 'true');
  });

  it('输入框应限制最大 500 字并提供计数反馈', () => {
    mockedUseAIGenerateTable.mockReturnValue(createHookState({}));

    render(
      <AIGenerateDialog open={true} onOpenChange={vi.fn()} dbType="mysql" onApply={vi.fn()} />,
    );

    const textarea = screen.getByPlaceholderText(/描述你需要的表结构/);
    fireEvent.change(textarea, { target: { value: 'a'.repeat(600) } });

    expect(textarea).toHaveValue('a'.repeat(500));
    expect(screen.getByText('500/500')).toBeInTheDocument();
    expect(textarea).toHaveAttribute(
      'aria-describedby',
      'ai-generate-input-hint ai-generate-input-counter',
    );
  });

  it('错误信息应使用 alert 语义播报', () => {
    mockedUseAIGenerateTable.mockReturnValue(
      createHookState({
        error: '生成失败',
      }),
    );

    render(
      <AIGenerateDialog open={true} onOpenChange={vi.fn()} dbType="mysql" onApply={vi.fn()} />,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('生成失败');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
  });

  it('结果态输入新需求后应继续迭代', () => {
    const generateTable = vi.fn().mockResolvedValue(true);
    mockedUseAIGenerateTable.mockReturnValue(
      createHookState({
        result: {
          tableName: 'orders',
          tableComment: '订单表',
          fields: [],
          indexes: [],
        },
        conversationHistory: [
          { role: 'user', content: '生成订单表' },
          { role: 'assistant', content: '{}' },
        ],
        generateTable,
      }),
    );

    render(
      <AIGenerateDialog open={true} onOpenChange={vi.fn()} dbType="mysql" onApply={vi.fn()} />,
    );

    fireEvent.change(screen.getByPlaceholderText(/继续描述你的需求/), {
      target: { value: '把状态字段改成 varchar' },
    });
    fireEvent.click(screen.getByRole('button', { name: /发送修改/ }));

    expect(generateTable).toHaveBeenCalledWith(
      '把状态字段改成 varchar',
      'mysql',
      expect.objectContaining({
        continueConversation: true,
      }),
    );
  });
});
