import test from 'node:test';

import { RuleTester } from 'oxlint/plugins-dev';

import { requireSafetyCommentForTypeAssertionRule } from './require-safety-comment-for-type-assertion.ts';

const error = { messageId: 'missingSafetyComment' };

test('require-safety-comment-for-type-assertion reports one diagnostic per assertion chain', () => {
  const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'ts' } } });

  tester.run(
    'anti-slop/require-safety-comment-for-type-assertion (assertion chains)',
    requireSafetyCommentForTypeAssertionRule,
    {
      valid: [
        '// SAFETY: The parser established the User invariant.\nconst value = input as unknown as User;',
        '// SAFETY: The parser established the User invariant.\nconst value = (input as unknown) as User;',
        'const value = /* SAFETY: The parser established the User invariant. */ input as unknown as User;',
        'const values = [1, 2] as const;',
      ],
      invalid: [
        {
          name: 'as chain reports only the outer assertion',
          code: 'const value = input as unknown as User;',
          errors: [error],
        },
        {
          name: 'parenthesized chain reports only the outer assertion',
          code: 'const value = (input as unknown) as User;',
          errors: [error],
        },
        {
          name: 'angle-bracket chain reports only the outer assertion',
          code: 'const value = <User>(<unknown>input);',
          errors: [error],
        },
        {
          name: 'single assertion still requires a justification',
          code: 'const value = input as User;',
          errors: [error],
        },
      ],
    },
  );
});
