import type { SchemaComparison, SchemaTableComparison } from '@ddlbuilder/ddl-core';
import type { NormalizedField } from '@ddlbuilder/shared-types';
import type { TFunction } from 'i18next';
import { escapeMarkdown, markdownTable } from './dictionary';

function describeField(field: NormalizedField | undefined): string {
  if (!field) return '';

  return [
    field.name,
    field.type,
    field.nullable ? 'NULL' : 'NOT NULL',
    field.defaultKind !== 'none' ? `DEFAULT ${field.defaultValue || field.defaultKind}` : '',
    field.onUpdate !== 'none' ? `ON UPDATE ${field.onUpdate}` : '',
    field.comment,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function comparisonDetails(table: SchemaTableComparison, t: TFunction): string[][] {
  const diff = table.diff;
  const rows: string[][] = [];

  if (!diff) return rows;

  for (const field of diff.fields)
    rows.push([
      t(`schemaTools.compare.${field.type}`),
      field.fieldName,
      describeField(field.oldField),
      describeField(field.newField),
    ]);

  for (const index of diff.indexes) {
    const definition = `${index.index.kind} (${index.index.fields.map((field) => `${field.name} ${field.direction}`).join(', ')})`;
    rows.push([
      t(`schemaTools.compare.${index.type}`),
      index.index.name,
      index.type === 'remove' ? definition : '',
      index.type === 'add' ? definition : '',
    ]);
  }

  for (const relation of diff.foreignKeys) {
    const fk = relation.foreignKey;
    const definition = `(${fk.fields.join(', ')}) → ${[fk.refSchema, fk.refTable].filter(Boolean).join('.')} (${fk.refFields.join(', ')}) ${fk.onDelete ?? ''} / ${fk.onUpdate ?? ''}`;
    rows.push([
      t(`schemaTools.compare.${relation.type}`),
      fk.name,
      relation.type === 'remove' ? definition : '',
      relation.type === 'add' ? definition : '',
    ]);
  }

  if (diff.tableCommentChanged)
    rows.push([
      t('schemaTools.compare.modify'),
      t('schemaTools.dictionary.description'),
      diff.oldTableComment ?? '',
      diff.newTableComment ?? '',
    ]);

  if (diff.miscConfigChanged)
    rows.push([
      t('schemaTools.compare.modify'),
      t('schemaTools.compare.tableOptions'),
      JSON.stringify(diff.oldMiscConfig),
      JSON.stringify(diff.newMiscConfig),
    ]);

  for (const change of diff.manualChanges ?? [])
    rows.push([t('schemaTools.compare.manual'), change, '', '']);

  return rows;
}

export function comparisonMarkdown(comparison: SchemaComparison, t: TFunction): string {
  const headings = ['change', 'object', 'before', 'after'].map((key) =>
    t(`schemaTools.compare.${key}`),
  );

  return [
    `# ${t('schemaTools.compare.reportTitle')}`,
    t('schemaTools.compare.warning'),
    ...comparison.blockers.map((blocker) => `- ${escapeMarkdown(blocker)}`),
    ...comparison.tables.map((table) =>
      [
        `## ${escapeMarkdown(table.name)} — ${t(`schemaTools.compare.${table.status}`)}`,
        table.diff
          ? markdownTable(headings, comparisonDetails(table, t))
          : markdownTable(
              [t('schemaTools.dictionary.name'), t('schemaTools.dictionary.type')],
              (table.after ?? table.before)?.rows.flatMap((row) =>
                row.fieldName.trim() ? [[row.fieldName, row.fieldType]] : [],
              ) ?? [],
            ),
      ].join('\n\n'),
    ),
  ].join('\n\n');
}
