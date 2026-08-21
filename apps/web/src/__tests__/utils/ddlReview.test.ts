import { describe, expect, it } from 'vitest';
import {
  normalizeDDLReviewResult,
  normalizeDDLReviewSuggestions,
} from '@ddlbuilder/shared-types/ddl-review';

describe('DDL review runtime contract', () => {
  it('normalizes valid suggestion payloads without inventing absent changes', () => {
    const suggestions = normalizeDDLReviewSuggestions([
      {
        id: 'modify-status',
        description: 'Allow null status',
        type: 'modify_field',
        actionable: true,
        fieldModification: {
          fieldName: 'status',
          changes: { nullable: 'yes', defaultKind: 'const' },
        },
      },
      {
        id: 'add-created-at',
        description: 'Add created_at',
        type: 'add_field',
        actionable: true,
        field: {
          fieldName: 'created_at',
          fieldType: 'timestamp',
          nullable: 'no',
          onUpdate: 'CURRENT_TIMESTAMP',
        },
      },
    ]);

    expect(suggestions).toEqual([
      {
        id: 'modify-status',
        description: 'Allow null status',
        type: 'modify_field',
        actionable: true,
        fieldModification: {
          fieldName: 'status',
          changes: { nullable: true, defaultKind: 'constant' },
        },
      },
      {
        id: 'add-created-at',
        description: 'Add created_at',
        type: 'add_field',
        actionable: true,
        field: {
          fieldName: 'created_at',
          fieldType: 'timestamp',
          nullable: false,
          onUpdate: 'current_timestamp',
        },
      },
    ]);
  });

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

  it('normalizes the result envelope and keeps compatible string suggestions', () => {
    expect(
      normalizeDDLReviewResult(
        { score: 99, summary: 123, suggestions: ['  Review manually  '] },
        'Done',
      ),
    ).toEqual({ score: 10, summary: 'Done', suggestions: ['Review manually'] });
  });
});
