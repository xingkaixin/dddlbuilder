import { useCallback, useMemo, useState, useRef, useEffect } from 'react'
import type Handsontable from 'handsontable'
import { registerAllModules } from 'handsontable/registry'
import { HotTable } from '@handsontable/react-wrapper'
import 'handsontable/dist/handsontable.full.css'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vs } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Button } from '@/components/ui/button'
import { Copy } from 'lucide-react'

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

type DatabaseType = 'mysql' | 'postgresql' | 'sqlserver' | 'oracle'

type FieldRow = {
  order: number
  fieldName: string
  fieldType: string
  fieldComment: string
  nullable: string
  defaultKind?: string
  defaultValue?: string
  onUpdate?: string
}

type NormalizedField = {
  name: string
  type: string
  comment: string
  nullable: boolean
  defaultKind: 'none' | 'auto_increment' | 'constant' | 'current_timestamp'
  defaultValue: string
  onUpdate: 'none' | 'current_timestamp'
}

const DATABASE_OPTIONS: Array<{ value: DatabaseType; label: string }> = [
  { value: 'mysql', label: 'MySQL' },
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'sqlserver', label: 'SQL Server' },
  { value: 'oracle', label: 'Oracle' },
]

const YES_VALUES = new Set(['y', 'yes', 'true', '1', '是', '√'])

// Reserved keywords for each database (lowercase)
const RESERVED_KEYWORDS: Record<DatabaseType, Set<string>> = {
  mysql: new Set([
    'add','all','alter','analyze','and','as','asc','between','by','case','column','constraint','create','cross','database','default','delete','desc','distinct','drop','else','exists','false','from','group','having','if','in','index','inner','insert','into','is','join','key','left','like','limit','not','null','on','or','order','outer','primary','right','select','table','then','true','union','unique','update','values','where'
  ]),
  postgresql: new Set([
    'all','analyze','and','any','array','as','asc','between','case','check','collate','column','constraint','create','cross','current_date','default','delete','desc','distinct','else','exists','false','from','full','group','having','ilike','in','inner','insert','intersect','into','is','join','left','like','limit','not','null','on','or','order','outer','primary','right','select','table','then','true','union','unique','update','using','values','where','with'
  ]),
  sqlserver: new Set([
    'add','all','alter','and','any','as','asc','authorization','backup','begin','between','break','by','case','check','close','column','commit','constraint','create','cross','current','cursor','database','declare','default','delete','desc','distinct','drop','else','end','exec','exists','false','fetch','for','foreign','from','full','function','grant','group','having','in','index','inner','insert','into','is','join','key','left','like','merge','not','null','on','open','or','order','outer','primary','proc','procedure','return','right','rollback','schema','select','set','table','then','top','trigger','true','union','unique','update','values','view','where','while'
  ]),
  oracle: new Set([
    'access','add','all','alter','and','any','as','asc','audit','between','by','case','check','cluster','column','comment','compress','connect','create','current','date','default','delete','desc','distinct','drop','else','exists','false','for','from','grant','group','having','in','index','insert','integer','intersect','into','is','level','like','lock','long','minus','nchar','not','nowait','null','number','of','on','or','order','prior','raw','rename','resource','revoke','row','rowid','rownum','select','session','share','size','smallint','start','synonym','sysdate','table','then','to','trigger','true','uid','union','unique','update','user','validate','values','varchar','varchar2','view','where','with'
  ]),
}

const isReservedKeyword = (db: DatabaseType, name: string) => {
  const lower = toStringSafe(name).trim().toLowerCase()
  if (!lower) return false
  return RESERVED_KEYWORDS[db]?.has(lower) ?? false
}

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
  nullable: '是',
  defaultKind: '无',
  defaultValue: '',
  onUpdate: '无',
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

