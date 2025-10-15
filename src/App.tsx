import { useCallback, useMemo, useState } from 'react'
import type Handsontable from 'handsontable'
import { registerAllModules } from 'handsontable/registry'
import { HotTable } from '@handsontable/react-wrapper'
import 'handsontable/dist/handsontable.full.css'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

registerAllModules()

type DatabaseType = 'mysql' | 'postgresql' | 'sqlserver'

type FieldRow = {
  order: number
  fieldName: string
  fieldType: string
  fieldComment: string
  nullable: string
  businessKey: string
}

type NormalizedField = {
  name: string
  type: string
  comment: string
  nullable: boolean
  businessKey: boolean
}

const DATABASE_OPTIONS: Array<{ value: DatabaseType; label: string }> = [
  { value: 'mysql', label: 'MySQL' },
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'sqlserver', label: 'SQL Server' },
]

const YES_VALUES = new Set(['y', 'yes', 'true', '1', '是', '√'])

const toStringSafe = (value: unknown) => {
  if (typeof value === 'string') {
    return value
  }
  if (value == null) {
    return ''
  }
  return String(value)
}

const createEmptyRow = (index: number): FieldRow => ({
  order: index + 1,
  fieldName: '',
  fieldType: '',
  fieldComment: '',
  nullable: '否',
  businessKey: '否',
})

const ensureOrder = (rows: FieldRow[]) =>
  rows.map((row, index) => ({ ...row, order: index + 1 }))

const normalizeBoolean = (value: string) => {
  if (value == null) {
    return false
  }
  const normalized = String(value).trim().toLowerCase()
  return YES_VALUES.has(normalized)
}

type ParsedFieldType = {
  baseType: string
  args: string[]
  unsigned: boolean
  raw: string
}

const TYPE_ALIASES: Record<string, string> = {
  bigint: 'bigint',
  bit: 'bit',
  bool: 'boolean',
  boolean: 'boolean',
  char: 'char',
  'character varying': 'varchar',
  'character varrying': 'varchar',
  clob: 'text',
  date: 'date',
  datetime: 'datetime',
  datetime2: 'datetime2',
  'datetime offset': 'datetimeoffset',
  decimal: 'decimal',
  double: 'double',
  'double precision': 'double',
  float: 'float',
  float8: 'double',
  int: 'int',
  integer: 'int',
  int4: 'int',
  mediumtext: 'mediumtext',
  nchar: 'nchar',
  'national char': 'nchar',
  'national character': 'nchar',
  'national character varying': 'nvarchar',
  'national varchar': 'nvarchar',
  'nchar varying': 'nvarchar',
  numeric: 'decimal',
  number: 'decimal',
  nvarchar: 'nvarchar',
  real: 'real',
  serial: 'serial',
  smallint: 'smallint',
  text: 'text',
  timetz: 'timetz',
  'time with time zone': 'timetz',
  'time without time zone': 'time',
  time: 'time',
  timestamp: 'timestamp',
  'timestamp without time zone': 'timestamp',
  timestamptz: 'timestamptz',
  tinyint: 'tinyint',
  uuid: 'uuid',
  varbinary: 'varbinary',
  varchar: 'varchar',
  xml: 'xml',
  json: 'json',
  jsonb: 'jsonb',
  blob: 'blob',
  longtext: 'longtext',
  varchar2: 'varchar',
  nvarchar2: 'nvarchar',
}

const parseFieldType = (rawType: string): ParsedFieldType => {
  const raw = rawType.trim()
  if (!raw) {
    return { baseType: '', args: [], unsigned: false, raw }
  }

  const lower = raw.toLowerCase()
  const match = lower.match(/^([a-z0-9_]+(?:\s+[a-z0-9_]+)*)\s*(\(([^)]*)\))?(.*)$/)

  const baseTokens = match?.[1]?.trim().split(/\s+/).filter((token) => token.length > 0) ?? []
  const args = match?.[3]
    ?.split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0) ?? []
  const remainder = match?.[4]?.trim() ?? ''
  const modifiers = new Set(remainder.split(/\s+/).filter((token) => token.length > 0))

  let unsigned = modifiers.has('unsigned')
  if (baseTokens[baseTokens.length - 1] === 'unsigned') {
    unsigned = true
    baseTokens.pop()
  }

  const basePart = baseTokens.join(' ')

  return {
    baseType: basePart,
    args,
    unsigned,
    raw,
  }
}

