import { DDL_NOTICES } from '@ddlbuilder/ddl-core';
import type { TFunction } from 'i18next';

const NOTICE_KEYS = new Map<string, string>(
  Object.entries(DDL_NOTICES).map(([key, line]) => [line, key]),
);

export function localizeDdlNotices(code: string, t: TFunction) {
  return code
    .split('\n')
    .map((line) => {
      const notice = line.trim();
      const key = NOTICE_KEYS.get(notice);

      return key ? line.replace(notice, t(`ddlOutput.notices.${key}`)) : line;
    })
    .join('\n');
}