// default helpers
const DEFAULT_KIND_OPTIONS = ['无', '自增', '常量', '当前时间'] as const
type UiDefaultKind = typeof DEFAULT_KIND_OPTIONS[number]
const ON_UPDATE_OPTIONS = ['无', '当前时间'] as const
type UiOnUpdate = typeof ON_UPDATE_OPTIONS[number]

const normalizeDefaultKind = (v: string | undefined): NormalizedField['defaultKind'] => {
  const s = toStringSafe(v).trim()
  if (s === '自增') return 'auto_increment'
  if (s === '常量') return 'constant'
  if (s === '当前时间') return 'current_timestamp'
  return 'none'
}

const normalizeOnUpdate = (v: string | undefined): NormalizedField['onUpdate'] => {
  const s = toStringSafe(v).trim()
  if (s === '当前时间') return 'current_timestamp'
  return 'none'
}

const getCanonicalBaseType = (rawType: string) => {
  const parsed = parseFieldType(rawType)
  return canonicalizeBaseType(parsed.baseType)
}

const shouldQuoteDefault = (canonical: string) => {
  const texty = new Set([
    'char','nchar','varchar','nvarchar','text','mediumtext','longtext','uuid','xml','json','clob','varchar2','nvarchar2'
  ])
  const datetimey = new Set(['date','time','timetz','timestamp','timestamptz','datetime','datetime2'])
  return texty.has(canonical) || datetimey.has(canonical)
}

const isLikelyFunctionOrKeyword = (value: string) => {
  const v = value.trim()
  if (!v) return false
  if (/[()]/.test(v)) return true
  return /^[A-Z_][A-Z0-9_]*$/.test(v)
}

const formatConstantDefault = (canonical: string, value: string) => {
  const v = value.trim()
  if (!v) return ''
  if (isLikelyFunctionOrKeyword(v)) return ` DEFAULT ${v}`
  if (shouldQuoteDefault(canonical)) return ` DEFAULT '${escapeSingleQuotes(v)}'`
  return ` DEFAULT ${v}`
}

// capabilities by db + canonical type
const isIntegerType = (canonical: string) =>
  new Set(['tinyint', 'smallint', 'int', 'integer', 'bigint']).has(canonical)

const isNumericType = (canonical: string) =>
  new Set(['tinyint', 'smallint', 'int', 'integer', 'bigint', 'decimal', 'number', 'numeric', 'real', 'double', 'float']).has(canonical)

// kept for potential future checks; currently not used
// const isTimestampLike = (canonical: string) =>
//   new Set(['timestamp', 'timestamptz', 'datetime', 'datetime2']).has(canonical)

const supportsAutoIncrement = (db: DatabaseType, canonical: string) => {
  switch (db) {
    case 'mysql':
      return isIntegerType(canonical)
    case 'postgresql':
      return new Set(['smallint', 'int', 'integer', 'bigint']).has(canonical)
    case 'sqlserver':
      return new Set(['tinyint', 'smallint', 'int', 'bigint']).has(canonical)
    case 'oracle':
      return isNumericType(canonical)
    default:
      return false
  }
}

const supportsDefaultCurrentTimestamp = (db: DatabaseType, canonical: string) => {
  switch (db) {
    case 'mysql':
      return new Set(['timestamp', 'datetime']).has(canonical)
    case 'postgresql':
      return new Set(['timestamp', 'timestamptz']).has(canonical)
    case 'sqlserver':
      return new Set(['datetime', 'datetime2']).has(canonical)
    case 'oracle':
      return new Set(['timestamp']).has(canonical)
    default:
      return false
  }
}

const supportsOnUpdateCurrentTimestamp = (db: DatabaseType, canonical: string) => {
  if (db !== 'mysql') return false
  return new Set(['timestamp', 'datetime']).has(canonical)
}

const getUiDefaultKindOptions = (db: DatabaseType, canonical: string): UiDefaultKind[] => {
  const opts: UiDefaultKind[] = ['无', '常量']
  if (supportsAutoIncrement(db, canonical)) opts.splice(1, 0, '自增')
  if (supportsDefaultCurrentTimestamp(db, canonical)) opts.push('当前时间')
  return opts
}

