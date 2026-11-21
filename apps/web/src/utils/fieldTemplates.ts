import {
  createEntityId,
  type FieldRow,
  normalizeFieldEnums,
  normalizeFieldNullable,
} from '@ddlbuilder/shared-types';
import { openDb, TEMPLATE_STORE_NAME } from './workspaceDb';
import type { FieldTemplate, TemplateField } from './workspaceStorageTypes';
import { runIndexedDbRequest } from './indexedDbTransaction';

export type { FieldTemplate, TemplateField };

export const toTemplateFields = (rows: Array<Partial<FieldRow>>): TemplateField[] => {
  const fields: TemplateField[] = [];

  for (const { id: _id, ...field } of rows) {
    if (!field.fieldName?.trim()) continue;
    fields.push({
      ...structuredClone(field),
      fieldName: field.fieldName.trim(),
      fieldType: field.fieldType?.trim() || '',
      fieldComment: field.fieldComment?.trim(),
      nullable: normalizeFieldNullable(field.nullable),
    });
  }

  return fields;
};

export const instantiateTemplateFields = (fields: TemplateField[]): FieldRow[] =>
  fields.map((field) => ({
    ...structuredClone(field),
    id: createEntityId(),
    fieldComment: field.fieldComment ?? '',
    defaultKind: field.defaultKind ?? 'none',
    defaultValue: field.defaultValue ?? '',
    onUpdate: field.onUpdate ?? 'none',
  }));

const decodeTemplate = (template: FieldTemplate): FieldTemplate => ({
  ...template,
  fields: Array.isArray(template.fields) ? template.fields.map(normalizeFieldEnums) : [],
});

const generateId = (): string => {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
};

const runWithTemplateStore = async <T>(
  mode: IDBTransactionMode,
  runner: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
  const db = await openDb();

  return runIndexedDbRequest(db, TEMPLATE_STORE_NAME, mode, runner);
};

export const listTemplates = async (): Promise<FieldTemplate[]> => {
  const templates = await runWithTemplateStore<FieldTemplate[]>('readonly', (store) =>
    store.getAll(),
  );

  return templates.map(decodeTemplate).sort((a, b) => b.updatedAt - a.updatedAt);
};

export const getTemplate = async (id: string): Promise<FieldTemplate | undefined> => {
  const template = await runWithTemplateStore<FieldTemplate | undefined>('readonly', (store) =>
    store.get(id),
  );

  return template ? decodeTemplate(template) : undefined;
};

export const createTemplate = async (
  name: string,
  fields: TemplateField[],
  description?: string,
): Promise<FieldTemplate> => {
  const now = Date.now();

  const template: FieldTemplate = {
    id: generateId(),
    name: name.trim() || '未命名模板',
    description: description?.trim(),
    fields,
    createdAt: now,
    updatedAt: now,
  };

  await runWithTemplateStore('readwrite', (store) => store.add(template));

  return template;
};

export const updateTemplate = async (
  id: string,
  updates: Partial<Pick<FieldTemplate, 'name' | 'description' | 'keywords' | 'fields'>>,
): Promise<FieldTemplate | null> => {
  const existing = await getTemplate(id);

  if (!existing) return null;

  const updated: FieldTemplate = {
    ...existing,
    ...(updates.name !== undefined && {
      name: updates.name.trim() || '未命名模板',
    }),
    ...(updates.description !== undefined && {
      description: updates.description?.trim(),
    }),
    ...(updates.keywords !== undefined && { keywords: updates.keywords }),
    ...(updates.fields !== undefined && { fields: updates.fields }),
    updatedAt: Date.now(),
  };

  await runWithTemplateStore('readwrite', (store) => store.put(updated));

  return updated;
};

export const deleteTemplate = async (id: string): Promise<void> => {
  await runWithTemplateStore('readwrite', (store) => store.delete(id));
};

export const createTemplateFromFields = async (
  name: string,
  fields: Array<Partial<FieldRow>>,
  description?: string,
): Promise<FieldTemplate> => {
  return createTemplate(name, toTemplateFields(fields), description);
};

export const duplicateTemplate = async (
  id: string,
  newName?: string,
): Promise<FieldTemplate | null> => {
  const existing = await getTemplate(id);

  if (!existing) return null;

  const name = newName?.trim() || `${existing.name} (副本)`;

  return createTemplate(name, [...existing.fields], existing.description);
};
