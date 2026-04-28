import { useMemo, useCallback, useState } from 'react';
import type {
  NormalizedField,
  IndexDefinition,
  ForeignKeyDefinition,
} from '@ddlbuilder/shared-types';
import { buildORM } from '@ddlbuilder/ddl-core';
import type { ORMTarget } from '@ddlbuilder/ddl-core';

export const ORM_TARGET_OPTIONS: { value: ORMTarget; label: string }[] = [
  { value: 'prisma', label: 'Prisma' },
  { value: 'typeorm', label: 'TypeORM' },
  { value: 'sqlalchemy', label: 'SQLAlchemy' },
  { value: 'gorm', label: 'GORM' },
  { value: 'jpa', label: 'JPA' },
];

export interface UseOrmGenerationReturn {
  generatedOrm: string;
  copyOrm: () => Promise<boolean>;
  ormTarget: ORMTarget;
  setOrmTarget: (target: ORMTarget) => void;
}

export function useOrmGeneration(
  tableName: string,
  tableComment: string,
  normalizedFields: NormalizedField[],
  indexes: IndexDefinition[],
  foreignKeys: ForeignKeyDefinition[],
): UseOrmGenerationReturn {
  const [ormTarget, setOrmTarget] = useState<ORMTarget>('prisma');

  const generatedOrm = useMemo(
    () => buildORM(ormTarget, tableName, tableComment, normalizedFields, indexes, foreignKeys),
    [ormTarget, tableName, tableComment, normalizedFields, indexes, foreignKeys],
  );

  const copyOrm = useCallback(async () => {
    const text = generatedOrm || '-- 请选择 ORM 框架';
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        return true;
      } catch {
        return false;
      }
    }
  }, [generatedOrm]);

  return {
    generatedOrm,
    copyOrm,
    ormTarget,
    setOrmTarget,
  };
}
