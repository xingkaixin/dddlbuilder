import type { PersistedState } from '@ddlbuilder/shared-types';
import { getSqlIdentifierKey } from '@ddlbuilder/ddl-core';
import type { FieldStandard } from '@/utils/fieldStandards';
import type { TFunction } from 'i18next';

export interface DictionarySection {
  id: string;
  name: string;
  description: string;
  database: string;
  fields: string[][];
  indexes: string[][];
  relationships: { values: string[]; targetId?: string }[];
}

export interface DictionaryDocument {
  title: string;
  language: string;
  labels: {
    search: string;
    fields: string;
    indexes: string;
    relationships: string;
    fieldHeaders: string[];
    indexHeaders: string[];
    relationshipHeaders: string[];
  };
  tables: DictionarySection[];
}

function identity(table: PersistedState, name = table.tableName, schema = table.schemaName) {
  return JSON.stringify([
    table.dbType,
    getSqlIdentifierKey(schema, table.dbType),
    getSqlIdentifierKey(name, table.dbType),
  ]);
}

export function buildDictionary(
  tables: PersistedState[],
  standards: FieldStandard[],
  title: string,
  language: string,
  t: TFunction,
): DictionaryDocument {
  const standardById = new Map(standards.map((standard) => [standard.id, standard]));
  const ids = new Map(tables.map((table, index) => [identity(table), `table-${index}`]));
  const label = (key: string) => t(`schemaTools.dictionary.${key}`);

  return {
    title: title.trim() || label('defaultTitle'),
    language,
    labels: {
      search: label('search'),
      fields: label('fields'),
      indexes: label('indexes'),
      relationships: label('relationships'),
      fieldHeaders: [
        'name',
        'type',
        'nullable',
        'key',
        'default',
        'onUpdate',
        'description',
        'enum',
        'standard',
      ].map(label),
      indexHeaders: ['name', 'type', 'fields'].map(label),
      relationshipHeaders: ['name', 'fields', 'target', 'type', 'description'].map(label),
    },
    tables: tables.map((table, index) => ({
      id: `table-${index}`,
      name: [table.schemaName, table.tableName].filter(Boolean).join('.'),
      description: table.tableComment,
      database: table.dbType,
      fields: table.rows.flatMap((row) => {
        if (!row.fieldName.trim()) return [];
        const standard = row.standardId ? standardById.get(row.standardId) : undefined;

        const primary = table.indexes.some(
          (item) =>
            item.kind === 'primary' &&
            item.fields.some(
              (field) =>
                getSqlIdentifierKey(field.name, table.dbType) ===
                getSqlIdentifierKey(row.fieldName, table.dbType),
            ),
        );

        return [
          [
            row.fieldName,
            row.fieldType,
            label(row.nullable ? 'yes' : 'no'),
            primary ? 'PK' : '',
            row.defaultKind === 'constant' || row.defaultKind === 'expression'
              ? (row.defaultValue ?? '')
              : row.defaultKind && row.defaultKind !== 'none'
                ? row.defaultKind
                : '',
            row.onUpdate && row.onUpdate !== 'none' ? row.onUpdate : '',
            row.fieldComment,
            (row.enumMeta ?? [])
              .map((entry) =>
                [entry.value, entry.i18n?.[language] || entry.i18n?.['zh-CN'] || '']
                  .filter(Boolean)
                  .join(': '),
              )
              .join('; '),
            standard
              ? [standard.name, standard.description, standard.unit].filter(Boolean).join(' / ')
              : row.standardId
                ? `${label('missingStandard')}: ${row.standardId}`
                : '',
          ],
        ];
      }),
      indexes: table.indexes.map((item) => [
        item.name,
        item.kind,
        item.fields.map((field) => `${field.name} ${field.direction}`).join(', '),
      ]),
      relationships: (table.foreignKeys ?? []).map((relation) => {
        const targetId = ids.get(
          identity(table, relation.refTable, relation.refSchema || table.schemaName),
        );
        const target = [relation.refSchema || table.schemaName, relation.refTable]
          .filter(Boolean)
          .join('.');

        return {
          targetId,
          values: [
            relation.name,
            relation.fields.join(', '),
            `${target} (${relation.refFields.join(', ')})${targetId ? '' : ` [${label('external')}]`}`,
            relation.logical
              ? `${label('logical')} / ${relation.logical.cardinality} / ${relation.logical.optionality}`
              : label('physical'),
            relation.logical?.description ||
              [
                relation.onDelete ? `ON DELETE ${relation.onDelete}` : '',
                relation.onUpdate ? `ON UPDATE ${relation.onUpdate}` : '',
              ]
                .filter(Boolean)
                .join('; '),
          ],
        };
      }),
    })),
  };
}