const canonicalizeBaseType = (baseType: string) => TYPE_ALIASES[baseType] ?? baseType

const uppercaseArg = (value: string) => (value.toLowerCase() === 'max' ? 'MAX' : value)

const ensureLength = (args: string[], fallback: string) => {
  if (args.length === 0) {
    return [fallback]
  }
  return args
}

const formatType = (base: string, args: string[] = [], suffix = '') => {
  const formattedArgs = args.map(uppercaseArg)
  const joined = formattedArgs.join(', ')
  const typeCore = joined ? `${base.toUpperCase()}(${joined})` : base.toUpperCase()
  return suffix ? `${typeCore} ${suffix}` : typeCore
}

const mapTypeForMysql = (parsed: ParsedFieldType, canonical: string) => {
  switch (canonical) {
    case 'varchar':
      return formatType('varchar', ensureLength(parsed.args, '255'))
    case 'nvarchar':
      return formatType('varchar', ensureLength(parsed.args, '255'))
    case 'char':
      return formatType('char', ensureLength(parsed.args, '1'))
    case 'nchar':
      return formatType('char', ensureLength(parsed.args, '1'))
    case 'text':
      return formatType('text')
    case 'mediumtext':
      return formatType('mediumtext')
    case 'longtext':
      return formatType('longtext')
    case 'int':
      return formatType('int', [], parsed.unsigned ? 'UNSIGNED' : '').trim()
    case 'tinyint':
      return formatType('tinyint', parsed.args.length ? parsed.args : ['1'], parsed.unsigned ? 'UNSIGNED' : '').trim()
    case 'smallint':
      return formatType('smallint', [], parsed.unsigned ? 'UNSIGNED' : '').trim()
    case 'bigint':
      return formatType('bigint', [], parsed.unsigned ? 'UNSIGNED' : '').trim()
    case 'decimal': {
      const args = parsed.args.length === 0 ? ['18', '2'] : parsed.args
      const suffix = parsed.unsigned ? 'UNSIGNED' : ''
      return formatType('decimal', args, suffix).trim()
    }
    case 'float':
      return formatType('float', parsed.args)
    case 'double':
      return formatType('double', parsed.args)
    case 'real':
      return formatType('double', parsed.args)
    case 'boolean':
      return formatType('tinyint', ['1'])
    case 'bit':
      return formatType('bit', ensureLength(parsed.args, '1'))
    case 'datetime2':
      return formatType('datetime', parsed.args)
    case 'datetime':
      return formatType('datetime', parsed.args)
    case 'timestamp':
      return formatType('timestamp', parsed.args)
    case 'time':
      return formatType('time', parsed.args)
    case 'timetz':
      return formatType('time', parsed.args)
    case 'timestamptz':
      return formatType('timestamp', parsed.args)
    case 'date':
      return formatType('date')
    case 'json':
      return formatType('json')
    case 'jsonb':
      return formatType('json')
    case 'uuid':
      return formatType('char', ['36'])
    case 'blob':
      return formatType('blob')
    case 'varbinary':
      return formatType('varbinary', parsed.args)
    case 'serial':
      return `${formatType('bigint')} UNSIGNED AUTO_INCREMENT`
    default:
      return ''
  }
}

