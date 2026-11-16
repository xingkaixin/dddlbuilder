import {
  decodeAIConversationSnapshot,
  type AIConversationSnapshot,
} from '../packages/shared-types/src/aiConversation.js';
import {
  decodeGeneratedTable,
  type GeneratedField,
} from '../packages/shared-types/src/aiGenerate.js';
import {
  decodeAICommentResult,
  decodeAIIndexAdvisorResult,
} from '../packages/shared-types/src/aiContracts.js';
import {
  normalizeDDLReviewResult,
  type DDLReviewSuggestion,
} from '../packages/shared-types/src/ddlReview.js';
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
] as const;

type SmokeScenario = (typeof cases)[number];

const REVIEW_FIELDS = new Set(['id', 'email']);
const GENERATE_EXPECTED_FIELDS = new Set(['id', 'email']);
const PATCH_EXPECTED_FIELDS = new Set(['id', 'nickname']);
const INDEX_ADVISOR_FIELDS = new Set(['id', 'email']);

const isTextSuggestion = (item: DDLReviewSuggestion): item is string => typeof item === 'string';

const collectExplainViolations = (snapshot: AIConversationSnapshot): string[] => {
  const violations: string[] = [];

  if (snapshot.text.trim().length === 0) {
    violations.push('explain text must not be empty');
  }

  if (snapshot.text.includes('```')) {
    violations.push('explain text must not contain markdown code fences');
  }

  return violations;
};

