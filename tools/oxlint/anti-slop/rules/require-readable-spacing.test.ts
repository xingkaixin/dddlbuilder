import test from 'node:test';

import { RuleTester } from 'oxlint/plugins-dev';

import { requireReadableSpacingRule } from './require-readable-spacing.ts';

const error = { messageId: 'expectedBlankLine' };

test('require-readable-spacing keeps tight syntax groups while preserving boundaries', () => {
  const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'ts' } } });

  tester.run('anti-slop/require-readable-spacing', requireReadableSpacingRule, {
    valid: [
      `const FIRST = 1;
const SECOND = 2;
export const THIRD = 3;
export { FIRST };`,
      `export const FIRST = {
  value: 1,
};
export const SECOND = {
  value: 2,
};`,
      `function read(value: string | null) {
  if (!value) return;
  if (value.length === 0) return;

  const result = value.trim();

  return result;
}`,
      `function click() {
  const locator = createLocator(
    "button",
  );
  locator.click();
}`,
    ],
    invalid: [
      {
        name: 'keeps a boundary before a meaningful declaration',
        code: `function first() {}
function second() {}`,
        output: `function first() {}

function second() {}`,
        errors: [error],
      },
      {
        name: 'keeps a boundary before a return after preparation',
        code: `function read(value: string) {
  const result = value.trim();
  return result;
}`,
        output: `function read(value: string) {
  const result = value.trim();

  return result;
}`,
        errors: [error],
      },
      {
        name: 'keeps a boundary before a stage transition after a multiline binding',
        code: `function read(value: string) {
  const result = parse(
    value,
  );
  if (!result) {
    return;
  }

  save(result);
}`,
        output: `function read(value: string) {
  const result = parse(
    value,
  );

  if (!result) {
    return;
  }

  save(result);
}`,
        errors: [error],
      },
      {
        name: 'keeps spacing inside a multi-step guard',
        code: `function read(value: string | null) {
  if (!value) {
    log(value);
    return;
  }
}`,
        output: `function read(value: string | null) {
  if (!value) {
    log(value);

    return;
  }
}`,
        errors: [error],
      },
      {
        name: 'keeps spacing after a conditional with an else branch',
        code: `function read(value: string | null) {
  if (value) {
    return;
  } else {
    log(value);
  }
  if (!value) return;
}`,
        output: `function read(value: string | null) {
  if (value) {
    return;
  } else {
    log(value);
  }

  if (!value) return;
}`,
        errors: [error],
      },
    ],
  });
});