const mapTypeForPostgres = (parsed: ParsedFieldType, canonical: string) => {
  switch (canonical) {
    case 'varchar':
      return formatType('varchar', parsed.args)
    case 'nvarchar':
      return formatType('varchar', parsed.args)
    case 'char':
      return formatType('char', parsed.args)
    case 'nchar':
      return formatType('char', parsed.args)
    case 'text':
    case 'mediumtext':
    case 'longtext':
      return formatType('text')
    case 'int':
      return formatType('integer')
    case 'tinyint':
      return formatType('smallint')
    case 'smallint':
      return formatType('smallint')
    case 'bigint':
      return formatType('bigint')
    case 'decimal':
      return formatType('numeric', parsed.args.length === 0 ? ['18', '2'] : parsed.args)
    case 'float':
    case 'double':
      return 'DOUBLE PRECISION'
    case 'real':
      return formatType('real')
    case 'boolean':
    case 'bit':
      return formatType('boolean')
    case 'datetime':
    case 'datetime2':
      return `${formatType('timestamp', parsed.args)} WITHOUT TIME ZONE`
    case 'timestamp':
      return `${formatType('timestamp', parsed.args)} WITHOUT TIME ZONE`
    case 'timestamptz':
      return `${formatType('timestamp', parsed.args)} WITH TIME ZONE`
    case 'time':
      return `${formatType('time', parsed.args)} WITHOUT TIME ZONE`
    case 'timetz':
      return `${formatType('time', parsed.args)} WITH TIME ZONE`
    case 'date':
      return formatType('date')
    case 'json':
      return formatType('jsonb')
    case 'jsonb':
      return formatType('jsonb')
    case 'uuid':
      return formatType('uuid')
    case 'serial':
      return formatType('serial')
    case 'xml':
      return formatType('xml')
    default:
      return ''
  }
}

const mapTypeForSqlServer = (parsed: ParsedFieldType, canonical: string) => {
  switch (canonical) {
    case 'varchar':
      return formatType('varchar', ensureLength(parsed.args, '255'))
    case 'nvarchar':
      return formatType('nvarchar', ensureLength(parsed.args, '255'))
    case 'char':
      return formatType('char', ensureLength(parsed.args, '1'))
    case 'nchar':
      return formatType('nchar', ensureLength(parsed.args, '1'))
    case 'text':
    case 'mediumtext':
    case 'longtext':
      return 'NVARCHAR(MAX)'
    case 'int':
      return formatType('int')
    case 'tinyint':
      return formatType('tinyint')
    case 'smallint':
      return formatType('smallint')
    case 'bigint':
      return formatType('bigint')
    case 'decimal':
      return formatType('decimal', parsed.args.length === 0 ? ['18', '2'] : parsed.args)
    case 'float':
    case 'double':
      return formatType('float', parsed.args)
    case 'real':
      return formatType('real')
    case 'boolean':
      return formatType('bit')
    case 'bit':
      return formatType('bit')
    case 'datetime':
    case 'datetime2':
    case 'timestamp':
      return formatType('datetime2', parsed.args)
    case 'time':
    case 'timetz':
      return formatType('time', parsed.args)
    case 'date':
      return formatType('date')
    case 'json':
    case 'jsonb':
      return 'NVARCHAR(MAX)'
    case 'uuid':
      return formatType('uniqueidentifier')
    case 'varbinary':
      return formatType('varbinary', parsed.args.length === 0 ? ['MAX'] : parsed.args)
    case 'serial':
      return 'BIGINT IDENTITY(1,1)'
    case 'xml':
      return formatType('xml')
    default:
      return ''
  }
}

const getFieldTypeForDatabase = (dbType: DatabaseType, rawType: string) => {
  const parsed = parseFieldType(rawType)
  if (!parsed.baseType) {
    return rawType.trim()
  }
  const canonical = canonicalizeBaseType(parsed.baseType)
  let mapped = ''
  switch (dbType) {
    case 'mysql':
      mapped = mapTypeForMysql(parsed, canonical)
      break
    case 'postgresql':
      mapped = mapTypeForPostgres(parsed, canonical)
      break
    case 'sqlserver':
      mapped = mapTypeForSqlServer(parsed, canonical)
      break
    default:
      mapped = ''
  }
  return mapped || parsed.raw
}

