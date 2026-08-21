import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FieldRow } from '@ddlbuilder/shared-types';
import {
  createTemplate,
  createTemplateFromFields,
  deleteTemplate,
  duplicateTemplate,
  updateTemplate,
  type FieldTemplate,
  type TemplateField,
} from '@/utils/fieldTemplates';
import {
  fieldTemplateListOptions,
  fieldTemplateOptions,
  templateQueryKeys,
} from '@/queries/templates';

export type { FieldTemplate, TemplateField };

type OperationResult = { ok: true } | { ok: false; reason?: string; message?: string };

const failure = (error: unknown, fallback: string): OperationResult => ({
  ok: false,
  message: error instanceof Error ? error.message : fallback,
});

export function useFieldTemplates() {
  const queryClient = useQueryClient();
  const templatesQuery = useQuery(fieldTemplateListOptions());
  const invalidateTemplates = useCallback(
    () => queryClient.invalidateQueries({ queryKey: templateQueryKeys.fieldRoot }),
    [queryClient],
  );
  const createMutation = useMutation({
    mutationFn: ({
      name,
      fields,
      description,
    }: {
      name: string;
      fields: TemplateField[];
      description?: string;
    }) => createTemplate(name, fields, description),
    onSuccess: invalidateTemplates,
    retry: false,
  });
  const createFromFieldsMutation = useMutation({
    mutationFn: ({
      name,
      fields,
      description,
    }: {
      name: string;
      fields: Array<Partial<FieldRow>>;
      description?: string;
    }) => createTemplateFromFields(name, fields, description),
    onSuccess: invalidateTemplates,
    retry: false,
  });
  const updateMutation = useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Pick<FieldTemplate, 'name' | 'description' | 'keywords' | 'fields'>>;
    }) => updateTemplate(id, updates),
    onSuccess: invalidateTemplates,
    retry: false,
  });
  const removeMutation = useMutation({
    mutationFn: deleteTemplate,
    onSuccess: invalidateTemplates,
    retry: false,
  });
  const duplicateMutation = useMutation({
    mutationFn: ({ id, newName }: { id: string; newName?: string }) =>
      duplicateTemplate(id, newName),
    onSuccess: invalidateTemplates,
    retry: false,
  });

  const fetchTemplate = useCallback(
    async (id: string): Promise<FieldTemplate | null> => {
      try {
        return (await queryClient.fetchQuery(fieldTemplateOptions(id))) ?? null;
      } catch {
        return null;
      }
    },
    [queryClient],
  );

  const create = useCallback(
    async (
      name: string,
      fields: TemplateField[],
      description?: string,
    ): Promise<OperationResult & { template?: FieldTemplate }> => {
      try {
        const template = await createMutation.mutateAsync({ name, fields, description });
        return { ok: true, template };
      } catch (error) {
        return failure(error, '创建失败');
      }
    },
    [createMutation],
  );

  const createFromFields = useCallback(
    async (
      name: string,
      fields: Array<Partial<FieldRow>>,
      description?: string,
    ): Promise<OperationResult & { template?: FieldTemplate }> => {
      try {
        const template = await createFromFieldsMutation.mutateAsync({
          name,
          fields,
          description,
        });
        return { ok: true, template };
      } catch (error) {
        return failure(error, '创建失败');
      }
    },
    [createFromFieldsMutation],
  );

  const update = useCallback(
    async (
      id: string,
      updates: Partial<Pick<FieldTemplate, 'name' | 'description' | 'keywords' | 'fields'>>,
    ): Promise<OperationResult> => {
      try {
        const template = await updateMutation.mutateAsync({ id, updates });
        return template ? { ok: true } : { ok: false, reason: 'not_found', message: '模板不存在' };
      } catch (error) {
        return failure(error, '更新失败');
      }
    },
    [updateMutation],
  );

  const rename = useCallback(
    (id: string, newName: string) => update(id, { name: newName }),
    [update],
  );

  const remove = useCallback(
    async (id: string): Promise<OperationResult> => {
      try {
        await removeMutation.mutateAsync(id);
        return { ok: true };
      } catch (error) {
        return failure(error, '删除失败');
      }
    },
    [removeMutation],
  );

  const duplicate = useCallback(
    async (
      id: string,
      newName?: string,
    ): Promise<OperationResult & { template?: FieldTemplate }> => {
      try {
        const template = await duplicateMutation.mutateAsync({ id, newName });
        return template
          ? { ok: true, template }
          : { ok: false, reason: 'not_found', message: '模板不存在' };
      } catch (error) {
        return failure(error, '复制失败');
      }
    },
    [duplicateMutation],
  );

  return {
    templates: templatesQuery.data ?? [],
    loading: templatesQuery.isPending,
    error: templatesQuery.error instanceof Error ? templatesQuery.error.message : null,
    refresh: async () => {
      await templatesQuery.refetch();
    },
    fetchTemplate,
    create,
    createFromFields,
    update,
    rename,
    remove,
    duplicate,
  };
}
