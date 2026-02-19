import { describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { MainWorkspaceSkeleton } from '@/components/App/MainWorkspaceSkeleton';
import { render, screen } from '@/__tests__/utils/test-utils';

describe('MainWorkspaceSkeleton', () => {
  it('应渲染可访问加载状态与三大骨架区块', () => {
    render(<MainWorkspaceSkeleton />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getAllByText(i18n.t('app.loadingWorkspace')).length).toBe(2);

    expect(
      screen.getByTestId('main-skeleton-table-config'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('main-skeleton-fields')).toBeInTheDocument();
    expect(screen.getByTestId('main-skeleton-ddl-output')).toBeInTheDocument();
  });
});
