import { describe, it, expect } from 'vitest';
import { buildDDLReviewQueryKey, buildAIGenerateQueryKey } from '@/queryKeys/ai';

describe('queryKeys/ai', () => {
  describe('buildDDLReviewQueryKey', () => {
    it('使用默认的 locale', () => {
      const key = buildDDLReviewQueryKey({
        ddl: 'CREATE TABLE x',
        tableName: 'x',
        dbType: 'mysql',
      });
      expect(key).toEqual(['ddl-review', 'zh-CN', 'mysql', 'x', 'CREATE TABLE x']);
    });

    it('使用传入的 locale', () => {
      const key = buildDDLReviewQueryKey({
        ddl: 'CREATE TABLE y',
        tableName: 'y',
        dbType: 'postgres',
        locale: 'en-US',
      });
      expect(key).toEqual(['ddl-review', 'en-US', 'postgres', 'y', 'CREATE TABLE y']);
    });
  });

  describe('buildAIGenerateQueryKey', () => {
    it('参数全空时应用默认值', () => {
      const key = buildAIGenerateQueryKey({
        description: 'test',
        dbType: 'mysql',
      });

      const expectedPayload = JSON.stringify({
        templates: [],
        existingConfig: null,
        previousSchema: null,
        conversationHistory: [],
      });

      expect(key).toEqual(['ai-generate-table', 'zh-CN', 'mysql', 'test', expectedPayload]);
    });

    it('传入全部参数时正确序列化', () => {
      const payloadObj = {
        templates: ['tpl1'],
        existingConfig: { tableName: 'test' },
        previousSchema: { tableName: 'old', tableComment: 'old', fields: [] },
        conversationHistory: [{ role: 'user', content: 'hi' }] as any,
      };

      const key = buildAIGenerateQueryKey({
        description: 'desc',
        dbType: 'postgres',
        locale: 'en-US',
        ...payloadObj,
      });

      expect(key).toEqual([
        'ai-generate-table',
        'en-US',
        'postgres',
        'desc',
        JSON.stringify(payloadObj),
      ]);
    });
  });
});
