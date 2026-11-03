import { describe, it, expect } from 'vitest';
import { buildORM } from '../utils/ormGenerators';
import { buildDDL } from '../utils/ddlGenerators';
import type { NormalizedField, IndexDefinition } from '@ddlbuilder/shared-types';

const sampleFields: NormalizedField[] = [
  {
    name: 'id',
    type: 'bigint',
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
    name: 'email',
    type: 'varchar(100)',
    comment: '邮箱',
    nullable: false,
    defaultKind: 'none',
    defaultValue: '',
    onUpdate: 'none',
  },
  {
    name: 'created_at',
    type: 'datetime',
    comment: '创建时间',
    nullable: false,
    defaultKind: 'current_timestamp',
    defaultValue: '',
    onUpdate: 'none',
  },
];

const sampleIndexes: IndexDefinition[] = [
  {
    id: '1',
    name: 'PRIMARY',
    fields: [{ name: 'id', direction: 'ASC' }],
    kind: 'primary',
  },
  {
    id: '2',
    name: 'idx_email',
    fields: [{ name: 'email', direction: 'ASC' }],
    kind: 'unique_index',
  },
  {
    id: '3',
    name: 'idx_name_email',
    fields: [
      { name: 'name', direction: 'ASC' },
      { name: 'email', direction: 'ASC' },
    ],
    kind: 'unique_index',
  },
];

describe('buildORM', () => {
  it.each([
    ['prisma', '@default("")', '@default("now()")', '@default(dbgenerated("lower(\'X\')"))'],
    ['typeorm', "default: ''", "default: 'now()'", 'default: () => "lower(\'X\')"'],
  ] as const)(
    'preserves literal and expression defaults in %s',
    (target, empty, literal, expression) => {
      const field: NormalizedField = {
        name: 'label',
        type: 'text',
        comment: '',
        nullable: true,
        defaultKind: 'constant',
        defaultValue: '',
        onUpdate: 'none',
      };
      const model = buildORM(target, {
        dbType: 'mysql',
        tableName: 'defaults',
        tableComment: '',
        fields: [
          field,
          { ...field, name: 'literal', defaultValue: 'now()' },
          { ...field, name: 'computed', defaultKind: 'expression', defaultValue: "lower('X')" },
        ],
      });
      expect(model).toContain(empty);
      expect(model).toContain(literal);
      expect(model).toContain(expression);
    },
  );
});

describe('primary key defaults', () => {
  it.each([
    ['uuid', 'uuid', '', '@default(uuid())', "default: () => 'gen_random_uuid()'"],
    ['constant', 'varchar(30)', 'pending', '@default("pending")', "default: 'pending'"],
  ] as const)(
    'preserves %s defaults alongside the primary key constraint',
    (defaultKind, type, defaultValue, prismaDefault, typeormDefault) => {
      const input = {
        dbType: 'postgresql' as const,
        tableName: 'defaults',
        tableComment: '',
        fields: [{ ...sampleFields[0], type, defaultKind, defaultValue }],
        indexes: [sampleIndexes[0]],
      };
      expect(buildORM('prisma', input)).toContain(`@id ${prismaDefault}`);
      const typeorm = buildORM('typeorm', input);
      expect(typeorm).toContain('@PrimaryColumn(');
      expect(typeorm).toContain(typeormDefault);
    },
  );
});

describe('database default compatibility', () => {
  it('omits unsupported UUID defaults from MySQL integer columns in every output', () => {
    const input = {
      dbType: 'mysql' as const,
      tableName: 'defaults',
      tableComment: '',
      fields: [{ ...sampleFields[0], type: 'int', defaultKind: 'uuid' as const }],
    };

    expect(buildDDL(input)).not.toContain('UUID()');
    expect(buildORM('prisma', input)).not.toContain('@default(uuid())');
    expect(buildORM('typeorm', input)).not.toContain('default:');
  });
});

describe('TypeORMGenerator', () => {
  it.each([
    ['mysql', '(UUID())'],
    ['sqlserver', 'NEWID()'],
  ] as const)('uses the %s UUID default for non-primary columns', (dbType, expression) => {
    const result = buildORM('typeorm', {
      dbType,
      tableName: 'defaults',
      tableComment: '',
      fields: [{ ...sampleFields[1], type: 'uuid', defaultKind: 'uuid' }],
    });
    expect(result).toContain(`default: () => '${expression}'`);
  });
});