const escapeSingleQuotes = (value: string) => value.replace(/'/g, "''")

const quoteMysql = (identifier: string) => `\`${identifier.replace(/`/g, '``')}\``
const quotePostgres = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`
const quoteSqlServer = (identifier: string) => `[${identifier.replace(/]/g, ']]')}]`

const splitQualifiedName = (raw: string) =>
  raw
    .split('.')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)

const getSchemaAndTable = (raw: string) => {
  const parts = splitQualifiedName(raw)
  if (parts.length <= 1) {
    const table = parts[0] ?? raw.trim()
    return { schema: '', table }
  }
  return {
    schema: parts.slice(0, -1).join('.'),
    table: parts[parts.length - 1],
  }
}

const formatMysqlTableName = (raw: string) => {
  const parts = splitQualifiedName(raw)
  if (parts.length === 0) {
    return quoteMysql(raw.trim())
  }
  return parts.map((part) => quoteMysql(part)).join('.')
}

const formatPostgresTableName = (raw: string) => {
  const parts = splitQualifiedName(raw)
  if (parts.length === 0) {
    return quotePostgres(raw.trim())
  }
  return parts.map((part) => quotePostgres(part)).join('.')
}

const normalizeFields = (rows: FieldRow[]): NormalizedField[] =>
  rows
    .map((row) => ({
      name: toStringSafe(row.fieldName).trim(),
      type: toStringSafe(row.fieldType).trim(),
      comment: toStringSafe(row.fieldComment).trim(),
      nullable: normalizeBoolean(toStringSafe(row.nullable)),
      businessKey: normalizeBoolean(toStringSafe(row.businessKey)),
    }))
    .filter((field) => field.name && field.type)

const buildMysqlDDL = (
  tableName: string,
  tableComment: string,
  fields: NormalizedField[],
) => {
  const columnLines = fields.map((field) => {
    const type = getFieldTypeForDatabase('mysql', field.type)
    const nullable = field.nullable ? ' NULL' : ' NOT NULL'
    const comment = field.comment ? ` COMMENT '${escapeSingleQuotes(field.comment)}'` : ''
    return `  ${quoteMysql(field.name)} ${type}${nullable}${comment}`
  })
  const primaryKeys = fields.filter((field) => field.businessKey)
  if (primaryKeys.length > 0) {
    columnLines.push(
      `  PRIMARY KEY (${primaryKeys.map((field) => quoteMysql(field.name)).join(', ')})`,
    )
  }
  const commentClause = tableComment
    ? ` COMMENT='${escapeSingleQuotes(tableComment.trim())}'`
    : ''
  return `CREATE TABLE ${formatMysqlTableName(tableName)} (\n${columnLines.join(',\n')}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci${commentClause};`
}

const buildPostgresDDL = (
  tableName: string,
  tableComment: string,
  fields: NormalizedField[],
) => {
  const columnLines = fields.map((field) => {
    const type = getFieldTypeForDatabase('postgresql', field.type)
    const nullableClause = field.nullable ? '' : ' NOT NULL'
    return `  ${quotePostgres(field.name)} ${type}${nullableClause}`
  })
  const primaryKeys = fields.filter((field) => field.businessKey)
  if (primaryKeys.length > 0) {
    columnLines.push(
      `  PRIMARY KEY (${primaryKeys.map((field) => quotePostgres(field.name)).join(', ')})`,
    )
  }
  const qualifiedTableName = formatPostgresTableName(tableName)
  const statements: string[] = [
    `CREATE TABLE ${qualifiedTableName} (\n${columnLines.join(',\n')}\n);`,
  ]
  if (tableComment.trim()) {
    statements.push(
      `COMMENT ON TABLE ${qualifiedTableName} IS '${escapeSingleQuotes(tableComment.trim())}';`,
    )
  }
  fields
    .filter((field) => field.comment)
    .forEach((field) => {
      statements.push(
        `COMMENT ON COLUMN ${qualifiedTableName}.${quotePostgres(field.name)} IS '${escapeSingleQuotes(field.comment)}';`,
      )
    })
  return statements.join('\n\n')
}

const buildSqlServerDDL = (
  tableName: string,
  tableComment: string,
  fields: NormalizedField[],
) => {
  const { schema: parsedSchema, table: parsedTable } = getSchemaAndTable(tableName)
  const schema = parsedSchema || 'dbo'
  const table = parsedTable || tableName.trim()
  const columnLines = fields.map((field) => {
    const type = getFieldTypeForDatabase('sqlserver', field.type)
    const nullableClause = field.nullable ? ' NULL' : ' NOT NULL'
    return `  ${quoteSqlServer(field.name)} ${type}${nullableClause}`
  })
  const primaryKeys = fields.filter((field) => field.businessKey)
  if (primaryKeys.length > 0) {
    const pkName = `PK_${table.replace(/[^a-zA-Z0-9_]/g, '_') || 'TABLE'}`
    columnLines.push(
      `  CONSTRAINT ${quoteSqlServer(pkName)} PRIMARY KEY (${primaryKeys
        .map((field) => quoteSqlServer(field.name))
        .join(', ')})`,
    )
  }
  const statements: string[] = [
    `CREATE TABLE ${quoteSqlServer(schema)}.${quoteSqlServer(table)} (\n${columnLines.join(',\n')}\n);`,
  ]
  if (tableComment.trim()) {
    statements.push(
      `EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'${escapeSingleQuotes(tableComment.trim())}', @level0type = N'SCHEMA', @level0name = N'${escapeSingleQuotes(schema)}', @level1type = N'TABLE', @level1name = N'${escapeSingleQuotes(table)}';`,
    )
  }
  fields
    .filter((field) => field.comment)
    .forEach((field) => {
      statements.push(
        `EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'${escapeSingleQuotes(field.comment)}', @level0type = N'SCHEMA', @level0name = N'${escapeSingleQuotes(schema)}', @level1type = N'TABLE', @level1name = N'${escapeSingleQuotes(table)}', @level2type = N'COLUMN', @level2name = N'${escapeSingleQuotes(field.name)}';`,
      )
    })
  return statements.join('\n\n')
}

const buildDDL = (
  dbType: DatabaseType,
  tableName: string,
  tableComment: string,
  fields: NormalizedField[],
) => {
  if (!tableName.trim()) {
    return '-- 请填写表名'
  }
  if (fields.length === 0) {
    return '-- 请补充字段信息'
  }
  switch (dbType) {
    case 'mysql':
      return buildMysqlDDL(tableName.trim(), tableComment, fields)
    case 'postgresql':
      return buildPostgresDDL(tableName.trim(), tableComment, fields)
    case 'sqlserver':
      return buildSqlServerDDL(tableName.trim(), tableComment, fields)
    default:
      return ''
  }
}

const COLUMN_HEADERS = ['序号', '字段名', '字段类型', '字段中文名', '是否为空', '是否业务主键']

const COLUMN_SETTINGS: Handsontable.ColumnSettings[] = [
  { data: 'order', readOnly: true, width: 70, className: 'htCenter' },
  { data: 'fieldName', type: 'text' },
  { data: 'fieldType', type: 'text' },
  { data: 'fieldComment', type: 'text' },
  { data: 'nullable', type: 'dropdown', source: ['是', '否'], allowInvalid: false },
  { data: 'businessKey', type: 'dropdown', source: ['是', '否'], allowInvalid: false },
]

const INITIAL_ROWS = Array.from({ length: 12 }, (_, index) => createEmptyRow(index))

function App() {
  const [tableName, setTableName] = useState('')
  const [tableComment, setTableComment] = useState('')
  const [dbType, setDbType] = useState<DatabaseType>('mysql')
  const [rows, setRows] = useState<FieldRow[]>(INITIAL_ROWS)

  const handleRowsChange = useCallback(
    (changes: Handsontable.CellChange[] | null, source: Handsontable.ChangeSource) => {
      if (!changes || source === 'loadData') {
        return
      }
      setRows((prev) => {
        const next = prev.map((row) => ({ ...row }))
        changes.forEach(([rowIndex, prop, , value]) => {
          if (typeof prop !== 'string' || prop === 'order') {
            return
          }
          while (next.length <= rowIndex) {
            next.push(createEmptyRow(next.length))
          }
          next[rowIndex] = {
            ...next[rowIndex],
            [prop]: value == null ? '' : String(value),
          }
        })
        return ensureOrder(next)
      })
    },
    [],
  )

  const handleCreateRow = useCallback((index: number, amount: number) => {
    setRows((prev) => {
      const next = prev.slice()
      for (let i = 0; i < amount; i += 1) {
        next.splice(index + i, 0, createEmptyRow(index + i))
      }
      return ensureOrder(next)
    })
  }, [])

  const handleRemoveRow = useCallback((index: number, amount: number) => {
    setRows((prev) => {
      const next = prev.slice()
      next.splice(index, amount)
      if (next.length === 0) {
        next.push(createEmptyRow(0))
      }
      return ensureOrder(next)
    })
  }, [])

  const normalizedFields = useMemo(() => normalizeFields(rows), [rows])

  const generatedSql = useMemo(
    () => buildDDL(dbType, tableName, tableComment, normalizedFields),
    [dbType, tableName, tableComment, normalizedFields],
  )

  return (
    <div className="flex min-h-screen flex-col gap-4 bg-background p-4 text-sm text-foreground lg:flex-row">
      <div className="flex flex-1 flex-col gap-4">
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="table-name">表名</Label>
              <Input
                id="table-name"
                placeholder="例如: order_info"
                value={tableName}
                onChange={(event) => setTableName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="table-comment">表中文名</Label>
              <Input
                id="table-comment"
                placeholder="例如: 订单信息表"
                value={tableComment}
                onChange={(event) => setTableComment(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>数据库类型</Label>
              <Select value={dbType} onValueChange={(value) => setDbType(value as DatabaseType)}>
                <SelectTrigger>
                  <SelectValue placeholder="请选择数据库类型" />
                </SelectTrigger>
                <SelectContent>
                  {DATABASE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <div className="min-h-[420px] flex-1 rounded-lg border bg-card p-2 shadow-sm">
          <HotTable
            data={rows}
            columns={COLUMN_SETTINGS}
            colHeaders={COLUMN_HEADERS}
            rowHeaders={false}
            stretchH="all"
            width="100%"
            height="auto"
            licenseKey="non-commercial-and-evaluation"
            manualColumnResize
            contextMenu
            afterChange={handleRowsChange}
            afterCreateRow={handleCreateRow}
            afterRemoveRow={handleRemoveRow}
            className="h-full w-full"
          />
        </div>
      </div>
      <div className="flex w-full flex-col rounded-lg border bg-card shadow-sm lg:max-w-xl">
        <div className="border-b px-4 py-3">
          <h2 className="text-base font-semibold">建表 DDL</h2>
          <p className="text-xs text-muted-foreground">
            根据左侧输入实时生成不同数据库的建表语句
          </p>
        </div>
        <div className="flex-1 overflow-auto px-4 py-4">
          <SyntaxHighlighter
            language="sql"
            style={vscDarkPlus}
            customStyle={{
              background: 'transparent',
              margin: 0,
              padding: 0,
              fontSize: '0.875rem',
            }}
            showLineNumbers
          >
            {generatedSql || '-- 请在左侧填写表信息'}
          </SyntaxHighlighter>
        </div>
      </div>
    </div>
  )
}

export default App
