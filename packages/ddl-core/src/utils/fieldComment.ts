import type { NormalizedField } from '@ddlbuilder/shared-types';

export function resolveFieldComment(field: Pick<NormalizedField, 'comment' | 'enumMeta'>): string {
  if (!field.enumMeta?.length) return field.comment;
  const values = field.enumMeta.map((meta) => {
    const labels = [meta.i18n?.['zh-CN'], meta.i18n?.['en-US']].filter((label): label is string =>
      Boolean(label),
    );
    const uniqueLabels = [...new Set(labels)];
    return uniqueLabels.length ? `${meta.value}(${uniqueLabels.join('/')})` : meta.value;
  });
  const enumComment = `枚举: ${values.join(', ')}`;
  return field.comment ? `${field.comment} | ${enumComment}` : enumComment;
}
