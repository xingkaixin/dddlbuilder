import type { PersistedState } from '@ddlbuilder/shared-types';
import { EXAMPLE_USER_PROFILE_TABLE } from '@/utils/exampleTable';
import { createEmptyRow } from '@/utils/helpers';
import type { BuilderTab } from '@/utils/tabUtils';

export type OutputTab = 'ddl' | 'dcl' | 'orm' | 'routine';

export interface PresetDefinition {
  id: string;
  state: PersistedState;
  defaultTab?: BuilderTab;
  defaultOutput?: OutputTab;
}

const VALID_OUTPUT_TABS = new Set<string>(['ddl', 'dcl', 'orm', 'routine']);

export function isOutputTab(value: string): value is OutputTab {
  return VALID_OUTPUT_TABS.has(value);
}

const MYSQL_PARTITION_ORDERS_PRESET: PersistedState = {
  schemaName: '',
  tableName: 'orders',
  tableComment: '订单主表（按月分区）',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  rows: [
    {
      ...createEmptyRow(),
      fieldName: 'id',
      fieldType: 'BIGINT',
      fieldComment: '订单主键ID',
      nullable: false,
      defaultKind: 'auto_increment',
      defaultValue: '',
    },
    {
      ...createEmptyRow(),
      fieldName: 'order_no',
      fieldType: 'VARCHAR(32)',
      fieldComment: '订单编号',
      nullable: false,
      defaultKind: 'none',
      defaultValue: '',
    },
    {
      ...createEmptyRow(),
      fieldName: 'user_id',
      fieldType: 'BIGINT',
      fieldComment: '下单用户ID',
      nullable: false,
      defaultKind: 'none',
      defaultValue: '',
    },
    {
      ...createEmptyRow(),
      fieldName: 'total_amount',
      fieldType: 'DECIMAL(12,2)',
      fieldComment: '订单总金额',
      nullable: false,
      defaultKind: 'constant',
      defaultValue: '0.00',
    },
    {
      ...createEmptyRow(),
      fieldName: 'status',
      fieldType: 'TINYINT',
      fieldComment: '订单状态：0-待支付，1-已支付，2-已取消',
      nullable: false,
      defaultKind: 'constant',
      defaultValue: '0',
    },
    {
      ...createEmptyRow(),
      fieldName: 'created_at',
      fieldType: 'DATETIME',
      fieldComment: '创建时间（分区键）',
      nullable: false,
      defaultKind: 'current_timestamp',
      defaultValue: '',
    },
    {
      ...createEmptyRow(),
      fieldName: 'updated_at',
      fieldType: 'DATETIME',
      fieldComment: '更新时间',
      nullable: false,
      defaultKind: 'current_timestamp',
      defaultValue: '',
      onUpdate: 'current_timestamp',
    },
    ...Array.from({ length: 2 }, () => createEmptyRow()),
  ],
  addCount: 10,
  indexes: [
    {
      id: 'idx_orders_pk',
      name: 'PRIMARY',
      kind: 'primary',
      fields: [
        { name: 'id', direction: 'ASC' },
        { name: 'created_at', direction: 'ASC' },
      ],
    },
    {
      id: 'idx_orders_uk_no',
      name: 'uk_orders_order_no_created',
      kind: 'unique_index',
      fields: [
        { name: 'order_no', direction: 'ASC' },
        { name: 'created_at', direction: 'ASC' },
      ],
    },
    {
      id: 'idx_orders_user_created',
      name: 'idx_orders_user_created',
      kind: 'index',
      fields: [
        { name: 'user_id', direction: 'ASC' },
        { name: 'created_at', direction: 'DESC' },
      ],
    },
  ],
  authInput: '',
  authObjects: [],
  mysqlPartitionConfig: {
    enabled: true,
    type: 'RANGE COLUMNS',
    columns: ['created_at'],
    partitions: [
      { id: 'p202601', name: 'p202601', value: "'2026-02-01'" },
      { id: 'p202602', name: 'p202602', value: "'2026-03-01'" },
      { id: 'p202603', name: 'p202603', value: "'2026-04-01'" },
      { id: 'pmax', name: 'pmax', value: 'MAXVALUE' },
    ],
  },
  tableMiscConfig: {
    enabled: true,
    engine: 'InnoDB',
    charset: 'utf8mb4',
    collation: 'utf8mb4_0900_ai_ci',
  },
};

