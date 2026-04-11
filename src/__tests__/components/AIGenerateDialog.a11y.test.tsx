import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@/__tests__/utils/test-utils';
import { AIGenerateDialog } from '@/components/App/AIGenerateDialog';
import { useAIGenerateTable } from '@/hooks/useAIGenerateTable';

vi.mock('@/hooks/useAIGenerateTable', () => ({
  useAIGenerateTable: vi.fn(),
}));

vi.mock('@/auth/AuthSessionProvider', () => ({
  useAuthSession: () => ({
    status: 'signed_in',
    configured: true,
    accessToken: 'token',
    externalUserId: 'external-user',
    appUserId: 'supabase_external-user',
    email: 'user@example.com',
    creditBalance: 1000,
    creditsStatus: 'ready',
    authDialogOpen: false,
    requestMagicLink: vi.fn(),
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
    partialResult: null,
    conversationHistory: [],
    generateTable: vi.fn(),
    clearResult: vi.fn(),
    clearConversation: vi.fn(),
    cancelGeneration: vi.fn(),
    ...overrides,
  } as ReturnType<typeof useAIGenerateTable>;
}

describe('AIGenerateDialog a11y', () => {
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
});