const collectReviewViolations = (snapshot: AIConversationSnapshot): string[] => {
  const violations: string[] = [];

  try {
    const result = normalizeDDLReviewResult(snapshot.result, '');

    if (result.summary.trim().length === 0) {
      violations.push('review summary must not be empty');
    }

    for (const item of result.suggestions) {
      if (isTextSuggestion(item)) continue;

      if (item.type === 'modify_field' && !REVIEW_FIELDS.has(item.fieldModification.fieldName)) {
        violations.push(
          `review modify_field targets unknown field "${item.fieldModification.fieldName}"`,
        );
      } else if (item.type === 'remove_field' && !REVIEW_FIELDS.has(item.fieldName)) {
        violations.push(`review remove_field targets unknown field "${item.fieldName}"`);
      } else if (item.type === 'add_field' && REVIEW_FIELDS.has(item.field.fieldName)) {
        violations.push(`review add_field duplicates existing field "${item.field.fieldName}"`);
      }
    }
  } catch (error) {
    violations.push(
      `review decode failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return violations;
};

const collectExactFieldSetViolations = (
  label: string,
  fields: readonly GeneratedField[],
  expectedNames: ReadonlySet<string>,
): string[] => {
  const violations: string[] = [];
  const seen = new Set<string>();

  for (const field of fields) {
    if (seen.has(field.fieldName)) {
      violations.push(`${label} contains duplicate field "${field.fieldName}"`);
    }

    seen.add(field.fieldName);

    if (!expectedNames.has(field.fieldName)) {
      violations.push(`${label} contains unexpected field "${field.fieldName}"`);
    }
  }

  for (const expectedName of expectedNames) {
    if (!seen.has(expectedName)) {
      violations.push(`${label} is missing field "${expectedName}"`);
    }
  }

  return violations;
};

const collectGenerateTableViolations = (
  mode: 'generate' | 'patch',
  snapshot: AIConversationSnapshot,
): string[] => {
  const violations: string[] = [];

  try {
    const table = decodeGeneratedTable(snapshot.text);
    const label = `generate-table(${mode})`;

    if (table.tableName !== 'users') {
      violations.push(`${label} expected tableName "users", got "${table.tableName}"`);
    }

    const expectedNames = mode === 'generate' ? GENERATE_EXPECTED_FIELDS : PATCH_EXPECTED_FIELDS;
    violations.push(...collectExactFieldSetViolations(label, table.fields, expectedNames));

    if (mode === 'generate') {
      for (const field of table.fields) {
        if ((field.id ?? null) !== null) {
          violations.push(`${label} field "${field.fieldName}" must have null or omitted id`);
        }

        if (field.fieldType.trim().length === 0) {
          violations.push(`${label} field "${field.fieldName}" must have non-empty fieldType`);
        }
      }

      const idField = table.fields.find((field) => field.fieldName === 'id');

      if (idField && idField.isPrimaryKey !== true) {
        violations.push(`${label} field "id" must have isPrimaryKey === true`);
      }

      return violations;
    }

    const idField = table.fields.find((field) => field.fieldName === 'id');

    if (idField) {
      if (idField.fieldType.toUpperCase() !== 'INT') {
        violations.push(`${label} field "id" expected INT, got "${idField.fieldType}"`);
      }

      if (idField.nullable !== false) {
        violations.push(`${label} field "id" must preserve nullable === false`);
      }
    }

    const nicknameField = table.fields.find((field) => field.fieldName === 'nickname');

    if (nicknameField) {
      if ((nicknameField.id ?? null) !== null) {
        violations.push(`${label} field "nickname" must have null or omitted id`);
      }

      if (nicknameField.fieldType.trim().length === 0) {
        violations.push(`${label} field "nickname" must have non-empty fieldType`);
      }
    }
  } catch (error) {
    violations.push(
      `generate-table(${mode}) decode failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return violations;
};

const collectGenerateCommentsViolations = (snapshot: AIConversationSnapshot): string[] => {
  const violations: string[] = [];

  try {
    const result = decodeAICommentResult(snapshot.result);

    if (result.tableComment.trim().length === 0) {
      violations.push('generate-comments tableComment must not be empty');
    }

    if (!result.fields.some((field) => field.fieldName === 'id')) {
      violations.push('generate-comments fields must include "id"');
    }

    for (const field of result.fields) {
      if (field.fieldComment.trim().length === 0) {
        violations.push(
          `generate-comments field "${field.fieldName}" must have non-empty fieldComment`,
        );
      }
    }
  } catch (error) {
    violations.push(
      `generate-comments decode failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return violations;
};

const collectIndexAdvisorViolations = (snapshot: AIConversationSnapshot): string[] => {
  const violations: string[] = [];

  try {
    const result = decodeAIIndexAdvisorResult(snapshot.result);

    if (result.summary.trim().length === 0) {
      violations.push('index-advisor summary must not be empty');
    }

    const hasExpectedIndex = result.recommendations.some(
      (recommendation) =>
        recommendation.category === 'missing_index' &&
        recommendation.index !== undefined &&
        recommendation.index.fields.length > 0 &&
        recommendation.index.fields.every((field) => INDEX_ADVISOR_FIELDS.has(field.name)) &&
        recommendation.index.fields[0]?.name === 'email',
    );

    if (!hasExpectedIndex) {
      violations.push(
        'index-advisor must include a missing_index recommendation starting with "email" on {id, email}',
      );
    }
  } catch (error) {
    violations.push(
      `index-advisor decode failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return violations;
};

const collectScenarioViolations = (
  scenario: SmokeScenario,
  snapshot: AIConversationSnapshot,
): string[] => {
  switch (scenario.route) {
    case 'explain':
      return collectExplainViolations(snapshot);
    case 'review':
      return collectReviewViolations(snapshot);
    case 'generate-table':
      return collectGenerateTableViolations(scenario.input.mode, snapshot);
    case 'generate-comments':
      return collectGenerateCommentsViolations(snapshot);
    case 'index-advisor':
      return collectIndexAdvisorViolations(snapshot);
  }
};

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

  if (snapshot.status !== 'succeeded' || snapshot.accountingPending) {
    failed = true;
    continue;
  }

  const violations = collectScenarioViolations(scenario, snapshot);

  if (violations.length > 0) {
    console.error(
      'Scenario assertion failed',
      JSON.stringify({
        scenario: scenario.route,
        mode: 'mode' in scenario.input ? scenario.input.mode : undefined,
        violations,
      }),
    );
    failed = true;
  }
}

process.exit(failed ? 1 : 0);
