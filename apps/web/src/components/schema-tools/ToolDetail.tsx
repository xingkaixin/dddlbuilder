import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { PublishPanel } from '@/components/publications/PublishPanel';
import { BusinessDataImportTool } from '@/components/data-import/BusinessDataImportTool';
import { FieldImpactTool } from './FieldImpactTool';
import { SqliteExportTool } from './SqliteExportTool';
import { BusinessModuleTool } from './BusinessModuleTool';
import { QueryDesignerTool } from './QueryDesignerTool';
import { MigrationAssessmentTool } from './MigrationAssessmentTool';
import { SnapshotRefreshTool } from './SnapshotRefreshTool';
import { DictionaryTool } from './DictionaryTool';
import { SchemaCompareTool } from './SchemaCompareTool';
import { RelationalSeedTool } from './RelationalSeedTool';
import type { PageToolId } from './toolCatalog';
import { ToolLayout } from './ToolLayout';
import './schema-tools.css';

function PublicationsTool() {
  const { t } = useTranslation();

  return (
    <ToolLayout title={t('publication.manage')} description={t('publication.hint')}>
      <PublishPanel content={null} title="" />
    </ToolLayout>
  );
}

const TOOL_COMPONENTS = {
  dictionary: DictionaryTool,
  publications: PublicationsTool,
  sqlite: SqliteExportTool,
  query: QueryDesignerTool,
  modules: BusinessModuleTool,
  impact: FieldImpactTool,
  compare: SchemaCompareTool,
  assessment: MigrationAssessmentTool,
  seed: RelationalSeedTool,
  'data-import': BusinessDataImportTool,
  refresh: SnapshotRefreshTool,
} as const satisfies Record<PageToolId, ComponentType>;

export default function ToolDetail({ toolId }: { toolId: PageToolId }) {
  const Tool = TOOL_COMPONENTS[toolId];

  return (
    <div className="schema-tools schema-tools-content min-w-0">
      <Tool />
    </div>
  );
}
