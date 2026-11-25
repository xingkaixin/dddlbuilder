import { DATABASE_TYPES } from '@ddlbuilder/shared-types';

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type
export type ToolInput = Record<string, unknown>;

type ToolResult = object;

export interface WebMcpToolDependencies {
  canSignIn: boolean;
  readOnly: boolean;
  getAuthStatus: () => ToolResult;
  startSignIn: () => ToolResult;
  inspectSchema: (input: ToolInput) => Promise<ToolResult>;
  lintSchema: () => ToolResult;
  readOutput: (input: ToolInput) => ToolResult;
  previewPatch: (input: ToolInput) => Promise<ToolResult>;
  previewSqlImport: (input: ToolInput) => Promise<ToolResult>;
  applyPatch: (input: ToolInput, signal: AbortSignal) => Promise<ToolResult>;
}

const objectSchema = (
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type
  properties: Record<string, object>,
  required: string[] = [],
  description?: string,
) => ({
  type: 'object',
  ...(description ? { description } : {}),
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
  fieldName: { type: 'string', description: 'Column name.' },
  fieldType: {
    type: 'string',
    description: 'SQL column type definition (for example, bigint, varchar(64), or numeric(10,2)).',
  },
  fieldComment: { type: 'string', description: 'Column comment or description.' },
  nullable: {
    type: 'boolean',
    description: 'Whether the column allows NULL values. Defaults to true when adding a column.',
  },
  defaultKind: {
    type: 'string',
    enum: ['none', 'auto_increment', 'constant', 'expression', 'current_timestamp', 'uuid'],
    description: 'Kind of default value expression for the column.',
  },
  defaultValue: {
    type: 'string',
    description: 'Literal or SQL expression used when defaultKind is constant or expression.',
  },
  onUpdate: {
    type: 'string',
    enum: ['none', 'current_timestamp'],
    description: 'Automatic update behavior for timestamp columns.',
  },
};

const indexProperties = {
  name: { type: 'string', description: 'Index or constraint name.' },
  fields: {
    type: 'array',
    minItems: 1,
    description: 'Ordered list of indexed columns.',
    items: objectSchema(
      {
        name: { type: 'string', description: 'Indexed column name.' },
        direction: {
          type: 'string',
          enum: ['ASC', 'DESC'],
          description: 'Sort direction for the column. Defaults to ASC.',
        },
      },
      ['name'],
    ),
  },
  kind: {
    type: 'string',
    enum: ['index', 'unique_index', 'unique_constraint', 'primary'],
    description: 'Index or constraint kind. Defaults to index when adding.',
  },
};

const operationIdProperty = {
  type: 'string',
  description:
    'Optional unique operation identifier used for partial apply via operationIds. Auto-generated if omitted.',
};

const patchOperationsSchema = {
  type: 'array',
  minItems: 1,
  description: 'Ordered list of transactional schema operations to preview.',
  items: {
    oneOf: [
      objectSchema(
        {
          id: operationIdProperty,
          kind: { const: 'table.update', description: 'Update table-level metadata.' },
          schemaName: { type: 'string', description: 'Database schema or namespace name.' },
          tableName: { type: 'string', description: 'Table name.' },
          tableComment: { type: 'string', description: 'Table comment.' },
        },
        ['kind'],
      ),
      objectSchema(
        {
          id: operationIdProperty,
          kind: { const: 'field.add', description: 'Add a new column.' },
          afterFieldId: {
            type: 'string',
            description:
              'Insert immediately after this field ID. Omit to append after the last named column.',
          },
          field: objectSchema(
            fieldProperties,
            ['fieldName', 'fieldType'],
            'Definition of the column to add.',
          ),
        },
        ['kind', 'field'],
      ),
      objectSchema(
        {
          id: operationIdProperty,
          kind: { const: 'field.update', description: 'Update properties of an existing column.' },
          fieldId: {
            type: 'string',
            description:
              'ID of the existing column from inspect_active_schema (section: "fields").',
          },
          changes: objectSchema(fieldProperties, [], 'Subset of column properties to update.'),
        },
        ['kind', 'fieldId', 'changes'],
      ),
      objectSchema(
        {
          id: operationIdProperty,
          kind: { const: 'field.remove', description: 'Remove an existing column.' },
          fieldId: { type: 'string', description: 'ID of the column to remove.' },
        },
        ['kind', 'fieldId'],
      ),
      objectSchema(
        {
          id: operationIdProperty,
          kind: {
            const: 'field.reorder',
            description: 'Move an existing column to a new position.',
          },
          fieldId: { type: 'string', description: 'ID of the column to move.' },
          afterFieldId: {
            type: 'string',
            description:
              'Place immediately after this field ID. Omit to move the column to the first position.',
          },
        },
        ['kind', 'fieldId'],
      ),
      objectSchema(
        {
          id: operationIdProperty,
          kind: { const: 'index.add', description: 'Add a new index or key constraint.' },
          index: objectSchema(
            indexProperties,
            ['name', 'fields'],
            'Definition of the index or constraint to add.',
          ),
        },
        ['kind', 'index'],
      ),
      objectSchema(
        {
          id: operationIdProperty,
          kind: {
            const: 'index.update',
            description: 'Update an existing index or key constraint.',
          },
          indexId: {
            type: 'string',
            description:
              'ID of the existing index from inspect_active_schema (section: "indexes").',
          },
          changes: objectSchema(indexProperties, [], 'Subset of index properties to update.'),
        },
        ['kind', 'indexId', 'changes'],
      ),
      objectSchema(
        {
          id: operationIdProperty,
          kind: {
            const: 'index.remove',
            description: 'Remove an existing index or key constraint.',
          },
          indexId: { type: 'string', description: 'ID of the index to remove.' },
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
          description: 'Document section to read. Defaults to "overview".',
        },
        offset: {
          type: 'integer',
          minimum: 0,
          description:
            'Zero-based starting index for paginated sections (fields, indexes, relations). Defaults to 0.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 50,
          description: 'Maximum number of items to return (1-50). Defaults to 20.',
        },
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
          kind: {
            type: 'string',
            enum: ['ddl', 'dcl', 'orm', 'alter', 'rollback'],
            description:
              'Output artifact to read. "alter" and "rollback" require an active staged change set.',
          },
          offset: {
            type: 'integer',
            minimum: 0,
            description: 'Zero-based character offset into the generated output. Defaults to 0.',
          },
          maxChars: {
            type: 'integer',
            minimum: 1,
            maximum: 1200,
            description: 'Maximum characters to return in this chunk (1-1200). Defaults to 1200.',
          },
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
            baseSignature: {
              type: 'string',
              description:
                'Current document signature returned by inspect_active_schema. Used for optimistic conflict detection.',
            },
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
            baseSignature: {
              type: 'string',
              description:
                'Current document signature returned by inspect_active_schema. Used for optimistic conflict detection.',
            },
            sql: {
              type: 'string',
              minLength: 1,
              maxLength: 50000,
              description: 'SQL DDL statement to parse and stage as a replacement preview.',
            },
            dbType: {
              type: 'string',
              enum: DATABASE_TYPES,
              description: 'Target SQL dialect used to parse the statement.',
            },
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
            changeSetId: {
              type: 'string',
              description:
                'ID of the staged change set returned by preview_schema_patch or import_sql_preview.',
            },
            operationIds: {
              type: 'array',
              items: { type: 'string' },
              uniqueItems: true,
              description:
                'Optional subset of operation IDs to apply. Omit to apply all staged changes. Supported only for preview_schema_patch change sets, not SQL imports.',
            },
          },
          ['changeSetId'],
        ),
        execute: (input, { signal }) => dependencies.applyPatch(input, signal),
      }),
    );
  }

  if (!dependencies.readOnly && dependencies.canSignIn) {
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
            description: 'Optional context describing why sign-in is being initiated.',
          },
        }),
        execute: () => dependencies.startSignIn(),
      }),
    );
  }

  return tools;
}
