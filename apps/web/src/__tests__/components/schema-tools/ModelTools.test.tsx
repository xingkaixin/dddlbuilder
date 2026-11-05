import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, cleanup, screen, waitFor } from '@testing-library/react';
import { setupSchemaTools, renderTool as render } from '@/__tests__/utils/schemaTools';
import { BusinessModuleTool } from '@/components/schema-tools/BusinessModuleTool';
import { listSavedTables } from '@/utils/savedTablesDb';
import { getAnonymousWorkspaceScope } from '@/utils/workspaceScope';

let harness: ReturnType<typeof setupSchemaTools>;

beforeEach(() => {
  harness = setupSchemaTools();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('modeling tool workflows', () => {
  it('saves an entire module once, prevents conflicts and exports configured snapshots', async () => {
    render(<BusinessModuleTool />);
    const save = screen.getByRole('button', { name: '保存整组到工作区' });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    expect(await screen.findByRole('status')).toHaveTextContent('已保存 5 张表');
    fireEvent.click(save);
    expect(await screen.findByRole('alert')).toHaveTextContent('没有覆盖现有表');
    expect(await listSavedTables(getAnonymousWorkspaceScope())).toHaveLength(5);
    fireEvent.change(screen.getByLabelText('业务模块类型'), { target: { value: 'booking' } });
    fireEvent.change(screen.getByLabelText('数据库'), { target: { value: 'postgresql' } });
    fireEvent.change(screen.getByLabelText('主键方案'), { target: { value: 'string' } });
    fireEvent.change(screen.getByLabelText('表名前缀'), { target: { value: 'app_' } });
    fireEvent.click(screen.getByRole('button', { name: '下载 SQL' }));
    expect(await harness.lastDownload()).toMatchObject({
      text: expect.stringContaining('app_bookings'),
      name: 'booking.sql',
    });
    fireEvent.click(screen.getByRole('button', { name: '导出结构快照' }));
    expect(await harness.lastDownload()).toMatchObject({
      text: expect.stringContaining('varchar(36)'),
      name: 'booking.json',
    });
    fireEvent.change(screen.getByLabelText('表名前缀'), { target: { value: 'Invalid-' } });
    expect(screen.getByRole('alert')).toHaveTextContent('prefix');
    expect(save).toBeDisabled();
  });
});
