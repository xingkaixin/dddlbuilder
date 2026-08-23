import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@/__tests__/utils/test-utils';
import { SchemaLintPanel } from '@/components/App/SchemaLintPanel';
import i18n from '@/i18n';

describe('SchemaLintPanel i18n', () => {
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

  it('renders rule text and interpolation in the active language', () => {
    render(
      <SchemaLintPanel
        issues={[
          {
            id: 'index-name-convention:bad_name',
            ruleId: 'index-name-convention',
            severity: 'warning',
            target: 'bad_name',
            params: { expectedPrefix: 'idx_users_name' },
          },
        ]}
      />,
    );

    expect(screen.getByText('Index naming convention')).toBeInTheDocument();
    expect(screen.getByText('Use idx_users_name as the index name prefix.')).toBeInTheDocument();
    expect(screen.queryByText('索引命名规范')).not.toBeInTheDocument();
  });
});