const POSTGRESQL_ORDERS_PRESET: PersistedState = {
  schemaName: 'app',
  tableName: 'payment_orders',
  tableComment: '支付订单表',
  dbType: 'postgresql',
  sqlFormatMode: 'compact',
  rows: [
    {
      ...createEmptyRow(),
      fieldName: 'id',
      fieldType: 'BIGINT',
      fieldComment: '主键ID',
      nullable: false,
      defaultKind: 'auto_increment',
      defaultValue: '',
    },
    {
      ...createEmptyRow(),
      fieldName: 'order_no',
      fieldType: 'VARCHAR(64)',
      fieldComment: '外部订单号',
      nullable: false,
      defaultKind: 'none',
      defaultValue: '',
    },
    {
      ...createEmptyRow(),
      fieldName: 'user_id',
      fieldType: 'BIGINT',
      fieldComment: '用户ID',
      nullable: false,
      defaultKind: 'none',
      defaultValue: '',
    },
    {
      ...createEmptyRow(),
      fieldName: 'amount_cents',
      fieldType: 'BIGINT',
      fieldComment: '金额（分）',
      nullable: false,
      defaultKind: 'constant',
      defaultValue: '0',
    },
    {
      ...createEmptyRow(),
      fieldName: 'currency',
      fieldType: 'CHAR(3)',
      fieldComment: '币种',
      nullable: false,
      defaultKind: 'constant',
      defaultValue: 'CNY',
    },
    {
      ...createEmptyRow(),
      fieldName: 'metadata',
      fieldType: 'JSONB',
      fieldComment: '扩展元数据',
      nullable: true,
      defaultKind: 'none',
      defaultValue: '',
    },
    {
      ...createEmptyRow(),
      fieldName: 'paid_at',
      fieldType: 'TIMESTAMPTZ',
      fieldComment: '支付时间',
      nullable: true,
      defaultKind: 'none',
      defaultValue: '',
    },
    {
      ...createEmptyRow(),
      fieldName: 'created_at',
      fieldType: 'TIMESTAMPTZ',
      fieldComment: '创建时间',
      nullable: false,
      defaultKind: 'current_timestamp',
      defaultValue: '',
    },
    ...Array.from({ length: 2 }, () => createEmptyRow()),
  ],
  addCount: 10,
  indexes: [
    {
      id: 'idx_pg_pk',
      name: 'pk_payment_orders',
      kind: 'primary',
      fields: [{ name: 'id', direction: 'ASC' }],
    },
    {
      id: 'idx_pg_uk_order_no',
      name: 'uk_payment_orders_order_no',
      kind: 'unique_index',
      fields: [{ name: 'order_no', direction: 'ASC' }],
    },
    {
      id: 'idx_pg_user_created',
      name: 'idx_payment_orders_user_created',
      kind: 'index',
      fields: [
        { name: 'user_id', direction: 'ASC' },
        { name: 'created_at', direction: 'DESC' },
      ],
    },
  ],
  authInput: '',
  authObjects: [],
  tableMiscConfig: {
    enabled: true,
    fillfactor: 90,
  },
};

