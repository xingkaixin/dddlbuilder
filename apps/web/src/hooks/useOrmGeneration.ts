import { copyText } from '@/utils/clipboard';
import { useCallback, useReducer } from 'react';
import { buildORM } from '@ddlbuilder/ddl-core';
import type { ORMModelInput, ORMTarget } from '@ddlbuilder/ddl-core';

export const ORM_TARGET_OPTIONS: { value: ORMTarget; label: string }[] = [
  { value: 'drizzle', label: 'Drizzle (SQLite)' },
  { value: 'prisma', label: 'Prisma' },
  { value: 'typeorm', label: 'TypeORM' },
  { value: 'sqlalchemy', label: 'SQLAlchemy' },
  { value: 'gorm', label: 'GORM' },
  { value: 'jpa', label: 'JPA' },
];

const ormTargetReducer = (
  _target: ORMTarget,
  event: { type: 'targetSelected'; target: ORMTarget },
) => event.target;

export interface UseOrmGenerationReturn {
  getGeneratedOrm: () => string;
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
  const [selectedTarget, dispatch] = useReducer(ormTargetReducer, 'prisma');

  const ormTarget =
    dbType === 'sqlite' ? 'drizzle' : selectedTarget === 'drizzle' ? 'prisma' : selectedTarget;

  // ORM 只在输出面板展示或复制时生成，避免编辑时为不可见的标签页重复计算。
  const getGeneratedOrm = useCallback(
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

  const copyOrm = useCallback(
    () => copyText(getGeneratedOrm() || '-- 请选择 ORM 框架'),
    [getGeneratedOrm],
  );

  const setOrmTarget = useCallback(
    (target: ORMTarget) => dispatch({ type: 'targetSelected', target }),
    [],
  );

  return {
    getGeneratedOrm,
    copyOrm,
    ormTarget,
    setOrmTarget,
  };
}
