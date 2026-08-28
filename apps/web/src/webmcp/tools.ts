import { DATABASE_TYPES } from '@ddlbuilder/shared-types';

type ToolInput = Record<string, unknown>;

export interface WebMcpToolDependencies {
  authStatus: 'loading' | 'signed_out' | 'signed_in';
  readOnly: boolean;
  getAuthStatus: () => unknown;
  startSignIn: () => unknown;
  inspectSchema: (input: ToolInput) => Promise<unknown>;
  lintSchema: () => unknown;
  readOutput: (input: ToolInput) => unknown;
  previewPatch: (input: ToolInput) => Promise<unknown>;
  previewSqlImport: (input: ToolInput) => Promise<unknown>;
  applyPatch: (input: ToolInput, signal: AbortSignal) => Promise<unknown>;
}

const objectSchema = (properties: Record<string, object>, required: string[] = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

const safeExecute =
  (execute: WebMCP.ToolExecuteCallback): WebMCP.ToolExecuteCallback =>
  async (input, options) => {
    try {
      return await execute(input, options);
    } catch (error) {
      console.warn('[webmcp] tool execution failed', error);
      const knownError = error instanceof WebMcpToolError;
      return {
        ok: false,
        error: {
          code: knownError ? error.code : 'TOOL_FAILED',
          message: knownError ? error.message : 'Tool execution failed',
        },
      };
    }
  };

export class WebMcpToolError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'WebMcpToolError';
    this.code = code;
  }
}

const tool = (definition: WebMCP.ModelContextTool): WebMCP.ModelContextTool => ({
  ...definition,
  execute: safeExecute(definition.execute),
});

const fieldProperties = {
  fieldName: { type: 'string' },
  fieldType: { type: 'string' },
  fieldComment: { type: 'string' },
  nullable: { type: 'boolean' },
  defaultKind: {
    type: 'string',
    enum: ['none', 'auto_increment', 'constant', 'expression', 'current_timestamp', 'uuid'],
  },
  defaultValue: { type: 'string' },
  onUpdate: { type: 'string', enum: ['none', 'current_timestamp'] },
};

const indexProperties = {
  name: { type: 'string' },
  fields: {
    type: 'array',
    minItems: 1,
    items: objectSchema(
      {
        name: { type: 'string' },
        direction: { type: 'string', enum: ['ASC', 'DESC'] },
      },
      ['name'],
    ),
  },
  kind: { type: 'string', enum: ['index', 'unique_index', 'unique_constraint', 'primary'] },
};

const patchOperationsSchema = {
  type: 'array',
  minItems: 1,
  items: {
    oneOf: [
      objectSchema(
        {
          id: { type: 'string' },
          kind: { const: 'table.update' },
          schemaName: { type: 'string' },
          tableName: { type: 'string' },
          tableComment: { type: 'string' },
        },
        ['kind'],
      ),
      objectSchema(
        {
          id: { type: 'string' },
          kind: { const: 'field.add' },
          afterFieldId: { type: 'string' },
          field: objectSchema(fieldProperties, ['fieldName', 'fieldType']),
        },
        ['kind', 'field'],
      ),
      objectSchema(
        {
          id: { type: 'string' },
          kind: { const: 'field.update' },
          fieldId: { type: 'string' },
          changes: objectSchema(fieldProperties),
        },
        ['kind', 'fieldId', 'changes'],
      ),
      objectSchema(
        {
          id: { type: 'string' },
          kind: { const: 'field.remove' },
          fieldId: { type: 'string' },
        },
        ['kind', 'fieldId'],
      ),
      objectSchema(
        {
          id: { type: 'string' },
          kind: { const: 'field.reorder' },
          fieldId: { type: 'string' },
          afterFieldId: { type: 'string' },
        },
        ['kind', 'fieldId'],
      ),
      objectSchema(
        {
          id: { type: 'string' },
          kind: { const: 'index.add' },
          index: objectSchema(indexProperties, ['name', 'fields']),
        },
        ['kind', 'index'],
      ),
      objectSchema(
        {
          id: { type: 'string' },
          kind: { const: 'index.update' },
          indexId: { type: 'string' },
          changes: objectSchema(indexProperties),
        },
        ['kind', 'indexId', 'changes'],
      ),
      objectSchema(
        {
          id: { type: 'string' },
          kind: { const: 'index.remove' },
          indexId: { type: 'string' },
        },
        ['kind', 'indexId'],
      ),
    ],
  },
};

