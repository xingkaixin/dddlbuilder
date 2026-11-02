import { copyText } from '@/utils/clipboard';
import { useCallback, useReducer } from 'react';
import { useTranslation } from 'react-i18next';
import { buildORM } from '@ddlbuilder/ddl-core';
import type { ORMModelInput, ORMTarget } from '@ddlbuilder/ddl-core';
import { localizeDdlNotices } from '@/utils/ddlNotices';

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
  const { t } = useTranslation();
  const [selectedTarget, dispatch] = useReducer(ormTargetReducer, 'prisma');

  const ormTarget =
    dbType === 'sqlite' ? 'drizzle' : selectedTarget === 'drizzle' ? 'prisma' : selectedTarget;

  // ORM 只在输出面板展示或复制时生成，避免编辑时为不可见的标签页重复计算。
  const getGeneratedOrm = useCallback(
    () =>
      localizeDdlNotices(
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
        t,
      ),
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
      t,
    ],
  );

  const copyOrm = useCallback(
    () => copyText(getGeneratedOrm() || t('ddlOutput.emptyOrm')),
    [getGeneratedOrm, t],
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
