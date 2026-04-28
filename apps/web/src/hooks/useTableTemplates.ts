import { useCallback, useEffect, useState } from 'react';
import {
  createTableTemplate,
  deleteTableTemplate,
  duplicateTableTemplate,
  getTableTemplate,
  listTableTemplates,
  renameTableTemplate,
  updateTableTemplate,
  type TableBlueprint,
  type TableTemplate,
} from '@/utils/tableTemplates';

export type { TableBlueprint, TableTemplate };

type OperationResult = { ok: true } | { ok: false; reason?: string; message?: string };

export function useTableTemplates() {
  const [templates, setTemplates] = useState<TableTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTemplates(await listTableTemplates());
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载蓝本失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const fetchTemplate = useCallback(async (id: string): Promise<TableTemplate | null> => {
    try {
      return (await getTableTemplate(id)) ?? null;
    } catch {
      return null;
    }
  }, []);

  const create = useCallback(
    async (
      name: string,
      blueprint: TableBlueprint,
      description?: string,
    ): Promise<OperationResult & { template?: TableTemplate }> => {
      try {
        const template = await createTableTemplate(name, blueprint, description);
        await refresh();
        return { ok: true, template };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : '创建失败',
        };
      }
    },
    [refresh],
  );

  const update = useCallback(
    async (
      id: string,
      updates: Partial<Pick<TableTemplate, 'name' | 'description' | 'blueprint'>>,
    ): Promise<OperationResult> => {
      try {
        const result = await updateTableTemplate(id, updates);
        if (!result) {
          return { ok: false, reason: 'not_found', message: '蓝本不存在' };
        }
        await refresh();
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : '更新失败',
        };
      }
    },
    [refresh],
  );

  const rename = useCallback(
    async (id: string, newName: string): Promise<OperationResult> => {
      try {
        const result = await renameTableTemplate(id, newName);
        if (!result) {
          return { ok: false, reason: 'not_found', message: '蓝本不存在' };
        }
        await refresh();
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : '重命名失败',
        };
      }
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string): Promise<OperationResult> => {
      try {
        await deleteTableTemplate(id);
        await refresh();
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : '删除失败',
        };
      }
    },
    [refresh],
  );

  const duplicate = useCallback(
    async (
      id: string,
      newName?: string,
    ): Promise<OperationResult & { template?: TableTemplate }> => {
      try {
        const template = await duplicateTableTemplate(id, newName);
        if (!template) {
          return { ok: false, reason: 'not_found', message: '蓝本不存在' };
        }
        await refresh();
        return { ok: true, template };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : '复制失败',
        };
      }
    },
    [refresh],
  );

  return {
    templates,
    loading,
    error,
    refresh,
    fetchTemplate,
    create,
    update,
    rename,
    remove,
    duplicate,
  };
}
