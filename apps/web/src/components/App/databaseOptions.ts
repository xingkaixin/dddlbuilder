import type React from 'react';
import { DATABASE_TYPES, type DatabaseType } from '@ddlbuilder/shared-types';
import { Database, GitBranch, HardDrive, Layers, Share2 } from '@/components/icons';

type DatabaseOptionMetadata = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const DATABASE_OPTION_METADATA = {
  mysql: { label: 'MySQL', icon: Database },
  postgresql: { label: 'PostgreSQL', icon: HardDrive },
  'postgresql-citus': { label: 'PostgreSQL (Citus)', icon: HardDrive },
  sqlserver: { label: 'SQL Server', icon: GitBranch },
  oracle: { label: 'Oracle', icon: Layers },
  mariadb: { label: 'MariaDB', icon: Share2 },
  tidb: { label: 'TiDB', icon: Database },
  dm: { label: 'Dameng', icon: Database },
  oceanbase: { label: 'OceanBase (MySQL)', icon: Database },
  'oceanbase-oracle': { label: 'OceanBase (Oracle)', icon: Layers },
  kingbase: { label: 'Kingbase', icon: HardDrive },
  gbase: { label: 'GBase', icon: Database },
  polardb: { label: 'PolarDB', icon: Database },
  gaussdb: { label: 'GaussDB', icon: HardDrive },
  hive: { label: 'Hive', icon: Database },
} satisfies Record<DatabaseType, DatabaseOptionMetadata>;

export const DATABASE_OPTIONS = DATABASE_TYPES.map((value) => ({
  value,
  ...DATABASE_OPTION_METADATA[value],
}));
