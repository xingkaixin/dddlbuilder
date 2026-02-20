/**
 * 字段模板管理 Hook
 * 提供模板的状态管理和操作方法
 */

import { useState, useCallback, useEffect } from 'react';
import {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  renameTemplate,
  deleteTemplate,
  duplicateTemplate,
  createTemplateFromFields,
  type FieldTemplate,
  type TemplateField,
} from '@/utils/fieldTemplates';

export type { FieldTemplate, TemplateField };

type OperationResult =
  | { ok: true }
  | { ok: false; reason?: string; message?: string };

export function useFieldTemplates() {
  const [templates, setTemplates] = useState<FieldTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 刷新模板列表
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listTemplates();
      setTemplates(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载模板失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // 初始加载
  useEffect(() => {
    refresh();
  }, [refresh]);

  // 获取单个模板
  const fetchTemplate = useCallback(
    async (id: string): Promise<FieldTemplate | null> => {
      try {
        const template = await getTemplate(id);
        return template ?? null;
      } catch {
        return null;
      }
    },
    [],
  );

  // 创建模板
  const create = useCallback(
    async (
      name: string,
      fields: TemplateField[],
      description?: string,
    ): Promise<OperationResult & { template?: FieldTemplate }> => {
      try {
        const template = await createTemplate(name, fields, description);
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

  // 从当前字段创建模板
  const createFromFields = useCallback(
    async (
      name: string,
      fields: Array<{
        fieldName?: string;
        fieldType?: string;
        fieldComment?: string;
        nullable?: string;
        defaultKind?: string;
        defaultValue?: string;
        onUpdate?: string;
      }>,
      description?: string,
    ): Promise<OperationResult & { template?: FieldTemplate }> => {
      try {
        const template = await createTemplateFromFields(
          name,
          fields,
          description,
        );
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

  // 更新模板
  const update = useCallback(
    async (
      id: string,
      updates: Partial<
        Pick<FieldTemplate, 'name' | 'description' | 'keywords' | 'fields'>
      >,
    ): Promise<OperationResult> => {
      try {
        const result = await updateTemplate(id, updates);
        if (!result) {
          return { ok: false, reason: 'not_found', message: '模板不存在' };
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

  // 重命名模板
  const rename = useCallback(
    async (id: string, newName: string): Promise<OperationResult> => {
      try {
        const result = await renameTemplate(id, newName);
        if (!result) {
          return { ok: false, reason: 'not_found', message: '模板不存在' };
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

  // 删除模板
  const remove = useCallback(
    async (id: string): Promise<OperationResult> => {
      try {
        await deleteTemplate(id);
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

  // 复制模板
  const duplicate = useCallback(
    async (
      id: string,
      newName?: string,
    ): Promise<OperationResult & { template?: FieldTemplate }> => {
      try {
        const template = await duplicateTemplate(id, newName);
        if (!template) {
          return { ok: false, reason: 'not_found', message: '模板不存在' };
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
    createFromFields,
    update,
    rename,
    remove,
    duplicate,
  };
}