const SQL_TO_PRISMA_PRESET: PersistedState = {
  schemaName: '',
  tableName: 'orders',
  tableComment: '电商订单表',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  rows: [
    {
      ...createEmptyRow(),
      fieldName: 'id',
      fieldType: 'BIGINT',
      fieldComment: '订单主键ID',
      nullable: false,
      defaultKind: 'auto_increment',
      defaultValue: '',
    },
    {
      ...createEmptyRow(),
      fieldName: 'user_id',
      fieldType: 'BIGINT',
      fieldComment: '关联用户ID',
      nullable: false,
      defaultKind: 'none',
      defaultValue: '',
    },
    {
      ...createEmptyRow(),
      fieldName: 'order_no',
      fieldType: 'VARCHAR(32)',
      fieldComment: '订单号',
      nullable: false,
      defaultKind: 'none',
      defaultValue: '',
    },
    {
      ...createEmptyRow(),
      fieldName: 'total_amount',
      fieldType: 'DECIMAL(10,2)',
      fieldComment: '订单金额',
      nullable: false,
      defaultKind: 'constant',
      defaultValue: '0.00',
    },
    {
      ...createEmptyRow(),
      fieldName: 'status',
      fieldType: 'VARCHAR(20)',
      fieldComment: '状态',
      nullable: false,
      defaultKind: 'constant',
      defaultValue: 'pending',
    },
    {
      ...createEmptyRow(),
      fieldName: 'created_at',
      fieldType: 'TIMESTAMP',
      fieldComment: '创建时间',
      nullable: false,
      defaultKind: 'current_timestamp',
      defaultValue: '',
    },
    ...Array.from({ length: 2 }, () => createEmptyRow()),
  ],
  addCount: 10,
  indexes: [
    {
      id: 'idx_er_pk',
      name: 'PRIMARY',
      kind: 'primary',
      fields: [{ name: 'id', direction: 'ASC' }],
    },
    {
      id: 'idx_er_uk_order_no',
      name: 'uk_orders_order_no',
      kind: 'unique_index',
      fields: [{ name: 'order_no', direction: 'ASC' }],
    },
    {
      id: 'idx_er_user_id',
      name: 'idx_orders_user_id',
      kind: 'index',
      fields: [{ name: 'user_id', direction: 'ASC' }],
    },
  ],
  authInput: '',
  authObjects: [],
};

const MYSQL_ER_ORDERS_PRESET: PersistedState = {
  ...SQL_TO_PRISMA_PRESET,
  foreignKeys: [
    {
      id: 'fk_orders_user',
      name: 'fk_orders_user',
      fields: ['user_id'],
      refTable: 'users',
      refFields: ['id'],
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE',
    },
  ],
};

const DM_ORACLE_PRESET: PersistedState = {
  schemaName: 'OA',
  tableName: 'approval_records',
  tableComment: '审批记录表',
  dbType: 'dm',
  sqlFormatMode: 'compact',
  rows: [
    {
      ...createEmptyRow(),
      fieldName: 'id',
      fieldType: 'BIGINT',
      fieldComment: '主键ID',
      nullable: false,
      defaultKind: 'auto_increment',
      defaultValue: '',
    },
    {
      ...createEmptyRow(),
      fieldName: 'biz_no',
      fieldType: 'VARCHAR(64)',
      fieldComment: '业务单据号',
      nullable: false,
      defaultKind: 'none',
      defaultValue: '',
    },
    {
      ...createEmptyRow(),
      fieldName: 'applicant_id',
      fieldType: 'BIGINT',
      fieldComment: '申请人ID',
      nullable: false,
      defaultKind: 'none',
      defaultValue: '',
    },
    {
      ...createEmptyRow(),
      fieldName: 'status',
      fieldType: 'SMALLINT',
      fieldComment: '审批状态：0-待审批，1-通过，2-驳回',
      nullable: false,
      defaultKind: 'constant',
      defaultValue: '0',
    },
    {
      ...createEmptyRow(),
      fieldName: 'remark',
      fieldType: 'VARCHAR(500)',
      fieldComment: '审批意见',
      nullable: true,
      defaultKind: 'none',
      defaultValue: '',
    },
    {
      ...createEmptyRow(),
      fieldName: 'created_at',
      fieldType: 'TIMESTAMP',
      fieldComment: '创建时间',
      nullable: false,
      defaultKind: 'current_timestamp',
      defaultValue: '',
    },
    ...Array.from({ length: 2 }, () => createEmptyRow()),
  ],
  addCount: 10,
  indexes: [
    {
      id: 'idx_dm_pk',
      name: 'pk_approval_records',
      kind: 'primary',
      fields: [{ name: 'id', direction: 'ASC' }],
    },
    {
      id: 'idx_dm_uk_biz_no',
      name: 'uk_approval_records_biz_no',
      kind: 'unique_index',
      fields: [{ name: 'biz_no', direction: 'ASC' }],
    },
    {
      id: 'idx_dm_applicant',
      name: 'idx_approval_records_applicant',
      kind: 'index',
      fields: [{ name: 'applicant_id', direction: 'ASC' }],
    },
  ],
  authInput: '',
  authObjects: [],
  tableMiscConfig: {
    enabled: true,
    tablespace: 'MAIN',
  },
};

