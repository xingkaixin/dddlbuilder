import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AIIndexAdvisorRecommendation,
  IndexDefinition,
  NormalizedField,
} from '@ddlbuilder/shared-types';
import {
  buildSuggestedIndexQuery,
  useIndexAdvisorFlow,
} from '@/components/App/hooks/useIndexAdvisorFlow';
import { useEditorStore } from '@/stores/editorStore';
import { createEmptyRow } from '@/utils/helpers';

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
  kind: 'index',
};

const renderFlow = (overrides: Partial<Parameters<typeof useIndexAdvisorFlow>[0]> = {}) => {
  const params: Parameters<typeof useIndexAdvisorFlow>[0] = {
    dbType: 'mysql',
    schemaName: 'public',
    tableName: 'users',
    tableComment: 'Users',
    fields,
    indexes: [],
    ...overrides,
  };
  useEditorStore.setState({
    dbType: params.dbType,
    tableName: params.tableName,
    rows: params.fields.map((field) => ({
      ...createEmptyRow(),
      fieldName: field.name,
      fieldType: field.type,
    })),
    indexes: params.indexes,
  });
  return renderHook(() => useIndexAdvisorFlow(params));
};

const emailRecommendation = (unique: boolean): AIIndexAdvisorRecommendation => ({
  id: 'email',
  category: 'missing_index',
  title: 'Email lookup',
  rationale: '',
  confidence: 'high',
  index: { name: 'idx_email', fields: [{ name: 'email', direction: 'ASC' }], unique },
});

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
    useEditorStore.getState().resetDocument();
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
      const { result } = renderFlow();
      act(() =>
        result.current.applyRecommendation({
          id: 'missing',
          category: 'missing_index',
          title: 'Missing',
          rationale: '',
          confidence: 'medium',
          index: {
            name: 'invalid_index',
            fields: names.map((name) => ({ name, direction: 'ASC' })),
            unique: true,
          },
        }),
      );
      expect(useEditorStore.getState().indexes).toEqual([]);
      expect(useEditorStore.getState().activeTab).toBe('fields');
      expect(mocks.showToast).toHaveBeenCalledWith('aiIndexAdvisor.invalidIndexFields');
    },
  );

  it.each(['index', 'unique_index', 'unique_constraint', 'primary'] as const)(
    'uses an existing %s for an ordinary recommendation',
    (kind) => {
      const existing = { ...index, kind };
      const { result } = renderFlow({ indexes: [existing] });

      act(() => result.current.applyRecommendation(emailRecommendation(false)));

      expect(useEditorStore.getState().indexes).toEqual([existing]);
      expect(useEditorStore.getState().activeTab).toBe('fields');
      expect(mocks.showToast).toHaveBeenCalledExactlyOnceWith('aiIndexAdvisor.indexExists');
    },
  );

  it.each(['unique_index', 'unique_constraint', 'primary'] as const)(
    'uses an existing %s for a unique recommendation',
    (kind) => {
      const existing = { ...index, kind };
      const { result } = renderFlow({ indexes: [existing] });

      act(() => result.current.applyRecommendation(emailRecommendation(true)));

      expect(useEditorStore.getState().indexes).toEqual([existing]);
      expect(mocks.showToast).toHaveBeenCalledExactlyOnceWith('aiIndexAdvisor.indexExists');
    },
  );

  it('adds unique enforcement when only an ordinary index exists', () => {
    const { result } = renderFlow({ indexes: [index] });

    act(() => result.current.applyRecommendation(emailRecommendation(true)));

    expect(useEditorStore.getState().indexes).toEqual([
      index,
      expect.objectContaining({
        name: 'uk_users_email',
        kind: 'unique_index',
        fields: index.fields,
      }),
    ]);
    expect(useEditorStore.getState().activeTab).toBe('indexes');
    expect(mocks.showToast).toHaveBeenCalledExactlyOnceWith('aiIndexAdvisor.indexApplied');
  });

  it('reports a name conflict without claiming the different-direction index was applied', () => {
    const { result } = renderFlow({ indexes: [index] });
    const recommendation: AIIndexAdvisorRecommendation = {
      ...emailRecommendation(false),
      index: {
        name: 'idx_email_desc',
        fields: [{ name: 'email', direction: 'DESC' }],
        unique: false,
      },
    };

    act(() => result.current.applyRecommendation(recommendation));

    expect(useEditorStore.getState().indexes).toEqual([index]);
    expect(useEditorStore.getState().activeTab).toBe('fields');
    expect(mocks.showToast).toHaveBeenCalledExactlyOnceWith('indexPanel.duplicateName');
  });

  it('uses the latest indexes when the same recommendation is applied twice before rendering', () => {
    const { result } = renderFlow();
    const recommendation = emailRecommendation(false);

    act(() => {
      result.current.applyRecommendation(recommendation);
      result.current.applyRecommendation(recommendation);
    });

    expect(useEditorStore.getState().indexes).toHaveLength(1);
    expect(mocks.showToast.mock.calls).toEqual([
      ['aiIndexAdvisor.indexApplied'],
      ['aiIndexAdvisor.indexExists'],
    ]);
  });

  it('rejects fields removed from the document after the recommendation was rendered', () => {
    const { result } = renderFlow();
    useEditorStore.getState().setRows([]);

    act(() => result.current.applyRecommendation(emailRecommendation(false)));

    expect(useEditorStore.getState().indexes).toEqual([]);
    expect(useEditorStore.getState().activeTab).toBe('fields');
    expect(mocks.showToast).toHaveBeenCalledExactlyOnceWith('aiIndexAdvisor.invalidIndexFields');
  });

  it('applies a valid recommendation and opens the index tab', () => {
    const { result } = renderFlow();

    act(() =>
      result.current.applyRecommendation({
        id: 'email',
        category: 'missing_index',
        title: 'Email lookup',
        rationale: '',
        confidence: 'high',
        index: {
          name: 'uk_id_email',
          fields: [
            { name: 'id', direction: 'ASC' },
            { name: 'email', direction: 'DESC' },
          ],
          unique: true,
        },
      }),
    );

    expect(useEditorStore.getState().indexes[0]).toMatchObject({
      fields: [
        { name: 'id', direction: 'ASC' },
        { name: 'email', direction: 'DESC' },
      ],
      kind: 'unique_index',
    });
    expect(useEditorStore.getState().activeTab).toBe('indexes');
    expect(mocks.showToast).toHaveBeenCalledExactlyOnceWith('aiIndexAdvisor.indexApplied');
  });
});
