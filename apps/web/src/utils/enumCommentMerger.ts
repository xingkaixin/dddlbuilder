import type { EnumValueMeta } from '@ddlbuilder/shared-types';

function formatEnumMeta(meta: EnumValueMeta[]): string {
  return meta
    .map((m) => {
      const labels: string[] = [];
      if (m.i18n?.['zh-CN']) labels.push(m.i18n['zh-CN']);
      if (m.i18n?.['en-US'] && m.i18n['en-US'] !== m.i18n?.['zh-CN']) {
        labels.push(m.i18n['en-US']);
      }
      if (labels.length === 0) return m.value;
      return `${m.value}(${labels.join('/')})`;
    })
    .join(', ');
}

export function mergeEnumMetaIntoComment<T extends { comment: string; enumMeta?: EnumValueMeta[] }>(
  fields: T[],
): T[] {
  return fields.map((field) => {
    if (!field.enumMeta || field.enumMeta.length === 0) return field;
    const enumPart = `枚举: ${formatEnumMeta(field.enumMeta)}`;
    const newComment = field.comment ? `${field.comment} | ${enumPart}` : enumPart;
    return {
      ...field,
      comment: newComment.replace(/'/g, "''"),
    };
  });
}