const getUiOnUpdateOptions = (db: DatabaseType, canonical: string): UiOnUpdate[] => {
  const opts: UiOnUpdate[] = ['无']
  if (supportsOnUpdateCurrentTimestamp(db, canonical)) opts.push('当前时间')
  return opts
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

const mapTypeForOracle = (parsed: ParsedFieldType, canonical: string) => {
  switch (canonical) {
    case 'varchar':
      return formatType('varchar2', ensureLength(parsed.args, '255'))
    case 'nvarchar':
      return formatType('nvarchar2', ensureLength(parsed.args, '255'))
    case 'char':
      return formatType('char', ensureLength(parsed.args, '1'))
    case 'nchar':
      return formatType('nchar', ensureLength(parsed.args, '1'))
    case 'text':
    case 'mediumtext':
    case 'longtext':
    case 'clob':
      return 'CLOB'
    case 'int':
      return 'NUMBER(10)'
    case 'tinyint':
      return 'NUMBER(3)'
    case 'smallint':
      return 'NUMBER(5)'
    case 'bigint':
      return 'NUMBER(19)'
    case 'decimal':
      return formatType('number', parsed.args.length === 0 ? ['18', '2'] : parsed.args)
    case 'float':
      return formatType('float', parsed.args)
    case 'double':
      return 'BINARY_DOUBLE'
    case 'real':
      return 'BINARY_FLOAT'
    case 'boolean':
    case 'bit':
      return 'NUMBER(1)'
    case 'datetime':
    case 'datetime2':
      return 'TIMESTAMP'
    case 'timestamp':
      return 'TIMESTAMP'
    case 'timestamptz':
      return 'TIMESTAMP WITH TIME ZONE'
    case 'time':
    case 'timetz':
      return 'TIMESTAMP'
    case 'date':
      return 'DATE'
    case 'json':
    case 'jsonb':
      return 'CLOB'
    case 'uuid':
      return 'CHAR(36)'
    case 'blob':
      return 'BLOB'
    case 'varbinary':
      return formatType('raw', ensureLength(parsed.args, '2000'))
    case 'serial':
      return 'NUMBER GENERATED ALWAYS AS IDENTITY'
    case 'xml':
      return 'XMLTYPE'
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
    case 'oracle':
      mapped = mapTypeForOracle(parsed, canonical)
      break
    default:
      mapped = ''
  }
  return mapped || parsed.raw
}

const escapeSingleQuotes = (value: string) => value.replace(/'/g, "''")

const quoteMysql = (identifier: string) => identifier
const quotePostgres = (identifier: string) => identifier
const quoteSqlServer = (identifier: string) => identifier

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
    return raw.trim()
  }
  return parts.join('.')
}

const formatPostgresTableName = (raw: string) => {
  const parts = splitQualifiedName(raw)
  if (parts.length === 0) {
    return raw.trim()
  }
  return parts.join('.')
}

const normalizeFields = (rows: FieldRow[]): NormalizedField[] =>
  rows
    .map((row) => ({
      name: toStringSafe(row.fieldName).trim(),
      type: toStringSafe(row.fieldType).trim(),
      comment: toStringSafe(row.fieldComment).trim(),
      nullable: normalizeBoolean(toStringSafe(row.nullable)),
      defaultKind: normalizeDefaultKind(row.defaultKind as UiDefaultKind),
      defaultValue: toStringSafe(row.defaultValue).trim(),
      onUpdate: normalizeOnUpdate(row.onUpdate as UiOnUpdate),
    }))
    .filter((field) => field.name && field.type)

