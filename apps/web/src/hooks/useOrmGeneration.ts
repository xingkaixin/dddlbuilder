import { useMemo, useCallback, useState } from 'react';
import { buildORM } from '@ddlbuilder/ddl-core';
import type { ORMModelInput, ORMTarget } from '@ddlbuilder/ddl-core';

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

export function useOrmGeneration({
  dbType,
  schemaName,
  tableName,
  tableComment,
  fields,
  indexes,
  foreignKeys,
  referencedModels,
}: ORMModelInput): UseOrmGenerationReturn {
  const [ormTarget, setOrmTarget] = useState<ORMTarget>('prisma');

  const generatedOrm = useMemo(
    () =>
      buildORM(ormTarget, {
        dbType,
        schemaName,
        tableName,
        tableComment,
        fields,
        indexes,
        foreignKeys,
        referencedModels,
      }),
    [
      ormTarget,
      dbType,
      schemaName,
      tableName,
      tableComment,
      fields,
      indexes,
      foreignKeys,
      referencedModels,
    ],
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
