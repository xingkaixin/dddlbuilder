import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@/__tests__/utils/test-utils';
import { AdminApp } from '@/admin/AdminApp';

const users = Array.from({ length: 51 }, (_, index) => ({
  id: `user-${index}`,
  name: `User ${index}`,
  email: `user${index}@example.com`,
  emailVerified: true,
  balance: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  disabled: false,
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- isolate the admin API network boundary while testing list paging.
vi.mock('@/admin/lib/adminApi', () => ({
  checkAdminSession: async () => true,
  listUsers: async (limit: number, offset: number) => users.slice(offset, offset + limit),
}));

describe('AdminUserList', () => {
  it('满页后可以翻到第 51 个用户', async () => {
    render(<AdminApp />);

    await screen.findByText('user0@example.com');
    expect(screen.queryByText('user50@example.com')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));

    expect(await screen.findByText('user50@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled();
  });
});
