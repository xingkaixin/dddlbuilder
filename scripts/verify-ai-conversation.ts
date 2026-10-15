import { decodeAIConversationSnapshot } from '../packages/shared-types/src/aiConversation.js';
import { createAIRuntimeFixture } from '../apps/worker/server-api/__tests__/helpers/aiRuntime.js';

const key = process.env.ANTHROPIC_API_KEY;

if (!key) throw new Error('ANTHROPIC_API_KEY is required');

const providerFetch = globalThis.fetch;

globalThis.fetch = async (input, init) => {
  const response = await providerFetch(input, init);

  if (!response.ok)
    console.error('Provider rejected request', response.status, await response.clone().text());

  return response;
};

const cases = [
  { route: 'explain', input: { sql: 'SELECT id FROM users WHERE id = 1', locale: 'en-US' } },
  {
    route: 'review',
    input: {
      ddl: 'CREATE TABLE users (id INT PRIMARY KEY, email VARCHAR(255));',
      tableName: 'users',
      dbType: 'mysql',
      locale: 'en-US',
    },
  },
  {
    route: 'generate-table',
    input: {
      description: 'A users table with id and email only',
      dbType: 'mysql',
      locale: 'en-US',
      mode: 'generate',
    },
  },
  {
    route: 'generate-table',
    input: {
      description: 'Add a nickname column',
      dbType: 'mysql',
      locale: 'en-US',
      mode: 'patch',
      existingConfig: {
        tableName: 'users',
        fields: [{ fieldName: 'id', fieldType: 'INT', nullable: false }],
      },
    },
  },
  {
    route: 'generate-comments',
    input: {
      tableName: 'users',
      fields: [{ fieldName: 'id', fieldType: 'INT' }],
      targetLocale: 'en-US',
    },
  },
  {
    route: 'index-advisor',
    input: {
      tableName: 'users',
      dbType: 'mysql',
      fields: [
        { fieldName: 'id', fieldType: 'INT' },
        { fieldName: 'email', fieldType: 'VARCHAR(255)' },
      ],
      queryPatterns: 'SELECT id FROM users WHERE email = ?',
      indexes: [],
    },
  },
];
let failed = false;

for (const scenario of cases.filter(
  (item) => !process.env.AI_SMOKE_ROUTE || item.route === process.env.AI_SMOKE_ROUTE,
)) {
  const fixture = await createAIRuntimeFixture({
    bindings: {
      ANTHROPIC_API_KEY: key,
      AI_THINKING_ENABLED: process.env.AI_THINKING_ENABLED ?? 'false',
    },
  });
  await fixture.runtime.fetch(
    new Request('https://internal/submit?operation=operation', {
      method: 'POST',
      headers: { 'x-ai-user': 'user-1' },
      body: JSON.stringify(scenario),
    }),
  );
  await fixture.finish();

  const response = await fixture.runtime.fetch(
    new Request('https://internal/snapshot?operation=operation', {
      headers: { 'x-ai-user': 'user-1' },
    }),
  );
  const snapshot = decodeAIConversationSnapshot(await response.json());
  console.log(
    JSON.stringify({
      scenario: scenario.route,
      mode: 'mode' in scenario.input ? scenario.input.mode : undefined,
      snapshot,
      charged: 100_000 - ((await fixture.balance()) ?? 0),
    }),
  );

  if (snapshot.status !== 'succeeded' || snapshot.accountingPending) failed = true;
}

process.exit(failed ? 1 : 0);