export function createWebMcpTools(dependencies: WebMcpToolDependencies) {
  const tools: WebMCP.ModelContextTool[] = [
    tool({
      name: 'get_auth_status',
      title: 'Get authentication status',
      description:
        'Report whether the current browser session is signed in and which capability groups are available.',
      inputSchema: objectSchema({}),
      annotations: { readOnlyHint: true },
      execute: () => dependencies.getAuthStatus(),
    }),
    tool({
      name: 'inspect_active_schema',
      title: 'Inspect active schema',
      description:
        'Read one section of the active DDLBuilder document. Use the returned baseSignature before proposing changes.',
      inputSchema: objectSchema({
        section: {
          type: 'string',
          enum: ['overview', 'fields', 'indexes', 'relations', 'options'],
        },
        offset: { type: 'integer', minimum: 0 },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
      }),
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: (input) => dependencies.inspectSchema(input),
    }),
    tool({
      name: 'lint_active_schema',
      title: 'Check active schema',
      description:
        'Run deterministic schema naming, key, type, and dangling-reference checks on the active document.',
      inputSchema: objectSchema({}),
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: () => dependencies.lintSchema(),
    }),
    tool({
      name: 'read_generated_output',
      title: 'Read generated output',
      description:
        'Read a bounded chunk of generated DDL, DCL, ORM, ALTER, or rollback output for the active document.',
      inputSchema: objectSchema(
        {
          kind: { type: 'string', enum: ['ddl', 'dcl', 'orm', 'alter', 'rollback'] },
          offset: { type: 'integer', minimum: 0 },
          maxChars: { type: 'integer', minimum: 1, maximum: 1200 },
        },
        ['kind'],
      ),
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: (input) => dependencies.readOutput(input),
    }),
  ];

  if (!dependencies.readOnly) {
    tools.push(
      tool({
        name: 'preview_schema_patch',
        title: 'Preview schema changes',
        description:
          'Validate and stage transactional table, field, and index changes without modifying the active document.',
        inputSchema: objectSchema(
          {
            baseSignature: { type: 'string' },
            operations: patchOperationsSchema,
          },
          ['baseSignature', 'operations'],
        ),
        execute: (input) => dependencies.previewPatch(input),
      }),
      tool({
        name: 'import_sql_preview',
        title: 'Preview SQL import',
        description:
          'Parse SQL as a selected database dialect and stage the resulting schema for user review. It never applies automatically.',
        inputSchema: objectSchema(
          {
            baseSignature: { type: 'string' },
            sql: { type: 'string', minLength: 1, maxLength: 50000 },
            dbType: { type: 'string', enum: DATABASE_TYPES },
          },
          ['baseSignature', 'sql', 'dbType'],
        ),
        annotations: { untrustedContentHint: true },
        execute: (input) => dependencies.previewSqlImport(input),
      }),
      tool({
        name: 'apply_schema_patch',
        title: 'Apply reviewed schema changes',
        description:
          'Request visible user confirmation, then apply a previously staged change set if the active document is unchanged.',
        inputSchema: objectSchema(
          {
            changeSetId: { type: 'string' },
            operationIds: { type: 'array', items: { type: 'string' }, uniqueItems: true },
          },
          ['changeSetId'],
        ),
        execute: (input, { signal }) => dependencies.applyPatch(input, signal),
      }),
    );
  }

  if (!dependencies.readOnly && dependencies.authStatus === 'signed_out') {
    tools.push(
      tool({
        name: 'start_sign_in',
        title: 'Start sign in',
        description:
          'Open the DDLBuilder sign-in dialog. The user completes password and human-verification steps privately in the page.',
        inputSchema: objectSchema({
          reason: {
            type: 'string',
            enum: ['sync_workspace', 'use_ai', 'open_saved_tables', 'other'],
          },
        }),
        execute: () => dependencies.startSignIn(),
      }),
    );
  }

  return tools;
}
