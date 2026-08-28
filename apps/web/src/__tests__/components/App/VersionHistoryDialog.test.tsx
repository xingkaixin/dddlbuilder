import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@/__tests__/utils/test-utils';
import { withDefaultEditorSession } from '@ddlbuilder/shared-types';
import { VersionHistoryDialog } from '@/components/App/VersionHistoryDialog';
import { listVersions } from '@/utils/tableVersions';
vi.mock('@/i18n/LocaleContext', () => ({ useLocale: () => ({ resolvedLocale: 'zh-CN' }) }));

vi.mock('@/utils/tableVersions', () => ({
  listVersions: vi.fn(),
  getVersion: vi.fn(),
  deleteVersion: vi.fn(),
  INITIAL_VERSION_MESSAGE_KEY: 'initial',
}));

describe('version history identity', () => {
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