const buildMysqlDDL = (
  tableName: string,
  tableComment: string,
  fields: NormalizedField[],
) => {
  const columnLines = fields.map((field) => {
    const type = getFieldTypeForDatabase('mysql', field.type)
    const base = getCanonicalBaseType(field.type)
    const autoInc = field.defaultKind === 'auto_increment' && supportsAutoIncrement('mysql', base) ? ' AUTO_INCREMENT' : ''
    const nullable = field.nullable ? ' NULL' : ' NOT NULL'
    let def = ''
    if (field.defaultKind === 'constant') {
      def = formatConstantDefault(base, field.defaultValue)
    } else if (field.defaultKind === 'current_timestamp' && supportsDefaultCurrentTimestamp('mysql', base)) {
      def = ' DEFAULT CURRENT_TIMESTAMP'
    }
    const onUpd = field.onUpdate === 'current_timestamp' && supportsOnUpdateCurrentTimestamp('mysql', base) ? ' ON UPDATE CURRENT_TIMESTAMP' : ''
    const comment = field.comment ? ` COMMENT '${escapeSingleQuotes(field.comment)}'` : ''
    return `  ${quoteMysql(field.name)} ${type}${autoInc}${nullable}${def}${onUpd}${comment}`
  })
  const commentClause = tableComment
    ? ` COMMENT='${escapeSingleQuotes(tableComment.trim())}'`
    : ''
  return `CREATE TABLE ${formatMysqlTableName(tableName)} (\n${columnLines.join(',\n')}\n)${commentClause};`
}

const buildPostgresDDL = (
  tableName: string,
  tableComment: string,
  fields: NormalizedField[],
) => {
  const columnLines = fields.map((field) => {
    const type = getFieldTypeForDatabase('postgresql', field.type)
    const base = getCanonicalBaseType(field.type)
    const identity = field.defaultKind === 'auto_increment' && supportsAutoIncrement('postgresql', base) ? ' GENERATED BY DEFAULT AS IDENTITY' : ''
    const nullableClause = field.nullable ? '' : ' NOT NULL'
    let def = ''
    if (field.defaultKind === 'constant') {
      def = formatConstantDefault(base, field.defaultValue)
    } else if (field.defaultKind === 'current_timestamp' && supportsDefaultCurrentTimestamp('postgresql', base)) {
      def = ' DEFAULT CURRENT_TIMESTAMP'
    }
    return `  ${quotePostgres(field.name)} ${type}${identity}${nullableClause}${def}`
  })
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
  return statements.join('\n')
}

const buildSqlServerDDL = (
  tableName: string,
  tableComment: string,
  fields: NormalizedField[],
) => {
  const { schema: parsedSchema, table: parsedTable } = getSchemaAndTable(tableName)
  const schema = parsedSchema || ''
  const table = parsedTable || tableName.trim()
  const columnLines = fields.map((field) => {
    const type = getFieldTypeForDatabase('sqlserver', field.type)
    const base = getCanonicalBaseType(field.type)
    const identity = field.defaultKind === 'auto_increment' && supportsAutoIncrement('sqlserver', base) ? ' IDENTITY(1,1)' : ''
    const nullableClause = field.nullable ? ' NULL' : ' NOT NULL'
    let def = ''
    if (field.defaultKind === 'constant') {
      def = formatConstantDefault(base, field.defaultValue)
    } else if (field.defaultKind === 'current_timestamp' && supportsDefaultCurrentTimestamp('sqlserver', base)) {
      def = ' DEFAULT GETDATE()'
    }
    return `  ${quoteSqlServer(field.name)} ${type}${identity}${nullableClause}${def}`
  })
  const qualified = schema ? `${schema}.${table}` : table
  const statements: string[] = [
    `CREATE TABLE ${qualified} (\n${columnLines.join(',\n')}\n);`,
  ]
  if (tableComment.trim()) {
    const level0name = schema
      ? `N'${escapeSingleQuotes(schema)}'`
      : 'SCHEMA_NAME()'
    statements.push(
      `EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'${escapeSingleQuotes(tableComment.trim())}', @level0type = N'SCHEMA', @level0name = ${level0name}, @level1type = N'TABLE', @level1name = N'${escapeSingleQuotes(table)}';`,
    )
  }
  fields
    .filter((field) => field.comment)
    .forEach((field) => {
      const level0name = schema
        ? `N'${escapeSingleQuotes(schema)}'`
        : 'SCHEMA_NAME()'
      statements.push(
        `EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'${escapeSingleQuotes(field.comment)}', @level0type = N'SCHEMA', @level0name = ${level0name}, @level1type = N'TABLE', @level1name = N'${escapeSingleQuotes(table)}', @level2type = N'COLUMN', @level2name = N'${escapeSingleQuotes(field.name)}';`,
      )
    })
  return statements.join('\n')
}