describe('GORMGenerator', () => {
  it.each([
    {
      names: ['tenant_id', 'id'],
      tags: ['column:id;primaryKey;autoIncrement:false"', 'column:tenant_id;primaryKey"'],
    },
  ])(
    'disables default auto increment on manual integer primary keys: $names',
    ({ names, tags }) => {
      const result = buildORM('gorm', {
        dbType: 'mysql',
        tableName: 'items',
        tableComment: '',
        fields: [
          { ...sampleFields[0], comment: '', defaultKind: 'none' },
          { ...sampleFields[0], name: 'tenant_id', comment: '', defaultKind: 'none' },
        ],
        indexes: [
          {
            ...sampleIndexes[0],
            fields: names.map((name) => ({ name, direction: 'ASC' as const })),
          },
        ],
      });

      for (const tag of tags) expect(result).toContain(tag);
    },
  );

  it('does not import time when not needed', () => {
    const fields: NormalizedField[] = [
      {
        name: 'id',
        type: 'int',
        comment: '',
        nullable: false,
        defaultKind: 'auto_increment',
        defaultValue: '',
        onUpdate: 'none',
      },
    ];
    const result = buildORM('gorm', {
      dbType: 'mysql',
      tableName: 'test',
      tableComment: '',
      fields,
    });
    expect(result).not.toContain('import "time"');
  });
});

describe('JPAGenerator', () => {
  it('maps composite primary keys through a serializable IdClass', () => {
    const result = buildORM('jpa', {
      dbType: 'mysql',
      tableName: 'order_items',
      tableComment: '',
      fields: [
        { ...sampleFields[0], name: 'order_id', comment: '', defaultKind: 'none' },
        { ...sampleFields[0], name: 'line_no', type: 'int', comment: '', defaultKind: 'none' },
      ],
      indexes: [
        {
          ...sampleIndexes[0],
          fields: [
            { name: 'order_id', direction: 'ASC' },
            { name: 'line_no', direction: 'ASC' },
          ],
        },
      ],
    });
    expect(result).toContain('import java.io.Serializable;');
    expect(result).toContain('import java.util.Objects;');
    expect(result).toContain('@IdClass(OrderItems.OrderItemsId.class)\npublic class OrderItems {');
    expect(result).toContain(
      [
        '    public static class OrderItemsId implements Serializable {',
        '        private Long orderId;',
        '        private Integer lineNo;',
        '',
        '        public OrderItemsId() {',
      ].join('\n'),
    );
    expect(result).toContain(
      [
        '        public OrderItemsId(Long orderId, Integer lineNo) {',
        '            this.orderId = orderId;',
        '            this.lineNo = lineNo;',
        '        }',
      ].join('\n'),
    );
    expect(result).toContain(
      [
        '        public Integer getLineNo() {',
        '            return this.lineNo;',
        '        }',
        '',
        '        public void setLineNo(Integer lineNo) {',
        '            this.lineNo = lineNo;',
      ].join('\n'),
    );
    expect(result).toContain(
      'return Objects.equals(this.orderId, other.orderId) && Objects.equals(this.lineNo, other.lineNo);',
    );
    expect(result).toContain('return Objects.hash(this.orderId, this.lineNo);');
  });

  it('imports BigDecimal when needed', () => {
    const fields: NormalizedField[] = [
      {
        name: 'amount',
        type: 'decimal(10,2)',
        comment: '',
        nullable: false,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
    ];
    const result = buildORM('jpa', {
      dbType: 'mysql',
      tableName: 'test',
      tableComment: '',
      fields,
    });
    expect(result).toContain('import java.math.BigDecimal;');
    expect(result).toContain('private BigDecimal amount;');
  });
});

describe('generated string literals', () => {
  it.each(['typeorm'] as const)('escapes newlines and backslashes in %s', (target) => {
    const value = 'line' + String.fromCharCode(10) + 'C:' + String.fromCharCode(92);

    const result = buildORM(target, {
      dbType: 'mysql',
      tableName: 'items',
      tableComment: '',
      fields: [
        { ...sampleFields[1], comment: value, defaultKind: 'constant', defaultValue: value },
      ],
      indexes: [],
    });
    expect(result).not.toContain(value);
    expect(result).toContain(String.fromCharCode(92) + 'n');
  });
  it('keeps Go comments out of tags when they contain tag delimiters', () => {
    const comment = 'a;b "q"';

    const result = buildORM('gorm', {
      dbType: 'mysql',
      tableName: 'items',
      tableComment: '',
      fields: [{ ...sampleFields[1], comment }],
      indexes: [],
    });
    expect(result).toContain('// ' + comment);
    expect(result).not.toContain('comment:' + comment);
  });
  it('preserves database DateTime defaults for Prisma', () => {
    const result = buildORM('prisma', {
      dbType: 'mysql',
      tableName: 'items',
      tableComment: '',
      fields: [
        { ...sampleFields[3], defaultKind: 'constant', defaultValue: '2024-01-01 00:00:00' },
      ],
      indexes: [],
    });
    expect(result).toContain('dbgenerated(');
  });
});
