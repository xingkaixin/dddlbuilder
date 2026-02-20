import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, userEvent } from '@/__tests__/utils/test-utils';
import type { ReactNode } from 'react';
import { ApplyTemplatePopover } from '@/components/App/ApplyTemplatePopover';
import type { FieldTemplate } from '@/hooks/useFieldTemplates';
import i18n from '@/i18n';

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

const mockTrackEvent = vi.fn();
vi.mock('@/components/App/hooks/useTrackEvent', () => ({
  useTrackEvent: () => mockTrackEvent,
}));

const templates: FieldTemplate[] = [
  {
    id: 'tpl-1',
    name: 'User Base',
    description: 'basic user fields',
    fields: [
      { fieldName: 'id', fieldType: 'bigint', nullable: '否' },
      { fieldName: 'username', fieldType: 'varchar(64)', nullable: '否' },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'tpl-2',
    name: 'Audit Fields',
    keywords: ['audit', 'metadata'],
    description: 'auditing',
    fields: [
      { fieldName: 'created_at', fieldType: 'datetime', nullable: '否' },
    ],
    createdAt: Date.now() - 1000,
    updatedAt: Date.now() - 1000,
  },
  {
    id: 'tpl-3',
    name: '审计日志',
    description: '记录审计轨迹',
    fields: [
      { fieldName: 'operator', fieldType: 'varchar(32)', nullable: '否' },
    ],
    createdAt: Date.now() - 2000,
    updatedAt: Date.now() - 2000,
  },
];

describe('ApplyTemplatePopover i18n', () => {
  beforeEach(async () => {
    await act(async () => {
      await i18n.changeLanguage('en-US');
    });
  });

  afterEach(async () => {
    await act(async () => {
      await i18n.changeLanguage('zh-CN');
    });
  });

  it('应在英文环境显示英文按钮和下拉文案', async () => {
    await act(async () => {
      render(
        <ApplyTemplatePopover
          templates={templates}
          loading={false}
          onApplyTemplate={vi.fn()}
          onManageTemplates={vi.fn()}
          onSaveAsTemplate={vi.fn()}
        />,
      );
    });

    const trigger = screen.getByRole('button', { name: 'Apply Template' });
    expect(trigger).toBeInTheDocument();

    expect(screen.getByText('Choose Template')).toBeInTheDocument();
    expect(screen.getByText('User Base')).toBeInTheDocument();
    expect(screen.getByText('2 fields')).toBeInTheDocument();
    expect(screen.getAllByText('Apply').length).toBeGreaterThan(0);
    expect(
      screen.getByPlaceholderText('Search by name, keyword, or field...'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Save current rows as template...'),
    ).toBeInTheDocument();
    expect(screen.getByText('Manage templates...')).toBeInTheDocument();
  });

  it('应支持关键词搜索并上报一次搜索埋点', async () => {
    mockTrackEvent.mockResolvedValue(undefined);
    render(
      <ApplyTemplatePopover
        templates={templates}
        loading={false}
        onApplyTemplate={vi.fn()}
        onManageTemplates={vi.fn()}
        onSaveAsTemplate={vi.fn()}
      />,
    );

    const searchInput = screen.getByTestId('quick-apply-search');
    await userEvent.type(searchInput, 'AuDiT');

    expect(screen.getByText('Audit Fields')).toBeInTheDocument();
    expect(screen.queryByText('User Base')).not.toBeInTheDocument();
    await userEvent.clear(searchInput);
    await userEvent.type(searchInput, '审计');
    expect(screen.getByText('审计日志')).toBeInTheDocument();
    expect(mockTrackEvent).toHaveBeenCalledWith(
      'template_quick_apply_search_used',
      expect.objectContaining({
        queryLength: 1,
        templateCount: 3,
      }),
    );
    expect(mockTrackEvent).toHaveBeenCalledTimes(1);
  });
});