const buildOracleDDL = (
  tableName: string,
  tableComment: string,
  fields: NormalizedField[],
) => {
  const columnLines = fields.map((field) => {
    const type = getFieldTypeForDatabase('oracle', field.type)
    const base = getCanonicalBaseType(field.type)
    const identity = field.defaultKind === 'auto_increment' && supportsAutoIncrement('oracle', base) ? ' GENERATED BY DEFAULT AS IDENTITY' : ''
    const nullableClause = field.nullable ? '' : ' NOT NULL'
    let def = ''
    if (field.defaultKind === 'constant') {
      def = formatConstantDefault(base, field.defaultValue)
    } else if (field.defaultKind === 'current_timestamp' && supportsDefaultCurrentTimestamp('oracle', base)) {
      def = ' DEFAULT SYSTIMESTAMP'
    }
    return `  ${quotePostgres(field.name)} ${type}${identity}${nullableClause}${def}`
  })
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
  return statements.join('\n')
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
    case 'oracle':
      return buildOracleDDL(tableName.trim(), tableComment, fields)
    default:
      return ''
  }
}

const COLUMN_HEADERS = ['序号', '字段名', '字段中文名', '字段类型', '是否为空', '默认类型', '默认值', '更新策略']

const COLUMN_SETTINGS: Handsontable.ColumnSettings[] = [
  { data: 'order', readOnly: true, width: 48, className: 'htCenter' },
  { data: 'fieldName', type: 'text' },
  { data: 'fieldComment', type: 'text' },
  { data: 'fieldType', type: 'text' },
  { data: 'nullable', type: 'checkbox', className: 'htCenter', checkedTemplate: '是', uncheckedTemplate: '否' },
  { data: 'defaultKind', type: 'dropdown', source: DEFAULT_KIND_OPTIONS as unknown as string[], allowInvalid: false },
  { data: 'defaultValue', type: 'text' },
  { data: 'onUpdate', type: 'dropdown', source: ON_UPDATE_OPTIONS as unknown as string[], allowInvalid: false },
]

const INITIAL_ROWS = Array.from({ length: 12 }, (_, index) => createEmptyRow(index))

// Persist to localStorage
const STORAGE_KEY = 'ddlbuilder:state:v1'
type PersistedState = {
  tableName: string
  tableComment: string
  dbType: DatabaseType
  rows: FieldRow[]
  addCount: number
}
const sanitizeRowsForPersist = (rows: FieldRow[]) =>
  ensureOrder(
    rows.map((r, i) => ({
      order: i + 1,
      fieldName: toStringSafe(r.fieldName),
      fieldType: toStringSafe(r.fieldType),
      fieldComment: toStringSafe(r.fieldComment),
      nullable: r?.nullable === '是' ? '是' : '否',
      defaultKind: DEFAULT_KIND_OPTIONS.includes((r?.defaultKind as UiDefaultKind) ?? '无') ? (r?.defaultKind as UiDefaultKind) : '无',
      defaultValue: toStringSafe(r.defaultValue),
      onUpdate: ON_UPDATE_OPTIONS.includes((r?.onUpdate as UiOnUpdate) ?? '无') ? (r?.onUpdate as UiOnUpdate) : '无',
    })),
  )

