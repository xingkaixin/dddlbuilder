import { describe, expect, it } from 'vitest';
import * as Schema from 'effect/Schema';
import { AIGenerateTableRequestSchema } from '@ddlbuilder/shared-types/ai-generate';

describe('shared AI contracts', () => {
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
});
