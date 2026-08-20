import type { PersistedState } from '@ddlbuilder/shared-types';
import { normalizeFieldEnums } from './helpers';
import {
  openDb,
  TABLE_TEMPLATE_STORE_NAME,
  type TableBlueprint,
  type TableTemplate,
} from './savedTablesDb';

export type { TableBlueprint, TableTemplate };

const decodeTableTemplate = (template: TableTemplate): TableTemplate => ({
  ...template,
  blueprint: {
    ...template.blueprint,
    rows: Array.isArray(template.blueprint?.rows)
      ? template.blueprint.rows.map(normalizeFieldEnums)
      : [],
  },
});

const generateId = (): string => `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const runWithTableTemplateStore = async <T>(
  mode: IDBTransactionMode,
  runner: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish =
      (fn: (value: T) => void) =>
      (value: T): void => {
        if (settled) return;
        settled = true;
        db.close();
        fn(value);
      };

    try {
      const tx = db.transaction(TABLE_TEMPLATE_STORE_NAME, mode);
      const store = tx.objectStore(TABLE_TEMPLATE_STORE_NAME);
      const request = runner(store);
      request.onsuccess = () => finish(resolve)(request.result);
      request.onerror = () => finish(reject)(request.error as unknown as T);
      tx.onerror = () => finish(reject)(tx.error as unknown as T);
    } catch (err) {
      if (!settled) {
        settled = true;
        db.close();
        reject(err);
      }
    }
  });
};

export const createBlueprintFromState = (state: PersistedState): TableBlueprint => ({
  dbType: state.dbType,
  rows: clone(state.rows.filter((row) => row.fieldName.trim())),
  indexes: clone(state.indexes),
  citusShardingConfig:
    state.dbType === 'postgresql-citus' && state.citusShardingConfig
      ? clone(state.citusShardingConfig)
      : undefined,
  mysqlPartitionConfig: state.mysqlPartitionConfig ? clone(state.mysqlPartitionConfig) : undefined,
  tableMiscConfig: state.tableMiscConfig ? clone(state.tableMiscConfig) : undefined,
});

export const applyBlueprintToState = (
  state: PersistedState,
  blueprint: TableBlueprint,
): PersistedState => ({
  ...state,
  dbType: blueprint.dbType,
  rows: clone(blueprint.rows).map((row, index) => ({
    ...row,
    order: index + 1,
  })),
  indexes: clone(blueprint.indexes),
  currentIndexFields: [],
  indexInput: '',
  citusShardingConfig:
    blueprint.dbType === 'postgresql-citus' && blueprint.citusShardingConfig
      ? clone(blueprint.citusShardingConfig)
      : undefined,
  mysqlPartitionConfig: blueprint.mysqlPartitionConfig
    ? clone(blueprint.mysqlPartitionConfig)
    : undefined,
  tableMiscConfig: blueprint.tableMiscConfig ? clone(blueprint.tableMiscConfig) : undefined,
});

export const listTableTemplates = async (): Promise<TableTemplate[]> => {
  const templates = await runWithTableTemplateStore<TableTemplate[]>('readonly', (store) =>
    store.getAll(),
  );
  return templates.map(decodeTableTemplate).sort((a, b) => b.updatedAt - a.updatedAt);
};

export const getTableTemplate = async (id: string): Promise<TableTemplate | undefined> => {
  const template = await runWithTableTemplateStore<TableTemplate | undefined>('readonly', (store) =>
    store.get(id),
  );
  return template ? decodeTableTemplate(template) : undefined;
};

export const createTableTemplate = async (
  name: string,
  blueprint: TableBlueprint,
  description?: string,
): Promise<TableTemplate> => {
  const now = Date.now();
  const template: TableTemplate = {
    id: generateId(),
    name: name.trim() || '未命名蓝本',
    description: description?.trim(),
    blueprint: clone(blueprint),
    createdAt: now,
    updatedAt: now,
  };

  await runWithTableTemplateStore('readwrite', (store) => store.add(template));
  return template;
};

export const updateTableTemplate = async (
  id: string,
  updates: Partial<Pick<TableTemplate, 'name' | 'description' | 'blueprint'>>,
): Promise<TableTemplate | null> => {
  const existing = await getTableTemplate(id);
  if (!existing) return null;

  const updated: TableTemplate = {
    ...existing,
    ...(updates.name !== undefined && { name: updates.name.trim() || '未命名蓝本' }),
    ...(updates.description !== undefined && { description: updates.description?.trim() }),
    ...(updates.blueprint !== undefined && { blueprint: clone(updates.blueprint) }),
    updatedAt: Date.now(),
  };

  await runWithTableTemplateStore('readwrite', (store) => store.put(updated));
  return updated;
};

export const renameTableTemplate = (id: string, newName: string) =>
  updateTableTemplate(id, { name: newName });

export const deleteTableTemplate = async (id: string): Promise<void> => {
  await runWithTableTemplateStore('readwrite', (store) => store.delete(id));
};

export const duplicateTableTemplate = async (
  id: string,
  newName?: string,
): Promise<TableTemplate | null> => {
  const existing = await getTableTemplate(id);
  if (!existing) return null;

  return createTableTemplate(
    newName?.trim() || `${existing.name} (副本)`,
    existing.blueprint,
    existing.description,
  );
};