function App() {
  const [tableName, setTableName] = useState('')
  const [tableComment, setTableComment] = useState('')
  const [dbType, setDbType] = useState<DatabaseType>('mysql')
  const [rows, setRows] = useState<FieldRow[]>(INITIAL_ROWS)
  const [addCount, setAddCount] = useState<number>(1)
  const [hydrated, setHydrated] = useState(false)

  // restore from localStorage once on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PersistedState>
        if (typeof parsed.tableName === 'string') setTableName(parsed.tableName)
        if (typeof parsed.tableComment === 'string') setTableComment(parsed.tableComment)
        if (
          parsed.dbType === 'mysql' ||
          parsed.dbType === 'postgresql' ||
          parsed.dbType === 'sqlserver' ||
          parsed.dbType === 'oracle'
        ) {
          setDbType(parsed.dbType)
        }
        if (Array.isArray(parsed.rows)) setRows(sanitizeRowsForPersist(parsed.rows as FieldRow[]))
        if (typeof parsed.addCount === 'number' && Number.isFinite(parsed.addCount)) {
          setAddCount(Math.max(1, Math.floor(parsed.addCount)))
        }
      }
    } catch {
      // ignore corrupted localStorage
    } finally {
      setHydrated(true)
    }
  }, [])

  // save to localStorage on changes
  useEffect(() => {
    if (!hydrated) return
    try {
      const payload: PersistedState = {
        tableName,
        tableComment,
        dbType,
        rows: sanitizeRowsForPersist(rows),
        addCount,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // ignore quota errors
    }
  }, [hydrated, tableName, tableComment, dbType, rows, addCount])
  const duplicateNameSet = useMemo(() => {
    const counts = new Map<string, number>()
    rows.forEach((r) => {
      const name = toStringSafe(r.fieldName).trim()
      if (!name) return
      counts.set(name, (counts.get(name) ?? 0) + 1)
    })
    const dups = new Set<string>()
    counts.forEach((count, name) => {
      if (count > 1) dups.add(name)
    })
    return dups
  }, [rows])

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
          if (prop === 'defaultKind') {
            const kind = String(value ?? '')
            if (kind !== '常量') {
              next[rowIndex].defaultValue = ''
            }
            if (kind === '自增') {
              next[rowIndex].nullable = '否'
            }
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

  const handleAddRows = useCallback(() => {
    const n = Math.floor(Number(addCount))
    const amount = Number.isFinite(n) && n > 0 ? n : 1
    setRows((prev) => {
      const index = prev.length
      const next = prev.slice()
      for (let i = 0; i < amount; i += 1) {
        next.splice(index + i, 0, createEmptyRow(index + i))
      }
      return ensureOrder(next)
    })
  }, [addCount])

  const normalizedFields = useMemo(() => normalizeFields(rows), [rows])

  const generatedSql = useMemo(
    () => buildDDL(dbType, tableName, tableComment, normalizedFields),
    [dbType, tableName, tableComment, normalizedFields],
  )

  const hideTimerRef = useRef<number | undefined>(undefined)
  const [toastMessage, setToastMessage] = useState('')
  const showToast = useCallback((msg: string) => {
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current)
    setToastMessage(msg)
    hideTimerRef.current = window.setTimeout(() => setToastMessage(''), 1600)
  }, [])

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current)
    }
  }, [])

  const handleCopyAll = useCallback(async () => {
    const text = generatedSql || '-- 请在左侧填写表信息'
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    } finally {
      showToast('已复制到剪贴板')
    }
  }, [generatedSql, showToast])

  const basePlain = (vs as Record<string, unknown>).plain as
    | Record<string, unknown>
    | undefined
  const customTheme = {
    ...vs,
    plain: {
      ...(basePlain ?? {}),
      color: '#000',
      backgroundColor: 'transparent',
    },
  }

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
          <div className="mb-2 flex items-center gap-2">
            <Button size="sm" onClick={handleAddRows}>添加行</Button>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                step={1}
                value={addCount}
                onChange={(e) => setAddCount(Math.floor(Number(e.target.value)))}
                className="w-20"
              />
              <span className="text-xs text-muted-foreground">行数</span>
            </div>
          </div>
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
            visibleRows={6}
            contextMenu
            cells={(row: number, _col: number, prop?: string | number) => {
              const cellProps: Handsontable.CellMeta = {}
              if (prop === 'fieldName') {
                const name = toStringSafe(rows[row]?.fieldName).trim()
                const classes: string[] = []
                if (name && duplicateNameSet.has(name)) classes.push('htDuplicateFieldName')
                if (name && isReservedKeyword(dbType, name)) classes.push('htReservedKeyword')
                if (classes.length) cellProps.className = `${cellProps.className ? cellProps.className + ' ' : ''}${classes.join(' ')}`
              }
              if (prop === 'defaultValue') {
                const kind = normalizeDefaultKind(rows[row]?.defaultKind as UiDefaultKind)
                if (kind !== 'constant') {
                  cellProps.readOnly = true
                  cellProps.type = 'text'
                  cellProps.className = `${cellProps.className ? cellProps.className + ' ' : ''}htDimmed`
                }
              }
              if (prop === 'defaultKind' || prop === 'onUpdate') {
                const base = getCanonicalBaseType(toStringSafe(rows[row]?.fieldType))
                const dd = cellProps as Handsontable.CellMeta & { source?: string[] }
                if (prop === 'defaultKind') {
                  const opts = getUiDefaultKindOptions(dbType, base)
                  dd.source = opts
                  dd.type = 'autocomplete'
                  ;(dd as Handsontable.CellMeta & { strict?: boolean }).strict = true
                  ;(dd as Handsontable.CellMeta & { filter?: boolean }).filter = false
                  dd.allowInvalid = false
                  dd.readOnly = false
                } else if (prop === 'onUpdate') {
                  const opts = getUiOnUpdateOptions(dbType, base)
                  if (opts.length <= 1) {
                    dd.type = 'text'
                    dd.readOnly = true
                    dd.allowInvalid = false
                    dd.source = undefined
                  } else {
                    dd.source = opts
                    dd.type = 'autocomplete'
                    ;(dd as Handsontable.CellMeta & { strict?: boolean }).strict = true
                    ;(dd as Handsontable.CellMeta & { filter?: boolean }).filter = false
                    dd.allowInvalid = false
                    dd.readOnly = false
                  }
                }
              }
              return cellProps
            }}
            afterChange={handleRowsChange}
            afterCreateRow={handleCreateRow}
            afterRemoveRow={handleRemoveRow}
            className="h-full w-full"
          />
        </div>
      </div>
      <div className="flex w-full flex-col rounded-lg border bg-card shadow-sm lg:max-w-xl">
        <div className="border-b px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">建表 DDL</h2>
              <p className="text-xs text-muted-foreground">根据左侧输入实时生成不同数据库的建表语句</p>
            </div>
            <Button variant="secondary" size="sm" className="gap-1" onClick={handleCopyAll}>
              <Copy className="h-4 w-4" /> 全部复制
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-auto px-4 py-4">
          <SyntaxHighlighter
            language="sql"
            style={customTheme}
            customStyle={{
              background: 'transparent',
              margin: 0,
              padding: 0,
              fontSize: '1rem',
            }}
            lineNumberStyle={{ color: '#000' }}
            showLineNumbers
          >
            {generatedSql || '-- 请在左侧填写表信息'}
          </SyntaxHighlighter>
        </div>
      </div>
      {toastMessage && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded bg-black/90 px-3 py-2 text-xs text-white shadow-md">
          {toastMessage}
        </div>
      )}
    </div>
  )
}

export default App
