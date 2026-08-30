import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@/__tests__/utils/test-utils';
import { SchemaLintPanel } from '@/components/App/SchemaLintPanel';
import { lintSchema } from '@/utils/schemaLint';
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

  it('removes every stale warning when same-named fields are corrected together', () => {
    const rows = ['first', 'second'].map((id) => ({
      id,
      fieldName: 'HYDRATED_FIELD',
      fieldType: 'int',
      fieldComment: '',
      nullable: true,
    }));
    const issues = lintSchema({ tableName: 'users', rows, indexes: [] });
    const { rerender } = render(<SchemaLintPanel issues={issues} />);

    expect(screen.getAllByText('HYDRATED_FIELD')).toHaveLength(2);
    expect(screen.getAllByRole('listitem')).toHaveLength(issues.length);

    const correctedIssues = lintSchema({
      tableName: 'users',
      rows: rows.map((row) => ({ ...row, fieldName: `${row.id}_field` })),
      indexes: [],
    });
    rerender(<SchemaLintPanel issues={correctedIssues} />);

    expect(screen.queryByText('HYDRATED_FIELD')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(correctedIssues.length);
  });
});
