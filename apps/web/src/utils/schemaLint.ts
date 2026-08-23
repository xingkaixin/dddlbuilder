import type { FieldRow, IndexDefinition } from '@ddlbuilder/shared-types';

export type SchemaLintSeverity = 'error' | 'warning' | 'suggestion';

export type SchemaLintRuleId =
  | 'table-name-snake-case'
  | 'field-name-snake-case'
  | 'primary-key-required'
  | 'index-name-convention'
  | 'audit-field-required'
  | 'audit-field-type'
  | 'created-at-default'
  | 'updated-at-on-update'
  | 'string-length-required'
  | 'money-decimal-required'
  | 'zero-date-default'
  | 'large-type-index';

export type SchemaLintIssue = {
  id: string;
  ruleId: SchemaLintRuleId;
  severity: SchemaLintSeverity;
  target: string;
  params: Readonly<Record<string, string>>;
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
  ruleId: SchemaLintRuleId,
  severity: SchemaLintSeverity,
  target: string,
  params: Readonly<Record<string, string>> = {},
): SchemaLintIssue {
  return {
    id: `${ruleId}:${target}`,
    ruleId,
    severity,
    target,
    params,
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
    issues.push(createIssue('table-name-snake-case', 'warning', normalizedTableName));
  }

  for (const row of filledRows) {
    const fieldName = row.fieldName.trim();
    if (!isSnakeCaseName(fieldName)) {
      issues.push(createIssue('field-name-snake-case', 'warning', fieldName));
    }
  }

  if (filledRows.length > 0 && !indexes.some((index) => index.isPrimary)) {
    issues.push(createIssue('primary-key-required', 'error', normalizedTableName || 'table'));
  }

  if (normalizedTableName) {
    for (const index of indexes) {
      if (index.isPrimary || index.fields.length === 0) continue;
      const expectedPrefix = buildExpectedIndexPrefix(normalizedTableName, index);
      if (!index.name.trim().startsWith(expectedPrefix)) {
        issues.push(
          createIssue('index-name-convention', 'warning', index.name || expectedPrefix, {
            expectedPrefix,
          }),
        );
      }
    }
  }

  for (const auditFieldName of AUDIT_FIELDS) {
    const auditField = findField(filledRows, auditFieldName);
    if (!auditField) {
      issues.push(createIssue('audit-field-required', 'suggestion', auditFieldName));
      continue;
    }

    if (!TIMESTAMP_TYPE_PATTERN.test(auditField.fieldType)) {
      issues.push(createIssue('audit-field-type', 'warning', auditFieldName));
    }

    if (auditFieldName === 'created_at' && !hasCurrentTimestampDefault(auditField)) {
      issues.push(createIssue('created-at-default', 'suggestion', auditFieldName));
    }

    if (auditFieldName === 'updated_at' && auditField.onUpdate !== 'current_timestamp') {
      issues.push(createIssue('updated-at-on-update', 'suggestion', auditFieldName));
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
      issues.push(createIssue('string-length-required', 'warning', fieldName));
    }

    if (MONEY_FIELD_PATTERN.test(fieldName) && FLOAT_TYPE_PATTERN.test(fieldType)) {
      issues.push(createIssue('money-decimal-required', 'warning', fieldName));
    }

    if (ZERO_DATE_PATTERN.test(defaultValue)) {
      issues.push(createIssue('zero-date-default', 'warning', fieldName));
    }

    if (indexedFieldNames.has(fieldName.toLowerCase()) && LARGE_TYPE_PATTERN.test(fieldType)) {
      issues.push(createIssue('large-type-index', 'warning', fieldName));
    }
  }

  return issues;
}
