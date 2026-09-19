import { useTranslation } from 'react-i18next';
import {
  BookOpen,
  Database,
  FileInput,
  GitCompare,
  HardDrive,
  Layers,
  Network,
  RefreshCw,
  Search,
  Share2,
  ShieldCheck,
  Table2,
} from '@/components/icons';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { ToolLayout } from './ToolLayout';
import './schema-tools.css';

const toolGroups = [
  {
    label: 'schemaTools.groups.delivery',
    tools: [
      {
        value: 'dictionary',
        label: 'schemaTools.dictionary.title',
        icon: BookOpen,
        component: DictionaryTool,
      },
      {
        value: 'publications',
        label: 'publication.manage',
        icon: Share2,
        component: PublicationsTool,
      },
      { value: 'sqlite', label: 'modelTools.sqlite', icon: HardDrive, component: SqliteExportTool },
    ],
  },
  {
    label: 'schemaTools.groups.design',
    tools: [
      { value: 'query', label: 'modelTools.query', icon: Search, component: QueryDesignerTool },
      {
        value: 'modules',
        label: 'modelTools.modules',
        icon: Layers,
        component: BusinessModuleTool,
      },
      { value: 'impact', label: 'modelTools.impact', icon: Network, component: FieldImpactTool },
      {
        value: 'compare',
        label: 'schemaTools.compare.title',
        icon: GitCompare,
        component: SchemaCompareTool,
      },
      {
        value: 'assessment',
        label: 'assessment.title',
        icon: ShieldCheck,
        component: MigrationAssessmentTool,
      },
    ],
  },
  {
    label: 'schemaTools.groups.data',
    tools: [
      {
        value: 'seed',
        label: 'schemaTools.seed.title',
        icon: Table2,
        component: RelationalSeedTool,
      },
      {
        value: 'data-import',
        label: 'dataImport.title',
        icon: FileInput,
        component: BusinessDataImportTool,
      },
      {
        value: 'refresh',
        label: 'snapshot.refresh',
        icon: RefreshCw,
        component: SnapshotRefreshTool,
      },
    ],
  },
];

function PublicationsTool() {
  const { t } = useTranslation();

  return (
    <ToolLayout title={t('publication.manage')} description={t('publication.hint')}>
      <PublishPanel content={null} title="" />
    </ToolLayout>
  );
}

export default function SchemaToolsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        aria-label={t('schemaTools.title')}
        className="schema-tools flex h-[92dvh] w-[calc(100vw-1rem)] max-w-[1440px] flex-col gap-0 overflow-hidden rounded-xl p-0 sm:w-[calc(100vw-3rem)] sm:rounded-xl"
      >
        <DialogHeader className="shrink-0 flex-row items-center gap-3 space-y-0 border-b px-5 py-4 pr-12 text-left sm:px-6 sm:pr-12">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/8 text-primary">
            <Database className="size-5" aria-hidden="true" />
          </div>
          <div className="space-y-1.5">
            <DialogTitle className="text-base">{t('schemaTools.title')}</DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              {t('schemaTools.description')}
            </DialogDescription>
          </div>
        </DialogHeader>
        <Tabs
          defaultValue="dictionary"
          orientation="vertical"
          className="flex min-h-0 flex-1 flex-col lg:flex-row"
        >
          <TabsList
            aria-label={t('schemaTools.title')}
            className="schema-tools-nav grid h-auto max-h-[200px] shrink-0 grid-cols-3 items-stretch justify-start gap-1 overflow-auto rounded-none border-b bg-muted/40 p-2 sm:grid-cols-4 lg:flex lg:max-h-none lg:w-[200px] lg:flex-col lg:gap-5 lg:border-b-0 lg:border-r lg:p-3"
          >
            {toolGroups.map((group) => (
              <div key={group.label} className="contents lg:block lg:space-y-1">
                <div className="mb-2 hidden px-3 text-xs font-medium text-muted-foreground lg:block">
                  {t(group.label)}
                </div>
                {group.tools.map(({ value, label, icon: Icon }) => (
                  <TabsTrigger
                    key={value}
                    value={value}
                    className="min-h-9 justify-start gap-2 rounded-md px-2 py-2 text-left text-xs font-normal whitespace-normal transition-colors after:hidden data-active:bg-primary/10 data-active:text-primary data-active:shadow-none lg:w-full lg:px-3 lg:text-[13px]"
                  >
                    <Icon className="hidden size-4 shrink-0 sm:block" aria-hidden="true" />
                    <span>{t(label)}</span>
                  </TabsTrigger>
                ))}
              </div>
            ))}
          </TabsList>
          <div className="schema-tools-content min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain">
            {toolGroups
              .flatMap((group) => group.tools)
              .map(({ value, component: Component }) => (
                <TabsContent key={value} value={value} className="m-0 min-h-full p-4 sm:p-6">
                  <Component />
                </TabsContent>
              ))}
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
