/**
 * 字段模板工具函数
 * 提供模板的 CRUD 操作
 */

import {
  type FieldRow,
  normalizeFieldEnums,
  normalizeFieldNullable,
} from '@ddlbuilder/shared-types';
import {
  openDb,
  TEMPLATE_STORE_NAME,
  type FieldTemplate,
  type TemplateField,
} from './savedTablesDb';
import { runIndexedDbRequest } from './indexedDbTransaction';

export type { FieldTemplate, TemplateField };

const decodeTemplate = (template: FieldTemplate): FieldTemplate => ({
  ...template,
  fields: Array.isArray(template.fields) ? template.fields.map(normalizeFieldEnums) : [],
});

// 生成唯一 ID
const generateId = (): string => {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
};

// 通用运行器
const runWithTemplateStore = async <T>(
  mode: IDBTransactionMode,
  runner: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
  const db = await openDb();
  return runIndexedDbRequest(db, TEMPLATE_STORE_NAME, mode, runner);
};

/**
 * 获取所有模板列表
 */
export const listTemplates = async (): Promise<FieldTemplate[]> => {
  const templates = await runWithTemplateStore<FieldTemplate[]>('readonly', (store) =>
    store.getAll(),
  );
  // 按更新时间降序排列
  return templates.map(decodeTemplate).sort((a, b) => b.updatedAt - a.updatedAt);
};

/**
 * 获取单个模板
 */
export const getTemplate = async (id: string): Promise<FieldTemplate | undefined> => {
  const template = await runWithTemplateStore<FieldTemplate | undefined>('readonly', (store) =>
    store.get(id),
  );
  return template ? decodeTemplate(template) : undefined;
};

/**
 * 创建新模板
 */
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

/**
 * 更新模板
 */
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

/**
 * 重命名模板
 */
export const renameTemplate = async (
  id: string,
  newName: string,
): Promise<FieldTemplate | null> => {
  return updateTemplate(id, { name: newName });
};

/**
 * 删除模板
 */
export const deleteTemplate = async (id: string): Promise<void> => {
  await runWithTemplateStore('readwrite', (store) => store.delete(id));
};

/**
 * 从当前表字段创建模板
 * @param name 模板名称
 * @param fields 字段行数组（从 DataTable 选中的行）
 * @param description 可选描述
 */
export const createTemplateFromFields = async (
  name: string,
  fields: Array<Partial<FieldRow>>,
  description?: string,
): Promise<FieldTemplate> => {
  // 过滤掉空行并转换格式
  const templateFields: TemplateField[] = fields
    .filter((f) => f.fieldName?.trim())
    .map((f) => ({
      fieldName: f.fieldName?.trim() || '',
      fieldType: f.fieldType?.trim() || '',
      fieldComment: f.fieldComment?.trim(),
      nullable: normalizeFieldNullable(f.nullable),
      defaultKind: f.defaultKind,
      defaultValue: f.defaultValue,
      onUpdate: f.onUpdate,
    }));

  return createTemplate(name, templateFields, description);
};

/**
 * 复制模板
 */
export const duplicateTemplate = async (
  id: string,
  newName?: string,
): Promise<FieldTemplate | null> => {
  const existing = await getTemplate(id);
  if (!existing) return null;

  const name = newName?.trim() || `${existing.name} (副本)`;
  return createTemplate(name, [...existing.fields], existing.description);
};
