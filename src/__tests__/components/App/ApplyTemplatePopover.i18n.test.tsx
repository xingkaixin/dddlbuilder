import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@/__tests__/utils/test-utils';
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
    expect(screen.getByText('Apply')).toBeInTheDocument();
    expect(
      screen.getByText('Save current rows as template...'),
    ).toBeInTheDocument();
    expect(screen.getByText('Manage templates...')).toBeInTheDocument();
  });
});
