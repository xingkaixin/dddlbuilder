import { describe, expect, it } from 'vitest';
import { buildSuggestedIndexQuery } from '@/components/App/hooks/useIndexAdvisorFlow';

describe('buildSuggestedIndexQuery', () => {
  it('builds a qualified query around identifier and timestamp fields', () => {
    expect(
      buildSuggestedIndexQuery('public', 'events', [
        { name: 'id' },
        { name: 'tenant_id' },
        { name: 'created_at' },
      ]),
    ).toBe(
      'SELECT id, tenant_id, created_at\nFROM public.events\nWHERE tenant_id = ?\nORDER BY id DESC\nLIMIT 20;',
    );
  });

  it('returns no query without a table or fields', () => {
    expect(buildSuggestedIndexQuery('', '', [{ name: 'id' }])).toBe('');
    expect(buildSuggestedIndexQuery('', 'users', [])).toBe('');
  });
});
