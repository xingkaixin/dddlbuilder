import { describe, expect, it } from 'vitest';
import * as Schema from 'effect/Schema';
import {
  AICommentRequestSchema,
  AIGenerateTableRequestSchema,
  AIIndexAdvisorRequestSchema,
  decodeAICommentResult,
  decodeAIIndexAdvisorResult,
  decodeAIIndexAdvisorProviderResult,
} from '@ddlbuilder/shared-types/ai-generate';
import { decodeAIRequest } from '../../lib/aiRequest.js';

describe('shared AI contracts', () => {
  it('keeps request defaults and filters unusable fields', () => {
    expect(
      Schema.decodeUnknownSync(AICommentRequestSchema)({
        tableName: ' users ',
        fields: [null, {}, { fieldName: ' id ', fieldType: 42 }],
        mode: 'unknown',
        targetLocale: 'unknown',
      }),
    ).toEqual({
      tableName: 'users',
      fields: [{ fieldName: 'id', fieldType: '', fieldComment: '' }],
      mode: 'fill_missing',
      targetLocale: 'zh-CN',
      tableComment: '',
    });
  });

  it('defaults absent history but rejects malformed conversation entries', () => {
    const decode = Schema.decodeUnknownSync(AIGenerateTableRequestSchema);

    for (const conversationHistory of [undefined, null, []]) {
      expect(
        decode({ dbType: 'mysql', description: ' users ', conversationHistory }),
      ).toMatchObject({
        description: ' users ',
        conversationHistory: [],
        mode: 'generate',
        locale: 'zh-CN',
        templates: [],
      });
    }

    for (const conversationHistory of [
      {},
      [{ role: 'system', content: 'hello' }],
      [{ role: 'user', content: 1 }],
    ]) {
      expect(() => decode({ dbType: 'mysql', description: 'users', conversationHistory })).toThrow(
        /conversationHistory/,
      );
    }
  });

  it('preserves validation precedence and query length limits', () => {
    const parse = decodeAIRequest(
      AIIndexAdvisorRequestSchema,
      {
        dbType: { code: 'INVALID_DATABASE_TYPE', message: 'Invalid database type' },
        queryPatterns: { code: 'SQL_REQUIRED', message: 'Query patterns are required' },
      },
      { code: 'SCHEMA_REQUIRED', message: 'Table schema is required' },
    );
    expect(parse({})).toMatchObject({ status: 400, code: 'INVALID_DATABASE_TYPE' });
    expect(parse({ dbType: 'mysql' })).toMatchObject({ status: 400, code: 'SCHEMA_REQUIRED' });
    const input = { dbType: 'mysql', tableName: 'users', fields: [{ fieldName: 'id' }] };
    expect(parse({ ...input, queryPatterns: 'x'.repeat(20001) })).toMatchObject({
      status: 400,
      code: 'SQL_REQUIRED',
    });
    expect(parse({ ...input, queryPatterns: 'x'.repeat(20000) })).toMatchObject({ indexes: [] });
  });

  it('filters malformed comments without losing valid duplicates', () => {
    expect(
      decodeAICommentResult({
        tableComment: ' Users ',
        fields: [
          null,
          { fieldName: 'id', fieldComment: 42 },
          { fieldName: 'id', fieldComment: ' First ' },
          { fieldName: 'id', fieldComment: ' Last ' },
        ],
      }),
    ).toEqual({
      tableComment: 'Users',
      fields: [
        { fieldName: 'id', fieldComment: 'First' },
        { fieldName: 'id', fieldComment: 'Last' },
      ],
    });
  });

  it('rejects a whole malformed index and preserves recommendation positions', () => {
    const input = {
      recommendations: [
        null,
        {
          id: 'provider-id',
          category: 'missing_index',
          title: ' Add index ',
          rationale: ' Query ',
          index: { name: 'idx', unique: true, fields: [{ name: 'id' }, {}] },
          affectedQueries: 42,
        },
      ],
    };
    const result = decodeAIIndexAdvisorProviderResult(input);
    expect(result).toEqual({
      summary: '',
      recommendations: [
        {
          id: 'rec_2',
          category: 'missing_index',
          title: 'Add index',
          rationale: 'Query',
          confidence: 'medium',
        },
      ],
    });
    expect(decodeAIIndexAdvisorResult(result)).toEqual(result);
    expect(decodeAIIndexAdvisorResult(input).recommendations[0]?.id).toBe('provider-id');
  });
});
