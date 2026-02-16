import type React from 'react';
import { Database, GitBranch, HardDrive, Layers, Share2 } from 'lucide-react';
import type { DatabaseType } from '../../types';

export const DATABASE_OPTIONS: Array<{
  value: DatabaseType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { value: 'mysql', label: 'MySQL', icon: Database },
  { value: 'postgresql', label: 'PostgreSQL', icon: HardDrive },
  {
    value: 'postgresql-citus',
    label: 'PostgreSQL (Citus)',
    icon: HardDrive,
  },
  { value: 'sqlserver', label: 'SQL Server', icon: GitBranch },
  { value: 'oracle', label: 'Oracle', icon: Layers },
  { value: 'mariadb', label: 'MariaDB', icon: Share2 },
  { value: 'tidb', label: 'TiDB', icon: Database },
  { value: 'dm', label: 'Dameng', icon: Database },
  { value: 'oceanbase', label: 'OceanBase (MySQL)', icon: Database },
  { value: 'oceanbase-oracle', label: 'OceanBase (Oracle)', icon: Layers },
  { value: 'kingbase', label: 'Kingbase', icon: HardDrive },
  { value: 'gbase', label: 'GBase', icon: Database },
  { value: 'polardb', label: 'PolarDB', icon: Database },
  { value: 'gaussdb', label: 'GaussDB', icon: HardDrive },
];
