/**
 * node-sql-parser 没有提供 AST 类型，这里只按解析器真正读取到的字段做最小建模。
 * 形态确定的节点用结构类型描述，叶子值形态不定时保留 unknown，由 readField / 谓词函数收窄。
 */

export type TableRefNode = {
  db?: string | null;
  schema?: string | null;
  table: string;
};

/** 索引 / 约束 / 外键的列清单元素；pg 等方言下 column 会是 { expr: { value } } 而非字符串 */
export type ColumnListNode = {
  column?: unknown;
  order_by?: string | null;
  order_by_expr?: string | null;
  order?: string | null;
};

export type ColumnTypeNode = {
  dataType?: string;
  length?: number | string;
  scale?: number | string | null;
  parentheses?: boolean;
  suffix?: unknown[] | null;
  expr?: unknown;
  array?: { dimension?: number };
};

export type ColumnDefNode = {
  resource: 'column';
  column?: unknown;
  definition?: ColumnTypeNode;
  comment?: { value: { value: unknown } };
  nullable?: { value?: string };
  primary_key?: unknown;
  constraint?: { constraint?: string | null };
  unique?: unknown;
  auto_increment?: unknown;
  default_val?: { value?: unknown };
  on_update?: { value?: unknown };
  generated?: unknown;
  generated_by_default?: unknown;
  check?: unknown;
  character_set?: unknown;
  collate?: unknown;
};

export type OnActionNode = {
  type?: string;
  value?: unknown;
};

export type ReferenceDefinitionNode = {
  table?: TableRefNode[];
  definition?: ColumnListNode[];
  on_action?: OnActionNode[] | null;
};

export type ForeignKeyNode = {
  constraint?: string | null;
  definition?: ColumnListNode[];
  reference_definition?: ReferenceDefinitionNode;
};

export type ConstraintDefNode = ForeignKeyNode & {
  resource: 'constraint';
  constraint_type?: string;
  index?: string | null;
};

export type IndexDefNode = {
  resource: 'index';
  index?: string | null;
  index_type?: string | null;
  keyword?: string | null;
  definition?: ColumnListNode[];
};

export type CreateDefinitionNode = ColumnDefNode | ConstraintDefNode | IndexDefNode;

export type TableOptionNode = {
  keyword?: string;
  value?: unknown;
};

export type AstStatement = {
  type?: string;
  keyword?: string;
};

export type CreateTableStmt = AstStatement & {
  table?: TableRefNode[];
  table_options?: TableOptionNode[] | null;
  create_definitions?: CreateDefinitionNode[] | null;
};

export type CreateIndexStmt = AstStatement & {
  index?: string | null;
  index_type?: string | null;
  table: TableRefNode;
  index_columns?: ColumnListNode[] | null;
  columns?: ColumnListNode[] | null;
};

export type AlterExprNode = ForeignKeyNode & {
  action?: string;
  resource?: string;
  constraint_type?: string;
  create_definitions?: ConstraintDefNode;
};

export type AlterTableStmt = AstStatement & {
  // 同一字段被两处按不同形态读取：parseAlterTable 当单对象，parseMultiWithParser 当数组
  table?: TableRefNode | TableRefNode[];
  expr?: AlterExprNode[] | null;
};

const isAstScalar = (value: unknown): value is string | number | boolean =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

// oxlint-disable anti-slop/no-unsafe-dictionary-type, anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const readField = (node: unknown, key: string): unknown =>
  isRecord(node) ? node[key] : undefined;

export const stringifyAstValue = (value: unknown): string =>
  isAstScalar(value) ? String(value) : '';
// oxlint-enable anti-slop/no-unsafe-dictionary-type, anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns

export const isCreateTableStmt = (stmt: AstStatement): stmt is CreateTableStmt =>
  stmt.type === 'create' && stmt.keyword === 'table';

export const isCreateIndexStmt = (stmt: AstStatement): stmt is CreateIndexStmt =>
  stmt.type === 'create' && stmt.keyword === 'index';

export const isAlterTableStmt = (stmt: AstStatement): stmt is AlterTableStmt =>
  stmt.type === 'alter' && (!stmt.keyword || stmt.keyword === 'table');
