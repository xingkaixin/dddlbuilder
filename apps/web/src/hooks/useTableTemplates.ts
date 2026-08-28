import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createTableTemplate,
  deleteTableTemplate,
  duplicateTableTemplate,
  updateTableTemplate,
  type TableBlueprint,
  type TableTemplate,
} from '@/utils/tableTemplates';
import {
  tableTemplateListOptions,
  tableTemplateOptions,
  templateQueryKeys,
} from '@/queries/templates';

export type { TableBlueprint, TableTemplate };

type OperationResult = { ok: true } | { ok: false; reason?: string; message?: string };

const failure = (error: unknown, fallback: string): OperationResult => ({
  ok: false,
  message: error instanceof Error ? error.message : fallback,
});

export function useTableTemplates() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const templatesQuery = useQuery(tableTemplateListOptions());
  const invalidateTemplates = useCallback(
    () => queryClient.invalidateQueries({ queryKey: templateQueryKeys.tableRoot }),
    [queryClient],
  );
  const createMutation = useMutation({
    mutationFn: ({
      name,
      blueprint,
      description,
    }: {
      name: string;
      blueprint: TableBlueprint;
      description?: string;
    }) => createTableTemplate(name, blueprint, description),
    onSuccess: invalidateTemplates,
    retry: false,
  });
  const updateMutation = useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Pick<TableTemplate, 'name' | 'description' | 'blueprint'>>;
    }) => updateTableTemplate(id, updates),
    onSuccess: invalidateTemplates,
    retry: false,
  });
  const removeMutation = useMutation({
    mutationFn: deleteTableTemplate,
    onSuccess: invalidateTemplates,
    retry: false,
  });
  const duplicateMutation = useMutation({
    mutationFn: ({ id, newName }: { id: string; newName?: string }) =>
      duplicateTableTemplate(id, newName),
    onSuccess: invalidateTemplates,
    retry: false,
  });

  const fetchTemplate = useCallback(
    async (id: string): Promise<TableTemplate | null> => {
      try {
        return (await queryClient.fetchQuery(tableTemplateOptions(id))) ?? null;
      } catch {
        return null;
      }
    },
    [queryClient],
  );

  const create = useCallback(
    async (
      name: string,
      blueprint: TableBlueprint,
      description?: string,
    ): Promise<OperationResult & { template?: TableTemplate }> => {
      try {
        const template = await createMutation.mutateAsync({ name, blueprint, description });
        return { ok: true, template };
      } catch (error) {
        return failure(error, t('tableTemplate.toast.createFailed'));
      }
    },
    [createMutation, t],
  );

  const update = useCallback(
    async (
      id: string,
      updates: Partial<Pick<TableTemplate, 'name' | 'description' | 'blueprint'>>,
    ): Promise<OperationResult> => {
      try {
        const template = await updateMutation.mutateAsync({ id, updates });
        return template ? { ok: true } : { ok: false, reason: 'not_found', message: t('tableTemplate.toast.notFound') };
      } catch (error) {
        return failure(error, t('tableTemplate.toast.updateFailed'));
      }
    },
    [updateMutation, t],
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
        return failure(error, t('tableTemplate.toast.deleteFailed'));
      }
    },
    [removeMutation, t],
  );

  const duplicate = useCallback(
    async (
      id: string,
      newName?: string,
    ): Promise<OperationResult & { template?: TableTemplate }> => {
      try {
        const template = await duplicateMutation.mutateAsync({ id, newName });
        return template
          ? { ok: true, template }
          : { ok: false, reason: 'not_found', message: t('tableTemplate.toast.notFound') };
      } catch (error) {
        return failure(error, t('tableTemplate.toast.duplicateFailed'));
      }
    },
    [duplicateMutation, t],
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
    update,
    rename,
    remove,
    duplicate,
  };
}
