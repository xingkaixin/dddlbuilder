import { queryOptions } from '@tanstack/react-query';
import { getTemplate, listTemplates } from '@/utils/fieldTemplates';
import { getTableTemplate, listTableTemplates } from '@/utils/tableTemplates';

export const templateQueryKeys = {
  fieldRoot: ['templates', 'field'] as const,
  fieldList: ['templates', 'field', 'list'] as const,
  field: (id: string) => ['templates', 'field', id] as const,
  tableRoot: ['templates', 'table'] as const,
  tableList: ['templates', 'table', 'list'] as const,
  table: (id: string) => ['templates', 'table', id] as const,
};

export function fieldTemplateListOptions() {
  return queryOptions({
    queryKey: templateQueryKeys.fieldList,
    queryFn: listTemplates,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function fieldTemplateOptions(id: string) {
  return queryOptions({
    queryKey: templateQueryKeys.field(id),
    queryFn: async () => (await getTemplate(id)) ?? null,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function tableTemplateListOptions() {
  return queryOptions({
    queryKey: templateQueryKeys.tableList,
    queryFn: listTableTemplates,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function tableTemplateOptions(id: string) {
  return queryOptions({
    queryKey: templateQueryKeys.table(id),
    queryFn: async () => (await getTableTemplate(id)) ?? null,
    staleTime: Number.POSITIVE_INFINITY,
  });
}
