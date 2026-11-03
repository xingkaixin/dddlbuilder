import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AIIndexAdvisorRecommendation,
  AIIndexAdvisorResult,
  IndexDefinition,
  NormalizedField,
} from '@ddlbuilder/shared-types';
import { useIndexAdvisorFlow } from '@/components/App/hooks/useIndexAdvisorFlow';
import { useEditorStore } from '@/stores/editorStore';
import { createEmptyRow } from '@/utils/helpers';

type AdvisorMocks = {
  advice: AIIndexAdvisorResult;
  analyzeIndexes: ReturnType<typeof vi.fn>;
  clearAdvice: ReturnType<typeof vi.fn>;
  showToast: ReturnType<typeof vi.fn>;
};

const mocks = vi.hoisted((): AdvisorMocks => ({
  advice: { summary: '', recommendations: [] },
  analyzeIndexes: vi.fn(),
  clearAdvice: vi.fn(),
  showToast: vi.fn(),
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- Injects deterministic advisor responses so this flow test covers validation and recommendation application.
vi.mock('@/hooks/useAIIndexAdvisor', () => ({
  useAIIndexAdvisor: () => ({
    isLoading: false,
    result: mocks.advice,
    error: null,
    analyzeIndexes: mocks.analyzeIndexes,
    clearAdvice: mocks.clearAdvice,
  }),
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- Supplies the notification context recorder used by the flow's validation branches.
vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- Uses translation keys as stable output while testing flow behavior independently of i18next resources.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const fields: NormalizedField[] = [
  {
    name: 'id',
    type: 'bigint',
    comment: '',
    nullable: false,
    defaultKind: 'none',
    defaultValue: '',
    onUpdate: 'none',
  },
  {
    name: 'email',
    type: 'varchar(255)',
    comment: '',
    nullable: false,
    defaultKind: 'none',
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
    documentKey: 'workspace-1:users-draft',
    getCurrentDocumentKey: () => 'workspace-1:users-draft',
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

  return renderHook(
    (updatedParams: Partial<Parameters<typeof useIndexAdvisorFlow>[0]>) =>
      useIndexAdvisorFlow({ ...params, ...updatedParams }),
    { initialProps: {} },
  );
};

const offerRecommendation = (recommendation: AIIndexAdvisorRecommendation) => {
  mocks.advice.recommendations.push(recommendation);

  return recommendation;
};

const emailRecommendation = (unique: boolean): AIIndexAdvisorRecommendation =>
  offerRecommendation({
    id: 'email',
    category: 'missing_index',
    title: 'Email lookup',
    rationale: '',
    confidence: 'high',
    index: { name: 'idx_email', fields: [{ name: 'email', direction: 'ASC' }], unique },
  });

describe('useIndexAdvisorFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.advice = { summary: '', recommendations: [] };
    useEditorStore.getState().resetDocument();
    mocks.analyzeIndexes.mockResolvedValue(null);
  });

  it.each([{ names: [] }, { names: ['unknown'] }, { names: ['tenant_id', 'email'] }])(
    'rejects incomplete index fields: $names',
    ({ names }) => {
      const { result } = renderFlow();
      act(() =>
        result.current.applyRecommendation(
          offerRecommendation({
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
        ),
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

  it('rejects a recommendation after the target changes before rendering', () => {
    let currentDocumentKey = 'workspace-1:users-draft';
    const { result } = renderFlow({ getCurrentDocumentKey: () => currentDocumentKey });
    const recommendation = emailRecommendation(true);
    currentDocumentKey = 'workspace-1:other-users-draft';

    act(() => {
      result.current.analyze('SELECT * FROM users WHERE email = ?');
      result.current.applyRecommendation(recommendation);
    });

    expect(mocks.analyzeIndexes).not.toHaveBeenCalled();
    expect(useEditorStore.getState().indexes).toEqual([]);
    expect(mocks.showToast).not.toHaveBeenCalled();
  });

  it('distinguishes PostgreSQL columns whose names only differ by case', () => {
    const existing: IndexDefinition = {
      ...index,
      name: 'idx_upper_email',
      fields: [{ name: 'Email', direction: 'ASC' }],
    };
    const { result } = renderFlow({
      dbType: 'postgresql',
      fields: [fields[1], { ...fields[1], name: 'Email' }],
      indexes: [existing],
    });

    act(() => result.current.applyRecommendation(emailRecommendation(false)));

    expect(useEditorStore.getState().indexes).toHaveLength(2);
    expect(mocks.showToast).toHaveBeenCalledExactlyOnceWith('aiIndexAdvisor.indexApplied');
  });

  it('matches MySQL index fields regardless of case and quoting', () => {
    const existing: IndexDefinition = {
      ...index,
      fields: [{ name: '`Email`', direction: 'ASC' }],
    };
    const { result } = renderFlow({
      fields: [{ ...fields[1], name: 'Email' }],
      indexes: [existing],
    });

    act(() => result.current.applyRecommendation(emailRecommendation(false)));

    expect(useEditorStore.getState().indexes).toEqual([existing]);
    expect(mocks.showToast).toHaveBeenCalledExactlyOnceWith('aiIndexAdvisor.indexExists');
  });
});
