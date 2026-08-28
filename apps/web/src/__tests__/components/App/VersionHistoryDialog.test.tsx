import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@/__tests__/utils/test-utils';
import { withDefaultEditorSession } from '@ddlbuilder/shared-types';
import { VersionHistoryDialog } from '@/components/App/VersionHistoryDialog';
import { listVersions, getVersion } from '@/utils/tableVersions';
vi.mock('@/i18n/LocaleContext', () => ({ useLocale: () => ({ resolvedLocale: 'zh-CN' }) }));

const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('@/hooks/useToast', () => ({ useToast: () => ({ showToast }) }));

vi.mock('@/utils/tableVersions', () => ({
  listVersions: vi.fn(),
  getVersion: vi.fn(),
  deleteVersion: vi.fn(),
  INITIAL_VERSION_MESSAGE_KEY: 'initial',
}));

describe('version history identity', () => {
  it.each([
    { failure: 'missing', remaining: false, notice: '该版本已不存在，列表已刷新。' },
    { failure: 'failed', remaining: true, notice: '回滚失败，请稍后重试。' },
  ])('reports a rollback failure: $failure', async ({ failure, remaining, notice }) => {
    showToast.mockClear();
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
    const target = {
      scope: { kind: 'anonymous' as const },
      tableId: 'users',
      normalizedName: 'users',
    };
    vi.mocked(listVersions)
      .mockResolvedValueOnce([
        {
          id: 'missing',
          createdAt: 1,
          state,
          tableNormalizedName: 'users',
          message: 'missing version',
        },
      ])
      .mockResolvedValue([]);
    vi.mocked(getVersion).mockReset();
    if (failure === 'missing') vi.mocked(getVersion).mockResolvedValue(null);
    else vi.mocked(getVersion).mockRejectedValue(new Error('storage failure'));
    const onRollback = vi.fn();
    render(
      <VersionHistoryDialog
        open
        onOpenChange={vi.fn()}
        tableName="Users"
        target={target}
        onRollback={onRollback}
      />,
    );
    await screen.findByText('missing version');
    fireEvent.click(screen.getByRole('button', { name: /回滚/ }));
    await waitFor(() => expect(getVersion).toHaveBeenCalled());
    await waitFor(() => expect(showToast).toHaveBeenCalled());
    expect(onRollback).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(notice);
    await waitFor(() => expect(Boolean(screen.queryByText('missing version'))).toBe(remaining));
  });

  it('preserves selection and avoids reloading when an equivalent target is recreated', async () => {
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
    vi.mocked(listVersions).mockResolvedValue(
      [2, 1].map((version) => ({
        id: String(version),
        version,
        createdAt: version,
        state,
        tableNormalizedName: 'users',
        message: 'version-' + version,
      })),
    );
    const target = {
      scope: { kind: 'anonymous' as const },
      tableId: 'users',
      normalizedName: 'users',
    };
    const props = { open: true, onOpenChange: vi.fn(), tableName: 'Users', target };
    const { rerender } = render(<VersionHistoryDialog {...props} />);
    fireEvent.click(await screen.findByText('version-1'));
    const count = vi.mocked(listVersions).mock.calls.length;
    rerender(
      <VersionHistoryDialog {...props} target={{ ...target, scope: { kind: 'anonymous' } }} />,
    );
    await waitFor(() => expect(screen.getByText('version-1')).toBeInTheDocument());
    expect(listVersions).toHaveBeenCalledTimes(count);
    expect(screen.getByText('version-1').closest('button')).toHaveAttribute('aria-pressed', 'true');
  });
});