const PG_CITUS_PRESET: PersistedState = {
  schemaName: 'analytics',
  tableName: 'tenant_events',
  tableComment: '多租户事件表',
  dbType: 'postgresql-citus',
  sqlFormatMode: 'compact',
  rows: [
    {
      ...createEmptyRow(),
      fieldName: 'tenant_id',
      fieldType: 'BIGINT',
      fieldComment: '租户ID（分片键）',
      nullable: false,
      defaultKind: 'none',
      defaultValue: '',
    },
    {
      ...createEmptyRow(),
      fieldName: 'event_id',
      fieldType: 'BIGINT',
      fieldComment: '事件ID',
      nullable: false,
      defaultKind: 'none',
      defaultValue: '',
    },
    {
      ...createEmptyRow(),
      fieldName: 'event_type',
      fieldType: 'VARCHAR(64)',
      fieldComment: '事件类型',
      nullable: false,
      defaultKind: 'none',
      defaultValue: '',
    },
    {
      ...createEmptyRow(),
      fieldName: 'payload',
      fieldType: 'JSONB',
      fieldComment: '事件载荷',
      nullable: true,
      defaultKind: 'none',
      defaultValue: '',
    },
    {
      ...createEmptyRow(),
      fieldName: 'created_at',
      fieldType: 'TIMESTAMPTZ',
      fieldComment: '发生时间',
      nullable: false,
      defaultKind: 'current_timestamp',
      defaultValue: '',
    },
    ...Array.from({ length: 2 }, () => createEmptyRow()),
  ],
  addCount: 10,
  indexes: [
    {
      id: 'idx_citus_pk',
      name: 'pk_tenant_events',
      kind: 'primary',
      fields: [
        { name: 'tenant_id', direction: 'ASC' },
        { name: 'event_id', direction: 'ASC' },
      ],
    },
    {
      id: 'idx_citus_created',
      name: 'idx_tenant_events_created',
      kind: 'index',
      fields: [
        { name: 'tenant_id', direction: 'ASC' },
        { name: 'created_at', direction: 'DESC' },
      ],
    },
  ],
  authInput: '',
  authObjects: [],
  citusShardingConfig: {
    mode: 'distributed',
    distributionColumn: 'tenant_id',
  },
};

const PRESETS = new Map<string, PresetDefinition>([
  [
    'user-profile',
    {
      id: 'user-profile',
      state: EXAMPLE_USER_PROFILE_TABLE,
    },
  ],
  [
    'mysql-partition',
    {
      id: 'mysql-partition',
      state: MYSQL_PARTITION_ORDERS_PRESET,
      defaultTab: 'partition',
    },
  ],
  [
    'postgresql-orders',
    {
      id: 'postgresql-orders',
      state: POSTGRESQL_ORDERS_PRESET,
      defaultTab: 'indexes',
    },
  ],
  [
    'sql-to-er-prisma',
    {
      id: 'sql-to-er-prisma',
      state: SQL_TO_PRISMA_PRESET,
      defaultOutput: 'orm',
    },
  ],
  [
    'mysql-er-orders',
    {
      id: 'mysql-er-orders',
      state: MYSQL_ER_ORDERS_PRESET,
      defaultTab: 'foreignKeys',
    },
  ],
  [
    'dm-oracle',
    {
      id: 'dm-oracle',
      state: DM_ORACLE_PRESET,
    },
  ],
  [
    'pg-citus',
    {
      id: 'pg-citus',
      state: PG_CITUS_PRESET,
      defaultTab: 'sharding',
    },
  ],
]);

export function getPresetDefinition(id: string | null | undefined): PresetDefinition | null {
  if (!id) return null;

  const preset = PRESETS.get(id.trim());

  if (!preset) return null;

  return {
    ...preset,
    state: structuredClone(preset.state),
  };
}