export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function escapeMarkdown(text: string): string {
  return escapeHtml(text)
    .replaceAll('\\', '\\\\')
    .replaceAll('|', '\\|')
    .replaceAll(/([`*_[\]#])/g, '\\$1')
    .replaceAll(/\r?\n/g, '<br>');
}

export function markdownTable(headers: string[], rows: string[][]): string {
  return [headers, headers.map(() => '---'), ...rows]
    .map((row) => `| ${row.map(escapeMarkdown).join(' | ')} |`)
    .join('\n');
}

export function dictionaryMarkdown(document: DictionaryDocument): string {
  const { labels } = document;

  return [
    `# ${escapeMarkdown(document.title)}`,
    ...document.tables.map(
      (table) => `- ${escapeMarkdown(table.name)} (${escapeMarkdown(table.database)})`,
    ),
    ...document.tables.map((table) =>
      [
        `## ${escapeMarkdown(table.name)}`,
        escapeMarkdown(table.description),
        `### ${labels.fields}`,
        markdownTable(labels.fieldHeaders, table.fields),
        ...(table.indexes.length
          ? [`### ${labels.indexes}`, markdownTable(labels.indexHeaders, table.indexes)]
          : []),
        ...(table.relationships.length
          ? [
              `### ${labels.relationships}`,
              markdownTable(
                labels.relationshipHeaders,
                table.relationships.map((relation) => relation.values),
              ),
            ]
          : []),
      ].join('\n\n'),
    ),
  ].join('\n\n');
}

function htmlTable(headers: string[], rows: string[][]): string {
  return `<div class="scroll"><table><thead><tr>${headers.map((heading) => `<th scope="col">${escapeHtml(heading)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

export function dictionaryHtml(document: DictionaryDocument): string {
  const { labels } = document;

  const sections = document.tables
    .map(
      (table) =>
        `<section id="${table.id}"><h2>${escapeHtml(table.name)}</h2><p>${escapeHtml(table.database)} · ${table.fields.length}</p><p>${escapeHtml(table.description)}</p><h3>${escapeHtml(labels.fields)}</h3>${htmlTable(labels.fieldHeaders, table.fields)}${table.indexes.length ? `<h3>${escapeHtml(labels.indexes)}</h3>${htmlTable(labels.indexHeaders, table.indexes)}` : ''}${
          table.relationships.length
            ? `<h3>${escapeHtml(labels.relationships)}</h3>${htmlTable(
                labels.relationshipHeaders,
                table.relationships.map((relation) => relation.values),
              )}<ul>${table.relationships.flatMap((relation) => (relation.targetId ? [`<li><a href="#${relation.targetId}">${escapeHtml(relation.values[2])}</a></li>`] : [])).join('')}</ul>`
            : ''
        }</section>`,
    )
    .join('\n');

  return `<!doctype html>
<html lang="${escapeHtml(document.language)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escapeHtml(document.title)}</title>
<style>:root{color-scheme:light dark}*{box-sizing:border-box}body{font:15px/1.65 system-ui,sans-serif;max-width:1200px;margin:auto;padding:24px;color:light-dark(#172033,#e2e8f0);background:light-dark(#fff,#111827)}h1{font-size:28px}h2{font-size:22px}h3{font-size:16px}nav{display:flex;flex-wrap:wrap;gap:12px}a{color:light-dark(#1d4ed8,#93c5fd)}input{font:inherit;width:100%;padding:10px;border:1px solid #94a3b8;border-radius:6px;margin:8px 0 20px}section{border-top:1px solid #94a3b8;margin-top:28px;padding-top:12px;scroll-margin-top:12px}p,td{white-space:pre-wrap;overflow-wrap:anywhere}.scroll{overflow:auto}table{border-collapse:collapse;width:100%;font-size:13px}th,td{text-align:left;vertical-align:top;border:1px solid #94a3b8;padding:8px;min-width:80px}th{background:light-dark(#f1f5f9,#1e293b)}[hidden]{display:none!important}@media print{input,label{display:none}body{max-width:none;padding:0}.scroll{overflow:visible}section{break-inside:avoid}}</style></head>
<body><h1>${escapeHtml(document.title)}</h1><label for="search">${escapeHtml(labels.search)}</label><input id="search" type="search"><nav>${document.tables.map((table) => `<a href="#${table.id}">${escapeHtml(table.name)}</a>`).join('')}</nav><main>${sections}</main>
<script>const search=document.getElementById('search');search.addEventListener('input',()=>{const query=search.value.toLocaleLowerCase();document.querySelectorAll('main section').forEach(section=>{section.hidden=!section.textContent.toLocaleLowerCase().includes(query)})});document.querySelectorAll('a[href^="#"]').forEach(link=>link.addEventListener('click',()=>{search.value='';document.querySelectorAll('main section').forEach(section=>{section.hidden=false})}));</script></body></html>`;
}
