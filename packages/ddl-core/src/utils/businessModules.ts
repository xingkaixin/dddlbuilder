import { createEntityId, type PersistedState } from '@ddlbuilder/shared-types';
import { buildDDL } from './ddlGenerators';
import { buildForeignKeyDDL } from './foreignKeys';
import { snapshotFields } from './schemaSnapshot';

export const BUSINESS_MODULES = ['rbac', 'booking', 'inventory'] as const;

export type BusinessModule = (typeof BUSINESS_MODULES)[number];

export type ModuleIdStrategy = 'integer' | 'string';

interface ModuleTable {
  name: string;
  fields: [name: string, type: string, description: string, reference?: string][];
  unique?: string[][];
}

const modules: Record<BusinessModule, ModuleTable[]> = {
  rbac: [
    { name: 'users', fields: [['username', 'varchar(80)', 'Login name']], unique: [['username']] },
    {
      name: 'roles',
      fields: [
        ['code', 'varchar(80)', 'Role code'],
        ['name', 'varchar(120)', 'Role name'],
      ],
      unique: [['code']],
    },
    {
      name: 'permissions',
      fields: [['code', 'varchar(120)', 'Permission code']],
      unique: [['code']],
    },
    {
      name: 'user_roles',
      fields: [
        ['user_id', 'id', 'User', 'users'],
        ['role_id', 'id', 'Role', 'roles'],
      ],
      unique: [['user_id', 'role_id']],
    },
    {
      name: 'role_permissions',
      fields: [
        ['role_id', 'id', 'Role', 'roles'],
        ['permission_id', 'id', 'Permission', 'permissions'],
      ],
      unique: [['role_id', 'permission_id']],
    },
  ],
  booking: [
    { name: 'resources', fields: [['name', 'varchar(120)', 'Bookable resource']] },
    {
      name: 'slots',
      fields: [
        ['resource_id', 'id', 'Resource', 'resources'],
        ['starts_at', 'timestamp', 'Start time'],
        ['ends_at', 'timestamp', 'End time'],
      ],
      unique: [['resource_id', 'starts_at']],
    },
    {
      name: 'bookings',
      fields: [
        ['slot_id', 'id', 'Reserved slot', 'slots'],
        ['customer_name', 'varchar(120)', 'Customer name'],
        ['status', 'varchar(20)', 'confirmed / cancelled'],
      ],
      unique: [['slot_id']],
    },
  ],
  inventory: [
    {
      name: 'products',
      fields: [
        ['sku', 'varchar(80)', 'Stock keeping unit'],
        ['name', 'varchar(120)', 'Product name'],
      ],
      unique: [['sku']],
    },
    { name: 'warehouses', fields: [['code', 'varchar(80)', 'Warehouse code']], unique: [['code']] },
    {
      name: 'stock',
      fields: [
        ['product_id', 'id', 'Product', 'products'],
        ['warehouse_id', 'id', 'Warehouse', 'warehouses'],
        ['quantity', 'int', 'Current quantity'],
      ],
      unique: [['product_id', 'warehouse_id']],
    },
    {
      name: 'stock_movements',
      fields: [
        ['stock_id', 'id', 'Stock record', 'stock'],
        ['quantity_delta', 'int', 'Signed quantity change'],
        ['occurred_at', 'timestamp', 'Movement time'],
      ],
    },
  ],
};

export function instantiateBusinessModule(
  module: BusinessModule,
  dbType: 'mysql' | 'postgresql',
  prefix: string,
  idStrategy: ModuleIdStrategy,
): PersistedState[] {
  if (!/^([a-z][a-z0-9_]{0,19})?$/.test(prefix))
    throw new Error(
      'Use an empty prefix or up to 20 lowercase letters, digits and underscores, starting with a letter.',
    );
  const idType = idStrategy === 'integer' ? 'bigint' : 'varchar(36)';

  return modules[module].map((definition) => {
    const tableName = `${prefix}${definition.name}`;

    const rows = [
      {
        id: createEntityId(),
        fieldName: 'id',
        fieldType: idType,
        fieldComment: 'Primary identifier',
        nullable: false,
        defaultKind: idStrategy === 'integer' ? 'auto_increment' : 'none',
        defaultValue: '',
        onUpdate: 'none',
      } satisfies PersistedState['rows'][number],
      ...definition.fields.map(([name, type, description]) => ({
        id: createEntityId(),
        fieldName: name,
        fieldType: type === 'id' ? idType : type,
        fieldComment: description,
        nullable: false,
      })),
    ];
    const foreignKeys = definition.fields.flatMap(([name, , , reference]) =>
      reference
        ? [
            {
              id: createEntityId(),
              name: `fk_${tableName}_${name}`,
              fields: [name],
              refTable: `${prefix}${reference}`,
              refFields: ['id'],
              onDelete: 'RESTRICT' as const,
              onUpdate: 'NO ACTION' as const,
            },
          ]
        : [],
    );
    const indexes: PersistedState['indexes'] = [
      {
        id: createEntityId(),
        name: `pk_${tableName}`,
        kind: 'primary',
        fields: [{ name: 'id', direction: 'ASC' }],
      },
    ];

    for (const [index, fields] of (definition.unique ?? []).entries())
      indexes.push({
        id: createEntityId(),
        name: `uk_${tableName}_${index + 1}`,
        kind: 'unique_constraint',
        fields: fields.map((name) => ({ name, direction: 'ASC' })),
      });

    for (const fk of foreignKeys) {
      if (!(definition.unique ?? []).some((fields) => fields[0] === fk.fields[0]))
        indexes.push({
          id: createEntityId(),
          name: `idx_${tableName}_${fk.fields[0]}`,
          kind: 'index',
          fields: fk.fields.map((name) => ({ name, direction: 'ASC' })),
        });
    }

    return {
      dbType,
      tableName,
      schemaName: '',
      tableComment: `${module}: ${definition.name}`,
      rows,
      indexes,
      foreignKeys,
      authInput: '',
      authObjects: [],
      sqlFormatMode: 'compact',
      addCount: 10,
    };
  });
}

export function businessModuleSql(tables: PersistedState[]): string {
  return [
    ...tables.map((table) =>
      buildDDL({ ...table, fields: snapshotFields(table), foreignKeys: [] }),
    ),
    ...tables.flatMap((table) =>
      (table.foreignKeys ?? []).map((fk) => buildForeignKeyDDL(table.tableName, fk, table.dbType)),
    ),
  ].join('\n\n');
}
