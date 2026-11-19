import { lazy, Suspense, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { MainWorkspaceSkeleton } from '@/components/App/MainWorkspaceSkeleton';
import type { PageToolId } from './toolCatalog';
import { ToolLayout } from './ToolLayout';
import './schema-tools.css';

const PublishPanel = lazy(() =>
  import('@/components/publications/PublishPanel').then((m) => ({ default: m.PublishPanel })),
);
const BusinessDataImportTool = lazy(() =>
  import('@/components/data-import/BusinessDataImportTool').then((m) => ({
    default: m.BusinessDataImportTool,
  })),
);
const FieldImpactTool = lazy(() =>
  import('./FieldImpactTool').then((m) => ({ default: m.FieldImpactTool })),
);
const SqliteExportTool = lazy(() =>
  import('./SqliteExportTool').then((m) => ({ default: m.SqliteExportTool })),
);
const BusinessModuleTool = lazy(() =>
  import('./BusinessModuleTool').then((m) => ({ default: m.BusinessModuleTool })),
);
const QueryDesignerTool = lazy(() =>
  import('./QueryDesignerTool').then((m) => ({ default: m.QueryDesignerTool })),
);
const MigrationAssessmentTool = lazy(() =>
  import('./MigrationAssessmentTool').then((m) => ({ default: m.MigrationAssessmentTool })),
);
const SnapshotRefreshTool = lazy(() =>
  import('./SnapshotRefreshTool').then((m) => ({ default: m.SnapshotRefreshTool })),
);
const DictionaryTool = lazy(() =>
  import('./DictionaryTool').then((m) => ({ default: m.DictionaryTool })),
);
const SchemaCompareTool = lazy(() =>
  import('./SchemaCompareTool').then((m) => ({ default: m.SchemaCompareTool })),
);
const RelationalSeedTool = lazy(() =>
  import('./RelationalSeedTool').then((m) => ({ default: m.RelationalSeedTool })),
);

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

export function ToolDetail({ toolId }: { toolId: PageToolId }) {
  const Tool = TOOL_COMPONENTS[toolId];

  return (
    <div className="schema-tools schema-tools-content min-w-0">
      <Suspense fallback={<MainWorkspaceSkeleton />}>
        <Tool />
      </Suspense>
    </div>
  );
}
