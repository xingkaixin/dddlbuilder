import { describe, expect, it } from 'vitest';
import { prepareAIScenario } from '../lib/aiScenarios.js';

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- malformed provider fields exercise the scenario decoder.
const requestAdvice = async (index?: unknown) =>
  prepareAIScenario('index-advisor', {
    dbType: 'mysql',
    tableName: 'users',
    fields: [
      { fieldName: 'id', fieldType: 'int' },
      { fieldName: 'email', fieldType: 'varchar(100)' },
    ],
    queryPatterns: 'SELECT * FROM users WHERE email = ?',
  }).decode(
    JSON.stringify({
      summary: 'Index analysis',
      recommendations: [
        {
          category: 'missing_index',
          title: 'Email lookup',
          rationale: 'Match the supplied query',
          confidence: 'high',
          index,
        },
      ],
    }),
  );

describe('index advisor result validation', () => {
  it.each([true, false])('preserves complete indexes, unique=%s', async (unique) => {
    const fields = [
      { name: 'email', direction: 'DESC' },
      { name: 'id', direction: 'ASC' },
    ];
    const result = await requestAdvice({ name: 'idx_email_id', fields, unique });

    expect(result).toMatchObject({
      recommendations: [{ index: { name: 'idx_email_id', fields, unique } }],
    });
  });

  it.each([
    { label: 'unknown column', fields: [{ name: 'tenant_id' }, { name: 'email' }] },
    { label: 'empty column', fields: [{ name: ' ' }, { name: 'email' }] },
    { label: 'missing column name', fields: [{}, { name: 'email' }] },
    { label: 'null column', fields: [null, { name: 'email' }] },
    { label: 'primitive column', fields: [{ name: 'email' }, 1] },
    { label: 'no columns', fields: [] },
    { label: 'non-array columns', fields: 'email' },
  ])('rejects the whole index with $label but preserves advice', async ({ fields }) => {
    const result = await requestAdvice({ name: 'uk_tenant_email', fields, unique: true });

    expect(result).toMatchObject({
      summary: 'Index analysis',
      recommendations: [
        {
          id: 'rec_1',
          category: 'missing_index',
          title: 'Email lookup',
          rationale: 'Match the supplied query',
          confidence: 'high',
        },
      ],
    });
    expect(result).not.toHaveProperty('recommendations.0.index');
  });

  it('normalizes whitespace and default sort direction without changing columns', async () => {
    const result = await requestAdvice({
      name: ' idx_email ',
      fields: [{ name: ' email ' }],
    });

    expect(result).toMatchObject({
      recommendations: [
        {
          index: {
            name: 'idx_email',
            fields: [{ name: 'email', direction: 'ASC' }],
            unique: false,
          },
        },
      ],
    });
  });

  it('preserves advice without an index', async () => {
    const result = await requestAdvice();

    expect(result).toMatchObject({ recommendations: [{ title: 'Email lookup' }] });
    expect(result).not.toHaveProperty('recommendations.0.index');
  });
});
