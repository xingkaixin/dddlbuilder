import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IndexDefinition, NormalizedField } from '@ddlbuilder/shared-types';
import {
  buildSuggestedIndexQuery,
  useIndexAdvisorFlow,
} from '@/components/App/hooks/useIndexAdvisorFlow';

const mocks = vi.hoisted(() => ({
  analyzeIndexes: vi.fn(),
  clearAdvice: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('@/hooks/useAIIndexAdvisor', () => ({
  useAIIndexAdvisor: () => ({
    isLoading: false,
    result: null,
    error: null,
    analyzeIndexes: mocks.analyzeIndexes,
    clearAdvice: mocks.clearAdvice,
  }),
}));

vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const fields: NormalizedField[] = [
  {
    name: 'id',
    type: 'bigint',
    comment: '',
    nullable: false,
    defaultValue: '',
    onUpdate: 'none',
  },
  {
    name: 'email',
    type: 'varchar(255)',
    comment: '',
    nullable: false,
    defaultValue: '',
    onUpdate: 'none',
  },
];

const index: IndexDefinition = {
  id: 'idx-email',
  name: 'idx_users_email',
  fields: [{ name: 'email', direction: 'ASC' }],
  unique: false,
};

const renderFlow = (overrides: Partial<Parameters<typeof useIndexAdvisorFlow>[0]> = {}) => {
  const setIndexes = vi.fn();
  const setActiveTab = vi.fn();
  const hook = renderHook(() =>
    useIndexAdvisorFlow({
      dbType: 'mysql',
      schemaName: 'public',
      tableName: 'users',
      tableComment: 'Users',
      fields,
      indexes: [],
      setIndexes,
      setActiveTab,
      ...overrides,
    }),
  );
  return { ...hook, setIndexes, setActiveTab };
};

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

describe('useIndexAdvisorFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.analyzeIndexes.mockResolvedValue(null);
  });

  it('opens and closes the dialog while clearing stale advice', () => {
    const { result } = renderFlow();

    act(() => result.current.openDialog());
    expect(result.current.open).toBe(true);

    act(() => result.current.setDialogOpen(false));
    expect(result.current.open).toBe(false);
    expect(mocks.clearAdvice).toHaveBeenCalledOnce();
  });

  it('blocks analysis until the table target is complete', () => {
    const { result } = renderFlow({ tableName: '' });

    act(() => result.current.analyze('SELECT * FROM users'));

    expect(mocks.showToast).toHaveBeenCalledWith('aiIndexAdvisor.tableNameRequired');
    expect(mocks.analyzeIndexes).not.toHaveBeenCalled();
  });

  it('submits normalized schema context', async () => {
    const { result } = renderFlow();

    await act(async () => {
      result.current.analyze('SELECT * FROM users WHERE email = ?');
      await Promise.resolve();
    });

    expect(mocks.analyzeIndexes).toHaveBeenCalledWith(
      expect.objectContaining({
        tableName: 'users',
        fields: [
          expect.objectContaining({ fieldName: 'id', fieldType: 'bigint' }),
          expect.objectContaining({ fieldName: 'email', fieldType: 'varchar(255)' }),
        ],
      }),
    );
  });

  it('surfaces analysis errors', async () => {
    mocks.analyzeIndexes.mockRejectedValueOnce(new Error('advisor failed'));
    const { result } = renderFlow();

    await act(async () => {
      result.current.analyze('');
      await Promise.resolve();
    });

    expect(mocks.showToast).toHaveBeenCalledWith('advisor failed');
  });

  it.each([{ names: [] }, { names: ['unknown'] }, { names: ['tenant_id', 'email'] }])(
    'rejects incomplete index fields: $names',
    ({ names }) => {
      const { result, setIndexes, setActiveTab } = renderFlow();
      act(() =>
        result.current.applyRecommendation({
          id: 'missing',
          category: 'missing_index',
          title: 'Missing',
          rationale: '',
          confidence: 'medium',
          index: {
            fields: names.map((name) => ({ name, direction: 'ASC' })),
            unique: true,
          },
        }),
      );
      expect(setIndexes).not.toHaveBeenCalled();
      expect(setActiveTab).not.toHaveBeenCalled();
      expect(mocks.showToast).toHaveBeenCalledWith('aiIndexAdvisor.invalidIndexFields');
    },
  );

  it('rejects an existing index', () => {
    const duplicate = renderFlow({ indexes: [index] });
    act(() =>
      duplicate.result.current.applyRecommendation({
        id: 'duplicate',
        category: 'performance',
        title: 'Duplicate',
        rationale: '',
        priority: 'medium',
        index: {
          fields: [{ name: 'email', direction: 'ASC' }],
          unique: false,
        },
      }),
    );
    expect(mocks.showToast).toHaveBeenCalledWith('aiIndexAdvisor.indexExists');
  });

  it('applies a valid recommendation and opens the index tab', () => {
    const { result, setIndexes, setActiveTab } = renderFlow();

    act(() =>
      result.current.applyRecommendation({
        id: 'email',
        category: 'performance',
        title: 'Email lookup',
        rationale: '',
        priority: 'high',
        index: {
          fields: [
            { name: 'id', direction: 'ASC' },
            { name: 'email', direction: 'DESC' },
          ],
          unique: true,
        },
      }),
    );

    const updater = setIndexes.mock.calls[0]?.[0] as (
      current: IndexDefinition[],
    ) => IndexDefinition[];
    expect(updater([])[0]).toMatchObject({
      fields: [
        { name: 'id', direction: 'ASC' },
        { name: 'email', direction: 'DESC' },
      ],
      unique: true,
    });
    expect(setActiveTab).toHaveBeenCalledWith('indexes');
  });
});
