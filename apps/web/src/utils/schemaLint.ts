import type { FieldRow, IndexDefinition } from '@ddlbuilder/shared-types';

export type SchemaLintSeverity = 'error' | 'warning' | 'suggestion';

export type SchemaLintIssue = {
  id: string;
  ruleId: string;
  severity: SchemaLintSeverity;
  target: string;
  title: string;
  reason: string;
  suggestion: string;
};

export type SchemaLintInput = {
  tableName: string;
  rows: FieldRow[];
  indexes: IndexDefinition[];
};

const NAME_PATTERN = /^[a-z][a-z0-9_]*$/;
const AUDIT_FIELDS = ['created_at', 'updated_at'] as const;
const TIMESTAMP_TYPE_PATTERN = /\b(timestamp|datetime|timestamptz)\b/i;
const LARGE_TYPE_PATTERN = /\b(text|mediumtext|longtext|blob|json|jsonb)\b/i;
const FLOAT_TYPE_PATTERN = /\b(float|double|real)\b/i;
const MONEY_FIELD_PATTERN = /(amount|price|money|fee|cost|balance|total|rate)/i;
const ZERO_DATE_PATTERN = /^['"]?0000-00-00(?: 00:00:00)?['"]?$/;

function createIssue(
  ruleId: string,
  severity: SchemaLintSeverity,
  target: string,
  title: string,
  reason: string,
  suggestion: string,
): SchemaLintIssue {
  return {
    id: `${ruleId}:${target}`,
    ruleId,
    severity,
    target,
    title,
    reason,
    suggestion,
  };
}

function isSnakeCaseName(name: string): boolean {
  return NAME_PATTERN.test(name) && !name.includes('__') && !name.endsWith('_');
}

function getFilledRows(rows: FieldRow[]): FieldRow[] {
  return rows.filter((row) => row.fieldName.trim());
}

function findField(rows: FieldRow[], name: string): FieldRow | undefined {
  return rows.find((row) => row.fieldName.trim().toLowerCase() === name);
}

function hasCurrentTimestampDefault(field: FieldRow): boolean {
  return (
    field.defaultKind === 'current_timestamp' ||
    /current_timestamp|now\(\)/i.test(field.defaultValue?.trim() ?? '')
  );
}

function buildExpectedIndexPrefix(tableName: string, index: IndexDefinition): string {
  const prefix = index.unique ? 'uk' : 'idx';
  const fields = index.fields.map((field) => field.name.trim()).filter(Boolean);
  return `${prefix}_${tableName}_${fields.join('_')}`;
}

export function lintSchema({ tableName, rows, indexes }: SchemaLintInput): SchemaLintIssue[] {
  const issues: SchemaLintIssue[] = [];
  const normalizedTableName = tableName.trim();
  const filledRows = getFilledRows(rows);

  if (normalizedTableName && !isSnakeCaseName(normalizedTableName)) {
    issues.push(
      createIssue(
        'table-name-snake-case',
        'warning',
        normalizedTableName,
        '表名命名规范',
        '稳定的结构检查使用小写 snake_case 作为默认表名约定。',
        '把表名调整为小写字母、数字和下划线组合，例如 user_profile。',
      ),
    );
  }

  for (const row of filledRows) {
    const fieldName = row.fieldName.trim();
    if (!isSnakeCaseName(fieldName)) {
      issues.push(
        createIssue(
          'field-name-snake-case',
          'warning',
          fieldName,
          '字段名命名规范',
          '字段名风格统一后，SQL、ORM 和评审记录更容易维护。',
          '把字段名调整为小写 snake_case，例如 created_at。',
        ),
      );
    }
  }

  if (filledRows.length > 0 && !indexes.some((index) => index.isPrimary)) {
    issues.push(
      createIssue(
        'primary-key-required',
        'error',
        normalizedTableName || 'table',
        '缺少主键',
        '没有主键的表很难稳定定位单行数据，也会影响更新、删除和关联建模。',
        '添加一个主键索引，常见做法是使用 id 或业务唯一键作为主键。',
      ),
    );
  }

  if (normalizedTableName) {
    for (const index of indexes) {
      if (index.isPrimary || index.fields.length === 0) continue;
      const expectedPrefix = buildExpectedIndexPrefix(normalizedTableName, index);
      if (!index.name.trim().startsWith(expectedPrefix)) {
        issues.push(
          createIssue(
            'index-name-convention',
            'warning',
            index.name || expectedPrefix,
            '索引命名规范',
            '索引名包含类型、表名和字段名后，排查执行计划和迁移脚本会更直接。',
            `建议使用 ${expectedPrefix} 作为索引名前缀。`,
          ),
        );
      }
    }
  }

  for (const auditFieldName of AUDIT_FIELDS) {
    const auditField = findField(filledRows, auditFieldName);
    if (!auditField) {
      issues.push(
        createIssue(
          'audit-field-required',
          'suggestion',
          auditFieldName,
          '建议补充审计字段',
          '创建时间和更新时间能支持排查数据写入与变更过程。',
          `添加 ${auditFieldName} 字段，并使用 timestamp 或 datetime 类型。`,
        ),
      );
      continue;
    }

    if (!TIMESTAMP_TYPE_PATTERN.test(auditField.fieldType)) {
      issues.push(
        createIssue(
          'audit-field-type',
          'warning',
          auditFieldName,
          '审计字段类型约定',
          `${auditFieldName} 使用时间类型后，排序、过滤和跨系统解释更稳定。`,
          `把 ${auditFieldName} 的字段类型调整为 timestamp 或 datetime。`,
        ),
      );
    }

    if (auditFieldName === 'created_at' && !hasCurrentTimestampDefault(auditField)) {
      issues.push(
        createIssue(
          'created-at-default',
          'suggestion',
          auditFieldName,
          '创建时间默认值',
          '创建时间由数据库写入可减少应用侧遗漏。',
          '把 created_at 默认值设置为当前时间。',
        ),
      );
    }

    if (auditFieldName === 'updated_at' && auditField.onUpdate !== 'current_timestamp') {
      issues.push(
        createIssue(
          'updated-at-on-update',
          'suggestion',
          auditFieldName,
          '更新时间自动维护',
          '更新时间自动更新后，数据变更记录更可靠。',
          '把 updated_at 的更新时机设置为当前时间。',
        ),
      );
    }
  }

  const indexedFieldNames = new Set(
    indexes.flatMap((index) => index.fields.map((field) => field.name.trim().toLowerCase())),
  );

  for (const row of filledRows) {
    const fieldName = row.fieldName.trim();
    const fieldType = row.fieldType.trim();
    const defaultValue = row.defaultValue?.trim() ?? '';

    if (/^(var)?char$/i.test(fieldType)) {
      issues.push(
        createIssue(
          'string-length-required',
          'warning',
          fieldName,
          '字符类型缺少长度',
          'varchar 或 char 缺少长度时，不同数据库和团队规范的解释可能不一致。',
          `为 ${fieldName} 设置明确长度，例如 varchar(255)。`,
        ),
      );
    }

    if (MONEY_FIELD_PATTERN.test(fieldName) && FLOAT_TYPE_PATTERN.test(fieldType)) {
      issues.push(
        createIssue(
          'money-decimal-required',
          'warning',
          fieldName,
          '金额字段类型风险',
          'float、double 和 real 存在二进制精度误差，金额类字段需要定点数。',
          `把 ${fieldName} 的字段类型调整为 decimal(p, s)。`,
        ),
      );
    }

    if (ZERO_DATE_PATTERN.test(defaultValue)) {
      issues.push(
        createIssue(
          'zero-date-default',
          'warning',
          fieldName,
          '零日期默认值',
          '0000-00-00 在严格 SQL 模式和跨数据库迁移中容易失败。',
          `移除 ${fieldName} 的零日期默认值，或改用当前时间、NULL、业务明确日期。`,
        ),
      );
    }

    if (indexedFieldNames.has(fieldName.toLowerCase()) && LARGE_TYPE_PATTERN.test(fieldType)) {
      issues.push(
        createIssue(
          'large-type-index',
          'warning',
          fieldName,
          '大字段参与索引',
          'text、blob、json 等大字段直接参与索引通常成本高，且各数据库限制差异明显。',
          `为 ${fieldName} 设计派生字段或前缀索引，再把索引放在稳定的短字段上。`,
        ),
      );
    }
  }

  return issues;
}
