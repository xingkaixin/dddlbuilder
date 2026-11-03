import { describe, expect, it } from 'vitest';
import { normalizeDDLReviewSuggestions } from '@ddlbuilder/shared-types/ddl-review';

describe('DDL review runtime contract', () => {
  it('makes informational and malformed structured suggestions non-actionable', () => {
    const suggestions = normalizeDDLReviewSuggestions([
      {
        id: 'warning',
        description: 'Full scan risk',
        type: 'performance_warning',
        actionable: true,
        severity: 'error',
      },
      {
        id: 'broken-index',
        description: 'Add an index',
        type: 'add_index',
        actionable: true,
        index: { name: 'idx_users', fields: [] },
      },
      { type: 'remove_field', actionable: true, fieldName: 'legacy' },
      '',
      1,
    ]);

    expect(suggestions).toEqual([
      {
        id: 'warning',
        description: 'Full scan risk',
        type: 'performance_warning',
        actionable: false,
        severity: 'error',
      },
      {
        id: 'broken-index',
        description: 'Add an index',
        type: 'general',
        actionable: false,
      },
    ]);
  });
});
