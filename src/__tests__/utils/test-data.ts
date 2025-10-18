import type { FieldRow, NormalizedField, IndexField, IndexDefinition } from '@/App'

// Sample test data for fields
export const sampleFieldRows: FieldRow[] = [
  {
    order: 1,
    fieldName: 'id',
    fieldType: 'int',
    fieldComment: '主键ID',
    nullable: '否',
    defaultKind: '自增',
    defaultValue: '',
    onUpdate: '无',
  },
  {
    order: 2,
    fieldName: 'name',
    fieldType: 'varchar(255)',
    fieldComment: '名称',
    nullable: '是',
    defaultKind: '无',
    defaultValue: '',
    onUpdate: '无',
  },
  {
    order: 3,
    fieldName: 'created_at',
    fieldType: 'timestamp',
    fieldComment: '创建时间',
    nullable: '否',
    defaultKind: '当前时间',
    defaultValue: '',
    onUpdate: '无',
  },
  {
    order: 4,
    fieldName: 'updated_at',
    fieldType: 'timestamp',
    fieldComment: '更新时间',
    nullable: '否',
    defaultKind: '当前时间',
    defaultValue: '',
    onUpdate: '当前时间',
  },
]

export const sampleNormalizedFields: NormalizedField[] = [
  {
    name: 'id',
    type: 'int',
    comment: '主键ID',
    nullable: false,
    defaultKind: 'auto_increment',
    defaultValue: '',
    onUpdate: 'none',
  },
  {
    name: 'name',
    type: 'varchar(255)',
    comment: '名称',
    nullable: true,
    defaultKind: 'none',
    defaultValue: '',
    onUpdate: 'none',
  },
  {
    name: 'created_at',
    type: 'timestamp',
    comment: '创建时间',
    nullable: false,
    defaultKind: 'current_timestamp',
    defaultValue: '',
    onUpdate: 'none',
  },
  {
    name: 'updated_at',
    type: 'timestamp',
    comment: '更新时间',
    nullable: false,
    defaultKind: 'current_timestamp',
    defaultValue: '',
    onUpdate: 'current_timestamp',
  },
]

// Sample index data
export const sampleIndexFields: IndexField[] = [
  { name: 'id', direction: 'ASC' },
  { name: 'name', direction: 'DESC' },
]

export const sampleIndexes: IndexDefinition[] = [
  {
    id: '1',
    name: 'idx_users_id',
    fields: [{ name: 'id', direction: 'ASC' }],
    unique: false,
  },
  {
    id: '2',
    name: 'uk_users_name',
    fields: [{ name: 'name', direction: 'ASC' }],
    unique: true,
  },
  {
    id: '3',
    name: 'idx_users_name_created',
    fields: [
      { name: 'name', direction: 'ASC' },
      { name: 'created_at', direction: 'DESC' },
    ],
    unique: false,
  },
]

// Sample authorization objects
export const sampleAuthObjects = [
  'CBD_READ',
  'CBD_RW',
  'CBD_PROC',
  'CBD_DICT',
]

// Test table names and comments
export const sampleTableNames = [
  'users',
  'order_info',
  'product_category',
  'schema.table_name',
]

export const sampleTableComments = [
  '用户表',
  '订单信息表',
  '产品分类表',
  'Schema table description',
]

// Database types for testing
export const databaseTypes = ['mysql', 'postgresql', 'sqlserver', 'oracle'] as const

// Edge case field data
export const edgeCaseFieldRows: FieldRow[] = [
  {
    order: 1,
    fieldName: 'test_with_underscores',
    fieldType: 'varchar(100)',
    fieldComment: 'Test field with underscores',
    nullable: '是',
    defaultKind: '常量',
    defaultValue: 'default_value',
    onUpdate: '无',
  },
  {
    order: 2,
    fieldName: 'reserved_keyword',
    fieldType: 'text',
    fieldComment: 'Field using reserved keyword',
    nullable: '否',
    defaultKind: '无',
    defaultValue: '',
    onUpdate: '无',
  },
  {
    order: 3,
    fieldName: '',
    fieldType: '',
    fieldComment: '',
    nullable: '是',
    defaultKind: '无',
    defaultValue: '',
    onUpdate: '无',
  },
]

// Type mapping test cases
export const typeMappingTestCases = [
  { input: 'varchar', expectedBaseType: 'varchar' },
  { input: 'VARCHAR', expectedBaseType: 'varchar' },
  { input: 'varchar(255)', expectedBaseType: 'varchar', args: ['255'] },
  { input: 'int unsigned', expectedBaseType: 'int', unsigned: true },
  { input: 'decimal(10,2)', expectedBaseType: 'decimal', args: ['10', '2'] },
  { input: 'timestamp', expectedBaseType: 'timestamp' },
  { input: 'number(18,2)', expectedBaseType: 'decimal', args: ['18', '2'] },
  { input: 'nvarchar2(100)', expectedBaseType: 'nvarchar', args: ['100'] },
]

// Invalid data for testing error handling
export const invalidFieldData = [
  { fieldName: '', fieldType: 'varchar', fieldComment: 'Empty name' },
  { fieldName: 'test', fieldType: '', fieldComment: 'Empty type' },
  { fieldName: 'test', fieldType: 'varchar', fieldComment: '' },
  { fieldName: '', fieldType: '', fieldComment: 'Empty all' },
]