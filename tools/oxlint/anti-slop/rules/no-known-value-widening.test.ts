import { RuleTester } from 'oxlint/plugins-dev';

import { noKnownValueWideningRule } from './no-known-value-widening.ts';

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'ts' } } });
const error = { messageId: 'widening' };

tester.run('anti-slop/no-known-value-widening generic calls', noKnownValueWideningRule, {
  valid: [
    {
      code: `
				const parseStorageJson = <T>(key: string): T | null => null;
				const isRecord = (value: unknown): value is Record<string, unknown> => true;
				const parsed = parseStorageJson<unknown>('key');
				isRecord(parsed);
			`,
    },
    {
      code: `
				const parse = <T>(key: string): T | null => null;
				const isRecord = (value: unknown): value is Record<string, unknown> => true;
				const parsed = parse('key');
				isRecord(parsed);
			`,
    },
  ],
  invalid: [
    {
      code: `
				const parse = <T>(key: string): T | null => null;
				const isRecord = (value: unknown): value is Record<string, unknown> => true;
				isRecord(parse<Record<string, string>>('key'));
			`,
      errors: [error],
    },
    {
      code: `
				type User = { id: string };
				const parse = <T>(key: string): T | null => null;
				const isUser = (value: unknown): value is User => true;
				const user = parse<User>('key');
				isUser(user);
			`,
      errors: [error],
    },
    {
      code: `
				type User = { id: string };
				const parse = <T>(key: string): User => ({ id: key });
				const isUser = (value: unknown): value is User => true;
				isUser(parse<unknown>('key'));
			`,
      errors: [error],
    },
  ],
});
